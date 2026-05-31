// Phase 10.1 — Web Push handler.
//
// next-pwa generates the main service worker (`sw.js`). We extend it via
// `importScripts('/custom-sw.js')` configured in next.config.js. That keeps
// Workbox precaching + runtime caching, and adds the push + click handlers
// here.

// "New update available" prompt support. We ship with `skipWaiting: false`, so a
// freshly-installed worker waits until the user accepts the in-app update banner
// (components/pwa-updater.tsx), which posts this message to activate it on demand.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch (_) {
    payload = { title: 'HOA.africa', body: event.data.text() };
  }
  const title = payload.title || 'HOA.africa';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/icon-192.png',
    tag: payload.tag || undefined,
    data: { url: payload.url || '/' },
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Reuse an existing tab when possible.
      for (const client of clients) {
        try {
          const url = new URL(client.url);
          if (url.origin === self.location.origin) {
            client.focus();
            client.navigate(targetUrl);
            return;
          }
        } catch (_) { /* ignore */ }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

// Phase 10.1 — when the browser rotates a subscription's secrets (rare, but
// happens after long inactivity or extension teardown), the SW receives this
// event. Apps are supposed to re-subscribe; the page will pick this up on
// next load via the subscribe helper, so here we just log it.
self.addEventListener('pushsubscriptionchange', (event) => {
  // No-op for now — re-subscription is driven by the page on next visit.
});
