const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Configuration helpers
// ---------------------------------------------------------------------------

function getApiBaseUrl() {
  return String(process.env.EPAYCO_API_URL || 'https://apify.epayco.co').trim().replace(/\/$/, '');
}

function getPublicKey() {
  return String(process.env.EPAYCO_PUBLIC_KEY || '').trim();
}

function getPrivateKey() {
  return String(process.env.EPAYCO_PRIVATE_KEY || '').trim();
}

function isTestMode() {
  return String(process.env.EPAYCO_TEST || 'false').toLowerCase() === 'true';
}

function isEpaycoConfigured() {
  return Boolean(getPublicKey() && getPrivateKey());
}

// ---------------------------------------------------------------------------
// Bearer token cache (ePayco login tokens are valid for ~24 h)
// ---------------------------------------------------------------------------

let _bearerToken = null;
let _bearerExpiresAt = 0;

async function epaycoLogin() {
  const publicKey = getPublicKey();
  const privateKey = getPrivateKey();
  if (!publicKey || !privateKey) {
    throw new Error('EPAYCO_PUBLIC_KEY y EPAYCO_PRIVATE_KEY deben estar configurados');
  }

  // ePayco expects the private key hashed with SHA-256 as part of Basic auth
  const privateKeyHash = crypto.createHash('sha256').update(privateKey).digest('hex');
  const credentials = Buffer.from(`${publicKey}:${privateKeyHash}`).toString('base64');

  const response = await fetch(`${getApiBaseUrl()}/login`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ authenticate: true }),
  });

  let data = {};
  try {
    data = await response.json();
  } catch { /* empty */ }

  if (!response.ok || !data.bearer) {
    const msg = data?.message || data?.error || `ePayco login failed (${response.status})`;
    const err = new Error(msg);
    err.status = response.status;
    err.providerPayload = data;
    throw err;
  }

  return data;
}

async function getBearer() {
  if (_bearerToken && Date.now() < _bearerExpiresAt) {
    return _bearerToken;
  }

  const loginResult = await epaycoLogin();
  _bearerToken = String(loginResult.bearer || '').trim();

  // Cache with a 23-hour window (safer than full 24h)
  const ttlMs = 23 * 60 * 60 * 1000;
  _bearerExpiresAt = Date.now() + ttlMs;

  return _bearerToken;
}

// Invalidate cached token so next call re-authenticates
function invalidateBearerCache() {
  _bearerToken = null;
  _bearerExpiresAt = 0;
}

// ---------------------------------------------------------------------------
// Base request helper
// ---------------------------------------------------------------------------

