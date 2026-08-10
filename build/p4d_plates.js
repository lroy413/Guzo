/* ============================================================
   PLATE MATHS & LAST-TIME RECALL
   ------------------------------------------------------------
   Two small things that a logger is judged on, both of which
   exist to stop you doing arithmetic while holding a bar.
   ============================================================ */

/* Plate weights need two decimals — fmtW rounds to one, which turns a
   1.25kg change plate into "1.3" and has you reaching for the wrong one. */
function fmtP(w) {
  if (w == null || isNaN(w)) return '—';
  return String(Math.round(w * 100) / 100);
}

/* ---------- what's on the rack ---------- */
const PLATE_DEFAULTS = {
  kg: { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] },
  lb: { bar: 45, plates: [45, 35, 25, 10, 5, 2.5] }
};

/* Competition colours where they exist, because a red plate reads
   faster than the number printed on it. The lb set has no agreed
   standard, so it borrows the nearest kg equivalent. */
const PLATE_COLOUR = {
  kg: { 25:'#d94f4f', 20:'#4a7fd4', 15:'#e0c04a', 10:'#4fb372', 5:'#d8dde3', 2.5:'#b7452f', 1.25:'#9aa4b0', 0.5:'#7d8894' },
  lb: { 45:'#4a7fd4', 35:'#e0c04a', 25:'#4fb372', 10:'#d8dde3', 5:'#4a7fd4', 2.5:'#b7452f' }
};

function plateCfg() {
  const u = unit();
  const d = PLATE_DEFAULTS[u] || PLATE_DEFAULTS.kg;
  const s = S.settings || {};
  const bar = s['bar' + u.toUpperCase()];
  const plates = s['plates' + u.toUpperCase()];
  return {
    unit: u,
    bar: typeof bar === 'number' && bar >= 0 ? bar : d.bar,
    plates: Array.isArray(plates) && plates.length ? plates.slice().sort((a, b) => b - a) : d.plates,
    defaults: d
  };
}

function setBarWeight(w) {
  const n = parseFloat(w);
  if (isNaN(n) || n < 0 || n > 60) return false;
  S.settings['bar' + unit().toUpperCase()] = Math.round(n * 100) / 100;
  save(true);
  return true;
}

function togglePlate(w) {
  const cfg = plateCfg();
  const key = 'plates' + cfg.unit.toUpperCase();
  const cur = (S.settings[key] || cfg.defaults.plates).slice();
  const i = cur.indexOf(w);
  if (i >= 0) { if (cur.length <= 1) return false; cur.splice(i, 1); }
  else cur.push(w);
  S.settings[key] = cur.sort((a, b) => b - a);
  save(true);
  return true;
}

/* ---------- the maths ----------
   Greedy from the heaviest plate down. With any real plate set that is
   optimal, and where it cannot land exactly it reports the gap rather
   than rounding silently — being told "2.5 short" is useful; being
   quietly handed the wrong weight is not. */
function platesFor(total) {
  const cfg = plateCfg();
  const t = parseFloat(total);
  if (isNaN(t)) return null;
  if (t < cfg.bar - 0.001) return { impossible: true, bar: cfg.bar, target: t, unit: cfg.unit };
  if (Math.abs(t - cfg.bar) < 0.001) return { barOnly: true, bar: cfg.bar, target: t, achieved: cfg.bar, exact: true, perSide: [], unit: cfg.unit };

  let perSideLeft = (t - cfg.bar) / 2;
  const used = [];
  cfg.plates.forEach(pw => {
    const n = Math.floor((perSideLeft + 1e-6) / pw);
    if (n > 0) { used.push({ w: pw, n }); perSideLeft -= n * pw; }
  });
  const loaded = used.reduce((a, p) => a + p.w * p.n, 0);
  const achieved = cfg.bar + loaded * 2;
  return {
    bar: cfg.bar, target: t, perSide: used, unit: cfg.unit,
    achieved: Math.round(achieved * 100) / 100,
    exact: Math.abs(achieved - t) < 0.001,
    short: Math.round((t - achieved) * 100) / 100
  };
}

/* "20 + 10 + 2.5" — the line you read at the rack. */
function plateLine(total) {
  const r = platesFor(total);
  if (!r || r.impossible) return null;
  if (r.barOnly || !r.perSide.length) return 'bar only';
  return r.perSide.map(p => (p.n > 1 ? p.n + '×' + fmtP(p.w) : fmtP(p.w))).join(' + ');
}

/* Only barbell work loads plates. A dumbbell press showing a plate
   breakdown would be noise, and a machine one would be wrong. */
