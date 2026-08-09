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

  html += `<div class="fuel-day-card">
    <div class="row between">
      <div>
        <div class="fuel-day-v mono">${pOnly ? Math.round(t.p) + 'g' : t.kcal}</div>
        <div class="fuel-day-k">${pOnly ? 'protein' : 'kcal'}${(pOnly ? pTarget : kcalTarget) ? ' of ' + (pOnly ? pTarget + 'g' : kcalTarget) : ''}</div>
      </div>
      ${burned && !pOnly ? `<div class="fuel-burn"><span class="mono em">+${burned}</span><span class="fuel-day-k">burned training</span></div>` : ''}
    </div>
    <div class="bar mt"><i style="width:${pctOf(pOnly ? t.p : t.kcal, pOnly ? pTarget : kcalTarget)}%"></i></div>
    ${!pOnly ? `<div class="fuel-macros mt">
      ${[['Protein', t.p, pTarget, 'teal'], ['Carbs', t.c, tg.c || (e && e.c) || 0, ''], ['Fat', t.f, tg.f || (e && e.f) || 0, '']]
        .map(([label, v, target, tone]) => `<div class="fuel-macro">
          <div class="row between"><span class="small">${label}</span><span class="tiny mono">${Math.round(v)}g${target ? ' / ' + target + 'g' : ''}</span></div>
          <div class="bar thin ${tone} mt-s"><i style="width:${pctOf(v, target)}%"></i></div>
        </div>`).join('')}
    </div>` : `<p class="tiny mt">Calories are switched off. Protein is the number with the strongest evidence behind it for building muscle &mdash; everything else is being logged, just not shown.</p>`}
  </div>`;

  /* ── add ─────────────────────────────────────────────────── */
  html += `<div class="fuel-actions">
    <button class="btn primary block lg" data-act="fuel-search">Add food</button>
    <div class="btn-row mt-s">
      <button class="btn ghost grow" data-act="fuel-quick-sheet">Recent</button>
      <button class="btn ghost grow" data-act="fuel-copy">Copy a day</button>
    </div>
  </div>`;

  /* ── what's logged ───────────────────────────────────────── */
  const items = nutDay(k).items;
  if (items.length) {
    html += `<div class="sec-head"><span class="sec-t">Logged</span><span class="tiny">${items.length} item${items.length===1?'':'s'}</span></div>
      <div class="list mb">
        ${items.map(it => `<button class="lrow" data-act="fuel-edit" data-v="${h(it.id)}" style="width:100%;text-align:left">
          <div class="grow">
            <div class="h3" style="font-size:14.5px">${h(it.n)}</div>
            <div class="tiny mt-s">${it.qty ? h(String(it.qty)) + (unitLabel(it.u) || '×') + ' · ' : ''}${pOnly ? Math.round(it.p) + 'g protein' : it.kcal + ' kcal · ' + Math.round(it.p) + 'p ' + Math.round(it.c) + 'c ' + Math.round(it.f) + 'f'}</div>
          </div>
          <span class="chev">›</span>
        </button>`).join('')}
      </div>`;
  } else {
    html += `<div class="note mb"><p class="note-t">Nothing logged ${isToday ? 'yet today' : 'that day'}.</p><p class="note-b">A week with four honest days on it is worth more than a week with seven guessed ones.</p></div>`;
  }

  /* ── where the target comes from ─────────────────────────── */
  html += energyPanelHTML(e, pOnly);

  html += `<button class="btn quiet block mt" data-act="open-nut-targets">Targets and settings</button>`;

  const el = document.getElementById('fuel-body');
  if (el) el.innerHTML = html;
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
    <input class="input mb-s" id="food-q" placeholder="Search &mdash; chicken, oats, milk&hellip;" value="${h(query)}"
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
      <div class="row between">
        <div><div class="fuel-day-v mono">${e.kcal}</div><div class="fuel-day-k">kcal</div></div>
        <div style="text-align:right"><div class="fuel-day-v mono">${Math.round(e.p)}g</div><div class="fuel-day-k">protein</div></div>
      </div>
    </div>
    <div class="row gap-s mb" style="align-items:center">
      <button class="btn icon lg" data-act="entry-adj" data-v="${h(entryId)}" data-d="${-step}" aria-label="Less">−</button>
      <div class="grow" style="text-align:center">
        <div class="mono" style="font-size:26px;font-weight:700;letter-spacing:-.03em">${e.qty || 1}</div>
        <div class="tiny">${h(unitLabel(e.u) || 'servings')}</div>
      </div>
      <button class="btn icon lg" data-act="entry-adj" data-v="${h(entryId)}" data-d="${step}" aria-label="More">+</button>
    </div>
    <button class="btn block" data-act="close">Done</button>
    <button class="btn quiet block mt-s" data-act="entry-del" data-v="${h(entryId)}">Remove from the day</button>
  `);
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
  `);
}

