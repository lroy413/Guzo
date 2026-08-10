/* ============================================================
   STATE
   ============================================================ */
let S = null;

function blank() {
  return {
    v: VERSION,
    onboarded: false,
    profile: { name:'', units:'kg', goals:['strength','muscle'], level:'some',
               envs:['full'], programId:'anchor3', bodyweight:[],
               injuries:[], priorities:[], sleepNorm:7.5, sessionMins:60, dayStart:0,
               cardio:{ amount:'light', modes:['car-walk'] },
               gear:{ barbell:true, rack:true, bench:true, dumbbells:true, kettlebells:true, cables:true,
                      machines:true, pullupBar:true, bands:true, cardioKit:true } },
    settings: { nutrition:false, restMain:150, restAcc:75, autoRest:true, warmup:true, lineIdx:0 },
    week: { start:null, days:{}, plan:{} },
    readiness: {},
    sessions: [],
    active: null,
    lifts: {},
    nutrition: { targets:{ kcal:2600, p:170, c:280, f:80 }, days:{} },
    billing: { pro:false, plan:null, trialStart:null },
    journey: { reached:{} },
    daily: {},
    videos: {},
    routines: [],
    meta: { created:new Date().toISOString(), lastOpen:null }
  };
}

function load() {
  try {
    let raw = localStorage.getItem(KEY);

    /* Carry over anything saved under an earlier name — a rebrand must never
       cost someone their training history. This deliberately triggers when the
       current key merely holds an EMPTY state, not only when it is absent:
       opening the app once before restoring would otherwise orphan the old
       save behind a blank one. */
    const meaningful = v => {
      if (!v) return false;
      try { const o = JSON.parse(v); return !!(o && (o.onboarded || (o.sessions || []).length)); }
      catch (e) { return false; }
    };
    if (!meaningful(raw)) {
      for (const old of LEGACY_KEYS) {
        const legacy = localStorage.getItem(old);
        if (meaningful(legacy)) { raw = legacy; localStorage.setItem(KEY, legacy); break; }
      }
    }
    if (!raw) { S = blank(); return false; }
    const parsed = JSON.parse(raw);
    S = Object.assign(blank(), parsed);
    S.profile = Object.assign(blank().profile, parsed.profile || {});
    S.settings = Object.assign(blank().settings, parsed.settings || {});
    S.nutrition = Object.assign(blank().nutrition, parsed.nutrition || {});
    S.week = Object.assign(blank().week, parsed.week || {});
    return true;
  } catch (e) {
    console.warn('load failed', e);
    S = blank();
    return false;
  }
}

let saveTimer = null;
let STORAGE_OK = true, storageWarned = false;

/* Some contexts — an embedded preview pane, private mode with a full quota —
   hand back a localStorage that throws on write. The app should still run;
   it just has to be honest that nothing is being kept. */
function storageProbe() {
  try {
    localStorage.setItem('guzo.probe', '1');
    localStorage.removeItem('guzo.probe');
    return true;
  } catch (e) { return false; }
}

function save(now) {
  const write = () => {
    try { localStorage.setItem(KEY, JSON.stringify(S)); STORAGE_OK = true; mirrorToNative(); }
    catch (e) {
      STORAGE_OK = false;
      if (!storageWarned) { storageWarned = true; toast('Preview only — nothing is being saved'); }
    }
  };
  if (now) { clearTimeout(saveTimer); write(); return; }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(write, 260);
}

/* ============================================================
   DATE HELPERS
   ============================================================ */
const DAYNAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function dk(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function fromKey(k) { const p = k.split('-').map(Number); return new Date(p[0], p[1]-1, p[2]); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
/* addDays returns a Date; every store in the app is keyed by 'YYYY-MM-DD'.
   Passing one where the other is expected fails silently — the lookup just
   misses — so anything that takes a date key normalises through here. */
function key(k) { return typeof k === 'string' ? k : dk(k); }

/* Where your day actually ends.
   ------------------------------
   Midnight is a convention, not a fact about people. Come off a shoot at 2am
   and train before bed and that session belongs to the day you have been awake
   for — the calendar has rolled over, you have not. Worse for anyone training
   twice: the morning session lands on Monday and the one after the same shift
   lands on Tuesday, so one real day reads as two half-empty ones and the
   second session never joins the first.

   `dayStart` is the hour your day rolls over. 0 is the ordinary calendar day
   and is the default, because shifting everyone's dates on a guess would be a
   far worse bug than the one this fixes.

   Deliberately applied inside today() rather than at the call sites. today() is
   the single clock the whole app reads — the week, the plan, readiness, what
   you ate, what you logged — so moving the boundary here moves all of them
   together, and nothing downstream has to know this setting exists. Anywhere
   that needs the wall clock instead (the greeting, a timestamp) is reading
   hours or Date.now() and is untouched. */
function dayStartHour() {
  const n = (typeof S !== 'undefined' && S && S.profile) ? +S.profile.dayStart : 0;
  return n > 0 && n <= 6 ? Math.floor(n) : 0;
}

function today() {
  const cut = dayStartHour();
  if (!cut) return dk();
  const d = new Date();
  d.setHours(d.getHours() - cut);
  return dk(d);
}

/* The wall clock has passed midnight but your day has not. The app must say so
   where it shows a date, or it just looks like it has the wrong one. */
function inLateWindow() { return dayStartHour() > 0 && dk() !== today(); }

/* Whether to offer the setting after a session. True only while the boundary
   is still midnight, the question has never been answered, and it is the small
   hours — the one moment the problem is visible rather than abstract. */
function lateFinishHint() {
  if (dayStartHour() > 0) return false;
  if (S && S.profile && S.profile.dayStartSeen) return false;
  /* Not `h` — that is the escaping helper, and shadowing it in a file full of
     template strings is a trap waiting for the next person. */
  const hr = new Date().getHours();
  return hr >= 0 && hr < 5;
}
/* Defaults through today() rather than reading the clock a second time. The
   two used to be independent sources of "now": pinning today() in a fixture
   left weekStart() still on the real clock, so a test pinned to a Tuesday
   silently drifted into a different week whenever the real date crossed a
   Monday. It happened to be correct on the day it was written, which is the
   worst kind of correct. One clock, one entry point — stub today() and
   everything downstream moves with it. */
function weekStart(d) {
  d = d || fromKey(today());
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - dow);
  x.setHours(0,0,0,0);
  return x;
}
/* Signed, and defensive about rubbish input.
   ------------------------------------------------------------------
   There used to be a second copy of this in the plate module, added to stop
   a malformed date from crashing the whole train screen. It clamped the
   result with Math.max(0, ...) so "how long ago" could never come out
   negative — and because that file loads later, ITS declaration won for the
   entire app. Every past-or-future test in the codebase silently lost the
   ability to see the past: relDate called every old date "Today", and the
   catch-up sheet offered days that had not happened yet.

   One definition. Defensive, because the crash it was guarding against was
   real — but signed, because direction is the whole point of the function.
   Callers that genuinely want a non-negative age clamp at the call site. */
function daysBetween(a, b) {
  try {
    if (typeof a !== 'string' || typeof b !== 'string') return 0;
    const d = (fromKey(b) - fromKey(a)) / 86400000;
    return isNaN(d) ? 0 : Math.round(d);
  } catch (e) { return 0; }
}
function prettyDate(k) { const d = fromKey(k); return DAYNAMES[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; }
function relDate(k) {
  const diff = daysBetween(today(), k);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < 0 && diff > -7) return Math.abs(diff) + ' days ago';
  return prettyDate(k);
}

/* ============================================================
   UNITS
   ============================================================ */
function unit() { return S.profile.units; }
function inc(pattern) {
  const lower = ['squat','hinge','lunge','calves'].includes(pattern);
  if (unit() === 'kg') return lower ? 5 : 2.5;
  return lower ? 10 : 5;
}
function roundW(w) {
  if (w == null) return null;
  const step = unit() === 'kg' ? 2.5 : 5;
  return Math.max(0, Math.round(w / step) * step);
}
function fmtW(w) {
  if (w == null || w === '' || isNaN(w)) return '—';
  return (Math.round(w * 10) / 10) + '';
}

/* ============================================================
   READINESS
   Manual check-in is the primary channel here by design: no API
   reports a 14-hour shoot day, a hotel room, or a bad night in a van.
   ============================================================ */
function readinessScore(r) {
  if (!r) return null;
  // Scored against YOUR normal night, not a textbook eight hours. Six hours
  // is a catastrophe for one person and an ordinary Tuesday for another.
  const norm = (S.profile && S.profile.sleepNorm) || 7.5;
  const floor = norm - 3;
  const sleepPts = Math.max(0, Math.min(1, (r.sleepH - floor) / (norm - floor))) * 30;
  const qualPts  = ((r.sleepQ - 1) / 4) * 20;
  const enPts    = ((r.energy - 1) / 4) * 25;
  const sorePts  = ((5 - r.sore) / 4) * 15;
  const strPts   = ((5 - r.stress) / 4) * 10;
  return Math.round(sleepPts + qualPts + enPts + sorePts + strPts);
}
function readinessBand(score) {
  if (score == null) return { k:'unknown', label:'Not checked in', color:'muted' };
  if (score >= 72) return { k:'strong',  label:'Good to push',  color:'teal' };
  if (score >= 55) return { k:'ok',      label:'Solid',         color:'teal' };
  if (score >= 38) return { k:'low',     label:'Running low',   color:'amber' };
  return { k:'flat', label:'Depleted', color:'rose' };
}
function suggestRung(score, minutes) {
  let byScore = 'full';
  if (score != null) {
    if (score < 34) byScore = 'short';
    else if (score < 52) byScore = 'trim';
  }
  let byTime = 'full';
  if (minutes != null) {
    const ratio = minutes / baseMins();
    if (ratio <= 0.12) byTime = 'micro';
    else if (ratio <= 0.45) byTime = 'short';
    else if (ratio <= 0.78) byTime = 'trim';
  }
  const order = ['full','trim','short','micro'];
  return order[Math.max(order.indexOf(byScore), order.indexOf(byTime))];
}

/* ============================================================
   AVAILABILITY (weekly constraint intake)
   ============================================================ */
/* Everything scales off ONE number: the length of your ordinary session.
   "A normal day" means your normal, not a hardcoded 45 minutes. */
function baseMins() {
  const m = S && S.profile && S.profile.sessionMins;
  return m > 0 ? m : 60;
}
function r5(n) { return Math.max(5, Math.round(n / 5) * 5); }

const AVAIL = {
  long:   { k:'long',   label:'Plenty of time', short:'Plenty', lvl:3, ico:'🟢',
            mins: b => Math.min(105, r5(b * 1.35)),
            note: m => `${m} minutes or more. A day off, or a light call sheet.` },
  normal: { k:'normal', label:'A normal day',   short:'Normal', lvl:2, ico:'🟡',
            mins: b => b,
            note: m => `Your usual ${m} minutes. Work, then the gym.` },
  short:  { k:'short',  label:'Short window',   short:'Short',  lvl:1, ico:'🟠',
            mins: b => Math.max(15, r5(b * 0.4)),
            note: m => `About ${m} minutes. Squeezed in somewhere.` },
  micro:  { k:'micro',  label:'Minutes only',   short:'Minutes',lvl:1, ico:'🔴',
            mins: () => 5,
            note: () => 'Three to five minutes. On location, between setups.' },
  none:   { k:'none',   label:'Not happening',  short:'Off',    lvl:0, ico:'⚪️',
            mins: () => 0,
            note: () => 'Travel, a fourteen-hour day, or you just need the rest.' }
};

/* Resolved against the current baseline. Use this everywhere, never AVAIL directly. */
function availOf(k) {
  const a = AVAIL[k] || AVAIL.normal;
  const mins = a.mins(baseMins());
  return { k:a.k, label:a.label, short:a.short, lvl:a.lvl, ico:a.ico, mins, note:a.note(mins) };
}

/* Rung budgets, also proportional to the baseline */
function rungBudget(rung) {
  const b = baseMins();
  if (rung === 'micro') return 3;
  if (rung === 'short') return Math.max(12, r5(b * 0.32));
  if (rung === 'trim')  return Math.max(20, r5(b * 0.6));
  return b;
}
function rungMinsLabel(rung) {
  if (rung === 'micro') return '3 min';
  if (rung === 'full')  return `~${baseMins()} min`;
  return `~${rungBudget(rung)} min`;
}

function dayConstraint(key) {
  const c = (S.week.days || {})[key];
  if (c) return c;
  return { avail:'normal', env: S.profile.envs[0] || 'full', note:'' };
}

/* One writer for a day's availability, so the three places that change it
   cannot drift apart. */
function setDayAvail(k, avail) {
  const kk = key(k);
  if (!S.week.days) S.week.days = {};
  S.week.days[kk] = Object.assign(dayConstraint(kk), { avail });
  return S.week.days[kk];
}

/* ============================================================
   EXPERIENCE → seeded starting weights
   So the first session arrives with numbers in it instead of a
   blank grid. Deliberately conservative — the progression engine
   corrects upward far more comfortably than it corrects down.
   ============================================================ */
const LEVELS = {
  new:  { k:'new',  label:'New to lifting', ico:'🌱',
          note:'Never trained with weights, or it was years ago and you are starting again.',
          f:{ 'bb-back-squat':0.45, 'bb-bench':0.35, 'bb-deadlift':0.55, 'bb-ohp':0.22, 'bb-row':0.32 } },
  some: { k:'some', label:'Some experience', ico:'🪨',
          note:'You have trained on and off. The main lifts are familiar but nothing is dialled in.',
          f:{ 'bb-back-squat':0.75, 'bb-bench':0.58, 'bb-deadlift':0.95, 'bb-ohp':0.37, 'bb-row':0.50 } },
  solid:{ k:'solid',label:'Trained consistently', ico:'⛰️',
          note:'A year or more of steady lifting. You know your working weights.',
          f:{ 'bb-back-squat':1.10, 'bb-bench':0.82, 'bb-deadlift':1.35, 'bb-ohp':0.50, 'bb-row':0.68 } },
  adv:  { k:'adv',  label:'Advanced', ico:'🏔️',
          note:'Several years in. Progress comes slowly and you plan for it.',
          f:{ 'bb-back-squat':1.45, 'bb-bench':1.05, 'bb-deadlift':1.75, 'bb-ohp':0.63, 'bb-row':0.86 } }
};

/* Dumbbell and machine equivalents derived from the barbell seed */
const SEED_MAP = {
  'db-goblet-squat':['bb-back-squat',0.30], 'mach-leg-press':['bb-back-squat',1.6],
  'db-bench':['bb-bench',0.42], 'db-incline':['bb-bench',0.36],
  'mach-chest-press':['bb-bench',0.85], 'bb-incline-bench':['bb-bench',0.82],
  'db-rdl':['bb-deadlift',0.35], 'bb-rdl':['bb-deadlift',0.62],
  'db-row':['bb-row',0.45], 'mach-lat-pulldown':['bb-row',0.85], 'mach-cable-row':['bb-row',0.90],
  'db-shoulder-press':['bb-ohp',0.42], 'mach-shoulder-press':['bb-ohp',0.90],
  'db-lunge':['bb-back-squat',0.22], 'db-bulgarian':['bb-back-squat',0.20],
  'mach-leg-curl':['bb-deadlift',0.30], 'mach-leg-ext':['bb-back-squat',0.55],
  'db-curl':['bb-row',0.16], 'db-lateral':['bb-ohp',0.13],
  'cab-pushdown':['bb-bench',0.32], 'bb-curl':['bb-row',0.30]
};

/* `overrides` are weights the user typed in themselves. They beat the
   estimate, and everything derived from a main lift follows the number
   the user gave rather than the one we guessed. */
function seedStartingWeights(levelKey, bodyweight, overrides, exact) {
  const lvl = LEVELS[levelKey];
  if (!lvl) return {};
  const hasOverrides = overrides && Object.values(overrides).some(v => v > 0);
  if ((!bodyweight || bodyweight <= 0) && !hasOverrides) return {};
  const seeded = {};
  Object.entries(lvl.f).forEach(([id, factor]) => {
    const manual = overrides && overrides[id] > 0 ? +overrides[id] : null;
    const w = manual != null ? manual : (bodyweight > 0 ? roundW(bodyweight * factor) : 0);
    if (w > 0) { seeded[id] = w; liftOf(id).w = w; liftOf(id).r = EX[id] ? EX[id].rl : 6; }
  });
  Object.entries(SEED_MAP).forEach(([id, [base, factor]]) => {
    if (!seeded[base]) return;
    const w = roundW(seeded[base] * factor);
    if (w > 0) { liftOf(id).w = w; liftOf(id).r = EX[id] ? EX[id].rl : 8; }
  });
  // Numbers the user typed in are used exactly as typed. Rounding someone's
  // own working weight to the nearest plate is presumptuous — dumbbells and
  // machine stacks don't come in 2.5 kg steps anyway.
  if (exact) Object.entries(exact).forEach(([id, w]) => {
    if (w > 0 && EX[id]) { liftOf(id).w = +w; liftOf(id).r = EX[id].rl; }
  });
  return seeded;
}

/* ============================================================
   PROGRESSION — double progression with a 2-strike deload
   ============================================================ */
function liftOf(exId) {
  if (!S.lifts[exId]) S.lifts[exId] = { w:null, r:null, fails:0, best:null, lastDate:null, history:[] };
  return S.lifts[exId];
}
function targetFor(exId) {
  const ex = EX[exId];
  if (!ex) return { w:null, r:8 };
  const L = liftOf(exId);
  if (L.r == null) L.r = ex.rl;
  return { w:L.w, r:L.r };
}
function e1rm(w, r) { if (!w || !r) return 0; return w * (1 + r / 30); }

function applyProgression(sess) {
  sess.exercises.forEach(item => {
    const ex = EX[item.exId];
    if (!ex) return;
    const done = item.sets.filter(s => s.done);
    if (!done.length) return;
    const L = liftOf(item.exId);
    /* Forward only. A session logged after the fact carries the date it
       actually happened, so writing it in unconditionally would move
       "last done" backwards — and every rotation in the app reads that
       field to decide what has gone longest. */
    if (!L.lastDate || sess.date > L.lastDate) L.lastDate = sess.date;

    /* Mobility is never progressed. A stretch has a range that is correct,
       not one to beat, and the unloaded branch below would otherwise add a
       rep every single time with nothing to stop it — "Cat-Cow × 47" after a
       couple of months of warm-ups. lastDate is still stamped above, because
       that is exactly what rotates the picks on a recovery day. */
    if (ex.pattern === 'mobility') return;

    // track best e1RM
    done.forEach(s => {
      const est = e1rm(+s.w || 0, +s.r || 0);
      if (est > 0 && (!L.best || est > L.best.e1rm)) {
        L.best = { w:+s.w, r:+s.r, e1rm:est, date:sess.date };
      }
    });

    if (ex.load === 'time' || ex.load === 'min') return; // no load progression on held/timed work

    const tgtR = L.r || ex.rl;
    const working = done.filter(s => (+s.r || 0) > 0);
    if (!working.length) return;
    const hitAll = working.every(s => (+s.r || 0) >= tgtR);
    const avgRpe = working.reduce((a,s) => a + (+s.rpe || 7), 0) / working.length;

    // Only ever adopt a weight that was actually loaded. A blank weight
    // field means bodyweight, not zero kilos.
    const loggedW = +working[0].w;
    const hasW = loggedW > 0;
    const adopt = () => { if (L.w == null && hasW) L.w = roundW(loggedW); };

    if (hitAll && avgRpe <= 8.6) {
      L.fails = 0;
      if (tgtR >= ex.rh && (hasW || L.w > 0)) {
        // loaded work: reset reps, add weight
        L.r = ex.rl;
        L.w = roundW((L.w != null && L.w > 0 ? L.w : loggedW) + inc(ex.pattern));
      } else {
        // unloaded work just keeps earning reps — no phantom 2.5 kg on push-ups
        L.r = tgtR + 1;
        adopt();
      }
    } else if (hitAll) {
      L.fails = 0;
      adopt();
    } else {
      L.fails = (L.fails || 0) + 1;
      adopt();
      if (L.fails >= 2) {
        if (L.w > 0) { L.w = roundW(L.w * 0.9); item.deloaded = true; }
        else if (L.r > ex.rl) { L.r = Math.max(ex.rl, L.r - 2); item.deloaded = true; }
        L.fails = 0;
        if (L.w > 0) L.r = ex.rl;
      }
    }
    L.history = (L.history || []).slice(-19);
    L.history.push({ d:sess.date, w:L.w, r:L.r, e1rm: L.best ? Math.round(L.best.e1rm) : 0 });
  });
}

/* ============================================================
   SESSION GENERATION
   ============================================================ */
function envFlag(envKey) { return (ENVS[envKey] || ENVS.full).flag; }

/* Exclusions are hard. An exercise ruled out by an injury never comes back
   through a fallback path — a slot goes unfilled instead. */
function blockedIds(envKey) {
  const out = injuryExclusions();
  if (envKey === 'full') gearExcludes(S.profile.gear).forEach(id => out.add(id));
  return out;
}

function pickExercise(slot, flag, used, prefFamiliar, blocked) {
  blocked = blocked || new Set();
  const allowed = e => e.env.indexOf(flag) >= 0 && !used.has(e.id) && !blocked.has(e.id);
  let pool = EXLIST.filter(e => allowed(e) && slot.pattern.includes(e.pattern) && slot.tier.includes(e.tier));
  if (!pool.length) pool = EXLIST.filter(e => allowed(e) && slot.pattern.includes(e.pattern));
  if (!pool.length) return null;

  const known = pool.filter(e => S.lifts[e.id] && S.lifts[e.id].lastDate);
  if (prefFamiliar && known.length) pool = known;

  pool.sort((a, b) => {
    const la = (S.lifts[a.id] && S.lifts[a.id].lastDate) || '0000-00-00';
    const lb = (S.lifts[b.id] && S.lifts[b.id].lastDate) || '0000-00-00';
    if (la === lb) return a.tier - b.tier;
    return la < lb ? -1 : 1;
  });
  return pool[0];
}

function costOf(ex, sets) {
  const per = ex.tier <= 2 ? 3.1 : 2.1;
  return 0.9 + sets * per;
}

/* Priority muscles earn one extra accessory slot on a full session */
function prioritySlot() {
  const pri = (S.profile.priorities || []);
  if (!pri.length) return null;
  const n = S.sessions.length % pri.length;
  const muscle = pri[n];
  const pat = { Back:['pull-h','pull-v'], Shoulders:['delts'], Chest:['push-h'], Core:['core'],
                Quads:['squat'], Glutes:['hinge'], Arms:['arms-bi','arms-tri'], Calves:['calves'] }[muscle];
  return pat ? { pattern:pat, tier:[3], sets:3, priority:muscle } : null;
}

/* Cardio finisher, spread across the week to hit the chosen dose */
function cardioSlot(weekCount) {
  const c = S.profile.cardio || { amount:'none' };
  const want = CARDIO_SESSIONS[c.amount] || 0;
  if (!want || weekCount >= want) return null;
  return { modes: (c.modes && c.modes.length) ? c.modes : ['car-walk'], mins: CARDIO_MINS[c.amount] };
}

function cardioDoneThisWeek() {
  const ws = dk(weekStart()), we = dk(addDays(weekStart(), 6));
  return S.sessions.filter(s => s.ended && s.date >= ws && s.date <= we)
    .filter(s => (s.exercises||[]).some(i => EX[i.exId] && EX[i.exId].pattern === 'cardio')).length;
}

function generateSession(type, envKey, rung, minutes) {
  const flag = envFlag(envKey);
  /* Recovery has its own shape and is checked before the micro rung, because a
     three-minute recovery day is a shorter flow, not a set of air squats. */
  if (type === 'recovery') return recoverySession(envKey, rung);
  if (rung === 'micro') return microSession(envKey);

  const blocked = blockedIds(envKey);
  let slots = (SLOTS[type] || SLOTS.full).slice();
  let budget = minutes || 50;

  if (rung === 'trim')  { slots = slots.slice(0, 5); budget = Math.min(budget, rungBudget('trim')); }
  if (rung === 'short') { slots = slots.slice(0, 3); budget = Math.min(budget, rungBudget('short')); }

  // An extra slot for the areas you asked to bring up. Placed just after the
  // main compounds, not appended last — at the end it gets eaten by the time
  // budget, and priority work done fried isn't priority work.
  if (rung === 'full') { const ps = prioritySlot(); if (ps) slots.splice(2, 0, ps); }
  // a short mobility opener — cheap, and it matters if you carry a rig all day
  if (S.settings.warmup && (rung === 'full' || rung === 'trim')) {
    slots.unshift({ pattern:['mobility'], tier:[4], sets:1, warmup:true });
  }

  // Reserve the cardio finisher's minutes before building the strength work,
  // otherwise a "60 minute" session quietly becomes 78.
  const pendingCardio = (rung === 'full' || rung === 'trim') ? cardioSlot(cardioDoneThisWeek()) : null;
  if (pendingCardio) budget = Math.max(12, budget - pendingCardio.mins);

  const used = new Set();
  const items = [];
  let spent = 0;

  slots.forEach((slot, i) => {
    let sets = slot.sets;
    if (rung === 'trim')  sets = Math.max(2, sets - 1);
    if (rung === 'short') sets = Math.max(2, sets - 1);

    const ex = pickExercise(slot, flag, used, i < 2, blocked);
    if (!ex) return;
    const c = costOf(ex, sets);
    if (spent + c > budget && items.length >= 2) return;
    spent += c;
    used.add(ex.id);

    const t = targetFor(ex.id);
    items.push({
      exId: ex.id,
      name: ex.name,
      load: ex.load,
      targetW: t.w,
      targetR: t.r || ex.rl,
      priority: slot.priority || null,
      warmup: slot.warmup || false,
      sets: Array.from({ length: sets }, () => ({ w:t.w != null ? t.w : '', r:'', rpe:'', done:false })),
      note: ''
    });
  });

  // cardio finisher
  {
    const cs = pendingCardio;
    if (cs) {
      const pick = cs.modes.map(id => EX[id]).filter(e => e && e.env.indexOf(flag) >= 0 && !blocked.has(e.id))[0];
      if (pick) {
        items.push({
          exId: pick.id, name: pick.name, load: 'min',
          targetW: null, targetR: cs.mins, cardio: true,
          sets: [{ w:'', r:cs.mins, rpe:'', done:false }],
          note: 'Easy to moderate. This is for your heart, not your legs.'
        });
        spent += cs.mins;
      }
    }
  }

  return {
    id: 'sx' + Date.now().toString(36),
    date: today(),
    type, env: envKey, rung,
    planMins: Math.round(spent),
    exercises: items,
    started: null, ended: null, dur: 0
  };
}

/* The floor. Three bodyweight movements, 40 seconds each, no equipment,
   works in a hotel room or behind a truck. Timed, never rep-counted —
   counting reps at this size just invites you to judge the number. */
function microSession(envKey) {
  const ids = ['bw-squat', 'bw-pushup', 'bw-mountain-climber'];
  const picks = ids.map(id => EX[id]).filter(Boolean);
  return {
    id: 'sx' + Date.now().toString(36),
    date: today(),
    type: 'micro', env: envKey, rung: 'micro', planMins: 3,
    micro: true,
    exercises: picks.map(ex => ({
      exId: ex.id, name: ex.name, load: 'time',
      targetW: null, targetR: 40,
      sets: [{ w:'', r:40, rpe:'', done:false }],
      note: 'Forty seconds. Stop when the timer stops, not when it hurts.'
    })),
    started: null, ended: null, dur: 0
  };
}

/* ---------- a recovery day ----------
   Not a smaller training day. A training session shrunk to fifteen minutes is
   still training; a recovery day is stretching and light joint work, and it
   earns its place in the week rather than apologising for not being a session.

   Two rules shape what lands in it.

   Spread comes before recency. Sorting the whole mobility pool by
   least-recently-done — which is what pickExercise does everywhere else — hands
   you five hip stretches the first time you open one, because that genuinely is
   what has gone longest. So the regions take turns, and recency only decides
   the order within a region.

   And nothing is loaded. targetW stays null, and applyProgression returns early
   on anything with a mobility pattern, so a recovery day can never nudge a
   number upward. It is the one session in the app with no target to beat. */
const RECOVERY_MOVES = { full: 8, trim: 6, short: 4, micro: 3 };

function recoverySession(envKey, rung) {
  const flag = envFlag(envKey);
  const blocked = blockedIds(envKey);
  const pool = EXLIST.filter(e => e.pattern === 'mobility' &&
                                  e.env.indexOf(flag) >= 0 && !blocked.has(e.id));
  if (!pool.length) return null;

  const lastOf = id => (S.lifts[id] && S.lifts[id].lastDate) || '0000-00-00';
  const cmp = (a, b, ka, kb) => (ka === kb ? String(a).localeCompare(String(b)) : (ka < kb ? -1 : 1));

  const byRegion = {};
  pool.forEach(e => { (byRegion[e.primary] = byRegion[e.primary] || []).push(e); });
  Object.keys(byRegion).forEach(r =>
    byRegion[r].sort((a, b) => cmp(a.name, b.name, lastOf(a.id), lastOf(b.id))));

  const regions = Object.keys(byRegion)
    .sort((a, b) => cmp(a, b, lastOf(byRegion[a][0].id), lastOf(byRegion[b][0].id)));

  /* One from each region, then round again — so four movements is four
     different parts of you, not four ways to stretch a hip. */
  const order = [];
  for (let round = 0; round < 4; round++)
    regions.forEach(r => { if (byRegion[r][round]) order.push(byRegion[r][round]); });

  const want = RECOVERY_MOVES[rung] || RECOVERY_MOVES.full;
  const exercises = order.slice(0, Math.min(want, order.length)).map(ex => {
    const timed = ex.load === 'time' || ex.load === 'min';
    return {
      exId: ex.id, name: ex.name, load: ex.load,
      targetW: null, targetR: ex.rl,
      recovery: true,
      sets: [{ w: '', r: ex.rl, rpe: '', done: false }],
      note: timed ? 'Hold it, breathing. Both sides if it has sides.'
                  : 'Slow, through the whole range. Not a rep count to beat.'
    };
  });
  if (!exercises.length) return null;

  return {
    id: 'sx' + Date.now().toString(36),
    date: today(),
    type: 'recovery', env: envKey, rung: rung || 'full',
    planMins: recoveryMins(exercises),
    exercises,
    started: null, ended: null, dur: 0
  };
}

/* Deliberately generous on the changeover: on a recovery day you are getting
   down onto the floor and swapping sides, not resting between sets. */
function recoveryMins(exercises) {
  let secs = 0;
  (exercises || []).forEach(i => {
    const ex = EX[i.exId];
    if (!ex) return;
    secs += (ex.load === 'time' || ex.load === 'min') ? i.targetR : i.targetR * 3.5;
    secs += 45;
  });
  return Math.max(4, Math.round(secs / 60));
}

/* ============================================================
   PLAN — which session type is due
   ============================================================ */
function programOf() { return PROGRAMS[S.profile.programId] || PROGRAMS.anchor3; }

function nextType() {
  const prog = programOf();
  const recent = S.sessions.slice(-6).filter(s => !s.micro);
  if (!recent.length) return prog.cycle[0];
  const last = recent[recent.length - 1].type;
  const i = prog.cycle.indexOf(last);
  if (i === -1) return prog.cycle[0];
  return prog.cycle[(i + 1) % prog.cycle.length];
}

function typeLabel(t) {
  return { full:'Full body', upper:'Upper', lower:'Lower', push:'Push', pull:'Pull', legs:'Legs',
           chest:'Chest', back:'Back', delts:'Shoulders', arms:'Arms',
           cardio:'Cardio', recovery:'Recovery', micro:'Three minutes' }[t] || t;
}

/* Distribute the program's target sessions across the week's usable days */
/* Choose n training days from `scored` (already sorted by available minutes,
   descending).

   Minutes still decide outright — the most available days are taken first,
   which is the whole point of asking. What changed is what happens inside a
   tie, and a tie is the ordinary case: a fresh profile has all seven days at
   the same default, so the entire week is one band. `.sort()` is stable, so
   the band stayed in calendar order and `.slice(0, n)` took the first n —
   Monday through Friday, every time. A programme of five landed nothing on
   the weekend at all, and someone opening the app for the first time on a
   Saturday met an empty plan and a hero reading "unplanned".

   So: walk the bands from most to least available, and when a band holds more
   candidates than there are slots left, space the picks across it instead of
   taking the front. Seven equal days and a target of three gives Mon/Thu/Sun
   rather than Mon/Tue/Wed. */
function pickDays(scored, n) {
  if (n <= 0) return [];

  const bands = [];
  scored.forEach(s => {
    const last = bands[bands.length - 1];
    if (last && last.mins === s.mins) last.days.push(s.k);
    else bands.push({ mins: s.mins, days: [s.k] });
  });

  const out = [];
  for (const band of bands) {
    const left = n - out.length;
    if (left <= 0) break;
    if (band.days.length <= left) { out.push(...band.days); continue; }

    /* Date keys are 'YYYY-MM-DD', so a plain sort is chronological. Spacing is
       over indices, and because this branch only runs when the band is larger
       than the slots left, the step is always greater than one — the rounded
       positions cannot collide. */
    const days = band.days.slice().sort();
    const step = (days.length - 1) / Math.max(1, left - 1);
    for (let i = 0; i < left; i++) out.push(days[Math.round(i * step)]);
  }
  return out;
}

function buildWeekPlan(force) {
  const ws = weekStart();
  const wsKey = dk(ws);
  if (S.week.start !== wsKey) { S.week = { start: wsKey, days: S.week.days || {}, plan: {} }; }
  if (Object.keys(S.week.plan).length && !force) return S.week.plan;

  const prog = programOf();
  const keys = Array.from({ length:7 }, (_, i) => dk(addDays(ws, i)));

  const usable = keys.filter(k => dayConstraint(k).avail !== 'none');
  const scored = usable.map(k => ({ k, mins: availOf(dayConstraint(k).avail).mins }))
                       .sort((a, b) => b.mins - a.mins);

  const minUsable = Math.max(12, Math.round(baseMins() * 0.3));
  const n = Math.min(prog.target, scored.filter(s => s.mins >= minUsable).length || scored.length);
  const chosen = pickDays(scored, n).sort();

  /* Anything you decided yourself, and anything already spent, survives a
     rebuild. The app arranges the days you have not had an opinion about
     and no others — otherwise setting Friday to Back and then changing
     Tuesday's availability would quietly undo Friday. */
  const inWeek = new Set(keys);
  const keep = {};
  Object.keys(S.week.plan || {}).forEach(k => {
    const e = S.week.plan[k];
    /* Confined to this week's seven days. A stray key from a clock change or
       a restored backup would otherwise be carried forward for ever. */
    if (!inWeek.has(k)) return;
    if (e && (e.pinned || e.done || e.elsewhere)) keep[k] = e;
  });

  /* Walk the week in order and resync the rotation each time a kept day
     goes past, so a Monday pinned to Pull leaves Wednesday on Legs rather
     than opening on Push again. Resyncing as we go — rather than picking
     one anchor up front — is what makes a kept day in the middle of the
     week behave the same as one at the start. */
  const plan = {};
  const days = [...new Set(chosen.concat(Object.keys(keep)))].sort();
  const taken = {};
  Object.values(keep).forEach(e => { if (e && !e.routineId) taken[e.type] = (taken[e.type] || 0) + 1; });
  const room = {};
  prog.cycle.forEach(t => { room[t] = (room[t] || 0) + 1; });

  let ci = 0;
  days.forEach(k => {
    if (keep[k]) {
      plan[k] = keep[k];
      const at = keep[k].routineId ? -1 : prog.cycle.indexOf(keep[k].type);
      if (at >= 0) ci = at + 1;
      return;
    }
    if (chosen.indexOf(k) < 0) return;
    /* Step past anything the pinned days have already used up. Without this
       a week with three days pinned lands a duplicate on the fourth and
       drops a whole movement pattern for the week — the rotation resyncs
       correctly and still ends up with two Lower days and no Pull. */
    for (let n = 0; n < prog.cycle.length; n++) {
      const t = prog.cycle[((ci % prog.cycle.length) + prog.cycle.length) % prog.cycle.length];
      if ((taken[t] || 0) < room[t]) break;
      ci++;
    }
    const type = prog.cycle[((ci % prog.cycle.length) + prog.cycle.length) % prog.cycle.length];
    taken[type] = (taken[type] || 0) + 1;
    plan[k] = { type, done:false };
    ci++;
  });
  S.week.plan = plan;
  save();
  return plan;
}

function plannedToday() {
  buildWeekPlan();
  return S.week.plan[today()] || null;
}

/* ============================================================
   MISS HANDLING — asymmetric by design
   ============================================================ */
function lastSessionDate() {
  const done = S.sessions.filter(s => s.ended);
  if (!done.length) return null;
  return done[done.length - 1].date;
}
function daysSinceLast() {
  const l = lastSessionDate();
  if (!l) return null;
  return daysBetween(l, today());
}
function missState() {
  buildWeekPlan();
  const doneDates = new Set(S.sessions.filter(s => s.ended).map(s => s.date));
  const past = Object.keys(S.week.plan).filter(k => daysBetween(k, today()) > 0);
  let consecutive = 0;
  past.sort().reverse().forEach((k, i) => {
    if (!doneDates.has(k) && consecutive === i) consecutive++;
  });
  return { consecutive, since: daysSinceLast() };
}

/* ============================================================
   STATS
   ============================================================ */
function sessionVolume(s) {
  let tonnage = 0, sets = 0, reps = 0;
  (s.exercises || []).forEach(it => {
    (it.sets || []).forEach(st => {
      if (!st.done) return;
      sets++;
      const r = +st.r || 0;
      reps += r;
      const w = +st.w || 0;
      if (w > 0 && r > 0) tonnage += w * r;
    });
  });
  return { tonnage: Math.round(tonnage), sets, reps };
}

function weeksBack(n) {
  const out = [];
  const ws = weekStart();
  for (let i = n - 1; i >= 0; i--) {
    const start = addDays(ws, -7 * i);
    const end = addDays(start, 6);
    const sk = dk(start), ek = dk(end);
    const ss = S.sessions.filter(s => s.ended && s.date >= sk && s.date <= ek);
    let tonnage = 0, sets = 0;
    ss.forEach(s => { const v = sessionVolume(s); tonnage += v.tonnage; sets += v.sets; });
    out.push({ start:sk, end:ek, count:ss.length, tonnage, sets,
               label: MONTHS[start.getMonth()].slice(0,1) + start.getDate() });
  }
  return out;
}

/* Streak counted in WEEKS with at least one session — never in days.
   Daily streaks are the mechanic that produces the shame spiral. */
function weekStreak() {
  let streak = 0;
  const ws = weekStart();
  for (let i = 0; i < 260; i++) {
    const start = addDays(ws, -7 * i);
    const sk = dk(start), ek = dk(addDays(start, 6));
    const any = S.sessions.some(s => s.ended && s.date >= sk && s.date <= ek);
    if (any) streak++;
    else if (i > 0) break;
    else if (i === 0) continue; // current week not yet started doesn't break it
  }
  return streak;
}

function muscleVolume(days) {
  /* Through today(), not a second read of the clock — see the note there. */
  const cutoff = dk(addDays(fromKey(today()), -(days || 7)));
  const tally = {};
  MUSCLES.forEach(m => tally[m] = 0);
  S.sessions.filter(s => s.ended && s.date >= cutoff).forEach(s => {
    (s.exercises || []).forEach(it => {
      const ex = EX[it.exId];
      if (!ex) return;
      const n = (it.sets || []).filter(x => x.done).length;
      if (!n) return;
      if (tally[ex.primary] != null) tally[ex.primary] += n;
      (ex.sec || []).forEach(m => { if (tally[m] != null) tally[m] += n * 0.5; });
    });
  });
  return tally;
}

function allPRs() {
  return Object.keys(S.lifts)
    .filter(id => S.lifts[id].best && EX[id])
    .map(id => ({ id, name: EX[id].name, ...S.lifts[id].best }))
    .sort((a, b) => b.e1rm - a.e1rm);
}

function totalStats() {
  const done = S.sessions.filter(s => s.ended);
  let tonnage = 0, sets = 0, mins = 0;
  done.forEach(s => { const v = sessionVolume(s); tonnage += v.tonnage; sets += v.sets; mins += s.dur || 0; });
  return { count: done.length, tonnage, sets, mins: Math.round(mins) };
}
