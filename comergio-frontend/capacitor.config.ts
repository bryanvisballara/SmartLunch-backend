/// <reference types="@capacitor-firebase/messaging" />

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.comergio.app',
  appName: 'Comergio',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    FirebaseMessaging: {
      presentationOptions: ['alert', 'badge', 'sound'],
    },
  },
};

export default config;
