import axios from 'axios';

const configuredApiUrl = String(import.meta.env.VITE_API_URL || '').trim();
const fallbackApiUrl = import.meta.env.PROD
  ? 'https://api.comergio.com'
  : 'http://localhost:4000';
const apiBaseUrl = configuredApiUrl || fallbackApiUrl;

export async function fetchBerckleyPrimerContactoAvailability({ from, days = 21 } = {}) {
  const response = await axios.get(`${apiBaseUrl}/public/berckley/primer-contacto/availability`, {
    params: { from, days },
    timeout: 20000,
  });
  return response.data;
}

export async function submitBerckleyPrimerContacto(payload) {
  const response = await axios.post(`${apiBaseUrl}/public/berckley/primer-contacto`, payload, {
    timeout: 30000,
  });
  return response.data;
}

export async function fetchMillenniumPrimerContactoAvailability({ from, days = 21 } = {}) {
  const response = await axios.get(`${apiBaseUrl}/public/millennium/primer-contacto/availability`, {
    params: { from, days },
    timeout: 20000,
  });
  return response.data;
}

export async function submitMillenniumPrimerContacto(payload) {
  const response = await axios.post(`${apiBaseUrl}/public/millennium/primer-contacto`, payload, {
    timeout: 30000,
  });
  return response.data;
}

/** @deprecated use fetchBerckleyPrimerContactoAvailability */
export const fetchPrimerContactoAvailability = fetchBerckleyPrimerContactoAvailability;

/** @deprecated use submitBerckleyPrimerContacto */
export const submitPrimerContacto = submitBerckleyPrimerContacto;
