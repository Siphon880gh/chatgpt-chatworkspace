<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed. Use POST.']);
    exit;
}

// Get conversation ID from query parameter
if (!isset($_GET['id'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing conversation ID in query parameter']);
    exit;
}

$conversationId = $_GET['id'];

// Validate conversation ID (alphanumeric and reasonable length)
if (!preg_match('/^[a-zA-Z0-9]{32,128}$/', $conversationId)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid conversation ID format']);
    exit;
}

// Get POST body
$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON in request body']);
    exit;
}

// Extract the data fields
$chatHtml = isset($data['chatHtml']) ? $data['chatHtml'] : null;
$turns = isset($data['turns']) ? $data['turns'] : null;
$outline = isset($data['outline']) ? $data['outline'] : null;
$comments = isset($data['comments']) ? $data['comments'] : null;
$indents = isset($data['indents']) ? $data['indents'] : null;
$notes = isset($data['notes']) ? $data['notes'] : null;

// Prepare the shared data
$sharedData = [
    'conversationId' => $conversationId,
    'timestamp' => date('c'),
    'data' => []
];

// Add data only if it exists
if ($chatHtml !== null && !empty($chatHtml)) {
    $sharedData['data']['chatHtml'] = $chatHtml;
}
if ($turns !== null && !empty($turns)) {
    $sharedData['data']['turns'] = $turns;
}
if ($outline !== null && !empty($outline)) {
    $sharedData['data']['outline'] = $outline;
}
if ($comments !== null && !empty($comments)) {
    $sharedData['data']['comments'] = $comments;
}
if ($indents !== null && !empty($indents)) {
    $sharedData['data']['indents'] = $indents;
}
if ($notes !== null && !empty($notes)) {
    $sharedData['data']['notes'] = $notes;
}

// Create shared directory if it doesn't exist
$sharedDir = __DIR__ . '/shared';
if (!is_dir($sharedDir)) {
    if (!mkdir($sharedDir, 0755, true)) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to create shared directory']);
        exit;
    }
}

// Check if file already exists
$filename = $sharedDir . '/' . $conversationId . '.json';
$isNew = !file_exists($filename);

// Save to file
$result = file_put_contents($filename, json_encode($sharedData, JSON_PRETTY_PRINT));

if ($result === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save shared data']);
    exit;
}

// Success response
http_response_code(200);
echo json_encode([
    'success' => true,
    'conversationId' => $conversationId,
    'shareUrl' => '/shared/' . $conversationId . '.json',
    'timestamp' => $sharedData['timestamp'],
    'isNew' => $isNew
]);
?>

