import api from '../lib/api';

export const getHrDashboard = () => api.get('/hr/dashboard');
export const getHrSupplyItems = (params = {}) => api.get('/hr/items', { params });
export const createHrSupplyItem = (data) => api.post('/hr/items', data);
export const updateHrSupplyItem = (itemId, data) => api.patch(`/hr/items/${itemId}`, data);
export const getHrPlannerCycles = (params = {}) => api.get('/hr/planner-cycles', { params });
export const createHrPlannerCycle = (data) => api.post('/hr/planner-cycles', data);
export const updateHrPlannerCycle = (cycleId, data) => api.patch(`/hr/planner-cycles/${cycleId}`, data);
export const deleteHrPlannerCycle = (cycleId) => api.delete(`/hr/planner-cycles/${cycleId}`);
export const getHrSupplyRequests = (params = {}) => api.get('/hr/requests', { params });
export const getHrCoordinationPlannerRequests = (params = {}) => api.get('/hr/coordination/planner-requests', { params });
export const createHrSupplyRequest = (data) => api.post('/hr/requests', data);
export const consolidateHrPlannerRequests = (data) => api.post('/hr/coordination/consolidate', data);
export const submitHrSupplyRequestForApproval = (requestId, data = {}) => api.post(`/hr/requests/${requestId}/submit-approval`, data);
export const acceptHrPurchasingRequest = (requestId, data = {}) => api.post(`/hr/requests/${requestId}/purchasing-accept`, data);
export const approveHrSupplyRequest = (requestId, data = {}) => api.post(`/hr/requests/${requestId}/approve`, data);
export const rejectHrSupplyRequest = (requestId, data = {}) => api.post(`/hr/requests/${requestId}/reject`, data);
export const deliverHrSupplyRequest = (requestId, data = {}) => api.post(`/hr/requests/${requestId}/deliver`, data);
