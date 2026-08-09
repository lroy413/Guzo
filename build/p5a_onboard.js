/* ============================================================
   ONBOARDING
   One decision per screen, grouped into four short chapters.
   Every question changes generated sessions — nothing is asked
   purely to make the intake look thorough.
   ============================================================ */
let obStep = 0;
const OB_DEFAULT = {
  name:'', units:'kg', bodyweight:null, goals:['strength','muscle'],
  level:'some', priorities:[], cardioAmount:'light', cardioModes:['car-walk'],
  injuries:[], sleepNorm:7.5, envs:['full'], gearMode:'commercial', seedOverrides:{}, seedExact:{},
  gear:{ ...GEAR_ALL }, programId:'anchor3', sessionMins:60, nutrition:false
};
let obDraft = { ...OB_DEFAULT, gear:{ ...GEAR_ALL }, seedOverrides:{}, seedExact:{} };

const GOALS = {
  strength: { k:'strength', ico:'🏋️', label:'Get stronger',
              note:'Heavier main lifts, lower reps, longer rests, real progression on the bar.' },
  muscle:   { k:'muscle',   ico:'💪', label:'Build muscle',
              note:'More volume in the 8–12 range, more accessory work, and a protein target that means something.' },
  health:   { k:'health',   ico:'🫀', label:'Stay healthy and durable',
              note:'Balanced work and joint-friendly progression. Built to survive long days on your feet.' },
  consist:  { k:'consist',  ico:'📿', label:'Just be consistent',
              note:'Simpler programming. The app spends its effort removing friction rather than optimising.' }
};

const tick = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>`;
const backArrow = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M15 19l-7-7 7-7"/></svg>`;

/* screen list — 'c' entries are chapter cards, 'q' entries are questions */
const OB_STEPS = [
  { k:'welcome' },
  { k:'ch-you',      c:1 },
  { k:'name',        q:1,  ch:1 },
  { k:'body',        q:2,  ch:1 },
  { k:'ch-training', c:2 },
  { k:'goals',       q:3,  ch:2 },
  { k:'level',       q:4,  ch:2 },
  { k:'priorities',  q:5,  ch:2 },
  { k:'cardio',      q:6,  ch:2 },
  { k:'cardiomode',  q:7,  ch:2 },
  { k:'injuries',    q:8,  ch:2 },
  { k:'sleep',       q:9,  ch:2 },
  { k:'ch-where',    c:3 },
  { k:'env',         q:10, ch:3 },
  { k:'gear',        q:11, ch:3 },
  { k:'geardetail',  q:12, ch:3 },
  { k:'structure',   q:13, ch:3 },
  { k:'length',      q:14, ch:3 },
  { k:'ch-finish',   c:4 },
  { k:'nutrition',   q:15, ch:4 },
  { k:'seed',        q:16, ch:4 },
  { k:'ready' }
];
const CHAPTERS = { 1:'You', 2:'Your training', 3:'Where and how', 4:'Finishing up' };
const OB_QTOTAL = OB_STEPS.filter(s => s.q).length;

/* steps that get skipped depending on earlier answers */
function obSkip(step) {
  if (step.k === 'cardiomode' && obDraft.cardioAmount === 'none') return true;
  if (step.k === 'gear' && !obDraft.envs.includes('full')) return true;
  if (step.k === 'geardetail' && (!obDraft.envs.includes('full') || obDraft.gearMode === 'commercial')) return true;
  return false;
}
function obAdvance(dir) {
  let i = obStep + dir;
  while (i > 0 && i < OB_STEPS.length - 1 && obSkip(OB_STEPS[i])) i += dir;
  obStep = Math.max(0, Math.min(OB_STEPS.length - 1, i));
}

/* ---------- shared bits ---------- */
function opt(o) {
  return `<div class="opt ${o.on?'on':''}" data-act="${o.act}" data-v="${o.v}">
    ${o.ico ? `<div class="opt-ico">${o.ico}</div>` : ''}
    <div class="grow">
      <div class="opt-t">${o.title}${o.tag?`<span class="opt-tag">${o.tag}</span>`:''}</div>
      ${o.desc ? `<div class="opt-d">${o.desc}</div>` : ''}
    </div>
    <div class="opt-mark">${tick}</div>
  </div>`;
}

