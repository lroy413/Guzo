/* ============================================================
   FUEL — the nutrition surface
   ------------------------------------------------------------
   Two decisions shape this screen, and both are deliberate.

   The week leads, not the day. MacroFactor argues — and the
   eating-behaviour literature on rigid restraint supports the
   reasoning, if not the specific UX claim — that chasing a
   perfect daily number is the failure mode. Guzo already refuses
   to draw a red mark on a missed training day; it would be
   incoherent to draw one on a Tuesday you ate 400 over.

   And nothing here ever goes red. Over target reads as a fact,
   not a verdict.
   ============================================================ */

function fuelOn() { return !!(S.settings && S.settings.nutrition); }

/* How far above target a week bar can climb before it stops growing, as a
   percentage. The track spans this whole range and carries a hairline at the
   100% mark, so a day is read against where the target actually was.

   It used to compute the percentage up to 140 and then clamp the *fill* to
   100, which meant a day 40% over target was drawn identically to a day that
   landed exactly on it. The number underneath was right and the bar was a lie.

   Deliberately not a colour change: Fuel never goes red, and being over on a
   Tuesday is information, not a failure. The marker says where the target
   was and lets the bar say the rest. */
const FUEL_BAR_CEIL = 140;

/* Route leaves the bar when Fuel joins it, so the count stays at five. */
function syncNav() {
  const fuel = document.getElementById('nav-fuel');
  const plan = document.getElementById('nav-plan');
  if (!fuel || !plan) return;
  fuel.classList.toggle('hide', !fuelOn());
  plan.classList.toggle('hide', fuelOn());
}

let fuelDate = null;              // which day the log is showing
function fuelDay() { return fuelDate || today(); }

function renderFuel() {
  const k = fuelDay();
  const t = nutTotals(k);
  const e = energyTargets();
  const tg = S.nutrition.targets || {};
  const wk = weekIntake(0);
  const pOnly = proteinOnly();

  const kcalTarget = tg.kcal || (e && e.kcal) || 0;
  const pTarget = proteinTarget() || 0;
  const burned = kcalOnDate(k);

  let html = '';

  /* ── the week, first ─────────────────────────────────────── */
  html += `<div class="fuel-week">
    <div class="row between mb-s">
      <span class="eyebrow">This week</span>
      <span class="tiny">${wk.loggedDays} of 7 days logged</span>
    </div>
    <div class="fuel-avg mono">${pOnly
      ? (wk.avgP != null ? wk.avgP + '<span class="fuel-of">g protein a day</span>' : '—')
      : (wk.avgKcal != null ? wk.avgKcal + '<span class="fuel-of">kcal a day</span>' : '—')}</div>
    <div class="fuel-sub">${weekReadout(wk, pOnly, kcalTarget, pTarget)}</div>
    <div class="fuel-bars mt">
      ${wk.days.map(d => {
        const val = pOnly ? d.p : d.kcal;
        const target = pOnly ? pTarget : kcalTarget;
        const pct = target && val ? Math.min(FUEL_BAR_CEIL, Math.round(val / target * 100)) : 0;
        const isToday = d.d === today();
        return `<button class="fuel-bar ${isToday ? 'today' : ''} ${d.d === k ? 'on' : ''}" data-act="fuel-day" data-v="${d.d}">
          <span class="fuel-bar-track">
            <span class="fuel-bar-fill" style="height:${pct / FUEL_BAR_CEIL * 100}%"></span>
            ${target ? `<span class="fuel-bar-target" style="bottom:${100 / FUEL_BAR_CEIL * 100}%"></span>` : ''}
          </span>
          <span class="fuel-bar-d">${DAYNAMES[fromKey(d.d).getDay()].slice(0,1)}</span>
        </button>`;
      }).join('')}
    </div>
  </div>`;

  /* ── the day being viewed ────────────────────────────────── */
  const isToday = k === today();
  html += `<div class="sec-head"><span class="sec-t">${isToday ? 'Today' : prettyDate(k)}</span>
    ${!isToday ? `<button class="sec-a" data-act="fuel-day" data-v="${today()}">Back to today</button>` : ''}</div>`;

  /* ── the day, as a ring ──────────────────────────────────── */
  /* Three concentric arcs rather than three stacked bars. A ring is the one
     shape that reads at a glance from across a kitchen, it fills rather than
     grows so the eye follows it round, and it is the difference between a
     spreadsheet and something you want to open. Drawn with stroke-dashoffset
     so the fill animates from empty on arrival. */
  const ringArc = (pct, r, cls) => {
    const c = 2 * Math.PI * r;
    const off = c * (1 - Math.max(0, Math.min(1, pct / 100)));
    /* --c is this arc's own circumference, so the fill animation starts from
       genuinely empty rather than from a number large enough to look empty. */
    return `<circle class="fr-arc ${cls}" cx="90" cy="90" r="${r}"
      style="--c:${c.toFixed(1)}"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
      transform="rotate(-90 90 90)"/>`;
  };
  const ringTrack = r => `<circle class="fr-track" cx="90" cy="90" r="${r}"/>`;
  const mainPct = pctOf(pOnly ? t.p : t.kcal, pOnly ? pTarget : kcalTarget);
  const cTarget = tg.c || (e && e.c) || 0;
  const fTarget = tg.f || (e && e.f) || 0;

  /* ── the deck: food and water, one card's worth of room ──────
     Two full-height cards stacked made the screen a long scroll with the
     second one permanently below the fold — reported as clumsy. They are two
     faces of one card now: tabs on top, swipeable, and only one of them
     occupies the page at a time.

     Both faces stay mounted. The bottle's fill is a CSS transform with a
     transition on it, and a face that is built on demand is a new element with
     no previous transform to move from — the level would snap. The inactive
     one is `inert` instead, so it cannot be tapped or focused through the card
     in front of it. */
  html += `<div class="deck" data-face="${fuelFace}">
    <div class="deck-tabs" role="tablist" aria-label="Food or water">
      <button class="deck-tab ${fuelFace === 'food' ? 'on' : ''}" role="tab"
              aria-selected="${fuelFace === 'food'}" aria-controls="deck-food"
              data-act="fuel-face" data-v="food">Food</button>
      <button class="deck-tab ${fuelFace === 'water' ? 'on' : ''}" role="tab"
              aria-selected="${fuelFace === 'water'}" aria-controls="deck-water"
              data-act="fuel-face" data-v="water">Water</button>
    </div>
    <div class="deck-vp">
      <div class="deck-track">
        <div class="deck-face food ${fuelFace === 'food' ? 'on' : ''}" id="deck-food" role="tabpanel"
             aria-label="Food" ${fuelFace === 'food' ? '' : 'inert'}>`
  + `<div class="fuel-day-card">
    <div class="fuel-ring-wrap">
      <svg class="fuel-ring" viewBox="0 0 180 180" aria-hidden="true">
        ${ringTrack(78)}${ringArc(mainPct, 78, 'main')}
        ${!pOnly ? ringTrack(64) + ringArc(pctOf(t.p, pTarget), 64, 'prot') : ''}
        ${!pOnly ? ringTrack(50) + ringArc(pctOf(t.c, cTarget), 50, 'carb') : ''}
      </svg>
      <div class="fuel-ring-mid">
        <div class="fuel-ring-v mono">${pOnly ? Math.round(t.p) + 'g' : t.kcal}</div>
        <div class="fuel-ring-k">${pOnly ? 'protein' : 'kcal'}</div>
        ${(pOnly ? pTarget : kcalTarget) ? `<div class="fuel-ring-of">of ${pOnly ? pTarget + 'g' : kcalTarget}</div>` : ''}
      </div>
    </div>

    ${burned && !pOnly ? `<div class="fuel-burn-chip"><span class="mono">+${burned}</span> burned training</div>` : ''}

    ${!pOnly ? `<div class="fuel-legend">
      ${[['Protein', t.p, pTarget, 'prot'], ['Carbs', t.c, cTarget, 'carb'], ['Fat', t.f, fTarget, 'fat']]
        .map(([label, v, target, tone]) => `<div class="fuel-leg">
          <span class="fuel-dot ${tone}"></span>
          <span class="grow">${label}</span>
          <span class="mono">${Math.round(v)}${target ? '<span class="fuel-of-s">/' + target + '</span>' : ''}g</span>
        </div>`).join('')}
    </div>` : `<p class="tiny mt center">Calories are switched off. Protein is the number with the strongest evidence behind it for building muscle &mdash; everything else is being logged, just not shown.</p>`}
  </div>`;

  html += `</div>
        <div class="deck-face water ${fuelFace === 'water' ? 'on' : ''}" id="deck-water" role="tabpanel"
             aria-label="Water" ${fuelFace === 'water' ? '' : 'inert'}>`
    + bottleHTML(k)
    + `</div>
      </div>
    </div>
  </div>`;

  /* ── add ─────────────────────────────────────────────────── */
  html += `<div class="fuel-actions">
    <div class="btn-row">
      <button class="btn primary grow lg" data-act="fuel-search">Add food</button>
      <button class="btn primary lg fuel-scan-btn" data-act="scan" aria-label="Scan a barcode">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/><path d="M7 8v8M10.5 8v8M14 8v8M17 8v8" stroke-width="1.6"/></svg>
      </button>
    </div>
    <div class="btn-row mt-s">
      <button class="btn ghost grow" data-act="fuel-quick-sheet">Recent</button>
      <button class="btn ghost grow" data-act="fuel-quick-add">Quick add</button>
      <button class="btn ghost grow" data-act="fuel-copy">Copy a day</button>
    </div>
  </div>`;

  /* ── suggested meals ─────────────────────────────────────── */
  html += suggestionsHTML(k);

  /* ── what's logged, in meals ─────────────────────────────── */
  const items = nutDay(k).items;
  if (items.length) {
    /* Grouped, in the order you eat them. A flat list of fourteen things has
       no shape, and every other logger in the category groups — it is also
       what makes "you are light on protein at breakfast" possible later. */
    html += `<div class="sec-head"><span class="sec-t">Logged</span>
      <span class="tiny">${items.length} item${items.length === 1 ? '' : 's'}</span></div>`;
    MEALS.forEach(meal => {
      const mine = items.filter(it => (it.m || 's') === meal.id);
      if (!mine.length) return;
      const kc = mine.reduce((a, x) => a + (+x.kcal || 0), 0);
      const pr = Math.round(mine.reduce((a, x) => a + (+x.p || 0), 0));
      html += `<div class="fuel-meal">
        <div class="fuel-meal-h">
          <span class="fuel-meal-i" aria-hidden="true">${ico(meal.ico)}</span>
          <span class="grow fuel-meal-n">${meal.n}</span>
          <span class="fuel-meal-s mono">${pOnly ? pr + 'g' : kc + ' kcal'}</span>
        </div>
        ${mine.map(it => `<button class="fuel-item" data-act="fuel-edit" data-v="${h(it.id)}">
          <span class="grow">
            <span class="fuel-item-n">${h(it.n)}${it.edited ? '<span class="fuel-own">yours</span>' : ''}</span>
            <span class="fuel-item-b">${it.qty && it.foodId ? h(String(it.qty)) + (unitLabel(it.u) || '×') + ' · ' : ''}${
              pOnly ? Math.round(it.p) + 'g protein'
                    : it.kcal + ' kcal · ' + Math.round(it.p) + 'p ' + Math.round(it.c) + 'c ' + Math.round(it.f) + 'f'}</span>
          </span>
          <span class="chev">&rsaquo;</span>
        </button>`).join('')}
      </div>`;
    });
  } else {
    html += `<div class="note mb"><p class="note-t">Nothing logged ${isToday ? 'yet today' : 'that day'}.</p><p class="note-b">A week with four honest days on it is worth more than a week with seven guessed ones.</p></div>`;
  }

  /* ── where the target comes from ─────────────────────────── */
  html += energyPanelHTML(e, pOnly);

  html += `<button class="btn quiet block mt" data-act="open-nut-targets">Targets and settings</button>`;

  const el = document.getElementById('fuel-body');
  if (el) el.innerHTML = html;
  /* After the markup lands, so the face in front has a height to measure. */
  sizeFuelDeck();
}

