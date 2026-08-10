/* ============================================================
   Guzo — v1.0 beta
   ጉዞ (guzo) — Amharic for "journey".
   የእግር ጉዞ (ye-igir guzo), "foot journey", is the everyday word
   for hiking. Strength and health training that re-plans itself
   around a life that keeps changing shape.
   Single-file PWA. All data local to this device.
   ============================================================ */
'use strict';

/* The whole app is one script block, so reaching this line proves the script
   parsed and is running. Only then do we retire the static fallback panel.
   If a preview window has scripts switched off, this never runs and the user
   gets an explanation instead of a black rectangle. */
(function () {
  const b = document.getElementById('s-boot');
  if (b) b.classList.remove('on');
})();

/* Last line of defence: anything that escapes to the top puts the panel back
   with the actual message, so a failure is reportable rather than silent. */
function bootFail(err) {
  try {
    const b = document.getElementById('s-boot');
    if (!b) return;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
    b.classList.add('on');
    const nav = document.getElementById('nav');
    if (nav) nav.classList.add('hide');
    const sub = document.getElementById('boot-sub');
    const note = document.getElementById('boot-note');
    if (sub) sub.textContent = 'Guzo Fit hit a snag starting up.';
    if (note) {
      note.innerHTML = 'Your training data is untouched. Send this line on and it can be fixed:<br><br>' +
        '<span style="font-family:var(--fm);color:#F4D08C;font-size:11.5px">' +
        String((err && (err.message || err)) || 'unknown').slice(0, 200).replace(/[<>&]/g, '') +
        '</span>';
    }
  } catch (e) {}
}
window.addEventListener('error', e => { if (!window.__guzoBooted) bootFail(e.error || e.message); });

const VERSION = '1.2.0';
const KEY = 'guzo.v1';
const LEGACY_KEYS = ['fittrek.v1'];

/* ---------- feature gating scaffold (all unlocked in beta) ---------- */
const TIERSPEC = {
  free: ['log', 'ladder', 'readiness', 'history', 'export'],
  pro:  ['weekshaper', 'autoplan', 'nutrition', 'analytics', 'prs', 'customprog', 'coachnotes']
};
const BETA_UNLOCK_ALL = true;

/* The paywall renders real prices — £69.99 a year, £8.99 a month, "7-day free
   trial · cancel anytime" — and nothing behind it charges anything, because
   there is no StoreKit and no in-app purchase.

   That is fine in a personal beta and a liability in App Store review: a
   reviewer sees a subscription offer that does not work, which reads as an
   incomplete app at best and raises in-app-purchase questions at worst. It
   stays built and stays unreachable until real IAP exists. Flip this the same
   day StoreKit lands, not before. */
const SHOW_PAYWALL = false;
function can(feature) {
  if (BETA_UNLOCK_ALL) return true;
  if (TIERSPEC.free.includes(feature)) return true;
  return !!(S.billing && S.billing.pro);
}

/* ============================================================
   EXERCISE LIBRARY
   id | name | equipment | env(f=full gym,h=hotel/minimal,b=bodyweight only)
      | pattern | primary | secondary | tier(1-4) | repLow | repHigh | load
   ============================================================ */
