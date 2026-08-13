/* ============================================================
   STRETCH
   ------------------------------------------------------------
   A daily stretch built from three things the app already knows or can ask
   for once: what you trained, what your day does to you, and what already
   hurts.

   The catalogue is not extended for this — the mobility movements were always
   there, and a stretch tool that invents its own library would have two sets
   of the same exercise with two sets of ids. What is new is the *choosing*.

   The occupation half is the part with the least evidence behind it, and it
   is treated accordingly: it nudges the ranking, it never overrides an injury
   exclusion, and the screen says which of your answers put a movement in the
   list. A recommendation you cannot interrogate is a horoscope.
   ============================================================ */

/* What a working day loads, by the region that takes it. These are the areas
   that go short or stiff, not the ones that get strong — a driver's hip
   flexors shorten whether or not their legs are doing anything.

   `areas` are MUSCLES entries so they can be matched against the catalogue's
   own primary/secondary fields; nothing here needs a second taxonomy. */
const OCCUPATIONS = {
  desk:    { k:'desk',    label:'Desk / screen work',      ico:'desk',
             areas:['Chest','Shoulders','Back','Glutes','Quads'],
             note:'Hours in flexion: the front closes up and the hips stay short. The work is opening the chest and hips and getting the upper back to move again.' },
  camera:  { k:'camera',  label:'Camera / AV crew',        ico:'camera',
             areas:['Shoulders','Back','Core','Calves','Glutes'],
             note:'Weight on one shoulder for hours, then standing on it. Asymmetric load through the neck and upper back, with calves and low back taking the standing.' },
  driving: { k:'driving', label:'Driving',                 ico:'driving',
             areas:['Glutes','Quads','Back','Chest'],
             note:'Seated with the hips flexed and the arms forward. Hip flexors and glutes take most of it.' },
  standing:{ k:'standing',label:'On your feet all day',    ico:'standing',
             areas:['Calves','Glutes','Hamstrings','Back'],
             note:'Static standing loads calves and low back more than walking does. Ankles and hips first.' },
  lifting: { k:'lifting', label:'Manual / trades',         ico:'lifting',
             areas:['Back','Hamstrings','Shoulders','Glutes'],
             note:'Repeated bending and carrying. Posterior chain and shoulders.' },
  care:    { k:'care',    label:'Healthcare / caring',     ico:'care',
             areas:['Back','Shoulders','Calves','Hamstrings'],
             note:'Long shifts on your feet with awkward lifts in them. Low back and shoulders.' },
  hands:   { k:'hands',   label:'Hands and wrists all day',ico:'hands',
             areas:['Triceps','Shoulders','Chest'],
             note:'Fine motor work with the forearms loaded and the shoulders forward.' },
  mixed:   { k:'mixed',   label:'A bit of everything',     ico:'mixed',
             areas:['Back','Shoulders','Glutes','Hamstrings'],
             note:'The general case: hips, upper back and shoulders.' }
};

/* The regions a stretch session should spread across, so eight movements are
   not eight versions of the same one. Derived from the catalogue's own primary
   field rather than a second list that would drift out of sync. */
const STRETCH_REGIONS = {
  Back:'spine', Core:'spine',
  Shoulders:'shoulders', Chest:'shoulders', Triceps:'shoulders', Biceps:'shoulders',
  Glutes:'hips', Quads:'hips',
  Hamstrings:'legs', Calves:'legs'
};
function stretchRegion(ex) { return STRETCH_REGIONS[ex && ex.primary] || 'other'; }

function stretchStore() {
  if (!S.stretch) S.stretch = { onboarded:false, occupation:null, sit:null, areas:[], done:{}, mins:15 };
  if (!S.stretch.done) S.stretch.done = {};
  if (!S.stretch.areas) S.stretch.areas = [];
  return S.stretch;
}
function stretchOnboarded() { return !!stretchStore().onboarded; }

