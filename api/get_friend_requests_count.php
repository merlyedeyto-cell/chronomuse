<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once 'db_connection.php';

// Get current logged-in user from request body
$input = json_decode(file_get_contents('php://input'), true);

if (!isset($input['user_id']) || empty($input['user_id'])) {
    errorResponse('Unauthorized. Please log in.');
}

$currentUserId = $input['user_id'];

try {
    $pdo = getDbConnection();

    // Count pending friend requests received by current user
    $stmt = $pdo->prepare("
        SELECT COUNT(*) as count FROM friend_requests 
        WHERE receiver_id = ? AND status = 'pending'
    ");
    $stmt->execute([$currentUserId]);
    $result = $stmt->fetch();

    successResponse([
        'pending_count' => $result['count']
    ]);

} catch (PDOException $e) {
    error_log('Get friend requests count error: ' . $e->getMessage());
    errorResponse('An error occurred. Please try again.', 500);
}
?>
