/* ============================================================
   ROUTINES — your own sessions, on your own terms
   ------------------------------------------------------------
   The generated plan answers "what should I do this week". A
   routine answers "I already know what I want to do, let me do
   it" — abs before bed, a rehab circuit, a fifteen-minute arms
   thing in a hotel room.

   A routine is a template, never a schedule. It never competes
   with the week's plan and it never marks a planned day as done,
   because an extra thing you chose to do should not quietly
   discharge the thing you committed to.
   ============================================================ */

/* Icon keys, not emoji — see p3d_icons.js. */
const ROUTINE_EMOJI = ['moon', 'fire', 'env-bw', 'bolt', 'stone', 'bag', 'plaster', 'car-run', 'area-Arms', 'clock'];

const ROUTINE_LIMITS = { name: 40, items: 24, sets: 12, reps: 300, rounds: 12, rest: 600 };

/* Reps or seconds, per movement.
   -------------------------------
   The catalogue gives every exercise one load type, which is right for a
   barbell — a back squat is reps under load and nothing else. It is wrong for
   everything you might hold or keep moving through: a crunch is 15 reps or 40
   seconds depending on how you train, and the app was picking for you.

   `mode` is the item's own answer. The catalogue still supplies the default,
   so nothing changes for anyone who does not touch it.

   Not offered on heavy loaded compounds. Reps against a working weight is the
   entire mechanism there — the progression, the plate maths and the e1RM all
   read it — and switching a bench press to seconds would quietly turn all of
   that off in exchange for a number nobody wants. */
function canRetime(exId) {
  const ex = EX[exId];
  if (!ex) return false;
  return !(ex.load === 'wt' && ex.tier <= 2);
}

function defaultMode(exId) {
  const ex = EX[exId] || {};
  return (ex.load === 'time' || ex.load === 'min') ? 'time' : 'reps';
}

/* What a routine item actually is, once its own choice is taken into account.
   Session exercises carry this as their `load`, so everything downstream —
   the set rows, the seconds estimate, the energy cost, the progression guard —
   reads the item rather than the catalogue. */
function itemLoad(it) {
  const ex = EX[it.exId] || {};
  const mode = it.mode || defaultMode(it.exId);
  if (mode === 'time') return ex.load === 'min' ? 'min' : 'time';
  return ex.load === 'wt' ? 'wt' : 'bw';
}

function itemIsTimed(it) { const l = itemLoad(it); return l === 'time' || l === 'min'; }

/* A sensible starting number when the unit changes under you. Carrying 15
   across from reps to seconds would prescribe a 15-second plank. */
function defaultAmount(exId, mode) {
  const ex = EX[exId] || {};
  const catalogueTimed = ex.load === 'time' || ex.load === 'min';
  if (mode === 'time') return catalogueTimed ? (ex.rl || 30) : 40;
  return catalogueTimed ? 12 : (ex.rl || 8);
}

function ensureRoutines() {
  if (!Array.isArray(S.routines)) S.routines = [];
  /* Routines built before warm-ups existed have no `warmup` field at all.
     Backfilling here rather than in a migration means the default is decided
     in one place, and an older save read on a newer build behaves the same as
     a routine made this morning. Off, because a routine is a thing you wrote
     down yourself and the app should not quietly add a movement to it. */
  S.routines.forEach(r => {
    if (typeof r.warmup !== 'boolean') r.warmup = false;
    /* Circuit fields, backfilled the same way and for the same reason: a
       routine saved before any of this existed must behave exactly as it did. */
    if (typeof r.circuit !== 'boolean') r.circuit = false;
    if (!(r.rounds > 0)) r.rounds = 3;
    if (!(r.restRound > 0)) r.restRound = 60;
    (r.items || []).forEach(it => { if (!it.mode) it.mode = defaultMode(it.exId); });
    normaliseSupersets(r);
  });
  return S.routines;
}

function routineById(id) {
  return ensureRoutines().find(r => r.id === id) || null;
}

function newRoutine(name, emoji) {
  const list = ensureRoutines();
  const r = {
    id: 'rt' + Date.now().toString(36) + Math.floor(list.length + 1),
    name: String(name || 'New routine').slice(0, ROUTINE_LIMITS.name),
    emoji: emoji || ROUTINE_EMOJI[list.length % ROUTINE_EMOJI.length],
    items: [], warmup: false, circuit: false, rounds: 3, restRound: 60,
    created: today(), uses: 0, lastUsed: null
  };
  list.push(r);
  save(true);
  return r;
}

