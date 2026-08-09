/* ============================================================
   UI HELPERS
   ============================================================ */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

let toastTimer = null;
function toast(msg, good) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast on' + (good ? ' good' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 2300);
}
function buzz(ms) { if (navigator.vibrate) { try { navigator.vibrate(ms || 12); } catch(e){} } }

/* A sheet is never a dead end: it can be dismissed by the ✕, the scrim,
   the hardware/browser back button, Escape, or dragging it down. */
let sheetOpen = false;
let sheetDepth = 0;

function openSheet(html) {
  const sh = $('#sheet');
  $('#sheet-body').innerHTML = html;
  a11yPass($('#sheet-body'));   // synchronous, for the same reason as in go()
  sh.style.transform = '';
  sh.classList.add('on');
  $('#scrim').classList.add('on');
  sh.scrollTop = 0;
  if (!sheetOpen) {
    sheetOpen = true;
    sheetDepth++;
    try { history.pushState({ ftSheet: sheetDepth }, ''); } catch (e) {}
  }
}

function closeSheet(fromHistory) {
  const sh = $('#sheet');
  sh.classList.remove('on');
  sh.style.transform = '';
  $('#scrim').classList.remove('on');
  if (sheetOpen && !fromHistory) {
    sheetOpen = false;
    try { if (history.state && history.state.ftSheet) history.back(); } catch (e) {}
  }
  sheetOpen = false;
}

window.addEventListener('popstate', () => { if (sheetOpen) closeSheet(true); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && sheetOpen) { e.preventDefault(); closeSheet(); }
});

/* drag the grip downward to dismiss */
(function sheetDrag() {
  let startY = null, dy = 0;
  const grip = () => document.getElementById('sheet-grip');
  const sh = () => document.getElementById('sheet');
  const down = e => {
    if (!sheetOpen) return;
    startY = (e.touches ? e.touches[0].clientY : e.clientY); dy = 0;
    sh().classList.add('dragging');
  };
  const move = e => {
    if (startY == null) return;
    const y = (e.touches ? e.touches[0].clientY : e.clientY);
    dy = Math.max(0, y - startY);
    sh().style.transform = 'translateY(' + dy + 'px)';
    if (e.cancelable) e.preventDefault();
  };
  const up = () => {
    if (startY == null) return;
    const el = sh();
    el.classList.remove('dragging');
    if (dy > 90) closeSheet(); else el.style.transform = '';
    startY = null; dy = 0;
  };
  document.addEventListener('touchstart', e => { if (e.target.closest('#sheet-grip')) down(e); }, { passive:true });
  document.addEventListener('touchmove', e => { if (startY != null) move(e); }, { passive:false });
  document.addEventListener('touchend', up);
  document.addEventListener('mousedown', e => { if (e.target.closest('#sheet-grip')) down(e); });
  document.addEventListener('mousemove', e => { if (startY != null) move(e); });
  document.addEventListener('mouseup', up);
})();

let SCREEN = 'today';
function go(name) {
  SCREEN = name;
  $$('.screen').forEach(s => s.classList.remove('on'));
  const el = $('#s-' + name);
  if (el) el.classList.add('on');
  $$('.nav-btn').forEach(b => b.classList.toggle('on', b.dataset.go === name));
  $('#nav').classList.toggle('hide', name === 'onboard');
  syncNav();
  render();
  /* Synchronously, not via the observer: its callback is a microtask, so a
     focus() immediately after navigating would land before the attributes
     did. The observer stays as the backstop for renderX() calls that do not
     go through here. */
  a11yPass(el || undefined);
  if (el) el.scrollTop = 0;   // the screen scrolls, the page never does
}

function render() {
  if (!S.onboarded) { renderOnboard(); return; }
  if (SCREEN === 'today') renderToday();
  if (SCREEN === 'plan') renderPlan();
  if (SCREEN === 'train') renderTrain();
  if (SCREEN === 'progress') renderProgress();
  if (SCREEN === 'fuel') renderFuel();
  if (SCREEN === 'more') renderMore();
}

function dailyLine() {
  const seed = parseInt(today().replace(/-/g, ''), 10);
  return LINES[seed % LINES.length];
}

/* ============================================================
   TODAY
   ============================================================ */
