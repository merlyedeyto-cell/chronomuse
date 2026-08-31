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

// Get input from request body
$input = json_decode(file_get_contents('php://input'), true);

if (!isset($input['user_id']) || empty($input['user_id'])) {
    http_response_code(400);
    echo json_encode(['error' => 'User ID is required']);
    exit;
}

if (!isset($input['message_id']) || empty($input['message_id'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Message ID is required']);
    exit;
}

$userId = $input['user_id'];
$messageId = $input['message_id'];

try {
    $pdo = getDbConnection();

    // Verify the message belongs to the user
    $stmt = $pdo->prepare("
        SELECT id FROM chat_messages
        WHERE id = ? AND sender_id = ?
    ");
    $stmt->execute([$messageId, $userId]);
    $message = $stmt->fetch();

    if (!$message) {
        http_response_code(403);
        echo json_encode(['error' => 'You can only delete your own messages']);
        exit;
    }

    // Get attachments for this message
    $stmt = $pdo->prepare("
        SELECT file_path FROM chat_message_attachments
        WHERE message_id = ?
    ");
    $stmt->execute([$messageId]);
    $attachments = $stmt->fetchAll();

    // Delete attachment files from server
    $uploadDir = getUploadDir() . 'chat/';
    foreach ($attachments as $attachment) {
        $fileName = basename($attachment['file_path']);
        $filePath = $uploadDir . $fileName;
        if (file_exists($filePath)) {
            unlink($filePath);
        }
    }

    // Delete attachments from database
    $stmt = $pdo->prepare("
        DELETE FROM chat_message_attachments
        WHERE message_id = ?
    ");
    $stmt->execute([$messageId]);

    // Hard delete - permanently remove message from database
    $stmt = $pdo->prepare("
        DELETE FROM chat_messages
        WHERE id = ? AND sender_id = ?
    ");
    $stmt->execute([$messageId, $userId]);

    echo json_encode(['success' => true, 'message' => 'Message deleted']);

} catch (PDOException $e) {
    error_log('Delete message error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Database error', 'details' => $e->getMessage()]);
}
?>
