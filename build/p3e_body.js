/* ============================================================
   THE BODY
   ------------------------------------------------------------
   A figure you can point at. Front and back, male and female, with every
   muscle group the stretch catalogue targets drawn as its own shape.

   WHY IT IS DATA AND NOT A PICTURE

   The obvious way to do this is a traced illustration, and it is the wrong way
   twice over. A raster would be the first binary asset in a file that has
   never had one and would need a second copy for every view, sex and screen
   density. A traced SVG would be one frozen drawing — you could not change
   the proportions, could not light a region by how hard you trained it, and
   could not tell the male figure from the female one without drawing both from
   scratch.

   So the anatomy is authored as *points*, exactly as p3c_form.js authors its
   form diagrams as four joints and solves the rest. Every region is a short
   list of coordinates on a 100 × 240 grid, smoothed into a closed path at
   render time. Which means:

   - **One anatomy, two bodies.** The male/female difference is four numbers —
     the horizontal scale at the shoulder, waist, hip and thigh — applied to
     every point as it is emitted. Not a second drawing.
   - **One half, drawn once.** Everything left of centre is the right half
     mirrored, so the figure cannot come out lopsided and the data is halved.
   - **Regions are addressable.** A muscle is a named shape, so it can be lit,
     dimmed, tapped, or coloured by seven days of training volume.

   WHAT IT IS NOT

   It is not an anatomy plate. Nothing here is labelled in Latin, the fibre
   directions are indicative rather than accurate, and the ten regions are the
   ten the app already reasons about — see STRETCH_REGIONS — not the six
   hundred a body has. A diagram that names more than the app can act on is a
   poster, not a control.
   ============================================================ */

/* A 7.5-head figure on a 132 x 240 grid, centre line at x = 66. The first
   version was 100 wide and every proportion in it was wrong for the same
   reason: with the arms hanging clear of the body — which they must, because
   biceps and triceps are two of the ten regions and neither is reachable on a
   figure with its arms pinned to its sides — a realistic shoulder span does not
   fit in a box as wide as the body is at the hip. Head height is 32, shoulders
   are two head-heights across, the crotch is at four heads and the knee at
   five and a half. */
const BODY_W = 132, BODY_H = 240, BODY_CX = 66;

/* The four numbers. Male is the base the points were authored against; the
   female figure is the same anatomy through a different set of widths —
   narrower at the shoulder, a little narrower at the waist, wider at the hip.
   `na` sits between them rather than defaulting to either, which is the same
   answer the energy equation gives that choice. */
const BODY_SHAPE = {
  m:  { shoulder: 1,    waist: 1,    hip: 1,    thigh: 1    },
  f:  { shoulder: 0.88, waist: 0.90, hip: 1.15, thigh: 1.07 },
  na: { shoulder: 0.95, waist: 0.96, hip: 1.06, thigh: 1.03 }
};

/* Where those numbers apply, and how they blend between. A point at the waist
   takes the waist scale; one halfway to the hip takes half of each. Authored
   as a ramp rather than as bands, because a step would put a visible kink in
   the silhouette at every boundary. */
const BODY_BANDS = [
  { y: 0,   k: 'shoulder' },
  { y: 56,  k: 'shoulder' },
  { y: 100, k: 'waist'    },
  { y: 120, k: 'hip'      },
  { y: 152, k: 'thigh'    },
  { y: 240, k: 'thigh'    }
];

function bodyScaleAt(y, shape) {
  for (let i = 0; i < BODY_BANDS.length - 1; i++) {
    const a = BODY_BANDS[i], b = BODY_BANDS[i + 1];
    if (y >= a.y && y <= b.y) {
      const t = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y);
      return shape[a.k] + (shape[b.k] - shape[a.k]) * t;
    }
  }
  return 1;
}

/* One point, through the shape. x is measured from the centre line so the
   scale is a widening rather than a slide. */
function bodyPt(p, shape, flip) {
  const s = bodyScaleAt(p[1], shape);
  const dx = (p[0] - BODY_CX) * s;
  return [BODY_CX + (flip ? -dx : dx), p[1]];
}

/* Points to a closed path, rounded.
   ---------------------------------
   Catmull-Rom converted to cubic Bézier: the curve passes through every
   authored point, which is what makes a coordinate list editable by hand — a
   B-spline would only be *pulled towards* them and moving one point would move
   the shape somewhere else. Tension is low; muscles are blobby and the points
   are dense enough that a tighter curve would only add wobble. */
