function normalizeUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function getApiBaseUrl() {
  const configured = normalizeUrl(process.env.BOLD_API_URL);
  if (!configured) {
    return 'https://integrations.api.bold.co';
  }

  if (configured === 'https://api.bold.co' || configured === 'http://api.bold.co') {
    return 'https://integrations.api.bold.co';
  }

  return configured;
}

function getSecretKey() {
  return String(process.env.BOLD_SECRET_KEY || process.env.BOLD_API_KEY || '').trim();
}

function isBoldConfigured() {
  return Boolean(getSecretKey());
}

async function boldRequest(path, { method = 'GET', body = null, extraHeaders = {} } = {}) {
  const secretKey = getSecretKey();
  if (!secretKey) {
    throw new Error('BOLD_SECRET_KEY is not configured');
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }

  if (!response.ok) {
    const message = data?.message || data?.error || `Bold request failed (${response.status})`;
    const requestError = new Error(message);
    requestError.status = response.status;
    requestError.providerPayload = data;
    throw requestError;
  }

  return data;
}

function toInternalStatus(providerStatus) {
  const normalized = String(providerStatus || '').toLowerCase().trim();
  if (['approved', 'succeeded', 'paid', 'successful', 'completed'].includes(normalized)) return 'approved';
  if (['rejected', 'declined', 'failed', 'error', 'cancelled', 'canceled'].includes(normalized)) return 'rejected';
  return 'pending';
}

async function createCardToken({ cardNumber, expirationMonth, expirationYear, securityCode, cardholder }) {
  const endpoint = String(process.env.BOLD_CARD_TOKEN_PATH || '/online/card-tokens').trim();

  return boldRequest(endpoint, {
    method: 'POST',
    body: {
      card_number: String(cardNumber || '').replace(/\D/g, ''),
      expiration_month: Number(expirationMonth),
      expiration_year: Number(expirationYear),
      security_code: String(securityCode || '').replace(/\D/g, ''),
      cardholder: {
        name: String(cardholder?.name || '').trim(),
        identification: {
          type: String(cardholder?.identification?.type || '').trim(),
          number: String(cardholder?.identification?.number || '').trim(),
        },
      },
    },
  });
}

async function createCardPayment({ amount, paymentMethodToken, customerId, externalReference, description, idempotencyKey }) {
  const endpoint = String(process.env.BOLD_AUTO_DEBIT_CHARGE_PATH || '/online/payments').trim();

  const payload = {
    amount: {
      currency: 'COP',
      total: Math.round(Number(amount || 0)),
    },
    reference: String(externalReference || '').trim(),
    description: String(description || 'Recarga automatica Comergio').trim(),
    payment_method: {
      type: 'token',
      token: String(paymentMethodToken || '').trim(),
    },
    metadata: {
      external_reference: String(externalReference || '').trim(),
      source: 'comergio_auto_debit',
    },
  };

  if (customerId) {
    payload.payment_method.customer_id = String(customerId).trim();
  }

  const headers = {};
  if (idempotencyKey) {
    headers['Idempotency-Key'] = String(idempotencyKey).trim();
  }

  return boldRequest(endpoint, {
    method: 'POST',
    body: payload,
    extraHeaders: headers,
  });
}

/**
 * Generates the Bold integrity hash for the "Botón de pagos" frontend button.
 * Formula: SHA256(orderId + amount + currency + secretKey) → hex
 */
function generateIntegrityHash(orderId, amount, currency) {
  const secretKey = getSecretKey();
  if (!secretKey) {
    throw new Error('BOLD_SECRET_KEY is not configured');
  }
  const raw = `${orderId}${amount}${currency}${secretKey}`;
  return require('crypto').createHash('sha256').update(raw).digest('hex');
}

function getIdentityKey() {
  return String(process.env.BOLD_IDENTITY_KEY || '').trim();
}

module.exports = {
  isBoldConfigured,
  getIdentityKey,
  toInternalStatus,
  createCardToken,
  createCardPayment,
  generateIntegrityHash,
};
