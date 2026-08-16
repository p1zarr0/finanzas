/* Service worker: lo que hace que la app abra sin internet.

   La estrategia es mixta a propósito:
   - index.html va primero a la red, para que veas las mejoras al toque
     y no una versión vieja guardada en el teléfono.
   - Todo lo demás (íconos, la librería del escáner) va primero al caché:
     son 10 MB que no cambian nunca y bajarlos cada vez sería absurdo.
   - Sin internet, todo sale del caché.

   Al publicar un cambio hay que subirle el número a CACHE. Eso obliga
   al teléfono a botar lo viejo y guardar lo nuevo. */

const CACHE = 'finanzas-v8';

// Rutas relativas: el sitio cuelga de un subdirectorio en GitHub Pages
const ESENCIALES = [
  './',
  './index.html',
  './manifest.json',
  './icono-192.png',
  './icono-512.png',
  './lib/tesseract.min.js',
  './lib/worker.min.js',
  './lib/tesseract-core-simd-lstm.wasm.js',
  './lib/tesseract-core-lstm.wasm.js',
  './lib/spa.traineddata.gz'
  // datos-de-prueba.js NO va aquí a propósito: es una herramienta para
  // llenar la app desde la consola del computador y ver como se porta con
  // volumen. index.html no la carga. Si se guardara en el cache viajaria al
  // telefono sin que nadie la ocupe nunca.
];

self.addEventListener('install', evento => {
  evento.waitUntil(
    caches.open(CACHE)
      // addAll falla entero si un archivo falla; así cada uno va por su cuenta
      // y la app queda usable aunque algo pesado no alcance a guardarse.
      .then(cache => Promise.allSettled(ESENCIALES.map(r => cache.add(r))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(nombres => Promise.all(
        nombres.filter(n => n !== CACHE).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', evento => {
  const pedido = evento.request;
  if(pedido.method !== 'GET') return;

  const url = new URL(pedido.url);
  if(url.origin !== self.location.origin) return;

  const esPagina = pedido.mode === 'navigate' || url.pathname.endsWith('index.html');

  if(esPagina){
    // Primero la red; si no hay, lo guardado
    evento.respondWith(
      fetch(pedido)
        .then(respuesta => {
          const copia = respuesta.clone();
          caches.open(CACHE).then(c => c.put(pedido, copia));
          return respuesta;
        })
        .catch(() => caches.match(pedido).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Resto: primero lo guardado, y si no está se busca y se guarda
  evento.respondWith(
    caches.match(pedido).then(guardado => guardado || fetch(pedido).then(respuesta => {
      if(respuesta && respuesta.ok){
        const copia = respuesta.clone();
        caches.open(CACHE).then(c => c.put(pedido, copia));
      }
      return respuesta;
    }))
  );
});
