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
        errorResponse('Invalid input', 400);
    }

    // Required fields
    if (!isset($input['memory_id']) || empty($input['memory_id'])) {
        errorResponse('Missing required field: memory_id', 400);
    }
    
    $memoryId = (int)$input['memory_id'];
    
    // Get current memory data
    $currentStmt = $pdo->prepare("SELECT photo_video, music FROM memories WHERE id = :id");
    $currentStmt->execute([':id' => $memoryId]);
    $currentMemory = $currentStmt->fetch();
    
    if (!$currentMemory) {
        errorResponse('Memory not found', 404);
    }
    
    // Build update query dynamically based on provided fields
    $updateFields = [];
    $params = [':id' => $memoryId];
    
    if (isset($input['description'])) {
        $updateFields[] = 'description = :description';
        $params[':description'] = $input['description'];
    }
    
    if (isset($input['mood_tag'])) {
        $updateFields[] = 'mood_tag = :mood_tag';
        $params[':mood_tag'] = $input['mood_tag'];
    }
    
    if (isset($input['memory_tag'])) {
        $updateFields[] = 'memory_tag = :memory_tag';
        $params[':memory_tag'] = $input['memory_tag'];
    }
    
    if (isset($input['title'])) {
        $updateFields[] = 'title = :title';
        $params[':title'] = $input['title'];
    }
    
    if (isset($input['is_pinned'])) {
        $updateFields[] = 'is_pinned = :is_pinned';
        $params[':is_pinned'] = (int)$input['is_pinned'];
    }
    
    // Handle photo/video upload if exists
    $photoVideoPath = $currentMemory['photo_video'];
    $photoVideoType = null;
    if (isset($_FILES['photo_video']) && $_FILES['photo_video']['error'] === UPLOAD_ERR_OK) {
        $uploadDir = getUploadDir() . 'memories/';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0777, true);
        }

        $file = $_FILES['photo_video'];
        $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
        $fileName = uniqid('memory_') . '.' . $extension;
        $targetPath = $uploadDir . $fileName;

        // Delete old file if exists
        if ($currentMemory['photo_video']) {
            $oldFileName = basename($currentMemory['photo_video']);
            $oldFilePath = $uploadDir . $oldFileName;
            if (file_exists($oldFilePath)) {
                unlink($oldFilePath);
            }
        }

        if (move_uploaded_file($file['tmp_name'], $targetPath)) {
            $photoVideoPath = getUploadUrl('memories/' . $fileName);
            $photoVideoType = $file['type'];
        }
    }

    // Handle music upload if exists
    $musicPath = $currentMemory['music'];
    if (isset($_FILES['music']) && $_FILES['music']['error'] === UPLOAD_ERR_OK) {
        $uploadDir = getUploadDir() . 'memories/';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0777, true);
        }

        $file = $_FILES['music'];
        $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
        $fileName = uniqid('music_') . '.' . $extension;
        $targetPath = $uploadDir . $fileName;

        // Delete old file if exists
        if ($currentMemory['music']) {
            $oldFileName = basename($currentMemory['music']);
            $oldFilePath = $uploadDir . $oldFileName;
            if (file_exists($oldFilePath)) {
                unlink($oldFilePath);
            }
        }

        if (move_uploaded_file($file['tmp_name'], $targetPath)) {
            $musicPath = getUploadUrl('memories/' . $fileName);
        }
    }
    
    // Add file paths to update if they exist
    if ($photoVideoPath) {
        $updateFields[] = 'photo_video = :photo_video';
        $params[':photo_video'] = $photoVideoPath;
    }
    if ($photoVideoType) {
        $updateFields[] = 'photo_video_type = :photo_video_type';
        $params[':photo_video_type'] = $photoVideoType;
    }
    if ($musicPath) {
        $updateFields[] = 'music = :music';
        $params[':music'] = $musicPath;
    }
    
    if (empty($updateFields)) {
        errorResponse('No fields to update', 400);
    }
    
    $query = "UPDATE memories SET " . implode(', ', $updateFields) . " WHERE id = :id";
    
    $stmt = $pdo->prepare($query);
    $stmt->execute($params);
    
    // Fetch the updated memory
    $fetchStmt = $pdo->prepare("SELECT * FROM memories WHERE id = :id");
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
