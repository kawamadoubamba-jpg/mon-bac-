// Mode hors ligne : les cours restent disponibles, Tania a besoin d'internet.
const V = 'monbac-v1';
const FILES = ['/', '/index.html', '/tw.css', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  // Jamais de cache pour Tania ni pour les autres sites
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Réseau d'abord (toujours la dernière version), cache si pas de connexion
  e.respondWith(
    fetch(req)
      .then(r => {
        if (r && r.ok) { const copy = r.clone(); caches.open(V).then(c => c.put(req, copy)); }
        return r;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('/index.html')))
  );
});
