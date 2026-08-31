<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once 'db_connection.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    errorResponse('Method not allowed', 405);
}

$date = isset($_GET['date']) ? $_GET['date'] : null;

if (!$date) {
    errorResponse('Date parameter is required', 400);
}

// Validate date format (YYYY-MM-DD)
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
    errorResponse('Invalid date format. Use YYYY-MM-DD', 400);
}

try {
    $pdo = getDbConnection();
    
    // Get user ID from session or request (default to 1 for now)
    $userId = isset($_GET['user_id']) ? (int)$_GET['user_id'] : 1;

    // Check if user_id column exists
    $columnCheck = $pdo->query("SHOW COLUMNS FROM memories LIKE 'user_id'")->fetch();
    
    if ($columnCheck) {
        // Use user_id filter if column exists
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
            WHERE user_id = :user_id AND date = :date
            ORDER BY created_at DESC
        ");

        $stmt->execute([
            ':user_id' => $userId,
            ':date' => $date
        ]);
    } else {
        // Fallback without user_id filter
        $stmt = $pdo->prepare("
            SELECT 
                id,
                date,
                title,
                description,
                mood as mood_tag,
                NULL as memory_tag,
                NULL as photo_video,
                NULL as photo_video_type,
                NULL as music,
                0 as is_pinned,
                created_at,
                updated_at
            FROM memories
            WHERE date = :date
            ORDER BY created_at DESC
        ");

        $stmt->execute([
            ':date' => $date
        ]);
    }

    $memories = $stmt->fetchAll();

    successResponse($memories);

} catch (PDOException $e) {
    error_log('Database error: ' . $e->getMessage());
    errorResponse('Database error occurred', 500);
} catch (Exception $e) {
    error_log('Error: ' . $e->getMessage());
    errorResponse('An error occurred: ' . $e->getMessage(), 500);
}
?>
