/* ============================================================
   DAILY METRICS — interface
   ============================================================ */

/* The strip on Today. Three numbers, no rings, no targets, no red.
   A blank field reads as "not known", never as "you failed to". */
function dayStripHTML() {
  const d = dailyToday() || {};
  const st = d.steps || null;
  const sl = d.sleepH || null;
  const bwLog = S.profile.bodyweight || [];
  const bw = bwLog.length ? bwLog[bwLog.length - 1].w : null;
  const read = st ? stepsRead(st) : null;

  /* Seven days of it, as bars rather than a line. Bars need no aspect-ratio
     gymnastics at this size, a missing day is a visible stub rather than a
     gap the line jumps over, and the app already speaks in bars on Fuel. */
  const bars = (field) => {
    const series = daySeries(field, 7);
    const vals = series.map(p => p.v).filter(v => v != null);
    /* Scaled between the week's own low and high rather than from zero, and
       floored well clear of the bottom.

       That is deliberately a *shape*, not a magnitude: seven days of bodyweight
       within a kilo of each other drawn from zero is a flat line saying
       nothing, and drawn from its own low would say your weight halved. The
       high floor is what keeps it readable as "which days were bigger" without
       inviting anyone to read a ratio off it. The number above it is the
       magnitude. */
    const hi = vals.length ? Math.max.apply(null, vals) : 0;
    const lo = vals.length ? Math.min.apply(null, vals) : 0;
    const span = (hi - lo) || hi || 1;
    return `<div class="dm-bars" aria-hidden="true">${series.map((p, i) => {
      const last = i === series.length - 1;
      if (p.v == null) return `<i class="none"></i>`;
      const pct = Math.round(45 + ((p.v - lo) / span) * 55);
      return `<i class="${last ? 'now' : ''}" style="height:${pct}%"></i>`;
    }).join('')}</div>`;
  };

  /* Every row is its own fixed-height band, so the three columns line up
     whatever combination of them you have filled in. The first version let
     each column size itself and an unlogged Steps pushed its label 65px below
     the other two — see .day-v.empty in docs/status.md. */
  /* The label carries the icon rather than a row of its own above it. Three
     em-dashes over three uppercase words was the whole strip before anything
     was logged, and it is a third of the height of the tallest thing on the
     screen — the icons are what make it read as three different things rather
     than as three empty boxes. */
  const cell = (val, unitLbl, key, field, icon) => `
    <div class="dm-cell">
      <div class="dm-v${val == null ? ' none' : ''}">${val == null ? '&mdash;' : val
        }${val != null && unitLbl ? `<span class="dm-u">${unitLbl}</span>` : ''}</div>
      <div class="dm-k"><span class="dm-i">${icon}</span>${key}</div>
      ${bars(field)}
    </div>`;

  return `<button class="dm" data-act="daily">
    <div class="dm-row">
      ${cell(st != null ? fmtSteps(st) : null, '', 'Steps', 'steps', ICO['car-walk'])}
      ${cell(sl != null ? sl : null, 'h', 'Sleep', 'sleepH', ICO.moon)}
      ${cell(bw != null ? fmtW(bw) : null, unit(), 'Weight', 'weight', ICO.ruler)}
    </div>
    <div class="dm-note">${read ? h(read.t) : 'Tap to log the day around it'}</div>
  </button>`;
}

/* ---------- the sheet ---------- */
function sheetDaily(date) {
  const d = date || today();
  const rec = dailyOn(d) || {};
  const isToday = d === today();

  const srcChip = f => {
    const s = rec.src && rec.src[f];
    if (!s || rec[f] == null) return '';
    return `<span class="src-chip">${SRC_LABEL[s] || s}</span>`;
  };

  const field = (f, label, hint, step) => `
    <div class="field mt">
      <div class="row between">
        <div class="label">${label} ${srcChip(f)}</div>
        <div class="tiny">${hint}</div>
      </div>
      <input class="input mono" type="number" inputmode="decimal" step="${step}"
             id="dm-${f}" data-dm="${f}" data-date="${d}"
             value="${rec[f] != null ? rec[f] : ''}" placeholder="—">
    </div>`;

  const days = stepDays(7);
  const vals = days.map(x => x.v).filter(Boolean);
  const base = stepsBaseline();

  openSheet(`
    <div class="row between mb">
      <h2 class="h1">The day around it</h2>
    </div>
    <p class="small mb">Steps, sleep and bodyweight for ${isToday ? 'today' : h(prettyDate(d))}. None of this changes your programme &mdash; it is being collected so that one day it can be tested against your own training instead of somebody's assumption.</p>

    ${field('steps', 'Steps', 'whole number', '1')}
    ${field('sleepH', 'Sleep', 'hours', '0.5')}
    ${field('bw', 'Bodyweight', unit(), '0.1')}

    <button class="btn block mt-l" data-act="daily-paste">
      Paste from Shortcut
    </button>
    <p class="tiny center mt-s">Run your Health shortcut, then tap this. iOS will ask before sharing the clipboard &mdash; that prompt is the system, not Guzo.</p>

    ${vals.length >= 3 ? `
      <div class="card flat mt-l">
        <div class="eyebrow mb-s">Last seven days</div>
        ${sparkHTML(days.map(x => x.v || 0))}
        <div class="row between mt-s">
          <div class="tiny">${base ? 'Your usual: ' + fmtSteps(base) : ''}</div>
          <div class="tiny">${vals.length} of 7 days logged</div>
        </div>
      </div>` : ''}

    <button class="btn ghost block mt" data-act="help-open" data-v="shortcut">How to set up the shortcut</button>
  `);
}

