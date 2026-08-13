/* ============================================================
   WATER
   ------------------------------------------------------------
   Logged in millilitres, always, whatever the screen shows. A store that
   changes units is a store that needs migrating every time somebody flips a
   setting, and the app already has one of those in weights — this one is a
   fixed unit with a formatter in front of it, which is the shape that should
   have been used there.
   ============================================================ */

const ML_PER_OZ = 29.5735;

/* Water reads in fluid ounces or millilitres, and unlike distance this is
   derived from the weight unit rather than given a setting of its own. The US
   fluid ounce is essentially US-only and the US weighs in pounds, so the two
   travel together — where kilos-and-miles is an ordinary pairing across
   Britain, kilos-and-fluid-ounces is nobody's. */
function waterUnit() { return (S.profile && S.profile.units === 'lb') ? 'oz' : 'ml'; }

function waterStore() {
  if (!S.nutrition) S.nutrition = {};
  if (!S.nutrition.water) S.nutrition.water = { days: {}, goal: null, best: 0 };
  if (!S.nutrition.water.days) S.nutrition.water.days = {};
  return S.nutrition.water;
}

function waterOn(k) { return +(waterStore().days[key(k || today())] || 0); }

/* ------------------------------------------------------------
   What to aim for.

   There is no single right number and anyone who quotes one to three
   significant figures is selling something. Two things are defensible and
   both are used here:

   - Roughly 30–35 ml per kilo of bodyweight a day, total water. The midpoint
     is taken, and it is clamped at both ends because the linear form stops
     being sensible at the extremes.
   - Around 500 ml per hour of training on top, which is the middle of the
     range ACSM gives for sweat replacement.

   Food carries a fifth to a third of your total water and this target does
   not try to model that, so it is deliberately a *drinks* target that sits at
   the low end of the total-water figures rather than a number pretending to
   be your whole intake. The screen says so rather than hiding it.

   With no bodyweight logged there is nothing to scale from, so it falls back
   to a flat figure rather than inventing a weight.
   ------------------------------------------------------------ */
const WATER_ML_PER_KG = 33;
const WATER_ML_PER_TRAINING_HOUR = 500;
const WATER_FLOOR = 1500, WATER_CEIL = 4000;

function waterBaseGoal() {
  const bw = (S.profile.bodyweight || []).slice(-1)[0];
  if (!bw || !(+bw.w > 0)) return 2000;
  /* Stored weights are in whatever unit was showing when they were written,
     so this converts rather than assuming kilos — the same trap the one-rep
     max estimate fell into. */
  const kg = S.profile.units === 'lb' ? +bw.w / LB_PER_KG : +bw.w;
  return Math.max(WATER_FLOOR, Math.min(WATER_CEIL, Math.round(kg * WATER_ML_PER_KG / 50) * 50));
}

/* Minutes trained on a given day, from what was actually logged. */
function trainedMinutes(k) {
  const kk = key(k || today());
  return (S.sessions || []).filter(s => s.ended && s.date === kk)
    .reduce((a, s) => a + (+s.dur || 0), 0);
}

function waterGoal(k) {
  const w = waterStore();
  /* An explicit goal is yours and the training top-up still applies to it —
     you do not sweat less because you typed a number. */
  const base = (+w.goal > 0) ? +w.goal : waterBaseGoal();
  const mins = trainedMinutes(k);
  const bonus = Math.round(mins / 60 * WATER_ML_PER_TRAINING_HOUR / 50) * 50;
  return { base, bonus, total: base + bonus, mins };
}

function waterPct(k) {
  const g = waterGoal(k).total;
  if (!(g > 0)) return 0;
  return Math.max(0, Math.round(waterOn(k) / g * 100));
}

function logWater(ml, k) {
  const kk = key(k || today());
  const w = waterStore();
  const next = Math.max(0, Math.round((+w.days[kk] || 0) + (+ml || 0)));
  if (next === 0) delete w.days[kk]; else w.days[kk] = next;
  save();
  return next;
}

