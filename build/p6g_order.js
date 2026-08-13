/* ============================================================
   THE ORDER — screens for rearranging the week
   ============================================================ */

/* Stroked paths rather than ↑ and ↓ characters. A hairline arrow glyph
   antialiases down to roughly half the contrast its colour promises, which
   is how it failed a pixel-sampled check while passing a look at the CSS. */
const ORD_ARROW = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;

/* The ordered list that sits inside Your week. Settled days are shown
   greyed rather than hidden: seeing that Monday is already spent is the
   context that makes the remaining order make sense. */
function planOrderHTML() {
  /* Every day still ahead of you appears, whether the app put a session on
     it or not. An empty Saturday is a day you might decide to train on. */
  const days = planCandidateDays();
  if (!days.length) {
    return `<div class="note mb"><p class="note-t">This week has already gone.</p>
      <p class="note-b">Switch to next week above and set the order there.</p></div>`;
  }
  const open = planDays().filter(d => !planDaySettled(d));

  const rows = days.map(k => {
    const e = planEntry(k);
    const d = fromKey(k);
    const settled = planDaySettled(k);
    const i = open.indexOf(k);
    const canUp = i > 0, canDown = i >= 0 && i < open.length - 1;
    const off = !e && dayConstraint(k).avail === 'none';

    let state = '';
    if (!e) state = off ? 'You said this one is not happening' : 'Nothing placed — tap to add one';
    else if (e.elsewhere) state = 'Already done elsewhere';
    else if (e.done || plannedDoneOn(k)) state = 'Logged';
    else if (settled) state = 'Day has gone';
    else if (k === today()) state = 'Today';

    return `<div class="ord ${settled || !e ? 'spent' : ''}">
      <div class="ord-d">
        <span class="n">${DAYNAMES[d.getDay()].slice(0,3).toUpperCase()}</span>
        <span class="v">${d.getDate()}</span>
      </div>
      <button class="ord-main" data-act="plan-day" data-k="${k}" ${settled ? 'disabled' : ''}>
        <span class="ord-t">${e ? h(planLabel(e)) + (e.routineId ? ' <span class="pill" style="font-size:10px;padding:2px 7px">yours</span>' : '') : '<span style="color:#98a2ae">Free</span>'}</span>
        ${state ? `<span class="ord-s">${state}</span>` : ''}
      </button>
      ${settled ? `<span class="ord-lock">${ICO.tick}</span>` : (e ? `<div class="ord-ctl">
        <button data-act="plan-move" data-k="${k}" data-d="-1" aria-label="Move ${h(planLabel(e))} earlier"${canUp ? '' : ' disabled'}>${ORD_ARROW('M18 15l-6-6-6 6')}</button>
        <button data-act="plan-move" data-k="${k}" data-d="1" aria-label="Move ${h(planLabel(e))} later"${canDown ? '' : ' disabled'}>${ORD_ARROW('M6 9l6 6 6-6')}</button>
      </div>` : '<span class="ord-lock" style="color:#98a2ae;font-weight:400">+</span>')}
    </div>`;
  }).join('');

  const el = elsewhereDays().length;

  return `<div class="ord-list mb">${rows}</div>
    <button class="btn ghost block mb-s" data-act="plan-elsewhere">
      ${el ? el + ' session' + (el === 1 ? '' : 's') + ' already done elsewhere' : 'I already trained this week'}
    </button>
    ${planIsCustom() ? `<button class="btn quiet block" data-act="plan-reset">Back to the app&rsquo;s own order</button>` : ''}`;
}

/* ============================================================
   ONE DAY
   ------------------------------------------------------------
   Tapping a day used to drop you straight into whichever editor the app
   guessed you wanted: the session-type chips if the day had a plan on it, the
   availability ladder if it did not. Two problems with that.

   A day that has gone was always sent to the availability ladder, because a
   past day is "settled" and settled days fall through to the other branch. So
   tapping Tuesday asked you how much time you expect to have on Tuesday —
   a question about a day that has already happened — and the way out was a
   button marked "Done" that went to the week screen rather than back to where
   you tapped from.

   And even ahead of today, an editor is the wrong first screen. The question
   people arrive with is "what is this day", not "let me change this day".

   So there are two sheets, and both open on the answer with the editors one
   tap further in. Which one you get is decided by the calendar, not by
   whether the app happened to place a session.
   ============================================================ */

/* What actually happened on a day, in the app's own words. Shared by both
   sheets and by nothing else — it is a summary, not a component. */
