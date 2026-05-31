// Custom service-worker extension for the Enterprise PWA.
//
// next-pwa generates the main service worker (`sw.js`) with Workbox precaching +
// runtime caching. We extend it via `importScripts('/custom-sw.js')` configured
// in next.config.js. Because we ship with `skipWaiting: false`, a freshly
// installed worker waits until the user accepts the in-app "update available"
// prompt — which posts this message to activate the new version immediately.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