function setWater(ml, k) {
  const kk = key(k || today());
  const w = waterStore();
  const v = Math.max(0, Math.round(+ml || 0));
  if (v === 0) delete w.days[kk]; else w.days[kk] = v;
  save();
  return v;
}

function setWaterGoal(ml) {
  const w = waterStore();
  const v = Math.round(+ml || 0);
  w.goal = v > 0 ? Math.max(500, Math.min(6000, v)) : null;
  save(true);
}

/* ------------------------------------------------------------
   The streak.

   The app has no streak counter anywhere else and says so on purpose: nothing
   goes red, a missed day is free. This one was asked for by name, so the rule
   it has to obey instead is that it may never be a stick.

   Two things make that true. **Today cannot break it** — the count runs back
   from yesterday and today is only ever added once it is met, so an afternoon
   with three glasses in it is never a broken chain, it is a day in progress.
   And a break is not an event: there is no "you lost it", the number simply
   starts again and your best is kept beside it, so the good run still
   happened. What you did last month does not stop being true.
   ------------------------------------------------------------ */
function waterMet(k) {
  const kk = key(k);
  const g = waterGoal(kk).total;
  return g > 0 && waterOn(kk) >= g;
}

function waterStreak() {
  let n = 0;
  const t = fromKey(today());
  if (waterMet(today())) n++;
  /* From yesterday backwards. A day that has not finished cannot have been
     missed, so the walk starts behind today whether or not today counted. */
  for (let i = 1; i <= 400; i++) {
    if (!waterMet(dk(addDays(t, -i)))) break;
    n++;
  }
  return n;
}

/* Kept rather than recomputed: the goal moves with your bodyweight and with
   what you trained, so a run met against last year's target would stop being
   a run the moment either changed. A best you have already earned should not
   be taken back by arithmetic. */
function noteWaterBest() {
  const w = waterStore();
  const n = waterStreak();
  if (n > (+w.best || 0)) { w.best = n; save(); }
  return +w.best || 0;
}

/* ------------------------------------------------------------
   Units, in and out.
   ------------------------------------------------------------ */
function mlToUnit(ml) {
  return waterUnit() === 'oz' ? +ml / ML_PER_OZ : +ml;
}
function unitToMl(v) {
  return waterUnit() === 'oz' ? +v * ML_PER_OZ : +v;
}

/* Litres once it is worth reading as litres. "1750 ml" is a number you have to
   parse; "1.75 L" is a quantity you can picture. Ounces stay whole — nobody
   pours 12.4 fl oz. */
function fmtWater(ml) {
  const v = +ml || 0;
  if (waterUnit() === 'oz') return Math.round(v / ML_PER_OZ) + ' oz';
  if (v >= 1000) return (Math.round(v / 100) / 10).toFixed(1).replace(/\.0$/, '') + ' L';
  return Math.round(v) + ' ml';
}
function waterUnitLabel() { return waterUnit() === 'oz' ? 'oz' : 'ml'; }

/* The quick pours. Real vessels rather than round numbers: a glass, a bottle,
   a big bottle. In ounces they are the sizes those things are actually sold
   in, not a conversion of the millilitre ones — 8.5 oz is not a cup. */
function waterPours() {
  return waterUnit() === 'oz'
    ? [{ ml: 8 * ML_PER_OZ, label: 'Glass', sub: '8 oz' },
       { ml: 16 * ML_PER_OZ, label: 'Bottle', sub: '16 oz' },
       { ml: 32 * ML_PER_OZ, label: 'Flask', sub: '32 oz' }]
    : [{ ml: 250, label: 'Glass', sub: '250 ml' },
       { ml: 500, label: 'Bottle', sub: '500 ml' },
       { ml: 1000, label: 'Flask', sub: '1 L' }];
}

/* The last seven days ending today, for the strip under the bottle. Trailing,
   not the calendar week — the same shape the Fuel chart uses, and for the same
   reason: a Monday should not show you five empty columns. */
function waterWeek() {
  const t = fromKey(today());
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const kk = dk(addDays(t, -i));
    const g = waterGoal(kk).total;
    out.push({ d: kk, ml: waterOn(kk), goal: g, met: g > 0 && waterOn(kk) >= g });
  }
  return out;
}
