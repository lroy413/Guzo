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
function journeyDay() {
  const start = S.meta && S.meta.created ? dk(new Date(S.meta.created)) : today();
  return Math.max(1, daysBetween(start, today()) + 1);
}

const MILESTONES = [
  { k:'first',   test: s => s.count >= 1,   title:'The first step',        ico:'🌅',
    body:'Every journey has one and most people never take it. Whatever happens next, this part is already done.' },
  { k:'s5',      test: s => s.count >= 5,   title:'Finding your pace',     ico:'🧭',
    body:'Five sessions in. This is where it stops being a decision each time and starts becoming a rhythm.' },
  { k:'s10',     test: s => s.count >= 10,  title:'Ten waypoints',         ico:'📍',
    body:'Ten sessions behind you. Habit research puts the median at 66 days to automatic — you are well inside the curve.' },
  { k:'s25',     test: s => s.count >= 25,  title:'Twenty-five',           ico:'⛰️',
    body:'Twenty-five sessions. This is no longer a thing you are trying. It is a thing you do.' },
  { k:'s50',     test: s => s.count >= 50,  title:'Fifty in',              ico:'🏔️',
    body:'Fifty sessions. Look back at your first logged weights — that gap is the whole point.' },
  { k:'s100',    test: s => s.count >= 100, title:'One hundred',           ico:'🎖',
    body:'A hundred sessions. Very few people who download a training app ever see this screen.' },
  { k:'s200',    test: s => s.count >= 200, title:'Two hundred',           ico:'👑',
    body:'Two hundred. At this point the app is just keeping notes — the habit is yours.' },
  { k:'w4',      test: s => s.streak >= 4,  title:'A month on the route',  ico:'🌙',
    body:'Four straight weeks with at least one session in each. Not one perfect week — four real ones.' },
  { k:'w12',     test: s => s.streak >= 12, title:'A full season',         ico:'🍂',
    body:'Twelve consecutive weeks. Through the bad ones as well as the good, which is the only kind of consistency that counts.' },
  { k:'w26',     test: s => s.streak >= 26, title:'Half a year',           ico:'🌗',
    body:'Twenty-six weeks unbroken. Half a year of showing up in whatever size the week allowed.' },
  { k:'w52',     test: s => s.streak >= 52, title:'A year of it',          ico:'🎆',
    body:'Fifty-two consecutive weeks. There is nothing left to prove about whether you can keep this up.' },
  { k:'floor',   test: s => s.micro >= 1,   title:'The floor counts',      ico:'⏱',
    body:'You took the three-minute version on a day that had no room in it. That is exactly what it is there for, and it counts the same as any other session.' },
  { k:'return',  test: s => s.returned,     title:'Back on the route',     ico:'🔄',
    body:'You came back after a real gap. That is a harder thing than any single session, and most people never do it.' },
  { k:'tonne',   test: s => s.tonnes >= 100, title:'A hundred tonnes',     ico:'🏋️',
    body:'A hundred tonnes of cumulative load moved. Worth stating plainly once.' },
  { k:'burn10k', test: s => s.kcal >= 10000, title:'Ten thousand',         ico:'🔥',
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
function milestonesReached() {
  const r = (S.journey && S.journey.reached) || {};
  return MILESTONES.filter(m => r[m.k]).map(m => ({ ...m, on: r[m.k] }));
}
function nextMilestone() {
  const r = (S.journey && S.journey.reached) || {};
  const st = journeyStats();
  const m = MILESTONES.find(x => !r[x.k] && !x.test(st));
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
