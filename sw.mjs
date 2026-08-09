/* sw.mjs — does the service worker register, cache, survive offline, and still
   let an update through?

   Why this instrument exists. The previous worker was assembled as a Blob and
   registered by object URL. That is rejected by every browser — a worker script
   has to be fetched over http(s) — and the registration was wrapped in an empty
   catch, so it failed on every load and reported nothing. No worker existed, no
   cache existed, and the app claimed offline support it did not have. Reading
   the caching strategy told you nothing, because the code never ran.

   So this does not inspect the source. It drives a real browser, pulls the
   network out, and checks the app still opens. Then it puts the network back,
   changes what the server returns, and checks the change arrives — because a
   cache that survives being switched off is worthless if it also pins the
   device to the version it first saw.

   Run: node sw.mjs */

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.GUZO_CHROME || undefined;

const baseHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
const swSrc = readFileSync(join(ROOT, 'sw.js'), 'utf8');

/* Read the version out of the build rather than hardcoding it. A test that
   has to be edited every release is a test that gets deleted one release
   later — and `collide.mjs` printing a stale hardcoded count is exactly the
   kind of quiet lie this project has already been bitten by. */
const VERSION = (baseHtml.match(/const VERSION = '([^']+)'/) || [])[1];
if (!VERSION) {
  console.error('sw: could not read VERSION out of index.html — refusing to run a test that would pass vacuously');
  process.exit(2);
}
const NEXT_VERSION = VERSION.replace(/(\d+)$/, n => String(Number(n) + 1)) + '-test';

/* The server's payload is mutable so a release can be simulated mid-run. */
let html = baseHtml;
let requests = 0;

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  requests++;
  if (path === '/sw.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(swSrc);
  }
  if (path === '/' || path === '/index.html') {
    /* max-age, not no-cache, because that is what GitHub Pages actually sends
       for HTML. Serving no-cache here made the update check pass against a
       worker whose "network-first" fetch was quietly being answered from the
       browser's HTTP cache — the test was kinder than production and missed a
       real bug because of it. */
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'max-age=600' });
    return res.end(html);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

let pass = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log(`  ok    ${name}`); }
  else { failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const ctx = await browser.newContext();
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

/* Wait until a worker is not merely registered but controlling the page —
   an activated worker that has not claimed this client would still leave the
   next navigation going straight to the network. */
/* navigator.serviceWorker.ready never settles when nothing registers — which
   is precisely the regression this file exists to catch, so awaiting it bare
   makes the instrument hang on its most important failure instead of
   reporting it. Bounded, always. */
async function swReady(p, ms = 8000) {
  return p.evaluate(t => Promise.race([
    navigator.serviceWorker.ready.then(() => true),
    new Promise(r => setTimeout(() => r(false), t))
  ]), ms);
}

async function awaitControl(p, ms = 10000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    /* The app reloads itself when a new worker takes control, so any evaluate
       here can lose its execution context mid-call. That is the feature
       working, not a failure — swallow it and look again. */
    let got = false;
    try { got = await p.evaluate(() => !!navigator.serviceWorker.controller); }
    catch (e) { if (!/context was destroyed|Target closed|Execution context/i.test(e.message)) throw e; }
    if (got) return true;
    await p.waitForTimeout(150);
  }
  return false;
}

/* Poll for the worker that should have taken over, rather than sleeping a
   guessed interval. A fixed wait either flakes or hides a real regression
   behind a longer sleep; this reports honestly when the handover never
   happens. */
async function awaitActiveScript(p, needle, ms = 15000) {
  const deadline = Date.now() + ms;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await p.evaluate(async () => {
        const rs = await navigator.serviceWorker.getRegistrations();
        return rs.map(r => `${(r.active || {}).scriptURL || ''}#${(r.active || {}).state || ''}`).join(',');
      });
    } catch (e) {
      /* Reload in flight — the controller handover is exactly what we are
         waiting for, so this is progress, not an error. */
      if (!/context was destroyed|Target closed|Execution context/i.test(e.message)) throw e;
      await p.waitForTimeout(200);
      continue;
    }
    /* 'activated', not merely present: registration.active is already set
       while the worker is still 'activating', i.e. before its activate
       handler's waitUntil has finished retiring the previous caches. Reading
       caches.keys() at that point races the cleanup and fails intermittently
       on work the app does correctly. */
    if (last.includes(needle) && last.includes('#activated')) return { ok: true, last };
    await p.waitForTimeout(200);
  }
  return { ok: false, last };
}

