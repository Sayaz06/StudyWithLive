const STATIC_CACHE = 'studywithlive-static-v6';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll([
        './',
        './index.html',
        './styles.css',
        './manifest.json',
        './firebase.js',
        './app.js',
        './icons/icon-192.png',
        './icons/icon-152.png'
      ])
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request
