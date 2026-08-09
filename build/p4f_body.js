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
  const wantsMuscle = goals.includes('muscle');
  const wantsLean = goals.includes('lean') || goals.includes('fatloss');

  const p = Math.round(kg * (wantsMuscle ? 1.9 : 1.6));
  const maint = tdee();
  let kcal;
  let basis;
  if (maint) {
    kcal = maint + (wantsMuscle ? 250 : 0) - (wantsLean ? 400 : 0);
    basis = 'from your resting rate';
  } else {
    kcal = Math.round(kg * 33) + (wantsMuscle ? 250 : 0);
    basis = 'estimated from bodyweight alone';
  }
  kcal = Math.max(1200, Math.round(kcal / 10) * 10);
  const f = Math.round((kcal * 0.27) / 9);
  const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
  return { kcal, p, c, f, basis, maint, bmr: bmr() };
}
