import api from '../lib/api';

export const getEnrollmentMatriculaProcess = (chargeId) => api.get('/parent/portal/enrollment-matricula/process', { params: { chargeId } });
export const getEnrollmentMatriculaPendingSignatures = () => api.get('/parent/portal/enrollment-matricula/pending-signatures');
export const acknowledgeEnrollmentMatriculaIntro = (processId) => api.post(`/parent/portal/enrollment-matricula/process/${processId}/ack-intro`);
export const acceptEnrollmentMatriculaConsent = (processId, data = {}) => api.post(`/parent/portal/enrollment-matricula/process/${processId}/consent`, data);
export const confirmEnrollmentMatriculaPayment = (processId, data = {}) =>
  api.post(`/parent/portal/enrollment-matricula/process/${processId}/payment/confirm`, data);
export const getEnrollmentMatriculaPaymentStatus = (processId) => api.get(`/parent/portal/enrollment-matricula/process/${processId}/payment-status`);
export const signEnrollmentMatriculaContract = (processId, data) => api.post(`/parent/portal/enrollment-matricula/process/${processId}/sign-contract`, data);
export const signEnrollmentMatriculaPagare = (processId, data) => api.post(`/parent/portal/enrollment-matricula/process/${processId}/sign-pagare`, data);

export const getRectoriaEnrollmentConsents = () => api.get('/enrollment-matricula/consents');
export const getRectoriaEnrollmentSignatures = () => api.get('/enrollment-matricula/signatures');
export const downloadRectoriaEnrollmentDocument = (processId, documentType) =>
  api.get(`/enrollment-matricula/documents/${processId}/${documentType}/download`, { responseType: 'blob' });
