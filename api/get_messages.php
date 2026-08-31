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
$friendId = isset($input['friend_id']) ? $input['friend_id'] : null;
$limit = isset($input['limit']) ? (int)$input['limit'] : 50;
$before = isset($input['before']) ? $input['before'] : null;

try {
    $pdo = getDbConnection();

    // Build query to get messages between two users
    // Filter out messages deleted by current user
    $whereClause = "((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))";
    $whereClause .= " AND ((sender_id = ? AND deleted_by_sender = 0) OR (receiver_id = ? AND deleted_by_receiver = 0))";
    $params = [$currentUserId, $friendId, $friendId, $currentUserId, $currentUserId, $currentUserId];

    if ($before) {
        $whereClause .= " AND created_at < ?";
        $params[] = $before;
    }

    $stmt = $pdo->prepare("
        SELECT m.*,
               sender.username as sender_username,
               receiver.username as receiver_username
        FROM chat_messages m
        JOIN users sender ON m.sender_id = sender.id
        JOIN users receiver ON m.receiver_id = receiver.id
        WHERE $whereClause
        ORDER BY m.created_at DESC
        LIMIT ?
    ");
    $stmt->execute([...$params, $limit]);
    $messages = $stmt->fetchAll();

    // Reverse to get ascending order (oldest first)
    $messages = array_reverse($messages);

    // Get attachments for each message
    foreach ($messages as &$msg) {
        if ($msg['has_attachment'] == 1) {
            $stmt = $pdo->prepare("
                SELECT * FROM chat_message_attachments
                WHERE message_id = ?
                ORDER BY id ASC
            ");
            $stmt->execute([$msg['id']]);
            $msg['attachments'] = $stmt->fetchAll();
        } else {
            $msg['attachments'] = [];
        }
    }

    // Mark messages as seen (from other user to current user)
    $stmt = $pdo->prepare("
        UPDATE chat_messages
        SET seen_at = NOW()
        WHERE sender_id = ? AND receiver_id = ? AND seen_at IS NULL
    ");
    $stmt->execute([$friendId, $currentUserId]);

    successResponse([
        'messages' => $messages
    ]);

} catch (PDOException $e) {
    error_log('Get messages error: ' . $e->getMessage());
    errorResponse('An error occurred. Please try again.', 500);
}
?>
