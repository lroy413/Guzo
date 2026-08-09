/* ============================================================
   THE ORDER OF THE WEEK
   ------------------------------------------------------------
   Until now the plan decided which session landed on which day
   and the answer was final. That is wrong for two reasons.

   The first is ordinary: your body knows what it did yesterday
   and the app does not. If today is your back day, today is your
   back day.

   The second is the one that actually prompted this. Somebody
   installing the app on a Thursday has already trained three
   times that week somewhere else. The plan cheerfully opens on
   session one of the cycle and is out of phase with their life
   from the first screen. There is a catch-up for that below.

   Three rules hold the whole thing together:

     1. A day you set yourself is PINNED. Rebuilding the week
        never overwrites it. The app gets to arrange the days you
        have not had an opinion about, and no others.

     2. Changing a day asks what to do with the rest, and only
        when there is genuinely something to decide. Swapping is
        offered when another day already holds the session you
        just picked, because otherwise you would train it twice
        and skip something else. Re-flowing is offered when there
        are later days to re-lay. Neither is ever silent.

     3. Nothing here can put a mark against you. Days that have
        already gone, and days already logged, are not moved.
   ============================================================ */

/* Every split the app can generate, in the order people think of them. */
const PLAN_TYPES = ['full', 'upper', 'lower', 'push', 'pull', 'legs',
                    'chest', 'back', 'delts', 'arms', 'cardio'];

/* A plan entry is {type, done, pinned?, routineId?, elsewhere?}. Routines
   carry a routineId and keep type 'custom' so nothing downstream has to
   special-case them to render a label. */
function planEntry(k) { return S.week.plan[key(k)] || null; }

function planLabel(e) {
  if (!e) return '';
  if (e.routineId) {
    const r = routineById(e.routineId);
    return r ? r.name : 'Deleted routine';
  }
  return typeLabel(e.type);
}

function planShortLabel(e) {
  if (!e) return '';
  if (e.routineId) {
    const r = routineById(e.routineId);
    return r ? r.name.split(' ')[0] : 'Routine';
  }
  return e.type === 'micro' ? '3 min' : typeLabel(e.type).split(' ')[0];
}

/* Sorted, because an object's key order is not a promise worth relying on. */
function planDays() { return Object.keys(S.week.plan || {}).sort(); }

/* A day is settled once it has gone or once something has been logged on
   it. Settled days are shown but never rearranged. */
function planDaySettled(k) {
  const e = planEntry(k);
  if (!e) return false;
  if (e.done || e.elsewhere) return true;
  if (plannedDoneOn(key(k))) return true;
  return daysBetween(key(k), today()) > 0;
}

/* ---------- changing one day ---------- */

/* Which other day this week is currently holding `spec`, if any. Used to
   offer a swap rather than silently creating a duplicate. */
function planConflict(k, spec) {
  const me = key(k);
  return planDays().find(d => {
    if (d === me || planDaySettled(d)) return false;
    const e = planEntry(d);
    if (!e) return false;
    return spec.routineId ? e.routineId === spec.routineId
                          : (!e.routineId && e.type === spec.type);
  }) || null;
}

/* Every day of this week still ahead of you, planned or not — the order
   list offers all of them, because an empty Saturday is a day you might
   want to train on, not a day you are forbidden from training on. */
function planCandidateDays() {
  const ws = weekStart();
  const upcoming = Array.from({ length: 7 }, (_, i) => dk(addDays(ws, i)))
    .filter(d => daysBetween(d, today()) <= 0);
  return [...new Set(planDays().concat(upcoming))].sort();
}

/* Days after this one that the app is still free to arrange. */
function planDaysAfter(k) {
  const me = key(k);
  return planDays().filter(d => d > me && !planDaySettled(d));
}

/* What the caller should be asked before a change is applied. An empty
   list means just do it — there is nothing to decide. */
function planChangeOptions(k, spec) {
  const cur = planEntry(k);
  const same = cur && (spec.routineId ? cur.routineId === spec.routineId
                                      : (!cur.routineId && cur.type === spec.type));
  if (same) return [];
  const opts = [];
  /* A swap needs something to swap. Adding a session to an empty day takes
     nothing away from anywhere, so there is nothing to trade. */
  const clash = cur ? planConflict(k, spec) : null;
  if (clash) opts.push({ mode: 'swap', with: clash });
  if (planDaysAfter(k).length) opts.push({ mode: 'reflow' });
  return opts;
}

function specOf(e) {
  return e && e.routineId ? { routineId: e.routineId } : { type: (e && e.type) || 'full' };
}

