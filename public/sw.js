// CoachX Service Worker
// Minimal service worker for PWA installability and basic offline support

// v4: PWA 아이콘 SVG (`/icons/icon-*.svg`) 까지 교차 마크로 교체했음.
// 이전 v3 캐시에는 옛 C+X 그라디언트 SVG 가 남아 있을 수 있으므로 이름을 올려
// 다음 방문 때 새 아이콘을 다시 받게 한다.
const CACHE_NAME = 'coachx-v4';

// App shell files to cache on install
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/brand/favicon.svg',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
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
