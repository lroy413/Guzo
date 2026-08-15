/* ============================================================
   ENERGY COST
   Estimated with the standard MET equation:
     kcal/min = MET × 3.5 × bodyweight(kg) / 200
   MET values follow the Compendium of Physical Activities.
   Time counted per exercise is work plus the rest between sets,
   which is how session energy cost is conventionally estimated.
   It is an estimate. Without a chest strap nothing is better.
   ============================================================ */
const MET_CARDIO = {
  'car-treadmill-run':9.8, 'car-run':9.8, 'car-treadmill-walk':3.8, 'car-walk':3.5,
  'car-incline-walk':6.0, 'car-bike':7.0, 'car-rower':7.0, 'car-elliptical':5.0,
  'car-stair':9.0, 'car-jump-rope':12.3, 'car-sled-push':9.5, 'car-battle-ropes':8.0,
  'car-ski-erg':7.0, 'car-assault-bike':8.5, 'car-ruck':6.0, 'car-swim':7.0,
  'car-box-step':6.0, 'car-hike':6.0
};

function metFor(ex) {
  if (!ex) return 4.0;
  if (MET_CARDIO[ex.id]) return MET_CARDIO[ex.id];
  if (ex.pattern === 'mobility') return 2.3;   // stretching / light movement
  if (ex.pattern === 'cardio')   return 8.0;   // vigorous calisthenics
  if (ex.pattern === 'carry')    return 5.0;
  if (ex.pattern === 'core')     return 3.8;
  if (ex.tier === 1) return 6.0;               // resistance training, vigorous
  if (ex.tier === 2) return 5.0;
  return 3.5;                                  // resistance training, moderate
}

function bodyKg() {
  const list = S.profile.bodyweight || [];
  if (!list.length) return null;
  const w = list[list.length - 1].w;
  if (!w || w <= 0) return null;
  return S.profile.units === 'lb' ? w * 0.45359237 : w;
}

/* seconds of work + inter-set rest for one exercise's completed sets */
function exerciseSeconds(item) {
  const ex = EX[item.exId];
  const done = (item.sets || []).filter(s => s.done);
  if (!done.length) return 0;
  const rest = ((ex && ex.tier <= 2) ? S.settings.restMain : S.settings.restAcc) || 90;
  let secs = 0;
  done.forEach((s, i) => {
    const r = +s.r || 0;
    if (item.load === 'min')       secs += r * 60;
    else if (item.load === 'time') secs += r;
    else                           secs += r * 3.5;   // ~3.5s per rep under load
    if (i < done.length - 1) secs += rest;
  });
  return secs;
}

/* How long a session's completed work would have taken.
   Used for a session logged after the fact, where the wall clock measures how
   long you spent typing rather than how long you trained — an hour of squats
   entered on the bus would otherwise be recorded as four minutes, and that
   number goes straight into the totals on Progress. */
function sessionMinsEstimate(sess) {
  const secs = ((sess && sess.exercises) || []).reduce((a, i) => a + exerciseSeconds(i), 0);
  return Math.max(1, Math.round(secs / 60));
}

function exerciseKcal(item) {
  const kg = bodyKg();
  if (!kg) return 0;
  const secs = exerciseSeconds(item);
  if (!secs) return 0;
  return Math.round(metFor(EX[item.exId]) * 3.5 * kg / 200 * (secs / 60));
}

function sessionKcal(sess) {
  return (sess && sess.exercises || []).reduce((a, i) => a + exerciseKcal(i), 0);
}

function kcalOnDate(dateKey) {
  return S.sessions.filter(s => s.ended && s.date === dateKey)
                   .reduce((a, s) => a + (s.kcal != null ? s.kcal : sessionKcal(s)), 0);
}

function totalKcal() {
  return S.sessions.filter(s => s.ended)
                   .reduce((a, s) => a + (s.kcal != null ? s.kcal : sessionKcal(s)), 0);
}

/* ============================================================
   THE JOURNEY
   Guzo means journey. The app should behave like one — measured
   in distance covered rather than boxes ticked, and it should
   say something when you reach a marker.
   ============================================================ */
