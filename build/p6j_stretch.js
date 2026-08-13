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
    ${/* The body map sits on the header line rather than as a row between the
          warning and the list — it is a way in to a different question, not a
          step in this one. */''}
    <div class="row between mb">
      <p class="small">${Math.round(secs / 60)} min &middot; ${list.length} movements${
        streak ? ` &middot; <span class="em">${streak} day${streak === 1 ? '' : 's'} running</span>` : ''}</p>
      <button class="str-one" data-act="body-map">${ICO['area-Back']}<span>One thing</span></button>
    </div>
    ${/* Only where it can actually bite: this is a minute per area, which is the
          far side of the threshold where a static hold measurably costs you
          strength. Said once, on the screen, not buried in a help page. */''}
    ${/* One line. It was three, in a bordered amber box a third the height of
          the screen, to say something you need to know once. */''}
    ${!S.active && !sessionsOn(today()).length && plannedToday() && !((S.week.plan[today()] || {}).done)
      ? `<p class="tiny mb str-warn">A session is owed today &mdash; a long hold costs a few percent
         of your strength for a while, so this sits better after it.</p>` : ''}

    ${allDone ? `<div class="note mb ok">
      <p class="note-t">Done for today.</p>
      <p class="note-b">Tomorrow's will be built from tomorrow's training. Nothing here needs doing twice.</p>
    </div>` : ''}

    ${/* Why these, in one line, before the list rather than buried under it.
          A recommendation you cannot interrogate is a horoscope. */''}
    ${/* Point at it instead of reading a list. The figure is the only thing on
          this screen that answers "I know exactly what hurts" in one tap. */''}
    ${/* The reason was a chip on every row and a chip row above them saying
          the same three words. Six of nine rows read "flagged", which is a
          label that has stopped labelling — the same failure as the pill on
          the Route screen that said "A normal day" seven times.

          The reasons are headings now. A movement is under the answer that put
          it there, the chips are gone from the rows, and the list is organised
          rather than annotated. A reason with nothing under it is not drawn. */''}
    ${(() => {
      /* Short, because these are uppercase and letter-spaced: "Because of your
         working day · Camera / AV crew" wrapped to two lines and pushed the
         count onto the second one. The heading names the reason; the setup
         sheet is where the reason is spelled out. */
      const WHY = [
        { k: 'sore',    t: st.areas.length === 1 ? 'The area you flagged' : 'Areas you flagged' },
        { k: 'work',    t: 'Your working day' },
        { k: 'trained', t: 'What you trained' },
        { k: '',        t: 'Rounding it out' }
      ];
      const row = s => {
        const on = done.indexOf(s.ex.id) >= 0;
        const sets = stretchSets(s.ex);
        /* The rep form already carries a × of its own, so composing it with
           the set count printed "2 × ×15". A hold composes; a rep count is
           written out. */
        const amount = s.ex.load === 'time'
          ? (sets > 1 ? sets + ' × ' + s.ex.rh + 's' : s.ex.rh + 's')
          : (sets > 1 ? sets + ' × ' + s.ex.rh : '×' + s.ex.rh);
        return `<div class="str-row ${on ? 'done' : ''}">
          <button class="str-tick ${on ? 'on' : ''}" data-act="stretch-tick" data-v="${h(s.ex.id)}"
                  aria-label="${on ? 'Undo' : 'Mark'} ${h(s.ex.name)}" aria-pressed="${on ? 'true' : 'false'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>
          </button>
          <button class="grow str-main" data-act="stretch-info" data-v="${h(s.ex.id)}">
            <span class="str-n">${h(s.ex.name)}</span>
            <span class="str-sub">${h(s.ex.primary)}</span>
          </button>
          <span class="str-dose mono">${h(amount)}</span>
        </div>`;
      };
      return WHY.map(w => {
        const mine = list.filter(x => (x.why || '') === w.k);
        if (!mine.length) return '';
        const doneN = mine.filter(x => done.indexOf(x.ex.id) >= 0).length;
        return `<div class="str-grp ${h(w.k || 'plain')}">
          <div class="str-grp-h"><span class="str-grp-t">${w.t}</span>
            <span class="str-grp-n mono">${doneN}/${mine.length}</span></div>
          ${mine.map(row).join('')}
        </div>`;
      }).join('');
    })()}
    </div>

    ${allDone ? '' : `<button class="btn primary block lg mb" data-act="stretch-start">Start it &mdash; ${Math.round(secs / 60)} min</button>`}
    <div class="btn-row mb">
      <button class="btn ghost grow" data-act="stretch-reroll">Something else</button>
      <button class="btn ghost grow" data-act="stretch-save">Save as routine</button>
    </div>

    ${/* Presets. The other question people have is not "what should I do
          today" but "my back is wrecked and I have fifteen minutes". */''}
    <div class="sec-head"><span class="sec-t">Quick start</span></div>
    <div class="pset mb">
      ${STRETCH_PRESETS.filter(p => presetReady(p.k)).map(p => `
        <button class="pset-c" data-act="stretch-preset" data-v="${h(p.k)}">
          <span class="pset-i">${ico(p.ico)}</span>
          <span class="pset-n">${h(p.name)}</span>
          <span class="pset-m mono">${p.mins} min</span>
        </button>`).join('')}
    </div>

    ${mine.length ? `<div class="sec-head"><span class="sec-t">Your stretch routines</span></div>
      <div class="list mb">
        ${mine.map(r => `<div class="lrow">
          <div class="ico">${ico(r.emoji || 'env-bw')}</div>
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
/* The first thing anyone sees when they tap Stretch.
   -------------------------------------------------
   It was four hundred words in three grey boxes, with the button that starts
   the thing below the fold. Every word of it was true and load-bearing — the
   dosing, the timing, the fact that nothing is collected for its own sake —
   and none of that is a reason to make somebody read an essay before they are
   allowed to try a feature.

   The claims are still all here and still cited. They are three lines instead
   of three paragraphs, the detail sits behind the one that earns it, and the
   figure does the work the prose was doing: it says what this is about before
   you have read anything. */
function sheetStretchIntro() {
  openSheet(`
    <div class="str-intro">
      <div class="str-intro-fig">${bodyFigureHTML({
        sex: (S.profile && S.profile.sex) || 'na', view: 'front',
        lit: { Back: .85, Shoulders: .6, Hamstrings: .7, Glutes: .45, Quads: .35, Core: .25 } })}</div>
      <div class="str-intro-t">
        <h2 class="h1">Stretch</h2>
        <p class="small mt-s">Daily mobility, built from what you trained, what your
          working day does to you, and anything already sore.</p>
      </div>
    </div>

    <div class="list mb">
      <div class="lrow">
        <div class="ico">${ICO.stopwatch}</div>
        <div class="grow"><div class="h3">About a minute per area</div>
          <div class="tiny mt-s">The dose the flexibility guidance actually gives &mdash; reached as
            one long hold or three short ones. Every movement here is prescribed to hit it.</div></div>
      </div>
      <div class="lrow">
        <div class="ico">${ICO.warn}</div>
        <div class="grow"><div class="h3">After training, not before</div>
          <div class="tiny mt-s">A held stretch costs 4&ndash;7% of your strength for a while
            afterwards. Put this after the session, or on a day of its own.<span class="src">${EVIDENCE.stretchSrc || 'Behm et al. 2016, Appl Physiol Nutr Metab'}</span></div></div>
      </div>
      <div class="lrow">
        <div class="ico">${ICO.person}</div>
        <div class="grow"><div class="h3">Three questions, asked once</div>
          <div class="tiny mt-s">Every answer changes which movements come out. Skip any of them,
            change them whenever.</div></div>
      </div>
    </div>

    <button class="btn primary block lg" data-act="stretch-setup">Set it up</button>
    <p class="tiny center mt-s">General mobility work, not treatment. If something is painful rather
      than tight, that is a physio's job and not an app's.</p>
  `, { key: 'stretch-intro' });
}

let stretchDraft = null;
/* Which way the setup figure is facing. Draft state, like stretchDraft itself:
   it is a question about this visit to the sheet, not about you. */
let stretchSetView = 'front';

/* One place that flags an area, whether it was tapped on the figure, on a chip
   below it, or resolved from a near-miss on bare silhouette. Three call sites
   writing to the same array would drift, and the one that drifted would be the
   figure — the only one of the three with no visible list to check itself
   against. */
function toggleStretchArea(k) {
  if (!INJURIES[k] || !stretchDraft) return;
  const a = stretchDraft.areas;
  const i = a.indexOf(k);
  if (i >= 0) a.splice(i, 1); else a.push(k);
  buzz(10);
  sheetStretchSetup();
}

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
      <p class="tiny mb-s">Weighted highest of the three. You are the only one who knows &mdash;
        so point at it.</p>
      ${/* Eight chips became eight places on a body. Pointing at what hurts is
            not a nicer way of reading a list, it is a different act: you do not
            have to translate "the outside of my knee" into a word first, and
            the eight words were the whole reason this question felt like
            paperwork. The chips are still below, as the record of what you
            picked and the way to take one back. */''}
      <div class="bmap bmap-set mb-s">
        <div class="bmap-fig">${bodyFigureHTML({
          sex: (S.profile && S.profile.sex) || 'na', view: stretchSetView,
          mode: 'joints', picked: d.areas })}</div>
        <button class="bmap-turn" data-act="stretch-turn"
                aria-label="Turn the figure to show the ${stretchSetView === 'front' ? 'back' : 'front'}">
          ${ICO.repeat}<span>${stretchSetView === 'front' ? 'Back' : 'Front'}</span>
        </button>
      </div>
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

/* A preset, before you commit to it. Shown rather than started outright: it is
   the same list every other stretch shows, so it gets the same treatment —
   what is in it, why, and a button. */
function sheetStretchPreset(k) {
  const p = presetById(k);
  if (!p) return;
  const list = presetStretch(k);
  if (!list.length) { toast('Nothing available for that right now'); return; }
  const secs = stretchSeconds(list);
  const done = stretchDone(today());

  openSheet(`
    <button class="sheet-back" data-act="stretch-back" aria-label="Back to your stretch">
      ${ICO.arrowL}<span>Stretch</span>
    </button>
    <h2 class="h1 mt-s mb-s" style="padding-right:44px">${h(p.name)}</h2>
    <p class="small mb">${h(p.blurb)}</p>
    <p class="tiny mb">${Math.round(secs / 60)} minutes &middot; ${list.length} movements &middot;
      still filtered by anything you have flagged and by the kit you have.</p>

    <div class="list mb">
      ${list.map(s => {
        const on = done.indexOf(s.ex.id) >= 0;
        const sets = stretchSets(s.ex);
        const amount = s.ex.load === 'time'
          ? (sets > 1 ? sets + ' × ' + s.ex.rh + 's' : s.ex.rh + 's')
          : (sets > 1 ? sets + ' × ' + s.ex.rh : '×' + s.ex.rh);
        return `<div class="str-row ${on ? 'done' : ''}">
          <button class="str-tick ${on ? 'on' : ''}" data-act="stretch-tick" data-v="${h(s.ex.id)}"
                  aria-label="${on ? 'Undo' : 'Mark'} ${h(s.ex.name)}" aria-pressed="${on ? 'true' : 'false'}">
            ${ICO.tick}
          </button>
          <button class="grow str-main" data-act="stretch-info" data-v="${h(s.ex.id)}">
            <div class="str-n">${h(s.ex.name)}</div>
            <div class="str-sub">${h(amount)} &middot; ${h(s.ex.primary)}</div>
          </button>
        </div>`;
      }).join('')}
    </div>

    <button class="btn primary block lg mb-s" data-act="stretch-preset-start" data-v="${h(p.k)}">
      Start it &mdash; ${Math.round(secs / 60)} min</button>
    <button class="btn ghost block" data-act="stretch-preset-save" data-v="${h(p.k)}">Save as a routine</button>
  `, { key: 'stretch-preset-' + k });
}

/* ============================================================
   THE BODY MAP
   ------------------------------------------------------------
   Point at what you want to stretch. The figure is lit by where your week
   actually went — see bodyHeat() — so the thing you have hammered is the
   thing that catches your eye before you have decided to look for it.

   Draft state rather than stored state: which way the figure is facing and
   which muscle is chosen are questions about *this* visit to the sheet, and
   writing them to S would mean the app remembering that you once looked at
   your hamstrings.
   ============================================================ */
let bodyMapView = 'front';
let bodyMapSel = null;

function sheetBodyMap(m) {
  if (m !== undefined) bodyMapSel = m;
  const sex = (S.profile && S.profile.sex) || 'na';
  const heat = bodyHeat(7);
  const vol = (() => { try { return muscleVolume(7) || {}; } catch (e) { return {}; } })();
  const sel = bodyMapSel;
  /* Everything the catalogue has for the chosen muscle, not the day's list —
     you came here to work on one thing, which is a different question from
     "what should I do today". */
  const picks = sel ? dailyStretch(6, { filter: ex =>
    ex.primary === sel || (ex.sec || []).indexOf(sel) >= 0 }) : [];

  openSheet(`
    <div class="row between mb-s" style="padding-right:44px">
      <h2 class="h1">Where does it need it?</h2>
    </div>
    <p class="small mb">Tap a muscle. It is lit by what you have trained in the last seven days.</p>

    <div class="bmap mb">
      <div class="bmap-fig">${bodyFigureHTML({ sex, view: bodyMapView, lit: heat, sel })}</div>
      ${/* Turning it round, not rotating it in space — see the handbook. Front
            and back is every muscle the catalogue targets; a side view would
            be drawing for no new tap target. */''}
      <button class="bmap-turn" data-act="body-turn"
              aria-label="Turn the figure to show the ${bodyMapView === 'front' ? 'back' : 'front'}">
        ${ICO.repeat}<span>${bodyMapView === 'front' ? 'Back' : 'Front'}</span>
      </button>
    </div>

    ${sel ? `<div class="bmap-head">
        <div class="grow">
          <div class="h3">${h(sel)}</div>
          <div class="tiny mt-s">${vol[sel]
            ? Math.round(vol[sel]) + ' set' + (Math.round(vol[sel]) === 1 ? '' : 's') + ' in the last 7 days'
            : 'Nothing logged for it this week'}</div>
        </div>
        <button class="btn quiet sm" data-act="body-clear">Clear</button>
      </div>
      ${picks.length ? `<div class="list mb">${picks.map(s => `
        <button class="lrow" data-act="stretch-info" data-v="${h(s.ex.id)}" style="width:100%;text-align:left">
          <div class="ico">${ICO.mobility}</div>
          <div class="grow">
            <div class="h3">${h(s.ex.name)}</div>
            <div class="tiny mt-s">${s.ex.load === 'time'
              ? stretchSets(s.ex) + ' × ' + s.ex.rh + 's' : '×' + s.ex.rh} &middot; ${h(s.ex.primary)}</div>
          </div>
          <span class="chev">&rsaquo;</span>
        </button>`).join('')}</div>`
        : `<p class="small blankstate mb">Nothing in the catalogue targets that one directly.
           Tap somewhere else, or use today's list.</p>`}`
      : `<p class="small center mb" style="color:var(--faint)">Nothing selected yet</p>`}

    <button class="btn ghost block" data-act="stretch">Today's stretch instead</button>`,
    { key: 'bodymap' });
}
