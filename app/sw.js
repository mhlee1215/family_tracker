const CACHE_NAME = 'family-tracker-008';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([
      '/',
      '/app/index.html',
      '/app/styles.css',
      '/app/main.js',
      '/app/build.json',
      '/app/manifest.webmanifest',
    ])),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});
