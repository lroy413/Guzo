/* ============================================================
   REST TIMER
   ============================================================ */
let restEnd = 0, restTotal = 0, restTick = null;
function startRest(seconds, label) {
  restTotal = seconds;
  restEnd = Date.now() + seconds * 1000;
  $('#rest-label').textContent = label || 'Rest';
  $('#rest-bar').classList.add('on');
  clearInterval(restTick);
  restTick = setInterval(tickRest, 200);
  tickRest();
}
function tickRest() {
  const left = Math.max(0, Math.round((restEnd - Date.now()) / 1000));
  const m = Math.floor(left / 60), s = left % 60;
  $('#rest-t').textContent = m + ':' + String(s).padStart(2, '0');
  $('#rest-bar-fill').style.width = Math.max(0, (left / restTotal) * 100) + '%';
  if (left <= 0) { stopRest(); buzz([90, 60, 90]); toast('Rest done', true); }
}
function stopRest() { clearInterval(restTick); $('#rest-bar').classList.remove('on'); }

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
  const rd = S.readiness[today()];
  sess.readiness = rd ? rd.score : null;
  S.active = sess;
  save(true);
  wakeOn();
  go('train');
  buzz();
}

function blankSession() {
  const c = dayConstraint(today());
  S.active = {
    id: 'sx' + Date.now().toString(36), date: today(), type: 'full',
    env: c.env || 'full', rung: 'full', planMins: 0,
    exercises: [], started: Date.now(), ended: null, dur: 0,
    readiness: (S.readiness[today()] || {}).score || null
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
  A.dur = Math.max(1, Math.round((A.ended - A.started) / 60000));
  A.exercises = A.exercises.filter(i => i.sets.some(s => s.done));
  A.kcal = sessionKcal(A);
  applyProgression(A);
  S.sessions.push(A);
  /* An extra you chose to do must not quietly discharge the session you
     committed to. Abs at 10pm is not the same as the Upper day you skipped. */
  if (!A.extra && S.week.plan[A.date]) S.week.plan[A.date].done = true;
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

function sheetSessionDone(A, v, fresh) {
  const st = journeyStats();
  const nxt = nextMilestone();
  const kc = A.kcal || 0;
  openSheet(`
    <div class="center">
      <div style="font-size:44px">${A.rung==='micro'?'⏱':'✓'}</div>
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
    ${fresh && fresh.length ? fresh.map(m => `
      <div class="milestone mb">
        <div class="milestone-ico">${m.ico}</div>
        <div class="milestone-eyebrow">Milestone reached</div>
        <div class="milestone-t">${m.title}</div>
        <p class="milestone-b">${m.body}</p>
      </div>`).join('') : ''}
    ${!fresh.length && nxt && nxt.left > 0 && nxt.left <= 5 ? `
      <div class="banner soft mb">${nxt.left} more ${nxt.unit} to <strong>${nxt.title}</strong>.</div>` : ''}
    ${A.exercises.filter(i => i.deloaded).length ? `<div class="banner soft mb">Some weights were pulled back 10% after two sessions short of target. That's the plan working, not you failing.</div>` : ''}
    <div class="creed">
      <div class="creed-rule"></div>
      <span class="creed-mark">&ldquo;</span>
      <p class="creed-text">${dailyLine()}</p>
      <span class="creed-tag">GUZO · ${prettyDate(today()).toUpperCase()}</span>
    </div>
    <button class="btn primary block lg mt" data-act="close">Good</button>
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
  const nav = ev.target.closest('[data-go]');
  if (nav) { go(nav.dataset.go); return; }

  const t = ev.target.closest('[data-act]');
  if (!t) return;
  const a = t.dataset.act;
  const v = t.dataset.v;
  const i = t.dataset.i != null ? +t.dataset.i : null;
  const si = t.dataset.s != null ? +t.dataset.s : null;

  const NEEDS_ACTIVE = ['toggle-set','add-set','del-set','swap-ex','add-exercise','ex-menu',
                        'save-note','remove-ex','finish','abandon','toggle-collapse','pick-ex','leave-session'];
  if (a === 'help-form-session' && !S.active) { sheetForm(v, false); return; }
  if (a === 'ex-form' && !S.active) { if (v) sheetExerciseGuide(v, false); return; }
  /* Building a routine is a multi-select job. Throwing the sheet away after
     every single choice turns "add six movements" into six round trips. */
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
      if (k === 'measure') collectMeasureInputs();
      if (k === 'seed') collectSeedInputs();
      obAdvance(1); renderOnboard(); break;
    }
    case 'ob-skip-bw': { obDraft.bodyweight = null; obAdvance(1); renderOnboard(); break; }
    /* Skipping is a real answer, so it clears rather than leaves whatever was
       half-typed. Fuel still works from bodyweight alone. */
    case 'ob-skip-measure': {
      obDraft.heightCm = null; obDraft.birthYear = null;
      obAdvance(1); renderOnboard(); break;
    }
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
      /* Only written when Fuel is on — the measure screens are skipped
         otherwise, so the draft still holds its defaults and writing them
         would fabricate a height nobody gave. */
      if (obDraft.nutrition) {
        if (obDraft.heightCm) P.heightCm = obDraft.heightCm;
        if (obDraft.birthYear) P.birthYear = obDraft.birthYear;
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
    case 'day-edit': sheetDayEdit(t.dataset.k); break;
    case 'wk-avail': {
      const k = t.dataset.k;
      setDayAvail(k, v);
      save(); buzz(); sheetDayEdit(k); break;
    }
    case 'wk-env': {
      const k = t.dataset.k;
      S.week.days[k] = Object.assign(dayConstraint(k), { env:v });
      save(); buzz(); sheetDayEdit(k); break;
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
      /* From Today's strip: if there is a session on that day, go straight
         to what it is. Time-and-place is one tap further in, because
         "what am I doing" is the question people actually arrive with. */
      const k = t.dataset.k;
      if (planEntry(k) && !planDaySettled(k)) sheetPlanDay(k); else sheetDayEdit(k);
      break;
    }

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
    case 'goto-train': go('train'); break;
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
        if (st.r === '' || st.r == null) st.r = item.targetR || '';
        if ((st.w === '' || st.w == null) && item.targetW != null && item.targetW !== '') st.w = item.targetW;
        buzz();
        const ex = EX[item.exId];
        if (S.settings.autoRest && ex && ex.load !== 'min') {
          const secs = (ex.tier <= 2) ? S.settings.restMain : S.settings.restAcc;
          startRest(secs, item.name);
        }
      }
      const row = t.closest('.set-row');
      if (row) {
        row.classList.toggle('done', st.done);
        t.classList.toggle('on', st.done);
        const wi = row.querySelector('[data-set="w"]');
        const ri = row.querySelector('[data-set="r"]');
        if (wi) wi.value = st.w === '' || st.w == null ? '' : st.w;
        if (ri) ri.value = st.r === '' || st.r == null ? '' : st.r;
      }
      // Last set ticked → fold the exercise away and move on to the next one.
      if (st.done && isComplete(item) && !item.collapsed) {
        item.collapsed = true;
        replaceExCard(i);
        const doneEx = S.active.exercises.filter(isComplete).length;
        const totalEx = S.active.exercises.length;
        if (doneEx < totalEx) toast(encouragement(doneEx, totalEx), true);
        setTimeout(() => {
          if (!S.active || SCREEN !== 'train') return;   // session may have ended in the meantime
          const nextIdx = S.active.exercises.findIndex(x => !isComplete(x));
          const el = nextIdx >= 0 ? document.querySelector('.ex-card[data-ei="' + nextIdx + '"]') : null;
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
    case 'toggle-collapse': {
      const item = S.active.exercises[i];
      item.collapsed = !item.collapsed;
      replaceExCard(i); save(); break;
    }
    case 'swap-ex': sheetExercisePicker('swap', i); break;
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
      openSheet(`
        <div class="row between mb"><h2 class="h2">${h(item.name)}</h2></div>
        <div class="field mb"><div class="label">Note</div><textarea class="input" id="ex-note" placeholder="Left shoulder tight, used neutral grip…">${h(item.note||'')}</textarea></div>
        <button class="btn ghost block mb-s" data-act="save-note" data-i="${i}">Save note</button>
        <button class="btn danger block" data-act="remove-ex" data-i="${i}">Remove from session</button>`);
      break;
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
    case 'set-units': {
      S.profile.units = v; save(); sheetProfile();
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
    case 'toggle-autorest': {
      S.settings.autoRest = !S.settings.autoRest;
      save(); sheetRest(); break;
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
      closeSheet(); sheetPortion(f.id, null); toast('Saved to your foods', true);
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

/* ---- set field input ----
   Kept as type=text with an inputmode so the browser never silently blanks a
   value it dislikes — a European keyboard producing "82,5" would do exactly
   that under type=number, and losing a logged weight to a decimal separator
   is not a trade worth making. */
document.addEventListener('input', ev => {
  const el = ev.target;
  if (!el.dataset || !el.dataset.set || !S.active) return;
  const i = +el.dataset.i, si = +el.dataset.s, f = el.dataset.set;
  const item = S.active.exercises[i];
  if (!item || !item.sets[si]) return;
  let v = el.value.replace(',', '.').replace(/[^0-9.]/g, '');
  if (v !== el.value) { const p = el.selectionStart; el.value = v; try { el.setSelectionRange(p, p); } catch (e) {} }
  item.sets[si][f] = v;
  if (f === 'w' && si === 0) refreshPlateRow(i);
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
  const order = ['w', 'r', 'rpe'];
  const next = order[order.indexOf(el.dataset.set) + 1];
  const row = el.closest('.set-row');
  const nel = next && row ? row.querySelector('[data-set="' + next + '"]') : null;
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

/* ---- keep the elapsed clock moving (in place, never a re-render) ---- */
setInterval(() => { if (SCREEN === 'train' && S && S.active) updateTrainProgress(); }, 20000);

/* ============================================================
   BOOT
   ============================================================ */
(function init() {
  try {
    STORAGE_OK = storageProbe();
    a11yWatch();
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

  window.addEventListener('beforeunload', () => save(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });
})();
