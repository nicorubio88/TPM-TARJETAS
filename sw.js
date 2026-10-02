/* Service worker: permite abrir la app sin señal.
   HTML/JS/CSS se sirven de la red cuando hay conexion (siempre la version nueva)
   y del cache cuando no hay. Las llamadas al Apps Script (POST) no se tocan:
   las tarjetas cargadas sin señal quedan en la cola de comun.js. */
const CACHE = 'tpm-v14';
const ARCHIVOS = ['./', 'index.html', 'formulario.html', 'mis-tarjetas.html', 'seguimiento.html', 'dashboard.html',
  'como-funciona.html', 'guias.html', 'tv.html', 'qr.html', 'config.html', 'estilos.css', 'comun.js', 'personas.js',
  'arbol.js', 'qrcode.js', 'planificador.js', 'planificacion.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ARCHIVOS).catch(function () {}); }));
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});
self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(function (res) {
      const copia = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copia); });
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match('formulario.html'); });
    })
  );
});
