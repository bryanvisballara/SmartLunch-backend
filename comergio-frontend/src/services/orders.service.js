import api, { getApiBaseUrl } from '../lib/api';

export const createOrder = (data) => api.post('/orders', data);
export const getOrders = (params = {}) => api.get('/orders', { params });
export const getComanderaOrders = (params = {}) => api.get('/orders/comandera', { params });
export const dispatchOrder = (id) => api.post(`/orders/${id}/dispatch`);

export async function subscribeComanderaOrders({ storeId, onSnapshot, signal } = {}) {
  const token = localStorage.getItem('token');
  const params = new URLSearchParams();
  if (storeId) {
    params.set('storeId', storeId);
  }

  const response = await fetch(`${getApiBaseUrl()}/orders/comandera/stream?${params.toString()}`, {
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
      Accept: 'text/event-stream',
    },
    signal,
  });

  if (!response.ok || !response.body) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `No se pudo abrir la comandera en vivo (${response.status || 0})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() || '';

    for (const chunk of chunks) {
      const data = chunk
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('');
      if (!data) {
        continue;
      }
      try {
        onSnapshot?.(JSON.parse(data));
      } catch {
        // Ignore malformed stream chunks and wait for the next snapshot.
      }
    }
  }
}

export const getOrderById = (id) => api.get(`/orders/${id}`);
export const requestOrderCancellation = (data) => api.post('/orders/cancel-request', data);
export const getOrderCancellationRequests = (params = {}) => api.get('/orders/cancel-requests/list', { params });
export const approveOrderCancellation = (id) => api.post(`/orders/cancel-requests/${id}/approve`);
export const rejectOrderCancellation = (id) => api.post(`/orders/cancel-requests/${id}/reject`);
export const cancelOrderDirect = (id) => api.post(`/orders/${id}/cancel`);
export const markSchoolBillingCollected = (id) => api.post(`/orders/${id}/school-billing/collect`);
export const getSchoolBillingStatements = (params = {}) => api.get('/orders/school-billing/statements', { params });
export const createSchoolBillingStatement = (data) => api.post('/orders/school-billing/statements', data);
export const createConsolidatedSchoolBillingStatement = (data) => api.post('/orders/school-billing/statements/consolidated', data);
export const backfillSchoolBillingStatements = () => api.post('/orders/school-billing/statements/backfill');
export const rebuildSchoolBillingStatementsFromCollectionDates = (data = {}) => api.post('/orders/school-billing/statements/rebuild-from-collection-dates', data);
export const getSchoolBillingStatementDocument = (statementId) => api.get(`/orders/school-billing/statements/${statementId}/document`, { responseType: 'text' });
