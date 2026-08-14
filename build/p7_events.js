/* ============================================================
   REST TIMER
   ============================================================ */
/* One countdown, two jobs.
   ------------------------
   It was only ever a rest timer. A movement measured in seconds needs the same
   thing pointed the other way — count the work, not the gap after it — and
   running two timers with two bars would mean two things on screen fighting
   for the same corner. So the bar takes a label, an appearance, and something
   to do when it reaches zero.

   `onDone` is captured before stopRest() clears it, because the callback ticks
   a set and may start the next timer immediately. */
let restEnd = 0, restTotal = 0, restTick = null, restDone = null;

function startRest(seconds, label, opts) {
  opts = opts || {};
  restTotal = Math.max(1, seconds);
  restEnd = Date.now() + restTotal * 1000;
  restDone = opts.onDone || null;
  $('#rest-label').textContent = label || 'Rest';
  /* Suppressed while the bar is counting work rather than rest: what is next
     is the thing you are in the middle of, and saying so mid-hold is noise. */
  $('#rest-next').innerHTML = opts.work ? '' : nextUpHTML(S.active);
  const bar = $('#rest-bar');
  bar.classList.add('on');
  bar.classList.toggle('work', !!opts.work);
  /* Skipping a rest is finishing it early; skipping a work interval is
     stopping it. The label has to say which. */
  $('#rest-skip').textContent = opts.work ? 'Stop' : 'Skip';
  $('#rest-add').classList.toggle('hide', !!opts.work);
  /* Built here because this runs inside the tap that started the rest, and an
     audio context created outside a gesture starts suspended and stays that
     way — the chime would then be silent for the whole session. */
  ensureAudio();
  /* On device, an alert the OS will deliver whether or not this page is still
     running. No-op on the web, where nothing can schedule one. Replaced rather
     than queued: skipping a rest and starting another inside a minute is
     completely ordinary. */
  cancelRestAlert();
  if (!opts.work) scheduleRestAlert(restTotal, nextUpText(S.active));
  clearInterval(restTick);
  restTick = setInterval(tickRest, 200);
  tickRest();
}

function tickRest() {
  const left = Math.max(0, Math.round((restEnd - Date.now()) / 1000));
  const m = Math.floor(left / 60), s = left % 60;
  $('#rest-t').textContent = m + ':' + String(s).padStart(2, '0');
  $('#rest-bar-fill').style.width = Math.max(0, (left / restTotal) * 100) + '%';
  if (left <= 0) {
    const cb = restDone;
    stopRest();
    buzz([90, 60, 90]);
    /* iOS Safari implements no vibration at all, so on the phone this app was
       built for the buzz above is silence. The sound is the alert. */
    chime();
    if (cb) cb(); else toast('Rest done', true);
  }
}

function stopRest() {
  clearInterval(restTick);
  restTick = null;
  restDone = null;
  /* Skipping a rest has to withdraw its alert too, or the phone buzzes about a
     rest you ended two minutes ago, halfway through the next set. */
  cancelRestAlert();
  const bar = $('#rest-bar');
  bar.classList.remove('on');
  bar.classList.remove('work');
}

function timerRunning() { return $('#rest-bar').classList.contains('on'); }

/* ============================================================
   SESSION LIFECYCLE
   ============================================================ */
/* The day's availability decides what gets *suggested*. Once you have
   deliberately picked a rung, that choice wins — telling someone who
   just chose "Full session" that they only get 20 minutes is the exact
   paternalism this app is supposed to avoid. */
const RUNG_MINS = { full:52, trim:34, short:18, micro:3 };
function rungMins(rung) { return rung === 'full' ? (S.profile.sessionMins || 52) : RUNG_MINS[rung]; }

function startSession(type, rung) {
  const c = dayConstraint(today());
  const env = c.env || S.profile.envs[0] || 'full';
  let mins = rungMins(rung) || 45;
  if (rung === 'full' && c.avail === 'long') mins = Math.max(mins, 65);
  const sess = generateSession(type, env, rung, mins);
  sess.started = Date.now();
  /* A day can only be discharged once. Anything started after the planned
     session is already done is an extra — otherwise finishing it would mark a
     day done that was already done, and the second session would quietly
     overwrite what the first one meant. */
  if ((S.week.plan[today()] || {}).done) sess.extra = true;
  const rd = S.readiness[today()];
  sess.readiness = rd ? rd.score : null;
  S.active = sess;
  save(true);
  wakeOn();
  go('train');
  buzz();
}

/* An empty session, optionally dated to a day that has already gone.
   Back-dating exists because a day you trained without the app in your hand is
   still a day you trained, and the alternative — the day sitting there as a
   blank forever — is the app being wrong about your own week. Everything
   downstream reads sess.date, so one parameter is the whole feature. */
function blankSession(dateKey) {
  const k = dateKey ? key(dateKey) : today();
  const c = dayConstraint(k);
  S.active = {
    id: 'sx' + Date.now().toString(36), date: k, type: 'full',
    env: c.env || 'full', rung: 'full', planMins: 0,
    backdated: daysBetween(k, today()) > 0,
    exercises: [], started: Date.now(), ended: null, dur: 0,
    activeMs: 0, tickAt: Date.now(), paused: false,
    readiness: (S.readiness[k] || {}).score || null
  };
  save(true); go('train');
}

function finishSession() {
  const A = S.active;
  if (!A) return;
  const anyDone = A.exercises.some(i => i.sets.some(s => s.done));
  if (!anyDone) {
    if (!confirm('Nothing is ticked off. Discard this session instead?')) return;
    S.active = null; wakeOff(); save(true); render(); return;
  }
  A.ended = Date.now();
  pumpSessionClock();
  /* The time you were actually in it, not the gap between opening the session
     and remembering to close it — that is what logged 596 minutes for a push
     day. See the clock in p4_engine.js. A session with a set in it is at least
     a minute, and if the clock somehow recorded nothing the estimate from the
     work is a better answer than zero. */
  A.dur = A.backdated ? sessionMinsEstimate(A)
                      : Math.max(1, sessionActiveMins(A) || sessionMinsEstimate(A));

  /* Everything needed to put this back, captured before the finish starts
     taking things apart.

     Finishing is destructive in a way that is easy to miss: the filter on the
     next line deletes every movement you had not ticked. Hit the button one
     movement early — which is the whole reason this exists — and the rest of
     the session is not merely closed, it is gone, so there is nothing left to
     go back to. `all` is taken before the filter and holds the same objects,
     so the ticks on the kept ones are the same ticks.

     One slot, not one per session: only the most recent finish is reversible,
     because progression compounds and a session with later ones stacked on top
     of it cannot have its lifts restored without unpicking theirs too. */
  const touched = {};
  A.exercises.forEach(i => { if (S.lifts[i.exId]) touched[i.exId] = S.lifts[i.exId]; });
  S.lastFinish = {
    id: A.id,
    at: Date.now(),
    date: A.date,
    all: A.exercises.slice(),
    lifts: JSON.parse(JSON.stringify(touched)),
    /* Whether the day was already discharged before this session, so putting
       the session back does not un-tick a day something else had settled. */
    planWasDone: !!((S.week.plan[A.date] || {}).done),
    stretchWasDone: ((S.stretch && S.stretch.done && S.stretch.done[key(A.date)]) || []).slice()
  };

  A.exercises = A.exercises.filter(i => i.sets.some(s => s.done));
  A.kcal = sessionKcal(A);
  applyProgression(A);
  S.sessions.push(A);
  /* An extra you chose to do must not quietly discharge the session you
     committed to. Abs at 10pm is not the same as the Upper day you skipped. */
  if (!A.extra && S.week.plan[A.date]) S.week.plan[A.date].done = true;
  /* A stretch run through Train ticks the day off in the stretch store too, so
     running it and ticking it by hand mean the same thing everywhere. */
  markStretchSessionDone(A);
  if (A.routineId) {
    const rt = routineById(A.routineId);
    if (rt) { rt.uses = (rt.uses || 0) + 1; rt.lastUsed = A.date; }
  }
  S.active = null;
  stopRest();
  wakeOff();
  save(true);
  const v = sessionVolume(A);
  const fresh = checkMilestones();
  save(true);
  buzz([40, 50, 90]);
  go('today');
  setTimeout(() => sheetSessionDone(A, v, fresh), 220);
}

/* Whether the session just finished can still be picked back up.

   Only the last one in the log, only while it is still today, and only while
   nothing has been logged after it — progression compounds, so restoring the
   lifts under a session that has another one stacked on top would quietly
   undo that one's gains too. `today()` rather than a wall-clock window, so a
   session finished at 1am on a 4am day boundary is still today's. */
function canReopen() {
  const f = S.lastFinish;
  if (!f || S.active) return false;
  const last = (S.sessions || [])[S.sessions.length - 1];
  return !!last && last.id === f.id && key(f.date) === today();
}

/* Put it back exactly as it was, including the movements the finish deleted. */
function reopenSession() {
  if (!canReopen()) return false;
  const f = S.lastFinish;
  const A = S.sessions.pop();

  /* The full list, so the movements you had not started are there to finish —
     which is the entire point. */
  A.exercises = f.all;
  delete A.ended;
  delete A.dur;
  delete A.kcal;

  /* Progression, unwound. Restoring only what the session touched: an entry it
     never looked at must keep whatever else has written to it. */
  Object.keys(f.lifts).forEach(id => { S.lifts[id] = f.lifts[id]; });

  if (!f.planWasDone && S.week.plan[A.date]) delete S.week.plan[A.date].done;
  if (S.stretch && S.stretch.done) {
    if (f.stretchWasDone.length) S.stretch.done[key(A.date)] = f.stretchWasDone.slice();
    else delete S.stretch.done[key(A.date)];
  }
  if (A.routineId) {
    const rt = routineById(A.routineId);
    if (rt && rt.uses) rt.uses--;
  }

  /* The clock picks up where it stopped rather than counting the time the
     session spent closed — tickAt is what stops a gap being back-filled. */
  A.tickAt = Date.now();
  S.active = A;
  S.lastFinish = null;
  wakeOn();
  save(true);
  return true;
}

