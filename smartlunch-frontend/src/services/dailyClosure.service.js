import api from '../lib/api';

export const getDailyClosureSummary = (params = {}) => api.get('/daily-closure/summary', { params });
export const createDailyClosure = (data) => api.post('/daily-closure', data);
export const getDailyClosures = (params = {}) => api.get('/daily-closure', { params });