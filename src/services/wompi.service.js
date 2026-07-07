const crypto = require('crypto');

const MILLENNIUM_SCHOOL_ID = 'Millennium School';

const WOMPI_SANDBOX_API_URL = 'https://sandbox.wompi.co/v1';
const WOMPI_PRODUCTION_API_URL = 'https://production.wompi.co/v1';

function normalizeText(value) {
  return String(value || '').trim();
}

function isWompiSandboxMode() {
  return String(process.env.WOMPI_SANDBOX || 'true').toLowerCase() !== 'false';
}

function getWompiApiBaseUrl() {
  return isWompiSandboxMode() ? WOMPI_SANDBOX_API_URL : WOMPI_PRODUCTION_API_URL;
}

function getWompiPublicKey() {
  return normalizeText(process.env.WOMPI_PUBLIC_KEY);
}

function getWompiPrivateKey() {
  return normalizeText(process.env.WOMPI_PRIVATE_KEY);
}

function getWompiEventsSecret() {
  return normalizeText(process.env.WOMPI_EVENTS_SECRET);
}

function getWompiIntegritySecret() {
  return normalizeText(process.env.WOMPI_INTEGRITY_SECRET);
}

function getWompiSchoolId() {
  return normalizeText(process.env.WOMPI_SCHOOL_ID) || MILLENNIUM_SCHOOL_ID;
}

function isWompiConfigured() {
  return Boolean(
    getWompiPublicKey()
    && getWompiPrivateKey()
    && getWompiEventsSecret()
    && getWompiIntegritySecret()
  );
}

function getNestedValue(source, path) {
  return String(path || '')
    .split('.')
    .reduce((current, segment) => (current == null ? undefined : current[segment]), source);
}

function verifyWompiEventChecksum(eventPayload, incomingChecksum) {
  const secret = getWompiEventsSecret();
  const checksum = normalizeText(incomingChecksum).toUpperCase();
  if (!secret || !checksum) {
    return false;
  }

  const properties = Array.isArray(eventPayload?.signature?.properties)
    ? eventPayload.signature.properties
    : [];
  const timestamp = eventPayload?.timestamp;
  if (!properties.length || timestamp == null) {
    return false;
  }

  const concatenated = properties
    .map((property) => String(getNestedValue(eventPayload?.data, property) ?? ''))
    .join('')
    + String(timestamp)
    + secret;

  const expected = crypto.createHash('sha256').update(concatenated).digest('hex').toUpperCase();
  return expected === checksum;
}

function buildWompiIntegritySignature({
  reference,
  amountInCents,
  currency = 'COP',
  expirationTime = null,
}) {
  const integritySecret = getWompiIntegritySecret();
  const normalizedReference = normalizeText(reference);
  const normalizedAmount = String(Math.max(0, Number(amountInCents || 0)));
  const normalizedCurrency = normalizeText(currency) || 'COP';
  if (!integritySecret || !normalizedReference || !normalizedAmount) {
    throw new Error('Wompi integrity signature requires reference, amount and integrity secret');
  }

  let payload = `${normalizedReference}${normalizedAmount}${normalizedCurrency}`;
  if (expirationTime) {
    payload += String(expirationTime);
  }
  payload += integritySecret;

  return crypto.createHash('sha256').update(payload).digest('hex');
}

function toWompiInternalStatus(providerStatus) {
  const normalized = normalizeText(providerStatus).toUpperCase();
  if (normalized === 'APPROVED') return 'approved';
  if (normalized === 'DECLINED' || normalized === 'VOIDED' || normalized === 'ERROR') return 'failed';
  return 'pending';
}

function isWompiSchoolId(schoolId) {
  const normalizedSchoolId = normalizeText(schoolId);
  const configuredSchoolId = getWompiSchoolId();
  return normalizedSchoolId === configuredSchoolId
    || normalizedSchoolId.toLowerCase().includes('millennium');
}

function normalizeWompiLegalIdType(value) {
  const normalized = normalizeText(value).toUpperCase();
  const allowed = new Set(['CC', 'CE', 'NIT', 'PP', 'TI', 'DNI', 'RG', 'OTHER']);
  return allowed.has(normalized) ? normalized : 'CC';
}

async function wompiRequest(path, { method = 'GET', body = null } = {}) {
  const privateKey = getWompiPrivateKey();
  if (!privateKey) {
    throw new Error('WOMPI_PRIVATE_KEY no configurada');
  }

  const response = await fetch(`${getWompiApiBaseUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${privateKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.reason
      || data?.error?.message
      || data?.message
      || `Wompi request failed (${response.status})`;
    throw new Error(message);
  }

  return data;
}

async function fetchWompiTransaction(transactionId) {
  const normalizedId = normalizeText(transactionId);
  if (!normalizedId) {
    throw new Error('Wompi transaction id is required');
  }

  const data = await wompiRequest(`/transactions/${encodeURIComponent(normalizedId)}`);
  return data?.data || data;
}

function buildMatriculaReference() {
  return `MAT-${Date.now()}-${Math.floor(Math.random() * 1e6).toString().padStart(6, '0')}`;
}

module.exports = {
  MILLENNIUM_SCHOOL_ID,
  WOMPI_SANDBOX_API_URL,
  WOMPI_PRODUCTION_API_URL,
  buildMatriculaReference,
  buildWompiIntegritySignature,
  fetchWompiTransaction,
  getWompiApiBaseUrl,
  getWompiEventsSecret,
  getWompiIntegritySecret,
  getWompiPrivateKey,
  getWompiPublicKey,
  getWompiSchoolId,
  isWompiConfigured,
  isWompiSandboxMode,
  isWompiSchoolId,
  normalizeWompiLegalIdType,
  toWompiInternalStatus,
  verifyWompiEventChecksum,
  wompiRequest,
};