const EXDATA = `
bb-back-squat|Back Squat|Barbell|f|squat|Quads|Glutes,Core|1|5|8|wt
bb-front-squat|Front Squat|Barbell|f|squat|Quads|Core,Glutes|1|5|8|wt
bb-deadlift|Deadlift|Barbell|f|hinge|Back|Hamstrings,Glutes|1|3|6|wt
bb-sumo-dl|Sumo Deadlift|Barbell|f|hinge|Glutes|Quads,Back|1|3|6|wt
bb-rdl|Romanian Deadlift|Barbell|f|hinge|Hamstrings|Glutes,Back|2|6|10|wt
bb-bench|Bench Press|Barbell|f|push-h|Chest|Triceps,Shoulders|1|5|8|wt
bb-incline-bench|Incline Bench Press|Barbell|f|push-h|Chest|Shoulders,Triceps|1|6|10|wt
bb-ohp|Overhead Press|Barbell|f|push-v|Shoulders|Triceps,Core|1|5|8|wt
bb-push-press|Push Press|Barbell|f|push-v|Shoulders|Triceps,Quads|2|4|6|wt
bb-row|Barbell Row|Barbell|f|pull-h|Back|Biceps,Core|1|6|10|wt
bb-pendlay|Pendlay Row|Barbell|f|pull-h|Back|Biceps|2|5|8|wt
bb-hip-thrust|Hip Thrust|Barbell|f|hinge|Glutes|Hamstrings|2|8|12|wt
bb-curl|Barbell Curl|Barbell|f|arms-bi|Biceps|Forearms|3|8|12|wt
bb-cgbp|Close-Grip Bench|Barbell|f|push-h|Triceps|Chest|2|6|10|wt
bb-good-morning|Good Morning|Barbell|f|hinge|Hamstrings|Back,Glutes|3|8|12|wt
bb-lunge|Barbell Lunge|Barbell|f|lunge|Quads|Glutes|2|8|12|wt
bb-floor-press|Floor Press|Barbell|f|push-h|Chest|Triceps|2|6|10|wt
bb-rack-pull|Rack Pull|Barbell|f|hinge|Back|Hamstrings|2|5|8|wt
bb-landmine-press|Landmine Press|Barbell|f|push-v|Shoulders|Chest,Core|3|8|12|wt
bb-shrug|Barbell Shrug|Barbell|f|pull-h|Back|Forearms|3|10|15|wt
db-bench|Dumbbell Bench Press|Dumbbell|fh|push-h|Chest|Triceps,Shoulders|1|6|10|wt
db-incline|Incline Dumbbell Press|Dumbbell|fh|push-h|Chest|Shoulders|2|8|12|wt
db-shoulder-press|Dumbbell Shoulder Press|Dumbbell|fh|push-v|Shoulders|Triceps|2|8|12|wt
db-arnold|Arnold Press|Dumbbell|fh|push-v|Shoulders|Triceps|3|8|12|wt
db-row|Dumbbell Row|Dumbbell|fh|pull-h|Back|Biceps|2|8|12|wt
db-goblet-squat|Goblet Squat|Dumbbell|fh|squat|Quads|Glutes,Core|2|8|14|wt
db-rdl|Dumbbell RDL|Dumbbell|fh|hinge|Hamstrings|Glutes|2|8|12|wt
db-lunge|Dumbbell Lunge|Dumbbell|fh|lunge|Quads|Glutes|2|8|12|wt
db-bulgarian|Bulgarian Split Squat|Dumbbell|fh|lunge|Quads|Glutes|2|8|12|wt
db-step-up|Dumbbell Step-Up|Dumbbell|fh|lunge|Quads|Glutes|3|8|12|wt
db-sl-rdl|Single-Leg RDL|Dumbbell|fh|hinge|Hamstrings|Glutes,Core|3|8|12|wt
db-curl|Dumbbell Curl|Dumbbell|fh|arms-bi|Biceps|Forearms|3|8|12|wt
db-hammer|Hammer Curl|Dumbbell|fh|arms-bi|Biceps|Forearms|3|8|12|wt
db-concentration|Concentration Curl|Dumbbell|fh|arms-bi|Biceps||3|10|15|wt
db-lateral|Lateral Raise|Dumbbell|fh|delts|Shoulders||3|12|18|wt
db-front-raise|Front Raise|Dumbbell|fh|delts|Shoulders||3|12|15|wt
db-rear-fly|Rear Delt Fly|Dumbbell|fh|delts|Shoulders|Back|3|12|18|wt
db-skull|Dumbbell Skullcrusher|Dumbbell|fh|arms-tri|Triceps||3|8|12|wt
db-oh-tricep|Overhead Tricep Extension|Dumbbell|fh|arms-tri|Triceps||3|10|15|wt
db-fly|Dumbbell Fly|Dumbbell|fh|push-h|Chest|Shoulders|3|10|15|wt
db-pullover|Dumbbell Pullover|Dumbbell|fh|pull-v|Back|Chest|3|10|15|wt
db-shrug|Dumbbell Shrug|Dumbbell|fh|pull-h|Back|Forearms|3|12|18|wt
db-thruster|Dumbbell Thruster|Dumbbell|fh|push-v|Shoulders|Quads,Core|2|8|12|wt
db-renegade-row|Renegade Row|Dumbbell|fh|pull-h|Back|Core|3|8|12|wt
db-floor-press|Dumbbell Floor Press|Dumbbell|fh|push-h|Chest|Triceps|2|8|12|wt
db-calf-raise|Dumbbell Calf Raise|Dumbbell|fh|calves|Calves||3|12|20|wt
db-farmers|Farmer's Carry|Dumbbell|fh|carry|Core|Forearms,Back|4|30|60|time
db-suitcase|Suitcase Carry|Dumbbell|fh|carry|Core|Forearms|4|30|60|time
mach-lat-pulldown|Lat Pulldown|Machine|fh|pull-v|Back|Biceps|1|8|12|wt
mach-cable-row|Seated Cable Row|Cable|fh|pull-h|Back|Biceps|1|8|12|wt
mach-chest-supported-row|Chest-Supported Row|Machine|f|pull-h|Back|Biceps|2|8|12|wt
mach-leg-press|Leg Press|Machine|fh|squat|Quads|Glutes|1|8|14|wt
mach-hack-squat|Hack Squat|Machine|f|squat|Quads|Glutes|2|8|12|wt
mach-leg-ext|Leg Extension|Machine|fh|squat|Quads||3|12|18|wt
mach-leg-curl|Leg Curl|Machine|fh|hinge|Hamstrings||3|10|15|wt
mach-chest-press|Chest Press Machine|Machine|fh|push-h|Chest|Triceps|2|8|12|wt
mach-pec-deck|Pec Deck|Machine|f|push-h|Chest||3|12|15|wt
mach-shoulder-press|Machine Shoulder Press|Machine|fh|push-v|Shoulders|Triceps|2|8|12|wt
mach-reverse-pec|Reverse Pec Deck|Machine|f|delts|Shoulders|Back|3|12|18|wt
mach-assisted-pullup|Assisted Pull-Up|Machine|f|pull-v|Back|Biceps|2|6|10|wt
mach-seated-calf|Seated Calf Raise|Machine|f|calves|Calves||3|12|20|wt
mach-standing-calf|Standing Calf Raise|Machine|fh|calves|Calves||3|12|20|wt
mach-hip-abduction|Hip Abduction|Machine|f|hinge|Glutes||3|15|20|wt
mach-preacher|Preacher Curl|Machine|f|arms-bi|Biceps||3|10|15|wt
cab-fly|Cable Fly|Cable|fh|push-h|Chest||3|12|15|wt
cab-pushdown|Tricep Pushdown|Cable|fh|arms-tri|Triceps||3|10|15|wt
cab-curl|Cable Curl|Cable|fh|arms-bi|Biceps||3|10|15|wt
cab-face-pull|Face Pull|Cable|fh|delts|Shoulders|Back|3|12|20|wt
cab-lateral|Cable Lateral Raise|Cable|fh|delts|Shoulders||3|12|18|wt
cab-crunch|Cable Crunch|Cable|fh|core|Core||3|12|18|wt
cab-pull-through|Cable Pull-Through|Cable|fh|hinge|Glutes|Hamstrings|3|12|18|wt
cab-woodchop|Cable Woodchop|Cable|fh|core|Core|Shoulders|3|10|15|wt
bw-pushup|Push-Up|Bodyweight|fhb|push-h|Chest|Triceps,Shoulders|2|8|20|bw
bw-incline-pushup|Incline Push-Up|Bodyweight|fhb|push-h|Chest|Triceps|3|10|20|bw
bw-decline-pushup|Decline Push-Up|Bodyweight|fhb|push-h|Chest|Shoulders|2|8|15|bw
bw-diamond-pushup|Diamond Push-Up|Bodyweight|fhb|arms-tri|Triceps|Chest|3|6|15|bw
bw-pike-pushup|Pike Push-Up|Bodyweight|fhb|push-v|Shoulders|Triceps|2|6|12|bw
bw-hspu|Handstand Push-Up|Bodyweight|fhb|push-v|Shoulders|Triceps|2|3|8|bw
bw-pullup|Pull-Up|Bodyweight|fh|pull-v|Back|Biceps|1|4|10|bw
bw-chinup|Chin-Up|Bodyweight|fh|pull-v|Back|Biceps|1|4|10|bw
bw-inverted-row|Inverted Row|Bodyweight|fhb|pull-h|Back|Biceps|2|8|15|bw
bw-dip|Dip|Bodyweight|fh|push-h|Chest|Triceps|1|5|12|bw
bw-bench-dip|Bench Dip|Bodyweight|fhb|arms-tri|Triceps|Chest|3|8|18|bw
bw-squat|Bodyweight Squat|Bodyweight|fhb|squat|Quads|Glutes|3|15|30|bw
bw-jump-squat|Jump Squat|Bodyweight|fhb|squat|Quads|Glutes|3|8|15|bw
bw-pistol|Pistol Squat|Bodyweight|fhb|squat|Quads|Glutes,Core|2|3|8|bw
bw-lunge|Walking Lunge|Bodyweight|fhb|lunge|Quads|Glutes|3|10|20|bw
bw-reverse-lunge|Reverse Lunge|Bodyweight|fhb|lunge|Quads|Glutes|3|10|20|bw
bw-split-squat|Split Squat|Bodyweight|fhb|lunge|Quads|Glutes|3|8|15|bw
bw-step-up|Step-Up|Bodyweight|fhb|lunge|Quads|Glutes|3|10|16|bw
bw-glute-bridge|Glute Bridge|Bodyweight|fhb|hinge|Glutes|Hamstrings|3|12|20|bw
bw-sl-glute-bridge|Single-Leg Glute Bridge|Bodyweight|fhb|hinge|Glutes|Hamstrings|3|10|15|bw
bw-nordic|Nordic Curl|Bodyweight|fhb|hinge|Hamstrings||2|4|8|bw
bw-wall-sit|Wall Sit|Bodyweight|fhb|squat|Quads||4|30|60|time
bw-calf-raise|Bodyweight Calf Raise|Bodyweight|fhb|calves|Calves||3|15|25|bw
bw-plank|Plank|Bodyweight|fhb|core|Core||4|30|75|time
bw-side-plank|Side Plank|Bodyweight|fhb|core|Core||4|25|60|time
bw-hollow-hold|Hollow Hold|Bodyweight|fhb|core|Core||4|20|50|time
bw-dead-bug|Dead Bug|Bodyweight|fhb|core|Core||4|10|20|bw
bw-bird-dog|Bird Dog|Bodyweight|fhb|core|Core|Back|4|10|16|bw
bw-superman|Superman|Bodyweight|fhb|core|Back|Core|4|12|20|bw
bw-situp|Sit-Up|Bodyweight|fhb|core|Core||4|15|30|bw
bw-russian-twist|Russian Twist|Bodyweight|fhb|core|Core||4|20|40|bw
bw-l-sit|L-Sit|Bodyweight|fhb|core|Core||4|10|30|time
bw-mountain-climber|Mountain Climber|Bodyweight|fhb|core|Core|Quads|4|20|40|bw
bw-burpee|Burpee|Bodyweight|fhb|cardio|Quads|Chest,Core|4|8|20|bw
bw-bear-crawl|Bear Crawl|Bodyweight|fhb|core|Core|Shoulders|4|20|45|time
bw-high-knees|High Knees|Bodyweight|fhb|cardio|Quads|Core|4|20|45|time
bw-jumping-jack|Jumping Jack|Bodyweight|fhb|cardio|Quads|Shoulders|4|20|60|time
bw-squat-thrust|Squat Thrust|Bodyweight|fhb|cardio|Quads|Core|4|10|20|bw
bw-broad-jump|Broad Jump|Bodyweight|fhb|squat|Quads|Glutes|3|5|10|bw
bnd-pull-apart|Band Pull-Apart|Band|fhb|delts|Shoulders|Back|3|15|25|bw
bnd-row|Band Row|Band|fhb|pull-h|Back|Biceps|2|12|20|bw
bnd-press|Band Chest Press|Band|fhb|push-h|Chest|Triceps|2|12|20|bw
bnd-curl|Band Curl|Band|fhb|arms-bi|Biceps||3|12|20|bw
bnd-lateral|Band Lateral Raise|Band|fhb|delts|Shoulders||3|15|25|bw
bnd-pushdown|Band Pushdown|Band|fhb|arms-tri|Triceps||3|12|20|bw
bnd-face-pull|Band Face Pull|Band|fhb|delts|Shoulders|Back|3|15|25|bw
bnd-good-morning|Band Good Morning|Band|fhb|hinge|Hamstrings|Glutes|3|12|20|bw
bnd-squat|Band Squat|Band|fhb|squat|Quads|Glutes|3|15|25|bw
bnd-monster-walk|Monster Walk|Band|fhb|hinge|Glutes||4|20|40|time
car-treadmill-run|Treadmill Run|Cardio|fh|cardio|Cardio||4|10|40|min
car-treadmill-walk|Treadmill Walk|Cardio|fh|cardio|Cardio||4|15|45|min
car-incline-walk|Incline Walk|Cardio|fh|cardio|Cardio|Glutes|4|15|40|min
car-bike|Stationary Bike|Cardio|fh|cardio|Cardio||4|12|40|min
car-rower|Rowing Machine|Cardio|fh|cardio|Cardio|Back|4|8|30|min
car-elliptical|Elliptical|Cardio|fh|cardio|Cardio||4|12|35|min
car-stair|Stair Climber|Cardio|fh|cardio|Cardio|Glutes|4|10|30|min
car-jump-rope|Jump Rope|Cardio|fhb|cardio|Cardio|Calves|4|5|20|min
car-run|Outdoor Run|Cardio|fhb|cardio|Cardio||4|10|45|min
car-walk|Outdoor Walk|Cardio|fhb|cardio|Cardio||4|15|60|min
bb-overhead-squat|Overhead Squat|Barbell|f|squat|Quads|Shoulders,Core|2|5|8|wt
bb-zercher-squat|Zercher Squat|Barbell|f|squat|Quads|Core,Biceps|2|6|10|wt
bb-split-squat|Barbell Split Squat|Barbell|f|lunge|Quads|Glutes|2|8|12|wt
bb-upright-row|Upright Row|Barbell|f|delts|Shoulders|Back|3|10|15|wt
bb-jm-press|JM Press|Barbell|f|arms-tri|Triceps|Chest|3|8|12|wt
bb-tbar-row|T-Bar Row|Barbell|f|pull-h|Back|Biceps|1|8|12|wt
bb-seal-row|Seal Row|Barbell|f|pull-h|Back|Biceps|2|8|12|wt
bb-hip-hinge|Barbell Good Morning (Seated)|Barbell|f|hinge|Hamstrings|Back|3|10|15|wt
bb-reverse-lunge|Barbell Reverse Lunge|Barbell|f|lunge|Quads|Glutes|2|8|12|wt
bb-calf-raise|Barbell Calf Raise|Barbell|f|calves|Calves||3|12|20|wt
db-incline-curl|Incline Dumbbell Curl|Dumbbell|fh|arms-bi|Biceps||3|10|15|wt
db-zottman|Zottman Curl|Dumbbell|fh|arms-bi|Biceps|Forearms|3|10|15|wt
db-crush-press|Crush Press|Dumbbell|fh|push-h|Chest|Triceps|3|10|15|wt
db-upright-row|Dumbbell Upright Row|Dumbbell|fh|delts|Shoulders|Back|3|10|15|wt
db-y-raise|Incline Y-Raise|Dumbbell|fh|delts|Shoulders|Back|3|12|18|wt
db-prone-row|Prone Dumbbell Row|Dumbbell|fh|pull-h|Back|Biceps|2|10|15|wt
db-reverse-fly|Bent-Over Reverse Fly|Dumbbell|fh|delts|Shoulders|Back|3|12|18|wt
db-cuban-press|Cuban Press|Dumbbell|fh|delts|Shoulders||3|10|15|wt
db-lateral-lean|Leaning Lateral Raise|Dumbbell|fh|delts|Shoulders||3|12|18|wt
db-tate-press|Tate Press|Dumbbell|fh|arms-tri|Triceps||3|10|15|wt
db-hip-thrust|Dumbbell Hip Thrust|Dumbbell|fh|hinge|Glutes|Hamstrings|2|10|15|wt
db-swing|Dumbbell Swing|Dumbbell|fh|hinge|Glutes|Hamstrings,Core|2|10|20|wt
db-snatch|Dumbbell Snatch|Dumbbell|fh|hinge|Shoulders|Glutes,Back|2|5|10|wt
db-clean|Dumbbell Clean|Dumbbell|fh|hinge|Shoulders|Glutes,Back|2|5|10|wt
db-devil-press|Devil Press|Dumbbell|fh|cardio|Shoulders|Chest,Glutes|4|6|12|wt
db-windmill|Dumbbell Windmill|Dumbbell|fh|core|Core|Shoulders|3|6|10|wt
db-side-bend|Dumbbell Side Bend|Dumbbell|fh|core|Core||3|12|20|wt
db-seated-calf|Seated Dumbbell Calf Raise|Dumbbell|fh|calves|Calves||3|15|20|wt
kb-swing|Kettlebell Swing|Kettlebell|fh|hinge|Glutes|Hamstrings,Back|2|12|25|wt
kb-goblet-squat|Kettlebell Goblet Squat|Kettlebell|fh|squat|Quads|Glutes,Core|2|8|15|wt
kb-clean|Kettlebell Clean|Kettlebell|fh|hinge|Shoulders|Glutes,Back|2|6|12|wt
kb-snatch|Kettlebell Snatch|Kettlebell|fh|hinge|Shoulders|Glutes,Back|2|5|10|wt
kb-press|Kettlebell Press|Kettlebell|fh|push-v|Shoulders|Triceps,Core|2|6|12|wt
kb-halo|Kettlebell Halo|Kettlebell|fh|delts|Shoulders||4|8|12|wt
kb-turkish-getup|Turkish Get-Up|Kettlebell|fh|core|Core|Shoulders,Glutes|2|3|6|wt
kb-farmers|Kettlebell Carry|Kettlebell|fh|carry|Core|Forearms,Back|4|30|60|time
kb-suitcase-squat|Suitcase Squat|Kettlebell|fh|squat|Quads|Core|3|8|14|wt
mach-smith-squat|Smith Machine Squat|Machine|f|squat|Quads|Glutes|2|8|12|wt
mach-smith-press|Smith Machine Press|Machine|f|push-h|Chest|Triceps|2|8|12|wt
mach-pendulum|Pendulum Squat|Machine|f|squat|Quads|Glutes|2|8|14|wt
mach-belt-squat|Belt Squat|Machine|f|squat|Quads|Glutes|2|10|15|wt
mach-row|Machine Row|Machine|f|pull-h|Back|Biceps|2|8|12|wt
mach-high-row|Machine High Row|Machine|f|pull-v|Back|Biceps|2|8|12|wt
mach-pullover|Machine Pullover|Machine|f|pull-v|Back|Chest|3|10|15|wt
mach-incline-press|Incline Press Machine|Machine|f|push-h|Chest|Shoulders|2|8|12|wt
mach-tricep|Tricep Machine|Machine|f|arms-tri|Triceps||3|10|15|wt
mach-ab-crunch|Ab Crunch Machine|Machine|f|core|Core||3|12|18|wt
mach-back-ext|Back Extension|Machine|f|hinge|Back|Glutes,Hamstrings|3|10|18|wt
mach-glute-kickback|Glute Kickback Machine|Machine|f|hinge|Glutes||3|12|18|wt
mach-calf-press|Calf Press on Leg Press|Machine|f|calves|Calves||3|12|20|wt
mach-nordic|Glute-Ham Raise|Machine|f|hinge|Hamstrings|Glutes|2|6|12|wt
cab-overhead-tricep|Cable Overhead Extension|Cable|fh|arms-tri|Triceps||3|10|15|wt
cab-kickback|Cable Kickback|Cable|fh|arms-tri|Triceps||3|12|18|wt
cab-rear-delt|Cable Rear Delt Fly|Cable|fh|delts|Shoulders|Back|3|12|18|wt
cab-upright-row|Cable Upright Row|Cable|fh|delts|Shoulders|Back|3|10|15|wt
cab-y-raise|Cable Y-Raise|Cable|fh|delts|Shoulders|Back|3|12|18|wt
cab-pallof|Pallof Press|Cable|fh|core|Core||3|10|15|wt
cab-hip-abduction|Cable Hip Abduction|Cable|fh|hinge|Glutes||3|12|20|wt
cab-single-row|Single-Arm Cable Row|Cable|fh|pull-h|Back|Biceps|2|10|15|wt
cab-lat-pullover|Cable Lat Pullover|Cable|fh|pull-v|Back|Chest|3|12|18|wt
cab-hammer-curl|Cable Rope Curl|Cable|fh|arms-bi|Biceps|Forearms|3|10|15|wt
bw-archer-pushup|Archer Push-Up|Bodyweight|fhb|push-h|Chest|Triceps|2|5|12|bw
bw-hindu-pushup|Hindu Push-Up|Bodyweight|fhb|push-h|Chest|Shoulders|3|8|15|bw
bw-pseudo-planche|Pseudo Planche Push-Up|Bodyweight|fhb|push-h|Chest|Shoulders,Core|2|5|12|bw
bw-cossack|Cossack Squat|Bodyweight|fhb|lunge|Quads|Glutes|3|6|12|bw
bw-shrimp-squat|Shrimp Squat|Bodyweight|fhb|squat|Quads|Glutes|2|3|8|bw
bw-hanging-knee|Hanging Knee Raise|Bodyweight|fh|core|Core||3|8|15|bw
bw-hanging-leg|Hanging Leg Raise|Bodyweight|fh|core|Core||2|6|12|bw
bw-toes-to-bar|Toes to Bar|Bodyweight|fh|core|Core|Back|2|5|12|bw
bw-scap-pullup|Scapular Pull-Up|Bodyweight|fh|pull-v|Back|Shoulders|4|8|15|bw
bw-ring-row|Ring Row|Bodyweight|fh|pull-h|Back|Biceps|2|8|15|bw
bw-dead-hang|Dead Hang|Bodyweight|fh|mobility|Back|Shoulders|4|20|60|time
bw-ab-wheel|Ab Wheel Rollout|Bodyweight|fh|core|Core|Back|2|6|12|bw
bw-hollow-rock|Hollow Rock|Bodyweight|fhb|core|Core||4|15|30|bw
bw-crunch|Crunch|Bodyweight|fhb|core|Core||4|15|30|bw
bw-bicycle|Bicycle Crunch|Bodyweight|fhb|core|Core||4|20|40|bw
bw-reverse-crunch|Reverse Crunch|Bodyweight|fhb|core|Core||4|12|25|bw
bw-oblique-crunch|Oblique Crunch|Bodyweight|fhb|core|Core||4|12|25|bw
bw-flutter|Flutter Kick|Bodyweight|fhb|core|Core||4|20|40|bw
bw-scissor|Scissor Kick|Bodyweight|fhb|core|Core||4|20|40|bw
bw-lying-leg-raise|Lying Leg Raise|Bodyweight|fhb|core|Core||3|10|20|bw
bw-heel-tap|Heel Tap|Bodyweight|fhb|core|Core||4|20|40|bw
bw-knee-tuck|Seated Knee Tuck|Bodyweight|fhb|core|Core||4|12|25|bw
bw-plank-updown|Plank Up-Down|Bodyweight|fhb|core|Core|Shoulders,Triceps|3|8|16|bw
bw-side-plank-dip|Side Plank Hip Dip|Bodyweight|fhb|core|Core||4|10|20|bw
bw-dragon-flag|Dragon Flag|Bodyweight|fhb|core|Core||2|3|8|bw
db-crunch|Weighted Crunch|Dumbbell|fh|core|Core||3|10|20|wt
db-russian-twist|Weighted Russian Twist|Dumbbell|fh|core|Core||4|16|30|wt
cab-rope-crunch|Rope Crunch|Cable|f|core|Core||3|12|20|wt
bw-v-up|V-Up|Bodyweight|fhb|core|Core||3|10|20|bw
bw-copenhagen|Copenhagen Plank|Bodyweight|fhb|core|Core|Glutes|4|15|40|time
bw-frog-pump|Frog Pump|Bodyweight|fhb|hinge|Glutes||3|15|25|bw
bw-reverse-hyper|Reverse Hyperextension|Bodyweight|fhb|hinge|Glutes|Back|3|12|20|bw
bw-wall-walk|Wall Walk|Bodyweight|fhb|push-v|Shoulders|Core|2|3|8|bw
bw-crab-walk|Crab Walk|Bodyweight|fhb|core|Core|Shoulders|4|20|40|time
bw-skater-jump|Skater Jump|Bodyweight|fhb|cardio|Quads|Glutes|4|15|30|bw
bw-shadow-box|Shadow Boxing|Bodyweight|fhb|cardio|Cardio|Shoulders|4|2|10|min
mob-cat-cow|Cat-Cow|Bodyweight|fhb|mobility|Back|Core|4|8|15|bw
mob-thoracic-rot|Thoracic Rotation|Bodyweight|fhb|mobility|Back|Shoulders|4|6|12|bw
mob-hip-flexor|Kneeling Hip Flexor Stretch|Bodyweight|fhb|mobility|Glutes|Quads|4|30|60|time
mob-couch|Couch Stretch|Bodyweight|fhb|mobility|Quads||4|30|60|time
mob-wall-slide|Wall Slide|Bodyweight|fhb|mobility|Shoulders|Back|4|8|15|bw
mob-band-dislocate|Band Shoulder Dislocate|Band|fhb|mobility|Shoulders||4|8|15|bw
mob-90-90|90/90 Hip Switch|Bodyweight|fhb|mobility|Glutes|Core|4|8|14|bw
mob-neck-cars|Neck Rotations|Bodyweight|fhb|mobility|Shoulders||4|5|10|bw
mob-scap-pushup|Scapular Push-Up|Bodyweight|fhb|mobility|Shoulders|Chest|4|10|18|bw
mob-worlds-greatest|World's Greatest Stretch|Bodyweight|fhb|mobility|Glutes|Back,Shoulders|4|6|10|bw
mob-hamstring|Standing Hamstring Stretch|Bodyweight|fhb|mobility|Hamstrings||4|30|60|time
mob-seated-fold|Seated Forward Fold|Bodyweight|fhb|mobility|Hamstrings|Back|4|30|60|time
mob-downdog|Downward Dog|Bodyweight|fhb|mobility|Hamstrings|Shoulders,Calves|4|30|60|time
mob-figure-4|Figure-Four Stretch|Bodyweight|fhb|mobility|Glutes||4|30|60|time
mob-pigeon|Pigeon Stretch|Bodyweight|fhb|mobility|Glutes||4|30|60|time
mob-hip-circle|Standing Hip Circles|Bodyweight|fhb|mobility|Glutes|Core|4|6|12|bw
mob-childs-pose|Child's Pose|Bodyweight|fhb|mobility|Back|Shoulders|4|30|60|time
mob-seated-twist|Seated Spinal Twist|Bodyweight|fhb|mobility|Back|Core|4|20|45|time
mob-lat-stretch|Kneeling Lat Stretch|Bodyweight|fhb|mobility|Back|Shoulders|4|30|60|time
mob-cobra|Cobra Stretch|Bodyweight|fhb|mobility|Core|Back|4|20|45|time
mob-doorway-chest|Doorway Chest Stretch|Bodyweight|fhb|mobility|Chest|Shoulders|4|30|60|time
mob-shoulder-circle|Shoulder Circles|Bodyweight|fhb|mobility|Shoulders||4|6|12|bw
mob-triceps-overhead|Overhead Triceps Stretch|Bodyweight|fhb|mobility|Triceps|Shoulders|4|20|45|time
mob-quad-standing|Standing Quad Stretch|Bodyweight|fhb|mobility|Quads||4|30|60|time
mob-calf-wall|Wall Calf Stretch|Bodyweight|fhb|mobility|Calves||4|30|60|time
mob-ankle-rock|Kneeling Ankle Rock|Bodyweight|fhb|mobility|Calves|Quads|4|8|15|bw
bnd-pull-through|Band Pull-Through|Band|fhb|hinge|Glutes|Hamstrings|3|12|20|bw
bnd-lat-pulldown|Band Pulldown|Band|fhb|pull-v|Back|Biceps|2|12|20|bw
bnd-overhead-press|Band Overhead Press|Band|fhb|push-v|Shoulders|Triceps|2|12|20|bw
bnd-hip-abduction|Band Hip Abduction|Band|fhb|hinge|Glutes||3|15|25|bw
bnd-pallof|Band Pallof Press|Band|fhb|core|Core||3|10|16|bw
car-sled-push|Sled Push|Cardio|f|cardio|Cardio|Quads|4|5|15|min
car-battle-ropes|Battle Ropes|Cardio|f|cardio|Cardio|Shoulders|4|4|12|min
car-ski-erg|Ski Erg|Cardio|f|cardio|Cardio|Back|4|6|20|min
car-assault-bike|Assault Bike|Cardio|f|cardio|Cardio|Shoulders|4|5|20|min
car-ruck|Rucking|Cardio|fhb|cardio|Cardio|Back,Core|4|20|60|min
car-swim|Swimming|Cardio|f|cardio|Cardio|Back,Shoulders|4|15|45|min
car-box-step|Box Step-Ups|Cardio|fh|cardio|Cardio|Quads,Glutes|4|8|20|min
car-hike|Hiking|Cardio|fhb|cardio|Cardio|Quads,Glutes|4|30|90|min
bb-deficit-rdl|Deficit Romanian Deadlift|Barbell|f|hinge|Hamstrings|Glutes,Back|2|6|10|wt
tb-deadlift|Trap Bar Deadlift|Barbell|f|hinge|Glutes|Hamstrings,Quads,Back|1|4|8|wt
bb-ez-curl|EZ Bar Curl|Barbell|fh|arms-bi|Biceps|Forearms|2|8|12|wt
bw-weighted-pullup|Weighted Pull-Up|Bodyweight|fh|pull-v|Back|Biceps|1|4|8|wt
bw-sl-calf-raise|Single-Leg Calf Raise|Bodyweight|fhb|calves|Calves||3|12|25|bw
bw-inchworm|Inchworm|Bodyweight|fhb|mobility|Core|Shoulders,Hamstrings|4|5|10|bw
db-kickback|Dumbbell Triceps Kickback|Dumbbell|fh|arms-tri|Triceps||4|12|18|wt
cab-lateral-single|Single-Arm Cable Lateral Raise|Cable|fh|delts|Shoulders||3|12|20|wt
cab-hammer-single|Single-Arm Cable Hammer Curl|Cable|fh|arms-bi|Biceps|Forearms|3|10|15|wt
cab-oh-tricep|Overhead Cable Triceps Extension|Cable|fh|arms-tri|Triceps||3|10|15|wt
cab-wood-chop|Cable Wood Chop|Cable|f|core|Core|Shoulders|3|10|16|wt
mob-leg-swing|Leg Swing|Bodyweight|fhb|mobility|Hamstrings|Glutes|4|10|20|bw
mob-cross-body|Cross-Body Shoulder Stretch|Bodyweight|fhb|mobility|Shoulders||4|20|45|time
mob-foam-thoracic|Thoracic Foam Roll|Bodyweight|fh|mobility|Back||4|30|90|time
`.trim();

