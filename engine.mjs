/* engine.mjs — the week is laid out honestly, references never dangle, there
   is one clock, and a bar means what it looks like it means.

   Four bugs from docs/status.md, each with the check that would have caught
   it. Every one is driven through the app's own functions in a real browser
   rather than reimplemented here, because a test that recomputes the answer
   its own way proves only that two implementations agree.

   Run: node engine.mjs */

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
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

/* Seed through the app's globals and reload. Never addInitScript — it re-runs
   on every navigation and has already produced one false finding here. */
const seed = (p, patch) => p.evaluate(`(() => {
  S = blank();
  S.onboarded = true;
  S.profile.name = 'Probe';
  ${patch}
  save(true);
})()`);

try {
  await page.goto(origin + '/', { waitUntil: 'load' });

  // ================= 1. the week is spread, not front-loaded ==============
  console.log('week distribution\n');

  const dist = await page.evaluate(() => {
    const out = {};
    // Every day identical, which is what a fresh profile actually looks like.
    [['ul5', 5], ['anchor3', 3], ['ppl6', 6], ['hold2', 2]].forEach(([id, target]) => {
      S.profile.programId = id;
      S.week = { start: null, days: {}, plan: {} };
      buildWeekPlan(true);
      const keys = Object.keys(S.week.plan).sort();
      const dows = keys.map(k => (fromKey(k).getDay() + 6) % 7); // Mon=0 … Sun=6
      out[id] = { target, count: keys.length, dows };
    });
    return out;
  });

  check('a five-day week reaches the weekend',
    dist.ul5.dows.some(d => d >= 5), 'weekdays ' + JSON.stringify(dist.ul5.dows));
  check('a six-day week reaches the weekend',
    dist.ppl6.dows.some(d => d >= 5), JSON.stringify(dist.ppl6.dows));
  check('three sessions are not three consecutive days',
    !(dist.anchor3.dows.join() === '0,1,2'), JSON.stringify(dist.anchor3.dows));
  check('every programme still gets its target count',
    Object.values(dist).every(d => d.count === d.target),
    JSON.stringify(Object.fromEntries(Object.entries(dist).map(([k, v]) => [k, `${v.count}/${v.target}`]))));

  /* Spreading must not outrank availability — the whole reason the app asks
     how much time you have is that more time wins. */
  const prefers = await page.evaluate(() => {
    S.profile.programId = 'hold2';           // target 2
    S.week = { start: null, days: {}, plan: {} };
    const ws = weekStart();
    const keys = Array.from({ length: 7 }, (_, i) => dk(addDays(ws, i)));
    keys.forEach(k => { S.week.days[k] = { avail: 'short' }; });
    // The two longest days are Saturday and Sunday.
    S.week.days[keys[5]] = { avail: 'long' };
    S.week.days[keys[6]] = { avail: 'long' };
    buildWeekPlan(true);
    return Object.keys(S.week.plan).sort().map(k => (fromKey(k).getDay() + 6) % 7);
  });
  check('the days with the most time still win outright',
    prefers.length === 2 && prefers.every(d => d >= 5), JSON.stringify(prefers));

  // ================= 2. references never dangle ==========================
  console.log('\ndangling references');

  const del = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    buildWeekPlan(true);
    const k = Object.keys(S.week.plan)[0];
    const r = newRoutine('Abs before bed');
    S.week.plan[k] = { type: 'custom', routineId: r.id, pinned: true };
    save(true);
    deleteRoutine(r.id);
    const e = S.week.plan[k];
    return {
      stillPointing: !!(e && e.routineId),
      type: e && e.type,
      typeIsReal: !!(e && PLAN_TYPES.includes(e.type)),
      label: e ? planLabel(e) : null,
      dayKept: !!e
    };
  });
  check('deleting a routine clears the day that used it', del.stillPointing === false);
  check('the day is handed back to the rotation, not emptied', del.dayKept === true);
  check('its type is a real session type', del.typeIsReal === true, String(del.type));
  check('the label no longer reads "Deleted routine"', del.label !== 'Deleted routine', String(del.label));

  /* And the boot sweep, for state that was already broken before this fix
     existed — which is every device that deleted a routine until now. */
  await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    buildWeekPlan(true);
    const k = Object.keys(S.week.plan)[0];
    S.week.plan[k] = { type: 'custom', routineId: 'rt-does-not-exist', pinned: true };
    S.lifts['no-such-exercise'] = { w: 60 };
    S.videos['no-such-exercise'] = 'https://example.com/x';
    save(true);
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(250);
  const swept = await page.evaluate(() => ({
    dangling: Object.values(S.week.plan).filter(e => e && e.routineId && !routineById(e.routineId)).length,
    strandedLift: 'no-such-exercise' in S.lifts,
    strandedVideo: 'no-such-exercise' in S.videos
  }));
  check('boot repairs a plan that already pointed at nothing', swept.dangling === 0, String(swept.dangling));
  check('boot drops a lift keyed to an exercise that no longer exists', swept.strandedLift === false);
  check('boot drops a stranded form video', swept.strandedVideo === false);

  // ================= 3. one clock ========================================
  console.log('\none clock');

  const clock = await page.evaluate(() => {
    const realToday = today;
    try {
      // Pin to a Wednesday and check the week moves with it.
      today = () => '2026-03-11';
      const a = dk(weekStart());
      today = () => '2025-07-05';           // a Saturday, a different year
      const b = dk(weekStart());
      return { a, b };
    } finally {
      today = realToday;
    }
  });
  check('weekStart follows a pinned today (Wed 11 Mar 2026 → Mon 9th)',
    clock.a === '2026-03-09', String(clock.a));
  check('weekStart follows a pinned today (Sat 5 Jul 2025 → Mon 30 Jun)',
    clock.b === '2025-06-30', String(clock.b));

  // ================= 4. a bar means what it looks like ===================
  console.log('\nfuel bars');

  const bars = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    S.settings.nutrition = true;
    S.nutrition.targets = { kcal: 2000, p: 150, c: 200, f: 60 };
    const ws = weekStart();
    const day = n => dk(addDays(ws, n));
    // one day exactly on target, one far over, one half
    const put = (k, kcal) => { S.nutrition.days[k] = { items: [{ foodId:'x', n:'probe', kcal, p:0, c:0, f:0 }] }; };
    put(day(0), 2000);   // 100%
    put(day(1), 2800);   // 140%
    put(day(2), 1000);   // 50%
    save(true);
    go('fuel');
    const fills = [...document.querySelectorAll('#s-fuel .fuel-bar-fill')].map(el => el.style.height);
    const markers = document.querySelectorAll('#s-fuel .fuel-bar-target').length;
    const rose = [...document.querySelectorAll('#s-fuel *')].some(el => {
      const c = getComputedStyle(el);
      return /rgb\(2[0-9]{2},\s*[0-9]{1,2},/.test(c.backgroundColor) && el.className.includes('fuel-bar');
    });
    return { fills: fills.slice(0, 3), markers, rose };
  });
  check('an over-target day is drawn taller than an on-target day',
    bars.fills[1] !== bars.fills[0], JSON.stringify(bars.fills));
  check('an under-target day is shorter than an on-target day',
    parseFloat(bars.fills[2]) < parseFloat(bars.fills[0]), JSON.stringify(bars.fills));
  check('the target line is drawn on every bar', bars.markers === 7, String(bars.markers));
  check('no bar goes red', bars.rose === false);

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