function obShell(inner, opts) {
  opts = opts || {};
  const st = OB_STEPS[obStep];
  const done = OB_STEPS.slice(0, obStep).filter(s => s.q && !obSkip(s)).length;
  const total = OB_STEPS.filter(s => s.q && !obSkip(s)).length;
  const pct = Math.round((obStep / (OB_STEPS.length - 1)) * 100);
  return `<div class="ob-wrap">
    <div class="ob-top">
      <div class="ob-prog"><i style="width:${pct}%"></i></div>
      <div class="ob-nav">
        ${obStep > 0 ? `<button class="ob-back" data-act="ob-back">${backArrow}</button>` : '<span style="width:40px"></span>'}
        ${st.q ? `<span class="ob-step">${CHAPTERS[st.ch]} · ${done} of ${total}</span>` : '<span></span>'}
        <span style="width:40px"></span>
      </div>
    </div>
    <div class="ob-body">${inner}</div>
    ${opts.foot ? `<div class="ob-foot">${opts.foot}</div>` : ''}
  </div>`;
}

function obChapter(n, title, lede, points) {
  return `<div class="ob-wrap">
    <div class="ob-top"><div class="ob-prog"><i style="width:${Math.round((obStep/(OB_STEPS.length-1))*100)}%"></i></div>
      <div class="ob-nav"><button class="ob-back" data-act="ob-back">${backArrow}</button><span></span><span style="width:40px"></span></div>
    </div>
    <div class="ob-hero">
      <div class="ob-chapter-n">Part ${n} of 4</div>
      <h1 class="ob-chapter-t">${title}</h1>
      <p class="ob-sub" style="font-size:16px">${lede}</p>
      ${points ? `<div style="margin-top:28px">${points.map(p => `<div class="ob-pt"><div class="ob-pt-n">·</div><div class="opt-d" style="font-size:13.5px">${p}</div></div>`).join('')}</div>` : ''}
    </div>
    <div class="ob-foot"><button class="btn primary block lg" data-act="ob-next">Continue</button></div>
  </div>`;
}

const OB_RENDER = {};
function renderOnboard() {
  const st = OB_STEPS[obStep];
  $('#ob-content').innerHTML = (OB_RENDER[st.k] || (() => '<p>?</p>'))();
  const f = $('#ob-focus');
  if (f) setTimeout(() => f.focus(), 340);
}

/* ---------- welcome ---------- */
OB_RENDER.welcome = () => `<div class="ob-wrap">
  <div class="ob-hero">
    <svg style="margin-bottom:26px" width="54" height="54" viewBox="0 0 100 100"><rect width="100" height="100" rx="26" fill="#12161b"/><path d="M50 14c19.9 0 36 16.1 36 36S69.9 86 50 86 14 69.9 14 50" fill="none" stroke="#E9B44C" stroke-width="6.5" stroke-linecap="round"/><path d="M50 30c11 0 20 9 20 20s-9 20-20 20-20-9-20-20" fill="none" stroke="#E9B44C" stroke-width="6.5" stroke-linecap="round" opacity=".55"/><circle cx="50" cy="50" r="6.5" fill="#E9B44C"/></svg>
    <h1 style="font-size:38px;font-weight:700;letter-spacing:-.04em;line-height:1.05;margin:0">Gu<span class="em">z</span>o<span class="wm-suf">Fit</span></h1>
    <p class="guzo-mean">ጉዞ · <em>guzo</em> · Amharic for <strong>journey</strong></p>
    <p class="ob-sub" style="font-size:17px;margin-top:14px">Strength and health training that re-plans itself around a life that keeps changing shape.</p>
    <div style="margin-top:36px">
      <div class="ob-pt"><div class="ob-pt-n">01</div><div>
        <div class="opt-t">It asks about your week first</div>
        <div class="opt-d">Long shoot days, hotel rooms, five hours of sleep. It cuts the plan to fit before the week starts — not after you have already missed half of it.</div>
      </div></div>
      <div class="ob-pt"><div class="ob-pt-n">02</div><div>
        <div class="opt-t">Every session has a smaller version</div>
        <div class="opt-d">Four sizes, from a full session down to three minutes on a hotel floor. All four count as showing up.</div>
      </div></div>
      <div class="ob-pt"><div class="ob-pt-n">03</div><div>
        <div class="opt-t">One missed session is free</div>
        <div class="opt-d">No daily streak to break. No red marks. The research on habit formation is clear about this and the app is built around it.</div>
      </div></div>
    </div>
  </div>
  <div class="ob-foot">
    <button class="btn primary block lg" data-act="ob-next">Begin</button>
    <p class="tiny center mt-s">Around four minutes. Every answer changes what your sessions look like — none of it is a form for its own sake.</p>
  </div>
</div>`;

