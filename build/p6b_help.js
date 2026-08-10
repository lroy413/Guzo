/* ============================================================
   HELP & GUIDES
   ============================================================ */
const HELP_PAGES = {
  how:   { ico:'🧭', title:'How Guzo works', sub:'The ladder, week shaping, and why one miss is free' },
  form:  { ico:'📐', title:'Form guides',       sub:'Diagrams and cues for the main lifts' },
  terms: { ico:'📖', title:'Terms explained',   sub:'RPE, 1RM, double progression, deload, tonnage' },
  start: { ico:'▶️', title:'Getting started',   sub:'Your first week, and what to do on a bad one' },
  data:  { ico:'💾', title:'Install & backups', sub:'Home screen, exporting, restoring, resetting' },
  shortcut: { ico:'📲', title:'Steps &amp; sleep from Health', sub:'Build the shortcut that hands Apple Health over' },
  why:   { ico:'🔬', title:'The evidence',      sub:'The research this app is built on' },
  privacy: { ico:'🔒', title:'Privacy',          sub:'What is stored, where it lives, and what never leaves' }
};

function sheetHelp() {
  openSheet(`
    <h2 class="h1">Help &amp; guides</h2>
    <p class="small mt-s" style="margin-bottom:18px">Everything about how the app behaves, and how to do the lifts it gives you.</p>
    <div class="list">
      ${Object.keys(HELP_PAGES).map(k => `
        <button class="lrow" data-act="help-page" data-v="${k}" style="width:100%;text-align:left">
          <div class="ico">${HELP_PAGES[k].ico}</div>
          <div class="grow">
            <div class="h3">${HELP_PAGES[k].title}</div>
            <div class="tiny mt-s">${HELP_PAGES[k].sub}</div>
          </div>
          <span class="chev">›</span>
        </button>`).join('')}
    </div>
    <p class="tiny center mt-l">Guzo Fit v${VERSION} · beta<br>ጉዞ · Amharic for “journey” · guzofit.app</p>
  `);
}

function helpBack() {
  return `<button class="btn xs quiet" data-act="open-help" style="margin-left:-8px">‹ Help</button>`;
}

/* ---------- form library ---------- */
function sheetFormList(query) {
  const q = (query || '').toLowerCase();
  const ids = Object.keys(FORMS).filter(id => !q || FORMS[id].name.toLowerCase().includes(q));
  openSheet(`
    ${helpBack()}
    <h2 class="h1 mt-s">Form guides</h2>
    <p class="small mt-s">Two-frame diagrams with setup, cues and the mistakes worth avoiding. ${Object.keys(FORMS).length} lifts covered so far.</p>
    <input class="input mt" id="form-q" placeholder="Search lifts…" value="${h(query||'')}" autocomplete="off">
    <div class="list mt">
      ${ids.map(id => `
        <button class="lrow" data-act="help-form" data-v="${id}" style="width:100%;text-align:left">
          <div class="formthumb">${formSVG(FORMS[id].frames[1])}</div>
          <div class="grow">
            <div class="h3" style="font-size:14.5px">${FORMS[id].name}</div>
            <div class="tiny mt-s">${EX[id] ? EX[id].primary + ' · ' + EX[id].eq : ''}</div>
          </div>
          <span class="chev">›</span>
        </button>`).join('')}
    </div>
    ${ids.length ? '' : '<div class="blankstate"><div class="big">🔍</div>No diagram for that yet.<br>Every lift still has muscle targets and rep ranges in the picker.</div>'}
  `);
  const qi = document.getElementById('form-q');
  if (qi) qi.addEventListener('input', ev => {
    const v = ev.target.value, pos = ev.target.selectionStart;
    sheetFormList(v);
    const n = document.getElementById('form-q');
    if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} }
  });
}

