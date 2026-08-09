/* ============================================================
   FORM DIAGRAMS
   A side-view figure drawn from four authored points per frame
   (hip, shoulder, hand, ankle). Knees and elbows are solved by
   two-link inverse kinematics, so limb lengths stay consistent
   and no pose can come out anatomically impossible.
   Canvas is 120 x 150, floor at y=140.
   ============================================================ */
const SEG = { thigh:30, shin:30, upper:19, fore:18, head:13 };

function ikJoint(a, b, l1, l2, sign) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let d = Math.hypot(dx, dy);
  d = Math.min(d, l1 + l2 - 0.01) || 0.01;
  const base = Math.atan2(dy, dx);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const ang = base + sign * Math.acos(Math.max(-1, Math.min(1, cosA)));
  return [a[0] + Math.cos(ang) * l1, a[1] + Math.sin(ang) * l1];
}
const L = (a, b, w, cls) =>
  `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke-width="${w}" class="${cls||'fg-limb'}"/>`;

function drawFigure(f) {
  const hip = f.hip, sh = f.sh, hand = f.hand, ank = f.ank;
  const kneeSign = f.kneeBend != null ? f.kneeBend : 1;
  const elbowSign = f.elbowBend != null ? f.elbowBend : 1;
  const knee = ikJoint(hip, ank, SEG.thigh, SEG.shin, kneeSign);
  const elbow = ikJoint(sh, hand, SEG.upper, SEG.fore, elbowSign);

  // head sits along the torso line, extended past the shoulder
  const tx = sh[0] - hip[0], ty = sh[1] - hip[1];
  const tl = Math.hypot(tx, ty) || 1;
  const head = [sh[0] + (tx / tl) * SEG.head, sh[1] + (ty / tl) * SEG.head];
  const toe = f.toe || [ank[0] + 13, ank[1] + 2];

  let g = '';
  // far-side limbs first, dimmed for depth
  if (f.ank2) {
    const knee2 = ikJoint(hip, f.ank2, SEG.thigh, SEG.shin, f.kneeBend2 != null ? f.kneeBend2 : kneeSign);
    g += L(hip, knee2, 8, 'fg-far') + L(knee2, f.ank2, 7, 'fg-far');
    g += L(f.ank2, f.toe2 || [f.ank2[0] + 12, f.ank2[1] + 2], 5, 'fg-far');
  }
  if (f.hand2) {
    const elbow2 = ikJoint(sh, f.hand2, SEG.upper, SEG.fore, f.elbowBend2 != null ? f.elbowBend2 : elbowSign);
    g += L(sh, elbow2, 7, 'fg-far') + L(elbow2, f.hand2, 6, 'fg-far');
  }
  // torso, legs, arms
  g += L(hip, sh, 10, 'fg-torso');
  g += L(hip, knee, 8) + L(knee, ank, 7) + L(ank, toe, 5);
  g += L(sh, elbow, 7) + L(elbow, hand, 6);
  g += `<circle cx="${head[0].toFixed(1)}" cy="${head[1].toFixed(1)}" r="8.5" class="fg-head"/>`;
  return g;
}

