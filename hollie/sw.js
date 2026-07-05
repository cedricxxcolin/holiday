/* Hollie Service Worker */
const CACHE = 'hollie-v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './icon-180.png',
  './hollie.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Web Share Target: geteilte Dateien entgegennehmen
  if (e.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData();
        const files = fd.getAll('files').map(f => ({ name: f.name || 'Datei', type: f.type, blob: f }));
        const payload = { title: fd.get('title') || '', text: fd.get('text') || '', files };
        await new Promise((res, rej) => {
          const req = indexedDB.open('fp_share', 1);
          req.onupgradeneeded = () => req.result.createObjectStore('pending');
          req.onsuccess = () => {
            const tx = req.result.transaction('pending', 'readwrite');
            tx.objectStore('pending').put(payload, 'share');
            tx.oncomplete = res; tx.onerror = rej;
          };
          req.onerror = rej;
        });
      } catch (err) { /* still redirect */ }
      return Response.redirect('./index.html?shared=1', 303);
    })());
    return;
  }


  // App shell: network first (so updates arrive), cache fallback (so offline works)
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request, { ignoreSearch: true })
          .then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  // External (e.g. Google Fonts): cache first, then network
  e.respondWith(
    caches.match(e.request).then(hit =>
      hit || fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => hit)
    )
  );
});