function sheetForm(exId, fromSession) {
  const F = FORMS[exId];
  if (!F) { toast('No diagram for that one yet'); return; }
  const ex = EX[exId];
  openSheet(`
    ${fromSession ? '' : helpBack()}
    <h2 class="h1 mt-s">${h(F.name)}</h2>
    ${ex ? `<div class="row wrap gap-s mt-s"><span class="pill">${h(ex.primary)}</span>${(ex.sec||[]).map(m=>`<span class="pill">${h(m)}</span>`).join('')}<span class="pill">${ex.rl}–${ex.rh} reps</span></div>` : ''}

    <div class="formframes mt">
      ${F.frames.map((fr, i) => `
        <figure class="formframe">
          <div class="formfig-wrap">${formSVG(fr)}</div>
          <figcaption>${F.labels[i]}</figcaption>
        </figure>`).join('')}
    </div>

    <div class="card mt">
      <div class="eyebrow">Set-up</div>
      <p class="small mt-s" style="color:var(--text-dim)">${F.setup}</p>
    </div>

    <div class="eyebrow mt-l mb-s">Cues while you lift</div>
    <div class="list">
      ${F.cues.map((c, i) => `<div class="lrow"><div class="cue-n">${i+1}</div><div class="grow"><div class="small" style="color:var(--text-dim)">${c}</div></div></div>`).join('')}
    </div>

    <div class="eyebrow mt-l mb-s">Common faults</div>
    <div class="list">
      ${F.faults.map(c => `<div class="lrow"><div class="cue-x">!</div><div class="grow"><div class="small">${c}</div></div></div>`).join('')}
    </div>

    <div class="banner soft mt-l">These are stylised diagrams, not a coaching qualification. If a lift hurts, stop — and flag the area in your profile so it stops being programmed.</div>
    ${fromSession ? `<button class="btn primary block lg mt" data-act="close">Back to the session</button>` : ''}
  `);
}

