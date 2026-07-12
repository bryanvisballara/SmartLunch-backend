import api from '../lib/api';

const DASHBOARD_HEAVY_REQUEST_TIMEOUT_MS = 45000;

export const getAcademicSecretaryBootstrap = () => api.get('/academic-secretary/bootstrap', {
	timeout: DASHBOARD_HEAVY_REQUEST_TIMEOUT_MS,
});
export const getAcademicSecretaryBilling = () => api.get('/academic-secretary/billing');
export const getAcademicSecretaryBillingPayments = (params = {}) => api.get('/academic-secretary/billing/payments', { params });
export const requestAcademicSecretaryBillingPaymentDeletion = (paymentId) =>
  api.post(`/academic-secretary/billing/payments/${paymentId}/deletion-request`);
export const getAcademicSecretaryFeeSettings = () => api.get('/academic-secretary/fee-settings');
export const saveAcademicSecretaryFeeSettings = (data) => api.put('/academic-secretary/fee-settings', data);
export const getAcademicSecretaryCommunicationRequests = () => api.get('/academic-secretary/communication-requests');
export const getAcademicSecretaryDatabase = () => api.get('/academic-secretary/database');
export const updateAcademicSecretaryDatabaseRow = (studentId, data) => api.patch(`/academic-secretary/database/${studentId}`, data);
export const generateAcademicSecretaryAiCopy = (data) => api.post('/academic-secretary/communications/ai-copy', data);
export const importAcademicSecretaryDatabase = (file) => {
	const formData = new FormData();
	formData.append('file', file);

	return api.post('/academic-secretary/database/import', formData, {
		headers: {
			'Content-Type': 'multipart/form-data',
		},
	});
};
export const requestAcademicSecretaryGradePromotion = () => api.post('/academic-secretary/database/promotions/request');
export const createAcademicSecretaryCommunicationAuthor = (data) => api.post('/academic-secretary/communication-authors', data);
export const updateAcademicSecretaryCommunicationAuthor = (authorId, data) => api.put(`/academic-secretary/communication-authors/${authorId}`, data);
export const deleteAcademicSecretaryCommunicationAuthor = (authorId) => api.delete(`/academic-secretary/communication-authors/${authorId}`);
export const createAcademicSecretaryCommunication = (data) => api.post('/academic-secretary/communications', data, {
	timeout: DASHBOARD_HEAVY_REQUEST_TIMEOUT_MS,
});
export const updateAcademicSecretaryCommunication = (communicationId, data) => api.put(`/academic-secretary/communications/${communicationId}`, data, {
	timeout: DASHBOARD_HEAVY_REQUEST_TIMEOUT_MS,
});
export const deleteAcademicSecretaryCommunication = (communicationId) => api.delete(`/academic-secretary/communications/${communicationId}`);
export const deleteAcademicSecretaryCommunicationComment = (communicationId, commentId) => api.delete(`/academic-secretary/communications/${communicationId}/comments/${commentId}`);
export const uploadAcademicSecretaryCommunicationImage = (file, { preferredName = '' } = {}) => {
	const formData = new FormData();
	formData.append('image', file);
	if (preferredName) {
		formData.append('preferredName', preferredName);
	}

	return api.post('/academic-secretary/communications/uploads/image', formData, {
		headers: {
			'Content-Type': 'multipart/form-data',
		},
		timeout: DASHBOARD_HEAVY_REQUEST_TIMEOUT_MS,
	});
};
export const uploadAcademicSecretaryCommunicationFeedImage = (file, options = {}) =>
	uploadAcademicSecretaryCommunicationImage(file, options);
