/**
 * Service worker: makes the page load without a network and installable as an
 * app. That is all it does -- it never fetches anything the page itself would
 * not.
 *
 * Network first, cache as fallback. Cache-first would need a version bump on
 * every deploy, and forgetting one would pin every visitor to an old build;
 * a site this small loads just as fast from the network, and the cache only
 * has to be good enough for when there is none.
 */

const CACHE = 'datetime-tab';

// Everything in web/ except this file. test/pwa.test.mjs keeps the list in
// sync, so adding a module without listing it here fails the tests instead of
// quietly breaking the page offline.
const ASSETS = [
  './',
  './app.js',
  './favicon.js',
  './favicon.svg',
  './format.js',
  './index.html',
  './manifest.webmanifest',
  './style.css',
  './tick-worker.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Refresh the offline copy with whatever the network just served.
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      // ignoreSearch: a shared link like ./?preset=iso is the same page; the
      // settings live in the query string, not in a different file.
      .catch(() =>
        caches.match(request, { ignoreSearch: true }).then((hit) => hit ?? Response.error()),
      ),
  );
});