/* Day one is the earlier of when the app was opened and when you first
   trained. They are usually the same day; they are not after a restore, an
   import, or a session backdated to before you installed anything — and a
   journey that starts after its own first session reads as a bug in the one
   number on the screen that is meant to be the simplest. */
function journeyDay() {
  let start = S.meta && S.meta.created ? dk(new Date(S.meta.created)) : today();
  (S.sessions || []).forEach(s => { if (s.ended && s.date && s.date < start) start = s.date; });
  return Math.max(1, daysBetween(start, today()) + 1);
}

const MILESTONES = [
  { k:'first',   test: s => s.count >= 1,   title:'The first step',        ico:'ms-first',
    body:'Every journey has one and most people never take it. Whatever happens next, this part is already done.' },
  { k:'s5',      test: s => s.count >= 5,   title:'Finding your pace',     ico:'ms-pace',
    body:'Five sessions in. This is where it stops being a decision each time and starts becoming a rhythm.' },
  { k:'s10',     test: s => s.count >= 10,  title:'Ten waypoints',         ico:'ms-way',
    body:'Ten sessions behind you. Habit research puts the median at 66 days to automatic — you are well inside the curve.' },
  { k:'s25',     test: s => s.count >= 25,  title:'Twenty-five',           ico:'ms-25',
    body:'Twenty-five sessions. This is no longer a thing you are trying. It is a thing you do.' },
  { k:'s50',     test: s => s.count >= 50,  title:'Fifty in',              ico:'ms-50',
    body:'Fifty sessions. Look back at your first logged weights — that gap is the whole point.' },
  { k:'s100',    test: s => s.count >= 100, title:'One hundred',           ico:'ms-100',
    body:'A hundred sessions. Very few people who download a training app ever see this screen.' },
  { k:'s200',    test: s => s.count >= 200, title:'Two hundred',           ico:'ms-200',
    body:'Two hundred. At this point the app is just keeping notes — the habit is yours.' },
  { k:'w4',      test: s => s.streak >= 4,  title:'A month on the route',  ico:'ms-w4',
    body:'Four straight weeks with at least one session in each. Not one perfect week — four real ones.' },
  { k:'w12',     test: s => s.streak >= 12, title:'A full season',         ico:'ms-w12',
    body:'Twelve consecutive weeks. Through the bad ones as well as the good, which is the only kind of consistency that counts.' },
  { k:'w26',     test: s => s.streak >= 26, title:'Half a year',           ico:'ms-w26',
    body:'Twenty-six weeks unbroken. Half a year of showing up in whatever size the week allowed.' },
  { k:'w52',     test: s => s.streak >= 52, title:'A year of it',          ico:'ms-w52',
    body:'Fifty-two consecutive weeks. There is nothing left to prove about whether you can keep this up.' },
  { k:'floor',   test: s => s.micro >= 1,   title:'The floor counts',      ico:'ms-floor',
    body:'You took the three-minute version on a day that had no room in it. That is exactly what it is there for, and it counts the same as any other session.' },
  { k:'return',  test: s => s.returned,     title:'Back on the route',     ico:'ms-return',
    body:'You came back after a real gap. That is a harder thing than any single session, and most people never do it.' },
  { k:'tonne',   test: s => s.tonnes >= 100, title:'A hundred tonnes',     ico:'ms-tonne',
    body:'A hundred tonnes of cumulative load moved. Worth stating plainly once.' },
  { k:'burn10k', test: s => s.kcal >= 10000, title:'Ten thousand',         ico:'ms-burn',
    body:'Ten thousand estimated calories burned across your journey so far.' }
];

function journeyStats() {
  const done = S.sessions.filter(s => s.ended);
  let tonnage = 0;
  done.forEach(s => { tonnage += sessionVolume(s).tonnage; });
  const kgTonnage = S.profile.units === 'lb' ? tonnage * 0.45359237 : tonnage;
  // "returned" = a session logged after a gap of 14 days or more
  let returned = false;
  for (let i = 1; i < done.length; i++) {
    if (daysBetween(done[i-1].date, done[i].date) >= 14) { returned = true; break; }
  }
  return {
    count: done.length,
    streak: weekStreak(),
    micro: done.filter(s => s.rung === 'micro').length,
    tonnes: Math.round(kgTonnage / 1000),
    kcal: totalKcal(),
    returned,
    day: journeyDay()
  };
}

