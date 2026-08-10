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

/* Which sheet is currently showing, and where each keyed sheet had been
   scrolled to. See openSheet. */
let sheetKey = null;
let sheetScroll = Object.create(null);

/* A sheet that re-renders itself must not throw you back to the top.
   ------------------------------------------------------------------
   Every sheet is a wholesale innerHTML write, and several of them redraw on
   every single tap. Building a routine is the worst case: the picker redraws
   on each exercise you add, the builder redraws on each nudge of the reps,
   and the two hand back and forth. openSheet reset scrollTop unconditionally,
   so past the third movement every single tap threw you to the top of a long
   list and you scrolled back down to make the next one.

   Pass a key and that sheet keeps its own scroll position — both when it
   redraws itself and when you come back to it from another sheet, which is
   the routine builder → picker → builder round trip. An unkeyed sheet, or a
   key never seen before, still starts at the top; that is what you want when
   the content is genuinely new.

   The positions are remembered only for as long as the sheet stack is open.
   Closing it clears them, so reopening the same builder tomorrow starts at
   the top rather than somewhere you left off in a session you have
   forgotten. */
function openSheet(html, opts) {
  opts = opts || {};
  const sh = $('#sheet');
  const nextKey = opts.key != null ? opts.key : null;
  /* Record where the outgoing sheet was before its markup is replaced —
     afterwards scrollTop has already been clamped by the new content. */
  if (sheetKey != null) sheetScroll[sheetKey] = sh.scrollTop;
  $('#sheet-body').innerHTML = html;
  a11yPass($('#sheet-body'));   // synchronous, for the same reason as in go()
  sh.style.transform = '';
  sh.classList.add('on');
  $('#scrim').classList.add('on');
  sheetKey = nextKey;
  sh.scrollTop = (nextKey != null && sheetScroll[nextKey] != null) ? sheetScroll[nextKey] : 0;
  if (!sheetOpen) {
    sheetOpen = true;
    sheetDepth++;
    try { history.pushState({ ftSheet: sheetDepth }, ''); } catch (e) {}
  }
}

