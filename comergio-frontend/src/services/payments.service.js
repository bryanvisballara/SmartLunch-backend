import api from '../lib/api';

export const createDaviPlataPayment = (data) => api.post('/payments/daviplata', data);
export const createBoldRechargePayment = (data) => api.post('/payments/bold/recharge', data);
