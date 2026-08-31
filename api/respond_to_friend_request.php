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

if (!isset($input['request_id']) || empty($input['request_id'])) {
    errorResponse('Request ID is required');
}

if (!isset($input['action']) || !in_array($input['action'], ['accept', 'decline'])) {
    errorResponse('Invalid action. Must be "accept" or "decline"');
}

$currentUserId = $input['user_id'];
$requestId = $input['request_id'];
$action = $input['action'];

try {
    $pdo = getDbConnection();

    // Verify the request exists and belongs to this user
    $stmt = $pdo->prepare("
        SELECT id, sender_id, receiver_id, status 
        FROM friend_requests 
        WHERE id = ? AND receiver_id = ? AND status = 'pending'
    ");
    $stmt->execute([$requestId, $currentUserId]);
    $request = $stmt->fetch();

    if (!$request) {
        errorResponse('Friend request not found or already responded to');
    }

    // Update the request status
    $newStatus = $action === 'accept' ? 'accepted' : 'declined';
    $stmt = $pdo->prepare("
        UPDATE friend_requests 
        SET status = ?, responded_at = NOW()
        WHERE id = ?
    ");
    $stmt->execute([$newStatus, $requestId]);

    // Get sender info for response
    $stmt = $pdo->prepare("SELECT id, username FROM users WHERE id = ?");
    $stmt->execute([$request['sender_id']]);
    $sender = $stmt->fetch();

    successResponse([
        'message' => $action === 'accept' ? 'Friend request accepted!' : 'Friend request declined',
        'request_id' => $requestId,
        'status' => $newStatus,
        'friend' => $sender
    ]);

} catch (PDOException $e) {
    error_log('Respond to friend request error: ' . $e->getMessage());
    errorResponse('An error occurred. Please try again.', 500);
}
?>
