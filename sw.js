/* Aura · service worker: la app abre rápido y se actualiza sola.
   Si cambias archivos, sube el número de VERSION. */
var VERSION = 'aura-v3';
var ARCHIVOS = ['./', 'index.html', 'aura.css', 'core.js', 'api.js', 'config.js', 'manifest.json', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(ARCHIVOS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // el servidor de reservas nunca se guarda
  e.respondWith(fetch(e.request).then(function (r) {                          // primero internet, si no hay, lo guardado
    var copia = r.clone(); caches.open(VERSION).then(function (c) { c.put(e.request, copia); }); return r;
  }).catch(function () { return caches.match(e.request); }));
});