/* Every mobility movement the catalogue has, minus anything your injuries
   already took out of the library. An injury exclusion is a hard filter here
   exactly as it is everywhere else — the tool that is supposed to help a sore
   shoulder must not be the one thing in the app that ignores it. */
function stretchPool() {
  const banned = injuryExclusions();
  const bands = !!(S.profile && S.profile.gear && S.profile.gear.bands);
  return EXLIST.filter(x => {
    if (x.pattern !== 'mobility' || banned.has(x.id)) return false;
    /* It has to be doable where you are. This is the one thing in the app
       offered as a *daily* habit, so a movement that needs a pull-up bar or a
       foam roller is the wrong answer even when it is the right stretch —
       Dead Hang scored its way to the top of a hotel-room list before this.

       The test is `env`, not `eq`. A dead hang's equipment reads "Bodyweight"
       because you are the load, but its environments are full-gym and hotel:
       it still needs something to hang from. `b` is the flag that actually
       means "a floor and nothing else". Bands are the one exception, and only
       if you said you own some. */
    /* Equipment is checked before environment, not after. A band dislocate is
       tagged `fhb` — you can do it anywhere — which let it through the
       environment test and made the band branch below unreachable, so it was
       offered to people who own no bands. */
    if (x.eq === 'Band') return bands;
    return x.env.indexOf('b') >= 0;
  });
}

/* ------------------------------------------------------------
   Scoring.

   Three inputs, each worth stating out loud because the screen shows which
   one fired:

   - **Trained** — what you actually loaded in the last two days, from the
     session records. The strongest signal and the only one that is not a
     self-report.
   - **Sore or stiff** — the areas you named. Weighted highest, because you
     are the only one who knows.
   - **Work** — what your occupation does to you. The weakest, deliberately.

   Ties are broken by how long it has been since the movement came up, so the
   daily stretch rotates instead of serving the same six forever. That is the
   same least-recent rule the recovery day uses.
   ------------------------------------------------------------ */
const STRETCH_W = { sore: 5, trained: 3, work: 2, secondary: 0.5 };

/* Muscles loaded in the last N days, weighted by how many sets went into them.
   Reuses the session store rather than a parallel tally. */
function recentlyTrained(days) {
  const cutoff = dk(addDays(fromKey(today()), -(days || 2)));
  const tally = {};
  (S.sessions || []).forEach(s => {
    if (!s.ended || s.date < cutoff) return;
    (s.exercises || []).forEach(it => {
      const ex = EX[it.exId];
      if (!ex || ex.pattern === 'mobility') return;
      const done = (it.sets || []).filter(st => st.done).length;
      if (!done) return;
      tally[ex.primary] = (tally[ex.primary] || 0) + done;
      (ex.sec || []).forEach(m => { tally[m] = (tally[m] || 0) + done * 0.5; });
    });
  });
  return tally;
}

function stretchScores() {
  const st = stretchStore();
  const trained = recentlyTrained(2);
  const occ = OCCUPATIONS[st.occupation];
  const workAreas = new Set(occ ? occ.areas : []);
  /* The named sore areas are INJURIES keys; they have to become muscles to be
     matched against the catalogue. */
  const sore = {};
  (st.areas || []).forEach(k => {
    const map = STRETCH_AREA_MUSCLES[k] || {};
    /* The strongest association wins rather than accumulating: flagging both
       hip and knee should not make quads twice as urgent as either did. */
    Object.keys(map).forEach(m => { sore[m] = Math.max(sore[m] || 0, map[m]); });
  });

  return stretchPool().map(ex => {
    const all = [[ex.primary, 1]].concat((ex.sec || []).map(m => [m, STRETCH_W.secondary]));
    /* Tallied per reason rather than into one total, because the row shows
       *why* a movement is there and the honest answer is whichever of the
       three contributed most. Listing all three that fired was the first
       version and it labelled nine rows out of eleven "flagged / trained /
       work", which is three chips that say nothing. */
    const by = { sore: 0, trained: 0, work: 0 };
    all.forEach(([m, w]) => {
      if (sore[m]) by.sore += STRETCH_W.sore * w * sore[m];
      /* Four ticked sets is a full signal, not six. At six a normal three-set
         movement only ever reached half its weight, so the occupation — the
         weakest of the three by design — outranked what you had actually
         trained, and every row on the screen said "work". */
      if (trained[m]) by.trained += STRETCH_W.trained * w * Math.min(1, trained[m] / 4);
      if (workAreas.has(m)) by.work += STRETCH_W.work * w;
    });
    const score = by.sore + by.trained + by.work;
    const top = Object.keys(by).sort((a, b) => by[b] - by[a])[0];
    const L = S.lifts && S.lifts[ex.id];
    return { ex, score, by, why: by[top] > 0 ? top : null, last: (L && L.lastDate) || '' };
  });
}

