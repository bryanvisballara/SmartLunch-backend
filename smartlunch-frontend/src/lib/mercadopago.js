const MP_SDK_URL = 'https://sdk.mercadopago.com/js/v2';
const MP_SECURITY_URL = 'https://www.mercadopago.com/v2/security.js';

let sdkLoaderPromise = null;
let securityLoaderPromise = null;

function getGlobalMercadoPago() {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.MercadoPago || null;
}

function loadMercadoPagoSdk() {
  const existing = getGlobalMercadoPago();
  if (existing) {
    return Promise.resolve(existing);
  }

  if (sdkLoaderPromise) {
    return sdkLoaderPromise;
  }

  sdkLoaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = MP_SDK_URL;
    script.async = true;
    script.onload = () => {
      const MercadoPagoGlobal = getGlobalMercadoPago();
      if (!MercadoPagoGlobal) {
        reject(new Error('No se pudo cargar Mercado Pago SDK'));
        return;
      }
      resolve(MercadoPagoGlobal);
    };
    script.onerror = () => reject(new Error('No se pudo cargar Mercado Pago SDK'));
    document.head.appendChild(script);
  });

  return sdkLoaderPromise;
}

function loadMercadoPagoSecurity() {
  if (typeof window === 'undefined') {
    return Promise.resolve('');
  }

  if (window.MP_DEVICE_SESSION_ID) {
    return Promise.resolve(String(window.MP_DEVICE_SESSION_ID));
  }

  if (securityLoaderPromise) {
    return securityLoaderPromise;
  }

  securityLoaderPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = MP_SECURITY_URL;
    script.async = true;
    script.onload = () => resolve(String(window.MP_DEVICE_SESSION_ID || ''));
    script.onerror = () => resolve('');
    document.head.appendChild(script);
  });

  return securityLoaderPromise;
}

export async function createMercadoPagoCardToken({
  publicKey,
  cardNumber,
  cardholderName,
  expirationMonth,
  expirationYear,
  securityCode,
  identificationType,
  identificationNumber,
}) {
  const normalizedPublicKey = String(publicKey || '').trim();
  if (!normalizedPublicKey) {
    throw new Error('Falta la public key de Mercado Pago');
  }

  const [_, deviceId] = await Promise.all([loadMercadoPagoSdk(), loadMercadoPagoSecurity()]);
  const MercadoPagoGlobal = getGlobalMercadoPago();
  if (!MercadoPagoGlobal) {
    throw new Error('Mercado Pago SDK no está disponible');
  }

  const mp = new MercadoPagoGlobal(normalizedPublicKey, { locale: 'es-CO' });
  const response = await mp.createCardToken({
    cardNumber: String(cardNumber || '').replace(/\D/g, ''),
    cardholderName: String(cardholderName || '').trim(),
    cardExpirationMonth: String(expirationMonth || '').trim(),
    cardExpirationYear: String(expirationYear || '').trim(),
    securityCode: String(securityCode || '').replace(/\D/g, ''),
    identificationType: String(identificationType || '').trim(),
    identificationNumber: String(identificationNumber || '').replace(/\D/g, ''),
  });

  const tokenId = String(response?.id || '').trim();
  if (!tokenId) {
    const reason = response?.cause?.[0]?.description || response?.message || 'No se pudo tokenizar la tarjeta';
    throw new Error(reason);
  }

  return {
    ...response,
    deviceId: String(deviceId || ''),
  };
}
