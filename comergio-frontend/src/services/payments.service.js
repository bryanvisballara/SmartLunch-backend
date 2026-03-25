import api from '../lib/api';

export const createDaviPlataPayment = (data) => api.post('/payments/daviplata', data);
export const createBoldRechargePayment = (data) => api.post('/payments/bold/recharge', data);
export const createEpaycoRechargePayment = (data) => api.post('/payments/epayco/recharge', data);
export const getEpaycoRechargeStatus = (reference) => api.get('/payments/epayco/recharge-status', { params: { reference } });
export const getBoldPseBanks = () => api.get('/payments/bold/pse-banks');
export const getBoldRechargeStatus = (reference) => api.get('/payments/bold/recharge-status', { params: { reference } });
