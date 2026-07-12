import api from '../lib/api';

export const getEnrollmentMatriculaRequirement = () => api.get('/parent/portal/enrollment-matricula/requirement');
export const getEnrollmentMatriculaProcess = (chargeId) => api.get('/parent/portal/enrollment-matricula/process', { params: { chargeId } });
export const getEnrollmentMatriculaPendingSignatures = () => api.get('/parent/portal/enrollment-matricula/pending-signatures');
export const acknowledgeEnrollmentMatriculaIntro = (processId) => api.post(`/parent/portal/enrollment-matricula/process/${processId}/ack-intro`);
export const acceptEnrollmentMatriculaConsent = (processId, data = {}) => api.post(`/parent/portal/enrollment-matricula/process/${processId}/consent`, data);
export const confirmEnrollmentMatriculaPayment = (processId, data = {}) =>
  api.post(`/parent/portal/enrollment-matricula/process/${processId}/payment/confirm`, data);
export const getEnrollmentMatriculaPaymentStatus = (processId) => api.get(`/parent/portal/enrollment-matricula/process/${processId}/payment-status`);
export const signEnrollmentMatriculaContract = (processId, data) => api.post(`/parent/portal/enrollment-matricula/process/${processId}/sign-contract`, data);
export const signEnrollmentMatriculaPagare = (processId, data) => api.post(`/parent/portal/enrollment-matricula/process/${processId}/sign-pagare`, data);

export const createWompiMatriculaCheckout = (processId) => api.post('/payments/wompi/matricula-checkout', { processId });
export const getWompiMatriculaPaymentStatus = (params) => api.get('/payments/wompi/matricula-status', { params });
export const getRectoriaEnrollmentConsents = () => api.get('/enrollment-matricula/consents');
export const getRectoriaEnrollmentSignatures = () => api.get('/enrollment-matricula/signatures');
export const getEnrollmentMatriculaPurgeRequestsMine = () => api.get('/enrollment-matricula/purge-requests/mine');
export const getEnrollmentMatriculaPurgeRequestsPending = () => api.get('/enrollment-matricula/purge-requests/pending');
export const getEnrollmentMatriculaPurgeRequestSummary = () => api.get('/enrollment-matricula/purge-requests/summary');
export const createEnrollmentMatriculaPurgeRequest = (data = {}) => api.post('/enrollment-matricula/purge-requests', data);
export const approveEnrollmentMatriculaPurgeRequest = (requestId) =>
  api.post(`/enrollment-matricula/purge-requests/${requestId}/approve`);
export const rejectEnrollmentMatriculaPurgeRequest = (requestId, data = {}) =>
  api.post(`/enrollment-matricula/purge-requests/${requestId}/reject`, data);
export const getChargeAdjustmentRequestsPending = () =>
  api.get('/enrollment-matricula/charge-adjustment-requests/pending');
export const approveChargeAdjustmentRequest = (requestId, data = {}) =>
  api.post(`/enrollment-matricula/charge-adjustment-requests/${requestId}/approve`, data);
export const rejectChargeAdjustmentRequest = (requestId, data = {}) =>
  api.post(`/enrollment-matricula/charge-adjustment-requests/${requestId}/reject`, data);
export const downloadRectoriaEnrollmentDocumentsZip = () =>
  api.get('/enrollment-matricula/signatures/download-zip', { responseType: 'blob' });
export const downloadRectoriaEnrollmentDocument = (processId, documentType) =>
  api.get(`/enrollment-matricula/documents/${processId}/${documentType}/download`, { responseType: 'blob' });
