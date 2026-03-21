import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { PushNotifications } from '@capacitor/push-notifications';
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

function isWebPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    window.isSecureContext
  );
}

async function ensureNativePushNotifications() {
  const platform = Capacitor.getPlatform(); // 'ios' | 'android'

  let permission = await PushNotifications.checkPermissions();

  if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
    permission = await PushNotifications.requestPermissions();
  }

  if (permission.receive !== 'granted') {
    return { enabled: false, reason: 'Permiso de notificaciones nativas no concedido' };
  }

  const nativeToken = await new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const timeout = window.setTimeout(() => {
      PushNotifications.removeAllListeners();
      finish({ token: '', reason: 'Timeout registrando token nativo' });
    }, 7000);

    const onRegistration = (event) => {
      window.clearTimeout(timeout);
      PushNotifications.removeAllListeners();
      finish({ token: String(event?.value || '').trim(), reason: null });
    };

    const onError = (error) => {
      window.clearTimeout(timeout);
      PushNotifications.removeAllListeners();
      finish({ token: '', reason: `Error de registro nativo: ${JSON.stringify(error)}` });
    };

    PushNotifications.addListener('registration', onRegistration);
    PushNotifications.addListener('registrationError', onError);
    PushNotifications.register();
  });

  let fcmToken = '';
  let fcmReason = null;

  try {
    const tokenResult = await FirebaseMessaging.getToken();
    fcmToken = String(tokenResult?.token || '').trim();
    if (!fcmToken) {
      fcmReason = 'Firebase no devolvió token FCM';
    }
  } catch (error) {
    fcmReason = `Error obteniendo token FCM: ${error?.message || 'unknown'}`;
  }

  const tokenForBackend = fcmToken || nativeToken.token;

  if (!tokenForBackend) {
    return {
      enabled: false,
      reason: fcmReason || nativeToken.reason || 'No se pudo obtener token de notificaciones',
    };
  }

  try {
    await registerDeviceToken({ platform, token: tokenForBackend });
    localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, tokenForBackend);
  } catch (err) {
    return { enabled: false, reason: `Error registrando token: ${err.message}` };
  }

  return { enabled: true, tokenSource: fcmToken ? 'fcm' : 'native' };
}

async function ensureWebPushNotifications() {
  if (!isWebPushSupported()) {
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
  await registerDeviceToken({
    platform: 'web',
    token: tokenPayload,
  });
  localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, tokenPayload);

  return { enabled: true };
}

export async function ensurePortalPushNotifications() {
  if (Capacitor.isNativePlatform()) {
    return ensureNativePushNotifications();
  }

  return ensureWebPushNotifications();
}

export async function ensureParentPushNotifications() {
  return ensurePortalPushNotifications();
}
