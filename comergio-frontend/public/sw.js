const isLocalDevHost = ['localhost', '127.0.0.1'].includes(self.location.hostname);

self.addEventListener('install', (event) => {
  // On local Vite, unregister immediately so Chrome does not keep an old controller.
  if (isLocalDevHost) {
    event.waitUntil(self.skipWaiting().then(() => self.registration.unregister()));
    return;
  }
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  if (isLocalDevHost) {
    event.waitUntil(
      self.registration.unregister().then(async () => {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        await Promise.all(clients.map((client) => client.navigate(client.url)));
      })
    );
    return;
  }
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Comergio';
  const body = payload.body || 'Tienes una nueva notificacion.';
  const data = payload.data || {};

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data,
      icon: '/iconocomergio.jpg',
      badge: '/iconocomergio.jpg',
      tag: data.type || 'comergio-notification',
      renotify: false,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification?.data || {};
  const targetPath = data.url || (data.type === 'nursing.visit' ? `/parent/enfermeria${data.studentId ? `?studentId=${encodeURIComponent(data.studentId)}` : ''}` : '/parent');

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({
            type: 'PUSH_NOTIFICATION_NAVIGATE',
            payload: data,
          });
          client.navigate(targetPath);
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetPath);
      }

      return null;
    })
  );
});
