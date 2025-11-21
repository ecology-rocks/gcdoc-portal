// A simple no-op service worker to satisfy PWA installation requirements
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // We just pass the request through to the network
  // This ensures we always get live data from Firebase
  event.respondWith(fetch(event.request));
});