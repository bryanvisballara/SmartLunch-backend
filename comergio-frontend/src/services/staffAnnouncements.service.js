import api from '../lib/api';

export const getStaffAnnouncementMeta = () => api.get('/staff-announcements/meta');
export const getStaffAnnouncementUnreadCount = () => api.get('/staff-announcements/unread-count');
export const getStaffAnnouncementInbox = (params = {}) => api.get('/staff-announcements/inbox', { params });
export const markStaffAnnouncementRead = (announcementId) => api.patch(`/staff-announcements/${announcementId}/read`);
export const getSentStaffAnnouncements = (params = {}) => api.get('/staff-announcements/sent', { params });
export const getStaffAnnouncementRecipients = (announcementId, params = {}) => (
  api.get(`/staff-announcements/${announcementId}/recipients`, { params })
);
export const createStaffAnnouncement = (data) => api.post('/staff-announcements', data);
