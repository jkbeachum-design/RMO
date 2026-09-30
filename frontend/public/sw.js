/* RMO Operator offline shell — runtime cache for /operator* after first online visit.
   API routes are never cached. Dashboard navigations stay network-first without forcing offline UI. */
const CACHE_VERSION = 'rmo-operator-shell-v1';
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(PRECACHE_URLS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

function isOperatorPath(pathname) {
  return pathname === '/operator' || pathname.startsWith('/operator/');
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/icons/') ||
    pathname === '/manifest.json' ||
    pathname === '/favicon.ico' ||
    pathname === OFFLINE_URL
  );
}

function isApiRequest(pathname) {
  return pathname.startsWith('/api/');
}

function isRscRequest(request, url) {
  return request.headers.get('RSC') === '1' || url.searchParams.has('_rsc');
}

async function networkFirstNavigation(request, url) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh.ok && isOperatorPath(url.pathname)) {
      cache.put(request, fresh.clone());
      // Also store a bare pathname entry for offline hard navigations
      const bare = new Request(url.pathname, { credentials: 'same-origin' });
      cache.put(bare, fresh.clone());
    }
    return fresh;
  } catch {
    const cached =
      (await cache.match(request)) ||
      (await cache.match(url.pathname)) ||
      (await cache.match(OFFLINE_URL));
    if (cached) return cached;
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function cacheFirstStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    return (
      (await caches.match(request)) ||
      new Response('Offline', { status: 503, statusText: 'Offline' })
    );
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isApiRequest(url.pathname)) {
    // Never cache authenticated API responses in the SW.
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirstStatic(request));
    return;
  }

  // Soft RSC navigations: try network; if offline, fall back to cached document HTML.
  if (isRscRequest(request, url) && isOperatorPath(url.pathname)) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const html =
            (await cache.match(url.pathname)) || (await cache.match(OFFLINE_URL));
          if (html) return html;
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        }
      })()
    );
    return;
  }

  if (request.mode === 'navigate') {
    if (isOperatorPath(url.pathname)) {
      event.respondWith(networkFirstNavigation(request, url));
      return;
    }
    // Non-operator pages: pass through to network (dashboard stays online-first).
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match(OFFLINE_URL)) || new Response('Offline', { status: 503 });
      })
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