async function epaycoRequest(path, { method = 'GET', body = null, extraHeaders = {} } = {}) {
  const bearer = await getBearer();
  const url = `${getApiBaseUrl()}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = {};
  try {
    data = await response.json();
  } catch { /* empty */ }

  // ePayco responds with HTTP 200 even for logical errors; check data.status
  const ok = response.ok && (data.status === true || data.status === 'true');

  if (!ok) {
    const msg = data?.message || data?.error || `ePayco request failed (${response.status})`;

    // If the error is auth-related, flush the cached token so next call re-logs
    if (response.status === 401 || response.status === 403) {
      invalidateBearerCache();
    }

    const err = new Error(msg);
    err.status = response.status;
    err.providerPayload = data;
    throw err;
  }

  return data;
}

// ---------------------------------------------------------------------------
// Card tokenization
// ePayco expects card data base64-encoded in a { data: "..." } envelope
// ---------------------------------------------------------------------------

async function createCardToken({ cardNumber, expirationMonth, expirationYear, securityCode }) {
  const cardData = {
    'card[number]': String(cardNumber || '').replace(/\D/g, ''),
    'card[exp_year]': String(Number(expirationYear)),
    'card[exp_month]': String(Number(expirationMonth)).padStart(2, '0'),
    'card[cvc]': String(securityCode || '').replace(/\D/g, ''),
    hasCvv: true,
  };

  const encodedData = Buffer.from(JSON.stringify(cardData)).toString('base64');

  const result = await epaycoRequest('/payment/process/base64', {
    method: 'POST',
    body: { data: encodedData },
  });

  // Response: { status: true, data: { id: "tok_xxx", ... } }
  return result.data || result;
}

// ---------------------------------------------------------------------------
// Customer (saved card) management
// Creates or updates a customer record in ePayco.
// Returns { customerId, token } for future charges.
// ---------------------------------------------------------------------------

async function createOrUpdateCustomer({
  tokenCard,
  email,
  firstName,
  lastName,
  docType,
  docNumber,
  phone,
  cellPhone,
  city,
  address,
  existingCustomerId,
}) {
  const body = {
    token_card: String(tokenCard || '').trim(),
    name: String(firstName || '').trim(),
    last_name: String(lastName || '').trim(),
    email: String(email || '').trim().toLowerCase(),
    phone: String(phone || '3000000000').replace(/\D/g, ''),
    cell_phone: String(cellPhone || phone || '3000000000').replace(/\D/g, ''),
    doc_type: String(docType || 'CC').trim().toUpperCase(),
    doc_number: String(docNumber || '').replace(/\D/g, ''),
    city: String(city || 'Bogota').trim(),
    address: String(address || 'Colombia').trim(),
    default: true,
  };

  // Include customer_id for updates; omit it for new customers
  if (existingCustomerId) {
    body.customer_id = String(existingCustomerId).trim();
  }

  const result = await epaycoRequest('/payment/customer/save', {
    method: 'POST',
    body,
  });

  // Response: { status: true, message: "...", data: { customerId, token, ... } }
  return result.data || result;
}

// ---------------------------------------------------------------------------
// Retrieve a customer by ID
// ---------------------------------------------------------------------------

async function getCustomer(customerId) {
  const result = await epaycoRequest(`/payment/customer/${encodeURIComponent(String(customerId || '').trim())}`);
  return result.data || result;
}

// ---------------------------------------------------------------------------
// Charge a saved customer (MIT – no CVV required)
// customerToken = the persistent token stored on the customer (providerCardId)
// customerId    = ePayco customer ID (providerCustomerId)
// ---------------------------------------------------------------------------

async function chargeCustomer({
  customerToken,
  customerId,
  docType,
  docNumber,
  firstName,
  lastName,
  email,
  city,
  address,
  phone,
  cellPhone,
  description,
  amount,
  idempotencyKey,
}) {
  const isTest = isTestMode();

  const body = {
    token_card: String(customerToken || '').trim(),
    customer_id: String(customerId || '').trim(),
    doc_type: String(docType || 'CC').trim().toUpperCase(),
    doc_number: String(docNumber || '').replace(/\D/g, ''),
    name: String(firstName || '').trim(),
    last_name: String(lastName || '').trim(),
    email: String(email || '').trim().toLowerCase(),
    city: String(city || 'Bogota').trim(),
    address: String(address || 'Colombia').trim(),
    phone: String(phone || '3000000000').replace(/\D/g, ''),
    cell_phone: String(cellPhone || phone || '3000000000').replace(/\D/g, ''),
    description: String(description || 'Recarga automatica Comergio').trim(),
    value: String(Math.round(Number(amount || 0))),
    tax: '0',
    tax_base: '0',
    currency: 'COP',
    dues: '1',
    test_request: isTest ? 'TRUE' : 'FALSE',
  };

  const extraHeaders = {};
  if (idempotencyKey) {
    extraHeaders['X-Idempotency-Key'] = String(idempotencyKey).trim();
  }

  const result = await epaycoRequest('/payment/process/charge', {
    method: 'POST',
    body,
    extraHeaders,
  });

  // Response data is usually nested under result.data
  return result.data || result;
}

// ---------------------------------------------------------------------------
// Status normalization
// ePayco x_transaction_state: "Aceptada", "Rechazada", "Pendiente", "Fallida", "Cancelada"
// ---------------------------------------------------------------------------

function toInternalStatus(providerStatus) {
  const normalized = String(providerStatus || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // strip accents → aceptada, rechazada, etc.

  if (normalized === 'aceptada' || normalized === 'approved' || normalized === 'accepted') return 'approved';
  if (['rechazada', 'fallida', 'cancelada', 'rejected', 'failed', 'cancelled', 'canceled'].includes(normalized)) return 'rejected';
  return 'pending';
}

module.exports = {
  isEpaycoConfigured,
  isTestMode,
  createCardToken,
  createOrUpdateCustomer,
  getCustomer,
  chargeCustomer,
  toInternalStatus,
};
