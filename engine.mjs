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

  /* ---- the summary over the range agrees with the screen under it ----
     Both of these were the same bug seen twice. The strip's label and the
     marker's position each derived "where you are" from the first movement
     with a set left in it, which in a circuit is the FIRST movement for the
     whole session bar the last round. The label named Dead Bug while the card
     underneath said Hollow Hold, and the marker sat pinned to the left edge
     through a session that was ten sets of twenty-one done — beside a count
     reading 10/21. Two readings of one thing disagreeing is worse than either
     being subtle.

     Checked against the numbers rather than against a snapshot: the marker's
     position has to BE the fraction of the work that is done. */
  const strip = await page.evaluate(() => {
    const build = (circuit, tick) => {
      S = blank(); S.onboarded = true; save(true);
      const names = ['Dead Bug', 'Bicycle Crunch', 'Plank', 'Hollow Hold',
                     'Side Plank', 'Bird Dog', 'Leg Raise'];
      S.active = { started: Date.now(), circuit, rounds: circuit ? 3 : 1, type: 'full',
        exercises: names.map(n => ({ name: n, exId: 'mob-cat-cow', load: 'time',
          targetR: 30, sets: [0, 1, 2].map(() => ({ done: false })) })) };
      tick(S.active);
      save(true); go('train'); renderTrain();
      const A = S.active;
      const done = A.exercises.reduce((a, it) => a + it.sets.filter(s => s.done).length, 0);
      const total = A.exercises.reduce((a, it) => a + it.sets.length, 0);
      return { where: trainWhere(A), lx: rangeGeom(A).lx / 320,
               done, total, frac: done / total };
    };
    return {
      /* Ten of twenty-one: round 1 complete, round 2 up to the fourth. */
      circuit: build(true, (A) => {
        let n = 0;
        for (let r = 0; r < 3 && n < 10; r++)
          for (let i = 0; i < 7 && n < 10; i++) { A.exercises[i].sets[r].done = true; n++; }
      }),
      /* An ordinary session worked straight through: the marker must not move
         from where it has always been, since here the frontier and the total
         are the same number. */
      inOrder: build(false, (A) => {
        A.exercises.slice(0, 3).forEach(it => it.sets.forEach(s => { s.done = true; }));
      }),
      /* And one worked out of order — three movements in, none of them the
         first. The old rule called this zero. */
      skipped: build(false, (A) => {
        [2, 4, 5].forEach(i => A.exercises[i].sets.forEach(s => { s.done = true; }));
      }),
    };
  });
  check('the range names the movement you are actually on, in a circuit',
    /^Hollow Hold · 4 of 7$/.test(strip.circuit.where), strip.circuit.where);
  check('...and its marker sits at the work you have done, not at the first gap',
    Math.abs(strip.circuit.lx - strip.circuit.frac) < .01,
    `marker ${(strip.circuit.lx * 100).toFixed(1)}% vs ${strip.circuit.done}/${strip.circuit.total}`
      + ` = ${(strip.circuit.frac * 100).toFixed(1)}%`);
  check('...unchanged on an ordinary session worked straight through',
    Math.abs(strip.inOrder.lx - strip.inOrder.frac) < .01
      && /^Hollow Hold · 4 of 7$/.test(strip.inOrder.where),
    `${strip.inOrder.where} · marker ${(strip.inOrder.lx * 100).toFixed(1)}%`
      + ` vs ${(strip.inOrder.frac * 100).toFixed(1)}%`);
  check('...and counting work done out of order rather than calling it none',
    strip.skipped.lx > .3 && Math.abs(strip.skipped.lx - strip.skipped.frac) < .01,
    `marker ${(strip.skipped.lx * 100).toFixed(1)}% vs ${(strip.skipped.frac * 100).toFixed(1)}%`);
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

  // ================= 10. the sky ==========================================
  console.log('\nthe sky\n');

  /* The ambient light in the app follows the light outside it. The one thing
     that must not happen is it following `today()` instead: dayStart moves
     where your day ends and it does not move sunrise, so at 2am with a 4am
     boundary the app correctly says Sunday and must still draw a night sky. */
  const sky = await page.evaluate(`(() => {
    ${CLOCK}
    S = blank(); S.onboarded = true; save(true);
    const bands = {};
    [0, 3, 4, 5, 8, 9, 12, 16, 17, 20, 21, 23].forEach(hr => {
      const iso = '2026-08-11T' + String(hr).padStart(2, '0') + ':30:00';
      bands[hr] = at(iso, () => skyBand());
    });
    S.profile.dayStart = 4;
    const lateNight = at('2026-08-11T02:30:00', () => ({ sky: skyBand(), day: today(), wall: dk() }));
    /* 06:30 is where a wrong implementation actually shows: the wall clock
       says dawn, and an hour shifted by the 4am boundary would say night.
       At 02:30 both answers are "night", so testing only there proves
       nothing — which is what the first version of this check did. */
    const shifted = at('2026-08-11T06:30:00', () => ({ sky: skyBand(), day: today(), wall: dk() }));
    S.profile.dayStart = 0;
    const unshifted = at('2026-08-11T06:30:00', () => skyBand());
    const applied = at('2026-08-11T02:30:00', () => { syncSky(); return document.documentElement.getAttribute('data-sky'); });
    const daylight = at('2026-08-11T12:00:00', () => { syncSky(); return document.documentElement.getAttribute('data-sky'); });
    return { bands, lateNight, shifted, unshifted, applied, daylight };
  })()`);
  check('the small hours are night', sky.bands[0] === 'night' && sky.bands[3] === 'night',
    `${sky.bands[0]}/${sky.bands[3]}`);
  check('five to nine is dawn', sky.bands[5] === 'dawn' && sky.bands[8] === 'dawn',
    `${sky.bands[5]}/${sky.bands[8]}`);
  check('...and four is not', sky.bands[4] === 'night', sky.bands[4]);
  check('the working day is day', sky.bands[9] === 'day' && sky.bands[16] === 'day',
    `${sky.bands[9]}/${sky.bands[16]}`);
  check('the evening is dusk', sky.bands[17] === 'dusk' && sky.bands[20] === 'dusk',
    `${sky.bands[17]}/${sky.bands[20]}`);
  check('...and it is night again by nine', sky.bands[21] === 'night' && sky.bands[23] === 'night',
    `${sky.bands[21]}/${sky.bands[23]}`);
  /* The one that matters. */
  check('the boundary still shifts the date at 2:30am',
    sky.lateNight.day === '2026-08-10' && sky.lateNight.wall === '2026-08-11',
    JSON.stringify(sky.lateNight));
  /* The property that matters, tested where the two answers differ. */
  check('...but a 4am boundary does not move sunrise',
    sky.shifted.sky === 'dawn' && sky.shifted.day === '2026-08-11',
    JSON.stringify(sky.shifted));
  check('...and the boundary makes no difference to the sky at all',
    sky.shifted.sky === sky.unshifted, `${sky.shifted.sky} vs ${sky.unshifted}`);
  check('syncSky puts the band on the document', sky.applied === 'night', String(sky.applied));
  check('...and changes it when the hour does', sky.daylight === 'day', String(sky.daylight));

  // ================= 11. the catalogue holds together ====================
  console.log('\nthe catalogue\n');

  /* EXDATA is a pipe-delimited block parsed at load. Nothing validated it, so
     a malformed row became an exercise with undefined fields, and a repeated
     id silently shadowed an earlier one — which is exactly what happened while
     adding the movements from the 5-day plan: "Close-Grip Bench Press" went in
     next to the "Close-Grip Bench" that was already there, and a second
     "Upright Row" took the first one's id. Both were caught by hand. This is
     so the next one is not. */
  const cat = await page.evaluate(() => {
    const PATTERNS = new Set(['squat','hinge','push-h','push-v','pull-h','pull-v','lunge',
                              'delts','arms-bi','arms-tri','core','calves','carry','cardio','mobility']);
    const LOADS = new Set(['bw','wt','time','min']);
    const MUSCLES = new Set(['Chest','Back','Quads','Hamstrings','Glutes','Shoulders',
                             'Biceps','Triceps','Core','Calves','Forearms','Cardio']);
    const EQ = new Set(['Barbell','Dumbbell','Machine','Cable','Bodyweight','Band','Cardio','Kettlebell']);
    const rows = EXDATA.trim().split('\n').filter(Boolean).map(r => r.split('|'));
    const bad = { cols: [], dupId: [], dupName: [], pattern: [], load: [], primary: [],
                  secondary: [], eq: [], env: [], tier: [], reps: [] };
    const ids = new Set(), names = new Set();
    rows.forEach(c => {
      if (c.length !== 11) { bad.cols.push(c[0] || c.join('|').slice(0, 24)); return; }
      const [id, name, eq, env, pat, pri, sec, tier, rl, rh, load] = c;
      if (ids.has(id)) bad.dupId.push(id); ids.add(id);
      /* Names as well as ids: two rows can be distinct to the parser and the
         same movement to a person, and the picker shows names. */
      if (names.has(name.toLowerCase())) bad.dupName.push(name); names.add(name.toLowerCase());
      if (!PATTERNS.has(pat)) bad.pattern.push(id + ':' + pat);
      if (!LOADS.has(load)) bad.load.push(id + ':' + load);
      if (!MUSCLES.has(pri)) bad.primary.push(id + ':' + pri);
      (sec ? sec.split(',') : []).forEach(x => { if (!MUSCLES.has(x)) bad.secondary.push(id + ':' + x); });
      if (!EQ.has(eq)) bad.eq.push(id + ':' + eq);
      if (!/^[fhb]+$/.test(env)) bad.env.push(id + ':' + env);
      if (!(+tier >= 1 && +tier <= 4)) bad.tier.push(id + ':' + tier);
      if (+rl > +rh) bad.reps.push(id);
    });
    /* And the parsed objects have to match the rows they came from — a parser
       that silently drops one is the same bug one layer down. */
    return { rows: rows.length, parsed: EXLIST.length, keyed: Object.keys(EX).length, bad,
             every: EXLIST.every(e => e.id && e.name && e.pattern && e.load) };
  });
  check('every catalogue row has all eleven fields', cat.bad.cols.length === 0, cat.bad.cols.join(', '));
  check('no exercise id appears twice', cat.bad.dupId.length === 0, cat.bad.dupId.join(', '));
  check('no exercise name appears twice', cat.bad.dupName.length === 0, cat.bad.dupName.join(', '));
  check('every pattern is a real pattern', cat.bad.pattern.length === 0, cat.bad.pattern.join(', '));
  check('every load type is real', cat.bad.load.length === 0, cat.bad.load.join(', '));
  check('every primary muscle is a real one', cat.bad.primary.length === 0, cat.bad.primary.join(', '));
  check('...and every secondary', cat.bad.secondary.length === 0, cat.bad.secondary.join(', '));
  check('every equipment name is one the app knows', cat.bad.eq.length === 0, cat.bad.eq.join(', '));
  check('every environment flag is f, h or b', cat.bad.env.length === 0, cat.bad.env.join(', '));
  check('every tier is 1 to 4', cat.bad.tier.length === 0, cat.bad.tier.join(', '));
  check('no rep range runs backwards', cat.bad.reps.length === 0, cat.bad.reps.join(', '));
  check('every row parsed into an exercise', cat.parsed === cat.rows && cat.keyed === cat.rows,
    `${cat.rows} rows → ${cat.parsed} listed, ${cat.keyed} keyed`);
  check('...with the fields the rest of the app reads', cat.every === true);
  check('the catalogue was actually large enough to be worth checking', cat.rows > 250,
    String(cat.rows));

  // ================= 12. supersets =========================================
  console.log('\nsupersets\n');

  const sup = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    const r = newRoutine('Push');
    ['bb-bench', 'db-fly', 'bb-ohp', 'db-lateral'].forEach(id => addToRoutine(r.id, id));

    toggleSupersetLink(r.id, 0);                       // bench + fly
    const paired = { flags: r.items.map(x => !!x.supNext), groups: supersetGroups(r.items),
                     at1: supersetAt(r.items, 1), name0: supersetName(r.items, 0) };

    toggleSupersetLink(r.id, 3);                       // the last item has no next
    const onLast = r.items.map(x => !!x.supNext);

    /* And the same thing arriving from the store rather than from a tap: a
       save written by an older build, or one hand-edited, can hold a link on
       the final item. ensureRoutines() is what every read goes through. */
    S.routines[0].items[3].supNext = true;
    ensureRoutines();
    const onLastStored = r.items.map(x => !!x.supNext);

    /* Pull one half of the pair out from under the other. */
    moveInRoutine(r.id, 0, 1);
    const moved = { names: r.items.map(x => EX[x.exId].name),
                    groups: supersetGroups(r.items) };

    /* And delete the movement in the middle of a link. */
    const r2 = newRoutine('Push2');
    ['bb-bench', 'db-fly', 'bb-ohp'].forEach(id => addToRoutine(r2.id, id));
    toggleSupersetLink(r2.id, 0);                      // bench + fly
    removeFromRoutine(r2.id, 1);                       // fly goes
    const deleted = { names: r2.items.map(x => EX[x.exId].name),
                      groups: supersetGroups(r2.items) };

    /* Into a session, across a block boundary: a tier-1 press paired with a
       tier-3 raise, which the block sort would otherwise pull apart. */
    const r3 = newRoutine('Sess');
    ['bb-bench', 'db-lateral', 'bb-ohp'].forEach(id => addToRoutine(r3.id, id));
    toggleSupersetLink(r3.id, 0);
    const sess = buildRoutineSession(r3.id, false);
    S.active = sess;
    const order = sessionOrder(sess);

    setRoutineCircuit(r3.id, true);
    const circ = buildRoutineSession(r3.id, false);

    return { paired, onLast, onLastStored, moved, deleted,
      sess: { carried: sess.exercises.map(x => !!x.supNext),
              blocks: sess.exercises.map(x => exBlock(x)),
              orderNames: order.map(i => sess.exercises[i].name),
              /* supFor reads S.active, which is why it is set above. */
              letters: order.map(i => (supFor(i) || {}).letter || '-') },
      circCarried: circ.exercises.map(x => !!x.supNext) };
  });

  check('linking two movements makes one group of two',
    JSON.stringify(sup.paired.groups) === '[[0,1]]', JSON.stringify(sup.paired.groups));
  check('...and the flag sits only on the first of them',
    JSON.stringify(sup.paired.flags) === '[true,false,false,false]', JSON.stringify(sup.paired.flags));
  check('the second of a pair knows it is the second',
    sup.paired.at1 && sup.paired.at1.pos === 1 && sup.paired.at1.letter === 'B',
    JSON.stringify(sup.paired.at1));
  check('the first group is called A', sup.paired.name0 === 'A', String(sup.paired.name0));
  /* Left set, it would silently suppress the rest after the final movement. */
  check('the last movement cannot be linked to a next one that does not exist',
    sup.onLast[3] === false, JSON.stringify(sup.onLast));
  check('...and a link on the last movement is stripped when the save is read',
    sup.onLastStored[3] === false, JSON.stringify(sup.onLastStored));

  /* The bug this section was written for: the flag travels with the item, so
     without clearLinksAround, moving the bench out of a bench+fly pair leaves
     it linked to the overhead press that slid in underneath — a superset
     nobody asked for, indistinguishable on screen from one they did. */
  check('moving one half of a pair breaks the pair',
    sup.moved.groups.length === 0,
    sup.moved.groups.map(g => g.map(i => sup.moved.names[i]).join('+')).join(', '));
  check('...rather than re-pairing it with whatever slid underneath',
    !JSON.stringify(sup.moved.groups).includes('[1,2]'),
    JSON.stringify(sup.moved.groups));
  check('deleting the movement a link points at breaks the link',
    sup.deleted.groups.length === 0,
    sup.deleted.groups.map(g => g.map(i => sup.deleted.names[i]).join('+')).join(', '));

  check('a session carries the link off the routine',
    sup.sess.carried[0] === true && sup.sess.carried[1] === false,
    JSON.stringify(sup.sess.carried));
  /* Without the grouping in sessionOrder this reads Bench, Overhead, Lateral —
     the block sort lifting the tier-1 press over the tier-3 raise and landing
     it between the two halves of the pair. */
  check('a pair stays adjacent even when its halves are in different blocks',
    JSON.stringify(sup.sess.blocks) === '["main","accessory","main"]' &&
    JSON.stringify(sup.sess.orderNames) === '["Bench Press","Lateral Raise","Overhead Press"]',
    JSON.stringify(sup.sess.blocks) + ' → ' + JSON.stringify(sup.sess.orderNames));
  check('...and the pair is lettered A, B while everything else is not lettered',
    JSON.stringify(sup.sess.letters) === '["A","B","-"]', JSON.stringify(sup.sess.letters));
  /* A circuit already runs every movement back to back. */
  check('a circuit carries no links at all',
    sup.circCarried.every(x => x === false), JSON.stringify(sup.circCarried));

  // ================= 13. the badge vocabulary =============================
  console.log('\nbadges\n');

  const badge = await page.evaluate(() => {
    const of = id => exBadges({ exId: id });
    return {
      bench: of('bb-bench'), lunge: of('db-lunge'), plank: of('bw-plank'),
      cat: of('mob-cat-cow'), curl: of('db-curl'), walk: of('car-treadmill-walk'),
      /* Every badge the vocabulary can emit has to have a tone, or it renders
         as an unstyled word. */
      toned: EXLIST.every(e => exBadges({ exId: e.id }).every(b => !!BADGE_TONE[b])),
      unknown: [...new Set(EXLIST.flatMap(e => exBadges({ exId: e.id })))].filter(b => !BADGE_TONE[b]),
      /* A row of six labels under every exercise is decoration. */
      worst: Math.max(...EXLIST.map(e => exBadges({ exId: e.id }).length)),
      /* The cap is asserted against the vocabulary's widest movement, at a
         limit below its badge count. Checking `<= 3` proves nothing while no
         exercise earns more than three — it would pass with the slice deleted,
         which is exactly how a check ends up guarding nothing. */
      widest: (() => {
        const e = EXLIST.map(x => ({ id:x.id, n: exBadges({ exId:x.id }).length }))
                        .sort((a, b) => b.n - a.n)[0];
        return { id: e.id, n: e.n,
                 /* The trailing space matters: the wrapper is class="badges",
                    which a bare /class="badge/ counts as a badge of its own. */
                 at1: (badgeRowHTML({ exId:e.id }, 1).match(/class="badge /g) || []).length,
                 at3: (badgeRowHTML({ exId:e.id }, 3).match(/class="badge /g) || []).length,
                 uncapped: exBadges({ exId:e.id }).length };
      })(),
      uni: EXLIST.filter(e => UNILATERAL_RE.test(e.name)).length,
      /* Both halves of the unilateral rule, on movements that are plainly one
         or the other. A regex that matched everything would pass the first
         of these and fail the second. */
      uniHits: ['db-lunge', 'bw-side-plank', 'db-concentration'].every(id => UNILATERAL_RE.test(EX[id].name)),
      uniMisses: ['bb-bench', 'bb-back-squat', 'bw-plank'].every(id => !UNILATERAL_RE.test(EX[id].name)),
      empty: badgeRowHTML({ exId: 'nope-not-real' }, 3),
    };
  });
  check('a heavy compound reads as Heavy', badge.bench.includes('Heavy'), JSON.stringify(badge.bench));
  check('a lunge reads as Unilateral', badge.lunge.includes('Unilateral'), JSON.stringify(badge.lunge));
  check('a plank reads as Core', badge.plank.includes('Core'), JSON.stringify(badge.plank));
  check('a stretch reads as Mobility', badge.cat.includes('Mobility'), JSON.stringify(badge.cat));
  check('a curl reads as Arms', badge.curl.includes('Arms'), JSON.stringify(badge.curl));
  check('a walk reads as Endurance', badge.walk.includes('Endurance'), JSON.stringify(badge.walk));
  check('every badge the catalogue can produce has a tone', badge.toned === true,
    badge.unknown.join(', '));
  check('no movement is given more than three badges', badge.worst <= 3, String(badge.worst));
  check('the widest movement in the vocabulary earns more than one badge',
    badge.widest.uncapped > 1, badge.widest.id + ' → ' + badge.widest.uncapped);
  check('...and the row honours the cap it is given',
    badge.widest.at1 === 1 && badge.widest.at3 === badge.widest.uncapped,
    `${badge.widest.id}: ${badge.widest.uncapped} badges → ${badge.widest.at1} at max 1, ${badge.widest.at3} at max 3`);
  check('the unilateral rule matches one-sided work', badge.uniHits === true);
  check('...and leaves two-sided work alone', badge.uniMisses === true);
  check('it matches a real share of the catalogue, not one row and not all of it',
    badge.uni > 20 && badge.uni < 80, String(badge.uni));
  check('an exercise the catalogue has never heard of renders no badges',
    badge.empty === '', badge.empty);

  // ================= 14. what a set row offers, and what it records =======
  console.log('\nwhat a row offers\n');

  const ghost = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    /* A real last session, with a 1.25 in it — the weight fmtW rounds to 1.3
       and the plate maths has to see as 1.25. */
    S.sessions = [{ date: today(), ended: true, exercises: [
      { exId:'bb-bench', name:'Bench Press', load:'wt', sets:[
        { w:1.25, r:8, done:true }, { w:82.5, r:8, done:true }, { w:80, r:6, done:true }] }] }];
    save(true);
    const mk = () => ({ exId:'bb-bench', name:'Bench Press', load:'wt', targetW:70, targetR:5,
      sets:[0,1,2,3].map(() => ({ w:'', r:'', rpe:'', done:false })) });

    const item = mk();
    const fresh = [0,1,2,3].map(i => ghostFor(item, i));
    item.sets[0].w = '90'; item.sets[0].r = '4';
    const carried = [0,1,2,3].map(i => ghostFor(item, i));

    /* What the row *records* is checked in blanks.mjs by clicking the real
       tick, not here: re-running the handler's own arithmetic in the probe
       would prove two copies of it agree and nothing else. */
    return { fresh, carried, painted: ghostW(item, ghostFor(item, 0)),
             /* Bodyweight work offers 0 added, not a dash. */
             bwBlank: ghostW({ exId:'bw-pushup', load:'bw' }, { w:'', r:'' }),
             wtBlank: ghostW({ exId:'bb-bench', load:'wt' }, { w:'', r:'' }) };
  });
  check('an untouched row offers what you did in that slot last time',
    ghost.fresh[1].w === 82.5 && ghost.fresh[1].r === 8 && ghost.fresh[1].src === 'last',
    JSON.stringify(ghost.fresh[1]));
  check('a row with no last set falls back to the prescription',
    ghost.fresh[3].w === 70 && ghost.fresh[3].src === 'target', JSON.stringify(ghost.fresh[3]));
  check('typing set 1 carries down to the sets under it',
    ghost.carried[1].w === '90' && ghost.carried[3].w === '90' &&
    ghost.carried[1].src === 'carry', JSON.stringify(ghost.carried[1]));
  check('...and set 1 keeps offering last time rather than itself',
    ghost.carried[0].src === 'last', JSON.stringify(ghost.carried[0]));
  /* fmtW rounds to one decimal, which is right for a label and wrong for a
     store — 1.25 kg painted as "1.3" and then *saved* as 1.3 sends you to the
     wrong plate. The row may round what it paints; it may not round what it
     records. */
  check('the row paints a rounded weight', ghost.painted === '1.3', ghost.painted);
  check('...while the value behind it stays unrounded',
    ghost.fresh[0].w === 1.25, String(ghost.fresh[0].w));
  check('bodyweight work offers 0 added rather than a dash',
    ghost.bwBlank === '0' && ghost.wtBlank === '–', ghost.bwBlank + ' / ' + ghost.wtBlank);

  const prc = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    const wt = { exId:'bb-bench', load:'wt' };
    const virgin = isPR(wt, { w:100, r:5, done:true });
    S.lifts['bb-bench'] = { best:{ w:80, r:8, e1rm:e1rm(80, 8) }, history:[] };
    S.lifts['bw-plank']  = { best:{ w:0, r:60, e1rm:1 }, history:[] };
    S.lifts['mob-cat-cow'] = { best:{ w:0, r:8, e1rm:1 }, history:[] };
    return { virgin,
      beats: isPR(wt, { w:100, r:5, done:true }),
      under: isPR(wt, { w:60, r:5, done:true }),
      notDone: isPR(wt, { w:100, r:5, done:false }),
      /* Weighted, and deliberately so. e1rm() returns 0 when the weight is 0,
         so an unloaded plank can never beat anything and the check would pass
         with the guards deleted — a held movement has to be carrying load for
         this to be testing the exclusion rather than the arithmetic. */
      timed: isPR({ exId:'bw-plank', load:'time' }, { w:20, r:600, done:true }),
      mobility: isPR({ exId:'mob-cat-cow', load:'bw' }, { w:20, r:99, done:true }) };
  });
  /* "PR" on the first set of a movement you have never done is a
     participation medal, and this app does not hand those out. */
  check('a movement with no history cannot set a record', prc.virgin === false);
  check('beating the best estimated single is a record', prc.beats === true);
  check('...and coming in under it is not', prc.under === false);
  check('an unticked set is not a record', prc.notDone === false);
  /* An e1RM off a duration is nonsense, and a stretch has a range that is
     correct rather than one to beat — both for the same reasons
     applyProgression skips them. */
  check('held work sets no records however long you hold it', prc.timed === false);
  check('neither does mobility', prc.mobility === false);

  const rpe = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    const on = rpeShown();
    S.settings.rpe = false;
    const off = rpeShown();
    delete S.settings.rpe;
    return { on, off, legacy: rpeShown() };
  });
  check('the RPE column is on by default', rpe.on === true);
  check('...and can be turned off', rpe.off === false);
  /* Stored as an explicit false: a save written before this setting existed
     has no `rpe` key, and reading it as falsy would take the column away from
     everyone who had been filling it in. */
  check('a save from before the setting existed keeps the column', rpe.legacy === true);

  // ================= 15. changing units moves the numbers ================
  console.log('\nunits\n');

  const units = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    S.profile.units = 'lb';
    S.profile.bodyweight = [{ d: today(), w: 217 }];
    S.lifts['bb-bench'] = { w: 225, r: 5, fails: 0,
      best: { w: 225, r: 5, e1rm: e1rm(225, 5), date: today() },
      lastDate: today(), history: [{ d: today(), w: 225, r: 5, e1rm: 262 }] };
    S.sessions = [{ date: today(), ended: true, dur: 40, exercises: [
      { exId: 'bb-bench', name: 'Bench Press', load: 'wt', targetW: 225,
        sets: [{ w: 225, r: 5, rpe: '', done: true }, { w: '', r: '', rpe: '', done: false }] } ] }];
    /* Plate config is stored per unit already, so it must NOT be converted —
       converting it would corrupt the one thing that was already right. */
    S.settings.barLB = 45; S.settings.barKG = 20;
    save(true);

    const counted = storedWeightCount();
    const before = {
      bw: S.profile.bodyweight[0].w, lift: S.lifts['bb-bench'].w,
      best: S.lifts['bb-bench'].best.w, hist: S.lifts['bb-bench'].history[0].w,
      target: S.sessions[0].exercises[0].targetW,
      set: S.sessions[0].exercises[0].sets[0].w,
      blank: S.sessions[0].exercises[0].sets[1].w,
      reps: S.sessions[0].exercises[0].sets[0].r
    };

    /* Through the real handler, not by calling the converter. */
    document.querySelector('#more-body') || go('more');
    sheetProfile();
    const kgChip = document.querySelector('#sheet-body [data-act="set-units"][data-v="kg"]');
    if (!kgChip) return { miss: true };
    kgChip.click();

    const after = {
      units: S.profile.units,
      bw: S.profile.bodyweight[0].w, lift: S.lifts['bb-bench'].w,
      best: S.lifts['bb-bench'].best.w, hist: S.lifts['bb-bench'].history[0].w,
      e1rm: S.lifts['bb-bench'].best.e1rm,
      target: S.sessions[0].exercises[0].targetW,
      set: S.sessions[0].exercises[0].sets[0].w,
      blank: S.sessions[0].exercises[0].sets[1].w,
      reps: S.sessions[0].exercises[0].sets[0].r,
      barLB: S.settings.barLB, barKG: S.settings.barKG
    };
    /* And back again, to prove it is a conversion and not a one-way scaling. */
    document.querySelector('#sheet-body [data-act="set-units"][data-v="lb"]').click();
    const round = { units: S.profile.units, bw: S.profile.bodyweight[0].w,
                    lift: S.lifts['bb-bench'].w };
    closeSheet();
    return { counted, before, after, round };
  });

  check('the units toggle is reachable', !units.miss);
  /* 217 lb is 98.4 kg. Before this, switching the label left it at 217 and the
     app started calling it kilograms — 478 lb, which is not a person. */
  check('bodyweight converts when you change units',
    Math.abs(units.after.bw - 98.43) < 0.05, `${units.before.bw} → ${units.after.bw}`);
  check('...so does the learned working weight',
    Math.abs(units.after.lift - 102.06) < 0.05, `${units.before.lift} → ${units.after.lift}`);
  check('...the personal best', Math.abs(units.after.best - 102.06) < 0.05,
    `${units.before.best} → ${units.after.best}`);
  check('...its estimated single', units.after.e1rm < 130 && units.after.e1rm > 110,
    String(units.after.e1rm));
  check('...the history behind it', Math.abs(units.after.hist - 102.06) < 0.05,
    `${units.before.hist} → ${units.after.hist}`);
  check('...the prescription on a logged session',
    Math.abs(units.after.target - 102.06) < 0.05, `${units.before.target} → ${units.after.target}`);
  check('...and every set you have recorded',
    Math.abs(units.after.set - 102.06) < 0.05, `${units.before.set} → ${units.after.set}`);
  /* Reps are not weights. */
  check('reps are left alone', units.after.reps === 5, String(units.after.reps));
  check('an empty set stays empty', units.after.blank === '', JSON.stringify(units.after.blank));
  /* Plate config already holds both units and picks the right one. Converting
     it would break the one thing that was never broken. */
  check('the plate config is not converted',
    units.after.barLB === 45 && units.after.barKG === 20,
    `${units.after.barLB} / ${units.after.barKG}`);
  check('switching back returns the numbers you started with',
    units.round.units === 'lb' && Math.abs(units.round.bw - 217) < 0.05 &&
    Math.abs(units.round.lift - 225) < 0.05,
    `${units.round.bw} / ${units.round.lift}`);
  check('the count offered up front matches what there is to convert',
    units.counted === 8, String(units.counted));

  /* The repair path, for a save the old toggle already mangled. */
  const repair = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    S.profile.units = 'kg';                    // says kg
    S.profile.bodyweight = [{ d: today(), w: 217 }];   // but the number is lb
    S.lifts['bb-bench'] = { w: 225, r: 5, best: null, lastDate: today(), history: [] };
    save(true);
    go('more'); sheetProfile();
    const link = document.querySelector('#sheet-body [data-act="units-repair"]');
    if (!link) return { miss: true };
    link.click();
    const sheet = document.getElementById('sheet-body');
    const shows = /217/.test(sheet.innerText) && /98\.4/.test(sheet.innerText);
    const go2 = sheet.querySelector('[data-act="units-repair-go"]');
    if (!go2) return { miss: true };
    go2.click();
    return { shows, units: S.profile.units,
             bw: S.profile.bodyweight[0].w, lift: S.lifts['bb-bench'].w };
  });
  check('a mangled save can be corrected', !repair.miss);
  /* Shown before it is done, on your own numbers. It rewrites history. */
  check('...and shows the arithmetic first', repair.shows === true);
  check('...converting the numbers without changing the label',
    repair.units === 'kg' && Math.abs(repair.bw - 98.43) < 0.05 &&
    Math.abs(repair.lift - 102.06) < 0.05, `${repair.units} ${repair.bw} / ${repair.lift}`);

  // ================= 16. a one-rep max needs a lift ======================
  console.log('\nwhat can have a one-rep max\n');

  const orm = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    const mk = (id, w, r, load) => {
      const ex = EX[id];
      return { date: today(), ended: true, dur: 30, exercises: [{
        exId: id, name: ex.name, load: load || ex.load,
        sets: [{ w: w, r: r, rpe: '', done: true }] }] };
    };
    /* A treadmill run with a number in the weight field. Whatever put it there
       — a carry-down, a fat finger, a routine item switched to reps — it is not
       load being moved, and 215 × 15 is not a 323 lb one-rep max. */
    const run = mk('car-treadmill-run', 215, 15);
    applyProgression(run);
    const runBest = (S.lifts['car-treadmill-run'] || {}).best || null;

    const squat = mk('bb-back-squat', 225, 5);
    applyProgression(squat);
    const squatBest = (S.lifts['bb-back-squat'] || {}).best || null;

    /* A weighted pull-up is a loaded lift and does belong here. */
    const pull = mk('bw-pullup', 20, 6);
    applyProgression(pull);
    const pullBest = (S.lifts['bw-pullup'] || {}).best || null;

    const plank = mk('bw-plank', 20, 60, 'time');
    applyProgression(plank);
    const plankBest = (S.lifts['bw-plank'] || {}).best || null;

    return {
      runBest, squatBest: squatBest && Math.round(squatBest.e1rm), pullBest: !!pullBest,
      plankBest,
      tracks: {
        squat: tracksOneRM(null, EX['bb-back-squat']),
        run: tracksOneRM(null, EX['car-treadmill-run']),
        walk: tracksOneRM(null, EX['car-treadmill-walk']),
        cat: tracksOneRM(null, EX['mob-cat-cow']),
        plankTimed: tracksOneRM({ exId: 'bw-plank', load: 'time' }, EX['bw-plank']),
        /* A cardio movement switched to reps in a routine is still cardio. */
        runAsReps: tracksOneRM({ exId: 'car-treadmill-run', load: 'bw' }, EX['car-treadmill-run'])
      },
      inList: allPRs().map(x => x.name)
    };
  });
  /* The reported bug. */
  check('a run gets no estimated one-rep max', orm.runBest === null, JSON.stringify(orm.runBest));
  check('...and does not appear among your best lifts',
    orm.inList.indexOf('Treadmill Run') < 0, orm.inList.join(', '));
  check('a squat still does', orm.squatBest === 263, String(orm.squatBest));
  check('...and so does a weighted pull-up', orm.pullBest === true);
  check('held work does not', orm.plankBest === null, JSON.stringify(orm.plankBest));
  check('cardio is excluded by what it is, not by how it was logged',
    orm.tracks.run === false && orm.tracks.walk === false && orm.tracks.runAsReps === false,
    JSON.stringify(orm.tracks));
  check('...and lifting is not', orm.tracks.squat === true);
  check('mobility and timed work are excluded too',
    orm.tracks.cat === false && orm.tracks.plankTimed === false, JSON.stringify(orm.tracks));

  /* A save written before this existed already holds the nonsense, and there is
     no honest migration — you cannot tell which stored bests were real. So the
     list filters on the way out as well. */
  const staleBests = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    S.lifts['car-treadmill-run'] = { w: 215, r: 15, best: { w: 215, r: 15, e1rm: 322.5, date: today() }, history: [] };
    S.lifts['bb-back-squat'] = { w: 225, r: 5, best: { w: 225, r: 5, e1rm: 262.5, date: today() }, history: [] };
    save(true);
    return allPRs().map(x => x.name);
  });
  check('a save that already holds a run as a best stops showing it',
    staleBests.indexOf('Treadmill Run') < 0 && staleBests.indexOf('Back Squat') >= 0, staleBests.join(', '));

  // ================= 17. a run has a distance, not a weight ==============
  console.log('\ndistance and pace\n');

  /* Builds a live session holding one movement and renders the real Train
     screen, so what is read is the row a person would see rather than what a
     formatter would have produced if anything called it. */
  const runRow = await page.evaluate(() => {
    const start = id => {
      const ex = EX[id];
      S = blank(); S.onboarded = true; save(true);
      S.active = { date: today(), started: Date.now(), type: 'cardio', exercises: [{
        exId: id, name: ex.name, load: ex.load, targetR: ex.rl, targetW: '',
        sets: [{ w:'', r:'', d:'', rpe:'', done:false }] }] };
      go('train'); renderTrain();
      const row = document.querySelector('#train-body .set-row');
      const f = k => row && row.querySelector('[data-set="' + k + '"]');
      const unitOf = k => {
        const el = f(k);
        const lab = el && el.closest('.set-f');
        const u = lab && lab.querySelector('.set-u');
        return u ? u.textContent : null;
      };
      return { hasW: !!f('w'), hasD: !!f('d'), hasR: !!f('r'),
               dUnit: unitOf('d'), wUnit: unitOf('w') };
    };
    return {
      run:    start('car-treadmill-run'),
      squat:  start('bb-back-squat'),
      /* Cardio that does not travel. A stair climber counts floors and a rope
         counts nothing; offering either a distance would be the same category
         error as offering a run a weight. */
      stair:  start('car-stair'),
      rope:   start('car-jump-rope'),
      rower:  start('car-rower')
    };
  });
  /* The reported bug: "A run should not be calculated as weight." */
  check('a run asks for distance and never for weight',
    runRow.run.hasD && !runRow.run.hasW, JSON.stringify(runRow.run));
  check('...in the distance unit, on the row itself', runRow.run.dUnit === 'km', String(runRow.run.dUnit));
  check('...and still asks for the minutes', runRow.run.hasR === true);
  check('a barbell lift is untouched — weight, no distance',
    runRow.squat.hasW && !runRow.squat.hasD, JSON.stringify(runRow.squat));
  check('a rower travels, so it gets one too', runRow.rower.hasD === true);
  check('a stair climber does not, so it does not',
    !runRow.stair.hasD, JSON.stringify(runRow.stair));
  check('...nor does a skipping rope', !runRow.rope.hasD, JSON.stringify(runRow.rope));

  const pace = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    const p = (m, d, id) => { const r = paceOf(m, d, id || 'car-run'); return r ? r.text : null; };
    S.profile.distUnit = 'mi';
    const miles = p(50, 5);
    S.profile.distUnit = 'km';
    return {
      even: p(30, 5),
      /* 5.999… min/km. Rounding the seconds carries into the minute, and a
         pace printing 5:60 reads as a bug to anybody who runs. */
      carry: p(35.999, 6),
      odd: p(28, 5.2),
      miles,
      /* Wheels read in speed. 40 minutes over 20 km is 30 km/h, and "2:00 /km"
         is not a number a cyclist has ever used. */
      bike: p(40, 20, 'car-bike'),
      noDist: p(30, 0),
      noTime: p(0, 5)
    };
  });
  check('pace divides the minutes by the distance', pace.even === '6:00 /km', String(pace.even));
  check('...and rounding never prints :60', pace.carry === '6:00 /km', String(pace.carry));
  check('...with the seconds padded', pace.odd === '5:23 /km', String(pace.odd));
  check('...in whichever unit is set', pace.miles === '10:00 /mi', String(pace.miles));
  check('a bike reads in speed rather than pace', pace.bike === '30 km/h', String(pace.bike));
  check('nothing to divide is no pace, not a zero',
    pace.noDist === null && pace.noTime === null, JSON.stringify([pace.noDist, pace.noTime]));

  /* Typed and ticked with the real controls. Calling distTotals() directly
     would prove the arithmetic and say nothing about whether the number a
     person types reaches it. */
  const ticked = await page.evaluate(() => {
    const ex = EX['car-run'];
    S = blank(); S.onboarded = true; save(true);
    /* Two sets, and only the first is ticked. Ticking the last one completes
       the exercise, which folds the card away by design — so a one-set fixture
       reads the pace row after the app has correctly removed it. */
    S.active = { date: today(), started: Date.now(), type: 'cardio', exercises: [{
      exId: 'car-run', name: ex.name, load: 'min', targetR: 30, targetW: 80,
      sets: [{ w:'', r:'', d:'', rpe:'', done:false },
             { w:'', r:'', d:'', rpe:'', done:false }] }] };
    go('train'); renderTrain();
    const row = document.querySelector('#train-body .set-row');
    /* Shaped return on the miss rather than a throw. With the subject reverted
       there is no distance field, and `el.value =` on null kills the whole
       instrument before it prints anything — which reads as a hang, not a red.
       A probe that throws has not run. */
    const miss = why => ({ d:'(none)', w:'(none)', r:'(none)', pace:why, summary:why });
    if (!row) return miss('(no set row)');
    const set = (k, val) => {
      const el = row.querySelector('[data-set="' + k + '"]');
      if (!el) return false;
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    };
    if (!set('d', '5')) return miss('(no distance field)');
    if (!set('r', '30')) return miss('(no minutes field)');
    const tick = row.querySelector('[data-act="toggle-set"]');
    if (!tick) return miss('(no tick)');
    tick.click();
    const st = S.active.exercises[0].sets[0];
    const paceEl = document.querySelector('.pace-row[data-pace="0"]');
    return {
      d: st.d, w: st.w, r: st.r,
      /* targetW was 80. A distance row never offered it, so ticking must not
         record it — that is the reported bug with a second way in. */
      pace: paceEl ? paceEl.textContent.replace(/\s+/g, ' ').trim() : '(no pace row)',
      summary: setSummary(S.active.exercises[0])
    };
  });
  check('typing a distance and ticking records the distance', ticked.d === '5', String(ticked.d));
  check('...and records no weight, even with one prescribed',
    ticked.w === '' || ticked.w == null, JSON.stringify(ticked.w));
  check('...and the pace line names what was covered',
    /5 km/.test(ticked.pace) && /6:00 \/km/.test(ticked.pace), ticked.pace);
  check('...and the folded card reads as a run, not as 0kg',
    /5 km/.test(ticked.summary) && /6:00/.test(ticked.summary) && !/kg/.test(ticked.summary),
    ticked.summary);

  const dUnits = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    S.profile.units = 'kg'; S.profile.distUnit = 'km';
    S.sessions = [{ date: today(), ended: true, dur: 30, exercises: [
      { exId: 'car-run', name: 'Outdoor Run', load: 'min',
        sets: [{ w:'', r:30, d:10, rpe:'', done:true }] },
      { exId: 'bb-back-squat', name: 'Back Squat', load: 'wt',
        sets: [{ w:100, r:5, rpe:'', done:true }] }
    ] }];
    save(true);
    const read = () => ({
      d: S.sessions[0].exercises[0].sets[0].d,
      w: S.sessions[0].exercises[1].sets[0].w
    });
    const before = read();
    /* Distance to miles: the distance moves, the weight does not. */
    const nD = convertStoredDistances(distFactor('km', 'mi'));
    S.profile.distUnit = 'mi';
    const afterDist = read();
    /* And weight to pounds: the weight moves, the distance does not. */
    const nW = convertStoredWeights(unitFactor('kg', 'lb'));
    S.profile.units = 'lb';
    const afterW = read();

    /* An old save with no distUnit key at all. */
    S = blank(); delete S.profile.distUnit; S.profile.units = 'lb';
    const legacyLb = distUnit();
    S.profile.units = 'kg';
    const legacyKg = distUnit();
    /* Once chosen it is its own setting — kilos and miles must stay possible. */
    S.profile.distUnit = 'mi';
    const kgAndMiles = distUnit();
    return { before, afterDist, afterW, nD, nW, legacyLb, legacyKg, kgAndMiles };
  });
  check('switching distance units converts the distances',
    Math.abs(dUnits.afterDist.d - 6.21) < 0.01 && dUnits.nD === 1, JSON.stringify(dUnits.afterDist));
  check('...and leaves the weights alone', dUnits.afterDist.w === 100, String(dUnits.afterDist.w));
  check('switching weight units converts the weights',
    Math.abs(dUnits.afterW.w - 220.46) < 0.01 && dUnits.nW === 1, JSON.stringify(dUnits.afterW));
  check('...and leaves the distances alone',
    dUnits.afterW.d === dUnits.afterDist.d, JSON.stringify(dUnits.afterW));
  check('an old save in pounds reads miles', dUnits.legacyLb === 'mi', dUnits.legacyLb);
  check('...and one in kilos reads kilometres', dUnits.legacyKg === 'km', dUnits.legacyKg);
  check('...but kilos with miles is a pairing the app allows',
    dUnits.kgAndMiles === 'mi', dUnits.kgAndMiles);

  /* The regression this feature nearly shipped: putting `d` into the Enter
     order between `w` and `r` sent every barbell row looking for a field it
     does not have, found nothing, and dropped the keyboard instead of going
     to reps. */
  const enterOrder = await page.evaluate(() => {
    const walk = (id, from) => {
      const ex = EX[id];
      S = blank(); S.onboarded = true; save(true);
      S.active = { date: today(), started: Date.now(), type: 'x', exercises: [{
        exId: id, name: ex.name, load: ex.load, targetR: ex.rl, targetW: '',
        sets: [{ w:'', r:'', d:'', rpe:'', done:false }] }] };
      go('train'); renderTrain();
      const row = document.querySelector('#train-body .set-row');
      const el = row.querySelector('[data-set="' + from + '"]');
      if (!el) return '(no field ' + from + ')';
      el.focus();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      const a = document.activeElement;
      return (a && a.dataset && a.dataset.set) ? a.dataset.set : (a ? a.tagName : 'none');
    };
    return { squat: walk('bb-back-squat', 'w'), run: walk('car-run', 'd') };
  });
  check('Enter still steps weight → reps on a barbell row', enterOrder.squat === 'r', enterOrder.squat);
  check('...and distance → minutes on a run', enterOrder.run === 'r', enterOrder.run);

  // ================= 18. how long you actually trained ==================
  console.log('\nthe session clock\n');

  /* Reported with a screenshot reading 596 min for a push day. `dur` was wall
     clock from creating the session to tapping Finish, so a session started in
     the morning and closed after work logged the whole day as training. */
  const sessClock = await page.evaluate(() => {
    const start = () => {
      S = blank(); S.onboarded = true; save(true);
      const e = EX['bb-bench'] || EX['bb-back-squat'];
      S.active = { id: 'sx1', date: today(), type: 'full', env: 'full', rung: 'full',
        backdated: false, started: Date.now(), ended: null, dur: 0,
        activeMs: 0, tickAt: Date.now(), paused: false,
        exercises: [{ exId: e.id, name: e.name, load: e.load, targetW: 60, targetR: 8,
          sets: [{ w: 60, r: 8, rpe: '', done: false }] }] };
      noteInteraction();
    };

    /* The pump is driven by hand rather than by waiting ten real minutes —
       what is being tested is the arithmetic and the conditions, not
       setInterval. Stepped in slices no larger than the cap, because the real
       pump fires every five seconds and a single two-minute slice is a thing
       that only happens in a fixture. `advanceRaw` is the one that hands it a
       single enormous slice, which is what the cap exists for. */
    const advanceRaw = (ms) => { S.active.tickAt = Date.now() - ms; pumpSessionClock(); };
    const advance = (ms) => {
      let left = ms;
      while (left > 0) { const step = Math.min(left, 30000); advanceRaw(step); left -= step; }
    };

    start();
    advance(60000);
    const oneMin = sessionActiveMins();

    /* The reported bug: the phone goes in a pocket for nine hours. Nothing
       should be counted for any of it. */
    start();
    advance(60000);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    advance(9 * 3600 * 1000);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    const hidden = sessionActiveMins();

    /* Visible, but untouched for hours — the app left open on a counter. */
    start();
    advance(60000);
    lastInteraction = Date.now() - 40 * 60 * 1000;
    advance(3 * 3600 * 1000);
    const idle = sessionActiveMins();

    /* Rest between heavy sets IS training, even with nothing being touched. */
    start();
    lastInteraction = Date.now() - 40 * 60 * 1000;
    const bar = document.getElementById('rest-bar');
    bar.classList.add('on');
    advance(120000);
    const resting = sessionActiveMins();
    bar.classList.remove('on');

    /* Paused by hand. */
    start();
    advance(60000);
    const pausedNow = toggleSessionPause();
    advance(30 * 60 * 1000);
    const whilePaused = sessionActiveMins();
    toggleSessionPause();
    advance(60000);
    const afterResume = sessionActiveMins();

    /* A single slice is capped, in case an interval is throttled or the device
       sleeps without ever firing visibilitychange. */
    start();
    advanceRaw(6 * 3600 * 1000);
    const capped = sessionActiveMins();

    return { oneMin, hidden, idle, resting, pausedNow, whilePaused, afterResume, capped };
  });
  check('a minute in the session is a minute on the clock', sessClock.oneMin === 1, String(sessClock.oneMin));
  /* The reported bug, as a check. */
  check('nine hours with the phone away adds nothing', sessClock.hidden === 1, String(sessClock.hidden));
  check('...and neither does the app left open and untouched', sessClock.idle === 1, String(sessClock.idle));
  check('but resting between sets counts', sessClock.resting === 2, String(sessClock.resting));
  check('the clock can be paused by hand', sessClock.pausedNow === true);
  check('...and nothing accrues while it is', sessClock.whilePaused === 1, String(sessClock.whilePaused));
  check('...and it picks up again on resume', sessClock.afterResume === 2, String(sessClock.afterResume));
  check('one slice is capped, so a sleeping device cannot dump hours in',
    sessClock.capped === 1, String(sessClock.capped));

  /* Through the real Finish button, so what is stored is what a person gets. */
  const finished = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    const e = EX['bb-bench'] || EX['bb-back-squat'];
    S.active = { id: 'sx2', date: today(), type: 'full', env: 'full', rung: 'full',
      backdated: false, started: Date.now() - 9 * 3600 * 1000, ended: null, dur: 0,
      activeMs: 47 * 60 * 1000, tickAt: Date.now(), paused: false,
      exercises: [{ exId: e.id, name: e.name, load: e.load, targetW: 60, targetR: 8,
        sets: [{ w: 60, r: 8, rpe: '', done: true }] }] };
    go('train'); renderTrain();
    const clockEl = document.getElementById('tp-time');
    const shown = clockEl ? clockEl.textContent.trim() : '(none)';
    finishSession();
    const s = S.sessions[S.sessions.length - 1];
    return { shown, dur: s ? s.dur : -1, started: s ? s.started : 0, ended: s ? s.ended : 0 };
  });
  check('the Train screen shows the time you were in it', finished.shown === '47 min', finished.shown);
  /* Nine hours between opening the session and finishing it; forty-seven
     minutes of actually being in it. The stored figure is the second one. */
  check('...and that is what gets stored, not the wall clock',
    finished.dur === 47, String(finished.dur));
  check('...while the real start and end are still recorded',
    finished.ended - finished.started > 8 * 3600 * 1000,
    String(Math.round((finished.ended - finished.started) / 3600000)) + 'h');

  /* The sessions already in the store carry the old wall-clock numbers. */
  const repaired = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    const e = EX['bb-bench'] || EX['bb-back-squat'];
    const mk = (id, dur) => ({ id, date: today(), ended: Date.now(), dur, type: 'full',
      exercises: [{ exId: e.id, name: e.name, load: e.load,
        sets: [{ w: 60, r: 8, done: true }, { w: 60, r: 8, done: true },
               { w: 60, r: 8, done: true }] }] });
    S.sessions = [mk('a', 596), mk('b', 52), mk('c', 1440)];
    delete S.meta.durFixed;
    save(true);
    const n = repairSessionDurations();
    const after = S.sessions.map(s => s.dur);
    /* Once, and only once. A repair that runs every boot will eventually
       rewrite something real. */
    S.sessions[1].dur = 999;
    const again = repairSessionDurations();
    return { n, after, again, stillThere: S.sessions[1].dur,
             kept: S.sessions[0].durWas };
  });
  check('an impossible duration already in the store is repaired',
    repaired.n === 2, String(repaired.n));
  check('...to something the work could actually have taken',
    repaired.after[0] > 0 && repaired.after[0] < 240 && repaired.after[2] < 240,
    JSON.stringify(repaired.after));
  check('...leaving a plausible one alone', repaired.after[1] === 52, String(repaired.after[1]));
  check('...keeping what it was, rather than quietly losing it',
    repaired.kept === 596, String(repaired.kept));
  check('...and it never runs twice', repaired.again === 0 && repaired.stillThere === 999,
    `${repaired.again} / ${repaired.stillThere}`);

  // ================= 19. starting, and holding ==========================
  console.log('\nstarting a session, and running a hold\n');

  /* Reported as "still no start workout button in the train menu". There was
     one — until the day was discharged, at which point it became the first of
     three indistinguishable list rows. */
  const startBtn = await page.evaluate(() => {
    const look = () => {
      go('train'); renderTrain();
      const b = document.getElementById('train-body');
      const btns = [...b.querySelectorAll('button.btn.primary[data-act="start-session"]')];
      return { n: btns.length, label: btns.length ? btns[0].textContent.trim() : '' };
    };
    S = blank(); S.onboarded = true; save(true);
    const ready = look();

    /* Now with the day already done. */
    const e = EX['bb-bench'] || EX['bb-back-squat'];
    S.sessions = [{ id: 'd1', date: today(), ended: Date.now(), dur: 45, kcal: 300,
      type: 'push', rung: 'full',
      exercises: [{ exId: e.id, name: e.name, load: e.load,
        sets: [{ w: 60, r: 8, done: true }] }] }];
    S.week.plan[today()] = { type: 'push', done: true };
    save(true);
    const done = look();
    return { ready, done };
  });
  check('Train offers a start button before you have trained',
    startBtn.ready.n === 1, JSON.stringify(startBtn.ready));
  /* The day being done is not a reason to hide the one thing this screen is for. */
  check('...and still offers one after the day is done',
    startBtn.done.n === 1 && /start/i.test(startBtn.done.label),
    JSON.stringify(startBtn.done));

  /* Asked for: a start button on a timed movement that counts down, rather
     than a box to type seconds into afterwards. */
  const hold = await page.evaluate(() => {
    const ex = EX['mob-childs-pose'] || EX['bw-plank'];
    S = blank(); S.onboarded = true;
    S.active = { id: 'sx', date: today(), type: 'recovery', env: 'bw', rung: 'full',
      started: Date.now(), ended: null, dur: 0, activeMs: 0, tickAt: Date.now(), paused: false,
      exercises: [{ exId: ex.id, name: ex.name, load: 'time', targetW: null, targetR: 40,
        sets: [{ w: '', r: '', rpe: '', done: false }, { w: '', r: '', rpe: '', done: false }] }] };
    save(true); go('train'); renderTrain();

    const runners = [...document.querySelectorAll('#train-body [data-act="set-timer"]')];
    if (!runners.length) return { found: false };
    const label = runners[0].textContent.trim();
    runners[0].click();

    const bar = document.getElementById('rest-bar');
    const counting = bar.classList.contains('on') && bar.classList.contains('work');
    const shown = (document.getElementById('rest-label') || {}).textContent || '';
    /* Ticked by the timer *finishing*, never by starting it — stopping halfway
       must not record a hold you did not do. */
    const doneOnStart = S.active.exercises[0].sets[0].done;

    /* Let it finish the way it really does. */
    const st = S.active.exercises[0].sets[0];
    st.r = 40; st.done = true;
    renderTrain();
    const runnersAfter = [...document.querySelectorAll('#train-body [data-act="set-timer"]')].length;

    return { found: true, label, counting, shown, doneOnStart, runners: runners.length,
             runnersAfter, recorded: st.r };
  });
  check('a timed movement offers a button that runs it', hold.found === true);
  check('...one per set that is still to do', hold.runners === 2, String(hold.runners));
  check('...labelled with the length', /40s/.test(hold.label || ''), hold.label);
  check('...and it starts a countdown rather than a rest',
    hold.counting === true && /child|plank/i.test(hold.shown || ''), hold.shown);
  /* The property that matters: starting is not doing. */
  check('...which does not tick the set just for being started',
    hold.doneOnStart === false);
  check('...and a set already done offers no button', hold.runnersAfter === 1,
    String(hold.runnersAfter));

  /* ---- age ----
     Asked in onboarding now rather than behind the Fuel switch, and it has to
     do something or it should not be asked. Two things, and precisely two: a
     floor under protein, and a word about spacing hard sessions. The check
     that matters most is the negative one — that it does NOT touch readiness,
     the rung ladder or a rep range, because that is where an app that knew
     your age would be tempted to invent something. */
  console.log('\nage\n');
  /* The published floors, not the app's numbers — the point is to compare. */
  const AGE_FLOOR = { '30': 1.6, '56': 1.7, '71': 1.8 };

  const age = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.profile.bodyweight = [{ d: today(), w: 70 }];
    save(true);
    const bands = {};
    [null, 1996, 1970, 1955].forEach(y => {
      S.profile.birthYear = y; save(true);
      bands[y === null ? 'none' : String(new Date().getFullYear() - y)] =
        { k: ageBand().k, p: ageBand().protein, gap: recoveryGapHours() };
    });
    /* The protein target is not adjusted for age, because it never needed to
       be: it already lands above the highest age-adjusted guideline. That is
       the guarantee worth holding — if the protein model is ever lowered, this
       is what says it has dropped under the older-adult floor. */
    S.profile.bodyweight = [{ d: today(), w: 70 }];
    S.nutrition.targets = {}; save(true);
    const perKg = {};
    [1996, 1970, 1955].forEach(y => {
      S.profile.birthYear = y; save(true);
      perKg[String(new Date().getFullYear() - y)] = proteinTarget() / 70;
    });
    /* And nothing else moved. Same readiness, same suggested rung, same rep
       range, at 31 and at 71. */
    const probe = () => {
      const r = { sleepH: 6, sleepQ: 3, energy: 3, sore: 3, stress: 3 };
      return [readinessScore(r), suggestRung(readinessScore(r), 60),
              JSON.stringify(EX['bb-back-squat'])].join('|');
    };
    S.profile.birthYear = 1996; save(true);
    const atYoung = probe();
    S.profile.birthYear = 1955; save(true);
    const atOld = probe();
    return { bands, perKg, untouched: atYoung === atOld };
  });
  check('age lands in a band, and no age lands in the youngest',
    age.bands.none.k === 'young' && age.bands['30'].k === 'young'
    && age.bands['56'].k === 'mid' && age.bands['71'].k === 'older',
    JSON.stringify(age.bands));
  check('...and only the older bands say anything about spacing',
    age.bands.none.gap === 0 && age.bands['30'].gap === 0
    && age.bands['56'].gap === 48 && age.bands['71'].gap === 48,
    JSON.stringify(age.bands));
  check('the protein target already clears every age-adjusted floor',
    Object.keys(age.perKg).every(k => age.perKg[k] >= (AGE_FLOOR[k] || 1.6)),
    JSON.stringify(age.perKg));
  check('age changes nothing it has no evidence for', age.untouched === true);

  /* Clearing the floor and being *raised* by it are different claims, and the
     check above only ever made the first. It passed for years because the
     model handed 1.9 g/kg to everybody — the default goals include "build
     muscle", so the age band never had to do anything. The moment the base
     became goal-dependent, an older lifter who did not tick that box dropped
     to a twenty-year-old's 1.6, which is precisely what the age screen
     promises will not happen. Probed without the muscle goal, or the floor is
     invisible again. */
  const floor = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.settings.nutrition = true;
    S.profile.heightCm = 176; S.profile.sex = 'm'; S.profile.activity = 'light';
    S.profile.bodyweight = [{ d: today(), w: 70 }];
    const at = (y, goals) => {
      S.profile.birthYear = y; S.profile.goals = goals;
      S.nutrition.targets = {}; save(true);
      return +(proteinTarget() / bodyKg()).toFixed(2);
    };
    return { young: at(1996, ['health']), mid: at(1970, ['health']), old: at(1955, ['health']),
             oldMuscle: at(1955, ['health', 'muscle']) };
  });
  check('the age floor actually raises the target, not just clears it',
    floor.old > floor.young, `${floor.young} → ${floor.old} g/kg`);
  check('...at every band the app defines',
    floor.young === 1.6 && floor.mid === 1.7 && floor.old === 1.8,
    JSON.stringify(floor));
  check('...and a goal that asks for more still wins',
    floor.oldMuscle === 1.9, String(floor.oldMuscle));

  /* ---- the age you gave survives the question after it ----
     The age step sits in the "You" chapter and is asked of everyone, but
     ob-finish wrote birthYear inside the Fuel branch — where it used to belong,
     back when height, age and sex were all collected on the measure screen.
     So answering it and then declining Fuel deleted it, silently, along with
     the band and the back-to-back notice that screen had just promised. */
  const kept = await page.evaluate(() => {
    const run = (fuel) => {
      S = blank(); S.onboarded = false;
      obDraft = { ...OB_DEFAULT, gear: { ...GEAR_ALL }, seedOverrides: {}, seedExact: {} };
      obDraft.birthYear = 1955; obDraft.bodyweight = 80; obDraft.nutrition = fuel;
      let btn = document.getElementById('zz-fin');
      if (!btn) {
        document.body.insertAdjacentHTML('beforeend',
          '<button id="zz-fin" data-act="ob-finish"></button>');
        btn = document.getElementById('zz-fin');
      }
      btn.click();
      return { year: S.profile.birthYear || null, age: ageYears(), gap: recoveryGapHours() };
    };
    return { on: run(true), off: run(false) };
  });
  check('the age you gave is kept whether or not you turn Fuel on',
    kept.on.year === 1955 && kept.off.year === 1955,
    `fuel on ${kept.on.year}, fuel off ${kept.off.year}`);
  check('...so the spacing it promises can still fire',
    kept.off.gap === 48, `${kept.off.age} years old, gap ${kept.off.gap}`);

  /* ---- losing fat is a goal you can pick, and it does something ----
     It was not on the list at all, which for the single most common reason
     anyone installs a training app is a strange omission — and energyTargets()
     had been testing for a 'lean' key since before the option existed, so the
     -400 kcal branch was unreachable code waiting for a goal nobody could
     choose. */
  console.log('\nlosing fat\n');
  const cut = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.settings.nutrition = true;
    /* Age included, or bmr() returns null, tdee() with it, and the whole thing
       silently falls back to bodyweight × 33 — which still moves by 400 and
       would let this pass while testing the estimate rather than the model. */
    S.profile.heightCm = 178; S.profile.sex = 'm'; S.profile.activity = 'light';
    S.profile.birthYear = 1990;
    S.profile.bodyweight = [{ d: today(), w: 82 }];
    const at = (goals) => {
      S.profile.goals = goals; S.nutrition.targets = {}; save(true);
      const e = energyTargets();
      return { kcal: e.kcal, perKg: +(e.p / bodyKg()).toFixed(2), maint: e.maint, bmr: e.bmr };
    };
    const base = at(['health']);
    const lean = at(['lean']);
    const both = at(['lean', 'muscle']);
    const bulk = at(['muscle']);
    /* Where a flat deficit goes somewhere it should not: maintenance close
       enough to the resting rate that taking 400 off it lands underneath.

       The window is narrow and has to be aimed at. With the lowest activity
       factor the app has (1.25), a deficit only breaks the resting rate when
       BMR × 0.25 < 400, i.e. under 1600 — and the flat 1200 floor already
       covers everything below 1200. So the case lives between the two, and
       the first fixture written here (48 kg, 152 cm, 76) had a resting rate of
       about 890 and never reached it: the check passed with the floor removed,
       which is the only reason it was found. */
    S.profile.heightCm = 165; S.profile.sex = 'f'; S.profile.activity = 'desk';
    S.profile.bodyweight = [{ d: today(), w: 60 }];
    S.profile.birthYear = new Date().getFullYear() - 45;
    const small = at(['lean']);
    return { base, lean, both, bulk, small };
  });
  check('fat loss is a goal, and it takes calories off maintenance',
    cut.lean.kcal < cut.base.kcal && cut.base.kcal === cut.lean.maint,
    `${cut.base.kcal} → ${cut.lean.kcal} (maintenance ${cut.lean.maint})`);
  check('...with protein raised into the range that holds lean mass',
    cut.lean.perKg >= 1.8 && cut.lean.perKg <= 2.7, `${cut.lean.perKg} g/kg`);
  check('...well clear of what the same person gets for maintenance',
    cut.lean.perKg > cut.base.perKg, `${cut.base.perKg} → ${cut.lean.perKg}`);
  /* Both at once is a contradiction, not an average: a surplus and a deficit
     are opposite answers to one question, and quietly splitting the difference
     gives somebody a number that serves neither goal while looking deliberate. */
  check('...and asking to bulk and cut at once resolves to cutting',
    cut.both.kcal === cut.lean.kcal && cut.bulk.kcal > cut.base.kcal,
    `both ${cut.both.kcal}, cut ${cut.lean.kcal}, bulk ${cut.bulk.kcal}`);
  check('a deficit never lands under the resting rate',
    cut.small.kcal >= cut.small.bmr && cut.small.bmr > 0,
    `${cut.small.kcal} kcal against a resting rate of ${cut.small.bmr}`);

  /* ---- the goals screen's promises, against what the code does ----
     It claimed to set "rep ranges, accessory volume, and how the app talks to
     you" and set none of the three: goals reached exactly one line of
     nutrition arithmetic, and only through the 'muscle' key. 'strength',
     'health' and 'consist' were read by nothing at all. */
  const goalFx = await page.evaluate(() => {
    const gen = (goals, rung, mins) => {
      S = blank(); S.onboarded = true; S.profile.goals = goals; save(true);
      const s = generateSession('full', 'full', rung, mins);
      const main = s.exercises.filter(i => EX[i.exId] && EX[i.exId].tier <= 1);
      return { mv: s.exercises.length,
               sets: s.exercises.reduce((a, i) => a + i.sets.length, 0),
               mainSets: main.reduce((a, i) => a + i.sets.length, 0) };
    };
    const out = {};
    [['full', 60], ['full', 75], ['full', 45], ['trim', 35], ['short', 20]].forEach(([r, m]) => {
      out[r + m] = { without: gen(['health'], r, m), with: gen(['health', 'muscle'], r, m) };
    });
    /* And the rest length the Get stronger option names in its own copy. */
    const rest = (goals) => {
      S = blank(); S.onboarded = false;
      obDraft = { ...OB_DEFAULT, gear: { ...GEAR_ALL }, seedOverrides: {}, seedExact: {} };
      obDraft.goals = goals; obDraft.bodyweight = 80;
      let b = document.getElementById('zz-fin2');
      if (!b) {
        document.body.insertAdjacentHTML('beforeend', '<button id="zz-fin2" data-act="ob-finish"></button>');
        b = document.getElementById('zz-fin2');
      }
      b.click();
      return S.settings.restMain;
    };
    return { out, restStrength: rest(['strength']), restBoth: rest(['strength', 'muscle']),
             restNeither: rest(['health']) };
  });
  const rows = Object.values(goalFx.out);
  /* Strictly additive is the whole point. The first implementation inflated
     the slots on the way in, which under a real budget dropped a later
     movement whole — 8 movements and 20 sets became 7 and 19. Gaining one set
     by losing three is not more accessory work, and a check that only asked
     "did the sets go up" would have called it a pass. */
  check('the size goal never costs a movement',
    rows.every(r => r.with.mv === r.without.mv),
    rows.map(r => `${r.without.mv}→${r.with.mv}`).join(' '));
  check('...never a set',
    rows.every(r => r.with.sets >= r.without.sets),
    rows.map(r => `${r.without.sets}→${r.with.sets}`).join(' '));
  check('...and never adds one to a main lift',
    rows.every(r => r.with.mainSets === r.without.mainSets),
    rows.map(r => `${r.without.mainSets}→${r.with.mainSets}`).join(' '));
  check('...but does add accessory work where the day has room',
    rows.some(r => r.with.sets > r.without.sets),
    rows.map(r => `${r.without.sets}→${r.with.sets}`).join(' '));
  check('asking to get stronger buys longer rests on the main lifts',
    goalFx.restStrength > goalFx.restNeither,
    `${goalFx.restNeither}s → ${goalFx.restStrength}s`);
  check('...and asking for both leaves it in the middle',
    goalFx.restBoth === goalFx.restNeither,
    `${goalFx.restBoth}s`);

  /* ---- a session finished by mistake can be picked back up ----
     Reported: finish was tapped one movement early and there was no way back
     in. The session was not merely closed — finishSession() filters out every
     movement with nothing ticked, so the rest of the workout was deleted, and
     "reopen" would have handed back a session with one exercise in it.

     So the undo is captured before the finish starts taking things apart, and
     what it restores is the whole session. */
  console.log('\nfinishing by mistake\n');
  const reopen = await page.evaluate(() => {
    const fresh = () => {
      S = blank(); S.onboarded = true; save(true); buildWeekPlan(true);
      /* A planned day, so the un-marking path is exercised rather than skipped
         because today happened to be a rest day in the generated week. */
      S.week.plan[today()] = { type: 'full', done: false };
      S.week.days[today()] = { avail: 'long', env: 'full' };
      save(true);
      startSession('full', 'full', 60);
      return S.active;
    };
    const out = {};

    let A = fresh();
    out.total = A.exercises.length;
    A.exercises[0].sets.forEach(s => { s.done = true; s.w = 100; s.r = 5; });
    const liftBefore = JSON.stringify(S.lifts[A.exercises[0].exId] || null);
    finishSession();
    out.keptOnFinish = S.sessions[0].exercises.length;
    out.dayDoneOnFinish = !!(S.week.plan[today()] || {}).done;
    out.progressed = JSON.stringify(S.lifts[A.exercises[0].exId] || null) !== liftBefore;
    out.offered = canReopen();
    out.reopened = reopenSession();
    out.restored = S.active ? S.active.exercises.length : 0;
    out.ticksKept = S.active ? S.active.exercises[0].sets.filter(s => s.done).length : 0;
    out.logged = S.sessions.length;
    out.dayDoneAfter = !!(S.week.plan[today()] || {}).done;
    out.liftBack = JSON.stringify(S.lifts[A.exercises[0].exId] || null) === liftBefore;
    out.twice = canReopen();
    /* And finishing again works, so the way back is not a one-way door.
       Guarded, because a reopen that hands back fewer movements than it should
       leaves exercises[1] undefined — and a check that throws has not run: the
       instrument died before printing anything, which reads as a hang rather
       than as the red it was supposed to be. */
    const second = S.active && S.active.exercises[1];
    if (second) second.sets.forEach(s => { s.done = true; s.w = 60; s.r = 8; });
    if (S.active) finishSession();
    out.refinished = S.sessions.length;
    out.refinishedExercises = (S.sessions[0] || { exercises: [] }).exercises.length;

    /* Refused once something else has been logged on top: progression
       compounds, and restoring the lifts under this one would silently undo
       the later session's gains too. */
    A = fresh();
    A.exercises[0].sets.forEach(s => { s.done = true; s.w = 100; s.r = 5; });
    finishSession();
    S.active = null;
    startSession('full', 'full', 60);
    S.active.exercises[0].sets.forEach(s => { s.done = true; s.w = 100; s.r = 5; });
    finishSession();
    /* lastFinish now names the second session, so the first is unreachable —
       which is the correct answer, not a bug. */
    const secondId = S.sessions[S.sessions.length - 1].id;
    out.onlyTheLast = S.lastFinish.id === secondId;

    /* And refused tomorrow. */
    A = fresh();
    A.exercises[0].sets.forEach(s => { s.done = true; s.w = 100; s.r = 5; });
    finishSession();
    S.lastFinish.date = dk(addDays(fromKey(today()), -1));
    S.sessions[S.sessions.length - 1].date = S.lastFinish.date;
    out.staleRefused = !canReopen();
    return out;
  });

  check('finishing early deletes the movements you had not started',
    reopen.keptOnFinish === 1 && reopen.total > 1,
    `${reopen.total} movements, ${reopen.keptOnFinish} logged`);
  check('...and the session can be picked back up', reopen.offered && reopen.reopened);
  /* The whole point. Handing back the one movement that had a tick in it would
     be technically a reopen and useless — the rest of the workout is what you
     went back for. */
  check('...with every movement it started with, not just the ticked ones',
    reopen.restored === reopen.total, `${reopen.restored} of ${reopen.total}`);
  check('...keeping the work already logged in it', reopen.ticksKept > 0,
    String(reopen.ticksKept));
  check('...taking it back out of the log', reopen.logged === 0, String(reopen.logged));
  check('...and off the week', reopen.dayDoneOnFinish === true && reopen.dayDoneAfter === false,
    `${reopen.dayDoneOnFinish} → ${reopen.dayDoneAfter}`);
  /* applyProgression runs on finish and writes to S.lifts. Reopening without
     unwinding it would leave the session's gains banked twice once it is
     finished for real. */
  check('...with the progression it banked unwound',
    reopen.progressed === true && reopen.liftBack === true,
    `applied ${reopen.progressed}, restored ${reopen.liftBack}`);
  check('...once, not repeatedly', reopen.twice === false);
  check('...and it can be finished again for real',
    reopen.refinished === 1 && reopen.refinishedExercises === 2,
    `${reopen.refinished} logged, ${reopen.refinishedExercises} movements`);
  check('only the last session is reopenable', reopen.onlyTheLast === true);
  check('...and not once it is no longer today', reopen.staleRefused === true);

  /* Said, never done. A week rebuilt around a number given for the energy
     equation is not something anyone asked for, and the functional recovery
     evidence is not strong enough to spend someone's Tuesday on. */
  /* Pinned to a Monday, and that is the bug fix rather than the setup.

     This fixture seeds only the days from today forward — a warning about two
     hard days touching has nothing to say about days already behind you — so
     how many days it seeds depends on where in the week it is run. Seven on a
     Monday, one on a Sunday, and one day cannot be two days in a row. The
     check ran green Monday to Saturday and went red on Sunday, which is what
     it did: the app was right and the fixture could not build the situation it
     was asking about.

     Third date-fragile probe in this project and the same fix as the other
     two — pinning today() pins weekStart() with it, because there is one
     clock. Verified by running it on all seven weekdays. */
  const gap = await page.evaluate(() => {
    const realToday = today;
    try {
      today = () => '2026-03-09';                 // a Monday
      S = blank(); S.onboarded = true; S.profile.birthYear = 1955;
      save(true); buildWeekPlan(true);
      const st = weekStart();
      let seeded = 0;
      for (let i = 0; i < 7; i++) {
        const k = dk(addDays(st, i));
        if (daysBetween(k, today()) > 0) continue;
        S.week.plan[k] = { type: 'full', done: false };
        S.week.days[k] = { avail: 'long', env: 'full' };
        seeded++;
      }
      save(true);
      const before = JSON.stringify(S.week.plan);
      const hit = backToBackHard();
      go('plan');
      const notice = !!document.querySelector('#plan-body .wk-gap');
      const after = JSON.stringify(S.week.plan);
      S.profile.birthYear = 1996; save(true);
      go('plan');
      const young = !!document.querySelector('#plan-body .wk-gap');
      return { hit: !!hit, notice, young, unchanged: before === after, seeded };
    } finally { today = realToday; }
  });
  /* Asserted, because the whole failure was a fixture that quietly built a
     smaller situation than the one it was checking. */
  check('...with a whole week of hard days to notice it in',
    gap.seeded === 7, `${gap.seeded} days seeded`);
  check('two hard days touching is noticed', gap.hit && gap.notice === true);
  check('...and nothing is moved for it', gap.unchanged === true);
  check('...and it is silent for someone the evidence does not cover',
    gap.young === false);

  /* ---- a marker is something you have, not something you were given ----
     milestonesReached() read the stored flags alone, which made three things
     possible and the third permanent: a session logged by any path that does
     not call checkMilestones() leaves the flag unset and the ascent says
     "nothing behind you yet" over a stats row reading fourteen; a restore
     brings the sessions and not the flags; and a milestone ADDED in a later
     release is unreachable by everyone who already passed it, because the
     recorder only ever looks forward. Every milestone already carries a test
     against journeyStats(), so asking it is the whole fix. */
  console.log('\nthe journey\n');

  const marks = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    const mk = () => ({ exId: 'bb-bench', name: 'Bench', load: 'wt', targetR: 5,
      sets: [{ w: 60, r: 5, done: true }] });
    /* Sessions pushed the way a restore or an import would: history and no
       flags anywhere. */
    for (let i = 1; i <= 12; i++) {
      S.sessions.push({ id: 'j' + i, date: dk(addDays(fromKey(today()), -i * 2)),
        type: 'full', ended: Date.now(), dur: 40, exercises: [mk()] });
    }
    S.journey = { reached: {} };
    save(true);
    const derived = milestonesReached().map(m => m.k);
    const nxt = nextMilestone();
    /* And a milestone recorded the moment it happened still says when. */
    S.journey.reached.first = dk(addDays(fromKey(today()), -24));
    save(true);
    const dated = milestonesReached().find(m => m.k === 'first');
    /* The ascent must not list one both behind you and ahead of you. */
    go('progress');
    const names = [...document.querySelectorAll('#progress-body .asc-t, #progress-body .asc-summit-t')]
      .map(e => e.textContent.trim());
    const dupes = names.filter((n, i2) => names.indexOf(n) !== i2);
    /* A derived marker has no date, and printing one anyway gave four of them
       "Today" — all claiming to have landed this morning. */
    /* Scoped to the rows behind you. .asc-when is also how the next marker
       prints its progress ("12/25"), which is a different thing wearing the
       same class. */
    const whens = [...document.querySelectorAll('#progress-body .asc-row.done .asc-when')]
      .map(e => e.textContent.trim());
    return { derived, next: nxt && nxt.k, dated: dated && dated.on, dupes, whens, names };
  });
  check('a marker is reached because you passed it, not because it was recorded',
    marks.derived.includes('first') && marks.derived.includes('s5') && marks.derived.includes('s10'),
    marks.derived.join(', '));
  check('...and the next one is the first you have not', marks.next === 's25', String(marks.next));
  check('...while one recorded as it happened still says when',
    !!marks.dated, String(marks.dated));
  check('no marker is both behind you and ahead of you', marks.dupes.length === 0,
    marks.dupes.join(', '));
  check('...and a marker with no date claims none',
    marks.whens.length === 1, marks.whens.join(', '));

  /* Day one is the earlier of when the app was opened and when you first
     trained — they differ after a restore, an import, or a backdated session,
     and a journey starting after its own first session is a bug in the
     simplest number on the screen. */
  const dayOne = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    S.meta.created = Date.now();
    save(true);
    const fresh = journeyDay();
    S.sessions.push({ id: 'old', date: dk(addDays(fromKey(today()), -40)), type: 'full',
      ended: Date.now(), dur: 40, exercises: [] });
    save(true);
    return { fresh, restored: journeyDay() };
  });
  check('a new profile is on day one', dayOne.fresh === 1, String(dayOne.fresh));
  check('...and a restored history starts the journey where it started',
    dayOne.restored === 41, String(dayOne.restored));

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
