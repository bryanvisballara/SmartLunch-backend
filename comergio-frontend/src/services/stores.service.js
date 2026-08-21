import api from '../lib/api';

export const getStores = () => api.get('/stores');
export const updateStoreComandera = (storeId, data) => api.patch(`/stores/${storeId}/comandera`, data);
