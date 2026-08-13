/* ============================================================
   INTAKE DATA
   Every option here changes generated sessions. Nothing is
   collected for the sake of a longer form.
   ============================================================ */

/* ---------- injuries → exercises removed from the library ----------
   The mobility entries were added when the stretch tool went in. Until then
   this list held only loaded work, so a shoulder injury excluded overhead
   pressing and then the daily stretch offered band dislocates and a doorway
   chest stretch — end-range positions for the joint the app had just been
   told to protect. Each mobility id here is excluded for a mechanical reason:
   the movement puts load or end range through the named part. */
const INJURIES = {
  shoulder: { k:'shoulder', label:'Shoulder', ico:'shoulder',
    note:'Overhead pressing, dips and deep flyes come out. Neutral-grip and landmine work stays.',
    ex:['bb-ohp','bb-push-press','bw-hspu','bw-dip','db-fly','mach-pec-deck','db-front-raise','bb-shrug','db-shrug','db-arnold','bw-decline-pushup',
         'mob-band-dislocate','mob-doorway-chest'] },
  lowback: { k:'lowback', label:'Lower back', ico:'lowback',
    note:'Loaded spinal work goes — deadlifts, bent-over rows, good mornings, barbell squats. Supported and machine versions replace them.',
    ex:['bb-deadlift','bb-sumo-dl','bb-good-morning','bb-row','bb-pendlay','bb-rack-pull','bb-back-squat','bb-front-squat','bb-rdl','bnd-good-morning','db-renegade-row','bb-lunge'] },
  knee: { k:'knee', label:'Knee', ico:'knee',
    note:'Jumping and deep single-leg work comes out. Leg press, goblet squats and hinges stay.',
    ex:['bw-jump-squat','bw-broad-jump','bw-pistol','bb-lunge','bw-lunge','db-lunge','bw-split-squat','db-bulgarian','bw-squat-thrust','bw-burpee','bw-mountain-climber','bw-high-knees',
         'mob-couch'] },
  elbow: { k:'elbow', label:'Elbow', ico:'elbow',
    note:'Straight-bar curls, skullcrushers and dips come out. Hammer curls and cable work replace them.',
    ex:['bw-diamond-pushup','bb-cgbp','db-skull','bb-curl','bw-dip','bw-bench-dip','db-oh-tricep','mach-preacher'] },
  wrist: { k:'wrist', label:'Wrist', ico:'wrist',
    note:'Anything loading a bent wrist comes out — push-ups, front squats, planks on hands.',
    ex:['bb-front-squat','bw-pushup','bw-diamond-pushup','bw-decline-pushup','bw-pike-pushup','bw-hspu','bw-bear-crawl','bw-mountain-climber','bb-curl','db-renegade-row','bw-l-sit','bw-incline-pushup',
         'mob-cat-cow','mob-scap-pushup','mob-cobra'] },
  neck: { k:'neck', label:'Neck', ico:'neck',
    note:'Shrugs and bar-on-traps squatting come out. Worth flagging if you carry a camera on one shoulder.',
    ex:['bb-shrug','db-shrug','bw-situp','bw-russian-twist','bb-back-squat','bw-l-sit'] },
  hip: { k:'hip', label:'Hip', ico:'hip',
    note:'Wide stances and deep split positions come out.',
    ex:['bb-sumo-dl','db-bulgarian','bw-pistol','mach-hip-abduction','bb-lunge','bw-split-squat',
         'mob-pigeon'] },
  ankle: { k:'ankle', label:'Ankle or foot', ico:'ankle',
    note:'Impact work comes out. Cycling and rowing replace running for conditioning.',
    ex:['bw-jump-squat','bw-broad-jump','car-jump-rope','bw-high-knees','bw-burpee','bb-front-squat','car-run','car-treadmill-run',
         'mob-ankle-rock'] }
};

