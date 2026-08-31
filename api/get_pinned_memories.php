<?php
require_once 'db_connection.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

try {
    $pdo = getDbConnection();
    
    // Get user_id from query parameter (default to 1 for now)
    $user_id = isset($_GET['user_id']) ? (int)$_GET['user_id'] : 1;
    
    error_log("Fetching pinned dates for user_id: " . $user_id);

    // Get pinned dates (not individual memories)
    $stmt = $pdo->prepare("
        SELECT
            pd.id as pinned_id,
            pd.date,
            pd.title,
            pd.created_at,
            pd.user_id
        FROM pinned_dates pd
        WHERE pd.user_id = :user_id
        ORDER BY pd.date DESC
    ");

    $stmt->execute([':user_id' => $user_id]);
    $pinnedDates = $stmt->fetchAll();
    
    error_log("Found " . count($pinnedDates) . " pinned dates");

    successResponse($pinnedDates);

} catch (PDOException $e) {
    error_log("Get pinned dates error: " . $e->getMessage());
    errorResponse('Database error: ' . $e->getMessage(), 500);
} catch (Exception $e) {
    error_log("Error: " . $e->getMessage());
    errorResponse('An error occurred: ' . $e->getMessage(), 500);
}
