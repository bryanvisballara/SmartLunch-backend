import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

// https://vite.dev/config/
export default defineConfig({
  appType: 'spa',
  server: {
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
