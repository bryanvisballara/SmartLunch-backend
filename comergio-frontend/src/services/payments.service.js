import api from '../lib/api';

export const createDaviPlataPayment = (data) => api.post('/payments/daviplata', data);
