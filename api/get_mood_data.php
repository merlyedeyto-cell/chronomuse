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

$userId = isset($_GET['user_id']) ? (int)$_GET['user_id'] : 1;
$period = isset($_GET['period']) ? $_GET['period'] : 'month';

try {
    $pdo = getDbConnection();

    // Calculate date range based on period (real calendar periods)
    $startDate = null;
    $endDate = date('Y-m-d'); // Today

    switch ($period) {
        case 'week':
            // This week (from Sunday to today)
            // Calculate last Sunday properly
            $dayOfWeek = date('w'); // 0 = Sunday, 1 = Monday, etc.
            $startDate = date('Y-m-d', strtotime("-{$dayOfWeek} days"));
            break;
        case 'month':
            // This month (from 1st day of current month)
            $startDate = date('Y-m-01');
            break;
        case 'year':
            // This year (from Jan 1)
            $startDate = date('Y-01-01');
            break;
        case 'all':
            // All time - no start date restriction
            $startDate = null;
            break;
        default:
            // Default to this month
            $startDate = date('Y-m-01');
    }

    // Build query
    $sql = "
        SELECT
            id,
            date,
            title,
            description,
            mood_tag,
            memory_tag,
            created_at
        FROM memories
        WHERE user_id = :user_id
          AND mood_tag IS NOT NULL
          AND mood_tag != ''
          AND date <= :endDate
    ";
    
    $params = [':user_id' => $userId, ':endDate' => $endDate];
    
    if ($startDate) {
        $sql .= " AND date >= :startDate";
        $params[':startDate'] = $startDate;
    }
    
    $sql .= " ORDER BY date DESC";

    // Fetch memories with mood tags
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $memories = $stmt->fetchAll();

    // Debug logging
    error_log('Mood Graph - Period: ' . $period . ', Start: ' . ($startDate ?? 'none') . ', End: ' . $endDate . ', Found: ' . count($memories) . ' memories');

    successResponse($memories);

} catch (PDOException $e) {
    error_log('Database error: ' . $e->getMessage());
    errorResponse('Database error occurred', 500);
} catch (Exception $e) {
    error_log('Error: ' . $e->getMessage());
    errorResponse('An error occurred: ' . $e->getMessage(), 500);
}
?>