/* Which muscles each named problem area actually covers. The keys are the
   INJURIES keys, so the stretch tool asks the same question the rest of the
   app already asked rather than inventing a second vocabulary for the same
   eight body parts. */
/* Weighted, not a flat list. A low back that hurts is genuinely related to hip
   and hamstring mobility, but it is not related to them as strongly as it is
   to the back itself — and a flat list said it was, which made "flagged" the
   top reason on nine rows out of nine and turned the explanation back into
   wallpaper. The numbers are a ranking, not a clinical claim. */
const STRETCH_AREA_MUSCLES = {
  shoulder: { Shoulders:1, Chest:0.6, Back:0.4 },
  lowback:  { Back:1, Core:0.6, Glutes:0.5, Hamstrings:0.4 },
  knee:     { Quads:1, Hamstrings:0.7, Calves:0.5 },
  elbow:    { Triceps:1, Biceps:0.8, Shoulders:0.3 },
  wrist:    { Triceps:0.6, Biceps:0.6 },
  neck:     { Shoulders:1, Back:0.5, Chest:0.5 },
  hip:      { Glutes:1, Quads:0.8, Hamstrings:0.5 },
  ankle:    { Calves:1, Hamstrings:0.4 }
};

/* ------------------------------------------------------------
   The daily stretch.

   Spread across regions before rank within them, the same way a recovery day
   is built — eight movements that are all hip openers is not a session, it is
   a hip opener done eight times. Deterministic for a given day and a given
   state, so opening the screen twice does not shuffle it.
   ------------------------------------------------------------ */
function dailyStretch(n, opts) {
  opts = opts || {};
  /* Filled to a time budget, not to a count. The first version turned minutes
     into a movement count with a flat 45-seconds-each guess and then measured
     the result at 56 — so asking for eight minutes produced ten and a half.
     One number decides the length now, and it is the one being asked for. */
  const mins = opts.mins != null ? opts.mins : (+stretchStore().mins || 15);
  const budget = n ? null : Math.max(3, mins) * 60;
  /* An hour of stretching is sixty-odd minutes of *distinct* movements at two
     or three holds each, so the ceiling has to clear the pool rather than sit
     at fourteen. It is capped at the pool size below either way, and the
     budget stops it long before this in every real case — the number exists
     only so the loop cannot run away. */
  const want = n ? Math.max(1, Math.min(80, n)) : 80;
  /* A preset narrows the pool here rather than anywhere else, so everything
     downstream — injuries, equipment, region spread, hold length — is the
     machinery that was already there. */
  const pool = opts.filter ? stretchScores().filter(s => opts.filter(s.ex)) : stretchScores();
  const scored = pool.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.last !== b.last) return (a.last || '').localeCompare(b.last || '');
    return a.ex.name.localeCompare(b.ex.name);
  });

  const byRegion = {};
  scored.forEach(s => {
    const r = stretchRegion(s.ex);
    (byRegion[r] = byRegion[r] || []).push(s);
  });
  /* Regions in the order their best movement scored, so the area that most
     needs it leads — but every region still gets a turn before any gets a
     second. */
  const regions = Object.keys(byRegion).sort((a, b) => byRegion[b][0].score - byRegion[a][0].score);

  const out = [];
  let round = 0, secs = 0;
  const full = () => budget ? secs >= budget : out.length >= want;
  while (!full() && round < 12 && out.length < want) {
    let added = false;
    for (const r of regions) {
      if (full() || out.length >= want) break;
      const pick = byRegion[r][round];
      if (!pick) continue;
      out.push(pick);
      secs += movementSeconds(pick.ex) * stretchSets(pick.ex);
      added = true;
    }
    if (!added) break;
    round++;
  }
  /* One over the line is closer to the ask than one under it whenever the last
     movement straddles the budget — but only if it is actually closer. */
  if (budget && out.length > 3) {
    const last = out[out.length - 1].ex;
    const without = secs - movementSeconds(last) * stretchSets(last);
    if (Math.abs(without - budget) < Math.abs(secs - budget)) out.pop();
  }
  return out;
}