try {
  console.log('service worker\n');

  // ---- 1. registers and takes control ----------------------------------
  await page.goto(origin + '/', { waitUntil: 'load' });
  await swReady(page);
  const controlled = await awaitControl(page);

  const reg = await page.evaluate(async () => {
    const rs = await navigator.serviceWorker.getRegistrations();
    return rs.map(r => ({
      scope: r.scope,
      script: (r.active || r.waiting || r.installing || {}).scriptURL || null,
      state: (r.active || r.waiting || r.installing || {}).state || null
    }));
  });
  check('registers a worker', reg.length === 1, `got ${reg.length}`);
  check('worker is activated', reg[0] && reg[0].state === 'activated', reg[0] && reg[0].state);
  check('worker controls the page', controlled);
  check('script is a real http(s) URL, not a blob',
    !!reg[0] && /^https?:/.test(reg[0].script || ''), reg[0] && reg[0].script);

  // ---- 2. the shell is actually cached ----------------------------------
  const cacheState = await page.evaluate(async () => {
    const keys = await caches.keys();
    const out = { keys, entries: [] };
    for (const k of keys) {
      const c = await caches.open(k);
      out.entries.push(...(await c.keys()).map(r => r.url));
    }
    return out;
  });
  check('a versioned cache exists', cacheState.keys.length === 1 && /^guzo-/.test(cacheState.keys[0]),
    JSON.stringify(cacheState.keys));
  check('cache is keyed to the app VERSION', cacheState.keys[0] === 'guzo-' + VERSION,
    `${cacheState.keys[0]} vs guzo-${VERSION}`);
  check('the shell is in the cache', cacheState.entries.length > 0,
    `${cacheState.entries.length} entries`);

  // ---- 3. it opens with the network switched off -------------------------
  await ctx.setOffline(true);
  const offlineErrors = [];
  const onErr = m => { if (m.type() === 'error') offlineErrors.push(m.text()); };
  page.on('console', onErr);

  let offlineBooted = false, offlineTitle = '';
  try {
    await page.goto(origin + '/', { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    offlineBooted = await page.evaluate(() => !!window.__guzoBooted);
    offlineTitle = await page.title();
  } catch (e) {
    offlineBooted = false;
    offlineTitle = 'navigation threw: ' + e.message;
  }
  page.off('console', onErr);

  check('opens with the network off', offlineBooted, offlineTitle);
  /* The panel is retired by removing .on, not by adding .hide — it is a
     .screen, and .on is what makes a screen the visible one. */
  const bootRetired = offlineBooted && await page.evaluate(() => {
    const b = document.getElementById('s-boot');
    return !!b && !b.classList.contains('on');
  }).catch(() => false);
  check('offline boot retires the fallback panel', bootRetired);

  // ---- 4. an update still gets through -----------------------------------
  /* The cache must not become the reason a fix never lands. Change what the
     server returns and confirm the next online load serves the new bytes. */
  await ctx.setOffline(false);
  html = baseHtml.replace('</body>', '<script>window.__probe="shipped"</script></body>');
  check('probe marker was injectable', html !== baseHtml);

  await page.goto(origin + '/', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const gotUpdate = await page.evaluate(() => window.__probe || null);
  check('a new deploy reaches a controlled page', gotUpdate === 'shipped', String(gotUpdate));

  /* ...and that update must itself have been cached, or the device would fall
     back to the stale copy the moment it went offline again. */
  await ctx.setOffline(true);
  /* Guarded: with no worker there is nothing to answer this navigation, and an
     unguarded goto turns a reportable failure into a crashed run with no
     summary. */
  let offlineHasUpdate = null;
  try {
    await page.goto(origin + '/', { waitUntil: 'load' });
    await page.waitForTimeout(800);
    offlineHasUpdate = await page.evaluate(() => window.__probe || null);
  } catch (e) {
    offlineHasUpdate = 'navigation threw: ' + e.message.split('\n')[0];
  }
  check('the refreshed shell is what offline now serves', offlineHasUpdate === 'shipped', String(offlineHasUpdate));
  await ctx.setOffline(false);

  // ---- 5. a version bump retires the old cache ---------------------------
  html = baseHtml.replace(`const VERSION = '${VERSION}'`, `const VERSION = '${NEXT_VERSION}'`);
  check('version bump was injectable', html !== baseHtml);

  await page.goto(origin + '/', { waitUntil: 'load' });
  const handover = await awaitActiveScript(page, 'v=' + encodeURIComponent(NEXT_VERSION));
  check('a release installs a new worker', handover.ok, handover.last);

  const afterBump = await page.evaluate(() => caches.keys());
  check('a release installs a new cache', afterBump.includes('guzo-' + NEXT_VERSION), JSON.stringify(afterBump));
  /* Requires the new cache to be present as well. Asserting only the absence
     of the old one passes cheerfully when there are no caches at all — which
     is exactly the state this whole file exists to detect. */
  check('a release retires the previous cache',
    afterBump.includes('guzo-' + NEXT_VERSION) && !afterBump.includes('guzo-' + VERSION),
    JSON.stringify(afterBump));

  // ---- 6. no console errors anywhere -------------------------------------
  check('no console errors', consoleErrors.length === 0, consoleErrors.join(' | '));

} finally {
  await browser.close();
  server.close();
}

console.log(`\n${pass} passed, ${failures.length} failed (${requests} requests served)`);
if (failures.length) {
  console.log('\nfailures:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
