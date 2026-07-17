import api from '../lib/api';

export const getStudentPortalOverview = () => api.get('/student/portal/overview');
export const getStudentAcademicFeed = () => api.get('/student/portal/academic-feed');
export const getStudentAcademicCalendar = (params = {}) => api.get('/student/portal/academic-calendar', { params });
export const getStudentAcademicAttendance = (params = {}) => api.get('/student/portal/academic-attendance', { params });
export const getStudentAssignments = () => api.get('/student/portal/assignments');
export const getStudentAssignmentDetail = (assignmentId) => api.get(`/student/portal/assignments/${assignmentId}`);
export const submitStudentAssignment = (assignmentId, formData) => api.post(
  `/student/portal/assignments/${assignmentId}/submissions`,
  formData,
  { timeout: 120000 }
);
export const getColibriGameLeaderboard = () => api.get('/student/portal/colibri-game/leaderboard');
export const submitColibriGameScore = (score) => api.post('/student/portal/colibri-game/scores', { score });
