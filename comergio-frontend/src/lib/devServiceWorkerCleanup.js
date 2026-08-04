/**
 * Chrome keeps controlling localhost with any registered Service Worker.
 * Even a push-only SW can break Vite HMR / hard-refresh. Clear it in DEV.
 */
export async function cleanupDevServiceWorkers() {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return;
  }

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch {
    // ignore
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // ignore
  }
}
