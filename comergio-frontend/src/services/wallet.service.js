import api from '../lib/api';

export const getBalance = (studentId) => api.get(`/wallet/balance?studentId=${studentId}`);
export const getHistory = (studentId) => api.get(`/wallet/history?studentId=${studentId}`);
export const topup = (data) => api.post('/wallet/topup', data);
export const debit = (data) => api.post('/wallet/debit', data);
export const pay = (data) => api.post('/wallet/pay', data);
export const createTopupRequest = (data) => api.post('/wallet/topup-requests', data);
export const getTopupRequests = (params = {}) => api.get('/wallet/topup-requests', { params });
export const getRechargeTransactions = (params = {}) => api.get('/wallet/recharges', { params });
export const cancelRechargeTransaction = (id) => api.post(`/wallet/recharges/${id}/cancel`);
export const approveTopupRequest = (id) => api.post(`/wallet/topup-requests/${id}/approve`);
export const rejectTopupRequest = (id) => api.post(`/wallet/topup-requests/${id}/reject`);

// Backward-compatible aliases
export const createCashTopupRequest = createTopupRequest;
export const getCashTopupRequests = getTopupRequests;
export const approveCashTopupRequest = approveTopupRequest;
export const rejectCashTopupRequest = rejectTopupRequest;
