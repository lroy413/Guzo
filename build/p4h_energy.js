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
  for (let i = days - 1; i >= 0; i--) {
    const k = dk(addDays(today(), -i));
    const kcal = intakeOn(k);
    if (kcal != null && kcal > 500) logged.push({ d: k, kcal });
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
    days.push({ d: k, kcal, p: Math.round(p), logged: kcal != null });
  }
  const withData = days.filter(x => x.logged);
  return {
    days,
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
  return e ? e.p : Math.round(kg * 1.6);
}

