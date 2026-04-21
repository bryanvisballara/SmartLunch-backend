import axios from 'axios';
import useAuthStore from '../store/auth.store';

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

let refreshRequestPromise = null;

async function refreshSession() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const response = await axios.post(
    `${configuredApiUrl || fallbackApiUrl}/auth/refresh`,
    { refreshToken },
    { timeout: requestTimeoutMs }
  );

  useAuthStore.getState().setAuth(response.data);
  return response.data?.token;
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (String(error?.code || '').toUpperCase() === 'ECONNABORTED') {
      error.message = 'La conexion con el servidor tardo demasiado. Intenta de nuevo.';
    }

    const originalRequest = error?.config;
    const statusCode = Number(error?.response?.status || 0);
    const requestUrl = String(originalRequest?.url || '');
    const hasRefreshToken = Boolean(localStorage.getItem('refreshToken'));
    const shouldRefresh =
      statusCode === 401
      && hasRefreshToken
      && originalRequest
      && !originalRequest._retry
      && !requestUrl.includes('/auth/login')
      && !requestUrl.includes('/auth/refresh');

    if (!shouldRefresh) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      refreshRequestPromise = refreshRequestPromise || refreshSession()
        .finally(() => {
          refreshRequestPromise = null;
        });

      const nextAccessToken = await refreshRequestPromise;
      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      useAuthStore.getState().logout();
      return Promise.reject(refreshError);
    }
  }
);

export default api;
