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
    errorResponse('Unauthorized. Please log in.');
}

$userId = $input['user_id'];
$username = isset($input['username']) ? trim($input['username']) : '';
$email = isset($input['email']) ? trim($input['email']) : '';
$newPassword = isset($input['new_password']) ? $input['new_password'] : '';

try {
    $pdo = getDbConnection();

    // Get current user data
    $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");
    $stmt->execute([$userId]);
    $user = $stmt->fetch();

    if (!$user) {
        errorResponse('User not found');
    }

    // Validate username if changed
    if ($username && $username !== $user['username']) {
        $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ? AND id != ?");
        $stmt->execute([$username, $userId]);
        if ($stmt->fetch()) {
            errorResponse('Username already exists');
        }
    }

    // Validate email if changed
    if ($email && $email !== $user['email']) {
        $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
        $stmt->execute([$email, $userId]);
        if ($stmt->fetch()) {
            errorResponse('Email already exists');
        }
    }

    // Update password if provided
    if ($newPassword) {
        // Validate new password
        if (strlen($newPassword) < 6) {
            errorResponse('New password must be at least 6 characters');
        }

        // Hash new password
        $hashedPassword = password_hash($newPassword, PASSWORD_DEFAULT);
        
        // Update user with new password
        $stmt = $pdo->prepare("
            UPDATE users 
            SET username = ?, email = ?, password = ?, updated_at = NOW()
            WHERE id = ?
        ");
        $stmt->execute([$username, $email, $hashedPassword, $userId]);
    } else {
        // Update user without password change
        $stmt = $pdo->prepare("
            UPDATE users 
            SET username = ?, email = ?, updated_at = NOW()
            WHERE id = ?
        ");
        $stmt->execute([$username, $email, $userId]);
    }

    // Get updated user data
    $stmt = $pdo->prepare("SELECT id, username, email, created_at FROM users WHERE id = ?");
    $stmt->execute([$userId]);
    $updatedUser = $stmt->fetch();

    successResponse([
        'message' => 'Profile updated successfully',
        'user' => $updatedUser
    ]);

} catch (PDOException $e) {
    error_log('Update profile error: ' . $e->getMessage());
    errorResponse('An error occurred. Please try again.', 500);
} catch (Exception $e) {
    error_log('Error: ' . $e->getMessage());
    errorResponse('An error occurred: ' . $e->getMessage(), 500);
}
?>