/* ---------- suggested meals ----------
   A shape for the day, not a prescription. It never claims you must eat this,
   and logging one is a single deliberate tap rather than something that
   happens to your diary on its own. */
function suggestionsHTML(k) {
  const prefs = dietPrefs();
  const sug = suggestMeals(k);

  if (!sug.ok) {
    /* Say which thing is missing. "No suggestions" with no reason is the sort
       of dead end that makes someone assume the feature is broken. */
    const why = sug.reason === 'no-protein'
      ? 'Those restrictions leave nothing to build a meal around. Loosening one would give the suggestions something to work with.'
      : 'Suggestions need a calorie target. Add your height and age and one gets worked out for you.';
    return `<div class="sec-head"><span class="sec-t">Suggested</span></div>
      <div class="note mb"><p class="note-t">Nothing to suggest yet.</p><p class="note-b">${why}</p>
      <button class="btn ghost block mt-s" data-act="open-diet-prefs">How you eat</button></div>`;
  }

  const pOnly = proteinOnly();
  return `<div class="sec-head"><span class="sec-t">Suggested</span>
      <button class="sec-a" data-act="open-diet-prefs">How you eat</button></div>
    <div class="list mb">
      ${sug.slots.map((s, i) => `<div class="lrow" style="align-items:flex-start">
        <div class="grow">
          <div class="h3" style="font-size:14.5px">${h(s.slot)}</div>
          <div class="tiny mt-s">${s.items.map(it =>
            h(it.n) + ' ' + it.qty + (unitLabel(it.u) || '×')).join(' · ')}</div>
          <div class="tiny mt-s mono em">${pOnly ? Math.round(s.p) + 'g protein' : s.kcal + ' kcal · ' + Math.round(s.p) + 'g protein'}</div>
        </div>
        <button class="btn xs" data-act="fuel-log-slot" data-v="${k}" data-i="${i}">Log</button>
      </div>`).join('')}
    </div>
    <p class="tiny mb">${pOnly
      ? 'Built from your protein target and how often you said you eat.'
      : `Roughly ${sug.kcal} kcal and ${Math.round(sug.p)}g protein across the day, against a target of ${sug.kcalTarget}${sug.pTarget ? ' and ' + sug.pTarget + 'g' : ''}.`} Generic reference foods, not products — check labels if something matters medically.</p>`;
}

/* Protein-only gets its own reasoning panel. Same honesty, one number. */
function proteinPanelHTML() {
  const kg = bodyKg();
  const p = proteinTarget();
  let html = `<div class="sec-head"><span class="sec-t">Where the target comes from</span></div>`;
  if (!p || !kg) {
    return html + `<button class="note" data-act="open-profile" style="width:100%;text-align:left">
      <p class="note-t">No target yet</p>
      <p class="note-b">Add your weight and Guzo can set a protein figure worth aiming at.</p>
    </button>`;
  }
  const per = Math.round(p / kg * 100) / 100;
  return html + `<div class="card">
    <div class="eyebrow">The evidence</div>
    <div class="row between mt-s"><span class="small">Your bodyweight</span><span class="mono">${Math.round(kg * 10) / 10} kg</span></div>
    <div class="row between mt-s"><span class="small"><strong>Target</strong></span><span class="mono em">${p}g &middot; ${per} g/kg</span></div>
    <p class="tiny mt-s">Morton and colleagues pooled 49 trials of 1,863 trained people and found the benefit to muscle gain flattening out around 1.6 g per kg a day, with the confidence interval reaching 2.2. Above that the evidence stops supporting more.</p>
  </div>`;
}

