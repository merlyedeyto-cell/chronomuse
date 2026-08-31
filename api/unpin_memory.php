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
    errorResponse('Invalid input', 400);
}

// Required fields
if (!isset($input['memory_id']) || empty($input['memory_id'])) {
    errorResponse('Missing required field: memory_id', 400);
}

if (!isset($input['user_id']) || empty($input['user_id'])) {
    errorResponse('Missing required field: user_id', 400);
}

try {
    $pdo = getDbConnection();
    
    $memoryId = (int)$input['memory_id'];
    $userId = (int)$input['user_id'];
    
    // Delete from pinned_memories
    $stmt = $pdo->prepare("DELETE FROM pinned_memories WHERE user_id = :user_id AND memory_id = :memory_id");
    $stmt->execute([
        ':user_id' => $userId,
        ':memory_id' => $memoryId
    ]);
    
    // Update memory is_pinned flag
    $updateStmt = $pdo->prepare("UPDATE memories SET is_pinned = 0 WHERE id = :id");
    $updateStmt->execute([':id' => $memoryId]);
    
    successResponse(['unpinned' => true, 'memory_id' => $memoryId]);

} catch (PDOException $e) {
    error_log('Database error: ' . $e->getMessage());
    errorResponse('Database error occurred: ' . $e->getMessage(), 500);
} catch (Exception $e) {
    error_log('Error: ' . $e->getMessage());
    errorResponse('An error occurred: ' . $e->getMessage(), 500);
}
?>