const EX = {};
const EXLIST = EXDATA.split('\n').map(line => {
  const p = line.split('|');
  const o = {
    id: p[0], name: p[1], eq: p[2], env: p[3], pattern: p[4],
    primary: p[5], sec: p[6] ? p[6].split(',') : [],
    tier: +p[7], rl: +p[8], rh: +p[9], load: p[10]
  };
  EX[o.id] = o;
  return o;
});

const MUSCLES = ['Chest','Back','Quads','Hamstrings','Glutes','Shoulders','Biceps','Triceps','Core','Calves'];
/* ============================================================
   BADGES
   ------------------------------------------------------------
   A written programme tags its movements — Priority, Arms, Unilateral, Core,
   Mobility, Endurance — so you can read a session and see its shape without
   reading every line of it.

   Derived, not stored. A twelfth column on 281 rows would be 281 judgements to
   get right by hand and 281 chances to get one wrong; everything here is
   already known from the pattern, the tier, the name, or a flag the session
   itself carries.

   `UNILATERAL_RE` is the one rule that reads a name rather than a field, so it
   is written out in full and its output is asserted against a fixed list —
   a regex that quietly stops matching is exactly the kind of thing nothing
   notices for a year.
   ============================================================ */
const UNILATERAL_RE = /single-arm|single-leg|one-arm|bulgarian|split squat|lunge|step-up|concentration|suitcase|pistol|side plank|oblique|figure-four|90\/90|kickback|renegade|heel tap|scissor|bird dog|dead bug|world's greatest|hip flexor|couch|pigeon|thoracic rotation/i;

