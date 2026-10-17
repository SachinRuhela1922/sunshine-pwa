/* Sunshine School service worker.
 * Bump VERSION when you change the precache list or caching rules.
 * (Any byte change to this file already makes browsers fetch a new worker.)
 */
const VERSION = 'v1';
const SHELL_CACHE = `sunshine-shell-${VERSION}`;
const PAGE_CACHE = `sunshine-pages-${VERSION}`;
const ASSET_CACHE = `sunshine-assets-${VERSION}`;
const CDN_CACHE = `sunshine-cdn-${VERSION}`;
const ALL_CACHES = [SHELL_CACHE, PAGE_CACHE, ASSET_CACHE, CDN_CACHE];

// Paths are relative to the service worker, so this also works under a sub-path.
const PRECACHE = [
  './',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './images/logo.png',
  './pwa.js'
];

const OFFLINE_URL = new URL('./offline.html', self.location).href;
const CDN_HOSTS = ['cdnjs.cloudflare.com'];

self.addEventListener('install', (event) => {
  // No skipWaiting here: a new version waits until the page asks for it (see pwa.js),
  // so a user is never switched to new code in the middle of filling a form.
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // Cache each file separately so one failure does not abort the whole install.
      Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => null)))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sunshine-') && !ALL_CACHES.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Never touch anything but GET (POST/PUT/DELETE go straight to the network).
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Third-party CDN libraries (versioned URLs, safe to cache).
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(cdnStrategy(req));
    return;
  }

  // Everything else cross-origin (including the API on onrender.com) is left alone:
  // no caching of API responses, tokens or private data.
  if (url.origin !== self.location.origin) return;

  // Never cache API-looking paths, even if same-origin.
  if (url.pathname.startsWith('/api/') || url.pathname.includes('/api/')) return;

  // Range requests are not safe to cache.
  if (req.headers.has('range')) return;

  if (req.mode === 'navigate') {
    event.respondWith(navigationStrategy(req));
    return;
  }

  event.respondWith(assetStrategy(req));
});

// HTML pages: network first so new deployments show up immediately,
// fall back to the cached copy, then to the offline page.
async function navigationStrategy(req) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  } catch (err) {
    const cached = (await cache.match(req)) || (await caches.match(req, { ignoreSearch: true }));
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    return offline || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

// Same-origin static files (images, icons, scripts): serve from cache, refresh in background.
async function assetStrategy(req) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = (await cache.match(req)) || (await caches.match(req));
  const network = fetch(req)
    .then((res) => {
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  if (cached) return cached;
  const res = await network;
  return res || new Response('', { status: 504, statusText: 'Offline' });
}

// CDN files: cache first (URLs are version-pinned), fill the cache on first success.
async function cdnStrategy(req) {
  const cache = await caches.open(CDN_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    // Cache only successful responses (opaque no-cors responses for <link>/<script> included).
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}
