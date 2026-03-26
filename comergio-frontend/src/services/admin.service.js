import api from '../lib/api';

export const getAdminHomepage = (params = {}) => api.get('/stats/admin-home', { params });
export const getAiInsights = (params = {}) => api.get('/stats/ai-insights', { params });
export const askAiInsights = (data) => api.post('/stats/ai-insights/ask', data);
export const getAdminFixedCosts = (params = {}) => api.get('/admin/fixed-costs', { params });
export const createAdminFixedCost = (data) => api.post('/admin/fixed-costs', data);
export const deleteAdminFixedCost = (id) => api.delete(`/admin/fixed-costs/${id}`);
export const getAdminAccountingFees = () => api.get('/admin/accounting-fees');
export const saveAdminAccountingFees = (data) => api.put('/admin/accounting-fees', data);
export const getAdminSuppliers = () => api.get('/admin/suppliers');
export const createAdminSupplier = (data) => api.post('/admin/suppliers', data);
export const updateAdminSupplier = (id, data) => api.patch(`/admin/suppliers/${id}`, data);
export const deleteAdminSupplier = (id) => api.delete(`/admin/suppliers/${id}`);

export const getAdminCategories = () => api.get('/admin/categories');
export const createAdminCategory = (data) => api.post('/admin/categories', data);
export const updateAdminCategory = (id, data) => api.patch(`/admin/categories/${id}`, data);
export const deleteAdminCategory = (id) => api.delete(`/admin/categories/${id}`);
export const uploadAdminImage = (file, { folder = 'products', preferredName = '' } = {}) => {
	const formData = new FormData();
	formData.append('image', file);
	formData.append('folder', folder);
	if (preferredName) {
		formData.append('preferredName', preferredName);
	}

	return api.post('/admin/uploads/image', formData, {
		headers: {
			'Content-Type': 'multipart/form-data',
		},
	});
};

export const getAdminStores = () => api.get('/admin/stores');
export const getAdminProducts = (params = {}) => api.get('/admin/products', { params });
export const createAdminStore = (data) => api.post('/admin/stores', data);
export const updateAdminStore = (id, data) => api.patch(`/admin/stores/${id}`, data);
export const deleteAdminStore = (id) => api.delete(`/admin/stores/${id}`);

export const getAdminUsers = (params = {}) => api.get('/admin/users', { params });
export const createAdminUser = (data) => api.post('/admin/users', data);
export const updateAdminUser = (id, data) => api.patch(`/admin/users/${id}`, data);
export const deleteAdminUser = (id) => api.delete(`/admin/users/${id}`);
export const getDeletedAccountsForAdmin = () => api.get('/admin/deleted-accounts');
export const getDeletedStudentOrdersForAdmin = (parentId, studentId) =>
	api.get(`/admin/deleted-accounts/${parentId}/students/${studentId}/orders`);
export const getDeletedStudentRechargesForAdmin = (parentId, studentId) =>
	api.get(`/admin/deleted-accounts/${parentId}/students/${studentId}/recharges`);
export const permanentlyDeleteDeletedAccount = (parentId) => api.delete(`/admin/deleted-accounts/${parentId}/permanent`);

export const createAdminStudent = (data) => api.post('/admin/students', data);
export const importAdminLegacyStudents = (data) => api.post('/admin/students/import-legacy', data);
export const importAdminLegacyParents = (data) => api.post('/admin/users/import-legacy-parents', data);
export const createAdminProduct = (data) => api.post('/admin/products', data);
export const updateAdminStudent = (id, data) => api.patch(`/admin/students/${id}`, data);
export const updateAdminProduct = (id, data) => api.patch(`/admin/products/${id}`, data);
export const deleteAdminStudent = (id) => api.delete(`/admin/students/${id}`);
export const deleteAdminProduct = (id) => api.delete(`/admin/products/${id}`);

export const getParentStudentLinks = () => api.get('/admin/links');
export const createParentStudentLink = (data) => api.post('/admin/links', data);

export const getMeriendaSubscriptions = () => api.get('/meriendas/subscriptions');
export const getMeriendaWaitlist = () => api.get('/meriendas/waitlist');

export const getMeriendaFailedPayments = () => api.get('/meriendas/failed-payments');
export const updateMeriendaFailedPayment = (id, data) => api.patch(`/meriendas/failed-payments/${id}`, data);

export const getMeriendaSnacks = () => api.get('/meriendas/snacks');
export const createMeriendaSnack = (data) => api.post('/meriendas/snacks', data);
export const updateMeriendaSnack = (id, data) => api.patch(`/meriendas/snacks/${id}`, data);

export const getMeriendaSchedule = (month) => api.get('/meriendas/schedule', { params: { month } });
export const saveMeriendaSchedule = (month, data) => api.put(`/meriendas/schedule/${month}`, data);

export const getMeriendaOperations = (month) => api.get(`/meriendas/operations/${month}`);
export const saveMeriendaSubscriptionMonthlyCost = (month, data) =>
	api.put(`/meriendas/operations/${month}/subscription-cost`, data);
export const addMeriendaFixedCost = (month, data) => api.post(`/meriendas/operations/${month}/fixed-costs`, data);
export const addMeriendaVariableCost = (month, data) => api.post(`/meriendas/operations/${month}/variable-costs`, data);
export const deleteMeriendaFixedCost = (month, costId) => api.delete(`/meriendas/operations/${month}/fixed-costs/${costId}`);
export const deleteMeriendaVariableCost = (month, costId) => api.delete(`/meriendas/operations/${month}/variable-costs/${costId}`);
export const getMeriendaOperationsHistory = () => api.get('/meriendas/operations-history');
export const getMeriendaIntakeHistory = (params = {}) => api.get('/meriendas/operator/intake-history', { params });
