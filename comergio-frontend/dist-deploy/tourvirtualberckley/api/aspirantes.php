<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode(['ok' => false, 'message' => 'Método no permitido.']);
  exit;
}

$secretsFile = __DIR__ . '/comergio.secrets.php';
$secrets = [];
if (is_file($secretsFile)) {
  /** @var array $secrets */
  $secrets = require $secretsFile;
}

$apiBase = rtrim((string)($secrets['COMERGIO_API_BASE'] ?? getenv('COMERGIO_API_BASE') ?: 'https://smartlunch-backend-3uqr.onrender.com'), '/');
$username = strtolower(trim((string)($secrets['COMERGIO_USERNAME'] ?? getenv('COMERGIO_USERNAME') ?: 'admisiones@berckley.com')));
$password = (string)($secrets['COMERGIO_PASSWORD'] ?? getenv('COMERGIO_PASSWORD') ?: '');
$schoolId = trim((string)($secrets['COMERGIO_SCHOOL_ID'] ?? getenv('COMERGIO_SCHOOL_ID') ?: 'International Berckley School'));
$country = trim((string)($secrets['COMERGIO_COUNTRY'] ?? getenv('COMERGIO_COUNTRY') ?: 'CO'));

$raw = file_get_contents('php://input');
$form = json_decode($raw ?: '[]', true);
if (!is_array($form)) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'message' => 'JSON inválido.']);
  exit;
}

$required = [
  'fullName',
  'birthDate',
  'previousSchool',
  'guardianName',
  'guardianEmail',
  'guardianPhone',
  'grade',
  'academicYear',
  'referenceOrigin',
];

foreach ($required as $key) {
  if (!isset($form[$key]) || !trim((string)$form[$key])) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'message' => 'Completa todos los campos del formulario.']);
    exit;
  }
}

if ($username === '' || $password === '' || $password === 'COMPLETA_LA_CONTRASEÑA_AQUI') {
  http_response_code(500);
  echo json_encode([
    'ok' => false,
    'message' => 'Configura api/comergio.secrets.php con la contraseña de admisiones@berckley.com.',
  ]);
  exit;
}

function comergio_request(string $url, array $payload, ?string $token = null): array {
  $headers = ['Content-Type: application/json'];
  if ($token) {
    $headers[] = 'Authorization: Bearer ' . $token;
  }

  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
    CURLOPT_TIMEOUT => 30,
  ]);
  $body = curl_exec($ch);
  $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $error = curl_error($ch);
  curl_close($ch);

  if ($body === false) {
    return ['status' => 0, 'data' => ['message' => $error ?: 'Error de red']];
  }

  $data = json_decode($body, true);
  if (!is_array($data)) {
    $data = ['message' => $body];
  }

  return ['status' => $status, 'data' => $data];
}

$login = comergio_request($apiBase . '/auth/login', [
  'username' => $username,
  'email' => $username,
  'password' => $password,
  'schoolId' => $schoolId,
  'country' => $country,
]);

$token = (string)($login['data']['token'] ?? '');
if ($login['status'] < 200 || $login['status'] >= 300 || $token === '') {
  http_response_code(502);
  echo json_encode([
    'ok' => false,
    'message' => $login['data']['message'] ?? 'No se pudo autenticar en Comergio.',
  ]);
  exit;
}

$payload = [
  'student' => [
    'firstName' => trim((string)$form['fullName']),
    'lastName' => '',
    'birthDate' => trim((string)$form['birthDate']),
    'previousSchool' => trim((string)$form['previousSchool']),
  ],
  'guardian' => [
    'name' => trim((string)$form['guardianName']),
    'email' => trim((string)$form['guardianEmail']),
    'phone' => trim((string)$form['guardianPhone']),
  ],
  'grade' => trim((string)$form['grade']),
  'academicYear' => trim((string)$form['academicYear']),
  'source' => [
    'referenceOrigin' => trim((string)$form['referenceOrigin']),
  ],
];

$create = comergio_request($apiBase . '/academic-secretary/admissions', $payload, $token);
if ($create['status'] < 200 || $create['status'] >= 300) {
  http_response_code(502);
  echo json_encode([
    'ok' => false,
    'message' => $create['data']['message'] ?? 'Comergio rechazó el registro del aspirante.',
  ]);
  exit;
}

echo json_encode([
  'ok' => true,
  'message' => 'Aspirante creado en interesados.',
]);