function exBadges(item) {
  const ex = EX[item && item.exId ? item.exId : item] || {};
  if (!ex.id) return [];
  const out = [];
  if (item && item.priority) out.push('Priority');
  if (ex.pattern === 'arms-bi' || ex.pattern === 'arms-tri') out.push('Arms');
  if (ex.pattern === 'core' || ex.pattern === 'carry') out.push('Core');
  if (ex.pattern === 'mobility') out.push('Mobility');
  if (ex.pattern === 'cardio') out.push('Endurance');
  if (UNILATERAL_RE.test(ex.name)) out.push('Unilateral');
  /* Only on the heaviest work, where it means "this is the lift the session is
     built around" rather than "this is quite hard". */
  if (ex.tier === 1 && out.indexOf('Priority') < 0) out.push('Heavy');
  return out;
}

const BADGE_TONE = {
  Priority: 'ember', Arms: 'sky', Unilateral: 'plain',
  Core: 'plain', Mobility: 'teal', Endurance: 'teal', Heavy: 'ember'
};

const PATTERN_LABEL = { 'squat':'Squat','hinge':'Hinge','push-h':'Horizontal push','push-v':'Vertical push','pull-h':'Horizontal pull','pull-v':'Vertical pull','lunge':'Lunge','delts':'Delts','arms-bi':'Biceps','arms-tri':'Triceps','core':'Core','calves':'Calves','carry':'Carry','cardio':'Cardio','mobility':'Mobility' };

