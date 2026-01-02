const STATIC_CACHE = 'studywithlive-static-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll([
        '/',
        '/index.html',
        '/styles.css',
        '/manifest.json',
        '/firebase.js',
        '/app.js',
        '/icons/icon-192.png',
        '/icons/icon-152.png'
      ])
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isDynamic =
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('firebasestorage.app') ||
    url.pathname.includes('/o/') ||
    url.pathname.includes('/v1/') ||
    event.request.headers.get('accept')?.includes('text/event-stream');

  if (event.request.method !== 'GET' || isDynamic) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        const copy = res.clone();
        caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, copy));
        return res;
      });
    })
  );
});