function daySummaryHTML(k) {
  const done = sessionsOn(k);
  if (!done.length) return '';
  return `<div class="list mb">
    ${done.map(s => {
      const v = sessionVolume(s);
      const kc = s.kcal != null ? s.kcal : sessionKcal(s);
      return `<div class="lrow">
        <div class="ico">${s.extra ? ico((routineById(s.routineId) || {}).emoji || 'tick') : ICO.tick}</div>
        <div class="grow">
          <div class="h3">${h(sessionTitle(s))}</div>
          <div class="tiny mt-s">${v.sets} set${v.sets === 1 ? '' : 's'} · ${s.dur || 0} min${kc ? ' · ' + kc + ' kcal' : ''}${v.tonnage ? ' · ' + (v.tonnage / 1000).toFixed(1) + 'k ' + unit() : ''}${s.extra ? ' · extra' : ''}</div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

/* ---------- a day that has gone ---------- */
function sheetDayPast(k) {
  k = key(k);
  const d = fromKey(k);
  const c = dayConstraint(k);
  const e = planEntry(k);
  const done = sessionsOn(k);
  const inThisWeek = !!S.week.plan && daysBetween(dk(weekStart()), k) >= 0;

  /* Every branch of this has to be readable as a statement of fact. Nothing
     here is an instruction, and nothing counts a day against you — the day is
     closed and the app's whole argument is that a closed day is free. */
  let verdict;
  if (done.length) verdict = done.length === 1 ? 'You trained.' : `You trained ${done.length} times.`;
  else if (e && e.elsewhere) verdict = 'Trained elsewhere.';
  else if (c.avail === 'none') verdict = 'A day off. Nothing was owed.';
  else if (e && inThisWeek) verdict = `${typeLabel(e.type)} was planned. Nothing logged.`;
  else verdict = 'Nothing logged.';

  openSheet(`
    <div class="eyebrow">${DAYNAMES[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}</div>
    <h2 class="h1 mt-s mb">${h(verdict)}</h2>

    ${done.length ? daySummaryHTML(k) : `<p class="small mb">${
      c.avail === 'none' || (e && e.elsewhere)
        ? 'This day is closed. It never counted as missed and it never will.'
        : 'A day that did not happen costs you nothing &mdash; there is no streak here to break. If you did train and the app was not in your hand, put it in below.'
    }</p>`}

    <button class="btn ${done.length ? 'ghost' : 'primary'} block lg" data-act="log-past" data-k="${k}">
      ${done.length ? 'Add something else you did' : 'Add something you did'}
    </button>
    <p class="tiny center mt-s">Logged against ${DAYNAMES[d.getDay()]}, not today. Weights carry into your history the same as any session.</p>
  `, { key: 'day:' + k });
}

/* ---------- today, or a day still ahead ---------- */
function sheetDay(k) {
  k = key(k);
  const d = fromKey(k);
  const c = dayConstraint(k);
  const av = availOf(c.avail);
  const isToday = k === today();
  const thisWeek = daysBetween(k, dk(addDays(weekStart(), 6))) >= 0 && daysBetween(dk(weekStart()), k) >= 0;
  const e = thisWeek ? planEntry(k) : null;
  const done = sessionsOn(k);
  const rt = e && e.routineId ? routineById(e.routineId) : null;

  let title, sub;
  if (done.length && e && e.done) { title = 'Done'; sub = 'That day is marked. Anything else is a bonus.'; }
  else if (e && e.elsewhere) { title = 'Trained elsewhere'; sub = 'Marked as spent without inventing a session record for it.'; }
  else if (c.avail === 'none') { title = 'Off the route'; sub = 'No session goes here, and none is owed.'; }
  else if (e) { title = planLabel(e); sub = rt ? `Your routine · ${rt.items.length} movement${rt.items.length === 1 ? '' : 's'}` : `${av.mins} min · ${ENVS[c.env] ? ENVS[c.env].label : 'Full gym'}`; }
  else if (!thisWeek) { title = av.label; sub = `${av.mins ? 'About ' + av.mins + ' min expected' : 'Nothing will be placed here'} · sessions are laid out when the week starts`; }
  else { title = 'Nothing placed'; sub = `${av.label} · ${av.mins} min. Pick a session and it goes on.`; }

  openSheet(`
    <div class="eyebrow">${DAYNAMES[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${isToday ? ' <span class="pill em" style="font-size:10px;padding:2px 7px">today</span>' : ''}</div>
    <h2 class="h1 mt-s">${h(title)}</h2>
    <p class="small mt-s mb">${h(sub)}</p>

    ${done.length ? daySummaryHTML(k) : ''}

    ${isToday && e && !e.done && c.avail !== 'none' ? (rt
      ? `<button class="btn primary block lg mb" data-act="routine-start" data-v="${h(rt.id)}" data-planned="1">Start it</button>`
      : `<button class="btn primary block lg mb" data-act="start-session" data-type="${h(e.type)}" data-rung="full">Start it</button>`) : ''}

    <div class="list">
      ${thisWeek && !planDaySettled(k) ? `<div class="lrow" data-act="plan-day" data-k="${k}">
        <div class="ico">${ICO.peakMark}</div>
        <div class="grow"><div class="h3">Change the session</div>
          <div class="tiny mt-s">Pick a different split, or one of your routines</div></div>
        <span class="chev">${ICO.chevR}</span>
      </div>` : ''}
      <div class="lrow" data-act="day-edit" data-k="${k}" data-b="day">
        <div class="ico">${ico(av.ico)}</div>
        <div class="grow"><div class="h3">Time and place</div>
          <div class="tiny mt-s">${h(av.label)}${av.mins ? ' · ' + av.mins + ' min' : ''}${ENVS[c.env] ? ' · ' + ENVS[c.env].label.toLowerCase() : ''}</div></div>
        <span class="chev">${ICO.chevR}</span>
      </div>
    </div>
  `, { key: 'day:' + k });
}

/* ---------- picking what a day is ---------- */
function sheetPlanDay(k) {
  /* Both of these used to dead-end in the week screen. */
  if (daysBetween(k, today()) > 0) { sheetDayPast(k); return; }
  if (planDaySettled(k)) { sheetDay(k); return; }
  const e = planEntry(k) || {};
  const d = fromKey(k);
  const cycle = [...new Set(programOf().cycle)];
  const others = PLAN_TYPES.filter(t => cycle.indexOf(t) < 0);
  const routines = ensureRoutines().filter(r => r.items.length);
  const isCur = spec => spec.routineId ? e.routineId === spec.routineId
                                       : (!!e.type && !e.routineId && e.type === spec.type);

  const chip = t => `<div class="chip ${isCur({type:t}) ? 'on' : ''}" data-act="plan-set" data-k="${k}" data-v="${t}">${typeLabel(t)}</div>`;

  openSheet(`
    <div class="row gap-s mb" style="align-items:center">
      <button class="btn xs back" data-act="day-open" data-k="${k}" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 19l-7-7 7-7"/></svg></button>
      <h2 class="h1 grow" style="padding-right:44px">${DAYNAMES[d.getDay()]} ${d.getDate()}</h2>
    </div>
    <p class="small mb">${planEntry(k) ? 'What are you actually doing that day? Your body knows what it did yesterday and the app doesn&rsquo;t &mdash; if today is your back day, make it your back day.'
      : 'Nothing is placed here. Pick a session and it goes on, whatever the app had arranged around it.'}</p>

    <div class="eyebrow mb-s">${h(programOf().name)} rotation</div>
    <div class="chip-grid c3 mb">${cycle.map(chip).join('')}</div>

    <div class="eyebrow mb-s">Anything else</div>
    <div class="chip-grid c3 mb">${others.map(chip).join('')}</div>

    ${routines.length ? `<div class="eyebrow mb-s">Your routines</div>
      <div class="list mb">
        ${routines.map(r => `<button class="lrow ${isCur({routineId:r.id}) ? 'on' : ''}" data-act="plan-set" data-k="${k}" data-r="${h(r.id)}" style="width:100%;text-align:left">
          <div class="ico">${ico(r.emoji)}</div>
          <div class="grow">
            <div class="h3" style="font-size:14.5px">${h(r.name)}</div>
            <div class="tiny mt-s">${r.items.length} movement${r.items.length===1?'':'s'} · about ${routineMins(r)} min</div>
          </div>
          <span class="chev">${ICO.chevR}</span>
        </button>`).join('')}
      </div>
      <p class="tiny mb">A routine put on a planned day counts as that day&rsquo;s session. Run one on any other day and it stays what it has always been &mdash; an extra, on top.</p>`
    : ''}

    <button class="btn quiet block" data-act="day-edit" data-k="${k}" data-b="day">Time and place for this day</button>
  `);
}

/* ---------- and what that means for the rest ---------- */
function sheetPlanApply(k, spec) {
  const opts = planChangeOptions(k, spec);
  if (!opts.length) {
    setPlanDay(k, spec, 'only');
    closeSheet(); sheetWeek(); render(); buzz();
    toast('Set', true);
    return;
  }

  const d = fromKey(k);
  const label = spec.routineId ? (routineById(spec.routineId) || {}).name : typeLabel(spec.type);
  const swap = opts.find(o => o.mode === 'swap');
  const after = planDaysAfter(k).length;
  const enc = spec.routineId ? `data-r="${h(spec.routineId)}"` : `data-v="${h(spec.type)}"`;

  openSheet(`
    <h2 class="h1 mb">${DAYNAMES[d.getDay()]} is ${h(label)}</h2>
    <p class="small mb">And the rest of the week?</p>
    <div class="opts">
      ${swap ? `<div class="opt" data-act="plan-apply" data-k="${k}" ${enc} data-m="swap">
        <div class="opt-ico">${ICO.link}</div>
        <div class="grow">
          <div class="opt-t">Swap with ${DAYNAMES[fromKey(swap.with).getDay()]}</div>
          <div class="opt-d">${DAYNAMES[fromKey(swap.with).getDay()]} already has ${h(label)} on it, so the two trade places. The week keeps the same mix &mdash; nothing gets trained twice and nothing gets dropped.</div>
        </div>
      </div>` : ''}
      ${after ? `<div class="opt" data-act="plan-apply" data-k="${k}" ${enc} data-m="reflow">
        <div class="opt-ico">${ICO.repeat}</div>
        <div class="grow">
          <div class="opt-t">Carry on from here</div>
          <div class="opt-d">The ${after} remaining day${after===1?'':'s'} re-lay in rotation after this one. Days you have already set yourself are left alone.</div>
        </div>
      </div>` : ''}
      <div class="opt" data-act="plan-apply" data-k="${k}" ${enc} data-m="only">
        <div class="opt-ico">·</div>
        <div class="grow">
          <div class="opt-t">Just this day</div>
          <div class="opt-d">Everything else stays exactly where it is.${swap ? ' You would then have ' + h(label) + ' twice this week.' : ''}</div>
        </div>
      </div>
    </div>
  `);
}

/* ---------- what you already did before the app existed for you ---------- */
function sheetElsewhere() {
  const ws = weekStart();
  const rows = Array.from({length:7}, (_, i) => dk(addDays(ws, i)))
    .filter(k => daysBetween(k, today()) >= 0)          // today and earlier
    .map(k => {
      const e = planEntry(k);
      const d = fromKey(k);
      const logged = plannedDoneOn(k);
      const on = e && e.elsewhere;
      return `<button class="lrow ${on ? 'on' : ''}" data-act="${logged ? 'noop' : (on ? 'elsewhere-clear' : 'elsewhere-pick')}" data-k="${k}"
        style="width:100%;text-align:left" ${logged ? 'disabled' : ''}>
        <div class="grow">
          <div class="h3" style="font-size:14.5px">${DAYNAMES[d.getDay()]} ${d.getDate()}</div>
          <div class="tiny mt-s">${logged ? 'Logged in the app' : on ? h(planLabel(e)) + ' · done elsewhere' : e ? 'Planned: ' + h(planLabel(e)) : 'Nothing planned'}</div>
        </div>
        <span class="chev">${on ? ICO.cross : ICO.chevR}</span>
      </button>`;
    }).join('');

  openSheet(`
    <div class="row gap-s mb" style="align-items:center">
      <button class="btn xs back" data-act="open-week" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 19l-7-7 7-7"/></svg></button>
      <h2 class="h1 grow" style="padding-right:44px">Already trained</h2>
    </div>
    <p class="small mb">If you started using Guzo partway through your week, say what you already did. The app marks those days spent and picks the rotation up from the right place, instead of opening on session one while you are three deep.</p>
    <div class="list mb">${rows}</div>
    <p class="tiny">These record the session and nothing else &mdash; no sets, no weights, no tonnage. Guzo will not claim to know what it wasn&rsquo;t there for, so none of it feeds progression.</p>
  `);
}

function sheetElsewherePick(k) {
  const d = fromKey(k);
  const cycle = [...new Set(programOf().cycle)];
  const others = PLAN_TYPES.filter(t => cycle.indexOf(t) < 0);
  const chip = t => `<div class="chip" data-act="elsewhere-set" data-k="${k}" data-v="${t}">${typeLabel(t)}</div>`;
  openSheet(`
    <div class="row gap-s mb" style="align-items:center">
      <button class="btn xs back" data-act="plan-elsewhere" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 19l-7-7 7-7"/></svg></button>
      <h2 class="h1 grow" style="padding-right:44px">${DAYNAMES[d.getDay()]} ${d.getDate()}</h2>
    </div>
    <p class="small mb">What did you train?</p>
    <div class="eyebrow mb-s">${h(programOf().name)} rotation</div>
    <div class="chip-grid c3 mb">${cycle.map(chip).join('')}</div>
    <div class="eyebrow mb-s">Anything else</div>
    <div class="chip-grid c3">${others.map(chip).join('')}</div>
  `);
}
