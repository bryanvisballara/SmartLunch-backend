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

async function getCustomerCard({ customerId, cardId }) {
  return mercadopagoRequest(`/v1/customers/${encodeURIComponent(String(customerId))}/cards/${encodeURIComponent(String(cardId))}`);
}

async function createPreapproval({
  reason,
  externalReference,
  payerEmail,
  backUrl,
  currencyId = 'COP',
  transactionAmount,
  frequency = 1,
  frequencyType = 'months',
  startDate,
  endDate,
}) {
  return mercadopagoRequest('/preapproval', {
    method: 'POST',
    body: {
      reason: String(reason || 'Recarga automatica Comergio').trim(),
      external_reference: String(externalReference || '').trim(),
      payer_email: String(payerEmail || '').trim().toLowerCase(),
      back_url: String(backUrl || '').trim(),
      auto_recurring: {
        frequency: Math.max(1, Number(frequency || 1)),
        frequency_type: String(frequencyType || 'months').trim().toLowerCase(),
        transaction_amount: Number(transactionAmount || 0),
        currency_id: String(currencyId || 'COP').trim().toUpperCase(),
        ...(startDate ? { start_date: String(startDate).trim() } : {}),
        ...(endDate ? { end_date: String(endDate).trim() } : {}),
      },
      status: 'pending',
    },
  });
}

async function getPreapproval(preapprovalId) {
  return mercadopagoRequest(`/preapproval/${encodeURIComponent(String(preapprovalId || '').trim())}`);
}

async function cancelPreapproval(preapprovalId) {
  return mercadopagoRequest(`/preapproval/${encodeURIComponent(String(preapprovalId || '').trim())}`, {
    method: 'PUT',
    body: {
      status: 'cancelled',
    },
  });
}

function toInternalStatus(providerStatus) {
  const normalized = String(providerStatus || '').toLowerCase();
  if (normalized === 'approved' || normalized === 'authorized') return 'approved';
  if (normalized === 'rejected' || normalized === 'cancelled') return 'rejected';
  if (normalized === 'failed') return 'failed';
  return 'pending';
}

async function createAuthorizedPayment({ preapprovalId, amount, externalReference, description, idempotencyKey }) {
  const headers = {};
  if (idempotencyKey) {
    headers['X-Idempotency-Key'] = String(idempotencyKey).trim();
  }

  const requestBody = {
    preapproval_id: String(preapprovalId || '').trim(),
    reason: String(description || 'Recarga automatica Comergio').trim(),
    external_reference: String(externalReference || '').trim(),
    transaction_amount: Number(amount),
  };

  try {
    return await mercadopagoRequest('/authorized_payments', {
      method: 'POST',
      extraHeaders: headers,
      body: requestBody,
    });
  } catch (error) {
    const isNotFound = Number(error?.status || 0) === 404
      || String(error?.providerPayload?.error || '').toLowerCase() === 'resource not found';

    if (!isNotFound) {
      throw error;
    }

    return mercadopagoRequest('/v1/authorized_payments', {
      method: 'POST',
      extraHeaders: headers,
      body: requestBody,
    });
  }
}

async function createPayment({ amount, paymentMethodId, paymentMethodReferenceId, preapprovalId, customerId, issuerId, externalReference, description, idempotencyKey, deviceId }) {
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
      payment_method_id: String(paymentMethodId || '').trim() || undefined,
      issuer_id: issuerId ? String(issuerId).trim() : undefined,
      payment_method_reference_id: Number.isFinite(Number(paymentMethodReferenceId))
        ? Number(paymentMethodReferenceId)
        : undefined,
      preapproval_id: String(preapprovalId || '').trim() || undefined,
      installments: 1,
      description: String(description || 'Recarga automatica Comergio').trim(),
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
  getCustomerCard,
  createPreapproval,
  getPreapproval,
  cancelPreapproval,
  toInternalStatus,
  createPayment,
  createAuthorizedPayment,
  getPaymentById,
};
