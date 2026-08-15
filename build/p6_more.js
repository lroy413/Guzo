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
/* A dome tent, lit from a lantern on its floor.
   ---------------------------------------------
   Authored once in a 120x82 box and sized by CSS, so every tent in the camp is
   the same drawing at a different width — the alternative is five hand-tuned
   copies that drift the first time one is edited.

   Two details do the work. The fabric is brightest at the BOTTOM, which is the
   opposite of a sphere lit from outside and the whole reason a lit tent reads
   as lit rather than as an orange dome. And the silhouette is not a
   semicircle: it rises steeply, turns over a short flat at the apex and pulls
   in, which is what poles do to fabric. Drawn as a half-circle it reads as an
   igloo, which is exactly what the first version looked like. */
function tentSVG(hue, hot) {
  const id = 'tent' + (tentSVG.n = (tentSVG.n || 0) + 1);
  return `<svg class="tent" viewBox="0 0 120 82" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="${id}-f" cx="50%" cy="96%" r="86%">
        <stop offset="0%" stop-color="${hot}"/>
        <stop offset="30%" stop-color="${hue}"/>
        <stop offset="100%" stop-color="#93400F"/>
      </radialGradient>
      <radialGradient id="${id}-p">
        <stop offset="0%" stop-color="${hot}" stop-opacity=".34"/>
        <stop offset="100%" stop-color="${hue}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <ellipse class="tent-pool" cx="60" cy="76" rx="58" ry="10" fill="url(#${id}-p)"/>
    <ellipse cx="60" cy="75" rx="55" ry="5" fill="#04060A" opacity=".55"/>
    <path class="tent-body" fill="url(#${id}-f)"
      d="M4 74 C4.6 39.2 20.6 14.6 52.7 14 L67.3 14 C99.4 14.6 115.4 39.2 116 74 Z"/>
    <g stroke="#7E3C13" stroke-width="1.7" fill="none" opacity=".6" stroke-linecap="round">
      <path d="M4.3 73 C20.3 16.4 99.7 16.4 115.7 73"/>
      <path d="M25.3 74 C31.3 30.6 45.4 14.4 60 14.3"/>
      <path d="M94.7 74 C88.7 30.6 74.6 14.4 60 14.3"/>
    </g>
    <path d="M45.4 74 C45.4 36.8 74.6 36.8 74.6 74 Z" fill="${hot}" opacity=".6"/>
    <path d="M4 74 C24.8 67 95.2 67 116 74 L116 77 L4 77 Z" fill="#3A1B08" opacity=".78"/>
  </svg>`;
}

/* The fire. A bed of embers, two logs across it, and the flame in three
   tongues on three different timings — one silhouette reads as a leaf, because
   fire is several things moving at different rates. */
function fireSVG() {
  return `<svg class="tent fire" viewBox="0 0 120 82" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="fire-f" cx="50%" cy="92%" r="80%">
        <stop offset="0%" stop-color="#FFF3C4"/>
        <stop offset="34%" stop-color="#FFC24A"/>
        <stop offset="72%" stop-color="#F4762A"/>
        <stop offset="100%" stop-color="#C7391A" stop-opacity=".55"/>
      </radialGradient>
      <radialGradient id="fire-p">
        <stop offset="0%" stop-color="#FFC978" stop-opacity=".5"/>
        <stop offset="100%" stop-color="#FF8A2B" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <ellipse class="tent-pool" cx="60" cy="72" rx="56" ry="16" fill="url(#fire-p)"/>
    <path class="tent-body flick" fill="url(#fire-f)"
      d="M60 12 C67 28 76 36 76 49 C76 61 69 68 60 68 C51 68 44 61 44 49
         C44 37 52 31 56 20 C58 29 59 33 60 36 Z"/>
    <path class="flick-b" fill="#FFB33F" opacity=".85"
      d="M51 24 C55 34 58 39 57 47 C56 54 51 58 47 56 C43 54 42 46 44 39 C46 33 49 30 51 24 Z"/>
    <path class="flick-b" fill="#FFF0BE"
      d="M60 34 C64 43 67 47 67 54 C67 61 64 65 60 65 C56 65 53 61 53 54 C53 48 57 44 60 34 Z"/>
    <g fill="#FF9B34" opacity=".85">
      <circle cx="44" cy="64" r="2.2"/><circle cx="73" cy="65" r="1.8"/>
      <circle cx="54" cy="67" r="1.5"/><circle cx="80" cy="62" r="1.4"/>
      <circle cx="38" cy="62" r="1.6"/><circle cx="66" cy="68" r="1.9"/>
    </g>
    <g stroke-linecap="round" fill="none">
      <path d="M41 66 L75 58" stroke="#4A3222" stroke-width="6.5"/>
      <path d="M45 58 L79 66" stroke="#382514" stroke-width="6.5"/>
      <path d="M41 66 L75 58" stroke="#8A6038" stroke-width="2" opacity=".55"/>
    </g>
  </svg>`;
}

