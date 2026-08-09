/* ============================================================
   NUTRITION (optional module — deliberately non-blocking)
   ============================================================ */
function nutDay(kIn) {
  const k = key(kIn || today());
  if (!S.nutrition.days[k]) S.nutrition.days[k] = { items: [] };
  return S.nutrition.days[k];
}
/* Rounded at the source. Each entry's macros are already stored to a tenth,
   and summing ten of those in binary floating point produces 252.70000000000002
   — which is exactly what the day card rendered before this existed. */
function nutTotals(kIn) {
  const d = nutDay(kIn);
  const t = d.items.reduce((a, i) => ({
    kcal: a.kcal + (+i.kcal || 0), p: a.p + (+i.p || 0),
    c: a.c + (+i.c || 0), f: a.f + (+i.f || 0)
  }), { kcal:0, p:0, c:0, f:0 });
  const r = v => Math.round(v * 10) / 10;
  return { kcal: Math.round(t.kcal), p: r(t.p), c: r(t.c), f: r(t.f) };
}
/* The old sheet is gone — Fuel is a screen now. This keeps any stale
   entry point working rather than dead-ending. */
function sheetNutrition() {
  if (!fuelOn()) { S.settings.nutrition = true; save(true); syncNav(); }
  closeSheet(); go('fuel');
}

/* ============================================================
   MORE
   ============================================================ */