/* What each marker takes, and how to measure the way there.
   ----------------------------------------------------------
   Kept beside MILESTONES rather than inside it, so the bodies above stay one
   readable block. Every marker gets a line saying what it costs; the ones that
   count something also get a way to read how far along you are, because "Ahead"
   on its own is not information — it is the absence of it.

   The four without a goal are conditions rather than counts: you have either
   taken the three-minute version or you have not. Those show their line and no
   bar, which is honest — a progress bar on a yes-or-no is a decoration. */
const MILESTONE_NEED = {
  first:   { t: 'One session',              at: s => s.count,  goal: 1 },
  s5:      { t: 'Five sessions',            at: s => s.count,  goal: 5 },
  s10:     { t: 'Ten sessions',             at: s => s.count,  goal: 10 },
  s25:     { t: 'Twenty-five sessions',     at: s => s.count,  goal: 25 },
  s50:     { t: 'Fifty sessions',           at: s => s.count,  goal: 50 },
  s100:    { t: 'One hundred sessions',     at: s => s.count,  goal: 100 },
  s200:    { t: 'Two hundred sessions',     at: s => s.count,  goal: 200 },
  w4:      { t: 'Four weeks unbroken',      at: s => s.streak, goal: 4 },
  w12:     { t: 'Twelve weeks unbroken',    at: s => s.streak, goal: 12 },
  w26:     { t: 'Twenty-six weeks unbroken',at: s => s.streak, goal: 26 },
  w52:     { t: 'Fifty-two weeks unbroken', at: s => s.streak, goal: 52 },
  floor:   { t: 'One three-minute session' },
  return:  { t: 'Come back after a real gap' },
  tonne:   { t: 'A hundred tonnes moved',   at: s => s.tonnes, goal: 100 },
  burn10k: { t: 'Ten thousand kcal',        at: s => s.kcal,   goal: 10000 }
};

/* One marker's requirement, resolved against where you actually are.
   `pct` is capped at 100 so a marker you have passed but not yet been awarded
   never draws a bar past its own end. */
function milestoneNeed(k, st) {
  const n = MILESTONE_NEED[k];
  if (!n) return null;
  const s = st || journeyStats();
  if (!n.at) return { t: n.t, goal: null, have: null, pct: null };
  const have = n.at(s) || 0;
  return { t: n.t, goal: n.goal, have: Math.min(have, n.goal),
           pct: Math.max(0, Math.min(100, Math.round(have / n.goal * 100))) };
}

/* Returns milestones newly reached since last check, and records them. */
function checkMilestones() {
  if (!S.journey) S.journey = { reached: {} };
  if (!S.journey.reached) S.journey.reached = {};
  const st = journeyStats();
  const fresh = [];
  MILESTONES.forEach(m => {
    if (S.journey.reached[m.k]) return;
    if (m.test(st)) { S.journey.reached[m.k] = today(); fresh.push(m); }
  });
  return fresh;
}
/* Reached is derived, and the stored date only says *when*.
   ---------------------------------------------------------
   This read the flags alone, which made a marker something you could only ever
   be given rather than something you had. Three ways that goes wrong, and the
   third is the one that would have been permanent:

   - a session logged by any path that does not call checkMilestones() leaves
     the flag unset, and the ascent says "nothing behind you yet" over a stats
     row reading fourteen sessions;
   - a restore or an import brings the sessions and not the flags;
   - and a milestone ADDED in a later release is unreachable by everyone who
     already passed it, because checkMilestones() only ever looks forward.

   Every milestone already carries a test against journeyStats(). Asking it is
   the whole fix, and it is the same rule the fold on Train and the frontier on
   the range follow: derive it, and store only what cannot be derived — which
   here is the date. */
function milestonesReached() {
  const r = (S.journey && S.journey.reached) || {};
  const st = journeyStats();
  return MILESTONES.filter(m => r[m.k] || m.test(st)).map(m => ({ ...m, on: r[m.k] || null }));
}
function nextMilestone() {
  const st = journeyStats();
  const m = MILESTONES.find(x => !x.test(st));
  if (!m) return null;
  // describe how far away it is, in the unit that milestone counts
  let left = null, unit = '';
  if (/^s\d+$/.test(m.k))      { left = +m.k.slice(1) - st.count;  unit = left === 1 ? 'session' : 'sessions'; }
  else if (/^w\d+$/.test(m.k)) { left = +m.k.slice(1) - st.streak; unit = left === 1 ? 'week' : 'weeks'; }
  return { ...m, left, unit };
}

