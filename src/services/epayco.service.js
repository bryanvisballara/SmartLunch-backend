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

function getCustomerCreatePath() {
  const raw = String(process.env.EPAYCO_CUSTOMER_CREATE_PATH || '').trim();
  if (!raw) return '/token/customer';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function getExistingCustomerIdOverride() {
  return normalizeCustomerId(process.env.EPAYCO_EXISTING_CUSTOMER_ID || '');
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
  const nestedErrors = data?.data?.errors;
  if (Array.isArray(nestedErrors) && nestedErrors.length > 0) {
    const first = nestedErrors[0] || {};
    const code = String(first?.codError || '').trim();
    const text = String(first?.errorMessage || '').trim();
    if (code || text) {
      return [code, text].filter(Boolean).join(': ');
    }
  }

  if (nestedErrors && typeof nestedErrors === 'object' && !Array.isArray(nestedErrors)) {
    const code = String(nestedErrors?.codError || '').trim();
    const text = String(nestedErrors?.errorMessage || '').trim();
    if (code || text) {
      return [code, text].filter(Boolean).join(': ');
    }
  }

  const candidates = [
    data?.message,
    data?.error,
    data?.detail,
    data?.msg,
    data?.textResponse,
    data?.titleResponse,
    data?.lastAction,
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

function isFalsyErrorValue(value) {
  if (value === false || value === 0 || value === '0' || value == null) {
    return true;
  }
  const normalized = String(value).toLowerCase().trim();
  return !normalized || ['false', 'null', 'undefined', 'none', 'ok', 'success'].includes(normalized);
}

function extractCustomerIdFromPayload(payload) {
  return String(
    payload?.customerId
    || payload?.customer_id
    || payload?.idCustomer
    || payload?.id_customer
    || payload?.customer?.id
    || payload?.customer?.customerId
    || payload?.customer?.customer_id
    || payload?.data?.customerId
    || payload?.data?.customer_id
    || payload?.data?.idCustomer
    || payload?.data?.id_customer
    || payload?.data?.customer?.id
    || payload?.data?.customer?.customerId
    || payload?.data?.customer?.customer_id
    || ''
  ).trim();
}

function extractCardTokenFromPayload(payload) {
  return String(
    payload?.token
    || payload?.token_card
    || payload?.cardToken
    || payload?.card_token
    || payload?.id
    || payload?.data?.token
    || payload?.data?.token_card
    || payload?.data?.cardToken
    || payload?.data?.card_token
    || payload?.data?.id
    || ''
  ).trim();
}

function normalizeCustomerId(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  const lower = normalized.toLowerCase();
  if (['undefined', 'null', 'nan', 'none', 'false'].includes(lower)) {
    return '';
  }
  return normalized;
}

function isCustomerIdRequiredProviderError(error) {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('field customerid required')) {
    return true;
  }

  const providerErrors = error?.providerPayload?.data?.errors;
  const list = Array.isArray(providerErrors) ? providerErrors : (providerErrors ? [providerErrors] : []);
  return list.some((entry) => String(entry?.errorMessage || '').toLowerCase().includes('field customerid required'));
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

    const hasStatusField = Object.prototype.hasOwnProperty.call(data || {}, 'status');
    const hasSuccessField = Object.prototype.hasOwnProperty.call(data || {}, 'success');
    const hasErrorField = Object.prototype.hasOwnProperty.call(data || {}, 'error');

    const normalizedStatus = String(data?.status ?? '').toLowerCase().trim();
    const normalizedError = String(data?.error ?? '').toLowerCase().trim();

    const explicitFailure =
      (hasStatusField && [false, 0, '0'].includes(data?.status))
      || (hasStatusField && ['false', 'error', 'failed', 'fail', 'rejected'].includes(normalizedStatus))
      || (hasSuccessField && data?.success === false)
      || (hasErrorField && data?.error === true)
      || (hasErrorField && !isFalsyErrorValue(data?.error));

    const explicitSuccess =
      (hasStatusField && (data?.status === true || data?.status === 1 || data?.status === '1'))
      || (hasStatusField && ['true', 'ok', 'success', 'accepted', 'approved'].includes(normalizedStatus))
      || (hasSuccessField && data?.success === true);

    const hasTokenLikePayload = Boolean(
      data?.cardToken
      || data?.token
      || data?.token_card
      || data?.id
      || data?.data?.cardToken
      || data?.data?.token
      || data?.data?.token_card
      || data?.data?.id
    );

    const hasCustomerLikePayload = Boolean(
      data?.customerId
      || data?.customer_id
      || data?.customer
      || data?.subscription
      || data?.data?.customerId
      || data?.data?.customer_id
      || data?.data?.customer
      || data?.data?.subscription
    );

    const implicitOk = !hasStatusField && !hasSuccessField && !hasErrorField;
    const ok = response.ok && !explicitFailure && (explicitSuccess || hasTokenLikePayload || hasCustomerLikePayload || implicitOk);
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
  const cleanExpYearTwoDigits = cleanExpYear.length === 4 ? cleanExpYear.slice(-2) : cleanExpYear;
  const cleanExpMonth = String(Number(expirationMonth || 0)).padStart(2, '0');
  const cleanCvv = String(securityCode || '').replace(/\D/g, '');

  const payloadVariants = [
    // Official APIFY format from Postman collection
    {
      cardNumber: cleanCardNumber,
      cardExpYear: cleanExpYear,
      cardExpMonth: cleanExpMonth,
      cardCvc: cleanCvv,
    },
    // Some accounts expect YY instead of YYYY
    {
      cardNumber: cleanCardNumber,
      cardExpYear: cleanExpYearTwoDigits,
      cardExpMonth: cleanExpMonth,
      cardCvc: cleanCvv,
    },
    // Compatibility with alternate key naming
    {
      card_number: cleanCardNumber,
      exp_year: cleanExpYear,
      exp_month: cleanExpMonth,
      cvc: cleanCvv,
    },
    {
      card_number: cleanCardNumber,
      exp_year: cleanExpYearTwoDigits,
      exp_month: cleanExpMonth,
      cvc: cleanCvv,
    },
  ];

  let lastError = null;
  for (const payload of payloadVariants) {
    try {
      const result = await epaycoRequest('/token/card', {
        method: 'POST',
        body: payload,
      });
      return result.data || result;
    } catch (error) {
      lastError = error;
      const status = Number(error?.status);
      if (status !== 400 && status !== 422) {
        throw error;
      }
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error('No se pudo tokenizar la tarjeta en ePayco.');
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
  franchise,
  mask,
}) {
  const normalizedTokenCard = String(tokenCard || '').trim();
  const body = {
    token_card: normalizedTokenCard,
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
    body.customer_id = normalizeCustomerId(existingCustomerId);
  }

  const subscriptionBody = {
    customerId: normalizeCustomerId(existingCustomerId) || undefined,
    customer_id: normalizeCustomerId(existingCustomerId) || undefined,
    cardToken: normalizedTokenCard,
    token_card: normalizedTokenCard,
    franchise: String(franchise || '').trim() || undefined,
    mask: String(mask || '').trim() || undefined,
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

  const createCustomerBody = {
    name: body.name,
    last_name: body.last_name,
    email: body.email,
    phone: body.phone,
    cell_phone: body.cell_phone,
    doc_type: body.doc_type,
    doc_number: body.doc_number,
    city: body.city,
    address: body.address,
    default: true,
    token_card: normalizedTokenCard,
    cardToken: normalizedTokenCard,
    franchise: String(franchise || '').trim() || undefined,
    mask: String(mask || '').trim() || undefined,
  };

  const createCustomerBodyTokenCustomer = {
    docType: body.doc_type,
    docNumber: body.doc_number,
    name: body.name,
    lastName: body.last_name,
    email: body.email,
    cellPhone: body.cell_phone,
    phone: body.phone,
    requireCardToken: false,
  };

  const tryAddTokenWithCustomer = async (customerId) => {
    const resolvedCustomerId = String(customerId || '').trim();
    if (!resolvedCustomerId) {
      throw new Error('Missing ePayco customer id for token association');
    }

    const payload = {
      ...subscriptionBody,
      customerId: resolvedCustomerId,
      customer_id: resolvedCustomerId,
    };

    const endpoints = [
      '/subscriptions/customer/add/new/token/default',
      '/subscriptions/customer/add/new/token',
    ];

    let lastError = null;
    for (const endpoint of endpoints) {
      try {
        const result = await epaycoRequest(endpoint, {
          method: 'POST',
          body: payload,
        });

        const normalized = result?.data || result;
        return {
          ...normalized,
          customerId: extractCustomerIdFromPayload(normalized) || resolvedCustomerId,
          token: extractCardTokenFromPayload(normalized) || normalizedTokenCard,
        };
      } catch (error) {
        lastError = error;
        if (error?.code === 'EPAYCO_INVALID_CLIENT') {
          throw error;
        }

        const status = Number(error?.status);
        if (status === 401 || status === 403) {
          throw error;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error('No fue posible asociar la tarjeta al customer en ePayco.');
  };

  const tryCreateCustomer = async () => {
    const configuredCreatePath = getCustomerCreatePath();
    const customerCreateEndpoints = [
      configuredCreatePath,
      '/token/customer',
      '/subscriptions/customer/create',
      '/subscriptions/customer/save',
      '/subscriptions/customer/new',
      '/subscriptions/customer/add',
      '/subscriptions/customer/add/new',
      '/subscription/customer/create',
      '/subscription/customer/save',
      '/subscription/customer/new',
      '/subscription/customer/add',
      '/customer/create',
      '/customer/save',
      '/customers/create',
      '/customers/save',
    ].filter(Boolean);

    let lastError = null;
    for (const endpoint of customerCreateEndpoints) {
      try {
        const requestBody = endpoint === '/token/customer'
          ? createCustomerBodyTokenCustomer
          : createCustomerBody;

        const result = await epaycoRequest(endpoint, {
          method: 'POST',
          body: requestBody,
        });
        const normalized = result?.data || result;
        const customerId = extractCustomerIdFromPayload(normalized);
        if (customerId) {
          return customerId;
        }
      } catch (error) {
        lastError = error;
        const status = Number(error?.status);
        if (status !== 404 && status !== 400 && status !== 422) {
          throw error;
        }
      }
    }

    // If customer-creation endpoints are unavailable or reject validation,
    // continue with the alternative token-association flow.
    if (lastError) {
      const status = Number(lastError?.status);
      if (status !== 404 && status !== 400 && status !== 422) {
        throw lastError;
      }
    }

    return '';
  };

  let lastSubscriptionError = null;
  const resolvedExistingCustomerId = normalizeCustomerId(existingCustomerId) || getExistingCustomerIdOverride();

  if (resolvedExistingCustomerId) {
    try {
      return await tryAddTokenWithCustomer(resolvedExistingCustomerId);
    } catch (error) {
      lastSubscriptionError = error;
      if (error?.code === 'EPAYCO_INVALID_CLIENT') {
        throw error;
      }
      const status = Number(error?.status);
      if (status === 401 || status === 403) {
        throw error;
      }

      // Stored customer id is invalid/stale for this merchant account.
      // Continue with customer creation flow.
      if (isCustomerIdRequiredProviderError(error)) {
        lastSubscriptionError = null;
      }
    }
  }

  const createdCustomerId = await tryCreateCustomer();
  if (createdCustomerId) {
    return tryAddTokenWithCustomer(createdCustomerId);
  }

  const noCustomerErr = new Error(
    'No fue posible obtener o crear customerId en ePayco para asociar la tarjeta. Verifica en la colección de APIFY el endpoint de creacion de customer habilitado para esta cuenta.'
  );
  noCustomerErr.status = 502;
  noCustomerErr.code = 'EPAYCO_CUSTOMER_ID_REQUIRED';
  noCustomerErr.providerPath = '/subscriptions/customer/add/new/token';
  noCustomerErr.providerPayload = lastSubscriptionError?.providerPayload || null;
  throw noCustomerErr;
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
    value: String(Math.round(Number(amount || 0))),
    docType: normalizeEpaycoDocType(docType),
    docNumber: String(docNumber || '').replace(/\D/g, ''),
    name: String(firstName || '').trim(),
    lastName: String(lastName || '').trim(),
    email: String(email || '').trim().toLowerCase(),
    cellPhone: String(cellPhone || phone || '3000000000').replace(/\D/g, ''),
    phone: String(phone || '3000000000').replace(/\D/g, ''),
    dues: '1',
    cardTokenId: String(customerToken || '').trim(),
    customerId: String(customerId || '').trim(),
  };

  const extraHeaders = {};
  if (idempotencyKey) {
    extraHeaders['X-Idempotency-Key'] = String(idempotencyKey).trim();
  }

  const result = await epaycoRequest('/payment/process', {
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
