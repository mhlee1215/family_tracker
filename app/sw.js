const CACHE_PREFIX = 'family-tracker';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const build = await readBuildFromMetadata();
    const cacheName = build ? `${CACHE_PREFIX}-${build}` : CACHE_PREFIX;
    const cache = await caches.open(cacheName);
    await cache.addAll([
      '/',
      '/app/index.html',
      '/app/styles.css',
      '/app/main.js',
      '/app/build.json',
      '/app/manifest.webmanifest',
      '/app/icons/family-tracker-icon-180.png',
      '/app/icons/family-tracker-icon-192.png',
      '/app/icons/family-tracker-icon-512.png',
    ]);
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});

async function readBuildFromMetadata() {
  try {
    const response = await fetch('/app/build.json', { cache: 'no-store' });
    if (!response.ok) return '';
    const payload = await response.json();
    if (typeof payload.build !== 'string') return '';
    return payload.build;
  } catch {
    return '';
  }
}
