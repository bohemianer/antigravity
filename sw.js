// Antigravity PWA Service Worker (极速离线与实时更新引擎)
const CACHE_NAME = 'antigravity-pwa-v9';
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
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
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

  // 外部 API 与非 GET 请求直连网络
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

  // 针对 HTML 与 JS 文件采用 Network-First 策略：优先拉取最新更新，离线时降级使用本地缓存
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('.js') || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 针对图标、字体等静态图片采用 Stale-While-Revalidate 策略
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