/* ---------- written pages ---------- */
const HELP_BODY = {
  how: () => `
    ${helpBack()}
    <h2 class="h1 mt-s">How Guzo works</h2>

    <div class="eyebrow mt-l mb-s">The week comes first</div>
    <p class="small">Most training apps hand you a fixed schedule and then react once you have already missed things. Guzo asks what your week actually looks like — which days you can train, roughly how long, and where you will be — and places your sessions into the days that can genuinely hold them.</p>
    <p class="small mt-s">Redo it any time from <strong>Route → Shape this week</strong>. There is a Next Week tab too, which is the single most useful thing here if you get call sheets in advance.</p>

    <div class="eyebrow mt-l mb-s">Every session has four sizes</div>
    <div class="list mt-s">
      ${RUNGS.map(r => `<div class="lrow"><div class="cue-n">${r.n}</div><div class="grow"><div class="h3" style="font-size:14px">${r.label} <span class="tiny">· ${rungMinsLabel(r.k)}</span></div><div class="tiny mt-s">${r.blurb}</div></div></div>`).join('')}
    </div>
    <p class="small mt">All four count identically as a session. There is no partial credit because there is no such thing as a partial session.</p>

    <div class="eyebrow mt-l mb-s">Everything scales from one number</div>
    <p class="small">Your normal session length is <strong>${baseMins()} minutes</strong>. Every other duration is worked out from it — a clear day is ${availOf('long').mins} minutes, a tight one ${availOf('short').mins}. Change it in <strong>Base camp → Structure</strong> and the whole app re-scales.</p>

    <div class="eyebrow mt-l mb-s">Weights manage themselves</div>
    <p class="small">Double progression. Hit the top of the rep range at a manageable effort and it adds weight next session and resets the reps. Fall short twice in a row and it takes 10% off and rebuilds. You never have to plan a jump yourself — just log what you actually did.</p>

    <div class="eyebrow mt-l mb-s">Missing is handled asymmetrically</div>
    <p class="small">One missed session gets acknowledged and dismissed, because the research says it costs you almost nothing. Two in a row gets an offer to re-cut the week. There is no daily streak and nothing ever turns red.</p>

    <div class="eyebrow mt-l mb-s">The daily check-in only shrinks things</div>
    <p class="small">Sleep, energy, soreness and stress produce a readiness score, scored against <em>your</em> normal night of ${S.profile.sleepNorm} hours rather than a textbook eight. A low score suggests a smaller session. It will never tell you to do more than you planned.</p>`,

  terms: () => `
    ${helpBack()}
    <h2 class="h1 mt-s">Terms explained</h2>
    <div class="list mt">
      ${[
        ['RPE','Rate of Perceived Exertion, 1–10. RPE 8 means you had about two good reps left. It is the honest way to record how hard a set actually was, and the app uses it to decide whether to add weight.'],
        ['RIR','Reps In Reserve — the same idea counted the other way. RPE 8 equals 2 RIR.'],
        ['1RM','One-rep max. The app never asks you to attempt one; it estimates it from your working sets using the Epley formula and shows it purely as a trend line.'],
        ['Working set','A hard set that counts toward progress, as opposed to a warm-up. Everything logged here is treated as a working set.'],
        ['Double progression','Add reps until you reach the top of the range, then add weight and drop back to the bottom. Repeat. It is the safest automatic progression there is.'],
        ['Deload','A deliberate reduction in weight to let you rebuild with better technique. Guzo takes 10% off automatically after two sessions short of target.'],
        ['Tonnage','Weight × reps, summed. Useful for spotting trends across weeks, meaningless as a single number.'],
        ['Hard sets','The count of working sets you completed. The best simple proxy for training volume.'],
        ['Compound','A lift moving more than one joint — squats, presses, rows. These come first in a session and get longer rests.'],
        ['Accessory','Single-joint or supporting work — curls, raises, extensions. First to be cut when time is short.'],
        ['Progressive overload','Gradually asking your body for more than last time. Reps, weight, or sets — it does not have to be weight every session.'],
        ['Detraining','What actually happens when you stop. Far less, far slower than most people fear — see The evidence.']
      ].map(([t,d]) => `<div class="lrow" style="align-items:flex-start"><div class="grow"><div class="h3" style="font-size:14.5px">${t}</div><div class="small mt-s">${d}</div></div></div>`).join('')}
    </div>`,

  start: () => `
    ${helpBack()}
    <h2 class="h1 mt-s">Getting started</h2>

    <div class="eyebrow mt-l mb-s">Your first week</div>
    <p class="small">Shape the week first — that is the step everything else depends on. Then just start a session. The weights are estimates; log what you actually lift and they will be right within two or three sessions.</p>

    <div class="eyebrow mt-l mb-s">During a session</div>
    <div class="list mt-s">
      ${[
        ['Tick the green check to log a set','If you leave weight or reps blank it fills in the target for you.'],
        ['A finished exercise folds itself away','Tap any card header to collapse or reopen it manually.'],
        ['Swap anything you do not like','The Swap button offers alternatives that fit wherever you are training.'],
        ['Leave whenever you need to','The back arrow keeps everything. Your session waits on the home screen.'],
        ['Rest timers start themselves','Longer for compounds, shorter for accessories. Adjust in Base camp.']
      ].map(([t,d]) => `<div class="lrow" style="align-items:flex-start"><div class="grow"><div class="h3" style="font-size:14px">${t}</div><div class="tiny mt-s">${d}</div></div></div>`).join('')}
    </div>

    <div class="eyebrow mt-l mb-s">On a bad week</div>
    <p class="small">Mark the days honestly. A day set to <strong>Not happening</strong> comes off the route entirely and never counts as missed. On a day with fifteen spare minutes, take the Short rung. On a day with three, take the floor. All of it counts.</p>

    <div class="eyebrow mt-l mb-s">If something hurts</div>
    <p class="small">Stop the set. Then add the area to your injury list in Base camp — everything that loads it is removed from the library permanently and the generator reaches for alternatives instead.</p>`,

  data: () => `
    ${helpBack()}
    <h2 class="h1 mt-s">Install &amp; backups</h2>

    <div class="eyebrow mt-l mb-s">Put it on your home screen</div>
    <p class="small">Open the app in Safari or Chrome, then use <strong>Share → Add to Home Screen</strong>. It will launch full-screen with no browser chrome and works offline.</p>
    <p class="small mt-s">It needs to be served over a web address rather than opened as a downloaded file — otherwise the browser will not keep your data between visits.</p>

    <div class="eyebrow mt-l mb-s">Everything is on this device</div>
    <p class="small">There is no account and no server. Nothing you enter leaves your phone. That also means nothing is recoverable if you clear your browser data, which is why backups matter.</p>

    <div class="eyebrow mt-l mb-s">Back up weekly</div>
    <p class="small"><strong>Base camp → Export backup</strong> writes a single JSON file containing your whole history. Keep it anywhere. <strong>Restore from backup</strong> reads it back on any device.</p>

    <div class="eyebrow mt-l mb-s">Starting over</div>
    <p class="small"><strong>Base camp → Reset everything</strong> wipes it all and returns you to the questionnaire. It asks twice, and it cannot be undone — export first.</p>

    <div class="card accent mt-l">
      <div class="eyebrow em">Beta build</div>
      <p class="small mt-s">Every Pro feature is unlocked and nothing charges. The paywall in Base camp is a design preview only.</p>
    </div>`,

  /* Written to be the actual privacy policy, not a summary of one. The App
     Store requires a policy for any app, and requires an explicit one for
     anything touching Health data — so this has to be true, specific, and
     checkable against the code rather than reassuring. Every claim below was
     verified: the app makes no network requests of any kind outside the
     service worker, which fetches nothing but the app's own two files. */
  privacy: () => `
    ${helpBack()}
    <h2 class="h1 mt-s">Privacy</h2>
    <p class="small mt-s">The short version: nothing you enter here leaves this device, because there is nowhere for it to go.</p>

    <div class="card mt">
      <div class="h3">There is no account and no server</div>
      <p class="small mt-s">Guzo has no sign-up, no login, and no backend. Your training history, bodyweight, food log, readiness check-ins and routines are stored in this browser's local storage on this device only. No copy exists anywhere else unless you export one yourself.</p>
    </div>

    <div class="card mt">
      <div class="h3">Nothing is collected, sent or sold</div>
      <p class="small mt-s">No analytics, no crash reporting, no advertising identifiers, no tracking of any kind. The app makes no network requests except to load its own two files. There is no third party in this app to share anything with.</p>
    </div>

    <div class="card mt">
      <div class="h3">The one time you leave</div>
      <p class="small mt-s">Tapping "Find a video" for a lift opens a YouTube search in your browser. That is you visiting YouTube, under their privacy policy, not Guzo sending them anything about you. Nothing else in the app opens an external link.</p>
    </div>

    <div class="card mt">
      <div class="h3">Your data, your copies</div>
      <p class="small mt-s">Export writes a JSON file of everything to wherever you choose to save it. Restore replaces what is on this device. Reset erases it. All three are in Settings, under Your data, and none of them touches a network.</p>
    </div>

    <div class="card mt">
      <div class="h3">Health data</div>
      <p class="small mt-s">Guzo does not currently read Apple Health. If a future version does, it will ask first, read only what it names, keep it on the device under exactly these terms, and never write it anywhere else. Nothing in this app is medical advice — calorie and protein targets are estimates from published equations, and the food library holds generic reference foods rather than products with labels.</p>
    </div>

    <p class="tiny center mt-l">Guzo Fit v\${VERSION}. Questions: the developer is the only person with access to anything, and that access is your own phone.</p>`,

  why: () => `
    ${helpBack()}
    <h2 class="h1 mt-s">The evidence</h2>
    <p class="small mt-s">The unusual choices in this app are deliberate, and each one has something behind it.</p>

    <div class="card mt">
      <div class="h3">There is no daily streak</div>
      <p class="small mt-s">An analysis of 58,881 posts about the five most profitable fitness apps found users reporting "shame, disappointment and demotivation, and subsequent disengagement" — driven by rigid quantitative goals. Guzo counts weeks containing at least one session instead.</p>
      <span class="src">Bondaronek et al., British Journal of Health Psychology, 2025</span>
    </div>

    <div class="card mt">
      <div class="h3">One miss really is free</div>
      <p class="small mt-s">${EVIDENCE.oneMiss}</p>
      <span class="src">${EVIDENCE.oneMissSrc}</span>
      <p class="small mt">Repeated omissions are a different matter, which is why two in a row triggers an offer to re-plan.</p>
      <span class="src">${EVIDENCE.twoMissSrc}</span>
    </div>

    <div class="card mt">
      <div class="h3">Three minutes is a real dose</div>
      <p class="small mt-s">${EVIDENCE.micro}</p>
      <span class="src">${EVIDENCE.microSrc}</span>
    </div>

    <div class="card mt">
      <div class="h3">Time off costs less than you fear</div>
      <p class="small mt-s">Up to two weeks away, strength is essentially maintained in trained lifters. Maximal strength holds to around three weeks. Apparent size loss in the first weeks is largely glycogen and water. Maintenance needs roughly one session a week at a third of normal volume.</p>
      <span class="src">Hwang 2017; McMaster 2013; Coratella &amp; Schena 2016</span>
    </div>

    <div class="card mt">
      <div class="h3">Habits take longer than you were told</div>
      <p class="small mt-s">${EVIDENCE.habit66}</p>
      <span class="src">${EVIDENCE.habit66Src}</span>
    </div>

    <div class="card mt">
      <div class="h3">Identifying barriers is the active ingredient</div>
      <p class="small mt-s">A meta-analysis of 73 studies covering 30,088 people found the largest effects came from being positive the person can succeed, <em>identifying barriers to change</em>, and providing a meaningful rationale. Shaping your week is that technique, made into a feature.</p>
      <span class="src">Ntoumanis et al., Health Psychology Review, 2020</span>
    </div>

    <div class="banner soft mt-l">None of this is medical advice. It is the reasoning behind the design, offered so you can disagree with it.</div>`
};


