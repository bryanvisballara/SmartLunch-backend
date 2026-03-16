function normalizeUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

let cachedOauthToken = '';
let cachedOauthTokenExpiresAt = 0;

function mapProviderStatus(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) {
    return 'PENDING';
  }
  return normalized;
}

async function getOauthAccessToken(baseUrl) {
  const now = Date.now();
  if (cachedOauthToken && cachedOauthTokenExpiresAt > now + 10_000) {
    return cachedOauthToken;
  }

  const consumerKey = String(process.env.DAVIPLATA_CONSUMER_KEY || '').trim();
  const consumerSecret = String(process.env.DAVIPLATA_CONSUMER_SECRET || '').trim();
  if (!consumerKey || !consumerSecret) {
    return '';
  }

  const tokenUrl = normalizeUrl(process.env.DAVIPLATA_OAUTH_TOKEN_URL) || `${baseUrl}/oauth/token`;

  const basicAuth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const body = new URLSearchParams({ grant_type: 'client_credentials' });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }

  if (!response.ok) {
    const message = data?.error_description || data?.error || data?.message || `OAuth token request failed (${response.status})`;
    const tokenError = new Error(message);
    tokenError.status = response.status;
    tokenError.providerPayload = data;
    throw tokenError;
  }

  const accessToken = String(data?.access_token || '').trim();
  const expiresInSeconds = Number(data?.expires_in || 300);

  if (!accessToken) {
    throw new Error('Daviplata OAuth response did not include access_token');
  }

  cachedOauthToken = accessToken;
  cachedOauthTokenExpiresAt = Date.now() + Math.max(30, expiresInSeconds) * 1000;
  return cachedOauthToken;
}

async function createDaviplataPaymentOrder({ amount, documentType, documentNumber, description, reference, callbackUrl }) {
  const baseUrl = normalizeUrl(process.env.DAVIPLATA_API_URL);
  if (!baseUrl) {
    throw new Error('DAVIPLATA_API_URL is not configured');
  }

  const payload = {
    amount: Number(amount),
    documentType: String(documentType || '').trim().toUpperCase(),
    documentNumber: String(documentNumber || '').trim(),
    description: String(description || 'Recarga Comergio').trim(),
    reference: String(reference || '').trim(),
    callbackUrl: String(callbackUrl || '').trim(),
  };

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const bearerToken = String(process.env.DAVIPLATA_BEARER_TOKEN || '').trim();
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  } else {
    const oauthToken = await getOauthAccessToken(baseUrl);
    if (oauthToken) {
      headers.Authorization = `Bearer ${oauthToken}`;
    }
  }

  const apiKey = String(process.env.DAVIPLATA_API_KEY || '').trim();
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const merchantId = String(process.env.DAVIPLATA_MERCHANT_ID || '').trim();
  if (merchantId) {
    headers['x-merchant-id'] = merchantId;
  }

  const response = await fetch(`${baseUrl}/payments/daviplata`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }

  if (!response.ok) {
    const errorMessage = data?.message || data?.error || `Daviplata API request failed with status ${response.status}`;
    const requestError = new Error(errorMessage);
    requestError.status = response.status;
    requestError.providerPayload = data;
    throw requestError;
  }

  return {
    transactionId: String(data?.transactionId || data?.id || '').trim(),
    status: mapProviderStatus(data?.status),
    raw: data,
  };
}

module.exports = {
  createDaviplataPaymentOrder,
  mapProviderStatus,
};