/* What one movement costs, including getting into and out of it. A 60-second
   hold is not 60 seconds of your time. */
function movementSeconds(ex) {
  return (ex.load === 'time' ? ex.rh : ex.rh * 3) + 10;
}

/* How long today's stretch should be, from the minutes you asked for. Timed
   movements carry their own seconds; rep-counted ones are estimated the same
   way the session-length maths does it elsewhere. */
function stretchSeconds(list) {
  return (list || []).reduce((a, s) => a + movementSeconds(s.ex || s) * stretchSets(s.ex || s), 0);
}

/* ------------------------------------------------------------
   How long to hold, and how many times.

   ACSM's flexibility guidance is not "hold it for a while": it is roughly
   **60 seconds accumulated per muscle group**, reached either as two holds of
   thirty or four of fifteen, with any single hold in the 10–30 second band for
   most adults and 30–60 for older ones. A single 30-second hold — which is
   what this did — is half a dose.

   So a movement is prescribed in *sets*: enough repeats of its own hold to
   accumulate a minute. A 60-second hold is already there and gets one; a
   20-second one gets three. Rep-counted mobility work is a different animal —
   it is a range being moved through rather than a tissue being held — and
   takes two passes, which is the low end of the 2–4 the same guidance gives.

   The ceiling of three exists because the marginal value of a fourth identical
   hold is small and the cost in session length is not.
   ------------------------------------------------------------ */
const STRETCH_ACCUMULATE_SECS = 60;

function stretchSets(ex) {
  if (!ex) return 1;
  if (ex.load !== 'time') return 2;
  const hold = +ex.rh || 30;
  return Math.max(1, Math.min(3, Math.round(STRETCH_ACCUMULATE_SECS / hold)));
}

/* ------------------------------------------------------------
   Doing it.

   A stretch is marked done on the day, not logged as a session. It carries no
   load, sets no record and must never reach applyProgression — the mobility
   guard there exists because the unloaded branch would otherwise ratchet a
   stretch's rep target every time you held it longer.
   ------------------------------------------------------------ */
function stretchDone(k) {
  return (stretchStore().done[key(k || today())] || []).slice();
}
function toggleStretchDone(exId, k) {
  const kk = key(k || today());
  const st = stretchStore();
  const list = st.done[kk] || [];
  const i = list.indexOf(exId);
  if (i >= 0) list.splice(i, 1); else list.push(exId);
  if (list.length) st.done[kk] = list; else delete st.done[kk];
  save();
  return list.slice();
}
function stretchAllDone(list, k) {
  const done = stretchDone(k);
  return list.length > 0 && list.every(s => done.indexOf((s.ex || s).id) >= 0);
}

/* Days in a row with at least one stretch in them. Same rule as water: today
   cannot break it, and a break is never announced. */
