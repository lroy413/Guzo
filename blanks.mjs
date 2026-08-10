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
    const rows = () => [...document.querySelectorAll('#plan-body .list .lrow[data-act="day-tap"]')].map(r => r.dataset.k);
    const strip = () => [...document.querySelectorAll('#plan-body .week .day')].map(d => d.dataset.k);
    const before = { s: strip(), r: rows() };
    document.querySelector('#plan-body [data-act="strip-week"][data-d="1"]').click();
    const after = { s: strip(), r: rows() };
    return { before, after };
  });
  check('the Plan list matches its strip', planSync.before.s.join() === planSync.before.r.join());
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
    const rowEl = document.querySelector(`#plan-body .lrow[data-act="day-tap"][data-k="${k}"]`);
    const planSub = rowEl ? (rowEl.querySelector('.tiny') || {}).textContent : null;
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

  /* ---- the route on Progress ----
     The screen was eight stacked cards of correct numbers and no feeling. The
     risk in redrawing it as a journey is that the picture stops matching the
     data — a trail that always looks like progress is worse than a bar chart
     that sometimes looks flat. So what is asserted here is that the drawing
     tracks the state: markers behind you are solid, the one ahead is not, and
     an empty history draws an empty route rather than a broken one. */
  const route = await page.evaluate(() => {
    const read = () => {
      go('progress');
      const b = document.getElementById('progress-body');
      const svg = b.querySelector('.route-svg');
      return {
        hero: !!b.querySelector('.route'),
        day: (b.querySelector('.route-day') || {}).textContent || '',
        count: (b.querySelector('.route-count-n') || {}).textContent || '',
        pinsOn: svg ? svg.querySelectorAll('.rt-pin.on').length : -1,
        pinsAhead: svg ? svg.querySelectorAll('.rt-pin.ahead').length : -1,
        walked: svg ? svg.querySelectorAll('.route-walked').length : -1,
        ground: svg ? svg.querySelectorAll('.route-ground').length : -1,
        here: svg ? svg.querySelectorAll('.route-here').length : -1,
        next: (b.querySelector('.route-next-t') || {}).textContent || '',
        /* No leftover from the old screen. */
        oldTiles: b.querySelectorAll('.tiles .tile').length,
        text: b.innerText || ''
      };
    };

    S = blank(); S.onboarded = true; save(true);
    const fresh = read();

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
    return { fresh, rich };
  });
  check('Progress leads with the route', route.rich.hero === true);
  check('...and the old tile grid is gone', route.rich.oldTiles === 0, String(route.rich.oldTiles));
  check('...it names the day', /^Day \d+$/.test(route.rich.day), route.rich.day);
  check('...and how many markers are behind you', +route.rich.count > 0, route.rich.count);
  /* The drawing has to match the state, not decorate it. */
  check('markers reached are drawn solid on the trail', route.rich.pinsOn > 0, String(route.rich.pinsOn));
  check('...the one ahead is drawn as ahead', route.rich.pinsAhead === 1, String(route.rich.pinsAhead));
  check('...the ground you covered is filled in', route.rich.ground === 1, String(route.rich.ground));
  check('...and there is a you-are-here on the trail', route.rich.here === 1, String(route.rich.here));
  check('...with the next marker named', route.rich.next.length > 3, route.rich.next);
  check('no placeholder text on Progress', !BAD.test(route.rich.text));

  /* Day one has to draw an honest empty route, not a broken card. */
  check('a fresh profile still gets a route', route.fresh.hero === true);
  check('...with nothing behind you', route.fresh.pinsOn === 0 && route.fresh.count === '0',
    `${route.fresh.pinsOn} pins, count ${route.fresh.count}`);
  check('...no walked line and no ground', route.fresh.walked === 0 && route.fresh.ground === 0,
    `${route.fresh.walked}/${route.fresh.ground}`);
  check('...no you-are-here before you have started', route.fresh.here === 0, String(route.fresh.here));
  check('...but the first marker is drawn ahead', route.fresh.pinsAhead === 1, String(route.fresh.pinsAhead));
  check('no placeholder text on an empty Progress', !BAD.test(route.fresh.text));

  /* The pins are drawn at coordinates the trail passes through. A curve that
     approximates its points floats them off the line, which is the difference
     between a route and a decoration. */
  const onTrail = await page.evaluate(() => {
    go('progress');
    const svg = document.querySelector('#progress-body .route-svg');
    if (!svg) return { checked: 0, off: ['no svg'] };
    /* Both segments: the walked line stops at the last marker reached, so a pin
       for the marker ahead sits on the dashed one. Measuring against only one
       of them reported a correctly-placed pin as 53 units adrift. */
    const lines = [...svg.querySelectorAll('.route-walked, .route-ahead')];
    if (!lines.length) return { checked: 0, off: ['no line'] };
    const off = [];
    let checked = 0;
    svg.querySelectorAll('.rt-pin circle').forEach(c => {
      const cx = +c.getAttribute('cx'), cy = +c.getAttribute('cy');
      let best = 1e9;
      lines.forEach(line => {
        const len = line.getTotalLength();
        for (let i = 0; i <= 200; i++) {
          const p = line.getPointAtLength(len * i / 200);
          const d = Math.hypot(p.x - cx, p.y - cy);
          if (d < best) best = d;
        }
      });
      checked++;
      if (best > 1.5) off.push(`${cx.toFixed(0)},${cy.toFixed(0)} is ${best.toFixed(1)} off`);
    });
    return { checked, off: off.slice(0, 4) };
  });
  check('the trail actually passes through its markers', onTrail.off.length === 0,
    onTrail.off.join(', '));
  check('...and there were markers to check', onTrail.checked >= 2, String(onTrail.checked));

  /* ---- the markers card ----
     One session in, this was three thin rows with the word "Ahead" on two of
     them — the absence of information dressed as information. Every row has to
     say what its marker costs, and the one you are walking towards has to show
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
    const card = [...document.querySelectorAll('#progress-body .jpath')][0];
    if (!card) return { found: false, rows: 0, bare: 1, text: '' };
    const rows = [...card.querySelectorAll('.jnode')];
    const next = card.querySelector('.jnode.next');
    const bar = next && next.querySelector('.jnode-bar i');
    return {
      found: true,
      rows: rows.length,
      done: card.querySelectorAll('.jnode.done').length,
      far: card.querySelectorAll('.jnode.far').length,
      /* No row may be left saying only "Ahead". */
      bare: rows.filter(r => /^\s*ahead\s*$/i.test(
        ((r.querySelector('.jnode-d') || r.querySelector('.jnode-need') || {}).textContent || '').trim())).length,
      body: (card.querySelector('.jnode-body') || {}).textContent || '',
      nextTitle: next ? (next.querySelector('.jnode-t') || {}).textContent : '',
      nextCount: next ? (next.querySelector('.jnode-when') || {}).textContent.replace(/\s/g, '') : '',
      barWidth: bar ? bar.style.width : 'none',
      bars: card.querySelectorAll('.jnode-bar').length,
      remainder: (document.querySelector('#progress-body .jpath') || {}).parentElement.querySelector('.tiny.center')
        ? document.querySelector('#progress-body .jpath').parentElement.querySelector('.tiny.center').textContent : '',
      text: card.innerText || ''
    };
  });
  check('the markers card renders', markers.found === true);
  /* Two ahead made the road look like it ended just past your feet. */
  check('...showing more than a couple of steps ahead', markers.rows >= 5, String(markers.rows));
  check('...one of them reached', markers.done === 1, String(markers.done));
  check('no row is left saying only "Ahead"', markers.bare === 0, String(markers.bare));
  check('the marker you just passed says what it meant', markers.body.length > 40,
    markers.body.slice(0, 50));
  check('the next marker is named', markers.nextTitle === 'Finding your pace', markers.nextTitle);
  check('...with your real count against it', markers.nextCount === '1/5', markers.nextCount);
  /* One session of five: the bar has to be a fifth, not a decoration. */
  check('...and a bar that matches it', markers.barWidth === '20%', markers.barWidth);
  /* A road of progress bars is a to-do list. */
  check('only the next one carries a bar', markers.bars === 1, String(markers.bars));
  check('the rest state what they cost', markers.far >= 3, String(markers.far));
  check('...and what is beyond them is counted, not hidden',
    /\d+ more marker/.test(markers.remainder), markers.remainder);
  check('no placeholder text in the markers card', !BAD.test(markers.text));

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
    const wanted = ['riseIn', 'tickPop', 'tickDraw'];
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
  check('the screen arrival is behind reduced-motion', reduced.riseIn === true);
  check('the set tick flourish is behind reduced-motion', reduced.tickPop === true);
  check('...including its mark', reduced.tickDraw === true);

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
      /* The spreadsheet header is gone and the units moved into the fields. */
      headers: body.querySelectorAll('.set-head').length,
      units: firstRow ? [...firstRow.querySelectorAll('.set-u')].map(u => u.textContent) : [],
      /* Every input the old row had is still there and still addressed the
         same way, or the input listener and the progression silently stop. */
      fields: firstRow ? [...firstRow.querySelectorAll('.set-in')].map(i => i.dataset.set) : [],
      labelled: firstRow ? [...firstRow.querySelectorAll('.set-in')].every(i => (i.getAttribute('aria-label') || '').length > 3) : false,
      tick: firstRow ? !!firstRow.querySelector('[data-act="toggle-set"]') : false,
      /* One control in the card header, and everything it replaced inside it. */
      headerActs: [...body.querySelectorAll('.ex-card .ex-head [data-act]')].map(e => e.dataset.act),
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
  check('...and the units are in the fields instead', train.units.length === 3,
    train.units.join(', '));
  check('every input survived the redesign', train.fields.join(',') === 'w,r,rpe',
    train.fields.join(','));
  check('...still announced to a screen reader', train.labelled === true);
  check('...and the set still ticks', train.tick === true);
  /* The toolbar in every card header became one menu. The form guide and the
     swap have to still exist somewhere, or this is a feature deletion wearing
     a tidier screen. */
  check('the toolbar is gone from the card header',
    train.headerActs.filter(a => a === 'swap-ex' || a === 'ex-form').length === 0,
    train.headerActs.join(', '));
  check('...replaced by one menu per movement', train.more === train.exercises,
    `${train.more} menus / ${train.exercises} movements`);
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
    const eiPre = S.active.exercises.findIndex(x => x.sets.length > 1);
    const segOf = () => document.querySelectorAll('#train-body .rail-seg')[eiPre].firstElementChild.style.width;
    const before = segOf();
    const beforeCount = (body.querySelector('#tp-count') || {}).textContent;
    /* The input node itself, not the container: renderTrain() rewrites the
       body's innerHTML but never replaces the body element, so comparing the
       container proves nothing — which is what the first version of this
       check did. If this node survives, so does your caret and your keyboard. */
    /* And from a movement with more than one set: ticking the last set of an
       exercise legitimately folds the card away and rebuilds it, so a
       single-set movement would fail this for the right reason and tell you
       nothing about the wrong one. */
    const ei = eiPre;
    const card = body.querySelector('.ex-card[data-ei="' + ei + '"]');
    const inputBefore = card.querySelector('.set-in');
    card.querySelector('[data-act="toggle-set"]').click();
    const after = segOf();
    const afterCount = (document.getElementById('train-body').querySelector('#tp-count') || {}).textContent;
    const inputAfter = document.querySelector('#train-body .ex-card[data-ei="' + ei + '"] .set-in');
    stopRest();
    return { before, after, beforeCount, afterCount,
             sameNode: inputBefore === inputAfter };
  });
  check('ticking a set fills the rail', railLive.after !== railLive.before,
    `${railLive.before} → ${railLive.after}`);
  check('...and moves the count', railLive.afterCount !== railLive.beforeCount,
    `${railLive.beforeCount} → ${railLive.afterCount}`);
  check('...in place, without re-rendering the screen', railLive.sameNode === true);

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
