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

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

try {
    $pdo = getDbConnection();
    
    // Handle both JSON and FormData
    $input = null;
    $contentType = isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : '';
    
    if (strpos($contentType, 'application/json') !== false) {
        $input = json_decode(file_get_contents('php://input'), true);
    } else {
        // FormData
        $input = $_POST;
    }

    if (!$input) {
        error_log('Save Memory - No input received');
        errorResponse('Invalid input', 400);
    }

    // Debug logging
    error_log('Save Memory - Input received: ' . print_r($input, true));
    error_log('Save Memory - Files received: ' . print_r($_FILES, true));

    // Required fields
    $requiredFields = ['date', 'user_id'];
    foreach ($requiredFields as $field) {
        if (!isset($input[$field]) || (is_string($input[$field]) && empty($input[$field]))) {
            error_log('Save Memory - Missing required field: ' . $field);
            errorResponse("Missing required field: $field", 400);
        }
    }

    // Validate date is not in the future
    $memoryDate = new DateTime($input['date']);
    $today = new DateTime();
    $today->setTime(0, 0, 0);
    $memoryDate->setTime(0, 0, 0);

    if ($memoryDate > $today) {
        error_log('Save Memory - Future date not allowed: ' . $input['date']);
        errorResponse('Cannot create memories for future dates! Please select today or a past date.', 400);
    }

    // Prepare file uploads handling
    $photoVideoPath = null;
    $photoVideoType = null;
    $musicPath = null;

    // Handle photo/video upload if exists
    if (isset($_FILES['photo_video']) && $_FILES['photo_video']['error'] === UPLOAD_ERR_OK) {
        $uploadDir = getUploadDir() . 'memories/';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0777, true);
        }

        $file = $_FILES['photo_video'];
        $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
        $fileName = uniqid('memory_') . '.' . $extension;
        $targetPath = $uploadDir . $fileName;

        if (move_uploaded_file($file['tmp_name'], $targetPath)) {
            $photoVideoPath = getUploadUrl('memories/' . $fileName);
            $photoVideoType = $file['type'];
        }
    }

    // Handle music upload if exists
    if (isset($_FILES['music']) && $_FILES['music']['error'] === UPLOAD_ERR_OK) {
        $uploadDir = getUploadDir() . 'memories/';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0777, true);
        }

        $file = $_FILES['music'];
        $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
        $fileName = uniqid('music_') . '.' . $extension;
        $targetPath = $uploadDir . $fileName;

        if (move_uploaded_file($file['tmp_name'], $targetPath)) {
            $musicPath = getUploadUrl('memories/' . $fileName);
        }
    }

    // Insert memory into database
    $stmt = $pdo->prepare("
        INSERT INTO memories (
            user_id,
            date,
            title,
            description,
            mood_tag,
            memory_tag,
            photo_video,
            photo_video_type,
            music,
            is_pinned
        ) VALUES (
            :user_id,
            :date,
            :title,
            :description,
            :mood_tag,
            :memory_tag,
            :photo_video,
            :photo_video_type,
            :music,
            :is_pinned
        )
    ");

    $stmt->execute([
        ':user_id' => (int)$input['user_id'],
        ':date' => $input['date'],
        ':title' => isset($input['title']) && !empty($input['title']) ? $input['title'] : 'Untitled Memory',
        ':description' => isset($input['description']) ? $input['description'] : '',
        ':mood_tag' => isset($input['mood_tag']) && !empty($input['mood_tag']) ? $input['mood_tag'] : null,
        ':memory_tag' => isset($input['memory_tag']) && !empty($input['memory_tag']) ? $input['memory_tag'] : null,
        ':photo_video' => $photoVideoPath,
        ':photo_video_type' => $photoVideoType,
        ':music' => $musicPath,
        ':is_pinned' => isset($input['is_pinned']) ? (int)$input['is_pinned'] : 0
    ]);

    $memoryId = $pdo->lastInsertId();

    // Fetch the created memory
    $fetchStmt = $pdo->prepare("
        SELECT * FROM memories WHERE id = :id
    ");
    $fetchStmt->execute([':id' => $memoryId]);
    $memory = $fetchStmt->fetch();

    successResponse($memory);

} catch (PDOException $e) {
    error_log('Database error: ' . $e->getMessage());
    errorResponse('Database error occurred: ' . $e->getMessage(), 500);
} catch (Exception $e) {
    error_log('Error: ' . $e->getMessage());
    errorResponse('An error occurred: ' . $e->getMessage(), 500);
}
?>