function pctOf(v, target) {
  if (!target) return 0;
  return Math.min(100, Math.round(v / target * 100));
}

/* Never a verdict. "Over" is a fact about the week, not a failure. */
function weekReadout(wk, pOnly, kcalTarget, pTarget) {
  if (!wk.loggedDays) return 'Nothing logged this week yet';
  const target = pOnly ? pTarget : kcalTarget;
  const avg = pOnly ? wk.avgP : wk.avgKcal;
  if (!target || avg == null) return wk.loggedDays + ' days logged';
  const diff = avg - target;
  const pct = Math.abs(diff) / target;
  if (wk.loggedDays < 4) return 'Too few days to read anything into yet';
  if (pct < 0.05) return 'Sitting on your target';
  return (diff > 0 ? '+' : '') + Math.round(diff) + (pOnly ? 'g' : ' kcal') + ' a day against target';
}

/* The measured estimate sits next to the formula, not instead of it.
   In protein-only mode none of it is drawn — a panel explaining how a
   calorie target was arrived at is a calorie figure with extra steps. */
function energyPanelHTML(e, pOnly) {
  if (pOnly) return proteinPanelHTML();
  const a = adaptiveTdee(21);
  let html = `<div class="sec-head"><span class="sec-t">Where the target comes from</span></div>`;

  if (a && a.ready) {
    const formula = tdee();
    html += `<div class="card accent mb">
      <div class="eyebrow em">Measured from your own data</div>
      <div class="row between mt-s"><span class="small">Your expenditure</span><span class="mono em">${a.tdee} kcal</span></div>
      <div class="row between mt-s"><span class="small">Averaged intake</span><span class="mono">${a.meanIntake} kcal</span></div>
      <div class="row between mt-s"><span class="small">Weight trend</span><span class="mono">${a.weightChange > 0 ? '+' : ''}${a.weightChange} ${unit()} over ${a.days} days</span></div>
      ${formula ? `<div class="row between mt-s"><span class="small">Formula said</span><span class="mono">${formula} kcal</span></div>` : ''}
      <p class="tiny mt-s">Worked out backwards from what you actually ate and what the scale actually did, over ${a.days} days with ${a.loggedDays} logged. A measurement of you beats an average of everybody &mdash; though the 7,700 kcal-per-kilo conversion is itself an approximation, so treat this as a better starting point rather than a fact.</p>
    </div>`;
  } else if (a && a.why === 'under-logging') {
    /* Named plainly rather than hidden behind "not enough data". Someone
       whose diary is missing a third of their food deserves to be told
       that, not quietly kept on the formula. */
    html += `<div class="note mb">
      <p class="note-t">The numbers don&rsquo;t add up yet</p>
      <p class="note-b">Working backwards from your log gives ${a.implausible} kcal, against ${a.formula} from the formula. A gap that size almost always means food is going unlogged rather than that your metabolism is unusual &mdash; the cooking oil, the bites while making dinner, the days that stop after lunch. Guzo is staying on the formula until the log closes the gap.</p>
    </div>`;
  } else if (a && a.why === 'over-logging') {
    html += `<div class="note mb">
      <p class="note-t">The numbers don&rsquo;t add up yet</p>
      <p class="note-b">Working backwards from your log gives ${a.implausible} kcal, well above the ${a.formula} the formula expects. That usually means duplicated entries or a weigh-in that jumped. Guzo is staying on the formula for now.</p>
    </div>`;
  } else if (a && !a.ready) {
    html += `<div class="note mb">
      <p class="note-t">Not enough logged days yet</p>
      <p class="note-b">With ${a.need} days of food logged and a few weigh-ins, Guzo stops using a formula and works your expenditure out backwards from what you actually ate and what the scale did. ${a.have} of ${a.need} so far.${a.implausible ? ' The current numbers give an implausible answer, which usually means some days are only partly logged.' : ''}</p>
    </div>`;
  }

  if (e) {
    html += `<div class="card">
      <div class="eyebrow">The formula</div>
      ${e.bmr ? `<div class="row between mt-s"><span class="small">Resting rate</span><span class="mono">${e.bmr} kcal</span></div>` : ''}
      <div class="row between mt-s"><span class="small">Your day job</span><span class="mono">×${activityFactor()}</span></div>
      ${e.maint ? `<div class="row between mt-s"><span class="small">Maintenance</span><span class="mono">${e.maint} kcal</span></div>` : ''}
      <div class="row between mt-s"><span class="small"><strong>Target</strong></span><span class="mono em">${e.kcal} kcal · ${e.p}g protein</span></div>
      <p class="tiny mt-s">${e.basis === 'from your resting rate'
        ? 'Mifflin-St Jeor, adjusted for how you spend the day. Accurate to about &plusmn;10% for any one person.'
        : 'Estimated from bodyweight alone &mdash; fill in your height and age and this gets considerably better.'}</p>
    </div>`;
  } else {
    html += `<button class="note" data-act="open-profile" style="width:100%;text-align:left">
      <p class="note-t">No target yet</p>
      <p class="note-b">Add your height, weight and age and Guzo can work out a real resting rate.</p>
    </button>`;
  }
  return html;
}

/* ============================================================
   THE LOGGING LOOP
   ------------------------------------------------------------
   Search → portion → log. Three taps for a food you have eaten
   before, because the fastest logger is the only one anybody
   keeps using past week two.
   ============================================================ */

/* Which face of the deck is showing. A module variable rather than saved
   state: Fuel opens on food, because that is what the screen is mostly for,
   and it holds your choice for as long as you are in the app. */
let fuelFace = 'food';

let foodQ = '';
let foodGroupOpen = null;
let portionQty = 0;
let portionFood = null;

function foodRowHTML(f, qty) {
  const q = qty != null ? qty : (f.u === 'g' || f.u === 'ml' ? f.per : 1);
  const m = scaleFood(f, q);
  return `<div class="lrow pick-row">
    <button class="grow" data-act="food-pick" data-v="${h(f.id)}" ${qty != null ? `data-q="${qty}"` : ''} style="text-align:left">
      <div class="h3" style="font-size:14.5px">${h(f.n)}</div>
      <div class="tiny mt-s">${h(portionLabel(f, q))} · ${m.kcal} kcal · ${Math.round(m.p)}g protein</div>
    </button>
    <button class="btn xs icon pick-add" data-act="food-pick" data-v="${h(f.id)}" ${qty != null ? `data-q="${qty}"` : ''} aria-label="Add ${h(f.n)}">+</button>
  </div>`;
}