function injuryExclusions() {
  const set = new Set();
  ((S.profile && S.profile.injuries) || []).forEach(k => {
    if (INJURIES[k]) INJURIES[k].ex.forEach(id => set.add(id));
  });
  return set;
}
function injuryExclusionsFor(keys) {
  const set = new Set();
  (keys || []).forEach(k => { if (INJURIES[k]) INJURIES[k].ex.forEach(id => set.add(id)); });
  return set;
}

/* ---------- priority areas → an extra accessory slot ---------- */
const PRIORITIES = {
  Back:      { ico:'area-Back', note:'Rows and pulldowns. The single best thing you can train if you carry weight on one shoulder all day.' },
  Shoulders: { ico:'area-Shoulders', note:'Side and rear delts. Width, and shoulders that tolerate a rig.' },
  Chest:     { ico:'area-Chest', note:'Pressing volume across flat and incline.' },
  Core:      { ico:'area-Core', note:'Anti-rotation and bracing work — the part that actually protects your back under load.' },
  Quads:     { ico:'area-Quads', note:'Squats, presses and extensions.' },
  Glutes:    { ico:'area-Glutes', note:'Hip thrusts, hinges and bridges. Underrated for standing all day.' },
  Arms:      { ico:'area-Arms', note:'Biceps and triceps, directly.' },
  Calves:    { ico:'area-Calves', note:'Standing and seated raises.' }
};

/* ---------- cardio ---------- */
const CARDIO_AMOUNT = {
  none:  { k:'none',  label:'None for now', ico:'ban',
           note:'Strength only. You can turn this on later without changing anything else.' },
  light: { k:'light', label:'A little',     ico:'cardio-light',
           note:'One short piece a week, tacked onto the end of a session. Ten to fifteen minutes.' },
  some:  { k:'some',  label:'A moderate amount', ico:'cardio-some',
           note:'Two pieces a week, fifteen to twenty minutes. Enough to matter for heart health without eating into recovery.' },
  lots:  { k:'lots',  label:'A lot',        ico:'cardio-lots',
           note:'Three pieces a week, twenty minutes plus. You want conditioning as a real goal, not an afterthought.' }
};
const CARDIO_MODES = {
  'car-walk':          { label:'Walking outdoors',  ico:'car-walk' },
  'car-run':           { label:'Running outdoors',  ico:'car-run' },
  'car-treadmill-run': { label:'Treadmill',         ico:'car-treadmill-run' },
  'car-incline-walk':  { label:'Incline walking',   ico:'car-incline-walk' },
  'car-bike':          { label:'Bike',              ico:'car-bike' },
  'car-rower':         { label:'Rower',             ico:'car-rower' },
  'car-stair':         { label:'Stair climber',     ico:'car-stair' },
  'car-jump-rope':     { label:'Skipping rope',     ico:'car-jump-rope' }
};
const CARDIO_SESSIONS = { none:0, light:1, some:2, lots:3 };
const CARDIO_MINS = { none:0, light:12, some:18, lots:22 };

/* ---------- gym equipment ---------- */
const GEAR_ITEMS = {
  barbell:   { label:'Barbell and plates', ico:'gear-barbell', note:'Squats, deadlifts, bench, rows' },
  rack:      { label:'Squat rack or stands', ico:'gear-rack', note:'Needed to squat or press from height safely' },
  bench:     { label:'A bench',            ico:'gear-bench', note:'Flat or adjustable' },
  dumbbells: { label:'Dumbbells',          ico:'gear-dumbbell', note:'Any range' },
  kettlebells:{ label:'Kettlebells',       ico:'gear-kettlebell', note:'Swings, cleans, get-ups, carries' },
  cables:    { label:'Cable machine',      ico:'gear-cable', note:'Pulldowns, rows, pushdowns, face pulls' },
  machines:  { label:'Resistance machines',ico:'gear-machine', note:'Leg press, chest press, curls, extensions' },
  pullupBar: { label:'Pull-up bar',        ico:'gear-pullup', note:'Pull-ups, chin-ups, hanging work' },
  bands:     { label:'Resistance bands',   ico:'gear-band', note:'Useful anywhere, essential when travelling' },
  cardioKit: { label:'Cardio machines',    ico:'cardio-some', note:'Treadmill, bike, rower, stairs' }
};
const GEAR_ALL = { barbell:true, rack:true, bench:true, dumbbells:true, kettlebells:true, cables:true, machines:true, pullupBar:true, bands:true, cardioKit:true };

