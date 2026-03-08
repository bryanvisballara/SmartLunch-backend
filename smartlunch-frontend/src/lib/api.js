import axios from 'axios';

const configuredApiUrl = String(import.meta.env.VITE_API_URL || '').trim();
const fallbackApiUrl = import.meta.env.PROD
  ? 'https://smartlunch-backend-3uqr.onrender.com'
  : 'http://localhost:4000';

const api = axios.create({
  baseURL: configuredApiUrl || fallbackApiUrl,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
