import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

// https://vite.dev/config/
export default defineConfig({
  appType: 'spa',
  server: {
    host: true,
    port: 5173,
    // Fail instead of silently moving to 5174/5175 (Chrome keeps the old tab).
    strictPort: true,
    headers: {
      // Prevent Chrome from serving stale modules while Vite is running.
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
    },
    hmr: {
      overlay: true,
      port: 5173,
      clientPort: 5173,
    },
    watch: {
      // More reliable file change detection on macOS + Chrome HMR.
      ignored: ['**/dist-deploy/**', '**/android/**', '**/ios/**', '**/.git/**'],
    },
    proxy: {
      '/assets': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
  plugins: [
    react(),
    legacy({
      targets: ['defaults', 'ie >= 11'],
      modernPolyfills: true,
    }),
  ],
})

