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
/* The deploy is four files, not one, and three of them have to be fetched over
   http to do their jobs. Served here rather than folded into the HTML so a
   missing one fails the same way it would on a host. */
const SIDECARS = {
  '/sw.js': ['text/javascript', 'sw.js'],
  '/manifest.webmanifest': ['application/manifest+json', 'manifest.webmanifest'],
  '/icon.svg': ['image/svg+xml', 'icon.svg'],
};
const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  /* Anything that looks like an asset and is not one 404s, the way a host
     would. Serving the app's HTML for every path made a manifest pointing at a
     missing icon return 200 and pass a check whose whole job was to notice. */
  if (/\.[a-z0-9]+$/i.test(path) && !SIDECARS[path]) {
    res.writeHead(404); return res.end('missing');
  }
  const side = SIDECARS[path];
  if (side) {
    try {
      const body = readFileSync(join(ROOT, side[1]));
      res.writeHead(200, { 'Content-Type': side[0] });
      return res.end(body);
    } catch (e) { res.writeHead(404); return res.end('missing'); }
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

  /* ---- the home indicator is respected once, not twice ----
     Everything above measures at a zero inset, which is all a desktop browser
     reports — so "it sits above the bottom edge" passed at 10px and would have
     passed at 400px. On a real iPhone the nav was 44px up: its own 10px margin
     plus the whole 34px safe-area inset, which is the same clearance counted
     twice. The app read as stopping short of the bottom of the screen.

     The inset exists so that a bar pinned flat to the edge clears the
     indicator. A floating pill already holds itself off, so it should grow by
     *some* of the inset and not all of it — that is the invariant here, and it
     is expressed as a comparison rather than a magic number so it survives
     someone retuning the offset.

     The indicator is a ~5px bar about 8px from the edge, so 13px is the real
     obstacle. Anything past that is styling; anything under it is a control
     fighting a system gesture. */
  const indicator = await page.evaluate(() => {
    go('today');
    const at = (inset) => {
      document.documentElement.style.setProperty('--safe-b', inset);
      const r = document.getElementById('nav').getBoundingClientRect();
      const sc = document.getElementById('s-today');
      return { gap: Math.round(window.innerHeight - r.bottom),
               h: Math.round(r.height),
               pad: Math.round(parseFloat(getComputedStyle(sc).paddingBottom)) };
    };
    const flat = at('0px');
    const phone = at('34px');
    document.documentElement.style.removeProperty('--safe-b');
    return { flat, phone, grew: phone.gap - flat.gap };
  });
  check('the nav moves up for the home indicator',
    indicator.grew > 0, `${indicator.flat.gap}px → ${indicator.phone.gap}px`);
  check('...without counting the inset twice',
    indicator.grew < 34, `grew by ${indicator.grew} of a 34px inset`);
  check('...and still clears the indicator itself',
    indicator.phone.gap >= 18, `${indicator.phone.gap}px above the edge`);
  /* Reserved space tracks the pill rather than being a round number with the
     whole inset stacked on top — that was 130px of padding under 85px of nav,
     which is the dead band at the bottom of every screen. */
  check('...and no screen reserves more room than the nav occupies',
    indicator.phone.pad >= indicator.phone.h + indicator.phone.gap
    && indicator.phone.pad <= indicator.phone.h + indicator.phone.gap + 25,
    `pad ${indicator.phone.pad} for ${indicator.phone.h} + ${indicator.phone.gap}`);

  /* ---- what floats above the nav floats with it ----
     The rest timer and the toast are both pinned a fixed distance off the
     bottom, which means their offsets encode the nav's. Retuning the nav
     without them leaves the timer hovering with a gap under it — and the two
     only disagree once a real inset exists, so a desktop measurement shows
     nothing wrong. Asserted as "the gap does not change with the inset",
     which is the actual invariant and does not need updating when someone
     moves the nav again.

     Both have to be forced into their shown state to be measured at all: the
     toast sits 20px lower until it gets `.on`, and `.rest` is display:none
     until a rest is running. Measured in the hidden state they read as
     overlapping the nav, which is a probe artefact and not a bug. */
  const floaters = await page.evaluate(async () => {
    S = blank(); S.onboarded = true; save(true); buildWeekPlan(true);
    startSession('full', 'full', 60); go('train'); renderTrain();
    const at = async (inset) => {
      document.documentElement.style.setProperty('--safe-b', inset);
      toast('measuring');
      const t = document.querySelector('.toast');
      const rest = document.querySelector('.rest');
      if (t) t.classList.add('on');
      if (rest) rest.classList.add('on');
      /* Wait for both to STOP moving rather than sleeping a fixed 340ms. Both
         slide in on a transition, and a fixed wait is only long enough until
         the app gets heavier — this went red the day More became a full-screen
         scene, reporting a 10px overlap that does not exist and cannot be
         reproduced on its own. Two identical frames in a row is settled. */
      const rects = () => [t, rest].map(e => e ? Math.round(e.getBoundingClientRect().bottom) : 0).join(',');
      let last = '', same = 0;
      for (let i = 0; i < 90 && same < 3; i++) {
        await new Promise(r => requestAnimationFrame(r));
        const now = rects();
        same = now === last ? same + 1 : 0;
        last = now;
      }
      const nav = document.getElementById('nav').getBoundingClientRect();
      return {
        toast: t ? Math.round(nav.top - t.getBoundingClientRect().bottom) : null,
        rest: rest ? Math.round(nav.top - rest.getBoundingClientRect().bottom) : null
      };
    };
    const flat = await at('0px');
    const phone = await at('34px');
    document.documentElement.style.removeProperty('--safe-b');
    return { flat, phone };
  });
  /* Within 2px rather than identical. Both gaps are the difference between two
     separately-rounded rectangles, so a fractional layout height can move one
     of them by a pixel — which is not the bug. The bug is the gap growing by
     the whole 34px inset, and a 2px tolerance still catches that with plenty
     to spare. Demanding exact equality made this fail on a 1px rounding
     wobble, which is a check crying wolf about its own arithmetic. */
  const tracks = (a, b) => a !== null && b !== null && Math.abs(a - b) <= 2;
  check('the rest timer sits just above the nav, at any inset',
    tracks(floaters.flat.rest, floaters.phone.rest)
    && floaters.phone.rest >= 0 && floaters.phone.rest <= 20,
    `${floaters.flat.rest}px flat, ${floaters.phone.rest}px on a phone`);
  check('...and so does the toast',
    tracks(floaters.flat.toast, floaters.phone.toast)
    && floaters.phone.toast >= 0 && floaters.phone.toast <= 30,
    `${floaters.flat.toast}px flat, ${floaters.phone.toast}px on a phone`);

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

  /* ---- a self-redrawing sheet must not throw you back to the top ----
     Building a routine is two sheets handing back and forth — the builder
     redraws on every nudge of the reps, the picker redraws on every exercise
     you add, and both are wholesale innerHTML writes. openSheet used to reset
     scrollTop unconditionally, so past the third movement every tap threw you
     to the top of a long list.

     This is invisible to every other instrument here: the markup is correct,
     the contrast is correct, nothing collides, and the app is still unusable
     for the one job. So it gets measured directly. */
  const scrollProbe = await page.evaluate(async () => {
    S = blank(); S.onboarded = true; save(true);
    go('today');
    const sh = document.getElementById('sheet');
    const out = {};

    const r = newRoutine('Scroll probe');
    /* Long enough that the builder genuinely overflows 88vh. */
    EXLIST.slice(0, 12).forEach(e => addToRoutine(r.id, e.id));
    save(true);

    sheetRoutineEdit(r.id);
    out.builderScrollable = sh.scrollHeight - sh.clientHeight;
    out.opensAtTop = sh.scrollTop;

    const mid = Math.round(out.builderScrollable / 2);
    sh.scrollTop = mid;
    out.parked = sh.scrollTop;

    // 1. nudging the reps redraws the builder
    document.querySelector('#sheet-body [data-act="rt-adj"][data-i="4"][data-f="reps"][data-d="1"]').click();
    out.afterRepNudge = sh.scrollTop;

    // 2. the picker opens over it, at its own top
    document.querySelector('#sheet-body [data-act="rt-add"]').click();
    out.pickerOpensAtTop = sh.scrollTop;

    /* A query opens every accordion group, which is what makes the picker
       long enough to have a scroll position worth keeping. */
    const qi = document.getElementById('pick-q');
    qi.value = 'e';
    qi.dispatchEvent(new Event('input', { bubbles: true }));
    out.pickerScrollable = sh.scrollHeight - sh.clientHeight;
    sh.scrollTop = Math.round(out.pickerScrollable / 2);
    const pickerAt = sh.scrollTop;

    // 3. adding an exercise redraws the picker
    const row = [...document.querySelectorAll('#sheet-body [data-act="pick-ex"]')]
      .find(b => b.getBoundingClientRect().top > 0);
    row.click();
    out.pickerHeld = sh.scrollTop === pickerAt;
    out.pickerWas = pickerAt; out.pickerNow = sh.scrollTop;
    out.added = routineById(r.id).items.length;

    // 4. Done hands back to the builder, where it was
    document.querySelector('#sheet-body [data-act="pick-finish"]').click();
    out.backOnBuilder = /Scroll probe/.test(document.getElementById('sheet-body').innerText || '');
    out.builderRestored = sh.scrollTop;

    // 5. a genuinely different sheet still starts at the top
    sheetSettings();
    out.otherSheetAtTop = sh.scrollTop;

    // 6. and closing forgets, so tomorrow's open is not mid-list
    closeSheet();
    sheetRoutineEdit(r.id);
    out.reopenAtTop = sh.scrollTop;
    closeSheet();
    return out;
  });
  check('the routine builder is long enough to have a scroll position',
    scrollProbe.builderScrollable > 200, String(scrollProbe.builderScrollable));
  check('it opens at the top', scrollProbe.opensAtTop === 0, String(scrollProbe.opensAtTop));
  check('nudging the reps keeps your place', scrollProbe.afterRepNudge === scrollProbe.parked,
    `${scrollProbe.parked} → ${scrollProbe.afterRepNudge}`);
  check('the picker opens at its own top', scrollProbe.pickerOpensAtTop === 0,
    String(scrollProbe.pickerOpensAtTop));
  check('the picker is long enough to have a scroll position',
    scrollProbe.pickerScrollable > 200, String(scrollProbe.pickerScrollable));
  check('choosing an exercise keeps your place in the picker', scrollProbe.pickerHeld === true,
    `${scrollProbe.pickerWas} → ${scrollProbe.pickerNow}`);
  check('...and actually adds it', scrollProbe.added === 13, String(scrollProbe.added));
  check('Done hands back to the builder', scrollProbe.backOnBuilder === true);
  check('...where you left it, not at the top', scrollProbe.builderRestored === scrollProbe.parked,
    `${scrollProbe.parked} → ${scrollProbe.builderRestored}`);
  check('a different sheet still starts at the top', scrollProbe.otherSheetAtTop === 0,
    String(scrollProbe.otherSheetAtTop));
  check('closing the sheet forgets where you were', scrollProbe.reopenAtTop === 0,
    String(scrollProbe.reopenAtTop));

  /* ---- recovery days ----
     The engine side is covered in engine.mjs. What matters here is that a
     recovery day is reachable at all: choosable for a day, distinct on Today,
     and startable in one tap. A generator nobody can get to is not a feature. */
  const recoverable = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    go('plan');
    sheetPlanDay(today());
    const chip = document.querySelector('#sheet-body [data-act="plan-set"][data-v="recovery"]');
    return { offered: !!chip, label: chip ? chip.textContent.trim() : '' };
  });
  check('a day can be set to Recovery', recoverable.offered === true);
  check('...and the chip says so', recoverable.label === 'Recovery', recoverable.label);

  /* Driven through the real path — chip, then "just this day" — rather than
     writing week.plan directly: buildWeekPlan() rebuilds any week whose start
     key does not match, so a hand-written entry vanishes on the next render
     and the probe would be testing nothing. */
  const recHero = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    go('plan');
    sheetPlanDay(today());
    /* Defensively: a missing chip has to read as a failed check, not an
       exception that takes the whole instrument down before it reports. */
    const chip = document.querySelector('#sheet-body [data-act="plan-set"][data-v="recovery"]');
    if (chip) chip.click();
    const only = document.querySelector('#sheet-body [data-act="plan-apply"][data-m="only"]');
    if (only) only.click();
    closeSheet(); go('today');
    const body = document.getElementById('today-body');
    const text = body.innerText || '';
    const hero = body.querySelector('.hero');
    return {
      text,
      planned: (S.week.plan[today()] || {}).type,
      /* Not just the word "Recovery" — the ordinary training hero prints that
         too, from typeLabel(). The mobility count is the recovery hero's own. */
      titled: /mobility/i.test((hero && hero.innerText) || ''),
      startable: !!body.querySelector('[data-act="start-session"][data-type="recovery"]'),
      /* The size ladder answers "how hard should today be", which is not a
         question a recovery day asks. */
      ladder: !!body.querySelector('[data-act="open-ladder"]'),
      checkin: !!body.querySelector('[data-act="open-readiness"]'),
      mins: parseInt((hero && hero.querySelector('.hm-v') || {}).textContent || '', 10)
    };
  });
  check('choosing it lands on the day', recHero.planned === 'recovery', String(recHero.planned));
  check('Today shows a recovery hero, not a training one', recHero.titled === true);
  check('no placeholder text on it', !BAD.test(recHero.text));
  check('...it can be started in one tap', recHero.startable === true);
  check('...it claims a real length', recHero.mins >= 4 && recHero.mins <= 30, String(recHero.mins));
  check('...and offers no size ladder', recHero.ladder === false);
  check('...nor a readiness check-in', recHero.checkin === false);

  const recRun = await page.evaluate(() => {
    const btn = document.querySelector('#today-body [data-act="start-session"][data-type="recovery"]');
    if (!btn) return { started: false };
    btn.click();
    const A = S.active;
    if (!A) return { started: false };
    const text = document.getElementById('train-body').innerText || '';
    return {
      started: true, type: A.type, n: A.exercises.length,
      allMobility: A.exercises.every(i => (EX[i.exId] || {}).pattern === 'mobility'),
      text, named: A.exercises.every(i => text.includes(i.name))
    };
  });
  check('starting it opens a real session', recRun.started === true);
  check('...of the right type', recRun.type === 'recovery', recRun.type);
  check('...made of mobility work', recRun.allMobility === true);
  check('...and every movement is named on the screen', recRun.named === true);
  check('no placeholder text on the recovery session', !BAD.test(recRun.text));

  /* A day you marked off is not the same as a recovery day, and the copy must
     not start owing you something. The stretch offer is an escape hatch next
     to the existing one, not an obligation. */
  const restDay = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.active = null;
    S.week.days[today()] = { avail: 'none', env: 'full', note: '' };
    save(true);
    go('today');
    const body = document.getElementById('today-body');
    const text = body.innerText || '';
    return {
      text,
      restDay: /rest day/i.test(text),
      stretch: !!body.querySelector('[data-act="start-session"][data-type="recovery"]'),
      micro: !!body.querySelector('[data-act="quick-rung"][data-v="micro"]'),
      /* The product rule, asserted positively. A keyword blocklist cannot tell
         "nothing is owed" from "you owe a session" — it flagged the correct
         copy on the first run. The rule is that the day is explicitly free,
         so check for that sentence and let a rewrite that drops it go red. */
      free: /nothing is owed/i.test(text),
      /* Adding a third option must not turn the offers into instructions. */
      imperative: /you should|make sure|don't skip|at least/i.test(text)
    };
  });
  check('a day marked off still says rest day', restDay.restDay === true);
  check('...and still offers the three-minute option', restDay.micro === true);
  check('...and now offers stretching too', restDay.stretch === true);
  check('...and still says plainly that nothing is owed', restDay.free === true);
  check('...with the stretch offered, not prescribed', restDay.imperative === false);
  check('no placeholder text on the rest day', !BAD.test(restDay.text));

  /* ---- the routine warm-up toggle ---- */
  const rtWarm = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    go('today');
    const r = newRoutine('Warm probe');
    addToRoutine(r.id, 'bw-squat');
    sheetRoutineEdit(r.id);
    const row = () => document.querySelector('#sheet-body [data-act="rt-warmup"]');
    /* A missing row is a failed check, not an exception that stops the
       instrument before it has reported anything. */
    if (!row()) return { before: { present: false, on: null }, after: {}, missing: true,
                         text: document.getElementById('sheet-body').innerText || '' };
    const before = { present: true, on: !!row().querySelector('.switch.on') };
    row().click();
    const after = { on: !!row().querySelector('.switch.on'), state: routineById(r.id).warmup };
    const mins = routineMins(routineById(r.id));
    const built = buildRoutineSession(r.id, false);
    row().click();
    return {
      before, after, mins,
      builtWith: built.exercises.length,
      off: routineById(r.id).warmup,
      text: document.getElementById('sheet-body').innerText || ''
    };
  });
  check('the builder offers a warm-up toggle', rtWarm.before.present === true);
  check('...off by default', rtWarm.before.on === false);
  check('...tapping it turns the warm-up on', rtWarm.after.state === true);
  check('...and the sheet redraws to show it', rtWarm.after.on === true);
  check('...the session then carries the extra movement', rtWarm.builtWith === 2, String(rtWarm.builtWith));
  check('...and tapping again turns it back off', rtWarm.off === false);
  check('no placeholder text in the builder', !BAD.test(rtWarm.text));

  /* ---- moving between weeks from the dashboard ----
     The strip only ever showed the current week, so "what does next week look
     like" meant opening a sheet and reading a segmented control. */
  const strip = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    go('today');
    const head = () => document.querySelector('#today-body .sec-head');
    const days = () => [...document.querySelectorAll('#today-body .week .day')].map(d => d.dataset.k);
    const label = () => head().querySelector('.sec-t').textContent.trim();
    const arrow = d => head().querySelector(`[data-act="strip-week"][data-d="${d}"]`);

    const start = { label: label(), days: days(), hasToday: days().includes(today()),
                    backOff: arrow(-1).disabled, fwdOff: arrow(1).disabled };
    arrow(1).click();
    const next = { label: label(), days: days(), fwdOff: arrow(1).disabled };
    arrow(-1).click();
    const home = { label: label(), days: days() };
    return { start, next, home, count: days().length };
  });
  check('the strip shows seven days', strip.count === 7, String(strip.count));
  check('it opens on this week', strip.start.label === 'This week' && strip.start.hasToday,
    strip.start.label);
  check('an arrow moves it to next week', strip.next.label === 'Next week', strip.next.label);
  check('...and the dates actually change',
    strip.next.days[0] !== strip.start.days[0] &&
    strip.next.days[0] === new Date(new Date(strip.start.days[0]).getTime() + 7 * 864e5).toISOString().slice(0, 10),
    `${strip.start.days[0]} → ${strip.next.days[0]}`);
  check('...and it comes back', strip.home.label === 'This week' &&
    strip.home.days.join() === strip.start.days.join());
  /* Bounds, not silent no-ops: a fresh profile has no past to look at, and the
     plan is only ever built one week ahead. */
  check('a fresh profile cannot go back past this week', strip.start.backOff === true);
  check('...and cannot go further than next week', strip.next.fwdOff === true);
  check('...while forward is available from this week', strip.start.fwdOff === false);

  /* Swiping the strip, which is the gesture anyone will try first.
     Dispatched as real touch events rather than by calling the handler, so
     what is being proved is that the listener is actually reachable — it is
     delegated on document precisely because the strip is rebuilt by every
     render, and a listener bound to the old node would silently stop working
     after the first move. */
  const swipe = await page.evaluate(async () => {
    go('today');
    const label = () => document.querySelector('#today-body .sec-head .sec-t').textContent.trim();
    const drag = (x0, y0, x1, y1) => {
      const strip = document.querySelector('#today-body .week');
      const touch = (x, y) => new Touch({ identifier: 1, target: strip, clientX: x, clientY: y });
      const fire = (type, x, y) => {
        const t = touch(x, y);
        strip.dispatchEvent(new TouchEvent(type, {
          bubbles: true, cancelable: true,
          touches: type === 'touchend' ? [] : [t],
          targetTouches: type === 'touchend' ? [] : [t],
          changedTouches: [t]
        }));
      };
      fire('touchstart', x0, y0);
      fire('touchend', x1, y1);
      return label();
    };
    /* The move is deferred a frame so it never lands inside the browser's own
       touch-end paint, so each read waits for one. */
    const frame = () => new Promise(r => requestAnimationFrame(r));
    const start = label();
    drag(300, 200, 180, 206); await frame();
    const left = label();                       // drag left → forward a week
    drag(180, 200, 300, 206); await frame();
    const right = label();                      // and back
    drag(300, 200, 280, 200); await frame();
    const tiny = label();                       // under the slop, must not move
    drag(300, 200, 220, 400); await frame();
    const vertical = label();                   // scrolling past, must not move
    return { start, left, right, tiny, vertical };
  });
  check('dragging the strip left moves a week forward', swipe.left === 'Next week', swipe.left);
  check('...and dragging it right comes back', swipe.right === 'This week', swipe.right);
  check('a short drag is not a swipe', swipe.tiny === 'This week', swipe.tiny);
  /* The strip sits inside a scrolling screen. Stealing a vertical gesture
     would make the whole dashboard feel broken. */
  check('a mostly-vertical drag is scrolling, not swiping', swipe.vertical === 'This week', swipe.vertical);

  /* History unlocks the back arrow, because sessions are kept even though
     plans are not. */
  const history = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    const old = dk(addDays(fromKey(today()), -20));
    S.sessions = [{ id: 'h1', date: old, type: 'full', env: 'full', rung: 'full',
                    dur: 40, kcal: 300, exercises: [], ended: Date.now() }];
    save(true);
    go('today');
    const arrow = d => document.querySelector(`#today-body [data-act="strip-week"][data-d="${d}"]`);
    const opened = !arrow(-1).disabled;
    arrow(-1).click();
    const label = document.querySelector('#today-body .sec-head .sec-t').textContent.trim();
    const days = [...document.querySelectorAll('#today-body .week .day')].map(d => d.dataset.k);
    return { opened, label, reachesOld: days.length === 7, old };
  });
  check('a logged session opens the way back', history.opened === true);
  check('...and the label names the week', history.label === 'Last week', history.label);
  check('...still seven days', history.reachesOld === true);

  /* Leaving the screen has to reset it — "this week" on a dashboard cannot
     mean "wherever you last browsed to". */
  const resets = await page.evaluate(() => {
    go('today');
    document.querySelector('#today-body [data-act="strip-week"][data-d="1"]').click();
    const moved = document.querySelector('#today-body .sec-head .sec-t').textContent.trim();
    go('more'); go('today');
    return { moved, back: document.querySelector('#today-body .sec-head .sec-t').textContent.trim() };
  });
  check('leaving the screen resets the strip', resets.moved === 'Next week' && resets.back === 'This week',
    `${resets.moved} → ${resets.back}`);

  /* Plan renders the same strip plus a list. Two controls on one screen
     disagreeing about which week you are looking at is worse than no
     navigation at all. */
  const planSync = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    go('plan');
    /* The seven days are waypoints on a trail now rather than rows in a list —
       same guarantee, same data-k, different element. */
    const rows = () => [...document.querySelectorAll('#plan-body .wroute .wr-row[data-act="day-tap"]')].map(r => r.dataset.k);
    const strip = () => [...document.querySelectorAll('#plan-body .week .day')].map(d => d.dataset.k);
    const before = { s: strip(), r: rows() };
    document.querySelector('#plan-body [data-act="strip-week"][data-d="1"]').click();
    const after = { s: strip(), r: rows() };
    return { before, after };
  });
  check('the Plan list matches its strip', planSync.before.s.join() === planSync.before.r.join());

  /* ---- the route is a route ----
     The screen is called The route and was a billboard over seven 180px rows,
     each carrying a 44px tick and a pill reading "A normal day" — the default,
     printed seven times. It is a trail now, and what is asserted is that the
     trail *encodes* something rather than decorating a list: exactly one node
     is where you are, everything behind it is walked and everything ahead of
     it is not, and the constraint is printed only when it is not the default. */
  const wkRoute = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true); buildWeekPlan(true);
    const mk = (id, n) => ({ exId: id, name: EX[id].name, load: 'wt', targetR: 8,
      sets: Array.from({ length: n }, () => ({ w: 60, r: 8, done: true })) });
    /* Two days behind, logged, so there is something walked to check. */
    for (let i = 1; i <= 2; i++) {
      const k = dk(addDays(fromKey(today()), -i));
      S.sessions.push({ id: 'r' + i, date: k, type: 'full', ended: Date.now(), dur: 40,
        exercises: [mk('bb-bench', 3)] });
      if (S.week.plan[k]) S.week.plan[k].done = true;
    }
    /* And one day ahead deliberately not a normal day. */
    const far = dk(addDays(fromKey(today()), 2));
    S.week.days[far] = { avail: 'micro', env: 'bw' };
    save(true); go('plan');
    const rows = [...document.querySelectorAll('#plan-body .wr-row')];
    const cls = rows.map(r => r.className.replace('wr-row ', '').trim());
    const todayAt = rows.findIndex(r => r.dataset.k === today());
    const chips = rows.filter(r => r.querySelector('.wr-c')).map(r => r.dataset.k);
    /* The line above today has to read as covered and the line below it as
       not, or the trail is a decorated list. Read off the rendered elements,
       because both are backgrounds and neither changes the markup. */
    const up = rows[todayAt] && getComputedStyle(rows[todayAt].querySelector('.wr-line.up')).background;
    const down = rows[todayAt] && getComputedStyle(rows[todayAt].querySelector('.wr-line.down')).background;
    /* And the billboard is gone. */
    const pitch = (document.getElementById('plan-body').innerText || '');
    return { n: rows.length, cls, todayAt, chips, far,
             up, down, sameLine: up === down,
             heroH: (document.querySelector('#plan-body .wk-hero') || { getBoundingClientRect: () => ({ height: 0 }) })
               .getBoundingClientRect().height,
             billboard: /part that matters/i.test(pitch) };
  });
  check('the week is seven waypoints', wkRoute.n === 7, String(wkRoute.n));
  check('...with exactly one of them where you are',
    wkRoute.cls.filter(c => c === 'now').length === 1, wkRoute.cls.join(' '));
  check('...everything behind it walked and everything ahead of it not',
    wkRoute.cls.slice(0, wkRoute.todayAt).every(c => c === 'walked' || c === 'missed')
    && wkRoute.cls.slice(wkRoute.todayAt + 1).every(c => c === 'ahead'),
    wkRoute.cls.join(' '));
  check('...and the trail is covered above you and open below',
    wkRoute.sameLine === false, `${wkRoute.up} VS ${wkRoute.down}`);
  check('a day only says what it is when it is not the default',
    wkRoute.chips.length === 1 && wkRoute.chips[0] === wkRoute.far,
    wkRoute.chips.join(', '));
  check('the pitch is not the first thing on the screen every week',
    wkRoute.billboard === false && wkRoute.heroH < 260, `${Math.round(wkRoute.heroH)}px`);
  check('...and follows it to the next week', planSync.after.s.join() === planSync.after.r.join() &&
    planSync.after.r[0] !== planSync.before.r[0], planSync.after.r[0]);

  /* ---- a day that has gone ----
     Tapping one used to open the availability ladder — asking how much time
     you expect to have on a day that has already happened — and the only way
     out was a button marked Done that went to the week screen. */
  const pastDay = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    /* Three weeks of history, so the back arrow is live whichever day of the
       week this runs on. Deliberately not on the day being probed — that one
       has to be empty for "Add something you did" to be the primary action. */
    S.sessions = [{ id: 'old', date: dk(addDays(fromKey(today()), -21)), type: 'full',
                    env: 'full', rung: 'full', dur: 40, kcal: 300, exercises: [], ended: Date.now() }];
    save(true);
    go('today');
    /* Taken from the strip, not computed as today−2, which falls into last
       week whenever the suite runs early in one — and then the probe is
       asserting against a day the strip is not showing rather than against a
       bug. Falls back to stepping the strip back a week when today is Monday
       and this week genuinely has no past day in it. */
    let cells = [...document.querySelectorAll('#today-body .week .day')].map(d => d.dataset.k);
    if (!cells.some(x => daysBetween(x, today()) > 0)) {
      document.querySelector('#today-body [data-act="strip-week"][data-d="-1"]').click();
      cells = [...document.querySelectorAll('#today-body .week .day')].map(d => d.dataset.k);
    }
    const k = cells.filter(x => daysBetween(x, today()) > 0).pop();
    const cell = document.querySelector(`#today-body .week .day[data-k="${k}"]`);
    /* Fully shaped even on the miss, so a day the strip is not showing reads
       as failed checks rather than a TypeError on the Node side. */
    if (!cell) return { opened: false, k, text: '', acts: [], askedAvailability: false,
                        forcedToWeek: false, canLog: false, straightToEditor: true,
                        canEditSession: false, canEditTime: false, heading: '' };
    cell.click();
    const b = document.getElementById('sheet-body');
    const acts = [...b.querySelectorAll('[data-act]')].map(e => e.dataset.act);
    return {
      opened: true, k, text: b.innerText || '', acts,
      askedAvailability: acts.includes('wk-avail'),
      forcedToWeek: acts.includes('open-week'),
      canLog: acts.includes('log-past')
    };
  });
  check('a past day in the strip opens something', pastDay.opened === true);
  check('...it does not ask what time you will have', pastDay.askedAvailability === false,
    pastDay.acts && pastDay.acts.join(', '));
  check('...and does not route you through the week screen', pastDay.forcedToWeek === false);
  check('...it offers to log what you did', pastDay.canLog === true);
  check('...and says something about the day', pastDay.text.length > 40, String(pastDay.text.length));
  check('no placeholder text on a past day', !BAD.test(pastDay.text || ''));

  const pastLog = await page.evaluate(() => {
    const btn = document.querySelector('#sheet-body [data-act="log-past"]');
    if (!btn) return { started: false, missing: true, train: '' };
    btn.click();
    const A = S.active;
    const train = document.getElementById('train-body').innerText || '';
    return {
      started: !!A, date: A && A.date, today: today(),
      flagged: A && A.backdated === true,
      /* The screen has to say which day this is going on, or you are one tap
         from silently logging Tuesday's session onto Thursday. */
      saysWhen: /not today/i.test(train), train
    };
  });
  check('logging opens a session', pastLog.started === true);
  check('...dated to that day, not today', pastLog.date === pastDay.k && pastLog.date !== pastLog.today,
    String(pastLog.date));
  check('...flagged as back-dated', pastLog.flagged === true);
  check('...and the screen says so', pastLog.saysWhen === true);
  check('no placeholder text while back-logging', !BAD.test(pastLog.train || ''));

  /* ---- today and the days ahead ----
     Summary first, editors one tap in. */
  const aheadDay = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.active = null; save(true);
    go('today');
    /* Taken from the strip rather than computed as today+2, which lands
       outside this week whenever the run happens late in one — and a day the
       app has not planned yet correctly has no session to change, so the probe
       would have been asserting against the wrong day, not a bug. */
    const cells = [...document.querySelectorAll('#today-body .week .day')].map(d => d.dataset.k);
    const k = cells.filter(x => daysBetween(x, today()) <= 0).pop();
    const cell = document.querySelector(`#today-body .week .day[data-k="${k}"]`);
    /* Fully shaped even on the miss, so a day the strip is not showing reads
       as failed checks rather than a TypeError on the Node side. */
    if (!cell) return { opened: false, k, text: '', acts: [], askedAvailability: false,
                        forcedToWeek: false, canLog: false, straightToEditor: true,
                        canEditSession: false, canEditTime: false, heading: '' };
    cell.click();
    const b = document.getElementById('sheet-body');
    const acts = [...b.querySelectorAll('[data-act]')].map(e => e.dataset.act);
    const text = b.innerText || '';
    /* Opening straight into a ladder of five availability options is the
       editor, not the answer. */
    const straightToEditor = acts.includes('wk-avail');
    return { opened: true, k, text, acts, straightToEditor,
             canEditSession: acts.includes('plan-day'),
             canEditTime: acts.includes('day-edit'),
             heading: (b.querySelector('.h1') || {}).textContent };
  });
  check('a day ahead opens on a summary', aheadDay.opened === true && aheadDay.straightToEditor === false,
    aheadDay.acts && aheadDay.acts.join(', '));
  check('...with a heading that says what the day is', (aheadDay.heading || '').length > 2, aheadDay.heading);
  check('...an option to change the session', aheadDay.canEditSession === true);
  check('...and an option to change time and place', aheadDay.canEditTime === true);
  check('no placeholder text on a day ahead', !BAD.test(aheadDay.text || ''));

  /* And the editor it leads to comes back to the day, not to the week. */
  const editBack = await page.evaluate(() => {
    const open = document.querySelector('#sheet-body [data-act="day-edit"]');
    if (!open) return { isEditor: false, backs: 0, toWeek: 99, keptBack: 0, returned: false, text: '' };
    open.click();
    const b = document.getElementById('sheet-body');
    const isEditor = !!b.querySelector('[data-act="wk-avail"]');
    const backs = [...b.querySelectorAll('[data-act="day-open"]')].length;
    const toWeek = [...b.querySelectorAll('[data-act="open-week"]')].length;
    /* Change something: the editor redraws itself, and must not lose the way
       back in the process. */
    const opt = b.querySelector('[data-act="wk-avail"][data-v="short"]');
    if (opt) opt.click();
    const b2 = document.getElementById('sheet-body');
    const keptBack = [...b2.querySelectorAll('[data-act="day-open"]')].length;
    const home = b2.querySelector('[data-act="day-open"]');
    if (home) home.click();
    const back = document.getElementById('sheet-body');
    return { isEditor, backs, toWeek, keptBack,
             returned: !!back.querySelector('[data-act="day-edit"]'),
             text: back.innerText || '' };
  });
  check('the time-and-place editor opens from the day', editBack.isEditor === true);
  check('...offering a way back to that day', editBack.backs >= 2, String(editBack.backs));
  check('...and never to the week screen', editBack.toWeek === 0, String(editBack.toWeek));
  check('...which survives the editor redrawing itself', editBack.keptBack >= 2, String(editBack.keptBack));
  check('...and it does go back to the day', editBack.returned === true);
  check('no placeholder text on the way back', !BAD.test(editBack.text || ''));

  /* ---- when your day ends ----
     A setting nobody can find is not a setting. The engine side is proven in
     engine.mjs; what matters here is that it is reachable, that it says what
     it currently is, and that the screens stop looking like they have the
     wrong date once it is on. */
  const dayStart = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    go('more');
    document.querySelector('[data-act="open-settings"]').click();
    const row = document.querySelector('#sheet-body [data-act="day-start"]');
    if (!row) return { reachable: false, text: '', opts: 0, applied: null, sub: '' };
    const sub = row.innerText || '';
    row.click();
    const b = document.getElementById('sheet-body');
    const opts = b.querySelectorAll('[data-act="set-daystart"]').length;
    const text = b.innerText || '';
    b.querySelector('[data-act="set-daystart"][data-v="4"]').click();
    const b2 = document.getElementById('sheet-body');
    return {
      reachable: true, sub, opts, text,
      applied: S.profile.dayStart,
      seen: S.profile.dayStartSeen === true,
      marked: !!b2.querySelector('[data-act="set-daystart"][data-v="4"].on')
    };
  });
  check('Settings offers when your day ends', dayStart.reachable === true);
  check('...and the row says what it is now', /midnight/i.test(dayStart.sub), dayStart.sub.replace(/\n/g, ' '));
  check('...the sheet offers a range of hours', dayStart.opts >= 5, String(dayStart.opts));
  check('...it explains why this exists', /shift|awake|calendar/i.test(dayStart.text));
  check('...picking one applies it', dayStart.applied === 4, String(dayStart.applied));
  check('...and the sheet redraws to show the choice', dayStart.marked === true);
  /* Answering it at all — including "midnight" — has to count as answered, or
     the hint after a late session would never stop. */
  check('...answering it marks the question asked', dayStart.seen === true);
  check('no placeholder text in it', !BAD.test(dayStart.text || ''));

  /* Once it is on, Today has to explain its own date — a screen reading a day
     behind is indistinguishable from a bug. The window is 00:00–04:00, which
     is almost never when the suite runs, so the clock is frozen and Today
     re-rendered inside it rather than hoping. */
  const lateNote = await page.evaluate(`(() => {
    const at = (iso, fn) => {
      const Real = Date;
      const fixed = new Real(iso).getTime();
      class Fake extends Real {
        constructor(...a) { if (!a.length) super(fixed); else super(...a); }
        static now() { return fixed; }
      }
      globalThis.Date = Fake;
      try { return fn(); } finally { globalThis.Date = Real; }
    };
    closeSheet();
    S = blank(); S.onboarded = true; S.profile.dayStart = 4; save(true);
    const look = () => {
      go('today');
      const body = document.getElementById('today-body');
      const el = body.querySelector('[data-act="day-start"]');
      return { note: el ? el.textContent.trim() : null, text: body.innerText || '',
               date: (body.querySelector('.home-date') || {}).textContent || '' };
    };
    const small = at('2026-08-11T02:30:00', look);      // after midnight, before 4
    const day   = at('2026-08-11T14:00:00', look);      // an ordinary afternoon
    S.profile.dayStart = 0;
    const off   = at('2026-08-11T02:30:00', look);      // boundary not set at all
    return { small, day, off };
  })()`);
  check('after midnight Today explains its own date', !!lateNote.small.note, String(lateNote.small.note));
  /* The app's own day names are the short ones — "Mon 10 Aug" everywhere —
     so the note matching /Monday/ would have been asserting a convention this
     codebase does not use. */
  check('...naming the day it is still on', /\bMon\b/.test(lateNote.small.note || ''), lateNote.small.note);
  check('...and showing that date, not the wall clock one', /10 Aug/.test(lateNote.small.date),
    lateNote.small.date.trim());
  check('...the note is a way into the setting', /4am/.test(lateNote.small.note || ''), lateNote.small.note);
  check('an ordinary afternoon carries no such note', lateNote.day.note === null, String(lateNote.day.note));
  check('...and neither does midnight-boundary at 2am', lateNote.off.note === null, String(lateNote.off.note));
  check('no placeholder text in the small hours', !BAD.test(lateNote.small.text || ''));

  /* ---- two sessions in one day ----
     A main session before work and a routine after a late shift. The strip
     took whichever came last in the array and the Plan list took whichever
     came first, so one day described itself two different ways. */
  const twice = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.profile.dayStart = 0; save(true);
    buildWeekPlan(true);
    const k = today();
    S.week.plan[k] = { type: 'upper', done: true, pinned: true };
    S.sessions = [
      { id: 'a', date: k, type: 'upper', env: 'full', rung: 'full', dur: 50, kcal: 400,
        exercises: [], ended: Date.now() },
      { id: 'b', date: k, type: 'custom', routineId: 'rt1', routineName: 'Abs before bed',
        extra: true, env: 'bw', rung: 'full', dur: 12, kcal: 60, exercises: [], ended: Date.now() }
    ];
    save(true);
    go('today');
    const cell = document.querySelector(`#today-body .week .day[data-k="${k}"]`);
    const stripSub = cell ? (cell.querySelector('.dt') || {}).textContent : null;
    go('plan');
    const rowEl = document.querySelector(`#plan-body .wr-row[data-act="day-tap"][data-k="${k}"]`);
    const planSub = rowEl ? (rowEl.querySelector('.wr-s') || {}).textContent : null;
    go('today');
    if (cell) document.querySelector(`#today-body .week .day[data-k="${k}"]`).click();
    const sheet = document.getElementById('sheet-body').innerText || '';
    return { stripSub, planSub, sheet };
  });
  /* The session that discharged the day names it, both places. */
  check('the strip names the day by the session that counted',
    /Upper/.test(String(twice.stripSub)), String(twice.stripSub));
  check('...and says there was another', /\+\s*1/.test(String(twice.stripSub)), String(twice.stripSub));
  check('the Plan list agrees with the strip',
    /Upper/.test(String(twice.planSub)) && /1 more/.test(String(twice.planSub)), String(twice.planSub));
  check('the day sheet lists both sessions',
    /Upper/.test(twice.sheet) && /Abs before bed/i.test(twice.sheet), twice.sheet.slice(0, 80));
  check('no placeholder text with two sessions on a day', !BAD.test(twice.sheet || ''));

  /* ---- reps or seconds, in the builder ---- */
  const modeUI = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    go('today');
    const r = newRoutine('Abs');
    addToRoutine(r.id, 'bw-crunch');
    addToRoutine(r.id, 'bb-bench');
    sheetRoutineEdit(r.id);
    const items = [...document.querySelectorAll('#sheet-body .rt-item')];
    const segs = items.map(el => !!el.querySelector('[data-act="rt-mode"]'));
    const label = () => (document.querySelectorAll('#sheet-body .rt-num-k')[1] || {}).textContent;
    const before = label();
    const timeBtn = document.querySelector('#sheet-body [data-act="rt-mode"][data-i="0"][data-m="time"]');
    if (timeBtn) timeBtn.click();
    return {
      segs, before, after: label(),
      mode: routineById(r.id).items[0].mode,
      marked: !!document.querySelector('#sheet-body [data-act="rt-mode"][data-i="0"][data-m="time"].on'),
      text: document.getElementById('sheet-body').innerText || ''
    };
  });
  check('an ab movement offers reps or time', modeUI.segs[0] === true);
  check('...and a bench press does not', modeUI.segs[1] === false);
  check('the stepper is labelled Reps to begin with', /rep/i.test(modeUI.before || ''), modeUI.before);
  check('...and Seconds once switched', /second/i.test(modeUI.after || ''), modeUI.after);
  check('...with the item actually changed', modeUI.mode === 'time', modeUI.mode);
  check('...and the control showing it', modeUI.marked === true);
  check('no placeholder text in the builder', !BAD.test(modeUI.text || ''));

  /* ---- the circuit controls ---- */
  const circUI = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    const r = newRoutine('Abs before bed');
    ['bw-crunch', 'bw-bicycle', 'bw-plank'].forEach(id => addToRoutine(r.id, id));
    sheetRoutineEdit(r.id);
    const setsBefore = document.querySelectorAll('#sheet-body [data-act="rt-adj"][data-f="sets"]').length;
    const toggle = document.querySelector('#sheet-body [data-act="rt-circuit"]');
    if (!toggle) return { offered: false };
    toggle.click();
    const b = document.getElementById('sheet-body');
    return {
      offered: true, setsBefore,
      on: routineById(r.id).circuit,
      /* Per-movement sets stop meaning anything once a round is the set. */
      setsAfter: b.querySelectorAll('[data-act="rt-adj"][data-f="sets"]').length,
      rounds: b.querySelectorAll('[data-act="rt-rounds"]').length,
      rest: b.querySelectorAll('[data-act="rt-rest"]').length,
      text: b.innerText || '',
      id: r.id
    };
  });
  check('the builder offers a circuit toggle', circUI.offered === true);
  check('...off by default, with per-movement sets', circUI.setsBefore === 6, String(circUI.setsBefore));
  check('...turning it on switches the routine', circUI.on === true);
  check('...the per-movement set steppers go away', circUI.setsAfter === 0, String(circUI.setsAfter));
  check('...replaced by rounds', circUI.rounds === 2, String(circUI.rounds));
  check('...and a rest-between-rounds control', circUI.rest === 2, String(circUI.rest));
  check('...and it describes what will happen', /back to back/i.test(circUI.text));
  check('no placeholder text with a circuit set up', !BAD.test(circUI.text || ''));

  /* ---- running one ----
     The ordinary Train screen is eighteen checkboxes for a three-movement,
     three-round circuit. The runner shows one movement at a time. */
  const run = await page.evaluate(() => {
    const r = ensureRoutines()[0];
    S.active = buildRoutineSession(r.id, false);
    save(true); go('train');
    const body = document.getElementById('train-body');
    const now = () => (body.querySelector('.circ-name') || {}).textContent;
    const round = () => (body.querySelector('.circ-round') || {}).textContent;
    if (!body.querySelector('.circ')) return { runner: false };
    const first = { name: now(), round: round(),
                    cards: body.querySelectorAll('.ex-card').length,
                    rows: body.querySelectorAll('.circ-row').length };
    body.querySelector('[data-act="circ-done"]').click();
    const second = { name: now(), round: round() };
    document.getElementById('train-body').querySelector('[data-act="circ-done"]').click();
    const third = { name: now(), round: round() };
    /* Third is the last of round one — completing it should roll the round. */
    document.getElementById('train-body').querySelector('[data-act="circ-done"]').click();
    stopRest();
    const fourth = { name: now(), round: round() };
    return { runner: true, first, second, third, fourth, text: body.innerText || '' };
  });
  check('a circuit runs as a runner, not a card list', run.runner === true);
  check('...with no set-row cards at all', run.first && run.first.cards === 0, String(run.first && run.first.cards));
  check('...listing the whole circuit', run.first && run.first.rows === 3, String(run.first && run.first.rows));
  check('it opens on round 1', /round 1 of 3/i.test((run.first || {}).round || ''), (run.first || {}).round);
  check('...on the first movement', (run.first || {}).name === 'Crunch', (run.first || {}).name);
  check('Done moves to the next movement, same round',
    (run.second || {}).name === 'Bicycle Crunch' && /round 1/i.test((run.second || {}).round || ''),
    `${(run.second || {}).name} · ${(run.second || {}).round}`);
  check('...and on to the third', (run.third || {}).name === 'Plank', (run.third || {}).name);
  /* The behaviour that makes it a circuit rather than a superset of one. */
  check('finishing the list starts round 2 at the top',
    (run.fourth || {}).name === 'Crunch' && /round 2 of 3/i.test((run.fourth || {}).round || ''),
    `${(run.fourth || {}).name} · ${(run.fourth || {}).round}`);
  check('no placeholder text in the runner', !BAD.test(run.text || ''));

  /* ---- the work timer ---- */
  const workTimer = await page.evaluate(async () => {
    S = blank(); S.onboarded = true; save(true);
    const r = newRoutine('Holds');
    addToRoutine(r.id, 'bw-plank');            // seconds by default
    setRoutineCircuit(r.id, true);
    S.active = buildRoutineSession(r.id, false);
    save(true); go('train');
    const body = document.getElementById('train-body');
    const start = body.querySelector('[data-act="circ-start"]');
    if (!start) return { offered: false };
    const secs = start.textContent;
    start.click();
    const bar = document.getElementById('rest-bar');
    const running = { on: bar.classList.contains('on'), work: bar.classList.contains('work'),
                      t: document.getElementById('rest-t').textContent,
                      label: document.getElementById('rest-label').textContent,
                      skip: document.getElementById('rest-skip').textContent };
    /* Starting the timer must not tick the set — that would record work you
       have not done if you stop halfway. */
    const tickedOnStart = S.active.exercises[0].sets[0].done;
    stopRest();
    return { offered: true, secs, running, tickedOnStart,
             stoppedClean: !bar.classList.contains('on') && !bar.classList.contains('work') };
  });
  check('a timed movement offers to count it down', workTimer.offered === true);
  check('...saying how long', /\d+s/.test(workTimer.secs || ''), workTimer.secs);
  check('...and the bar runs in work mode, not rest',
    workTimer.running && workTimer.running.on && workTimer.running.work === true);
  check('...counting the movement, by name',
    /plank/i.test((workTimer.running || {}).label || ''), (workTimer.running || {}).label);
  check('...with a stop, not a skip', (workTimer.running || {}).skip === 'Stop',
    (workTimer.running || {}).skip);
  check('starting the timer does not tick the set', workTimer.tickedOnStart === false);
  check('...and stopping clears the work styling', workTimer.stoppedClean === true);

  /* Every new control is something you tap mid-set with one hand. There is no
     touch-target instrument in this repo, so the ones added here are measured
     where they are added rather than assumed. */
  const targets = await page.evaluate(() => {
    const small = [];
    const measure = (root, label) => {
      root.querySelectorAll('button,[role="button"]').forEach(el => {
        if (el.classList.contains('hide') || el.disabled) return;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        /* Sub-pixel tolerance: a box that measures 43.99 because of a
           border and a fractional line height is a 44px target, and treating
           it as a failure teaches everyone to ignore this check. */
        if (r.height < 43.5) small.push(`${label}:${(el.dataset.act || el.className || 'btn').slice(0, 22)}=${r.height.toFixed(1)}`);
      });
    };
    S = blank(); S.onboarded = true; save(true);
    go('today');
    const r = newRoutine('Abs');
    ['bw-crunch', 'bw-plank'].forEach(id => addToRoutine(r.id, id));
    setRoutineCircuit(r.id, true);
    sheetRoutineEdit(r.id);
    measure(document.getElementById('sheet-body'), 'builder');
    closeSheet();
    S.active = buildRoutineSession(r.id, false);
    save(true); go('train');
    measure(document.getElementById('train-body'), 'runner');
    /* The first movement is in reps, so the timer has to be reached through
       the one that is not — guarded, because a missing button is a failed
       check and not an exception that stops the instrument. */
    const timed = S.active.exercises.findIndex(x => x.load === 'time' || x.load === 'min');
    if (timed >= 0) {
      startRest(30, S.active.exercises[timed].name, { work: true });
      measure(document.getElementById('rest-bar'), 'timer');
      stopRest();
    }
    return { small: small.slice(0, 8), count: small.length, timerSeen: timed >= 0 };
  });
  check('the timer bar was actually measured', targets.timerSeen === true);
  check('every new control clears a 44px touch target', targets.count === 0,
    targets.small.join(', '));

  /* ---- nothing paints on top of anything else ----
     `collide.mjs` is documented and absent, and this is the class it existed
     for. Two text nodes sharing a box is invisible to every other instrument
     here: the markup is right, the words are right, the contrast is right, and
     the screen is unreadable.

     Reported from a screenshot after the day-boundary work, where the
     after-midnight note carried a negative top margin to absorb its own 44px
     touch target and put that box straight through the date line above it. The
     text was quiet enough that it looked fine and measured wrong.

     Text nodes only, and only between elements where neither contains the
     other — a parent's box legitimately covers its children. */
  const collide = await page.evaluate(() => {
    const at = (iso, fn) => {
      const Real = Date; const fixed = new Real(iso).getTime();
      class Fake extends Real {
        constructor(...a) { if (!a.length) super(fixed); else super(...a); }
        static now() { return fixed; }
      }
      globalThis.Date = Fake;
      try { return fn(); } finally { globalThis.Date = Real; }
    };

    /* Measured with a Range over the text node, not the element's box.
       An element box includes padding, and this codebase deliberately pads
       small interactive text out to a 44px target — so element boxes overlap
       all over the place by design, and a checker that used them would report
       the layout as broken everywhere and be switched off within a day. A
       Range gives the rectangle the glyphs actually occupy, which is the thing
       that is either readable or not. */
    const textRects = (root) => {
      const out = [];
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walk.nextNode())) {
        if (!n.textContent.trim()) continue;
        const el = n.parentElement;
        if (!el) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.opacity === '0' || cs.display === 'none') continue;
        const rg = document.createRange();
        rg.selectNodeContents(n);
        const r = rg.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        out.push({ r, t: n.textContent.trim().slice(0, 18), el });
      }
      return out;
    };

    const sweep = (id) => {
      const root = document.getElementById(id);
      if (!root) return ['no ' + id];
      const list = textRects(root);
      const hits = [];
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        /* Text in the same line box legitimately shares vertical space. */
        if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (ox > 2 && oy > 2) hits.push(`${id}: "${a.t}" over "${b.t}"`);
      }
      return hits;
    };

    /* The states this has actually gone wrong in: a boundary set, after
       midnight, a routine already logged, and body data on file. */
    S = blank(); S.onboarded = true;
    S.profile.name = 'Probe'; S.profile.units = 'lb'; S.profile.dayStart = 4;
    S.profile.bodyweight = [{ d: today(), w: 217 }];
    save(true); buildWeekPlan(true);
    const rt = newRoutine('Ab Night');
    ['bw-crunch', 'bw-bicycle', 'bw-plank'].forEach(x => addToRoutine(rt.id, x));
    setRoutineCircuit(rt.id, true);
    S.week.plan[today()] = { type: 'custom', routineId: rt.id, done: true, pinned: true };
    S.sessions = [{ id: 's1', date: today(), type: 'custom', routineId: rt.id,
      routineName: 'Ab Night', env: 'bw', rung: 'full', dur: 13, kcal: 36, ended: Date.now(),
      exercises: [{ exId: 'bw-crunch', name: 'Crunch', load: 'time', targetR: 40,
        sets: Array.from({ length: 7 }, () => ({ w: '', r: 40, rpe: '', done: true })), note: '' }] }];
    S.daily[today()] = { sleepH: 4.5, weight: 217 };
    save(true);

    const hits = [];
    /* Once in the small hours, where the note exists, and once in daylight. */
    [['2026-08-10T01:55:00', 'late'], ['2026-08-10T14:00:00', 'day']].forEach(([iso]) => {
      at(iso, () => {
        ['today', 'plan', 'progress', 'more'].forEach(scr => {
          go(scr);
          hits.push(...sweep(scr + '-body'));
        });
      });
    });
    /* And a circuit mid-run, which is the newest and densest screen. */
    S.active = buildRoutineSession(rt.id, false);
    save(true); go('train');
    completeCircuitEntry(0, 0);
    stopRest();
    hits.push(...sweep('train-body'));
    S.active = null; save(true); go('today');
    /* How much was actually looked at. A sweep that found nothing because it
       measured nothing is the exact shape of lie this project has hit before. */
    go('today');
    const sample = textRects(document.getElementById('today-body'));
    return { hits: hits.slice(0, 8), n: hits.length,
             measured: sample.length, sampleText: sample.slice(0, 4).map(x => x.t) };
  });
  check('the sweep actually measured painted text', collide.measured > 15,
    `${collide.measured} nodes: ${(collide.sampleText || []).join(', ')}`);
  check('no two text nodes share a box on any screen', collide.n === 0,
    collide.hits.join(' | '));

  /* The swipe must not fire on a gesture that scrolled. It re-renders the
     whole screen, and doing that inside the browser's own scroll paint is how
     you get one frame composited on top of another. */
  const swipeGuard = await page.evaluate(async () => {
    S = blank(); S.onboarded = true; save(true);
    go('today');
    const label = () => document.querySelector('#today-body .sec-head .sec-t').textContent.trim();
    const screen = document.getElementById('s-today');
    const drag = (x0, y0, x1, y1, scrollDuring) => {
      const strip = document.querySelector('#today-body .week');
      const touch = (x, y) => new Touch({ identifier: 1, target: strip, clientX: x, clientY: y });
      const fire = (type, x, y) => {
        const t = touch(x, y);
        strip.dispatchEvent(new TouchEvent(type, {
          bubbles: true, cancelable: true,
          touches: type === 'touchend' ? [] : [t],
          targetTouches: type === 'touchend' ? [] : [t],
          changedTouches: [t]
        }));
      };
      screen.scrollTop = 0;
      fire('touchstart', x0, y0);
      if (scrollDuring) screen.scrollTop = 120;
      fire('touchend', x1, y1);
      screen.scrollTop = 0;
      return label();
    };
    const clean = drag(300, 200, 180, 206, false);
    await new Promise(r => requestAnimationFrame(r));
    const afterClean = label();
    stripOffset = 0; render();
    const scrolled = drag(300, 200, 180, 206, true);
    await new Promise(r => requestAnimationFrame(r));
    const afterScrolled = label();
    return { clean, afterClean, scrolled, afterScrolled,
             scrollable: screen.scrollHeight > screen.clientHeight };
  });
  check('the screen is tall enough for the scroll case to be real', swipeGuard.scrollable === true);
  check('a clean horizontal swipe still moves the week', swipeGuard.afterClean === 'Next week',
    swipeGuard.afterClean);
  check('...and it is deferred a frame, not done inside the touch',
    swipeGuard.clean === 'This week', swipeGuard.clean);
  check('a gesture that scrolled the screen never re-renders it',
    swipeGuard.afterScrolled === 'This week', swipeGuard.afterScrolled);

  /* ---- the ascent on Progress ----
     This screen used to draw its fifteen milestones twice: a route card with
     abstract pins, and a markers list under it with the same names, the same
     progress and the same "next". Reported as "aren't these kind of the same
     thing?" — they were. The merge is one switchback trail whose waypoints are
     the rows you read, so what is asserted here is both that the drawing still
     tracks the state and that there is exactly ONE of it. */
  const route = await page.evaluate(() => {
    const read = () => {
      go('progress');
      const b = document.getElementById('progress-body');
      const rows = [...b.querySelectorAll('.asc-row')];
      const ring = b.querySelector('.asc-ring-i');
      /* The connector under each waypoint must fill the room between that row's
         waypoint block and the next row's. An <svg> is a replaced element, so
         `height:auto` with top/bottom resolves from its own viewBox instead —
         which locked every connector to 100px whatever the row did, and left a
         visible gap under a long row. Measured, not read off the stylesheet. */
      const links = [...b.querySelectorAll('.asc-row')].map(r => {
        const l = r.querySelector('.asc-link');
        if (!l) return null;
        return Math.round(l.getBoundingClientRect().height - (r.getBoundingClientRect().height - 54));
      }).filter(v => v !== null);
      return {
        hero: !!b.querySelector('.ascent'),
        /* The merge: no second list of the same markers anywhere on the screen. */
        oldList: b.querySelectorAll('.jpath, .jnode, .route, .route-svg').length,
        day: (b.querySelector('.asc-day') || {}).textContent || '',
        count: (b.querySelector('.asc-count-n') || {}).textContent || '',
        titles: rows.map(r => (r.querySelector('.asc-t, .asc-here-t, .asc-summit-t') || {}).textContent || ''),
        states: rows.map(r => r.className.replace('asc-row', '').trim()),
        done: rows.filter(r => r.classList.contains('done')).length,
        here: rows.filter(r => r.classList.contains('here')).length,
        summit: rows.filter(r => r.classList.contains('summit')).length,
        walkedLines: b.querySelectorAll('.asc-line.walked').length,
        aheadLines: b.querySelectorAll('.asc-line.ahead').length,
        ringOffset: ring ? +ring.style.strokeDashoffset : null,
        ringArray: ring ? +ring.style.strokeDasharray : null,
        linkErrors: links.filter(d => Math.abs(d) > 1),
        oldTiles: b.querySelectorAll('.tiles .tile').length,
        text: b.innerText || ''
      };
    };

    S = blank(); S.onboarded = true; save(true);
    const fresh = read();
    /* The ridge is decoration and sits absolutely at the top of the card. On a
       fresh profile — the one state where a paragraph sits that high — it
       painted straight over the first line of it. Asked of the renderer, not
       of the stylesheet: what is actually on top at that pixel? */
    const p = document.querySelector('.asc-first');
    const ridge = document.querySelector('.asc-ridge');
    let onTop = '(no paragraph)';
    if (p && ridge) {
      const r = p.getBoundingClientRect();
      const rr = ridge.getBoundingClientRect();
      /* They have to actually overlap, or this proves nothing about stacking. */
      if (r.top >= rr.bottom) { onTop = '(no overlap to test)'; }
      else {
        /* The ridge is pointer-events:none, so elementFromPoint can never
           return it — the first version of this check could not fail and did
           not, straight through the revert. Hit-testing order is paint order
           when both are hittable, so make it hittable for the measurement.
           This changes what the probe can see, not what the app does. */
        const prev = ridge.style.pointerEvents;
        ridge.style.pointerEvents = 'auto';
        const el = document.elementFromPoint(r.left + 12, r.top + 8);
        ridge.style.pointerEvents = prev;
        /* getAttribute, not .className — on an SVG element that is an
           SVGAnimatedString and prints as [object SVGAnimatedString], which
           tells whoever is reading the failure nothing at all. */
        onTop = el ? ((el.getAttribute && el.getAttribute('class')) || el.tagName) : 'none';
        if (el && el.closest && el.closest('.asc-ridge')) onTop = 'asc-ridge > ' + onTop;
      }
    }
    fresh.overParagraph = String(onTop);

    /* A real history: enough sessions to have passed several markers. */
    S = blank(); S.onboarded = true;
    S.meta.created = new Date(Date.now() - 70 * 864e5).toISOString();
    const e = EX['bb-back-squat'];
    S.sessions = [1, 3, 5, 8, 10, 12, 15, 17, 19, 22, 24, 26, 29, 31, 33, 36, 38, 40, 43, 45, 47, 50, 52, 54, 57, 59, 61, 64, 66, 68]
      .map((d, i) => ({ id: 's' + i, date: dk(addDays(fromKey(today()), -d)), type: 'full',
        env: 'full', rung: 'full', dur: 45, kcal: 300, ended: Date.now(),
        exercises: [{ exId: e.id, name: e.name, load: e.load, targetW: 60, targetR: 8,
          sets: Array.from({ length: 3 }, () => ({ w: 60, r: 8, rpe: 8, done: true })), note: '' }] }));
    checkMilestones(); save(true);
    const rich = read();
    /* What the trail should be able to say about itself, independently. */
    const order = milestonesReached().map(m => m.title);
    return { fresh, rich, order };
  });
  check('Progress leads with the ascent', route.rich.hero === true);
  /* The reported complaint, as a check: one component, not two. */
  check('...and the markers are not drawn a second time under it',
    route.rich.oldList === 0, String(route.rich.oldList));
  check('...and the old tile grid is still gone', route.rich.oldTiles === 0, String(route.rich.oldTiles));
  check('...it names the day', /^Day \d+$/.test(route.rich.day), route.rich.day);
  check('...and how many markers are behind you', +route.rich.count > 0, route.rich.count);

  /* The drawing has to match the state, not decorate it. */
  check('markers reached are waypoints on the walked trail',
    route.rich.done > 0 && route.rich.walkedLines > 0,
    `${route.rich.done} done, ${route.rich.walkedLines} walked`);
  check('...the trail ahead of you is drawn as ahead', route.rich.aheadLines > 0,
    String(route.rich.aheadLines));
  check('...you are here sits on it exactly once', route.rich.here === 1, String(route.rich.here));
  check('...and the route ends on a summit', route.rich.summit === 1, String(route.rich.summit));

  /* Chronological. The old list ran newest-first, which is right for a feed and
     draws you walking backwards on a trail. */
  const walkedTitles = route.rich.titles.slice(0, route.rich.done);
  const expected = route.order.slice(-walkedTitles.length);
  check('the trail reads in the order you walked it',
    walkedTitles.length > 1 && walkedTitles.join('|') === expected.join('|'),
    walkedTitles.join(' → '));
  check('...with you-are-here after the last one you passed',
    route.rich.states.indexOf('here') === route.rich.done,
    route.rich.states.join(','));
  check('...and the summit last', route.rich.states[route.rich.states.length - 1] === 'summit',
    route.rich.states.join(','));

  /* The progress bar the old list drew as a separate stripe is the ring around
     the waypoint now. Same number: a partial one must be partly drawn. */
  check('the marker you are walking towards carries its progress as a ring',
    route.rich.ringArray > 0 && route.rich.ringOffset > 0
      && route.rich.ringOffset < route.rich.ringArray,
    `${route.rich.ringOffset} of ${route.rich.ringArray}`);

  /* The two bugs this redraw actually had. */
  check('every connector fills the row it spans',
    route.rich.linkErrors.length === 0, JSON.stringify(route.rich.linkErrors));
  check('...on a fresh profile too', route.fresh.linkErrors.length === 0,
    JSON.stringify(route.fresh.linkErrors));
  check('the ridge never paints over the words',
    /asc-first/.test(route.fresh.overParagraph), route.fresh.overParagraph);

  check('no placeholder text on Progress', !BAD.test(route.rich.text));

  /* Day one has to draw an honest empty route, not a broken card. */
  check('a fresh profile still gets a route', route.fresh.hero === true);
  check('...with nothing behind you', route.fresh.done === 0 && route.fresh.count === '0',
    `${route.fresh.done} walked, count ${route.fresh.count}`);
  check('...and no walked trail', route.fresh.walkedLines === 0, String(route.fresh.walkedLines));
  check('...no you-are-here before you have started', route.fresh.here === 0, String(route.fresh.here));
  check('...but the route and its summit are still drawn',
    route.fresh.aheadLines > 0 && route.fresh.summit === 1,
    `${route.fresh.aheadLines} ahead, ${route.fresh.summit} summit`);
  check('no placeholder text on an empty Progress', !BAD.test(route.fresh.text));

  /* Every waypoint has to sit ON the trail, not beside it. The node is an HTML
     element and the trail is an SVG path, so nothing enforces this — the two
     agree only because both are placed from the same number, and the day
     somebody changes the rail width in the stylesheet without changing it in
     the renderer they will part company silently. Measured in page pixels, so
     it is the drawn positions being compared and not the two constants. */
  const onTrail = await page.evaluate(() => {
    go('progress');
    const rows = [...document.querySelectorAll('#progress-body .asc-row')];
    if (!rows.length) return { checked: 0, off: ['no rows'] };
    const off = [];
    let checked = 0;
    rows.forEach((r, i) => {
      const node = r.querySelector('.asc-node-wrap');
      const top = r.querySelector('.asc-top');
      if (!node || !top) return;
      const paths = [...top.querySelectorAll('path')];
      if (!paths.length) return;   // trailhead and summit legitimately have one side only
      const nb = node.getBoundingClientRect();
      const cx = nb.left + nb.width / 2;
      const tb = top.getBoundingClientRect();
      /* The top block is rendered at its intrinsic size, so one SVG unit is one
         CSS pixel and a path's x maps straight onto the page. */
      let best = 1e9;
      paths.forEach(p => {
        const len = p.getTotalLength();
        for (let s = 0; s <= 20; s++) {
          const pt = p.getPointAtLength(len * s / 20);
          best = Math.min(best, Math.abs(tb.left + pt.x - cx));
        }
      });
      checked++;
      if (best > 1.5) off.push(`row ${i} node is ${best.toFixed(1)}px off its trail`);
    });
    return { checked, off: off.slice(0, 4) };
  });
  check('every waypoint sits on the trail rather than beside it',
    onTrail.off.length === 0, onTrail.off.join(', '));
  check('...and there were waypoints to check', onTrail.checked >= 2, String(onTrail.checked));

  /* ---- what each waypoint says ----
     One session in, this was three thin rows with the word "Ahead" on two of
     them — the absence of information dressed as information. Every waypoint
     has to say what it costs, and the one you are walking towards has to show
     how far along you actually are. */
  const markers = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    const e = EX['bb-back-squat'];
    S.sessions = [{ id: 's1', date: today(), type: 'full', env: 'full', rung: 'full',
      dur: 45, kcal: 300, ended: Date.now(),
      exercises: [{ exId: e.id, name: e.name, load: e.load, targetW: 60, targetR: 8,
        sets: [{ w: 60, r: 8, rpe: 8, done: true }], note: '' }] }];
    checkMilestones(); save(true);
    go('progress');
    /* Shaped return on the miss. The version of this that reached through
       `(x || {}).parentElement.querySelector(...)` threw the moment the card
       was not found, killing the instrument before it printed a single line. */
    const miss = { found: false, rows: 0, bare: 1, done: -1, far: -1, body: '',
                   nextTitle: '', nextCount: '', ringPct: -1, summit: -1, text: '' };
    const card = document.querySelector('#progress-body .asc-path');
    if (!card) return miss;
    const rows = [...card.querySelectorAll('.asc-row')];
    const next = card.querySelector('.asc-row.next');
    const ring = next && next.querySelector('.asc-ring-i');
    const arr = ring ? +ring.style.strokeDasharray : 0;
    const offv = ring ? +ring.style.strokeDashoffset : 0;
    return {
      found: true,
      rows: rows.length,
      done: card.querySelectorAll('.asc-row.done').length,
      far: card.querySelectorAll('.asc-row.far').length,
      summit: card.querySelectorAll('.asc-row.summit').length,
      /* No row may be left saying only "Ahead". */
      bare: rows.filter(r => /^\s*ahead\s*$/i.test(
        ((r.querySelector('.asc-d') || r.querySelector('.asc-need') || {}).textContent || '').trim())).length,
      body: (card.querySelector('.asc-body-t') || {}).textContent || '',
      nextTitle: next ? (next.querySelector('.asc-t') || {}).textContent : '',
      nextCount: next ? ((next.querySelector('.asc-when') || {}).textContent || '').replace(/\s/g, '') : '',
      ringPct: arr > 0 ? Math.round((1 - offv / arr) * 100) : -1,
      text: card.innerText || ''
    };
  });
  check('the ascent renders one session in', markers.found === true);
  /* Two ahead made the road look like it ended just past your feet. */
  check('...showing more than a couple of steps ahead', markers.rows >= 5, String(markers.rows));
  check('...one of them reached', markers.done === 1, String(markers.done));
  check('...and the summit still at the end', markers.summit === 1, String(markers.summit));
  check('no waypoint is left saying only "Ahead"', markers.bare === 0, String(markers.bare));
  check('the marker you just passed says what it meant', markers.body.length > 40,
    markers.body.slice(0, 50));
  check('the next marker is named', markers.nextTitle === 'Finding your pace', markers.nextTitle);
  check('...with your real count against it', markers.nextCount === '1/5', markers.nextCount);
  /* One session of five: the ring has to be a fifth of the way round, not a
     decoration. It is the bar the old list drew as a separate stripe. */
  check('...and a ring that matches it', markers.ringPct === 20, String(markers.ringPct));
  check('the rest state what they cost', markers.far >= 2, String(markers.far));
  check('no placeholder text in the markers card', !BAD.test(markers.text));

  /* ---- the pinned header ----
     It used to scroll away under the status bar, so a screen's own title
     passed behind the clock on the way out. Pinned, it needs an opaque band —
     and the band has to be invisible, because the page behind it is a radial
     sky gradient that shifts with the time of day. It is painted with that
     same gradient at `background-attachment:fixed`, exactly as body paints it,
     so the two land in the same place by construction.

     "By construction" is the sort of claim that is true until it isn't, so it
     is measured in pixels: screenshot, read the band, hide the screen's
     contents, read the page underneath at the same point, compare. */
  const shotPx = async (x, y) => {
    const b64 = (await page.screenshot()).toString('base64');
    return page.evaluate(async ({ d, x, y }) => {
      const img = new Image();
      await new Promise(r => { img.onload = r; img.onerror = r; img.src = d; });
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const dpr = img.width / window.innerWidth;
      const p = g.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data;
      return [p[0], p[1], p[2]];
    }, { d: 'data:image/png;base64,' + b64, x, y });
  };

  const hdr = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    const e = EX['bb-back-squat'];
    S.sessions = Array.from({ length: 12 }, (_, i) => ({
      id: 'h' + i, date: dk(addDays(fromKey(today()), -(12 - i) * 2)), type: 'full',
      env: 'full', rung: 'full', dur: 45, kcal: 320, ended: Date.now(),
      exercises: [{ exId: e.id, name: e.name, load: e.load, targetW: 60, targetR: 8,
        sets: [{ w: 60, r: 8, rpe: 8, done: true }], note: '' }] }));
    checkMilestones(); save(true);
    go('progress');
    const s = document.getElementById('s-progress');
    const h = s.querySelector('.hdr');
    const atRest = Math.round(h.getBoundingClientRect().top);
    s.scrollTop = 600;
    return { atRest, pad: Math.round(parseFloat(getComputedStyle(s).paddingTop)) };
  });
  /* Scroll is dispatched asynchronously and the rule fades in, so this waits
     for the transition to settle rather than sleeping a guess at its length —
     a fixed 120ms read it mid-fade at 0.65 and called a working header broken. */
  await page.waitForFunction(() => {
    const h = document.querySelector('#s-progress .hdr');
    return h && +getComputedStyle(h, '::after').opacity === 1;
  }, null, { timeout: 4000 }).catch(() => {});
  const hdrScrolled = await page.evaluate(() => {
    const s = document.getElementById('s-progress');
    const h = s.querySelector('.hdr');
    return { top: Math.round(h.getBoundingClientRect().top),
             scrollTop: Math.round(s.scrollTop),
             rule: s.classList.contains('scrolled'),
             hairline: getComputedStyle(h, '::after').opacity };
  });
  check('the header is still on screen after scrolling past it',
    hdrScrolled.scrollTop > 400 && hdrScrolled.top === hdr.atRest,
    `top ${hdrScrolled.top} at rest ${hdr.atRest}, scrolled ${hdrScrolled.scrollTop}`);
  /* The sticky constraint rectangle is already inset by the scroller's padding.
     Adding the safe-area inset to `top` on top of that counts the notch twice
     and parks the title a hundred pixels down a real phone — which is exactly
     zero pixels down a desktop browser, where env(safe-area-inset-top) is 0.
     So the inset is faked, and the header must not move. */
  const notched = await page.evaluate(() => {
    const root = document.documentElement;
    const before = Math.round(document.querySelector('#s-progress .hdr').getBoundingClientRect().top);
    root.style.setProperty('--safe-t', '47px');
    const after = Math.round(document.querySelector('#s-progress .hdr').getBoundingClientRect().top);
    root.style.removeProperty('--safe-t');
    return { before, after };
  });
  check('...clearing the notch by exactly one notch, not two',
    notched.after - notched.before === 47,
    `${notched.before} → ${notched.after}`);
  check('...and a rule appears under it once something has gone beneath',
    hdrScrolled.rule === true && +hdrScrolled.hairline === 1,
    `${hdrScrolled.rule}, opacity ${hdrScrolled.hairline}`);

  /* The band, in pixels. Sampled across the width just above the cap height,
     so no glyph is in the way — and NOT at the far-left corner, which is where
     the first version of this looked. On a wide viewport that corner is past
     the outer stop of the radial and has already faded to flat --bg, so a band
     painted flat --bg matched it exactly and the check sailed through its own
     revert. Where the sky is at its most different is the only place worth
     sampling. */
  const bandAt = await page.evaluate(() => {
    const w = window.innerWidth;
    return [Math.round(w * 0.28), Math.round(w * 0.5), Math.round(w * 0.72)];
  });
  const bandPx = [];
  for (const x of bandAt) bandPx.push(await shotPx(x, 5));
  await page.evaluate(() => {
    [...document.querySelectorAll('#s-progress > *')].forEach(n => { n.style.visibility = 'hidden'; });
  });
  const pagePx = [];
  for (const x of bandAt) pagePx.push(await shotPx(x, 5));
  await page.evaluate(() => {
    [...document.querySelectorAll('#s-progress > *')].forEach(n => { n.style.visibility = ''; });
  });
  const drift = Math.max(...bandPx.map((p, i) => Math.max(...p.map((v, c) => Math.abs(v - pagePx[i][c])))));
  /* The guard. If the sky at every sample point happens to equal flat --bg,
     then "the band matches the sky" is true of a band that has no sky in it and
     the check has proven nothing. #0a0c0f is --bg. */
  const skyLift = Math.max(...pagePx.map(p => Math.max(Math.abs(p[0] - 10), Math.abs(p[1] - 12), Math.abs(p[2] - 15))));
  check('the sample points have some sky in them to match',
    skyLift > 6, `brightest sample is ${skyLift} off flat bg`);
  check('the band behind it is invisible against the sky it sits on',
    drift <= 2, `band ${JSON.stringify(bandPx)} vs page ${JSON.stringify(pagePx)}`);

  /* And it is opaque, or the title has whatever passes under it showing
     through — the same trap the nav records. Proven by putting something bright
     directly behind it and checking none of it arrives.

     Fixed to the viewport rather than inserted into the scroller: the first
     version put a 120px block at the top of the content and then scrolled 600px
     past it, so the thing it was testing with was off-screen by the time the
     screenshot was taken, and a fully transparent band would have passed. */
  await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.id = 'hdr-probe';
    probe.style.cssText = 'position:fixed;left:0;right:0;top:0;height:80px;background:#fff;z-index:5';
    document.body.appendChild(probe);
  });
  const overPx = [];
  for (const x of bandAt) overPx.push(await shotPx(x, 5));
  await page.evaluate(() => { const n = document.getElementById('hdr-probe'); if (n) n.remove(); });
  const bleed = Math.max(...overPx.map((p, i) => Math.max(...p.map((v, c) => Math.abs(v - pagePx[i][c])))));
  check('...and opaque, so nothing passing under it shows through',
    bleed <= 2, `${JSON.stringify(overPx)} vs page ${JSON.stringify(pagePx)}`);

  /* Back to the top, so nothing after this inherits a scrolled screen. */
  await page.evaluate(() => { document.getElementById('s-progress').scrollTop = 0; });
  await page.waitForFunction(() => {
    const h = document.querySelector('#s-progress .hdr');
    return h && +getComputedStyle(h, '::after').opacity === 0;
  }, null, { timeout: 4000 }).catch(() => {});
  const hdrRest = await page.evaluate(() => {
    const s = document.getElementById('s-progress');
    return { rule: s.classList.contains('scrolled'),
             hairline: getComputedStyle(s.querySelector('.hdr'), '::after').opacity };
  });
  check('...and no rule on a screen you have not scrolled',
    hdrRest.rule === false && +hdrRest.hairline === 0,
    `${hdrRest.rule}, opacity ${hdrRest.hairline}`);


  /* ---- no emoji reaches any screen ----
     An emoji is a glyph the *platform* supplies: Apple Color Emoji on an
     iPhone, Noto Color Emoji on Android, different style, weight and palette,
     and a tofu box where the font has none. Nothing in this app should depend
     on one. Swept over every screen and every sheet rather than over the
     source, because the source is allowed to talk about them in comments. */
  const emojiSweep = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.settings.nutrition = true;
    S.profile.bodyweight = [{ d: today(), w: 80 }];
    S.profile.heightCm = 178; S.profile.birthYear = 1990; S.profile.sex = 'm';
    const e = EX['bb-back-squat'];
    S.sessions = [{ id: 'e1', date: today(), ended: Date.now(), dur: 45, kcal: 300, type: 'full',
      exercises: [{ exId: e.id, name: e.name, load: e.load,
        sets: [{ w: 100, r: 5, done: true }] }] }];
    S.stretch = { onboarded: true, occupation: 'desk', areas: ['lowback'], done: {}, mins: 15 };
    checkMilestones(); save(true);

    /* Pictographic ranges only. Plain typographic arrows and dashes in running
       prose are text, render identically everywhere, and are not the subject.

       U+2300–U+23FF is Miscellaneous Technical, and it is in here because that
       is where the clock, the stopwatch, the hourglass and the media-control
       glyphs live — exactly the pictures a training app reaches for. Leaving
       the block out is how this check stayed green while a "⏱" sat in the
       Settings sheet it reads on every run: the sweep was looking, the pattern
       was not. Kept to the emoji-capable end of the block so the drafting and
       arithmetic characters below U+2300 stay text. */
    const re = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2713}\u{2714}\u{2715}-\u{2718}\u{25A0}-\u{25FF}]/u;
    const hits = [];
    const scan = (where) => {
      const t = (document.getElementById(where) || {}).innerText || '';
      /* innerText, so only what is painted counts. */
      t.split('\n').forEach(line => {
        const m = line.match(re);
        if (m) hits.push(where + ': ' + line.trim().slice(0, 40) + ' [' + m[0] + ']');
      });
    };
    ['today', 'plan', 'train', 'fuel', 'progress', 'more'].forEach(sc => {
      go(sc); render();
      scan(sc === 'more' ? 'more-body' : sc + '-body');
    });
    const sheets = [
      () => sheetStretch(), () => sheetStretchSetup(), () => sheetRoutines(),
      () => sheetSettings(), () => sheetHelp(), () => sheetJourney(),
      () => sheetProfile(), () => sheetWeek(), () => sheetEnvs()
    ];
    sheets.forEach(fn => { try { fn(); scan('sheet-body'); } catch (err) {} });
    return { hits: hits.slice(0, 8), n: hits.length,
             /* The sweep has to have looked at something. */
             looked: (document.getElementById('sheet-body') || {}).innerText.length };
  });
  check('the sweep actually read some screens', emojiSweep.looked > 40, String(emojiSweep.looked));
  check('no emoji is painted on any screen or sheet',
    emojiSweep.n === 0, emojiSweep.hits.join(' | '));

  /* ---- Today says what is in the session before you commit to it ----
     The card read "Full body · 60 min" and kept the movements behind the Start
     button — the one thing somebody wants before deciding whether today is a
     training day.

     The check that matters is the last one. previewSession() draws a real
     generated session, and generateSession() lazily writes rep targets into
     S.lifts through targetFor(); Today re-renders on every state change, so a
     leak here would seed a catalogue into the save of anyone who simply looked
     at the screen. Rendered three times, and the whole of S is compared. */
  const todayWhat = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.profile.bodyweight = [{ d: today(), w: 82 }];
    save(true); buildWeekPlan(true);
    /* Captured before the FIRST render, not after it. Taking the baseline
       after one render made the comparison blind to the leak — the first
       render wrote the lift entries and the next two rewrote the same keys, so
       S looked stable while being wrong. */
    go('today');
    const before = JSON.stringify(S);
    render(); render(); render();
    /* Painted, not merely present. Counting nodes found them inside a hidden
       container just as happily, so hiding the whole block left this check
       green — it was measuring the markup rather than the screen. */
    const rows = [...document.querySelectorAll('#today-body .hw-row')]
      .filter(r => r.getBoundingClientRect().height > 0);
    const start = document.querySelector('#today-body [data-act="start-session"]');
    return {
      n: rows.length,
      named: rows.map(r => (r.querySelector('.hw-n') || {}).textContent || ''),
      dosed: rows.filter(r => ((r.querySelector('.hw-d') || {}).textContent || '').trim()).length,
      leaked: JSON.stringify(S) !== before,
      lifts: Object.keys(S.lifts || {}).length,
      startTop: start ? Math.round(start.getBoundingClientRect().top) : null
    };
  });
  check('Today names the movements in the session it is offering',
    todayWhat.n >= 3 && todayWhat.named.every(x => x.trim()), todayWhat.named.join(', '));
  check('...each with what it is asking of you',
    todayWhat.dosed === todayWhat.n, `${todayWhat.dosed} of ${todayWhat.n}`);
  /* Naming them must not push the thing you came to press off the screen. */
  check('...and Start is still on the first screen',
    todayWhat.startTop != null && todayWhat.startTop < 844,
    todayWhat.startTop + 'px');
  check('...and drawing it leaves no trace in the save',
    !todayWhat.leaked && todayWhat.lifts === 0,
    `leaked ${todayWhat.leaked}, ${todayWhat.lifts} lifts written`);

  /* ---- today's stretch opens closed ----
     Nine rows of movements were the whole sheet, so the presets — which answer
     a different and more urgent question — sat under all of them where nobody
     scrolled. Closed on arrival, and the presets are reachable without
     scrolling at all.

     The tick case is the one worth asserting: this sheet redraws itself by
     calling sheetStretch() again, so resetting the flag anywhere in the render
     would shut the list the instant somebody ticked a movement in it. */
  const strFold = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.profile.sex = 'm';
    S.stretch = { onboarded: true, occupation: 'camera', areas: ['shoulder'], done: {}, mins: 12 };
    save(true); buildWeekPlan(true); go('more'); render();
    document.body.insertAdjacentHTML('beforeend', '<button id="zz-str" data-act="stretch"></button>');
    const zz = document.getElementById('zz-str');
    const read = () => {
      const b = document.getElementById('sheet-body');
      const body = b.querySelector('.str-body');
      const pset = b.querySelector('.pset');
      const scroller = b.closest('.sheet') || b;
      const rel = pset ? pset.getBoundingClientRect().top - scroller.getBoundingClientRect().top : null;
      return { open: !!body && !body.classList.contains('hide'),
               rows: b.querySelectorAll('.str-row').length,
               presetsReachable: rel != null && rel < scroller.clientHeight };
    };
    zz.click();            const closed = read();
    document.querySelector('[data-act="stretch-list"]').click();
    const opened = read();
    const t = document.querySelector('.str-body [data-act="stretch-tick"]');
    if (t) t.click();      const ticked = read();
    zz.click();            const again = read();
    return { closed, opened, ticked, again };
  });
  check("today's stretch list is closed when the sheet opens",
    strFold.closed.open === false && strFold.closed.rows > 0,
    `open ${strFold.closed.open}, ${strFold.closed.rows} movements behind it`);
  check('...and the quick-start presets need no scrolling to reach',
    strFold.closed.presetsReachable === true);
  check('...it opens on a tap', strFold.opened.open === true);
  check('...ticking something in it does not shut it',
    strFold.ticked.open === true);
  check('...and coming back to the sheet closes it again',
    strFold.again.open === false);

  /* ---- base camp is a place, not a card with a picture in it ----
     The sky, the range and the firelight are the screen's own backdrop. Two
     things make that true rather than merely intended, and both are easy to
     lose to a later layout change:

     it reaches the edges of the phone — a backdrop inset by the screen's
     padding is a panel, which is what it was; and the range is drawn in open
     sky above the first list rather than behind it, which is what it did on
     the first attempt: the mountains were there, under three rows of opaque
     cards, visible only as fragments at the left edge. */
  /* At phone width. `.screen > *` caps the column at 640px and centres it, so
     in this instrument's 1280 window the backdrop correctly reaches the edges
     of a 672px column and nothing wider — measuring against the screen there
     reports a full-bleed backdrop as inset by three hundred pixels. On the
     device the column is the screen, which is the case worth asserting. */
  await page.setViewportSize({ width: 390, height: 844 });
  /* The stretch sheet from the fold probe above is still open, and everything
     from here down is measured in pixels. Left up, its scrim dimmed the whole
     screen and the title-over-the-band sweep sailed through against a picture
     of the sheet — the band it thought it was reading was covered. */
  await page.evaluate(() => { if (typeof closeSheet === 'function') closeSheet(); });
  await page.waitForTimeout(320);
  const camp = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.profile.name = 'Lawrence';
    S.profile.bodyweight = [{ d: today(), w: 97 }];
    const e = EX['bb-back-squat'];
    for (let i = 0; i < 7; i++) S.sessions.push({ id: 'c' + i,
      date: dk(addDays(fromKey(today()), -i)), ended: Date.now(), dur: 52, kcal: 320, type: 'full',
      exercises: [{ exId: e.id, name: e.name, load: e.load, targetR: 5,
        sets: [{ w: 100, r: 5, done: true }, { w: 100, r: 5, done: true }] }] });
    checkMilestones(); save(true); buildWeekPlan(true); go('more'); render();
    const R = q => { const el = document.querySelector(q); if (!el) return null;
      const b = el.getBoundingClientRect();
      return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom) }; };
    const sc = R('#s-more');
    const ground = R('#more-body .camp-ground');
    const starEls = [...document.querySelectorAll('#more-body .camp-stars circle')];
    /* Measured against the sky — the backdrop above the ridgeline — and not
       against the star layer's own box. Against its own box the ratio is high
       however small the layer is, so shrinking the field to a band across the
       top passed a check whose whole job was to catch that. */
    const bgR = document.querySelector('#more-body .camp-bg').getBoundingClientRect();
    const rgR = document.querySelector('#more-body .camp-bg .ridge').getBoundingClientRect();
    const skyH = rgR.top - bgR.top;
    /* Only the ones you can actually see. A clipped SVG child still reports its
       geometric position, so a field squeezed into a band across the top still
       measured as spanning the whole sky — the check could not fail. */
    const layer = document.querySelector('#more-body .camp-stars').getBoundingClientRect();
    const ys = starEls.map(c => c.getBoundingClientRect().top)
      .filter(y => y >= layer.top - 1 && y <= layer.bottom + 1);
    /* Deterministic on purpose — a Math.random() field is a field no
       screenshot can be repeated against, and it clusters. */
    const sig = () => [...document.querySelectorAll('#more-body .camp-stars circle')]
      .map(c => c.getAttribute('cx') + ',' + c.getAttribute('cy')).join(';');
    const first = sig(); render(); const second = sig();
    return { screen: sc, bg: R('#more-body .camp-bg'), ridge: R('#more-body .camp-bg .ridge'),
             list: R('#more-body .list'), ground, stars: starEls.length,
             starSpan: ys.length && skyH > 0 ? (Math.max(...ys) - Math.min(...ys)) / skyH : 0,
             starsStable: first === second && first.length > 0,
             /* No card shell around it — the point of the change. */
             boxed: !!document.querySelector('#more-body .camp.hero, #more-body .camp.card') };
  });
  /* ---- Plan, with nothing logged yet ----
     stripRange() falls back to meta.created when no session has been finished,
     and meta.created is a timestamp while every store in this app is keyed
     'YYYY-MM-DD'. fromKey() threw on it and took the whole screen down. Nobody
     noticed because every other probe seeds a history first — the one state
     that breaks is the one a new user is in. */
  const freshPlan = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    /* Six weeks old, and nothing finished. The range has to come from
       meta.created, which is the branch that was reading it raw. */
    S.meta.created = new Date(Date.now() - 41 * 864e5).toISOString();
    save(true); buildWeekPlan(true);
    let err = null, range = null;
    try { range = stripRange(); go('plan'); render(); } catch (e) { err = String(e); }
    const body = (document.getElementById('plan-body').textContent || '').trim().length;
    go('more'); render();
    return { err, range, body };
  });
  check('the route opens for someone who has finished nothing yet',
    freshPlan.err === null && freshPlan.body > 40,
    freshPlan.err || `${freshPlan.body} characters`);
  /* The real subject. Nothing throws either way — fromKey() on an ISO string
     returns an Invalid Date, dk() renders that "NaN-NaN-NaN", and the strip's
     reach back through your own history comes out NaN. A check that only
     asserted "no error" passed against the bug, which is what this one did
     first. */
  check('...knowing how far back its history goes, rather than NaN weeks',
    freshPlan.range && Number.isFinite(freshPlan.range.min) && freshPlan.range.min <= -5
      && freshPlan.range.min >= -8,
    freshPlan.range ? `min ${freshPlan.range.min}, max ${freshPlan.range.max}` : 'no range');

  /* ---- what makes it a night, not a shape ----
     Four separate subjects, all of them decoration and therefore all of them
     the kind of thing a later change breaks without anything noticing:

     the snow, which needs a fill named in CSS or it gets SVG's default — black
     — and paints a solid triangle on every peak;

     the shimmer, which has to return each star to *its own* brightness: a
     keyframe holding a literal opacity flattens twelve differently-distant
     stars into one blinking row, and looks fine in a screenshot;

     the moon, whose whole claim is that it is true about the world. The glow
     is the trap: a filter on the <svg> blurs its entire alpha silhouette, and
     the unlit disc is a filled shape, so a one-percent crescent gets painted
     as a third-lit moon that still passes every check about its geometry;

     and the fire, which is a sibling of the backdrop rather than a child of it
     purely because the backdrop is masked out at the foot — put back inside,
     it is faded to nothing exactly where a camp belongs. */
  const night = await page.evaluate(() => {
    /* Today's range asks for no snow and must have none — the flag has to mean
       something, or every band in the app grows caps.

       This runs FIRST and on purpose. It leaves and comes back, and every
       render replaces #more-body's innerHTML: anything queried before it is a
       detached node afterwards, and getComputedStyle on a detached node returns
       an empty string for every property rather than throwing. Read in the
       other order, four of the checks below went green against ''. */
    go('today'); render();
    const heroSnow = document.querySelectorAll('#today-body .hero-ridge .ridge-snow').length;
    go('more'); render();

    const rd = document.querySelector('#more-body .camp-bg .ridge svg');
    const snow = rd && rd.querySelector('.ridge-snow');
    /* Every point in a path's d, in viewBox units. */
    const pts = d => (d || '').match(/-?[\d.]+ -?[\d.]+/g)?.map(s => s.split(' ').map(Number)) || [];
    /* The range's own vertices, off the path the caps are supposed to sit on.
       By class: "the first path with a url() fill" found the haze layer the
       moment one was added in front of the far range, and reported every cap
       as off the mountain. */
    const farD = rd && rd.querySelector('.ridge-far')?.getAttribute('d');
    const far = pts(farD);
    const caps = (snow?.getAttribute('d') || '').trim().split('Z').filter(s => s.trim());
    /* A cap's apex is its second point — M a, L apex, L b, L mid, Z. Assert it
       is a vertex of the range: a cap drawn by hand would land near a peak and
       drift the first time the range is reshaped. */
    const apexOnPeak = caps.map(c => {
      const p = pts(c);
      if (p.length < 3) return false;
      const [ax, ay] = p[1];
      return far.some(([x, y]) => Math.abs(x - ax) < .01 && Math.abs(y - ay) < .01);
    });

    const stars = [...document.querySelectorAll('#more-body .camp-stars circle')];
    const rest = stars.map(c => +getComputedStyle(c).opacity);
    /* Step the dimmest star to the peak of its keyframe by hand rather than
       waiting eleven seconds for it to come round. */
    const dim = stars[rest.indexOf(Math.min(...rest))];
    const dimRest = +getComputedStyle(dim).opacity;
    const heldDelay = getComputedStyle(dim).animationDelay;
    dim.style.animationDelay = '-10.34s';                 // 94% of an 11s cycle
    dim.style.animationPlayState = 'paused';
    const dimPeak = +getComputedStyle(dim).opacity;
    dim.style.animationDelay = ''; dim.style.animationPlayState = '';

    const moonSvg = document.querySelector('#more-body .camp-moon');
    const moonLit = moonSvg && moonSvg.querySelector('.moon-lit');

    const fire = document.querySelector('#more-body .spot-fire');
    const bg = document.querySelector('#more-body .camp-bg');
    const flame = document.querySelector('#more-body .camp-fire-svg');
    /* Where the near ridge's own outline sits under the flame. Read off the
       rendered path, not off a copy of the numbers — the range is
       preserveAspectRatio="none", so the only honest way to ask "is the fire
       standing on it" is to map the path's own units through the box it was
       painted into. */
    let ridgeYUnderFlame = null, flameFoot = null;
    const nearPath = rd && rd.querySelector('.ridge-near');
    if (nearPath && flame) {
      const box = rd.getBoundingClientRect(), fb = flame.getBoundingClientRect();
      const vb = rd.viewBox.baseVal;
      const near = pts(nearPath.getAttribute('d')).filter(([, y]) => y < 104);
      const vx = (fb.left + fb.width / 2 - box.left) / box.width * vb.width;
      let vy = near[near.length - 1][1];
      for (let i = 0; i < near.length - 1; i++) {
        const [x1, y1] = near[i], [x2, y2] = near[i + 1];
        if (vx >= x1 && vx <= x2) { vy = y1 + (y2 - y1) * (vx - x1) / (x2 - x1); break; }
      }
      ridgeYUnderFlame = box.top + vy / vb.height * box.height;
      flameFoot = fb.bottom;
    }

    return {
      snowFill: snow ? getComputedStyle(snow).fill : 'absent',
      /* Where the snow sits on the mountain, as a fraction of the drawing's
         own height — so it is the same assertion whatever size the box is. */
      snowSpan: (() => {
        if (!snow || !rd) return null;
        const vb = rd.viewBox.baseVal, b = snow.getBBox();
        return { top: b.y / vb.height, bottom: (b.y + b.height) / vb.height };
      })(),
      snowClipped: !!snow && !!snow.closest('g[clip-path]'),
      caps: caps.length, apexOnPeak: apexOnPeak.filter(Boolean).length, heroSnow,
      heroLayers: document.querySelectorAll('#today-body .hero-ridge path[fill^="url"]').length,
      restDistinct: new Set(rest.map(v => v.toFixed(3))).size,
      delayDistinct: new Set(stars.map(c => getComputedStyle(c).animationDelay)).size,
      anim: getComputedStyle(stars[0]).animationName,
      dimRest, dimPeak, heldDelay,
      svgFilter: moonSvg ? getComputedStyle(moonSvg).filter : 'absent',
      litFilter: moonLit ? getComputedStyle(moonLit).filter : 'absent',
      /* The phase is named in the moon's <title>, not painted anywhere. */
      /* The moon is the way into Settings now — scenery that does something.
         So what is asserted is that it is a real control with a real target
         and a name a screen reader can read, sitting in the sky above the
         range rather than in the header with a caption under it. */
      moonBtn: (() => {
        const b = document.querySelector('#more-body .camp-moon-btn');
        if (!b) return null;
        const r = b.getBoundingClientRect();
        /* Above the mountain you can SEE, not above the box it is drawn in —
           the massif's box now reaches up behind the header, so "above the
           range element" is false for a moon that is plainly in the sky. The
           stats sit on the mountain's slopes and the camp stands on the
           ground, so clearing both is what being in the sky means here. */
        const stats = document.querySelector('#more-body .camp-stats').getBoundingClientRect();
        const ground = document.querySelector('#more-body .camp-ground').getBoundingClientRect();
        return { act: b.dataset.act, tap: Math.round(Math.min(r.width, r.height)),
          inSky: r.bottom < stats.top && r.bottom < ground.top,
          named: (b.querySelector('.sr-only')?.textContent || '').trim().length > 6,
          /* textContent includes the screen-reader name, which is the whole
             point of it — so this asks the structural question instead: is
             there anything in here that is neither the drawing nor the name? */
          painted: b.querySelector(':scope > :not(.sr-only):not(svg)') ? 'yes' : '' };
      })(),
      fireDrawn: !!fire && fire.querySelectorAll('svg.fire path').length >= 5,
      fireOutsideMask: !!fire && !!bg && !bg.contains(fire),
      fireMask: fire ? getComputedStyle(fire).maskImage + '|' + getComputedStyle(fire).webkitMaskImage : 'absent',
      fireIsFuel: fire ? fire.dataset.act : 'absent',
      /* It stands on the moraine now, not on the near ridge — the camp has a
         floor of its own. Off the ground it floats; below it, it is buried. */
      fireOnGround: (() => {
        if (!fire) return null;
        const f = fire.getBoundingClientRect();
        const g = document.querySelector('#more-body .camp-ground').getBoundingClientRect();
        return f.bottom > g.top && f.bottom <= g.bottom;
      })(),
    };
  });

  /* The drawn moon against the arithmetic, right across a cycle. The three
     shapes carve an area of exactly `illum` of the disc when the numbers are
     right and something else entirely when they are not, so this is the whole
     drawing checked rather than the presence of one. */
  const moon = await page.evaluate(() => {
    const base = Date.UTC(2026, 7, 12, 17, 37);            // a real new moon
    const out = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(base + i * 2.5 * 86400000);
      const k = moonIllum(moonPhase(d));
      const el = document.createElement('div');
      el.innerHTML = moonHTML(24, d);
      const svg = el.querySelector('svg');
      const rx = +svg.querySelector('ellipse').getAttribute('rx');
      const half = svg.querySelector('path').getAttribute('d');
      const carving = svg.querySelector('ellipse').getAttribute('fill') !== '#F3ECDC';
      /* Lit area as a fraction of the disc: half a disc, plus or minus half an
         ellipse of the same height. */
      const drawn = (10 + (carving ? -rx : rx)) / 20;
      out.push({ k: +k.toFixed(3), drawn: +drawn.toFixed(3),
        /* Sweep flag 1 draws the arc clockwise from the top — the right limb. */
        right: / 0 1 /.test(half), waxing: moonPhase(d) < .5 });
    }
    return out;
  });

  await page.setViewportSize({ width: 1280, height: 720 });
  check('base camp has a sky with something in it', camp.stars >= 30, String(camp.stars));
  check('...spread through all of it rather than banded across the top',
    camp.starSpan >= .7, `stars cover ${Math.round(camp.starSpan * 100)}% of the sky`);
  check('...and the same sky every time it is drawn',
    camp.starsStable === true, camp.starsStable === true ? '' : 'redrew differently');
  check('...spanning the whole width of the screen, not inset in a card',
    camp.bg && camp.bg.l === camp.screen.l && camp.bg.r === camp.screen.r,
    camp.bg ? `${camp.bg.l}–${camp.bg.r} vs ${camp.screen.l}–${camp.screen.r}` : 'no backdrop');
  check('...and no card shell around it', camp.boxed === false);
  /* There is no list to be behind any more. More is a camp: the range stands
     over the moraine and the destinations are pitched on it. The invariant
     that replaces "above the first list" is "the range's foot reaches the
     ground the tents stand on" — a gap there is a range floating in the air. */
  check('...with the range standing on the ground the camp is pitched on',
    camp.ridge && camp.ground && Math.abs(camp.ridge.b - camp.ground.t) <= 24,
    camp.ridge && camp.ground ? `range ends ${camp.ridge.b}, ground starts ${camp.ground.t}` : 'missing');
  check('...and no list left on it at all',
    camp.list === null, 'a list is still rendered on More');

  /* Base camp's mountain is one massif, so its snow is a SNOWLINE clipped to
     the peak rather than a cap per summit — the caps check belongs to
     ridgeHTML's range and moved to Today with it. What matters here is that
     the snow covers the high ground and stops: a polygon that reaches the foot
     is a white mountain, and one that never starts is a grey one. */
  check('...snow lying on the high ground of the massif',
    night.snowSpan && night.snowSpan.top < .35 && night.snowSpan.bottom > .45
      && night.snowSpan.bottom < .95,
    night.snowSpan ? `from ${(night.snowSpan.top * 100) | 0}% to ${(night.snowSpan.bottom * 100) | 0}% of the mountain` : 'no snow');
  check('...painted rather than left to fill black',
    /^rgba?\(\s*2\d\d/.test(night.snowFill), night.snowFill);
  check('...and clipped to the mountain rather than laid across the sky',
    night.snowClipped === true, `clipped: ${night.snowClipped}`);
  /* It is the same range on every screen now — same silhouette, same five
     layers, same snow. It used to be a reduced version everywhere but here, on
     the theory that a pale layer under a card heading is a contrast failure
     waiting to be written. That theory was right; the gate was the wrong fix,
     because it also meant two ranges in one app that did not look like the
     same place. What holds the contrast instead is per-band opacity on the
     LIT layers only, asserted by the sweep below. */
  check('...the same range drawn on the other screens, snow and all',
    night.heroSnow === 1 && night.heroLayers >= 5,
    `${night.heroSnow} snow, ${night.heroLayers} layers on Today`);

  check('...the stars shimmering', night.anim === 'starTwinkle', night.anim);
  check('...not all at once', night.delayDistinct >= 8, `${night.delayDistinct} delays`);
  check('...each resting at its own brightness',
    night.restDistinct >= 5, `${night.restDistinct} distinct`);
  check('...and brightening from it rather than to a fixed white',
    night.dimPeak > night.dimRest + .05 && night.dimPeak < .99,
    `${night.dimRest} → ${night.dimPeak}`);

  check('...a moon in the sky above the range, and it opens Settings',
    night.moonBtn && night.moonBtn.act === 'open-settings' && night.moonBtn.inSky,
    night.moonBtn ? `${night.moonBtn.act}, in the sky: ${night.moonBtn.inSky}` : 'no moon');
  check('...with a target you can hit and a name, and nothing printed under it',
    night.moonBtn && night.moonBtn.tap >= 44 && night.moonBtn.named && night.moonBtn.painted === '',
    night.moonBtn ? `${night.moonBtn.tap}px, named ${night.moonBtn.named}, paints "${night.moonBtn.painted}"` : 'no moon');
  check('...its glow on the lit limb, not on the whole disc',
    night.svgFilter === 'none' && night.litFilter.startsWith('drop-shadow'),
    `svg ${night.svgFilter}, lit ${night.litFilter}`);
  const moonOff = moon.filter(m => Math.abs(m.k - m.drawn) > .01);
  check('...drawing exactly as much of itself as is lit, right across a cycle',
    moon.length === 12 && moonOff.length === 0,
    moonOff.map(m => `${m.k} lit vs ${m.drawn} drawn`).join(', '));
  const limbWrong = moon.filter(m => m.right !== m.waxing);
  check('...with the crescent on the limb the sun is on',
    limbWrong.length === 0, `${limbWrong.length} of ${moon.length} on the wrong side`);

  check('...a fire at the foot of the range, drawn rather than a glow',
    night.fireDrawn === true, `${night.fireDrawn}`);
  /* The camp shows exactly the destinations that are not already one tap away
     in the nav. Fuel and the route swap places in the tab bar, so the fire and
     the mountain are objects here only while the nav is not offering them —
     and when the nav is, the fire is still drawn, because a camp has a fire.
     Both states measured: a rule asserted in one state is half a rule. */
  const fireRule = await page.evaluate(() => {
    const read = () => {
      const f = document.querySelector('#more-body .spot-fire');
      const m = document.querySelector('#more-body .camp-route');
      return { drawn: !!f, act: f ? (f.dataset.act || null) : null,
        tappable: f ? f.tagName.toLowerCase() === 'button' : null,
        route: m ? m.dataset.go : null };
    };
    S.settings.nutrition = false; save(true); go('more'); render();
    const off = read();
    S.settings.nutrition = true; save(true); render();
    const on = read();
    return { off, on };
  });
  check('...which is Fuel while the nav is not offering Fuel',
    fireRule.on.act === 'open-nutrition' && fireRule.on.tappable === true,
    `${fireRule.on.act}, button ${fireRule.on.tappable}`);
  check('...and still a fire when it is not a destination',
    fireRule.off.drawn === true && fireRule.off.act === null && fireRule.off.tappable === false,
    `drawn ${fireRule.off.drawn}, act ${fireRule.off.act}`);
  /* The mountain is not on the fire's terms. It is where the journey starts,
     it is the one object here that was already a metaphor for the thing it
     opens, and a mountain that looks tappable and is not is worse than a
     second way to reach a screen the nav is also offering. */
  check('...and the mountain opening the route whether or not the nav does too',
    fireRule.on.route === 'plan' && fireRule.off.route === 'plan',
    `Fuel on: ${fireRule.on.route}, Fuel off: ${fireRule.off.route}`);

  /* ---- every door in the camp actually opens ----
     The destinations are drawings now, laid over each other in one scene, and
     the failure that comes with that is not a missing handler — it is an
     element that exists, carries the right data-act, and is simply covered.
     .camp-head is a text block with 150px of bottom padding to hold the range
     clear of the type; at z-index 3 that empty box sat over the top half of
     the mountain and ate every tap meant for it. Nothing about the markup
     looked wrong, and elementFromPoint on the summit returned .camp-head.

     So this asks the only question that matters: press the middle of each
     object and see what answers. Targets are measured too — the membership
     pill came out at 36px against a 44px floor. */
  const doors = await page.evaluate(() => {
    go('more'); render();
    const want = ['open-membership', 'open-settings', 'open-journey', 'open-help',
                  'stretch', 'routines', 'open-nutrition'];
    const out = [];
    for (const act of want) {
      const e = document.querySelector(`#more-body [data-act="${act}"]`);
      if (!e) { out.push({ act, found: false }); continue; }
      const b = e.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2,
        b.top + Math.min(b.height / 2, b.height - 10));
      const owner = hit && hit.closest ? hit.closest('[data-act],[data-go]') : null;
      out.push({ act, found: true, reaches: owner === e,
        got: owner ? (owner.dataset.act || owner.dataset.go) : 'nothing',
        tap: Math.round(Math.min(b.width, b.height)) });
    }
    const m = document.querySelector('#more-body [data-go="plan"]');
    if (m) {
      const b = m.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      const owner = hit && hit.closest ? hit.closest('[data-act],[data-go]') : null;
      out.push({ act: 'the mountain', found: true, reaches: owner === m,
        got: owner ? (owner.dataset.act || owner.dataset.go) : 'nothing',
        tap: Math.round(Math.min(b.width, b.height)) });
    } else out.push({ act: 'the mountain', found: false });
    return out;
  });
  const missing = doors.filter(d => !d.found);
  const covered = doors.filter(d => d.found && !d.reaches);
  const small = doors.filter(d => d.found && d.tap < 44);
  check('every destination in the camp is there', missing.length === 0,
    missing.map(d => d.act).join(', '));
  check('...and each one answers when you press it',
    doors.length >= 8 && covered.length === 0,
    covered.map(d => `${d.act} hit ${d.got}`).join(', ') || `${doors.length} checked`);
  check('...at a target you can actually hit',
    small.length === 0, small.map(d => `${d.act} ${d.tap}px`).join(', '));

  /* ---- the sky reaches the top of the screen ----
     The dark strip above base camp was never the header band, which repaints
     the page's own gradient and is invisible against it. It was the page: a
     notch, a title and a gap, all page-coloured, above a sky that only started
     where the block did. The backdrop is lifted behind the header now, and the
     band on this one screen blurs instead of painting.

     Measured at phone width and with a notch faked in, because the lift is
     `--safe-t + 104px` and a desktop browser reports the inset as 0 — a lift
     that fell short by exactly one notch would look perfect here and leave the
     strip on the phone that reported it. */
  await page.setViewportSize({ width: 390, height: 844 });
  const lift = await page.evaluate(() => {
    go('more'); render();
    const root = document.documentElement;
    const read = () => ({
      sky: Math.round(document.querySelector('#more-body .camp-bg').getBoundingClientRect().top),
      hdr: Math.round(document.querySelector('#s-more .hdr').getBoundingClientRect().top),
    });
    const flat = read();
    root.style.setProperty('--safe-t', '59px');
    const notch = read();
    root.style.removeProperty('--safe-t');
    const cs = getComputedStyle(document.querySelector('#s-more .hdr'), '::before');
    const other = getComputedStyle(document.querySelector('#s-progress .hdr'), '::before');
    return { flat, notch,
      /* A sheet over the screen makes every pixel below meaningless. */
      covered: document.getElementById('scrim').classList.contains('on'),
      moreBlurs: /blur/.test(cs.backdropFilter || cs.webkitBackdropFilter || ''),
      morePaints: cs.backgroundImage !== 'none',
      otherPaints: other.backgroundImage !== 'none',
      otherBlurs: /blur/.test(other.backdropFilter || other.webkitBackdropFilter || '') };
  });
  check('...with nothing covering the screen these are measured on',
    lift.covered === false);

  /* ---- the colour of everything outside the page ----
     Every box in this app is inset:0 to the viewport, so a strip at the foot of
     the screen is not the app's layout — it is the region the OS paints around
     a home-screen app, and only the manifest's background_color governs it.
     Checked end to end rather than by reading the file: a <link> to a manifest
     a host does not serve is exactly as useful as no manifest, and that failure
     is invisible in the source. */
  const mf = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return { linked: false };
    try {
      const r = await fetch(link.href);
      if (!r.ok) return { linked: true, status: r.status };
      const j = await r.json();
      const icon = j.icons && j.icons[0] && new URL(j.icons[0].src, link.href).href;
      const ir = icon ? await fetch(icon) : null;
      return { linked: true, status: 200, bg: j.background_color, display: j.display,
               theme: (document.querySelector('meta[name="theme-color"]') || {}).content,
               iconOk: !!(ir && ir.ok) };
    } catch (e) { return { linked: true, err: String(e) }; }
  });
  check('a manifest is linked and the host actually serves it',
    mf.linked === true && mf.status === 200, JSON.stringify(mf));
  check('...naming the colour the OS paints around the app',
    !!mf.bg && mf.bg.toLowerCase() === (mf.theme || '').toLowerCase(),
    `background_color ${mf.bg} vs theme-color ${mf.theme}`);
  check('...asking for a standalone window', mf.display === 'standalone', mf.display);
  check('...and its icon resolving too', mf.iconOk === true);
  check('...its sky reaching the top of the screen rather than starting under the title',
    lift.flat.sky <= 0, `sky top ${lift.flat.sky}`);
  check('...still reaching it once the notch is real',
    lift.notch.sky <= 0 && lift.notch.hdr - lift.flat.hdr === 59,
    `sky ${lift.notch.sky}, header moved ${lift.notch.hdr - lift.flat.hdr}`);
  check('...with the band over it blurring rather than painting',
    lift.moreBlurs === true && lift.morePaints === false,
    `blurs ${lift.moreBlurs}, paints ${lift.morePaints}`);
  check('...and every other screen still repainting its own sky',
    lift.otherPaints === true && lift.otherBlurs === false,
    `paints ${lift.otherPaints}, blurs ${lift.otherBlurs}`);

  /* The title over that band, at every scroll position this screen has.

     A blur cannot hold a brightness floor — it averages whatever is under it —
     so the guarantee here is not "opaque" but "the title still clears AA over
     the content this screen actually has". The bar is 3:1, not 4.5: the title
     is 24px at weight 700, which is large-scale text by WCAG, and 3:1 is the
     AA threshold for it. The tightest point measured is 3.58:1, and it is an
     ember icon tile smearing under the band — not the fire, whose glow was
     dimmed by a third on the suspicion and moved the number by exactly zero.

     Swept, not sampled at rest: at rest there is nothing under the band at all,
     so the one position a lazy check would read is the only one that cannot
     fail. And measured with no sheet open — see the note at the top of this
     block. */
  const relL = c => { const s = c / 255; return s <= .03928 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; };
  const lumOf = ([r, g, b]) => .2126 * relL(r) + .7152 * relL(g) + .0722 * relL(b);
  /* Brightest pixel in the band to the right of the title, where no glyph is. */
  const bandBrightest = async () => {
    const b64 = (await page.screenshot()).toString('base64');
    return page.evaluate(async d => {
      const img = new Image();
      await new Promise(r => { img.onload = r; img.onerror = r; img.src = d; });
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const dpr = img.width / window.innerWidth;
      const hdr = document.querySelector('#s-more .hdr').getBoundingClientRect();
      const x0 = Math.round(window.innerWidth * .58 * dpr), x1 = Math.round(window.innerWidth * .98 * dpr);
      const px = g.getImageData(x0, 1, x1 - x0, Math.round((hdr.bottom - 2) * dpr) - 1).data;
      let best = null, bl = -1;
      for (let i = 0; i < px.length; i += 4) {
        const l = px[i] * .2126 + px[i + 1] * .7152 + px[i + 2] * .0722;
        if (l > bl) { bl = l; best = [px[i], px[i + 1], px[i + 2]]; }
      }
      return best;
    }, 'data:image/png;base64,' + b64);
  };
  /* Short, on purpose. More fills the screen rather than scrolling — it is a
     place, not a list — so on a tall phone there is barely 48px of travel and
     nothing real ever passes under the band. On a 620px screen the camp
     overflows properly and the check has something to measure, which is also
     the case that matters: a small phone is where content does scroll under
     this header. */
  await page.setViewportSize({ width: 390, height: 620 });
  await page.evaluate(() => { go('more'); render(); });
  await page.waitForTimeout(500);
  const titleL = lumOf((await page.evaluate(() =>
    getComputedStyle(document.querySelector('#s-more .hdr .h1')).color)).match(/\d+/g).map(Number));
  const maxScroll = await page.evaluate(() => {
    const s = document.getElementById('s-more'); return s.scrollHeight - s.clientHeight; });
  let tightest = { ratio: 99, at: 0, px: null }, sampled = 0;
  /* Stepped over whatever travel there is rather than in fixed 60px jumps.
     More fills the screen instead of scrolling — it is a place, not a list —
     so a fixed step samples the top twice and calls it a sweep. */
  const step = Math.max(12, Math.round(maxScroll / 6));
  for (let y = 0; y <= maxScroll; y += step) {
    await page.evaluate(v => { document.getElementById('s-more').scrollTop = v; }, y);
    await page.waitForTimeout(140);
    const px = await bandBrightest();
    const r = (Math.max(titleL, lumOf(px)) + .05) / (Math.min(titleL, lumOf(px)) + .05);
    sampled++;
    if (r < tightest.ratio) tightest = { ratio: +r.toFixed(2), at: y, px };
  }
  await page.evaluate(() => { document.getElementById('s-more').scrollTop = 0; });
  check('...over enough of the screen to have found the tight spot',
    sampled >= 5 && maxScroll > 60, `${sampled} positions over ${maxScroll}px`);
  check('...with the screen title still legible over it wherever you have scrolled to',
    tightest.ratio >= 3, `${tightest.ratio}:1 at scroll ${tightest.at}, over ${JSON.stringify(tightest.px)}`);
  /* And the whole point of blurring rather than painting: at rest the band
     adds nothing to the sky it now stands in.

     Measured against the same pixel with the band's own treatment switched
     off, not against a pixel lower down — the sky is a gradient, so two
     different heights differ by several counts on their own and any threshold
     loose enough to allow that is loose enough to allow a veil. In raw
     channels, not relative luminance: down here a 0.4 veil moves relative
     luminance by 0.003, which slid straight through a threshold of 0.012. */
  await page.evaluate(() => { document.getElementById('s-more').scrollTop = 0; });
  await page.waitForTimeout(160);
  const bandOn = await shotPx(Math.round(390 * .72), 6);
  const bandOff = await page.addStyleTag({ content:
    '#s-more .hdr::before{background:none !important;' +
    '-webkit-backdrop-filter:none !important;backdrop-filter:none !important}' });
  await page.waitForTimeout(160);
  const bare = await shotPx(Math.round(390 * .72), 6);
  await bandOff.evaluate(n => n.remove());
  const bandDrift = Math.max(...bandOn.map((v, i) => Math.abs(v - bare[i])));
  check('...and adding nothing to that sky when you have not scrolled at all',
    bandDrift <= 2, `band ${JSON.stringify(bandOn)} vs bare sky ${JSON.stringify(bare)}`);

  /* The guarantee itself, stated as what it actually is. "Opaque" was the old
     screen's way of saying you cannot read what passes under the title; this
     band is transparent and says it with blur instead. So the measurement is
     edge energy — the mean absolute difference between neighbouring pixels
     along a row — which is what letterforms are made of and what a blur
     destroys. Brightness alone would not catch it: a blur preserves the mean,
     so a band with the radius taken to zero sits at almost the same average
     with every word under it perfectly sharp. */
  const edgeAt = async y => {
    const b64 = (await page.screenshot()).toString('base64');
    return page.evaluate(async ({ d, y }) => {
      const img = new Image();
      await new Promise(r => { img.onload = r; img.onerror = r; img.src = d; });
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const dpr = img.width / window.innerWidth;
      const row = g.getImageData(0, Math.round(y * dpr), img.width, 1).data;
      const l = [];
      for (let i = 0; i < row.length; i += 4) l.push(row[i] * .2126 + row[i + 1] * .7152 + row[i + 2] * .0722);
      let e = 0;
      for (let i = 1; i < l.length; i++) e += Math.abs(l[i] - l[i - 1]);
      return +(e / l.length).toFixed(2);
    }, { d: 'data:image/png;base64,' + b64, y });
  };
  /* A notch faked in so the band is deep enough to have a clear row in it, and
     the scroll position *found* rather than named: it was hardcoded at 300px,
     which had the stats under the band until the backdrop was redrawn and then
     had empty sky under it, so the check reported a blur destroying nothing
     and failed while the blur was working perfectly. Take the position where
     there is most to destroy. */
  await page.evaluate(() => document.documentElement.style.setProperty('--safe-t', '59px'));
  const noBlur = await page.addStyleTag({ content:
    '#s-more .hdr::before{-webkit-backdrop-filter:none !important;backdrop-filter:none !important}' });
  let sharp = 0, sharpAt = 0;
  for (let y = 120; y <= 620; y += 100) {
    await page.evaluate(v => { document.getElementById('s-more').scrollTop = v; }, y);
    await page.waitForTimeout(200);
    const e = await edgeAt(25);
    if (e > sharp) { sharp = e; sharpAt = y; }
  }
  await noBlur.evaluate(n => n.remove());
  await page.evaluate(v => { document.getElementById('s-more').scrollTop = v; }, sharpAt);
  await page.waitForTimeout(250);
  const smeared = await edgeAt(25);
  await page.evaluate(() => {
    document.documentElement.style.removeProperty('--safe-t');
    document.getElementById('s-more').scrollTop = 0;
  });
  check('...the words that pass under it having something to lose',
    sharp >= 6, `unblurred edge energy ${sharp} at scroll ${sharpAt}`);
  check('...and losing it — nothing under the band stays readable',
    sharp >= 6 && smeared < sharp / 4, `${sharp} → ${smeared} at scroll ${sharpAt}`);

  /* ---- what the range does to the words over it ----
     Every band except base camp sits behind a card's own type. The range is
     the same everywhere and its intensity is not: the lit layers are held down
     per band by CSS, and the near mass — near-black, and the layer carrying
     the silhouette — is left alone, because dimming the band as a whole takes
     the shape out before the text clears.

     Measured by DIFFERENCING, not by reading the brightest pixel in each glyph
     box. A text box shares space with whatever else is near it — an ember ring,
     a chevron, a card border — and the brightest pixel in it is usually one of
     those, so a naive sweep blames the mountains for contrast the mountains
     had nothing to do with. Two screenshots, one with the range and one
     without, and only the pixels that changed are the range's to answer for.

     This is what the old "Today has no snow" check became. That one asserted a
     gate that no longer exists; this one asserts the thing the gate was there
     to protect, on every screen at once, and it is what found "of 15" sitting
     on a snow cap at 1.08:1. */
  const ridgeText = [];
  for (const screen of ['today', 'plan', 'train', 'progress', 'more']) {
    await page.evaluate(s => { go(s); render(); }, screen);
    await page.waitForTimeout(420);
    const nodes = await page.evaluate(() => {
      const sc = document.querySelector('.screen.on');
      const bands = [...sc.querySelectorAll('.ridge')].map(r => r.getBoundingClientRect()).filter(r => r.height > 2);
      if (!bands.length) return [];
      const out = []; const w = document.createTreeWalker(sc, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) {
        if (!n.nodeValue.trim()) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        const b = rg.getBoundingClientRect();
        if (b.width < 2 || b.height < 2) continue;
        if (!bands.some(r => b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top)) continue;
        const cs = getComputedStyle(n.parentElement);
        const px = parseFloat(cs.fontSize), wt = parseInt(cs.fontWeight, 10) || 400;
        out.push({ text: n.nodeValue.trim().slice(0, 18), color: cs.color,
          big: px >= 24 || (px >= 18.66 && wt >= 700),
          r: { l: Math.round(b.left), t: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) } });
      }
      return out;
    });
    if (!nodes.length) continue;
    const noInk = await page.addStyleTag({ content: '.screen.on *{color:transparent !important;text-shadow:none !important}' });
    await page.waitForTimeout(120);
    const withR = (await page.screenshot()).toString('base64');
    const noR = await page.addStyleTag({ content: '.ridge{display:none !important}' });
    await page.waitForTimeout(120);
    const without = (await page.screenshot()).toString('base64');
    await noR.evaluate(t => t.remove());
    await noInk.evaluate(t => t.remove());
    const backs = await page.evaluate(async ({ a, b, boxes }) => {
      const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(i); i.src = src; });
      const [ia, ib] = [await load(a), await load(b)];
      const ctx2 = im => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g; };
      const ga = ctx2(ia), gb = ctx2(ib), dpr = ia.width / window.innerWidth;
      return boxes.map(box => {
        const x = Math.round(box.l * dpr), y = Math.round(box.t * dpr);
        const w = Math.max(1, Math.round(box.w * dpr)), h = Math.max(1, Math.round(box.h * dpr));
        const pa = ga.getImageData(x, y, w, h).data, pb = gb.getImageData(x, y, w, h).data;
        let best = null, bl = -1, touched = 0;
        for (let i = 0; i < pa.length; i += 4) {
          if (Math.abs(pa[i] - pb[i]) + Math.abs(pa[i+1] - pb[i+1]) + Math.abs(pa[i+2] - pb[i+2]) < 6) continue;
          touched++;
          const l = pa[i] * .2126 + pa[i+1] * .7152 + pa[i+2] * .0722;
          if (l > bl) { bl = l; best = [pa[i], pa[i+1], pa[i+2]]; }
        }
        return { px: best, share: touched / (w * h) };
      });
    }, { a: 'data:image/png;base64,' + withR, b: 'data:image/png;base64,' + without, boxes: nodes.map(n => n.r) });
    nodes.forEach((n, i) => {
      if (!backs[i].px || backs[i].share < .04) return;
      const tl = lumOf(n.color.match(/\d+/g).map(Number)), bl = lumOf(backs[i].px);
      const ratio = (Math.max(tl, bl) + .05) / (Math.min(tl, bl) + .05);
      ridgeText.push({ screen, text: n.text, ratio, need: n.big ? 3 : 4.5 });
    });
  }
  /* Back to More, and WAIT. go() adds .entering and a timer removes it; the
     arrival animation runs the screen up from opacity 0, so a probe that
     starts immediately measures a dimmed page. The flatten probe below fills
     the backdrop white and asserts it reads as white — it came back 237. */
  await page.evaluate(() => { go('more'); render(); });
  await page.waitForTimeout(1300);
  const failed = ridgeText.filter(t => t.ratio < t.need);
  const tight = ridgeText.slice().sort((a, b) => a.ratio / a.need - b.ratio / b.need)[0];
  check('...with enough text actually over the range to be worth measuring',
    ridgeText.length >= 8, `${ridgeText.length} text nodes over a band`);
  check('...and every word of it still legible against the range behind it',
    ridgeText.length >= 8 && failed.length === 0,
    failed.map(f => `${f.screen} "${f.text}" ${f.ratio.toFixed(2)}/${f.need}`).join(', ')
      || (tight ? `tightest ${tight.ratio.toFixed(2)}/${tight.need} on ${tight.screen} "${tight.text}"` : ''));

  /* The mask, in pixels off the foot rather than as a share of the box.
     They were 68% and 86%, which were the same thing while the box was 359px
     tall — and the lift makes it 500-odd, which moves the fade up into the
     middle of the range and dissolves the mountains the mask exists to protect.
     Measured by filling the backdrop flat and finding where it starts to go. */
  /* Flattened with a stylesheet rule rather than inline styles. Inline styles
     were silently lost between setting them and taking the screenshot — the
     column came back as the ordinary camp, and the check failed against a
     picture of the thing it had asked to be painted over. A rule outlives
     anything that rebuilds the node. */
  const flatTag = await page.addStyleTag({ content:
    '#more-body .camp-bg{background:#fff !important}' +
    '#more-body .camp-bg > *{visibility:hidden !important}' +
    /* The camp head's scrim paints over the backdrop — it is what keeps the
       name legible against the range — so a flattened backdrop read through it
       is not flat. It came back at 181 of 255. */
    '#more-body .camp-head::before{display:none !important}' });
  await page.waitForTimeout(120);
  const fade = await page.evaluate(() => {
    const b = document.querySelector('#more-body .camp-bg').getBoundingClientRect();
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), height: Math.round(b.height) };
  });
  const fadeCol = await (async () => {
    const b64 = (await page.screenshot()).toString('base64');
    return page.evaluate(async ({ d, box }) => {
      const img = new Image();
      await new Promise(r => { img.onload = r; img.onerror = r; img.src = d; });
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const dpr = img.width / window.innerWidth;
      const x = Math.round(window.innerWidth * .02 * dpr);       // clear of the title, which starts at --sp
      const out = [];
      for (let y = Math.max(box.top, 0); y < box.bottom; y++)
        out.push([y, g.getImageData(x, Math.round(y * dpr), 1, 1).data[0]]);
      return out;
    }, { d: 'data:image/png;base64,' + b64, box: fade });
  })();
  await flatTag.evaluate(n => n.remove());
  const solid = Math.max(...fadeCol.map(p => p[1]));
  /* A column that never went white is a column of the ordinary camp, and
     "where does it start to fade" answered against that is meaningless. */
  const flattened = solid > 240;
  const firstDrop = (fadeCol.find(p => p[1] < solid - 8) || [null])[0];
  check('...the backdrop actually flattened, so the fade is measurable at all',
    flattened, `brightest sample ${solid}`);
  check('...the range not dissolved by a mask that grew with the box',
    flattened && firstDrop !== null && Math.abs((fade.bottom - firstDrop) - 115) <= 12,
    firstDrop === null ? 'no fade found' : `fade starts ${fade.bottom - firstDrop}px off the foot of a ${fade.height}px box`);
  await page.setViewportSize({ width: 1280, height: 720 });
  check('...outside the backdrop it stands in front of, so the mask cannot fade it',
    night.fireOutsideMask === true && night.fireMask === 'none|none', night.fireMask);
  check('...standing on the camp floor rather than in the sky',
    night.fireOnGround === true, `on the ground: ${night.fireOnGround}`);

  /* ---- every sheet, not the handful anything else looks at ----
     The emoji sweep reads nine sheets and the blank sweep reads a screen at a
     time. There are sixty-two. The day editor was painting "avail-long",
     "avail-normal" and "env-hotel" as lowercase text in the icon box — the
     same bug as onboarding, in a sheet that hand-rolled opt()'s markup instead
     of calling it, so fixing opt() never reached it. And "How big is today?"
     printed `undefined` where each size's duration goes, on all four rows,
     because it read `r.mins` off RUNGS which has no such field while
     rungMinsLabel() sat there being used correctly by two other call sites.

     Neither is subtle on screen. Both survived because nothing ever opened
     these sheets and looked.

     Sheets needing arguments get plausible ones; any that still throw are
     counted and the count is asserted, so this cannot quietly degrade into a
     sweep that opens four sheets and declares victory. */
  const sheets = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.settings.nutrition = true;
    S.profile.heightCm = 178; S.profile.birthYear = 1990; S.profile.sex = 'm';
    S.profile.activity = 'light'; S.profile.name = 'Sam';
    S.profile.bodyweight = [{ d: today(), w: 82 }];
    S.profile.injuries = ['knee']; S.profile.priorities = ['Back'];
    const ex = EX['bb-back-squat'];
    S.sessions = [{ id: 's1', date: today(), ended: Date.now(), dur: 45, kcal: 300, type: 'full',
      exercises: [{ exId: ex.id, name: ex.name, load: ex.load, targetR: 5,
        sets: [{ w: 100, r: 5, done: true }, { w: 100, r: 5, done: true }] }] }];
    const rt = newRoutine('Ab Night'); addToRoutine(rt.id, 'bw-crunch');
    S.stretch = { onboarded: true, occupation: 'camera', areas: ['shoulder'], done: {}, mins: 12 };
    checkMilestones(); save(true); buildWeekPlan(true); render();

    const ARGS = {
      sheetDay: [today()], sheetDayEdit: [today()], sheetDayPast: [today()],
      sheetPlanDay: [today()], sheetCopyDay: [today()], sheetElsewhere: [today()],
      sheetElsewherePick: [today()], sheetLadder: ['full'],
      sheetForm: ['bb-back-squat', false], sheetFormList: [''],
      sheetExerciseGuide: ['bb-back-squat'], sheetVideoLink: ['bb-back-squat'],
      sheetRoutineEdit: [rt.id], sheetPortion: ['f1'], sheetFixFood: ['f1'],
      sheetEntryEdit: [0], sheetPlateCalc: [100], sheetExercisePicker: ['add', 0],
      sheetStretchPreset: ['neck'], sheetStretchInfo: ['mob-cat-cow'],
      /* The shape offParse() produces, not a raw Open Food Facts product:
         offParse returns null unless the name and all four macros are present,
         so a half-empty product never reaches this sheet. Passing one made the
         sweep report an `undefined` that the app cannot actually produce. */
      sheetScanFound: [{ n: 'Oat Milk, Brand', u: 'g', per: 100, kcal: 46,
                         p: 1.1, c: 6.8, f: 1.5, g: 'meal', serving: '250ml',
                         code: '5000000000000' }],
      sheetScanNew: ['0000000000000'], sheetCoachNote: ['late'],
      sheetImportFailed: ['Could not read it', 'The file had no text in it.']
    };
    const names = Object.getOwnPropertyNames(window)
      .filter(k => /^sheet[A-Z]/.test(k) && typeof window[k] === 'function').sort();

    const blanks = [], slugs = [], threw = [];
    let drew = 0;
    names.forEach(n => {
      try { closeSheet(); } catch (e) {}
      try { window[n].apply(null, ARGS[n] || []); } catch (e) { threw.push(n); return; }
      const body = document.getElementById('sheet-body');
      const t = (body && body.innerText) || '';
      if (!t.trim()) { threw.push(n + ' (drew nothing)'); return; }
      drew++;
      const m = t.match(/\bundefined\b|\bNaN\b|\[object Object\]|\$\{[^}]*\}/);
      if (m) blanks.push(n + ': ' + m[0]);
      /* An ICO key that reached the screen as text. An icon box holding a
         lowercase-hyphenated word is never legitimate — every real icon in one
         is an <svg>, and every real label is prose. */
      [...body.querySelectorAll('.opt-ico, .ico, .chip, .milestone-ico')].forEach(e => {
        const s = (e.textContent || '').trim();
        if (/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(s)) slugs.push(n + ': ' + s);
      });
    });
    return { total: names.length, drew, blanks: blanks.slice(0, 6), nBlank: blanks.length,
             slugs: slugs.slice(0, 6), nSlug: slugs.length, threw };
  });
  check('the sheet sweep opened nearly all of them',
    sheets.drew >= sheets.total - 4 && sheets.total >= 55,
    `${sheets.drew} of ${sheets.total}${sheets.threw.length ? ' — could not open ' + sheets.threw.join(', ') : ''}`);
  check('no sheet paints an undefined, a NaN or an unevaluated placeholder',
    sheets.nBlank === 0, sheets.blanks.join(' | '));
  check('no sheet paints the name of an icon instead of the icon',
    sheets.nSlug === 0, sheets.slugs.join(' | '));

  /* ---- an unevaluated placeholder is a blank with extra steps ----
     The privacy page printed "Guzo Fit v${VERSION}." — the literal characters,
     because the `${` had been escaped in the source, so the substitution never
     ran. It is the same class as an "undefined" reaching a screen and it slips
     past that sweep entirely, since the text it leaves behind is neither empty
     nor any of the words that pattern knows.

     Swept over the help pages because that is where the long-form prose lives,
     and the privacy page in particular is the one somebody screenshots for an
     App Store review. */
  const placeholders = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    const hits = [];
    let looked = 0;
    Object.keys(HELP_BODY).forEach(k => {
      let html;
      try { html = HELP_BODY[k](); } catch (e) { hits.push(k + ': threw'); return; }
      const box = document.createElement('div');
      box.innerHTML = html;
      const t = box.innerText || box.textContent || '';
      looked += t.length;
      /* Both halves of a template literal that never ran, and a bare backtick,
         which only ever reaches prose the same way. */
      const m = t.match(/\$\{[^}]*\}|`/);
      if (m) hits.push(k + ': ' + m[0]);
    });
    return { hits, n: hits.length, looked, pages: Object.keys(HELP_BODY).length };
  });
  check('the placeholder sweep read the help pages',
    placeholders.pages >= 5 && placeholders.looked > 2000,
    `${placeholders.pages} pages, ${placeholders.looked} chars`);
  check('no help page prints a placeholder it forgot to evaluate',
    placeholders.n === 0, placeholders.hits.join(' | '));

  /* ---- onboarding paints icons, not the names of icons ----
     Nothing in this file had ever rendered an onboarding screen, and the first
     screens a new user sees were painting "goal-strength", "lvl-new",
     "area-Back", "env-full", "gear-barbell" and "pg-anchor3" as text in the
     icon box: opt() interpolated whatever `ico` held, and nine of the twelve
     screens held an ICO key rather than markup. Every one of those icons had
     been drawn — only the lookup was missing, which is exactly the kind of
     thing that survives being looked at and not the kind that survives being
     rendered.

     Asserted three ways, because each fails on its own: no option box holds
     text, every box holds a drawn <svg>, and no screen repeats one icon across
     all of its options — four identical stopwatches down the session-length
     screen is an icon that has stopped distinguishing, the same failure as a
     chip that labels six of nine rows. */
  const obIcons = await page.evaluate(() => {
    const bad = [], sameForAll = [];
    let boxes = 0, screens = 0;
    Object.keys(OB_RENDER).forEach(step => {
      S = blank();
      /* Rendered into the real host where there is one, so the option markup
         is under the app's own stylesheet rather than a bare div. */
      const host = document.getElementById('ob-body') || document.createElement('div');
      try { host.innerHTML = OB_RENDER[step](); }
      catch (e) { bad.push(step + ': threw ' + e.message); return; }
      const icos = [...host.querySelectorAll('.opt-ico')];
      if (!icos.length) return;
      screens++;
      const drawn = new Set();
      icos.forEach(e => {
        boxes++;
        const t = (e.textContent || '').trim();
        const svg = e.querySelector('svg');
        if (t) bad.push(step + ': "' + t + '"');
        else if (!svg) bad.push(step + ': empty box');
        else drawn.add(svg.innerHTML);
      });
      if (icos.length > 1 && drawn.size === 1) sameForAll.push(step + ' ×' + icos.length);
    });
    return { bad: bad.slice(0, 6), n: bad.length, boxes, screens, sameForAll };
  });
  check('the onboarding sweep rendered its screens',
    obIcons.screens >= 10 && obIcons.boxes >= 50, `${obIcons.screens} screens, ${obIcons.boxes} boxes`);
  check('every onboarding option draws an icon rather than naming one',
    obIcons.n === 0, obIcons.bad.join(' | '));
  check('...and no screen gives all of its options the same one',
    obIcons.sameForAll.length === 0, obIcons.sameForAll.join(', '));

  /* ---- an option title is one line on the phone it will be read on ----
     Measured at 390px, because this instrument's window is 1280 and an option
     title has to be three times its real length before it wraps there. The
     same mistake as the stretch headings: a wrap check in a wide window passes
     whatever the copy says.

     Height rather than a Range here, because a title can legitimately carry an
     inline badge — "Anchor 3" plus RECOMMENDED — and the question is whether
     the row it all sits on became two rows, not how wide the words are. That
     is what "Anchor 3 — 3 days" did: the day count was appended to four names
     that already contained it, the title wrapped, and the badge dropped to a
     line of its own. The count is a column now. */
  await page.setViewportSize({ width: 390, height: 844 });
  const obWrap = await page.evaluate(async () => {
    const wrapped = [];
    let n = 0;
    for (const st of OB_STEPS) {
      S = blank(); S.onboarded = false; save(true);
      obStep = OB_STEPS.findIndex(x => x.k === st.k);
      go('onboard'); renderOnboard();
      await new Promise(r => setTimeout(r, 40));
      document.querySelectorAll('#ob-content .opt-t').forEach(t => {
        n++;
        const h = t.getBoundingClientRect().height;
        if (h > 30) wrapped.push(st.k + ': "' + t.textContent.trim().slice(0, 34) + '"');
      });
    }
    return { n, wrapped: wrapped.slice(0, 5), bad: wrapped.length };
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  /* ---- the time it claims is a time the flow can actually take ----
     The welcome screen said "around four minutes". Twenty-one questions at a
     brisk fifteen seconds each is five and a quarter before the seven-tap week
     setup and before reading a word, so four was unreachable. Understating is
     the one direction that costs trust — somebody promised four and still
     going at seven was misled by the first screen in the app.

     Derived from the question count rather than hard-coded, so adding
     questions without revisiting the claim fails here instead of shipping. */
  const claim = await page.evaluate(() => {
    S = blank(); S.onboarded = false; save(true);
    obDraft = { ...OB_DEFAULT, gear: { ...GEAR_ALL }, seedOverrides: {}, seedExact: {} };
    obStep = 0; go('onboard'); renderOnboard();
    const t = (document.getElementById('ob-content').innerText || '');
    const words = { four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    /* Anchored on "about"/"around", because the welcome screen also says
       "down to three minutes on a hotel floor" — and that phrase comes first,
       so a bare /(\w+) minutes/ reads the size ladder and reports null. */
    const m = t.match(/(?:about|around)\s+([a-z]+|\d+)\s+minutes/i);
    const said = m ? (words[m[1].toLowerCase()] || parseInt(m[1], 10) || null) : null;
    const qs = OB_STEPS.filter(s => s.q).length;
    return { said, qs, floor: Math.round(((qs * 15) + (7 * 5)) / 60 * 10) / 10 };
  });
  check('the welcome screen states how long onboarding takes',
    claim.said != null, String(claim.said));
  check('...and it is not less than the flow can be done in',
    claim.said >= claim.floor,
    `says ${claim.said} min, ${claim.qs} questions put the floor at ${claim.floor}`);

  check('the wrap check read every option title', obWrap.n > 70, String(obWrap.n));
  check('...and none of them wraps at phone width',
    obWrap.bad === 0, obWrap.wrapped.join(' | '));

  /* ---- onboarding gives something back before it asks for the week ----
     Twenty questions and exactly one screen showing anything in return, and
     then `ready` announcing a further task at the moment somebody expects to
     be finished. The preview is the payoff, and it is generated by the real
     engine rather than mocked, so it has to honour the answers behind it.

     The check that matters most is the last one. generateSession() reads S,
     not the draft, so the preview writes the draft into S to build a session —
     and it also lazily initialises rep targets into S.lifts through
     targetFor(). Leaving either behind would hand a half-seeded profile to
     somebody who walked back and changed their mind. */
  const preview = await page.evaluate(() => {
    const build = (mut) => {
      S = blank(); S.onboarded = false; save(true);
      const before = JSON.stringify(S);
      obDraft = { ...OB_DEFAULT, gear: { ...GEAR_ALL }, seedOverrides: {}, seedExact: {} };
      obDraft.bodyweight = 82; mut(obDraft);
      obStep = OB_STEPS.findIndex(x => x.k === 'preview');
      go('onboard'); renderOnboard();
      const body = document.getElementById('ob-content');
      const rows = [...body.querySelectorAll('.prev-row')];
      return {
        names: rows.map(r => (r.querySelector('.prev-n') || {}).textContent || ''),
        withLoad: rows.filter(r => ((r.querySelector('.prev-w') || {}).textContent || '').trim()).length,
        blank: rows.some(r => /undefined|NaN|\[object/.test(r.textContent)),
        leaked: JSON.stringify(S) !== before,
        lifts: Object.keys(S.lifts || {}).length
      };
    };
    const gym   = build(() => {});
    const hotel = build(d => { d.envs = ['hotel']; });
    const bw    = build(d => { d.envs = ['bw']; });
    const hurt  = build(d => { d.injuries = ['knee', 'shoulder', 'lowback', 'elbow', 'wrist', 'hip', 'ankle', 'neck']; });
    return { gym, hotel, bw, hurt };
  });
  check('onboarding shows a real first session before asking for the week',
    preview.gym.names.length >= 4 && !preview.gym.blank,
    preview.gym.names.join(', '));
  check('...with a weight against the movements that take one',
    preview.gym.withLoad >= 3, `${preview.gym.withLoad} of ${preview.gym.names.length}`);
  /* Built from the answers or it is a brochure. Two axes, because either alone
     can look right for the wrong reason: a hotel room removes the barbell, and
     a body full of injuries removes movements the equipment would have allowed. */
  check('...built from the kit you said you had',
    preview.hotel.names.join() !== preview.gym.names.join()
    && preview.bw.names.join() !== preview.hotel.names.join(),
    `gym ${preview.gym.names.length}, hotel ${preview.hotel.names.length}, bodyweight ${preview.bw.names.length}`);
  check('...and from the injuries you flagged',
    preview.hurt.names.join() !== preview.gym.names.join(),
    preview.hurt.names.join(', '));
  check('...and it leaves no trace of itself in the save',
    !preview.gym.leaked && !preview.hurt.leaked
    && preview.gym.lifts === 0 && preview.hurt.lifts === 0,
    `leaked ${preview.gym.leaked}/${preview.hurt.leaked}, lifts ${preview.gym.lifts}/${preview.hurt.lifts}`);

  /* ---- the step counter counts the question you are on ----
     It counted the questions *behind* it and printed them as "N of M", so
     onboarding opened on "0 of 16" and finished on "15 of 16" — a counter that
     starts at zero and never reaches its own total.

     Walked forward with obAdvance rather than by setting obStep, because
     obSkip reads obDraft: jumping straight to a step leaves the draft from
     whatever ran before and the skips belong to somebody else. Doing it the
     wrong way made five screens look like they shared a number, which was the
     probe and not the app.

     Two paths, because one cannot see the denominator move: the shortest run
     skips five questions and the full one asks them. The total has to match
     the number of counted screens actually shown, or the bar is measuring a
     journey nobody takes. */
  const obCount = await page.evaluate(() => {
    const run = (setup) => {
      S = blank(); S.onboarded = false; save(true);
      obDraft = { ...OB_DEFAULT, gear: { ...GEAR_ALL }, seedOverrides: {}, seedExact: {} };
      setup(); obStep = 0;
      const seen = [];
      for (let i = 0; i < 40 && obStep < OB_STEPS.length - 1; i++) {
        go('onboard'); renderOnboard();
        const e = document.querySelector('#ob-content .ob-step');
        if (e) {
          const m = e.textContent.match(/(\d+)\s+of\s+(\d+)/);
          if (m) seen.push([+m[1], +m[2]]);
        }
        obAdvance(1);
      }
      return seen;
    };
    const shape = (rows) => rows.length ? {
      first: rows[0][0], last: rows[rows.length - 1][0],
      total: rows[0][1], screens: rows.length,
      steady: rows.every((r, i) => r[0] === i + 1)
    } : { screens: 0 };
    return { lean: shape(run(() => {})),
             full: shape(run(() => { obDraft.envs = ['full']; obDraft.nutrition = true;
                                     obDraft.cardioAmount = 'some'; obDraft.gearMode = 'home'; })) };
  });
  ['lean', 'full'].forEach(path => {
    const o = obCount[path];
    const label = path === 'lean' ? 'the shortest run through onboarding' : 'the longest run through onboarding';
    check(`${label} counts from one`, o.first === 1, String(o.first));
    check('...up to its own total', o.last === o.total && o.total > 0, `${o.last} of ${o.total}`);
    check('...one screen at a time, with none of them counted twice',
      o.steady === true && o.screens === o.total, `${o.screens} screens, total says ${o.total}`);
  });
  /* And the two paths must not be the same path, or the pair above is one
     check run twice and the skipped questions are never exercised. */
  check('the two runs are genuinely different lengths',
    obCount.full.total > obCount.lean.total,
    `${obCount.lean.total} vs ${obCount.full.total}`);

  /* ---- the icon set has a palette, and it is a system ----
     Reported as "bland" and "not enough contrasting colours", and the cause was
     that all hundred and forty were one grey stroke. What is asserted here is
     the thing that can silently stop being true: a tone class is just a string
     until some CSS rule matches it, and a rule that is renamed, scoped wrong or
     dropped leaves the class in the markup and the icon grey. So the colours
     are read back off the rendered element rather than off the class list. */
  const palette = await page.evaluate(() => {
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:0;top:0';
    /* In a tile, because that is the only place a tone is meant to apply. */
    host.innerHTML = Object.keys(ICO).map(k =>
      `<div class="ico" data-k="${k}">${ICO[k]}</div>`).join('');
    document.body.appendChild(host);
    const seen = {}, tones = {};
    let massFirst = 0, massTotal = 0;
    host.querySelectorAll('.ico').forEach(t => {
      const svg = t.firstElementChild;
      const c = getComputedStyle(svg).color;
      seen[c] = (seen[c] || 0) + 1;
      const cls = (svg.getAttribute('class') || '').split(/\s+/).find(x => x.indexOf('t-') === 0);
      if (cls) tones[cls] = c;
      const m = svg.querySelector('.ico-m');
      if (m) { massTotal++; if (svg.firstElementChild === m) massFirst++; }
    });
    /* Colour must not override state. A chip that is on says so in ember, and
       an icon holding out for its own category inside one would be two states
       at once. */
    const onChip = document.createElement('div');
    onChip.className = 'chip on';
    onChip.innerHTML = ICO.stretch + 'x';
    document.body.appendChild(onChip);
    const chipCol = getComputedStyle(onChip.firstElementChild).color;
    const chipOwn = getComputedStyle(onChip).color;
    /* And outside a tile an icon still inherits, so a tick in a done row stays
       the row's colour rather than reverting to its category. One icon per
       tone, because a single sample only proves the one tone it happens to
       carry — which is how the first version of this passed a revert that
       unscoped a different one. */
    const loose = document.createElement('div');
    loose.style.color = 'rgb(1, 2, 3)';
    loose.innerHTML = ICO.water + ICO.summit + ICO.stretch + ICO.warn;
    document.body.appendChild(loose);
    const looseCol = [...loose.children].map(c => getComputedStyle(c).color)
      .filter((v, n, a) => a.indexOf(v) === n).join(', ');
    host.remove(); onChip.remove(); loose.remove();
    return { n: Object.keys(ICO).length, distinct: Object.keys(seen).length,
             tones, massFirst, massTotal, chipCol, chipOwn, looseCol,
             counts: Object.entries(seen).map(([c, n]) => c + '×' + n) };
  });
  check('the palette probe looked at the whole set', palette.n > 120, String(palette.n));
  check('an icon in a tile carries more than one colour',
    palette.distinct >= 4, palette.counts.join(' '));
  check('...and every tone it declares resolves to a distinct one',
    new Set(Object.values(palette.tones)).size === Object.keys(palette.tones).length
    && Object.keys(palette.tones).length >= 4,
    JSON.stringify(palette.tones));
  check('the mass is drawn under the line, never over it',
    palette.massTotal > 30 && palette.massFirst === palette.massTotal,
    `${palette.massFirst} of ${palette.massTotal}`);
  check('a category colour never overrules a state colour',
    palette.chipCol === palette.chipOwn, `${palette.chipCol} vs ${palette.chipOwn}`);
  check('...and outside a tile an icon still inherits',
    palette.looseCol === 'rgb(1, 2, 3)', palette.looseCol);

  /* ---- motion ----
     A screen should feel like it arrived, and the app has one set of curves so
     that nothing in it moves in a way nothing else does. Two things can go
     wrong and both are invisible to every other check here: the arrival never
     replays (so navigating back to a screen you have seen feels dead), or it
     replays on every render (so ticking a set re-animates the whole screen). */
  const motion = await page.evaluate(async () => {
    S = blank(); S.onboarded = true; save(true);
    const el = () => document.getElementById('s-today');
    go('more');
    go('today');
    const onArrival = el().classList.contains('entering');
    /* It has to come off, or the next arrival cannot replay it. */
    await new Promise(r => setTimeout(r, 850));
    const settled = el().classList.contains('entering');
    /* And once it has, an ordinary render — ticking a set, logging a weight,
       any of the dozens of handlers that call render() — must not re-animate
       the whole screen. That is the difference between motion that explains
       something and motion that is just movement. */
    render();
    const afterRender = el().classList.contains('entering');
    go('progress'); go('today');
    const replays = el().classList.contains('entering');

    const cs = getComputedStyle(document.documentElement);
    return {
      onArrival, afterRender, settled, replays,
      ease: cs.getPropertyValue('--ease-out').trim(),
      dur: cs.getPropertyValue('--t').trim()
    };
  });
  check('arriving on a screen animates it', motion.onArrival === true);
  check('...it clears itself once it has played', motion.settled === false);
  check('...and an ordinary render does not re-animate the screen',
    motion.afterRender === false, String(motion.afterRender));
  check('...and replays when you come back', motion.replays === true);
  check('the motion tokens exist', motion.ease.startsWith('cubic-bezier') && !!motion.dur,
    `${motion.ease} / ${motion.dur}`);

  /* Every animation added has to be inside a no-preference guard. Someone who
     has asked their phone to stop moving things has asked this app too. */
  const reduced = await page.evaluate(() => {
    const wanted = ['riseIn', 'tickPop', 'tickDraw', 'btnSheen', 'ridgeDraw', 'ringFill'];
    const guarded = {};
    wanted.forEach(k => { guarded[k] = false; });
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const rule of rules) {
        if (rule.type !== CSSRule.MEDIA_RULE) continue;
        if (!/prefers-reduced-motion\s*:\s*no-preference/.test(rule.conditionText || '')) continue;
        const txt = rule.cssText;
        wanted.forEach(k => { if (txt.includes(k)) guarded[k] = true; });
      }
    }
    return guarded;
  });
  /* Being inside the guard is not the same as being bound to arrival. The
     skyline drawing itself on has to hang off .entering — bound to .screen or
     .screen.on it would replay every time anything on Today re-rendered, which
     is every set you log, and the reduced-motion check above would stay green
     the whole time because the animation name never moved. */
  const arrivalOnly = await page.evaluate(async () => {
    go('progress'); go('today');
    await new Promise(r => setTimeout(r, 60));
    const line = () => document.querySelector('#today-body .ridge-line');
    if (!line()) return { missing: 'no skyline' };
    const during = getComputedStyle(line()).animationName;
    await new Promise(r => setTimeout(r, 900));
    render();
    const after = getComputedStyle(line()).animationName;
    return { during, after };
  });
  check('the skyline draws itself on when you arrive',
    arrivalOnly.during === 'ridgeDraw', arrivalOnly.missing || arrivalOnly.during);
  check('...and not on every render after it',
    arrivalOnly.after === 'none', arrivalOnly.after);

  check('the screen arrival is behind reduced-motion', reduced.riseIn === true);
  check('the set tick flourish is behind reduced-motion', reduced.tickPop === true);
  check('...including its mark', reduced.tickDraw === true);
  check('the button sweep is behind reduced-motion', reduced.btnSheen === true);
  check('...the skyline drawing itself on', reduced.ridgeDraw === true);
  check('...and the week ring filling', reduced.ringFill === true);

  /* ---- a button is an object ----
     The whole set was a coloured rectangle with a 2.5% scale on press. What is
     asserted is the part that can silently stop being true and would look
     merely "flat" rather than broken: the press moves it, the sweep plays and
     then cleans up after itself, and the specular exists. Read off the
     rendered element, because every one of these is a pseudo-element or a
     shadow and none of them changes the markup. */
  const press = await page.evaluate(async () => {
    S = blank(); S.onboarded = true; S.profile.name = 'Probe';
    save(true); buildWeekPlan(true); go('today');
    await new Promise(r => setTimeout(r, 900));
    const b = document.querySelector('#today-body .btn.primary');
    if (!b) return { missing: 'no primary button' };
    const rest = getComputedStyle(b);
    const spec = getComputedStyle(b, '::before');
    const before = { t: rest.transform, sh: rest.boxShadow };
    /* The real event, not a class set by hand: the listener is what has to
       still be wired, and a check that adds .sheen itself proves the CSS and
       nothing else. */
    b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const swept = b.classList.contains('sheen');
    /* And it has to come off, or the second tap cannot replay it. */
    await new Promise(r => setTimeout(r, 800));
    const cleared = b.classList.contains('sheen');
    return { before, swept, cleared,
             specular: spec.backgroundImage,
             shadows: (before.sh.match(/rgba?\(/g) || []).length };
  });
  check('the button probe found a primary button', !press.missing, press.missing);
  check('a solid button catches the light', /gradient/.test(press.specular || ''),
    press.specular);
  check('...and sits on more than one shadow', press.shadows >= 3, String(press.shadows));
  check('pressing it sweeps light across it', press.swept === true);
  check('...and the sweep clears itself for the next tap', press.cleared === false);

  /* The press physics, driven through a real pointer so :active actually
     applies — a computed style read without one reports the resting state and
     would pass whatever the press does. */
  const btnBox = await page.evaluate(`(() => {
    /* A button of its own, pinned where the pointer can certainly reach it.
       Pressing the real one would start a session on release and leave every
       check after this running against a live one — and a button that has
       scrolled below the fold takes the press on whatever is at those
       coordinates instead, which reports "no movement" for the wrong reason. */
    const b = document.createElement('button');
    b.className = 'btn primary lg probe-btn';
    b.textContent = 'Press';
    b.style.cssText = 'position:fixed;left:40px;top:40px;width:200px;z-index:9999';
    document.body.appendChild(b);
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
  await page.mouse.move(btnBox.x, btnBox.y);
  await page.mouse.down();
  /* After the transition has settled. Read in the same turn as the press and
     the transform is still at its resting value, which passes a
     "did it change" comparison against the released state for the wrong
     reason — the released state is `none` and the mid-flight one is an
     identity matrix. */
  await page.waitForTimeout(320);
  const held = await page.evaluate(`(() => {
    const m = getComputedStyle(document.querySelector('.probe-btn')).transform;
    const n = (m.match(/matrix\\(([^)]+)\\)/) || [0, ''])[1].split(',').map(Number);
    return { m, scale: n[0], dy: n[5] };
  })()`);
  await page.mouse.up();
  await page.waitForTimeout(320);
  const let_go = await page.evaluate(`(() => {
    const t = getComputedStyle(document.querySelector('.probe-btn')).transform;
    document.querySelector('.probe-btn').remove();
    return t;
  })()`);
  check('holding it presses it down',
    held.m !== 'none' && held.m !== let_go && held.scale < 1, `${held.m} vs ${let_go}`);
  /* Down as well as in: a control that only shrinks reads as receding rather
     than as being pushed. */
  check('...downward, not only smaller', held.dy > 0, String(held.dy));

  /* ---- the week, as an arc ----
     "0/3 THIS WEEK" was three characters of monospace pretending to be a
     status. The arc has to encode the fraction rather than decorate it, and
     it has to draw nothing at all when nothing is done — a dash pattern
     offset to its own full length still paints a subpixel sliver at twelve
     o'clock, which reads as a session done when none are. */
  const ring = await page.evaluate(() => {
    const at = n => {
      const el = document.createElement('div');
      el.innerHTML = weekRingHTML(n, 3);
      const arc = el.querySelector('.wk-ring-i');
      return { arc: !!arc, off: arc ? +arc.getAttribute('stroke-dashoffset') : null,
               n: (el.querySelector('b') || {}).textContent };
    };
    /* More done than planned is a real state — an extra session on a day that
       was already discharged — and an arc past full would wrap onto itself. */
    return { zero: at(0), one: at(1), all: at(3), over: at(5) };
  });
  check('nothing done draws no arc at all', ring.zero.arc === false && ring.zero.n === '0',
    JSON.stringify(ring.zero));
  check('...one of three fills a third of it', ring.one.arc === true
    && Math.abs(ring.one.off - 2 / 3) < 0.005, JSON.stringify(ring.one));
  check('...three of three fills it', Math.abs(ring.all.off) < 0.005, JSON.stringify(ring.all));
  check('...and more than planned does not wrap past full',
    Math.abs(ring.over.off) < 0.005 && ring.over.n === '5', JSON.stringify(ring.over));
  await page.evaluate(`closeSheet && document.querySelectorAll('.sheet.on').length && closeSheet()`);

  /* The sky is ambient only. Every surface, line and text colour was measured
     for contrast; the light in the room may change, the room may not. */
  const skyScope = await page.evaluate(() => {
    const bands = ['dawn', 'day', 'dusk', 'night'];
    const root = document.documentElement;
    const was = root.getAttribute('data-sky');
    go('today');
    const read = () => {
      const cs = getComputedStyle(root);
      return ['--text', '--muted', '--faint', '--surface', '--surface-2', '--line', '--ember']
        .map(v => cs.getPropertyValue(v).trim()).join('|');
    };
    const seen = bands.map(b => { root.setAttribute('data-sky', b); return read(); });
    root.setAttribute('data-sky', was || 'day');
    return { same: new Set(seen).size === 1, seen: seen.slice(0, 2) };
  });
  check('the sky never moves a colour that was measured for contrast',
    skyScope.same === true, skyScope.seen.join('  VS  '));

  /* ---- the session screen ----
     It held the right data and read like a spreadsheet: five columns of table
     under a repeated uppercase header, three controls in every card's header,
     and one flat bar that said how much was left and nothing about where you
     were. What is asserted here is that the reinvention kept every function it
     replaced — losing a control to a tidier screen is not a tidier screen. */
  const train = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    buildWeekPlan(true);
    startSession((plannedToday() || {}).type || 'full', 'full');
    const A = S.active;
    if (!A) return { started: false };
    go('train');
    const body = document.getElementById('train-body');
    const rail = body.querySelector('.rail');
    const firstRow = body.querySelector('.set-row');
    return {
      started: true,
      exercises: A.exercises.length,
      /* One segment per movement, not per set. */
      segs: rail ? rail.querySelectorAll('.rail-seg').length : -1,
      nowSegs: rail ? rail.querySelectorAll('.rail-seg.now').length : -1,
      where: (body.querySelector('#tp-where') || {}).textContent || '',
      /* The spreadsheet header is gone and the units moved into the fields —
         one unit per field, whichever fields this movement has. Counting three
         of them was right until a movement with no weight in it stopped
         drawing the weight column. */
      headers: body.querySelectorAll('.set-head').length,
      units: firstRow ? [...firstRow.querySelectorAll('.set-u')].map(u => u.textContent) : [],
      /* Every input the old row had is still addressed the same way, or the
         input listener and the progression silently stop. Which of them a row
         carries depends on the movement, so the assertion is on the order and
         the vocabulary rather than on a fixed list. */
      fields: firstRow ? [...firstRow.querySelectorAll('.set-in')].map(i => i.dataset.set) : [],
      labelled: firstRow ? [...firstRow.querySelectorAll('.set-in')].every(i => (i.getAttribute('aria-label') || '').length > 3) : false,
      tick: firstRow ? !!firstRow.querySelector('[data-act="toggle-set"]') : false,
      /* One control in the card header, and everything it replaced inside it.
         Counted against the cards that are open rather than against every
         movement in the session: the ones you are not on are folded to a line
         and a line has no header to put a menu in. */
      headerActs: [...body.querySelectorAll('.ex-card .ex-head [data-act]')].map(e => e.dataset.act),
      open: body.querySelectorAll('.ex-card:not(.fold)').length,
      folded: body.querySelectorAll('.ex-card.fold').length,
      more: body.querySelectorAll('.ex-card .ex-head [data-act="ex-menu"]').length,
      text: body.innerText || ''
    };
  });
  check('a session opens on the Train screen', train.started === true);
  check('the rail carries one segment per movement', train.segs === train.exercises,
    `${train.segs} segs / ${train.exercises} movements`);
  check('...with exactly one marked as where you are', train.nowSegs === 1, String(train.nowSegs));
  check('...and it names the movement and its position', /·\s*1 of \d+/.test(train.where), train.where);
  check('the spreadsheet header is gone', train.headers === 0, String(train.headers));
  check('...and every field carries its own unit instead',
    train.units.length === train.fields.length && train.units.every(u => u.trim().length > 0),
    `${train.fields.length} fields / ${train.units.join(', ')}`);
  check('every input survived the redesign',
    train.fields.length > 0
    && train.fields.every(f => ['w', 'd', 'r', 'rpe'].includes(f))
    && train.fields.includes('r')
    && train.fields.join(',') === [...train.fields].sort(
         (a, b) => ['w', 'd', 'r', 'rpe'].indexOf(a) - ['w', 'd', 'r', 'rpe'].indexOf(b)).join(','),
    train.fields.join(','));
  check('...still announced to a screen reader', train.labelled === true);
  check('...and the set still ticks', train.tick === true);
  /* Only the movement you are on is a full card. Everything else is a line —
     and the lines have to add up, or a movement has quietly stopped being on
     the screen at all. */
  check('only the movement you are on is a full card', train.open === 1,
    `${train.open} open / ${train.folded} folded`);
  check('...and every other one is still there as a line',
    train.open + train.folded === train.exercises,
    `${train.open}+${train.folded} vs ${train.exercises}`);
  /* The toolbar in every card header became one menu. The form guide and the
     swap have to still exist somewhere, or this is a feature deletion wearing
     a tidier screen. */
  check('the toolbar is gone from the card header',
    train.headerActs.filter(a => a === 'swap-ex' || a === 'ex-form').length === 0,
    train.headerActs.join(', '));
  check('...replaced by one menu per open movement', train.more === train.open,
    `${train.more} menus / ${train.open} open`);
  check('no placeholder text on the session screen', !BAD.test(train.text));

  const trainMenu = await page.evaluate(() => {
    const btn = document.querySelector('#train-body .ex-card .ex-head [data-act="ex-menu"]');
    if (!btn) return { opened: false, acts: [] };
    btn.click();
    const b = document.getElementById('sheet-body');
    return { opened: true, acts: [...b.querySelectorAll('[data-act]')].map(e => e.dataset.act),
             text: b.innerText || '' };
  });
  check('the menu opens', trainMenu.opened === true);
  check('...and still offers a swap', trainMenu.acts.includes('swap-ex'), trainMenu.acts.join(', '));
  check('...a note', trainMenu.acts.includes('save-note'));
  check('...and removing the movement', trainMenu.acts.includes('remove-ex'));
  check('no placeholder text in it', !BAD.test(trainMenu.text || ''));

  /* Ticking a set has to move the rail without re-rendering the screen — a
     full re-render mid-session closes the keyboard and loses your place. */
  const railLive = await page.evaluate(() => {
    closeSheet();
    const body = document.getElementById('train-body');
    /* The open card, not the first one in the array. Only the movement you are
       on is a full card now, so a set row to tick exists in exactly one place —
       and reaching into a folded movement finds no input at all, which throws
       rather than fails. A probe that throws has not run. */
    const openCard = body.querySelector('.ex-card:not(.fold)');
    if (!openCard) return { missing: 'no open card' };
    const ei = +openCard.dataset.ei;
    /* More than one set: ticking the last one legitimately folds the movement
       away and rebuilds it, so a single-set movement would fail this for the
       right reason and tell you nothing about the wrong one. */
    while (S.active.exercises[ei].sets.length < 2) {
      S.active.exercises[ei].sets.push({ w: '', r: '', rpe: '', done: false });
    }
    renderTrain();
    const card = document.querySelector('#train-body .ex-card[data-ei="' + ei + '"]');
    /* By name, not by position: the rail is in display order and the array is
       not, so indexing one with the other lines up only by luck. */
    const segOf = () => {
      const seg = [...document.querySelectorAll('#train-body .rail-seg')].find(s =>
        (s.getAttribute('aria-label') || '').indexOf(S.active.exercises[ei].name) === 0);
      return seg ? seg.firstElementChild.style.width : null;
    };
    const before = segOf();
    const beforeCount = (body.querySelector('#tp-count') || {}).textContent;
    /* The input node itself, not the container: renderTrain() rewrites the
       body's innerHTML but never replaces the body element, so comparing the
       container proves nothing — which is what the first version of this
       check did. If this node survives, so does your caret and your keyboard. */
    const inputBefore = card.querySelector('.set-in');
    card.querySelector('[data-act="toggle-set"]').click();
    const after = segOf();
    const afterCount = (document.getElementById('train-body').querySelector('#tp-count') || {}).textContent;
    const inputAfter = document.querySelector('#train-body .ex-card[data-ei="' + ei + '"] .set-in');
    stopRest();
    return { before, after, beforeCount, afterCount,
             sameNode: inputBefore === inputAfter };
  });
  check('the rail probe found a movement to tick', !railLive.missing, railLive.missing);
  check('ticking a set fills the rail', railLive.after !== railLive.before,
    `${railLive.before} → ${railLive.after}`);
  check('...and moves the count', railLive.afterCount !== railLive.beforeCount,
    `${railLive.beforeCount} → ${railLive.afterCount}`);
  check('...in place, without re-rendering the screen', railLive.sameNode === true);

  /* ---- a set row asks only what the movement asks ----
     Reported from a screenshot: a plank offering a box reading "— lb" and a
     bicycle crunch offering "0 +lb". A third of every row given to a question
     the movement does not have — and on the plank the run button was a sixth
     child of a five-column grid, so the tick wrapped to a line of its own and
     the row stood 105px tall against everyone else's 54.

     Both are asserted from the rendered row rather than from the stylesheet:
     the grid was legible as five columns right up until a sixth child arrived,
     which is exactly the reading that missed it. */
  const rowShape = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.profile.units = 'lb'; save(true);
    const mk = (exId, name, load, targetW, targetR) => ({
      exId, name, load, targetW, targetR,
      sets: [{ w: '', r: '', rpe: '', done: false }, { w: '', r: '', rpe: '', done: false }]
    });
    S.active = { id: 'rs', date: today(), type: 'full', rung: 'full',
      started: Date.now(), activeMs: 0, tickAt: Date.now(),
      exercises: [ mk('bb-back-squat', 'Back Squat', 'wt', 100, 5),
                   mk('bw-plank', 'Plank', 'time', null, 45),
                   mk('bw-bicycle', 'Bicycle Crunch', 'bw', null, 20) ] };
    go('train');
    /* Each in turn, because only the one you are on is a full card. */
    const read = ei => {
      S.active.exercises.forEach((x, n) => { x.collapsed = n !== ei ? true : false; });
      renderTrain();
      const card = document.querySelector('#train-body .ex-card[data-ei="' + ei + '"]');
      const row = card && card.querySelector('.set-row');
      if (!row) return { missing: true };
      const r = row.getBoundingClientRect();
      const kids = [...row.children];
      return {
        fields: kids.filter(k => k.classList.contains('set-f'))
                    .map(k => (k.querySelector('.set-in') || {}).dataset.set),
        run: kids.filter(k => k.classList.contains('set-run')).length,
        h: Math.round(r.height),
        /* One line: every child's centre sits on the row's centre. A wrapped
           child is the bug, and its height alone would not say so on a row
           that had grown for another reason. */
        oneLine: kids.every(k => {
          const b = k.getBoundingClientRect();
          return Math.abs((b.top + b.bottom) / 2 - (r.top + r.bottom) / 2) < 6;
        })
      };
    };
    return { squat: read(0), plank: read(1), crunch: read(2) };
  });
  check('a loaded lift still asks for a weight',
    !rowShape.squat.missing && rowShape.squat.fields.join(',') === 'w,r,rpe',
    (rowShape.squat.fields || []).join(','));
  check('a hold asks for no weight, and offers a button that runs it',
    rowShape.plank.fields.join(',') === 'r,rpe' && rowShape.plank.run === 1,
    `${rowShape.plank.fields.join(',')} · ${rowShape.plank.run} run`);
  check('a bodyweight movement asks for no weight either',
    rowShape.crunch.fields.join(',') === 'r,rpe', rowShape.crunch.fields.join(','));
  check('...and every row is one line, whatever it carries',
    rowShape.squat.oneLine && rowShape.plank.oneLine && rowShape.crunch.oneLine,
    `squat ${rowShape.squat.oneLine} plank ${rowShape.plank.oneLine} crunch ${rowShape.crunch.oneLine}`);
  check('...and the same height',
    rowShape.plank.h === rowShape.squat.h && rowShape.crunch.h === rowShape.squat.h,
    `squat ${rowShape.squat.h} plank ${rowShape.plank.h} crunch ${rowShape.crunch.h}`);

  /* A movement you open by hand stays open when the screen repaints around it.
     `collapsed` is tri-state for exactly this — absent means "fold what I am
     not on", and an explicit false has to outrank it or the tap undoes
     itself on the next tick. */
  const heldOpen = await page.evaluate(() => {
    S.active.exercises.forEach(x => { delete x.collapsed; });
    renderTrain();
    const ahead = document.querySelector('#train-body .ex-card.fold.ahead');
    if (!ahead) return { missing: 'nothing ahead' };
    const ei = +ahead.dataset.ei;
    ahead.querySelector('[data-act="toggle-collapse"]').click();
    const openedNow = !document.querySelector('#train-body .ex-card[data-ei="' + ei + '"]').classList.contains('fold');
    /* The repaint that used to close it: ticking anything anywhere. */
    updateTrainProgress();
    const stillOpen = !document.querySelector('#train-body .ex-card[data-ei="' + ei + '"]').classList.contains('fold');
    return { openedNow, stillOpen };
  });
  check('a movement you open by hand opens', heldOpen.openedNow === true, heldOpen.missing);
  check('...and stays open when the screen repaints', heldOpen.stillOpen === true);

  /* ---- the rail stays where the question is ----
     "Where am I" is what you want while you are scrolling, and the answer was
     scrolling away with you. Faked notch, because env(safe-area-inset-top) is
     0px in a desktop browser and both halves of the offset that puts the band
     over the notch cancel to nothing there. */
  /* After the arrival stagger has finished. go() adds .entering and the
     screen's children animate in on a translateY — measure into that and every
     rectangle on the screen is a few pixels out, which reads as a layout bug
     that is not there. */
  await page.waitForTimeout(700);
  const pinnedRail = await page.evaluate(async () => {
    /* Two frames after the scroll before anything is measured. Chrome updates a
       sticky element's offset on the scroll it belongs to, not on the layout a
       getBoundingClientRect() forces — read in the same turn as the scroll and
       the bar is measured at its old position, which reads as a 12px miss that
       is not there. */
    const settle = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const root = document.documentElement;
    const was = root.style.getPropertyValue('--safe-t');
    root.style.setProperty('--safe-t', '47px');
    const scr = document.getElementById('s-train');
    const pin = document.querySelector('#train-body .tr-pin');
    if (!pin) { root.style.setProperty('--safe-t', was); return { missing: 'no pinned rail' }; }
    const inner = pin.querySelector('.card');
    /* All the way down, not a fixed 400: a short session clamps the scroll
       before the bar has caught, and the check then measures a bar that simply
       has not stuck yet — which is a pass or a fail decided by how many
       movements the fixture happened to have. */
    scr.scrollTop = scr.scrollHeight;
    await settle();
    const stuck = scr.scrollTop > 0;
    const sb = scr.getBoundingClientRect();
    const band = pin.getBoundingClientRect().top - sb.top;
    const card = inner.getBoundingClientRect().top - sb.top;
    /* Both layers are hittable, so hit-test order IS paint order here: what
       elementFromPoint reports in the strip above the card is what is drawn
       there. A pointer-events:none band would report the row underneath and
       pass this check while showing straight through — see the ridge on
       Progress for that mistake made in full. */
    const covered = [4, card / 2, card - 4].map(y =>
      (document.elementFromPoint(Math.round(sb.left + sb.width / 2), Math.round(sb.top + y)) || {}).className || '');
    scr.scrollTop = 0;
    await settle();
    root.style.setProperty('--safe-t', was);
    return { band: Math.round(band), card: Math.round(card), covered, stuck };
  });
  check('the session scrolled far enough to pin anything', pinnedRail.stuck === true);
  check('the session rail pins to the top of the screen',
    pinnedRail.band === 0, pinnedRail.missing || String(pinnedRail.band));
  check('...clearing the notch by exactly one notch', pinnedRail.card === 61,
    String(pinnedRail.card));
  check('...over a band nothing scrolls through',
    (pinnedRail.covered || []).every(c => String(c).indexOf('tr-pin') >= 0),
    (pinnedRail.covered || []).join(' | '));

  /* ---- the range reveals itself as you work ----
     Asked for as "each exercise illuminates a corresponding % of the mountain
     that that exercise represents against the whole routine". Two claims, and
     both have to be measured rather than described: a movement's slice of the
     horizon is its sets over the session's sets, and it lights that slice in
     proportion to its own ticks. */
  const range = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.settings.autoRest = false; save(true);
    const mk = (exId, name, n) => ({ exId, name, load: 'wt', targetR: 5, targetW: 40,
      sets: Array.from({ length: n }, () => ({ w: '', r: '', rpe: '', done: false })) });
    /* Deliberately uneven: equal slices would pass a proportionality check by
       accident, which is the same shape of lie as a spread check on a fresh
       profile where every date is identical. */
    S.active = { id: 'rg', date: today(), type: 'full', rung: 'full',
      started: Date.now(), activeMs: 0, tickAt: Date.now(),
      exercises: [mk('bb-back-squat', 'Back Squat', 5), mk('db-lateral', 'Lateral Raise', 2),
                  mk('bb-bench', 'Bench Press', 3)] };
    go('train');
    if (!document.querySelector('#train-body .tr-range')) return { missing: 'no range' };
    const W = 320;
    /* Re-queried every time. renderTrain() replaces the body's innerHTML, so a
       node captured before it is detached — and a detached node reports a
       zero-width box, which reads as "nothing is lit" and as a divider at
       Infinity rather than as a stale reference. */
    const rangeEl = () => document.querySelector('#train-body .tr-range');
    const slices = () => [0, 1, 2].map(i => {
      const r = rangeEl().querySelector('[data-lit="' + i + '"]');
      return r ? { x: +r.getAttribute('x'), w: +r.getAttribute('width') } : null;
    });
    /* The slice each movement owns, read off the divider positions rather than
       off the clip rects — the rects are the *lit* part and are zero here. */
    const owned = [];
    let acc = 0;
    sessionOrder(S.active).forEach(i => {
      const n = S.active.exercises[i].sets.length;
      owned.push({ i, x: acc, w: n / 10 * W });
      acc += n / 10 * W;
    });
    const before = slices();
    /* Straight off a render, with no tick anywhere near it. The markup and the
       in-place update each used to do their own arithmetic, and a revert that
       turned the markup into one frontier bar changed nothing any check could
       see — because the first tick made updateTrainProgress rewrite the rects
       correctly from its own copy. One of two call sites silently repairing the
       other is worse than either being wrong. */
    S.active.exercises[1].sets.forEach(s => { s.done = true; });
    renderTrain();
    const rendered = slices();
    S.active.exercises[1].sets.forEach(s => { s.done = false; });
    renderTrain();
    /* Out of order on purpose: the last movement, which is the far end of the
       range. A single frontier bar would light the squats instead. */
    const far = document.querySelector('#train-body .ex-card[data-ei="2"]');
    S.active.exercises[2].collapsed = false;
    S.active.exercises[0].collapsed = true;
    renderTrain();
    document.querySelector('#train-body .ex-card[data-ei="2"] .tick').click();
    const after = slices();
    /* The rail must divide where the range does, or a segment sits under the
       wrong mountain. Measured from the rendered boxes, not from the flex
       values that produced them. */
    const rb = rangeEl().getBoundingClientRect();
    const segs = [...document.querySelectorAll('#train-body .rail-seg')].map(s => {
      const b = s.getBoundingClientRect();
      return ((b.left + b.right) / 2 - rb.left) / rb.width * W;
    });
    const wantCentres = owned.map(o => o.x + o.w / 2);
    return { owned, before, rendered, after, segs, wantCentres, hasFar: !!far };
  });
  check('the range divides by work, not by movement count',
    !range.missing && Math.abs(range.owned[0].w - 160) < 1
    && Math.abs(range.owned[1].w - 96) < 1 && Math.abs(range.owned[2].w - 64) < 1,
    range.missing || (range.owned || []).map(o => Math.round(o.w)).join(', '));
  check('...and nothing is lit before you start',
    (range.before || []).every(s => s && s.w === 0),
    (range.before || []).map(s => s && s.w).join(', '));
  check('a render alone lights the movement that is finished, and only it',
    range.rendered && range.rendered[1].w > 0 && Math.abs(range.rendered[1].w - 64) < 1
    && range.rendered[0].w === 0 && range.rendered[2].w === 0,
    (range.rendered || []).map(s => s && +s.w.toFixed(1)).join(', '));
  check('ticking a set lights that movement\'s own share of the mountain',
    range.after && range.after[2].w > 0 && Math.abs(range.after[2].w - 96 / 3) < 1,
    (range.after || []).map(s => s && +s.w.toFixed(1)).join(', '));
  check('...and only that one, wherever in the session it sits',
    range.after && range.after[0].w === 0 && range.after[1].w === 0,
    (range.after || []).map(s => s && +s.w.toFixed(1)).join(', '));
  check('the trail under the range divides where the range does',
    (range.segs || []).length === (range.wantCentres || []).length
    && range.segs.every((c, n) => Math.abs(c - range.wantCentres[n]) < 6),
    (range.segs || []).map(Math.round).join(', ') + ' vs ' + (range.wantCentres || []).map(Math.round).join(', '));

  /* ---- the session reads like a written programme ----
     A real plan groups its movements and the heading tells you how to treat
     what is under it — you read "Main lifts" and you know to rest three
     minutes before you have read the exercise. The session was a flat column. */
  const blocks = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    S.settings.warmup = true;
    S.profile.cardio = { amount: 'some', modes: ['car-walk'] };
    save(true); buildWeekPlan(true);
    startSession('full', 'full');
    /* A generated full session does not always contain core or cardio, and
       `.every()` over an empty list is true — so the checks below would pass by
       having nothing to look at. Both categories are put in deliberately. */
    const add = (id, extra) => {
      const ex = EX[id];
      S.active.exercises.push(Object.assign({ exId: id, name: ex.name, load: ex.load,
        targetW: null, targetR: ex.rl, sets: [{ w: '', r: '', rpe: '', done: false }], note: '' }, extra || {}));
    };
    add('bw-plank');
    add('car-walk', { cardio: true });
    save(true);
    go('train');
    const body = document.getElementById('train-body');
    /* Read in document order, so the assertion is about the order you actually
       see rather than about a set of labels. */
    const heads = [...body.querySelectorAll('.sec-head.blk .sec-t')].map(e => e.textContent);
    const perEx = S.active.exercises.map(x => ({ name: x.name, block: exBlock(x),
      tier: (EX[x.exId] || {}).tier, pattern: (EX[x.exId] || {}).pattern }));
    return { heads, perEx, n: S.active.exercises.length, text: body.innerText || '' };
  });
  check('a session is grouped into blocks', blocks.heads.length >= 2, blocks.heads.join(' / '));
  /* Each of the checks below is an .every() over a filter, and a filter that
     matches nothing passes. Assert there was something to look at first. */
  check('...and there is core and cardio in it to classify',
    blocks.perEx.filter(x => x.pattern === 'core').length > 0 &&
    blocks.perEx.filter(x => x.pattern === 'cardio').length > 0,
    blocks.perEx.map(x => x.pattern).join(','));
  check('...starting with the warm-up', blocks.heads[0] === 'Warm-up', blocks.heads[0]);
  check('...and the headings are in the order you meet them',
    blocks.heads.join('|') === [...new Set(blocks.heads)].join('|'), blocks.heads.join(' / '));
  check('the warm-up movement is in the warm-up block',
    blocks.perEx[0] && blocks.perEx[0].block === 'warmup', JSON.stringify(blocks.perEx[0]));
  /* Tier is the app's own measure of how much a movement asks of you, which is
     the same question that decides whether it is a main lift. */
  check('heavy compounds land in Main lifts',
    blocks.perEx.filter(x => x.tier <= 2 && x.pattern !== 'core' && x.pattern !== 'cardio' && x.pattern !== 'mobility')
                .every(x => x.block === 'main'),
    blocks.perEx.filter(x => x.tier <= 2 && x.block !== 'main').map(x => x.name + ':' + x.block).join(', '));
  check('...and lighter work in Accessories',
    blocks.perEx.filter(x => x.tier > 2 && !['core','cardio','mobility','carry'].includes(x.pattern))
                .every(x => x.block === 'accessory'),
    blocks.perEx.filter(x => x.tier > 2 && x.block === 'main').map(x => x.name).join(', '));
  check('core work is its own block',
    blocks.perEx.filter(x => x.pattern === 'core').every(x => x.block === 'core'),
    blocks.perEx.filter(x => x.pattern === 'core').map(x => x.name + ':' + x.block).join(', '));
  check('cardio is the finisher',
    blocks.perEx.filter(x => x.pattern === 'cardio').every(x => x.block === 'finisher'),
    blocks.perEx.filter(x => x.pattern === 'cardio').map(x => x.name + ':' + x.block).join(', '));
  check('no placeholder text with blocks on', !BAD.test(blocks.text));

  /* One block is not a structure. A recovery day is mobility from top to
     bottom, and a heading over every single card says nothing. */
  const oneBlock = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    S.active = generateSession('recovery', 'full', 'full', 60);
    save(true); go('train');
    const body = document.getElementById('train-body');
    return { heads: body.querySelectorAll('.sec-head.blk').length,
             cards: body.querySelectorAll('.ex-card').length,
             blocks: [...new Set(S.active.exercises.map(x => exBlock(x)))] };
  });
  check('a recovery day is one block from top to bottom', oneBlock.blocks.length === 1,
    oneBlock.blocks.join(', '));
  check('...so it gets no headings at all', oneBlock.heads === 0, String(oneBlock.heads));
  check('...and still renders its movements', oneBlock.cards >= 3, String(oneBlock.cards));

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
  /* Membership IS reachable — the user asked for it — and it must not be the
     paywall. sheetPaywall() carries a £69.99 card with no payment behind it;
     a button to that under someone's name is the fastest way to make a working
     app read as an unfinished one. */
  const member = await page.evaluate(() => {
    go('more'); render();
    const btn = document.querySelector('#more-body [data-act="open-membership"]');
    if (!btn) return { there: false };
    btn.click();
    const txt = document.getElementById('sheet-body').innerText || '';
    const priced = /£|\$|per month|\/ month|free trial/i.test(txt);
    closeSheet();
    return { there: true, priced, says: txt.replace(/\s+/g, ' ').slice(0, 70) };
  });
  check('...but membership is, from under your name',
    member.there === true);
  check('...and it says what your copy is rather than what one costs',
    member.there && member.priced === false, member.says || '');
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

  /* ---- supersets, on the screens you meet them on ----
     Two movements run straight through with no rest between them, then one
     rest after the pair. The model is checked in engine.mjs; what is checked
     here is that the builder offers it, the session says so, and — the whole
     point — that ticking the first half starts no clock. */
  const supUI = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    const r = newRoutine('Push');
    ['bb-bench', 'db-fly', 'bb-ohp'].forEach(id => addToRoutine(r.id, id));
    sheetRoutineEdit(r.id);
    const sh = document.getElementById('sheet-body');
    const links = [...sh.querySelectorAll('[data-act="rt-superset"]')];
    const off = { count: links.length, pressed: links.map(b => b.getAttribute('aria-pressed')) };
    /* Return a fully shaped miss rather than reaching into an empty list. A
       probe that throws has not run: it kills the instrument before it prints
       anything, so a reverted subject reads as a crash instead of a red. */
    if (!links.length) { closeSheet(); return { off, on: { pressed:[], letters:[], bracketed:-1 }, inCircuit:-1 }; }

    /* Two movements, two gaps between three of them — and none after the last,
       which has nothing to run into. */
    links[0].click();
    const sh2 = document.getElementById('sheet-body');
    const on = {
      pressed: [...sh2.querySelectorAll('[data-act="rt-superset"]')].map(b => b.getAttribute('aria-pressed')),
      letters: [...sh2.querySelectorAll('.rt-sup')].map(e => e.textContent.trim()),
      bracketed: sh2.querySelectorAll('.rt-item.sup').length
    };

    /* A circuit already runs every movement back to back. */
    setRoutineCircuit(r.id, true);
    sheetRoutineEdit(r.id);
    const sh3 = document.getElementById('sheet-body');
    const inCircuit = sh3.querySelectorAll('[data-act="rt-superset"]').length;
    setRoutineCircuit(r.id, false);
    closeSheet();
    return { off, on, inCircuit };
  });
  check('the builder offers a link in every gap between movements',
    supUI.off.count === 2, String(supUI.off.count));
  /* Offered after the last one, it would suppress the session's final rest. */
  check('...and not after the last one', supUI.off.count === 2 &&
    supUI.off.pressed.every(p => p === 'false'), supUI.off.pressed.join(','));
  check('tapping it pairs the two movements',
    supUI.on.pressed[0] === 'true' && supUI.on.pressed[1] === 'false', supUI.on.pressed.join(','));
  check('...and they are lettered A and B',
    supUI.on.letters.length === 2 && supUI.on.letters[0].endsWith('A') && supUI.on.letters[1].endsWith('B'),
    supUI.on.letters.join(' / '));
  check('...and bracketed as one thing', supUI.on.bracketed === 2, String(supUI.on.bracketed));
  check('a circuit is not offered supersets at all', supUI.inCircuit === 0, String(supUI.inCircuit));

  const supTrain = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    const r = newRoutine('Push');
    ['bb-bench', 'db-lateral', 'bb-ohp'].forEach(id => addToRoutine(r.id, id));
    toggleSupersetLink(r.id, 0);
    S.active = buildRoutineSession(r.id, false);
    S.settings.autoRest = true;
    save(true); go('train');
    const body = document.getElementById('train-body');
    const heads = [...body.querySelectorAll('.sup-head .sup-tag')].map(e => e.textContent.trim());
    const nums = [...body.querySelectorAll('.ex-card .ex-node-t')].map(e => e.textContent.trim());

    /* The behaviour, driven through the real handler rather than described:
       tick A and no clock starts; tick B and one does.

       A movement you are not on is folded to a line, so B has no tick to press
       until A is finished — which is also how you would reach it. Ticking
       through A is therefore part of the fixture, not part of the assertion:
       every one of those ticks is on the first half of the pair and must start
       nothing. */
    const tickOne = ei => {
      const b = document.querySelector(`.ex-card[data-ei="${ei}"]:not(.fold) .set-row:not(.done) .tick`);
      if (!b) return null;
      b.click();
      const on = document.getElementById('rest-bar').classList.contains('on');
      stopRest();
      return on;
    };
    stopRest();
    const aTicks = [];
    for (let n = 0; n < 8 && !isComplete(S.active.exercises[0]); n++) aTicks.push(tickOne(0));
    const afterA = aTicks.length ? aTicks.every(x => x === false) : null;
    const afterB = tickOne(1);
    stopRest();
    return { heads, nums, afterA, afterB, aTicks, text: body.innerText || '' };
  });
  check('a session names its superset once, over the pair',
    supTrain.heads.length === 1 && /Superset A/i.test(supTrain.heads[0]), supTrain.heads.join(' / '));
  check('...and numbers the pair A, B rather than 01, 02',
    supTrain.nums[0] === 'A' && supTrain.nums[1] === 'B', supTrain.nums.join(','));
  /* This is the entire behaviour of a superset. Everything else is labelling. */
  check('ticking the first of a pair starts no rest', supTrain.afterA === true,
    JSON.stringify(supTrain.aTicks));
  check('...and ticking the second does', supTrain.afterB === true, String(supTrain.afterB));
  check('no placeholder text on a session with a superset in it', !BAD.test(supTrain.text));

  /* ---- what a set row offers, and what the tick actually records ----
     engine.mjs checks ghostFor() directly. This drives the real button,
     because the bug worth catching is the placeholder and the handler
     disagreeing — and a probe that recomputes the handler's arithmetic its
     own way would agree with itself and prove nothing. */
  const rowUI = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    /* 1.25 is the weight fmtW paints as "1.3". If the tick records what the
       row painted rather than what it meant, that lands in the store. */
    S.sessions = [{ date: today(), ended: true, dur: 40, exercises: [
      { exId:'bb-bench', name:'Bench Press', load:'wt',
        sets: [{ w:1.25, r:9, done:true }, { w:82.5, r:8, done:true }] } ] }];
    save(true);
    const ex = EX['bb-bench'];
    S.active = { date: today(), type:'push', rung:'full', env:'full', started: Date.now(),
      rounds: 1, exercises: [{ exId:'bb-bench', name: ex.name, load:'wt', targetW: 70, targetR: 5,
        sets: [0,1,2].map(() => ({ w:'', r:'', rpe:'', done:false })), note:'' }] };
    S.settings.autoRest = false;
    save(true); go('train');
    const card = document.querySelector('.ex-card[data-ei="0"]');
    const ph = si => {
      const row = card.querySelectorAll('.set-row')[si];
      return { w: row.querySelector('[data-set="w"]').placeholder,
               r: row.querySelector('[data-set="r"]').placeholder };
    };
    const offered = [ph(0), ph(1), ph(2)];

    card.querySelectorAll('.set-row')[0].querySelector('.tick').click();
    const stored = { w: S.active.exercises[0].sets[0].w, r: S.active.exercises[0].sets[0].r };

    /* Type a different weight into set 1 and the rows under it must follow,
       without the card being rebuilt. */
    const wIn = card.querySelectorAll('.set-row')[1].querySelector('[data-set="w"]');
    const w1 = card.querySelectorAll('.set-row')[0].querySelector('[data-set="w"]');
    w1.value = '95';
    w1.dispatchEvent(new Event('input', { bubbles: true }));
    const carried = ph(1);
    const sameNode = card.querySelectorAll('.set-row')[1].querySelector('[data-set="w"]') === wIn;
    return { offered, stored, carried, sameNode, text: document.getElementById('train-body').innerText || '' };
  });
  check('a set row offers what you did in that slot last time',
    rowUI.offered[0].w === '1.3' && rowUI.offered[0].r === '9' &&
    rowUI.offered[1].w === '82.5', JSON.stringify(rowUI.offered.slice(0, 2)));
  check('...and falls back to the prescription where there is no last set',
    rowUI.offered[2].w === '70' && rowUI.offered[2].r === '5', JSON.stringify(rowUI.offered[2]));
  /* fmtW rounds to a tenth, which is right for a label and wrong for a store:
     1.25 saved as 1.3 sends you to the wrong plate with confidence. */
  check('ticking an untouched row records the reps it was offering',
    String(rowUI.stored.r) === '9', String(rowUI.stored.r));
  check('...and the unrounded weight behind the one it painted',
    Number(rowUI.stored.w) === 1.25, `painted ${rowUI.offered[0].w}, stored ${rowUI.stored.w}`);
  check('typing into set 1 carries down to the rows under it',
    rowUI.carried.w === '95', rowUI.carried.w);
  check('...in place, without rebuilding the card under your caret',
    rowUI.sameNode === true);
  check('no placeholder text on a card with offered values', !BAD.test(rowUI.text));

  /* ---- a record, at the moment it happens ---- */
  const prUI = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    const ex = EX['bb-bench'];
    S.lifts['bb-bench'] = { w:80, r:8, fails:0, best:{ w:80, r:8, e1rm:e1rm(80,8) },
                            lastDate: today(), history:[] };
    S.settings.autoRest = false;
    S.active = { date: today(), type:'push', rung:'full', env:'full', started: Date.now(),
      rounds: 1, exercises: [{ exId:'bb-bench', name: ex.name, load:'wt', targetW: 120, targetR: 5,
        sets: [{ w:'', r:'', rpe:'', done:false }, { w:'', r:'', rpe:'', done:false }], note:'' }] };
    save(true); go('train');
    const card = () => document.querySelector('.ex-card[data-ei="0"]');
    const row = si => card().querySelectorAll('.set-row')[si];
    row(0).querySelector('.tick').click();
    const hit = { pr: row(0).classList.contains('pr'),
                  star: !!row(0).querySelector('.sn svg'),
                  label: row(0).querySelector('.sn').getAttribute('aria-label') || '' };
    /* Untick and it has to go away — a record you took back is not a record. */
    row(0).querySelector('.tick').click();
    const undone = { pr: row(0).classList.contains('pr'),
                     star: !!row(0).querySelector('.sn svg'),
                     num: row(0).querySelector('.sn').textContent.trim() };
    /* And a set that does not beat it stays an ordinary set. */
    const w = row(1).querySelector('[data-set="w"]');
    w.value = '40'; w.dispatchEvent(new Event('input', { bubbles: true }));
    const rr = row(1).querySelector('[data-set="r"]');
    rr.value = '5'; rr.dispatchEvent(new Event('input', { bubbles: true }));
    row(1).querySelector('.tick').click();
    const ordinary = row(1).classList.contains('pr');
    return { hit, undone, ordinary };
  });
  check('beating your best marks the row it happened in', prUI.hit.pr === true);
  check('...with a star rather than the set number', prUI.hit.star === true);
  check('...and says so to a screen reader', /personal best/i.test(prUI.hit.label), prUI.hit.label);
  check('taking the set back takes the record back',
    prUI.undone.pr === false && prUI.undone.star === false && prUI.undone.num === '1',
    JSON.stringify(prUI.undone));
  check('a set that does not beat your best is an ordinary set',
    prUI.ordinary === false);

  /* ---- the RPE column ---- */
  const rpeUI = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    const ex = EX['bb-bench'];
    S.active = { date: today(), type:'push', rung:'full', env:'full', started: Date.now(),
      rounds: 1, exercises: [{ exId:'bb-bench', name: ex.name, load:'wt', targetW: 70, targetR: 5,
        sets: [{ w:'', r:'', rpe:'', done:false }], note:'' }] };
    save(true); go('train');
    const fieldsOn = document.querySelectorAll('.ex-card[data-ei="0"] .set-row .set-f').length;
    const wOn = document.querySelector('.ex-card[data-ei="0"] [data-set="w"]')
                        .getBoundingClientRect().width;
    S.settings.rpe = false; save(true); renderTrain();
    const fieldsOff = document.querySelectorAll('.ex-card[data-ei="0"] .set-row .set-f').length;
    const wOff = document.querySelector('.ex-card[data-ei="0"] [data-set="w"]')
                         .getBoundingClientRect().width;
    const rpeGone = !document.querySelector('.ex-card[data-ei="0"] [data-set="rpe"]');
    return { fieldsOn, fieldsOff, wOn, wOff, rpeGone };
  });
  check('a set row carries three fields with RPE on', rpeUI.fieldsOn === 3, String(rpeUI.fieldsOn));
  check('...and two with it off', rpeUI.fieldsOff === 2 && rpeUI.rpeGone,
    `${rpeUI.fieldsOff} fields, rpe gone: ${rpeUI.rpeGone}`);
  /* The reason for the setting: the column costs a fixed 64px of a row that
     is tight on a phone. If turning it off does not widen anything, it is a
     preference with no payoff. */
  check('...and weight gets the width back', rpeUI.wOff > rpeUI.wOn + 20,
    `${Math.round(rpeUI.wOn)}px → ${Math.round(rpeUI.wOff)}px`);

  /* ---- rest says what it is for, and the rail shows the terrain ---- */
  const restUI = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    const mk = (id, sets) => { const e = EX[id]; return { exId:id, name:e.name, load:e.load,
      targetW: e.load === 'wt' ? 60 : null, targetR: e.rl, note:'',
      sets: Array.from({length:sets}, () => ({ w:'', r:'', rpe:'', done:false })) }; };
    S.settings.autoRest = true;
    S.active = { date: today(), type:'push', rung:'full', env:'full', started: Date.now(),
      rounds:1, exercises: [mk('bb-bench', 3), mk('db-lateral', 2)] };
    save(true); go('train');

    const railSegs = () => document.querySelectorAll('#train-body .rail .rail-seg').length;
    const railBrks = () => document.querySelectorAll('#train-body .rail .rail-brk').length;
    const before = { segs: railSegs(), brks: railBrks(),
                     blocks: [...new Set(S.active.exercises.map(x => exBlock(x)))] };

    const tick = (ei, si) => document.querySelectorAll(`.ex-card[data-ei="${ei}"] .set-row`)[si]
                                     .querySelector('.tick').click();
    stopRest();
    tick(0, 0);
    const mid = { label: document.getElementById('rest-label').textContent,
                  next: document.getElementById('rest-next').textContent };

    /* Finish the movement and the rest is now for the next one, not the next
       set of the one you just finished. */
    stopRest(); tick(0, 1); stopRest(); tick(0, 2);
    const after = { next: document.getElementById('rest-next').textContent };
    stopRest();

    /* And the rail fills the movement you actually ticked, not the segment
       sitting at that position among the block breaks. The second movement is
       the one that matters: walking rail.children maps segment 1 onto the
       break, so the movement *after* a break never updates. Read without a
       re-render, because updateTrainProgress is the thing under test. */
    tick(1, 0);
    stopRest();
    const fills = [...document.querySelectorAll('#train-body .rail .rail-seg i')]
                    .map(e => e.style.width);
    return { before, mid, after, fills,
             names: S.active.exercises.map(x => x.name) };
  });
  check('the rail is one segment per movement', restUI.before.segs === 2, String(restUI.before.segs));
  /* Two movements in two different blocks, so exactly one break between them.
     A session that is all one block gets none. */
  check('...with a break where the block changes',
    restUI.before.blocks.length === 2 && restUI.before.brks === 1,
    restUI.before.blocks.join('/') + ' → ' + restUI.before.brks + ' breaks');
  check('resting names what it is for', /Bench Press/.test(restUI.mid.next) &&
    /set 2 of 3/.test(restUI.mid.next), restUI.mid.next);
  check('...and moves on to the next movement once one is finished',
    /Lateral Raise/.test(restUI.after.next), restUI.after.next);
  /* The bug the break introduced: updateTrainProgress walked rail.children, so
     segment N mapped onto order[N + breaks so far] and the wrong movement
     filled the moment a session had more than one block. */
  check('the rail fills the movement after a break, not the break',
    restUI.fills[0] === '100%' && restUI.fills[1] === '50%', restUI.fills.join(', '));

  /* ---- a record survives to the finish sheet, and a corrected set does not ---- */
  const prDone = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    const e = EX['bb-bench'];
    S.lifts['bb-bench'] = { w:80, r:8, fails:0, best:{ w:80, r:8, e1rm:e1rm(80,8) },
                            lastDate: today(), history:[] };
    S.settings.autoRest = false;
    /* Two sets, not one: ticking the last set of a movement legitimately folds
       the card away, and there would be no row left to look at. */
    S.active = { date: today(), type:'push', rung:'full', env:'full', started: Date.now(),
      rounds:1, exercises: [{ exId:'bb-bench', name:e.name, load:'wt', targetW:120, targetR:5,
        sets: [{ w:'', r:'', rpe:'', done:false }, { w:'', r:'', rpe:'', done:false }], note:'' }] };
    save(true); go('train');
    const row = () => document.querySelectorAll('.ex-card[data-ei="0"] .set-row')[0];
    /* Fail, do not throw: a missing row would kill the instrument before it
       printed anything, and a reverted subject would read as a crash. */
    const miss = { marked:'no row', afterEdit:{ pr:null, flag:null, num:'' },
                   restored:null, finishHTML:'', noneHTML:'' };
    if (!row()) return miss;
    row().querySelector('.tick').click();
    if (!row()) return miss;
    const marked = row().classList.contains('pr');

    /* Ticked at the offered 120, then corrected to what you actually lifted.
       Without the re-check the star stays and the finish sheet reports a best
       that never happened. */
    const w = row().querySelector('[data-set="w"]');
    w.value = '40'; w.dispatchEvent(new Event('input', { bubbles: true }));
    const afterEdit = { pr: row().classList.contains('pr'),
                        flag: !!S.active.exercises[0].sets[0].pr,
                        num: row().querySelector('.sn').textContent.trim() };

    /* Put it back above the record and it is a record again. */
    w.value = '150'; w.dispatchEvent(new Event('input', { bubbles: true }));
    const restored = row().classList.contains('pr');

    return { marked, afterEdit, restored };
  });
  check('a record is marked when the set is ticked', prDone.marked === true);
  check('correcting the weight downward takes the record back',
    prDone.afterEdit.pr === false && prDone.afterEdit.flag === false &&
    prDone.afterEdit.num === '1', JSON.stringify(prDone.afterEdit));
  check('...and correcting it back up returns it', prDone.restored === true);

  /* Finished for real and the sheet read out of the DOM. Calling
     sessionPRsHTML() and matching its return proves the function works and
     says nothing about whether the sheet renders it — reverted, that version
     stayed green with the call deleted from sheetSessionDone. */
  const seedFinish = (pr) => page.evaluate(`(() => {
    S = blank(); S.onboarded = true;
    const e = EX['bb-bench'];
    S.lifts['bb-bench'] = { w:80, r:8, fails:0, best:{ w:80, r:8, e1rm:e1rm(80,8) },
                            lastDate: today(), history:[] };
    S.settings.autoRest = false;
    S.active = { date: today(), type:'push', rung:'full', env:'full', started: Date.now() - 600000,
      rounds:1, exercises: [{ exId:'bb-bench', name:e.name, load:'wt',
        targetW: ${pr ? 150 : 40}, targetR:5,
        sets: [{ w:'', r:'', rpe:'', done:false }, { w:'', r:'', rpe:'', done:false }], note:'' }] };
    save(true); go('train');
    document.querySelectorAll('.ex-card[data-ei="0"] .tick').forEach(b => b.click());
    finishSession();
  })()`);
  const readSheet = () => page.evaluate(() => {
    /* #sheet-body always exists, so its presence proves nothing — the sheet is
       open when #sheet carries .on. */
    const open = document.getElementById('sheet').classList.contains('on');
    const b = document.getElementById('sheet-body');
    return { open, prs: open ? b.querySelectorAll('.prs').length : -1,
             text: open ? (b.innerText || '') : '' };
  });

  await seedFinish(true);
  await page.waitForTimeout(500);
  const doneWith = await readSheet();
  await page.evaluate(() => closeSheet());
  await seedFinish(false);
  await page.waitForTimeout(500);
  const doneWithout = await readSheet();
  await page.evaluate(() => closeSheet());

  check('the finish sheet is reached at all', doneWith.open === true);
  check('...and lists what you beat', doneWith.prs === 1 &&
    /personal best/i.test(doneWith.text) && /Bench Press/.test(doneWith.text),
    `${doneWith.prs} blocks`);
  check('...and says nothing at all when you beat nothing',
    doneWithout.open === true && doneWithout.prs === 0, `${doneWithout.prs} blocks`);
  check('no placeholder text on the finish sheet', !BAD.test(doneWith.text));

  /* ---- the web's only alert ----
     iOS Safari implements no vibration at all, so buzz() is silence on the
     phone this app was built for, and there is no way to schedule an OS
     notification without a server to push it. Sound is what is left. */
  const sound = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    const on = restSoundOn();
    const played = chime();
    S.settings.restSound = false;
    const off = restSoundOn();
    const silent = chime();
    delete S.settings.restSound;
    const legacy = restSoundOn();
    /* Nothing is fetched to make it. An audio file would be the first external
       request in the entire app. */
    const external = /<audio|\.mp3|\.wav|\.ogg/i.test(document.documentElement.innerHTML);
    return { on, played, off, silent, legacy, external, ctx: !!ensureAudio() };
  });
  check('a browser that can make sound, makes sound', sound.ctx === true && sound.played === true,
    `ctx ${sound.ctx}, played ${sound.played}`);
  check('the sound is on by default', sound.on === true);
  check('...and turning it off actually silences it',
    sound.off === false && sound.silent === false, `setting ${sound.off}, played ${sound.silent}`);
  /* Same reasoning as the RPE column: a save written before the setting
     existed has no key, and reading it as merely falsy would mute everyone. */
  check('a save from before the setting existed keeps the sound', sound.legacy === true);
  check('the tone is synthesised, not fetched', sound.external === false);

  /* And the rest actually reaches it. Calling chime() and checking it returns
     true proves the function works and says nothing about whether a rest
     running out calls it — deleting the call from tickRest left the checks
     above green. The spy goes on the platform's own createOscillator, not on
     anything this app wrote, so the subject is untouched. */
  const heard = await page.evaluate(async () => {
    S = blank(); S.onboarded = true; save(true);
    const AC = window.AudioContext || window.webkitAudioContext;
    const real = AC.prototype.createOscillator;
    let made = 0;
    AC.prototype.createOscillator = function () { made++; return real.apply(this, arguments); };
    startRest(1, 'Bench Press');
    await new Promise(r => setTimeout(r, 1600));
    const after = made;
    const running = document.getElementById('rest-bar').classList.contains('on');
    AC.prototype.createOscillator = real;
    stopRest();
    return { made: after, running };
  });
  /* Two notes a fourth apart, so two oscillators. */
  check('a rest running out is audible', heard.made === 2, String(heard.made));
  check('...and the bar puts itself away when it does', heard.running === false);

  /* ---- the day strip lines up, whatever you have filled in ----
     A bare `.empty` empty-state utility sat in the stylesheet with 44px of
     padding on it, and the strip's own `.day-v.empty` modifier inherited it:
     an unlogged Steps grew its value box from 23px to 88px and pushed the
     STEPS label two-thirds of the way down the card while SLEEP and WEIGHT
     stayed at the top. */
  const dayStrip = await page.evaluate(() => {
    const seed = (fill) => {
      S = blank(); S.onboarded = true; S.profile.units = 'kg';
      const D = n => key(addDays(fromKey(today()), -n));
      if (fill.steps) for (let i = 0; i < 5; i++) {
        S.daily[D(i)] = Object.assign(S.daily[D(i)] || {}, { steps: 6000 + i * 1500 });
      }
      if (fill.sleep) for (let i = 0; i < 7; i++) {
        S.daily[D(i)] = Object.assign(S.daily[D(i)] || {}, { sleepH: 6 + (i % 3) });
      }
      if (fill.weight) S.profile.bodyweight = [{ d: D(3), w: 88 }, { d: today(), w: 87.2 }];
      save(true); render(); go('today');
    };
    const rows = () => [...document.querySelectorAll('#today-body .dm-cell')].map(c => ({
      k: c.querySelector('.dm-k').textContent,
      vTop: Math.round(c.querySelector('.dm-v').getBoundingClientRect().top),
      vH: Math.round(c.querySelector('.dm-v').getBoundingClientRect().height),
      kTop: Math.round(c.querySelector('.dm-k').getBoundingClientRect().top),
      bTop: Math.round(c.querySelector('.dm-bars').getBoundingClientRect().top),
      bars: c.querySelectorAll('.dm-bars i').length,
      filled: [...c.querySelectorAll('.dm-bars i')].filter(i => !i.classList.contains('none')).length,
      now: !!c.querySelector('.dm-bars i.now')
    }));
    const one = (rs) => ({
      vTops: [...new Set(rs.map(r => r.vTop))].length,
      kTops: [...new Set(rs.map(r => r.kTop))].length,
      bTops: [...new Set(rs.map(r => r.bTop))].length,
      vHs: [...new Set(rs.map(r => r.vH))]
    });
    seed({ sleep: true, weight: true });          // Steps blank — the reported case
    const noSteps = { align: one(rows()), rows: rows() };
    seed({});                                     // nothing at all
    const nothing = { align: one(rows()), rows: rows() };
    seed({ steps: true, sleep: true, weight: true });
    const all = { align: one(rows()), rows: rows() };
    return { noSteps, nothing, all,
      /* And the utility that caused it can no longer be reached by a
         component modifier that happens to be called "empty". */
      bareEmpty: !!document.querySelector('.empty'),
      panel: (() => { sheetSettings(); const has = !!document.querySelector('#sheet-body .blankstate, #sheet-body .list'); closeSheet(); return has; })() };
  });

  ['noSteps', 'nothing', 'all'].forEach(kind => {
    const a = dayStrip[kind].align;
    check(`the day strip lines up with ${kind === 'noSteps' ? 'steps unlogged' : kind === 'nothing' ? 'nothing logged' : 'everything logged'}`,
      a.vTops === 1 && a.kTops === 1 && a.bTops === 1,
      `${a.vTops} value tops, ${a.kTops} label tops, ${a.bTops} bar tops`);
  });
  /* The value box is a fixed band. 88px was the collision; 23px was the intent. */
  check('...and every value box is one fixed height',
    dayStrip.noSteps.align.vHs.length === 1 && dayStrip.noSteps.align.vHs[0] < 40,
    dayStrip.noSteps.align.vHs.join(','));
  check('no bare .empty class is left to be inherited by accident',
    dayStrip.bareEmpty === false);

  const sb = dayStrip.all.rows;
  check('each metric shows seven days', sb.every(r => r.bars === 7),
    sb.map(r => r.bars).join(','));
  check('...with today marked', sb.every(r => r.now === true), sb.map(r => r.now).join(','));
  /* A day you did not log and a day that was zero are different things. */
  check('a day with nothing logged is a stub, not a bar',
    dayStrip.noSteps.rows[0].filled === 0 && dayStrip.all.rows[0].filled === 5,
    `${dayStrip.noSteps.rows[0].filled} then ${dayStrip.all.rows[0].filled}`);

  /* ---- the app fills the phone, and never overflows it ----
     body is position:fixed; inset:0, so it IS the visible viewport. #app was
     sized in 100dvh, which on iOS Safari grows when the address bar collapses
     while the fixed body does not — so #app became taller than its parent and
     body's overflow:hidden sliced the bottom off. Cards cut in half, dead
     space under them, and padding-bottom powerless because the clipping
     happens a level above it. */
  const fills = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    ['Ab Night', 'Legs', 'Push'].forEach(n => {
      const r = newRoutine(n); addToRoutine(r.id, 'bw-crunch');
    });
    save(true); buildWeekPlan(true); render();
    const box = el => { const r = el.getBoundingClientRect(); return { top: r.top, bot: r.bottom }; };
    const app = document.getElementById('app');
    const out = {};
    ['today', 'plan', 'progress', 'more'].forEach(name => {
      go(name);
      const sc = document.querySelector('.screen.on');
      out[name] = {
        appTop: Math.round(box(app).top), appBot: Math.round(box(app).bot),
        scBot: Math.round(box(sc).bot),
        /* Every screen the nav floats over has to be able to scroll past it. */
        pad: parseInt(getComputedStyle(sc).paddingBottom, 10) || 0
      };
    });
    /* The unit matters: a viewport unit re-introduces the mismatch the moment
       a browser's idea of it diverges from the fixed body's. */
    const declared = [...document.styleSheets].flatMap(ss => {
      try { return [...ss.cssRules]; } catch (e) { return []; }
    }).filter(r => r.selectorText === '#app').map(r => r.style.height);
    const navR = document.getElementById('nav').getBoundingClientRect();
    return { out, declared, bodyH: Math.round(document.body.getBoundingClientRect().height),
             viewH: window.innerHeight,
             navBot: Math.round(navR.bottom),
             /* What the nav actually takes off the bottom of the screen, so the
                padding assertion below can be measured against it rather than
                against a number typed in when the nav last changed size. */
             navOccupies: Math.round(window.innerHeight - navR.top) };
  });

  check('the app fills the whole viewport', fills.bodyH === fills.viewH,
    `${fills.bodyH} vs ${fills.viewH}`);

  /* ---- and whatever is outside it is the same colour ----
     The body is position:fixed; inset:0, so it is exactly the viewport and
     nothing else — but iOS hands a web view a strip it does not own when a
     toolbar collapses or an in-call banner resizes it, and that strip is
     painted by the canvas. The canvas takes its colour by propagation from the
     body, a rule written for an element in normal flow, and where that does not
     happen the strip comes out transparent-over-black: a dead band under the
     nav, reported twice as the app not filling the screen.

     Asserted as "html paints the same thing body does", which is the property
     that makes the seam invisible wherever it lands. Reading the computed
     value rather than the rule, because a declaration that loses to another is
     still a declaration. */
  const canvas = await page.evaluate(() => {
    const h = getComputedStyle(document.documentElement);
    const b = getComputedStyle(document.body);
    return { hBg: h.backgroundColor, hImg: h.backgroundImage,
             bBg: b.backgroundColor, bImg: b.backgroundImage,
             hAtt: h.backgroundAttachment, bAtt: b.backgroundAttachment };
  });
  check('the canvas behind the app is painted, not left transparent',
    canvas.hBg !== 'rgba(0, 0, 0, 0)' && canvas.hImg !== 'none',
    `${canvas.hBg} / ${canvas.hImg.slice(0, 30)}`);
  check('...with exactly what the body paints',
    canvas.hBg === canvas.bBg && canvas.hImg === canvas.bImg && canvas.hAtt === canvas.bAtt,
    `${canvas.hBg} vs ${canvas.bBg}, ${canvas.hAtt} vs ${canvas.bAtt}`);
  Object.keys(fills.out).forEach(name => {
    const o = fills.out[name];
    check(`${name} reaches the bottom of the screen and no further`,
      o.appTop === 0 && o.appBot === fills.viewH && o.scBot === fills.viewH,
      `app ${o.appTop}–${o.appBot}, screen bottom ${o.scBot}, viewport ${fills.viewH}`);
    /* Compared against the nav's measured footprint, not a constant: this said
       `>= 90` to match a 96px padding, so retuning the nav's offset broke a
       check about scrolling for reasons that had nothing to do with scrolling. */
    check(`...and can scroll clear of the floating nav`,
      o.pad >= fills.navOccupies + 8, `${o.pad}px against a nav taking ${fills.navOccupies}px`);
  });
  /* Sized against its parent rather than against a viewport unit, so the two
     can never disagree. */
  check('the app is sized from the fixed body, not a viewport unit',
    fills.declared.length > 0 && fills.declared.every(hh => hh === '100%'),
    fills.declared.join(', '));
  check('the nav floats clear of the bottom edge',
    fills.navBot < fills.viewH && fills.navBot > fills.viewH - 40,
    `${fills.navBot} of ${fills.viewH}`);

  /* ---- Train after you have already trained ----
     It said "Ready when you are — Legs — Start full session" whether or not
     you had done legs that morning, with what you actually did nowhere on the
     screen. Coming back to add fifteen minutes read as being told to start
     over. */
  const doneDay = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true); buildWeekPlan(true);
    /* Pin a planned session on today, so the discharge path is the one under
       test rather than whatever the generator happened to schedule. */
    S.week.plan[today()] = { type: 'full', done: false };
    save(true);
    const before = (() => {
      go('train');
      const t = document.getElementById('train-body').innerText;
      return { ready: /ready when you are/i.test(t), done: /done today/i.test(t) };
    })();

    /* Do the day's session properly, through the real handlers. */
    const type = (plannedToday() || {}).type || nextType();
    startSession(type, 'full');
    S.active.exercises.forEach(x => x.sets.forEach(st => { st.done = true; st.r = x.targetR || 8; }));
    finishSession();
    closeSheet();
    go('train');
    const body = document.getElementById('train-body');
    const t = body.innerText;
    return { before,
      settled: !!(S.week.plan[today()] || {}).done,
      logged: sessionsOn(today()).length,
      ready: /ready when you are/i.test(t),
      done: /done today/i.test(t),
      stats: body.querySelectorAll('.done-stats .done-v').length,
      /* Adding on is offered, and framed as adding rather than redoing. */
      offersAdd: !!body.querySelector('[data-act="start-session"]'),
      saysExtra: /extra/i.test(t),
      saysOwed: /nothing below is owed/i.test(t),
      bad: /undefined|NaN|\[object/.test(t) };
  });
  check('before you train, Train says it is ready',
    doneDay.before.ready === true && doneDay.before.done === false, JSON.stringify(doneDay.before));
  check('the session was actually completed',
    doneDay.settled === true && doneDay.logged === 1, `${doneDay.settled}, ${doneDay.logged} logged`);
  /* The bug, exactly. */
  check('afterwards it does not ask you to start it again', doneDay.ready === false);
  check('...it says the day is done', doneDay.done === true);
  check('...and shows what you actually did', doneDay.stats >= 2, String(doneDay.stats));
  check('adding more is still offered', doneDay.offersAdd === true);
  check('...framed as an extra rather than a redo',
    doneDay.saysExtra === true && doneDay.saysOwed === true,
    `extra ${doneDay.saysExtra}, owed ${doneDay.saysOwed}`);
  check('no placeholder text on a finished day', doneDay.bad === false);

  /* And a second session must not pretend to discharge a day that is already
     discharged — the day is done once, and everything after it is an extra. */
  const extra = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true); buildWeekPlan(true);
    S.week.plan[today()] = { type: 'full', done: false }; save(true);
    const type = (plannedToday() || {}).type || nextType();
    startSession(type, 'full');
    S.active.exercises.forEach(x => x.sets.forEach(st => { st.done = true; st.r = x.targetR || 8; }));
    finishSession(); closeSheet();
    const firstExtra = !!S.sessions[0].extra;
    startSession(type, 'short');
    const secondExtra = !!S.active.extra;
    S.active.exercises.forEach(x => x.sets.forEach(st => { st.done = true; st.r = x.targetR || 8; }));
    finishSession(); closeSheet();
    return { firstExtra, secondExtra, logged: sessionsOn(today()).length,
             stillDone: !!(S.week.plan[today()] || {}).done };
  });
  check('the session that discharged the day is not an extra', extra.firstExtra === false);
  check('...but the one after it is', extra.secondExtra === true);
  check('...and both are kept', extra.logged === 2, String(extra.logged));
  check('...with the day still counted once', extra.stillDone === true);

  /* An extra on a day whose planned session is still owed must not claim the
     day is done — that is the one thing this must not get wrong in the other
     direction. */
  const owed = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true); buildWeekPlan(true);
    S.week.plan[today()] = { type: 'full', done: false }; save(true);
    const r = newRoutine('Abs before bed');
    addToRoutine(r.id, 'bw-crunch');
    /* asPlanned:false — an extra. Passing true means "run this routine AS the
       session I owe today", which correctly discharges the day and is the
       opposite of what this check is about. */
    S.active = buildRoutineSession(r.id, false);
    S.active.exercises.forEach(x => x.sets.forEach(st => { st.done = true; st.r = 12; }));
    finishSession(); closeSheet();
    go('train');
    const t = document.getElementById('train-body').innerText;
    return { logged: sessionsOn(today()).length, planDone: !!S.week.plan[today()].done,
             ready: /ready when you are/i.test(t), done: /done today/i.test(t) };
  });
  check('an extra does not discharge the planned day',
    owed.logged === 1 && owed.planDone === false, JSON.stringify(owed));
  check('...so Train still offers the session you owe',
    owed.ready === true && owed.done === false, `ready ${owed.ready}, done ${owed.done}`);

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
