import api from '../lib/api';

export const searchStudents = (q) => api.get(`/students/search?q=${encodeURIComponent(q)}`);
export const getStudents = () => api.get('/students');
export const getStudentById = (studentId) => api.get(`/students/${studentId}`);