function sheetFoodSearch(q) {
  if (q != null) foodQ = q;
  const query = (foodQ || '').trim();

  let body = '';

  if (query) {
    const hits = foodSearch(query);
    body = hits.length
      ? `<div class="list mb">${hits.map(f => foodRowHTML(f, null)).join('')}</div>`
      : `<div class="note mb"><p class="note-t">Nothing matches &ldquo;${h(query)}&rdquo;.</p>
         <p class="note-b">The library is deliberately small and generic &mdash; whole foods, not brands. If you eat something often, save it once and it is yours forever.</p></div>`;
  } else {
    const rec = recentFoods(8);
    if (rec.length) {
      body += `<div class="sec-head"><span class="sec-t">What you actually eat</span></div>
        <div class="list mb">${rec.map(r => foodRowHTML(r.food, r.qty)).join('')}</div>`;
    }
    const mine = customFoods();
    const groups = FOOD_GROUPS.slice();
    if (mine.length) groups.unshift({ k: 'mine', label: 'Your foods' });

    body += groups.map(g => {
      const list = g.k === 'mine' ? mine : FOODS.filter(f => f.g === g.k);
      if (!list.length) return '';
      const open = foodGroupOpen === g.k;
      return `<div class="pick-group${open ? ' open' : ''}">
        <button class="pick-head" data-act="food-group" data-v="${h(g.k)}">
          <span class="pick-dot ${g.k === 'mine' ? 'push' : foodTone(g.k)}"></span>
          <span class="grow pick-head-t">${h(g.label)}</span>
          <span class="pick-n">${list.length}</span>
          <span class="pick-chev">${open ? '⌄' : '›'}</span>
        </button>
        ${open ? `<div class="list pick-list">${list.map(f => foodRowHTML(f, null)).join('')}</div>` : ''}
      </div>`;
    }).join('');
  }

  openSheet(`
    <h2 class="h1 mb" style="padding-right:44px">Add food</h2>
    ${/* The RAW text, not the trimmed one. This sheet redraws on every
          keystroke and refills the field from its own state — so trimming here
          swallowed the space the moment you typed it, and "turkey sandwich"
          came out "turkeysandwich". Trim where you search, never where you
          echo what somebody is still typing. */''}
    <input class="input mb-s" id="food-q" placeholder="Search &mdash; chicken, oats, milk&hellip;" value="${h(foodQ || '')}"
           autocomplete="off" enterkeyhint="search" inputmode="search">
    <button class="btn ghost block mb" data-act="food-new">Save a food of your own</button>
    ${body}
  `);

  const qi = document.getElementById('food-q');
  if (qi) {
    qi.addEventListener('input', ev => {
      const v = ev.target.value;
      const pos = ev.target.selectionStart;
      foodQ = v;
      sheetFoodSearch(null);
      const n = document.getElementById('food-q');
      if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} }
    });
  }
}

/* Protein-forward colours: the groups that carry it read warm. */
function foodTone(k) {
  if (/protein|dairy|mine/.test(k)) return 'push';
  if (/carb|grain|fruit/.test(k)) return 'legs';
  if (/veg/.test(k)) return 'pull';
  return 'core';
}

/* ---------- portion ---------- */
function sheetPortion(foodId, qty) {
  const f = foodById(foodId);
  if (!f) { toast('That food has gone missing'); return; }
  portionFood = f;
  portionQty = qty != null ? qty : (f.u === 'g' || f.u === 'ml' ? (f.per || 100) : 1);
  openSheet('<div id="portion-body"></div>');
  renderPortion();
}

function renderPortion() {
  const f = portionFood;
  if (!f) return;
  const el = document.getElementById('portion-body');
  if (!el) return;

  const step = portionStep(f.u);
  const m = scaleFood(f, portionQty);
  const gram = f.u === 'g' || f.u === 'ml';
  const presets = gram ? [50, 100, 150, 200, 250] : [1, 2, 3];

  el.innerHTML = `
    <div class="row gap-s mb" style="align-items:center">
      <button class="btn xs back" data-act="fuel-search" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 19l-7-7 7-7"/></svg></button>
      <h2 class="h1 grow" style="padding-right:44px">${h(f.n)}</h2>
    </div>

    <div class="fuel-day-card mb">
      <div class="row between">
        <div>
          <div class="fuel-day-v mono">${h(portionLabel(f, portionQty))}</div>
          <div class="fuel-day-k">portion</div>
        </div>
        <div style="text-align:right">
          <div class="fuel-day-v mono">${m.kcal}</div>
          <div class="fuel-day-k">kcal</div>
        </div>
      </div>
      <div class="fuel-macros mt">
        <div class="row between"><span class="small">Protein</span><span class="mono em">${Math.round(m.p * 10) / 10}g</span></div>
        <div class="row between"><span class="small">Carbs</span><span class="mono">${Math.round(m.c * 10) / 10}g</span></div>
        <div class="row between"><span class="small">Fat</span><span class="mono">${Math.round(m.f * 10) / 10}g</span></div>
      </div>
    </div>

    <div class="row gap-s mb" style="align-items:center">
      <button class="btn icon lg" data-act="portion-adj" data-v="${-step}" aria-label="Less">−</button>
      <div class="grow" style="text-align:center">
        <div class="mono" style="font-size:26px;font-weight:700;letter-spacing:-.03em">${portionQty}</div>
        <div class="tiny">${h(unitLabel(f.u) || 'servings')}</div>
      </div>
      <button class="btn icon lg" data-act="portion-adj" data-v="${step}" aria-label="More">+</button>
    </div>

    <div class="chip-grid c3 mb">
      ${presets.map(p => `<div class="chip ${portionQty === p ? 'on' : ''}" data-act="portion-set" data-v="${p}">${p}${gram ? unitLabel(f.u) : '×'}</div>`).join('')}
    </div>

    <button class="btn primary block lg" data-act="portion-log">Log it</button>
    <p class="tiny mt-s">Per ${f.per}${gram ? unitLabel(f.u) : ' serving'}: ${f.kcal} kcal · ${f.p}p ${f.c}c ${f.f}f. Reference values, not a brand&rsquo;s label &mdash; close enough to steer by, not a measurement.</p>
  `;
}

/* ---------- editing what is already down ---------- */
function sheetEntryEdit(entryId) {
  const k = fuelDay();
  const e = nutDay(k).items.find(x => x.id === entryId);
  if (!e) { closeSheet(); return; }
  const f = e.foodId ? foodById(e.foodId) : null;
  const step = f ? portionStep(f.u) : 1;

  openSheet(`
    <div class="row between mb"><h2 class="h1">${h(e.n)}</h2></div>

    <div class="fuel-day-card mb">
      <div class="fuel-4">
        ${[['kcal', e.kcal], ['protein', Math.round(e.p) + 'g'],
           ['carbs', Math.round(e.c) + 'g'], ['fat', Math.round(e.f) + 'g']]
          .map(([kk, v]) => `<div><div class="fuel-day-v mono">${v}</div>
            <div class="fuel-day-k">${kk}</div></div>`).join('')}
      </div>
    </div>

    ${f ? `<div class="row gap-s mb" style="align-items:center">
      <button class="btn icon lg" data-act="entry-adj" data-v="${h(entryId)}" data-d="${-step}" aria-label="Less">&minus;</button>
      <div class="grow" style="text-align:center">
        <div class="mono" style="font-size:26px;font-weight:700;letter-spacing:-.03em">${e.qty || 1}</div>
        <div class="tiny">${h(unitLabel(e.u) || 'servings')}</div>
      </div>
      <button class="btn icon lg" data-act="entry-adj" data-v="${h(entryId)}" data-d="${step}" aria-label="More">+</button>
    </div>` : ''}

    <div class="label mb-s">Which meal</div>
    <div class="chip-grid c4 mb">
      ${MEALS.map(m => `<div class="chip ${(e.m || 's') === m.id ? 'on' : ''}"
        data-act="entry-meal" data-v="${h(entryId)}" data-m="${m.id}">${h(m.n)}</div>`).join('')}
    </div>

    ${/* The numbers themselves, editable. Before this the only control on this
          sheet was how many servings — so a food whose macros were wrong was
          wrong forever, and every total built on it was wrong with it. */''}
    <div class="divide"></div>
    <div class="label mb-s">The numbers, for this one</div>
    <div class="row gap-s mb">
      <div class="field grow"><div class="label">kcal</div>
        <input class="input" id="ee-kcal" type="number" inputmode="numeric" value="${e.kcal}"></div>
      <div class="field grow"><div class="label">Protein</div>
        <input class="input" id="ee-p" type="number" inputmode="decimal" value="${e.p}"></div>
    </div>
    <div class="row gap-s mb">
      <div class="field grow"><div class="label">Carbs</div>
        <input class="input" id="ee-c" type="number" inputmode="decimal" value="${e.c}"></div>
      <div class="field grow"><div class="label">Fat</div>
        <input class="input" id="ee-f" type="number" inputmode="decimal" value="${e.f}"></div>
    </div>
    <button class="btn block" data-act="entry-macros" data-v="${h(entryId)}">Save these numbers</button>
    <p class="tiny mt-s">Changes this entry only. ${f
      ? 'To correct the food itself so every future one is right, use the button below.'
      : 'This entry is not linked to a food.'}</p>

    ${f && !f.custom ? `<button class="btn ghost block mt" data-act="fix-food" data-v="${h(f.id)}">
      Fix ${h(f.n)} for good${f.fixed ? ' &middot; corrected' : ''}</button>` : ''}

    <div class="divide"></div>
    <button class="btn quiet block" data-act="entry-del" data-v="${h(entryId)}" style="color:var(--rose)">Remove from the day</button>
  `, { key: 'entry:' + entryId });
}

