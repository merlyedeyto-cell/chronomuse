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

if (!isset($input['friend_id']) || empty($input['friend_id'])) {
    errorResponse('Friend ID is required');
}

$currentUserId = $input['user_id'];
$friendId = $input['friend_id'];

try {
    $pdo = getDbConnection();

    // Find the friend request record (in either direction)
    $stmt = $pdo->prepare("
        SELECT id, status FROM friend_requests 
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    ");
    $stmt->execute([$currentUserId, $friendId, $friendId, $currentUserId]);
    $request = $stmt->fetch();

    if (!$request) {
        errorResponse('Friend relationship not found');
    }

    if ($request['status'] !== 'accepted') {
        errorResponse('This is not an accepted friendship');
    }

    // Delete the friend request record
    $stmt = $pdo->prepare("DELETE FROM friend_requests WHERE id = ?");
    $stmt->execute([$request['id']]);

    successResponse([
        'message' => 'Friend removed successfully',
        'friend_id' => $friendId
    ]);

} catch (PDOException $e) {
    error_log('Remove friend error: ' . $e->getMessage());
    errorResponse('An error occurred. Please try again.', 500);
}
?>
