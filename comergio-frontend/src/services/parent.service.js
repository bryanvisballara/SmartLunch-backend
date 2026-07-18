import api from '../lib/api';

export const getParentPortalOverview = (params = {}) => api.get('/parent/portal/overview', { params });
export const getParentAcademicFeed = (params = {}) => api.get('/parent/portal/academic-feed', { params });
export const toggleParentAcademicFeedLike = (communicationId) => api.post(`/parent/portal/academic-feed/${communicationId}/like`);
export const createParentAcademicFeedComment = (communicationId, data) => api.post(`/parent/portal/academic-feed/${communicationId}/comments`, data);
export const deleteParentAcademicFeedComment = (communicationId, commentId) => api.delete(`/parent/portal/academic-feed/${communicationId}/comments/${commentId}`);
export const toggleParentAcademicFeedCommentLike = (communicationId, commentId) => api.post(`/parent/portal/academic-feed/${communicationId}/comments/${commentId}/like`);
export const getParentAcademicCalendar = (params = {}) => api.get('/parent/portal/academic-calendar', { params });
export const getParentAcademicAttendance = (params = {}) => api.get('/parent/portal/academic-attendance', { params });
export const getParentAssignments = (params = {}) => api.get('/parent/portal/assignments', { params });
export const getParentAssignmentDetail = (assignmentId, params = {}) =>
	api.get(`/parent/portal/assignments/${assignmentId}`, { params });
export const getParentAcademicBilling = (params = {}) => api.get('/parent/portal/academic-billing', { params });
export const payParentAcademicCharge = (chargeId, data = {}) => api.post(`/parent/portal/academic-billing/charges/${chargeId}/pay`, data);
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
export const uploadCommunityPublicationMedia = (files = []) => {
	const formData = new FormData();
	Array.from(files || []).forEach((file, index) => {
		const fileName = String(file?.name || `media-${Date.now()}-${index}.bin`);
		formData.append('files', file, fileName);
	});
	return api.post('/parent/portal/community-publications/media', formData, {
		headers: { 'Content-Type': 'multipart/form-data' },
	}).then((response) => response.data);
};
export const createCommunityPublication = (data) =>
	api.post('/parent/portal/community-publications', data).then((response) => response.data);
export const updateParentPortalStudentAutoDebit = (studentId, data) =>
	api.patch(`/parent/portal/students/${studentId}/auto-debit`, data);
export const createParentCardPaymentMethod = (data) => api.post('/parent/portal/payment-methods/cards', data);
export const requestParentCardVerification = (cardId, data = {}) =>
	api.post(`/parent/portal/payment-methods/cards/${cardId}/verification/request`, data);
export const confirmParentCardVerification = (cardId, data = {}) =>
	api.post(`/parent/portal/payment-methods/cards/${cardId}/verification/confirm`, data);
export const deleteParentCardPaymentMethod = (cardId, params = {}) =>
	api.delete(`/parent/portal/payment-methods/cards/${cardId}`, { params });
export const getParentStudentMedicalProfile = (studentId) =>
	api.get(`/parent/portal/children/${studentId}/medical-profile`);
export const updateParentStudentMedicalProfile = (studentId, data) =>
	api.patch(`/parent/portal/children/${studentId}/medical-profile`, data);
export const getParentStudentMedicalProfileHistory = (studentId, params = {}) =>
	api.get(`/parent/portal/children/${studentId}/medical-profile/history`, { params });
