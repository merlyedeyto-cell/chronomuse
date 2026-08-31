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

if (!isset($input['friend_id']) || empty($input['friend_id'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Friend ID is required']);
    exit;
}

$userId = $input['user_id'];
$friendId = $input['friend_id'];

try {
    $pdo = getDbConnection();

    // Mark messages as deleted for current user (soft delete - "for me only")
    // If current user is sender, mark as deleted_by_sender
    // If current user is receiver, mark as deleted_by_receiver
    $stmt = $pdo->prepare("
        UPDATE chat_messages
        SET 
            deleted_by_sender = CASE WHEN sender_id = ? THEN 1 ELSE deleted_by_sender END,
            deleted_by_receiver = CASE WHEN receiver_id = ? THEN 1 ELSE deleted_by_receiver END,
            deleted_at = NOW()
        WHERE (sender_id = ? AND receiver_id = ?)
           OR (sender_id = ? AND receiver_id = ?)
    ");
    $stmt->execute([$userId, $userId, $userId, $friendId, $friendId, $userId]);

    echo json_encode(['success' => true, 'message' => 'Conversation deleted for you']);

} catch (PDOException $e) {
    error_log('Delete conversation error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Database error', 'details' => $e->getMessage()]);
}
?>
