// CoachX Service Worker
// Minimal service worker for PWA installability and basic offline support

const CACHE_NAME = 'coachx-v1';

// App shell files to cache on install
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Network-first strategy: try network, fall back to cache for navigation requests
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip cross-origin requests (Firebase, APIs, etc.)
  if (url.origin !== self.location.origin) return;

  // For navigation requests, use network-first with cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          );
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // For app shell assets, use cache-first
  if (APP_SHELL.some((path) => url.pathname === path || url.pathname.startsWith('/icons/'))) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