/* ---------- encouragement, earned rather than sprayed ---------- */
const MID_SESSION = [
  'That one is behind you.',
  'Logged. Next.',
  'Good. Keep the pace honest.',
  'Banked.',
  'One more marker passed.',
  'That is the work, right there.',
  'Done and recorded.',
  'Steady. On you go.'
];
const NEAR_END = [
  'Last one. Finish it properly.',
  'One left. Make it count.',
  'Nearly there — no need to rush the last set.'
];
const HALFWAY = [
  'Halfway. The back half is usually the easier half.',
  'Past the middle.',
  'Half the session is behind you.'
];

function encouragement(doneEx, totalEx) {
  if (totalEx > 2 && doneEx === totalEx - 1) return NEAR_END[doneEx % NEAR_END.length];
  if (totalEx > 3 && doneEx === Math.floor(totalEx / 2)) return HALFWAY[doneEx % HALFWAY.length];
  return MID_SESSION[(doneEx * 3) % MID_SESSION.length];
}

/* a warm, non-judgemental line for the session-complete sheet */
function completionLine(sess, st) {
  if (st.count === 1) return 'First one logged. The journey has a start date now.';
  if (sess.rung === 'micro') return 'Three minutes on a day with no room in it. That is the bottom rung doing its job.';
  if (sess.rung === 'short') return 'Short and finished beats full and skipped. Every week, without exception.';
  if (sess.rung === 'trim')  return 'Trimmed and done. The compounds got in, which is where most of the stimulus lives.';
  if (st.count % 10 === 0)   return `Session ${st.count}. Ten more markers behind you.`;
  return 'Full session, finished. Bank it.';
}

/* ============================================================
   THE MOON
   ------------------------------------------------------------
   Yes, accurately, and with no network — the moon is arithmetic.

   New moon to new moon is the synodic month: 29.530588853 days on average.
   Counting them from a known new moon gives the phase to within a few hours
   across any span this app will ever be asked about, which is far inside what
   a twenty-pixel drawing of it can express.

   It is a *mean* cycle, not an ephemeris. The real interval wanders by up to
   about thirteen hours either side because the Moon's orbit is elliptical and
   the Sun tugs on it, so the drawing can be a few hours out near a quarter and
   is never wrong about which way the crescent points or roughly how full it
   is. Anything better needs perturbation terms, and this is a campfire.
   ============================================================ */
const LUNAR_MONTH = 29.530588853;
/* 2000 Jan 6, 18:14 UTC — a new moon, and the epoch most tables count from. */
const LUNAR_EPOCH = Date.UTC(2000, 0, 6, 18, 14);

/* 0 new, .25 waxing quarter, .5 full, .75 waning quarter.

   Reads the wall clock, not today(). profile.dayStart moves where *your* day
   ends; it does not move the sky. Same reason data-sky does. */
function moonPhase(d) {
  const t = (d instanceof Date ? d.getTime() : Date.now());
  let p = (((t - LUNAR_EPOCH) / 86400000) % LUNAR_MONTH) / LUNAR_MONTH;
  if (p < 0) p += 1;
  return p;
}

/* The lit fraction of the disc, 0 to 1. */
function moonIllum(p) { return (1 - Math.cos(2 * Math.PI * p)) / 2; }

function moonName(p) {
  if (p < .033 || p > .967) return 'New moon';
  if (p < .217) return 'Waxing crescent';
  if (p < .283) return 'First quarter';
  if (p < .467) return 'Waxing gibbous';
  if (p < .533) return 'Full moon';
  if (p < .717) return 'Waning gibbous';
  if (p < .783) return 'Last quarter';
  return 'Waning crescent';
}

