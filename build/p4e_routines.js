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

const ROUTINE_EMOJI = ['🌙', '🔥', '🧘', '⚡', '🪨', '🎒', '🩹', '🏃', '💪', '⏱'];

const ROUTINE_LIMITS = { name: 40, items: 24, sets: 12, reps: 300 };

function ensureRoutines() {
  if (!Array.isArray(S.routines)) S.routines = [];
  /* Routines built before warm-ups existed have no `warmup` field at all.
     Backfilling here rather than in a migration means the default is decided
     in one place, and an older save read on a newer build behaves the same as
     a routine made this morning. Off, because a routine is a thing you wrote
     down yourself and the app should not quietly add a movement to it. */
  S.routines.forEach(r => { if (typeof r.warmup !== 'boolean') r.warmup = false; });
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
    items: [], warmup: false, created: today(), uses: 0, lastUsed: null
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
  const timed = ex.load === 'time' || ex.load === 'min';
  r.items.push({ exId, sets: 3, reps: timed ? (ex.rl || 30) : (ex.rl || 8) });
  save(true);
  return true;
}

function removeFromRoutine(id, idx) {
  const r = routineById(id);
  if (!r || !r.items[idx]) return false;
  r.items.splice(idx, 1); save(true); return true;
}

function moveInRoutine(id, idx, dir) {
  const r = routineById(id);
  if (!r) return false;
  const j = idx + dir;
  if (j < 0 || j >= r.items.length) return false;
  const [it] = r.items.splice(idx, 1);
  r.items.splice(j, 0, it);
  save(true); return true;
}

function adjustRoutineItem(id, idx, field, delta) {
  const r = routineById(id);
  if (!r || !r.items[idx]) return false;
  const it = r.items[idx];
  const ex = EX[it.exId] || {};
  const timed = ex.load === 'time' || ex.load === 'min';
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
  r.items.forEach(it => {
    const ex = EX[it.exId];
    if (!ex) return;
    const rest = (ex.tier <= 2 ? 2.4 : 1.4);
    const work = (ex.load === 'time' || ex.load === 'min') ? (it.reps / 60) : (it.reps * 3.5 / 60);
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

  const exercises = r.items.map(it => {
    const ex = EX[it.exId];
    if (!ex) return null;
    const tg = targetFor(ex.id);
    const timed = ex.load === 'time' || ex.load === 'min';
    return {
      exId: ex.id, name: ex.name, load: ex.load,
      targetW: timed ? null : tg.w,
      targetR: it.reps,
      sets: Array.from({ length: it.sets }, () => ({
        w: (!timed && tg.w != null) ? tg.w : '', r: '', rpe: '', done: false
      })),
      note: ''
    };
  }).filter(Boolean);

  if (!exercises.length) return null;

  /* Prepended, not appended, and only after the routine itself is known to be
     buildable — a warm-up in front of an empty session would be a session. */
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
    planMins: routineMins(r),
    exercises,
    started: null, ended: null, dur: 0
  };
}

/* ---------- what has already happened today ---------- */
function sessionsOn(date) {
  return (S.sessions || []).filter(s => s.ended && s.date === date);
}

function plannedDoneOn(date) {
  return sessionsOn(date).some(s => !s.extra);
}

function sessionTitle(sess) {
  if (!sess) return '';
  if (sess.routineName) return sess.routineName;
  return typeLabel(sess.type);
}