/* ---------- environments ---------- */
const ENVS = {
  full:   { k: 'full',   label: 'Full gym',    short: 'Gym',    flag: 'f', note: 'Barbells, racks, machines' },
  hotel:  { k: 'hotel',  label: 'Minimal gym', short: 'Hotel',  flag: 'h', note: 'Dumbbells, cables, cardio' },
  bw:     { k: 'bw',     label: 'Bodyweight',  short: 'Floor',  flag: 'b', note: 'Floor space and nothing else' }
};

/* ---------- intensity ladder ---------- */
const RUNGS = [
  { k:'full',  n:'01', label:'Full session',  vol:1.0,
    blurb:'The whole plan. Everything you were scheduled to do.' },
  { k:'trim',  n:'02', label:'Trimmed',       vol:0.6,
    blurb:'Compounds kept, accessories cut. Roughly 70% of the stimulus for half the time.' },
  { k:'short', n:'03', label:'Short',         vol:0.35,
    blurb:'Two movements, hard sets only. Enough to hold the line.' },
  { k:'micro', n:'04', label:'Three minutes', vol:0.1,
    blurb:'The floor. 3.4 min/day of vigorous activity is associated with 22–28% lower all-cause mortality. This is never nothing.' }
];

/* ---------- session slot templates ---------- */
const SLOTS = {
  full: [
    { pattern:['squat','lunge'], tier:[1,2], sets:3 },
    { pattern:['push-h'],        tier:[1,2], sets:3 },
    { pattern:['pull-h','pull-v'], tier:[1,2], sets:3 },
    { pattern:['hinge'],         tier:[2,3], sets:3 },
    { pattern:['push-v','delts'],tier:[2,3], sets:3 },
    { pattern:['arms-bi'],       tier:[3],   sets:3 },
    { pattern:['core'],          tier:[3,4], sets:3 }
  ],
  upper: [
    { pattern:['push-h'],        tier:[1],   sets:4 },
    { pattern:['pull-v','pull-h'], tier:[1], sets:4 },
    { pattern:['push-v'],        tier:[2],   sets:3 },
    { pattern:['pull-h'],        tier:[2],   sets:3 },
    { pattern:['delts'],         tier:[3],   sets:3 },
    { pattern:['arms-bi'],       tier:[3],   sets:3 },
    { pattern:['arms-tri'],      tier:[3],   sets:3 },
    { pattern:['core'],          tier:[3,4], sets:2 }
  ],
  lower: [
    { pattern:['squat'],         tier:[1],   sets:4 },
    { pattern:['hinge'],         tier:[1,2], sets:4 },
    { pattern:['lunge'],         tier:[2],   sets:3 },
    { pattern:['hinge'],         tier:[3],   sets:3 },
    { pattern:['squat'],         tier:[3],   sets:3 },
    { pattern:['calves'],        tier:[3],   sets:3 },
    { pattern:['core'],          tier:[3,4], sets:3 }
  ],
  push: [
    { pattern:['push-h'],        tier:[1],   sets:4 },
    { pattern:['push-v'],        tier:[1,2], sets:4 },
    { pattern:['push-h'],        tier:[2,3], sets:3 },
    { pattern:['delts'],         tier:[3],   sets:3 },
    { pattern:['arms-tri'],      tier:[3],   sets:3 },
    { pattern:['core'],          tier:[3,4], sets:3 }
  ],
  pull: [
    { pattern:['pull-v'],        tier:[1],   sets:4 },
    { pattern:['pull-h'],        tier:[1,2], sets:4 },
    { pattern:['pull-h','pull-v'],tier:[2,3],sets:3 },
    { pattern:['delts'],         tier:[3],   sets:3 },
    { pattern:['arms-bi'],       tier:[3],   sets:3 },
    { pattern:['core'],          tier:[3,4], sets:3 }
  ],
  legs: [
    { pattern:['squat'],         tier:[1],   sets:4 },
    { pattern:['hinge'],         tier:[1,2], sets:4 },
    { pattern:['lunge'],         tier:[2,3], sets:3 },
    { pattern:['hinge'],         tier:[3],   sets:3 },
    { pattern:['calves'],        tier:[3],   sets:4 },
    { pattern:['core'],          tier:[3,4], sets:3 }
  ],
  chest: [
    { pattern:['push-h'],        tier:[1],   sets:4 },
    { pattern:['push-h'],        tier:[1,2], sets:4 },
    { pattern:['push-h'],        tier:[2,3], sets:3 },
    { pattern:['push-h'],        tier:[3],   sets:3 },
    { pattern:['arms-tri'],      tier:[3],   sets:3 },
    { pattern:['core'],          tier:[3,4], sets:3 }
  ],
  back: [
    { pattern:['pull-v'],        tier:[1],   sets:4 },
    { pattern:['pull-h'],        tier:[1,2], sets:4 },
    { pattern:['pull-h','pull-v'],tier:[2,3],sets:3 },
    { pattern:['delts'],         tier:[3],   sets:3 },
    { pattern:['arms-bi'],       tier:[3],   sets:3 },
    { pattern:['core'],          tier:[3,4], sets:3 }
  ],
  delts: [
    { pattern:['push-v'],        tier:[1,2], sets:4 },
    { pattern:['delts'],         tier:[3],   sets:4 },
    { pattern:['delts'],         tier:[3],   sets:3 },
    { pattern:['delts'],         tier:[3],   sets:3 },
    { pattern:['calves'],        tier:[3],   sets:3 },
    { pattern:['core'],          tier:[3,4], sets:3 }
  ],
  arms: [
    { pattern:['arms-bi'],       tier:[3],   sets:4 },
    { pattern:['arms-tri'],      tier:[2,3], sets:4 },
    { pattern:['arms-bi'],       tier:[3],   sets:3 },
    { pattern:['arms-tri'],      tier:[3],   sets:3 },
    { pattern:['delts'],         tier:[3],   sets:3 },
    { pattern:['core'],          tier:[3,4], sets:3 }
  ],
  cardio: [
    { pattern:['cardio'],        tier:[4],   sets:1 },
    { pattern:['core'],          tier:[3,4], sets:3 }
  ]
};