/* ---------- chapter cards ---------- */
OB_RENDER['ch-you'] = () => obChapter(1, 'You',
  'Two quick things, so the app can put real numbers in your first session instead of an empty grid.');

OB_RENDER['ch-training'] = () => obChapter(2, 'Your training',
  'What you want out of this, what your body can currently take, and what it should leave alone.',
  ['Goals set your rep ranges and how much accessory work you get.',
   'Injuries permanently remove exercises from the library — nothing you flag will ever be programmed.',
   'Your normal night of sleep calibrates the daily readiness score to you, not to a textbook eight hours.']);

OB_RENDER['ch-where'] = () => obChapter(3, 'Where and how',
  'Which places you train, what equipment is actually there, and how much time a session should take.',
  ['The app only ever programmes exercises you have the kit for.',
   'You will assign a place to each day of the week, so a hotel week runs the same plan with different tools.']);

OB_RENDER['ch-finish'] = () => obChapter(4, 'Finishing up',
  'One optional extra, then a look at the numbers it has picked for you.');

/* ---------- 1. name ---------- */
OB_RENDER.name = () => obShell(`
  <h1 class="ob-q">First — what should it call you?</h1>
  <p class="ob-sub">Only used to greet you on the home screen. Leave it blank if you would rather it didn't.</p>
  <input class="ob-input" id="ob-focus" placeholder="Your name" value="${h(obDraft.name)}" autocomplete="given-name" enterkeyhint="next">
  <p class="ob-why">Nothing you enter here — or anywhere in this app — leaves your phone. There is no account and no server.</p>
`, { foot:`<button class="btn primary block lg" data-act="ob-next">Continue</button>` });

/* ---------- 2. bodyweight ---------- */
OB_RENDER.body = () => {
  const u = obDraft.units;
  return obShell(`
    <h1 class="ob-q">Roughly what do you weigh?</h1>
    <p class="ob-sub">An approximate number is fine. It sets your starting weights and, if you turn nutrition on later, your protein target.</p>
    <div class="seg" style="margin-top:26px">
      <button class="${u==='kg'?'on':''}" data-act="ob-units" data-v="kg">Kilograms</button>
      <button class="${u==='lb'?'on':''}" data-act="ob-units" data-v="lb">Pounds</button>
    </div>
    <div class="bignum">
      <input id="ob-focus" type="number" inputmode="decimal" step="0.5" placeholder="${u==='kg'?'80':'175'}" value="${obDraft.bodyweight||''}" enterkeyhint="next">
      <span class="u">${u}</span>
    </div>
    <p class="ob-why">You can skip this. If you do, your first session will have blank weight fields for you to fill in as you go.</p>
  `, { foot:`<button class="btn primary block lg" data-act="ob-next">Continue</button>
             <button class="btn quiet block mt-s" data-act="ob-skip-bw">Skip this</button>` });
};

/* ---------- 3. goals ---------- */
OB_RENDER.goals = () => obShell(`
  <h1 class="ob-q">What are you actually training for?</h1>
  <p class="ob-sub">Pick everything that applies — they are not exclusive. This sets rep ranges, accessory volume, and how the app talks to you.</p>
  <div class="opts">
    ${Object.values(GOALS).map(g => opt({ act:'ob-goal', v:g.k, on:obDraft.goals.includes(g.k), ico:g.ico, title:g.label, desc:g.note })).join('')}
  </div>
`, { foot:`<button class="btn primary block lg" data-act="ob-next">Continue</button>` });

