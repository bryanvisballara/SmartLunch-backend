import api from '../lib/api';

export const createOrder = (data) => api.post('/orders', data);
export const getOrders = (params = {}) => api.get('/orders', { params });
export const getOrderById = (id) => api.get(`/orders/${id}`);
export const requestOrderCancellation = (data) => api.post('/orders/cancel-request', data);
export const getOrderCancellationRequests = (params = {}) => api.get('/orders/cancel-requests/list', { params });
export const approveOrderCancellation = (id) => api.post(`/orders/cancel-requests/${id}/approve`);
export const rejectOrderCancellation = (id) => api.post(`/orders/cancel-requests/${id}/reject`);
export const cancelOrderDirect = (id) => api.post(`/orders/${id}/cancel`);