function bodyPath(pts, shape, flip, open) {
  const p = pts.map(q => bodyPt(q, shape, flip));
  const n = p.length;
  if (n < 3) return '';
  const at = i => open ? p[Math.max(0, Math.min(n - 1, i))] : p[(i + n) % n];
  let d = `M${p[0][0].toFixed(2)} ${p[0][1].toFixed(2)}`;
  const last = open ? n - 1 : n;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d + (open ? '' : 'Z');
}

/* ------------------------------------------------------------
   THE SILHOUETTE

   The right half only, head-top to crotch, mirrored to close. Standing, arms
   hanging a little clear of the body so the upper arm is its own shape rather
   than a bump on the torso — which matters, because biceps and triceps are two
   of the ten regions and neither is reachable on a figure with its arms
   pinned to its sides.
   ------------------------------------------------------------ */
const BODY_OUTLINE = [
  [66, 0.4], [73.4, 2.6], [78, 11.4], [77, 22.4], [73.4, 29.4],       // skull
  [71, 33.4],                                                         // under the jaw
  [71.4, 38.4], [71.8, 44.4],                                         // neck
  [74.4, 45.6], [79.4, 47.4], [85.4, 50.4], [91, 53.8],                // trapezius slope
  [95.4, 57.4], [97.6, 65.4], [97.8, 76.4],                           // deltoid cap
  [99, 88.4], [99.6, 100.4],                                          // upper arm to elbow
  [100.4, 114.4], [100.8, 128.4],                                     // forearm
  [99.8, 137.4],                                                      // wrist
  [102.2, 146.4], [102, 155.4], [99, 160.4], [94, 159.4], [92, 150.4], // hand
  [92.2, 137.4], [91.6, 123.4], [91, 109.4],                          // forearm, inner
  [90.4, 100.4], [89.8, 86.4], [89.2, 76.4],                          // upper arm, inner
  [87.2, 70.4],                                                       // the armpit apex
  [85.4, 78.4], [84.4, 90.4], [83.2, 101.4],                          // ribs to waist
  [84.6, 110.4], [87, 119.4],                                         // iliac crest
  [88.4, 129.4],                                                      // hip to thigh
  [86.6, 151.4], [82, 169.4],                                         // thigh
  [79.6, 177.4],                                                      // knee
  [79.4, 189.4], [78, 201.4],                                         // calf
  [75, 215.4], [73.4, 226.4],                                         // ankle
  [75.6, 233.4], [80.4, 238.4], [80, 240], [69.4, 240],               // foot
  [69.6, 228.4], [70, 215.4],                                         // inner ankle
  [69.8, 201.4], [69.6, 187.4],                                       // inner calf
  [69.6, 177.4], [69.2, 167.4], [68.2, 151.4], [67, 137.4],           // inner thigh
  [66, 129.4]                                                         // crotch
];

/* Regions. Each is a name from the app's own ten, a view, and a shape.
   `both` means the group is drawn once per side and mirrored.

   Every one of these sits *inside* the silhouette at the same y. That is the
   constraint that took the most getting right: the ribcage is a good deal
   narrower than the shoulders, so a pectoral authored to the shoulder's width
   hangs in mid-air beside the body — which is exactly what the first version
   did, and it read as a rendering fault rather than as bad anatomy.
   ------------------------------------------------------------ */