function renderMore() {
  const p = S.profile;
  const st = totalStats();
  const jst = journeyStats();
  const marks = milestonesReached().length;
  /* The sky is the screen, not a card in it.

     A camp inside a rounded rectangle is a picture of a camp. Full-bleed, the
     mountains are where you are — so the stars, the ridge and the firelight
     are a backdrop laid behind the whole of Base camp, and the name and the
     numbers stand in it with no border around them.

     Absolutely positioned inside #more-body and pulled back out through the
     screen's own padding, so it reaches the edges of the phone and still
     scrolls away with the content. Fixed would have held it against the
     viewport and left the lists sliding over a horizon that never moved,
     which reads as a bug rather than as parallax. */
  let html = `<div class="camp">
  <div class="camp-bg" aria-hidden="true">
    <div class="camp-sky"></div>
    ${starsHTML()}
    ${/* The moon is Settings. Everything on the ground is yours; the sky is
          the app's, which is the whole of why this is where that lives. It is
          outside .camp-bg's aria-hidden because it is a control, not
          scenery. */''}
    ${/* The last of the light, low and behind the massif. Its own element and
          not a shape inside the range, because the range's box is the bottom
          168px and every layer in it fills to the floor — a glow in there is
          painted behind an opaque mountain. Out here it is 300px tall, so the
          peaks stand against it instead of covering it, which is the whole
          reason a distant ridge reads as distant. */''}
    <div class="camp-glow"></div>
    ${massifHTML('camp')}
  </div>

  <button class="camp-moon-btn" data-act="open-settings">
    <span class="sr-only">Settings — ${h(settingsSummary())}</span>
    ${moonHTML(42)}
  </button>

  ${/* The camp's fire is a destination now — it is Fuel, and it is drawn
        with the tents below rather than tucked into the backdrop. */''}
  <div class="camp-head">
    ${/* No "Base camp" eyebrow: the screen header already says it, and a
          block that repeats the title above it is a label doing nothing. */''}
    <span class="camp-eyebrow">Day ${jst.day} on the route</span>
    <h1 class="camp-name">${h(p.name || 'Traveller')}</h1>
    ${/* Under the name, because that is what it is about: not a section of the
          screen, a fact about your copy of the app. */''}
    <button class="camp-member" data-act="open-membership">
      <span class="cm-dot"></span>Membership<span class="cm-s">Beta — everything on</span>
    </button>
  </div>`;

  /* The stats are ON the mountain. They are the distance you have covered and
     that is the thing you are covering — a better place for them than a row
     under your name, and the only part of the scene wide enough to carry four
     numbers. */
  html += `<div class="camp-stats">
      <div><span class="hs-v">${st.count}</span><span class="hs-k">session${st.count === 1 ? '' : 's'}</span></div>
      <div><span class="hs-v">${marks}<span class="hs-of">/${MILESTONES.length}</span></span><span class="hs-k">markers</span></div>
      ${st.tonnage ? `<div><span class="hs-v">${(st.tonnage / 1000).toFixed(1)}k</span><span class="hs-k">${unit()} moved</span></div>` : ''}
      ${st.mins ? `<div><span class="hs-v">${Math.round(st.mins / 60)}</span><span class="hs-k">hours in</span></div>` : ''}
    </div>`;

  /* ---- the camp itself ----
     More used to be four lists of rows. It is a place now: the tents are the
     destinations, the fire is Fuel, the range is the route and the moon is
     Settings. Nothing was dropped — every data-act below is the one its row
     carried, so the whole event layer is untouched by this.

     What the camp shows is exactly the destinations that are NOT already one
     tap away in the nav. The route and Fuel swap places in the tab bar
     (syncNav hides one to show the other), so whichever is missing from the
     nav is the one that gets an object here. That rule is why the fire and the
     mountain come and go, and it is the whole of the logic.

     Labels are HTML, not SVG text. Scaled inside the drawing they would shrink
     with the tent — the back of the camp would be printing 8px type on a 320px
     phone, under a floor this app sets at 11. The tents carry the depth; the
     words stay the size words have to be. */
  const spots = [
    { act: 'open-journey', k: 'Your journey', w: 78,  l: '21%', b: 182, hue: '#F0A23E', hot: '#FFE0A8' },
    { act: 'open-help',    k: 'Guides',       w: 84,  l: '79%', b: 166, hue: '#FF7A3C', hot: '#FFD6A0' },
    { act: 'stretch',      k: 'Stretch',      w: 100, l: '30%', b: 104, hue: '#FFB24E', hot: '#FFE8BC' },
    { act: 'routines',     k: 'Your routines', w: 112, l: '73%', b: 46, hue: '#FF8A3D', hot: '#FFDCA8' }
  ];

  html += `<div class="camp-ground" aria-hidden="true"></div>
  <div class="camp-spots">
    ${spots.map(t => `<button class="spot" data-act="${t.act}" style="--l:${t.l};--b:${t.b}px;--w:${t.w}px;--lit:${t.hot}">
      ${tentSVG(t.hue, t.hot)}
      <span class="spot-l">${t.k}</span>
    </button>`).join('')}
    ${/* The fire is Fuel, and only when Fuel is a thing you have turned on —
          otherwise it is the camp's fire and nothing more. A destination that
          leads somewhere switched off is worse than no destination. */''}
    ${fuelOn()
      ? `<button class="spot spot-fire" data-act="open-nutrition" style="--l:50%;--b:122px;--w:78px;--lit:#FFC24A">
          ${fireSVG()}<span class="spot-l">Fuel</span>
        </button>`
      : `<div class="spot spot-fire spot-quiet" aria-hidden="true" style="--l:50%;--b:122px;--w:78px">${fireSVG()}</div>`}
  </div>`;

  /* The mountain is the route, and it takes the tap whether or not the nav is
     also offering it. It was conditional on Fuel being on, by the same rule
     that governs the fire — but the fire is a destination that would lead
     somewhere switched off, and the route is not: it is where the journey
     starts, it is the one object here that was already a metaphor for the
     thing it opens, and a mountain you cannot tap is a mountain that looks
     tappable and is not. */
  html += `<button class="camp-route" data-go="plan">
    <span class="sr-only">The route — shape the week and see the whole plan</span>
    <span class="camp-route-l">The route</span>
  </button>`;
  html += `</div>`;

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
  `, { key: 'readiness' });
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
      <span class="chev">${ICO.chevR}</span>
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

    <div class="list mb">${rows || '<div class="blankstate"><div class="big">${ICO.tick}</div>Nothing left to set this week.</div>'}</div>

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
  `, { key: 'week' });
}

