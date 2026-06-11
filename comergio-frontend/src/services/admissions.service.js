import api from '../lib/api';

const basePath = '/academic-secretary/admissions';

export const getAdmissions = (params = {}) => api.get(basePath, { params });
export const getAdmissionApplicant = (applicantId) => api.get(`${basePath}/${applicantId}`);
export const createAdmissionApplicant = (data) => api.post(basePath, data);
export const updateAdmissionApplicant = (applicantId, data) => api.patch(`${basePath}/${applicantId}`, data);
export const deleteAdmissionApplicant = (applicantId) => api.delete(`${basePath}/${applicantId}`);
export const setAdmissionStage = (applicantId, stageKey, data = {}) => api.patch(`${basePath}/${applicantId}/stages/${stageKey}`, data);
export const transitionAdmissionStage = (applicantId, data) => api.patch(`${basePath}/${applicantId}/stage-transition`, data);
export const finalizeAdmissionEnrollment = (applicantId, data = {}) => api.patch(`${basePath}/${applicantId}/finalize`, data);
export const createAdmissionEvent = (applicantId, data) => api.post(`${basePath}/${applicantId}/events`, data);
export const updateAdmissionEvent = (applicantId, eventId, data) => api.patch(`${basePath}/${applicantId}/events/${eventId}`, data);
export const deleteAdmissionEvent = (applicantId, eventId) => api.delete(`${basePath}/${applicantId}/events/${eventId}`);
export const uploadAdmissionMarketingImage = (file) => {
  const formData = new FormData();
  formData.append('files', file);
  return api.post(`${basePath}/marketing/uploads/image`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
export const getAdmissionMarketingHistory = () => api.get(`${basePath}/marketing/history`);
export const sendAdmissionMarketingCampaign = (data) => api.post(`${basePath}/marketing/send`, data, { timeout: 120000 });
export const uploadAdmissionDocuments = (applicantId, { files = [], type = 'otro', note = '', clientVisible = false } = {}) => {
  const formData = new FormData();
  Array.from(files || []).forEach((file) => formData.append('files', file));
  formData.append('type', type);
  formData.append('note', note);
  formData.append('clientVisible', String(Boolean(clientVisible)));
  return api.post(`${basePath}/${applicantId}/documents`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
export const updateAdmissionDocument = (applicantId, documentId, data) => api.patch(`${basePath}/${applicantId}/documents/${documentId}`, data);
export const deleteAdmissionDocument = (applicantId, documentId) => api.delete(`${basePath}/${applicantId}/documents/${documentId}`);