/* ---------- 4. experience ---------- */
OB_RENDER.level = () => obShell(`
  <h1 class="ob-q">How much lifting have you done?</h1>
  <p class="ob-sub">Be honest rather than optimistic. This only decides where your first few sessions start, and starting light is far easier to fix than starting heavy.</p>
  <div class="opts">
    ${Object.values(LEVELS).map(l => opt({ act:'ob-level', v:l.k, on:obDraft.level===l.k, ico:l.ico, title:l.label, desc:l.note })).join('')}
  </div>
`, { foot:`<button class="btn primary block lg" data-act="ob-next">Continue</button>` });

/* ---------- 5. priorities ---------- */
OB_RENDER.priorities = () => obShell(`
  <h1 class="ob-q">Anything you want to bring up?</h1>
  <p class="ob-sub">Pick up to three. Each one earns an extra dedicated set in every full session, rotating so no single area hogs the time.</p>
  <div class="opts">
    ${Object.keys(PRIORITIES).map(m => opt({
      act:'ob-priority', v:m, on:obDraft.priorities.includes(m),
      ico:PRIORITIES[m].ico, title:m, desc:PRIORITIES[m].note })).join('')}
  </div>
  <p class="ob-why">Leave it empty if nothing stands out. A balanced plan is a perfectly good plan and this is genuinely optional.</p>
`, { foot:`<button class="btn primary block lg" data-act="ob-next">${obDraft.priorities.length ? 'Continue' : 'Nothing in particular'}</button>` });

/* ---------- 6. cardio amount ---------- */
OB_RENDER.cardio = () => obShell(`
  <h1 class="ob-q">How much cardio do you want?</h1>
  <p class="ob-sub">Added as a finisher on the end of strength sessions, so it never becomes another thing you have to find time for separately.</p>
  <div class="opts">
    ${Object.values(CARDIO_AMOUNT).map(c => opt({
      act:'ob-cardio', v:c.k, on:obDraft.cardioAmount===c.k, ico:c.ico, title:c.label, desc:c.note })).join('')}
  </div>
`, { foot:`<button class="btn primary block lg" data-act="ob-next">Continue</button>` });

/* ---------- 7. cardio modality ---------- */
OB_RENDER.cardiomode = () => obShell(`
  <h1 class="ob-q">What kind, when you do it?</h1>
  <p class="ob-sub">Pick anything you would actually be willing to do. The app uses whichever option is available wherever you happen to be that day.</p>
  <div class="opts">
    ${Object.keys(CARDIO_MODES).map(id => opt({
      act:'ob-cardiomode', v:id, on:obDraft.cardioModes.includes(id),
      ico:CARDIO_MODES[id].ico, title:CARDIO_MODES[id].label })).join('')}
  </div>
`, { foot:`<button class="btn primary block lg" data-act="ob-next">Continue</button>` });

/* ---------- 8. injuries ---------- */
OB_RENDER.injuries = () => {
  const n = injuryExclusionsFor(obDraft.injuries).size;
  return obShell(`
    <h1 class="ob-q">Anything that hurts, or used to?</h1>
    <p class="ob-sub">Old injuries and current niggles both count. Whatever you flag gets removed from the exercise library permanently — it will never appear in a generated session.</p>
    <div class="opts">
      ${Object.values(INJURIES).map(j => opt({
        act:'ob-injury', v:j.k, on:obDraft.injuries.includes(j.k), ico:j.ico, title:j.label, desc:j.note })).join('')}
    </div>
    ${n ? `<div class="card accent" style="margin-top:20px">
      <div class="row between"><div class="eyebrow em">What this changes</div><div class="pill em">${n} removed</div></div>
      <p class="small mt-s">${n} exercises taken out of a library of ${EXLIST.length}. Plenty left — the generator will simply reach for the alternatives.</p>
    </div>` : ''}
    <p class="ob-why">This is not medical advice and it is not a substitute for seeing someone about a genuine injury. It is a filter, and a blunt one.</p>
  `, { foot:`<button class="btn primary block lg" data-act="ob-next">${obDraft.injuries.length ? 'Continue' : 'Nothing to flag'}</button>` });
};

