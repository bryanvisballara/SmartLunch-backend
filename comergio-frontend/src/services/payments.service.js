import api from '../lib/api';

export const createDaviPlataPayment = (data) => api.post('/payments/daviplata', data);
export const createBoldRechargePayment = (data) => api.post('/payments/bold/recharge', data);
export const getBoldPseBanks = () => api.get('/payments/bold/pse-banks');
export const getBoldRechargeStatus = (reference) => api.get('/payments/bold/recharge-status', { params: { reference } });
