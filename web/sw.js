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

/*
 * Every link to the page is the same file -- the settings live in the query
 * string -- so navigations are cached under one key without it. Keyed by the
 * full URL instead, each shared link kept its own copy, and an offline open
 * could get the oldest one next to this deploy's scripts.
 */
function cacheKey(request) {
  if (request.mode !== 'navigate') return request;
  const url = new URL(request.url);
  url.search = '';
  url.hash = '';
  return url.href;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const key = cacheKey(request);
  const cached = () => caches.match(key);
  event.respondWith(
    fetch(request).then(
      (response) => {
        if (response.ok) {
          // Refresh the offline copy with whatever the network just served;
          // waitUntil so the worker is not stopped halfway through the write.
          const copy = response.clone();
          event.waitUntil(
            caches
              .open(CACHE)
              .then((cache) => cache.put(key, copy))
              .catch(() => {}),
          );
          return response;
        }
        // The server is up but failing (a Pages outage, a deploy hiccup): the
        // copy we have beats an error page. A 404 is an answer, not a failure.
        if (response.status >= 500) return cached().then((hit) => hit ?? response);
        return response;
      },
      () => cached().then((hit) => hit ?? Response.error()),
    ),
  );
});
