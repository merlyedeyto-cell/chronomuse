<?php
require_once 'db_connection.php';

// Handle CORS
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

// Get JSON input
$input = json_decode(file_get_contents('php://input'), true);

if (json_last_error() !== JSON_ERROR_NONE) {
    errorResponse('Invalid JSON input');
}

if (!isset($input['usernameOrEmail']) || !isset($input['password'])) {
    errorResponse('Username/Email and password are required');
}

$usernameOrEmail = trim($input['usernameOrEmail']);
$password = $input['password'];

if (empty($usernameOrEmail) || empty($password)) {
    errorResponse('Username/Email and password are required');
}

try {
    $pdo = getDbConnection();
    
    // Check if input is email or username
    $isEmail = filter_var($usernameOrEmail, FILTER_VALIDATE_EMAIL);
    
    if ($isEmail) {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ?");
    } else {
        $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
    }
    
    $stmt->execute([$usernameOrEmail]);
    $user = $stmt->fetch();
    
    if (!$user) {
        errorResponse('Invalid credentials');
    }
    
    // Verify password
    if (!password_verify($password, $user['password'])) {
        errorResponse('Invalid credentials');
    }
    
    // Login successful
    session_start();
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['email'] = $user['email'];
    
    successResponse([
        'user' => [
            'id' => $user['id'],
            'username' => $user['username'],
            'email' => $user['email']
        ],
        'message' => 'Login successful'
    ]);
    
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
    exit;
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'An error occurred: ' . $e->getMessage()]);
    exit;
}
?>
