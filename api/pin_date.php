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
if (!isset($input['date']) || empty($input['date'])) {
    errorResponse('Missing required field: date', 400);
}

if (!isset($input['user_id']) || empty($input['user_id'])) {
    errorResponse('Missing required field: user_id', 400);
}

try {
    $pdo = getDbConnection();
    
    $date = $input['date'];
    $userId = (int)$input['user_id'];
    $isPinned = isset($input['isPinned']) ? $input['isPinned'] : false;
    
    // If already pinned, unpin it
    if ($isPinned) {
        $deleteStmt = $pdo->prepare("DELETE FROM pinned_dates WHERE user_id = :user_id AND date = :date");
        $deleteStmt->execute([
            ':user_id' => $userId,
            ':date' => $date
        ]);
        
        successResponse([
            'unpinned' => true,
            'date' => $date
        ]);
    } else {
        // Check if this date is already pinned
        $checkStmt = $pdo->prepare("SELECT id FROM pinned_dates WHERE user_id = :user_id AND date = :date");
        $checkStmt->execute([
            ':user_id' => $userId,
            ':date' => $date
        ]);
        
        if ($checkStmt->fetch()) {
            errorResponse('This date is already pinned', 400);
        }
        
        // Insert into pinned_dates table
        $insertStmt = $pdo->prepare("
            INSERT INTO pinned_dates (user_id, date, created_at)
            VALUES (:user_id, :date, NOW())
        ");
        $insertStmt->execute([
            ':user_id' => $userId,
            ':date' => $date
        ]);
        
        $pinnedDateId = $pdo->lastInsertId();
        
        successResponse([
            'pinned' => true,
            'date' => $date,
            'pinned_date_id' => $pinnedDateId
        ]);
    }

} catch (PDOException $e) {
    error_log('Database error: ' . $e->getMessage());
    errorResponse('Database error occurred: ' . $e->getMessage(), 500);
} catch (Exception $e) {
    error_log('Error: ' . $e->getMessage());
    errorResponse('An error occurred: ' . $e->getMessage(), 500);
}
?>