/* ============================================================
   THE JOURNEY SHEET
   ============================================================ */
function sheetJourney() {
  const st = journeyStats();
  const reached = milestonesReached();
  const nxt = nextMilestone();
  const start = S.meta && S.meta.created ? dk(new Date(S.meta.created)) : today();
  openSheet(`
    <div class="center">
      <div class="journey-rings" style="justify-content:center">${journeyRingSVG(st, nxt)}</div>
      <h2 class="h1 mt">Day ${st.day}</h2>
      <p class="small mt-s">of your guzo · began ${prettyDate(start)}</p>
    </div>

    <div class="tiles mt-l mb">
      <div class="tile"><div class="v">${st.count}</div><div class="k">Sessions</div></div>
      <div class="tile"><div class="v">${st.streak}</div><div class="k">Weeks</div></div>
      <div class="tile"><div class="v">${st.tonnes}</div><div class="k">Tonnes</div></div>
      <div class="tile"><div class="v" style="color:var(--ember)">${(st.kcal/1000).toFixed(1)}k</div><div class="k">kcal</div></div>
    </div>

    ${nxt ? `<div class="card accent mb">
      <div class="row between"><div class="eyebrow em">Next marker</div><div class="pill em">${nxt.left > 0 ? `${nxt.left} ${nxt.unit}` : 'close'}</div></div>
      <div class="h2 mt-s">${nxt.ico} ${nxt.title}</div>
      <p class="small mt-s">${nxt.body}</p>
    </div>` : `<div class="banner good mb">Every marker reached. There is no end to a journey like this — just more of it.</div>`}

    <div class="eyebrow mb-s">Markers reached</div>
    ${reached.length ? `<div class="jpath mb">
      ${reached.slice().reverse().map(m => `
        <div class="jnode done">
          <div class="jnode-ico">${m.ico}</div>
          <div class="grow">
            <div class="jnode-t">${m.title}</div>
            <div class="jnode-d">${relDate(m.on)}</div>
            <p class="small mt-s">${m.body}</p>
          </div>
        </div>`).join('')}
    </div>` : '<div class="blankstate"><div class="big">🌅</div>None yet.<br>The first arrives the moment you finish a session — any size.</div>'}

    <div class="eyebrow mb-s mt-l">Still ahead</div>
    <div class="jpath mb">
      ${MILESTONES.filter(m => !(S.journey && S.journey.reached && S.journey.reached[m.k])).map(m => `
        <div class="jnode">
          <div class="jnode-ico">${m.ico}</div>
          <div class="grow"><div class="jnode-t">${m.title}</div></div>
        </div>`).join('')}
    </div>

    <div class="banner soft">ጉዞ · <em>guzo</em> · Amharic for journey. The markers are not goals and missing one costs nothing — they are just places worth noticing as you pass them.</div>
  `);
}