function renameRoutine(id, name) {
  const r = routineById(id);
  if (!r) return false;
  const n = String(name || '').trim().slice(0, ROUTINE_LIMITS.name);
  if (!n) return false;
  r.name = n; save(true); return true;
}

function setRoutineEmoji(id, emoji) {
  const r = routineById(id);
  if (!r || ROUTINE_EMOJI.indexOf(emoji) < 0) return false;
  r.emoji = emoji; save(true); return true;
}

function setRoutineWarmup(id, on) {
  const r = routineById(id);
  if (!r) return false;
  r.warmup = !!on; save(true); return true;
}

/* Which mobility movement a routine opens with.
   ---------------------------------------------
   Chosen against what the routine actually trains, not off the top of the
   list: an arms routine gets shoulders and thoracic spine, a leg routine gets
   hips and ankles. Warming up the wrong end of you is the reason people stop
   bothering with warm-ups.

   Least-recently-done breaks the tie, so a routine you run three times a week
   does not open with the same movement every time. Returns null when nothing
   is available in today's environment, and the routine simply starts without
   one — a missing warm-up must never stop a session starting. */
const WARMUP_REGIONS = {
  Chest: ['Shoulders', 'Chest', 'Back'], Shoulders: ['Shoulders', 'Back'],
  Triceps: ['Shoulders', 'Triceps'], Biceps: ['Shoulders', 'Back'],
  Back: ['Back', 'Shoulders'], Core: ['Back', 'Core', 'Glutes'],
  Quads: ['Quads', 'Glutes', 'Calves'], Hamstrings: ['Hamstrings', 'Glutes'],
  Glutes: ['Glutes', 'Hamstrings'], Calves: ['Calves', 'Quads'],
  Forearms: ['Shoulders', 'Back'], Cardio: ['Glutes', 'Calves']
};

function warmupFor(routine, envKey, blocked) {
  const flag = envFlag(envKey);
  blocked = blocked || new Set();
  const pool = EXLIST.filter(e => e.pattern === 'mobility' &&
                                  e.env.indexOf(flag) >= 0 && !blocked.has(e.id));
  if (!pool.length) return null;

  const wanted = [];
  (routine.items || []).forEach(it => {
    const ex = EX[it.exId];
    if (!ex) return;
    (WARMUP_REGIONS[ex.primary] || []).forEach(m => { if (wanted.indexOf(m) < 0) wanted.push(m); });
  });

  const lastOf = id => (S.lifts[id] && S.lifts[id].lastDate) || '0000-00-00';
  const rank = e => {
    const i = wanted.indexOf(e.primary);
    return i < 0 ? wanted.length : i;      // unrelated regions sort last, never out
  };
  pool.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const la = lastOf(a.id), lb = lastOf(b.id);
    return la === lb ? a.name.localeCompare(b.name) : (la < lb ? -1 : 1);
  });
  return pool[0];
}

function deleteRoutine(id) {
  const list = ensureRoutines();
  const i = list.findIndex(r => r.id === id);
  if (i < 0) return false;
  list.splice(i, 1);
  /* Clear the day it was standing in for, in the same breath. Splicing alone
     left week.plan[k].routineId pointing at nothing: planLabel() rendered
     "Deleted routine" so the day looked fine and did not crash, but the hero's
     Start called buildRoutineSession(), which returned null, and the day was
     simply unstartable with no way to repair it from the UI. */
  repairRefs();
  save(true);
  return true;
}

/* Nothing in the app enforces referential integrity — every link between
   stores is a bare string key — so this sweeps the ones that can be left
   pointing at something deleted. Called once at boot and again whenever a
   routine is removed.

   A day that loses its routine falls back to an ordinary planned session
   rather than being emptied: the day was chosen deliberately, and taking it
   off the route entirely would be a bigger edit than the one that was asked
   for. Anything already done or spent is never touched.

   Returns the number of references cleared, so a caller can tell whether
   anything actually changed rather than saving unconditionally. */
