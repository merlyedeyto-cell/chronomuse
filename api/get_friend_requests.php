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

// Get current logged-in user from request body
$input = json_decode(file_get_contents('php://input'), true);

if (!isset($input['user_id']) || empty($input['user_id'])) {
    errorResponse('Unauthorized. Please log in.');
}

$currentUserId = $input['user_id'];

try {
    $pdo = getDbConnection();

    // Get pending friend requests with sender details
    $stmt = $pdo->prepare("
        SELECT fr.id, fr.sender_id, fr.created_at, u.username, u.email
        FROM friend_requests fr
        JOIN users u ON fr.sender_id = u.id
        WHERE fr.receiver_id = ? AND fr.status = 'pending'
        ORDER BY fr.created_at DESC
    ");
    $stmt->execute([$currentUserId]);
    $requests = $stmt->fetchAll();

    successResponse([
        'requests' => $requests
    ]);

} catch (PDOException $e) {
    error_log('Get friend requests error: ' . $e->getMessage());
    errorResponse('An error occurred. Please try again.', 500);
}
?>
