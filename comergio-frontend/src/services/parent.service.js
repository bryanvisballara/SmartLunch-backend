import api from '../lib/api';

export const getParentPortalOverview = (params = {}) => api.get('/parent/portal/overview', { params });
export const getParentPortalCategories = () => api.get('/parent/portal/categories');
export const getParentPortalOrdersHistory = (params = {}) => api.get('/parent/portal/orders-history', { params });
export const getParentCardPaymentMethods = (params = {}) => api.get('/parent/portal/payment-methods/cards', { params });
export const getParentMeriendasPortal = (params = {}) => api.get('/parent/portal/meriendas', { params });
export const subscribeParentMeriendas = (data) => api.post('/parent/portal/meriendas/subscribe', data);
export const updateParentMeriendasSubscription = (subscriptionId, data) =>
	api.patch(`/parent/portal/meriendas/subscription/${subscriptionId}`, data);
export const cancelParentMeriendasSubscription = (subscriptionId, params = {}) =>
	api.delete(`/parent/portal/meriendas/subscription/${subscriptionId}`, { params });
export const addToMeriendasWaitlist = () => api.post('/parent/portal/meriendas/waitlist');
export const askParentGioIaChat = (data) => api.post('/parent/portal/gio-ia/chat', data);
export const updateParentPortalStudentBlock = (studentId, data) => api.patch(`/parent/portal/students/${studentId}/blocks`, data);
export const updateParentPortalStudentDailyLimit = (studentId, data) =>
	api.patch(`/parent/portal/students/${studentId}/daily-limit`, data);
export const updateParentPortalStudentGrade = (studentId, data) =>
	api.patch(`/parent/portal/students/${studentId}/grade`, data);
export const uploadParentPortalStudentPhoto = (studentId, formData) =>
	api.post(`/parent/portal/students/${studentId}/photo`, formData, {
		headers: { 'Content-Type': 'multipart/form-data' },
	});
export const updateParentPortalStudentAutoDebit = (studentId, data) =>
	api.patch(`/parent/portal/students/${studentId}/auto-debit`, data);
export const createParentCardPaymentMethod = (data) => api.post('/parent/portal/payment-methods/cards', data);
export const requestParentCardVerification = (cardId, data = {}) =>
	api.post(`/parent/portal/payment-methods/cards/${cardId}/verification/request`, data);
export const confirmParentCardVerification = (cardId, data = {}) =>
	api.post(`/parent/portal/payment-methods/cards/${cardId}/verification/confirm`, data);
export const deleteParentCardPaymentMethod = (cardId, params = {}) =>
	api.delete(`/parent/portal/payment-methods/cards/${cardId}`, { params });