const BODY_REGIONS = {
  front: [
    { m: 'Shoulders', both: true, pts: [
      [80.4, 49.4], [87.4, 51.6], [93.4, 56.4], [96.8, 65.4], [96.8, 77.4],
      [92.4, 81.4], [88.4, 74.4], [86.4, 64.4], [82.4, 54.4] ] },
    { m: 'Chest', both: true, pts: [
      [67, 52.4], [76.4, 53.4], [83.4, 56.4], [86.4, 63.4], [85.6, 71.4],
      [80.4, 77.4], [72.4, 77.4], [67, 74.4] ] },
    /* Narrower than the ribcage it sits in. The first version was as wide as
       the torso at every height, which drew a belly rather than a midsection —
       obliques taper in towards the hip and the silhouette does the work of
       saying where the body ends. */
    { m: 'Core', both: true, pts: [
      [67, 80.4], [74.4, 81.4], [79.6, 87.4], [80.4, 98.4], [78.4, 110.4],
      [73.4, 119.4], [67, 121.4] ] },
    { m: 'Biceps', both: true, pts: [
      [89.2, 77.4], [94.6, 81.4], [97.6, 91.4], [98.4, 100.4], [95, 104.4],
      [91, 100.4], [89.2, 88.4] ] },
    { m: 'Quads', both: true, pts: [
      [67.4, 134.4], [75.4, 132.4], [85, 134.4], [86.2, 144.4], [83.6, 160.4],
      [79, 172.4], [73, 172.4], [69.8, 159.4], [67.8, 146.4] ] },
    /* The front of the shin. The catalogue calls this Calves and the app has
       one muscle for both sides of the lower leg; drawing a tibialis that
       could not be tapped for a calf stretch would be pedantry with a hit box
       on it. */
    { m: 'Calves', both: true, pts: [
      [70.2, 180.4], [77, 182.4], [79.2, 192.4], [76.4, 207.4], [73.8, 216.4],
      [70.6, 210.4], [69.4, 193.4] ] }
  ],
  back: [
    { m: 'Shoulders', both: true, pts: [
      [80.4, 49.4], [87.4, 51.6], [93.4, 56.4], [96.8, 65.4], [96.8, 77.4],
      [92.4, 81.4], [88.4, 74.4], [86.4, 64.4], [82.4, 54.4] ] },
    /* Traps, lats and the lower back are one shape, because the app has one
       muscle called Back and a diagram that offers three where the engine
       reasons about one is a diagram that cannot be acted on. */
    { m: 'Back', both: true, pts: [
      [67, 46.4], [77.4, 49.4], [85.4, 54.4], [87.4, 64.4], [86, 76.4],
      [84.6, 89.4], [83.2, 101.4], [80.4, 112.4], [74.4, 119.4], [67, 121.4] ] },
    { m: 'Triceps', both: true, pts: [
      [89.2, 77.4], [95, 81.4], [98.4, 92.4], [99.4, 101.4], [95.8, 105.4],
      [91.2, 101.4], [89.2, 88.4] ] },
    { m: 'Glutes', both: true, pts: [
      [67, 120.4], [76, 118.4], [85, 122.4], [87.8, 132.4], [85.6, 142.4],
      [78, 146.4], [69, 144.4], [67, 136.4] ] },
    { m: 'Hamstrings', both: true, pts: [
      [68.4, 150.4], [77, 149.4], [85, 152.4], [83.2, 162.4], [80.6, 172.4],
      [77, 176.4], [72, 173.4], [69.2, 162.4] ] },
    { m: 'Calves', both: true, pts: [
      [69.4, 179.4], [77.2, 181.4], [79.4, 191.4], [76.6, 206.4], [73.6, 216.4],
      [70.2, 209.4], [68.8, 192.4] ] }
  ]
};

/* The lines that make it read as a body rather than as a set of blobs — a
   sternum, a spine, the line under the knee. Decorative, and therefore never
   tappable and never counted as a region. */
const BODY_DETAIL = {
  front: [
    { pts: [[66, 56.4], [66, 76.4]] },
    { pts: [[66, 80.4], [66, 122.4]] },
    { pts: [[67.4, 90.4], [78.4, 91.4]], mirror: true },
    { pts: [[67.4, 100.4], [79.4, 101.4]], mirror: true },
    { pts: [[67.4, 110.4], [77.4, 110.4]], mirror: true },
    { pts: [[70.6, 177.4], [78.6, 177.4]], mirror: true },
    { pts: [[71.4, 33.4], [74.4, 38.4], [80.4, 47.4]], mirror: true }
  ],
  back: [
    { pts: [[66, 47.4], [66, 120.4]] },
    { pts: [[68.4, 63.4], [83.4, 56.4]], mirror: true },
    { pts: [[68.4, 78.4], [84.6, 70.4]], mirror: true },
    { pts: [[70.6, 177.4], [78.6, 177.4]], mirror: true }
  ]
};

/* ------------------------------------------------------------
   THE JOINTS

   A different layer on the same figure, because the eight things the stretch
   setup asks about — shoulder, elbow, wrist, neck, lower back, hip, knee,
   ankle — are *joints*, and a joint is a place rather than a shape. Drawing
   them as muscle regions would have put "wrist" over the forearm and "lower
   back" over the glutes, which is not where either of them hurts.

   They are the keys of INJURIES, so what you point at here is the same
   vocabulary the profile, the exclusions and STRETCH_AREA_MUSCLES already
   speak. `mid` marks the two that sit on the centre line and are therefore
   drawn once rather than mirrored.
   ------------------------------------------------------------ */
