/* ============================================================
   BODY DATA & ENERGY
   ------------------------------------------------------------
   Height, age and sex are not vanity fields. Without them a
   calorie target is a guess dressed up as a number — the old one
   was bodyweight × 33, which is the same answer for a 60-year-old
   and a 20-year-old of the same weight.

   With them, Mifflin-St Jeor gives a real resting rate. It is the
   equation the American Dietetic Association found most accurate
   for non-obese adults, and it is still roughly ±10% for any
   individual — so it is presented as a starting point to adjust
   from, never as a fact about you.
   ============================================================ */

const SEXES = [
  { k:'m',  label:'Male',   note:'Used only for the energy equation' },
  { k:'f',  label:'Female', note:'Used only for the energy equation' },
  { k:'na', label:'Rather not say', note:'An average of both is used' }
];

/* The multiplier is about the day around the training, not the training.
   A camera operator on their feet for fourteen hours is not "sedentary"
   because they only lifted three times this week. */
const ACTIVITY = [
  { k:'desk',   label:'Mostly sitting',   f:1.25, note:'Desk work, driving, little walking' },
  { k:'light',  label:'On and off',       f:1.40, note:'Some walking, some standing' },
  { k:'onfeet', label:'On your feet',     f:1.55, note:'Standing or walking most of the day' },
  { k:'heavy',  label:'Physical work',    f:1.75, note:'Carrying, climbing, long shifts' }
];

function profileNum(k) {
  const v = S.profile ? S.profile[k] : null;
  return typeof v === 'number' && !isNaN(v) ? v : null;
}

function setHeight(cm) {
  const n = parseFloat(cm);
  if (isNaN(n) || n < 120 || n > 230) return false;
  S.profile.heightCm = Math.round(n * 10) / 10;
  save(true); return true;
}

function setBirthYear(y) {
  const n = parseInt(y, 10);
  const now = new Date().getFullYear();
  if (isNaN(n) || n < now - 100 || n > now - 13) return false;
  S.profile.birthYear = n;
  save(true); return true;
}

function setSex(k) {
  if (!SEXES.some(x => x.k === k)) return false;
  S.profile.sex = k; save(true); return true;
}

function setActivity(k) {
  if (!ACTIVITY.some(x => x.k === k)) return false;
  S.profile.activity = k; save(true); return true;
}

function ageYears() {
  const y = profileNum('birthYear');
  if (!y) return null;
  return new Date().getFullYear() - y;
}

/* ------------------------------------------------------------
   WHAT AGE ACTUALLY CHANGES

   Two things, and it is worth being precise about which — because most of what
   apps do with your age is not supported by anything.

   **Protein, yes.** Anabolic resistance is well established: the same dose of
   protein produces a smaller muscle-protein-synthesis response in older muscle,
   so the intake that saturates it is higher. Morton's 1.6 g/kg plateau is drawn
   from a trained population with a mean age in the twenties and thirties; the
   PROT-AGE and ESPEN groups put the floor for older adults higher, and higher
   again for those training.

   **Recovery between hard sessions, cautiously.** The scoping review is clear
   that the *functional* evidence is equivocal — four studies found worse
   symptoms in older participants, two found the opposite, and the rest found no
   difference. What it does support is the practical end: three sessions a week,
   48 to 72 hours apart, is enough recovery for most older adults. So the app
   says that where it is relevant and does not silently reshuffle your week for
   it. A recommendation you can read and ignore is honest; a plan quietly
   rebuilt around a number you gave for the energy equation is not.

   **Nothing else.** Not the readiness score, not the rung ladder, not the rep
   ranges. There is no age evidence behind any of those and inventing some would
   be worse than not asking.
   ------------------------------------------------------------ */
const AGE_BANDS = [
  { from: 0,  k: 'young',  protein: 1.6, gap: 0 },
  { from: 50, k: 'mid',    protein: 1.7, gap: 48 },
  { from: 65, k: 'older',  protein: 1.8, gap: 48 }
];

/* Split so onboarding can ask the same question of a draft that has not been
   saved yet. Everything in the running app goes through ageBand(). */
function ageBandAt(a) {
  if (a == null) return AGE_BANDS[0];
  let out = AGE_BANDS[0];
  AGE_BANDS.forEach(b => { if (a >= b.from) out = b; });
  return out;
}
function ageBand() { return ageBandAt(ageYears()); }

/* The gap the evidence supports between two hard sessions, in hours, or 0 when
   age says nothing about it. */
function recoveryGapHours() { return ageBand().gap; }

/* ---------- protein per kilo: one function, two callers ----------
   energyTargets() reads the saved profile and suggestedTargets() reads the
   onboarding draft, but the multiplier is the same judgement and it was
   written out twice. Two call sites that can disagree eventually will.

   Cutting is the highest of the three because that is what the evidence says:
   under an energy deficit with training, 1.8–2.7 g/kg is the supported range
   and 2.4 g/kg beat 1.2 g/kg for holding lean mass. 2.2 sits deliberately
   mid-range — this is a number an app hands to someone unsupervised, so it
   should be defensible rather than maximal.

   The age band is a floor, not an alternative. It only ever raises the
   number, and it is why an older lifter who did not tick "build muscle" no
   longer gets the same 1.6 as a twenty-year-old — which is what the age
   screen has been promising all along while nothing implemented it. */
