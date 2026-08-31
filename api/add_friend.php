<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Expose-Headers: Authorization');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once 'db_connection.php';

// Only accept POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

// Get JSON input
$input = json_decode(file_get_contents('php://input'), true);

// Validate input
if (!isset($input['friend_username']) || empty(trim($input['friend_username']))) {
    errorResponse('Username is required');
}

$friendUsername = trim($input['friend_username']);

// Get current logged-in user from request body
if (!isset($input['user_id']) || empty($input['user_id'])) {
    errorResponse('Unauthorized. Please log in.');
}

$currentUserId = $input['user_id'];

try {
    $pdo = getDbConnection();

    // Check if the friend username exists
    $stmt = $pdo->prepare("SELECT id, username FROM users WHERE username = ?");
    $stmt->execute([$friendUsername]);
    $friend = $stmt->fetch();

    if (!$friend) {
        errorResponse('User not found. Please check the username.');
    }

    // Check if trying to add self
    if ($friend['id'] == $currentUserId) {
        errorResponse('You cannot add yourself as a friend.');
    }

    // Check if friend request already exists (sender -> receiver)
    $stmt = $pdo->prepare("
        SELECT id, status FROM friend_requests 
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    ");
    $stmt->execute([$currentUserId, $friend['id'], $friend['id'], $currentUserId]);
    $existingRequest = $stmt->fetch();

    if ($existingRequest) {
        if ($existingRequest['status'] === 'pending') {
            if ($existingRequest['sender_id'] == $currentUserId) {
                errorResponse('Friend request already sent to this user.');
            } else {
                errorResponse('This user has already sent you a friend request.');
            }
        } elseif ($existingRequest['status'] === 'accepted') {
            errorResponse('You are already friends with this user.');
        } elseif ($existingRequest['status'] === 'declined') {
            errorResponse('Friend request was previously declined.');
        }
    }

    // Check if already friends (bidirectional)
    $stmt = $pdo->prepare("
        SELECT COUNT(*) as count FROM friend_requests 
        WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
        AND status = 'accepted'
    ");
    $stmt->execute([$currentUserId, $friend['id'], $friend['id'], $currentUserId]);
    $result = $stmt->fetch();
    
    if ($result['count'] > 0) {
        errorResponse('You are already friends with this user.');
    }

    // Create friend request
    $stmt = $pdo->prepare("
        INSERT INTO friend_requests (sender_id, receiver_id, status) 
        VALUES (?, ?, 'pending')
    ");
    $stmt->execute([$currentUserId, $friend['id']]);

    successResponse([
        'message' => 'Friend request sent successfully!',
        'friend' => [
            'id' => $friend['id'],
            'username' => $friend['username']
        ]
    ]);

} catch (PDOException $e) {
    error_log('Add friend error: ' . $e->getMessage());
    errorResponse('An error occurred. Please try again.', 500);
}
?>
