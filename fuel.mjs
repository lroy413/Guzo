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
