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

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('Method not allowed', 405);
}

// Get JSON input
$input = json_decode(file_get_contents('php://input'), true);

if (!$input) {
    errorResponse('Invalid input', 400);
}

// Required fields
if (!isset($input['pinned_id']) || empty($input['pinned_id'])) {
    errorResponse('Missing required field: pinned_id', 400);
}

if (!isset($input['user_id']) || empty($input['user_id'])) {
    errorResponse('Missing required field: user_id', 400);
}

try {
    $pdo = getDbConnection();

    $pinnedId = (int)$input['pinned_id'];
    $userId = (int)$input['user_id'];

    // Delete from pinned_dates table (verify ownership)
    $stmt = $pdo->prepare("DELETE FROM pinned_dates WHERE id = :id AND user_id = :user_id");
    $stmt->execute([
        ':id' => $pinnedId,
        ':user_id' => $userId
    ]);
    
    if ($stmt->rowCount() > 0) {
        successResponse(['deleted' => true, 'pinned_id' => $pinnedId]);
    } else {
        errorResponse('Pinned date not found', 404);
    }

} catch (PDOException $e) {
    error_log('Database error: ' . $e->getMessage());
    errorResponse('Database error occurred: ' . $e->getMessage(), 500);
} catch (Exception $e) {
    error_log('Error: ' . $e->getMessage());
    errorResponse('An error occurred: ' . $e->getMessage(), 500);
}
?>