const BODY_JOINTS = {
  front: [
    { k: 'neck',     x: 66,   y: 40.4, mid: true },
    { k: 'shoulder', x: 91.4, y: 61.4 },
    { k: 'elbow',    x: 94.8, y: 100.4 },
    { k: 'wrist',    x: 96.4, y: 138.4 },
    { k: 'lowback',  x: 66,   y: 108.4, mid: true },
    { k: 'hip',      x: 82.4, y: 122.4 },
    { k: 'knee',     x: 74.6, y: 177.4 },
    { k: 'ankle',    x: 72,   y: 221.4 }
  ],
  back: [
    { k: 'neck',     x: 66,   y: 40.4, mid: true },
    { k: 'shoulder', x: 91.4, y: 61.4 },
    { k: 'elbow',    x: 94.8, y: 100.4 },
    { k: 'wrist',    x: 96.4, y: 138.4 },
    { k: 'lowback',  x: 66,   y: 106.4, mid: true },
    { k: 'hip',      x: 82.4, y: 122.4 },
    { k: 'knee',     x: 74.6, y: 177.4 },
    { k: 'ankle',    x: 72,   y: 221.4 }
  ]
};

/* The whole figure, as markup.
   ---------------------------
   `lit` maps a muscle name to 0..1 — how much of the horizon it owns, in the
   same sense the range on Train uses. `sel` is the one you have chosen. Both
   are optional: with neither, this is a plain anatomical figure. */
function bodyFigureHTML(opts) {
  const o = opts || {};
  const view = o.view === 'back' ? 'back' : 'front';
  const shape = BODY_SHAPE[o.sex] || BODY_SHAPE.na;
  const lit = o.lit || {};
  const regions = BODY_REGIONS[view];

  const half = bodyPath(BODY_OUTLINE, shape, false, true);
  const otherHalf = bodyPath(BODY_OUTLINE.slice().reverse(), shape, true, true);
  /* One closed path rather than two mirrored halves: two would put a seam
     down the centre line where the strokes meet, and no stroke colour hides a
     seam on a figure that is meant to read as one body. */
  const outline = half + otherHalf.replace(/^M[^C]*/, '') + 'Z';

  let shapes = '', hits = '';
  regions.forEach((r, i) => {
    const sides = r.both ? [false, true] : [false];
    sides.forEach(flip => {
      const d = bodyPath(r.pts, shape, flip);
      const v = Math.max(0, Math.min(1, +lit[r.m] || 0));
      const on = o.sel === r.m ? ' on' : '';
      shapes += `<path class="bd-m${on}" data-m="${h(r.m)}" style="${
        v ? `--lit:${v.toFixed(2)}` : ''}" d="${d}"/>`;
      /* The same shape again, invisible, with a fat transparent stroke and
         pointer-events:all — which makes fill and stroke hittable whether or
         not either is painted. That is what turns a 22px-wide biceps into a
         34px target without drawing a 34px biceps. It is not enough on its
         own; see bodyPick() for the part that catches the misses. */
      hits += `<path class="bd-hit" data-act="body-pick" data-v="${h(r.m)}"
        role="button" tabindex="0" aria-label="${h(r.m)}" d="${d}"/>`;
    });
  });

  /* The joint layer, when the figure is being used to point at what hurts
     rather than at what to stretch. The muscles stay drawn underneath and
     stay dimmed — they are the anatomy the joint sits in, not a second set of
     targets, so they are not hittable in this mode. */
  let joints = '';
  if (o.mode === 'joints') {
    const picked = o.picked || [];
    (BODY_JOINTS[view] || []).forEach(j => {
      (j.mid ? [false] : [false, true]).forEach(flip => {
        const q = bodyPt([j.x, j.y], shape, flip);
        const on = picked.indexOf(j.k) >= 0;
        const lab = (typeof INJURIES !== 'undefined' && INJURIES[j.k] ? INJURIES[j.k].label : j.k);
        joints += `<g class="bd-j${on ? ' on' : ''}" data-act="body-joint" data-v="${h(j.k)}"
            role="button" tabindex="0" aria-pressed="${on ? 'true' : 'false'}"
            aria-label="${h(lab)}${on ? ', flagged' : ''}">
          ${/* The ring is 4.4 units and the target is 16 — a joint marker big
                enough to tap accurately would be a marker too big to place
                accurately, so the two are separated the same way the session
                rail separates its 5px band from its 44px button. Sixteen is
                the smallest radius that clears 44px at the width the sheet
                gives the figure, and it is measured rather than assumed: the
                first attempt was 13 and came out at 35. */''}
          <circle class="bd-j-t" cx="${q[0].toFixed(2)}" cy="${q[1].toFixed(2)}" r="16"/>
          <circle class="bd-j-r" cx="${q[0].toFixed(2)}" cy="${q[1].toFixed(2)}" r="4.4"/>
        </g>`;
      });
    });
  }

  let detail = '';
  BODY_DETAIL[view].forEach(l => {
    detail += `<path class="bd-d" d="${bodyPath(l.pts, shape, false, true)}"/>`;
    if (l.mirror) detail += `<path class="bd-d" d="${bodyPath(l.pts, shape, true, true)}"/>`;
  });

  return `<svg class="bd${o.mode === 'joints' ? ' joints' : ''}" viewBox="0 0 ${BODY_W} ${BODY_H}"
      data-view="${view}" data-mode="${o.mode === 'joints' ? 'joints' : 'muscles'}"
      role="group" aria-label="Body map, ${view} view">
    <path class="bd-body" d="${outline}"/>
    ${shapes}
    <g class="bd-det" aria-hidden="true">${detail}</g>
    ${o.mode === 'joints' ? joints : hits}
  </svg>`;
}