function proteinPerKg(goals, band) {
  const g = goals || [];
  const wantsLean = g.includes('lean') || g.includes('fatloss');
  const goalP = wantsLean ? 2.2 : g.includes('muscle') ? 1.9 : 1.6;
  return Math.max(goalP, (band || ageBand()).protein);
}

/* The daily energy move, as a signed number. A deficit and a bulking surplus
   are mutually exclusive answers to the same question, so picking both does
   not average them: fat loss wins, because it is the one with a floor under
   it and the one somebody is more likely to be hurt by getting wrong. */
function energyDelta(goals) {
  const g = goals || [];
  if (g.includes('lean') || g.includes('fatloss')) return -400;
  return g.includes('muscle') ? 250 : 0;
}

/* Whether the week has two hard days touching, and which. Says it, never fixes
   it — a plan quietly rebuilt around a number you gave for the energy equation
   is not something you asked for, and the evidence is not strong enough to
   spend your Tuesday on. Returns null when age says nothing, when nothing
   touches, or when the days in question are not the heavy kind: a recovery day
   next to a full session is the spacing working, not a warning. */
function backToBackHard() {
  const gap = recoveryGapHours();
  if (!gap || !S.week || !S.week.plan) return null;
  const hard = k => {
    const p = S.week.plan[k];
    if (!p || p.done || p.elsewhere || p.type === 'recovery') return false;
    return availOf(dayConstraint(k).avail).mins >= 40;
  };
  const start = weekStart();
  for (let i = 0; i < 6; i++) {
    const a = dk(addDays(start, i)), b = dk(addDays(start, i + 1));
    /* Only ahead of you. Telling someone their Monday and Tuesday were too
       close together on a Thursday is a lecture, not a plan. */
    if (daysBetween(b, today()) > 0) continue;
    if (hard(a) && hard(b)) return { a, b, gap };
  }
  return null;
}

/* ---------- height display ---------- */
function heightLabel() {
  const cm = profileNum('heightCm');
  if (!cm) return null;
  if (S.profile.units === 'lb') {
    const inches = cm / 2.54;
    const ft = Math.floor(inches / 12);
    const inch = Math.round(inches - ft * 12);
    return inch === 12 ? (ft + 1) + '′ 0″' : ft + '′ ' + inch + '″';
  }
  return Math.round(cm) + ' cm';
}

/* ---------- Mifflin-St Jeor ---------- */
function bmr() {
  const kg = bodyKg();
  const cm = profileNum('heightCm');
  const age = ageYears();
  if (!kg || !cm || !age) return null;
  const base = 10 * kg + 6.25 * cm - 5 * age;
  const sex = S.profile.sex;
  const offset = sex === 'm' ? 5 : sex === 'f' ? -161 : -78;   // 'na' splits the difference
  return Math.round(base + offset);
}

function activityFactor() {
  const a = ACTIVITY.find(x => x.k === S.profile.activity);
  return a ? a.f : 1.40;
}

function tdee() {
  const b = bmr();
  if (!b) return null;
  return Math.round(b * activityFactor() / 10) * 10;
}

/* What is still missing before the energy numbers mean anything. */
function bodyGaps() {
  const gaps = [];
  if (!bodyKg()) gaps.push('bodyweight');
  if (!profileNum('heightCm')) gaps.push('height');
  if (!ageYears()) gaps.push('age');
  if (!S.profile.sex) gaps.push('sex');
  return gaps;
}

function profileCompleteness() {
  const checks = [
    ['name',      !!(S.profile.name || '').trim()],
    ['bodyweight', !!bodyKg()],
    ['height',    !!profileNum('heightCm')],
    ['age',       !!ageYears()],
    ['sex',       !!S.profile.sex],
    ['day job',   !!S.profile.activity],
    ['sleep',     !!profileNum('sleepNorm')],
    ['session length', !!profileNum('sessionMins')],
    ['goals',     !!(S.profile.goals || []).length],
    ['where you train', !!(S.profile.envs || []).length]
  ];
  const done = checks.filter(c => c[1]).length;
  return { done, total: checks.length, missing: checks.filter(c => !c[1]).map(c => c[0]) };
}

/* ---------- targets, now actually personalised ----------
   Protein is set per kilo of bodyweight because that is what the evidence
   supports; energy comes off the measured resting rate rather than a flat
   multiple of weight. */
function energyTargets() {
  const kg = bodyKg();
  if (!kg) return null;
  const goals = S.profile.goals || [];

  const p = Math.round(kg * proteinPerKg(goals));
  const maint = tdee();
  let kcal;
  let basis;
  if (maint) {
    kcal = maint + energyDelta(goals);
    basis = 'from your resting rate';
  } else {
    kcal = Math.round(kg * 33) + energyDelta(goals);
    basis = 'estimated from bodyweight alone';
  }
  /* Never under the resting rate. A deficit taken off a low maintenance can
     land below what the body burns lying still, and that is the point where an
     unsupervised target stops being a diet and starts being a problem — the
     flat 1200 alone does not catch it, because a small sedentary person can
     have a maintenance under 1600 and clear 1200 comfortably on the way down. */
  const rest = bmr();
  kcal = Math.max(1200, rest || 0, Math.round(kcal / 10) * 10);
  kcal = Math.round(kcal / 10) * 10;
  const f = Math.round((kcal * 0.27) / 9);
  const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
  return { kcal, p, c, f, basis, maint, bmr: bmr() };
}
