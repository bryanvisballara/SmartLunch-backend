import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { registerDeviceToken } from '../services/notifications.service';
import { resolveParentNotificationPath } from './parentNotificationNavigation';

const PUSH_TOKEN_STORAGE_KEY = 'comergioPushToken';
const ANDROID_PUSH_CHANNEL_ID = 'comergio_alerts_v1';
let nativePushSetupPromise = null;
let nativeForegroundListenerPromise = null;
let nativeTapListenerPromise = null;
let pushNavigationHandler = null;
let foregroundNotificationId = Math.floor(Date.now() % 100000);

export function registerPushNotificationNavigation(handler) {
  pushNavigationHandler = typeof handler === 'function' ? handler : null;
}

function openPushTarget(rawPayload = {}) {
  const path = resolveParentNotificationPath(rawPayload);
  if (!path) {
    return;
  }

  if (pushNavigationHandler) {
    pushNavigationHandler(path);
    return;
  }

  if (typeof window !== 'undefined') {
    window.location.assign(path);
  }
}

async function ensureAndroidPushChannel() {
  try {
    await PushNotifications.createChannel({
      id: ANDROID_PUSH_CHANNEL_ID,
      name: 'Notificaciones Comergio',
      description: 'Alertas importantes de Comergio',
      importance: 5,
      visibility: 1,
      sound: 'pushandroid',
      vibration: true,
    });
  } catch (error) {
    console.warn('[PUSH_CHANNEL_CREATE_FAILED]', error);
  }
}

async function ensureNativeLocalNotificationChannel() {
  if (Capacitor.getPlatform() !== 'android') {
    return;
  }

  try {
    await LocalNotifications.createChannel({
      id: ANDROID_PUSH_CHANNEL_ID,
      name: 'Notificaciones Comergio',
      description: 'Alertas importantes de Comergio',
      importance: 5,
      visibility: 1,
      sound: 'pushandroid',
      vibration: true,
    });
  } catch (error) {
    console.warn('[LOCAL_PUSH_CHANNEL_CREATE_FAILED]', error);
  }
}

async function ensureLocalNotificationPermission() {
  let permission = await LocalNotifications.checkPermissions();

  if (permission.display === 'prompt' || permission.display === 'prompt-with-rationale') {
    permission = await LocalNotifications.requestPermissions();
  }

  return permission.display === 'granted';
}

function getNextForegroundNotificationId() {
  foregroundNotificationId = (foregroundNotificationId % 2147483000) + 1;
  return foregroundNotificationId;
}

function resolveForegroundNotification(event) {
  const notification = event?.notification || {};
  const data = notification.data || event?.data || {};
  const title = String(notification.title || data.title || 'Comergio').trim();
  const body = String(notification.body || data.body || 'Tienes una nueva notificacion.').trim();

  return { title, body, data };
}

async function ensureNativeForegroundPresentation() {
  if (nativeForegroundListenerPromise) {
    return nativeForegroundListenerPromise;
  }

  nativeForegroundListenerPromise = (async () => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    await ensureNativeLocalNotificationChannel();
    const canDisplayLocalNotifications = await ensureLocalNotificationPermission();

    if (!canDisplayLocalNotifications) {
      console.warn('[FOREGROUND_PUSH_DISABLED] Permiso de notificacion local no concedido');
      return;
    }

    await FirebaseMessaging.addListener('notificationReceived', async (event) => {
      const { title, body, data } = resolveForegroundNotification(event);

      if (!title && !body) {
        return;
      }

      try {
        await LocalNotifications.schedule({
          notifications: [
            {
              id: getNextForegroundNotificationId(),
              title,
              body,
              extra: data,
              channelId: ANDROID_PUSH_CHANNEL_ID,
              schedule: { at: new Date(Date.now() + 100) },
            },
          ],
        });
      } catch (error) {
        console.warn('[FOREGROUND_PUSH_PRESENTATION_FAILED]', error);
      }
    });
  })();

  return nativeForegroundListenerPromise;
}

async function ensureNativeNotificationTapHandling() {
  if (nativeTapListenerPromise) {
    return nativeTapListenerPromise;
  }

  nativeTapListenerPromise = (async () => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    await FirebaseMessaging.addListener('notificationActionPerformed', (event) => {
      const data = event?.notification?.data || event?.data || {};
      openPushTarget(data);
    });

    await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      openPushTarget(event?.notification?.extra || {});
    });
  })();

  return nativeTapListenerPromise;
}

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
  if (nativePushSetupPromise) {
    return nativePushSetupPromise;
  }

  nativePushSetupPromise = (async () => {
    const platform = Capacitor.getPlatform(); // 'ios' | 'android'

    if (platform === 'android') {
      await ensureAndroidPushChannel();
    }

    let permission = await FirebaseMessaging.checkPermissions();

    if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
      permission = await FirebaseMessaging.requestPermissions();
    }

    if (permission.receive !== 'granted') {
      return { enabled: false, reason: 'Permiso de notificaciones nativas no concedido' };
    }

    try {
      await ensureNativeForegroundPresentation();
      await ensureNativeNotificationTapHandling();
    } catch (error) {
      console.warn('[FOREGROUND_PUSH_SETUP_FAILED]', error);
    }

    let fcmResult = { token: '', reason: null };

    try {
      const tokenResult = await FirebaseMessaging.getToken();
      const token = String(tokenResult?.token || '').trim();

      if (token) {
        fcmResult = { token, reason: null };
      } else {
        fcmResult = { token: '', reason: 'Firebase no devolvió token FCM' };
      }
    } catch (error) {
      fcmResult = {
        token: '',
        reason: `Error obteniendo token FCM: ${error?.message || 'unknown'}`,
      };
    }

    const tokenForBackend = fcmResult.token;

    if (!tokenForBackend) {
      return {
        enabled: false,
        reason: fcmResult.reason || 'No se pudo obtener token de notificaciones',
      };
    }

    try {
      await registerDeviceToken({ platform, token: tokenForBackend });
      localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, tokenForBackend);
    } catch (err) {
      return { enabled: false, reason: `Error registrando token: ${err.message}` };
    }

    return { enabled: true, tokenSource: 'fcm' };
  })();

  try {
    return await nativePushSetupPromise;
  } finally {
    nativePushSetupPromise = null;
  }
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

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event?.data?.type === 'PUSH_NOTIFICATION_NAVIGATE') {
        openPushTarget(event.data.payload || {});
      }
    });
  }

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
