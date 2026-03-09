function normalizeUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function getAccessToken() {
  return String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
}

function getApiBaseUrl() {
  return normalizeUrl(process.env.MERCADOPAGO_API_URL) || 'https://api.mercadopago.com';
}

function isMercadoPagoConfigured() {
  return Boolean(getAccessToken());
}

async function mercadopagoRequest(path, { method = 'GET', body = null, extraHeaders = {} } = {}) {
  const accessToken = getAccessToken();
  if (!accessToken) {
    throw new Error('MERCADOPAGO_ACCESS_TOKEN is not configured');
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
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
    const message = data?.message || data?.error || `Mercado Pago request failed (${response.status})`;
    const requestError = new Error(message);
    requestError.status = response.status;
    requestError.providerPayload = data;
    throw requestError;
  }

  return data;
}

async function findOrCreateCustomer({ email, firstName, lastName, externalReference }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error('Mercado Pago customer email is required');
  }

  const search = await mercadopagoRequest(`/v1/customers/search?email=${encodeURIComponent(normalizedEmail)}`);
  const existing = Array.isArray(search?.results) ? search.results[0] : null;
  if (existing?._id || existing?.id) {
    return existing;
  }

  return mercadopagoRequest('/v1/customers', {
    method: 'POST',
    body: {
      email: normalizedEmail,
      first_name: String(firstName || '').trim(),
      last_name: String(lastName || '').trim(),
      external_reference: String(externalReference || '').trim(),
    },
  });
}

async function createCardToken({ cardNumber, expirationMonth, expirationYear, securityCode, cardholder }) {
  return mercadopagoRequest('/v1/card_tokens', {
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

async function createCustomerCard({ customerId, cardToken }) {
  return mercadopagoRequest(`/v1/customers/${encodeURIComponent(String(customerId))}/cards`, {
    method: 'POST',
    body: {
      token: String(cardToken || '').trim(),
    },
  });
}

async function deleteCustomerCard({ customerId, cardId }) {
  return mercadopagoRequest(`/v1/customers/${encodeURIComponent(String(customerId))}/cards/${encodeURIComponent(String(cardId))}`, {
    method: 'DELETE',
  });
}

function toInternalStatus(providerStatus) {
  const normalized = String(providerStatus || '').toLowerCase();
  if (normalized === 'approved') return 'approved';
  if (normalized === 'rejected' || normalized === 'cancelled') return 'rejected';
  if (normalized === 'failed') return 'failed';
  return 'pending';
}

async function createPayment({ amount, paymentMethodId, customerId, cardId, externalReference, description, idempotencyKey, deviceId }) {
  const headers = {};
  if (idempotencyKey) {
    headers['X-Idempotency-Key'] = String(idempotencyKey).trim();
  }
  if (deviceId) {
    headers['X-meli-session-id'] = String(deviceId).trim();
  }

  return mercadopagoRequest('/v1/payments', {
    method: 'POST',
    extraHeaders: headers,
    body: {
      transaction_amount: Number(amount),
      payment_method_id: String(paymentMethodId || '').trim(),
      card_id: String(cardId || '').trim(),
      installments: 1,
      description: String(description || 'Recarga automatica SmartLunch').trim(),
      payer: {
        type: 'customer',
        id: String(customerId || '').trim(),
      },
      external_reference: String(externalReference || '').trim(),
    },
  });
}

async function getPaymentById(paymentId) {
  return mercadopagoRequest(`/v1/payments/${encodeURIComponent(String(paymentId || '').trim())}`);
}

module.exports = {
  isMercadoPagoConfigured,
  findOrCreateCustomer,
  createCardToken,
  createCustomerCard,
  deleteCustomerCard,
  toInternalStatus,
  createPayment,
  getPaymentById,
};
