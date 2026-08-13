/* ============================================================
   THE STRETCH SHEETS
   ------------------------------------------------------------
   Reached from More and from Today. Not a nav tab: the nav has exactly five
   and turning Fuel on already costs Route one of them.
   ============================================================ */

function sheetStretch() {
  if (!stretchOnboarded()) return sheetStretchIntro();

  const st = stretchStore();
  const list = dailyStretch();
  const done = stretchDone(today());
  const secs = stretchSeconds(list);
  const occ = OCCUPATIONS[st.occupation];
  const allDone = stretchAllDone(list);
  const streak = stretchStreak();
  const mine = stretchRoutines();

  openSheet(`
    <div class="row between mb-s" style="padding-right:44px">
      <h2 class="h1">Today's stretch</h2>
    </div>
    <p class="small mb">${Math.round(secs / 60)} minutes &middot; ${list.length} movements${
      streak ? ` &middot; <span class="em">${streak} day${streak === 1 ? '' : 's'} running</span>` : ''}</p>
    ${/* Only where it can actually bite: this is a minute per area, which is the
          far side of the threshold where a static hold measurably costs you
          strength. Said once, on the screen, not buried in a help page. */''}
    ${!S.active && !sessionsOn(today()).length && plannedToday() && !((S.week.plan[today()] || {}).done)
      ? `<p class="tiny mb str-warn">You have a session owed today. Held stretching costs a few
         percent of your strength for a while afterwards &mdash; this is better placed after it.</p>` : ''}

    ${allDone ? `<div class="note mb ok">
      <p class="note-t">Done for today.</p>
      <p class="note-b">Tomorrow's will be built from tomorrow's training. Nothing here needs doing twice.</p>
    </div>` : ''}

    ${/* Why these, in one line, before the list rather than buried under it.
          A recommendation you cannot interrogate is a horoscope. */''}
    <div class="str-why mb">
      <span class="str-why-k">Built from</span>
      ${st.areas.length ? `<span class="str-chip sore">${st.areas.length} area${st.areas.length === 1 ? '' : 's'} you flagged</span>` : ''}
      ${occ ? `<span class="str-chip work">${h(occ.label)}</span>` : ''}
      <span class="str-chip trained">what you trained</span>
    </div>

    <div class="list mb">
      ${list.map(s => {
        const on = done.indexOf(s.ex.id) >= 0;
        /* "each side" was claimed on everything rep-counted, which is right for
           a hip switch and wrong for an inchworm. The catalogue does not record
           laterality, so it is not asserted. */
        const sets = stretchSets(s.ex);
        const one = s.ex.load === 'time' ? s.ex.rh + 's' : '×' + s.ex.rh;
        const amount = sets > 1 ? sets + ' × ' + one : one;
        return `<div class="str-row ${on ? 'done' : ''}">
          <button class="str-tick ${on ? 'on' : ''}" data-act="stretch-tick" data-v="${h(s.ex.id)}"
                  aria-label="${on ? 'Undo' : 'Mark'} ${h(s.ex.name)}" aria-pressed="${on ? 'true' : 'false'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>
          </button>
          <button class="grow str-main" data-act="stretch-info" data-v="${h(s.ex.id)}">
            <div class="str-n">${h(s.ex.name)}</div>
            <div class="str-sub">${h(amount)} &middot; ${h(s.ex.primary)}</div>
          </button>
          ${/* One chip: whichever of the three contributed most. Three chips on
                every row is not an explanation, it is wallpaper. */''}
          <div class="str-tags">${s.why
            ? `<span class="str-chip ${s.why}">${s.why === 'sore' ? 'flagged' : s.why === 'work' ? 'work' : 'trained'}</span>`
            : ''}</div>
        </div>`;
      }).join('')}
    </div>

    ${allDone ? '' : `<button class="btn primary block lg mb" data-act="stretch-start">Start it &mdash; ${Math.round(secs / 60)} min</button>`}
    <div class="btn-row mb">
      <button class="btn ghost grow" data-act="stretch-reroll">Something else</button>
      <button class="btn ghost grow" data-act="stretch-save">Save as routine</button>
    </div>

    ${mine.length ? `<div class="sec-head"><span class="sec-t">Your stretch routines</span></div>
      <div class="list mb">
        ${mine.map(r => `<div class="lrow">
          <div class="ico">${h(r.emoji || '🧘')}</div>
          <button class="grow" data-act="stretch-open-rt" data-v="${h(r.id)}" style="text-align:left">
            <div class="h3">${h(r.name)}</div>
            <div class="tiny mt-s">${r.items.length} movement${r.items.length === 1 ? '' : 's'} &middot; edit</div>
          </button>
          <button class="btn xs" data-act="routine-start" data-v="${h(r.id)}">Start</button>
        </div>`).join('')}
      </div>` : ''}

    <div class="btn-row">
      <button class="btn ghost grow" data-act="stretch-new">Build your own</button>
      <button class="btn ghost grow" data-act="stretch-setup">Change your answers</button>
    </div>
  `, { key: 'stretch' });
}

/* ------------------------------------------------------------
   Its own onboarding.

   Three questions, asked once, and each of them changes what comes out — the
   same bar the main intake holds itself to. Occupation is optional and says
   so, because "none of these" is a real answer and a form that will not take
   it gets a wrong answer instead.
   ------------------------------------------------------------ */