/* The sky, as a field rather than a dozen hand-placed dots.
   ----------------------------------------------------------
   Twelve were enough when the backdrop was a 208px strip. Lifted behind the
   header it is two and a half times that, and twelve dots across it read as a
   sky with nothing in it — which is what was reported.

   Generated, and generated *deterministically*: a small integer hash rather
   than Math.random(), so the same sky is drawn on every render and a
   screenshot check can be repeated. A random field would also cluster, and
   the fix for clustering is exactly this — a jittered grid, which spreads by
   construction. Six columns of nine, each star pushed off its cell centre by
   its own hash, so nothing lines up and nothing collides.

   Each star carries its resting opacity as --o rather than as an opacity
   attribute, because the shimmer has to return it to *its own* brightness: a
   keyframe naming a literal would flatten a whole sky of distances into one
   blinking row. The delay is the index walked by a non-integer step so no two
   shimmer together. */
function starsHTML() {
  /* Deterministic, and spread over the whole 0–1 range for every seed — a
     plain `(n * k) % 1` walks in visible diagonal stripes on a grid. */
  const rnd = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const COLS = 6, ROWS = 9, W = 320, H = 300;
  let out = '';
  let i = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++, i++) {
      /* The lower rows thin out: stars nearest the horizon are the ones haze
         takes first, and a field of even density reads as wallpaper. */
      const depth = r / (ROWS - 1);
      if (depth > .55 && rnd(i + 91) < (depth - .55) * 1.7) continue;
      const x = (c + .12 + rnd(i) * .76) * (W / COLS);
      const y = (r + .12 + rnd(i + 37) * .76) * (H / ROWS);
      let mag = rnd(i + 53);
      /* The copy stands in the lower-left of this field. A bright star landing
         on a glyph there does not read as a star — the first build put one
         squarely over the 'a' in "Sat" and it read as a diacritic. Stars stay
         everywhere (thinning them is how the sky came to look empty in the
         first place); they are just held to dust where words are. */
      if (x < W * .74 && y > H * .44) mag = Math.min(mag, .3);
      /* A few bright ones carry the field; the rest are dust. Without the
         cube most stars land mid-bright and the sky looks printed. */
      const rad = (.45 + mag * mag * mag * 1.05).toFixed(2);
      const o = (.18 + mag * .62).toFixed(2);
      out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad}" fill="#EFEADF"`
           + ` style="--o:${o};animation-delay:${((i * 1.37) % 11).toFixed(2)}s"/>`;
    }
  }
  return `<svg class="camp-stars" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMin slice"
      aria-hidden="true" focusable="false">${out}</svg>`;
}

/* The disc, drawn as three shapes rather than a clip path.

   A dark disc, the lit half of it, and one ellipse that either carves into
   that half or extends it. The ellipse's width is |1 - 2k| of the radius, so
   it is the full disc at new and at full — covering everything or nothing —
   and flat at the quarters, which is the terminator seen edge-on. Waxing lights
   the right limb and waning the left, as it does from the northern hemisphere.

   Three shapes because a crescent is not a circle minus a circle: the
   terminator is an ellipse, and drawing it as an offset disc gives a shape
   that is wrong everywhere except the quarters. */
function moonHTML(size, d) {
  const p = moonPhase(d);
  const k = moonIllum(p);
  const r = 10, rx = Math.abs(1 - 2 * k) * r;
  const waxing = p < .5;
  const lit = '#F3ECDC', dark = 'rgba(12,15,20,.92)';
  /* Half-disc on the lit limb: right while waxing, left while waning. */
  const half = waxing
    ? `M0 ${-r} A ${r} ${r} 0 0 1 0 ${r} Z`
    : `M0 ${-r} A ${r} ${r} 0 0 0 0 ${r} Z`;
  /* The glow belongs to the lit shapes, never to the <svg>. A filter on the
     element blurs its whole alpha silhouette — and the unlit disc is a filled
     shape, so the halo comes off the *full* circle and a one-percent crescent
     is painted as a third-lit moon. Marked per shape, the light only leaves
     the limb that has any, and the dark ellipse paints over the half after it,
     so the inward bleed is covered rather than glowing across the terminator. */
  const litCls = k < .5 ? 'moon-lit' : 'moon-lit moon-lit-w';
  /* No caption. It is in the sky, not in the header — which means it has to be
     legible as a phase on its own, and a moon that needs captioning is not
     one. The unlit disc keeps a faint rim so the shape the crescent belongs to
     is still there at new moon; without it a thin sliver floats unattached.

     Named in a <title> rather than aria-hidden, which is the difference
     between "not painted" and "not there". Nothing on screen says the phase;
     a screen reader still can, and it is the one thing in this scene that is
     true about the world rather than about you. */
  return `<svg class="camp-moon" width="${size}" height="${size}" viewBox="-12 -12 24 24"
      role="img" focusable="false"><title>${h(moonName(p))}</title>
    <circle r="${r}" fill="${dark}"/>
    <path class="${litCls}" d="${half}" fill="${lit}"/>
    <ellipse class="${k < .5 ? '' : litCls}" rx="${rx.toFixed(2)}" ry="${r}" fill="${k < .5 ? dark : lit}"/>
    <circle r="${r}" fill="none" stroke="rgba(243,236,220,.22)" stroke-width=".7"/>
    ${moonGear()}
  </svg>`;
}

