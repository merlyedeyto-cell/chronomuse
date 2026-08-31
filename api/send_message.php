<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once 'db_connection.php';

// Get input - handle both JSON and FormData
$input = [];
$contentType = isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : '';

if (strpos($contentType, 'multipart/form-data') !== false) {
    // FormData with files
    $input = $_POST;
    error_log('Send message - Received FormData');
    error_log('Send message - Files: ' . print_r($_FILES, true));
} else {
    // JSON
    $input = json_decode(file_get_contents('php://input'), true);
    error_log('Send message - Received JSON');
}

if (!isset($input['user_id']) || empty($input['user_id'])) {
    error_log('Send message - Missing user_id');
    errorResponse('Unauthorized. Please log in.');
}

if (!isset($input['receiver_id']) || empty($input['receiver_id'])) {
    error_log('Send message - Missing receiver_id');
    errorResponse('Receiver ID is required');
}

// Allow empty message if files are attached
$message = isset($input['message']) ? trim($input['message']) : '';
$hasFiles = isset($_FILES['attachments']) && is_array($_FILES['attachments']) && !empty($_FILES['attachments']['name']) && $_FILES['attachments']['name'][0] !== '';

error_log('Send message - Message length: ' . strlen($message) . ', Has files: ' . ($hasFiles ? 'yes' : 'no'));

if (empty($message) && !$hasFiles) {
    error_log('Send message - Empty message and no files');
    errorResponse('Message cannot be empty');
}

$currentUserId = $input['user_id'];
$receiverId = $input['receiver_id'];
// $message already defined above

// Check if they are friends
try {
    $pdo = getDbConnection();

    $stmt = $pdo->prepare("
        SELECT id FROM friend_requests
        WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
        AND status = 'accepted'
    ");
    $stmt->execute([$currentUserId, $receiverId, $receiverId, $currentUserId]);
    $friendship = $stmt->fetch();

    if (!$friendship) {
        errorResponse('You can only send messages to friends');
    }

    // Insert the message
    $stmt = $pdo->prepare("
        INSERT INTO chat_messages (sender_id, receiver_id, message, created_at)
        VALUES (?, ?, ?, NOW())
    ");
    $stmt->execute([$currentUserId, $receiverId, $message]);

    $messageId = $pdo->lastInsertId();
    error_log('Message inserted with ID: ' . $messageId);

    // Handle file attachments if exists
    $hasAttachment = 0;
    $attachmentCount = 0;

    error_log('Send message - Checking files: ' . (isset($_FILES['attachments']) ? 'yes' : 'no'));
    error_log('Send message - Files structure: ' . print_r($_FILES, true));
    
    if (isset($_FILES['attachments'])) {
        $uploadDir = getUploadDir() . 'chat/';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0777, true);
        }

        $files = $_FILES['attachments'];
        
        // Handle both single file and multiple files
        if (is_array($files['name'])) {
            $attachmentCount = count($files['name']);
        } else {
            // Single file
            $attachmentCount = ($files['name'] !== '') ? 1 : 0;
        }
        
        error_log('Send message - File count: ' . $attachmentCount);

        if ($attachmentCount > 0) {
            $hasAttachment = 1;

            // Prepare attachment insert statement
            $attachStmt = $pdo->prepare("
                INSERT INTO chat_message_attachments (message_id, file_type, file_path, file_name, file_size)
                VALUES (?, ?, ?, ?, ?)
            ");

            for ($i = 0; $i < $attachmentCount; $i++) {
                $file = [
                    'name' => is_array($files['name']) ? $files['name'][$i] : $files['name'],
                    'type' => is_array($files['type']) ? $files['type'][$i] : $files['type'],
                    'tmp_name' => is_array($files['tmp_name']) ? $files['tmp_name'][$i] : $files['tmp_name'],
                    'size' => is_array($files['size']) ? $files['size'][$i] : $files['size'],
                    'error' => is_array($files['error']) ? $files['error'][$i] : $files['error']
                ];
                
                error_log('Send message - File ' . $i . ' error: ' . $file['error']);
                
                if ($file['error'] === UPLOAD_ERR_OK) {
                    error_log('Send message - File ' . $i . ' name: ' . $file['name'] . ', type: ' . $file['type']);

                    // Determine file type
                    $fileType = 'other';
                    if (strpos($file['type'], 'image/') === 0) {
                        $fileType = 'image';
                    } elseif (strpos($file['type'], 'video/') === 0) {
                        $fileType = 'video';
                    } elseif (strpos($file['type'], 'audio/') === 0) {
                        $fileType = 'audio';
                    }

                    // Generate unique filename
                    $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
                    $fileName = uniqid('chat_') . '.' . $extension;
                    $targetPath = $uploadDir . $fileName;

                    error_log('Send message - Moving file to: ' . $targetPath);

                    if (move_uploaded_file($file['tmp_name'], $targetPath)) {
                        $filePath = getUploadUrl('chat/' . $fileName);
                        error_log('Send message - File uploaded successfully, inserting to DB');

                        $attachStmt->execute([
                            $messageId,
                            $fileType,
                            $filePath,
                            $file['name'],
                            $file['size']
                        ]);

                        error_log('Send message - Attachment inserted for message ' . $messageId);
                    } else {
                        error_log('Send message - Failed to move uploaded file');
                    }
                } else {
                    error_log('Send message - Upload error code: ' . $file['error']);
                }
            }
        }
    }
    
    // Update message with attachment info
    if ($hasAttachment) {
        $stmt = $pdo->prepare("
            UPDATE chat_messages
            SET has_attachment = ?, attachment_count = ?
            WHERE id = ?
        ");
        $stmt->execute([$hasAttachment, $attachmentCount, $messageId]);
    }

    // Get the inserted message with details
    $stmt = $pdo->prepare("
        SELECT m.*, u.username as sender_username
        FROM chat_messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.id = ?
    ");
    $stmt->execute([$messageId]);
    $newMessage = $stmt->fetch();
    
    // Get attachments if any
    if ($hasAttachment) {
        $stmt = $pdo->prepare("
            SELECT * FROM chat_message_attachments
            WHERE message_id = ?
            ORDER BY id ASC
        ");
        $stmt->execute([$messageId]);
        $attachments = $stmt->fetchAll();
        $newMessage['attachments'] = $attachments;
    }

    successResponse([
        'message' => 'Message sent',
        'data' => $newMessage
    ]);

} catch (PDOException $e) {
    error_log('Send message error: ' . $e->getMessage());
    errorResponse('An error occurred. Please try again.', 500);
}
?>
