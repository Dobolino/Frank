/*
 * Wird beim Build mit allen App-Dateien und ihrer gemeinsamen Version ergänzt.
 * Ein Update wartet, bis die bisherigen Tabs geschlossen sind. So passen HTML,
 * JavaScript und CSS immer zusammen; Finanzdaten bleiben im LocalStorage.
 */
const VERSION = '__FRANK_BUILD_VERSION__';
const FILES = /* __FRANK_PRECACHE__ */ [];
const PREFIX = `frank:${self.registration.scope}:`;
const CACHE = `${PREFIX}${VERSION}`;
const SHELL = new URL('./', self.registration.scope).href;
const URLS = FILES.map((file) => new URL(file, self.registration.scope).href);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // Die Vorlage aus public/ darf nicht als fertiger Offline-Build aktiv werden.
    if (FILES.length === 0) throw new Error('Offline-Dateiliste fehlt. Bitte npm run build verwenden.');
    const cache = await caches.open(CACHE);
    try {
      await cache.addAll(URLS.map((url) => new Request(url, { cache: 'reload' })));
    } catch (error) {
      // Eine unvollständige Installation ersetzt nie die funktionierende Version.
      await caches.delete(CACHE);
      throw error;
    }
  })());
});

// «Neu laden» in der App: wartende Version sofort aktivieren
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.registration.scope)) return;
  const url = new URL(req.url);
  url.search = '';
  if (req.mode !== 'navigate' && !URLS.includes(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return await cache.match(req.mode === 'navigate' ? SHELL : url.href) || fetch(req);
  })());
});
