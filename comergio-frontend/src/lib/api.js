import axios from 'axios';
import useAuthStore from '../store/auth.store';

const configuredApiUrl = String(import.meta.env.VITE_API_URL || '').trim();
const fallbackApiUrl = import.meta.env.PROD
  ? 'https://smartlunch-backend-3uqr.onrender.com'
  : 'http://localhost:4000';
const apiBaseUrl = configuredApiUrl || fallbackApiUrl;
const configuredTimeout = Number(import.meta.env.VITE_API_TIMEOUT_MS || 15000);
const requestTimeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
  ? configuredTimeout
  : 15000;

const api = axios.create({
  baseURL: apiBaseUrl,
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

export function resolveApiAssetUrl(value) {
  const rawUrl = String(value || '').trim();
  if (!rawUrl) {
    return '';
  }

  if (/^(?:https?:|blob:|data:)/i.test(rawUrl)) {
    return rawUrl;
  }

  if (rawUrl.startsWith('/assets/') || rawUrl.startsWith('/uploads/')) {
    if (typeof window !== 'undefined' && import.meta.env.DEV) {
      return rawUrl;
    }

    let assetBaseUrl = apiBaseUrl;

    if (typeof window !== 'undefined') {
      try {
        const parsedApiUrl = new URL(apiBaseUrl);
        const currentHostname = window.location.hostname;
        const apiHostname = parsedApiUrl.hostname;

        if (['localhost', '127.0.0.1'].includes(apiHostname) && currentHostname && !['localhost', '127.0.0.1'].includes(currentHostname)) {
          parsedApiUrl.hostname = currentHostname;
          assetBaseUrl = parsedApiUrl.toString().replace(/\/+$/, '');
        }
      } catch (_error) {
        assetBaseUrl = apiBaseUrl;
      }
    }

    return `${assetBaseUrl.replace(/\/+$/, '')}${rawUrl}`;
  }

  return rawUrl;
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
    const status = error?.response?.status;
    const method = String(error?.config?.method || 'GET').toUpperCase();
    const url = error?.config?.url || '';
    const message = error?.response?.data?.message || error?.message || 'unknown';

    if (status) {
      console.warn('[API_ERROR]', method, url, status, message);
    }

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