function repairRefs() {
  let fixed = 0;

  const plan = (S.week && S.week.plan) || {};
  Object.keys(plan).forEach(k => {
    const e = plan[k];
    if (!e || !e.routineId) return;
    if (routineById(e.routineId)) return;
    delete e.routineId;
    /* 'custom' only ever meant "a routine is standing in here". With the
       routine gone the label would read as a session type that does not
       exist, so hand the day back to the rotation. */
    if (e.type === 'custom' || !e.type) e.type = nextType ? nextType() : 'full';
    fixed++;
  });

  /* Learned weights and form videos are keyed by exercise id. The catalogue is
     static today, so these only strand if an id is retired between releases —
     cheap to check, and it keeps a stale key from silently shadowing a reused
     id later. */
  ['lifts', 'videos'].forEach(store => {
    const m = S[store];
    if (!m) return;
    Object.keys(m).forEach(exId => {
      if (!EX[exId]) { delete m[exId]; fixed++; }
    });
  });

  return fixed;
}

function addToRoutine(id, exId) {
  const r = routineById(id);
  const ex = EX[exId];
  if (!r || !ex) return false;
  if (r.items.length >= ROUTINE_LIMITS.items) return false;
  const mode = defaultMode(exId);
  r.items.push({ exId, sets: 3, reps: defaultAmount(exId, mode), mode });
  save(true);
  return true;
}

/* Switching a movement between reps and seconds. The number moves with it —
   keeping 15 across the switch would prescribe a 15-second plank, and keeping
   40 the other way would prescribe 40 crunches. */
function setItemMode(id, idx, mode) {
  const r = routineById(id);
  if (!r || !r.items[idx]) return false;
  if (mode !== 'reps' && mode !== 'time') return false;
  const it = r.items[idx];
  if (!canRetime(it.exId)) return false;
  if (it.mode === mode) return true;
  it.mode = mode;
  it.reps = defaultAmount(it.exId, mode);
  save(true); return true;
}

/* ---------- supersets ----------
   "4A then 4B immediately · rest 60 sec" — two movements run back to back with
   the rest after the pair rather than between them.

   Modelled as one boolean per item, `supNext`, meaning "this one runs straight
   into the one below it". A group is then a maximal run of items each linked to
   the next, which is trivially derived and survives every edit: reorder an item
   and its link goes with it, delete one and the run just gets shorter. Group
   ids would have needed renumbering on every move and would drift out of sync
   the first time one was missed.

   A circuit is already every movement run back to back, so supersets inside one
   would be a distinction without a difference — the builder hides them. */
function normaliseSupersets(r) {
  if (!r || !r.items) return;
  /* The last item cannot run into a next one that does not exist. Left set, it
     would silently suppress the rest after the final movement. */
  r.items.forEach((it, i) => { if (i === r.items.length - 1) delete it.supNext; });
}

/* Every superset group in a routine, as runs of indices. Items not paired with
   anything are not groups — a "group" of one is just an exercise. */
function supersetGroups(items) {
  const out = [];
  let run = null;
  (items || []).forEach((it, i) => {
    if (it.supNext) { if (!run) run = [i]; run.push(i + 1); }
    else if (run) { out.push(run); run = null; }
  });
  if (run) out.push(run);
  return out;
}

/* Which group an index belongs to, and where in it. Null when it stands alone. */
function supersetAt(items, i) {
  const g = supersetGroups(items).find(run => run.includes(i));
  if (!g) return null;
  return { run: g, pos: g.indexOf(i), letter: String.fromCharCode(65 + g.indexOf(i)) };
}

/* The A / B / C label for the group itself, counted across the routine. */
function supersetName(items, i) {
  const groups = supersetGroups(items);
  const n = groups.findIndex(run => run.includes(i));
  return n < 0 ? null : String.fromCharCode(65 + n);
}

function toggleSupersetLink(id, i) {
  const r = routineById(id);
  if (!r || !r.items[i] || !r.items[i + 1]) return false;
  if (r.items[i].supNext) delete r.items[i].supNext;
  else r.items[i].supNext = true;
  normaliseSupersets(r);
  save(true); return true;
}

function setRoutineCircuit(id, on) {
  const r = routineById(id);
  if (!r) return false;
  r.circuit = !!on; save(true); return true;
}

function adjustRoutineRounds(id, delta) {
  const r = routineById(id);
  if (!r) return false;
  r.rounds = Math.max(1, Math.min(ROUTINE_LIMITS.rounds, (r.rounds || 3) + delta));
  save(true); return true;
}

/* In fifteen-second steps: the difference between 60 and 61 seconds of rest is
   not a thing anyone is choosing between. */
function adjustRoutineRest(id, delta) {
  const r = routineById(id);
  if (!r) return false;
  r.restRound = Math.max(0, Math.min(ROUTINE_LIMITS.rest, (r.restRound == null ? 60 : r.restRound) + delta * 15));
  save(true); return true;
}