const PROGRAMS = {
  anchor3: {
    id:'anchor3', name:'Anchor 3', tag:'Recommended for changing hours',
    desc:'Three full-body sessions a week. No session depends on any other, so a missed day never breaks a split. The most forgiving structure there is.',
    cycle:['full','full','full'], target:3
  },
  ul4: {
    id:'ul4', name:'Upper / Lower 4', tag:'When weeks are predictable',
    desc:'Four sessions alternating upper and lower. More volume per muscle, but it punishes missed days harder.',
    cycle:['upper','lower','upper','lower'], target:4
  },
  ul5: {
    id:'ul5', name:'The Five', tag:'Best balance of size and flexibility',
    desc:'Push, pull, legs, then an upper and a lower day. Five sessions covers everything roughly twice a week, which is the sweet spot for building muscle — and the two extra days give the app somewhere to move things when a shoot runs long.',
    cycle:['push','pull','legs','upper','lower'], target:5
  },
  bro5: {
    id:'bro5', name:'Body Part Five', tag:'One area per day',
    desc:'Chest, back, legs, shoulders, arms — a day each. High volume per area and easy to remember, but each muscle only gets trained once a week, so a missed day genuinely costs you that muscle for the week.',
    cycle:['chest','back','legs','delts','arms'], target:5
  },
  ppl6: {
    id:'ppl6', name:'Push / Pull / Legs', tag:'Highest volume',
    desc:'Six sessions across push, pull and legs. Best hypertrophy stimulus, worst tolerance for chaos.',
    cycle:['push','pull','legs','push','pull','legs'], target:6
  },
  hold2: {
    id:'hold2', name:'Hold the Line', tag:'Maintenance',
    desc:'Two full-body sessions a week. Research puts maintenance at one session per week at a third of normal volume — this is comfortably above that.',
    cycle:['full','full'], target:2
  }
};