function usesPlates(exId) {
  const ex = EX[exId];
  return !!(ex && ex.eq === 'Barbell');
}

/* ============================================================
   LAST TIME
   ------------------------------------------------------------
   Read straight out of the session history rather than a separate
   store, so it works retroactively on everything already logged
   and can never drift out of step with what actually happened.
   ============================================================ */
function lastPerformance(exId, beforeDate) {
  const list = S.sessions || [];
  if (!exId) return null;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    if (!s.ended) continue;
    if (beforeDate && s.date >= beforeDate) continue;
    const item = (s.exercises || []).find(x => x.exId === exId);
    if (!item) continue;
    const sets = item.sets.filter(x => x.done);
    if (!sets.length) continue;
    /* Clamped here rather than inside daysBetween: an age is never negative,
       but the shared helper has to stay signed for everything else. */
    return { date: s.date, sets, daysAgo: Math.max(0, daysBetween(s.date, today())) };
  }
  return null;
}

/* Defensive on purpose: this runs inside the render path for every card on
   the training screen. One malformed date in the history should cost you a
   "last time" line, not the whole session. */
function agoLabel(days) {
  if (days <= 0) return 'earlier today';
  if (days === 1) return 'yesterday';
  if (days < 7) return days + ' days ago';
  if (days < 14) return 'last week';
  if (days < 60) return Math.round(days / 7) + ' weeks ago';
  return Math.round(days / 30) + ' months ago';
}

/* "82.5×8, 82.5×8, 80×6" — trimmed so it never wraps onto a third line. */
function lastLine(exId, maxSets) {
  let p = null;
  try { p = lastPerformance(exId); } catch (e) { return null; }
  if (!p) return null;
  const cap = maxSets || 4;
  const parts = p.sets.slice(0, cap).map(s => {
    const w = (+s.w > 0) ? fmtW(+s.w) : '';
    const r = s.r !== '' && s.r != null ? s.r : '–';
    return w ? w + '×' + r : String(r);
  });
  const extra = p.sets.length - parts.length;
  return { text: parts.join(', ') + (extra > 0 ? ' +' + extra : ''), ago: agoLabel(p.daysAgo), date: p.date };
}

/* The set you did in this slot last time, for the per-row hint. */
function prevSets(exId) {
  let p = null;
  try { p = lastPerformance(exId); } catch (e) { return []; }
  return (p && p.sets) || [];
}
function lastSetAt(exId, idx) {
  return prevSets(exId)[idx] || null;
}

/* ------------------------------------------------------------
   What an empty set row shows, and what ticking it records.
   ------------------------------------------------------------
   One flat "Last: 82.5×8, 82.5×8, 80×6" above the card made you parse a list
   and count along it to find the row you were on. The row itself should just
   say it. But the moment a placeholder shows a number, ticking the set has to
   record *that* number — a row that offers 82.5 and logs the 80 sitting in
   targetW is worse than a blank row, because you will not notice.

   So the answer is resolved once, here, and the render, the live carry-down
   and `toggle-set` all read it. Same reason supFor() is computed rather than
   passed: three call sites that can disagree eventually will.

   Precedence: what you are lifting today, then what you lifted last time,
   then the prescription. Values come back raw — never through fmtW — because
   the caller that stores them must not round 1.25 into 1.3. */
function ghostFor(item, si, prev) {
  prev = prev || prevSets(item.exId);
  const out = { w:'', r:'', src:'' };
  const first = item.sets && item.sets[0];

  /* Carry-down. Once set 1 is filled in, the sets under it are almost always
     the same weight, and last week stops being the better guess. */
  if (si > 0 && first) {
    if (first.w !== '' && first.w != null) { out.w = first.w; out.src = 'carry'; }
    if (first.r !== '' && first.r != null) { out.r = first.r; out.src = 'carry'; }
  }

  const p = prev[si];
  if (out.w === '' && p && +p.w > 0) { out.w = +p.w; out.src = out.src || 'last'; }
  if (out.r === '' && p && p.r !== '' && p.r != null) { out.r = p.r; out.src = out.src || 'last'; }

  if (out.w === '' && item.targetW != null && item.targetW !== '') {
    out.w = item.targetW; out.src = out.src || 'target';
  }
  if (out.r === '' && item.targetR) { out.r = item.targetR; out.src = out.src || 'target'; }
  return out;
}

/* The same value as the row paints it. Bodyweight work shows 0 rather than a
   dash, because 0 added is a real answer there and a dash is not. */
function ghostW(item, g) {
  if (g.w === '' || g.w == null) return item.load === 'bw' ? '0' : '–';
  return fmtW(+g.w);
}