/* ------------------------------------------------------------
   Editing around a superset breaks it. It never re-forms it.
   ------------------------------------------------------------
   The flag says "this one runs into the next one", and it travels with the
   item it is on. That is what makes it survive a reorder without renumbering —
   and it is also what makes it dangerous: pull one half of a pair out and the
   flag happily latches onto whatever slid in underneath. You would end up
   supersetting a bench press with an overhead press because you moved a fly,
   and nothing on screen would tell you, because a superset you never asked for
   looks exactly like one you did.

   So any edit that changes who is adjacent to whom clears every link in the
   window it touched, including the one *pointing into* it. Breaking a pair is
   visible and one tap to undo; re-forming one silently is neither. */
function clearLinksAround(r, lo, hi) {
  for (let k = Math.max(0, lo - 1); k <= Math.min(hi, r.items.length - 1); k++) {
    if (r.items[k]) delete r.items[k].supNext;
  }
}

function removeFromRoutine(id, idx) {
  const r = routineById(id);
  if (!r || !r.items[idx]) return false;
  clearLinksAround(r, idx, idx);
  r.items.splice(idx, 1); normaliseSupersets(r); save(true); return true;
}

function moveInRoutine(id, idx, dir) {
  const r = routineById(id);
  if (!r) return false;
  const j = idx + dir;
  if (j < 0 || j >= r.items.length) return false;
  clearLinksAround(r, Math.min(idx, j), Math.max(idx, j));
  const [it] = r.items.splice(idx, 1);
  r.items.splice(j, 0, it);
  normaliseSupersets(r); save(true); return true;
}

function adjustRoutineItem(id, idx, field, delta) {
  const r = routineById(id);
  if (!r || !r.items[idx]) return false;
  const it = r.items[idx];
  const timed = itemIsTimed(it);
  if (field === 'sets') {
    it.sets = Math.max(1, Math.min(ROUTINE_LIMITS.sets, (it.sets || 3) + delta));
  } else {
    const step = timed ? 5 : 1;
    it.reps = Math.max(1, Math.min(ROUTINE_LIMITS.reps, (it.reps || 8) + delta * step));
  }
  save(true); return true;
}

/* A rough minute cost, so the card can say how long this takes without
   pretending to a precision it does not have. */
function routineMins(r) {
  if (!r || !r.items.length) return 0;
  let mins = 0;
  if (r.circuit) {
    /* A circuit costs what one round costs, times the rounds, plus the rest
       between them. No inter-set rest, because there isn't any — that is the
       whole point of running it as a circuit. Ten seconds a movement for
       getting from one to the next. */
    let round = 0;
    r.items.forEach(it => {
      const l = itemLoad(it);
      round += (l === 'min' ? it.reps * 60 : l === 'time' ? it.reps : it.reps * 3.5) + 10;
    });
    const rounds = r.rounds || 3;
    mins = (round * rounds + (r.restRound || 0) * Math.max(0, rounds - 1)) / 60;
    if (r.warmup) mins += 1.5;
    return Math.max(1, Math.round(mins));
  }
  r.items.forEach(it => {
    const ex = EX[it.exId];
    if (!ex) return;
    const rest = (ex.tier <= 2 ? 2.4 : 1.4);
    const l = itemLoad(it);
    const work = (l === 'min') ? it.reps : (l === 'time') ? (it.reps / 60) : (it.reps * 3.5 / 60);
    mins += it.sets * (work + rest);
  });
  /* The opener costs about a minute and a half. Counted, because the whole
     point of the number on the chip is that it does not lie about the time
     you are agreeing to. */
  if (r.warmup) mins += 1.5;
  return Math.max(1, Math.round(mins));
}

function routineSummary(r) {
  if (!r || !r.items.length) return 'Nothing in it yet';
  const muscles = [];
  r.items.forEach(it => {
    const ex = EX[it.exId];
    if (ex && muscles.indexOf(ex.primary) < 0) muscles.push(ex.primary);
  });
  const n = r.items.length;
  return n + ' move' + (n === 1 ? '' : 's') + ' · ' + routineMins(r) + ' min · ' + muscles.slice(0, 3).join(', ');
}

/* ---------- turning one into a session ----------
   Built to exactly the shape generateSession produces, so everything
   downstream — progression, calories, plate lines, form guides, the
   last-time recall — works on a routine session without knowing it
   came from one. */
