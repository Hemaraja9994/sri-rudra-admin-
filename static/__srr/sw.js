// Sri Rudra admin app — service worker (served at /sw.js by the portal-plus Worker).
//
// It exists so browsers offer to install the portal as an app. It deliberately caches nothing
// except one "you're offline" page: every portal page and every piece of patient data always
// comes fresh from the server, and nothing clinical is stored on the device.
//
// To switch it off for everyone, replace this file with:
//   self.addEventListener('install', () => self.skipWaiting());
//   self.addEventListener('activate', () => self.registration.unregister());
const CACHE = 'srr-offline-v1';
const OFFLINE_PAGE = '/__srr/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_PAGE, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Page loads go to the network as normal; only when there is no connection at all does the
// offline page appear. Everything else (data, images, scripts) is left to the browser.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_PAGE).then((page) => page || Response.error())),
  );
});
