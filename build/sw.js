/* Guzo Fit — service worker.
   ============================================================
   Emitted to the site root by build.sh, alongside index.html.

   Why this is a real file. It used to be built as a Blob and registered by
   object URL, to keep the app to a single deployable file. That cannot work:
   the spec requires a service worker script to be fetched over http(s), and
   every browser rejects a blob: URL with "The URL protocol of the script is
   not supported". The registration was wrapped in an empty catch, so it failed
   on every load, in every browser, silently — no worker, no cache, and an app
   that claimed to work offline and did not. Hence one more file, and hence
   sw.mjs, which fails the suite if a worker ever stops registering again.

   Strategy. Navigation is network-first with a bounded wait, everything else
   is cache-first:

     online          fresh HTML, cache refreshed behind it
     slow network    cached copy after NET_TIMEOUT, fetch still refreshes
     offline         cached copy immediately
     never visited   nothing to serve; this is the one unavoidable case

   Network-first on navigation is what makes updates arrive. Cache-first there
   would pin a device to whatever it first loaded — the app has no in-page
   update prompt, so the cache must never be the reason a fix goes undelivered.
   The bounded wait is what keeps the offline promise honest on a bad hotel
   connection, where "online" and "offline" are not the only two states. */

/* The app appends ?v=<VERSION> when registering. A release therefore changes
   this worker's script URL, which installs a new worker and retires the old
   cache — without build-time templating, and without this file needing to know
   the version it was shipped with. */
const VERSION = new URL(self.location).searchParams.get('v') || 'dev';
const CACHE = 'guzo-' + VERSION;
const SHELL = './';
const NET_TIMEOUT = 3500;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      /* cache:'reload' so a warm HTTP cache cannot seed the offline copy with
         the very version this install is meant to replace. */
      const res = await fetch(SHELL, { cache: 'reload' });
      if (res && res.ok) await cache.put(SHELL, res);
    } catch (err) {
      /* A failed pre-cache must not block activation. The first successful
         navigation will populate the cache instead. */
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.startsWith('guzo-') && k !== CACHE).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  /* Same-origin only. The app makes no third-party requests at all, and
     caching one would be a surprise. */
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  e.respondWith(req.mode === 'navigate' ? navigate(req) : passive(req));
});

async function navigate(req) {
  const cache = await caches.open(CACHE);
  /* ignoreSearch so /?from=shortcut and friends still find the shell. */
  const cached = await cache.match(req, { ignoreSearch: true }) || await cache.match(SHELL);

  const net = fetch(req).then(res => {
    if (res && res.ok) cache.put(SHELL, res.clone()).catch(() => {});
    return res;
  });

  if (!cached) return net;

  /* Race, rather than await-then-fallback: a request that hangs rather than
     failing is the common case on a bad connection, and awaiting it would sit
     on a blank screen for as long as the network felt like taking. The fetch
     is deliberately left running when the cache wins — it still refreshes the
     shell for next time. */
  return Promise.race([
    net.catch(() => cached),
    new Promise(resolve => setTimeout(() => resolve(cached), NET_TIMEOUT))
  ]);
}

async function passive(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
  return res;
}