function stretchStreak() {
  let n = 0;
  const t = fromKey(today());
  if (stretchDone(today()).length) n++;
  for (let i = 1; i <= 400; i++) {
    if (!stretchDone(dk(addDays(t, -i))).length) break;
    n++;
  }
  return n;
}

/* ------------------------------------------------------------
   Your own.

   A stretch routine is a routine — the builder, the reorder, the timed items
   and the Train runner all already exist and all already work. Building a
   second one here would be two of everything with one of them worse. What
   this adds is a routine seeded from mobility movements and marked so the
   stretch screen can find it again.
   ------------------------------------------------------------ */
function stretchRoutines() {
  return (S.routines || []).filter(r => r.stretch);
}
function newStretchRoutine(name) {
  const r = newRoutine(name || 'My stretch');
  r.emoji = 'env-bw';
  r.stretch = true;
  r.warmup = false;
  save(true);
  return r;
}
/* Today's recommendation, saved so it can be edited and kept. */
function saveDailyAsRoutine() {
  const list = dailyStretch();
  const r = newStretchRoutine('Daily stretch');
  list.forEach(s => addToRoutine(r.id, s.ex.id));
  save(true);
  return r;
}

/* ------------------------------------------------------------
   Running it on the Train screen.

   Asked for: the stretch should run under Train so the holds count themselves
   down. They already can — a timed item counts itself down there and has since
   the reps-or-seconds change — so this is a session built out of today's
   recommendation rather than a second runner.

   Marked `extra`, so a stretch never discharges the session you committed to:
   ten minutes of mobility is not the Upper day you skipped. And marked
   `stretch`, so finishing it ticks the day off in the stretch store as well.
   ------------------------------------------------------------ */
function buildStretchSession(list) {
  const items = (list && list.length ? list : dailyStretch()).map(s => s.ex || s);
  if (!items.length) return null;
  return {
    id: 'sx' + Date.now().toString(36),
    date: today(),
    type: 'recovery',
    stretch: true,
    extra: true,
    env: (dayConstraint(today()).env) || 'bw',
    rung: 'full',
    circuit: false, rounds: null, restRound: null, warmupCount: 0,
    planMins: Math.round(stretchSeconds(items.map(ex => ({ ex }))) / 60),
    exercises: items.map(ex => ({
      exId: ex.id, name: ex.name,
      /* The catalogue's own load, so a 60-second hold arrives as a hold and
         the Train screen counts it down. */
      load: ex.load,
      targetW: null, targetR: ex.rh,
      /* Enough holds to accumulate the minute — see stretchSets(). */
      sets: Array.from({ length: stretchSets(ex) }, () => ({ w: '', r: '', rpe: '', done: false })),
      note: ''
    })),
    started: null, ended: null, dur: 0, activeMs: 0, tickAt: null, paused: false
  };
}

/* Everything in a finished stretch session counts as done for the day, so
   running it and ticking it by hand are the same thing to everything
   downstream. */
function markStretchSessionDone(sess) {
  if (!sess || !sess.stretch) return;
  const st = stretchStore();
  const kk = key(sess.date);
  const list = st.done[kk] || [];
  (sess.exercises || []).forEach(it => {
    if (!it.sets.some(x => x.done)) return;
    if (list.indexOf(it.exId) < 0) list.push(it.exId);
  });
  if (list.length) st.done[kk] = list;
  save();
}

/* ============================================================
   PRESETS
   ------------------------------------------------------------
   The daily stretch answers "what should I do today". A preset answers the
   other question people actually have, which is "my back is wrecked and I
   have fifteen minutes".

   They are **filters over the same pool and the same scoring**, not a second
   catalogue of hand-picked lists. A hand-picked list is stale the moment the
   catalogue grows, ignores the injuries you flagged, and offers band work to
   someone with no bands — all three of which this tool already gets right.
   So a preset says which regions to draw from and how long to run; everything
   downstream is the machinery that was already there.

   `focus` is a set of MUSCLES entries. Anything outside it is excluded rather
   than merely down-weighted: a back preset that quietly includes calf work
   because the calf movement scored well is not a back preset.
   ============================================================ */
