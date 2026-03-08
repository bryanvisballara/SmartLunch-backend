import api from '../lib/api';

export const getProducts = (params = {}) => api.get('/products', { params });
export const getInventory = (params = {}) => api.get('/inventory', { params });
