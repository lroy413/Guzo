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
    /* The Fuel switch moved off More and into the Settings sheet when More
       became a hub of destinations. Same guarantees, one tap deeper. */
    document.querySelector('[data-act="open-settings"]').click();
    const el = document.querySelector('#sheet-body [data-act="set-toggle-fuel"]');
    if (!el) return null;
    return {
      badge: !!el.querySelector('.pro-tag'),
      hasSwitch: !!el.querySelector('.switch'),
      switchOn: !!el.querySelector('.switch.on'),
      navFuelHidden: document.getElementById('nav-fuel').classList.contains('hide')
    };
  });
  check('the Fuel row exists in Settings', !!row);
  check('no PRO badge while the beta unlocks everything', row && row.badge === false);
  check('the control is a switch, visible in both states', row && row.hasSwitch);
  check('switch reads off when Fuel is off', row && row.switchOn === false);
  check('Fuel is not in the nav when off', row && row.navFuelHidden === true);

  /* And the whole point: turning it on puts Fuel in the navbar. */
  const after = await page.evaluate(() => {
    document.querySelector('#sheet-body [data-act="set-toggle-fuel"]').click();
    return {
      navFuelHidden: document.getElementById('nav-fuel').classList.contains('hide'),
      navPlanHidden: document.getElementById('nav-plan').classList.contains('hide'),
      switchOn: !!document.querySelector('#sheet-body [data-act="set-toggle-fuel"] .switch.on'),
      tabs: [...document.querySelectorAll('#nav .nav-btn')].filter(b => !b.classList.contains('hide')).length
    };
  });
  check('turning Fuel on puts it in the nav', after && after.navFuelHidden === false);
  check('Route leaves the bar so the count stays at five', after && after.navPlanHidden === true);
  check('the switch reflects the new state', after && after.switchOn === true);
  check('exactly five tabs', after && after.tabs === 5, String(after && after.tabs));

  await page.evaluate(() => closeSheet());

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

  /* ---- the Settings sheet ----
     More is a hub of destinations now; everything you tune lives behind one
     row. The risk in a move like this is an orphaned action — a row that
     renders perfectly and does nothing when tapped, because its `case` was
     never reachable from here. So every row is actually clicked. */
  const more = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.settings.nutrition = false; save(true);
    go('more');
    const body = document.getElementById('more-body');
    const acts = [...body.querySelectorAll('[data-act]')].map(e => e.dataset.act);
    return {
      settingsRows: body.querySelectorAll('[data-act="open-settings"]').length,
      // these moved into Settings and must no longer sit loose on More
      strays: ['rest-settings','plate-settings','export','import','reset','open-program','edit-envs']
        .filter(a => acts.includes(a)),
      text: body.innerText || ''
    };
  });
  check('More has exactly one Settings row', more.settingsRows === 1, String(more.settingsRows));
  check('the tunables no longer sit loose on More', more.strays.length === 0, more.strays.join(', '));
  check('More still renders text', more.text.length > 100, String(more.text.length));
  check('no placeholder text on More', !BAD.test(more.text));

  const sheet = await page.evaluate(() => {
    document.querySelector('[data-act="open-settings"]').click();
    const b = document.getElementById('sheet-body');
    const acts = [...b.querySelectorAll('[data-act]')].map(e => e.dataset.act);
    return { text: b.innerText || '', acts };
  });
  check('the Settings sheet opens', sheet.text.length > 100, String(sheet.text.length));
  check('no placeholder text in Settings', !BAD.test(sheet.text));
  for (const need of ['open-program','edit-envs','rest-settings','plate-settings',
                      'set-toggle-warmup','set-toggle-fuel','edit-profile',
                      'export','import','reset']) {
    check(`Settings offers ${need}`, sheet.acts.includes(need));
  }

  /* Every navigational row must actually open something. A row whose case is
     missing would silently do nothing, which looks identical to a row nobody
     has tapped yet. */
  for (const act of ['open-program','edit-envs','rest-settings','plate-settings','edit-profile']) {
    const res = await page.evaluate(a => {
      go('more');
      document.querySelector('[data-act="open-settings"]').click();
      const before = document.getElementById('sheet-body').innerText || '';
      const el = document.querySelector(`#sheet-body [data-act="${a}"]`);
      if (!el) return { ok: false, why: 'row missing' };
      el.click();
      const after = document.getElementById('sheet-body').innerText || '';
      return { ok: after.length > 40 && after !== before, why: after.slice(0, 40) };
    }, act);
    check(`${act} opens its sheet`, res.ok, res.why);
  }

  /* A switch inside a sheet has to update the sheet. The More-screen handlers
     re-render More, which would leave the open sheet showing the old state. */
  const toggled = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.settings.nutrition = false;
    S.settings.warmup = false; save(true);
    go('more');
    document.querySelector('[data-act="open-settings"]').click();
    document.querySelector('#sheet-body [data-act="set-toggle-warmup"]').click();
    const warmOn = !!document.querySelector('#sheet-body [data-act="set-toggle-warmup"] .switch.on');
    document.querySelector('#sheet-body [data-act="set-toggle-fuel"]').click();
    return {
      warmSwitchOn: warmOn,
      warmState: S.settings.warmup,
      fuelState: S.settings.nutrition,
      fuelSwitchOn: !!document.querySelector('#sheet-body [data-act="set-toggle-fuel"] .switch.on'),
      navFuelShown: !document.getElementById('nav-fuel').classList.contains('hide'),
      dietRowAppeared: !!document.querySelector('#sheet-body [data-act="open-diet-prefs"]')
    };
  });
  check('the warm-up switch flips the setting', toggled.warmState === true);
  check('...and the sheet redraws to show it', toggled.warmSwitchOn === true);
  check('the Fuel switch flips the setting', toggled.fuelState === true);
  check('...and the sheet redraws to show it', toggled.fuelSwitchOn === true);
  check('...and Fuel joins the nav from inside Settings', toggled.navFuelShown === true);
  check('...and "How you eat" appears once Fuel is on', toggled.dietRowAppeared === true);

  /* The evidence prose lives in exactly one place: the "why" help page. More
     used to carry a shorter copy of the same studies, and two copies of the
     same prose drift — one gets updated, the other quietly starts lying. */
  const evidence = await page.evaluate(() => {
    go('more');
    const moreText = document.getElementById('more-body').innerText || '';
    document.querySelector('[data-act="open-settings"]').click();
    const link = document.querySelector('#sheet-body [data-act="help-page"][data-v="why"]');
    if (!link) return { linked: false };
    link.click();
    const t = document.getElementById('sheet-body').innerText || '';
    return {
      linked: true,
      moreHasProse: /Bondaronek|58,881/.test(moreText),
      pageHasProse: /Bondaronek/.test(t),
      pageHasAll: /Bondaronek/.test(t) && /Lally/.test(t) && /Stamatakis/.test(t),
      text: t
    };
  });
  check('Settings links to the evidence', evidence.linked);
  check('More no longer carries a second copy of it', evidence.moreHasProse === false);
  check('the link opens the real evidence page', evidence.pageHasProse === true);
  check('...which carries all the studies, not a subset', evidence.pageHasAll === true);
  check('no placeholder text on it', !BAD.test(evidence.text || ''));

  /* ---- App Store readiness ---- */

  /* A subscription offer with nothing behind it reads as an incomplete app. */
  const paywall = await page.evaluate(() => {
    go('more');
    const reachable = !!document.querySelector('#more-body [data-act="open-paywall"]');
    const before = document.getElementById('sheet-body').innerText || '';
    const b = document.createElement('button');
    b.setAttribute('data-act', 'open-paywall');
    document.body.appendChild(b); b.click(); b.remove();
    const after = document.getElementById('sheet-body').innerText || '';
    return { reachable, opened: after !== before, after: after.slice(0, 60) };
  });
  check('the paywall is not reachable from More', paywall.reachable === false);
  check('...and the action refuses even if invoked directly', paywall.opened === false, paywall.after);

  /* The store needs a policy, and it has to say the true thing. */
  const privacy = await page.evaluate(() => {
    go('more');
    document.querySelector('[data-act="open-settings"]').click();
    const link = document.querySelector('#sheet-body [data-act="help-page"][data-v="privacy"]');
    if (!link) return { linked: false };
    link.click();
    return { linked: true, text: document.getElementById('sheet-body').innerText || '' };
  });
  check('Settings links to a privacy page', privacy.linked);
  check('it states there is no account or server', /no account|no server|no backend/i.test(privacy.text || ''));
  check('it states nothing is collected or sent', /no analytics|not collected|nothing is collected/i.test(privacy.text || ''));
  check('it covers health data and disclaims medical advice', /health/i.test(privacy.text || '') && /medical advice/i.test(privacy.text || ''));
  check('no placeholder text in it', !BAD.test(privacy.text || ''));

  /* Interactive divs must be focusable and announced. 36 of them were neither,
     which made parts of the app pointer-only. */
  await page.waitForTimeout(100);   // let the observer settle on renderX() paths
  const a11y = await page.evaluate(() => {
    const NATIVE = 'button,a,input,select,textarea,summary';
    const bad = [];
    ['today', 'plan', 'progress', 'more', 'fuel'].forEach(scr => {
      go(scr);
      document.querySelectorAll(`#s-${scr} [data-act],#s-${scr} [data-go]`).forEach(el => {
        if (el.matches(NATIVE)) return;
        if (el.querySelector(NATIVE)) return;
        if (el.getAttribute('role') !== 'button' || el.getAttribute('tabindex') !== '0') {
          bad.push(scr + ':' + (el.dataset.act || el.dataset.go));
        }
      });
    });
    return { bad: bad.slice(0, 6), count: bad.length };
  });
  check('every interactive div is focusable and announced', a11y.count === 0,
    a11y.count + ' unreachable: ' + a11y.bad.join(', '));

  /* Focusable but inert is worse than unreachable — it takes a tab stop and
     does nothing. */
  const keyboard = await page.evaluate(() => {
    go('more');
    const row = document.querySelector('#more-body [data-act="open-settings"]');
    row.focus();
    const focused = document.activeElement === row;
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const opened = (document.getElementById('sheet-body').innerText || '').length > 100;
    return { focused, opened };
  });
  check('an interactive div can take keyboard focus', keyboard.focused);
  check('...and Enter activates it', keyboard.opened);

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
