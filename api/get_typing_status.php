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

    // Get typing status from friend (who is typing to the current user)
    $stmt = $pdo->prepare("
        SELECT is_typing, typing_at
        FROM chat_typing_status
        WHERE user_id = ? AND friend_id = ?
        AND typing_at > DATE_SUB(NOW(), INTERVAL 5 SECOND)
    ");
    $stmt->execute([$friendId, $userId]);
    $typingStatus = $stmt->fetch();

    $isFriendTyping = $typingStatus && $typingStatus['is_typing'] == 1;

    echo json_encode([
        'success' => true,
        'is_typing' => $isFriendTyping
    ]);

} catch (PDOException $e) {
    error_log('Get typing status error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Database error', 'details' => $e->getMessage()]);
}
?>
