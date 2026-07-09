import api from '../lib/api';

export const createCommunityReport = (data) => api.post('/community-reports', data);
export const getCommunityReports = (params = {}) => api.get('/community-reports', { params });
export const updateCommunityReportStatus = (reportId, status) => api.patch(`/community-reports/${reportId}/status`, { status });