function renderToday() {
  const ephemeral = !STORAGE_OK ? `<div class="banner soft mb"><strong>Preview only.</strong> This window can't store anything, so nothing you log here will survive a reload. Put Guzo on a web address to train against it for real.</div>` : '';
  const rd = S.readiness[today()];
  const score = rd ? rd.score : null;
  const band = readinessBand(score);
  const plan = plannedToday();
  const c = dayConstraint(today());
  const av = availOf(c.avail);
  const name = S.profile.name ? S.profile.name.split(' ')[0] : null;
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 17 ? 'Afternoon' : hour < 22 ? 'Evening' : 'Late one';
  const jst = journeyStats();

  let html = ephemeral;

  /* ── 1. who, when, and how the week is actually going ───────
     The old streak chip contradicted the product: this app argues that a
     missed session is free and there is no streak to break, and then led
     with a streak counter. Weeks-done-of-weeks-planned says the same
     encouraging thing without the loss aversion. */
  const wk = weekProgress();
  html += `<div class="home-top">
    <div>
      <div class="home-greet">${greet}${name ? ', ' + h(name) : ''}</div>
      <div class="home-date"><button class="home-day" data-act="open-journey">Day ${jst.day}</button> · ${prettyDate(today())}</div>
    </div>
    ${wk.planned ? `<button class="week-chip" data-act="open-week">
      <span class="week-chip-n"><b>${wk.done}</b>/${wk.planned}</span>
      <span class="week-chip-l">this<br>week</span>
    </button>` : ''}
  </div>`;

  /* ── 2. THE HERO ────────────────────────────────────────────
     One card that answers the whole question: what am I doing, how long,
     why that size, and what the evidence says about where I am. Readiness
     used to be a separate card competing with this one — but readiness is
     not a peer of the session, it is the REASON the session is that size. */
  if (S.active) {
    const doneSets = S.active.exercises.reduce((a,i)=>a+i.sets.filter(s=>s.done).length,0);
    const allSets = S.active.exercises.reduce((a,i)=>a+i.sets.length,0);
    const pct = allSets ? Math.round(doneSets/allSets*100) : 0;
    html += `<div class="hero live">
      <div class="hero-glow"></div>
      <div class="hero-in">
        <div class="row between"><span class="hero-eyebrow"><span class="live-dot"></span>In progress</span><span class="pill em">${doneSets}/${allSets} sets</span></div>
        <h1 class="hero-title">${h(sessionTitle(S.active))}</h1>
        <div class="bar mt"><i style="width:${pct}%"></i></div>
        <button class="btn primary block lg mt" data-act="goto-train">Back to the session</button>
      </div>
    </div>`;
  } else if (c.avail === 'none') {
    html += `<div class="hero quiet">
      <div class="hero-in">
        <span class="hero-eyebrow">Today</span>
        <h1 class="hero-title">Rest day</h1>
        <p class="hero-sub">You told the app today wasn't happening, and it believes you. Nothing is owed and nothing is counted against you.</p>
        <div class="btn-row mt">
          <button class="btn ghost" data-act="open-week">Change it</button>
          <button class="btn" data-act="quick-rung" data-v="micro">Three minutes anyway</button>
        </div>
      </div>
    </div>`;
  } else if (plannedDoneOn(today())) {
    const sess = sessionsOn(today()).filter(x => !x.extra).slice(-1)[0] || sessionsOn(today()).slice(-1)[0];
    const v = sessionVolume(sess);
    html += `<div class="hero done">
      <div class="hero-in">
        <span class="hero-eyebrow tl">✓ Logged today</span>
        <h1 class="hero-title">${h(sessionTitle(sess))}</h1>
        <div class="hero-stats">
          <div><span class="hs-v">${v.sets}</span><span class="hs-k">sets</span></div>
          <div><span class="hs-v">${sess.dur||0}</span><span class="hs-k">min</span></div>
          ${sess.kcal||sessionKcal(sess)?`<div><span class="hs-v">${sess.kcal||sessionKcal(sess)}</span><span class="hs-k">kcal</span></div>`:''}
          ${v.tonnage?`<div><span class="hs-v">${(v.tonnage/1000).toFixed(1)}k</span><span class="hs-k">${unit()}</span></div>`:''}
        </div>
        <p class="hero-sub">That's today's waypoint marked. Anything else now is a bonus, not a requirement.</p>
        <button class="btn ghost block mt" data-act="new-session">Log something else</button>
      </div>
    </div>`;
  } else {
    const suggested = suggestRung(score, av.mins);
    const rungDef = RUNGS.find(r => r.k === suggested);
    const type = plan ? plan.type : nextType();
    const note = heroNote();
    /* A routine can be the planned session now, so the hero has to be able
       to start one — and the size ladder makes no sense against a routine,
       whose sets you already wrote down yourself. */
    const rt = plan && plan.routineId ? routineById(plan.routineId) : null;
    const title = rt ? rt.name : typeLabel(type);
    html += `<div class="hero">
      <div class="hero-glow"></div>
      <div class="hero-in">
        <div class="row between">
          <span class="hero-eyebrow">Today${plan ? '' : ' <span class="hero-tag">unplanned</span>'}</span>
          <span class="pill em">${ENVS[c.env] ? ENVS[c.env].short : 'Gym'}</span>
        </div>
        <h1 class="hero-title">${h(title)}</h1>
        <div class="hero-meta">
          <span class="hm"><span class="hm-v">${rt ? routineMins(rt) + ' min' : rungMinsLabel(suggested).replace('~','')}</span><span class="hm-k">planned</span></span>
          <span class="hm-div"></span>
          <span class="hm"><span class="hm-v">${rt ? rt.items.length + ' moves' : rungDef.label}</span><span class="hm-k">${rt ? 'yours' : 'size'}</span></span>
        </div>
        <p class="hero-sub">${rt ? 'Your own routine, on the week&rsquo;s plan. Finishing it marks today done.' : heroReason(rd, band, suggested, rungDef)}</p>
        ${rd || rt ? '' : `<button class="hero-checkin" data-act="open-readiness">
          <span class="hero-checkin-d">◐</span>
          <span class="grow">Check in first &mdash; it sizes this session</span>
          <span class="strip-chev">›</span>
        </button>`}
        ${rt ? `<button class="btn primary block lg mt" data-act="routine-start" data-v="${h(rt.id)}" data-planned="1">Start</button>`
             : `<button class="btn primary block lg mt" data-act="start-session" data-type="${type}" data-rung="${suggested}">Start</button>
        <button class="btn quiet block" data-act="open-ladder" data-type="${type}">Choose a different size</button>`}
        ${plan ? `<button class="btn quiet block" data-act="plan-day" data-k="${today()}">Doing something else today?</button>` : ''}
        ${note ? `<button class="hero-note" data-act="coach-note" data-v="${note.k}">
          <span class="grow">${note.short}</span>
          <span class="hero-note-a">Why ›</span>
        </button>` : ''}
      </div>
    </div>`;
  }

  /* ── 3. the day around the training — one dense strip ─────── */
  html += dayStripHTML();

  /* ── 4. the week ──────────────────────────────────────────── */
  html += `<div class="sec-head"><span class="sec-t">This week</span><button class="sec-a" data-act="open-week">Shape it</button></div>`;
  html += weekStripHTML();

  /* ── 5. your own routines ─────────────────────────────────── */
  html += routineStripHTML();
  html += todaySessionsHTML();

  /* Fuel has its own nav tab and its own day card. The tile that used to sit
     here was a worse duplicate of both, and read S.nutrition.targets raw — so
     with no height or age on file it rendered "0 / undefined kcal". */

  $('#today-body').innerHTML = html;
}

