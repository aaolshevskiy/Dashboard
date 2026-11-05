// Service worker: сторінка відкривається з пам'яті пристрою навіть без інтернету.
// Навігація: спершу збережена копія (миттєво), у фоні — оновлення з мережі.
const CACHE = 'dashboard-v1';
const LAST_KEY = new URL('./__last_page__', self.registration.scope).href;
const STATIC = ['./manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(STATIC.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const OFFLINE_HTML =
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<body style="font-family:-apple-system,sans-serif;background:#f2f2f7;color:#6c6c70;padding:40px 24px;line-height:1.4">' +
  '<h3 style="color:#1c1c1e">Немає інтернету</h3>Збережена копія дашборду ще не створена. ' +
  'Відкрийте сторінку один раз з інтернетом — після цього вона відкриватиметься й без нього.</body>';

// Перший запуск: сторінка просить зберегти саму себе (навігація до встановлення SW до нього не доходить)
self.addEventListener('message', e => {
  const d = e.data;
  if (!d || d.type !== 'cache-page' || !d.url) return;
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    if (await cache.match(LAST_KEY)) return;                // копія вже є
    const resp = await fetch(d.url, { cache: 'reload' });
    if (resp && resp.ok && !resp.redirected) {
      await cache.put(new Request(d.url), resp.clone());
      await cache.put(LAST_KEY, resp.clone());
    }
  })().catch(() => {}));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // запити до скрипта Google, погоди тощо — не чіпаємо

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = (await cache.match(req, { ignoreSearch: true })) || (await cache.match(LAST_KEY));
      const update = fetch(req).then(async resp => {
        if (resp && resp.ok && !resp.redirected) {
          await cache.put(req, resp.clone());
          await cache.put(LAST_KEY, resp.clone());
        }
        return resp;
      }).catch(() => null);
      if (cached) { e.waitUntil(update); return cached; }   // миттєво з пам'яті, оновлення — у фоні
      const resp = await update;
      return resp || new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    })());
    return;
  }

  // Іконки, маніфест: з кешу, якщо є; інакше з мережі
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(resp => {
      if (resp && resp.ok) { const copy = resp.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return resp;
    }))
  );
});
