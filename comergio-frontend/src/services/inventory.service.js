import api from '../lib/api';

export const getInventory = (params = {}) => api.get('/inventory', { params });
export const createInventoryRequest = (data) =>
	api.post('/inventory/request', data, { timeout: 20000 });
export const applyInventoryMovement = (data) => api.post('/inventory/apply', data);
export const getInventoryRequests = (params = {}) => api.get('/inventory/requests', { params });
export const approveInventoryRequest = (id) => api.post(`/inventory/approve/${id}`);
export const rejectInventoryRequest = (id) => api.post(`/inventory/reject/${id}`);