/* `asPlanned` is the difference between "I did my abs thing at 11pm on top
   of everything" and "my abs thing IS Wednesday's session". The first must
   never discharge the week's commitment; the second is the commitment. */
function buildRoutineSession(id, asPlanned) {
  const r = routineById(id);
  if (!r || !r.items.length) return null;
  const c = dayConstraint(today());
  const env = c.env || (S.profile.envs && S.profile.envs[0]) || 'full';
  const blocked = blockedIds(env);

  /* In a circuit the per-movement set count is meaningless — one pass through
     the list IS a set, and the routine's `rounds` says how many. */
  const rounds = r.circuit ? Math.max(1, r.rounds || 3) : null;

  const exercises = r.items.map(it => {
    const ex = EX[it.exId];
    if (!ex) return null;
    const tg = targetFor(ex.id);
    const load = itemLoad(it);
    const timed = load === 'time' || load === 'min';
    /* A weighted movement keeps its weight target even when it is being held
       for time — you still want to know it was the 10kg plate. */
    const wTarget = (ex.load === 'wt' || !timed) ? tg.w : null;
    const n = rounds != null ? rounds : it.sets;
    return {
      exId: ex.id, name: ex.name, load,
      targetW: wTarget,
      targetR: it.reps,
      /* Carried onto the session so the rest timer and the Train screen read
         the session rather than reaching back into a routine you might be
         editing while you train. Never on a circuit — the whole thing already
         runs straight through. */
      supNext: (!r.circuit && it.supNext) ? true : undefined,
      /* And the block, where the item has one — set only by an import, from a
         heading the plan actually wrote. exBlock() reads it in preference to
         the catalogue's tier. */
      block: it.block || undefined,
      sets: Array.from({ length: n }, () => ({
        w: wTarget != null ? wTarget : '', r: '', rpe: '', done: false
      })),
      note: ''
    };
  }).filter(Boolean);

  if (!exercises.length) return null;

  /* Prepended, not appended, and only after the routine itself is known to be
     buildable — a warm-up in front of an empty session would be a session. */
  let warmups = 0;
  if (r.warmup) {
    const w = warmupFor(r, env, blocked);
    if (w) {
      const timed = w.load === 'time' || w.load === 'min';
      exercises.unshift({
        exId: w.id, name: w.name, load: w.load,
        targetW: null, targetR: w.rl,
        warmup: true,
        sets: [{ w: '', r: w.rl, rpe: '', done: false }],
        note: timed ? 'Warm-up. Hold it, breathing.' : 'Warm-up. Slow, through the whole range.'
      });
      warmups = 1;
    }
  }

  return {
    id: 'sx' + Date.now().toString(36),
    date: today(),
    type: 'custom',
    routineId: r.id,
    routineName: r.name,
    extra: !asPlanned,         // an extra never discharges the week's planned session
    env, rung: 'full',
    /* Carried onto the session, not read back off the routine: editing a
       routine mid-session would otherwise change the thing you are doing. */
    circuit: !!r.circuit,
    rounds: rounds || null,
    restRound: r.circuit ? (r.restRound == null ? 60 : r.restRound) : null,
    /* The warm-up sits outside the circuit — it is one movement, once, and
       the runner walks the exercises after it. */
    warmupCount: warmups,
    planMins: routineMins(r),
    exercises,
    started: null, ended: null, dur: 0, activeMs: 0, tickAt: null, paused: false
  };
}

/* ---------- what has already happened today ---------- */
function sessionsOn(date) {
  return (S.sessions || []).filter(s => s.ended && s.date === date);
}

function plannedDoneOn(date) {
  return sessionsOn(date).some(s => !s.extra);
}

/* What a day should be labelled as, when there was more than one session.
   Two a day is a real pattern — a main session before work and a routine after
   a late shift — and the strip took whichever came last in the array while the
   Plan list took whichever came first, so one day could describe itself two
   different ways on two screens depending on the order things were logged.
   The session that discharged the day is the one that names it; the rest are
   counted, not hidden. */
function daySessions(date) {
  const list = sessionsOn(key(date));
  const main = list.find(s => !s.extra) || list[0] || null;
  return { list, main, extras: Math.max(0, list.length - (main ? 1 : 0)) };
}

function sessionTitle(sess) {
  if (!sess) return '';
  if (sess.routineName) return sess.routineName;
  return typeLabel(sess.type);
}