/* One day at a time — big options, each explained.
   `back` is where the two buttons return to. It used to be the week screen
   unconditionally, which meant tapping a day on the dashboard and changing its
   availability dumped you into a screen you had not asked for and had to
   dismiss. Opened from a day sheet it goes back to that day. */
function sheetDayEdit(k, back) {
  k = key(k);
  const d = fromKey(k);
  const c = dayConstraint(k);
  const toDay = back === 'day';
  const backAct = toDay ? `data-act="day-open" data-k="${k}"` : 'data-act="open-week"';
  const envIcos = { full:'env-full', hotel:'env-hotel', bw:'env-bw' };
  openSheet(`
    <div class="row between mb-s">
      <button class="btn xs quiet" ${backAct}>‹ ${toDay ? DAYNAMES[d.getDay()] : 'Week'}</button>

    </div>
    <div class="eyebrow">${DAYNAMES[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}</div>
    <h2 class="h1 mt-s">How much time will you have?</h2>
    <p class="small mt-s" style="margin-bottom:4px">Your best guess is enough. The app sizes the session to whatever you pick, and you can always change it on the day.</p>

    <div class="opts" style="margin-top:20px">
      ${['long','normal','short','micro','none'].map(a => {
        const A = availOf(a);
        return opt({ act:'wk-avail', v:a, on:c.avail===a, ico:A.ico,
                     title:A.label, desc:A.note, data:{ k, b:back || '' } });
      }).join('')}
    </div>

    ${c.avail !== 'none' && S.profile.envs.length > 1 ? `
      <h2 class="h2 mt-l">Where will you be?</h2>
      <p class="small mt-s">This decides which exercises you get. A hotel day gets dumbbell work, a floor day gets bodyweight — same plan, different tools.</p>
      <div class="opts" style="margin-top:16px">
        ${S.profile.envs.map(e => opt({ act:'wk-env', v:e, on:c.env===e, ico:envIcos[e],
                     title:ENVS[e].label, desc:ENVS[e].note, data:{ k, b:back || '' } })).join('')}
      </div>` : ''}

    <button class="btn primary block lg mt-l" ${backAct}>Done</button>
  `, { key: 'dayedit:' + k });
}

