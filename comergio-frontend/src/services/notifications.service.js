import api from '../lib/api';

export const registerDeviceToken = (data) => api.post('/notifications/device-tokens', data);
export const revokeDeviceToken = (data) => api.post('/notifications/device-tokens/revoke', data);

export async function getNotifications() {
  const response = await api.get('/notifications');
  const data = response.data;
  if (Array.isArray(data)) {
    return { items: data, unreadCount: 0 };
  }
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    unreadCount: Number(data?.unreadCount || 0),
  };
}

export const getNotificationsUnreadCount = () => api.get('/notifications/unread-count').then((response) => response.data);
export const dismissNotification = (id) => api.patch(`/notifications/${id}/dismiss`).then((response) => response.data);
export const markAllNotificationsRead = () => api.post('/notifications/read-all').then((response) => response.data);
export const getNotificationsAudit = (params = {}) => api.get('/notifications/audit', { params });