/* ---------- 9. sleep baseline ---------- */
OB_RENDER.sleep = () => obShell(`
  <h1 class="ob-q">What's a normal night's sleep for you?</h1>
  <p class="ob-sub">Not what you should get — what you actually average. Every day the app asks how you slept, and it scores that against this number rather than a textbook eight hours.</p>
  <div class="bignum">
    <input id="ob-focus" type="number" inputmode="decimal" step="0.5" min="3" max="12" value="${obDraft.sleepNorm}" enterkeyhint="next">
    <span class="u">hours</span>
  </div>
  <div class="seg" style="margin-top:26px">
    ${[5.5,6.5,7.5,8.5].map(v => `<button class="${obDraft.sleepNorm===v?'on':''}" data-act="ob-sleep" data-v="${v}">${v}h</button>`).join('')}
  </div>
  <p class="ob-why">If six hours is your ordinary night, six hours should not be scored as a crisis. This is what stops the readiness score nagging you every single day.</p>
`, { foot:`<button class="btn primary block lg" data-act="ob-next">Continue</button>` });

/* ---------- 10. environments ---------- */
OB_RENDER.env = () => {
  const detail = {
    full:  'Your regular gym — commercial, or your own setup at home.',
    hotel: 'Dumbbells, maybe a cable stack and a treadmill. Hotel gyms, unit gyms, anything sparse.',
    bw:    'Floor space and nothing else. A hotel room, a location trailer, the back of a van.'
  };
  const icos = { full:'🏋️', hotel:'🧳', bw:'🧘' };
  return obShell(`
    <h1 class="ob-q">Where does training actually happen?</h1>
    <p class="ob-sub">Pick every place that comes up in a normal month. You'll assign one to each day of the week, and the app swaps exercises to match.</p>
    <div class="opts">
      ${Object.values(ENVS).map(e => opt({ act:'ob-env', v:e.k, on:obDraft.envs.includes(e.k), ico:icos[e.k], title:e.label, desc:detail[e.k] })).join('')}
    </div>
    <p class="ob-why">Choose more than one. The whole point is that a hotel week and a home week run the same plan with different tools.</p>
  `, { foot:`<button class="btn primary block lg" data-act="ob-next">Continue</button>` });
};

/* ---------- 11. gym type ---------- */
OB_RENDER.gear = () => obShell(`
  <h1 class="ob-q">What's your main gym like?</h1>
  <p class="ob-sub">This decides what the app is allowed to programme. Getting told to do lat pulldowns in a garage with two dumbbells is exactly the kind of thing that makes people quit an app.</p>
  <div class="opts">
    ${opt({ act:'ob-gearmode', v:'commercial', on:obDraft.gearMode==='commercial', ico:'🏢',
            title:'A full commercial gym', desc:'Racks, barbells, a full dumbbell range, cables and machines. Everything is available.' })}
    ${opt({ act:'ob-gearmode', v:'custom', on:obDraft.gearMode==='custom', ico:'🔧',
            title:'A home or limited setup', desc:'Tell it exactly what you have and it will only ever use that.' })}
  </div>
`, { foot:`<button class="btn primary block lg" data-act="ob-next">Continue</button>` });

/* ---------- 12. gear checklist ---------- */
OB_RENDER.geardetail = () => {
  const excluded = gearExcludes(obDraft.gear).size;
  return obShell(`
    <h1 class="ob-q">What have you actually got?</h1>
    <p class="ob-sub">Tick everything available at your main training place.</p>
    <div class="opts">
      ${Object.keys(GEAR_ITEMS).map(k => opt({
        act:'ob-gear', v:k, on:!!obDraft.gear[k], ico:GEAR_ITEMS[k].ico,
        title:GEAR_ITEMS[k].label, desc:GEAR_ITEMS[k].note })).join('')}
    </div>
    <div class="card ${excluded > EXLIST.length * 0.6 ? 'rose' : 'accent'}" style="margin-top:20px">
      <div class="row between"><div class="eyebrow em">Library available to you</div><div class="pill em">${EXLIST.length - excluded} exercises</div></div>
      <p class="small mt-s">${EXLIST.length - excluded > 40
        ? 'Comfortably enough to build a full programme around.'
        : 'That is a tight library. Bodyweight and band days will carry a lot of the load — which is fine, but worth knowing.'}</p>
    </div>
  `, { foot:`<button class="btn primary block lg" data-act="ob-next">Continue</button>` });
};