/* ---------- the Shortcut recipe ---------- */
HELP_BODY.shortcut = () => `
  <h2 class="h1">Steps &amp; sleep from Health</h2>
  <p class="small mt-s mb">A web app cannot read Apple Health &mdash; no browser can, on any phone. But the Shortcuts app can, and it can hand the numbers to Guzo. Five minutes once, then a tap a day.</p>

  <div class="note mb">
    <p class="note-t">Build it</p>
    <p class="note-b">Open <strong>Shortcuts</strong> &rarr; <strong>+</strong> &rarr; add these four actions in order:</p>
  </div>

  <div class="card flat mb">
    <div class="eyebrow mb-s">1 &middot; Find Health Samples</div>
    <p class="small">Set <strong>Type</strong> to <em>Steps</em>. Tap <strong>Sort by</strong> &rarr; <em>Start Date</em>. Add a filter: <strong>Start Date</strong> is <em>today</em>.</p>
  </div>
  <div class="card flat mb">
    <div class="eyebrow mb-s">2 &middot; Calculate Statistics</div>
    <p class="small">Operation <strong>Sum</strong>, over the Health Samples from step 1. This collapses the day's samples into one number.</p>
  </div>
  <div class="card flat mb">
    <div class="eyebrow mb-s">3 &middot; Text</div>
    <p class="small mono" style="font-size:12.5px">steps=<span class="em">[Statistics]</span></p>
    <p class="tiny mt-s">Type the words, then insert the result from step 2 as a variable where the highlight is. To add sleep, repeat steps 1&ndash;2 with Type <em>Sleep Analysis</em> and make the line <span class="mono">steps=X sleep=Y</span>.</p>
  </div>
  <div class="card flat mb">
    <div class="eyebrow mb-s">4 &middot; Copy to Clipboard</div>
    <p class="small">Pass the Text from step 3 into it. Name the shortcut <strong>Guzo</strong> and save.</p>
  </div>

  <div class="note sky mb">
    <p class="note-t">Use it</p>
    <p class="note-b">Run the shortcut, open Guzo, tap the strip on Today, then <strong>Paste from Shortcut</strong>. iOS asks before sharing the clipboard &mdash; that prompt is the system, not this app.</p>
  </div>

  <div class="card flat mb">
    <div class="eyebrow mb-s">The faster version</div>
    <p class="small">Swap step 4 for <strong>Open URLs</strong> with <span class="mono" style="font-size:12px">https://your-address/?steps=X&amp;sleep=Y</span>. Guzo reads it on open and wipes it from the address bar. This skips the paste entirely &mdash; but if Guzo lives on your home screen, iOS may open that link in Safari instead, which is a separate copy of your data. Try it; if the number lands in the wrong place, use the clipboard version.</p>
  </div>

  <div class="card flat mb">
    <div class="eyebrow mb-s">Make it automatic</div>
    <p class="small">Shortcuts &rarr; <strong>Automation</strong> &rarr; <strong>+</strong> &rarr; <em>Time of Day</em>. Pick an hour you are usually finished &mdash; and set <strong>Run Immediately</strong> so it does not ask.</p>
  </div>

  <p class="small mt-l">Once Guzo is a native app, all of this disappears: it reads Health directly, in the background, with no shortcut and no tap. This is the bridge until then.</p>
  <p class="tiny mt">None of these numbers change your programme yet. They are being collected so the question can eventually be answered with your training rather than an assumption.</p>
`;

