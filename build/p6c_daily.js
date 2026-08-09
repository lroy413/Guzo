/* ============================================================
   DAILY METRICS — interface
   ============================================================ */

/* The strip on Today. Three numbers, no rings, no targets, no red.
   A blank field reads as "not known", never as "you failed to". */
function dayStripHTML() {
  const d = dailyToday() || {};
  const st = d.steps || null;
  const sl = d.sleepH || null;
  const bw = bodyKg() != null && (S.profile.bodyweight || []).length
             ? (S.profile.bodyweight[S.profile.bodyweight.length - 1].w) : null;
  const read = st ? stepsRead(st) : null;

  const cell = (val, key, dim) => `
    <div class="day-cell">
      <div class="day-v ${val == null ? 'empty' : ''}">${val == null ? '—' : val}${dim ? `<span class="day-u">${dim}</span>` : ''}</div>
      <div class="day-k">${key}</div>
    </div>`;

  return `<button class="day-strip" data-act="daily">
    ${cell(st != null ? fmtSteps(st) : null, 'Steps')}
    ${cell(sl != null ? sl : null, 'Sleep', 'h')}
    ${cell(bw != null ? bw : null, 'Weight', ' ' + unit())}
    <div class="day-note">${read ? h(read.t) : 'Tap to log the day around it'}</div>
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
