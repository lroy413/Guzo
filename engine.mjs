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

  // ================= 5. recovery days and routine warm-ups ===============
  console.log('\nrecovery and warm-ups\n');

  /* A recovery day is the one session in the app with nothing to beat. The
     ways it could go wrong are all quiet: five hip stretches in a row, a
     cardio finisher tacked on the end, a priority accessory spliced in, or a
     rep target creeping upward every time you stretch. */
  const rec = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    S.profile.priorities = ['Back'];              // would splice an accessory in
    S.profile.cardio = { amount: 'some', modes: ['car-walk'] };  // would append a finisher
    S.settings.warmup = true;                     // would prepend a mobility opener
    save(true);
    const s = generateSession('recovery', 'full', 'full', 60);
    const pats = s.exercises.map(i => (EX[i.exId] || {}).pattern);
    const regions = s.exercises.map(i => (EX[i.exId] || {}).primary);
    return {
      n: s.exercises.length,
      type: s.type,
      mins: s.planMins,
      allMobility: pats.every(p => p === 'mobility'),
      strays: pats.filter(p => p !== 'mobility'),
      regions,
      distinctRegions: new Set(regions).size,
      loaded: s.exercises.filter(i => i.targetW != null).length,
      sets: s.exercises.map(i => i.sets.length),
      title: sessionTitle(s)
    };
  });
  check('a recovery day is generated', rec.n > 0, String(rec.n));
  check('...and it is called Recovery', rec.title === 'Recovery', rec.title);
  check('...made only of mobility work', rec.allMobility === true, rec.strays.join(', '));
  /* The bug this is really guarding: priorities, cardio and the warm-up
     opener are all on above, and every one of them injects a slot on a normal
     full session. */
  check('...with no cardio finisher and no priority accessory', rec.strays.length === 0);
  check('...nothing carries a load', rec.loaded === 0, String(rec.loaded));
  check('...one round of each, not sets to grind', rec.sets.every(n => n === 1), rec.sets.join(','));
  check('...and it claims a plausible length', rec.mins >= 8 && rec.mins <= 25, rec.mins + ' min');
  check('it draws on several regions', rec.distinctRegions >= 5,
    `${rec.distinctRegions} of ${rec.n}: ${rec.regions.join(', ')}`);

  /* The spread rule, tested where it actually bites. On a fresh profile every
     movement is equally stale and any ordering looks spread out by luck. The
     case that matters is a real history: one region genuinely has gone
     longest, so sorting the pool by least-recently-done — which is what the
     engine does everywhere else — fills the whole session with it. */
  const spread = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    const mob = EXLIST.filter(e => e.pattern === 'mobility');
    const stale = mob.filter(e => e.primary === 'Glutes').map(e => e.id);
    mob.forEach(e => { S.lifts[e.id] = { lastDate: stale.includes(e.id) ? '2020-01-01' : today() }; });
    save(true);
    const s = generateSession('recovery', 'full', 'full', 60);
    const regions = s.exercises.map(i => (EX[i.exId] || {}).primary);
    return {
      staleCount: stale.length,
      regions,
      glutes: regions.filter(r => r === 'Glutes').length,
      distinct: new Set(regions).size
    };
  });
  check('the neglected region is enough to fill a session on its own',
    spread.staleCount >= 5, String(spread.staleCount));
  check('...but a recovery day still spreads across the body',
    spread.glutes <= 2 && spread.distinct >= 5,
    `${spread.glutes} glutes, ${spread.distinct} regions: ${spread.regions.join(', ')}`);
  check('...and it still opens with what has gone longest',
    spread.regions[0] === 'Glutes', spread.regions[0]);

  const recSize = await page.evaluate(() => {
    const n = r => generateSession('recovery', 'full', r, 60).exercises.length;
    return { full: n('full'), trim: n('trim'), short: n('short'), micro: n('micro') };
  });
  check('a shorter recovery day is genuinely shorter',
    recSize.full > recSize.trim && recSize.trim > recSize.short && recSize.short > recSize.micro,
    JSON.stringify(recSize));

  /* Bodyweight mobility has a rep count, and the unloaded branch of
     applyProgression adds one every time you clear it — with no ceiling,
     because there is no weight to switch to. Stretching three times a week
     would reach "Cat-Cow × 47". */
  const noCreep = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    const id = EXLIST.filter(e => e.pattern === 'mobility' && e.load === 'bw')[0].id;
    for (let i = 0; i < 12; i++) {
      const s = generateSession('recovery', 'full', 'full', 60);
      const item = s.exercises.find(x => x.exId === id);
      if (!item) continue;
      item.sets.forEach(st => { st.done = true; st.r = item.targetR; });
      s.date = today();
      applyProgression(s);
    }
    const L = S.lifts[id] || {};
    return { id, target: L.r == null ? 'untouched' : L.r, base: EX[id].rl, stamped: !!L.lastDate };
  });
  check('a stretch never earns reps', noCreep.target === 'untouched',
    `${noCreep.id} → ${noCreep.target} (from ${noCreep.base})`);
  /* But it must still record that you did it, or the rotation cannot move. */
  check('...while still recording that you did it', noCreep.stamped === true);

  const rotates = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    const first = generateSession('recovery', 'full', 'full', 60);
    first.date = today();
    first.exercises.forEach(i => i.sets.forEach(s => { s.done = true; s.r = i.targetR; }));
    applyProgression(first);
    const second = generateSession('recovery', 'full', 'full', 60);
    const a = first.exercises.map(i => i.exId), b = second.exercises.map(i => i.exId);
    return { overlap: b.filter(id => a.includes(id)).length, n: b.length, a, b };
  });
  check('the next recovery day is not the same eight movements',
    rotates.overlap < rotates.n, `${rotates.overlap} of ${rotates.n} repeated`);

  /* The hero says finishing one marks today done, the same as any session.
     That is a promise about the completion path, so it gets driven. */
  const recFinish = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    buildWeekPlan(true);                       // stamps week.start, so the write below survives
    S.week.plan[today()] = { type: 'recovery', done: false, pinned: true };
    save(true);
    const s = generateSession('recovery', 'full', 'full', 60);
    s.started = Date.now() - 600000;
    s.exercises.forEach(i => i.sets.forEach(st => { st.done = true; }));
    S.active = s;
    finishSession();
    const logged = S.sessions[S.sessions.length - 1] || {};
    return {
      cleared: S.active === null,
      dayDone: (S.week.plan[today()] || {}).done,
      title: sessionTitle(logged),
      kept: (logged.exercises || []).length,
      kcal: logged.kcal,
      dur: logged.dur
    };
  });
  check('finishing a recovery day clears the session', recFinish.cleared === true);
  check('...and marks the day done', recFinish.dayDone === true);
  check('...logged under its own name', recFinish.title === 'Recovery', recFinish.title);
  check('...with every movement kept', recFinish.kept >= 6, String(recFinish.kept));
  check('...and a sane energy estimate', recFinish.kcal >= 0 && recFinish.kcal < 200, String(recFinish.kcal));

  /* Recovery is choosable but never scheduled. A day the app decided was
     recovery is a rest day with homework. */
  const notScheduled = await page.evaluate(() => {
    const inCycle = Object.values(PROGRAMS).filter(p => p.cycle.includes('recovery')).map(p => p.id);
    S = blank(); S.onboarded = true; save(true);
    let seen = false;
    ['ul5', 'anchor3', 'ppl6', 'hold2'].forEach(id => {
      S.profile.programId = id;
      S.week = { start: null, days: {}, plan: {} };
      buildWeekPlan(true);
      if (Object.values(S.week.plan).some(e => e.type === 'recovery')) seen = true;
    });
    return { inCycle, seen, offered: PLAN_TYPES.includes('recovery') };
  });
  check('recovery is offered as a choice', notScheduled.offered === true);
  check('...but no programme schedules one', notScheduled.inCycle.length === 0, notScheduled.inCycle.join(', '));
  check('...and no built week contains one', notScheduled.seen === false);

  /* ---- the routine warm-up ---- */
  const warm = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    const r = newRoutine('Legs');
    ['bw-squat', 'bw-glute-bridge'].forEach(id => addToRoutine(r.id, id));
    const off = buildRoutineSession(r.id, false);
    const minsOff = routineMins(r);

    setRoutineWarmup(r.id, true);
    const on = buildRoutineSession(r.id, true);
    const minsOn = routineMins(r);
    const first = EX[on.exercises[0].exId] || {};

    return {
      offCount: off.exercises.length, onCount: on.exercises.length,
      offFirstIsMobility: (EX[off.exercises[0].exId] || {}).pattern === 'mobility',
      firstPattern: first.pattern, firstRegion: first.primary, firstName: first.name,
      flagged: on.exercises[0].warmup === true,
      loaded: on.exercises[0].targetW != null,
      minsOff, minsOn,
      stillPlanned: on.extra === false,
      tail: on.exercises.slice(1).map(i => i.exId)
    };
  });
  check('a routine is untouched with the warm-up off', warm.offCount === 2 && !warm.offFirstIsMobility);
  check('turning it on adds exactly one movement', warm.onCount === 3, String(warm.onCount));
  check('...and it is mobility', warm.firstPattern === 'mobility', warm.firstPattern);
  check('...marked as a warm-up, not a working set', warm.flagged === true);
  check('...and never loaded', warm.loaded === false);
  check('the movements you chose are still all there, in order',
    warm.tail.join(',') === 'bw-squat,bw-glute-bridge', warm.tail.join(','));
  check('the minute estimate accounts for it', warm.minsOn > warm.minsOff, `${warm.minsOff} → ${warm.minsOn}`);
  check('a warmed-up routine still discharges the planned day', warm.stillPlanned === true);

  /* The opener has to track what the routine actually trains — a hip stretch
     in front of an arms routine is the reason people stop bothering with
     warm-ups. Two routines at opposite ends of the body, because one on its
     own proves nothing: with region matching removed, both fall back to the
     same movement and only the comparison catches it. */
  const warmMatch = await page.evaluate(() => {
    const pickFor = ids => {
      S = blank(); S.onboarded = true; save(true);
      const r = newRoutine('probe');
      ids.forEach(id => addToRoutine(r.id, id));
      setRoutineWarmup(r.id, true);
      const ex = EX[buildRoutineSession(r.id, false).exercises[0].exId] || {};
      return { name: ex.name, region: ex.primary };
    };
    return { legs: pickFor(['bw-squat', 'bw-glute-bridge']),
             upper: pickFor(['db-bench', 'db-row']) };
  });
  check('a leg routine warms up the lower body',
    ['Quads', 'Glutes', 'Calves', 'Hamstrings'].includes(warmMatch.legs.region),
    `${warmMatch.legs.name} (${warmMatch.legs.region})`);
  check('an upper routine warms up the upper body',
    ['Shoulders', 'Chest', 'Back', 'Triceps'].includes(warmMatch.upper.region),
    `${warmMatch.upper.name} (${warmMatch.upper.region})`);
  check('...so the two do not get the same opener',
    warmMatch.legs.name !== warmMatch.upper.name, warmMatch.legs.name);

  /* The pool is environment-filtered like everything else, and a routine must
     start even when it comes back empty. */
  const warmEnv = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    S.profile.injuries = ['shoulder', 'knee', 'back', 'hip', 'elbow', 'wrist', 'ankle'];
    save(true);
    const r = newRoutine('Anything'); addToRoutine(r.id, 'bw-squat');
    setRoutineWarmup(r.id, true);
    const s = buildRoutineSession(r.id, false);
    return { built: !!s, n: s ? s.exercises.length : 0 };
  });
  check('a routine still starts when no warm-up survives the exclusions', warmEnv.built === true);

  /* Routines saved before warm-ups existed have no field at all. */
  const legacy = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    S.routines = [{ id: 'rtold', name: 'Old', emoji: '🌙', items: [{ exId: 'bw-squat', sets: 3, reps: 10 }],
                    created: today(), uses: 0, lastUsed: null }];
    save(true);
    const before = 'warmup' in S.routines[0];
    ensureRoutines();
    const r = routineById('rtold');
    const s = buildRoutineSession('rtold', false);
    return { before, after: r.warmup, n: s.exercises.length };
  });
  check('an older routine has no warm-up field', legacy.before === false);
  check('...it is backfilled to off, not on', legacy.after === false, String(legacy.after));
  check('...so nothing is added to a routine you already wrote', legacy.n === 1, String(legacy.n));

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