/* ---------- 13. structure ---------- */
OB_RENDER.structure = () => {
  const tags = { anchor3:'Recommended', ul4:null, ul5:'Popular', bro5:null, ppl6:null, hold2:null };
  const icos = { anchor3:'⚓️', ul4:'◧', ul5:'✦', bro5:'⬡', ppl6:'⬢', hold2:'➖' };
  const plain = {
    anchor3:'Three full-body sessions a week. Every session works everything, so no single missed day leaves a gap. The most forgiving structure there is, and the right default for changing hours.',
    ul4:'Four sessions alternating upper and lower. More volume per muscle group, which builds size faster, but a missed day leaves half your body untrained that week.',
    ul5:'Push, pull, legs, then an upper and a lower day. Everything gets hit close to twice a week, which is where most of the muscle-building evidence points — and the extra days give the app room to shuffle when a shoot overruns.',
    bro5:'Chest, back, legs, shoulders, arms — one area a day. Lots of volume per area and easy to remember, but each muscle is only trained once a week, so a missed day costs you that muscle entirely.',
    ppl6:'Six sessions across push, pull and legs. The strongest stimulus available, and the least tolerant of an unpredictable schedule.',
    hold2:'Two full-body sessions a week. Not a growth plan — a holding pattern for heavy shoot blocks. Research puts true maintenance near one session a week, so this stays comfortably ahead of losing ground.'
  };
  return obShell(`
    <h1 class="ob-q">How many days a week, realistically?</h1>
    <p class="ob-sub">Not the number you wish you could do. The number you can hit in an ordinary month. Changeable any time, and the app re-cuts around a bad week regardless.</p>
    <div class="opts">
      ${Object.values(PROGRAMS).map(p => opt({
        act:'ob-prog', v:p.id, on:obDraft.programId===p.id, ico:icos[p.id],
        title:p.name + ' — ' + p.target + ' days', tag:tags[p.id], desc:plain[p.id] })).join('')}
    </div>
  `, { foot:`<button class="btn primary block lg" data-act="ob-next">Continue</button>` });
};

/* ---------- 14. session length ---------- */
OB_RENDER.length = () => {
  const b = obDraft.sessionMins;
  const trim = Math.max(20, Math.round(b * 0.6 / 5) * 5);
  const shortM = Math.max(12, Math.round(b * 0.32 / 5) * 5);
  const plenty = Math.min(105, Math.round(b * 1.35 / 5) * 5);
  const tight = Math.max(15, Math.round(b * 0.4 / 5) * 5);
  return obShell(`
    <h1 class="ob-q">How long is a normal session for you?</h1>
    <p class="ob-sub">This is the most load-bearing number in the app. Every other duration is worked out from it — what a busy day looks like, what a clear one looks like, and how much gets cut when you're short.</p>
    <div class="opts">
      ${Object.keys(SESSION_LENGTHS).map(m => opt({
        act:'ob-length', v:m, on:String(obDraft.sessionMins)===String(m),
        ico:'⏱', title:SESSION_LENGTHS[m].label, tag:SESSION_LENGTHS[m].tag, desc:SESSION_LENGTHS[m].note })).join('')}
    </div>
    <div class="card accent" style="margin-top:22px">
      <div class="eyebrow em">What everything else becomes</div>
      <div class="scale-grid mt">
        <div><span class="scale-k">A clear day</span><span class="scale-v">${plenty} min</span></div>
        <div><span class="scale-k">A normal day</span><span class="scale-v em">${b} min</span></div>
        <div><span class="scale-k">A tight day</span><span class="scale-v">${tight} min</span></div>
        <div><span class="scale-k">Trimmed session</span><span class="scale-v">~${trim} min</span></div>
        <div><span class="scale-k">Short session</span><span class="scale-v">~${shortM} min</span></div>
        <div><span class="scale-k">The floor</span><span class="scale-v">3 min</span></div>
      </div>
    </div>
  `, { foot:`<button class="btn primary block lg" data-act="ob-next">Continue</button>` });
};

