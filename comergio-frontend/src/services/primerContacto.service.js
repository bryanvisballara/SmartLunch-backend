import axios from 'axios';

const configuredApiUrl = String(import.meta.env.VITE_API_URL || '').trim();
const fallbackApiUrl = import.meta.env.PROD
  ? 'https://smartlunch-backend-3uqr.onrender.com'
  : 'http://localhost:4000';
const apiBaseUrl = configuredApiUrl || fallbackApiUrl;

export async function fetchPrimerContactoAvailability({ from, days = 21 } = {}) {
  const response = await axios.get(`${apiBaseUrl}/public/berckley/primer-contacto/availability`, {
    params: { from, days },
    timeout: 20000,
  });
  return response.data;
}

export async function submitPrimerContacto(payload) {
  const response = await axios.post(`${apiBaseUrl}/public/berckley/primer-contacto`, payload, {
    timeout: 30000,
  });
  return response.data;
}