const STRETCH_PRESETS = [
  { k: 'wake',    name: 'Wake up',           mins: 5,  ico: 'ms-first',
    blurb: 'Short and moving. Nothing held long enough to make you slow.',
    focus: null, prefer: 'reps' },
  { k: 'desk',    name: 'Desk reset',        mins: 5,  ico: 'desk',
    blurb: 'Chest, upper back and hips — the three a seated day shortens.',
    focus: ['Chest', 'Back', 'Shoulders', 'Glutes'] },
  { k: 'neck',    name: 'Neck and shoulders', mins: 15, ico: 'area-Shoulders',
    blurb: 'For a day spent under a rig, a headset or a screen.',
    focus: ['Shoulders', 'Chest', 'Back'] },
  { k: 'back',    name: 'Lower back',        mins: 15, ico: 'lowback',
    blurb: 'The back itself, plus the hips and hamstrings that pull on it.',
    focus: ['Back', 'Glutes', 'Hamstrings', 'Core'] },
  { k: 'hips',    name: 'Hips',              mins: 15, ico: 'hip',
    blurb: 'Flexors, glutes and adductors. The thing sitting takes most.',
    focus: ['Glutes', 'Quads', 'Hamstrings'] },
  { k: 'legs',    name: 'Legs and ankles',   mins: 15, ico: 'area-Calves',
    blurb: 'After a long walk, a run, or a day standing on concrete.',
    focus: ['Hamstrings', 'Quads', 'Calves', 'Glutes'] },
  { k: 'hands',   name: 'Wrists and forearms', mins: 5, ico: 'hands',
    blurb: 'For hands that grip, type or hold a camera all day.',
    focus: ['Biceps', 'Triceps'] },
  { k: 'posttrain', name: 'After training',  mins: 15, ico: 'ms-tonne',
    blurb: 'Built from what you actually trained in the last two days.',
    focus: null, trainedOnly: true },
  { k: 'fullhalf', name: 'Full body',        mins: 30, ico: 'env-bw',
    blurb: 'Everything, once. A half-hour that leaves nothing out.',
    focus: null },
  { k: 'fullhour', name: 'The long one',     mins: 60, ico: 'summit',
    blurb: 'An hour, spread across the whole body. Nothing repeated.',
    focus: null }
];

function presetById(k) { return STRETCH_PRESETS.find(p => p.k === k) || null; }

/* The same builder, with the pool narrowed and the length overridden. Nothing
   about injuries, equipment, region spread or hold length changes — a preset
   that bypassed those would be a second, worse stretch tool. */
function presetStretch(k) {
  const p = presetById(k);
  if (!p) return [];
  const focus = p.focus ? new Set(p.focus) : null;
  const trained = p.trainedOnly ? recentlyTrained(2) : null;

  return dailyStretch(null, {
    mins: p.mins,
    filter: ex => {
      if (focus) {
        /* Primary only. Letting a secondary muscle qualify puts a hamstring
           stretch in a shoulder preset because its secondary is the back. */
        if (!focus.has(ex.primary)) return false;
      }
      if (trained) {
        const hit = [ex.primary].concat(ex.sec || []).some(m => trained[m]);
        if (!hit) return false;
      }
      /* "Wake up" wants movement, not long holds — see the research note: a
         held stretch before anything is the wrong tool. */
      if (p.prefer === 'reps' && ex.load === 'time') return false;
      return true;
    }
  });
}

/* Whether a preset can actually be built right now. "After training" needs
   something trained; a focus preset needs movements left after your injuries
   are taken out. A preset that produces two movements is not a preset. */
function presetReady(k) {
  return presetStretch(k).length >= 3;
}
