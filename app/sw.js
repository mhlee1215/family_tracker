const CACHE_PREFIX = 'family-tracker';
const NETWORK_FIRST_PATHS = new Set([
  '/',
  '/app/index.html',
  '/app/styles.css',
  '/app/main.js',
  '/app/build.json',
  '/app/sw.js',
]);

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
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const build = await readBuildFromMetadata();
    const currentCacheName = build ? `${CACHE_PREFIX}-${build}` : CACHE_PREFIX;
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== currentCacheName)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && NETWORK_FIRST_PATHS.has(url.pathname)) {
    event.respondWith(networkFirst(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) {
      const cache = await caches.open(CACHE_PREFIX);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || Response.error();
  }
}

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