/* What the moon is FOR, said quietly on the moon itself.
   -------------------------------------------------------
   It opens Settings, and nothing on the screen said so — the sr-only name told
   a screen reader and left everyone else to discover it by pressing the sky.
   A gear is the one shape that needs no caption.

   Faint on purpose, and the number matters: this is a hint about what a control
   does, not a badge announcing itself. Loud enough to be seen when looked at,
   quiet enough that the phase is still what the moon is about — the moon is the
   only thing in this scene that is true about the world rather than about you,
   and a gear that competes with the terminator throws that away.

   ONE mid tone at one opacity, drawn over everything, and that is what makes it
   work on a shape that is half cream and half near-black. A colour picked to
   sit on the lit limb disappears on the dark one, and a crescent moon would
   show a gear with a bite out of it — worse than no gear. A mid grey-blue is
   darker than #F3ECDC and lighter than the unlit disc, so it reads as engraved
   on the lit side and etched on the dark side, at every phase including new.

   Drawn in the moon's own coordinates rather than by scaling ICO.cog into them.
   The catalogue's icons are authored on a 24-box with a stroke width tuned for
   that box; scaled to 0.58 the stroke comes with it and stops being a weight
   anybody chose. Nine points is not a saving worth an unreadable transform.

   aria-hidden: the button already carries its name, and a second voice saying
   "gear" after "Settings" is noise. */
function moonGear() {
  /* #7C8CA8 rather than a lighter grey-blue, and the difference is measured:
     composited at .46 over each fill it clears 2.2:1 against the unlit disc and
     1.5:1 against the lit limb. A lighter stroke reads beautifully on the dark
     side and drops to 1.37:1 on the bright one — still visible, with no margin
     left for anyone who later nudges the opacity. Balanced across the two is
     the property worth having, not maximum contrast on either. */
  return '<g class="moon-gear" aria-hidden="true" fill="none" stroke="#7C8CA8"'
    + ' stroke-opacity=".46" stroke-linecap="round">'
    /* The body ring is what makes this a gear and not a sun. Teeth radiating
       from a small hub is exactly ICO.cog, which is the glyph on the More tab
       — drawn at this size against a bright disc it reads as a rising sun,
       which is the wrong idea twice over on a moon. A ring for the wheel, a
       hole at the middle, and the teeth standing off the rim rather than
       reaching the centre. */
    + '<circle r="3.6" stroke-width=".78"/>'
    + '<circle r="1.45" stroke-width=".7"/>'
    /* Eight teeth, each from the rim at r3.6 out to r5.3, and thicker than the
       ring they stand on — teeth the same weight as the wheel read as a second
       ring with gaps. Four on the axes, four on the diagonals; the diagonals
       are that pair over root two, written out because the whole gear is a
       dozen numbers and a loop that generates it is longer than it is. */
    + '<path stroke-width="1.05" d="M0 -5.3v1.7M0 3.6v1.7M-5.3 0h1.7M3.6 0h1.7"/>'
    + '<path stroke-width="1.05" d="M-3.75 -3.75l1.2 1.2M2.55 2.55l1.2 1.2'
    + 'M3.75 -3.75l-1.2 1.2M-2.55 2.55l-1.2 1.2"/>'
    + '</g>';
}