/* ---------- 15. nutrition ---------- */
OB_RENDER.nutrition = () => {
  const t = obDraft.bodyweight ? suggestedTargets(obDraft.bodyweight, obDraft.goals) : null;
  return obShell(`
    <h1 class="ob-q">Track protein and calories too?</h1>
    <p class="ob-sub">Entirely optional, and it can never block or interrupt a workout. If you're training to build muscle, protein is the one number outside the gym that genuinely moves the needle.</p>
    <div class="opts">
      ${opt({ act:'ob-nutrition', v:'yes', on:obDraft.nutrition===true, ico:'🍽',
              title:'Yes, turn it on', desc:'A protein and calorie target on the home screen, with quick-add for the things you eat repeatedly.' })}
      ${opt({ act:'ob-nutrition', v:'no', on:obDraft.nutrition===false, ico:'🚫',
              title:'Not for now', desc:'Strength tracking only. You can switch this on at any point without losing anything.' })}
    </div>
    ${t && obDraft.nutrition ? `<div class="card accent" style="margin-top:20px">
      <div class="eyebrow em">Your suggested targets</div>
      <div class="tiles mt">
        <div class="tile"><div class="v">${t.kcal}</div><div class="k">kcal</div></div>
        <div class="tile"><div class="v" style="color:var(--teal)">${t.p}</div><div class="k">protein</div></div>
        <div class="tile"><div class="v">${t.c}</div><div class="k">carbs</div></div>
        <div class="tile"><div class="v">${t.f}</div><div class="k">fat</div></div>
      </div>
      <p class="small mt">${obDraft.goals.includes('muscle')
        ? 'About 1.9 g of protein per kg, with calories slightly above maintenance for gaining. Adjustable later.'
        : 'About 1.6 g of protein per kg at roughly maintenance calories. Adjustable later.'}</p>
      <span class="src">1.6–2.2 g/kg is the range with the strongest evidence for muscle gain in trained lifters</span>
    </div>` : ''}
  `, { foot:`<button class="btn primary block lg" data-act="ob-next">Continue</button>` });
};

/* ---------- 16. starting weights, editable ---------- */
/* One row per main lift. If an injury has ruled a main lift out, show the
   alternative you'll actually be given instead — and back-derive the base
   number from whatever you type, so everything downstream still scales. */
function seedRows() {
  const lvl = LEVELS[obDraft.level];
  const blocked = injuryExclusionsFor(obDraft.injuries);
  return Object.keys(lvl.f).map(base => {
    if (!blocked.has(base)) return { base, showId: base, factor: 1 };
    const alt = Object.entries(SEED_MAP)
      .filter(([id, [b]]) => b === base && !blocked.has(id) && EX[id])[0];
    if (!alt) return null;
    return { base, showId: alt[0], factor: alt[1][1], substituted: true };
  }).filter(Boolean);
}
function seedSuggestion(row) {
  const lvl = LEVELS[obDraft.level];
  if (!lvl || !obDraft.bodyweight) return null;
  const step = obDraft.units === 'kg' ? 2.5 : 5;
  return Math.max(0, Math.round((obDraft.bodyweight * lvl.f[row.base] * row.factor) / step) * step);
}
function collectSeedInputs() {
  $$('[data-seed]').forEach(el => {
    const v = parseFloat(el.value);
    const id = el.dataset.seed;
    const base = el.dataset.base;
    const factor = parseFloat(el.dataset.factor) || 1;
    if (!isNaN(v) && v > 0) { obDraft.seedOverrides[base] = v / factor; obDraft.seedExact[id] = v; }
    else { delete obDraft.seedOverrides[base]; delete obDraft.seedExact[id]; }
  });
}

