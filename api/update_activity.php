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

// Get user_id from request body
$input = json_decode(file_get_contents('php://input'), true);

if (!isset($input['user_id']) || empty($input['user_id'])) {
    http_response_code(400);
    echo json_encode(['error' => 'User ID is required']);
    exit;
}

$userId = $input['user_id'];

try {
    $pdo = getDbConnection();

    // Update user's last activity timestamp
    $stmt = $pdo->prepare("
        UPDATE users 
        SET last_activity = NOW() 
        WHERE id = ?
    ");
    $stmt->execute([$userId]);

    echo json_encode(['success' => true, 'message' => 'Activity updated']);

} catch (PDOException $e) {
    error_log('Update activity error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Database error', 'details' => $e->getMessage()]);
}
?>