function sheetSessionDone(A, v, fresh) {
  const st = journeyStats();
  const nxt = nextMilestone();
  const kc = A.kcal || 0;
  openSheet(`
    <div class="center">
      <div style="font-size:44px">${A.rung==='micro'?ICO.clock:ICO.tick}</div>
      <h2 class="h1 mt-s">Waypoint marked</h2>
      <p class="small mt-s">${completionLine(A, st)}</p>
      <div class="journey-line mt">Day ${st.day} of your guzo · session ${st.count}</div>
    </div>
    <div class="tiles mt-l mb">
      <div class="tile"><div class="v">${v.sets}</div><div class="k">Sets</div></div>
      <div class="tile"><div class="v">${A.dur}</div><div class="k">Minutes</div></div>
      ${kc ? `<div class="tile"><div class="v" style="color:var(--ember)">${kc}</div><div class="k">kcal</div></div>` : ''}
      ${v.tonnage ? `<div class="tile"><div class="v">${(v.tonnage/1000).toFixed(1)}k</div><div class="k">${unit()}</div></div>` : ''}
    </div>
    ${sessionPRsHTML(A)}
    ${fresh && fresh.length ? fresh.map(m => `
      <div class="milestone mb">
        <div class="milestone-ico">${ico(m.ico)}</div>
        <div class="milestone-eyebrow">Milestone reached</div>
        <div class="milestone-t">${m.title}</div>
        <p class="milestone-b">${m.body}</p>
      </div>`).join('') : ''}
    ${!fresh.length && nxt && nxt.left > 0 && nxt.left <= 5 ? `
      <div class="banner soft mb">${nxt.left} more ${nxt.unit} to <strong>${nxt.title}</strong>.</div>` : ''}
    ${A.exercises.filter(i => i.deloaded).length ? `<div class="banner soft mb">Some weights were pulled back 10% after two sessions short of target. That's the plan working, not you failing.</div>` : ''}
    ${/* Offered here because this is the only moment it is obvious. Someone
          finishing at 2am does not go looking through Settings for a concept
          they have no name for — they just notice the app has put their
          session on the wrong day and assume that is how it works. Shown once:
          answering it either way sets dayStartSeen, so it never nags. */
      lateFinishHint() ? `<div class="banner soft mb">
        <strong>Logged on ${h(prettyDate(A.date))}.</strong> Training this late often? Your day can roll over later than midnight, so a session after a long shift lands on the day you have been awake for.
        <button class="btn xs ghost mt-s" data-act="day-start">Set when my day ends</button>
      </div>` : ''}
    <div class="creed">
      <div class="creed-rule"></div>
      <span class="creed-mark">&ldquo;</span>
      <p class="creed-text">${dailyLine()}</p>
      <span class="creed-tag">GUZO · ${prettyDate(today()).toUpperCase()}</span>
    </div>
    <button class="btn primary block lg mt" data-act="close">Good</button>
    ${/* The way back, offered where the mistake is noticed. Hitting finish one
          movement early is a tap error, and the moment you find out is this
          sheet — so the correction belongs on it rather than somewhere you
          would have to know exists. Quiet, because it is the way out of a
          screen you reached by finishing, not a second thing to do. */''}
    ${canReopen() ? `<button class="btn quiet block mt-s" data-act="reopen-session">Not finished &mdash; go back in</button>` : ''}
  `);
}

/* ============================================================
   EXPORT / IMPORT
   ============================================================ */
function exportData() {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'guzofit-backup-' + today() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Backup downloaded', true);
}
function importData() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const d = JSON.parse(fr.result);
        if (!d.profile || !Array.isArray(d.sessions)) throw new Error('not a Guzo backup');
        if (!confirm('Replace everything on this device with this backup?')) return;
        S = Object.assign(blank(), d);
        save(true); closeSheet(); go('today');
        toast('Backup restored', true);
      } catch (e) { toast('That file did not read as a backup'); }
    };
    fr.readAsText(f);
  };
  inp.click();
}

/* ============================================================
   EVENT DELEGATION
   ============================================================ */
/* A control you can focus but not operate is worse than one you cannot reach:
   it takes a tab stop and does nothing. Enter and Space activate anything
   a11yPass promoted. Space is preventDefault'd so it does not scroll. */
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
  const t = ev.target.closest && ev.target.closest('[role="button"][data-act],[role="button"][data-go]');
  if (!t) return;
  ev.preventDefault();
  t.click();
});

document.addEventListener('click', ev => {
  /* Any tap counts as being in the workout. The session clock stops after ten
     idle minutes, and this is what "idle" is measured against. */
  noteInteraction();
  const nav = ev.target.closest('[data-go]');
  if (nav) { go(nav.dataset.go); return; }

  const t = ev.target.closest('[data-act]');
  if (!t) return;
  const a = t.dataset.act;
  const v = t.dataset.v;
  const i = t.dataset.i != null ? +t.dataset.i : null;
  const si = t.dataset.s != null ? +t.dataset.s : null;

  const NEEDS_ACTIVE = ['toggle-set','add-set','del-set','swap-ex','add-exercise','ex-menu',
                        'save-note','remove-ex','finish','abandon','toggle-collapse','pick-ex','leave-session',
                        'ex-load'];
  if (a === 'help-form-session' && !S.active) { sheetForm(v, false); return; }
  if (a === 'ex-form' && !S.active) { if (v) sheetExerciseGuide(v, false); return; }
  /* Building a routine is a multi-select job. Throwing the sheet away after
     every single choice turns "add six movements" into six round trips. */
  /* The picker, standing in for a match the import got wrong or could not
     make. Handed back to the review rather than closed, so you keep your place
     in a list that can be fifty movements long. */
  if (a === 'pick-ex' && pickerFor && pickerFor.mode === 'import') {
    const d = IMPORT && IMPORT.days[pickerFor.day];
    const it = d && d.items[pickerFor.item];
    if (it && EX[v]) { it.exId = v; it.sure = true; it.score = 1; it.on = true; }
    pickerFor = null;
    sheetImportReview();
    return;
  }
  if (a === 'pick-ex' && pickerFor && pickerFor.mode === 'routine') {
    if (!addToRoutine(pickerFor.id, v)) { toast('That routine is full'); return; }
    pickerAdded.push(v);
    buzz();
    renderPicker(window._pickQ || '', window._pickEnv || 'full');
    return;
  }
  if (a === 'pick-ex' && pickerFor && pickerFor.mode === 'add' && S.active) {
    const ex = EX[v];
    if (!ex) return;
    const tg = targetFor(ex.id);
    S.active.exercises.push({
      exId: ex.id, name: ex.name, load: ex.load,
      targetW: tg.w, targetR: tg.r || ex.rl,
      sets: Array.from({ length: 3 }, () => ({ w: tg.w != null ? tg.w : '', r:'', rpe:'', done:false })),
      note: ''
    });
    pickerAdded.push(v);
    save(); buzz();
    renderPicker(window._pickQ || '', window._pickEnv || 'full');
    return;
  }
  if (a === 'pick-group') {
    pickerOpen = (pickerOpen === v) ? null : v;
    renderPicker(window._pickQ || '', window._pickEnv || 'full');
    return;
  }
  if (a === 'pick-finish') {
    const mode = pickerFor && pickerFor.mode;
    const id = pickerFor && pickerFor.id;
    const n = pickerAdded.length;
    /* The builder is a sheet too, and rt-add opened the picker over it without
       closing anything — so hand straight back. Closing first would pop the
       one history entry the whole sheet stack rides on, push a new one, and
       throw away where the builder had been scrolled to. */
    if (mode === 'routine' && id) sheetRoutineEdit(id);
    else { closeSheet(); renderTrain(); }
    if (n) toast(n + ' added', true);
    return;
  }
  if (NEEDS_ACTIVE.includes(a) && !S.active) { render(); return; }

  switch (a) {
    /* ---- onboarding ---- */
    case 'ob-next': {
      const k = OB_STEPS[obStep].k;
      if (k === 'name') { const n = $('#ob-focus'); if (n) obDraft.name = n.value.trim(); }
      if (k === 'body') {
        const n = $('#ob-focus');
        const val = n ? parseFloat(n.value) : NaN;
        if (n && n.value !== '' && (isNaN(val) || val <= 0)) { toast('That does not look like a weight'); return; }
        obDraft.bodyweight = isNaN(val) ? null : val;
      }
      if (k === 'sleep') {
        const n = $('#ob-focus');
        const val = n ? parseFloat(n.value) : NaN;
        obDraft.sleepNorm = (isNaN(val) || val < 3 || val > 12) ? 7.5 : val;
      }
      if (k === 'goals' && !obDraft.goals.length) { toast('Pick at least one — they are not exclusive'); return; }
      if (k === 'env' && !obDraft.envs.length) { toast('Pick at least one place'); return; }
      if (k === 'cardiomode' && !obDraft.cardioModes.length) { toast('Pick at least one you would actually do'); return; }
      if (k === 'geardetail' && !Object.values(obDraft.gear).some(Boolean)) { toast('You must have something'); return; }
      if (k === 'age') collectAgeInput();
      if (k === 'measure') collectMeasureInputs();
      if (k === 'seed') collectSeedInputs();
      obAdvance(1); renderOnboard(); break;
    }
    case 'ob-skip-bw': { obDraft.bodyweight = null; obAdvance(1); renderOnboard(); break; }
    /* Skipping is a real answer, so it clears rather than leaves whatever was
       half-typed. Fuel still works from bodyweight alone. */
    case 'ob-skip-measure': {
      obDraft.heightCm = null;
      obAdvance(1); renderOnboard(); break;
    }
    case 'ob-skip-age': { obDraft.birthYear = null; obAdvance(1); renderOnboard(); break; }
    case 'ob-sex': { collectMeasureInputs(); obDraft.sex = v; renderOnboard(); break; }
    case 'ob-activity': { obDraft.activity = v; renderOnboard(); break; }
    case 'ob-meals':  { obDraft.mealsPerDay = +v; renderOnboard(); break; }
    case 'ob-snacks': { obDraft.snacksPerDay = +v; renderOnboard(); break; }
    case 'ob-diet-pattern': { obDraft.dietPattern = v; renderOnboard(); break; }
    case 'ob-diet-exclude': {
      const ix = obDraft.dietExclude.indexOf(v);
      if (ix >= 0) obDraft.dietExclude.splice(ix, 1); else obDraft.dietExclude.push(v);
      renderOnboard(); break;
    }
    case 'ob-back': {
      const k = OB_STEPS[obStep].k;
      if (k === 'name') { const n = $('#ob-focus'); if (n) obDraft.name = n.value.trim(); }
      if (k === 'body') { const n = $('#ob-focus'); const val = n ? parseFloat(n.value) : NaN; obDraft.bodyweight = isNaN(val) ? null : val; }
      if (k === 'sleep') { const n = $('#ob-focus'); const val = n ? parseFloat(n.value) : NaN; if (!isNaN(val)) obDraft.sleepNorm = val; }
      if (k === 'measure') collectMeasureInputs();
      if (k === 'seed') collectSeedInputs();
      obAdvance(-1); renderOnboard(); break;
    }
    case 'ob-units': {
      const n = $('#ob-focus');
      if (n) { const val = parseFloat(n.value); obDraft.bodyweight = isNaN(val) ? null : val; }
      obDraft.units = v; renderOnboard(); break;
    }
    case 'ob-goal': {
      const ix = obDraft.goals.indexOf(v);
      if (ix >= 0) obDraft.goals.splice(ix, 1); else obDraft.goals.push(v);
      /* Choosing fat loss pre-selects Fuel, because a deficit you cannot see is
         not a plan — it is a guess with a number attached. Pre-selected, not
         forced: the Fuel screen still asks, and answering "not for now" there
         still works and still keeps the goal. Only ever turned on, never off,
         so unticking the goal does not silently undo a choice made later. */
      if (v === 'lean' && obDraft.goals.includes('lean')) obDraft.nutrition = true;
      renderOnboard(); break;
    }
    case 'ob-level': obDraft.level = v; renderOnboard(); break;
    case 'ob-seed-reset': obDraft.seedOverrides = {}; obDraft.seedExact = {}; renderOnboard(); toast('Back to suggestions', true); break;
    case 'ob-priority': {
      const ix = obDraft.priorities.indexOf(v);
      if (ix >= 0) obDraft.priorities.splice(ix, 1);
      else if (obDraft.priorities.length >= 3) { toast('Three is the limit — beyond that nothing is a priority'); return; }
      else obDraft.priorities.push(v);
      renderOnboard(); break;
    }
    case 'ob-cardio': obDraft.cardioAmount = v; renderOnboard(); break;
    case 'ob-cardiomode': {
      const ix = obDraft.cardioModes.indexOf(v);
      if (ix >= 0) obDraft.cardioModes.splice(ix, 1); else obDraft.cardioModes.push(v);
      renderOnboard(); break;
    }
    case 'ob-injury': {
      const ix = obDraft.injuries.indexOf(v);
      if (ix >= 0) obDraft.injuries.splice(ix, 1); else obDraft.injuries.push(v);
      renderOnboard(); break;
    }
    case 'ob-sleep': obDraft.sleepNorm = parseFloat(v); renderOnboard(); break;
    case 'ob-env': {
      const ix = obDraft.envs.indexOf(v);
      if (ix >= 0) obDraft.envs.splice(ix, 1); else obDraft.envs.push(v);
      obDraft.envs.sort((x,y) => ['full','hotel','bw'].indexOf(x) - ['full','hotel','bw'].indexOf(y));
      renderOnboard(); break;
    }
    case 'ob-gearmode': {
      obDraft.gearMode = v;
      if (v === 'commercial') obDraft.gear = { ...GEAR_ALL };
      renderOnboard(); break;
    }
    case 'ob-gear': { obDraft.gear[v] = !obDraft.gear[v]; renderOnboard(); break; }
    case 'ob-prog': obDraft.programId = v; renderOnboard(); break;
    case 'ob-length': obDraft.sessionMins = +v; renderOnboard(); break;
    case 'ob-nutrition': obDraft.nutrition = (v === 'yes'); renderOnboard(); break;
    case 'ob-finish': {
      const P = S.profile;
      P.name = obDraft.name;
      P.units = obDraft.units;
      P.goals = obDraft.goals;
      P.level = obDraft.level;
      P.priorities = obDraft.priorities;
      P.injuries = obDraft.injuries;
      P.sleepNorm = obDraft.sleepNorm;
      P.sessionMins = obDraft.sessionMins;
      P.cardio = { amount: obDraft.cardioAmount, modes: obDraft.cardioModes };
      P.envs = obDraft.envs.length ? obDraft.envs : ['full'];
      P.gear = obDraft.envs.includes('full') ? { ...obDraft.gear } : { ...GEAR_ALL };
      P.programId = obDraft.programId;
      S.settings.nutrition = obDraft.nutrition;
      /* "Longer rests" is the Get stronger option's own wording, so it has to
         mean something. Three minutes on compounds is the range the strength
         literature actually uses; the 150s default is a hypertrophy rest.
         Only when strength is the goal and size is not — asking for both is
         asking for the middle, which is where the default already sits. And
         only ever set here, at first setup, because it is a Settings row the
         user owns from that point on. */
      if (obDraft.goals.includes('strength') && !obDraft.goals.includes('muscle')) {
        S.settings.restMain = 180;
      }
      /* Age is asked of everyone, so it is kept by everyone.

         It used to live behind this gate with height and sex, which was right
         when all three were only asked on the measure screen. It is its own
         step in the "You" chapter now and obSkip() never skips it — so gating
         the write threw away an answer the user had just given, on a screen
         that promises it changes how hard sessions are spaced. Declining Fuel
         silently deleted the year, the band, and the notice. */
      if (obDraft.birthYear) P.birthYear = obDraft.birthYear;
      /* These three genuinely are only asked when Fuel is on — the measure and
         activity screens are skipped otherwise, so the draft still holds its
         defaults and writing them would fabricate a height nobody gave. */
      if (obDraft.nutrition) {
        if (obDraft.heightCm) P.heightCm = obDraft.heightCm;
        P.sex = obDraft.sex;
        P.activity = obDraft.activity;
        S.nutrition.prefs = {
          meals: obDraft.mealsPerDay, snacks: obDraft.snacksPerDay,
          pattern: obDraft.dietPattern, exclude: [...obDraft.dietExclude]
        };
      }
      seedStartingWeights(obDraft.level, obDraft.bodyweight || 0, obDraft.seedOverrides, obDraft.seedExact);
      if (obDraft.bodyweight > 0) {
        P.bodyweight = [{ d: today(), w: obDraft.bodyweight }];
        const t = suggestedTargets(obDraft.bodyweight, obDraft.goals);
        if (t) S.nutrition.targets = t;
      }
      // pre-fill the week as ordinary so the builder is a review, not a form
      const ws = weekStart();
      for (let i = 0; i < 7; i++) {
        const k2 = dk(addDays(ws, i));
        if (!S.week.days[k2]) S.week.days[k2] = { avail:'normal', env: P.envs[0], note:'' };
      }
      S.onboarded = true;
      save(true);
      go('today');
      setTimeout(sheetWeek, 300);
      break;
    }

    /* ---- readiness ---- */
    case 'open-readiness': {
      window._rdDraft = null;
      const saved = S.readiness[today()];
      sheetReadiness(saved ? { ...saved } : null);
      break;
    }
    case 'rd-sleep': {
      const r = window._rdDraft;
      r.sleepH = Math.max(0, Math.min(14, Math.round((r.sleepH + parseFloat(v)) * 2) / 2));
      sheetReadiness(r); break;
    }
    case 'rd-set': {
      const r = window._rdDraft;
      const map = { sleep:'sleepQ', energy:'energy', soreness:'sore', stress:'stress' };
      const f = map[t.dataset.f] || t.dataset.f;
      r[f] = +v;
      sheetReadiness(r); break;
    }
    case 'rd-save': {
      const r = window._rdDraft;
      r.score = readinessScore(r);
      r.at = Date.now();
      S.readiness[today()] = r;
      window._rdDraft = null;
      save(true); closeSheet(); render();
      toast('Logged. Session sized to match.', true);
      break;
    }

    /* ---- week shaping ---- */
    case 'open-week': sheetWeek(); break;
    case 'wk-offset': weekOffset = +v; sheetWeek(); break;
    case 'day-start': sheetDayStart(); break;
    case 'set-daystart': {
      S.profile.dayStart = +v || 0;
      /* Seen, whichever way it was answered — including "midnight", which is a
         decision and not an unanswered question. This is what stops the
         after-a-late-session hint appearing for ever. */
      S.profile.dayStartSeen = true;
      save(true); buzz();
      sheetDayStart(); render();
      toast(dayStartHour() ? 'Your day now ends at ' + dayStartLabel().toLowerCase() : 'Back to the calendar day', true);
      break;
    }
    case 'day-edit': sheetDayEdit(t.dataset.k, t.dataset.b); break;
    case 'day-open': sheetDay(t.dataset.k); break;
    case 'wk-avail': {
      const k = t.dataset.k;
      setDayAvail(k, v);
      save(); buzz(); render(); sheetDayEdit(k, t.dataset.b); break;
    }
    case 'wk-env': {
      const k = t.dataset.k;
      S.week.days[k] = Object.assign(dayConstraint(k), { env:v });
      save(); buzz(); render(); sheetDayEdit(k, t.dataset.b); break;
    }
    case 'wk-save': {
      if (weekOffset === 0) {
        buildWeekPlan(true);
        const n = Object.keys(S.week.plan).length;
        toast(n === 0 ? 'Week set — short sessions stay available daily'
                      : n + ' session' + (n===1?'':'s') + ' placed this week', true);
      } else {
        toast('Next week saved — it will be waiting on Monday', true);
      }
      weekOffset = 0;
      save(true); closeSheet(); render();
      break;
    }
    case 'day-tap': {
      /* Decided by the calendar, not by whether a session happens to be
         placed. Every day opens on what it is; the editors are one tap in. */
      const k = key(t.dataset.k);
      if (daysBetween(k, today()) > 0) sheetDayPast(k); else sheetDay(k);
      break;
    }
    case 'log-past': {
      const k = key(t.dataset.k);
      if (S.active) { toast('Finish the session you are in first'); go('train'); return; }
      closeSheet();
      blankSession(k);
      break;
    }
    /* ---- moving the dashboard strip between weeks ---- */
    case 'strip-week': stepStripWeek(+t.dataset.d); break;

    /* ---- the order of the week ---- */
    case 'plan-day': sheetPlanDay(t.dataset.k); break;
    case 'plan-move': {
      if (movePlanDay(t.dataset.k, +t.dataset.d)) { sheetWeek(); render(); buzz(); }
      break;
    }
    case 'plan-set': {
      const spec = t.dataset.r ? { routineId: t.dataset.r } : { type: v };
      sheetPlanApply(t.dataset.k, spec);
      break;
    }
    case 'plan-apply': {
      const spec = t.dataset.r ? { routineId: t.dataset.r } : { type: v };
      setPlanDay(t.dataset.k, spec, t.dataset.m);
      closeSheet(); sheetWeek(); render(); buzz();
      toast('Week updated', true);
      break;
    }
    case 'plan-reset': {
      resetPlanOrder(); sheetWeek(); render();
      toast('Back to the app\u2019s order', true);
      break;
    }
    case 'plan-elsewhere': sheetElsewhere(); break;
    case 'elsewhere-pick': sheetElsewherePick(t.dataset.k); break;
    case 'elsewhere-set': {
      markTrainedElsewhere(t.dataset.k, { type: v });
      /* Put the rotation back in phase with what actually happened. */
      reflowFrom(t.dataset.k); save(true);
      sheetElsewhere(); render(); buzz();
      break;
    }
    case 'elsewhere-clear': {
      clearElsewhere(t.dataset.k); sheetElsewhere(); render();
      break;
    }
    case 'noop': break;

    /* ---- ladder / start ---- */
    case 'open-ladder': sheetLadder(t.dataset.type || nextType()); break;
    case 'pick-rung': closeSheet(); startSession(t.dataset.type || nextType(), v); break;
    case 'quick-rung': closeSheet(); startSession(nextType(), v); break;
    case 'start-session': startSession(t.dataset.type, t.dataset.rung); break;
    case 'blank-session': blankSession(); break;
    case 'open-typepick': sheetTypePick(); break;
    case 'pick-type': closeSheet(); sheetLadder(v); break;
    case 'reopen-session': {
      if (!reopenSession()) { toast('That one can no longer be reopened'); break; }
      closeSheet();
      go('train'); renderTrain();
      toast('Back in it &mdash; nothing was lost');
      break;
    }
    case 'goto-train': go('train'); break;
    case 'train-pause': {
      const paused = toggleSessionPause();
      updateTrainClock();
      toast(paused ? 'Clock paused' : 'Clock running', true);
      break;
    }
    case 'goto-progress': go('progress'); break;
    case 'new-session': sheetLadder(nextType()); break;

    /* ---- set logging ---- */
    /* Updated in place, never by re-rendering the screen — a full
       re-render mid-session closes the keyboard and loses your place. */
    case 'toggle-set': {
      const item = S.active.exercises[i];
      const st = item.sets[si];
      st.done = !st.done;
      if (st.done) {
        /* Records exactly what the row was showing. Filling from item.target*
           here instead would mean a row whose placeholder offered last week's
           82.5 quietly logging the 80 in the prescription — see ghostFor(). */
        const g = ghostFor(item, si);
        if (st.r === '' || st.r == null) st.r = g.r;
        if (tracksDistance(item, EX[item.exId])) {
          /* A distance row never offered a weight, so it must not record one:
             writing g.w here would put the prescription's kilos onto a run and
             give the reported bug a second way in. */
          if (st.d === '' || st.d == null) st.d = g.d;
        } else if (st.w === '' || st.w == null) st.w = g.w;
        st.pr = isPR(item, st);
        /* A record gets its own shape of buzz. It is the one thing that
           happens in a session you did not already know was coming. */
        buzz(st.pr ? [16, 44, 26] : 12);
        const ex = EX[item.exId];
        /* The whole of a superset: no rest between A and B, rest after the
           pair. Skipping the timer on anything that runs into a next movement
           is the entire behaviour — the one after it has no supNext and rests
           normally. */
        if (S.settings.autoRest && ex && ex.load !== 'min' && !item.supNext) {
          const secs = (ex.tier <= 2) ? S.settings.restMain : S.settings.restAcc;
          startRest(secs, item.name);
        }
      }
      if (!st.done) delete st.pr;
      const row = t.closest('.set-row');
      if (row) {
        row.classList.toggle('done', st.done);
        t.classList.toggle('on', st.done);
        /* Transient, so the flourish belongs to the tap. Removed on a timer
           because the class is what triggers it and it has to be gone before
           the next one. */
        if (st.done) { t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop');
          setTimeout(() => t.classList.remove('pop'), 400); }
        const wi = row.querySelector('[data-set="w"]');
        const ri = row.querySelector('[data-set="r"]');
        const di = row.querySelector('[data-set="d"]');
        if (wi) wi.value = st.w === '' || st.w == null ? '' : st.w;
        if (ri) ri.value = st.r === '' || st.r == null ? '' : st.r;
        if (di) di.value = st.d === '' || st.d == null ? '' : st.d;
        /* The set number becomes the star and back again. Swapped in place
           rather than by rebuilding the card, which would close the keyboard
           on the row below. */
        paintPR(row, si, st.pr);
      }
      /* Ticking set 1 fills it in, which is what the sets under it should now
         be offering. In place, because the point of all of this is that the
         screen never rebuilds under your thumb. */
      refreshGhosts(i);
      /* A tick is what moves the pace line — it counts ticked sets only. */
      refreshPace(i);
      /* Announced from out here, not from inside the fold-away below: a record
         set on set 2 of 4 is still a record, and that branch only runs on the
         last one. */
      if (st.pr) toast('Personal best — ' + item.name, true);
      /* Last set ticked → move on to the next one. The fold itself is no longer
         written down: exFolded() derives it from where you are, so
         paintTrainStates() (below, via updateTrainProgress) folds this card and
         opens the next in the same pass — and undoing the set puts both back
         without anything having to remember it did that. */
      if (st.done && isComplete(item)) {
        const doneEx = S.active.exercises.filter(isComplete).length;
        const totalEx = S.active.exercises.length;
        /* A record outranks encouragement. Both fire into the same toast
           element, so without the guard a PR on the last set of a movement is
           overwritten by "nice work" a frame later. */
        if (!st.pr && doneEx < totalEx) toast(encouragement(doneEx, totalEx), true);
        setTimeout(() => {
          if (!S.active || SCREEN !== 'train') return;   // session may have ended in the meantime
          /* Display order, not array order — a movement added mid-session lands
             at the end of the array and the raw findIndex would send you to it
             past everything you had not done yet. */
          const nextIdx = sessionOrder(S.active).find(x => !isComplete(S.active.exercises[x]));
          if (nextIdx == null) return;
          const el = document.querySelector('.ex-card[data-ei="' + nextIdx + '"]');
          if (el) el.scrollIntoView({ behavior:'smooth', block:'start' });
        }, 260);
      }
      updateTrainProgress();
      save(); break;
    }
    case 'add-set': {
      const item = S.active.exercises[i];
      const lastSet = item.sets[item.sets.length-1] || {};
      item.sets.push({ w:lastSet.w || (item.targetW != null ? item.targetW : ''), r:'', rpe:'', done:false });
      save(); renderTrain(); break;
    }
    case 'del-set': {
      const item = S.active.exercises[i];
      if (item.sets.length > 1) item.sets.pop();
      save(); renderTrain(); break;
    }
    /* Explicitly, in both directions. `collapsed` is tri-state — see
       exFolded() — so opening a movement you are not on has to write `false`
       rather than delete the key, or the next repaint folds it straight back
       up because it is still ahead of you. */
    case 'toggle-collapse': {
      const item = S.active.exercises[i];
      item.collapsed = !exFolded(item, exStand(i));
      replaceExCard(i); save(); break;
    }
    case 'swap-ex': sheetExercisePicker('swap', i); break;
    /* ---- the circuit runner ---- */
    case 'circ-start': {
      const item = S.active.exercises[i];
      const st = item && item.sets[si];
      if (!st || st.done) break;
      const secs = item.load === 'min' ? item.targetR * 60 : item.targetR;
      /* The set is ticked by the timer finishing, not by starting it. Ticking
         up front would record work you have not done yet if you stop. */
      startRest(secs, item.name, { work: true, onDone: () => {
        completeCircuitEntry(i, si);
        toast('Done — next', true);
      }});
      break;
    }
    /* The same work timer the circuit runner uses, on an ordinary set row. One
       mechanism, so the bar, the chime, the scheduled alert and the skip button
       all behave identically wherever a hold is being counted. */
    case 'set-timer': {
      const item = S.active.exercises[i];
      const st = item && item.sets[si];
      if (!st || st.done) break;
      const target = +item.targetR || 0;
      if (!(target > 0)) { toast('No length set for this one'); break; }
      const secs = item.load === 'min' ? target * 60 : target;
      noteInteraction();
      startRest(secs, item.name, { work: true, onDone: () => {
        /* Ticked by the timer finishing. Ticking up front would record a hold
           you have not done if you stop halfway. */
        const it = S.active && S.active.exercises[i];
        const s2 = it && it.sets[si];
        if (!s2 || s2.done) return;
        s2.r = target;
        s2.done = true;
        s2.pr = isPR(it, s2);
        buzz([16, 44, 26]);
        save();
        replaceExCard(i);
        updateTrainProgress();
        if (isComplete(it)) toast('Held — next', true);
      }});
      break;
    }
    case 'circ-done': { stopRest(); completeCircuitEntry(i, si); break; }
    case 'circ-undo': {
      const A = S.active;
      if (!A) break;
      stopRest();
      /* Walk back to the last ticked entry in circuit order. */
      const list = circuitItems(A);
      const rounds = Math.max(1, A.rounds || 1);
      let found = null;
      for (let r = 0; r < rounds; r++)
        for (let n = 0; n < list.length; n++) {
          const st = A.exercises[list[n]].sets[r];
          if (st && st.done) found = { ei: list[n], r };
        }
      if (!found) break;
      const st = A.exercises[found.ei].sets[found.r];
      st.done = false; st.r = '';
      A.exercises[found.ei].collapsed = false;
      save(); renderTrain(); buzz();
      break;
    }

    /* ---- the body map ----
       The hit paths in the figure answer most taps. This catches the rest:
       a tap between two regions, or on the silhouette itself, which on a
       figure the size of a phone screen is a lot of the surface. Resolved to
       the nearest region rather than to nothing, because a body map that
       sometimes ignores you reads as broken rather than as precise. */
    case 'body-pick': sheetBodyMap(v); break;
    case 'body-joint': toggleStretchArea(v); break;
    case 'body-clear': sheetBodyMap(null); break;
    case 'body-turn': {
      bodyMapView = bodyMapView === 'front' ? 'back' : 'front';
      /* The chosen muscle is dropped if it is not drawn on the side you turned
         to — a selection you cannot see is a selection you cannot undo. */
      if (bodyMapSel && bodyViewOf(bodyMapSel) !== bodyMapView) bodyMapSel = null;
      sheetBodyMap(bodyMapSel);
      break;
    }
    case 'body-map': sheetBodyMap(null); break;

    /* Tapping a segment of the rail goes to that movement — and opens it if it
       had folded itself away, because scrolling to a collapsed card would look
       like nothing happened. */
    case 'rail-go': {
      const it = S.active && S.active.exercises[i];
      if (!it) break;
      if (exFolded(it, exStand(i))) { it.collapsed = false; replaceExCard(i); }
      const el = document.querySelector('.ex-card[data-ei="' + i + '"]');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      buzz();
      break;
    }

    case 'add-exercise': sheetExercisePicker('add', null); break;
    case 'pick-env': renderPicker(($('#pick-q')||{}).value || '', v); break;
    case 'pick-ex': {
      const ex = EX[v];
      if (!ex) break;
      const tg = targetFor(ex.id);
      const built = {
        exId: ex.id, name: ex.name, load: ex.load,
        targetW: tg.w, targetR: tg.r || ex.rl,
        sets: Array.from({ length: ex.tier <= 2 ? 3 : 3 }, () => ({ w:tg.w != null ? tg.w : '', r:'', rpe:'', done:false })),
        note: ''
      };
      if (pickerFor && pickerFor.mode === 'swap' && pickerFor.i != null) {
        const old = S.active.exercises[pickerFor.i];
        built.sets = old.sets.map(() => ({ w:tg.w != null ? tg.w : '', r:'', rpe:'', done:false }));
        S.active.exercises[pickerFor.i] = built;
      } else {
        S.active.exercises.push(built);
      }
      save(); closeSheet(); renderTrain(); break;
    }
    case 'ex-menu': {
      const item = S.active.exercises[i];
      const ex = EX[item.exId] || {};
      openSheet(`
        <div class="eyebrow">${h(ex.primary || '')}${ex.sec && ex.sec.length ? ' &middot; ' + h(ex.sec.join(', ')) : ''}</div>
        <h2 class="h1 mt-s mb">${h(item.name)}</h2>
        <div class="list mb">
          ${hasForm(item.exId) ? `<div class="lrow" data-act="ex-form" data-i="${i}" data-v="${h(item.exId)}">
            <div class="ico">${ICO.target}</div>
            <div class="grow"><div class="h3">How to do it</div>
              <div class="tiny mt-s">Form guide, drawn for this movement</div></div>
            <span class="chev">&rsaquo;</span>
          </div>` : ''}
          <div class="lrow" data-act="swap-ex" data-i="${i}">
            <div class="ico">${ICO.link}</div>
            <div class="grow"><div class="h3">Swap it out</div>
              <div class="tiny mt-s">Something else that trains the same thing</div></div>
            <span class="chev">&rsaquo;</span>
          </div>
          ${/* The weight column is hidden on a movement that has no weight in it
                — see wantsLoad(). This is how a weighted pull-up or a plank with
                a plate on your back gets it back, and it stays once there is a
                weight logged, so it is asked for once. */''}
          ${(item.load === 'bw' || item.load === 'time' || item.load === 'min')
            && !tracksDistance(item, ex) ? `<div class="lrow" data-act="ex-load" data-i="${i}">
            <div class="ico">${ICO['gear-dumbbell']}</div>
            <div class="grow"><div class="h3">${wantsLoad(item) ? 'Bodyweight only' : 'Add weight to this'}</div>
              <div class="tiny mt-s">${wantsLoad(item)
                ? 'Hide the weight column again'
                : 'A vest, a plate or a belt — shows the weight column'}</div></div>
          </div>` : ''}
        </div>
        <div class="field mb"><div class="label">Note</div><textarea class="input" id="ex-note" placeholder="Left shoulder tight, used neutral grip…">${h(item.note||'')}</textarea></div>
        <button class="btn ghost block mb-s" data-act="save-note" data-i="${i}">Save note</button>
        <button class="btn danger block" data-act="remove-ex" data-i="${i}">Remove from session</button>`,
        { key: 'ex-menu:' + i });
      break;
    }
    /* Turning it off has to clear what is already logged, or wantsLoad() reads
       those weights back and the column returns on the next render — a switch
       that undoes itself is worse than no switch. */
    case 'ex-load': {
      const item = S.active.exercises[i];
      const on = wantsLoad(item);
      item.addLoad = !on;
      if (on) { item.sets.forEach(s => { s.w = ''; }); delete item.targetW; }
      save(); closeSheet(); renderTrain(); break;
    }
    case 'save-note': {
      S.active.exercises[i].note = ($('#ex-note')||{}).value || '';
      save(); closeSheet(); renderTrain(); toast('Noted', true); break;
    }
    case 'remove-ex': {
      S.active.exercises.splice(i, 1);
      save(); closeSheet(); renderTrain(); break;
    }
    case 'finish': finishSession(); break;
    /* Step out without destroying anything — the session waits on Today. */
    case 'leave-session': {
      stopRest(); save(true); go('today');
      toast('Session saved — pick it up any time', true);
      break;
    }
    case 'abandon': {
      if (confirm('Discard this session? Nothing will be saved.')) {
        S.active = null; stopRest(); save(true); go('today');
      }
      break;
    }

    /* ---- structure / profile ---- */
    case 'open-program': sheetProgram(); break;
    case 'set-program': {
      S.profile.programId = v;
      buildWeekPlan(true);
      save(true); closeSheet(); render(); toast(PROGRAMS[v].name + ' set', true); break;
    }
    case 'edit-profile': sheetProfile(); break;
    /* The numbers move with the label. Flipping the label alone left every
       stored weight meaning something else — see convertStoredWeights. */
    case 'set-units': {
      const from = S.profile.units;
      if (v === from || (v !== 'kg' && v !== 'lb')) break;
      const n = convertStoredWeights(unitFactor(from, v));
      S.profile.units = v;
      save(true); render(); sheetProfile();
      toast(n ? `Now in ${v} — ${n} stored weight${n === 1 ? '' : 's'} converted`
              : `Now in ${v}`, true);
      break;
    }
    case 'set-dist-units': {
      const from = distUnit();
      if (v === from || (v !== 'km' && v !== 'mi')) break;
      /* Converted before the setting moves, same as weights: the factor is
         built from where the numbers were written, not from where they are
         going. */
      const n = convertStoredDistances(distFactor(from, v));
      S.profile.distUnit = v;
      save(true); render(); sheetProfile();
      toast(n ? `Now in ${v === 'km' ? 'kilometres' : 'miles'} — ${n} distance${n === 1 ? '' : 's'} converted`
              : `Now in ${v === 'km' ? 'kilometres' : 'miles'}`, true);
      break;
    }
    case 'units-repair': sheetUnitsRepair(); break;
    case 'units-repair-go': {
      const n = convertStoredWeights(unitFactor(unit() === 'kg' ? 'lb' : 'kg', unit()));
      save(true); render(); closeSheet();
      toast(n ? n + ' weights corrected' : 'Nothing to correct', true);
      break;
    }
    case 'save-profile': {
      S.profile.name = (($('#pf-name')||{}).value || '').trim();
      save(true); closeSheet(); render(); toast('Saved', true); break;
    }
    case 'edit-envs': sheetEnvs(); break;
    case 'toggle-env': {
      const ix = S.profile.envs.indexOf(v);
      if (ix >= 0) {
        if (S.profile.envs.length > 1) S.profile.envs.splice(ix, 1);
        else { toast('Keep at least one'); break; }
      } else S.profile.envs.push(v);
      S.profile.envs.sort((x,y) => ['full','hotel','bw'].indexOf(x) - ['full','hotel','bw'].indexOf(y));
      save(); sheetEnvs(); break;
    }
    case 'rest-settings': sheetRest(); break;
    case 'rest-adj': {
      const f = t.dataset.f;
      S.settings[f] = Math.max(15, Math.min(400, S.settings[f] + parseInt(v, 10)));
      save(); sheetRest(); break;
    }
    /* ---- import ---- */
    case 'import': sheetImport(); break;
    /* Straight into the routine you already have open. */
    case 'import-into': sheetImport(v); break;
    case 'imp-day': {
      const d = IMPORT && IMPORT.days[i];
      if (!d) break;
      d.on = !d.on;
      sheetImportReview(); buzz(); break;
    }
    case 'imp-item': {
      const d = IMPORT && IMPORT.days[i];
      const it = d && d.items[si];
      if (!it) break;
      if (!it.exId && !it.on) { toast('Pick a movement for this one first'); break; }
      it.on = !it.on;
      sheetImportReview(); buzz(); break;
    }
    case 'imp-swap': {
      const d = IMPORT && IMPORT.days[i];
      const it = d && d.items[si];
      if (!it) break;
      sheetExercisePicker('import', null);
      pickerFor = { mode: 'import', day: i, item: si, written: it.written };
      renderPicker('', window._pickEnv || 'full');
      break;
    }
    /* Back to the review with everything else still selected. */
    case 'imp-back': { pickerFor = null; sheetImportReview(); break; }
    case 'imp-commit': {
      const into = IMPORT_INTO;
      const r = commitImport();
      if (!r || !r.made) { toast('Nothing to build'); break; }
      render();
      if (into) {
        /* Back to the routine you were building, so you can see what landed
           and keep going. */
        toast(r.added === 1 ? 'One movement added' : r.added + ' movements added', true);
        if (r.skipped) setTimeout(() => toast(r.skipped + ' would not fit — the routine is full'), 2400);
        sheetRoutineEdit(into);
      } else {
        closeSheet();
        toast(r.made === 1 ? 'One routine built' : r.made + ' routines built', true);
        setTimeout(() => sheetRoutines(), 260);
      }
      break;
    }

    case 'toggle-autorest': {
      S.settings.autoRest = !S.settings.autoRest;
      save(); sheetRest(); break;
    }
    /* Explicit false, never a truthy flag — a save from before this existed
       has no key, and reading it as merely falsy would silently mute everyone. */
    case 'toggle-restsound': {
      S.settings.restSound = !restSoundOn();
      save(true); sheetRest();
      /* Played on the way on, because a sound you cannot hear until the next
         time you rest is a setting you have to test by training. */
      if (restSoundOn()) chime();
      break;
    }

    /* ---- nutrition ---- */
    case 'toggle-nutrition': {
      S.settings.nutrition = !S.settings.nutrition;
      save(true); render();
      toast(S.settings.nutrition ? 'Nutrition on — it will never block a session' : 'Nutrition off', true);
      break;
    }
    case 'open-nutrition': sheetNutrition(); break;
    case 'open-nut-targets': sheetNutTargets(); break;

    /* ---- fuel: the logging loop ---- */
    case 'fuel-day': { fuelDate = (v === today() ? null : v); closeSheet(); renderFuel(); break; }
    case 'fuel-search': { foodQ = ''; foodGroupOpen = null; sheetFoodSearch(''); break; }
    case 'fuel-quick-sheet': { foodQ = ''; foodGroupOpen = null; sheetFoodSearch(''); break; }
    case 'food-group': { foodGroupOpen = (foodGroupOpen === v) ? null : v; sheetFoodSearch(); break; }
    case 'food-pick': { sheetPortion(v, t.dataset.q ? parseFloat(t.dataset.q) : null); break; }
    case 'portion-adj': {
      const step = parseFloat(v);
      const min = portionFood && (portionFood.u === 'g' || portionFood.u === 'ml') ? 10 : 1;
      portionQty = Math.max(min, Math.round((portionQty + step) * 100) / 100);
      renderPortion(); break;
    }
    case 'portion-set': { portionQty = parseFloat(v); renderPortion(); break; }
    case 'portion-log': {
      if (!portionFood || !logFood(portionFood.id, portionQty, fuelDay())) { toast('Could not log that'); return; }
      closeSheet(); renderFuel(); buzz();
      toast(portionFood.n + ' logged', true);
      break;
    }
    case 'fuel-edit': sheetEntryEdit(v); break;
    case 'entry-meal': {
      if (setEntryMeal(fuelDay(), v, t.dataset.m)) { renderFuel(); sheetEntryEdit(v); buzz(); }
      break;
    }
    case 'entry-macros': {
      const val = id => (($('#' + id) || {}).value);
      if (setEntryMacros(fuelDay(), v, { kcal: val('ee-kcal'), p: val('ee-p'),
                                         c: val('ee-c'), f: val('ee-f') })) {
        renderFuel(); closeSheet(); toast('Updated', true);
      }
      break;
    }
    case 'fix-food': sheetFixFood(v); break;
    case 'ff-save': {
      const val = id => (($('#' + id) || {}).value);
      if (!fixFood(v, { per: val('ff-per'), kcal: val('ff-kcal'), p: val('ff-p'),
                        c: val('ff-c'), f: val('ff-f') })) break;
      renderFuel(); closeSheet();
      const f = foodById(v);
      toast(f && f.fixed ? f.n + ' saved as yours' : 'Back to the catalogue', true);
      break;
    }
    case 'ff-reset': {
      clearFix(v); renderFuel(); closeSheet(); toast('Back to the catalogue', true); break;
    }
    case 'fuel-quick-add': sheetQuickAdd(); break;
    case 'fuel-face': setFuelFace(v); break;

    /* ---- water ---- */
    /* refreshWater(), never renderFuel(): a re-render replaces the liquid with
       a new element, and a new element has no previous transform to transition
       from — the level would snap rather than rise. See refreshWater(). */
    case 'water-add': {
      logWater(+v || 0);
      noteWaterBest();
      refreshWater();
      break;
    }
    case 'water-clear': { setWater(0); noteWaterBest(); refreshWater(); break; }
    case 'water-custom': sheetWaterCustom(); break;
    case 'water-settings': sheetWaterGoal(); break;
    case 'water-custom-go': {
      const el = $('#wtr-amt');
      const n = el ? parseFloat(String(el.value).replace(',', '.')) : NaN;
      if (!(n > 0)) { toast('Enter an amount'); break; }
      logWater(unitToMl(n));
      noteWaterBest();
      closeSheet(); refreshWater();
      break;
    }
    case 'water-goal-go': {
      const el = $('#wtr-goal');
      const n = el ? parseFloat(String(el.value).replace(',', '.')) : NaN;
      /* Blank clears it back to the estimate rather than refusing — "I don't
         want to pick one" is a real answer and the field is how you say it. */
      setWaterGoal(!(n > 0) ? 0 : unitToMl(n));
      closeSheet(); renderFuel();
      toast(!(n > 0) ? 'Back to the estimate' : 'Target set', true);
      break;
    }

    /* ---- barcode ---- */
    case 'scan': sheetScan(); break;
    case 'scan-type': sheetScanType(); break;
    case 'scan-typed': {
      const raw = (($('#scan-n') || {}).value || '').replace(/\D/g, '');
      if (!validBarcode(raw)) {
        toast(raw.length === 12 || raw.length === 13
          ? 'That number does not check out — one digit is off'
          : 'Twelve or thirteen digits');
        break;
      }
      onScanned(normBarcode(raw));
      break;
    }
    case 'scan-bind': {
      if (!bindBarcode(v, t.dataset.f)) { toast('Could not bind that'); break; }
      const f = foodById(t.dataset.f);
      toast(f.n + ' — scanned next time', true);
      sheetPortion(f.id, f.per || 1);
      break;
    }
    case 'scan-new-food': { window._scanCode = v; sheetNewFood(); break; }
    case 'off-keep': {
      const f = window._offFound; window._offFound = null;
      if (!f) break;
      const saved = saveCustomFood({ n: f.n, u: f.u, per: f.per,
        kcal: f.kcal, p: f.p, c: f.c, f: f.f });
      if (!saved) { toast('Could not save that'); break; }
      bindBarcode(f.code, saved.id);
      closeSheet(); sheetPortion(saved.id, f.per);
      toast('Saved — that packet scans from now on', true);
      break;
    }
    /* Straight into the food editor with the fetched numbers filled in, so a
       wrong entry in a public database is corrected before it is kept rather
       than after it has been logged all week. */
    case 'off-edit': {
      const f = window._offFound;
      if (!f) break;
      window._scanCode = f.code;
      window._nfUnit = f.u;
      sheetNewFood();
      const put = (id, v) => { const el = $('#' + id); if (el) el.value = v; };
      put('nf-n', f.n); put('nf-kcal', f.kcal); put('nf-p', f.p); put('nf-c', f.c); put('nf-f', f.f);
      break;
    }
    /* The one setting in the app that turns on a network request. */
    case 'toggle-off': {
      S.settings.off = !S.settings.off;
      save(true); renderMore(); sheetSettings();
      toast(S.settings.off
        ? 'Barcode lookup on — the first scan of a packet asks Open Food Facts'
        : 'Barcode lookup off — nothing leaves the device', true);
      break;
    }
    case 'qa-save': {
      const val = id => (($('#' + id) || {}).value);
      if (!quickAdd({ n: val('qa-n'), kcal: val('qa-kcal'), p: val('qa-p'),
                      c: val('qa-c'), f: val('qa-f') }, fuelDay())) {
        toast('Put in at least one number'); break;
      }
      renderFuel(); closeSheet(); toast('Added', true); buzz();
      break;
    }
    case 'entry-adj': {
      const e = nutDay(fuelDay()).items.find(x => x.id === v);
      if (!e) break;
      const next = Math.max(0.5, (e.qty || 1) + parseFloat(t.dataset.d));
      updateEntry(fuelDay(), v, next);
      sheetEntryEdit(v); renderFuel(); break;
    }
    case 'entry-del': {
      deleteEntry(fuelDay(), v);
      closeSheet(); renderFuel(); toast('Removed', true); break;
    }
    case 'food-new': sheetNewFood(); break;
    case 'nf-unit': {
      window._nfUnit = v;
      ['ea','g','ml'].forEach(u => {
        const el = document.getElementById('nf-u-' + u);
        if (el) el.classList.toggle('on', u === v);
      });
      break;
    }
    case 'nf-save': {
      const val = id => (($('#' + id) || {}).value || '').trim();
      const u = window._nfUnit || 'ea';
      const f = saveCustomFood({
        n: val('nf-n'), u, per: u === 'ea' ? 1 : 100,
        kcal: val('nf-kcal'), p: val('nf-p'), c: val('nf-c'), f: val('nf-f')
      });
      if (!f) { toast('It needs a name and a calorie figure'); return; }
      /* If this food was reached by scanning something the app had never seen,
         bind the packet to it now — that is the whole point of having asked. */
      const code = window._scanCode; window._scanCode = null;
      const bound = code ? bindBarcode(code, f.id) : false;
      closeSheet(); sheetPortion(f.id, null);
      toast(bound ? 'Saved \u2014 that packet scans from now on' : 'Saved to your foods', true);
      break;
    }
    case 'fuel-copy': sheetCopyDay(); break;
    case 'fuel-copy-from': {
      const n = copyDay(v, fuelDay());
      closeSheet(); renderFuel();
      toast(n ? n + ' items copied' : 'Nothing to copy', !!n);
      break;
    }
    case 'toggle-protein-only': {
      S.settings.proteinOnly = !S.settings.proteinOnly;
      save(true); sheetNutTargets();
      if (SCREEN === 'fuel') renderFuel();
      break;
    }
    case 'nut-target-measured': {
      const a = adaptiveTdee(21);
      if (a && a.ready) {
        const goals = S.profile.goals || [];
        const adj = goals.includes('muscle') ? 250 : 0;
        S.nutrition.targets.kcal = a.tdee + adj;
        save(true); sheetNutTargets();
        if (SCREEN === 'fuel') renderFuel();
        toast('Target set from your own data', true);
      }
      break;
    }
    case 'nut-target-adj': {
      const e = energyTargets();
      const f = t.dataset.f;
      const base = (S.nutrition.targets[f] != null && S.nutrition.targets[f] > 0)
        ? S.nutrition.targets[f] : (e ? e[f] : 0);
      const min = f === 'kcal' ? 1000 : 40;
      const max = f === 'kcal' ? 6000 : 400;
      S.nutrition.targets[f] = Math.max(min, Math.min(max, base + parseFloat(v)));
      save(true); sheetNutTargets();
      if (SCREEN === 'fuel') renderFuel();
      break;
    }
    case 'nut-target-reset': {
      const e = energyTargets();
      if (e) { S.nutrition.targets = { kcal:e.kcal, p:e.p, c:e.c, f:e.f }; save(true); }
      sheetNutTargets(); if (SCREEN === 'fuel') renderFuel();
      break;
    }
    case 'open-profile': sheetProfile(); break;
    case 'open-settings': sheetSettings(); break;
    /* The Settings sheet needs its own toggle cases. The More-screen ones
       re-render More, which is the wrong surface when the switch being tapped
       is inside an open sheet — the sheet would keep showing the old state. */
    case 'set-toggle-warmup': {
      S.settings.warmup = !S.settings.warmup;
      save(true); renderMore(); sheetSettings();
      toast(S.settings.warmup ? 'Warm-up on' : 'Warm-up off', true);
      break;
    }
    /* Written as an explicit false rather than a truthy flag, so an existing
       save with no `rpe` key at all keeps the column — see rpeShown(). */
    case 'set-toggle-rpe': {
      S.settings.rpe = !rpeShown();
      save(true); renderMore(); sheetSettings();
      /* A live session is redrawn, because the column is in every set row on
         it. Safe here and nowhere near the logging path: you are in Settings,
         there is no keyboard open and no caret to lose. */
      if (S.active && SCREEN === 'train') renderTrain();
      toast(rpeShown() ? 'RPE column on' : 'RPE column off — more room for weight and reps', true);
      break;
    }
    case 'set-toggle-fuel': {
      S.settings.nutrition = !S.settings.nutrition;
      save(true); syncNav();
      if (!S.settings.nutrition && SCREEN === 'fuel') go('today'); else render();
      renderMore(); sheetSettings();
      toast(S.settings.nutrition ? 'Fuel is on' : 'Fuel is off', true);
      break;
    }
    case 'open-diet-prefs': sheetDietPrefs(); break;
    case 'diet-meals':  { dietPrefs().meals  = +v; save(true); sheetDietPrefs(); if (SCREEN === 'fuel') renderFuel(); break; }
    case 'diet-snacks': { dietPrefs().snacks = +v; save(true); sheetDietPrefs(); if (SCREEN === 'fuel') renderFuel(); break; }
    case 'diet-pattern':{ dietPrefs().pattern = v; save(true); sheetDietPrefs(); if (SCREEN === 'fuel') renderFuel(); break; }
    case 'diet-exclude': {
      const ex = dietPrefs().exclude;
      const ix = ex.indexOf(v);
      if (ix >= 0) ex.splice(ix, 1); else ex.push(v);
      save(true); sheetDietPrefs(); if (SCREEN === 'fuel') renderFuel();
      break;
    }
    case 'fuel-log-slot': {
      const n = logSuggestedSlot(v, i);
      if (!n) { toast('That suggestion is no longer available'); break; }
      renderFuel();
      toast(n + ' item' + (n === 1 ? '' : 's') + ' logged', true);
      break;
    }
    case 'toggle-fuel': {
      S.settings.nutrition = !S.settings.nutrition;
      save(true); syncNav();
      if (!S.settings.nutrition && SCREEN === 'fuel') go('today'); else render();
      renderMore();
      toast(S.settings.nutrition ? 'Fuel is on' : 'Fuel is off', true);
      break;
    }
    case 'tg-save': {
      const g = id => +((document.getElementById(id) || {}).value || 0);
      S.nutrition.targets = { kcal:g('tg-k')||2600, p:g('tg-p')||170, c:g('tg-c')||280, f:g('tg-f')||80 };
      save(true); sheetNutrition(); toast('Targets saved', true); break;
    }

    /* ---- bodyweight ---- */
    case 'log-bw': {
      const last = (S.profile.bodyweight||[]).slice(-1)[0];
      openSheet(`
        <div class="row between mb"><h2 class="h1">Bodyweight</h2></div>
        <div class="field mb"><div class="label">Today (${unit()})</div>
          <input class="input" id="bw-v" type="number" step="0.1" inputmode="decimal" value="${last?last.w:''}" placeholder="0.0"></div>
        <p class="small mb">Day-to-day swings are water and food. Only the multi-week direction means anything.</p>
        <button class="btn primary block" data-act="bw-save">Log it</button>`);
      break;
    }
    case 'bw-save': {
      const w = parseFloat(($('#bw-v')||{}).value);
      if (!w || w <= 0) { toast('Enter a number'); break; }
      S.profile.bodyweight = (S.profile.bodyweight || []).filter(b => b.d !== today());
      S.profile.bodyweight.push({ d: today(), w });
      S.profile.bodyweight.sort((a,b) => a.d < b.d ? -1 : 1);
      save(true); closeSheet(); render(); toast('Logged', true); break;
    }

    /* ---- session history ---- */
    case 'view-session': {
      const s = S.sessions.find(x => x.id === t.dataset.id);
      if (!s) break;
      const v = sessionVolume(s);
      openSheet(`
        <div class="row between mb"><h2 class="h1">${typeLabel(s.type)}</h2></div>
        <div class="row wrap gap-s mb">
          <span class="pill">${prettyDate(s.date)}</span>
          <span class="pill">${RUNGS.find(r=>r.k===s.rung)?RUNGS.find(r=>r.k===s.rung).label:''}</span>
          <span class="pill">${ENVS[s.env]?ENVS[s.env].short:''}</span>
          ${s.readiness!=null?`<span class="pill">Terrain ${s.readiness}</span>`:''}
        </div>
        <div class="tiles mb">
          <div class="tile"><div class="v">${v.sets}</div><div class="k">Sets</div></div>
          <div class="tile"><div class="v">${s.dur||0}</div><div class="k">Min</div></div>
          ${v.tonnage?`<div class="tile"><div class="v">${(v.tonnage/1000).toFixed(1)}k</div><div class="k">${unit()}</div></div>`:''}
        </div>
        ${s.exercises.map(it => `<div class="card tight mb-s">
          <div class="h3" style="font-size:14.5px">${h(it.name)}</div>
          <div class="tiny mt-s mono">${it.sets.filter(x=>x.done).map(x => `${x.w?fmtW(x.w)+unit()+'×':''}${x.r}${x.rpe?` @${x.rpe}`:''}`).join('   ')}</div>
          ${it.note?`<div class="tiny mt-s" style="color:var(--muted)">“${h(it.note)}”</div>`:''}
        </div>`).join('')}
        <button class="btn danger block mt" data-act="del-session" data-id="${s.id}">Delete this session</button>`);
      break;
    }
    case 'del-session': {
      if (!confirm('Delete this session?')) break;
      S.sessions = S.sessions.filter(x => x.id !== t.dataset.id);
      save(true); closeSheet(); render(); break;
    }

    /* ---- data ---- */
    case 'open-journey': sheetJourney(); break;
    case 'coach-note': sheetCoachNote(v); break;

    /* ---- daily metrics ---- */
    case 'daily': sheetDaily(v || null); break;
    case 'daily-paste': ingestFromClipboard(); break;

    /* ---- plate calculator ---- */
    case 'plate-calc': sheetPlateCalc(v); break;

    /* ---- profile ---- */
    case 'pf-height': sheetHeight(); break;
    case 'pf-age': sheetAge(); break;
    case 'pf-session': sheetSessionMins(); break;
    case 'pf-sleep': sheetSleepNorm(); break;
    case 'pf-sex': { if (setSex(v)) { sheetProfile(); } break; }
    case 'pf-activity': { if (setActivity(v)) { sheetProfile(); } break; }
    case 'pf-height-save': {
      const cmEl = $('#pf-cm');
      let cm;
      if (cmEl) cm = parseFloat(cmEl.value);
      else {
        const ft = parseFloat(($('#pf-ft') || {}).value) || 0;
        const inch = parseFloat(($('#pf-in') || {}).value) || 0;
        cm = (ft * 12 + inch) * 2.54;
      }
      if (!setHeight(cm)) { toast('That does not look like a height'); return; }
      closeSheet(); sheetProfile(); toast('Height saved', true);
      break;
    }
    case 'pf-age-save': {
      if (!setBirthYear(($('#pf-year') || {}).value)) { toast('That does not look like a birth year'); return; }
      closeSheet(); sheetProfile(); toast('Saved', true);
      break;
    }
    case 'pf-session-adj': {
      S.profile.sessionMins = Math.max(10, Math.min(150, (S.profile.sessionMins || 60) + parseFloat(v)));
      save(true); sheetSessionMins(); break;
    }
    case 'pf-sleep-adj': {
      S.profile.sleepNorm = Math.max(3, Math.min(12, Math.round(((S.profile.sleepNorm || 7.5) + parseFloat(v)) * 2) / 2));
      save(true); sheetSleepNorm(); break;
    }

    /* ---- routines ---- */
    case 'routines': sheetRoutines(); break;

    /* ---- stretch ---- */
    /* The only real entry point — the other four sheetStretch() calls below
       are the sheet redrawing itself, and clearing the flag there would shut
       the list the moment you ticked something in it. */
    case 'stretch': stretchListOpen = false; sheetStretch(); break;
    case 'stretch-list': stretchListOpen = !stretchListOpen; sheetStretch(); break;
    case 'stretch-setup': stretchDraft = null; sheetStretchSetup(); break;
    case 'stretch-occ': {
      /* Tapping the one already chosen clears it. "None of these" is a real
         answer and a form that will not take it gets a wrong answer instead. */
      stretchDraft.occupation = (stretchDraft.occupation === v) ? null : v;
      sheetStretchSetup(); break;
    }
    /* Through the one function, so the chip and the figure cannot disagree
       about what is flagged — see toggleStretchArea(). */
    case 'stretch-area': toggleStretchArea(v); break;
    case 'stretch-turn': {
      stretchSetView = stretchSetView === 'front' ? 'back' : 'front';
      sheetStretchSetup(); break;
    }
    case 'stretch-mins': { stretchDraft.mins = +v || 15; sheetStretchSetup(); break; }
    case 'stretch-save-setup': {
      const st = stretchStore();
      st.occupation = stretchDraft.occupation;
      st.areas = stretchDraft.areas.slice();
      st.mins = stretchDraft.mins;
      st.onboarded = true;
      stretchDraft = null;
      save(true);
      /* Handed to, not closed and reopened — closing pops the one history entry
         the whole sheet stack rides on. */
      sheetStretch();
      break;
    }
    case 'stretch-tick': {
      toggleStretchDone(v);
      buzz(12);
      sheetStretch();
      break;
    }
    case 'stretch-info': sheetStretchInfo(v); break;
    case 'stretch-back': sheetStretch(); break;
    case 'stretch-reroll': {
      /* Not a shuffle. The daily list is deterministic, so "something else"
         has to change the input rather than the dice: it stamps the movements
         you were offered as seen, which moves them down the least-recent
         tiebreak and brings the next ones up. Reroll twice and you get the
         third-best set, not the same one again. */
      dailyStretch().forEach(s => { liftOf(s.ex.id).lastDate = today(); });
      save(true);
      sheetStretch();
      break;
    }
    case 'stretch-start': {
      if (S.active) { toast('Finish the session you are in first'); go('train'); return; }
      const sess = buildStretchSession();
      if (!sess) { toast('Nothing to stretch yet'); return; }
      sess.started = Date.now();
      sess.activeMs = 0; sess.tickAt = Date.now(); sess.paused = false;
      noteInteraction();
      S.active = sess;
      save(true); closeSheet(); wakeOn(); go('train'); buzz();
      break;
    }
    case 'stretch-preset': sheetStretchPreset(v); break;
    case 'stretch-preset-start': {
      if (S.active) { toast('Finish the session you are in first'); go('train'); return; }
      const sess = buildStretchSession(presetStretch(v));
      if (!sess) { toast('Nothing to stretch yet'); return; }
      const p = presetById(v);
      if (p) sess.presetName = p.name;
      sess.started = Date.now();
      sess.activeMs = 0; sess.tickAt = Date.now(); sess.paused = false;
      noteInteraction();
      S.active = sess;
      save(true); closeSheet(); wakeOn(); go('train'); buzz();
      break;
    }
    case 'stretch-preset-save': {
      const p = presetById(v);
      if (!p) break;
      const r = newStretchRoutine(p.name);
      presetStretch(v).forEach(s => addToRoutine(r.id, s.ex.id));
      save(true);
      toast('Saved as a routine', true);
      sheetRoutineEdit(r.id);
      break;
    }
    case 'stretch-save': {
      const r = saveDailyAsRoutine();
      toast('Saved as a routine', true);
      sheetRoutineEdit(r.id);
      break;
    }
    case 'stretch-new': {
      const r = newStretchRoutine('My stretch');
      sheetRoutineEdit(r.id);
      break;
    }
    case 'stretch-open-rt': sheetRoutineEdit(v); break;
    case 'routine-new': {
      const r = newRoutine('New routine');
      sheetRoutineEdit(r.id);
      break;
    }
    case 'routine-edit': sheetRoutineEdit(v); break;
    case 'rt-add': {
      pickerFor = { mode: 'routine', id: v };
      pickerOpen = null; pickerAdded = [];
      const c = dayConstraint(today());
      renderPicker('', c.env || (S.profile.envs && S.profile.envs[0]) || 'full');
      break;
    }
    case 'rt-remove': { removeFromRoutine(v, i); sheetRoutineEdit(v); break; }
    case 'rt-move':   { moveInRoutine(v, i, +t.dataset.d); sheetRoutineEdit(v); break; }
    case 'rt-adj':    { adjustRoutineItem(v, i, t.dataset.f, +t.dataset.d); sheetRoutineEdit(v); break; }
    case 'rt-emoji':  { setRoutineEmoji(v, t.dataset.e); sheetRoutineEdit(v); break; }
    case 'rt-mode':   { setItemMode(v, i, t.dataset.m); sheetRoutineEdit(v); break; }
    case 'rt-superset': { toggleSupersetLink(v, i); sheetRoutineEdit(v); render(); buzz(); break; }
    case 'rt-circuit': {
      const r = routineById(v);
      if (!r) break;
      setRoutineCircuit(v, !r.circuit);
      sheetRoutineEdit(v); render(); buzz();
      break;
    }
    case 'rt-rounds': { adjustRoutineRounds(v, +t.dataset.d); sheetRoutineEdit(v); break; }
    case 'rt-rest':   { adjustRoutineRest(v, +t.dataset.d); sheetRoutineEdit(v); break; }
    case 'rt-warmup': {
      const r = routineById(v);
      if (!r) break;
      setRoutineWarmup(v, !r.warmup);
      sheetRoutineEdit(v); render();
      break;
    }
    case 'rt-delete': {
      const r = routineById(v);
      if (!r) break;
      if (!confirm('Delete "' + r.name + '"? The sessions you did with it are kept.')) break;
      deleteRoutine(v); closeSheet(); sheetRoutines(); render();
      toast('Routine deleted', true);
      break;
    }
    case 'routine-start': {
      if (S.active) { toast('Finish the session you are in first'); go('train'); return; }
      const sess = buildRoutineSession(v, t.dataset.planned === '1');
      if (!sess) { toast('Add something to it first'); sheetRoutineEdit(v); return; }
      sess.started = Date.now();
      /* Anchored here, not in the builder: the builder makes a session, this
         is the moment one actually starts. */
      sess.activeMs = 0; sess.tickAt = Date.now(); sess.paused = false;
      noteInteraction();
      const rd = S.readiness[today()];
      sess.readiness = rd ? rd.score : null;
      S.active = sess;
      save(true); closeSheet(); wakeOn(); go('train'); buzz();
      break;
    }
    case 'plate-settings': sheetPlateSettings(); break;
    case 'plate-toggle': {
      if (!togglePlate(parseFloat(v))) { toast('Keep at least one plate'); return; }
      sheetPlateSettings();
      break;
    }
    case 'bar-adj': {
      const cfg = plateCfg();
      if (!setBarWeight(cfg.bar + parseFloat(v))) { toast('That is not a bar'); return; }
      sheetPlateSettings();
      break;
    }
    case 'help-open': openSheet(HELP_BODY[v] ? HELP_BODY[v]() : '<p>Missing page</p>'); break;

    case 'open-help': sheetHelp(); break;
    case 'help-page': {
      if (v === 'form') { sheetFormList(''); break; }
      openSheet(HELP_BODY[v] ? HELP_BODY[v]() : '<p>Missing page</p>');
      break;
    }
    case 'help-form-list': sheetFormList(''); break;
    case 'help-form': sheetForm(v, false); break;
    case 'help-form-session': sheetForm(v, true); break;

    /* ---- exercise guide + video ---- */
    case 'ex-form': {
      const it = S.active && S.active.exercises[i];
      sheetExerciseGuide(it ? it.exId : v, !!it);
      break;
    }
    case 'ex-guide': sheetExerciseGuide(v, false); break;
    case 'vid-edit': sheetVideoLink(v); break;
    case 'vid-save': {
      const el = $('#vid-url');
      const url = el ? el.value : '';
      if (!setVideo(v, url)) { toast('That does not look like a web address'); return; }
      toast(url.trim() ? 'Video linked' : 'Link removed', true);
      sheetExerciseGuide(v, !!S.active);
      break;
    }
    case 'vid-clear': {
      setVideo(v, '');
      toast('Link removed', true);
      sheetExerciseGuide(v, !!S.active);
      break;
    }
    case 'toggle-warmup': {
      S.settings.warmup = !S.settings.warmup;
      save(true); render();
      toast(S.settings.warmup ? 'Warm-up on' : 'Warm-up off', true);
      break;
    }
    case 'open-paywall':
      /* Belt and braces: the entry point is gone from More, and the action
         refuses too, so a stale handler cannot resurrect a purchase surface
         that has nothing behind it. */
      if (!SHOW_PAYWALL) break;
      sheetPaywall(); break;
    case 'export': exportData(); break;
    case 'import': importData(); break;
    case 'reset': {
      if (!confirm('Erase everything and start over? Export a backup first if you want to keep it.')) break;
      if (!confirm('Really sure? This cannot be undone.')) break;
      localStorage.removeItem(KEY);
      S = blank(); obStep = 0;
      obDraft = { ...OB_DEFAULT, gear:{ ...GEAR_ALL }, seedOverrides:{}, seedExact:{}, goals:['strength','muscle'], priorities:[], injuries:[], cardioModes:['car-walk'], envs:['full'] };
      save(true); closeSheet(); go('onboard'); break;
    }
    case 'close': closeSheet(); break;
  }
});

/* Swap a single exercise card without touching the rest of the screen */
/* Tick one entry of a circuit and move on.
   Rest goes after the whole round, never between movements — that is the
   difference between a circuit and an ordinary session, and it is the thing
   that was asked for. */
function completeCircuitEntry(ei, round) {
  const A = S.active;
  if (!A) return;
  const item = A.exercises[ei];
  const st = item && item.sets[round];
  if (!st || st.done) return;

  st.done = true;
  if (st.r === '' || st.r == null) st.r = item.targetR || '';
  if ((st.w === '' || st.w == null) && item.targetW != null && item.targetW !== '') st.w = item.targetW;
  buzz();
  save();

  const list = circuitItems(A);
  const rounds = Math.max(1, A.rounds || 1);
  const wasLastOfRound = list[list.length - 1] === ei;
  const moreRounds = round + 1 < rounds;

  renderTrain();

  if (wasLastOfRound && moreRounds && A.restRound > 0) {
    startRest(A.restRound, 'Round ' + (round + 1) + ' done — rest', {
      onDone: () => { if (SCREEN === 'train' && S.active) { toast('Round ' + (round + 2), true); renderTrain(); } }
    });
  } else if (wasLastOfRound && !moreRounds) {
    toast('Circuit finished', true);
  }
}

function replaceExCard(i) {
  const el = document.querySelector('.ex-card[data-ei="' + i + '"]');
  if (!el || !S.active) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = exCardHTML(S.active.exercises[i], i);
  const fresh = tmp.firstElementChild;
  fresh.classList.add('ex-swap');
  el.replaceWith(fresh);
}

/* ---- starting-weight overrides: update in place so the keyboard stays up ---- */
document.addEventListener('input', ev => {
  const el = ev.target;
  if (!el.dataset || !el.dataset.seed) return;
  const id = el.dataset.seed;
  const base = el.dataset.base;
  const factor = parseFloat(el.dataset.factor) || 1;
  const v = parseFloat(el.value);
  const sug = seedSuggestion({ base, factor });
  const isOwn = !isNaN(v) && v > 0 && v !== sug;
  if (!isNaN(v) && v > 0) { obDraft.seedOverrides[base] = v / factor; obDraft.seedExact[id] = v; }
  else { delete obDraft.seedOverrides[base]; delete obDraft.seedExact[id]; }
  const row = el.closest('.seedrow');
  const tag = document.querySelector('[data-tag="' + id + '"]');
  if (row) row.classList.toggle('edited', isOwn);
  if (tag) tag.textContent = isOwn ? 'Yours' : (sug ? 'Suggested' : 'Enter one');
});

/* Searching your foods to point a new packet at one of them. Same delegated
   pattern as the file input, and for the same reason: the field does not exist
   until the sheet is open. */
document.addEventListener('input', ev => {
  const el = ev.target;
  if (!el || !el.dataset || el.dataset.scanQ == null) return;
  const code = el.dataset.scanQ;
  const list = document.getElementById('scan-results');
  if (!list) return;
  const q = (el.value || '').trim();
  const hits = q ? foodSearch(q).slice(0, 8) : recentFoods(6).map(r => r.food);
  list.innerHTML = hits.length ? hits.map(f => `<button class="lrow" data-act="scan-bind"
      data-v="${h(code)}" data-f="${h(f.id)}" style="width:100%;text-align:left">
      <div class="grow"><div class="h3" style="font-size:14.5px">${h(f.n)}</div>
      <div class="tiny mt-s">${f.kcal} kcal per ${h(portionLabel(f, f.per))}</div></div>
      <span class="chev">&rsaquo;</span></button>`).join('')
    : '<p class="tiny center">Nothing matches that.</p>';
});

/* The file input is inside a sheet, so it does not exist until the sheet is
   opened — bound by delegation on the document rather than by id at boot. */
document.addEventListener('change', ev => {
  const el = ev.target;
  if (!el || el.id !== 'imp-file') return;
  const f = el.files && el.files[0];
  el.value = '';                       // so choosing the same file twice works
  if (f) runImport(f);
});

/* ---- set field input ----
   Kept as type=text with an inputmode so the browser never silently blanks a
   value it dislikes — a European keyboard producing "82,5" would do exactly
   that under type=number, and losing a logged weight to a decimal separator
   is not a trade worth making. */
document.addEventListener('input', ev => {
  const el = ev.target;
  if (!el.dataset || !el.dataset.set || !S.active) return;
  noteInteraction();
  const i = +el.dataset.i, si = +el.dataset.s, f = el.dataset.set;
  const item = S.active.exercises[i];
  if (!item || !item.sets[si]) return;
  let v = el.value.replace(',', '.').replace(/[^0-9.]/g, '');
  if (v !== el.value) { const p = el.selectionStart; el.value = v; try { el.setSelectionRange(p, p); } catch (e) {} }
  item.sets[si][f] = v;
  if (si === 0) {
    if (f === 'w') refreshPlateRow(i);
    /* Carry-down, live. Typing the day's weight into set 1 is the moment the
       sets below it stop being last week's guess. */
    if (f === 'w' || f === 'r' || f === 'd') refreshGhosts(i);
  }
  /* Correcting the distance or the minutes of a set you already ticked moves
     the pace, so it is recomputed from any row rather than only from set 1. */
  if (f === 'd' || f === 'r') refreshPace(i);
  /* Correcting a set you already ticked has to re-decide whether it is still
     a record — see refreshPR. */
  if (f === 'w' || f === 'r') refreshPR(i, si);
  save();
});

/* ---- keyboard: weight → reps → RPE → out ----
   iOS has no Tab key. Without this you have to reach up and tap each field
   individually, which is the single most-complained-about thing in every
   workout logger. */
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Enter') return;
  const el = ev.target;
  if (!el.dataset || !el.dataset.set) return;
  ev.preventDefault();
  /* Distance sits in the weight column and never alongside it, and RPE can be
     switched off — so this walks forward to the next field the row actually
     has rather than stepping exactly one place. Stepping one place put `d`
     after `w` on every barbell row, found nothing, and dropped the keyboard
     instead of going to reps. */
  const order = ['w', 'd', 'r', 'rpe'];
  const row = el.closest('.set-row');
  let nel = null;
  for (let n = order.indexOf(el.dataset.set) + 1; row && n < order.length && !nel; n++) {
    nel = row.querySelector('[data-set="' + order[n] + '"]');
  }
  if (nel) { nel.focus(); nel.select(); }
  else el.blur();
});

/* Tapping a field that already holds a number should let you replace it
   outright rather than fiddling a cursor into place with wet hands. */
document.addEventListener('focusin', ev => {
  const el = ev.target;
  if (el.dataset && el.dataset.set && el.value) { try { el.select(); } catch (e) {} }
});

/* ---- routine name: written straight through so nothing needs saving ---- */
document.addEventListener('input', ev => {
  const el = ev.target;
  if (!el.dataset || !el.dataset.rtName) return;
  renameRoutine(el.dataset.rtName, el.value);
});

/* ---- daily metrics: write straight through, keyboard stays up ---- */
document.addEventListener('input', ev => {
  const el = ev.target;
  if (!el.dataset || !el.dataset.dm) return;
  const f = el.dataset.dm, d = el.dataset.date || today();
  if (el.value === '') { clearDaily(d, f); save(); return; }
  if (setDaily(d, f, el.value, 'manual')) {
    save();
    const chip = el.closest('.field').querySelector('.src-chip');
    if (chip) chip.textContent = SRC_LABEL.manual;
  }
});

/* ---- scrim / quick log ---- */
$('#scrim').addEventListener('click', () => closeSheet());
$('#sheet-x').addEventListener('click', () => closeSheet());
$('#rest-skip').addEventListener('click', stopRest);
$('#rest-add').addEventListener('click', () => { restEnd += 30000; restTotal += 30; tickRest(); });

/* ---- the tap the body's own paths missed ----
   Those paths answer most taps. What they cannot answer is one between two
   regions or on the bare silhouette, and on a figure the size of a phone
   screen that is a lot of the surface. A body map that sometimes ignores you
   reads as broken rather than as precise, so a miss resolves to the nearest
   target instead of to nothing.

   The coordinate maths is the letterboxing: the figure is 132 x 240 inside a
   box of whatever shape the sheet gives it, and preserveAspectRatio defaults
   to meet — so it is centred with bars on two sides, and a client point means
   nothing in figure space until those bars are taken off it.

   `mode` decides the vocabulary. The same pixel means a muscle on one screen
   and a joint on another, and a fallback answering in the wrong one would
   quietly flag your shoulder when you asked to stretch your chest. */
document.addEventListener('click', ev => {
  const t = ev.target;
  if (!t || !t.closest) return;
  const svg = t.closest('.bd');
  if (!svg || t.closest('.bd-hit') || t.closest('.bd-j')) return;
  const r = svg.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const k = Math.min(r.width / BODY_W, r.height / BODY_H);
  const x = (ev.clientX - r.left - (r.width - BODY_W * k) / 2) / k;
  const y = (ev.clientY - r.top - (r.height - BODY_H * k) / 2) / k;
  const m = bodyPick(svg.dataset.view, (S.profile && S.profile.sex) || 'na', x, y, svg.dataset.mode);
  if (!m) return;
  if (svg.dataset.mode === 'joints') toggleStretchArea(m); else sheetBodyMap(m);
});

/* ---- the sweep of light across a solid button ----
   On pointerdown rather than on :active, because :active only holds while the
   finger is down: on a real tap it is released after about eighty milliseconds
   and a CSS animation bound to it stops a seventh of the way across. Transient
   class, removed on a timer, exactly as .tick.pop is — and the reflow between
   remove and add is what lets a second tap replay it. */
document.addEventListener('pointerdown', ev => {
  const t = ev.target;
  const b = t && t.closest ? t.closest('.btn.primary,.btn.teal') : null;
  if (!b) return;
  b.classList.remove('sheen');
  void b.offsetWidth;
  b.classList.add('sheen');
  setTimeout(() => b.classList.remove('sheen'), 620);
}, true);

/* ---- keep the elapsed clock moving (in place, never a re-render) ---- */
setInterval(() => { if (SCREEN === 'train' && S && S.active) updateTrainProgress(); }, 20000);

/* ============================================================
   BOOT
   ============================================================ */
(function init() {
  try {
    STORAGE_OK = storageProbe();
    a11yWatch();
    syncSky();
    /* The sky is checked on a timer as well as on every navigation, because
       the app is often left open on a bench between sets and the light should
       have moved when you look back at it. Cheap: it sets an attribute only
       when the band actually changes. */
    setInterval(syncSky, 300000);
    const had = load();
    const ingested = ingestFromURL();
    S.meta.lastOpen = new Date().toISOString();

    /* Before the week is built, not after: a plan entry still pointing at a
       deleted routine would otherwise be treated as a settled day and kept
       through the rebuild. */
    /* If the WebView was cleared, localStorage is empty and the native mirror
       is the only copy left. Async by necessity, so boot continues normally
       and the restore re-renders if it finds anything. */
    if (typeof restoreFromNativeIfEmpty === 'function') restoreFromNativeIfEmpty();

    if (S.onboarded) repairRefs();

    // roll the week over if needed
    if (S.onboarded) buildWeekPlan();

    if (!S.onboarded) { $('#nav').classList.add('hide'); go('onboard'); }
    else go('today');

    if (S.active) wakeOn();
    save();
    window.__guzoBooted = true;
    if (ingested.length) setTimeout(() => toast('Logged ' + ingested.join(', '), true), 600);

    /* Safari evicts storage for origins it thinks are stale, on a
       least-recently-used basis. Persistent mode exempts this origin from
       that sweep. Nobody should lose a year of training to a cache policy. */
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persisted().then(already => {
        if (!already) navigator.storage.persist().catch(() => {});
      }).catch(() => {});
    }
  } catch (err) {
    /* A crash while planning must never cost someone their history. Fall back
       to a plain state so the app still opens, and say so plainly. */
    try {
      console.warn('boot failed', err);
      if (!S || !S.onboarded) { bootFail(err); return; }
      S.week = blank().week;
      go('today');
      window.__guzoBooted = true;
      toast('Rebuilt this week&rsquo;s plan');
    } catch (e2) { bootFail(err); return; }
  }

  /* PWA service worker (only works when served over http/https).

     This used to build the worker as a Blob and register it by object URL, to
     keep the whole app to one deployable file. It never once worked: a service
     worker script has to be fetched over http(s), so every browser rejected the
     blob: URL, and the empty catch around it meant the failure was invisible.
     The app reported offline support it did not have. So: a real sw.js, emitted
     next to index.html by build.sh.

     Registration is still allowed to fail. If only index.html was uploaded
     somewhere, sw.js 404s, the app stays online-only, and nothing else breaks —
     but it says so in the console rather than pretending. The version rides on
     the query string so a release installs a fresh worker and retires the
     previous cache. */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    /* Whether an update ever arrives depends on this block, not on the host.
       An installed home-screen app RESUMES — it restores the page it already
       had rather than navigating — so the worker's network-first navigation
       path never runs, and a phone can sit on a build from weeks ago while
       every deploy since has been live. Coming back to the foreground is the
       moment to ask. */
    const hadController = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.register('sw.js?v=' + encodeURIComponent(VERSION))
      .then(reg => {
        const poke = () => { if (!document.hidden) reg.update().catch(() => {}); };
        document.addEventListener('visibilitychange', poke);
        window.addEventListener('focus', poke);
      })
      .catch(err => console.warn('guzo: running online-only, sw.js did not register —', (err && err.message) || err));

    /* A new worker taking over means new markup is waiting behind the old
       page. Reload once so it is actually seen.

       Guarded twice. hadController is false on a first-ever visit — the
       initial worker claiming the page is not an update, and reloading there
       would be a pointless flash. And a session in progress is never
       interrupted: state is saved continuously, but yanking the screen out
       from under someone between sets is exactly the kind of thing this app
       is supposed to not do. It will land on the next launch instead. */
    let swReloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || swReloading) return;
      if (S && S.active) return;
      swReloading = true;
      location.reload();
    });
  }

  /* ---- the pinned header's hairline ----
     One listener for all six screens. `scroll` does not bubble, but it does
     capture, so a single capturing listener on the document sees every
     scroller in the app — the same reasoning as the one delegated click
     handler, and the alternative is six listeners that have to be attached and
     detached as screens come and go.

     The rule is a class rather than a style write: the transition belongs in
     the stylesheet with the rest of the motion, and a handler that sets
     opacity directly would fight it. */
  document.addEventListener('scroll', ev => {
    const el = ev.target;
    if (!el || !el.classList || !el.classList.contains('screen')) return;
    /* A couple of pixels of slack, so a rubber-band or a sub-pixel scroll
       position does not flicker the rule on and off at rest. */
    el.classList.toggle('scrolled', el.scrollTop > 4);
  }, true);

  /* ---- the session clock ----
     Five seconds is plenty for a figure shown in minutes, and it keeps the
     wake-ups cheap. The pump decides for itself whether the slice counts. */
  setInterval(() => {
    if (!S || !S.active) return;
    pumpSessionClock();
    updateTrainClock();
  }, 5000);

  /* Coming back to the app anchors the clock at now rather than back-filling
     the time it was away — that is the whole point. */
  document.addEventListener('visibilitychange', () => {
    if (!S || !S.active) return;
    if (document.hidden) pumpSessionClock();
    S.active.tickAt = Date.now();
    if (!document.hidden) { noteInteraction(); updateTrainClock(); }
  });

  /* One-off, flagged: the old wall-clock durations left absurd numbers in the
     store and a screen full of correct figures with one wrong one in it is
     worse than no figures. See repairSessionDurations(). */
  repairSessionDurations();

  window.addEventListener('beforeunload', () => save(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });
})();
