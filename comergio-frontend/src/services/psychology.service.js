import api from '../lib/api';

export const getPsychologyDashboard = () => api.get('/psychology/dashboard');
export const searchPsychologyStudents = (params = {}) => api.get('/psychology/students', { params });
export const getPsychologyStudentProfile = (studentId) => api.get(`/psychology/students/${studentId}/profile`);
export const createPsychologyCase = (data) => api.post('/psychology/cases', data);
export const addPsychologyCaseNote = (caseId, data) => api.post(`/psychology/cases/${caseId}/notes`, data);
export const getPsychologyInstitutionalFeed = () => api.get('/psychology/institutional/feed');
export const getParentPsychologyRecords = (params = {}) => api.get('/psychology/parent/records', { params });
