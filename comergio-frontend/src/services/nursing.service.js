import api from '../lib/api';

export const searchNursingStudents = (params = {}) => api.get('/nursing/students', { params });
export const getNursingStudentHistory = (studentId) => api.get(`/nursing/students/${studentId}/history`);
export const createNursingVisit = (data) => api.post('/nursing/visits', data);
export const getParentNursingRecords = (params = {}) => api.get('/nursing/parent/records', { params });
export const getNursingStudentMedicalProfileHistory = (studentId, params = {}) =>
  api.get(`/nursing/students/${studentId}/medical-profile/history`, { params });