export const uploadAcademicSecretaryCommunicationMedia = (file, { preferredName = '' } = {}) => {
	const formData = new FormData();
	formData.append('file', file);
	if (preferredName) {
		formData.append('preferredName', preferredName);
	}

	return api.post('/academic-secretary/communications/uploads/media', formData, {
		headers: {
			'Content-Type': 'multipart/form-data',
		},
		timeout: DASHBOARD_HEAVY_REQUEST_TIMEOUT_MS,
	});
};
export const approveAcademicSecretaryCommunicationRequest = (requestId, data) => api.post(`/academic-secretary/communication-requests/${requestId}/approve`, data);
export const rejectAcademicSecretaryCommunicationRequest = (requestId, data) => api.post(`/academic-secretary/communication-requests/${requestId}/reject`, data);
export const createAcademicSecretaryEnrollment = (data) => api.post('/academic-secretary/enrollments', data);
export const getAcademicSecretarySchoolRoutes = () => api.get('/campus/school-route/configuration');
export const addAcademicSecretarySchoolRouteStop = (driverUserId, data) => api.post('/campus/school-route/stops', { ...data, driverUserId });
export const updateAcademicSecretarySchoolRouteStop = (driverUserId, stopId, data) => api.patch(`/campus/school-route/stops/${stopId}`, { ...data, driverUserId });
export const removeAcademicSecretarySchoolRouteStop = (driverUserId, stopId) => api.delete(`/campus/school-route/stops/${stopId}`, { data: { driverUserId } });
export const createAcademicSecretaryCharge = (data) => api.post('/academic-secretary/billing/charges', data);
export const registerAcademicSecretaryChargePayment = (chargeId, data) => api.post(`/academic-secretary/billing/charges/${chargeId}/pay`, data);
export const updateAcademicSecretaryPensionDiscount = (studentId, data) => api.patch(`/academic-secretary/billing/students/${studentId}/pension-discount`, data);
export const createAcademicSecretaryChargeAdjustmentRequest = (data) => api.post('/academic-secretary/billing/charge-adjustment-requests', data);
export const sendAcademicSecretaryReminder = (data) => api.post('/academic-secretary/billing/reminders', data);
export const createAcademicSecretaryBillingFollowUp = (data) => api.post('/academic-secretary/billing/follow-ups', data);
export const createAcademicManagementLevel = (data) => api.post('/academic-secretary/academic-management/levels', data);
export const updateAcademicManagementLevelName = (levelKey, data) => api.patch(`/academic-secretary/academic-management/levels/${encodeURIComponent(levelKey)}`, data);
export const createAcademicManagementSubject = (data) => api.post('/academic-secretary/academic-management/subjects', data);
export const updateAcademicManagementSubject = (subjectKey, data) => api.patch(`/academic-secretary/academic-management/subjects/${encodeURIComponent(subjectKey)}`, data);
export const createAcademicManagementGrade = (data) => api.post('/academic-secretary/academic-management/grades', data);
export const updateAcademicManagementGradeName = (gradeKey, data) => api.patch(`/academic-secretary/academic-management/grades/${encodeURIComponent(gradeKey)}`, data);
export const updateAcademicManagementGradeLevel = (gradeKey, data) => api.patch(`/academic-secretary/academic-management/grades/${encodeURIComponent(gradeKey)}/level`, data);
export const updateAcademicManagementSubjectGrades = (subjectKey, data) => api.put(`/academic-secretary/academic-management/subjects/${encodeURIComponent(subjectKey)}/grades`, data);
export const createAcademicManagementCourse = (data) => api.post('/academic-secretary/academic-management/courses', data);
export const createAcademicCalendarAssignment = (data) => api.post('/academic-secretary/academic-management/assignments', data);
export const archiveAcademicCalendarAssignment = (assignmentId) => api.patch(`/academic-secretary/academic-management/assignments/${assignmentId}/archive`);
export const updateAcademicManagementCourseName = (courseKey, data) => api.patch(`/academic-secretary/academic-management/courses/${encodeURIComponent(courseKey)}`, data);
export const updateAcademicManagementCourseHeadroomTeacher = (courseKey, data) => api.patch(`/academic-secretary/academic-management/courses/${encodeURIComponent(courseKey)}/headroom-teacher`, data);
export const deleteAcademicManagementLevel = (levelKey, data) => api.delete(`/academic-secretary/academic-management/levels/${encodeURIComponent(levelKey)}`, { data });
export const deleteAcademicManagementSubject = (subjectKey, data) => api.delete(`/academic-secretary/academic-management/subjects/${encodeURIComponent(subjectKey)}`, { data });
export const deleteAcademicManagementGrade = (gradeKey, data) => api.delete(`/academic-secretary/academic-management/grades/${encodeURIComponent(gradeKey)}`, { data });
export const deleteAcademicManagementCourse = (courseKey, data) => api.delete(`/academic-secretary/academic-management/courses/${encodeURIComponent(courseKey)}`, { data });
export const saveAcademicManagementPeriods = (data) => api.put('/academic-secretary/academic-management/periods', data);
export const saveAcademicManagementScheduleSettings = (data) => api.put('/academic-secretary/academic-management/schedule-settings', data);
export const saveAcademicManagementScheduleBreaks = (data) => api.put('/academic-secretary/academic-management/schedule-breaks', data);
export const saveAcademicManagementTeachingAvailability = (data) => api.put('/academic-secretary/academic-management/teaching-availability', data);
export const saveAcademicManagementSubjectLoadTemplates = (data) => api.put('/academic-secretary/academic-management/subject-load-templates', data);
export const saveAcademicManagementScheduleLoad = (gradeKey, data) => api.put(`/academic-secretary/academic-management/schedules/${encodeURIComponent(gradeKey)}/load`, data);
export const saveAcademicManagementWeeklySchedule = (gradeKey, data) => api.put(`/academic-secretary/academic-management/schedules/${encodeURIComponent(gradeKey)}/weekly`, data);
export const generateAcademicManagementWeeklySchedule = (gradeKey, data) => api.post(`/academic-secretary/academic-management/schedules/${encodeURIComponent(gradeKey)}/generate`, data);
export const assignAcademicManagementStudentCourse = (studentId, data) => api.patch(`/academic-secretary/academic-management/students/${studentId}/course`, data);