/* ------------------------------------------------------------
   Correcting a built-in food, once, for good.
   ------------------------------------------------------------
   The catalogue's whey is a reasonable average and is not your tub. This says
   what a serving of yours actually is — including what counts as a serving,
   because "1 scoop" and "1 serving" are rarely the same thing. */
function sheetFixFood(foodId) {
  const base = FOODS.find(x => x.id === foodId);
  if (!base) { closeSheet(); return; }
  const cur = foodById(foodId);
  const uL = unitLabel(base.u) || '';
  const perLabel = base.u === 'ea' ? 'items per serving'
                 : base.u === 'scoop' ? 'scoops per serving'
                 : base.u === 'slice' ? 'slices per serving'
                 : `${uL} per serving`;

  openSheet(`
    <div class="row between mb"><h2 class="h1">${h(base.n)}</h2></div>
    <p class="small mb">Read the numbers off your packet. From now on this food logs with yours
      instead of the catalogue's, everywhere in the app.</p>

    <div class="field mb">
      <div class="label">${h(perLabel)}</div>
      <input class="input" id="ff-per" type="number" inputmode="decimal" value="${cur.per}">
    </div>
    <p class="tiny mb">Everything below describes that much of it.</p>

    <div class="row gap-s mb">
      <div class="field grow"><div class="label">kcal</div>
        <input class="input" id="ff-kcal" type="number" inputmode="numeric" value="${cur.kcal}"></div>
      <div class="field grow"><div class="label">Protein</div>
        <input class="input" id="ff-p" type="number" inputmode="decimal" value="${cur.p}"></div>
    </div>
    <div class="row gap-s mb">
      <div class="field grow"><div class="label">Carbs</div>
        <input class="input" id="ff-c" type="number" inputmode="decimal" value="${cur.c}"></div>
      <div class="field grow"><div class="label">Fat</div>
        <input class="input" id="ff-f" type="number" inputmode="decimal" value="${cur.f}"></div>
    </div>

    <button class="btn primary block lg" data-act="ff-save" data-v="${h(foodId)}">Save it</button>
    ${cur.fixed ? `<button class="btn quiet block mt-s" data-act="ff-reset" data-v="${h(foodId)}">
      Back to the catalogue's ${h(base.kcal)} kcal</button>` : ''}
    <p class="tiny center mt-s">Meals you have already logged keep the numbers they were logged with
      &mdash; that is what you ate.</p>
  `, { key: 'fixfood:' + foodId });
}

/* Bare macros, no food behind them. */
function sheetQuickAdd() {
  openSheet(`
    <div class="row between mb"><h2 class="h1">Quick add</h2></div>
    <p class="small mb">For the meal you will never log again &mdash; a restaurant, someone else's
      cooking, the thing on the craft table. Put in what you know and leave the rest.</p>
    <div class="field mb"><div class="label">Call it</div>
      <input class="input" id="qa-n" placeholder="Lunch on set" autocomplete="off"></div>
    <div class="row gap-s mb">
      <div class="field grow"><div class="label">kcal</div>
        <input class="input" id="qa-kcal" type="number" inputmode="numeric"></div>
      <div class="field grow"><div class="label">Protein</div>
        <input class="input" id="qa-p" type="number" inputmode="decimal"></div>
    </div>
    <div class="row gap-s mb">
      <div class="field grow"><div class="label">Carbs</div>
        <input class="input" id="qa-c" type="number" inputmode="decimal"></div>
      <div class="field grow"><div class="label">Fat</div>
        <input class="input" id="qa-f" type="number" inputmode="decimal"></div>
    </div>
    <button class="btn primary block lg" data-act="qa-save">Add it to the day</button>
    <p class="tiny center mt-s">A rough number you actually log beats an exact one you do not.</p>
  `, { key: 'quickadd' });
}

/* ---------- your own foods ---------- */
function sheetNewFood() {
  window._nfUnit = window._nfUnit || 'ea';
  const u = window._nfUnit;
  openSheet(`
    <div class="row gap-s mb" style="align-items:center">
      <button class="btn xs back" data-act="fuel-search" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 19l-7-7 7-7"/></svg></button>
      <h2 class="h1 grow" style="padding-right:44px">New food</h2>
    </div>
    <div class="field mb"><div class="label">What is it</div>
      <input class="input" id="nf-n" placeholder="Crew burrito" autocomplete="off"></div>

    <div class="label mb-s">Measured in</div>
    <div class="chip-grid c3 mb">
      <div class="chip ${u==='ea'?'on':''}" id="nf-u-ea" data-act="nf-unit" data-v="ea">Each</div>
      <div class="chip ${u==='g'?'on':''}" id="nf-u-g" data-act="nf-unit" data-v="g">Per 100g</div>
      <div class="chip ${u==='ml'?'on':''}" id="nf-u-ml" data-act="nf-unit" data-v="ml">Per 100ml</div>
    </div>

    <div class="row gap-s mb">
      <div class="field grow"><div class="label">kcal</div><input class="input" id="nf-kcal" type="number" inputmode="numeric"></div>
      <div class="field grow"><div class="label">Protein</div><input class="input" id="nf-p" type="number" inputmode="decimal"></div>
    </div>
    <div class="row gap-s mb">
      <div class="field grow"><div class="label">Carbs</div><input class="input" id="nf-c" type="number" inputmode="decimal"></div>
      <div class="field grow"><div class="label">Fat</div><input class="input" id="nf-f" type="number" inputmode="decimal"></div>
    </div>

    <button class="btn primary block" data-act="nf-save">Save and log it</button>
    <p class="tiny mt-s">Copy the numbers off the packet. Saved foods stay on this device and appear in search from now on.</p>
  `);
}

/* ---------- copy a day ---------- */
function sheetCopyDay() {
  const k = fuelDay();
  const cands = [];
  for (let i = 1; i <= 14; i++) {
    const d = dk(addDays(today(), -i));
    if (d === k) continue;
    const kc = intakeOn(d);
    if (kc != null) cands.push({ d, kcal: kc, n: nutDay(d).items.length });
  }

  openSheet(`
    <div class="row between mb"><h2 class="h1">Copy a day</h2></div>
    ${cands.length ? `<p class="small mb">Everything from that day gets added to ${k === today() ? 'today' : prettyDate(k)}. Nothing is replaced.</p>
      <div class="list">${cands.map(c => `<button class="lrow" data-act="fuel-copy-from" data-v="${c.d}" style="width:100%;text-align:left">
        <div class="grow">
          <div class="h3" style="font-size:14.5px">${prettyDate(c.d)}</div>
          <div class="tiny mt-s">${c.n} item${c.n === 1 ? '' : 's'} · ${c.kcal} kcal</div>
        </div><span class="chev">›</span>
      </button>`).join('')}</div>`
    : `<div class="note"><p class="note-t">No earlier days to copy from yet.</p>
       <p class="note-b">Once a fortnight of days is on record this becomes the fastest way to log a repeat.</p></div>`}
  `);
}

/* ---------- targets ---------- */
function sheetNutTargets() {
  const e = energyTargets();
  const tg = S.nutrition.targets || {};
  const a = adaptiveTdee(21);
  const pOnly = proteinOnly();
  const kg = bodyKg();
  const pTarget = proteinTarget();

  const row = (label, field, val, suffix) => `<div class="mb">
    <div class="row between mb-s"><span class="small">${label}</span><span class="mono em">${val}${suffix}</span></div>
    <div class="row gap-s">
      <button class="btn grow" data-act="nut-target-adj" data-f="${field}" data-v="${field === 'kcal' ? -50 : -5}">−</button>
      <button class="btn grow" data-act="nut-target-adj" data-f="${field}" data-v="${field === 'kcal' ? 50 : 5}">+</button>
    </div>
  </div>`;

  openSheet(`
    <h2 class="h1 mb">Targets and settings</h2>

    ${a && a.ready ? `<div class="card accent mb">
      <div class="eyebrow em">Measured expenditure</div>
      <div class="row between mt-s"><span class="small">From your own ${a.days} days</span><span class="mono em">${a.tdee} kcal</span></div>
      <button class="btn block mt-s" data-act="nut-target-measured">Set my target from this</button>
    </div>` : ''}

    ${!pOnly ? `<div class="card mb">
      <div class="eyebrow mb-s">Daily targets</div>
      ${row('Calories', 'kcal', (tg.kcal || (e && e.kcal) || 0), ' kcal')}
      ${row('Protein', 'p', (pTarget || 0), 'g')}
      ${row('Carbs', 'c', (tg.c || (e && e.c) || 0), 'g')}
      ${row('Fat', 'f', (tg.f || (e && e.f) || 0), 'g')}
      ${e ? `<button class="btn quiet block" data-act="nut-target-reset">Back to what Guzo worked out</button>` : ''}
    </div>` : `<div class="card mb">
      <div class="eyebrow mb-s">Daily protein target</div>
      ${row('Protein', 'p', (pTarget || 0), 'g')}
      ${kg ? `<p class="tiny">That is ${Math.round((pTarget || 0) / kg * 100) / 100} g per kg of you. Morton and colleagues, pooling 49 studies, put the point where extra protein stops adding anything at about 1.6 &mdash; with the confidence interval reaching 2.2.</p>` : ''}
    </div>`}

    <button class="lrow" data-act="toggle-protein-only" style="width:100%;text-align:left">
      <div class="grow">
        <div class="h3" style="font-size:14.5px">Protein only</div>
        <div class="tiny mt-s">Hide calorie figures everywhere and track protein alone. Everything carries on being recorded &mdash; it just stops being shown.</div>
      </div>
      <div class="switch ${pOnly ? "on" : ""}"></div>
    </button>

    <button class="btn quiet block mt" data-act="open-profile">Height, weight and age</button>
  `, { key: 'nut-targets' });
}


/* ---------- how you eat ----------
   The same questions the onboarding asks, reachable forever after. Fuel can
   be switched on long after onboarding — from the More screen — and someone
   who did that has never been asked any of this. */
function sheetDietPrefs() {
  const p = dietPrefs();
  const seg = (act, vals, cur) => `<div class="seg">${vals.map(x =>
    `<button class="${cur === x ? 'on' : ''}" data-act="${act}" data-v="${x}">${x}</button>`).join('')}</div>`;

  const gaps = bodyGaps ? bodyGaps() : [];
  openSheet(`
    <div class="row between mb">
      <h2 class="h1">How you eat</h2>
      <button class="btn xs quiet" data-act="close">Done</button>
    </div>
    <p class="small mb">This shapes what gets suggested. It never limits what you can log — whatever you actually ate can always be recorded.</p>

    ${gaps.length ? `<div class="banner soft mb">Your calorie target is estimated from bodyweight alone. Adding ${gaps.join(' and ')} in Profile makes it meaningfully better.</div>` : ''}

    <div class="label mb-s">Proper meals a day</div>
    ${seg('diet-meals', [2,3,4,5], p.meals)}

    <div class="label mt mb-s">Snacks on top</div>
    ${seg('diet-snacks', [0,1,2,3], p.snacks)}

    <div class="label mt-l mb-s">Pattern</div>
    <div class="opts mb">
      ${DIET_PATTERNS.map(d => opt({ act:'diet-pattern', v:d.k, on:p.pattern === d.k,
                                     title:d.label, desc:d.note })).join('')}
    </div>

    <div class="label mt mb-s">Leave out</div>
    <div class="chips mb">
      ${EXCLUSIONS.map(x => `<button class="chip ${p.exclude.includes(x.k) ? 'on' : ''}"
         data-act="diet-exclude" data-v="${x.k}">${x.label}</button>`).join('')}
    </div>

    <p class="tiny">${allowedFoods(p).length} of ${FOODS.length} foods pass these. Guzo is not an allergen database — these are generic reference foods, not products with labels. If something matters medically, read the packet.</p>
  `, { key: 'diet-prefs' });
}
/* ============================================================
   THE BOTTLE
   ------------------------------------------------------------
   A hiking flask that fills as you drink, because a progress bar for water is
   a progress bar and a bottle is a thing you recognise from across a room.

   Everything in it is drawn from one number — millilitres logged against the
   day's goal. The waterline sits at that fraction of the inside of the
   bottle, so a half-full bottle is genuinely half, and the graduations down
   the side are real fractions of the goal rather than decoration.
   ============================================================ */

/* The inside of the flask, in the SVG's own units. The fill is clipped to
   this, so the liquid takes the bottle's shape at the shoulders instead of
   being a rectangle behind it. */
const BOTTLE_TOP = 30, BOTTLE_BOT = 172;

function bottleHTML(k) {
  const ml = waterOn(k);
  const g = waterGoal(k);
  const frac = g.total > 0 ? Math.max(0, Math.min(1, ml / g.total)) : 0;
  const over = g.total > 0 && ml > g.total;
  /* The waterline, in SVG units. Two wave crests ride on it — the same y, so
     the surface stays level and only its edge moves. */
  const y = BOTTLE_BOT - frac * (BOTTLE_BOT - BOTTLE_TOP);

  return `<div class="wtr-card">
    <div class="wtr-head">
      <div>
        <div class="eyebrow">Water</div>
        <div class="wtr-v mono">${fmtWater(ml)}<span class="wtr-of">of ${fmtWater(g.total)}</span></div>
      </div>
      <button class="wtr-set" data-act="water-settings" aria-label="Water target and units">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1 1.56V21a2 2 0 11-4 0v-.09A1.7 1.7 0 008 19.4a1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.7 1.7 0 003.6 15a1.7 1.7 0 00-1.56-1H2a2 2 0 110-4h.09A1.7 1.7 0 004.6 8a1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06A1.7 1.7 0 009 3.6a1.7 1.7 0 001-1.56V2a2 2 0 114 0v.09a1.7 1.7 0 001 1.56 1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06A1.7 1.7 0 0019.4 9v0a1.7 1.7 0 001.56 1H21a2 2 0 110 4h-.09a1.7 1.7 0 00-1.56 1z"/></svg>
      </button>
    </div>

    <div class="wtr-body">
      <div class="wtr-bottle ${over ? 'over' : ''}">
        <svg viewBox="0 0 120 200" role="img"
             aria-label="${fmtWater(ml)} of ${fmtWater(g.total)} logged today">
          <defs>
            ${/* The liquid is clipped to the flask's inside, so it takes the
                  shoulder taper rather than sitting behind a rectangle. */''}
            <clipPath id="wtr-clip">
              <path d="M40 30 h40 a6 6 0 016 6 v6 c0 8 8 12 8 26 v92 a12 12 0 01-12 12 h-44 a12 12 0 01-12-12 v-92 c0-14 8-18 8-26 v-6 a6 6 0 016-6 z"/>
            </clipPath>
            <linearGradient id="wtr-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#7ec8f2" stop-opacity=".95"/>
              <stop offset="100%" stop-color="#3f8fd0" stop-opacity=".95"/>
            </linearGradient>
          </defs>

          ${/* Cap and collar, above the fill so nothing ever paints over them. */''}
          <rect class="wtr-cap" x="42" y="6" width="36" height="16" rx="5"/>
          <rect class="wtr-collar" x="46" y="21" width="28" height="8" rx="3"/>

          <g clip-path="url(#wtr-clip)">
            <rect class="wtr-inside" x="20" y="24" width="80" height="180"/>
            <g class="wtr-liquid" style="transform:translateY(${y.toFixed(1)}px)">
              ${/* Drawn from y=0 downward and then translated, so the whole
                    body of liquid moves as one and the transition animates the
                    level rather than redrawing a path. */''}
              <path class="wtr-wave" d="M-60 0 q15 -6 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 t30 0 v210 h-240 z" fill="url(#wtr-fill)"/>
            </g>
          </g>

          ${/* Graduations: real fractions of today's goal, not tick marks. */''}
          ${[0.25, 0.5, 0.75].map(f => {
            const gy = BOTTLE_BOT - f * (BOTTLE_BOT - BOTTLE_TOP);
            return `<line class="wtr-grad" x1="72" y1="${gy.toFixed(1)}" x2="88" y2="${gy.toFixed(1)}"/>`;
          }).join('')}

          <path class="wtr-glass" d="M40 30 h40 a6 6 0 016 6 v6 c0 8 8 12 8 26 v92 a12 12 0 01-12 12 h-44 a12 12 0 01-12-12 v-92 c0-14 8-18 8-26 v-6 a6 6 0 016-6 z"/>
          ${/* The strap loop. It is what makes it a flask you take somewhere
                rather than a glass on a desk. */''}
          <path class="wtr-strap" d="M86 40 q16 4 16 16 q0 12 -12 16"/>
        </svg>
      </div>

      <div class="wtr-side">
        <div class="wtr-pct mono">${waterPct(k)}<span class="wtr-pct-s">%</span></div>
        <div class="wtr-note">${h(waterNote(k, g))}</div>
        ${waterStreakHTML()}
      </div>
    </div>

    <div class="wtr-pours">
      ${waterPours().map(p => `<button class="wtr-pour" data-act="water-add" data-v="${Math.round(p.ml)}">
        <span class="wtr-pour-i" aria-hidden="true">${p.label === 'Glass' ? glassIcon() : p.label === 'Bottle' ? bottleIcon() : flaskIcon()}</span>
        <span class="wtr-pour-l">${h(p.label)}</span>
        <span class="wtr-pour-s">${h(p.sub)}</span>
      </button>`).join('')}
      <button class="wtr-pour custom" data-act="water-custom">
        <span class="wtr-pour-i" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 6v12M6 12h12"/></svg>
        </span>
        <span class="wtr-pour-l">Other</span>
        <span class="wtr-pour-s">amount</span>
      </button>
    </div>

    ${ml > 0 ? `<button class="wtr-undo" data-act="water-clear">Clear today</button>` : ''}

    <div class="wtr-week">
      ${waterWeek().map(d => `<div class="wtr-wk ${d.met ? 'met' : ''} ${d.d === today() ? 'today' : ''}">
        <div class="wtr-wk-t"><i style="height:${d.goal ? Math.min(100, Math.round(d.ml / d.goal * 100)) : 0}%"></i></div>
        <div class="wtr-wk-d">${DAYNAMES[fromKey(d.d).getDay()].slice(0, 1)}</div>
      </div>`).join('')}
    </div>
  </div>`;
}

/* Why the number is what it is, in one line, and what it is not. */
function waterNote(k, g) {
  const bw = (S.profile.bodyweight || []).slice(-1)[0];
  const parts = [];
  if (S.nutrition.water && +S.nutrition.water.goal > 0) parts.push('Your target');
  /* Said in the unit you are reading. "33 ml per kg" on a screen showing
     ounces is a rule of thumb you cannot apply. Half an ounce per pound is the
     same figure — 33 ml/kg works out at 0.51 — and it is the version anyone
     using ounces has already heard. */
  else if (bw && +bw.w > 0) parts.push(waterUnit() === 'oz'
    ? 'About half an ounce per pound'
    : 'About ' + WATER_ML_PER_KG + ' ml per kg');
  else parts.push('A flat estimate — log a bodyweight and it scales');
  if (g.bonus > 0) parts.push(`+${fmtWater(g.bonus)} for ${g.mins} min trained`);
  return parts.join(' · ');
}

/* The streak, in the app's voice. See waterStreak(): today cannot break it,
   and a break is not announced. */
function waterStreakHTML() {
  const n = waterStreak();
  const best = noteWaterBest();
  if (!n && !best) {
    return `<div class="wtr-streak none">Hit the target and a run starts here.</div>`;
  }
  if (!n) {
    /* Broken, and said without a word of blame. The best is still yours. */
    return `<div class="wtr-streak"><span class="wtr-streak-n mono">0</span>
      <span class="wtr-streak-l">days &mdash; your best is ${best}</span></div>`;
  }
  return `<div class="wtr-streak on"><span class="wtr-streak-n mono">${n}</span>
    <span class="wtr-streak-l">day${n === 1 ? '' : 's'} running${best > n ? ` &mdash; best ${best}` : ''}</span></div>`;
}

function glassIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10l-1.3 15.2A2 2 0 0113.7 21h-3.4a2 2 0 01-2-1.8z"/><path d="M7.6 11h8.8" stroke-width="1.4"/></svg>`;
}
function bottleIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2h4v3c0 1.6 2 2.4 2 5v11a2 2 0 01-2 2h-4a2 2 0 01-2-2V10c0-2.6 2-3.4 2-5z"/><path d="M8 13h8" stroke-width="1.4"/></svg>`;
}
function flaskIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="6" width="10" height="16" rx="3"/><path d="M9.5 2h5v4h-5z"/><path d="M17 9q3 1 3 4t-3 4" stroke-width="1.4"/></svg>`;
}

/* An amount that is not a glass, a bottle or a flask. */
function sheetWaterCustom() {
  openSheet(`
    <h2 class="h1 mb" style="padding-right:44px">Add water</h2>
    <div class="field mb">
      <div class="label">How much (${h(waterUnitLabel())})</div>
      <input class="input" id="wtr-amt" type="text" inputmode="decimal" enterkeyhint="done"
             autocomplete="off" placeholder="${waterUnit() === 'oz' ? '12' : '400'}">
    </div>
    <button class="btn primary block lg" data-act="water-custom-go">Add</button>
  `);
  const el = $('#wtr-amt'); if (el) el.focus();
}

/* The target, and what it is made of. The estimate is explained rather than
   asserted — it is a rule of thumb, and a number you cannot argue with is a
   number you cannot trust. */
function sheetWaterGoal() {
  const g = waterGoal(today());
  const set = +((S.nutrition.water || {}).goal) > 0;
  const shown = waterUnit() === 'oz'
    ? Math.round(mlToUnit(g.base))
    : Math.round(g.base);
  openSheet(`
    <h2 class="h1 mb" style="padding-right:44px">Water target</h2>

    <div class="note mb">
      <p class="note-t">Where the number comes from</p>
      <p class="note-b">About 33 ml of drinks per kilo of bodyweight a day &mdash; the middle of the
        30&ndash;35 range that gets quoted &mdash; plus roughly ${fmtWater(WATER_ML_PER_TRAINING_HOUR)} for every hour you
        train. Food carries a fifth to a third of your total water and this target does not try to
        count it, so it is a drinks figure and sits deliberately at the low end. It is a rule of
        thumb, not a prescription. Thirst and the colour of your urine are better signals than any
        formula, and if you have a kidney or heart condition your doctor's number beats this one.</p>
    </div>

    <div class="field mb">
      <div class="label">Daily base (${h(waterUnitLabel())})</div>
      <input class="input" id="wtr-goal" type="text" inputmode="decimal" enterkeyhint="done"
             autocomplete="off" value="${set ? shown : ''}" placeholder="${shown}">
      <p class="tiny mt-s">${set
        ? 'Yours. Clear the field to go back to the estimate.'
        : 'Empty means the estimate above, which moves with your bodyweight.'}
        Training is added on top either way &mdash; today that is
        ${g.bonus > 0 ? fmtWater(g.bonus) + ' for ' + g.mins + ' minutes' : 'nothing yet'}.</p>
    </div>

    <div class="field mb">
      <div class="label">Units</div>
      <p class="tiny">Shown in ${waterUnit() === 'oz' ? 'US fluid ounces' : 'millilitres and litres'},
        following your weight unit &mdash; change that in your profile and this follows.
        Everything is stored in millilitres underneath, so switching never alters a logged day.</p>
    </div>

    <button class="btn primary block lg" data-act="water-goal-go">Save</button>
  `);
}

/* ------------------------------------------------------------
   Updated in place, never by re-rendering.

   Two reasons, and the second is the one that bites. A renderFuel() on every
   glass rebuilds the whole screen under your thumb — but worse, it replaces
   the liquid with a *new* element, and a new element has no previous transform
   to transition from, so the level jumps instead of rising. The animation that
   is the entire point of drawing a bottle only exists if the same node is
   still there to move. Same rule as the Train rail.
   ------------------------------------------------------------ */
function refreshWater() {
  const card = document.querySelector('.wtr-card');
  if (!card) return;
  const k = fuelDay();
  const ml = waterOn(k);
  const g = waterGoal(k);
  const frac = g.total > 0 ? Math.max(0, Math.min(1, ml / g.total)) : 0;

  const v = card.querySelector('.wtr-v');
  if (v) v.innerHTML = `${fmtWater(ml)}<span class="wtr-of">of ${fmtWater(g.total)}</span>`;

  const liq = card.querySelector('.wtr-liquid');
  if (liq) liq.style.transform = `translateY(${(BOTTLE_BOT - frac * (BOTTLE_BOT - BOTTLE_TOP)).toFixed(1)}px)`;

  const bottle = card.querySelector('.wtr-bottle');
  if (bottle) bottle.classList.toggle('over', g.total > 0 && ml > g.total);

  const pct = card.querySelector('.wtr-pct');
  if (pct) pct.innerHTML = `${waterPct(k)}<span class="wtr-pct-s">%</span>`;

  const streak = card.querySelector('.wtr-streak');
  if (streak) streak.outerHTML = waterStreakHTML();

  /* Today's column in the strip, and whether it has been met. */
  const week = waterWeek();
  card.querySelectorAll('.wtr-wk').forEach((node, i) => {
    const d = week[i];
    if (!d) return;
    const fill = node.querySelector('.wtr-wk-t i');
    if (fill) fill.style.height = (d.goal ? Math.min(100, Math.round(d.ml / d.goal * 100)) : 0) + '%';
    node.classList.toggle('met', d.met);
  });

  /* The clear button exists only when there is something to clear. */
  const clr = card.querySelector('.wtr-undo');
  if (ml > 0 && !clr) {
    const btn = document.createElement('button');
    btn.className = 'wtr-undo';
    btn.setAttribute('data-act', 'water-clear');
    btn.textContent = 'Clear today';
    const pours = card.querySelector('.wtr-pours');
    if (pours) pours.insertAdjacentElement('afterend', btn);
  } else if (ml === 0 && clr) {
    clr.remove();
  }
}

/* ------------------------------------------------------------
   The deck.

   Switched in place rather than by re-rendering, for the same reason the
   bottle is: a re-render would replace the liquid and the level would snap
   instead of rising. It also means the switch is a transform, which is free.
   ------------------------------------------------------------ */
function setFuelFace(face, opts) {
  if (face !== 'food' && face !== 'water') return;
  fuelFace = face;
  const deck = document.querySelector('.deck');
  if (!deck) return;
  deck.dataset.face = face;
  deck.querySelectorAll('.deck-tab').forEach(b => {
    const on = b.dataset.v === face;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  deck.querySelectorAll('.deck-face').forEach(f => {
    const on = f.classList.contains(face);
    f.classList.toggle('on', on);
    /* Not just hidden — the face behind cannot be tapped or tabbed into. */
    if (on) f.removeAttribute('inert'); else f.setAttribute('inert', '');
  });
  sizeFuelDeck();
  if (!opts || !opts.silent) buzz(8);
}

/* The viewport takes the height of the face in front of it, so the shorter of
   the two never leaves a band of dead space under it — which is most of what
   made the stacked version feel clumsy. Measured rather than guessed, and
   skipped entirely when the screen is not on: an offsetHeight of 0 is a hidden
   screen, and writing it would collapse the card. */
function sizeFuelDeck() {
  const vp = document.querySelector('.deck-vp');
  const face = document.querySelector('.deck-face.on');
  if (!vp || !face) return;
  const h = face.offsetHeight;
  if (!h) return;
  vp.style.height = h + 'px';
}

/* Swipe between the faces. The same shape as the week strip's: a gesture that
   scrolled the screen was a scroll whatever its geometry, and a slow drag is
   someone holding the page rather than flicking it. */
(function fuelDeckSwipe() {
  let x0 = null, y0 = null, t0 = 0, scroll0 = 0, on = false;
  const SLOP = 44;
  const scroller = () => document.getElementById('s-' + SCREEN);

  document.addEventListener('touchstart', e => {
    on = !!(e.target.closest && e.target.closest('.deck'));
    if (!on) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    t0 = Date.now();
    const sc = scroller();
    scroll0 = sc ? sc.scrollTop : 0;
  }, { passive: true });

  document.addEventListener('touchend', e => {
    const wasOn = on; on = false;
    const t = e.changedTouches && e.changedTouches[0];
    const sx = x0, sy = y0, st = t0, s0 = scroll0;
    x0 = y0 = null;
    if (!wasOn || sx == null || !t) return;
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) < SLOP || Math.abs(dx) <= Math.abs(dy)) return;
    const sc = scroller();
    if (sc && Math.abs(sc.scrollTop - s0) > 4) return;
    if (Date.now() - st > 700) return;
    const next = dx < 0 ? 'water' : 'food';
    if (next === fuelFace) return;
    requestAnimationFrame(() => setFuelFace(next));
  }, { passive: true });
})();
