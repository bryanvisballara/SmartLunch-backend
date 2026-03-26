import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.comergio.app',
  appName: 'Comergio',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
