/* blanks.mjs — no "undefined", "NaN" or "[object Object]" ever reaches a screen.

   Written for a confirmed bug, and kept for the class it belongs to.

   nutritionTileHTML() read S.nutrition.targets directly and interpolated it
   raw, so a profile with no height or age on file — which is what
   nut-target-reset leaves behind when energyTargets() returns null — rendered
   "0 / undefined kcal" and "0g of undefinedg" at the bottom of Today. The tile
   is gone now, replaced by nothing, because Fuel has its own tab and its own
   day card.

   Nothing caught it. contrast.mjs and collide.mjs assert plenty about where
   text sits and what colour it is, and nothing at all about what it says; the
   functional suite never rendered Today with Fuel on and empty targets. A
   placeholder leaking into the UI is invisible to every geometric check ever
   written, so it needs its own.

   The states below are chosen to be the awkward ones: empty targets, no body
   data, no history. Those are what a real first week looks like.

   Run: node blanks.mjs */

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

const SCREENS = ['today', 'plan', 'progress', 'more', 'fuel'];
const BAD = /\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b/;

/* States that have historically produced placeholder text. */
const STATES = {
  'fuel on, targets wiped, no body data': `
    S.settings.nutrition = true;
    S.nutrition.targets = {};
    delete S.profile.heightCm; delete S.profile.birthYear; delete S.profile.sex;
    S.profile.bodyweight = [];`,
  'fuel on, everything empty': `
    S.settings.nutrition = true;
    S.nutrition.targets = {};`,
  'fuel off': `
    S.settings.nutrition = false;`
};

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const ctx = await browser.newContext();
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

try {
  console.log('placeholder text\n');
  await page.goto(origin + '/', { waitUntil: 'load' });

  for (const [label, patch] of Object.entries(STATES)) {
    /* Seed through the app's own globals and reload, rather than
       addInitScript — an init script re-runs on every navigation and would
       quietly reset state mid-test, which has already produced one false
       "reloading destroys the session" finding in this project. */
    await page.evaluate(`(() => {
      S = blank();
      S.onboarded = true;
      S.profile.name = 'Probe';
      ${patch}
      save(true);
      buildWeekPlan(true);
    })()`);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(250);

    for (const screen of SCREENS) {
      const visible = await page.evaluate(s => {
        go(s);
        const el = document.getElementById('s-' + s);
        if (!el) return { missing: true };
        /* innerText, not textContent: it reflects what is actually painted,
           so a placeholder hidden behind a display:none branch is not counted
           as a failure the user would ever see. */
        return { text: el.innerText || '' };
      }, screen);

      if (visible.missing) { check(`${label} · ${screen} exists`, false, 'no #s-' + screen); continue; }

      /* An empty read would pass the placeholder check by having nothing in it
         to fail on — the same shape of lie as a contrast checker that sampled
         no pixels. Assert there was something to look at first. */
      if (!visible.text.trim()) { check(`${label} · ${screen} rendered anything`, false, 'empty'); continue; }

      const hit = visible.text.match(BAD);
      const line = hit
        ? (visible.text.split('\n').find(l => BAD.test(l)) || '').trim().slice(0, 90)
        : '';
      check(`${label} · ${screen}`, !hit, hit ? `"${line}"` : '');
    }
  }

  /* The More row that started all this: no paywall badge while the beta
     unlocks everything, and a control that looks like a control. */
  await page.evaluate(`(() => { S = blank(); S.onboarded = true; save(true); })()`);
  await page.reload({ waitUntil: 'load' });
  const row = await page.evaluate(() => {
    go('more');
    const el = document.querySelector('[data-act="toggle-fuel"]');
    if (!el) return null;
    return {
      badge: !!el.querySelector('.pro-tag'),
      hasSwitch: !!el.querySelector('.switch'),
      switchOn: !!el.querySelector('.switch.on'),
      navFuelHidden: document.getElementById('nav-fuel').classList.contains('hide')
    };
  });
  check('the Fuel row exists', !!row);
  check('no PRO badge while the beta unlocks everything', row && row.badge === false);
  check('the control is a switch, visible in both states', row && row.hasSwitch);
  check('switch reads off when Fuel is off', row && row.switchOn === false);
  check('Fuel is not in the nav when off', row && row.navFuelHidden === true);

  /* And the whole point: turning it on puts Fuel in the navbar. */
  const after = await page.evaluate(() => {
    document.querySelector('[data-act="toggle-fuel"]').click();
    return {
      navFuelHidden: document.getElementById('nav-fuel').classList.contains('hide'),
      navPlanHidden: document.getElementById('nav-plan').classList.contains('hide'),
      switchOn: !!document.querySelector('[data-act="toggle-fuel"] .switch.on'),
      tabs: [...document.querySelectorAll('#nav .nav-btn')].filter(b => !b.classList.contains('hide')).length
    };
  });
  check('turning Fuel on puts it in the nav', after && after.navFuelHidden === false);
  check('Route leaves the bar so the count stays at five', after && after.navPlanHidden === true);
  check('the switch reflects the new state', after && after.switchOn === true);
  check('exactly five tabs', after && after.tabs === 5, String(after && after.tabs));

  /* ---- the nav is a floating pill, and does not sit on the content ----
     It used to be a full-width slab whose padding plus the safe-area inset
     came to roughly 100px of permanent chrome. Floating it reclaims that, but
     only if every screen it covers can still scroll past it. */
  const nav = await page.evaluate(() => {
    go('today');
    const el = document.getElementById('nav');
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const btns = [...el.querySelectorAll('.nav-btn')].filter(b => !b.classList.contains('hide'));
    const screen = document.getElementById('s-today');
    return {
      position: cs.position,
      radius: parseFloat(cs.borderRadius),
      height: Math.round(r.height),
      detachedFromEdges: r.left > 0 && r.right < window.innerWidth,
      aboveBottom: window.innerHeight - r.bottom > 0,
      minBtn: Math.min(...btns.map(b => Math.round(b.getBoundingClientRect().height))),
      tabs: btns.length,
      screenPadBottom: parseFloat(getComputedStyle(screen).paddingBottom)
    };
  });
  check('the nav floats rather than sitting in the flow', nav.position === 'fixed', nav.position);
  check('it is a pill', nav.radius >= 24, String(nav.radius));
  check('it is detached from the screen edges', nav.detachedFromEdges);
  check('it sits above the bottom edge', nav.aboveBottom);
  check('it is shorter than the old bar', nav.height < 70, nav.height + 'px');
  check('every tab still clears a 44px touch target', nav.minBtn >= 44, nav.minBtn + 'px');
  check('exactly five tabs, still', nav.tabs === 5, String(nav.tabs));
  /* Without this the last card on every screen would sit under the pill. */
  check('screens can scroll clear of it', nav.screenPadBottom >= nav.height + 10,
    `pad ${nav.screenPadBottom} vs nav ${nav.height}`);

  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

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