function renderMore() {
  const p = S.profile;
  const st = totalStats();
  let html = `
  <div class="card mb">
    <div class="row gap-l">
      <div style="width:52px;height:52px;border-radius:16px;background:var(--ember-dim);border:1px solid var(--ember-line);display:flex;align-items:center;justify-content:center;font-size:22px;flex:none">🏔️</div>
      <div class="grow">
        <div class="h2">${h(p.name || 'Traveller')}</div>
        <div class="tiny mt-s">${st.count} sessions · ${weekStreak()} week streak · since ${prettyDate(dk(new Date(S.meta.created)))}</div>
      </div>
    </div>
  </div>`;

  const jst = journeyStats();
  html += `<div class="eyebrow mb-s">Your journey</div><div class="list mb">
    <div class="lrow" data-act="open-journey"><div class="ico">🧭</div><div class="grow"><div class="h3">Day ${jst.day} of your guzo</div><div class="tiny mt-s">${milestonesReached().length} of ${MILESTONES.length} markers reached · ${(jst.kcal/1000).toFixed(1)}k kcal estimated</div></div><span class="chev">›</span></div>
  </div>`;

  html += `<div class="eyebrow mb-s">Guides</div><div class="list mb">
    <div class="lrow" data-act="open-help"><div class="ico">🧭</div><div class="grow"><div class="h3">Help &amp; guides</div><div class="tiny mt-s">How it works, form diagrams, terms, backups</div></div><span class="chev">›</span></div>
    <div class="lrow" data-act="help-form-list"><div class="ico">📐</div><div class="grow"><div class="h3">Form guides</div><div class="tiny mt-s">${Object.keys(FORMS).length} lifts with diagrams and cues</div></div><span class="chev">›</span></div>
  </div>`;

  html += `<div class="eyebrow mb-s">Setup</div><div class="list mb">
    <div class="lrow" data-act="edit-profile"><div class="ico">👤</div><div class="grow"><div class="h3">Profile</div><div class="tiny mt-s">${h(p.name||'No name')} · ${p.units}</div></div><span class="chev">›</span></div>
    <div class="lrow" data-act="open-program"><div class="ico">▲</div><div class="grow"><div class="h3">Structure</div><div class="tiny mt-s">${programOf().name} · ${programOf().target}×/wk</div></div><span class="chev">›</span></div>
    <div class="lrow" data-act="edit-envs"><div class="ico">📍</div><div class="grow"><div class="h3">Where you train</div><div class="tiny mt-s">${p.envs.map(e=>ENVS[e]?ENVS[e].label:e).join(', ')}</div></div><span class="chev">›</span></div>
    <div class="lrow" data-act="open-week"><div class="ico">📅</div><div class="grow"><div class="h3">Shape this week</div><div class="tiny mt-s">Availability, equipment, expected chaos</div></div><span class="chev">›</span></div>
  </div>`;

  /* The Fuel badge is conditional and its control is a switch, both deliberately.
     This row used to read "Fuel PRO" with an empty chevron slot when off: no
     affordance suggesting it was a switch, and a badge announcing a paywall.
     The reasonable reading was "locked, go and buy it" — so that is what
     happened, and Fuel stayed missing from the nav, because nothing has ever
     gated on billing.pro. can() is the honest test: it returns true throughout
     the beta, and the badge comes back by itself if a real tier ever locks
     this. The switch matches the mobility row directly below and shows both
     states, and it retires a hairline ✓ that would fail a pixel-sampled
     contrast check anyway. */
  html += `<div class="eyebrow mb-s">Modules</div><div class="list mb">
    <div class="lrow" data-act="toggle-fuel">
      <div class="ico">🔥</div>
      <div class="grow"><div class="h3">Fuel${can('nutrition') ? '' : ' <span class="pro-tag">PRO</span>'}</div><div class="tiny mt-s">${fuelOn() ? 'On &mdash; it has its own tab, and Route moves here' : 'Protein and calorie targets, worked out from your body data'}</div></div>
      <div class="switch ${fuelOn() ? 'on' : ''}"></div>
    </div>
    ${S.settings.nutrition ? `<div class="lrow" data-act="open-nutrition"><div class="ico">📊</div><div class="grow"><div class="h3">Today's fuel</div><div class="tiny mt-s">${nutTotals().kcal} kcal · ${nutTotals().p}g protein logged</div></div><span class="chev">›</span></div>` : ''}
    <div class="lrow" data-act="toggle-warmup">
      <div class="ico">🤸</div>
      <div class="grow"><div class="h3">Mobility warm-up</div><div class="tiny mt-s">Adds one short mobility movement to the start of full sessions</div></div>
      <div class="switch ${S.settings.warmup?'on':''}"></div>
    </div>
    ${fuelOn() ? `<div class="lrow" data-go="plan"><div class="ico">🗺</div><div class="grow"><div class="h3">The route</div><div class="tiny mt-s">Shape the week and see the whole plan</div></div><span class="chev">›</span></div>` : ''}
    <div class="lrow" data-act="routines"><div class="ico">🧩</div><div class="grow"><div class="h3">Your routines</div><div class="tiny mt-s">${ensureRoutines().length ? ensureRoutines().length + ' built · run any of them alongside the plan' : 'Build a session of your own'}</div></div><span class="chev">›</span></div>
    <div class="lrow" data-act="plate-settings"><div class="ico">🏋️</div><div class="grow"><div class="h3">Bar and plates</div><div class="tiny mt-s">${fmtP(plateCfg().bar)}${unit()} bar · ${plateCfg().plates.length} plate sizes on hand</div></div><span class="chev">›</span></div>
    <div class="lrow" data-act="rest-settings"><div class="ico">⏱</div><div class="grow"><div class="h3">Rest timers</div><div class="tiny mt-s">${S.settings.restMain}s compounds · ${S.settings.restAcc}s accessories · auto-start ${S.settings.autoRest?'on':'off'}</div></div><span class="chev">›</span></div>
  </div>`;

  html += `<div class="eyebrow mb-s">Membership</div>
  <div class="card accent mb">
    <div class="row between"><div class="h3">Guzo Pro</div><div class="pill em">Beta — unlocked</div></div>
    <p class="small mt-s">Everything is on while this is in testing. The paywall below is scaffolding for later; nothing charges, nothing phones home.</p>
    <button class="btn ghost block mt" data-act="open-paywall">Preview the paywall</button>
  </div>`;

  html += `<div class="eyebrow mb-s">Your data</div><div class="list mb">
    <div class="lrow" data-act="export"><div class="ico">⬇️</div><div class="grow"><div class="h3">Export backup</div><div class="tiny mt-s">A JSON file of everything. Do this weekly.</div></div><span class="chev">›</span></div>
    <div class="lrow" data-act="import"><div class="ico">⬆️</div><div class="grow"><div class="h3">Restore from backup</div><div class="tiny mt-s">Replaces everything on this device</div></div><span class="chev">›</span></div>
    <div class="lrow" data-act="reset"><div class="ico">⚠</div><div class="grow"><div class="h3" style="color:var(--rose)">Reset everything</div><div class="tiny mt-s">Cannot be undone</div></div><span class="chev">›</span></div>
  </div>`;

  html += `<div class="card flat">
    <div class="eyebrow">Why this app behaves the way it does</div>
    <p class="small mt-s"><strong>No daily streak.</strong> Daily streaks are the best-documented retention mechanic in the category and also the one most reliably linked to shame and disengagement. A 2025 analysis of 58,881 posts about the five most profitable fitness apps found rigid quantitative goals producing "shame, disappointment and demotivation, and subsequent disengagement." Weeks are the unit here instead.</p>
    <span class="src">Bondaronek et al., British Journal of Health Psychology, 2025</span>
    <p class="small mt">${EVIDENCE.oneMiss}</p>
    <span class="src">${EVIDENCE.oneMissSrc}</span>
    <p class="small mt">${EVIDENCE.micro}</p>
    <span class="src">${EVIDENCE.microSrc}</span>
  </div>
  <p class="tiny center mt-l">Guzo Fit v${VERSION} · beta build<br>ጉዞ · Amharic for “journey”<br>guzofit.app · all data stored locally on this device</p>`;

  $('#more-body').innerHTML = html;
}

/* ============================================================
   SHEETS
   ============================================================ */
function sheetReadiness(draft) {
  const pre = sleepPrefill();
  const r = draft || window._rdDraft || S.readiness[today()] ||
            { sleepH: pre ? pre.h : 7, sleepQ:3, energy:3, sore:3, stress:3 };
  const dots = (name, val, labels) => `
    <div class="field mt">
      <div class="row between"><div class="label">${name}</div><div class="tiny">${labels[val-1]}</div></div>
      <div class="dots">${[1,2,3,4,5].map(i => `<div class="dot ${val===i?'on':''}" data-act="rd-set" data-f="${name.toLowerCase().split(' ')[0]}" data-v="${i}">${i}</div>`).join('')}</div>
    </div>`;
  openSheet(`
    <div class="row between mb">
      <h2 class="h1">Terrain check</h2>
      
    </div>
    <p class="small mb">No wearable knows you did a fourteen-hour day on your feet, slept five hours in a hotel and are carrying a camera tomorrow. So it asks.</p>
    ${pre && !S.readiness[today()] ? `<div class="banner soft mb">Sleep filled in from ${SRC_LABEL[pre.src] || pre.src}. Change it if it is wrong &mdash; you were there, it wasn't.</div>` : ''}

    <div class="field">
      <div class="row between"><div class="label">Hours of sleep${pre && !S.readiness[today()] ? `<span class="src-chip">${SRC_LABEL[pre.src] || pre.src}</span>` : ''}</div><div class="tiny mono">${r.sleepH}h</div></div>
      <div class="stepper">
        <button data-act="rd-sleep" data-v="-0.5">−</button>
        <input id="rd-sleepH" type="text" value="${r.sleepH}" readonly>
        <button data-act="rd-sleep" data-v="0.5">+</button>
      </div>
    </div>
    ${dots('Sleep quality', r.sleepQ, ['Wrecked','Poor','OK','Good','Deep'])}
    ${dots('Energy', r.energy, ['Empty','Low','Normal','Good','Buzzing'])}
    ${dots('Soreness', r.sore, ['None','Mild','Noticeable','Sore','Wrecked'])}
    ${dots('Stress', r.stress, ['Calm','Fine','Busy','Pressured','Fried'])}

    <div class="card mt-l center">
      <div class="eyebrow">Reads as</div>
      <div class="mono" style="font-size:38px;font-weight:700;letter-spacing:-.04em;line-height:1.1">${readinessScore(r)}</div>
      <div class="pill ${readinessBand(readinessScore(r)).color==='teal'?'tl':readinessBand(readinessScore(r)).color==='amber'?'am':'rs'} mt-s">${readinessBand(readinessScore(r)).label}</div>
      <p class="small mt">Suggested size: <strong>${RUNGS.find(x=>x.k===suggestRung(readinessScore(r), null)).label}</strong></p>
    </div>
    <button class="btn primary block lg mt" data-act="rd-save">Save check-in</button>
    <p class="tiny center mt-s">This only ever shrinks a session. It never tells you to do more than you planned.</p>
  `);
  window._rdDraft = r;
}

/* ============================================================
   WEEK BUILDER
   One tappable row per day. No dense grids of unlabelled chips —
   each day states in plain words what it currently means.
   ============================================================ */
let weekOffset = 0; // 0 = this week, 1 = next week

function sheetWeek() {
  const ws = addDays(weekStart(), weekOffset * 7);
  const prog = programOf();
  const isNext = weekOffset === 1;

  let rows = '', hidden = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    const k = dk(d);
    const past = daysBetween(k, today()) > 0;
    if (past) { hidden++; continue; }           // don't show days that have already gone
    const c = dayConstraint(k);
    const av = availOf(c.avail);
    const isToday = k === today();
    rows += `<div class="dayrow ${av.mins===0?'off':''}" data-act="day-edit" data-k="${k}">
      <div class="dayrow-bar l${av.lvl}"></div>
      <div class="dayrow-d">
        <div class="n">${DAYNAMES[d.getDay()].toUpperCase()}</div>
        <div class="v">${d.getDate()}</div>
      </div>
      <div class="grow">
        <div class="opt-t" style="font-size:15px">${av.label}${isToday?' <span class="pill em" style="font-size:10px;padding:2px 7px">today</span>':''}</div>
        <div class="opt-d">${av.mins > 0 ? `About ${av.mins} min · ${ENVS[c.env] ? ENVS[c.env].label.toLowerCase() : ''}` : 'No session placed here'}</div>
      </div>
      <span style="color:var(--faint);font-size:20px">›</span>
    </div>`;
  }

  const openDays = Array.from({length:7}, (_,i) => dk(addDays(ws,i)))
    .filter(k => daysBetween(k, today()) <= 0)
    .filter(k => availOf(dayConstraint(k).avail).mins >= 15).length;
  const placed = Math.min(prog.target, openDays);

  let verdict;
  if (placed >= prog.target) verdict = `Room for all ${prog.target} of your ${prog.name} sessions. They'll go on the days with the most time in them, spaced out where possible.`;
  else if (placed === 0) verdict = `No day left ${isNext ? 'next week' : 'this week'} has room for a full session. That's a legitimate week, not a failed one — the short and three-minute versions stay available every single day.`;
  else verdict = `${placed} session${placed===1?'':'s'} will fit instead of ${prog.target}. That isn't you falling short; it's the plan shrinking to match the week you actually have.`;

  openSheet(`
    <div class="row between mb-s">
      <h2 class="h1">Your week</h2>
      
    </div>
    <p class="small" style="margin-bottom:16px">Tap a day and say what you honestly expect. Every day starts as normal, so you only change the ones that aren't.</p>

    <div class="seg mb">
      <button class="${!isNext?'on':''}" data-act="wk-offset" data-v="0">This week</button>
      <button class="${isNext?'on':''}" data-act="wk-offset" data-v="1">Next week</button>
    </div>

    ${hidden && !isNext ? `<p class="tiny" style="margin:-4px 0 12px">${hidden} day${hidden===1?'':'s'} of this week already gone. Only what's left is shown.</p>` : ''}
    ${isNext ? `<p class="tiny" style="margin:-4px 0 12px">Setting next week early is the single most useful thing you can do here — especially if you already have the call sheet.</p>` : ''}

    <div class="list mb">${rows || '<div class="empty"><div class="big">✓</div>Nothing left to set this week.</div>'}</div>

    <div class="card ${placed >= prog.target ? 'teal' : 'accent'} mb">
      <div class="row between">
        <div class="eyebrow ${placed >= prog.target ? 'tl' : 'em'}">What this gives you</div>
        <div class="pill ${placed >= prog.target ? 'tl' : 'em'}">${placed} of ${prog.target}</div>
      </div>
      <p class="small mt-s">${verdict}</p>
    </div>

    <div class="banner soft mb">A day set to <strong>Not happening</strong> comes off the route completely. It never counts as missed and never puts a mark against you.</div>

    ${!isNext ? `<div class="sec-head"><span class="sec-t">The order</span></div>
      <p class="small" style="margin:-2px 0 14px">Tap a session to change it, or move it to another day. A day you set yourself stays put when the rest of the week gets rearranged.</p>
      ${planOrderHTML()}` : ''}

    <button class="btn primary block lg mt" data-act="wk-save">${isNext ? 'Save next week' : 'Set my week'}</button>
  `);
}

/* One day at a time — big options, each explained */
function sheetDayEdit(k) {
  const d = fromKey(k);
  const c = dayConstraint(k);
  const envIcos = { full:'🏋️', hotel:'🧳', bw:'🧘' };
  openSheet(`
    <div class="row between mb-s">
      <button class="btn xs quiet" data-act="open-week">‹ Week</button>
      
    </div>
    <div class="eyebrow">${DAYNAMES[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}</div>
    <h2 class="h1 mt-s">How much time will you have?</h2>
    <p class="small mt-s" style="margin-bottom:4px">Your best guess is enough. The app sizes the session to whatever you pick, and you can always change it on the day.</p>

    <div class="opts" style="margin-top:20px">
      ${['long','normal','short','micro','none'].map(a => {
        const A = availOf(a);
        return `<div class="opt ${c.avail===a?'on':''}" data-act="wk-avail" data-k="${k}" data-v="${a}">
          <div class="opt-ico">${A.ico}</div>
          <div class="grow">
            <div class="opt-t">${A.label}</div>
            <div class="opt-d">${A.note}</div>
          </div>
          <div class="opt-mark">${tick}</div>
        </div>`;
      }).join('')}
    </div>

    ${c.avail !== 'none' && S.profile.envs.length > 1 ? `
      <h2 class="h2 mt-l">Where will you be?</h2>
      <p class="small mt-s">This decides which exercises you get. A hotel day gets dumbbell work, a floor day gets bodyweight — same plan, different tools.</p>
      <div class="opts" style="margin-top:16px">
        ${S.profile.envs.map(e => `
          <div class="opt ${c.env===e?'on':''}" data-act="wk-env" data-k="${k}" data-v="${e}">
            <div class="opt-ico">${envIcos[e]}</div>
            <div class="grow">
              <div class="opt-t">${ENVS[e].label}</div>
              <div class="opt-d">${ENVS[e].note}</div>
            </div>
            <div class="opt-mark">${tick}</div>
          </div>`).join('')}
      </div>` : ''}

    <button class="btn primary block lg mt-l" data-act="open-week">Done</button>
  `);
}

function sheetLadder(type) {
  const c = dayConstraint(today());
  const rd = S.readiness[today()];
  const sug = suggestRung(rd ? rd.score : null, availOf(c.avail).mins);
  openSheet(`
    <div class="row between mb">
      <h2 class="h1">How big is today?</h2>
      
    </div>
    <p class="small mb">Every one of these counts as a session. There is no partial credit here because there is no such thing as a partial session.</p>
    <div class="ladder">
      ${RUNGS.map(r => `
        <div class="rung ${r.k===sug?'on':''}" data-act="pick-rung" data-type="${h(type)}" data-v="${r.k}">
          <div class="n">${r.n}</div>
          <div class="grow">
            <div class="row between"><div class="h3">${r.label}</div><div class="tiny">${r.mins}</div></div>
            <div class="tiny mt-s">${r.blurb}</div>
            ${r.k===sug?'<div class="pill em mt-s">Suggested for today</div>':''}
          </div>
        </div>`).join('')}
    </div>
    <span class="src" style="display:block;margin-top:12px">${EVIDENCE.microSrc}</span>
  `);
}

function sheetTypePick() {
  const types = ['full','upper','lower','push','pull','legs','cardio'];
  openSheet(`
    <div class="row between mb"><h2 class="h1">Session type</h2></div>
    <div class="chip-grid c2">
      ${types.map(t => `<div class="chip" data-act="pick-type" data-v="${t}">${typeLabel(t)}</div>`).join('')}
    </div>`);
}

function sheetProgram() {
  openSheet(`
    <div class="row between mb"><h2 class="h1">Structure</h2></div>
    <div class="list">
      ${Object.values(PROGRAMS).map(p => `
        <div class="lrow ${S.profile.programId===p.id?'on':''}" data-act="set-program" data-v="${p.id}" style="align-items:flex-start">
          <div class="grow">
            <div class="row between"><div class="h3">${p.name}</div><div class="pill ${S.profile.programId===p.id?'em':''}">${p.target}×/wk</div></div>
            <div class="tiny mt-s">${p.tag}</div>
            <p class="small mt-s">${p.desc}</p>
          </div>
        </div>`).join('')}
    </div>`);
}

let pickerFor = null; // {mode:'swap'|'add', i}
function sheetExercisePicker(mode, i) {
  pickerFor = { mode, i };
  pickerOpen = null; pickerAdded = [];
  const c = dayConstraint(today());
  const env = (S.active && S.active.env) || c.env || 'full';
  renderPicker('', env);
}
/* ============================================================
   EXERCISE PICKER
   ------------------------------------------------------------
   236 movements is too many to scroll. It opens as ten collapsed
   muscle groups instead — the way you actually think about it —
   and only the group you tap unrolls. Searching cuts straight
   through and matches muscle names as well as exercise names, so
   typing "back" finds the whole back rather than nothing.

   Building a routine is multi-select: the sheet stays open, each
   add is confirmed in place, and you leave when you are done
   rather than being thrown out after every single choice.
   ============================================================ */
let pickerOpen = null;      // which muscle group is unrolled
let pickerAdded = [];       // what this visit has added, for the running count

function pickerMatches(e, q) {
  if (!q) return true;
  const hay = (e.name + ' ' + e.primary + ' ' + (e.sec || []).join(' ') + ' ' +
               e.eq + ' ' + (PATTERN_LABEL[e.pattern] || '')).toLowerCase();
  return q.split(/\s+/).filter(Boolean).every(w => hay.indexOf(w) >= 0);
}

function renderPicker(query, env) {
  const flag = envFlag(env);
  const q = (query || '').trim().toLowerCase();
  const multi = pickerFor && (pickerFor.mode === 'routine' || pickerFor.mode === 'add');

  const pool = EXLIST.filter(e => e.env.indexOf(flag) >= 0 && pickerMatches(e, q));

  /* grouped in the order the body is usually thought about, not alphabetically */
  const order = MUSCLES.concat(['Forearms']);
  const groups = {};
  pool.forEach(e => { (groups[e.primary] = groups[e.primary] || []).push(e); });
  const keys = Object.keys(groups).sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  /* Searching opens everything — a closed accordion over search results is
     just a list you have to tap twice to read. */
  const openAll = !!q;
  if (!openAll && pickerOpen && keys.indexOf(pickerOpen) < 0) pickerOpen = null;

  const rowHTML = e => {
    const added = pickerAdded.filter(x => x === e.id).length;
    return `<div class="lrow pick-row${added ? ' added' : ''}">
      <button class="grow" data-act="pick-ex" data-v="${e.id}" style="text-align:left">
        <div class="h3" style="font-size:14.5px">${h(e.name)}</div>
        <div class="tiny mt-s">${h(e.eq)} · ${e.rl}–${e.rh} ${e.load==='time'?'sec':e.load==='min'?'min':'reps'}${added ? ' · <span class="em">added' + (added > 1 ? ' ×' + added : '') + '</span>' : ''}</div>
      </button>
      ${hasForm(e.id) ? `<button class="btn xs ghost" data-act="help-form-session" data-v="${e.id}">Form</button>` : ''}
      <button class="btn xs icon pick-add" data-act="pick-ex" data-v="${e.id}" aria-label="Add ${h(e.name)}">
        ${added ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>' : '+'}
      </button>
    </div>`;
  };

  const body = keys.length ? keys.map(g => {
    const open = openAll || pickerOpen === g;
    return `<div class="pick-group${open ? ' open' : ''}">
      <button class="pick-head" data-act="pick-group" data-v="${h(g)}">
        <span class="pick-dot ${muscleTone(g)}"></span>
        <span class="grow pick-head-t">${h(g)}</span>
        <span class="pick-n">${groups[g].length}</span>
        <span class="pick-chev">${open ? '⌄' : '›'}</span>
      </button>
      ${open ? `<div class="list pick-list">${groups[g].map(rowHTML).join('')}</div>` : ''}
    </div>`;
  }).join('') : `<div class="note"><p class="note-t">Nothing matches “${h(query || '')}”.</p><p class="note-b">Try a muscle — chest, back, quads — or an equipment name like dumbbell.</p></div>`;

  openSheet(`
    <div class="row between mb">
      <h2 class="h1">${pickerFor && pickerFor.mode === 'swap' ? 'Swap for' : 'Add movements'}</h2>
      ${multi && pickerAdded.length ? `<span class="pill em">${pickerAdded.length} added</span>` : ''}
    </div>
    <input class="input mb" id="pick-q" placeholder="Search by name, muscle or kit…" value="${h(query || '')}"
           autocomplete="off" enterkeyhint="search" inputmode="search">
    <div class="chip-grid c3 mb">
      ${Object.values(ENVS).map(e => `<div class="chip ${env===e.k?'on':''}" data-act="pick-env" data-v="${e.k}" style="font-size:12.5px">${e.short}</div>`).join('')}
    </div>
    ${body}
    ${multi ? `<div class="pick-done">
      <button class="btn primary block lg" data-act="pick-finish">${pickerAdded.length ? 'Done · ' + pickerAdded.length + ' added' : 'Done'}</button>
    </div>` : ''}
  `);

  const qi = document.getElementById('pick-q');
  if (qi) {
    qi.addEventListener('input', ev => {
      const v = ev.target.value;
      const pos = ev.target.selectionStart;
      renderPicker(v, env);
      const n = document.getElementById('pick-q');
      if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch(e){} }
    });
  }
  window._pickEnv = env;
  window._pickQ = query || '';
}

/* A quiet colour per region so the collapsed list is scannable without
   reading every label. */
function muscleTone(m) {
  if (/Chest|Shoulders|Triceps/.test(m)) return 'push';
  if (/Back|Biceps|Forearms/.test(m)) return 'pull';
  if (/Quads|Hamstrings|Glutes|Calves/.test(m)) return 'legs';
  return 'core';
}

function sheetEnvs() {
  openSheet(`
    <div class="row between mb"><h2 class="h1">Where you train</h2></div>
    <p class="small mb">These are the options you can assign to any day of the week.</p>
    <div class="list mb">
      ${Object.values(ENVS).map(e => `
        <div class="lrow ${S.profile.envs.includes(e.k)?'on':''}" data-act="toggle-env" data-v="${e.k}">
          <div class="ico">${e.k==='full'?'🏋️':e.k==='hotel'?'🧳':'🧘'}</div>
          <div class="grow"><div class="h3">${e.label}</div><div class="tiny mt-s">${e.note}</div></div>
          <div class="pill ${S.profile.envs.includes(e.k)?'em':''}">${S.profile.envs.includes(e.k)?'✓':''}</div>
        </div>`).join('')}
    </div>
    <button class="btn primary block" data-act="close">Done</button>`);
}

function sheetRest() {
  openSheet(`
    <div class="row between mb"><h2 class="h1">Rest timers</h2></div>
    <div class="field mb"><div class="label">Compounds (seconds)</div>
      <div class="stepper"><button data-act="rest-adj" data-f="restMain" data-v="-15">−</button><input type="text" value="${S.settings.restMain}" readonly><button data-act="rest-adj" data-f="restMain" data-v="15">+</button></div></div>
    <div class="field mb"><div class="label">Accessories (seconds)</div>
      <div class="stepper"><button data-act="rest-adj" data-f="restAcc" data-v="-15">−</button><input type="text" value="${S.settings.restAcc}" readonly><button data-act="rest-adj" data-f="restAcc" data-v="15">+</button></div></div>
    <div class="lrow" data-act="toggle-autorest"><div class="grow"><div class="h3">Auto-start after a set</div><div class="tiny mt-s">Starts the clock the moment you tick a set</div></div><div class="switch ${S.settings.autoRest?'on':''}"></div></div>
    <button class="btn primary block mt" data-act="close">Done</button>`);
}

/* sheetProfile now lives in p6e_profile.js */

function sheetPaywall() {
  openSheet(`
    <div class="center mb">
      <div style="font-size:38px">🏔️</div>
      <h2 class="h1 mt-s">Guzo Pro</h2>
      <p class="small mt-s">Scaffolding preview. No payment is wired up in beta.</p>
    </div>
    <div class="card accent mb">
      <div class="row between"><div class="h3">Annual</div><div class="pill em">Best value</div></div>
      <div class="row between mt-s"><div class="mono" style="font-size:26px;font-weight:700">£69.99</div><div class="tiny">£5.83 / month</div></div>
      <div class="tiny mt-s">7-day free trial · cancel anytime</div>
    </div>
    <div class="card mb">
      <div class="h3">Monthly</div>
      <div class="row between mt-s"><div class="mono" style="font-size:22px;font-weight:700">£8.99</div><div class="tiny">billed monthly</div></div>
    </div>
    <div class="eyebrow mb-s">Pro includes</div>
    <div class="list mb">
      ${['Week shaping and automatic re-routing','Readiness-driven session sizing','Nutrition and protein targets','Full analytics, balance and PR history','Unlimited custom structures'].map(f =>
        `<div class="lrow"><div class="ico" style="color:var(--teal)">✓</div><div class="grow"><div class="small">${f}</div></div></div>`).join('')}
    </div>
    <div class="banner soft mb">Free tier keeps: logging, the four-rung ladder, terrain check-ins, full history and data export. Logging your training should never be behind a paywall.</div>
    <button class="btn primary block lg" data-act="close">Everything's unlocked in beta</button>
  `);
}
