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
  desk:    { k:'desk',    label:'Desk / screen work',      ico:'💻',
             areas:['Chest','Shoulders','Back','Glutes','Quads'],
             note:'Hours in flexion: the front closes up and the hips stay short. The work is opening the chest and hips and getting the upper back to move again.' },
  camera:  { k:'camera',  label:'Camera / AV crew',        ico:'🎥',
             areas:['Shoulders','Back','Core','Calves','Glutes'],
             note:'Weight on one shoulder for hours, then standing on it. Asymmetric load through the neck and upper back, with calves and low back taking the standing.' },
  driving: { k:'driving', label:'Driving',                 ico:'🚚',
             areas:['Glutes','Quads','Back','Chest'],
             note:'Seated with the hips flexed and the arms forward. Hip flexors and glutes take most of it.' },
  standing:{ k:'standing',label:'On your feet all day',    ico:'🧍',
             areas:['Calves','Glutes','Hamstrings','Back'],
             note:'Static standing loads calves and low back more than walking does. Ankles and hips first.' },
  lifting: { k:'lifting', label:'Manual / trades',         ico:'🧰',
             areas:['Back','Hamstrings','Shoulders','Glutes'],
             note:'Repeated bending and carrying. Posterior chain and shoulders.' },
  care:    { k:'care',    label:'Healthcare / caring',     ico:'🩺',
             areas:['Back','Shoulders','Calves','Hamstrings'],
             note:'Long shifts on your feet with awkward lifts in them. Low back and shoulders.' },
  hands:   { k:'hands',   label:'Hands and wrists all day',ico:'🖐',
             areas:['Triceps','Shoulders','Chest'],
             note:'Fine motor work with the forearms loaded and the shoulders forward.' },
  mixed:   { k:'mixed',   label:'A bit of everything',     ico:'🔀',
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
  if (!S.stretch) S.stretch = { onboarded:false, occupation:null, sit:null, areas:[], done:{}, mins:8 };
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
      if (trained[m]) by.trained += STRETCH_W.trained * w * Math.min(1, trained[m] / 6);
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
function dailyStretch(n) {
  /* Filled to a time budget, not to a count. The first version turned minutes
     into a movement count with a flat 45-seconds-each guess and then measured
     the result at 56 — so asking for eight minutes produced ten and a half.
     One number decides the length now, and it is the one being asked for. */
  const budget = n ? null : Math.max(3, +stretchStore().mins || 8) * 60;
  const want = n ? Math.max(1, Math.min(14, n)) : 14;
  const scored = stretchScores().sort((a, b) => {
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
      secs += movementSeconds(pick.ex);
      added = true;
    }
    if (!added) break;
    round++;
  }
  /* One over the line is closer to the ask than one under it whenever the last
     movement straddles the budget — but only if it is actually closer. */
  if (budget && out.length > 3) {
    const without = secs - movementSeconds(out[out.length - 1].ex);
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
  return (list || []).reduce((a, s) => a + movementSeconds(s.ex || s), 0);
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