/* How the week is actually going: sessions done against sessions planned.
   Replaces the streak chip, which asked you to protect an unbroken run in an
   app whose whole argument is that one missed session costs you nothing. */
function weekProgress() {
  const plan = buildWeekPlan();
  const keys = Object.keys(plan);
  const done = keys.filter(k => plan[k].done || sessionsOn(k).some(s => !s.extra)).length;
  return { done, planned: keys.length };
}

/* The hero's one-line explanation of why today is the size it is. Without a
   check-in it falls back to describing the size; with one it names the reason,
   because "trimmed" is a decision and you are owed the reasoning behind it. */
function heroReason(rd, band, suggested, rungDef) {
  if (!rd) return rungDef.blurb;
  const why = {
    full:  'the whole plan looks right.',
    trim:  'today&rsquo;s is trimmed to the compounds.',
    short: 'today&rsquo;s is cut to two hard movements.',
    micro: 'three minutes is the win today.'
  }[suggested] || rungDef.blurb;
  return `<strong class="${band.color === 'rose' ? 'rs' : band.color === 'amber' ? 'em' : 'tl'}">${band.label}</strong> after ${rd.sleepH}h &mdash; ${why}`;
}

/* Coaching that belongs next to the decision it informs, rather than seventh
   down the page styled like a step counter. One line here, the research and
   the citation behind a tap. */
function heroNote() {
  const miss = missState();
  if (S.sessions.filter(s => s.ended).length === 0) {
    return { k:'first', short:'Nothing logged yet &mdash; the smallest session counts the same as the largest' };
  }
  if (miss.since != null) {
    const dt = detrainingNote(miss.since);
    if (dt) return { k:'detrain', short: dt.t.replace(/[.\s]+$/, '') + ' &mdash; ' + miss.since + ' days off' };
  }
  if (miss.consecutive === 1) return { k:'one', short:'One missed session &mdash; that one is free' };
  if (miss.consecutive >= 2) return { k:'two', short:'Two in a row &mdash; worth shrinking the next one' };
  return null;
}

function sheetCoachNote(kind) {
  const miss = missState();
  let title = '', body = '', src = '', actions = '';
  if (kind === 'first') {
    title = 'Nothing logged yet';
    body = 'Pick any size you like. The smallest one counts exactly the same as the largest &mdash; the app is built so that showing up is the thing being measured, not how big it was.';
  } else if (kind === 'detrain') {
    const dt = detrainingNote(miss.since) || {};
    title = dt.t || 'Time off'; body = dt.b || ''; src = dt.s || '';
  } else if (kind === 'one') {
    title = 'One missed session';
    body = EVIDENCE.oneMiss; src = EVIDENCE.oneMissSrc;
  } else if (kind === 'two') {
    title = 'Two in a row';
    body = EVIDENCE.twoMiss; src = EVIDENCE.twoMissSrc;
    actions = `<div class="btn-row mt-l">
      <button class="btn ghost grow" data-act="open-week">Tell it what changed</button>
      <button class="btn grow" data-act="quick-rung" data-v="short">Do the short one</button>
    </div>`;
  } else { return; }
  openSheet(`
    <h2 class="h1">${title}</h2>
    <p class="lede mt">${body}</p>
    ${src ? `<p class="tiny mt-l">${src}</p>` : ''}
    ${actions}
  `);
}

function weekStripHTML() {
  const plan = buildWeekPlan();
  const ws = weekStart();
  const doneDates = {};
  S.sessions.filter(s => s.ended).forEach(s => { doneDates[s.date] = s; });
  let html = '<div class="week">';
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    const k = dk(d);
    const c = dayConstraint(k);
    const p = plan[k];
    const done = doneDates[k];
    const isToday = k === today();
    const past = daysBetween(k, today()) > 0;
    let cls = 'day';
    if (isToday) cls += ' today';
    if (done) cls += ' done';
    else if (c.avail === 'none') cls += ' rest';
    else if (p && past) cls += ' miss';
    const shortType = t => t === 'micro' ? '3 min' : typeLabel(t).split(' ')[0];
    let sub = '';
    if (done) sub = done.routineName ? done.routineName.split(' ')[0] : shortType(done.type);
    else if (p && p.elsewhere) sub = planShortLabel(p);
    else if (c.avail === 'none') sub = 'Off';
    else if (p && past) sub = '—';
    else if (p) sub = planShortLabel(p);
    else sub = availOf(c.avail).label;
    if (p && p.elsewhere) cls += ' done';
    html += `<div class="${cls}" data-act="day-tap" data-k="${k}">
      <div class="dn">${DAYNAMES[d.getDay()].toUpperCase()}</div>
      <div class="dd">${d.getDate()}</div>
      <div class="dt">${h(sub)}</div>
    </div>`;
  }
  html += '</div>';
  return html;
}