function sheetStretchIntro() {
  openSheet(`
    <h2 class="h1 mb" style="padding-right:44px">Stretch</h2>
    <p class="small mb">A short daily stretch built from three things: what you trained in the last
      couple of days, what your working day does to you, and anything that is already sore.</p>
    <div class="note mb">
      <p class="note-t">Three questions, asked once</p>
      <p class="note-b">Nothing here is collected for the sake of a longer form &mdash; every answer
        changes which movements come out. You can change them whenever you like, and skip the ones
        you would rather not answer.</p>
    </div>
    <div class="note mb">
      <p class="note-t">How long to hold</p>
      <p class="note-b">The target is about a minute on each area, which is what the flexibility
        guidance actually says &mdash; reached as one long hold or two or three shorter ones rather
        than a single quick pull. Each movement here is prescribed accordingly, so a 20-second
        stretch comes up three times and a 60-second one comes up once.</p>
    </div>
    <div class="note mb">
      <p class="note-t">Not immediately before lifting</p>
      <p class="note-b">Held static stretching costs you strength for a while afterwards &mdash; past
        about a minute per muscle it is a real 4&ndash;7%, and this session is a minute per area by
        design. Put it after training, or on a day of its own. A few minutes of the rep-counted
        movements is a fine warm-up; a long hold is not.</p>
    </div>
    <p class="small mb">This is general mobility work, not treatment. If something is painful rather
      than tight, or a problem has been there for weeks, that is a physio's job and not an app's.</p>
    <button class="btn primary block lg" data-act="stretch-setup">Set it up</button>
  `, { key: 'stretch-intro' });
}

let stretchDraft = null;

function sheetStretchSetup() {
  const st = stretchStore();
  if (!stretchDraft) {
    stretchDraft = { occupation: st.occupation, areas: (st.areas || []).slice(), mins: st.mins || 15 };
  }
  const d = stretchDraft;

  openSheet(`
    <h2 class="h1 mb" style="padding-right:44px">Set up your stretch</h2>

    <div class="field mb">
      <div class="label">What does your working day look like?</div>
      <p class="tiny mb-s">The weakest of the three signals, and treated that way &mdash; it nudges the
        order, it never overrides something you have flagged.</p>
      <div class="chip-grid c2">
        ${Object.values(OCCUPATIONS).map(o => `<div class="chip ${d.occupation === o.k ? 'on' : ''}"
          data-act="stretch-occ" data-v="${h(o.k)}">${ico(o.ico)}<span>${h(o.label)}</span></div>`).join('')}
      </div>
      ${d.occupation && OCCUPATIONS[d.occupation]
        ? `<p class="tiny mt-s">${h(OCCUPATIONS[d.occupation].note)}</p>` : ''}
    </div>

    <div class="field mb">
      <div class="label">Anything sore or stiff?</div>
      <p class="tiny mb-s">Weighted highest of the three. You are the only one who knows.</p>
      <div class="chip-grid c2">
        ${Object.values(INJURIES).map(i => `<div class="chip ${d.areas.indexOf(i.k) >= 0 ? 'on' : ''}"
          data-act="stretch-area" data-v="${h(i.k)}">${ico(i.ico)}<span>${h(i.label)}</span></div>`).join('')}
      </div>
      <p class="tiny mt-s">Separate from the injuries in your profile, which remove exercises from
        your training. This one only changes what you are offered to stretch &mdash; but anything you
        have listed there is still excluded here, because the tool for a sore shoulder should not be
        the one thing in the app that ignores it.</p>
    </div>

    <div class="field mb">
      <div class="label">How long, most days?</div>
      <div class="chip-grid c3">
        ${[5, 15, 30, 45, 60].map(m => `<div class="chip ${d.mins === m ? 'on' : ''}"
          data-act="stretch-mins" data-v="${m}">${m} min</div>`).join('')}
      </div>
    </div>

    <button class="btn primary block lg" data-act="stretch-save-setup">Save</button>
  `, { key: 'stretch-setup' });
}

/* What the movement is and how to do it. Where the catalogue has a form
   diagram this hands straight to the app's own form sheet rather than writing a
   second set of instructions that would drift out of step with the first. */
function sheetStretchInfo(exId) {
  const ex = EX[exId];
  if (!ex) return;
  if (hasForm(exId)) { sheetForm(exId); return; }
  const amount = ex.load === 'time' ? `${ex.rl}–${ex.rh} seconds` : `${ex.rl}–${ex.rh} each side`;
  openSheet(`
    <h2 class="h1 mb" style="padding-right:44px">${h(ex.name)}</h2>
    <p class="small mb">${h(amount)} &middot; ${h(ex.primary)}${ex.sec && ex.sec.length ? ' · ' + h(ex.sec.join(', ')) : ''}</p>
    <div class="note mb"><p class="note-b">No diagram for this one yet. Take it to the point of
      tension rather than pain, breathe out into it, and stop if it is sharp.</p></div>
    <button class="btn ghost block" data-act="stretch-back">Back to today's stretch</button>
  `, { key: 'stretch-info' });
}
