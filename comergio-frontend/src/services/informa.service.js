import api from '../lib/api';

export const getInformaMeta = () => api.get('/informa/meta');
export const getInformaUnreadCount = () => api.get('/informa/unread-count');
export const getInformaPosts = (params = {}) => api.get('/informa/posts', { params });
export const createInformaPost = (data) => api.post('/informa/posts', data);
export const likeInformaPost = (postId) => api.post(`/informa/posts/${postId}/like`);
export const commentInformaPost = (postId, data) => api.post(`/informa/posts/${postId}/comments`, data);
export const likeInformaComment = (postId, commentId) => api.post(`/informa/posts/${postId}/comments/${commentId}/like`);
export const archiveInformaPost = (postId) => api.patch(`/informa/posts/${postId}/archive`);
export const getInformaDrafts = (params = {}) => api.get('/informa/drafts', { params });
export const generateInformaDraft = (payload = {}) => api.post('/informa/drafts/generate', payload, {
  timeout: 180_000,
});
export const clearInformaDrafts = () => api.post('/informa/drafts/clear');
export const publishInformaDraft = (postId) => api.post(`/informa/drafts/${postId}/publish`);
export const discardInformaDraft = (postId) => api.patch(`/informa/drafts/${postId}/discard`);

export const uploadInformaMedia = (file, preferredName = '') => {
  const formData = new FormData();
  formData.append('file', file);
  if (preferredName) {
    formData.append('preferredName', preferredName);
  }
  return api.post('/informa/uploads/media', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120_000,
  });
};