/* ============================================================
   PLAN
   ============================================================ */
function renderPlan() {
  const prog = programOf();
  const plan = buildWeekPlan();
  const ws = weekStart();
  let html = '';

  html += `<div class="card accent mb">
    <div class="eyebrow em">The part that matters</div>
    <div class="h2 mt-s">Shape the week before it happens</div>
    <p class="small mt-s">Every other app waits until you've already missed sessions and then reshuffles. Tell this one where the shoot days, the travel and the short nights are, and it cuts the route to fit before you get there.</p>
    <button class="btn primary block mt" data-act="open-week">Shape this week</button>
  </div>`;

  html += `<div class="eyebrow mb-s">Week of ${prettyDate(dk(ws))}</div>`;
  html += weekStripHTML();

  html += `<div class="list mt-l">`;
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    const k = dk(d);
    const c = dayConstraint(k);
    const p = plan[k];
    const done = S.sessions.find(s => s.ended && s.date === k);
    html += `<div class="lrow" data-act="day-tap" data-k="${k}">
      <div class="ico">${done ? '✓' : c.avail === 'none' ? '·' : p ? '▲' : '–'}</div>
      <div class="grow">
        <div class="row between">
          <div class="h3">${prettyDate(k)}${k===today()?' <span class="pill em">today</span>':''}</div>
          <div class="pill">${availOf(c.avail).label}</div>
        </div>
        <div class="tiny mt-s">${done ? 'Logged · ' + typeLabel(done.type) : p ? typeLabel(p.type) + ' · ' + (ENVS[c.env]?ENVS[c.env].label:'') : c.avail === 'none' ? 'Off the route' : 'Open'}</div>
      </div>
    </div>`;
  }
  html += `</div>`;

  html += `<div class="divide"></div>
  <div class="eyebrow mb-s">Structure</div>
  <div class="card">
    <div class="row between"><div class="h2">${prog.name}</div><div class="pill em">${prog.target}×/wk</div></div>
    <p class="small mt-s">${prog.desc}</p>
    <button class="btn ghost block mt" data-act="open-program">Change structure</button>
  </div>`;

  html += `<div class="card mt">
    <div class="eyebrow">The ladder</div>
    <p class="small mt-s">Any session, any day, can be taken at any of these four sizes. Pick the one that matches the day you're actually having.</p>
    <div class="ladder mt">
      ${RUNGS.map(r => `<div class="rung"><div class="n">${r.n}</div><div class="grow"><div class="row between"><div class="h3">${r.label}</div><div class="tiny">${rungMinsLabel(r.k)}</div></div><div class="tiny mt-s">${r.blurb}</div></div></div>`).join('')}
    </div>
    <span class="src">Bottom rung: ${EVIDENCE.microSrc}</span>
  </div>`;

  $('#plan-body').innerHTML = html;
}

/* ============================================================
   TRAIN
   ============================================================ */
