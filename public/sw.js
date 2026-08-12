// CoachX Service Worker
// Minimal service worker for PWA installability and basic offline support

// v3: 교차 마크 로고로 재래스터화된 PNG를 강제 재캐시하기 위해 이름을 올렸음.
// 파일 경로는 그대로여서 이름을 올리지 않으면 SW 는 이전 마크를 계속 서빙함.
const CACHE_NAME = 'coachx-v3';

// App shell files to cache on install
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/brand/favicon.svg',
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
