// Minimal service worker — exists only so the browser considers this app
// installable. It deliberately does not cache anything: this app's data
// changes constantly, so every request should always go straight to the
// network rather than risk serving something stale.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

