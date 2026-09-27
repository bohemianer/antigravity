// Antigravity PWA Service Worker (极速离线与高命中缓存引擎)
const CACHE_NAME = 'antigravity-pwa-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './notebook.html',
  './notebook.js',
  './webdav.js',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-64.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 外部 API 请求与非 GET 请求一律直连网络，绝不缓存
  if (
    url.hostname.includes('gitee.com') ||
    url.hostname.includes('jianguoyun.com') ||
    url.hostname.includes('youdao.com') ||
    url.hostname.includes('eudic.net') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('dictionaryapi.dev') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // 针对本地静态资源采用 Stale-While-Revalidate 策略
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
