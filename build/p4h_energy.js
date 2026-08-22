/* ============================================================
   ADAPTIVE EXPENDITURE
   ------------------------------------------------------------
   A formula estimate is a population average with wide error
   bars on any one person. Your own weight change against your
   own logged intake is a direct measurement of the same thing.

   TDEE = mean intake − (change in stored energy ÷ days)

   Weight is trended with an exponential moving average first,
   because day-to-day scale movement is mostly water and gut
   content. 7,700 kcal per kg of body mass is the conventional
   figure; it is an approximation that assumes the change is
   mostly fat, so it drifts during rapid gain or a first week
   of glycogen loading.

   Honest about the evidence: MacroFactor popularised this and
   publishes accuracy data showing it beats formula estimates,
   but that analysis is theirs and has not been independently
   replicated. The logic is sound — a measurement should beat an
   average — so this is offered alongside the formula rather
   than silently replacing it.
   ============================================================ */

const KCAL_PER_KG = 7700;
const ADAPT_MIN_DAYS = 10;      // below this the noise swamps the signal

/* Weights are logged irregularly. Fill forward, then smooth. */
function trendedWeights(days) {
  const out = [];
  let last = null;
  const log = (S.profile.bodyweight || []).slice().sort((a, b) => a.d < b.d ? -1 : 1);
  const byDate = {};
  log.forEach(e => { byDate[e.d] = e.w; });
  for (let i = days - 1; i >= 0; i--) {
    const k = dk(addDays(today(), -i));
    if (byDate[k] != null) last = byDate[k];
    out.push({ d: k, raw: byDate[k] != null ? byDate[k] : null, w: last });
  }
  if (out.every(x => x.w == null)) return [];
  /* backfill the head so the series starts somewhere real */
  const firstReal = out.find(x => x.w != null);
  out.forEach(x => { if (x.w == null) x.w = firstReal.w; });
  /* EMA — recent days weighted more, without chasing a single bad morning */
  const a = 0.25;
  let ema = out[0].w;
  out.forEach(x => { ema = a * x.w + (1 - a) * ema; x.trend = Math.round(ema * 100) / 100; });
  return out;
}

function intakeOn(kIn) {
  const d = S.nutrition.days[key(kIn)];
  if (!d || !d.items || !d.items.length) return null;
  return d.items.reduce((a, i) => a + (+i.kcal || 0), 0);
}

/* Always returns a verdict object — never null — because every caller
   wants to know *why* it can't say anything yet, and a null forces each
   of them to invent that answer separately. */
function adaptiveTdee(windowDays) {
  const days = windowDays || 21;
  const w = trendedWeights(days);

  const logged = [];
  let fasted = 0;
  for (let i = days - 1; i >= 0; i--) {
    const k = dk(addDays(today(), -i));
    if (fastingOn(k)) { fasted++; continue; }
    const kcal = intakeOn(k);
    if (kcal != null && kcal > 500) logged.push({ d: k, kcal });
  }
  /* A fast inside the window breaks this method, and dropping the fasted days
     from the intake mean is not enough to save it — which is exactly what the
     `kcal > 500` filter above was already doing by accident.

     The estimate is intake measured against what the scale did. Fasted days
     leave the mean but stay in the SPAN, so the weight lost across them gets
     attributed to the days you ate. Measured on a 21-day window with steady
     2600 kcal: a two-day fast at the end moved the answer from 2730 to 3100.
     The app would have told someone to eat 370 more a day, immediately after
     a fast, and that number feeds their calorie target.

     Excluding the days from the span instead would only trade one error for a
     smaller one, because most of what a fast takes off is glycogen water and
     it comes back. So it refuses, and says why — the same thing it already
     does with an implausible answer. It comes back on its own once the fast is
     far enough behind you to be out of the window. */
  if (fasted) {
    return { ready: false, have: logged.length, need: ADAPT_MIN_DAYS,
             why: 'fasted', fastedDays: fasted };
  }
  if (logged.length < ADAPT_MIN_DAYS) {
    return { ready: false, have: logged.length, need: ADAPT_MIN_DAYS, noWeight: !w.length };
  }
  /* Food alone isn't enough — the whole method is intake measured against
     what the scale did, so with no weigh-ins there is nothing to measure. */
  if (!w.length) {
    return { ready: false, have: logged.length, need: ADAPT_MIN_DAYS, noWeight: true };
  }

  const first = w[0], last = w[w.length - 1];
  if (first.trend == null || last.trend == null) return { ready: false, have: logged.length, need: ADAPT_MIN_DAYS };

  const kgPerUnit = S.profile.units === 'lb' ? 0.45359237 : 1;
  const deltaKg = (last.trend - first.trend) * kgPerUnit;
  const span = days - 1;
  const meanIntake = logged.reduce((a, x) => a + x.kcal, 0) / logged.length;
  const storedPerDay = (deltaKg * KCAL_PER_KG) / span;
  const est = Math.round((meanIntake - storedPerDay) / 10) * 10;

  /* Refuse to report a physiologically silly answer — that means the inputs
     are wrong (missed logging days, a scale change), not that you burn 900. */
  if (est < 1000 || est > 6000) {
    return { ready: false, have: logged.length, need: ADAPT_MIN_DAYS, implausible: est, why: 'range' };
  }

  /* And refuse when the measurement disagrees violently with the formula.
     Mifflin-St Jeor is only good to about ±10% on an individual, so a gap
     this wide is not a person with an unusual metabolism — it is almost
     always under-logging, which the self-report literature finds runs at
     roughly 20–30% and is the single most common fault in food diaries.
     Reporting 1,040 kcal with a straight face would send someone to eat
     less on the strength of days they simply forgot to finish. */
  const formula = tdee();
  if (formula && Math.abs(est - formula) / formula > 0.35) {
    return {
      ready: false, have: logged.length, need: ADAPT_MIN_DAYS,
      implausible: est, why: est < formula ? 'under-logging' : 'over-logging', formula
    };
  }

  return {
    ready: true, tdee: est, days: span, loggedDays: logged.length,
    meanIntake: Math.round(meanIntake),
    weightChange: Math.round((last.trend - first.trend) * 100) / 100,
    coverage: Math.round(logged.length / days * 100)
  };
}