/* ---------- when your day ends ---------- */
function dayStartLabel() {
  const n = dayStartHour();
  return n ? n + 'am' : 'Midnight';
}

function sheetDayStart() {
  const cur = dayStartHour();
  /* Named for what it is rather than `opt`, which shadowed the global option
     helper inside this whole function — the reason this file grew its own
     copies of a row that already had one place to live. */
  const hourOpt = (n, t, d) => opt({ act:'set-daystart', v:n, on:cur === n,
    ico:n ? ICO.moon : ICO.clock, title:t, desc:d });

  openSheet(`
    <h2 class="h1 mb">When does your day end?</h2>
    <p class="small mb">Midnight is a convention, not a fact about people. If you come off a shift at 2am and train before bed, that session belongs to the day you have been awake for &mdash; the calendar rolled over, you didn&rsquo;t.</p>
    <p class="small mb">This matters most if you train twice. A morning session and a 2am one are the same day to you; on the calendar they are two, so one real day reads as two half-empty ones.</p>

    <div class="opts mb">
      ${hourOpt(0, 'Midnight', 'The ordinary calendar day. Right for almost everyone.')}
      ${hourOpt(2, '2am', 'A day ends at 2. Anything before that counts as the night before.')}
      ${hourOpt(3, '3am', 'A day ends at 3.')}
      ${hourOpt(4, '4am', 'A day ends at 4. Room for a session after a shift that finishes at 2.')}
      ${hourOpt(5, '5am', 'A day ends at 5. The latest that still leaves an early morning alone.')}
      ${hourOpt(6, '6am', 'A day ends at 6. Only if your nights really run that long.')}
    </div>

    <div class="banner soft mb">Everything moves together &mdash; the week, what is planned, what you logged, your readiness and what you ate. Nothing already saved is rewritten; this changes where the line falls from now on.</div>
    <p class="tiny mb">Pick the hour you are reliably asleep by. Setting it later than you actually sleep would push a genuine early-morning session onto the day before.</p>

    <button class="btn primary block lg" data-act="close">Done</button>
  `, { key: 'day-start' });
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
            <div class="row between"><div class="h3">${r.label}</div><div class="tiny">${rungMinsLabel(r.k)}</div></div>
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
    </div>

    ${/* A written plan is a structure too — the one you already decided on.
          Offered here because this is the screen you are on when you are
          thinking about how your training is shaped, and looking for it under
          Routines means knowing it exists. */''}
    <div class="divide"></div>
    <div class="sec-head"><span class="sec-t">Already have a plan?</span></div>
    <div class="list">
      <div class="lrow" data-act="import">
        <div class="ico">${ICO.doc}</div>
        <div class="grow">
          <div class="h3">Import one from a file</div>
          <div class="tiny mt-s">A PDF or text plan becomes a routine per day, with every movement
            shown before anything is built</div>
        </div>
        <span class="chev">${ICO.chevR}</span>
      </div>
    </div>
    <p class="tiny center mt-s">An imported plan sits alongside the structure above rather than
      replacing it &mdash; run its days as routines whenever you want them.</p>`);
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
        <span class="pick-chev">${open ? ICO.chevD : ICO.chevR}</span>
      </button>
      ${open ? `<div class="list pick-list">${groups[g].map(rowHTML).join('')}</div>` : ''}
    </div>`;
  }).join('') : `<div class="note"><p class="note-t">Nothing matches “${h(query || '')}”.</p><p class="note-b">Try a muscle — chest, back, quads — or an equipment name like dumbbell.</p></div>`;

  openSheet(`
    ${/* A way back that is not the ✕. The picker is reached from the middle of
          the import review, and the ✕ closes the whole stack — so someone
          checking one flagged movement lost the other fifty-one and had to
          start the import again. */''}
    <div class="row gap-s mb" style="align-items:center">
      ${pickerFor && pickerFor.mode === 'import'
        ? `<button class="btn xs back" data-act="imp-back" aria-label="Back to the import">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 19l-7-7 7-7"/></svg>
           </button>` : ''}
      <h2 class="h1 grow">${pickerFor && (pickerFor.mode === 'swap' || pickerFor.mode === 'import') ? 'Swap for' : 'Add movements'}</h2>
      ${multi && pickerAdded.length ? `<span class="pill em">${pickerAdded.length} added</span>` : ''}
    </div>
    ${pickerFor && pickerFor.mode === 'import' && pickerFor.written
      ? `<div class="banner soft mb">Your plan said <strong>${h(pickerFor.written)}</strong>.
         Pick the movement it means, or go back and leave it out.</div>` : ''}
    <input class="input mb" id="pick-q" placeholder="Search by name, muscle or kit…" value="${h(query || '')}"
           autocomplete="off" enterkeyhint="search" inputmode="search">
    <div class="chip-grid c3 mb">
      ${Object.values(ENVS).map(e => `<div class="chip ${env===e.k?'on':''}" data-act="pick-env" data-v="${e.k}" style="font-size:12.5px">${e.short}</div>`).join('')}
    </div>
    ${body}
    ${multi ? `<div class="pick-done">
      <button class="btn primary block lg" data-act="pick-finish">${pickerAdded.length ? 'Done · ' + pickerAdded.length + ' added' : 'Done'}</button>
    </div>` : ''}
  `, { key: 'picker' });   /* redraws on every pick, search and accordion tap */

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
          <div class="ico">${ico(e.k==='full'?'env-full':e.k==='hotel'?'env-hotel':'env-bw')}</div>
          <div class="grow"><div class="h3">${e.label}</div><div class="tiny mt-s">${e.note}</div></div>
          <div class="pill ${S.profile.envs.includes(e.k)?'em':''}">${S.profile.envs.includes(e.k)?ICO.tick:''}</div>
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
    <div class="lrow" data-act="toggle-restsound"><div class="grow"><div class="h3">Sound when it ends</div><div class="tiny mt-s">${restSoundOn()
      ? 'Two short notes. The only alert a browser can make &mdash; iPhones do not vibrate from a web page.'
      : 'Off &mdash; the bar still runs, you just have to look at it'}</div></div><div class="switch ${restSoundOn()?'on':''}"></div></div>
    <button class="btn primary block mt" data-act="close">Done</button>`);
}

/* sheetProfile now lives in p6e_profile.js */

/* What your copy of the app is, and what it costs you — which in beta is
   nothing. NOT the paywall: sheetPaywall() is a pricing preview with £69.99 on
   it and no payment wired up behind it, kept unreachable on purpose and
   refused by its own handler as well. A price with nothing behind it reads as
   an incomplete app, and putting a button to it under someone's name would be
   the fastest possible way to do that. It is linked from here only if
   SHOW_PAYWALL ever goes true. */
function sheetMembership() {
  openSheet(`
    <div class="center mb">
      <div class="ob-mark">${ICO.summit}</div>
      <h2 class="h1 mt-s">Guzo Pro</h2>
      <div class="pill em mt-s">Beta — everything on</div>
    </div>
    <p class="small mb">Every part of the app is unlocked while this is in testing.
      Nothing charges, nothing phones home, and there is no account to make.</p>
    <div class="list mb">
      <div class="lrow"><div class="grow"><div class="h3">Your data</div>
        <div class="tiny mt-s">Stored on this device only. No server holds a copy, so nothing
          is uploaded, shared or sold — and nothing is backed up for you either.</div></div></div>
      <div class="lrow"><div class="grow"><div class="h3">Offline</div>
        <div class="tiny mt-s">The whole app works with the network off. The one thing that
          reaches out is the barcode lookup, and it is off unless you turn it on.</div></div></div>
      <div class="lrow"><div class="grow"><div class="h3">What happens after beta</div>
        <div class="tiny mt-s">Not decided. Whatever it becomes, what you have already logged
          stays on your device and keeps working.</div></div></div>
    </div>
    ${SHOW_PAYWALL ? `<button class="btn ghost block mb" data-act="open-paywall">Preview the paywall</button>` : ''}
    <p class="tiny center mb">Guzo Fit v${VERSION} · beta build<br>ጉዞ · Amharic for “journey”<br>guzofit.app · all data stored locally on this device</p>
    <button class="btn primary block" data-act="close">Done</button>`);
}

function sheetPaywall() {
  openSheet(`
    <div class="center mb">
      <div class="ob-mark">${ICO.summit}</div>
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
        `<div class="lrow"><div class="ico" style="color:var(--teal)">${ICO.tick}</div><div class="grow"><div class="small">${f}</div></div></div>`).join('')}
    </div>
    <div class="banner soft mb">Free tier keeps: logging, the four-rung ladder, terrain check-ins, full history and data export. Logging your training should never be behind a paywall.</div>
    <button class="btn primary block lg" data-act="close">Everything's unlocked in beta</button>
  `);
}

/* ============================================================
   SETTINGS
   ------------------------------------------------------------
   Everything you tune rather than visit. More used to carry four lists, and
   "Modules" had quietly become a drawer holding two real modules, two
   destinations and two settings — so a switch for the warm-up sat between a
   link to your routines and a link to the plate calculator.

   Grouped by what the setting is about, not by which file implements it.
   ============================================================ */

/* The one-line summary under the Settings row. Names the two things most
   likely to be wrong for a new user — the units everything is displayed in,
   and whether Fuel is even switched on, which cost a debugging session once
   because nothing on screen said either way. */
function settingsSummary() {
  const bits = [S.profile.units, fuelOn() ? 'Fuel on' : 'Fuel off'];
  return bits.join(' · ') + ' · rest, plates, backups';
}

function sheetSettings() {
  const p = S.profile;
  const row = (act, ico, title, sub) => `
    <div class="lrow" data-act="${act}">
      <div class="ico">${ico}</div>
      <div class="grow"><div class="h3">${title}</div><div class="tiny mt-s">${sub}</div></div>
      <span class="chev">${ICO.chevR}</span>
    </div>`;
  const toggle = (act, ico, title, sub, on) => `
    <div class="lrow" data-act="${act}">
      <div class="ico">${ico}</div>
      <div class="grow"><div class="h3">${title}</div><div class="tiny mt-s">${sub}</div></div>
      <div class="switch ${on ? 'on' : ''}"></div>
    </div>`;

  openSheet(`
    <div class="row between mb">
      <h2 class="h1">Settings</h2>
      <button class="btn xs quiet" data-act="close">Done</button>
    </div>

    <div class="eyebrow mb-s">Training</div>
    <div class="list mb">
      ${row('open-program', ICO.peakMark, 'Structure', `${h(programOf().name)} · ${programOf().target}×/wk`)}
      ${row('edit-envs', ICO.pin, 'Where you train', h(p.envs.map(e => ENVS[e] ? ENVS[e].label : e).join(', ')))}
      ${row('rest-settings', ICO.stopwatch, 'Rest timers', `${S.settings.restMain}s compounds · ${S.settings.restAcc}s accessories · auto-start ${S.settings.autoRest ? 'on' : 'off'}`)}
      ${row('plate-settings', ICO['gear-barbell'], 'Bar and plates', `${fmtP(plateCfg().bar)}${unit()} bar · ${plateCfg().plates.length} plate sizes on hand`)}
      ${toggle('set-toggle-warmup', ICO.mobility, 'Mobility warm-up', 'One short mobility movement at the start of full sessions', S.settings.warmup)}
      ${toggle('set-toggle-rpe', ICO.target, 'RPE column', rpeShown()
        ? 'On — a third field on every set row, for how hard it felt'
        : 'Off — weight and reps get the width instead', rpeShown())}
      ${row('day-start', ICO.moon, 'When your day ends',
        dayStartHour() ? `${dayStartLabel()} · a session before then counts as the day before`
                       : 'Midnight · the ordinary calendar day')}
    </div>

    <div class="eyebrow mb-s">Modules</div>
    <div class="list mb">
      ${toggle('set-toggle-fuel', ICO.fire, `Fuel${can('nutrition') ? '' : ' <span class="pro-tag">PRO</span>'}`,
        fuelOn() ? 'On — it has its own tab, and Route moves to More' : 'Protein and calorie targets, worked out from your body data',
        fuelOn())}
      ${fuelOn() ? row('open-diet-prefs', ICO.plate, 'How you eat', 'Meals a day, dietary pattern, what to leave out') : ''}
      ${fuelOn() ? toggle('toggle-off', ICO.globe, 'Barcode lookup', S.settings.off
        ? 'On — the first scan of an unknown packet asks Open Food Facts. The only thing this app ever sends anywhere, and it sends only the barcode.'
        : 'Off — everything stays on the device. An unknown packet asks you to name it once.',
        !!S.settings.off) : ''}
    </div>

    <div class="eyebrow mb-s">You</div>
    <div class="list mb">
      ${row('edit-profile', ICO.person, 'Profile', `${h(p.name || 'No name')} · ${p.units} · height, age, activity`)}
    </div>

    <div class="eyebrow mb-s">Your data</div>
    <div class="list mb">
      ${row('export', ICO.download, 'Export backup', 'A JSON file of everything. Do this weekly.')}
      ${row('import', ICO.upload, 'Restore from backup', 'Replaces everything on this device')}
      <div class="lrow" data-act="reset">
        <div class="ico">${ICO.warn}</div>
        <div class="grow"><div class="h3" style="color:var(--rose)">Reset everything</div><div class="tiny mt-s">Cannot be undone</div></div>
        <span class="chev">${ICO.chevR}</span>
      </div>
    </div>

    <div class="eyebrow mb-s">About</div>
    <div class="list mb">
      <div class="lrow" data-act="help-page" data-v="privacy">
        <div class="ico">${ICO.lock}</div>
        <div class="grow"><div class="h3">Privacy</div><div class="tiny mt-s">What is stored, where it lives, and what never leaves this device</div></div>
        <span class="chev">${ICO.chevR}</span>
      </div>
      <div class="lrow" data-act="help-page" data-v="why">
        <div class="ico">${ICO.science}</div>
        <div class="grow"><div class="h3">Why this app behaves the way it does</div><div class="tiny mt-s">The research behind no streaks, a free miss, and three-minute sessions</div></div>
        <span class="chev">${ICO.chevR}</span>
      </div>
    </div>

    ${/* What this device actually reports. Three separate attempts to explain
          a strip at the foot of the screen were made from screenshots and all
          three were wrong, because the numbers that decide the answer — the
          safe-area insets, whether iOS thinks this is a standalone app, and
          how big it believes the window is — are not visible in a picture and
          cannot be measured from here. So the app says them out loud. Cheap,
          harmless, and it turns an argument into a reading. */''}
    <div class="sec-head"><span class="sec-t">This screen</span></div>
    <div class="card mb">
      <div class="tiny mono" id="dispdiag">measuring…</div>
      <p class="tiny mt-s" style="color:var(--faint)">What this phone reports about its own screen. Useful only for chasing a layout bug.</p>
      ${/* The numbers above are ambiguous by construction — see the .edges
            block in the stylesheet. This paints each box a different colour
            so one screenshot says which one stops short, and where. */''}
      <button class="btn quiet mt-s" data-act="show-edges">Show edges</button>
    </div>

    <p class="tiny center">Guzo Fit v${VERSION} · build ${VERSION}<br>All data stored locally on this device.</p>
  `, { key: 'settings' });
  paintDisplayDiag();
}

/* Resolved insets, not the env() expressions. getPropertyValue on the token
   hands back the literal text `env(safe-area-inset-top,0px)`; the only way to
   see the number iOS actually substituted is to make an element use it and
   read the computed length back off that. */
function paintDisplayDiag() {
  const el = document.getElementById('dispdiag');
  if (!el) return;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:-9999px;top:0;'
    + 'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) '
    + 'env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.appendChild(probe);
  const c = getComputedStyle(probe);
  const inset = [c.paddingTop, c.paddingRight, c.paddingBottom, c.paddingLeft]
    .map(v => Math.round(parseFloat(v) || 0));
  probe.remove();
  /* Which viewport unit, if any, reaches the whole window. The layout
     viewport here is 62px shorter than the window that contains it, and the
     app is sized from `position:fixed; inset:0` — which resolves against the
     layout viewport and therefore stops short too. If one of these reads the
     full height there is a fix; if they all read 812 there is no CSS length
     that reaches the strip and the answer is not in the stylesheet. */
  const u = document.createElement('div');
  u.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px';
  document.body.appendChild(u);
  const unit = n => { u.style.height = '100' + n; return Math.round(u.getBoundingClientRect().height) || 0; };
  const units = `svh ${unit('svh')} lvh ${unit('lvh')} dvh ${unit('dvh')} vh ${unit('vh')}`;
  u.remove();
  const app = document.getElementById('app').getBoundingClientRect();
  const body = document.body.getBoundingClientRect();
  const vv = window.visualViewport;
  const mode = ['standalone', 'fullscreen', 'minimal-ui', 'browser']
    .find(m => window.matchMedia(`(display-mode: ${m})`).matches) || '?';
  const nav = navigator.standalone === true ? 'yes' : (navigator.standalone === false ? 'no' : '—');
  el.innerHTML = [
    `window ${window.innerWidth}x${window.innerHeight} · dpr ${window.devicePixelRatio}`,
    `screen ${screen.width}x${screen.height}`,
    vv ? `visual ${Math.round(vv.width)}x${Math.round(vv.height)} @${Math.round(vv.offsetTop)}` : 'visual —',
    `body ${Math.round(body.width)}x${Math.round(body.height)} @${Math.round(body.top)}`,
    `#app ${Math.round(app.width)}x${Math.round(app.height)} @${Math.round(app.top)}`,
    `safe t${inset[0]} r${inset[1]} b${inset[2]} l${inset[3]}`,
    /* Where the window sits ON THE SCREEN, and whether the app decided the
       top inset was already spent. A window shorter than the screen says
       nothing about which end the missing strip is at — this does, and it is
       the line that was missing when the first calibration was written. */
    `window at y${typeof window.screenY === 'number' ? window.screenY : '?'}`,
    `outer ${window.outerWidth}x${window.outerHeight} · root ${document.documentElement.clientHeight}`,
    units,
    `display-mode ${mode} · apple standalone ${nav}`
  ].map(h).join('<br>');
}
