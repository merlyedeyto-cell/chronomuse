<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once 'db_connection.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    errorResponse('Method not allowed', 405);
}

$year = isset($_GET['year']) ? (int)$_GET['year'] : date('Y');
$month = isset($_GET['month']) ? (int)$_GET['month'] : date('n');
$userId = isset($_GET['user_id']) ? (int)$_GET['user_id'] : 1;

// Validate month
if ($month < 1 || $month > 12) {
    errorResponse('Invalid month', 400);
}

try {
    $pdo = getDbConnection();
    
    // Get first and last day of the month
    $firstDay = sprintf('%04d-%02d-01', $year, $month);
    $lastDay = date('Y-m-t', strtotime($firstDay));
    
    // Fetch all memories for the month
    $stmt = $pdo->prepare("
        SELECT 
            id,
            user_id,
            date,
            title,
            description,
            mood_tag,
            memory_tag,
            photo_video,
            photo_video_type,
            music,
            is_pinned,
            created_at,
            updated_at
        FROM memories
        WHERE user_id = :user_id 
          AND date BETWEEN :start_date AND :end_date
        ORDER BY date DESC, created_at DESC
    ");
    
    $stmt->execute([
        ':user_id' => $userId,
        ':start_date' => $firstDay,
        ':end_date' => $lastDay
    ]);
    
    $memories = $stmt->fetchAll();
    
    // Group memories by date
    $groupedMemories = [];
    foreach ($memories as $memory) {
        $date = $memory['date'];
        if (!isset($groupedMemories[$date])) {
            $groupedMemories[$date] = [];
        }
        $groupedMemories[$date][] = $memory;
    }
    
    successResponse($groupedMemories);

} catch (PDOException $e) {
    error_log('Database error: ' . $e->getMessage());
    errorResponse('Database error occurred', 500);
} catch (Exception $e) {
    error_log('Error: ' . $e->getMessage());
    errorResponse('An error occurred: ' . $e->getMessage(), 500);
}
?>