/* ---------- weekly framing ----------
   Daily totals invite a perfect-adherence mindset that the eating-behaviour
   literature associates with rigid restraint. The week is the unit that
   actually determines an outcome, so it is the unit shown first. */
function weekIntake(offset) {
  const start = -(offset || 0) * 7;
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const k = dk(addDays(today(), start - i));
    const kcal = intakeOn(k);
    const d = S.nutrition.days[k];
    const p = d && d.items ? d.items.reduce((a, x) => a + (+x.p || 0), 0) : 0;
    days.push({ d: k, kcal, p: Math.round(p), logged: kcal != null, fast: fastingOn(k) });
  }
  /* Fasted days are neither logged nor missing — they are accounted for. Left
     in the "not logged" pile the week reads "5 of 7", which is what forgetting
     looks like, on a week where nothing was forgotten. */
  const withData = days.filter(x => x.logged && !x.fast);
  return {
    days,
    fastedDays: days.filter(x => x.fast).length,
    loggedDays: withData.length,
    avgKcal: withData.length ? Math.round(withData.reduce((a, x) => a + x.kcal, 0) / withData.length) : null,
    avgP: withData.length ? Math.round(withData.reduce((a, x) => a + x.p, 0) / withData.length) : null
  };
}

/* ---------- protein-first mode ----------
   Morton et al. 2018 (49 studies, 1,863 trained participants) put the
   plateau for resistance-training gains at about 1.6 g/kg/day, with the
   confidence interval reaching 2.2. It is the single most outcome-relevant
   number for someone training to gain muscle.

   Hiding calories entirely is offered because clinicians and users have
   asked other apps for exactly this and been given half-measures. The
   evidence on tracking and disordered eating is a consistent association
   with weak causal support — but the RCTs that found no harm all excluded
   people already at risk, which is precisely the group that matters here.
   Making it one switch is cheap insurance. */
function proteinOnly() { return !!(S.settings && S.settings.proteinOnly); }

function proteinTarget() {
  const kg = bodyKg();
  if (!kg) return null;
  const tg = S.nutrition.targets || {};
  if (tg.p > 0) return tg.p;
  const e = energyTargets();
  /* No age adjustment *here*, because it belongs one level down: the floor
     lives in proteinPerKg() and this reads it through energyTargets().

     Older muscle is anabolically resistant — the same dose produces a smaller
     synthesis response — so every age-adjusted guideline puts the floor for an
     older adult above the 1.6 g/kg that Morton's plateau gives a trained
     twenty-something.

     This note used to say the floor was dead code, and at the time it was:
     the model gave 1.9 g/kg to everyone it could compute for, which already
     cleared the highest of those guidelines. That stopped being true when the
     base became goal-dependent. Anyone who does not choose "build muscle" now
     starts at 1.6, and for them the age band is the only thing standing
     between a seventy-year-old and a twenty-year-old's number — so it binds,
     and engine.mjs asserts it does at every band rather than merely that the
     result clears the floor by luck.

     What age also changes is on the training side — see backToBackHard(). */
  return e ? e.p : Math.round(kg * 1.6);
}