/* ---------- copy: rotating journey lines ---------- */
const LINES = [
  'The route changes. The direction doesn’t.',
  'Show up at whatever size you can manage today.',
  'A short session is a whole session.',
  'Consistency is not the same as perfection. It never was.',
  'Long shift behind you. Ten minutes is still forward.',
  'You are not behind. You are on a different part of the route.',
  'Momentum is built out of small, unglamorous days.',
  'The plan serves you. Not the other way round.',
  'Progress made on bad weeks counts double.',
  'Rest is part of the route, not a detour from it.',
  'You can always do the three-minute version.',
  'Nobody’s trail is a straight line.',
  'The work you did tired still counts.',
  'Return is cheaper than you think.'
];

/* ---------- evidence strings surfaced in the UI ---------- */
const EVIDENCE = {
  oneMiss: 'Missing a single session lowers habit automaticity by about 0.29 points on a 42-point scale — and next-day performance recovers fully. One miss is statistical noise.',
  oneMissSrc: 'Lally et al., European Journal of Social Psychology, 2010',
  twoMiss: 'Two in a row is where it starts to matter. Not a crisis — but the research is clear that repeated omissions, unlike single ones, do slow habit formation.',
  twoMissSrc: 'Lally 2010; replicated Br. J. Health Psychol. 2021',
  micro: 'Roughly 3.4 minutes a day of vigorous activity is associated with 22–28% lower all-cause mortality in people who don’t otherwise exercise.',
  microSrc: 'Stamatakis et al., Nature Medicine, 2022 (n=25,241)',
  habit66: 'Median time to an automatic habit is 66 days, with a range of 18 to 254. You are somewhere on that curve, and the curve is long.',
  habit66Src: 'Lally et al., 2010'
};

function detrainingNote(days) {
  if (days <= 4) return null;
  if (days <= 14) return { t:'Nothing lost.', b:'Up to two weeks off, strength is essentially maintained in trained lifters. Any size change you think you see at this point is glycogen and water, not muscle.', s:'Hwang et al., 2017' };
  if (days <= 21) return { t:'Still holding.', b:'Maximal strength is maintained up to about three weeks off. Decay accelerates after that, not before. Pick up close to where you left off — knock 5–10% off the bar for the first session and see how it moves.', s:'McMaster et al., 2013' };
  if (days <= 42) return { t:'A little slipped.', b:'Between three and six weeks, some strength loss is real but modest. Start at roughly 85% of your old working weights and you’ll likely be back inside two weeks. Conditioning fades faster than strength does.', s:'Coratella & Schena, 2016' };
  return { t:'Welcome back.', b:'Past six weeks there is measurable strength loss, and VO2 max drops faster still. None of it is permanent, and retraining is much quicker than the original build. Start at 70–75% and rebuild deliberately.', s:'Mujika & Padilla, 2000' };
}
