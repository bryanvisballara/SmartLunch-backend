import api from '../lib/api';

export const getStudentPortalOverview = () => api.get('/student/portal/overview');
export const getStudentAcademicCalendar = (params = {}) => api.get('/student/portal/academic-calendar', { params });
export const getStudentAcademicAttendance = (params = {}) => api.get('/student/portal/academic-attendance', { params });
