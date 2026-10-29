// کش آفلاین: نسخه کش را با هر تغییر بالا ببر
const CACHE = 'diet-v3';
const ASSETS = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './js/foods.js', './js/parser.js', './js/app.js',
  './fonts/vazirmatn-arabic-wght-normal.woff2', './fonts/vazirmatn-latin-wght-normal.woff2',
  './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// اول از کش (سریع و آفلاین)، در پس‌زمینه نسخه جدید را می‌گیرد
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const fresh = fetch(req).then(res => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