function renderTrain() {
  const body = $('#train-body');
  if (!S.active) {
    const c = dayConstraint(today());
    const rd = S.readiness[today()];
    const suggested = suggestRung(rd ? rd.score : null, availOf(c.avail).mins);
    const type = (plannedToday() || {}).type || nextType();
    body.innerHTML = `
      <div class="hdr"><h1 class="h1">Train</h1></div>
      <div class="card accent">
        <div class="eyebrow em">Ready when you are</div>
        <div class="h1 mt-s">${typeLabel(type)}</div>
        <p class="small mt">Suggested size: <strong>${RUNGS.find(r=>r.k===suggested).label}</strong> · ${ENVS[c.env]?ENVS[c.env].label:'Full gym'}</p>
        <button class="btn primary block lg mt" data-act="start-session" data-type="${type}" data-rung="${suggested}">Start ${RUNGS.find(r=>r.k===suggested).label.toLowerCase()}</button>
        <button class="btn quiet block mt-s" data-act="open-ladder" data-type="${type}">Choose a different size ▾</button>
      </div>
      <div class="divide"></div>
      <div class="eyebrow mb-s">Or</div>
      <div class="list">
        <div class="lrow" data-act="open-typepick"><div class="ico">↺</div><div class="grow"><div class="h3">Different session type</div><div class="tiny mt-s">Override what's scheduled</div></div></div>
        <div class="lrow" data-act="blank-session"><div class="ico">✎</div><div class="grow"><div class="h3">Empty session</div><div class="tiny mt-s">Build it exercise by exercise</div></div></div>
        <div class="lrow" data-act="quick-rung" data-v="micro"><div class="ico">⏱</div><div class="grow"><div class="h3">Three minutes</div><div class="tiny mt-s">The floor. Anywhere, no kit.</div></div></div>
      </div>
      ${recentSessionsHTML(4)}`;
    return;
  }

  const A = S.active;
  const doneSets = A.exercises.reduce((a,i)=>a+i.sets.filter(s=>s.done).length,0);
  const allSets = A.exercises.reduce((a,i)=>a+i.sets.length,0);
  const pct = allSets ? Math.round(doneSets/allSets*100) : 0;
  const elapsed = A.started ? Math.round((Date.now() - A.started)/60000) : 0;

  let html = `
  <div class="train-top">
    <button class="train-back" data-act="leave-session" aria-label="Leave session">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M15 19l-7-7 7-7"/></svg>
    </button>
    <div class="grow">
      <div class="eyebrow em">${RUNGS.find(r=>r.k===A.rung) ? RUNGS.find(r=>r.k===A.rung).label : ''}</div>
      <h1 class="h1 mt-s">${typeLabel(A.type)}</h1>
    </div>
  </div>
  <div class="card tight mb">
    <div class="row between mb-s">
      <span class="small" id="tp-count">${doneSets} of ${allSets} sets</span>
      <span class="row gap-s"><span class="small mono em" id="tp-kcal">${sessionKcal(A)} kcal</span><span class="small mono" id="tp-time">${elapsed} min</span></span>
    </div>
    <div class="bar"><i id="tp-fill" style="width:${pct}%"></i></div>
  </div>`;

  /* Say so when the browser cannot hold the screen on. Silently failing to
     keep the screen awake is worse than admitting it, because the fix — one
     setting — takes ten seconds and the alternative is unlocking your phone
     between every single set. */
  if (!wakeSupported()) {
    html += `<div class="banner soft mb"><strong>Your screen may sleep mid-set.</strong> This browser can't hold it awake. Settings &rarr; Display &amp; Brightness &rarr; Auto-Lock &rarr; Never for the session.</div>`;
  }

  if (A.micro) {
    html += `<div class="banner warm mb">${EVIDENCE.micro}<span class="src">${EVIDENCE.microSrc}</span></div>`;
  }

  A.exercises.forEach((item, ei) => { html += exCardHTML(item, ei); });

  html += `
    <button class="btn ghost block mt" data-act="add-exercise">+ Add an exercise</button>
    <button class="btn primary block lg mt" data-act="finish">Finish session</button>
    <p class="tiny center mt-s">Partial sessions save exactly as they are. There's no penalty for stopping early.</p>
    <div class="divide"></div>
    <button class="btn quiet block" data-act="leave-session">Leave and come back later</button>
    <button class="btn quiet block" data-act="abandon" style="color:var(--faint)">Discard this session</button>`;

  body.innerHTML = html;
}

