const crypto = require('crypto');

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

function getAccessKey() {
  // Bold uses BOLD_IDENTITY_KEY as the AWS SigV4 access key for API calls.
  return String(process.env.BOLD_IDENTITY_KEY || '').trim();
}

function isBoldConfigured() {
  return Boolean(getSecretKey());
}

/**
 * Signs a request to Bold's API using AWS Signature Version 4.
 * Bold's integrations API (integrations.api.bold.co) is hosted on AWS API Gateway
 * and requires SigV4 signing, with BOLD_IDENTITY_KEY as the access key and
 * BOLD_SECRET_KEY as the signing secret.
 */
function buildSigV4Headers(method, hostname, path, bodyString) {
  const accessKey = getAccessKey();
  const secretKey = getSecretKey();
  const region = String(process.env.BOLD_API_REGION || 'us-east-1').trim();
  const service = 'execute-api';

  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = crypto.createHash('sha256').update(bodyString).digest('hex');

  const canonicalHeaders = `content-type:application/json\nhost:${hostname}\nx-amz-date:${amzDate}\n`;
  const signedHeadersList = 'content-type;host;x-amz-date';

  const canonicalRequest = [
    method.toUpperCase(),
    path,
    '',
    canonicalHeaders,
    signedHeadersList,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, dateStamp), region), service), 'aws4_request');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeadersList}, Signature=${signature}`;

  return {
    Authorization: authorizationHeader,
    'Content-Type': 'application/json',
    'x-amz-date': amzDate,
  };
}

async function boldRequest(path, { method = 'GET', body = null, extraHeaders = {} } = {}) {
  const accessKey = getAccessKey();
  const secretKey = getSecretKey();
  if (!accessKey || !secretKey) {
    throw new Error('BOLD_IDENTITY_KEY and BOLD_SECRET_KEY must both be configured');
  }

  const baseUrl = getApiBaseUrl();
  const url = new URL(path, baseUrl);
  const bodyString = body ? JSON.stringify(body) : '';

  const sigHeaders = buildSigV4Headers(method, url.hostname, url.pathname, bodyString);

  const response = await fetch(url.toString(), {
    method,
    headers: {
      ...sigHeaders,
      Accept: 'application/json',
      ...extraHeaders,
    },
    body: bodyString || undefined,
  });

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }

  if (!response.ok) {
    const providerMsg = data?.message || data?.error || '';
    // Help diagnose SigV4 credential issues
    const isAuthError = response.status === 403 || response.status === 401;
    const isCredentialError = isAuthError && (
      providerMsg.includes('security token') ||
      providerMsg.includes('Missing Authentication') ||
      providerMsg.includes('key=value') ||
      providerMsg.includes('Credential')
    );
    const message = isCredentialError
      ? 'Error de autenticacion con Bold API. Verifica que BOLD_IDENTITY_KEY y BOLD_SECRET_KEY sean las credenciales de cobro recurrente (no las del boton de pagos). Contacta a Bold para obtener las credenciales de API de cobros recurrentes.'
      : providerMsg || `Bold request failed (${response.status})`;
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
