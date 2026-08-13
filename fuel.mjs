/* fuel.mjs — diet preferences, meal suggestions, and the Fuel intake screens.

   Suggestions are the first thing in this app that proposes rather than
   records, so the bar is different: a wrong suggestion is not a cosmetic bug.
   The checks that matter most here are the exclusions — if someone says no
   dairy and a suggestion contains yoghurt, that is the whole feature failing.

   Everything runs through the app's own functions in a real browser.

   Run: node fuel.mjs */

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

/* A state with everything the energy equation needs, so targets exist. */
const FED = `
  S = blank(); S.onboarded = true;
  S.profile.units = 'kg';
  S.profile.bodyweight = [{ d: today(), w: 80 }];
  S.profile.heightCm = 178; S.profile.birthYear = 1990;
  S.profile.sex = 'm'; S.profile.activity = 'onfeet';
  S.settings.nutrition = true;
  save(true);
`;

try {
  await page.goto(origin + '/', { waitUntil: 'load' });

  // ================= 1. suggestions exist and add up =====================
  console.log('suggestions\n');

  const base = await page.evaluate(`(() => {
    ${FED}
    S.nutrition.prefs = { meals:3, snacks:1, pattern:'omni', exclude:[] };
    const a = suggestMeals(today());
    const b = suggestMeals(today());
    const other = suggestMeals('2026-01-14');
    return {
      ok: a.ok, slots: a.slots.length, kcal: a.kcal, p: a.p,
      kcalTarget: a.kcalTarget,
      names: a.slots.map(s => s.slot),
      stable: JSON.stringify(a.slots) === JSON.stringify(b.slots),
      varies: JSON.stringify(a.slots) !== JSON.stringify(other.slots),
      everySlotHasItems: a.slots.every(s => s.items.length > 0),
      everyItemHasQty: a.slots.every(s => s.items.every(it => it.qty > 0 && it.kcal >= 0))
    };
  })()`);

  check('a fed profile gets suggestions', base.ok === true);
  check('three meals plus a snack is four slots', base.slots === 4, String(base.slots));
  check('slots are named', base.names.join(',') === 'Breakfast,Lunch,Dinner,Snack', base.names.join(','));
  check('every slot has something in it', base.everySlotHasItems);
  check('every item has a real portion', base.everyItemHasQty);
  /* Loose bound on purpose: portions are rounded to 5 g and bounded, so the
     day will not land exactly on target. It must be in the right postcode. */
  check('the day lands near the calorie target',
    base.kcal > base.kcalTarget * 0.7 && base.kcal < base.kcalTarget * 1.25,
    `${base.kcal} vs ${base.kcalTarget}`);
  check('the same day suggests the same thing twice', base.stable);
  check('a different day suggests something different', base.varies);

  // ================= 2. restrictions are actually honoured ===============
  console.log('\nrestrictions');

  const restricted = await page.evaluate(`(() => {
    ${FED}
    const run = prefs => {
      S.nutrition.prefs = prefs;
      const s = suggestMeals(today());
      if (!s.ok) return { ok:false, reason:s.reason };
      const ids = s.slots.flatMap(x => x.items.map(i => i.foodId));
      const foods = ids.map(id => FOODS.find(f => f.id === id)).filter(Boolean);
      return { ok:true, groups:[...new Set(foods.map(f => f.g))],
               tags:[...new Set(foods.flatMap(f => [...foodTags(f)]))],
               names: foods.map(f => f.n) };
    };
    return {
      vegan: run({ meals:3, snacks:1, pattern:'vegan', exclude:[] }),
      veg:   run({ meals:3, snacks:1, pattern:'veg',   exclude:[] }),
      pesc:  run({ meals:3, snacks:0, pattern:'pesc',  exclude:[] }),
      gf:    run({ meals:3, snacks:0, pattern:'omni',  exclude:['gluten'] }),
      nutfree: run({ meals:3, snacks:2, pattern:'omni', exclude:['nuts'] }),
      impossible: run({ meals:3, snacks:0, pattern:'vegan',
                        exclude:['soy','nuts','gluten','dairy','egg'] })
    };
  })()`);

  const noneOf = (r, ...tags) => r.ok && !r.tags.some(t => tags.includes(t));
  check('vegan suggests no meat, fish, egg or dairy',
    noneOf(restricted.vegan, 'meat', 'fish', 'shellfish', 'egg', 'dairy'),
    restricted.vegan.ok ? restricted.vegan.names.join(', ') : restricted.vegan.reason);
  check('vegetarian suggests no meat or fish',
    noneOf(restricted.veg, 'meat', 'fish', 'shellfish'),
    restricted.veg.ok ? restricted.veg.names.join(', ') : restricted.veg.reason);
  check('pescatarian suggests no meat but may suggest fish',
    noneOf(restricted.pesc, 'meat'),
    restricted.pesc.ok ? restricted.pesc.names.join(', ') : restricted.pesc.reason);
  check('excluding gluten drops bread, pasta and oats',
    noneOf(restricted.gf, 'gluten'),
    restricted.gf.ok ? restricted.gf.names.join(', ') : restricted.gf.reason);
  check('excluding nuts drops nuts, including from snacks',
    noneOf(restricted.nutfree, 'nuts'),
    restricted.nutfree.ok ? restricted.nutfree.names.join(', ') : restricted.nutfree.reason);

  /* The harshest combination a person can actually pick is still satisfiable —
     vegan, gluten, nut, soy, dairy and egg free still leaves lentils, chickpeas
     and plant protein — so it must succeed AND respect every restriction. */
  check('the most restrictive real combination still works',
    restricted.impossible.ok === true, JSON.stringify(restricted.impossible).slice(0, 140));
  check('...and still honours every one of those restrictions',
    noneOf(restricted.impossible, 'meat', 'fish', 'shellfish', 'egg', 'dairy', 'soy', 'nuts', 'gluten'),
    restricted.impossible.ok ? restricted.impossible.names.join(', ') : '');

  /* The empty-shelf guard is therefore unreachable through the UI, which is
     why it gets exercised directly rather than assumed. A branch nothing can
     reach is a branch nothing has checked. */
  const starved = await page.evaluate(`(() => {
    ${FED}
    const real = allowedFoods;
    try { allowedFoods = () => []; return suggestMeals(today()); }
    finally { allowedFoods = real; }
  })()`);
  check('an empty food pool refuses, and says why',
    starved.ok === false && starved.reason === 'no-protein', JSON.stringify(starved));

  const noTarget = await page.evaluate(`(() => {
    S = blank(); S.onboarded = true; S.settings.nutrition = true;
    S.nutrition.targets = {}; S.profile.bodyweight = [];
    save(true);
    return suggestMeals(today());
  })()`);
  check('no calorie target refuses rather than inventing one',
    noTarget.ok === false && noTarget.reason === 'no-target', JSON.stringify(noTarget));

  // ================= 3. logging a suggestion =============================
  console.log('\nlogging a suggestion');

  const logged = await page.evaluate(`(() => {
    ${FED}
    S.nutrition.prefs = { meals:3, snacks:0, pattern:'omni', exclude:[] };
    const before = nutTotals(today()).kcal;
    const n = logSuggestedSlot(today(), 0);
    const items = nutDay(today()).items;
    return { n, before, after: nutTotals(today()).kcal,
             allHaveIds: items.every(i => !!i.id),
             allHaveMacros: items.every(i => typeof i.c === 'number' && typeof i.f === 'number'),
             count: items.length };
  })()`);
  check('logging a slot writes its items', logged.n > 0 && logged.count === logged.n,
    `${logged.n} logged, ${logged.count} in the diary`);
  check('the day total moves', logged.after > logged.before, `${logged.before} → ${logged.after}`);
  check('logged items are editable (they have ids)', logged.allHaveIds);
  check('logged items carry carbs and fat, not just protein', logged.allHaveMacros);

  // ================= 4. the intake screens ===============================
  console.log('\nFuel intake');

  const ob = await page.evaluate(() => {
    const keys = ['measure', 'activity', 'meals', 'diet'];
    obDraft = { ...OB_DEFAULT, gear:{ ...GEAR_ALL }, seedOverrides:{}, seedExact:{} };
    obDraft.nutrition = false;
    const off = keys.map(k => obSkip(OB_STEPS.find(s => s.k === k)));
    obDraft.nutrition = true;
    const on = keys.map(k => obSkip(OB_STEPS.find(s => s.k === k)));
    let rendered = true, err = null;
    try {
      keys.forEach(k => { obStep = OB_STEPS.findIndex(s => s.k === k); renderOnboard(); });
    } catch (e) { rendered = false; err = e.message; }
    const body = document.getElementById('ob-content').innerText || '';
    return { off, on, rendered, err, blank: /undefined|NaN|\[object Object\]/.test(body) };
  });
  check('the Fuel questions are skipped when Fuel is off', ob.off.every(Boolean), JSON.stringify(ob.off));
  check('the Fuel questions appear when Fuel is on', ob.on.every(x => x === false), JSON.stringify(ob.on));
  check('all four render', ob.rendered, String(ob.err));
  check('no placeholder text on them', ob.blank === false);

  /* Finishing must actually write what was answered — the draft is thrown
     away afterwards, so anything not copied across is lost silently. */
  const finished = await page.evaluate(() => {
    S = blank(); save(true);
    obDraft = { ...OB_DEFAULT, gear:{ ...GEAR_ALL }, seedOverrides:{}, seedExact:{} };
    Object.assign(obDraft, {
      name:'Probe', nutrition:true, heightCm:181, birthYear:1988, sex:'f', activity:'heavy',
      mealsPerDay:4, snacksPerDay:2, dietPattern:'veg', dietExclude:['nuts']
    });
    const b = document.createElement('button');
    b.setAttribute('data-act', 'ob-finish');
    document.body.appendChild(b); b.click(); b.remove();
    return { h:S.profile.heightCm, y:S.profile.birthYear, sex:S.profile.sex,
             act:S.profile.activity, prefs:S.nutrition.prefs, onboarded:S.onboarded };
  });
  check('height and birth year are saved', finished.h === 181 && finished.y === 1988,
    `${finished.h} / ${finished.y}`);
  check('sex and activity are saved', finished.sex === 'f' && finished.act === 'heavy',
    `${finished.sex} / ${finished.act}`);
  check('diet preferences are saved', finished.prefs &&
    finished.prefs.meals === 4 && finished.prefs.snacks === 2 &&
    finished.prefs.pattern === 'veg' && finished.prefs.exclude.join() === 'nuts',
    JSON.stringify(finished.prefs));

  /* Answering "no" to Fuel must not write body data nobody was asked for. */
  const declined = await page.evaluate(() => {
    S = blank(); save(true);
    obDraft = { ...OB_DEFAULT, gear:{ ...GEAR_ALL }, seedOverrides:{}, seedExact:{} };
    obDraft.nutrition = false;
    const b = document.createElement('button');
    b.setAttribute('data-act', 'ob-finish');
    document.body.appendChild(b); b.click(); b.remove();
    return { h:S.profile.heightCm, prefs:S.nutrition.prefs };
  });
  check('declining Fuel invents no body data',
    declined.h === undefined || declined.h === null, String(declined.h));

  // ================= 5. the screen renders ===============================
  console.log('\nthe Fuel screen');

  const screen = await page.evaluate(`(() => {
    ${FED}
    S.nutrition.prefs = { meals:3, snacks:1, pattern:'omni', exclude:[] };
    go('fuel');
    const t = document.getElementById('s-fuel').innerText || '';
    return { textLen: t.length, hasSuggested: /suggested/i.test(t),
             blank: /undefined|NaN|\\[object Object\\]/.test(t),
             logButtons: document.querySelectorAll('[data-act="fuel-log-slot"]').length };
  })()`);
  /* Case-insensitive: .sec-t is uppercased in CSS and innerText returns what
     is painted, not what the template wrote. */
  check('the Fuel screen shows a Suggested section', screen.hasSuggested, 'text len ' + screen.textLen);
  check('the Fuel screen actually rendered text', screen.textLen > 200, String(screen.textLen));
  check('each slot has a Log button', screen.logButtons === 4, String(screen.logButtons));
  check('no placeholder text on the Fuel screen', screen.blank === false);

  const prefsSheet = await page.evaluate(() => {
    sheetDietPrefs();
    const t = document.getElementById('sheet-body').innerText || '';
    return { open: t.length > 0,
             warns: /allergen/i.test(t),
             blank: /undefined|NaN|\[object Object\]/.test(t) };
  });
  check('the "how you eat" sheet opens', prefsSheet.open);
  check('it says it is not an allergen database', prefsSheet.warns);
  check('no placeholder text in it', prefsSheet.blank === false);

  // ============ correcting a food, and the shape of a day ============
  console.log('\ncorrecting what the catalogue got wrong\n');

  const fix = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.settings.nutrition = true; save(true);
    const whey = FOODS.find(f => /whey/i.test(f.n));
    const base = { per: whey.per, kcal: whey.kcal, p: whey.p };

    /* A scoop of the catalogue's whey, logged as it comes. */
    logFood(whey.id, 1);
    /* A copy. Holding the reference and comparing it to itself later is a
       check that cannot fail — mutating the entry moves both sides of it. */
    const asShipped = Object.assign({}, nutDay(today()).items[0]);

    /* Your tub: one serving is two scoops, 250 kcal, 50g protein. Before this
       the only control was how many scoops — the numbers inside one were not
       reachable from anywhere in the app. */
    fixFood(whey.id, { per: 1, kcal: 250, p: 50, c: 6, f: 4 });
    const corrected = foodById(whey.id);

    /* What is logged from now on uses yours. */
    logFood(whey.id, 1);
    const after = nutDay(today()).items[1];

    /* And what you already ate is left exactly as it was — rewriting last
       week's dinner because you corrected a food today would invent history. */
    const untouched = nutDay(today()).items[0].kcal === asShipped.kcal;

    const reset = (clearFix(whey.id), foodById(whey.id));
    return { base, corrected: { per: corrected.per, kcal: corrected.kcal, p: corrected.p,
             fixed: !!corrected.fixed },
             logged: { kcal: after.kcal, p: after.p }, untouched,
             reset: { kcal: reset.kcal, fixed: !!reset.fixed } };
  });
  check('the catalogue ships one whey for everybody', fix.base.kcal === 120, String(fix.base.kcal));
  /* The reported bug: a preset's numbers could not be changed at all. */
  check('...and you can correct it to match your tub',
    fix.corrected.kcal === 250 && fix.corrected.p === 50 && fix.corrected.fixed,
    JSON.stringify(fix.corrected));
  check('...including what counts as one serving', fix.corrected.per === 1,
    String(fix.corrected.per));
  check('what you log afterwards uses your numbers',
    fix.logged.kcal === 250 && fix.logged.p === 50, JSON.stringify(fix.logged));
  check('...and what you already ate is left alone', fix.untouched === true);
  check('the correction can be taken back',
    fix.reset.kcal === 120 && fix.reset.fixed === false, JSON.stringify(fix.reset));

  const entry = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.settings.nutrition = true; save(true);
    const chicken = FOODS.find(f => /chicken breast/i.test(f.n));
    logFood(chicken.id, 100);
    const id = nutDay(today()).items[0].id;
    const before = { ...nutDay(today()).items[0] };
    /* Typed into the real sheet and saved with the real button. Calling
       setEntryMacros here would prove the function works and say nothing about
       whether anything on screen can reach it. */
    go('fuel'); renderFuel(); sheetEntryEdit(id);
    const set = (elId, v) => { const el = document.getElementById(elId); if (el) el.value = v; };
    set('ee-kcal', '400'); set('ee-p', '45'); set('ee-c', '10'); set('ee-f', '12');
    const btn = document.querySelector('#sheet-body [data-act="entry-macros"]');
    if (!btn) return { before: before.kcal, after: { kcal: -1, p: -1, edited: false },
                       scaled: -1, totals: -1, reached: false };
    btn.click();
    const after = { ...nutDay(today()).items[0] };
    /* A corrected entry must not be re-resolved from its food by the next
       quantity nudge, or the correction is silently thrown away. */
    /* 100g → 200g. The entry is measured in grams, so "2" here would mean two
       grams and scale it down by fifty. */
    updateEntry(today(), id, 200);
    const scaled = { ...nutDay(today()).items[0] };
    const totals = nutTotals(today());
    return { before: before.kcal, after: { kcal: after.kcal, p: after.p, edited: !!after.edited },
             scaled: scaled.kcal, totals: totals.kcal, reached: true };
  });
  check('the sheet offers a way to change the numbers', entry.reached === true);
  check('one entry can be corrected on its own',
    entry.after.kcal === 400 && entry.after.p === 45 && entry.after.edited,
    JSON.stringify(entry.after));
  check('...and stays corrected when you change how much of it there was',
    entry.scaled === 800, `${entry.after.kcal} → ${entry.scaled}`);
  check('...and the day counts what you corrected it to',
    entry.totals === 800, String(entry.totals));

  const quick = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.settings.nutrition = true; save(true);
    const bad = quickAdd({ n: 'nothing', kcal: '', p: '', c: '', f: '' });
    quickAdd({ n: 'Lunch on set', kcal: 700, p: 40 });
    const it = nutDay(today()).items[0] || {};
    return { bad, n: it.n, kcal: it.kcal, p: it.p, food: it.foodId, count: nutDay(today()).items.length };
  });
  check('a meal with no food behind it can still be logged',
    quick.count === 1 && quick.kcal === 700 && quick.p === 40, JSON.stringify(quick));
  check('...under the name you gave it', quick.n === 'Lunch on set', quick.n);
  check('...and an empty quick add adds nothing', quick.bad === false);

  const meals = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.settings.nutrition = true;
    S.profile.dayStart = 0; save(true);
    const egg = FOODS.find(f => /^egg, whole/i.test(f.n));
    logFood(egg.id, 2);
    const id = nutDay(today()).items[0].id;
    const guessed = nutDay(today()).items[0].m;
    setEntryMeal(today(), id, 'd');
    const moved = nutDay(today()).items[0].m;
    go('fuel'); renderFuel();
    const body = document.getElementById('fuel-body');
    return { guessed, moved,
      groups: [...body.querySelectorAll('.fuel-meal-n')].map(x => x.textContent),
      slots: MEALS.map(m => m.id).join(','),
      bad: /undefined|NaN|\[object/.test(body.innerText) };
  });
  /* Guessed from the clock, and always changeable — the guess is a starting
     point, not a claim about when you ate. */
  check('a logged food lands in a meal', ['b','l','d','s'].indexOf(meals.guessed) >= 0, meals.guessed);
  check('...and can be moved to another', meals.moved === 'd', meals.moved);
  check('the day is grouped by meal, not one flat list',
    meals.groups.length === 1 && /Dinner/i.test(meals.groups[0]), meals.groups.join(','));
  check('there are four meals', meals.slots === 'b,l,d,s', meals.slots);
  check('no placeholder text on Fuel', meals.bad === false);

  const ring = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.settings.nutrition = true;
    S.profile.heightCm = 183; S.profile.birthYear = 1989; S.profile.sex = 'm';
    S.profile.activity = 'mod'; S.profile.bodyweight = [{ d: today(), w: 98 }];
    const c = FOODS.find(f => /chicken breast/i.test(f.n));
    logFood(c.id, 200); save(true);
    syncNav(); go('fuel'); renderFuel();
    const arcs = [...document.querySelectorAll('.fr-arc')];
    /* Each arc's dash offset has to be its own circumference minus its own
       progress. One shared number would draw three arcs at the same angle. */
    const geom = arcs.map(a => {
      const r = +a.getAttribute('r');
      const c2 = 2 * Math.PI * r;
      const off = +a.getAttribute('stroke-dashoffset');
      const dash = +a.getAttribute('stroke-dasharray');
      return { r, okDash: Math.abs(dash - c2) < 0.2, pct: Math.round((1 - off / c2) * 100),
               cvar: a.style.getPropertyValue('--c') };
    });
    return { n: arcs.length, geom,
      mid: (document.querySelector('.fuel-ring-v') || {}).textContent };
  });
  check('the day is drawn as three arcs', ring.n === 3, String(ring.n));
  check('...each dashed to its own circumference', ring.geom.every(g => g.okDash),
    JSON.stringify(ring.geom.map(g => g.okDash)));
  /* The animation fills from empty, and "empty" is this arc's circumference. A
     shared constant happens to look right only while every radius is smaller
     than it. */
  check('...and carries its own circumference for the fill animation',
    ring.geom.every(g => Math.abs(parseFloat(g.cvar) - 2 * Math.PI * g.r) < 0.2),
    JSON.stringify(ring.geom.map(g => g.cvar)));
  check('...with the outer arc showing the day', ring.geom[0].pct > 0 && ring.geom[0].pct <= 100,
    String(ring.geom[0].pct));
  check('the middle of the ring is the number', /\d/.test(ring.mid || ''), ring.mid);

  // ============ searching for a food with two words in it ============
  console.log('\nsearching for something with a space in its name\n');

  /* Typed on a real keyboard, one key at a time, because the bug only exists
     between keystrokes: the sheet redraws on every `input` event and refills
     the field from its own state, so a space was swallowed the instant it was
     typed and never survived to the next letter. Setting `.value` in one go
     and dispatching one event fires the listener once and cannot reproduce it. */
  /* A fresh page first. The sections above open and hand between a dozen
     sheets, and `sheetOpen` plus the history entry the sheet stack rides on
     outlive them — so the first keystroke's redraw landed on a stale popstate
     and the search sheet was replaced by whatever was underneath. Every other
     section here only calls functions and reads the result; this is the one
     that types, and typing is the thing that notices. */
  await page.goto(origin + '/', { waitUntil: 'load' });

  const opened = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.settings.nutrition = true; save(true);
    go('fuel'); renderFuel();
    /* No closeSheet() first. It calls history.back(), which lands as a popstate
       *after* this evaluate returns and shuts the sheet opened below — leaving
       the field in the DOM but invisible, so Playwright waits out its timeout
       on an element that is right there. Hand between sheets by opening. */
    foodQ = ''; foodGroupOpen = null; sheetFoodSearch('');
    return !!document.getElementById('food-q');
  });
  check('the food search sheet has a field to type in', opened === true);
  const typed = 'turkey sandwich';
  await page.focus('#food-q');

  /* Read the field back after every single key rather than only at the end.
     The property being checked is per-keystroke — what the field holds when
     the next letter arrives — so checking only the final value would let a
     space that vanished and came back count as a pass. Reading between keys
     also stops the keystrokes outrunning the redraw: fifteen sent back to
     back land on nodes the sheet has already replaced, focus escapes to the
     document, and the space activates whatever button caught it. */
  const seen = [];
  for (const ch of typed) {
    await page.keyboard.type(ch, { delay: 15 });
    seen.push(await page.evaluate(() => {
      const el = document.getElementById('food-q');
      return el ? el.value : '(no field)';
    }));
  }
  const wrong = seen.map((v, i) => [typed.slice(0, i + 1), v])
                    .filter(([want, got]) => want !== got);

  const search = await page.evaluate(() => {
    const el = document.getElementById('food-q');
    const rows = [...document.querySelectorAll('#sheet-body .pick-row .h3')].map(n => n.textContent);
    return { value: el ? el.value : '(no field)', caret: el ? el.selectionStart : -1, rows };
  });
  check('the field holds exactly what has been typed, after every key',
    wrong.length === 0, JSON.stringify(wrong.slice(0, 3)));
  /* The reported bug, in the reporter's words: "it forces my words together". */
  check('a space typed into the food search survives the redraw',
    search.value === typed,
    JSON.stringify({ field: search.value, state: search.state, on: search.sheetOn, head: search.head }));
  check('...and the caret stays at the end rather than jumping home',
    search.caret === typed.length, String(search.caret));
  check('...and "turkey sandwich" finds a turkey sandwich',
    search.rows.some(n => /turkey sandwich/i.test(n)), search.rows.slice(0, 4).join(' | '));

  /* The other half of the same complaint: the library had no sandwiches in it
     at all, so the search was correct and still useless. */
  const sarnies = await page.evaluate(() => {
    const named = n => FOODS.some(f => f.n.toLowerCase() === n);
    return {
      n: FOODS.filter(f => /sandwich|toastie|sub|wrap|roll|bagel|toast/i.test(f.n)).length,
      turkey: named('turkey sandwich'),
      beef: named('roast beef sandwich'),
      /* Named the way a person says it, not the way a catalogue sorts it.
         "Sandwich, turkey" is unfindable by typing what you ate. */
      naturalOrder: FOODS.filter(f => /sandwich/i.test(f.n)).every(f => !/^sandwich[ ,]/i.test(f.n)),
      searchable: foodSearch('roast beef').some(f => /roast beef sandwich/i.test(f.n))
    };
  });
  check('the library has sandwiches in it', sarnies.n >= 15, String(sarnies.n));
  check('...including the two that were asked for by name',
    sarnies.turkey && sarnies.beef, JSON.stringify(sarnies));
  check('...named the way somebody would say it out loud', sarnies.naturalOrder === true);
  check('...and reachable by typing half the name', sarnies.searchable === true);

  // ============ water ============
  console.log('\nwater\n');

  const wtr = await page.evaluate(() => {
    const fresh = () => {
      S = blank(); S.onboarded = true; S.settings.nutrition = true;
      S.profile.units = 'kg';
      S.profile.bodyweight = [{ d: today(), w: 82 }];
      save(true);
    };
    fresh();
    const noTrain = waterGoal(today());

    /* An hour logged today, and the target moves. Sweat is the one input here
       the app genuinely knows about. */
    S.sessions = [{ id: 'w1', date: today(), ended: Date.now(), dur: 60, kcal: 400,
                    type: 'full', exercises: [] }];
    const trained = waterGoal(today());
    S.sessions = [];

    /* No bodyweight to scale from: a flat figure, not an invented weight. */
    S.profile.bodyweight = [];
    const flat = waterGoal(today());
    S.profile.bodyweight = [{ d: today(), w: 82 }];

    /* Clamped at both ends — the linear form stops making sense out there. */
    S.profile.bodyweight = [{ d: today(), w: 30 }];
    const tiny = waterGoal(today()).base;
    S.profile.bodyweight = [{ d: today(), w: 200 }];
    const huge = waterGoal(today()).base;
    S.profile.bodyweight = [{ d: today(), w: 82 }];

    /* Yours beats the estimate, and training is still added on top of it. */
    setWaterGoal(2000);
    S.sessions = [{ id: 'w1', date: today(), ended: Date.now(), dur: 30, kcal: 200,
                    type: 'full', exercises: [] }];
    const mine = waterGoal(today());
    setWaterGoal(0);
    S.sessions = [];
    const back = waterGoal(today()).base;

    return { noTrain, trained, flat, tiny, huge, mine, back };
  });
  check('the target scales with bodyweight', wtr.noTrain.base === 2700, String(wtr.noTrain.base));
  check('...and an hour trained adds to it',
    wtr.trained.total === wtr.noTrain.base + 500 && wtr.trained.bonus === 500,
    JSON.stringify(wtr.trained));
  check('...with a flat figure when there is no weight to scale from',
    wtr.flat.base === 2000, String(wtr.flat.base));
  check('...clamped at both ends', wtr.tiny === 1500 && wtr.huge === 4000,
    `${wtr.tiny} / ${wtr.huge}`);
  check('a target you set beats the estimate', wtr.mine.base === 2000, String(wtr.mine.base));
  check('...and training is still added to yours', wtr.mine.bonus === 250, String(wtr.mine.bonus));
  check('...and clearing it goes back to the estimate', wtr.back === 2700, String(wtr.back));

  const wUnits = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.settings.nutrition = true;
    S.profile.units = 'kg'; save(true);
    logWater(1400);
    const kgSide = { unit: waterUnit(), stored: waterOn(today()), shown: fmtWater(waterOn(today())) };
    /* The whole point of storing millilitres: flipping the unit is a formatter
       change, never a data change. */
    S.profile.units = 'lb';
    const lbSide = { unit: waterUnit(), stored: waterOn(today()), shown: fmtWater(waterOn(today())) };
    const pours = waterPours().map(p => p.sub);
    S.profile.units = 'kg';
    return { kgSide, lbSide, pours,
             fmt: [fmtWater(250), fmtWater(1000), fmtWater(1750)] };
  });
  check('water reads in millilitres alongside kilos', wUnits.kgSide.unit === 'ml', wUnits.kgSide.unit);
  check('...and in fluid ounces alongside pounds', wUnits.lbSide.unit === 'oz', wUnits.lbSide.unit);
  check('...but the stored number never moves',
    wUnits.kgSide.stored === 1400 && wUnits.lbSide.stored === 1400,
    `${wUnits.kgSide.stored} / ${wUnits.lbSide.stored}`);
  check('...only what it is painted as',
    wUnits.kgSide.shown === '1.4 L' && /oz$/.test(wUnits.lbSide.shown),
    `${wUnits.kgSide.shown} / ${wUnits.lbSide.shown}`);
  /* Litres once it is worth reading as litres. */
  check('a small amount stays in millilitres and a large one becomes litres',
    wUnits.fmt[0] === '250 ml' && wUnits.fmt[1] === '1 L' && wUnits.fmt[2] === '1.8 L',
    wUnits.fmt.join(' | '));
  /* Real vessels, not conversions of the metric ones. 8.5 oz is not a cup. */
  check('the quick pours are sizes those things are actually sold in',
    wUnits.pours.join(',') === '8 oz,16 oz,32 oz', wUnits.pours.join(','));

  /* The streak, and the one rule it has to obey. */
  const wStreak = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.settings.nutrition = true;
    S.profile.units = 'kg'; S.profile.bodyweight = [{ d: today(), w: 60 }];
    setWaterGoal(2000); save(true);
    const t = fromKey(today());
    const W = () => waterStore().days;
    /* Three full days behind today, and today barely started. */
    for (let i = 1; i <= 3; i++) W()[dk(addDays(t, -i))] = 2000;
    W()[today()] = 300;
    const midDay = waterStreak();
    /* Finish today and it counts. */
    W()[today()] = 2000;
    const done = waterStreak();
    noteWaterBest();
    const best = waterStore().best;
    /* A miss two days back ends the run there — and nothing announces it. */
    W()[dk(addDays(t, -2))] = 100;
    const broken = waterStreak();
    noteWaterBest();
    return { midDay, done, best, broken, bestAfter: waterStore().best };
  });
  /* The kindness that makes this streak allowed to exist at all: an afternoon
     with three glasses in it is a day in progress, not a broken chain. */
  check('an unfinished today never breaks the run', wStreak.midDay === 3, String(wStreak.midDay));
  check('...and finishing it adds to the run', wStreak.done === 4, String(wStreak.done));
  check('a miss shortens the run', wStreak.broken === 2, String(wStreak.broken));
  check('...but your best is kept rather than taken back',
    wStreak.bestAfter === 4, String(wStreak.bestAfter));

  /* Logged and cleared through the real buttons on the real screen, and the
     bottle's level has to be the number — a flask that fills to a decorative
     fraction is worse than a bar. */
  const bottle = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.settings.nutrition = true;
    S.profile.units = 'kg'; S.profile.bodyweight = [{ d: today(), w: 60 }];
    setWaterGoal(1000); save(true);
    go('fuel'); renderFuel();
    /* Onto the water face first. The deck keeps the face behind it `inert`, so
       a tap the screen does not offer is a tap this check does not get to make
       either — which is the point of inert and worth exercising here. */
    setFuelFace('water', { silent: true });
    const miss = { found: false, after: -1, level: -1, cleared: -1 };
    const card = document.querySelector('.wtr-card');
    if (!card) return miss;
    const pour = card.querySelector('[data-act="water-add"]');
    if (!pour) return miss;
    /* Two glasses on the same node. It has to still be the same node — the
       card updates in place precisely so the fill can animate, and a handler
       that re-rendered would leave this reference dangling and silently log
       one glass instead of two. */
    pour.click(); pour.click();
    const sameNode = document.body.contains(pour);
    const after = waterOn(today());
    const liq = document.querySelector('.wtr-liquid');
    const m = liq ? /translateY\(([-\d.]+)px\)/.exec(liq.getAttribute('style') || '') : null;
    /* The waterline, back out as a fraction of the flask's inside. */
    const y = m ? +m[1] : NaN;
    const frac = isNaN(y) ? -1 : (172 - y) / (172 - 30);
    const clr = document.querySelector('[data-act="water-clear"]');
    if (clr) clr.click();
    return { found: true, after, frac: Math.round(frac * 100) / 100,
             sameNode, cleared: waterOn(today()),
             gone: !document.querySelector('[data-act="water-clear"]') };
  });
  check('the quick pour logs what it says it does', bottle.after === 500, String(bottle.after));
  check('...without rebuilding the card under your thumb', bottle.sameNode === true);
  check('...and the bottle fills to exactly that fraction', bottle.frac === 0.5, String(bottle.frac));
  check('...and clearing empties the day', bottle.cleared === 0, String(bottle.cleared));
  check('...and takes its own button away with it', bottle.gone === true);


  // ============ food and water as one card ============
  console.log('\nthe deck\n');

  /* A fresh page. `fuelFace` is a module variable that holds your choice for as
     long as you are in the app, and the water checks above deliberately switch
     it — so "the deck opens on food" is a claim about a fresh load, and testing
     it against a page that has already been driven proves nothing. */
  await page.goto(origin + '/', { waitUntil: 'load' });

  const deck = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.settings.nutrition = true;
    S.profile.units = 'kg'; S.profile.bodyweight = [{ d: today(), w: 80 }];
    S.profile.heightCm = 178; S.profile.birthYear = 1990; S.profile.sex = 'm';
    save(true);
    go('fuel'); renderFuel();

    /* Both faces measured in the same read, so "the viewport fits the face in
       front" is compared against a number that came from somewhere else. The
       first version read only the active one, and if the track had stretched
       its children the check would have compared a height to itself and passed
       on anything. */
    const heights = () => {
      const f = document.querySelector('.deck-face.food');
      const w = document.querySelector('.deck-face.water');
      return { food: Math.round(f.getBoundingClientRect().height),
               water: Math.round(w.getBoundingClientRect().height) };
    };
    const read = () => {
      const d = document.querySelector('.deck');
      const vp = document.querySelector('.deck-vp');
      const on = document.querySelector('.deck-face.on');
      const off = document.querySelector('.deck-face:not(.on)');
      if (!d || !vp || !on || !off) return null;
      return {
        face: d.dataset.face,
        vpH: Math.round(vp.getBoundingClientRect().height),
        onH: Math.round(on.getBoundingClientRect().height),
        offInert: off.hasAttribute('inert'),
        onInert: on.hasAttribute('inert'),
        tabOn: [...document.querySelectorAll('.deck-tab')]
          .filter(b => b.getAttribute('aria-selected') === 'true').map(b => b.dataset.v),
        /* Both stay mounted: the bottle's fill is a transition on a transform,
           and a face built on demand is a new node with nothing to move from. */
        bothMounted: document.querySelectorAll('.wtr-card, .fuel-day-card').length === 2
      };
    };
    /* The node itself, held across the switch. Asking whether *a* .wtr-liquid
       exists afterwards is true of a re-render too — the first version of this
       check did that and sailed straight through its own revert. Identity is
       the property: the same element has to still be in the document, because
       a new one has no previous transform to transition from. */
    window.__deck = { heights, read };
    window.__liquid = document.querySelector('.wtr-liquid');
    return { sizes: heights(), food: read() };
  });

  /* The viewport's height is transitioned, so a rect read the instant after
     the tap is the height it is animating *from*. Waited out rather than
     slept through — the same mistake the header's hairline check made, and the
     app was right both times. */
  const settle = async (want) => {
    await page.waitForFunction((w) => {
      const vp = document.querySelector('.deck-vp');
      const f = document.querySelector('.deck-face.' + w);
      if (!vp || !f) return false;
      return Math.abs(vp.getBoundingClientRect().height - f.getBoundingClientRect().height) <= 1;
    }, want, { timeout: 4000 }).catch(() => {});
  };

  await page.evaluate(() => document.querySelector('[data-act="fuel-face"][data-v="water"]').click());
  await settle('water');
  const deckWater = await page.evaluate(() => ({
    ...window.__deck.read(),
    liquidSurvived: !!window.__liquid && document.body.contains(window.__liquid) }));

  await page.evaluate(() => document.querySelector('[data-act="fuel-face"][data-v="food"]').click());
  await settle('food');
  const deckBack = await page.evaluate(() => window.__deck.read());
  deck.water = deckWater;
  deck.back = deckBack;
  deck.liquidSurvived = deckWater.liquidSurvived;
  check('food and water are two faces of one card', deck.food !== null && deck.food.bothMounted,
    JSON.stringify(deck.food));
  check('...opening on food', deck.food.face === 'food' && deck.food.tabOn.join() === 'food',
    JSON.stringify(deck.food.tabOn));
  check('...and the tab moves to water', deck.water.face === 'water' &&
    deck.water.tabOn.join() === 'water', JSON.stringify(deck.water.tabOn));
  check('...and back again', deck.back.face === 'food', deck.back.face);
  /* The guard first: if the two faces were the same height, or the track
     stretched them to match, "the card fits the face in front" would be true
     of nothing. */
  check('the two faces are genuinely different heights',
    Math.abs(deck.sizes.food - deck.sizes.water) > 20,
    `${deck.sizes.food} vs ${deck.sizes.water}`);
  check('...and the card takes the height of whichever is in front',
    Math.abs(deck.food.vpH - deck.sizes.food) <= 1 &&
    Math.abs(deck.water.vpH - deck.sizes.water) <= 1,
    `${deck.food.vpH} then ${deck.water.vpH}`);
  check('the face behind cannot be tapped or tabbed into',
    deck.food.offInert && deck.water.offInert && !deck.food.onInert && !deck.water.onInert,
    JSON.stringify([deck.food.offInert, deck.water.offInert]));
  /* Switched in place: a re-render would replace the liquid and the level
     would snap instead of rising. */
  check('...and switching never rebuilds the bottle', deck.liquidSurvived === true);

  // ============ the catalogue holds together ============
  console.log('\nthe food catalogue\n');

  const cat = await page.evaluate(() => {
    const GROUPS = new Set(FOOD_GROUPS.map(g => g.k));
    const UNITS = new Set(['g','ml','ea','scoop','slice']);
    const bad = { cols:[], dupName:[], unit:[], group:[], per:[], neg:[], atwater:[], kcal:[] };
    const names = new Set();
    FOODS.forEach(f => {
      const key = f.n.toLowerCase();
      if (names.has(key)) bad.dupName.push(f.n);
      names.add(key);
      if (!f.n || !f.u) { bad.cols.push(f.n || '(no name)'); return; }
      if (!UNITS.has(f.u)) bad.unit.push(f.n + ':' + f.u);
      if (!GROUPS.has(f.g)) bad.group.push(f.n + ':' + f.g);
      if (!(f.per > 0)) bad.per.push(f.n + ':' + f.per);
      if ([f.kcal, f.p, f.c, f.f].some(v => typeof v !== 'number' || isNaN(v) || v < 0)) {
        bad.neg.push(f.n); return;
      }
      /* Only per-100g rows. A whole meal counted per item is legitimately
         900-odd calories; 900 per hundred grams is denser than pure fat. */
      if ((f.u === 'g' || f.u === 'ml') && f.kcal > 900) bad.kcal.push(f.n + ':' + f.kcal);
      /* Atwater: 4 kcal a gram of protein and carbohydrate, 9 of fat. Every
         real food obeys it to within a few percent — fibre, alcohol, polyols
         and rounding are what the tolerance is for. A row that misses by more
         than that has a transposed digit in it, and no amount of proofreading
         finds those. */
      /* Alcohol carries 7 kcal a gram and is none of the three macros, so a
         drink with any in it will always come up short here. That is chemistry,
         not a typo, and the exemption is by name so it stays visible. */
      if (/beer|lager|ale|cider|wine|spirit|vodka|gin|whisk|rum|tequila|prosecco|champagne/i.test(f.n)) return;
      const est = f.p * 4 + f.c * 4 + f.f * 9;
      const slack = Math.max(28, f.kcal * 0.22);
      if (Math.abs(est - f.kcal) > slack) {
        bad.atwater.push(`${f.n}: says ${f.kcal}, macros give ${Math.round(est)}`);
      }
    });
    return { n: FOODS.length, bad, groups: [...GROUPS] };
  });
  check('every food row parsed', cat.bad.cols.length === 0, cat.bad.cols.join(', '));
  check('no food name appears twice', cat.bad.dupName.length === 0, cat.bad.dupName.join(', '));
  check('every unit is one the app knows', cat.bad.unit.length === 0, cat.bad.unit.join(', '));
  check('every food is in a real group', cat.bad.group.length === 0, cat.bad.group.join(', '));
  check('every portion is a positive number', cat.bad.per.length === 0, cat.bad.per.join(', '));
  check('no negative or missing macros', cat.bad.neg.length === 0, cat.bad.neg.join(', '));
  check('nothing claims more calories than pure fat', cat.bad.kcal.length === 0, cat.bad.kcal.join(', '));
  /* The one that catches a typo nobody would spot by reading. */
  check('every food\'s calories match its macros',
    cat.bad.atwater.length === 0, cat.bad.atwater.slice(0, 6).join(' | '));
  check('the catalogue is large enough to be worth checking', cat.n > 100, String(cat.n));

  /* ---- the legend explains the ring ----
     It was three lines of text with a coloured dot in front of them, under a
     ring that had just drawn the same three numbers as arcs. The dot carried
     no quantity, so neither half helped you read the other. The bars are the
     arcs unrolled — each macro's own share of its own target, in its own
     colour. What is asserted is that they carry the *same* fraction the ring
     does, because two things drawing one number is exactly where they drift. */
  const legend = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.settings.nutrition = true;
    S.profile.bodyweight = [{ d: today(), w: 80 }];
    S.profile.heightCm = 180; S.profile.birthYear = 1990; S.profile.sex = 'm';
    save(true);
    logFood('f1', 2); logFood('f40', 3);
    save(true); go('fuel');
    const bars = [...document.querySelectorAll('#fuel-body .fuel-leg')].map(el => ({
      tone: el.className.replace('fuel-leg ', '').trim(),
      pct: parseFloat((el.querySelector('.fuel-leg-bar i') || { style: {} }).style.width) || 0,
      colour: getComputedStyle(el.querySelector('.fuel-leg-bar i')).backgroundColor
    }));
    /* Against the ring itself rather than against a recomputed target. The
       claim is that the two drawings agree; recomputing would only prove the
       check can do arithmetic, and it would keep passing if the ring quietly
       started using a different target from the bars. */
    const want = {};
    ['prot', 'carb', 'fat'].forEach(k => {
      const arc = document.querySelector('#fuel-body .fr-arc.' + k);
      if (!arc) return;
      /* The attribute, not the computed style: the arc animates its offset
         from empty on arrival, so a computed read mid-flight is a number about
         the animation rather than about your protein. */
      const len = parseFloat(arc.getAttribute('stroke-dasharray')) || 1;
      const off = parseFloat(arc.getAttribute('stroke-dashoffset')) || 0;
      want[k] = (1 - off / len) * 100;
    });
    return { bars, want, arcs: Object.keys(want).length,
             distinct: new Set(bars.map(b => b.colour)).size };
  });
  check('every macro has a bar', legend.bars.length === 3,
    JSON.stringify(legend.bars.map(b => b.tone)));
  /* Two, not three. The ring is kcal, protein and carbs — fat has no arc and
     never had one, which is why its dot was the grey one and why the legend
     read as though fat were not really being counted. The bar is what counts
     it, and it is the only place fat is drawn at all. */
  check('...and the two macros the ring draws have arcs to agree with',
    legend.arcs === 2, String(legend.arcs));
  check('...carrying the same share the ring draws',
    legend.bars.filter(b => legend.want[b.tone] != null)
      .every(b => Math.abs(b.pct - legend.want[b.tone]) < 1.5),
    legend.bars.map(b => `${b.tone} ${b.pct} vs ${
      legend.want[b.tone] == null ? 'no arc' : legend.want[b.tone].toFixed(1)}`).join(', '));
  check('...and its own colour, fat included',
    legend.distinct === 3, legend.bars.map(b => b.colour).join(' '));

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