/* which exercises need what */
const NEEDS_BAR   = ['bw-pullup','bw-chinup','bw-l-sit'];
const NEEDS_BENCH = ['bb-bench','bb-incline-bench','db-bench','db-incline','db-fly','db-pullover','bw-bench-dip',
                     'db-bulgarian','db-step-up','bw-step-up','bw-decline-pushup','bb-hip-thrust','db-floor-press'];
const NEEDS_RACK  = ['bb-back-squat','bb-front-squat','bb-ohp','bb-push-press','bb-rack-pull'];
const NEEDS_DIP   = ['bw-dip'];

function gearExcludes(gear) {
  const out = new Set();
  if (!gear) return out;
  const add = arr => arr.forEach(id => out.add(id));
  if (!gear.barbell)   EXLIST.filter(e => e.eq === 'Barbell').forEach(e => out.add(e.id));
  if (!gear.dumbbells) EXLIST.filter(e => e.eq === 'Dumbbell').forEach(e => out.add(e.id));
  if (!gear.kettlebells) EXLIST.filter(e => e.eq === 'Kettlebell').forEach(e => out.add(e.id));
  if (!gear.cables)    EXLIST.filter(e => e.eq === 'Cable').forEach(e => out.add(e.id));
  if (!gear.machines)  EXLIST.filter(e => e.eq === 'Machine').forEach(e => out.add(e.id));
  if (!gear.bands)     EXLIST.filter(e => e.eq === 'Band').forEach(e => out.add(e.id));
  if (!gear.cardioKit) EXLIST.filter(e => e.eq === 'Cardio' && e.id !== 'car-run' && e.id !== 'car-walk' && e.id !== 'car-jump-rope').forEach(e => out.add(e.id));
  if (!gear.pullupBar) { add(NEEDS_BAR); add(NEEDS_DIP); out.add('mach-assisted-pullup'); }
  if (!gear.bench)     add(NEEDS_BENCH);
  if (!gear.rack)      add(NEEDS_RACK);
  return out;
}

/* ---------- session length ---------- */
/* The icons are the same rising ladder the app uses for how much time a day
   has, because this is the same quantity asked before the fact. Four rungs for
   four answers: an icon repeated across every option on a screen has stopped
   telling you anything, which is what four identical stopwatches were doing. */
const SESSION_LENGTHS = {
  30: { label:'About 30 minutes', ico:'avail-micro',  note:'In and out. Compounds and one or two accessories.' },
  45: { label:'About 45 minutes', ico:'avail-short',  note:'Enough for a full session without dragging.' },
  60: { label:'About an hour',    ico:'avail-normal', tag:'Most common', note:'Room for full accessory work and proper rests between heavy sets.' },
  75: { label:'75 minutes or more', ico:'avail-long', note:'You are not in a hurry and you like long rests between heavy work.' }
};

/* ---------- nutrition targets derived from bodyweight ---------- */
function suggestedTargets(bwKg, goals) {
  if (!bwKg || bwKg <= 0) return null;
  const wantsMuscle = (goals || []).includes('muscle');
  const kgs = S.profile && S.profile.units === 'lb' ? bwKg * 0.4536 : bwKg;
  const p = Math.round(kgs * (wantsMuscle ? 1.9 : 1.6));
  let kcal = Math.round(kgs * 33);
  if (wantsMuscle) kcal += 250;
  kcal = Math.round(kcal / 10) * 10;
  const f = Math.round((kcal * 0.27) / 9);
  const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
  return { kcal, p, c, f };
}