/* The brand mark, used as a progress ring toward the next milestone */
function journeyRingSVG(st, nxt) {
  let pct = 1;
  if (nxt && nxt.left != null && nxt.left > 0) {
    const target = /^s\d+$/.test(nxt.k) ? +nxt.k.slice(1) : +nxt.k.slice(1);
    const have = /^s\d+$/.test(nxt.k) ? st.count : st.streak;
    pct = target ? Math.max(0.04, Math.min(1, have / target)) : 0.5;
  }
  const r = 15, c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 40 40" class="jring">
    <circle cx="20" cy="20" r="${r}" class="jring-bg"/>
    <circle cx="20" cy="20" r="${r}" class="jring-fg"
      stroke-dasharray="${c}" stroke-dashoffset="${(c * (1 - pct)).toFixed(1)}"/>
    <circle cx="20" cy="20" r="7" class="jring-in"/>
    <circle cx="20" cy="20" r="2.6" class="jring-dot"/>
  </svg>`;
}

/* ---- one exercise card, expanded or collapsed ---- */
function isComplete(item) {
  return item.sets.length > 0 && item.sets.every(st => st.done);
}
function setSummary(item) {
  const done = item.sets.filter(s => s.done);
  if (!done.length) return '';
  const isTime = item.load === 'time' || item.load === 'min';
  const reps = done.map(s => +s.r || 0);
  const ws = done.map(s => +s.w || 0).filter(w => w > 0);
  const repTxt = reps.every(r => r === reps[0]) ? reps[0] : Math.min(...reps) + '–' + Math.max(...reps);
  let wTxt = '';
  if (ws.length) {
    const uniq = ws.every(w => w === ws[0]);
    wTxt = ' · ' + (uniq ? fmtW(ws[0]) : fmtW(Math.min(...ws)) + '–' + fmtW(Math.max(...ws))) + unit();
  }
  return done.length + ' × ' + repTxt + (isTime ? 's' : '') + wTxt;
}

function exCardHTML(item, ei) {
  const ex = EX[item.exId] || { name:item.name, primary:'', sec:[], load:'wt', rl:8, rh:12 };
  const complete = isComplete(item);
  const collapsed = item.collapsed;
  const num = String(ei + 1).padStart(2, '0');

  if (collapsed) {
    return `<div class="ex-card done" data-ei="${ei}">
      <button class="ex-collapsed" data-act="toggle-collapse" data-i="${ei}">
        <div class="ex-num ${complete?'ok':''}">${complete ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>' : num}</div>
        <div class="grow" style="text-align:left">
          <div class="ex-name">${h(item.name)}</div>
          <div class="ex-sum">${setSummary(item) || 'Not started'}${exerciseKcal(item) ? ` · ${exerciseKcal(item)} kcal` : ''}</div>
        </div>
        <span class="ex-chev">⌄</span>
      </button>
    </div>`;
  }

  const isTime = item.load === 'time' || item.load === 'min';
  const unitLbl = item.load === 'min' ? 'MIN' : isTime ? 'SECS' : 'REPS';
  const L = S.lifts[item.exId] || {};
  const last = L.history && L.history.length ? L.history[L.history.length-1] : null;

  return `<div class="ex-card" data-ei="${ei}">
    <div class="ex-head">
      <button class="ex-num-btn" data-act="toggle-collapse" data-i="${ei}">
        <div class="ex-num ${complete?'ok':''}">${complete ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>' : num}</div>
      </button>
      <button class="grow ex-title" data-act="toggle-collapse" data-i="${ei}">
        <div class="ex-name">${h(item.name)}${item.priority?'<span class="ex-flag">focus</span>':''}${item.cardio?'<span class="ex-flag">finisher</span>':''}</div>
        <div class="ex-meta">${h(ex.primary)}${ex.sec && ex.sec.length ? ' · ' + h(ex.sec.join(', ')) : ''}</div>
      </button>
      <div class="row gap-s">
        <button class="btn xs icon" data-act="ex-form" data-i="${ei}" data-v="${h(item.exId)}" aria-label="How to do it">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.8-.9 1.4v.4"/><path d="M12 17h.01"/></svg>
        </button>
        <button class="btn xs ghost" data-act="swap-ex" data-i="${ei}">Swap</button>
        <button class="btn xs quiet" data-act="ex-menu" data-i="${ei}">⋯</button>
      </div>
    </div>
    <div class="ex-body">
      ${item.targetR ? `<div class="ex-target"><span>Target</span> <strong>${item.targetW != null && item.targetW !== '' ? fmtW(item.targetW) + unit() + ' × ' : ''}${item.targetR}${isTime?'s':''}</strong>${item.deloaded ? '<span class="ex-target-sub">−10%</span>' : ''}${exerciseKcal(item) ? `<span class="ex-kcal">${exerciseKcal(item)} kcal</span>` : ''}</div>` : ''}
      ${recallRowHTML(item)}
      <div class="set-head"><span>SET</span><span>${item.load==='bw'?'ADDED':'WEIGHT'}</span><span>${unitLbl}</span><span>RPE</span><span></span></div>
      ${item.sets.map((st, si) => `
        <div class="set-row ${st.done?'done':''}">
          <div class="sn">${si+1}</div>
          <input class="set-in" type="text" inputmode="decimal" enterkeyhint="next" autocomplete="off" aria-label="Weight, set ${si+1}" placeholder="${item.targetW != null && item.targetW !== '' ? fmtW(item.targetW) : (item.load==='bw'?'0':'–')}" value="${st.w===''?'':h(st.w)}" data-set="w" data-i="${ei}" data-s="${si}">
          <input class="set-in" type="text" inputmode="numeric" enterkeyhint="next" autocomplete="off" aria-label="${unitLbl==='REPS'?'Reps':unitLbl==='SECS'?'Seconds':'Minutes'}, set ${si+1}" placeholder="${item.targetR||''}" value="${st.r===''?'':h(st.r)}" data-set="r" data-i="${ei}" data-s="${si}">
          <input class="set-in" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" aria-label="RPE, set ${si+1}" placeholder="–" value="${st.rpe===''?'':h(st.rpe)}" data-set="rpe" data-i="${ei}" data-s="${si}">
          <button class="tick ${st.done?'on':''}" data-act="toggle-set" data-i="${ei}" data-s="${si}" aria-label="${st.done?'Undo set':'Mark set'} ${si+1} ${st.done?'':'done'}" aria-pressed="${st.done?'true':'false'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>
          </button>
        </div>`).join('')}
      <div class="row gap-s" style="padding:8px 6px 0">
        <button class="btn xs ghost grow" data-act="add-set" data-i="${ei}">+ Set</button>
        ${item.sets.length>1?`<button class="btn xs quiet" data-act="del-set" data-i="${ei}">− Set</button>`:''}
      </div>
    </div>
  </div>`;
}

/* In-place progress update so logging never rebuilds the DOM under your thumb */
/* The weight the plate line should describe: whatever is typed into the
   first set if anything is, otherwise the prescription. A stale plate count
   is worse than none — it would have you loading the wrong bar with
   confidence. */
function plateWeightFor(item) {
  const typed = item.sets && item.sets.length ? parseFloat(item.sets[0].w) : NaN;
  if (!isNaN(typed) && typed > 0) return typed;
  const t = parseFloat(item.targetW);
  return isNaN(t) ? 0 : t;
}

/* Updated in place while you type, so the keyboard never closes. */
function refreshPlateRow(ei) {
  if (!S.active) return;
  const item = S.active.exercises[ei];
  const card = document.querySelector('.ex-card[data-ei="' + ei + '"]');
  if (!item || !card) return;
  const row = card.querySelector('.recall.plates');
  if (!row || !usesPlates(item.exId)) return;
  const w = plateWeightFor(item);
  const line = plateLine(w);
  if (!line) return;
  const r = platesFor(w);
  row.dataset.v = w;
  const v = row.querySelector('.recall-v');
  const ago = row.querySelector('.recall-ago');
  if (v) v.textContent = line;
  if (ago) ago.textContent = r && !r.exact ? fmtP(r.achieved) + unit() : 'per side';
}

/* What you actually did last time, and what to hang on the bar today.
   Both sit directly above the set rows, because that is where you look
   between racking the weight and starting the set. */
function recallRowHTML(item) {
  const bits = [];

  const L = lastLine(item.exId);
  if (L) {
    bits.push(`<div class="recall"><span class="recall-k">Last</span>
      <span class="recall-v mono">${h(L.text)}</span>
      <span class="recall-ago">${h(L.ago)}</span></div>`);
  }

  if (usesPlates(item.exId)) {
    const w = plateWeightFor(item);
    if (!(w > 0)) return bits.join('');
    const line = plateLine(w);
    const r = platesFor(w);
    if (line) {
      bits.push(`<button class="recall plates" data-act="plate-calc" data-v="${w}">
        <span class="recall-k">Bar</span>
        <span class="recall-v mono">${h(line)}</span>
        <span class="recall-ago">${r && !r.exact ? fmtP(r.achieved) + unit() : 'per side'}</span>
        <span class="recall-chev">›</span>
      </button>`);
    }
  }
  return bits.join('');
}

function updateTrainProgress() {
  const A = S.active;
  if (!A) return;
  const done = A.exercises.reduce((a,i)=>a+i.sets.filter(s=>s.done).length,0);
  const all = A.exercises.reduce((a,i)=>a+i.sets.length,0);
  const c = document.getElementById('tp-count');
  const f = document.getElementById('tp-fill');
  const t = document.getElementById('tp-time');
  if (c) c.textContent = done + ' of ' + all + ' sets';
  if (f) f.style.width = (all ? Math.round(done/all*100) : 0) + '%';
  if (t && A.started) t.textContent = Math.round((Date.now() - A.started)/60000) + ' min';
  const kc = document.getElementById('tp-kcal');
  if (kc) kc.textContent = sessionKcal(A) + ' kcal';
}

function recentSessionsHTML(n) {
  const recent = S.sessions.filter(s => s.ended).slice(-n).reverse();
  if (!recent.length) return '';
  return `<div class="divide"></div><div class="eyebrow mb-s">Recent</div><div class="list">` +
    recent.map(s => {
      const v = sessionVolume(s);
      return `<div class="lrow" data-act="view-session" data-id="${s.id}">
        <div class="ico">${s.micro?'⏱':'▲'}</div>
        <div class="grow">
          <div class="row between"><div class="h3">${typeLabel(s.type)}</div><div class="pill">${relDate(s.date)}</div></div>
          <div class="tiny mt-s">${v.sets} sets${v.tonnage?` · ${v.tonnage.toLocaleString()} ${unit()}`:''}${s.dur?` · ${Math.round(s.dur)} min`:''}</div>
        </div>
      </div>`;
    }).join('') + `</div>`;
}

/* ============================================================
   PROGRESS
   ============================================================ */
function renderProgress() {
  const st = totalStats();
  const weeks = weeksBack(8);
  const maxT = Math.max(1, ...weeks.map(w => w.tonnage));
  const maxKcal = Math.max(1, ...weeks.map(w =>
    S.sessions.filter(s => s.ended && s.date >= w.start && s.date <= w.end)
              .reduce((a,s) => a + (s.kcal != null ? s.kcal : sessionKcal(s)), 0)));
  const mv = muscleVolume(7);
  const maxM = Math.max(1, ...Object.values(mv));
  const prs = allPRs().slice(0, 8);
  const bw = S.profile.bodyweight || [];

  const jst = journeyStats();
  let html = `<div class="tiles mb">
    <div class="tile"><div class="v">${jst.day}</div><div class="k">Day</div></div>
    <div class="tile"><div class="v">${st.count}</div><div class="k">Sessions</div></div>
    <div class="tile"><div class="v">${weekStreak()}</div><div class="k">Weeks</div></div>
    <div class="tile"><div class="v" style="color:var(--ember)">${(totalKcal()/1000).toFixed(1)}k</div><div class="k">kcal</div></div>
  </div>
  ${journeyPathHTML()}`;

  html += `<div class="card mb">
    <div class="row between"><div class="eyebrow">Volume · 8 weeks</div><div class="tiny">${unit()} moved</div></div>
    <div class="chart mt">
      ${weeks.map(w => `<div class="b ${w.tonnage?'':'dim'}" style="height:${Math.max(3, Math.round(w.tonnage/maxT*100))}%" title="${w.tonnage}"></div>`).join('')}
    </div>
    <div class="chart-x">${weeks.map(w => `<span>${w.label}</span>`).join('')}</div>
    <p class="tiny mt-s">Weeks vary. That's the point — a light week during a shoot block is a successful week, not a failed one.</p>
  </div>`;

  html += `<div class="card mb">
    <div class="eyebrow">Balance · last 7 days</div>
    <div class="col gap-s mt">
      ${MUSCLES.map(m => `
        <div>
          <div class="row between"><span class="small">${m}</span><span class="tiny mono">${mv[m] % 1 === 0 ? mv[m] : mv[m].toFixed(1)} sets</span></div>
          <div class="bar thin mt-s"><i style="width:${Math.round(mv[m]/maxM*100)}%"></i></div>
        </div>`).join('')}
    </div>
  </div>`;

  if (prs.length) {
    html += `<div class="card mb">
      <div class="eyebrow mb-s">Best estimated 1RM</div>
      <div class="list">
        ${prs.map(p => `<div class="lrow">
          <div class="grow"><div class="h3">${h(p.name)}</div><div class="tiny mt-s">${fmtW(p.w)}${unit()} × ${p.r} · ${relDate(p.date)}</div></div>
          <div class="mono" style="font-weight:700;font-size:17px">${Math.round(p.e1rm)}<span class="tiny">${unit()}</span></div>
        </div>`).join('')}
      </div>
      <p class="tiny mt-s">Epley estimate. Useful as a trend line, not as a number to attempt.</p>
    </div>`;
  }

  html += `<div class="card mb">
    <div class="row between"><div class="eyebrow">Bodyweight</div><button class="btn xs ghost" data-act="log-bw">Log</button></div>
    ${bw.length > 1 ? sparkHTML(bw.map(b => b.w)) : ''}
    ${bw.length === 0 ? '<p class="small mt-s">No entries yet. Weight is noisy day to day — the trend over weeks is the only part worth reading.</p>' : ''}
    ${bw.length === 1 ? `<p class="small mt-s">One entry so far. A trend line needs a few weeks before it says anything.</p>` : ''}
    ${bw.length ? `<div class="row between mt-s"><span class="tiny">${bw.length>1?relDate(bw[0].d):'Logged'}</span><span class="tiny mono">${fmtW(bw[bw.length-1].w)}${unit()}</span></div>` : ''}
  </div>`;

  html += `<div class="card mb">
    <div class="row between"><div class="eyebrow">Energy · 8 weeks</div><div class="tiny">estimated</div></div>
    <div class="chart mt">
      ${weeks.map(w => {
        const kc = S.sessions.filter(s => s.ended && s.date >= w.start && s.date <= w.end)
                             .reduce((a,s) => a + (s.kcal != null ? s.kcal : sessionKcal(s)), 0);
        return `<div class="b ${kc?'':'dim'}" style="height:${Math.max(3, Math.round(kc / Math.max(1, maxKcal) * 100))}%"></div>`;
      }).join('')}
    </div>
    <div class="chart-x">${weeks.map(w => `<span>${w.label}</span>`).join('')}</div>
    <p class="tiny mt-s">Estimated from the MET equation using your bodyweight, the movement, and time under load plus rest. Treat it as a trend, not a calorie count.</p>
  </div>`;

  html += recentSessionsHTML(12);
  $('#progress-body').innerHTML = html;
}

/* The journey rendered as a route with markers reached and still ahead */
function journeyPathHTML() {
  const reached = milestonesReached();
  const st = journeyStats();
  const upcoming = MILESTONES.filter(m => !(S.journey && S.journey.reached && S.journey.reached[m.k])).slice(0, 2);
  return `<div class="card mb">
    <div class="row between mb-s"><div class="eyebrow">The journey</div><div class="pill em">${reached.length} of ${MILESTONES.length}</div></div>
    <p class="small">Day ${st.day}. ${reached.length ? `${reached.length} marker${reached.length===1?'':'s'} behind you.` : 'No markers yet — the first arrives with your first session.'}</p>
    <div class="jpath mt">
      ${reached.slice().reverse().map(m => `
        <div class="jnode done">
          <div class="jnode-ico">${m.ico}</div>
          <div class="grow"><div class="jnode-t">${m.title}</div><div class="jnode-d">${relDate(m.on)}</div></div>
        </div>`).join('')}
      ${upcoming.map(m => `
        <div class="jnode">
          <div class="jnode-ico">${m.ico}</div>
          <div class="grow"><div class="jnode-t">${m.title}</div><div class="jnode-d">Ahead</div></div>
        </div>`).join('')}
    </div>
  </div>`;
}

function sparkHTML(vals) {
  if (vals.length < 2) return '';
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = (max - min) || 1;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * 100;
    const y = 50 - ((v - min) / range) * 40 - 5;
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
  return `<svg class="spark mt" viewBox="0 0 100 56" preserveAspectRatio="none">
    <polyline points="${pts}" fill="none" stroke="#E9B44C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

/* ---------- keyboard and screen-reader access ----------
   Every interactive thing in this app carries data-act or data-go, and most
   of them are real <button>s — but 36 are plain <div>s. A div is not
   focusable and assistive technology does not announce it as a control, so
   those rows could only ever be reached with a pointer. On a phone that is
   invisible; with VoiceOver it makes parts of the app unusable.

   Fixed here rather than at 36 markup sites, because every screen and sheet
   is a wholesale innerHTML write and new rows get added constantly — a fix
   applied by hand would be correct on the day and wrong a month later.

   Two rules keep it honest. Natively interactive elements are left alone,
   and so is any container that already holds its own control: a suggestion
   row with a Log button inside it is not itself a button, and telling a
   screen reader otherwise would be worse than saying nothing. */
const A11Y_NATIVE = 'button,a,input,select,textarea,summary,[role="button"]';

function a11yPass(root) {
  const scope = root || document.getElementById('app');
  if (!scope) return;
  scope.querySelectorAll('[data-act],[data-go]').forEach(el => {
    if (el.matches(A11Y_NATIVE)) return;
    if (el.querySelector(A11Y_NATIVE)) return;
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
  });
}

/* Watching for new markup rather than calling a11yPass from every renderer:
   there are more than twenty of them and the next one would be forgotten.
   childList only — setting attributes must not retrigger the observer. */
function a11yWatch() {
  const app = document.getElementById('app');
  if (!app || typeof MutationObserver !== 'function') return;
  a11yPass(app);
  new MutationObserver(() => a11yPass(app))
    .observe(app, { childList: true, subtree: true });
}
