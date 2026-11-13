const CACHE = 'ishtirak-v7';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/config.js', 'js/i18n.js', 'js/vault.js', 'js/app.js', 'vendor/supabase.js', 'manifest.webmanifest', 'icons/icon-192.png', 'fonts/plex-latin-400.woff2', 'fonts/plex-latin-500.woff2', 'fonts/plex-latin-700.woff2', 'fonts/plex-arabic-400.woff2', 'fonts/plex-arabic-500.woff2', 'fonts/plex-arabic-700.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