function closeSheet(fromHistory) {
  sheetKey = null;
  sheetScroll = Object.create(null);
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
/* Which sky the app is under.
   Wall clock, deliberately — profile.dayStart moves where your *day* ends, and
   it does not move sunrise. At 2am with the boundary at 4am the app correctly
   says it is still Sunday, and just as correctly draws a night sky. */
function skyBand() {
  const hr = new Date().getHours();
  if (hr >= 5 && hr < 9) return 'dawn';
  if (hr >= 9 && hr < 17) return 'day';
  if (hr >= 17 && hr < 21) return 'dusk';
  return 'night';
}

function syncSky() {
  const el = document.documentElement;
  const band = skyBand();
  if (el.getAttribute('data-sky') !== band) el.setAttribute('data-sky', band);
}

function go(name) {
  SCREEN = name;
  /* Leaving a screen and coming back lands on this week. "This week" on a
     dashboard has to mean this week, not wherever you last browsed to. */
  stripOffset = 0;
  syncSky();
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
  enterScreen(el);
}

/* Restart the arrival animation for one screen.
   The class has to come off and go back on with a reflow between, or the
   browser sees no change and the animation never replays — which is what makes
   navigating back to a screen you have already visited feel dead. Cleared on a
   timer rather than animationend, because animationend fires once per child
   and the last one is not guaranteed to be the longest. */
let enterTimer = null;
function enterScreen(el) {
  if (!el) return;
  el.classList.remove('entering');
  void el.offsetWidth;
  el.classList.add('entering');
  clearTimeout(enterTimer);
  enterTimer = setTimeout(() => el.classList.remove('entering'), 700);
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
      ${/* Past midnight on the wall clock, still yesterday here. Said out loud,
            because a date that looks a day behind is indistinguishable from a
            bug unless the app explains itself. */
        inLateWindow() ? `<button class="home-late" data-act="day-start">Still ${DAYNAMES[fromKey(today()).getDay()]} until ${dayStartHour()}am</button>` : ''}
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
        <div class="row between"><span class="hero-eyebrow"><span class="live-dot"></span>${S.active.backdated ? 'Logging ' + h(prettyDate(S.active.date)) : 'In progress'}</span><span class="pill em">${doneSets}/${allSets} sets</span></div>
        <h1 class="hero-title">${S.active.backdated ? 'A day you already did' : h(sessionTitle(S.active))}</h1>
        <div class="bar mt"><i style="width:${pct}%"></i></div>
        <button class="btn primary block lg mt" data-act="goto-train">${S.active.backdated ? 'Back to it' : 'Back to the session'}</button>
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
        <button class="btn quiet block mt-s" data-act="start-session" data-type="recovery" data-rung="trim">Or stretch for ten minutes</button>
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
  } else if (plan && plan.type === 'recovery' && !plan.routineId) {
    /* Its own hero rather than a case inside the training one. The size ladder
       and the readiness prompt both exist to answer "how hard should today
       be", and on a recovery day that question does not apply — offering it
       would quietly reframe stretching as a workout you are allowed to
       shorten. */
    const preview = recoverySession(c.env || (S.profile.envs && S.profile.envs[0]) || 'full', 'full');
    html += `<div class="hero">
      <div class="hero-glow"></div>
      <div class="hero-in">
        <div class="row between">
          <span class="hero-eyebrow">Today</span>
          <span class="pill em">${ENVS[c.env] ? ENVS[c.env].short : 'Gym'}</span>
        </div>
        <h1 class="hero-title">Recovery</h1>
        <div class="hero-meta">
          <span class="hm"><span class="hm-v">${preview ? preview.planMins : 12} min</span><span class="hm-k">planned</span></span>
          <span class="hm-div"></span>
          <span class="hm"><span class="hm-v">${preview ? preview.exercises.length : 0} moves</span><span class="hm-k">mobility</span></span>
        </div>
        <p class="hero-sub">Stretching and light joint work, spread across wherever has gone longest. Nothing is loaded and there is no target to beat &mdash; finishing it marks today done, the same as any other session.</p>
        <button class="btn primary block lg mt" data-act="start-session" data-type="recovery" data-rung="full">Start</button>
        <button class="btn quiet block" data-act="start-session" data-type="recovery" data-rung="short">Shorter &mdash; four movements</button>
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
  html += weekStripHTML('<button class="sec-a" data-act="open-week">Shape it</button>');

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

/* Which week the strip is showing. 0 is this one.
   ------------------------------------------------
   Deliberately separate from `weekOffset`, which is the segmented control
   inside the week sheet: browsing the dashboard back to last month should not
   silently rearm "Save next week" behind a sheet you are not looking at.

   Reset in go(), so leaving the screen and coming back lands on this week —
   which is what "this week" on a dashboard has to mean. */
let stripOffset = 0;

/* How far back there is anything to look at. Plans are not kept — S.week holds
   exactly one week and is rebuilt when its start key changes — so a past week
   can only ever show what was actually logged. Bounded by the first session
   rather than a fixed number of weeks, so a new profile has nowhere to go and
   an old one has everywhere. */
function stripRange() {
  const dates = S.sessions.filter(s => s.ended).map(s => s.date).sort();
  const earliest = dates[0] || (S.meta && S.meta.created) || today();
  const backWeeks = Math.max(0, Math.ceil(daysBetween(dk(weekStart(fromKey(earliest))), dk(weekStart())) / 7));
  return { min: -Math.min(backWeeks, 52), max: 1 };
}

function stripLabel(offset, ws) {
  if (offset === 0) return 'This week';
  if (offset === 1) return 'Next week';
  if (offset === -1) return 'Last week';
  const d = fromKey(dk(ws));
  return 'Week of ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
}

const NAV_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 19l-7-7 7-7"/></svg>';
const NAV_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>';

/* The header is part of the component rather than the screen, because the
   label and the arrows have to agree with the row of days underneath them —
   two screens each rendering their own version of that is two places for them
   to disagree. `extra` is whatever that screen wants on the right. */
function weekStripHTML(extra) {
  const off = stripOffset;
  const range = stripRange();
  const ws = addDays(weekStart(), off * 7);
  const plan = off === 0 ? buildWeekPlan() : {};

  const arrow = (d, svg, label) => {
    const to = off + d;
    const off_ = to < range.min || to > range.max;
    return `<button class="wk-nav${off_ ? ' is-off' : ''}" data-act="strip-week" data-d="${d}"
      aria-label="${label}"${off_ ? ' disabled' : ''}>${svg}</button>`;
  };

  let html = `<div class="sec-head">
    <span class="wk-head">
      ${arrow(-1, NAV_L, 'Previous week')}
      <span class="sec-t">${h(stripLabel(off, ws))}</span>
      ${arrow(1, NAV_R, 'Next week')}
    </span>
    ${extra || ''}
  </div>`;

  /* A class, not an id. Today and Plan both render a strip and screens are
     hidden rather than removed, so an id here would be in the document twice
     — invalid, and every lookup would find whichever screen rendered first. */
  html += '<div class="week">';
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    const k = dk(d);
    const c = dayConstraint(k);
    const p = plan[k];
    const day = daySessions(k);
    const done = day.main;
    const isToday = k === today();
    const past = daysBetween(k, today()) > 0;
    let cls = 'day';
    if (isToday) cls += ' today';
    if (done) cls += ' done';
    else if (c.avail === 'none') cls += ' rest';
    else if (p && past) cls += ' miss';
    const shortType = t => t === 'micro' ? '3 min' : typeLabel(t).split(' ')[0];
    let sub = '';
    if (done) sub = (done.routineName ? done.routineName.split(' ')[0] : shortType(done.type)) +
                    (day.extras ? ' +' + day.extras : '');
    else if (p && p.elsewhere) sub = planShortLabel(p);
    else if (c.avail === 'none') sub = 'Off';
    else if (p && past) sub = '—';
    else if (p) sub = planShortLabel(p);
    /* Beyond this week there is no plan to show and inventing one would be a
       promise the app has not made yet — so a future day states the only thing
       that is actually true about it, which is how much time you expect. */
    else if (past) sub = '—';
    else sub = availOf(c.avail).label;
    if (p && p.elsewhere) cls += ' done';
    html += `<div class="${cls}" data-act="day-tap" data-k="${k}">
      <div class="dn">${DAYNAMES[d.getDay()].toUpperCase()}</div>
      <div class="dd">${d.getDate()}</div>
      <div class="dt">${h(sub)}</div>
    </div>`;
  }
  html += '</div>';
  if (off > 0) html += `<p class="tiny mt-s">Sessions are laid out when the week starts. What you set here is the time you expect to have.</p>`;
  if (off < 0) html += `<p class="tiny mt-s">A week that has gone. Tap a day to see what you logged, or add something you did.</p>`;
  return html;
}

/* Swipe the strip sideways, as well as the arrows.
   ------------------------------------------------
   Delegated on document rather than bound to the element, because the strip is
   destroyed and rebuilt by every render — a listener attached to the node
   would be attached to a node that no longer exists after the first swipe.

   Horizontal intent only: the strip sits inside a scrolling screen, so a
   gesture that has travelled further vertically than horizontally is someone
   scrolling past it, and stealing that would make the dashboard feel broken.
   The CSS says touch-action:pan-y for the same reason. */
(function weekSwipe() {
  let x0 = null, y0 = null, t0 = 0, scroll0 = 0, on = false;
  const SLOP = 44;
  const scroller = () => document.getElementById('s-' + SCREEN);

  document.addEventListener('touchstart', e => {
    on = !!(e.target.closest && e.target.closest('.week'));
    if (!on) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    t0 = Date.now();
    const sc = scroller();
    scroll0 = sc ? sc.scrollTop : 0;
  }, { passive: true });

  document.addEventListener('touchend', e => {
    const wasOn = on; on = false;
    const t = e.changedTouches && e.changedTouches[0];
    const sx = x0, sy = y0, st = t0, s0 = scroll0;
    x0 = y0 = null;
    if (!wasOn || sx == null || !t) return;

    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < SLOP || Math.abs(dx) <= Math.abs(dy)) return;
    /* A gesture that scrolled the screen was a scroll, whatever its shape. The
       geometry check alone lets a fast diagonal flick through, and the render
       it triggers replaces the whole screen's markup while the browser is
       still painting the scroll. */
    const sc = scroller();
    if (sc && Math.abs(sc.scrollTop - s0) > 4) return;
    /* And a slow drag is someone holding the screen, not swiping it. */
    if (Date.now() - st > 700) return;

    /* Deferred a frame so the re-render never lands inside the browser's own
       touch-end paint. */
    const dir = dx < 0 ? 1 : -1;   // drag left, move forward
    requestAnimationFrame(() => stepStripWeek(dir));
  }, { passive: true });
})();

/* One place that moves the strip, so the arrows and the swipe cannot disagree
   about the bounds. Returns whether it actually moved. */
function stepStripWeek(d) {
  const r = stripRange();
  const to = stripOffset + d;
  if (to < r.min || to > r.max) return false;
  stripOffset = to;
  render();
  buzz();
  return true;
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

  html += weekStripHTML();

  /* The list under the strip has to be the same week as the strip. Two
     controls on one screen disagreeing about which week you are looking at is
     worse than not being able to move at all. */
  const sws = addDays(weekStart(), stripOffset * 7);
  const splan = stripOffset === 0 ? plan : {};
  html += `<div class="list mt-l">`;
  for (let i = 0; i < 7; i++) {
    const d = addDays(sws, i);
    const k = dk(d);
    const c = dayConstraint(k);
    const p = splan[k];
    const day = daySessions(k);
    const done = day.main;
    const past = daysBetween(k, today()) > 0;
    let sub;
    if (done) sub = 'Logged · ' + (done.routineName || typeLabel(done.type)) +
                    (day.extras ? ' + ' + day.extras + ' more' : '');
    else if (p && p.elsewhere) sub = 'Trained elsewhere';
    else if (p) sub = typeLabel(p.type) + ' · ' + (ENVS[c.env] ? ENVS[c.env].label : '');
    else if (c.avail === 'none') sub = 'Off the route';
    else if (past) sub = 'Nothing logged';
    else if (stripOffset > 0) sub = availOf(c.avail).label + ' · ' + availOf(c.avail).mins + ' min expected';
    else sub = 'Open';
    html += `<div class="lrow" data-act="day-tap" data-k="${k}">
      <div class="ico">${done ? '✓' : c.avail === 'none' ? '·' : p ? '▲' : '–'}</div>
      <div class="grow">
        <div class="row between">
          <div class="h3">${prettyDate(k)}${k===today()?' <span class="pill em">today</span>':''}</div>
          <div class="pill">${availOf(c.avail).label}</div>
        </div>
        <div class="tiny mt-s">${h(sub)}</div>
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
      <div class="eyebrow em">${A.backdated ? h(prettyDate(A.date)) : (RUNGS.find(r=>r.k===A.rung) ? RUNGS.find(r=>r.k===A.rung).label : '')}</div>
      <h1 class="h1 mt-s">${A.backdated ? 'Logging a past day' : typeLabel(A.type)}</h1>
    </div>
  </div>
  ${/* One flat bar told you how much of the session was left and nothing about
        where you were in it. The rail is a segment per movement, filling as its
        sets are ticked — the session as ground to cover, which is what the rest
        of the app already says it is. Tapping a segment goes to that movement. */''}
  <div class="card tight mb">
    ${trainRailHTML(A)}
    <div class="row between mt-s">
      <span class="small" id="tp-where">${h(trainWhere(A))}</span>
      <span class="row gap-s"><span class="small mono" id="tp-count">${doneSets}/${allSets}</span>
      <span class="small mono em" id="tp-kcal">${sessionKcal(A)} kcal</span>
      <!-- A running clock on a session you are typing in after the fact would
           be measuring the wrong thing entirely. -->
      <span class="small mono" id="tp-time">${A.backdated ? sessionMinsEstimate(A) : elapsed} min</span></span>
    </div>
  </div>`;

  if (A.backdated) {
    html += `<div class="banner soft mb"><strong>This is going on ${h(prettyDate(A.date))}, not today.</strong> Add what you did, tick the sets off, and finish. The length is worked out from the work rather than the clock.</div>`;
  }

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

  if (A.circuit) {
    /* The warm-up still renders as an ordinary card above the circuit — it is
       one movement done once, before any of this starts. */
    A.exercises.forEach((item, ei) => { if (item.warmup) html += exCardHTML(item, ei); });
    html += circuitHTML(A);
  } else {
    /* A heading whenever the block changes, walking the list in the order it
       is already in — the generator puts the warm-up first and the finisher
       last, so grouping consecutive runs is enough and nothing gets reordered
       under someone mid-session. */
    let block = null;
    sessionOrder(A).forEach(ei => {
      const item = A.exercises[ei];
      const sup = supFor(ei);
      const b = exBlock(item);
      if (b !== block) {
        block = b;
        const [label, hint] = BLOCK_LABEL[b] || [b, ''];
        /* One block is not a structure. A session that is all one thing gets
           no heading at all rather than a heading over everything. */
        if (A.exercises.some(x => exBlock(x) !== b)) {
          html += `<div class="sec-head blk"><span class="sec-t">${h(label)}</span>${
            hint ? `<span class="tiny">${h(hint)}</span>` : ''}</div>`;
        }
      }
      /* The pair's own heading, inside whatever block it sits in. It states
         the rule, because "superset" on its own is a word not an instruction. */
      if (sup && sup.pos === 0) {
        html += `<div class="sup-head"><span class="sup-tag">Superset ${h(sup.name)}</span>
          <span class="sup-note">straight through &mdash; rest after ${h(String.fromCharCode(64 + sup.size))}</span></div>`;
      }
      html += exCardHTML(item, ei);
    });
  }

  html += `
    ${A.circuit ? '' : '<button class="btn ghost block mt" data-act="add-exercise">+ Add an exercise</button>'}
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

/* ============================================================
   THE CIRCUIT RUNNER
   ------------------------------------------------------------
   What this is for, in the words it was asked in: "I work each exercise once
   for the duration or reps and move to the next like a superset, and then do
   the whole routine in 3 sets."

   That is a circuit, and the ordinary Train screen is the wrong shape for it.
   A list of six cards with three set rows each is eighteen checkboxes to hunt
   for while you are moving continuously — the screen assumes you stop between
   sets, which in a circuit you specifically do not.

   So a circuit renders as one movement at a time, in the order you do them,
   with the round you are on and what is coming next. The underlying session is
   unchanged — the same exercises with the same sets — so volume, energy,
   progression and the history all work on it without knowing.

   Where you are is derived from which sets are ticked rather than stored: set
   `r` of exercise `i` is round r. That survives a reload, a crash and leaving
   the session half-done, and there is no second copy of the truth to go stale. */
function circuitPos(A) {
  const list = circuitItems(A);
  const rounds = Math.max(1, A.rounds || 1);
  for (let r = 0; r < rounds; r++) {
    for (let n = 0; n < list.length; n++) {
      const st = A.exercises[list[n]].sets[r];
      if (!st || !st.done) return { round: r, n, ei: list[n], finished: false };
    }
  }
  return { round: rounds - 1, n: list.length - 1, ei: list[list.length - 1], finished: true };
}

/* The circuit is everything except the warm-up, which is one movement done
   once before any of it starts. */
function circuitItems(A) {
  return A.exercises.map((it, i) => (it.warmup ? -1 : i)).filter(i => i >= 0);
}

function circuitDoneCount(A) {
  return circuitItems(A).reduce((a, i) => a + A.exercises[i].sets.filter(s => s.done).length, 0);
}

function circuitEntryHTML(A, item, ei, round, cls) {
  const isTime = item.load === 'time' || item.load === 'min';
  const amount = item.targetR + (item.load === 'min' ? ' min' : isTime ? 's' : ' reps');
  const st = item.sets[round];
  return `<div class="circ-row ${cls}${st && st.done ? ' is-done' : ''}">
    <div class="circ-dot">${st && st.done
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>'
      : ''}</div>
    <div class="grow"><div class="circ-row-n">${h(item.name)}</div></div>
    <div class="circ-row-a mono">${h(amount)}</div>
  </div>`;
}

function circuitHTML(A) {
  const list = circuitItems(A);
  if (!list.length) return '<div class="note"><p class="note-t">Nothing in this circuit.</p></div>';
  const rounds = Math.max(1, A.rounds || 1);
  const pos = circuitPos(A);
  const item = A.exercises[pos.ei];
  const isTime = item.load === 'time' || item.load === 'min';
  const secs = item.load === 'min' ? item.targetR * 60 : item.targetR;
  const nextN = pos.n + 1 < list.length ? list[pos.n + 1] : null;
  const lastOfRound = pos.n === list.length - 1;
  const doneAll = circuitDoneCount(A);
  const totalAll = list.length * rounds;

  if (pos.finished) {
    return `<div class="circ">
      <div class="circ-top"><span class="circ-round">Circuit done</span></div>
      <div class="circ-now">
        <div class="circ-name">All ${rounds} round${rounds === 1 ? '' : 's'}</div>
        <div class="circ-amt mono">${doneAll} of ${totalAll}</div>
        <p class="small mt">Everything is ticked. Finish the session below, or add another round from the list.</p>
      </div>
      ${circuitListHTML(A, pos, rounds)}
    </div>`;
  }

  return `<div class="circ">
    <div class="circ-top">
      <span class="circ-round">Round ${pos.round + 1} of ${rounds}</span>
      <span class="circ-count mono">${pos.n + 1}/${list.length}</span>
    </div>

    <div class="circ-now">
      <div class="circ-eyebrow">Now</div>
      <div class="circ-name">${h(item.name)}</div>
      <div class="circ-amt mono">${item.targetR}${item.load === 'min' ? ' min' : isTime ? 's' : ''}${isTime ? '' : ' reps'}${item.targetW != null && item.targetW !== '' ? ' · ' + fmtW(item.targetW) + unit() : ''}</div>

      ${isTime
        ? `<button class="btn primary block lg mt" data-act="circ-start" data-i="${pos.ei}" data-s="${pos.round}">Start ${secs}s</button>
           <button class="btn quiet block" data-act="circ-done" data-i="${pos.ei}" data-s="${pos.round}">Mark it done instead</button>`
        : `<button class="btn primary block lg mt" data-act="circ-done" data-i="${pos.ei}" data-s="${pos.round}">Done &mdash; next</button>`}

      <div class="circ-next">${nextN != null
        ? 'Next: <strong>' + h(A.exercises[nextN].name) + '</strong>, straight on'
        : (pos.round + 1 < rounds
            ? 'Last one &mdash; then ' + (A.restRound ? fmtRest(A.restRound) + ' rest' : 'straight into round ' + (pos.round + 2))
            : 'Last one of the whole circuit')}</div>
    </div>

    ${circuitListHTML(A, pos, rounds)}

    ${doneAll ? `<button class="btn quiet block mt-s" data-act="circ-undo">Undo the last one</button>` : ''}
  </div>`;
}

function fmtRest(s) {
  if (s >= 60 && s % 60 === 0) return (s / 60) + ' min';
  if (s > 60) return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
  return s + 's';
}

function circuitListHTML(A, pos, rounds) {
  const list = circuitItems(A);
  return `<div class="circ-list">
    <div class="circ-list-h">
      <span class="eyebrow">The circuit</span>
      <span class="circ-pips">${Array.from({ length: rounds }, (_, r) =>
        `<span class="circ-pip${r < pos.round || (pos.finished && r === rounds - 1) ? ' full' : r === pos.round ? ' on' : ''}"></span>`).join('')}</span>
    </div>
    ${list.map((ei, n) => circuitEntryHTML(A, A.exercises[ei], ei, pos.round,
      n === pos.n && !pos.finished ? 'is-now' : '')).join('')}
  </div>`;
}

/* ============================================================
   SESSION BLOCKS
   ------------------------------------------------------------
   A written programme does not list twelve movements in a column — it groups
   them, and the group tells you how to treat what is in it. Warm-up. Main
   lifts. Accessories. Core. Finisher. You read the heading and you know
   whether to rest three minutes or sixty seconds before you have read the
   exercise.

   Derived rather than stored. Sessions already carry everything needed —
   `warmup` and `cardio` flags, the recovery marker, and the catalogue's tier
   and pattern — so nothing has to migrate and a session logged last year still
   groups correctly when you open it.
   ============================================================ */
function exBlock(item) {
  if (!item) return 'main';
  if (item.warmup) return 'warmup';
  if (item.recovery) return 'recovery';
  if (item.cardio) return 'finisher';
  const ex = EX[item.exId] || {};
  if (ex.pattern === 'mobility') return 'warmup';
  if (ex.pattern === 'cardio') return 'finisher';
  if (ex.pattern === 'core' || ex.pattern === 'carry') return 'core';
  /* Tier is the app's own word for "how much does this ask of you", which is
     the same question that decides whether something is a main lift. */
  return (ex.tier <= 2) ? 'main' : 'accessory';
}

const BLOCK_LABEL = {
  warmup:    ['Warm-up', 'before you start'],
  main:      ['Main lifts', 'heavy, long rests'],
  accessory: ['Accessories', 'volume, shorter rests'],
  core:      ['Core', ''],
  finisher:  ['Finisher', ''],
  recovery:  ['Mobility', 'nothing to beat']
};
const BLOCK_RANK = { warmup: 0, recovery: 0, main: 1, accessory: 2, core: 3, finisher: 4 };

/* The order the session is shown in, as a list of indices into A.exercises.
   ------------------------------------------------------------------------
   Grouping by walking the array and starting a heading whenever the block
   changed produced "Core … Accessories … Core" the moment anything was out of
   order — which happens as soon as you add a movement mid-session, because it
   lands at the end of the array. So the display order *is* the block order.

   Indices rather than a reordered copy: every handler addresses an exercise by
   its real position in A.exercises, and a reordered copy would silently point
   `toggle-set` at the wrong movement. Stable inside a block, so nothing the
   generator decided about sequencing is lost. */
function sessionOrder(A) {
  const list = (A && A.exercises) || [];
  /* Superset groups move as one. A pair whose two movements sit in different
     blocks — a tier-2 press supersetted with a tier-3 raise — would otherwise
     be pulled apart by the sort, which is the one thing a superset cannot
     survive. The group's first movement decides where the group goes. */
  const groups = [];
  let i = 0;
  while (i < list.length) {
    const run = [i];
    let last = i;
    while (list[last] && list[last].supNext && last + 1 < list.length) { run.push(++last); }
    groups.push(run);
    i = last + 1;
  }
  groups.sort((a, b) => {
    const ra = BLOCK_RANK[exBlock(list[a[0]])], rb = BLOCK_RANK[exBlock(list[b[0]])];
    return ra === rb ? a[0] - b[0] : ra - rb;
  });
  return groups.reduce((acc, g) => acc.concat(g), []);
}

/* The superset a card belongs to, if any. Computed here rather than passed in,
   so exCardHTML() and replaceExCard() can never disagree about it. */
function supFor(ei) {
  const A = S.active;
  if (!A) return null;
  const g = supersetAt(A.exercises, ei);
  if (!g) return null;
  return { letter: g.letter, pos: g.pos, size: g.run.length,
           name: supersetName(A.exercises, ei) };
}

/* The session drawn as ground to cover: one segment per movement, filling as
   its sets are ticked. Where you are is derived from the sets rather than
   stored, the same as the circuit runner — the first movement that is not
   finished is the one you are on. */
function trainRailHTML(A) {
  /* Same order as the cards — a rail that disagrees with the list under it is
     worse than no rail. */
  const order = sessionOrder(A);
  const cur = order.find(i => !isComplete(A.exercises[i]));
  /* A break wherever the block changes, so the rail reads as stages of a route
     rather than one undifferentiated bar — the same structure the headings
     below it already describe. Decorative, and therefore hidden from the
     accessibility tree and never counted as a segment. */
  let block = null;
  return `<div class="rail">
    ${order.map(i => {
      const it = A.exercises[i];
      const b = exBlock(it);
      const brk = (block !== null && b !== block) ? '<span class="rail-brk" aria-hidden="true"></span>' : '';
      block = b;
      const done = it.sets.filter(s => s.done).length;
      const all = it.sets.length || 1;
      const state = isComplete(it) ? 'done' : (i === cur ? 'now' : '');
      return brk + `<button class="rail-seg ${state}" data-act="rail-go" data-i="${i}"
        aria-label="${h(it.name)}, ${done} of ${all} sets"><i style="width:${Math.round(done / all * 100)}%"></i></button>`;
    }).join('')}
  </div>`;
}

/* "Back Squat · 2 of 6" — the movement you are on and where it sits, which is
   the question the old "1 of 14 sets" could not answer. */
function trainWhere(A) {
  const order = sessionOrder(A);
  if (!order.length) return 'Nothing added yet';
  const at = order.findIndex(i => !isComplete(A.exercises[i]));
  if (at < 0) return 'Everything ticked';
  return A.exercises[order[at]].name + ' · ' + (at + 1) + ' of ' + order.length;
}

/* One copy of the star. It is drawn from three places — the card, the tick
   handler and the re-check below — and three copies of a path drift. */
const PR_STAR = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6l2.7 5.9 6.4.7-4.8 4.3 1.3 6.3L12 16.6l-5.6 3.2 1.3-6.3-4.8-4.3 6.4-.7z"/></svg>';

/* Paint a row as a record, or as an ordinary numbered set. */
function paintPR(row, si, isRecord) {
  if (!row) return;
  row.classList.toggle('pr', !!isRecord);
  const sn = row.querySelector('.sn');
  if (!sn) return;
  if (isRecord) {
    sn.setAttribute('role', 'img');
    sn.setAttribute('aria-label', 'Personal best, set ' + (si + 1));
    sn.innerHTML = PR_STAR;
  } else {
    sn.removeAttribute('role');
    sn.removeAttribute('aria-label');
    sn.textContent = String(si + 1);
  }
}

/* A set edited after it was ticked has to re-decide whether it is still a
   record. Tick an untouched row at the offered 120, notice it was really 40,
   correct it — and without this the star stays on a set that never earned it,
   and the finish sheet reports a best you did not hit. */
function refreshPR(ei, si) {
  if (!S.active) return;
  const item = S.active.exercises[ei];
  if (!item || !item.sets[si] || !item.sets[si].done) return;
  const st = item.sets[si];
  const was = !!st.pr;
  st.pr = isPR(item, st);
  if (st.pr === was) return;
  const row = document.querySelectorAll('.ex-card[data-ei="' + ei + '"] .set-row')[si];
  paintPR(row, si, st.pr);
}

/* What you beat, on the screen that exists to say what you did. The stars sat
   on the rows during the session and would otherwise be the only record of it
   — a personal best is the thing you tell someone about, and finding it should
   not mean scrolling back through a session you have already finished. */
function sessionPRsHTML(A) {
  const hits = [];
  (A.exercises || []).forEach(x => {
    const best = (x.sets || []).filter(s => s.done && s.pr)
      .sort((a, b) => e1rm(+b.w || 0, +b.r || 0) - e1rm(+a.w || 0, +a.r || 0))[0];
    if (best) hits.push({ name: x.name, w: best.w, r: best.r });
  });
  if (!hits.length) return '';
  return `<div class="prs mb">
    <div class="prs-h">${PR_STAR}<span>${hits.length === 1
      ? 'A personal best' : hits.length + ' personal bests'}</span></div>
    ${hits.map(p => `<div class="prs-row">
      <span class="grow">${h(p.name)}</span>
      <span class="mono">${+p.w > 0 ? fmtW(+p.w) + unit() + ' &times; ' : ''}${h(String(p.r))}</span>
    </div>`).join('')}
  </div>`;
}

/* What the rest is for — the set you will do when it runs out.
   ------------------------------------------------------------
   A countdown on its own is time passing. Naming what is on the other side of
   it is what turns the wait into part of the session, and it is the one thing
   you want to know while you are standing there.

   Derived from what is ticked rather than stored, the same as the rail and the
   circuit runner: the first unfinished set in display order is the next one.
   Returns escaped HTML because the movement name goes in bold. */
function nextUpHTML(A) {
  if (!A) return '';
  if (A.circuit) {
    const pos = circuitPos(A);
    if (pos.finished) return '';
    const it = A.exercises[pos.ei];
    if (!it) return '';
    return `Next &middot; <b>${h(it.name)}</b>, round ${pos.round + 1} of ${Math.max(1, A.rounds || 1)}`;
  }
  const order = sessionOrder(A);
  for (const i of order) {
    const it = A.exercises[i];
    if (!it || !it.sets) continue;
    const si = it.sets.findIndex(s => !s.done);
    if (si < 0) continue;
    return `Next &middot; <b>${h(it.name)}</b>, set ${si + 1} of ${it.sets.length}`;
  }
  return 'Nothing left — finish when you are ready';
}

/* The badges for one movement, or nothing at all. Deliberately capped: a row
   of six labels under every exercise is decoration, and the point of a badge is
   that it is worth reading. */
function badgeRowHTML(item, max) {
  const list = exBadges(item).slice(0, max || 3);
  if (!list.length) return '';
  return `<div class="badges">${list.map(b =>
    `<span class="badge ${BADGE_TONE[b] || 'plain'}">${h(b)}</span>`).join('')}</div>`;
}

function exCardHTML(item, ei) {
  const ex = EX[item.exId] || { name:item.name, primary:'', sec:[], load:'wt', rl:8, rh:12 };
  const complete = isComplete(item);
  const collapsed = item.collapsed;
  const sup = supFor(ei);
  /* Inside a superset the position in the session stops being the useful
     number — which of the pair you are on is. */
  const num = sup ? sup.letter : String(ei + 1).padStart(2, '0');

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
  /* Fetched once for the whole card. ghostFor() will look it up itself if you
     don't hand it over, and a four-set card would then walk the entire session
     history four times inside the render path. */
  const prev = prevSets(item.exId);
  const rpeOn = rpeShown();

  return `<div class="ex-card" data-ei="${ei}">
    <div class="ex-head">
      <button class="ex-num-btn" data-act="toggle-collapse" data-i="${ei}">
        <div class="ex-num ${complete?'ok':''}">${complete ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>' : num}</div>
      </button>
      <button class="grow ex-title" data-act="toggle-collapse" data-i="${ei}">
        <div class="ex-name">${h(item.name)}</div>
        <div class="ex-meta">${h(ex.primary)}${ex.sec && ex.sec.length ? ' · ' + h(ex.sec.join(', ')) : ''}</div>
        ${badgeRowHTML(item)}
      </button>
      ${/* One control, not three. A form guide, a swap and a menu on every card
            made the header a toolbar with an exercise name in it — and the
            amber help button pulled the eye harder than the movement you were
            about to do. All three live in the menu now: form is something you
            read once, swapping is occasional, and the card is about the
            exercise again. */''}
      <button class="ex-more" data-act="ex-menu" data-i="${ei}" aria-label="Options for ${h(item.name)}">
        <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>
      </button>
    </div>
    <div class="ex-body">
      ${item.targetR ? `<div class="ex-target"><span>Target</span> <strong>${item.targetW != null && item.targetW !== '' ? fmtW(item.targetW) + unit() + ' × ' : ''}${item.targetR}${isTime?'s':''}</strong>${item.deloaded ? '<span class="ex-target-sub">−10%</span>' : ''}${exerciseKcal(item) ? `<span class="ex-kcal">${exerciseKcal(item)} kcal</span>` : ''}</div>` : ''}
      ${recallRowHTML(item)}
      ${/* The column header is gone. Four uppercase labels repeated above every
            exercise was a spreadsheet header on a screen you use one-handed
            between sets; the unit now sits inside the field it belongs to,
            which says the same thing once and in the place you are looking. */''}
      ${item.sets.map((st, si) => {
        /* The row says what it will record. See ghostFor() — the placeholder
           and the value `toggle-set` writes come from the same call, because
           a row that offers one weight and logs another is worse than a row
           that offers nothing. */
        const g = ghostFor(item, si, prev);
        return `
        <div class="set-row ${st.done?'done':''}${st.pr?' pr':''}${rpeOn?'':' norpe'}">
          ${/* A filled star rather than a glyph or an outline: hairline marks
                at this size antialias to about half the contrast their colour
                promises, pass a CSS reading and fail the pixel check. The
                label rides on the element rather than on hidden text, which
                would be one more box for the collision sweep to trip over. */''}
          ${st.pr
            ? `<div class="sn" role="img" aria-label="Personal best, set ${si+1}">${PR_STAR}</div>`
            : `<div class="sn">${si+1}</div>`}
          <label class="set-f">
            <input class="set-in" type="text" inputmode="decimal" enterkeyhint="next" autocomplete="off" aria-label="Weight, set ${si+1}" placeholder="${h(ghostW(item, g))}" value="${st.w===''?'':h(st.w)}" data-set="w" data-i="${ei}" data-s="${si}">
            <span class="set-u">${item.load==='bw' ? '+' + unit() : unit()}</span>
          </label>
          <label class="set-f">
            <input class="set-in" type="text" inputmode="numeric" enterkeyhint="next" autocomplete="off" aria-label="${unitLbl==='REPS'?'Reps':unitLbl==='SECS'?'Seconds':'Minutes'}, set ${si+1}" placeholder="${h(g.r === '' ? '' : String(g.r))}" value="${st.r===''?'':h(st.r)}" data-set="r" data-i="${ei}" data-s="${si}">
            <span class="set-u">${unitLbl==='REPS'?'reps':unitLbl==='SECS'?'sec':'min'}</span>
          </label>
          ${rpeOn ? `<label class="set-f narrow">
            <input class="set-in" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" aria-label="RPE, set ${si+1}" placeholder="–" value="${st.rpe===''?'':h(st.rpe)}" data-set="rpe" data-i="${ei}" data-s="${si}">
            <span class="set-u">rpe</span>
          </label>` : ''}
          <button class="tick ${st.done?'on':''}" data-act="toggle-set" data-i="${ei}" data-s="${si}" aria-label="${st.done?'Undo set':'Mark set'} ${si+1} ${st.done?'':'done'}" aria-pressed="${st.done?'true':'false'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>
          </button>
        </div>`; }).join('')}
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

/* The rows under set 1 show what set 1 says, as soon as it says it. Updated
   in place for the same reason the plate row is: the keyboard is open and the
   caret is sitting in the field you are typing into. */
function refreshGhosts(ei) {
  if (!S.active) return;
  const item = S.active.exercises[ei];
  const card = document.querySelector('.ex-card[data-ei="' + ei + '"]');
  if (!item || !card) return;
  const prev = prevSets(item.exId);
  card.querySelectorAll('.set-row').forEach((row, si) => {
    if (!item.sets[si]) return;
    const g = ghostFor(item, si, prev);
    const wi = row.querySelector('[data-set="w"]');
    const ri = row.querySelector('[data-set="r"]');
    if (wi) wi.placeholder = ghostW(item, g);
    if (ri) ri.placeholder = g.r === '' ? '' : String(g.r);
  });
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
  const t = document.getElementById('tp-time');
  if (c) c.textContent = done + '/' + all;
  /* Updated in place, never by re-rendering: a full re-render mid-session
     closes the keyboard and loses your place, which is the whole reason this
     function exists. */
  const w = document.getElementById('tp-where');
  if (w) w.textContent = trainWhere(A);
  const rail = document.querySelector('#train-body .rail');
  if (rail) {
    const order = sessionOrder(A);
    const cur = order.find(i => !isComplete(A.exercises[i]));
    /* .rail-seg, not children: the rail also holds decorative block breaks,
       and walking every child would map segment N onto order[N + breaks so
       far] — the rail would fill the wrong movements the moment a session had
       more than one block in it. */
    [...rail.querySelectorAll('.rail-seg')].forEach((seg, pos) => {
      const i = order[pos];
      const it = A.exercises[i];
      if (!it) return;
      const d = it.sets.filter(s => s.done).length, n = it.sets.length || 1;
      const fill = seg.firstElementChild;
      if (fill) fill.style.width = Math.round(d / n * 100) + '%';
      seg.classList.toggle('done', isComplete(it));
      seg.classList.toggle('now', !isComplete(it) && i === cur);
    });
  }
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
  const maxKcal = Math.max(1, ...weeks.map(w =>
    S.sessions.filter(s => s.ended && s.date >= w.start && s.date <= w.end)
              .reduce((a,s) => a + (s.kcal != null ? s.kcal : sessionKcal(s)), 0)));
  const mv = muscleVolume(7);
  const maxM = Math.max(1, ...Object.values(mv));
  const prs = allPRs().slice(0, 8);
  const bw = S.profile.bodyweight || [];

  const jst = journeyStats();

  /* The route first, because it is the answer to "how is this going" and
     everything below is the detail behind it. */
  let html = journeyRouteHTML();

  /* Four numbers, stated rather than boxed. The tiles were four bordered
     squares competing with each other; a single quiet row of figures reads as
     a trail log. */
  html += `<div class="log mb">
    ${[[st.count, st.count === 1 ? 'session' : 'sessions'],
       [weekStreak(), 'weeks<br>unbroken'],
       [jst.tonnes ? jst.tonnes + 't' : fmtW(st.tonnage) + unit(), 'moved'],
       [(totalKcal() / 1000).toFixed(1) + 'k', 'kcal']]
      .map(([v, k]) => `<div class="log-i"><div class="log-v">${v}</div><div class="log-k">${k}</div></div>`).join('')}
  </div>`;

  html += `<div class="sec-head"><span class="sec-t">Markers</span>
    <span class="tiny">${milestonesReached().length} reached</span></div>`;
  html += journeyPathHTML();

  html += `<div class="sec-head"><span class="sec-t">The ground behind you</span></div>`;
  html += elevationHTML(weeks);

  html += `<div class="sec-head"><span class="sec-t">What you have covered</span>
    <span class="tiny">last 7 days</span></div>`;
  html += `<div class="card mb">
    <div class="col gap-s">
      ${MUSCLES.map(m => `
        <div>
          <div class="row between"><span class="small">${m}</span><span class="tiny mono">${mv[m] % 1 === 0 ? mv[m] : mv[m].toFixed(1)} sets</span></div>
          <div class="bar thin mt-s"><i style="width:${Math.round(mv[m]/maxM*100)}%"></i></div>
        </div>`).join('')}
    </div>
  </div>`;

  if (prs.length) {
    html += `<div class="sec-head"><span class="sec-t">High points</span>
      <span class="tiny">best estimated 1RM</span></div>`;
    html += `<div class="card mb">
      <div class="list">
        ${prs.map(p => `<div class="lrow">
          <div class="grow"><div class="h3">${h(p.name)}</div><div class="tiny mt-s">${fmtW(p.w)}${unit()} × ${p.r} · ${relDate(p.date)}</div></div>
          <div class="mono" style="font-weight:700;font-size:17px">${Math.round(p.e1rm)}<span class="tiny">${unit()}</span></div>
        </div>`).join('')}
      </div>
      <p class="tiny mt-s">Epley estimate. Useful as a trend line, not as a number to attempt.</p>
    </div>`;
  }

  html += `<div class="sec-head"><span class="sec-t">Carrying weight</span>
    <button class="sec-a" data-act="log-bw">Log</button></div>`;
  html += `<div class="card mb">
    ${bw.length > 1 ? sparkHTML(bw.map(b => b.w)) : ''}
    ${bw.length === 0 ? '<p class="small mt-s">No entries yet. Weight is noisy day to day — the trend over weeks is the only part worth reading.</p>' : ''}
    ${bw.length === 1 ? `<p class="small mt-s">One entry so far. A trend line needs a few weeks before it says anything.</p>` : ''}
    ${bw.length ? `<div class="row between mt-s"><span class="tiny">${bw.length>1?relDate(bw[0].d):'Logged'}</span><span class="tiny mono">${fmtW(bw[bw.length-1].w)}${unit()}</span></div>` : ''}
  </div>`;

  html += `<div class="sec-head"><span class="sec-t">Energy spent</span>
    <span class="tiny">8 weeks, estimated</span></div>`;
  html += `<div class="card mb">
    <div class="chart">
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

/* ============================================================
   THE ROUTE
   ------------------------------------------------------------
   Progress was eight stacked cards of correct numbers and no feeling. The
   product metaphor is a journey on foot — ጉዞ — and this is the one screen
   where that should be visible rather than implied.

   Everything drawn here is real. The trail is your milestones in the order you
   actually reached them, the climb is the eight weeks of load you actually
   moved, and nothing is invented to make the picture nicer. A journey you did
   not take is not worth drawing.
   ============================================================ */

/* A smooth line through a set of points, as one path definition.
   Catmull-Rom converted to cubic beziers: the curve passes exactly through
   every point, which matters because the milestone pins are drawn at those
   coordinates and a curve that merely approximates them would float the pins
   off the trail. */
function smoothPath(pts, tension) {
  if (!pts.length) return '';
  if (pts.length < 3) return 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
  const t = tension == null ? 0.5 : tension;
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6 * t, c1y = p1[1] + (p2[1] - p0[1]) / 6 * t;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6 * t, c2y = p2[1] - (p3[1] - p1[1]) / 6 * t;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

const ROUTE_W = 320, ROUTE_H = 132;

/* The hero. A climbing trail with your markers pinned along it, the ground
   behind you solid and the ground ahead dashed. */
function journeyRouteHTML() {
  const st = journeyStats();
  const reached = milestonesReached();
  const next = nextMilestone();

  /* At most five behind you, so the pins stay legible on a 360px screen. What
     is cut is stated rather than silently dropped. */
  const shown = reached.slice(-5);
  const hidden = reached.length - shown.length;
  let nodes = shown.map(m => ({ m, done: true })).concat(next ? [{ m: next, done: false }] : []);

  /* Two points minimum so there is always a trail to look at — an empty route
     ahead of you is the honest picture on day one, not a broken card. */
  const n = Math.max(2, nodes.length);
  /* Padded at the front, so the markers always end at the right. With nothing
     reached the single pin was landing at the *start* of the trail and the
     dashed line climbed away from it — drawing the thing you are walking
     towards as something already behind you. */
  while (nodes.length < n) nodes.unshift(null);
  /* Inset by more than the pin radius, or the last pin is clipped by the
     viewBox — which is exactly what the first version did. */
  const x0 = 26, x1 = ROUTE_W - 26;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : i / (n - 1);
    /* Climbing left to right, with a gentle undulation so it reads as ground
       rather than a graph line. */
    const y = 104 - f * 62 + Math.sin(f * Math.PI * 2.1) * 9;
    pts.push([x0 + f * (x1 - x0), y]);
  }

  const doneN = nodes.filter(nd => nd && nd.done).length;
  const walked = pts.slice(0, Math.max(1, doneN));
  const ahead = pts.slice(Math.max(0, doneN - 1));

  /* Ground only under the part you have walked. Filling the whole width put a
     block of gradient under the dashed section, which read as a grey panel
     rather than terrain — and said, wrongly, that the ground ahead is already
     yours. The left edge runs off the card so it meets the frame like a
     hillside instead of floating. */
  /* Both ends run off the frame — the left below the card edge, the right as a
     slope falling away. Closing it straight down from the last marker drew a
     wall, which is the one shape terrain never makes. */
  const ridge = doneN > 1
    ? smoothPath(walked) + ` L${(walked[walked.length - 1][0] + 30).toFixed(1)} ${ROUTE_H} L0 ${ROUTE_H} Z`
    : '';

  /* Between the last marker and the next one, which is where you actually are.
     Sitting it on top of the last pin hid the pin and claimed you were
     standing still on it. */
  const last = pts[Math.max(0, doneN - 1)];
  const nextPt = pts[doneN];
  const here = (doneN > 0 && nextPt)
    ? [last[0] + (nextPt[0] - last[0]) * 0.42, last[1] + (nextPt[1] - last[1]) * 0.42 - 1]
    : null;

  const pin = (p, node, i) => {
    if (!node) return '';
    const done = node.done;
    return `<g class="rt-pin ${done ? 'on' : 'ahead'}">
      <circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="12.5"></circle>
      <text x="${p[0].toFixed(1)}" y="${(p[1] + 4.6).toFixed(1)}" text-anchor="middle" font-size="12.5">${node.m.ico}</text>
    </g>`;
  };

  return `<div class="route">
    <div class="route-sky"></div>
    <div class="route-head">
      <div>
        <div class="route-eyebrow">Your guzo</div>
        <div class="route-day">Day ${st.day}</div>
      </div>
      <div class="route-count">
        <span class="route-count-n">${reached.length}</span>
        <span class="route-count-l">of ${MILESTONES.length}<br>markers</span>
      </div>
    </div>

    <svg class="route-svg" viewBox="0 0 ${ROUTE_W} ${ROUTE_H}" role="img"
         aria-label="Your route: ${reached.length} of ${MILESTONES.length} markers reached${next ? ', next is ' + next.title : ''}">
      <defs>
        <linearGradient id="rt-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#E9B44C" stop-opacity=".20"/>
          <stop offset="100%" stop-color="#E9B44C" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${ridge ? `<path class="route-ground" d="${ridge}" fill="url(#rt-fill)"/>` : ''}
      <path class="route-ahead" d="${smoothPath(ahead)}"/>
      ${doneN > 1 ? `<path class="route-walked" d="${smoothPath(walked)}"/>` : ''}
      ${here ? `<circle class="route-here" cx="${here[0].toFixed(1)}" cy="${here[1].toFixed(1)}" r="4.2"/>` : ''}
      ${pts.map((p, i) => pin(p, nodes[i], i)).join('')}
    </svg>

    <div class="route-foot">
      ${next
        ? `<div class="route-next"><span class="route-next-k">Next</span>
             <span class="route-next-t">${h(next.title)}</span>
             ${next.left > 0 ? `<span class="route-next-d">${next.left} ${h(next.unit)} away</span>` : ''}</div>`
        : `<div class="route-next"><span class="route-next-t">Every marker reached.</span>
             <span class="route-next-d">The route carries on regardless.</span></div>`}
      ${hidden > 0 ? `<span class="route-behind">+${hidden} behind you</span>` : ''}
    </div>
  </div>`;
}

/* The eight-week climb. Same numbers the bar chart carried, drawn as ground
   rather than columns — a light week is a flat stretch of trail, not a short
   bar next to a tall one. */
function elevationHTML(weeks) {
  const vals = weeks.map(w => w.tonnage);
  const max = Math.max(1, ...vals);
  const any = vals.some(v => v > 0);
  const W = 320, H = 92, pad = 8;
  const pts = vals.map((v, i) => [
    pad + (i / Math.max(1, vals.length - 1)) * (W - pad * 2),
    H - 6 - (v / max) * (H - 20)
  ]);
  /* The last point is the week you are standing in, which is always partial.
     Drawn solid it reads as a collapse — the line dives to the floor because
     Monday has not happened yet — so the final segment is dashed and labelled
     "so far". The app's whole argument is that a light week is a real week;
     it should not draw one as a cliff. */
  const line = smoothPath(pts.slice(0, -1));
  const tail = smoothPath(pts.slice(-2));
  const area = smoothPath(pts.slice(0, -1)) + ` L${pts[pts.length - 2][0].toFixed(1)} ${H} L${pad} ${H} Z`;

  return `<div class="card mb">
    <div class="row between mb-s">
      <div class="eyebrow">The climb &middot; 8 weeks</div>
      <div class="tiny">${any ? fmtW(vals[vals.length - 1]) + unit() + ' so far this week' : unit() + ' moved'}</div>
    </div>
    ${any ? `<svg class="elev" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
        aria-label="Weekly load moved over the last eight weeks">
      <defs>
        <linearGradient id="el-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#E9B44C" stop-opacity=".30"/>
          <stop offset="100%" stop-color="#E9B44C" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#el-fill)"/>
      <path class="elev-line" d="${line}"/>
      <path class="elev-line elev-open" d="${tail}"/>
      ${pts.map((p, i) => vals[i] > 0
        ? `<circle class="elev-dot${i === pts.length - 1 ? ' last' : ''}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === pts.length - 1 ? 3.4 : 2.2}"/>`
        : '').join('')}
    </svg>
    <div class="chart-x">${weeks.map(w => `<span>${w.label}</span>`).join('')}</div>`
    : `<p class="small mt-s">Nothing loaded yet. Bodyweight work does not add to this &mdash; it is a record of external load, and an empty one is not a bad one.</p>`}
    <p class="tiny mt-s">Weeks vary. That's the point &mdash; a light week during a shoot block is a successful week, not a failed one.</p>
  </div>`;
}

/* The markers, named.
   -------------------
   The route above carries the feeling; this carries the information, and the
   two must not both try to do both.

   It used to be three thin rows with "Ahead" on two of them, which is the
   absence of information dressed as information. Every row now says what the
   marker costs, the ones you can measure show how far along you are, and the
   one you just passed says what it meant — the sentence was already written
   and was only ever shown once, in the sheet at the end of a session. */
function journeyPathHTML() {
  const st = journeyStats();
  const reached = milestonesReached();
  const upcoming = MILESTONES.filter(m => !(S.journey && S.journey.reached && S.journey.reached[m.k]));
  /* Four ahead, not two. Two makes the road look like it ends just past your
     feet; the rest are counted underneath rather than hidden. */
  const soon = upcoming.slice(0, 4);
  const rest = upcoming.length - soon.length;
  const back = reached.slice().reverse();

  const doneRow = (m, first) => {
    const need = milestoneNeed(m.k, st);
    return `<div class="jnode done">
      <div class="jnode-ico">${m.ico}</div>
      <div class="grow">
        <div class="row between gap-s"><div class="jnode-t">${h(m.title)}</div>
          <div class="jnode-when">${h(relDate(m.on))}</div></div>
        ${first
          ? `<p class="jnode-body">${h(m.body)}</p>`
          : `<div class="jnode-d">${h((need && need.t) || 'Reached')}</div>`}
      </div>
    </div>`;
  };

  const aheadRow = (m, next) => {
    const need = milestoneNeed(m.k, st);
    /* Only the one you are walking towards carries a count and a bar. Four
       rows of "1/10, 1/25, 1/50" is a scoreboard of everything you have not
       done yet, which is the opposite of what this screen is for. The rest
       state what they cost, on one line, and leave it there. */
    if (!next) {
      return `<div class="jnode far">
        <div class="jnode-ico">${m.ico}</div>
        <div class="grow jnode-oneline">
          <div class="jnode-t">${h(m.title)}</div>
          <div class="jnode-need">${h((need && need.t) || 'Further on')}</div>
        </div>
      </div>`;
    }
    return `<div class="jnode next">
      <div class="jnode-ico">${m.ico}</div>
      <div class="grow">
        <div class="row between gap-s"><div class="jnode-t">${h(m.title)}</div>
          ${need && need.goal ? `<div class="jnode-when mono">${need.have}<span class="jnode-of">/${need.goal}</span></div>` : ''}</div>
        <div class="jnode-d">${h((need && need.t) || 'Next on the route')}</div>
        ${need && need.goal ? `<div class="jnode-bar"><i style="width:${need.pct}%"></i></div>` : ''}
      </div>
    </div>`;
  };

  return `<div class="card mb">
    ${reached.length ? '' : `<p class="small mb">Nothing behind you yet. The first marker arrives with your first session &mdash; and it is the one most people who download a training app never reach.</p>`}
    <div class="jpath">
      ${back.map((m, i) => doneRow(m, i === 0)).join('')}
      ${soon.map((m, i) => aheadRow(m, i === 0)).join('')}
    </div>
    ${rest > 0 ? `<p class="tiny center mt-s">${rest} more marker${rest === 1 ? '' : 's'} further along the route.</p>` : ''}
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
