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

    // Get all friends (accepted friend requests in both directions)
    $stmt = $pdo->prepare("
        SELECT 
            CASE 
                WHEN fr.sender_id = ? THEN fr.receiver_id 
                ELSE fr.sender_id 
            END as friend_id,
            u.username,
            u.email,
            fr.created_at as friends_since
        FROM friend_requests fr
        JOIN users u ON 
            (fr.sender_id = ? AND fr.receiver_id = u.id) 
            OR (fr.receiver_id = ? AND fr.sender_id = u.id)
        WHERE fr.status = 'accepted'
        AND (fr.sender_id = ? OR fr.receiver_id = ?)
        ORDER BY fr.created_at DESC
    ");
    $stmt->execute([$currentUserId, $currentUserId, $currentUserId, $currentUserId, $currentUserId]);
    $friends = $stmt->fetchAll();

    successResponse([
        'friends' => $friends
    ]);

} catch (PDOException $e) {
    error_log('Get friends list error: ' . $e->getMessage());
    errorResponse('An error occurred. Please try again.', 500);
}
?>
