const VERSION = '1.6.0';
const CACHE = `ishtirak-${VERSION}`;
const SHELL = ['./', 'index.html', 'css/app.css', 'js/config.js', 'js/i18n.js', 'js/vault.js', 'js/app.js', 'vendor/supabase.js', 'manifest.webmanifest', 'icons/icon-192.png', 'fonts/plex-latin-400.woff2', 'fonts/plex-latin-500.woff2', 'fonts/plex-latin-700.woff2', 'fonts/plex-arabic-400.woff2', 'fonts/plex-arabic-500.woff2', 'fonts/plex-arabic-700.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.endsWith('/sw.js')) return;
  const key = e.request.mode === 'navigate' ? 'index.html' : e.request;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(key, { ignoreSearch: e.request.mode === 'navigate' });
    const net = fetch(e.request, { cache: 'no-cache' }).then((res) => {
      if (res.ok && res.type === 'basic') c.put(key, res.clone());
      return res;
    });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net.catch(() => c.match('index.html'));
  }));
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Ishtirak', {
    body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag,
    icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: d.url || './' }
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus();
    return self.clients.openWindow(target);
  }));
});
