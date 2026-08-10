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
    /* Counted back from today, and read by date rather than by position.
       This used to seed weekStart()+0,1,2 and read the first three bars, which
       is only the same thing on some days of the week: the chart is a trailing
       seven days ending today, so on a Monday two of the three seeded days are
       in the future and the three bars read are last week's empty ones. It
       passed for months and went red the first time the suite ran on a Monday
       — correct by coincidence, which is the worst kind of correct. */
    const day = n => dk(addDays(fromKey(today()), n));
    const put = (k, kcal) => { S.nutrition.days[k] = { items: [{ foodId:'x', n:'probe', kcal, p:0, c:0, f:0 }] }; };
    put(day(0), 2000);   // 100%, today
    put(day(-1), 2800);  // 140%, yesterday
    put(day(-2), 1000);  // 50%, the day before
    save(true);
    go('fuel');
    const at = k => {
      const b = document.querySelector(`#s-fuel .fuel-bar[data-v="${k}"] .fuel-bar-fill`);
      return b ? b.style.height : 'no bar';
    };
    const markers = document.querySelectorAll('#s-fuel .fuel-bar-target').length;
    const rose = [...document.querySelectorAll('#s-fuel *')].some(el => {
      const c = getComputedStyle(el);
      return /rgb\(2[0-9]{2},\s*[0-9]{1,2},/.test(c.backgroundColor) && el.className.includes('fuel-bar');
    });
    return { fills: [at(day(0)), at(day(-1)), at(day(-2))], markers, rose,
             bars: document.querySelectorAll('#s-fuel .fuel-bar').length };
  });
  check('the chart draws a bar for every day of the window', bars.bars === 7, String(bars.bars));
  check('...and every seeded day has one', bars.fills.every(f => f !== 'no bar'), JSON.stringify(bars.fills));
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

  // ================= 6. logging a day after the fact =====================
  console.log('\nback-dated logging\n');

  /* A day you trained without the app in your hand is still a day you
     trained. The whole feature is one parameter on blankSession, so what needs
     proving is that everything downstream honours it — the date it lands on,
     the day it discharges, and the two numbers that would otherwise be lies. */
  const back = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    S.profile.bodyweight = [{ d: today(), w: 80 }];
    save(true);
    buildWeekPlan(true);
    const k = dk(addDays(fromKey(today()), -2));
    const inWeek = !!S.week.plan[k];
    if (!inWeek) S.week.plan[k] = { type: 'full', done: false, pinned: true };
    save(true);

    blankSession(k);
    const A = S.active;
    const started = A.date;
    /* Two exercises, ticked off, as if entered from the sofa. */
    ['bb-back-squat', 'bb-bench'].forEach(id => {
      const ex = EX[id];
      A.exercises.push({
        exId: id, name: ex.name, load: ex.load, targetW: 60, targetR: 8,
        sets: Array.from({ length: 3 }, () => ({ w: 60, r: 8, rpe: 8, done: true })),
        note: ''
      });
    });
    A.started = Date.now() - 20000;          // twenty seconds of typing
    finishSession();

    const logged = S.sessions[S.sessions.length - 1] || {};
    return {
      flagged: A.backdated === true,
      startedOn: started, k,
      loggedDate: logged.date,
      today: today(),
      dur: logged.dur,
      kcal: logged.kcal,
      dayDone: (S.week.plan[k] || {}).done,
      onThatDay: sessionsOn(k).length,
      onToday: sessionsOn(today()).length
    };
  });
  check('an empty session can be dated to a past day', back.startedOn === back.k, back.startedOn);
  check('...and is flagged as back-dated', back.flagged === true);
  check('...it is logged against that day', back.loggedDate === back.k, back.loggedDate);
  check('...not against today', back.loggedDate !== back.today);
  check('...and it shows up on that day', back.onThatDay === 1 && back.onToday === 0,
    `${back.onThatDay} then / ${back.onToday} today`);
  check('...marking that day done', back.dayDone === true);
  /* The clock measured twenty seconds of typing. Six sets of squats and bench
     is not a twenty-second session, and that number goes into the totals. */
  check('the length comes from the work, not the clock', back.dur >= 10 && back.dur <= 45, back.dur + ' min');
  check('...and so does the energy estimate', back.kcal > 20, String(back.kcal));

  /* Every rotation in the app reads lastDate to decide what has gone longest.
     Writing a past date into it unconditionally would send that backwards and
     quietly re-suggest something you did this morning. */
  const noRewind = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    const mk = (date) => {
      const ex = EX['bb-back-squat'];
      return { id: 'x' + date, date, type: 'full', env: 'full', rung: 'full', exercises: [{
        exId: 'bb-back-squat', name: ex.name, load: ex.load, targetW: 60, targetR: 8,
        sets: [{ w: 60, r: 8, rpe: 8, done: true }], note: ''
      }] };
    };
    applyProgression(mk(today()));                                  // trained today
    const afterToday = S.lifts['bb-back-squat'].lastDate;
    applyProgression(mk(dk(addDays(fromKey(today()), -5))));        // then log last week
    return { afterToday, after: S.lifts['bb-back-squat'].lastDate, today: today() };
  });
  check('logging an older day never moves "last done" backwards',
    noRewind.after === noRewind.today, `${noRewind.afterToday} → ${noRewind.after}`);

  // ================= 7. where the day ends ===============================
  console.log('\nthe day boundary\n');

  /* Freezes the wall clock for one call. Nothing in the app may read the clock
     any other way, so this is enough to move the whole app to 2am — which is
     exactly the property being tested as much as the arithmetic is. */
  const CLOCK = `
    const at = (iso, fn) => {
      const Real = Date;
      const fixed = new Real(iso).getTime();
      class Fake extends Real {
        constructor(...a) { if (!a.length) super(fixed); else super(...a); }
        static now() { return fixed; }
      }
      globalThis.Date = Fake;
      try { return fn(); } finally { globalThis.Date = Real; }
    };`;

  const boundary = await page.evaluate(`(() => {
    ${CLOCK}
    S = blank(); S.onboarded = true; save(true);

    const read = () => ({ today: today(), wall: dk(), late: inLateWindow() });

    S.profile.dayStart = 0;
    const midnightDefault = at('2026-08-11T02:30:00', read);

    S.profile.dayStart = 4;
    const lateNight  = at('2026-08-11T02:30:00', read);   // after a 2am finish
    const justBefore = at('2026-08-11T03:59:00', read);
    const justAfter  = at('2026-08-11T04:00:00', read);
    const evening    = at('2026-08-11T21:00:00', read);
    const morning    = at('2026-08-11T07:30:00', read);

    S.profile.dayStart = 4;
    const weekMoves = at('2026-08-11T02:30:00', () => ({ ws: dk(weekStart()), today: today() }));

    S.profile.dayStart = 9;   // out of range
    const tooLate = at('2026-08-11T02:30:00', read);
    S.profile.dayStart = -3;
    const negative = at('2026-08-11T02:30:00', read);
    S.profile.dayStart = 0;
    return { midnightDefault, lateNight, justBefore, justAfter, evening, morning, weekMoves, tooLate, negative };
  })()`);

  check('by default a 2am session is the next day', boundary.midnightDefault.today === '2026-08-11',
    boundary.midnightDefault.today);
  check('...and nothing claims otherwise', boundary.midnightDefault.late === false);
  check('with the day ending at 4am, 2:30am is still the day before',
    boundary.lateNight.today === '2026-08-10', boundary.lateNight.today);
  check('...and the app says so rather than looking wrong',
    boundary.lateNight.late === true && boundary.lateNight.wall === '2026-08-11');
  check('the boundary holds right up to it', boundary.justBefore.today === '2026-08-10',
    boundary.justBefore.today);
  check('...and rolls over exactly on it', boundary.justAfter.today === '2026-08-11',
    boundary.justAfter.today);
  check('a normal morning is unaffected', boundary.morning.today === '2026-08-11' && boundary.morning.late === false);
  check('...and so is the evening', boundary.evening.today === '2026-08-11' && boundary.evening.late === false);
  /* The point of putting this inside today(): one change, and the week, the
     plan and everything keyed by date move with it. */
  check('the week moves with it', boundary.weekMoves.ws === '2026-08-10', boundary.weekMoves.ws);
  check('an hour past the allowed range is ignored, not obeyed',
    boundary.tooLate.today === '2026-08-11', boundary.tooLate.today);
  check('...and so is a negative one', boundary.negative.today === '2026-08-11', boundary.negative.today);

  /* The actual complaint: a main session before work and a routine after a
     shift that ends at 2am are one day to the person doing them. */
  const twoADay = await page.evaluate(`(() => {
    ${CLOCK}
    const run = (dayStart) => {
      S = blank(); S.onboarded = true; S.profile.dayStart = dayStart; save(true);
      buildWeekPlan(true);
      const log = (extra) => {
        const ex = EX['bb-back-squat'];
        S.active = { id: 'x' + Math.floor(performance.now()), date: today(), type: 'full', env: 'full',
          rung: 'full', extra, started: Date.now() - 3600000, ended: null, dur: 0,
          exercises: [{ exId: ex.id, name: ex.name, load: ex.load, targetW: 60, targetR: 8,
                        sets: [{ w: 60, r: 8, rpe: 8, done: true }], note: '' }] };
        finishSession();
      };
      at('2026-08-10T07:00:00', () => log(false));   // main session, before work
      at('2026-08-11T02:30:00', () => log(true));    // routine, after the shift
      const dates = S.sessions.map(s => s.date);
      return { dates, distinct: new Set(dates).size,
               onTenth: sessionsOn('2026-08-10').length,
               summary: daySessions('2026-08-10') };
    };
    return { off: run(0), on: run(4) };
  })()`);
  check('at midnight the two land on different days', twoADay.off.distinct === 2,
    JSON.stringify(twoADay.off.dates));
  check('with the boundary set they are one day', twoADay.on.distinct === 1,
    JSON.stringify(twoADay.on.dates));
  check('...both of them, on the day you were awake for', twoADay.on.onTenth === 2,
    String(twoADay.on.onTenth));
  /* And the day has to describe itself by the session that discharged it, not
     by whichever happened to be first or last in the array. */
  check('the day is named by the session that counted',
    twoADay.on.summary.main && twoADay.on.summary.main.extra !== true);
  check('...with the other one counted, not dropped', twoADay.on.summary.extras === 1,
    String(twoADay.on.summary.extras));

  /* The hint that makes this findable at all. It has to appear when the
     problem is visible and never once it has been answered. */
  const hint = await page.evaluate(`(() => {
    ${CLOCK}
    S = blank(); S.onboarded = true; S.profile.dayStart = 0; save(true);
    const late = at('2026-08-11T02:30:00', () => lateFinishHint());
    const day  = at('2026-08-11T14:00:00', () => lateFinishHint());
    S.profile.dayStartSeen = true;
    const answered = at('2026-08-11T02:30:00', () => lateFinishHint());
    S.profile.dayStartSeen = false; S.profile.dayStart = 4;
    const alreadySet = at('2026-08-11T02:30:00', () => lateFinishHint());
    return { late, day, answered, alreadySet };
  })()`);
  check('the hint appears after a session in the small hours', hint.late === true);
  check('...and never in the middle of the day', hint.day === false);
  check('...nor once the question has been answered', hint.answered === false);
  check('...nor when the boundary is already set', hint.alreadySet === false);

  // ================= 8. reps or seconds, and circuits =====================
  console.log('\nreps or seconds\n');

  const retime = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    const r = newRoutine('Abs');
    addToRoutine(r.id, 'bw-crunch');       // reps by default
    addToRoutine(r.id, 'bw-plank');        // seconds by default
    const before = r.items.map(it => ({ mode: it.mode, reps: it.reps, load: itemLoad(it) }));

    setItemMode(r.id, 0, 'time');
    const crunchTimed = { ...r.items[0], load: itemLoad(r.items[0]) };
    setItemMode(r.id, 1, 'reps');
    const plankReps = { ...r.items[1], load: itemLoad(r.items[1]) };

    return {
      before, crunchTimed, plankReps,
      /* The choice is not offered where reps against a working weight is the
         entire mechanism. */
      offered: {
        crunch: canRetime('bw-crunch'), bicycle: canRetime('bw-bicycle'),
        walk: canRetime('car-walk'), dbCrunch: canRetime('db-crunch'),
        bench: canRetime('bb-bench'), squat: canRetime('bb-back-squat'),
        dbBench: canRetime('db-bench')
      }
    };
  });
  check('a crunch starts in reps', retime.before[0].mode === 'reps' && retime.before[0].load === 'bw',
    JSON.stringify(retime.before[0]));
  check('a plank starts in seconds', retime.before[1].mode === 'time' && retime.before[1].load === 'time',
    JSON.stringify(retime.before[1]));
  check('a crunch can be switched to seconds', retime.crunchTimed.load === 'time', retime.crunchTimed.load);
  /* Carrying 15 across from reps would prescribe a 15-second plank. */
  check('...and the number moves with the unit', retime.crunchTimed.reps >= 20,
    String(retime.crunchTimed.reps));
  check('a plank can be switched to reps', retime.plankReps.load === 'bw', retime.plankReps.load);
  check('...with a rep count, not 30 of them', retime.plankReps.reps <= 20, String(retime.plankReps.reps));
  check('the choice is offered on abs and cardio',
    retime.offered.crunch && retime.offered.bicycle && retime.offered.walk && retime.offered.dbCrunch);
  check('...and withheld from loaded compounds',
    !retime.offered.bench && !retime.offered.squat && !retime.offered.dbBench,
    JSON.stringify(retime.offered));

  const built = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    const r = newRoutine('Abs');
    addToRoutine(r.id, 'bw-crunch');
    setItemMode(r.id, 0, 'time');
    const s = buildRoutineSession(r.id, false);
    const item = s.exercises[0];
    /* Twelve sessions of holding it: the rep target must not creep, because
       the number is now a duration. */
    for (let i = 0; i < 12; i++) {
      const one = buildRoutineSession(r.id, false);
      one.date = today();
      one.exercises.forEach(x => x.sets.forEach(st => { st.done = true; st.r = x.targetR; }));
      applyProgression(one);
    }
    const L = S.lifts['bw-crunch'] || {};
    return { load: item.load, target: item.targetR, catalogue: EX['bw-crunch'].load,
             /* Seeded by targetFor at the catalogue's low rep — asserting it
                stays null would be asserting the wrong thing. What matters is
                that twelve timed sessions do not ratchet it. */
             learned: L.r, seed: EX['bw-crunch'].rl };
  });
  check('the session carries the item\'s load, not the catalogue\'s',
    built.load === 'time' && built.catalogue === 'bw', `${built.load} vs ${built.catalogue}`);
  check('...and a seconds target', built.target >= 20, String(built.target));
  check('twelve timed sessions never ratchet the rep target',
    built.learned === built.seed, `${built.seed} → ${built.learned}`);

  console.log('\ncircuits\n');

  /* The complaint, verbatim: "I work each exercise once for the duration or
     reps and move to the next like a superset and then do the whole routine in
     3 sets." */
  const circ = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    const r = newRoutine('Abs before bed');
    ['bw-crunch', 'bw-bicycle', 'bw-plank'].forEach(id => addToRoutine(r.id, id));
    setRoutineCircuit(r.id, true);
    adjustRoutineRounds(r.id, -1);            // 3 → 2, to keep the walk short
    const A = buildRoutineSession(r.id, false);
    S.active = A;

    const order = [];
    const rounds = [];
    let guard = 0;
    while (!circuitPos(A).finished && guard++ < 50) {
      const p = circuitPos(A);
      order.push(A.exercises[p.ei].name);
      rounds.push(p.round);
      completeCircuitEntry(p.ei, p.round);
    }
    return {
      circuit: A.circuit, rounds: A.rounds, restRound: A.restRound,
      setsPer: A.exercises.map(x => x.sets.length),
      order, roundSeq: rounds,
      mins: routineMins(routineById(r.id)),
      allDone: A.exercises.every(x => x.sets.every(s => s.done))
    };
  });
  check('a circuit session knows it is one', circ.circuit === true);
  check('...with the routine\'s round count', circ.rounds === 2, String(circ.rounds));
  check('...and one set per round on every movement',
    circ.setsPer.every(n => n === circ.rounds), JSON.stringify(circ.setsPer));
  /* The whole point: across the list first, then round again — not three
     crunches, then three bicycles. */
  check('it runs across the list, then repeats',
    circ.order.join(' > ') === 'Crunch > Bicycle Crunch > Plank > Crunch > Bicycle Crunch > Plank',
    circ.order.join(' > '));
  check('...and the round number advances with it',
    circ.roundSeq.join('') === '000111', circ.roundSeq.join(''));
  check('working through it completes the session', circ.allDone === true);
  check('the minute estimate accounts for the rounds and the rest',
    circ.mins >= 3 && circ.mins <= 20, circ.mins + ' min');

  /* Rest goes after the round, not between movements. That is the difference
     between a circuit and an ordinary session. */
  const resting = await page.evaluate(async () => {
    S = blank(); S.onboarded = true; save(true);
    const r = newRoutine('Abs');
    ['bw-crunch', 'bw-bicycle'].forEach(id => addToRoutine(r.id, id));
    setRoutineCircuit(r.id, true);
    adjustRoutineRounds(r.id, -1);                 // 3 → 2, so "the last round" is round 2
    const A = buildRoutineSession(r.id, false);
    S.active = A; save(true); go('train');

    const bar = () => document.getElementById('rest-bar').classList.contains('on');
    stopRest();                                    // a timer left running by an earlier probe is not a result
    completeCircuitEntry(0, 0);                    // mid-round
    const afterFirst = bar();
    stopRest();
    completeCircuitEntry(1, 0);                    // last of round 1
    const afterRound = bar();
    const label = document.getElementById('rest-label').textContent;
    stopRest();
    /* And none after the final round — there is nothing left to rest for. */
    completeCircuitEntry(0, 1);
    stopRest();
    completeCircuitEntry(1, 1);
    const afterLast = bar();
    stopRest();
    return { afterFirst, afterRound, label, afterLast, rounds: A.rounds };
  });
  check('no rest between movements in a circuit', resting.afterFirst === false);
  check('...but rest after a full round', resting.afterRound === true);
  check('...and it says which round finished', /round 1/i.test(resting.label), resting.label);
  check('...with none after the last round', resting.afterLast === false);

  /* Turning it off has to leave the ordinary shape untouched. */
  const plain = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    const r = newRoutine('Normal');
    addToRoutine(r.id, 'bw-crunch');
    adjustRoutineItem(r.id, 0, 'sets', 1);      // 3 → 4
    const s = buildRoutineSession(r.id, false);
    return { circuit: s.circuit, rounds: s.rounds, sets: s.exercises[0].sets.length };
  });
  check('a routine that is not a circuit still uses its own set count',
    plain.sets === 4 && plain.circuit === false, `${plain.sets} sets, circuit ${plain.circuit}`);

  // ================= 9. what a marker costs ==============================
  console.log('\nmarker requirements\n');

  /* Every marker states its cost, and the ones that count something can say
     how far along you are. A requirement that drifts from the test that
     actually awards the marker would be the worst kind of wrong here: the
     screen would promise one thing and the app would do another. */
  const needs = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    const missing = MILESTONES.filter(m => !MILESTONE_NEED[m.k]).map(m => m.k);

    /* The stated goal must be the number the milestone's own test flips on.
       Checked by running the test against a stat object built from the goal,
       one below and one at it. */
    const wrong = [];
    MILESTONES.forEach(m => {
      const n = MILESTONE_NEED[m.k];
      if (!n || !n.at) return;
      const zero = { count: 0, streak: 0, micro: 0, tonnes: 0, kcal: 0, returned: false, day: 1 };
      const field = Object.keys(zero).find(f => {
        const probe = { ...zero }; probe[f] = n.goal;
        return n.at(probe) === n.goal;
      });
      if (!field) { wrong.push(m.k + ':unmeasurable'); return; }
      const below = { ...zero }; below[field] = n.goal - 1;
      const at = { ...zero }; at[field] = n.goal;
      if (m.test(below)) wrong.push(`${m.k}: awarded at ${n.goal - 1}, claims ${n.goal}`);
      if (!m.test(at)) wrong.push(`${m.k}: not awarded at its stated ${n.goal}`);
    });

    S.sessions = Array.from({ length: 3 }, (_, i) => ({ id: 'x' + i, ended: Date.now(),
      date: dk(addDays(fromKey(today()), -i)), type: 'full', env: 'full', rung: 'full', exercises: [] }));
    save(true);
    const st = journeyStats();
    return {
      missing, wrong: wrong.slice(0, 5),
      five: milestoneNeed('s5', st),
      hundred: milestoneNeed('s100', st),
      /* A yes-or-no marker has no bar to draw. */
      floor: milestoneNeed('floor', st),
      unknown: milestoneNeed('not-a-marker', st)
    };
  });
  check('every marker states what it costs', needs.missing.length === 0, needs.missing.join(', '));
  check('...and the stated cost is the one that awards it', needs.wrong.length === 0,
    needs.wrong.join(' | '));
  check('three sessions reads as 3 of 5', needs.five.have === 3 && needs.five.goal === 5,
    JSON.stringify(needs.five));
  check('...at 60 per cent', needs.five.pct === 60, String(needs.five.pct));
  /* Three sessions against a hundred is 3%, not 0 and not a rounding artefact
     that draws an empty bar as full. */
  check('a distant marker reads honestly small', needs.hundred.pct === 3, String(needs.hundred.pct));
  check('a yes-or-no marker has no bar to draw', needs.floor.goal === null, JSON.stringify(needs.floor));
  check('an unknown key returns nothing rather than throwing', needs.unknown === null);

  /* Passing a marker must not draw a bar past its own end. */
  const capped = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    S.sessions = Array.from({ length: 40 }, (_, i) => ({ id: 'y' + i, ended: Date.now(),
      date: dk(addDays(fromKey(today()), -i)), type: 'full', env: 'full', rung: 'full', exercises: [] }));
    save(true);
    return milestoneNeed('s5', journeyStats());
  });
  check('forty sessions never reads as 40 of 5', capped.have === 5, String(capped.have));
  check('...nor as 800 per cent', capped.pct === 100, String(capped.pct));

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
