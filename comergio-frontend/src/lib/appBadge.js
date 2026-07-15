import { Capacitor } from '@capacitor/core';

let badgePluginPromise = null;
let permissionsRequested = false;

async function getBadgePlugin() {
  if (!Capacitor.isNativePlatform()) {
    return null;
  }
  if (!badgePluginPromise) {
    badgePluginPromise = import('@capawesome/capacitor-badge')
      .then((module) => module.Badge)
      .catch(() => null);
  }
  return badgePluginPromise;
}

async function ensureBadgePermissions(Badge) {
  if (!Badge || permissionsRequested) {
    return;
  }
  permissionsRequested = true;
  try {
    const status = await Badge.checkPermissions();
    if (status?.display !== 'granted') {
      await Badge.requestPermissions();
    }
  } catch (error) {
    console.warn('[APP_BADGE_PERMISSIONS_FAILED]', error);
  }
}

export async function setAppBadgeCount(count = 0) {
  const numeric = Math.max(0, Number(count) || 0);
  const Badge = await getBadgePlugin();
  if (!Badge) {
    return;
  }

  try {
    await ensureBadgePermissions(Badge);
    if (numeric <= 0) {
      await Badge.clear();
      return;
    }
    await Badge.set({ count: numeric });
  } catch (error) {
    console.warn('[APP_BADGE_SET_FAILED]', error);
  }
}

export async function clearAppBadgeCount() {
  return setAppBadgeCount(0);
}
