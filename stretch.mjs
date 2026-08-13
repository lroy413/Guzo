/* stretch.mjs — the daily stretch: what it chooses, why, and what it refuses.

   This is the second thing in the app that proposes rather than records, and
   the bar is the one the meal suggestions set: a wrong suggestion is not a
   cosmetic bug. The checks that matter most are the refusals — a movement your
   injuries excluded, or one that needs a pull-up bar in a hotel room, is the
   whole feature failing.

   Run: node stretch.mjs */

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
  /* Served with its real type. Handing the worker back as text/html registers
     nothing and logs a MIME error, which then fails the console check for a
     reason that has nothing to do with stretching. */
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
const page = await (await browser.newContext()).newPage();
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

try {
  await page.goto(origin + '/', { waitUntil: 'load' });

  // ================= 1. the pool it draws from =========================
  console.log('what it will and will not offer\n');

  const pool = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    const ids = () => stretchPool().map(x => x.id);

    S.profile.gear.bands = false;
    const noBands = ids();
    S.profile.gear.bands = true;
    const withBands = ids();

    /* A sore shoulder must not be handed a shoulder exercise its own injury
       setting removed from the rest of the app. */
    S.profile.injuries = ['shoulder'];
    const hurtShoulder = ids();
    S.profile.injuries = [];

    /* Everything derived in here. EX only exists in the page — a check that
       reaches for it from Node throws, and this one did the moment the first
       clause stopped short-circuiting, which killed the instrument rather than
       failing it. */
    return {
      n: noBands.length,
      nWithBands: withBands.length,
      nHurt: hurtShoulder.length,
      needsKit: noBands.filter(id => EX[id].env.indexOf('b') < 0),
      allMobility: noBands.every(id => EX[id].pattern === 'mobility'),
      bandWithout: noBands.filter(id => EX[id].eq === 'Band'),
      bandWith: withBands.filter(id => EX[id].eq === 'Band'),
      /* Which shoulder-loading stretches the injury actually took out. */
      removedByInjury: noBands.filter(id => hurtShoulder.indexOf(id) < 0),
      /* The catalogue has mobility movements that need a bar or a roller —
         if it did not, "the pool excludes them" would be true of nothing. */
      kitInCatalogue: EXLIST.filter(x => x.pattern === 'mobility' && x.env.indexOf('b') < 0).map(x => x.id)
    };
  });
  check('everything offered is a mobility movement', pool.allMobility === true);
  check('...and there are enough of them to choose between', pool.n >= 20, String(pool.n));
  /* The guard: a pool that excludes nothing has not excluded anything. */
  check('the catalogue does contain mobility work that needs equipment',
    pool.kitInCatalogue.length > 0, pool.kitInCatalogue.join(', '));
  check('...and none of it is offered as a daily stretch',
    pool.needsKit.length === 0, pool.needsKit.join(', '));
  check('a band movement appears only if you own bands',
    pool.bandWithout.length === 0 && pool.bandWith.length > 0,
    `without ${pool.bandWithout.join()} / with ${pool.bandWith.join()}`);
  /* The one that matters most: the tool for a sore shoulder must not be the
     one thing in the app that ignores a sore shoulder. */
  check('an injury still removes stretches here',
    pool.removedByInjury.length > 0, pool.removedByInjury.join(', '));

  // ================= 2. what it chooses, and why =======================
  console.log('\nwhat it chooses\n');

  const chose = await page.evaluate(() => {
    const seed = (opts) => {
      S = blank(); S.onboarded = true;
      S.profile.bodyweight = [{ d: today(), w: 82 }];
      const sq = EX['bb-back-squat'];
      S.sessions = (opts.trained === false) ? [] : [{
        id: 's1', date: today(), ended: Date.now(), dur: 50, kcal: 340, type: 'full',
        exercises: [{ exId: 'bb-back-squat', name: sq.name, load: sq.load,
          sets: [{ w: 100, r: 5, done: true }, { w: 100, r: 5, done: true },
                 { w: 100, r: 5, done: true }, { w: 100, r: 5, done: true },
                 { w: 100, r: 5, done: true }, { w: 100, r: 5, done: true }] }] }];
      S.stretch = { onboarded: true, occupation: opts.occ || null,
                    areas: opts.areas || [], done: {}, mins: opts.mins || 8 };
      save(true);
    };

    seed({ occ: 'desk', areas: [], mins: 8 });
    const desk = dailyStretch();

    seed({ occ: null, areas: [], trained: false, mins: 8 });
    const nothing = dailyStretch();

    seed({ occ: null, areas: ['ankle'], mins: 8 });
    const ankle = dailyStretch();

    seed({ occ: 'desk', areas: [], mins: 8 });
    const short = dailyStretch();
    seed({ occ: 'desk', areas: [], mins: 15 });
    const long = dailyStretch();

    seed({ occ: 'desk', areas: [], mins: 8 });
    const a = dailyStretch().map(s => s.ex.id);
    const b = dailyStretch().map(s => s.ex.id);

    const regionsOf = l => [...new Set(l.map(s => stretchRegion(s.ex)))];
    const info = l => ({
      ids: l.map(s => s.ex.id),
      names: l.map(s => s.ex.name),
      why: l.map(s => s.why),
      regions: regionsOf(l),
      mins: Math.round(stretchSeconds(l) / 60 * 10) / 10,
      n: l.length
    });
    return { desk: info(desk), nothing: info(nothing), ankle: info(ankle),
             short: info(short), long: info(long), stable: a.join() === b.join() };
  });

  check('a stretch comes out with movements in it', chose.desk.n >= 4, String(chose.desk.n));
  /* Eight movements that are all hip openers is a hip opener done eight times. */
  check('...spread across the body rather than piled on one region',
    chose.desk.regions.length >= 3, chose.desk.regions.join(', '));
  check('...and the same day gives the same list twice', chose.stable === true);

  /* The length is the number you asked for, not a guess at it. The first
     version turned minutes into a count with a flat 45-seconds-each estimate
     and then measured the result at 56 — eight minutes came out at ten and a
     half. */
  check('eight minutes is about eight minutes',
    Math.abs(chose.short.mins - 8) <= 1.2, String(chose.short.mins));
  check('...and fifteen is about fifteen',
    Math.abs(chose.long.mins - 15) <= 1.5, String(chose.long.mins));
  check('...so asking for longer gives you more of it',
    chose.long.n > chose.short.n, `${chose.short.n} → ${chose.long.n}`);

  /* The explanation has to be an explanation. */
  check('every movement says why it is there',
    chose.desk.why.every(w => ['sore', 'trained', 'work'].indexOf(w) >= 0),
    JSON.stringify(chose.desk.why));
  /* One reason, the strongest — three chips on every row is wallpaper. */
  check('...and it is a single reason, not all of them',
    chose.desk.why.every(w => typeof w === 'string'));
  check('a flagged ankle brings calf and hamstring work up the list',
    chose.ankle.names.some(n => /calf|ankle|hamstring|fold|dog/i.test(n)),
    chose.ankle.names.join(', '));
  check('...and says the flag is why', chose.ankle.why.indexOf('sore') >= 0,
    JSON.stringify(chose.ankle.why));
  /* With a squat day behind you and nothing flagged, training is the reason. */
  check('with nothing flagged, training and work are what is left',
    chose.desk.why.indexOf('sore') < 0, JSON.stringify(chose.desk.why));

  /* No answers at all still has to produce something usable — day one of the
     tool is a real state, not an error. */
  check('no answers and no history still gives a stretch',
    chose.nothing.n >= 4 && chose.nothing.regions.length >= 3,
    `${chose.nothing.n} movements, ${chose.nothing.regions.join('/')}`);

  // ================= 3. marking it done ================================
  console.log('\ndoing it\n');

  const doing = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    S.stretch = { onboarded: true, occupation: 'desk', areas: [], done: {}, mins: 8 };
    save(true);
    /* Through the real sheet and the real buttons. */
    sheetStretch();
    const ticks = () => [...document.querySelectorAll('#sheet-body [data-act="stretch-tick"]')];
    const first = ticks()[0];
    if (!first) return { found: false };
    const id = first.dataset.v;
    first.click();
    const afterTick = stretchDone(today()).slice();
    /* And again, to take it back. */
    const same = ticks().find(b => b.dataset.v === id);
    if (same) same.click();
    const afterUntick = stretchDone(today()).slice();

    /* A stretch is not a session: it must not appear in the log, must not set
       a record, and must never reach applyProgression. */
    same && same.click();
    const sessions = (S.sessions || []).length;
    const lifts = Object.keys(S.lifts || {}).length;

    return { found: true, id, afterTick, afterUntick, sessions, lifts,
             done: stretchDone(today()).length };
  });
  check('the sheet renders with something to tick', doing.found === true);
  check('ticking a movement marks it done', doing.afterTick.length === 1,
    JSON.stringify(doing.afterTick));
  check('...and ticking it again takes it back', doing.afterUntick.length === 0,
    JSON.stringify(doing.afterUntick));
  check('a stretch is not logged as a session', doing.sessions === 0, String(doing.sessions));
  check('...and sets no working weight', doing.lifts === 0, String(doing.lifts));

  const streak = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    S.stretch = { onboarded: true, occupation: 'desk', areas: [], done: {}, mins: 8 };
    save(true);
    const t = fromKey(today());
    for (let i = 1; i <= 3; i++) S.stretch.done[dk(addDays(t, -i))] = ['mob-cat-cow'];
    const beforeToday = stretchStreak();
    S.stretch.done[today()] = ['mob-cat-cow'];
    const withToday = stretchStreak();
    delete S.stretch.done[dk(addDays(t, -2))];
    return { beforeToday, withToday, broken: stretchStreak() };
  });
  /* The same kindness the water streak has: a day that has not finished
     cannot have been missed. */
  check('a day you have not done yet does not break the run',
    streak.beforeToday === 3, String(streak.beforeToday));
  check('...and doing it adds to the run', streak.withToday === 4, String(streak.withToday));
  check('a genuine gap shortens it', streak.broken === 2, String(streak.broken));

  // ================= 4. your own =======================================
  console.log('\nyour own\n');

  const own = await page.evaluate(() => {
    S = blank(); S.onboarded = true;
    S.stretch = { onboarded: true, occupation: 'desk', areas: [], done: {}, mins: 8 };
    save(true);
    const r = saveDailyAsRoutine();
    const built = routineById(r.id);
    const mine = newStretchRoutine('Evening');
    return {
      saved: !!built,
      items: built ? built.items.length : 0,
      /* Built out of the recommendation, so it starts where you left off. */
      allMobility: built ? built.items.every(it => EX[it.exId].pattern === 'mobility') : false,
      flagged: built ? !!built.stretch : false,
      /* A stretch routine is a routine — the builder, the reorder, the timed
         items and the Train runner all already exist. */
      inRoutines: (S.routines || []).length === 2,
      onlyStretchOnes: stretchRoutines().length === 2,
      empty: mine.items.length === 0,
      /* A warm-up on a stretch routine would warm you up for stretching. */
      noWarmup: built ? built.warmup === false : false
    };
  });
  check('today\'s stretch can be saved as a routine', own.saved === true);
  check('...with the movements it recommended in it', own.items >= 4, String(own.items));
  check('...all of them mobility', own.allMobility === true);
  check('...marked so the stretch screen finds it again', own.flagged === true);
  check('...and carrying no warm-up of its own', own.noWarmup === true);
  check('a stretch routine is a routine like any other', own.inRoutines === true);
  check('...and an empty one can be built from scratch', own.empty === true);
  check('the stretch screen lists only the stretch ones', own.onlyStretchOnes === true);

  // ================= 5. the setup asks things that change the answer ===
  console.log('\nsetup\n');

  const setup = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    /* Straight into the sheet stack with no answers: it must offer to set up
       rather than render an empty recommendation. */
    sheetStretch();
    const introText = (document.getElementById('sheet-body') || {}).innerText || '';
    const setupBtn = document.querySelector('#sheet-body [data-act="stretch-setup"]');
    if (!setupBtn) return { reached: false };
    setupBtn.click();

    const pick = (act, v) => {
      const el = document.querySelector(`#sheet-body [data-act="${act}"][data-v="${v}"]`);
      if (el) el.click();
      return !!el;
    };
    const gotOcc = pick('stretch-occ', 'driving');
    const gotArea = pick('stretch-area', 'hip');
    const gotMins = pick('stretch-mins', '12');
    /* Tapping the chosen occupation again clears it — "none of these" is a
       real answer. */
    pick('stretch-occ', 'driving');
    const clearedOcc = stretchDraft.occupation === null;
    pick('stretch-occ', 'driving');

    const saveBtn = document.querySelector('#sheet-body [data-act="stretch-save-setup"]');
    if (saveBtn) saveBtn.click();
    const st = stretchStore();
    return { reached: true, introText, gotOcc, gotArea, gotMins, clearedOcc,
             occupation: st.occupation, areas: st.areas, mins: st.mins,
             onboarded: st.onboarded,
             /* And it lands on the stretch itself, not back on an empty form. */
             landed: /Today's stretch/i.test((document.getElementById('sheet-body') || {}).innerText || '') };
  });
  check('with no answers it offers to set up', setup.reached === true);
  check('...and says what it is for first', /physio|treatment/i.test(setup.introText || ''),
    (setup.introText || '').slice(0, 60));
  check('the setup asks about work, sore areas and length',
    setup.gotOcc && setup.gotArea && setup.gotMins,
    JSON.stringify([setup.gotOcc, setup.gotArea, setup.gotMins]));
  check('...and every answer is kept',
    setup.occupation === 'driving' && setup.areas.join() === 'hip' && setup.mins === 12,
    JSON.stringify([setup.occupation, setup.areas, setup.mins]));
  check('...an occupation can be unpicked again', setup.clearedOcc === true);
  check('...and saving lands on the stretch, not back on the form',
    setup.landed === true && setup.onboarded === true);

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