/* `pin` marks a day as YOUR decision, which later rearrangements must not
   overwrite. It is deliberately not set on the far side of a swap: you
   chose Saturday, and the app moved Tuesday to make room. Pinning Tuesday
   too would freeze a day you never expressed an opinion about, and the
   next re-flow would then step around it and leave you training the same
   thing twice. */
function applySpec(k, spec, pin) {
  const kk = key(k);
  const e = S.week.plan[kk] || { done: false };
  if (spec.routineId) { e.routineId = spec.routineId; e.type = 'custom'; }
  else { delete e.routineId; e.type = spec.type; }
  if (pin) e.pinned = true;
  S.week.plan[kk] = e;
}

/* mode: 'only' | 'swap' | 'reflow'
   A day with nothing on it is a legitimate target. Saturday having no
   session is the app's arrangement, not a rule — and "I'm training today
   whatever the plan says" is the most ordinary thing a person can want. */
function setPlanDay(k, spec, mode) {
  const kk = key(k);
  if (planDaySettled(kk)) return false;
  if (daysBetween(kk, today()) > 0) return false;

  const existed = !!S.week.plan[kk];
  const old = existed ? specOf(planEntry(kk)) : null;

  /* Placing a session on a day you had written off un-writes it off —
     silently leaving it at "not happening" would mean the session you just
     asked for never appears. */
  if (dayConstraint(kk).avail === 'none') setDayAvail(kk, 'normal');

  if (mode === 'swap' && old) {
    const other = planConflict(kk, spec);
    if (other) applySpec(other, old, false);
  }

  applySpec(kk, spec, true);

  if (mode === 'reflow') reflowFrom(kk);

  save(true);
  return true;
}

/* Re-lay the programme's rotation across every unsettled day AFTER k,
   continuing from whatever k now holds. A routine has no place in a
   rotation, so a routine day re-starts the cycle from the top. */
function reflowFrom(k) {
  const cycle = programOf().cycle;
  const here = planEntry(k);
  let i = (here && !here.routineId) ? cycle.indexOf(here.type) : -1;
  planDaysAfter(k).forEach(d => {
    const e = S.week.plan[d];
    if (e.pinned) return;               // a day you chose is never re-laid
    i++;
    e.type = cycle[((i % cycle.length) + cycle.length) % cycle.length];
    delete e.routineId;
  });
}

/* ---------- moving a session to another day ---------- */

/* Swaps this day's session with the next unsettled planned day in that
   direction. Moving is the same operation as swapping, which keeps the
   count of sessions in the week constant — you cannot lose one by
   fumbling an arrow. */
function movePlanDay(k, dir) {
  const kk = key(k);
  const open = planDays().filter(d => !planDaySettled(d));
  const i = open.indexOf(kk);
  if (i < 0) return false;
  const j = i + (dir < 0 ? -1 : 1);
  if (j < 0 || j >= open.length) return false;

  const a = S.week.plan[kk], b = S.week.plan[open[j]];
  const aSpec = specOf(a), bSpec = specOf(b);
  /* Both ends are pinned here: dragging a session onto a day is an opinion
     about both days, unlike a swap that happens as a side effect. */
  applySpec(kk, bSpec, true);
  applySpec(open[j], aSpec, true);
  save(true);
  return true;
}

/* ---------- joining mid-week ---------- */

/* Sessions done somewhere else, before the app existed for you. They are
   recorded on the plan, not in S.sessions, on purpose: they mark the day
   as spent and put the rotation back in phase, but they invent no sets,
   no tonnage and no learned weights. The app should never claim to know
   what it was not there for. */
function markTrainedElsewhere(k, spec) {
  const kk = key(k);
  if (daysBetween(kk, today()) < 0) return false;      // not the future
  const e = S.week.plan[kk] || { done: false };
  if (spec.routineId) { e.routineId = spec.routineId; e.type = 'custom'; }
  else { delete e.routineId; e.type = spec.type; }
  e.done = true; e.elsewhere = true; e.pinned = true;
  S.week.plan[kk] = e;
  save(true);
  return true;
}

function clearElsewhere(k) {
  const e = planEntry(k);
  if (!e || !e.elsewhere) return false;
  delete e.elsewhere; e.done = false;
  save(true);
  return true;
}

function elsewhereDays() { return planDays().filter(d => (planEntry(d) || {}).elsewhere); }

/* ---------- back to the app's own arrangement ---------- */
function planIsCustom() { return planDays().some(d => (planEntry(d) || {}).pinned); }

function resetPlanOrder() {
  planDays().forEach(d => {
    const e = S.week.plan[d];
    if (e.elsewhere) return;                    // history is not an opinion
    delete e.pinned; delete e.routineId;
  });
  buildWeekPlan(true);
  save(true);
}