/* ============================================================
   EXERCISE GUIDE
   ------------------------------------------------------------
   One sheet, reachable from inside a session, that always has
   something to say. Diagram if we drew one, pattern guidance if
   we did not, and a slot for a video you trust more than either.
   ============================================================ */

function videoFor(exId) {
  return (S.videos && S.videos[exId]) || null;
}

/* Only ever store a plain http(s) URL. Anything else — javascript:,
   data:, a stray bit of markup — is refused outright rather than
   sanitised, because a link you cannot trust is worth nothing. */
function setVideo(exId, url) {
  const u = String(url || '').trim();
  if (!u) { if (S.videos) delete S.videos[exId]; save(true); return true; }
  if (!/^https?:\/\/[^\s<>"']+$/i.test(u) || u.length > 500) return false;
  if (!S.videos) S.videos = {};
  S.videos[exId] = u;
  save(true);
  return true;
}

function videoSearchURL(name) {
  return 'https://www.youtube.com/results?search_query=' +
         encodeURIComponent(name + ' proper form technique');
}

function sheetExerciseGuide(exId, fromSession) {
  const ex = EX[exId];
  const F = FORMS[exId];
  const G = guideFor(exId);
  const name = F ? F.name : (ex ? ex.name : 'Exercise');
  const vid = videoFor(exId);

  if (!ex && !F) { toast('Nothing on file for that one'); return; }

  const block = (title, items, cls) => !items || !items.length ? '' : `
    <div class="eyebrow mt-l mb-s">${title}</div>
    <div class="list">
      ${items.map((c, i) => `<div class="lrow"><div class="${cls}">${cls === 'cue-x' ? '!' : i + 1}</div><div class="grow"><div class="small" style="color:var(--text-dim)">${h(c)}</div></div></div>`).join('')}
    </div>`;

  const setup = F ? F.setup : (G ? G.setup : null);
  const cues  = F ? F.cues  : (G ? G.cues  : null);
  const faults= F ? F.faults: (G ? G.faults: null);

  openSheet(`
    <h2 class="h1">${h(name)}</h2>
    ${ex ? `<div class="row wrap gap-s mt-s">
      <span class="pill">${h(ex.primary)}</span>
      ${(ex.sec || []).map(m => `<span class="pill">${h(m)}</span>`).join('')}
      <span class="pill">${ex.rl}–${ex.rh} reps</span>
    </div>` : ''}

    ${F ? `
      <div class="formframes mt">
        ${F.frames.map((fr, i) => `
          <figure class="formframe">
            <div class="formfig-wrap">${formSVG(fr)}</div>
            <figcaption>${F.labels[i]}</figcaption>
          </figure>`).join('')}
      </div>` : `
      <div class="banner soft mt">No diagram drawn for this one yet — the guidance below is for the ${h((PATTERN_LABEL[ex.pattern] || 'movement')).toLowerCase()} pattern it belongs to, which is where most of the useful instruction lives anyway.</div>`}

    <!-- ---------- video ---------- -->
    <div class="vid-box mt">
      <div class="row between">
        <div class="eyebrow">Video</div>
        ${vid ? `<button class="btn xs quiet" data-act="vid-edit" data-v="${h(exId)}">Change</button>` : ''}
      </div>
      ${vid ? `
        <a class="btn block mt-s" href="${h(vid)}" target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3l14 9-14 9V3z" stroke-linejoin="round"/></svg>
          Watch your clip
        </a>
        <p class="tiny center mt-s">Opens outside the app. Your session stays exactly where you left it.</p>
      ` : `
        <p class="small mt-s">Link a clip you trust and it stays attached to this exercise, in every session it appears in.</p>
        <div class="row gap-s mt-s">
          <button class="btn sm grow" data-act="vid-edit" data-v="${h(exId)}">Link a video</button>
          <a class="btn sm ghost grow" href="${h(videoSearchURL(name))}" target="_blank" rel="noopener noreferrer" style="text-align:center">Find one</a>
        </div>
      `}
    </div>

    ${setup ? `
      <div class="card mt-l">
        <div class="eyebrow">Set-up</div>
        <p class="small mt-s" style="color:var(--text-dim)">${h(setup)}</p>
      </div>` : ''}

    ${block('Cues while you lift', cues, 'cue-n')}
    ${block('Common faults', faults, 'cue-x')}

    <div class="banner soft mt-l">Stylised diagrams and general cues, not a coaching qualification. If a lift hurts, stop — and flag the area in your profile so it stops being programmed.</div>
    ${fromSession ? `<button class="btn primary block lg mt" data-act="close">Back to the session</button>` : ''}
  `);
}

/* ---------- linking a video ---------- */
function sheetVideoLink(exId) {
  const ex = EX[exId];
  const name = ex ? ex.name : 'this exercise';
  const cur = videoFor(exId) || '';
  openSheet(`
    <h2 class="h1">Link a video</h2>
    <p class="small mt-s mb">Paste a link to a clip that shows <strong>${h(name)}</strong> the way you want to do it. It stays attached to this exercise everywhere it turns up.</p>
    <div class="field">
      <div class="label">Address</div>
      <input class="input" id="vid-url" type="url" inputmode="url" autocomplete="off"
             placeholder="https://…" value="${h(cur)}">
    </div>
    <button class="btn primary block lg mt" data-act="vid-save" data-v="${h(exId)}">Save link</button>
    ${cur ? `<button class="btn ghost block mt-s" data-act="vid-clear" data-v="${h(exId)}">Remove it</button>` : ''}
    <a class="btn ghost block mt-s" href="${h(videoSearchURL(name))}" target="_blank" rel="noopener noreferrer" style="text-align:center">Search for one first</a>
    <p class="tiny center mt">Only the address is stored, on this device. Nothing is downloaded and no video is played inside the app.</p>
  `);
}
