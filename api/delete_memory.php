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

// Get JSON input
$input = json_decode(file_get_contents('php://input'), true);

if (!$input) {
    errorResponse('Invalid JSON input', 400);
}

// Required fields
if (!isset($input['memory_id']) || empty($input['memory_id'])) {
    errorResponse('Missing required field: memory_id', 400);
}

try {
    $pdo = getDbConnection();
    
    // First, get the memory to delete any associated files
    $fetchStmt = $pdo->prepare("SELECT photo_video, music FROM memories WHERE id = :id");
    $fetchStmt->execute([':id' => (int)$input['memory_id']]);
    $memory = $fetchStmt->fetch();

    // Delete files if they exist
    if ($memory) {
        $uploadDir = getUploadDir() . 'memories/';

        if ($memory['photo_video']) {
            // Extract filename from URL and build local path
            $fileName = basename($memory['photo_video']);
            $filePath = $uploadDir . $fileName;
            if (file_exists($filePath)) {
                unlink($filePath);
            }
        }

        if ($memory['music']) {
            $fileName = basename($memory['music']);
            $filePath = $uploadDir . $fileName;
            if (file_exists($filePath)) {
                unlink($filePath);
            }
        }
    }
    
    // Delete the memory from database
    $stmt = $pdo->prepare("DELETE FROM memories WHERE id = :id");
    $stmt->execute([':id' => (int)$input['memory_id']]);
    
    successResponse(['deleted' => true, 'memory_id' => (int)$input['memory_id']]);

} catch (PDOException $e) {
    error_log('Database error: ' . $e->getMessage());
    errorResponse('Database error occurred: ' . $e->getMessage(), 500);
} catch (Exception $e) {
    error_log('Error: ' . $e->getMessage());
    errorResponse('An error occurred: ' . $e->getMessage(), 500);
}
?>
