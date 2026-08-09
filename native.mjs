/* native.mjs — the native bridge is inert on the web, and on device it only
   ever fills a hole.

   Two things are being protected here.

   The web build is the product. Every function in p4k_native.js must be a
   genuine no-op without Capacitor — not "handles the error", but never calls
   anything and never logs. A bridge that throws once per save would be
   invisible in testing and constant in the console.

   And the restore must never destroy anything. It exists for one situation:
   the WebView was cleared and localStorage came up empty while the native
   mirror still holds a year of training. Any other time it must decline —
   restoring a stale mirror over a state someone is already using would be a
   worse bug than the eviction it was written to survive.

   Run: node native.mjs */

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.GUZO_CHROME || undefined;
const html = readFileSync(join(ROOT, 'index.html'));
const swSrc = readFileSync(join(ROOT, 'sw.js'));

const server = http.createServer((req, res) => {
  if (req.url.split('?')[0] === '/sw.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    return res.end(swSrc);
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
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
const consoleAll = [];
page.on('console', m => consoleAll.push(m.type() + ': ' + m.text()));
page.on('pageerror', e => consoleAll.push('pageerror: ' + e.message));

/* A minimal stand-in for @capacitor/preferences. Deliberately not the real
   plugin: what is being tested is the app's half of the contract — that it
   writes the right thing, at the right time, and reads it back only when it
   should. */
const FAKE_CAPACITOR = `
  window.__prefStore = {};
  window.__prefWrites = 0;
  window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: {
      Preferences: {
        set: ({ key, value }) => { window.__prefWrites++; window.__prefStore[key] = value; return Promise.resolve(); },
        get: ({ key }) => Promise.resolve({ value: window.__prefStore[key] ?? null }),
        remove: ({ key }) => { delete window.__prefStore[key]; return Promise.resolve(); }
      },
      Haptics: { impact: () => Promise.resolve() }
    }
  };
`;

try {
  console.log('inert on the web\n');

  await page.goto(origin + '/', { waitUntil: 'load' });

  const web = await page.evaluate(() => {
    const before = { native: isNative(), caps: typeof window.Capacitor };
    S = blank(); S.onboarded = true; S.profile.name = 'Probe';
    let threw = null;
    try { save(true); mirrorToNative(); nativeHaptic('light'); }
    catch (e) { threw = e.message; }
    return { ...before, threw, saved: !!localStorage.getItem(KEY) };
  });
  check('no Capacitor means not native', web.native === false, String(web.caps));
  check('the bridge never throws without it', web.threw === null, String(web.threw));
  check('saving still works normally', web.saved === true);

  const restoreOnWeb = await page.evaluate(() => restoreFromNativeIfEmpty());
  check('restore declines on the web', restoreOnWeb === false);

  // ================= with a native shell =================================
  console.log('\nwith a native shell');

  const page2 = await ctx.newPage();
  const console2 = [];
  page2.on('console', m => console2.push(m.type() + ': ' + m.text()));
  page2.on('pageerror', e => console2.push('pageerror: ' + e.message));
  await page2.addInitScript(FAKE_CAPACITOR);
  await page2.goto(origin + '/', { waitUntil: 'load' });

  const detected = await page2.evaluate(() => isNative());
  check('the shell is detected', detected === true);

  /* The mirror is coalesced on a timer, so this waits rather than asserting
     immediately — checking too early would report a bug that is not there. */
  const mirrored = await page2.evaluate(async () => {
    S = blank(); S.onboarded = true; S.profile.name = 'Mirrored';
    S.sessions = [{ id: 's1', date: today(), type: 'full', exercises: [] }];
    save(true);
    await new Promise(r => setTimeout(r, 1600));
    const raw = window.__prefStore['guzo.v1'];
    return { wrote: !!raw, writes: window.__prefWrites, name: raw ? JSON.parse(raw).profile.name : null };
  });
  check('a save reaches the native mirror', mirrored.wrote === true);
  check('...carrying the real state', mirrored.name === 'Mirrored', String(mirrored.name));

  /* Many saves must not mean many 500 KB writes across the bridge. */
  const coalesced = await page2.evaluate(async () => {
    window.__prefWrites = 0;
    for (let i = 0; i < 25; i++) { S.profile.name = 'N' + i; save(true); }
    await new Promise(r => setTimeout(r, 1600));
    return window.__prefWrites;
  });
  check('twenty-five saves coalesce into one bridge write', coalesced === 1, String(coalesced));

  // ---- the recovery this whole thing exists for ----
  const recovered = await page2.evaluate(async () => {
    /* Exactly what an eviction looks like: the mirror survives, localStorage
       does not. */
    localStorage.removeItem('guzo.v1');
    S = blank();
    const did = await restoreFromNativeIfEmpty();
    return { did, onboarded: S.onboarded, sessions: (S.sessions || []).length,
             writtenBack: !!localStorage.getItem('guzo.v1') };
  });
  check('an emptied WebView is restored from the mirror', recovered.did === true);
  check('...with the history intact', recovered.sessions === 1, String(recovered.sessions));
  check('...and written back to localStorage', recovered.writtenBack === true);

  /* The rule that matters most. */
  const declined = await page2.evaluate(async () => {
    window.__prefStore['guzo.v1'] = JSON.stringify({
      onboarded: true, profile: { name: 'STALE' }, sessions: [{ id: 'old' }, { id: 'older' }]
    });
    S = blank(); S.onboarded = true; S.profile.name = 'CURRENT';
    S.sessions = [{ id: 'live' }];
    save(true);
    const did = await restoreFromNativeIfEmpty();
    return { did, name: S.profile.name, sessions: S.sessions.length };
  });
  check('a stale mirror never overwrites live data', declined.did === false);
  check('...and the live state is untouched', declined.name === 'CURRENT' && declined.sessions === 1,
    `${declined.name}/${declined.sessions}`);

  const blankMirror = await page2.evaluate(async () => {
    window.__prefStore['guzo.v1'] = JSON.stringify({ onboarded: false, sessions: [] });
    S = blank();
    return await restoreFromNativeIfEmpty();
  });
  check('an empty mirror is not restored over an empty state', blankMirror === false);

  check('no errors in the native context', console2.filter(l => /error|pageerror/i.test(l)).length === 0,
    console2.filter(l => /error|pageerror/i.test(l)).slice(0, 2).join(' | '));

  check('no errors in the web context', consoleAll.filter(l => /error|pageerror/i.test(l)).length === 0,
    consoleAll.filter(l => /error|pageerror/i.test(l)).slice(0, 2).join(' | '));

} finally {
  await browser.close();
  server.close();
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nfailures:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
