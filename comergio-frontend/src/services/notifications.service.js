import api from '../lib/api';

export const registerDeviceToken = (data) => api.post('/notifications/device-tokens', data);
export const revokeDeviceToken = (data) => api.post('/notifications/device-tokens/revoke', data);
export const getNotifications = () => api.get('/notifications');
export const getNotificationsAudit = (params = {}) => api.get('/notifications/audit', { params });
