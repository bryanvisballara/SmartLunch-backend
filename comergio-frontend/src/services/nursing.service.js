import api from '../lib/api';

export const searchNursingStudents = (params = {}) => api.get('/nursing/students', { params });
export const getNursingStudentHistory = (studentId) => api.get(`/nursing/students/${studentId}/history`);
export const createNursingVisit = (data) => api.post('/nursing/visits', data);
export const getNursingSummary = () => api.get('/nursing/summary');
export const getParentNursingRecords = (params = {}) => api.get('/nursing/parent/records', { params });
export const getNursingStudentMedicalProfileHistory = (studentId, params = {}) =>
  api.get(`/nursing/students/${studentId}/medical-profile/history`, { params });
export const getNursingMedicalProfileSignatures = (params = {}) =>
  api.get('/nursing/medical-profile-signatures', { params });

export const uploadNursingVisitImage = (file, preferredName = '') => {
  const formData = new FormData();
  formData.append('image', file);
  if (preferredName) {
    formData.append('preferredName', preferredName);
  }
  return api.post('/nursing/uploads/image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