/* ============================================================
   FASTS
   ------------------------------------------------------------
   A self-imposed fast — a water fast, a 48-hour, the fasting half of 5:2.
   Not Ramadan: that is a daily eating WINDOW rather than a run of days with
   nothing in them, and it wants different machinery.

   STORED AS RANGES, and that is the load-bearing decision. The obvious model
   is a flag per day — `nutrition.days[k].fast` — and it falls over on the
   second day: a fast that starts on Tuesday and ends on Thursday would need
   Wednesday marking by something, and the only thing that runs on Wednesday is
   a render. Renders in this app must not write to the save (see the note on
   Today seeding its own session), so the flag would either be missing or the
   rule would be broken. A range is written once when you start, closed once
   when you stop, and every day inside it is derived.

   `to: null` means the fast is still running. Absent `fasts` means none ever,
   so no save needs migrating.

   No streak, and there will not be one. This app keeps exactly one — water —
   and refuses them everywhere else on purpose. A fitness app that rewards
   consecutive days of not eating is a different and worse product, and the
   distance between "here is where you are" and "here is a run to protect" is
   the whole of it. Same reason nothing here congratulates a low day. */
function fastList() {
  if (!S.nutrition.fasts) S.nutrition.fasts = [];
  return S.nutrition.fasts;
}

/* The one still running, or null. There can only be one: startFast closes any
   open range before opening a new one, so two overlapping fasts cannot exist
   to disagree about which day belongs to which. */
function openFast() {
  return fastList().find(f => f && f.from && !f.to) || null;
}

/* Whole days only. Everything in this app is keyed 'YYYY-MM-DD' and a fast
   that began at 8pm still leaves the next day with nothing eaten in it, which
   is the thing the day's numbers care about. The hours are reported separately
   and precisely — see fastHours() — because that is the number a water fast is
   actually measured in. */
function fastingOn(kIn) {
  const k = key(kIn);
  /* Inside a range AND nothing eaten on it. Breaking a fast at six in the
     evening makes today an eating day — a low one — rather than a fast that
     somehow contains six hundred calories, and the days before it stay fasted
     on their own with no special case for the one you broke it on.

     It also means the flag can never contradict the food log, which is the
     failure the first version had: end the fast, eat, and the day still drew
     itself banked because `to` was set to today and today was still inside the
     range. Deriving from both facts leaves nothing to keep in step. */
  if (intakeOn(k) != null) return false;
  return fastList().some(f => {
    if (!f || !f.from) return false;
    /* `today()` already returns a key; dk() takes a Date. Passing one to the
       other is the silent-miss this codebase has a fragile-areas note about,
       and it threw here rather than missing only because dk() reaches straight
       for getFullYear. Both ends normalise through key(). */
    const a = key(dk(new Date(f.from)));
    const b = f.to ? key(dk(new Date(f.to))) : today();
    return k >= a && k <= b;
  });
}

function startFast(atMs) {
  const now = atMs || Date.now();
  const open = openFast();
  if (open) return open;                       // already going; do not restart it
  const f = { from: now, to: null };
  fastList().push(f);
  save(true);
  return f;
}

function endFast(atMs) {
  const open = openFast();
  if (!open) return null;
  open.to = atMs || Date.now();
  save(true);
  return open;
}

/* Hours into the fast that is running, or null. Reported plainly and never as
   an achievement: a water fast is measured in hours and you need to know where
   you are in it, which is a different thing from being told well done. */
function fastHours() {
  const f = openFast();
  if (!f) return null;
  return Math.max(0, (Date.now() - f.from) / 3600000);
}

/* One neutral line at the point where an extended fast stops being an ordinary
   one. Not a warning banner and not a nudge to stop — this app does not
   moralise and has no business having a view on someone's fast. But going
   quiet about a genuine threshold is its own kind of dishonesty, and the note
   is the same shape as the research notes elsewhere in Fuel: a fact, once,
   with no verdict attached. */
function fastNote(hours) {
  if (hours == null) return '';
  if (hours >= 72) return 'Past three days. Extended fasts are usually done with medical supervision.';
  if (hours >= 48) return 'Past two days.';
  return '';
}
