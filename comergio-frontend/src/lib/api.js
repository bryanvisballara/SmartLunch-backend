import axios from 'axios';

const configuredApiUrl = String(import.meta.env.VITE_API_URL || '').trim();
const fallbackApiUrl = import.meta.env.PROD
  ? 'https://smartlunch-backend-3uqr.onrender.com'
  : 'http://localhost:4000';
const configuredTimeout = Number(import.meta.env.VITE_API_TIMEOUT_MS || 15000);
const requestTimeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
  ? configuredTimeout
  : 15000;

const api = axios.create({
  baseURL: configuredApiUrl || fallbackApiUrl,
  timeout: requestTimeoutMs,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (String(error?.code || '').toUpperCase() === 'ECONNABORTED') {
      error.message = 'La conexion con el servidor tardo demasiado. Intenta de nuevo.';
    }
    return Promise.reject(error);
  }
);

export default api;
