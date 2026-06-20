/// <reference types="@capacitor-firebase/messaging" />

import type { CapacitorConfig } from '@capacitor/cli';

function isTruthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function normalizeServerUrl(value: string | undefined): string | undefined {
  const normalized = String(value || '').trim().replace(/\/+$/, '');
  if (!normalized) {
    return undefined;
  }

  if (!/^https:\/\//i.test(normalized)) {
    throw new Error(`CAPACITOR_SERVER_URL must use HTTPS: ${normalized}`);
  }

  return normalized;
}

const useEmbeddedShell = isTruthy(process.env.CAPACITOR_USE_EMBEDDED);
const remoteServerUrl = normalizeServerUrl(process.env.CAPACITOR_SERVER_URL);

const config: CapacitorConfig = {
  appId: 'com.comergio.app',
  appName: 'Comergio',
  webDir: 'dist',
  server: useEmbeddedShell || !remoteServerUrl
    ? {
        androidScheme: 'https',
      }
    : {
        url: remoteServerUrl,
        cleartext: false,
        androidScheme: 'https',
        allowNavigation: [
          'https://comergio.com',
          'https://www.comergio.com',
          'https://*.hostingersite.com',
          'https://smartlunch-backend-3uqr.onrender.com',
        ],
      },
  plugins: {
    FirebaseMessaging: {
      presentationOptions: ['alert', 'badge', 'sound'],
    },
  },
};

if (remoteServerUrl && !useEmbeddedShell) {
  console.log(`[capacitor] Remote UI shell: ${remoteServerUrl}`);
} else {
  console.log('[capacitor] Embedded dist shell (local bundle)');
}

export default config;
