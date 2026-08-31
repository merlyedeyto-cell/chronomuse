<?php
// Enable error reporting for debugging (disable in production)
error_reporting(E_ALL);
ini_set('display_errors', 0);
ini_set('log_errors', 1);

// Database configuration
define('DB_HOST', 'localhost');
define('DB_NAME', 'calen');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_CHARSET', 'utf8mb4');

// Get base URL dynamically based on environment
function getBaseUrl() {
    if (isset($_SERVER['HTTP_HOST'])) {
        $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' || 
                     (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443)) ? "https://" : "http://";
        
        // Check if running on InfinityFree or similar hosting (not localhost)
        $host = $_SERVER['HTTP_HOST'];
        if ($host !== 'localhost' && $host !== '127.0.0.1') {
            // Production: no subfolder in URL
            return $protocol . $host;
        } else {
            // Localhost development: with /chronomuse subfolder
            return $protocol . $host . '/chronomuse';
        }
    }
    // Fallback for CLI
    return 'http://localhost/chronomuse';
}

// Get base path dynamically - works on localhost, InfinityFree, and any hosting
function getBasePath() {
    // Get the directory where this script is located
    $scriptDir = dirname($_SERVER['SCRIPT_NAME']);
    
    // For API files in /api/ folder, return the parent directory
    // This gives us: /chronomuse (localhost) or / (root hosting)
    if (basename($scriptDir) === 'api') {
        return dirname($scriptDir);
    }
    
    return $scriptDir;
}

// Get upload URL for files - adapts to environment
function getUploadUrl($relativePath = '') {
    // Check if running on localhost or production
    $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : 'localhost';

    if ($host === 'localhost' || $host === '127.0.0.1') {
        // Localhost: Use relative path for Vite dev server
        return '/uploads/' . ltrim($relativePath, '/');
    } else {
        // Production (InfinityFree, etc.): Use relative path from root
        // Files are in /uploads/ folder at root level
        // Return path starting with / for absolute URL from domain root
        return '/uploads/' . ltrim($relativePath, '/');
    }
}

// Get upload directory (physical path) for saving files
function getUploadDir() {
    // Check if running on localhost or production
    $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : 'localhost';
    
    if ($host === 'localhost' || $host === '127.0.0.1') {
        // Localhost: Save to static/uploads for Vite dev server compatibility
        return __DIR__ . '/../static/uploads/';
    } else {
        // Production (InfinityFree, etc.): Save to root uploads folder
        // The uploads folder should be in the same directory as the API folder
        return __DIR__ . '/../uploads/';
    }
}

// Create database connection
function getDbConnection() {
    try {
        $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET;
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];
        
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        return $pdo;
    } catch (PDOException $e) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
        exit;
    }
}

// Helper function to send JSON response
function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

// Helper function to send error response
function errorResponse($message, $statusCode = 400) {
    jsonResponse(['error' => $message], $statusCode);
}

// Helper function to send success response
function successResponse($data, $statusCode = 200) {
    jsonResponse(['success' => true, 'data' => $data], $statusCode);
}
?>
