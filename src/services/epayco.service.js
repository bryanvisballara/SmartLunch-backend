const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Configuration helpers
// ---------------------------------------------------------------------------

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/$/, '');
}

function getApiBaseUrls() {
  const configured = normalizeBaseUrl(process.env.EPAYCO_API_URL || '');
  const defaults = ['https://api.epayco.co', 'https://apify.epayco.co'];
  const urls = configured ? [configured, ...defaults] : defaults;
  return Array.from(new Set(urls.filter(Boolean)));
}

function getApiBaseUrlsWithPreferred(preferredBaseUrl) {
  const preferred = normalizeBaseUrl(preferredBaseUrl || '');
  const urls = getApiBaseUrls();
  if (!preferred) {
    return urls;
  }
  return [preferred, ...urls.filter((url) => url !== preferred)];
}

function getPublicKey() {
  return String(process.env.EPAYCO_PUBLIC_KEY || '').trim();
}

function getPrivateKey() {
  return String(process.env.EPAYCO_PRIVATE_KEY || '').trim();
}

function getEntityClientId() {
  return String(process.env.EPAYCO_ENTITY_CLIENT_ID || '').trim();
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
let _bearerBaseUrl = null;

function normalizeEpaycoDocType(value) {
  const normalized = String(value || 'CC').trim().toUpperCase();
  if (['CC', 'CE', 'TI', 'NIT', 'PP', 'DNI'].includes(normalized)) {
    return normalized;
  }
  if (normalized === 'PASSPORT') {
    return 'PP';
  }
  return 'CC';
}

function normalizeEpaycoProviderErrorMessage(rawMsg) {
  const normalized = String(rawMsg || '').toLowerCase();
  if (normalized.includes('invalid client') || normalized.includes('invalid_client')) {
    return 'ePayco rechazó las credenciales del comercio (invalid_client). Verifica EPAYCO_PUBLIC_KEY y EPAYCO_PRIVATE_KEY de API en Render y confirma que la cuenta tenga API habilitada.';
  }
  return rawMsg;
}

function extractEpaycoErrorMessage(data, responseStatus, path) {
  const candidates = [
    data?.message,
    data?.error,
    data?.detail,
    data?.msg,
    data?.data?.message,
    data?.data?.error,
    data?.data?.detail,
    data?.data?.response,
    data?.data?.description,
  ];

  for (const value of candidates) {
    const text = String(value || '').trim();
    if (text) {
      return text;
    }
  }

  return `ePayco request failed (${responseStatus}) on ${path}`;
}

async function epaycoLogin(preferredBaseUrl = null) {
  const publicKey = getPublicKey();
  const privateKey = getPrivateKey();
  const entityClientId = getEntityClientId();
  if (!publicKey || !privateKey) {
    throw new Error('EPAYCO_PUBLIC_KEY y EPAYCO_PRIVATE_KEY deben estar configurados');
  }

  // Official Postman collection uses Basic Auth with PUBLIC_KEY / PRIVATE_KEY.
  // Postman base64-encodes "PUBLIC_KEY:PRIVATE_KEY" automatically.
  const credentialVariants = [
    Buffer.from(`${publicKey}:${privateKey}`).toString('base64'),
    Buffer.from(`${publicKey}:${crypto.createHash('sha256').update(privateKey).digest('hex')}`).toString('base64'),
  ];

  // If EntityClientId is configured, try both with and without it.
  // Some accounts are not registrador and fail when this header is sent.
  const entityClientIdHeaderVariants = entityClientId
    ? [Buffer.from(entityClientId).toString('base64'), null]
    : [null];

  const attempts = [];
  for (const encodedEntityClientId of entityClientIdHeaderVariants) {
    attempts.push({
      headers: (credentials) => ({
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
        ...(encodedEntityClientId ? { EntityClientId: encodedEntityClientId } : {}),
      }),
      body: { authenticate: true },
      useCredentialVariants: true,
    });
  }

  attempts.push({
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: {
      public_key: publicKey,
      private_key: privateKey,
      authenticate: true,
    },
    useCredentialVariants: false,
  });

  let lastStatus = 500;
  let lastPayload = null;
  let lastMessage = 'ePayco login failed';

  for (const baseUrl of getApiBaseUrlsWithPreferred(preferredBaseUrl)) {
    for (const attempt of attempts) {
      const credentialsToTry = attempt.useCredentialVariants ? credentialVariants : [null];

      for (const credentials of credentialsToTry) {
        const response = await fetch(`${baseUrl}/login`, {
          method: 'POST',
          headers: attempt.headers(credentials),
          body: JSON.stringify(attempt.body),
        });

        let data = {};
        try {
          data = await response.json();
        } catch {
          data = {};
        }

        const accessToken = String(data?.bearer || data?.token || '').trim();
        if (response.ok && accessToken) {
          return {
            ...data,
            __accessToken: accessToken,
            __baseUrl: baseUrl,
          };
        }

        lastStatus = response.status;
        lastPayload = data;
        lastMessage = data?.message || data?.error || `ePayco login failed (${response.status})`;
      }
    }
  }

  const msg = normalizeEpaycoProviderErrorMessage(lastMessage);

  const err = new Error(msg);
  err.status = lastStatus;
  err.providerPayload = lastPayload;
  throw err;
}

async function getBearer(preferredBaseUrl = null) {
  const preferred = normalizeBaseUrl(preferredBaseUrl || '');
  if (
    _bearerToken
    && Date.now() < _bearerExpiresAt
    && _bearerBaseUrl
    && (!preferred || preferred === _bearerBaseUrl)
  ) {
    return {
      token: _bearerToken,
      baseUrl: _bearerBaseUrl,
    };
  }

  const loginResult = await epaycoLogin(preferred || null);
  _bearerToken = String(loginResult.__accessToken || loginResult.bearer || loginResult.token || '').trim();
  _bearerBaseUrl = String(loginResult.__baseUrl || getApiBaseUrls()[0] || '').trim();

  // Cache with a 23-hour window (safer than full 24h)
  const ttlMs = 23 * 60 * 60 * 1000;
  _bearerExpiresAt = Date.now() + ttlMs;

  return {
    token: _bearerToken,
    baseUrl: _bearerBaseUrl,
  };
}

// Invalidate cached token so next call re-authenticates
function invalidateBearerCache() {
  _bearerToken = null;
  _bearerExpiresAt = 0;
  _bearerBaseUrl = null;
}

// ---------------------------------------------------------------------------
// Base request helper
// ---------------------------------------------------------------------------

async function epaycoRequest(path, { method = 'GET', body = null, extraHeaders = {} } = {}) {
  const attemptRequest = async (preferredBaseUrl = null) => {
    const bearerSession = await getBearer(preferredBaseUrl);
    const url = `${String(bearerSession.baseUrl || '').trim()}${path}`;

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${bearerSession.token}`,
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

    const ok = response.ok && (data.status === true || data.status === 'true');
    if (ok) {
      return data;
    }

    const rawMsg = extractEpaycoErrorMessage(data, response.status, path);
    const msg = normalizeEpaycoProviderErrorMessage(rawMsg);

    if (response.status === 401 || response.status === 403) {
      invalidateBearerCache();
    }

    const err = new Error(msg);
    err.status = response.status;
    err.providerPath = path;
    err.providerPayload = data;
    err.providerBaseUrl = String(bearerSession.baseUrl || '').trim();
    if (String(rawMsg || '').toLowerCase().includes('invalid client') || String(rawMsg || '').toLowerCase().includes('invalid_client')) {
      err.code = 'EPAYCO_INVALID_CLIENT';
    }
    throw err;
  };

  try {
    return await attemptRequest();
  } catch (error) {
    const status = Number(error?.status);
    if (status !== 404) {
      throw error;
    }

    const originalBase = String(error?.providerBaseUrl || '').trim();
    const alternateBases = getApiBaseUrls().filter((url) => url && url !== originalBase);
    let lastError = error;

    for (const altBase of alternateBases) {
      try {
        return await attemptRequest(altBase);
      } catch (retryError) {
        lastError = retryError;
        if (Number(retryError?.status) !== 404) {
          throw retryError;
        }
      }
    }

    throw lastError;
  }
}

// ---------------------------------------------------------------------------
// Card tokenization
// ePayco expects card data base64-encoded in a { data: "..." } envelope
// ---------------------------------------------------------------------------

async function createCardToken({ cardNumber, expirationMonth, expirationYear, securityCode }) {
  const cleanCardNumber = String(cardNumber || '').replace(/\D/g, '');
  const cleanExpYear = String(Number(expirationYear || 0));
  const cleanExpMonth = String(Number(expirationMonth || 0)).padStart(2, '0');
  const cleanCvv = String(securityCode || '').replace(/\D/g, '');

  // Official APIFY endpoint from ePayco collection
  const primaryBody = {
    cardNumber: cleanCardNumber,
    cardExpYear: cleanExpYear,
    cardExpMonth: cleanExpMonth,
    cardCvc: cleanCvv,
  };

  const result = await epaycoRequest('/token/card', {
    method: 'POST',
    body: primaryBody,
  });
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
    doc_type: normalizeEpaycoDocType(docType),
    doc_number: String(docNumber || '').replace(/\D/g, ''),
    city: String(city || 'Bogota').trim(),
    address: String(address || 'Colombia').trim(),
    default: true,
  };

  // Include customer_id for updates; omit it for new customers
  if (existingCustomerId) {
    body.customer_id = String(existingCustomerId).trim();
  }

  const subscriptionBody = {
    customerId: String(existingCustomerId || '').trim() || undefined,
    customer_id: String(existingCustomerId || '').trim() || undefined,
    cardToken: String(tokenCard || '').trim(),
    token_card: String(tokenCard || '').trim(),
    email: body.email,
    docType: body.doc_type,
    doc_type: body.doc_type,
    docNumber: body.doc_number,
    doc_number: body.doc_number,
    name: body.name,
    last_name: body.last_name,
    phone: body.phone,
    cell_phone: body.cell_phone,
    city: body.city,
    address: body.address,
  };

  const subscriptionEndpoints = [
    '/subscriptions/customer/add/new/token/default',
    '/subscriptions/customer/add/new/token',
  ];

  for (const endpoint of subscriptionEndpoints) {
    try {
      const result = await epaycoRequest(endpoint, {
        method: 'POST',
        body: subscriptionBody,
      });
      return result.data || result;
    } catch (error) {
      if (Number(error?.status) !== 404) {
        throw error;
      }
    }
  }

  const legacyResult = await epaycoRequest('/payment/customer/save', {
    method: 'POST',
    body,
  });

  return legacyResult.data || legacyResult;
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
    doc_type: normalizeEpaycoDocType(docType),
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
