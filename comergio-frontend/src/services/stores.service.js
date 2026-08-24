import api from '../lib/api';

export const getStores = (params) => api.get('/stores', { params });
export const updateStoreComandera = (storeId, data) => api.patch(`/stores/${storeId}/comandera`, data);