/* Which muscle a tap landed on.
   -----------------------------
   The hit paths above answer most taps. What they cannot answer is a tap
   between two regions, or on the silhouette itself — and on a figure the size
   of a phone screen that is a lot of the surface. So a miss falls through to
   the nearest region by centroid, which never returns nothing.

   Centroids are computed from the authored points rather than from the
   rendered geometry, because the rendered ones move with the sex scale and
   this has to agree with what is on screen. */
function bodyCentroids(view, sex) {
  const shape = BODY_SHAPE[sex] || BODY_SHAPE.na;
  const out = [];
  (BODY_REGIONS[view] || []).forEach(r => {
    (r.both ? [false, true] : [false]).forEach(flip => {
      let sx = 0, sy = 0;
      r.pts.forEach(p => { const q = bodyPt(p, shape, flip); sx += q[0]; sy += q[1]; });
      out.push({ m: r.m, x: sx / r.pts.length, y: sy / r.pts.length });
    });
  });
  return out;
}

function bodyJointPoints(view, sex) {
  const shape = BODY_SHAPE[sex] || BODY_SHAPE.na;
  const out = [];
  (BODY_JOINTS[view] || []).forEach(j => {
    (j.mid ? [false] : [false, true]).forEach(flip => {
      const q = bodyPt([j.x, j.y], shape, flip);
      out.push({ m: j.k, x: q[0], y: q[1] });
    });
  });
  return out;
}

/* `mode` decides the vocabulary, because the same tap on the same pixel means
   a muscle on one screen and a joint on another — and a fallback that answered
   in the wrong one would quietly flag your shoulder when you asked to stretch
   your chest. */
function bodyPick(view, sex, x, y, mode) {
  const c = mode === 'joints' ? bodyJointPoints(view, sex) : bodyCentroids(view, sex);
  if (!c.length) return null;
  let best = null, bd = Infinity;
  c.forEach(p => {
    const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
    if (d < bd) { bd = d; best = p; }
  });
  return best ? best.m : null;
}

/* Seven days of work, as a share of the busiest muscle.
   -----------------------------------------------------
   Normalised against the hardest-trained muscle rather than against a fixed
   ceiling, because there is no honest fixed ceiling: twenty sets is a heavy
   week for one person and a Tuesday for another. What the figure says is
   "this is where your week went", which is a true statement about any week,
   and not "you are 60% of the way to enough", which would be inventing a
   target the app has never had.

   Nothing at all trained returns an empty map, and the figure draws itself
   cold — which is the honest picture of a week with no sessions in it. */
function bodyHeat(days) {
  let vol = {};
  try { vol = muscleVolume(days || 7) || {}; } catch (e) { return {}; }
  const max = Math.max.apply(null, [0].concat(Object.keys(vol).map(k => vol[k] || 0)));
  if (!max) return {};
  const out = {};
  Object.keys(vol).forEach(k => { if (vol[k] > 0) out[k] = vol[k] / max; });
  return out;
}

/* Which view a muscle is actually drawn on, so tapping one on the list can
   turn the figure round to it rather than lighting nothing. */
function bodyViewOf(m) {
  return (BODY_REGIONS.front || []).some(r => r.m === m) ? 'front' : 'back';
}

/* The muscles this figure can offer, in the order they are drawn. Deduplicated
   because every region is drawn twice — once per side. */
function bodyMuscles(view) {
  const seen = [];
  (BODY_REGIONS[view] || []).forEach(r => { if (seen.indexOf(r.m) < 0) seen.push(r.m); });
  return seen;
}
