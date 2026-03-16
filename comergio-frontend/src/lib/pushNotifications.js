import { registerDeviceToken } from '../services/notifications.service';

const PUSH_TOKEN_STORAGE_KEY = 'comergioPushToken';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    window.isSecureContext
  );
}

export async function ensureParentPushNotifications() {
  if (!isPushSupported()) {
    return { enabled: false, reason: 'Push API no soportada en este navegador/dispositivo' };
  }

  if (Notification.permission === 'denied') {
    return { enabled: false, reason: 'Permiso de notificaciones denegado por el usuario' };
  }

  let permission = Notification.permission;
  if (permission !== 'granted') {
    permission = await Notification.requestPermission();
  }

  if (permission !== 'granted') {
    return { enabled: false, reason: 'Permiso de notificaciones no concedido' };
  }

  const vapidPublicKey = String(import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY || '').trim();
  if (!vapidPublicKey) {
    return { enabled: false, reason: 'Falta VITE_WEB_PUSH_PUBLIC_KEY para suscribir push web' };
  }

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  const tokenPayload = JSON.stringify(subscription.toJSON());
  const lastToken = localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);

  if (tokenPayload !== lastToken) {
    await registerDeviceToken({
      platform: 'web',
      token: tokenPayload,
    });
    localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, tokenPayload);
  }

  return { enabled: true };
}
