// Guarda la app para que abra rápido y sin señal. Subí VERSION en cada cambio.
const VERSION = 'mt-1';
const ARCHIVOS = ['./', 'index.html', 'estilos.css?v=1', 'config.js?v=1', 'rutina.js?v=1', 'app.js?v=1', 'manifest.webmanifest', 'icono.svg', 'icono-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // Primero la red (para ver cambios al toque); sin señal, lo guardado.
  e.respondWith(fetch(e.request).then(r => {
    const copia = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copia)); return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
