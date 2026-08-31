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
$isTyping = isset($input['is_typing']) ? (bool)$input['is_typing'] : false;

try {
    $pdo = getDbConnection();

    if ($isTyping) {
        // Update typing timestamp
        $stmt = $pdo->prepare("
            INSERT INTO chat_typing_status (user_id, friend_id, is_typing, typing_at)
            VALUES (?, ?, TRUE, NOW())
            ON DUPLICATE KEY UPDATE is_typing = TRUE, typing_at = NOW()
        ");
        $stmt->execute([$userId, $friendId]);
    } else {
        // Clear typing status
        $stmt = $pdo->prepare("
            UPDATE chat_typing_status 
            SET is_typing = FALSE 
            WHERE user_id = ? AND friend_id = ?
        ");
        $stmt->execute([$userId, $friendId]);
    }

    echo json_encode(['success' => true, 'is_typing' => $isTyping]);

} catch (PDOException $e) {
    error_log('Update typing status error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Database error', 'details' => $e->getMessage()]);
}
?>