OB_RENDER.seed = () => {
  const u = obDraft.units;
  const rows = seedRows();
  const totalMain = Object.keys(LEVELS[obDraft.level].f).length;
  const dropped = totalMain - rows.length;
  const anyEdited = rows.some(r => obDraft.seedOverrides[r.base] > 0);
  const hasBw = obDraft.bodyweight > 0;
  const subs = rows.filter(r => r.substituted).length;

  const html = rows.map(r => {
    const ex = EX[r.showId];
    const sug = seedSuggestion(r);
    const own = obDraft.seedExact[r.showId] > 0 ? obDraft.seedExact[r.showId]
              : (obDraft.seedOverrides[r.base] > 0 ? roundToStep(obDraft.seedOverrides[r.base] * r.factor, u) : null);
    const val = own != null ? own : (sug || '');
    const edited = own != null;
    return `<div class="seedrow ${edited?'edited':''}">
      <div class="grow">
        <div class="opt-t" style="font-size:15px">${h(ex.name)}${r.substituted?'<span class="opt-tag">instead</span>':''}</div>
        <div class="opt-d">${ex.rl}–${ex.rh} reps to start</div>
      </div>
      <div class="seed-wrap">
        <div class="seed-field">
          <input class="seed-in" data-seed="${r.showId}" data-base="${r.base}" data-factor="${r.factor}"
                 type="number" inputmode="decimal" step="${u==='kg'?'2.5':'5'}"
                 value="${val}" placeholder="—" enterkeyhint="next">
          <span class="seed-u">${u}</span>
        </div>
        <div class="seed-tag" data-tag="${r.showId}">${edited ? 'Yours' : (sug ? 'Suggested' : 'Enter one')}</div>
      </div>
    </div>`;
  }).join('');

  return obShell(`
    <h1 class="ob-q">${hasBw ? 'Here is where you’ll start' : 'What can you lift now?'}</h1>
    <p class="ob-sub">${hasBw
      ? 'Estimated from your bodyweight and experience, and deliberately set light.'
      : 'No bodyweight given, so there is nothing to estimate from — but if you know your working weights, put them in.'}
      <strong style="color:var(--text-dim)">Tap any number and change it if you know better.</strong></p>

    <div class="list" style="margin-top:24px">${html}</div>

    ${anyEdited ? `<button class="btn quiet block mt" data-act="ob-seed-reset">Reset to suggestions</button>` : ''}
    ${subs ? `<p class="tiny" style="margin-top:12px">${subs} of these ${subs===1?'is a substitute':'are substitutes'} for a lift you flagged as sore. The original never gets programmed — set the alternative instead and everything scales from it.</p>` : ''}
    ${dropped ? `<p class="tiny" style="margin-top:8px">${dropped} main lift${dropped===1?'':'s'} has no safe alternative given what you flagged, so it is left out entirely.</p>` : ''}

    <p class="ob-why">Enter a weight you can genuinely do for the reps shown — a working set, not a one-rep max. Everything else in the library scales off these, so a dumbbell press and a leg press both follow whatever you put here.</p>
    <p class="ob-why" style="margin-top:10px">Get it wrong and nothing breaks. Log what you actually did: hit the top of the rep range and it adds weight next time, fall short twice and it takes 10% off.</p>
  `, { foot:`<button class="btn primary block lg" data-act="ob-next">${anyEdited ? 'Use these' : (hasBw ? 'Looks about right' : 'Continue')}</button>` });
};

function roundToStep(w, u) { const step = u === 'kg' ? 2.5 : 5; return Math.max(0, Math.round(w / step) * step); }

/* ---------- ready ---------- */
OB_RENDER.ready = () => {
  const prog = PROGRAMS[obDraft.programId];
  return obShell(`
    <div style="padding-top:14px">
      <div style="font-size:42px">🏔️</div>
      <h1 class="ob-q" style="margin-top:16px">One last thing, and it's the important one.</h1>
      <p class="ob-sub">Now you'll set out what your week actually looks like — which days you can train, how long you'll have, and where you'll be.</p>
      <p class="ob-sub" style="margin-top:14px">This is the step that makes everything else work. Guzo places your ${prog.target} sessions into the days that can genuinely hold them, rather than putting them on a fixed schedule and letting you fail it.</p>
      <div class="card mt-l">
        <div class="eyebrow">It takes about thirty seconds</div>
        <p class="small mt-s">Seven days, one tap each. Everything is pre-filled as a normal day, so you only change the ones that are unusual.</p>
      </div>
      <p class="ob-why">You can redo this any time — on a Sunday night, or halfway through a week when the schedule falls apart.</p>
    </div>
  `, { foot:`<button class="btn primary block lg" data-act="ob-finish">Set up my week</button>` });
};