/* ---------- equipment ---------- */
const KIT = {
  floor: () => `<line x1="2" y1="140" x2="118" y2="140" class="fg-floor"/>`,
  barH: (x, y, w) => `<line x1="${x-(w||30)}" y1="${y}" x2="${x+(w||30)}" y2="${y}" class="fg-bar"/>
    <circle cx="${x-(w||30)}" cy="${y}" r="7" class="fg-plate"/><circle cx="${x+(w||30)}" cy="${y}" r="7" class="fg-plate"/>`,
  barEnd: (x, y) => `<circle cx="${x}" cy="${y}" r="9" class="fg-plate"/><circle cx="${x}" cy="${y}" r="3.4" class="fg-bar-c"/>`,
  db: (x, y) => `<rect x="${x-4}" y="${y-9}" width="8" height="18" rx="3" class="fg-plate"/>`,
  bench: (x1, y1, x2, y2) => `<rect x="${x1}" y="${y1}" width="${x2-x1}" height="${y2-y1}" rx="3" class="fg-bench"/>
    <line x1="${x1+5}" y1="${y2}" x2="${x1+5}" y2="140" class="fg-bench-leg"/>
    <line x1="${x2-5}" y1="${y2}" x2="${x2-5}" y2="140" class="fg-bench-leg"/>`,
  pullBar: y => `<line x1="18" y1="${y}" x2="102" y2="${y}" class="fg-bar"/>
    <line x1="24" y1="4" x2="24" y2="${y}" class="fg-rack"/><line x1="96" y1="4" x2="96" y2="${y}" class="fg-rack"/>`,
  cableTop: (x, y, hx, hy) => `<line x1="${x}" y1="4" x2="${x}" y2="${y}" class="fg-rack"/>
    <line x1="${x}" y1="${y}" x2="${hx}" y2="${hy}" class="fg-cable"/>`,
  guide: (a, b) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="fg-guide"/>`,
  dipBars: y => `<line x1="30" y1="${y}" x2="30" y2="140" class="fg-rack"/><line x1="90" y1="${y}" x2="90" y2="140" class="fg-rack"/>
    <line x1="26" y1="${y}" x2="94" y2="${y}" class="fg-bar"/>`,
  /* An angled pad or platform — incline bench back, leg-press footplate. */
  pad: (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="fg-pad"/>`,
  /* A pulley at floor height, cable running out to the hands. */
  cableLow: (x, y, hx, hy) => `<line x1="${x}" y1="140" x2="${x}" y2="${y}" class="fg-rack"/>
    <line x1="${x}" y1="${y}" x2="${hx}" y2="${hy}" class="fg-cable"/>`,
  /* Two uprights carrying an angled sled, for the leg press. */
  sledRails: (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="fg-rack"/>`,
  /* Uprights running DOWN to the floor — a bar set low in a rack, rather
     than one hanging from the ceiling. */
  rackLow: y => `<line x1="24" y1="${y}" x2="24" y2="140" class="fg-rack"/>
    <line x1="96" y1="${y}" x2="96" y2="140" class="fg-rack"/>
    <line x1="18" y1="${y}" x2="102" y2="${y}" class="fg-bar"/>`
};

function formSVG(frame) {
  return `<svg viewBox="0 0 120 152" class="formfig" xmlns="http://www.w3.org/2000/svg">
    ${(frame.kit || []).join('')}
    ${drawFigure(frame)}
  </svg>`;
}

/* ============================================================
   THE LIFTS
   ============================================================ */
const FORMS = {
  'bb-back-squat': {
    name: 'Back Squat', labels: ['Standing', 'Bottom'],
    frames: [
      { hip:[60,80], sh:[60,44], hand:[44,42], ank:[60,140], toe:[74,142], elbowBend:1,
        kit:[KIT.floor(), KIT.barH(60,42,32)] },
      { hip:[50,104], sh:[57,68], hand:[41,66], ank:[60,140], toe:[74,142], kneeBend:-1, elbowBend:1,
        kit:[KIT.floor(), KIT.barH(57,66,32)] }
    ],
    setup: 'Bar on the shelf of your upper back, not your neck. Feet shoulder-width, toes turned out 15–30°. Grip as narrow as your shoulders allow.',
    cues: ['Brace as if about to take a punch, then break at hips and knees together',
           'Push your knees out over your toes as you descend',
           'Hips and shoulders rise at the same rate — no good-morning',
           'Depth: hip crease below the top of the knee, if your hips allow it'],
    faults: ['Knees caving inward under load', 'Heels lifting — usually ankle mobility or too-wide a stance',
             'Losing the brace at the bottom and rounding the low back']
  },
  'bb-deadlift': {
    name: 'Deadlift', labels: ['Setup', 'Lockout'],
    frames: [
      { hip:[48,98], sh:[66,66], hand:[68,101], ank:[62,140], toe:[76,142], kneeBend:-1, elbowBend:-1,
        kit:[KIT.floor(), KIT.barH(68,101,26)] },
      { hip:[60,80], sh:[60,44], hand:[62,80], ank:[60,140], toe:[74,142], elbowBend:-1,
        kit:[KIT.floor(), KIT.barH(62,80,26)] }
    ],
    setup: 'Bar over mid-foot, roughly an inch from your shins. Grip just outside your legs. Pull the slack out of the bar before you pull the weight.',
    cues: ['Chest up, lats engaged — imagine squeezing oranges in your armpits',
           'Push the floor away rather than yanking the bar up',
           'The bar stays in contact with your legs the whole way',
           'Finish by squeezing your glutes, not by leaning back'],
    faults: ['Hips shooting up first, turning it into a stiff-leg pull',
             'Rounding the lower back — stop the set, the weight is too heavy',
             'Hyperextending at the top and hanging off your lower back']
  },
  'bb-bench': {
    name: 'Bench Press', labels: ['Chest', 'Lockout'],
    frames: [
      { hip:[78,90], sh:[44,88], hand:[46,66], ank:[106,140], toe:[116,142], kneeBend:-1, elbowBend:1,
        kit:[KIT.floor(), KIT.bench(24,94,88,104), KIT.barEnd(46,66)] },
      { hip:[78,90], sh:[44,88], hand:[47,52], ank:[106,140], toe:[116,142], kneeBend:-1, elbowBend:1,
        kit:[KIT.floor(), KIT.bench(24,94,88,104), KIT.barEnd(47,52)] }
    ],
    setup: 'Shoulder blades pulled back and down into the bench, slight arch, feet planted. Grip roughly 1.5× shoulder width.',
    cues: ['Elbows at about 45° to your body, not flared to 90°',
           'Touch the bar to your lower chest, under the nipple line',
           'Drive your feet into the floor as you press',
           'Bar path is a shallow arc back toward your shoulders, not straight up'],
    faults: ['Bouncing the bar off the chest', 'Elbows flaring wide — the fastest route to a shoulder problem',
             'Shoulder blades unlocking and rolling forward at the bottom']
  },
  'bb-ohp': {
    name: 'Overhead Press', labels: ['Rack', 'Overhead'],
    frames: [
      { hip:[60,80], sh:[60,44], hand:[52,48], ank:[60,140], toe:[74,142], elbowBend:1,
        kit:[KIT.floor(), KIT.barH(52,48,28)] },
      { hip:[60,80], sh:[60,44], hand:[59,16], ank:[60,140], toe:[74,142], elbowBend:1,
        kit:[KIT.floor(), KIT.barH(59,16,28)] }
    ],
    setup: 'Bar resting on your front delts, grip just outside shoulder width, elbows slightly in front of the bar. Squeeze glutes and brace.',
    cues: ['Move your head back out of the way, then press up and slightly back',
           'Finish with the bar over the middle of your feet, not in front of your face',
           'Shrug your shoulders up at the very top to finish the lockout',
           'Ribs down — do not lean back to make it easier'],
    faults: ['Pressing around the head instead of moving the head', 'Turning it into a standing incline press by leaning back',
             'Flaring elbows out to the sides at the start']
  },
  'bb-row': {
    name: 'Barbell Row', labels: ['Hang', 'Contracted'],
    frames: [
      { hip:[64,88], sh:[46,62], hand:[44,98], ank:[62,140], toe:[76,142], kneeBend:-1, elbowBend:-1,
        kit:[KIT.floor(), KIT.barH(44,98,24)] },
      { hip:[64,88], sh:[46,62], hand:[47,82], ank:[62,140], toe:[76,142], kneeBend:-1, elbowBend:-1,
        kit:[KIT.floor(), KIT.barH(47,82,24)] }
    ],
    setup: 'Hinge to roughly 45° or lower with a soft knee. Back flat and locked before the bar leaves the floor.',
    cues: ['Pull to your lower ribs or upper stomach, not your chest',
           'Lead with the elbows and think about driving them past your ribs',
           'Keep the torso angle fixed — no heaving upright each rep',
           'Full stretch at the bottom, let the shoulder blades travel forward'],
    faults: ['Standing up a little on every rep to cheat the weight up',
             'Rounding the back once fatigue sets in', 'Shrugging instead of rowing']
  },
  'bb-rdl': {
    name: 'Romanian Deadlift', labels: ['Top', 'Stretch'],
    frames: [
      { hip:[60,80], sh:[60,44], hand:[62,80], ank:[60,140], toe:[74,142], elbowBend:-1,
        kit:[KIT.floor(), KIT.barH(62,80,26)] },
      { hip:[70,84], sh:[46,66], hand:[46,101], ank:[62,140], toe:[76,142], kneeBend:-1, elbowBend:-1,
        kit:[KIT.floor(), KIT.barH(46,101,26)] }
    ],
    setup: 'Start standing with the bar at your hips. Knees stay softly bent and that bend does not change during the set.',
    cues: ['Push your hips back toward the wall behind you',
           'The bar drags down your thighs, staying in contact',
           'Stop when your hamstrings run out of stretch, not at a fixed height',
           'Stand up by driving the hips forward, not by pulling with your back'],
    faults: ['Turning it into a squat by bending the knees more as you descend',
             'Letting the bar drift away from the legs', 'Chasing depth past where your hamstrings actually stop']
  },
  'bw-pullup': {
    name: 'Pull-Up', labels: ['Hang', 'Top'],
    frames: [
      { hip:[60,80], sh:[60,44], hand:[60,18], ank:[62,136], toe:[76,138], kneeBend:-1, elbowBend:1,
        kit:[KIT.pullBar(16)] },
      { hip:[60,66], sh:[60,32], hand:[60,18], ank:[64,122], toe:[78,124], kneeBend:-1, elbowBend:1,
        kit:[KIT.pullBar(16)] }
    ],
    setup: 'Grip slightly wider than shoulders. Start from a dead hang with the shoulders active, not slack.',
    cues: ['Begin by pulling your shoulder blades down and back',
           'Drive your elbows down toward your back pockets',
           'Chest to the bar, not chin over it, if you can',
           'Lower under control — the negative is where a lot of the growth is'],
    faults: ['Kipping and swinging when the reps get hard',
             'Half reps that never reach a full hang', 'Shrugging up into the ears at the top']
  },
  'bw-pushup': {
    name: 'Push-Up', labels: ['Top', 'Bottom'],
    frames: [
      { hip:[62,116], sh:[30,105], hand:[20,140], ank:[116,132], toe:[118,142], kneeBend:1, elbowBend:-1,
        ant:[0,1], kit:[KIT.floor(), KIT.guide([16,101],[118,134])] },
      { hip:[62,126], sh:[30,126], hand:[20,140], ank:[116,136], toe:[118,142], kneeBend:1, elbowBend:-1,
        ant:[0,1], kit:[KIT.floor(), KIT.guide([16,124],[118,138])] }
    ],
    setup: 'Hands just outside shoulder width, fingers spread. Body in one straight line from heels to head.',
    cues: ['Squeeze glutes and brace the abs so the hips do not sag',
           'Elbows back at roughly 45°, not out at 90°',
           'Chest touches down, not just the chin',
           'Push the floor away and let the shoulder blades spread at the top'],
    faults: ['Hips sagging or piking up', 'Head craning forward to touch first', 'Partial range once fatigue arrives']
  },
  'bw-dip': {
    name: 'Dip', labels: ['Top', 'Bottom'],
    frames: [
      { hip:[62,92], sh:[60,54], hand:[60,58], ank:[70,132], toe:[82,136], kneeBend:-1, elbowBend:1,
        kit:[KIT.dipBars(58)] },
      { hip:[62,106], sh:[60,72], hand:[58,58], ank:[72,136], toe:[84,140], kneeBend:-1, elbowBend:1,
        kit:[KIT.dipBars(58)] }
    ],
    setup: 'Support yourself with locked arms, shoulders down away from your ears, slight forward lean for chest emphasis.',
    cues: ['Lower until your upper arm is roughly parallel to the floor',
           'Keep the shoulders packed down throughout',
           'Elbows track back, not out to the sides',
           'Stop the set well before your shoulders start complaining'],
    faults: ['Going far too deep and dumping load onto the shoulder capsule',
             'Shrugging up at the bottom', 'Bouncing out of the bottom position']
  },
  'db-bench': {
    name: 'Dumbbell Bench Press', labels: ['Stretch', 'Lockout'],
    frames: [
      { hip:[78,90], sh:[44,88], hand:[40,70], ank:[106,140], toe:[116,142], kneeBend:-1, elbowBend:1,
        kit:[KIT.floor(), KIT.bench(24,94,88,104), KIT.db(40,70)] },
      { hip:[78,90], sh:[44,88], hand:[47,53], ank:[106,140], toe:[116,142], kneeBend:-1, elbowBend:1,
        kit:[KIT.floor(), KIT.bench(24,94,88,104), KIT.db(47,53)] }
    ],
    setup: 'Kick the dumbbells up with your knees. Shoulder blades set, wrists stacked over elbows.',
    cues: ['Lower until you feel a stretch across the chest, roughly level with the torso',
           'Elbows at about 45°, forearms vertical throughout',
           'Press up and slightly together without clanging them',
           'Control the eccentric — dumbbells punish a rushed descent'],
    faults: ['Dropping the elbows below the bench in search of more stretch',
             'Letting the wrists bend back', 'Pressing in an arc that ends over the face']
  },
  'mach-lat-pulldown': {
    name: 'Lat Pulldown', labels: ['Stretch', 'Contracted'],
    frames: [
      { hip:[60,104], sh:[64,68], hand:[60,32], ank:[88,140], toe:[100,142], kneeBend:-1, elbowBend:1,
        kit:[KIT.floor(), KIT.bench(40,104,86,112), KIT.cableTop(60,8,60,32), KIT.barH(60,32,26)] },
      { hip:[60,104], sh:[64,68], hand:[58,58], ank:[88,140], toe:[100,142], kneeBend:-1, elbowBend:1,
        kit:[KIT.floor(), KIT.bench(40,104,86,112), KIT.cableTop(60,8,58,58), KIT.barH(58,58,26)] }
    ],
    setup: 'Thighs locked under the pads. Grip slightly wider than shoulders. Lean back no more than about 15°.',
    cues: ['Start the pull by depressing the shoulder blades, then bend the arms',
           'Pull to your upper chest, elbows driving down and back',
           'Control the way up and let the lats stretch fully',
           'Keep the torso angle constant — do not row it'],
    faults: ['Leaning way back and turning it into a row', 'Yanking with the arms while the shoulders stay shrugged',
             'Pulling behind the neck, which does the shoulders no favours']
  },
  'bb-hip-thrust': {
    name: 'Hip Thrust', labels: ['Bottom', 'Lockout'],
    frames: [
      { hip:[76,126], sh:[42,94], hand:[62,116], ank:[104,140], toe:[116,142], kneeBend:-1, elbowBend:1,
        kit:[KIT.floor(), KIT.bench(18,96,54,106), KIT.barH(76,120,20)] },
      { hip:[78,100], sh:[42,94], hand:[62,94], ank:[104,140], toe:[116,142], kneeBend:-1, elbowBend:1,
        kit:[KIT.floor(), KIT.bench(18,96,54,106), KIT.barH(78,94,20)] }
    ],
    setup: 'Shoulder blades on the bench edge, bar across the hip crease with a pad. Feet placed so shins are vertical at the top.',
    cues: ['Tuck the chin and keep the ribs down',
           'Drive through the heels and squeeze the glutes hard at lockout',
           'Finish with the torso parallel to the floor — no higher',
           'Pause for a beat at the top on every rep'],
    faults: ['Hyperextending the lower back at the top instead of finishing with glutes',
             'Feet too far forward, turning it into a hamstring exercise', 'Chin lifting and neck extending']
  },
  'bw-plank': {
    name: 'Plank', labels: ['Correct', 'Hips sagging'],
    frames: [
      { hip:[64,108], sh:[34,106], hand:[28,140], ank:[118,124], toe:[118,140], kneeBend:1, elbowBend:1,
        ant:[0,1], kit:[KIT.floor()] },
      { hip:[64,126], sh:[34,108], hand:[28,140], ank:[118,128], toe:[118,142], kneeBend:1, elbowBend:1,
        ant:[0,1], kit:[KIT.floor()] }
    ],
    setup: 'Elbows under shoulders, forearms flat. Feet hip-width. One straight line from heels through head.',
    cues: ['Squeeze glutes hard — this is what stops the hips dropping',
           'Tuck the pelvis slightly so the lower back flattens',
           'Push the floor away to spread the shoulder blades',
           'Breathe normally. If you cannot, you are bracing too hard'],
    faults: ['Hips sagging, which loads the lower back instead of the abs (right)',
             'Piking the hips up to make it easier', 'Holding for time with terrible position rather than stopping']
  },
  'db-row': {
    name: 'Dumbbell Row', labels: ['Stretch', 'Contracted'],
    frames: [
      { hip:[66,92], sh:[44,66], hand:[42,101], ank:[64,140], toe:[78,142], kneeBend:-1, elbowBend:-1,
        kit:[KIT.floor(), KIT.db(42,101)] },
      { hip:[66,92], sh:[44,66], hand:[46,86], ank:[64,140], toe:[78,142], kneeBend:-1, elbowBend:-1,
        kit:[KIT.floor(), KIT.db(46,86)] }
    ],
    setup: 'One hand and knee on a bench, or hinged over with the free hand on a rack. Back flat, hips square.',
    cues: ['Let the shoulder blade travel forward at the bottom for a full stretch',
           'Pull the elbow toward your hip pocket, not straight up',
           'Keep the hips square — no twisting to move more weight',
           'Pause briefly at the top of every rep'],
    faults: ['Rotating the torso to heave the weight', 'Pulling with the biceps and never moving the shoulder blade',
             'Rounding the back as the set gets hard']
  }
};

function hasForm(exId) { return !!FORMS[exId]; }

/* ---------- batch two ---------- */
Object.assign(FORMS, {
  'bb-front-squat': {
    name: 'Front Squat', labels: ['Standing', 'Bottom'],
    frames: [
      { hip:[60,80], sh:[60,44], hand:[70,48], ank:[60,140], toe:[74,142], elbowBend:1,
        kit:[KIT.floor(), KIT.barH(68,48,28)] },
      { hip:[54,106], sh:[58,70], hand:[68,72], ank:[60,140], toe:[74,142], kneeBend:-1, elbowBend:1,
        kit:[KIT.floor(), KIT.barH(66,72,28)] }
    ],
    setup: 'Bar across the front delts, not held in the hands. Elbows up high and kept there — the shelf is your shoulders, the fingers are only a strap.',
    cues: ['Elbows stay pointed forward and high the entire set',
           'More upright than a back squat — the torso barely leans',
           'Sit straight down between the feet',
           'If the elbows drop, the bar rolls forward and the rep is over'],
    faults: ['Elbows dropping under fatigue and dumping the bar',
             'Gripping the bar in the palms instead of resting it on the delts',
             'Leaning forward as if it were a back squat']
  },
  'db-goblet-squat': {
    name: 'Goblet Squat', labels: ['Standing', 'Bottom'],
    frames: [
      { hip:[60,80], sh:[60,44], hand:[70,58], ank:[60,140], toe:[74,142], elbowBend:-1,
        kit:[KIT.floor(), KIT.db(70,58)] },
      { hip:[54,106], sh:[58,70], hand:[70,84], ank:[60,140], toe:[74,142], kneeBend:-1, elbowBend:-1,
        kit:[KIT.floor(), KIT.db(70,84)] }
    ],
    setup: 'Hold one dumbbell or kettlebell vertically against the chest, elbows tucked underneath it. The weight in front is what keeps you upright.',
    cues: ['Elbows brush the inside of the knees at the bottom',
           'Chest stays tall — the counterweight makes this easier than a back squat',
           'Sit down between the feet rather than folding forward',
           'Pause a beat at the bottom before standing'],
    faults: ['Letting the weight drift away from the chest',
             'Rounding forward as the set gets hard',
             'Cutting the depth short when the counterweight would allow more']
  },
  'mach-leg-press': {
    name: 'Leg Press', labels: ['Bottom', 'Extended'],
    frames: [
      { hip:[36,116], sh:[18,90], hand:[46,110], ank:[66,84], toe:[70,72], kneeBend:1, elbowBend:-1,
        kit:[KIT.floor(), KIT.pad(10,80,40,124), KIT.pad(58,70,78,96)] },
      { hip:[36,116], sh:[18,90], hand:[46,110], ank:[90,90], toe:[95,78], kneeBend:1, elbowBend:-1,
        kit:[KIT.floor(), KIT.pad(10,80,40,124), KIT.pad(82,76,102,102)] }
    ],
    setup: 'Back and hips flat against the pad, feet about shoulder width on the platform. Never let the lower back peel away from the pad.',
    cues: ['Lower until the knees reach roughly 90°, or wherever your back stays flat',
           'Push through the whole foot, not just the toes',
           'Leave a soft bend at the top — do not slam the knees straight',
           'Control the negative; this is the machine people load stupidly'],
    faults: ['Going so deep the hips curl off the pad and round the lower back',
             'Locking the knees out hard at the top',
             'Hands on the knees pushing them through — use the handles']
  },
  'db-bulgarian': {
    name: 'Bulgarian Split Squat', labels: ['Top', 'Bottom'],
    frames: [
      { hip:[56,86], sh:[56,50], hand:[46,85], ank:[46,140], toe:[34,142], ank2:[96,112], toe2:[106,116],
        kneeBend:1, kneeBend2:1, elbowBend:-1,
        kit:[KIT.floor(), KIT.bench(84,112,116,120), KIT.db(46,85)] },
      { hip:[56,106], sh:[56,70], hand:[46,105], ank:[46,140], toe:[34,142], ank2:[96,112], toe2:[106,116],
        kneeBend:1, kneeBend2:1, elbowBend:-1,
        kit:[KIT.floor(), KIT.bench(84,112,116,120), KIT.db(46,105)] }
    ],
    setup: 'Back foot resting on a bench roughly knee height. Front foot far enough forward that the shin stays near vertical at the bottom.',
    cues: ['All the weight lives in the front foot — the back leg only balances',
           'Torso upright, or hinged slightly forward for more glute',
           'Back knee travels straight down',
           'Find the stride length once, then keep it identical every rep'],
    faults: ['Stride too short, so the front knee runs way past the toes',
             'Pushing off the back foot to help',
             'Front knee caving inwards as fatigue arrives']
  },
  'db-lunge': {
    name: 'Dumbbell Lunge', labels: ['Standing', 'Bottom'],
    frames: [
      { hip:[60,80], sh:[60,44], hand:[70,78], ank:[60,140], toe:[74,142], elbowBend:-1,
        kit:[KIT.floor(), KIT.db(70,78)] },
      { hip:[56,102], sh:[56,66], hand:[68,100], ank:[42,140], toe:[30,142], ank2:[96,140], toe2:[106,142],
        kneeBend:1, kneeBend2:1, elbowBend:-1,
        kit:[KIT.floor(), KIT.db(68,100)] }
    ],
    setup: 'Dumbbells hanging at your sides, shoulders back. Step out far enough that the front shin finishes close to vertical.',
    cues: ['Drop the back knee straight down towards the floor',
           'Weight through the front heel and midfoot to stand up',
           'Torso stays upright — do not lean over the front leg',
           'Slow on the way down; that is where the balance is won'],
    faults: ['Short stride, so the front knee travels well past the toes',
             'Front knee collapsing inward',
             'Rushing and falling into each rep instead of controlling it']
  },
  'bw-pistol': {
    name: 'Pistol Squat', labels: ['Standing', 'Bottom'],
    frames: [
      { hip:[58,80], sh:[58,44], hand:[86,50], ank:[58,140], toe:[72,142], ank2:[96,112], toe2:[108,110],
        kneeBend2:-1, elbowBend:-1, kit:[KIT.floor()] },
      { hip:[52,112], sh:[56,78], hand:[86,80], ank:[46,140], toe:[60,142], ank2:[110,106], toe2:[118,102],
        kneeBend:-1, kneeBend2:1, elbowBend:-1, kit:[KIT.floor()] }
    ],
    setup: 'Stand on one leg with the other held out in front. Arms forward as a counterweight — that is not cheating, it is how the movement works.',
    cues: ['Sit back and down slowly, free leg reaching forward',
           'Keep the whole standing foot on the floor',
           'Reach the arms out to stay balanced',
           'If you cannot control the descent, hold a support or squat to a box'],
    faults: ['Collapsing into the bottom rather than lowering under control',
             'Heel lifting — usually ankle mobility',
             'The standing knee caving inward at the bottom']
  },
  'db-rdl': {
    name: 'Dumbbell RDL', labels: ['Top', 'Stretch'],
    frames: [
      { hip:[60,80], sh:[60,44], hand:[70,78], ank:[60,140], toe:[74,142], elbowBend:-1,
        kit:[KIT.floor(), KIT.db(70,78)] },
      { hip:[70,84], sh:[46,66], hand:[44,99], ank:[62,140], toe:[76,142], kneeBend:-1, elbowBend:-1,
        kit:[KIT.floor(), KIT.db(44,99)] }
    ],
    setup: 'Dumbbells in front of the thighs, knees softly bent. That bend is set at the start and does not change for the whole set.',
    cues: ['Push the hips back towards the wall behind you',
           'Dumbbells stay close, brushing down the front of the legs',
           'Stop where your hamstrings stop, not at a fixed height',
           'Stand up by driving the hips forward'],
    faults: ['Bending the knees more as you descend, turning it into a squat',
             'Letting the dumbbells drift away from the body',
             'Rounding the back to chase extra range']
  },
  'kb-swing': {
    name: 'Kettlebell Swing', labels: ['Hike', 'Float'],
    frames: [
      { hip:[70,88], sh:[50,64], hand:[52,98], ank:[62,140], toe:[76,142], kneeBend:-1, elbowBend:-1,
        kit:[KIT.floor(), KIT.db(52,98)] },
      { hip:[60,80], sh:[60,44], hand:[96,50], ank:[60,140], toe:[74,142], elbowBend:-1,
        kit:[KIT.floor(), KIT.db(96,50)] }
    ],
    setup: 'Bell a little in front of you. Hinge, not squat — the shins stay close to vertical and the bell passes high between the thighs.',
    cues: ['Snap the hips forward; the arms are rope, not engine',
           'The bell floats to chest height on its own — do not lift it',
           'Squeeze glutes hard at the top, ribs down',
           'Let the bell fall, then hinge to catch it'],
    faults: ['Squatting the bell up instead of hinging',
             'Lifting with the shoulders to reach chest height',
             'Leaning back at the top and hanging off the lower back']
  },
  'bb-incline-bench': {
    name: 'Incline Bench Press', labels: ['Chest', 'Lockout'],
    frames: [
      { hip:[86,104], sh:[52,84], hand:[74,84], ank:[104,140], toe:[114,142], kneeBend:-1, elbowBend:1,
        kit:[KIT.floor(), KIT.pad(46,92,90,114), KIT.pad(90,112,116,116), KIT.barEnd(74,84)] },
      { hip:[86,104], sh:[52,84], hand:[84,69], ank:[104,140], toe:[114,142], kneeBend:-1, elbowBend:1,
        kit:[KIT.floor(), KIT.pad(46,92,90,114), KIT.pad(90,112,116,116), KIT.barEnd(84,69)] }
    ],
    setup: 'Bench set to roughly 30°. Higher than that and it turns into a shoulder press. Shoulder blades pinned back, feet planted.',
    cues: ['Touch the bar to the upper chest, just below the collarbone',
           'Elbows around 45°, not flared wide',
           'Press up and slightly back over the shoulders',
           'Keep the shoulder blades pulled back the entire set'],
    faults: ['Bench angled too steep, turning it into an overhead press',
             'Bar touching the throat instead of the upper chest',
             'Shoulders rolling forward at the bottom']
  },
  'db-shoulder-press': {
    name: 'Dumbbell Shoulder Press', labels: ['Bottom', 'Overhead'],
    frames: [
      { hip:[60,80], sh:[60,44], hand:[74,50], ank:[60,140], toe:[74,142], elbowBend:1,
        kit:[KIT.floor(), KIT.db(74,50)] },
      { hip:[60,80], sh:[60,44], hand:[63,14], ank:[60,140], toe:[74,142], elbowBend:1,
        kit:[KIT.floor(), KIT.db(63,14)] }
    ],
    setup: 'Dumbbells at shoulder height, palms forward or slightly turned in. Ribs down and glutes tight before the first rep.',
    cues: ['Press up and very slightly in, finishing over the middle of your head',
           'Squeeze the glutes so the lower back does not arch',
           'Lower to about ear height under control',
           'Wrists stacked over the elbows, not bent back'],
    faults: ['Arching the lower back to press a weight that is too heavy',
             'Letting the dumbbells drift forward over the face',
             'Clanging them together at the top']
  },
  'mach-cable-row': {
    name: 'Seated Cable Row', labels: ['Stretch', 'Contracted'],
    frames: [
      { hip:[64,110], sh:[54,76], hand:[22,92], ank:[28,132], toe:[18,136], kneeBend:1, elbowBend:-1,
        kit:[KIT.floor(), KIT.bench(50,110,100,118), KIT.cableLow(8,92,22,92)] },
      { hip:[64,110], sh:[68,76], hand:[46,90], ank:[28,132], toe:[18,136], kneeBend:1, elbowBend:-1,
        kit:[KIT.floor(), KIT.bench(50,110,100,118), KIT.cableLow(8,92,46,90)] }
    ],
    setup: 'Feet planted, soft knees, chest up. Let the shoulder blades travel forward at the stretch without rounding the lower back.',
    cues: ['Start the pull by drawing the shoulder blades together',
           'Pull the handle to the bottom of the ribs, not the collarbone',
           'Elbows stay close to the body',
           'Return under control — do not let the stack pull you forward'],
    faults: ['Rocking the torso back and forth to move the weight',
             'Rounding the lower back at the stretch',
             'Shrugging the shoulders up towards the ears']
  },
  'bw-inverted-row': {
    name: 'Inverted Row', labels: ['Hang', 'Chest to bar'],
    frames: [
      { hip:[66,116], sh:[30,102], hand:[30,68], ank:[118,134], toe:[118,122], kneeBend:-1, elbowBend:1,
        kit:[KIT.floor(), KIT.rackLow(66)] },
      { hip:[66,102], sh:[30,86], hand:[30,68], ank:[118,128], toe:[118,116], kneeBend:-1, elbowBend:1,
        kit:[KIT.floor(), KIT.rackLow(66)] }
    ],
    setup: 'Bar at roughly hip height. Hang underneath it with the body in one straight line from heels to head — the lower the bar, the harder it gets.',
    cues: ['Squeeze the glutes so the hips do not sag',
           'Pull the chest to the bar, not the chin',
           'Shoulder blades pull together at the top',
           'Lower all the way to straight arms every rep'],
    faults: ['Hips sagging so it becomes a half rep',
             'Pulling with the arms while the shoulder blades never move',
             'Cutting the range short at the top']
  },
  'bw-chinup': {
    name: 'Chin-Up', labels: ['Hang', 'Top'],
    frames: [
      { hip:[60,80], sh:[60,44], hand:[54,18], ank:[62,136], toe:[76,138], kneeBend:-1, elbowBend:1,
        kit:[KIT.pullBar(16)] },
      { hip:[60,66], sh:[60,32], hand:[54,18], ank:[64,122], toe:[78,124], kneeBend:-1, elbowBend:1,
        kit:[KIT.pullBar(16)] }
    ],
    setup: 'Palms facing you, hands about shoulder width — narrower than a pull-up. The underhand grip brings the biceps in, which is why most people can do more of these.',
    cues: ['Pull the shoulder blades down before the elbows bend',
           'Drive the elbows down and slightly forward',
           'Chest towards the bar, chin clearing it as a consequence',
           'Full hang at the bottom of every rep'],
    faults: ['Kipping once the reps get hard',
             'Stopping halfway down to avoid the hardest part',
             'Elbows flaring wide instead of tracking down']
  },
  'db-curl': {
    name: 'Dumbbell Curl', labels: ['Bottom', 'Top'],
    frames: [
      { hip:[60,80], sh:[60,44], hand:[70,78], ank:[60,140], toe:[74,142], elbowBend:-1,
        kit:[KIT.floor(), KIT.db(70,78)] },
      { hip:[60,80], sh:[60,44], hand:[72,54], ank:[60,140], toe:[74,142], elbowBend:-1,
        kit:[KIT.floor(), KIT.db(72,54)] }
    ],
    setup: 'Standing tall, dumbbells at your sides, elbows pinned against the ribs. The elbow is the only joint that moves.',
    cues: ['Curl without letting the elbow drift forward',
           'Squeeze at the top for a beat',
           'Lower all the way to a straight arm, slowly',
           'Shoulders and hips stay completely still'],
    faults: ['Swinging the body to start the rep',
             'Elbows travelling forward, handing the work to the front delt',
             'Half reps that never straighten the arm']
  },
  'cab-pushdown': {
    name: 'Tricep Pushdown', labels: ['Start', 'Lockout'],
    frames: [
      { hip:[60,80], sh:[60,44], hand:[71,49], ank:[60,140], toe:[74,142], elbowBend:1,
        kit:[KIT.floor(), KIT.cableTop(72,18,71,49)] },
      { hip:[60,80], sh:[60,44], hand:[64,80], ank:[60,140], toe:[74,142], elbowBend:1,
        kit:[KIT.floor(), KIT.cableTop(72,18,64,80)] }
    ],
    setup: 'Stand close to the stack with a slight forward lean. Upper arms locked against your sides and kept there for the whole set.',
    cues: ['Only the forearms move — the elbows never travel',
           'Push all the way to a straight arm and squeeze',
           'Let the handle rise until you feel the stretch, no further',
           'Keep the wrists straight, not curled under'],
    faults: ['Leaning over the weight and turning it into a press',
             'Elbows flaring out and drifting forward',
             'Bouncing the stack at the top of each rep']
  },
  'bw-dead-hang': {
    name: 'Dead Hang', labels: ['Full hang', 'Knees tucked'],
    frames: [
      { hip:[60,90], sh:[60,54], hand:[60,18], ank:[62,140], toe:[76,142], kneeBend:-1, elbowBend:1,
        kit:[KIT.pullBar(16)] },
      { hip:[60,90], sh:[60,54], hand:[60,18], ank:[88,110], toe:[98,104], kneeBend:-1, elbowBend:1,
        kit:[KIT.pullBar(16)] }
    ],
    setup: 'Hang from a bar with a full grip, feet clear of the floor. Start relaxed, then pull the shoulders down away from your ears.',
    cues: ['Start relaxed, then pull the shoulder blades down away from your ears',
           'Tuck the knees up if the floor is in the way, or to make it harder',
           'Ribs down — do not let the back arch',
           'Build the time gradually; the grip usually gives out first'],
    faults: ['Hanging completely slack in the shoulders for the whole set',
             'Swinging instead of hanging still',
             'Dropping off the bar rather than stepping down under control']
  }
});

/* ============================================================
   PATTERN GUIDANCE
   ------------------------------------------------------------
   Fourteen lifts have hand-built diagrams. The library has 236
   movements. Rather than let the other 222 open an empty sheet,
   every exercise falls back to guidance for its movement pattern
   — which is where most of the useful instruction lives anyway,
   because a dumbbell row and a cable row fail in the same ways.
   ============================================================ */
const PATTERN_GUIDE = {
  'squat': {
    setup: 'Feet about shoulder width, toes turned out a little. Brace as though you are about to be pushed, then sit down between your feet rather than folding forward over them.',
    cues: ['Screw your feet into the floor — it stops the knees drifting in',
           'Down under control, no bouncing out of the bottom',
           'Knees track over the middle toes throughout',
           'Chest stays proud; the bar or weight stays over midfoot'],
    faults: ['Knees collapsing inward as you stand up',
             'Heels lifting — usually ankle mobility, sometimes just too much weight',
             'Hips shooting up first, turning it into a good morning']
  },
  'hinge': {
    setup: 'Weight over midfoot, soft knees, and push the hips backwards rather than bending the knees. The shins stay close to vertical.',
    cues: ['Long spine from head to tailbone the whole way',
           'Drag the weight close to your legs',
           'Feel it in the hamstrings, not the lower back',
           'Finish by squeezing the glutes, not by leaning back'],
    faults: ['Rounding the lower back under load — the one that actually hurts people',
             'Turning it into a squat by bending the knees too early',
             'Hyperextending at the top and stressing the spine']
  },
  'push-h': {
    setup: 'Shoulder blades pulled back and down and kept there. Wrists stacked over elbows so the load runs through bone, not joint.',
    cues: ['Elbows around 45° from the body, not flared to 90°',
           'Lower under control — you own the weight on the way down',
           'Push the floor away with your feet if you are on a bench',
           'Full range, but stop short of the shoulder complaining'],
    faults: ['Elbows flared straight out to the sides',
             'Shoulders rolling forward off the bench at the bottom',
             'Bouncing the weight off the chest']
  },
  'push-v': {
    setup: 'Ribs down, glutes and abs tight. If your lower back arches to get the weight up, the weight is too heavy.',
    cues: ['Press slightly back so the weight finishes over the middle of your head',
           'Squeeze the glutes to stop the lower back arching',
           'Bar or dumbbells travel in a straight line, not around your face',
           'Shrug up at the top to finish the lockout'],
    faults: ['Leaning back into a standing incline press',
             'Flaring the ribs and losing the brace',
             'Stopping short of full lockout every rep']
  },
  'pull-h': {
    setup: 'Hinge to roughly 45° or brace against a bench. Set the shoulder blades before the first rep, not during it.',
    cues: ['Lead with the elbow, not the hand',
           'Pull to the bottom of the ribs, not the collarbone',
           'Squeeze the shoulder blade at the end of each rep',
           'Control the way back — that half is doing real work'],
    faults: ['Yanking with the lower back and turning it into a deadlift',
             'Pulling with the arms while the shoulder blade never moves',
             'Dropping the weight rather than lowering it']
  },
  'pull-v': {
    setup: 'Grip just outside shoulder width. Start from a full hang or full stretch — the bottom of the range is where the back grows.',
    cues: ['Pull the shoulder blades down before the elbows bend',
           'Drive the elbows down towards your back pockets',
           'Chest towards the bar, not chin over it',
           'Lower all the way, every rep'],
    faults: ['Kipping and swinging once it gets hard',
             'Shrugging up towards the ears instead of pulling down',
             'Half reps from the halfway point']
  },
  'lunge': {
    setup: 'Long enough stride that the front shin stays roughly vertical. Weight through the front heel and midfoot.',
    cues: ['Torso upright, or hinged slightly forward for more glute',
           'Back knee travels down, not forward',
           'Push through the front foot to stand',
           'Slow on the way down — that is where the balance is won'],
    faults: ['Stride too short, so the front knee runs past the toes',
             'Front knee caving inwards',
             'Rushing and losing the balance instead of owning it']
  },
  'delts': {
    setup: 'Light weight, long lever. This is the one where ego costs you the most and gains you the least.',
    cues: ['Lead with the elbows, hands slightly behind them',
           'Stop at shoulder height — higher becomes traps',
           'Tiny forward tilt, as though pouring from a jug',
           'Lower slowly; do not let gravity do the eccentric'],
    faults: ['Swinging the whole body to start the rep',
             'Going far too heavy and turning it into a shrug',
             'Wrists bent back under the load']
  },
  'arms-bi': {
    setup: 'Elbows pinned at your sides and kept there. The only joint that moves is the elbow.',
    cues: ['Squeeze at the top without swinging',
           'Lower under control through the full range',
           'Wrists stay neutral, not curled back',
           'Shoulders stay still — no rocking'],
    faults: ['Elbows drifting forward, handing the work to the front delt',
             'Using the lower back to swing the weight up',
             'Half reps that never straighten the arm']
  },
  'arms-tri': {
    setup: 'Upper arm fixed. Whether overhead, at your side or on a bench, the elbow is the hinge and nothing else moves.',
    cues: ['Full lockout at the end of each rep',
           'Keep the elbows in, not flaring out',
           'Stretch at the bottom before reversing',
           'Steady tempo — this is not a power movement'],
    faults: ['Elbows flaring wide to move more weight',
             'Turning it into a press with the shoulders',
             'Bouncing out of the stretched position']
  },
  'core': {
    setup: 'Brace as though you are about to be punched, then breathe shallowly into that brace. Quality beats duration every time.',
    cues: ['Ribs down, pelvis slightly tucked',
           'Breathe — holding your breath is not bracing',
           'Move slowly and deliberately',
           'Stop the set when the position breaks, not when the timer ends'],
    faults: ['Lower back sagging or arching under fatigue',
             'Holding the breath throughout',
             'Chasing time while the position falls apart']
  },
  'calves': {
    setup: 'Full range is the whole point — all the way down into the stretch, all the way up onto the toes.',
    cues: ['Pause a beat at the bottom stretch',
           'Rise all the way onto the toes',
           'Slow and controlled, not bouncing on the tendon',
           'Higher reps suit this one'],
    faults: ['Tiny bouncing reps using tendon rebound',
             'Cutting the bottom stretch short',
             'Going so heavy the range collapses']
  },
  'carry': {
    setup: 'Stand tall, shoulders back, weight hanging. Walk normally — do not lean away from the load.',
    cues: ['Ribs down, brace the whole way',
           'Even, deliberate steps',
           'Shoulders stay level, especially one-sided',
           'Grip is usually what fails first, and that is fine'],
    faults: ['Leaning away from the weight on one-sided carries',
             'Shoulders rolling forward',
             'Rushing the steps']
  },
  'cardio': {
    setup: 'Steady effort you could hold a broken conversation at, unless the session says otherwise.',
    cues: ['Relaxed shoulders and jaw',
           'Breathe in rhythm with the movement',
           'Consistent pace beats a fast start',
           'Finish able to say you could have done a little more'],
    faults: ['Starting far too fast and fading',
             'Gripping the handles and carrying tension in the upper body',
             'Chasing a number instead of an effort']
  },
  'mobility': {
    setup: 'Slow, controlled, and never into sharp pain. Stretch should feel like a strong pull, never a pinch.',
    cues: ['Breathe out as you move deeper',
           'Hold long enough to actually settle',
           'Both sides, equal time',
           'Ease off if anything sharpens'],
    faults: ['Bouncing into the end range',
             'Holding the breath',
             'Pushing into pain rather than tension']
  }
};

function guideFor(exId) {
  const ex = EX[exId];
  if (!ex) return null;
  return PATTERN_GUIDE[ex.pattern] || null;
}