/* ---------- readiness prefill ----------
   If sleep is already known for today, the check-in should not ask
   again. It shows the number it has, says where it came from, and
   lets you overrule it — a sensor that disagrees with you about
   your own night should lose. */
function sleepPrefill() {
  const s = sleepOn(today());
  if (s == null) return null;
  const rec = dailyToday();
  return { h: s, src: (rec.src && rec.src.sleepH) || 'manual' };
}

/* ============================================================
   PLATE CALCULATOR
   ============================================================ */

/* A plate drawn to roughly the proportions of the real thing: taller
   for heavier, and coloured the way a competition plate is, so the
   stack is readable at arm's length without reading any numbers. */
function plateStackHTML(perSide, unitKey) {
  const cols = PLATE_COLOUR[unitKey] || {};
  const max = perSide.length ? Math.max(...perSide.map(p => p.w)) : 1;
  let html = '<div class="plate-stack"><div class="plate-sleeve"></div>';
  perSide.forEach(p => {
    for (let i = 0; i < p.n; i++) {
      const hgt = 34 + Math.round((p.w / max) * 52);
      const wide = p.w >= max * 0.5 ? 15 : 11;
      html += `<div class="plate" style="height:${hgt}px;width:${wide}px;background:${cols[p.w] || '#8b95a1'}"></div>`;
    }
  });
  html += '<div class="plate-collar"></div></div>';
  return html;
}

function sheetPlateCalc(target) {
  const t = parseFloat(target);
  const r = platesFor(t);
  const cfg = plateCfg();
  const u = cfg.unit;

  if (!r) { toast('No weight to work from'); return; }

  let body;
  if (r.impossible) {
    body = `<div class="card accent center mt">
      <p class="small">${fmtP(t)}${u} is less than the bar on its own (${fmtP(r.bar)}${u}).</p>
      <p class="tiny mt-s">Use a lighter bar, or the dumbbell version of this movement.</p>
    </div>`;
  } else if (r.barOnly || !r.perSide.length) {
    body = `<div class="card accent center mt"><p class="h2">Just the bar</p>
      <p class="small mt-s">${fmtP(r.bar)}${u}, nothing on the sleeves.</p></div>`;
  } else {
    body = `
      <div class="plate-figure">${plateStackHTML(r.perSide, u)}</div>
      <div class="plate-list mt">
        ${r.perSide.map(p => `<div class="plate-row">
          <span class="plate-dot" style="background:${(PLATE_COLOUR[u] || {})[p.w] || '#8b95a1'}"></span>
          <span class="grow">${fmtP(p.w)}${u}</span>
          <span class="mono">× ${p.n}</span>
        </div>`).join('')}
        <div class="plate-row total">
          <span class="grow">Each side</span>
          <span class="mono">${fmtP((r.achieved - r.bar) / 2)}${u}</span>
        </div>
        <div class="plate-row">
          <span class="grow">Bar</span>
          <span class="mono">${fmtP(r.bar)}${u}</span>
        </div>
      </div>
      ${!r.exact ? `<div class="banner warm mt">
        Closest you can load is <strong>${fmtP(r.achieved)}${u}</strong> &mdash;
        ${r.short > 0 ? fmtP(Math.abs(r.short)) + u + ' under' : fmtP(Math.abs(r.short)) + u + ' over'} the target.
        Take it; the difference is smaller than day-to-day variation.
      </div>` : ''}`;
  }

  openSheet(`
    <div class="center">
      <div class="eyebrow">Load the bar</div>
      <div class="plate-total mono">${fmtP(r.impossible ? t : r.achieved)}<span class="plate-unit">${u}</span></div>
    </div>
    ${body}
    <button class="btn ghost block mt-l" data-act="plate-settings">Bar and plates</button>
  `);
}

function sheetPlateSettings() {
  const cfg = plateCfg();
  const u = cfg.unit;
  const all = (PLATE_DEFAULTS[u] || PLATE_DEFAULTS.kg).plates
    .concat(u === 'kg' ? [0.5] : [])
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => b - a);

  openSheet(`
    <h2 class="h1">Bar and plates</h2>
    <p class="small mt-s mb">What you actually have to work with. The calculator only ever suggests plates you have ticked.</p>

    <div class="field">
      <div class="row between"><div class="label">Bar weight</div><div class="tiny mono">${fmtP(cfg.bar)} ${u}</div></div>
      <div class="stepper">
        <button data-act="bar-adj" data-v="${u === 'kg' ? -2.5 : -5}">&minus;</button>
        <input type="text" value="${fmtP(cfg.bar)}" readonly>
        <button data-act="bar-adj" data-v="${u === 'kg' ? 2.5 : 5}">+</button>
      </div>
      <p class="tiny mt-s">Standard Olympic bars are ${u === 'kg' ? '20kg; women\’s bars are 15kg' : '45lb; women\’s bars are 35lb'}. Fixed and hotel bars vary &mdash; weigh yours once.</p>
    </div>

    <div class="eyebrow mt-l mb-s">Plates on hand</div>
    <div class="plate-picker">
      ${all.map(w => {
        const on = cfg.plates.indexOf(w) >= 0;
        return `<button class="plate-chip ${on ? 'on' : ''}" data-act="plate-toggle" data-v="${w}">
          <span class="plate-dot" style="background:${(PLATE_COLOUR[u] || {})[w] || '#8b95a1'}"></span>${fmtP(w)}
        </button>`;
      }).join('')}
    </div>
    <p class="tiny mt">Pairs are assumed &mdash; a ticked plate means you have at least two.</p>
  `);
}
