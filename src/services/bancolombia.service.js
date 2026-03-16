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

  if (['APPROVED', 'SUCCESS', 'PAID', 'COMPLETED'].includes(normalized)) {
    return 'APPROVED';
  }

  if (['REJECTED', 'DECLINED', 'FAILED', 'ERROR', 'CANCELLED'].includes(normalized)) {
    return 'REJECTED';
  }

  return 'PENDING';
}

async function getOauthAccessToken(baseUrl) {
  const now = Date.now();
  if (cachedOauthToken && cachedOauthTokenExpiresAt > now + 10_000) {
    return cachedOauthToken;
  }

  const clientId = String(process.env.BANCOLOMBIA_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.BANCOLOMBIA_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    return '';
  }

  const tokenUrl = normalizeUrl(process.env.BANCOLOMBIA_OAUTH_TOKEN_URL) || `${baseUrl}/oauth/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
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
    throw new Error('Bancolombia OAuth response did not include access_token');
  }

  cachedOauthToken = accessToken;
  cachedOauthTokenExpiresAt = Date.now() + Math.max(30, expiresInSeconds) * 1000;
  return cachedOauthToken;
}

async function createBancolombiaPaymentOrder({ amount, reference, description, callbackUrl, redirectUrl }) {
  const baseUrl = normalizeUrl(process.env.BANCOLOMBIA_API_URL);
  if (!baseUrl) {
    throw new Error('BANCOLOMBIA_API_URL is not configured');
  }

  const endpointPath = String(process.env.BANCOLOMBIA_PAYMENT_ENDPOINT || '/payments/bancolombia/button').trim();
  const endpoint = endpointPath.startsWith('http') ? endpointPath : `${baseUrl}${endpointPath.startsWith('/') ? '' : '/'}${endpointPath}`;

  const payload = {
    amount: Number(amount),
    reference: String(reference || '').trim(),
    description: String(description || 'Recarga Comergio').trim(),
    callbackUrl: String(callbackUrl || '').trim(),
    redirectUrl: String(redirectUrl || '').trim(),
  };

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const explicitBearerToken = String(process.env.BANCOLOMBIA_BEARER_TOKEN || '').trim();
  if (explicitBearerToken) {
    headers.Authorization = `Bearer ${explicitBearerToken}`;
  } else {
    const oauthToken = await getOauthAccessToken(baseUrl);
    if (oauthToken) {
      headers.Authorization = `Bearer ${oauthToken}`;
    }
  }

  const apiKey = String(process.env.BANCOLOMBIA_API_KEY || '').trim();
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const response = await fetch(endpoint, {
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
    const errorMessage = data?.message || data?.error || `Bancolombia API request failed with status ${response.status}`;
    const requestError = new Error(errorMessage);
    requestError.status = response.status;
    requestError.providerPayload = data;
    throw requestError;
  }

  return {
    transactionId: String(data?.transactionId || data?.id || '').trim(),
    status: mapProviderStatus(data?.status),
    redirectUrl: String(data?.redirectUrl || data?.paymentUrl || data?.checkoutUrl || '').trim(),
    raw: data,
  };
}

module.exports = {
  createBancolombiaPaymentOrder,
  mapProviderStatus,
};
