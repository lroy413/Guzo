/* ============================================================
   ICONS
   ------------------------------------------------------------
   Drawn, not typed.

   The app used emoji for its occupation chips, its body-area chips and a
   handful of list rows, and an emoji is a *font glyph the platform supplies*.
   On an iPhone that is Apple Color Emoji and it looks like the screenshots.
   On Android it is Noto Color Emoji, which draws the same code points in a
   different style, at a different weight, with different colours — 🎥 is a
   grey film camera on one and a black one on the other, 🩹 is a beige plaster
   here and a pink one there. Some of them are not in every font at all, and a
   missing glyph is a tofu box.

   None of that is a rendering nicety on these particular chips: they are the
   only thing distinguishing eight otherwise identical rows, and a set of icons
   that changes weight and palette between platforms cannot be designed around.
   So they are inline SVG on a 24-unit grid, single-stroke, `currentColor`, and
   they inherit the chip's own text colour — which also means they finally get
   darker when a chip is off and lighter when it is on, which an emoji never
   did.

   Stroked paths rather than glyphs for the arrows and marks too, for the
   reason the handbook already gives: `↑ ↓ ← ✓ ›` antialias to about half the
   contrast their colour promises at this size, pass a CSS reading and fail a
   pixel check.
   ============================================================ */

/* One helper so every icon is the same grid, the same stroke weight and the
   same join style. `extra` carries anything that has to differ — a fill, a
   second stroke width — rather than each icon re-declaring the lot. */
function svgIco(paths, extra) {
  return `<svg class="ico-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false"${extra ? ' ' + extra : ''}>${paths}</svg>`;
}

/* ------------------------------------------------------------
   TONE, AND THE MASS UNDER THE LINE

   Reported as "not enough contrasting colours" and "bland", and both halves of
   that were true for one reason: every icon in the app was a single 1.7px grey
   stroke sitting in a flat grey square. A hundred and thirty of them.

   Two changes, both applied here rather than at the hundred and thirty
   definitions — an icon set is a system and editing it one glyph at a time is
   how a system stops being one.

   **Tone.** Three colours and a neutral, assigned by what a thing *is* rather
   than to brighten the screen. Ember is the journey — terrain, milestones,
   effort, the things this app is a metaphor about. Teal is the body. Sky is
   time and motion. Amber is the small number of icons that mean "careful".
   Everything structural — gear, settings, marks, arrows — stays neutral,
   because an icon set where everything is coloured is a sticker sheet and the
   file already says so twenty lines up.

   The tone is scoped in CSS to the tile contexts (`.ico`, `.opt-ico`, `.chip`,
   `.milestone-ico`). Elsewhere an icon still inherits its parent's colour, so
   nothing that uses colour to mean *state* — a tick going teal, a warning
   going rose — is overruled by an icon insisting on its category.

   **The mass.** A filled shape under the stroke at low alpha, in the icon's own
   colour. It is what makes a drawn icon read as drawn rather than as a
   wireframe, and it costs one path. Only where the glyph has a genuine closed
   body: a chevron has no inside and filling one would be a smear.
   ------------------------------------------------------------ */
const ICO_TONE = {};
const ICO_MASS = {};

function toneIcons(tone, keys) { keys.forEach(k => { ICO_TONE[k] = tone; }); }

/* Applied after every Object.assign below has run, so a tone or a mass can be
   declared for an icon defined in any of them. The mass goes immediately after
   the opening tag, which is what puts it *under* the strokes — a `<g>` appended
   at the end would paint the fill over the line that defines the shape. */
function finishIcons() {
  Object.keys(ICO).forEach(k => {
    let svg = ICO[k];
    const m = ICO_MASS[k];
    if (m) {
      svg = svg.replace(/^(<svg[^>]*>)/,
        `$1<g class="ico-m" fill="currentColor" stroke="none">${m}</g>`);
    }
    const t = ICO_TONE[k];
    if (t) svg = svg.replace('class="ico-svg"', `class="ico-svg t-${t}"`);
    ICO[k] = svg;
  });
}

/* The figure every body-area icon is drawn on. Faint enough to read as a
   backdrop, present enough to say which way up a person is. */
const BODY_BASE =
  '<circle cx="12" cy="3.7" r="1.9"/>' +
  '<path d="M12 5.6v1.7"/>' +
  '<path d="M8.2 8.3h7.6"/>' +
  '<path d="M12 7.3v7"/>' +
  '<path d="M8.2 8.5L6 13l.3 3.7M15.8 8.5L18 13l-.3 3.7"/>' +
  '<path d="M9.4 14.2h5.2"/>' +
  '<path d="M9.6 14.4L9 18.4l.2 2.7M14.4 14.4L15 18.4l-.2 2.7"/>';

function bodyIco(highlight) {
  return `<svg class="ico-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <g stroke-width="1.3" opacity=".5">${BODY_BASE}</g>
    <g stroke-width="2.4">${highlight}</g>
  </svg>`;
}

const ICO = {
  /* ---- occupations ---- */
  desk:     svgIco('<rect x="3" y="4.5" width="18" height="11" rx="1.6"/><path d="M2 19h20"/><path d="M9.5 15.5v3.5M14.5 15.5v3.5"/>'),
  camera:   svgIco('<rect x="2.5" y="7.5" width="12" height="9" rx="1.8"/><path d="M14.5 11l6-3.2v8.4l-6-3.2z"/><circle cx="6" cy="5" r="1.6"/><circle cx="10.5" cy="5" r="1.6"/>'),
  driving:  svgIco('<path d="M3 15V9.5a1.5 1.5 0 011.5-1.5H14v7"/><path d="M14 10.5h3.6l2.9 3.1V15"/><circle cx="7.2" cy="16.5" r="1.9"/><circle cx="16.8" cy="16.5" r="1.9"/><path d="M9.1 16.5h5.8M3 16.5h2.3M18.7 16.5H21"/>'),
  standing: svgIco('<circle cx="12" cy="4.4" r="2"/><path d="M12 6.6v7"/><path d="M8.6 9h6.8"/><path d="M12 13.6l-2.4 6M12 13.6l2.4 6"/>'),
  lifting:  svgIco('<rect x="3" y="8.5" width="18" height="10" rx="1.8"/><path d="M9 8.5V6.6A1.6 1.6 0 0110.6 5h2.8A1.6 1.6 0 0115 6.6v1.9"/><path d="M3 13h18"/>'),
  care:     svgIco('<path d="M7 3.5v4.2a4.3 4.3 0 008.6 0V3.5"/><path d="M5.6 3.5h2.8M14.2 3.5H17"/><path d="M11.3 12v2.2a4 4 0 004 4 3.5 3.5 0 003.5-3.5v-1.4"/><circle cx="18.8" cy="11.1" r="2.1"/>'),
  hands:    svgIco('<path d="M9 11V4.8a1.4 1.4 0 012.8 0V11"/><path d="M11.8 10.4V6a1.4 1.4 0 012.8 0v5"/><path d="M14.6 10.6V7.6a1.4 1.4 0 012.8 0v7.2a6 6 0 01-6 6h-.6a5.2 5.2 0 01-4.1-2L4 15.4a1.5 1.5 0 012.3-1.9L9 16"/>'),
  mixed:    svgIco('<path d="M3 6.5h3.6l3.2 5"/><path d="M14.2 12.5l3.2 5H21"/><path d="M3 17.5h3.6l10.8-11H21"/><path d="M18.6 4.2L21 6.5l-2.4 2.3M18.6 15.2L21 17.5l-2.4 2.3"/>'),

  /* ---- body areas ----
     One figure, eight highlights, rather than eight abstract marks. A shoulder
     drawn on its own is a squiggle; a shoulder drawn on a body is a shoulder.
     The figure is faint and identical every time, so the only thing the eye
     has to resolve is which joint is lit — which is the whole job of these. */
  shoulder: bodyIco('<circle cx="15.8" cy="8.5" r="1.9"/><path d="M15.8 8.5L18 13"/>'),
  lowback:  bodyIco('<path d="M12 10.6v3.6"/><path d="M9.4 14.2h5.2"/>'),
  knee:     bodyIco('<circle cx="15" cy="18.4" r="1.9"/>'),
  elbow:    bodyIco('<circle cx="18" cy="13" r="1.9"/>'),
  wrist:    bodyIco('<circle cx="17.7" cy="16.8" r="1.9"/>'),
  neck:     bodyIco('<path d="M12 5.7v1.6"/><path d="M9.6 7.6h4.8"/>'),
  hip:      bodyIco('<circle cx="14.4" cy="14.3" r="1.9"/>'),
  ankle:    bodyIco('<circle cx="14.8" cy="21.1" r="1.7"/>'),

  /* ---- general ---- */
  stretch:  svgIco('<circle cx="12" cy="4.2" r="1.9"/><path d="M12 6.2v4.6"/><path d="M12 8.2L6.4 6M12 8.2l5.6-2.2"/><path d="M12 10.8l-3.4 4.4L6 21M12 10.8l3.4 4.4L18 21"/>'),
  water:    svgIco('<path d="M12 3.2s6 6.2 6 10.1a6 6 0 01-12 0C6 9.4 12 3.2 12 3.2z"/>'),
  swap:     svgIco('<path d="M4 8.5h13l-3.2-3.3M20 15.5H7l3.2 3.3"/>'),
  pencil:   svgIco('<path d="M4 20.2l.9-3.7L15.4 6a2.1 2.1 0 013 3L7.7 19.3z"/><path d="M13.6 7.8l2.6 2.6"/>'),
  stopwatch: svgIco('<circle cx="12" cy="13.4" r="7.2"/><path d="M12 9.8v3.6l2.4 1.6"/><path d="M9.6 2.8h4.8M12 2.8v3.4"/>'),
  plus:     svgIco('<path d="M12 5.5v13M5.5 12h13"/>'),
  play:     svgIco('<path d="M8 5.4l10 6.6-10 6.6z" fill="currentColor" stroke-linejoin="round"/>')
};

/* An occupation or an area whose icon is missing must not render "undefined" —
   the dot is a placeholder that reads as deliberate rather than broken. */
function ico(k) { return ICO[k] || svgIco('<circle cx="12" cy="12" r="3.4"/>'); }

/* ============================================================
   THE REST OF THE SET
   ------------------------------------------------------------
   Everything below replaces an emoji that was in the app. The house style is
   one thing repeated: a 24-unit grid, a single 1.7 stroke, round caps and
   joins, `currentColor`, and no fill unless the shape is genuinely solid.

   Where the app has a metaphor already, the icon uses it rather than inventing
   a second one. Session sizes are lengths of trail, not traffic lights.
   Experience is foothill, ridge, summit. Milestones are things you pass on a
   walk. The brand is a journey on foot; the icon set should not be a sticker
   sheet stapled to it.
   ============================================================ */

/* Terrain, at three scales. Used for anything that is "how much" — the trail
   ahead, how far in you are, how hard the day is. */
function ridgeIco(peaks, extra) { return svgIco(peaks, extra); }

Object.assign(ICO, {

  /* ---- priority areas: the same figure, a region lit ---- */
  'area-Back':      bodyIco('<path d="M12 8v6.2"/><path d="M9.2 9.6h5.6M9.4 12.4h5.2"/>'),
  'area-Shoulders': bodyIco('<path d="M8.2 8.3h7.6"/><circle cx="8.2" cy="8.4" r="1.7"/><circle cx="15.8" cy="8.4" r="1.7"/>'),
  'area-Chest':     bodyIco('<path d="M8.8 9.4h6.4v3.1H8.8z"/>'),
  'area-Core':      bodyIco('<path d="M9.6 11.2h4.8M9.5 13.2h5"/><path d="M12 10.4v4"/>'),
  'area-Quads':     bodyIco('<path d="M9.6 14.6L9.1 18.2M14.4 14.6l.5 3.6"/><circle cx="9.3" cy="16.4" r="1.5"/><circle cx="14.7" cy="16.4" r="1.5"/>'),
  'area-Glutes':    bodyIco('<path d="M9.4 14.2h5.2"/><path d="M9.6 13.6a2.6 2.6 0 004.8 0"/>'),
  'area-Arms':      bodyIco('<path d="M8.2 8.5L6 13M15.8 8.5L18 13"/><circle cx="6.6" cy="11.6" r="1.5"/><circle cx="17.4" cy="11.6" r="1.5"/>'),
  'area-Calves':    bodyIco('<path d="M9.2 18.6l.1 2.4M14.8 18.6l-.1 2.4"/><circle cx="9.2" cy="19.6" r="1.4"/><circle cx="14.8" cy="19.6" r="1.4"/>'),

  /* ---- how much cardio: trail underfoot, getting steeper ---- */
  'cardio-light': svgIco('<path d="M2.5 17h19"/><path d="M6 17l3.4-2.6L13 17"/>'),
  'cardio-some':  svgIco('<path d="M2.5 18.5h19"/><path d="M4 18.5l4.6-5.4 3.2 3.4L16 11l5.5 7.5"/>'),
  'cardio-lots':  svgIco('<path d="M2.5 19.5h19"/><path d="M2.8 19.5l5-9.4 3.4 4.6L15.6 5l5.6 14.5"/><path d="M14.4 8.2l2.4 1.1"/>'),

  /* ---- cardio modes ---- */
  'car-treadmill-run': svgIco('<path d="M3 18.5h13a3 3 0 003-3V9"/><path d="M3 18.5v-2.2M19 6.4h2"/><circle cx="11.4" cy="4.6" r="1.5"/><path d="M11 6.2l-1.6 3 2.6 1.9-.6 3.4"/><path d="M9.4 9.2L7 10.4M12 10.1l2.4.6"/>'),
  'car-incline-walk':  svgIco('<path d="M2.5 19h19"/><path d="M3 19L15.5 6.5"/><circle cx="10.6" cy="9.4" r="1.5"/><path d="M10.2 11l-1.6 2.6 2.2 1.6-.4 2.6"/><path d="M8.6 13.6L6.6 14.6"/>'),
  'car-bike':          svgIco('<circle cx="5.4" cy="16.6" r="3.4"/><circle cx="18.6" cy="16.6" r="3.4"/><path d="M5.4 16.6l4-6.4h4.2l2.4 6.4"/><path d="M9.4 10.2h5.2"/><path d="M13.6 10.2L15 6.6h2"/>'),
  'car-rower':         svgIco('<path d="M3 6.5l7.6 7.6"/><path d="M12.4 15.9l7.6 -7.6"/><path d="M2.4 5.4L4.6 3.2M20.8 9.6L18.6 7.4"/><circle cx="11.5" cy="15" r="2.4"/><path d="M6 20.5h13"/>'),
  'car-stair':         svgIco('<path d="M3 20h4v-4h4.5v-4H16V8h5"/><path d="M3 20v-1"/>'),
  'car-jump-rope':     svgIco('<circle cx="12" cy="4.6" r="1.7"/><path d="M12 6.4v4.4"/><path d="M9.6 8.2h4.8"/><path d="M12 10.8l-1.8 4.2M12 10.8l1.8 4.2"/><path d="M9.6 8.2C4.6 9 3.4 14 6.6 18.4M14.4 8.2c5 .8 6.2 5.8 3 10.2"/>'),
  'car-run':           svgIco('<circle cx="14.4" cy="4.6" r="1.7"/><path d="M13.6 6.6l-2.4 3.4 3 2.2-.8 4"/><path d="M11.2 10l-3.4 1M14.2 12.2l2.8 1.2 1.4 3"/><path d="M3 8.6h3.4M2.4 12.4h3M4 16.2h2.6"/>'),
  'car-walk':          svgIco('<circle cx="13" cy="4.4" r="1.7"/><path d="M12.4 6.4l-1.8 4 2.6 2-.6 4"/><path d="M10.6 10.4L8 12M13.2 12.4l2.4 1 .8 2.6"/>'),
  'car-swim':          svgIco('<circle cx="8" cy="7.4" r="1.7"/><path d="M9.4 8.8l3 1.8 3.4-1.6"/><path d="M2.5 15.4c1.9 0 1.9 1.6 3.8 1.6s1.9-1.6 3.8-1.6 1.9 1.6 3.8 1.6 1.9-1.6 3.8-1.6 1.9 1.6 3.8 1.6"/><path d="M2.5 19.2c1.9 0 1.9 1.6 3.8 1.6"/>'),
  'car-hike':          svgIco('<path d="M2.5 20h19"/><path d="M3.5 20l5.6-9.6 3 4.2 3.6-6.4L21 20"/><path d="M12.6 8.4l1.8.9"/>'),

  /* ---- gear ---- */
  'gear-barbell':   svgIco('<path d="M2.5 12h19"/><rect x="4" y="8.6" width="2.6" height="6.8" rx="1"/><rect x="17.4" y="8.6" width="2.6" height="6.8" rx="1"/><rect x="7.2" y="6.8" width="2.6" height="10.4" rx="1"/><rect x="14.2" y="6.8" width="2.6" height="10.4" rx="1"/>'),
  'gear-rack':      svgIco('<path d="M5 3.5v17M19 3.5v17"/><path d="M5 8.5h3M16 8.5h3"/><path d="M8 8.5h8"/>'),
  'gear-bench':     svgIco('<rect x="3" y="8" width="18" height="3.4" rx="1.4"/><path d="M6 11.4v6M18 11.4v6"/><path d="M4 20h4M16 20h4"/>'),
  'gear-dumbbell':  svgIco('<path d="M8 12h8"/><rect x="3" y="8.6" width="3" height="6.8" rx="1.2"/><rect x="18" y="8.6" width="3" height="6.8" rx="1.2"/><rect x="6.2" y="7" width="2.2" height="10" rx="1"/><rect x="15.6" y="7" width="2.2" height="10" rx="1"/>'),
  'gear-kettlebell':svgIco('<path d="M9.4 8.4V7a2.6 2.6 0 015.2 0v1.4"/><path d="M9.6 8.6a6.2 6.2 0 104.8 0z"/>'),
  'gear-machine':   svgIco('<path d="M4 3.5v17"/><rect x="7.5" y="6" width="6.5" height="3" rx="1"/><rect x="7.5" y="10.4" width="6.5" height="3" rx="1"/><path d="M4 7.5h3.5M4 11.9h3.5"/><path d="M17 6v12M14.4 20h5.2"/>'),
  'gear-pullup':    svgIco('<path d="M3 5.5h18"/><path d="M6 5.5v3.4M18 5.5v3.4"/><circle cx="12" cy="12.4" r="1.8"/><path d="M9 8.9l2.2 2.2M15 8.9l-2.2 2.2"/><path d="M12 14.2v3.2M12 17.4l-2 3M12 17.4l2 3"/>'),
  'gear-band':      svgIco('<path d="M5 6.5c8 0 8 11 14 11"/><path d="M3.2 5.2a2.4 2.4 0 103.4 3.4"/><path d="M17.4 15.9a2.4 2.4 0 103.4 3.4"/>'),

  /* ---- how much time today: length of trail ---- */
  'avail-long':   svgIco('<path d="M2.5 17.5h19"/><path d="M4 17.5v-3M8.4 17.5v-4.6M12.8 17.5v-6.2M17.2 17.5v-7.6M21 17.5v-9"/>'),
  'avail-normal': svgIco('<path d="M2.5 17.5h19"/><path d="M4 17.5v-3M8.4 17.5v-4.6M12.8 17.5v-6.2"/><path d="M17.2 17.5v-1.6M21 17.5v-1.6" opacity=".35"/>'),
  'avail-short':  svgIco('<path d="M2.5 17.5h19"/><path d="M4 17.5v-3M8.4 17.5v-4.6"/><path d="M12.8 17.5v-1.6M17.2 17.5v-1.6M21 17.5v-1.6" opacity=".35"/>'),
  'avail-micro':  svgIco('<path d="M2.5 17.5h19"/><path d="M4 17.5v-3"/><path d="M8.4 17.5v-1.6M12.8 17.5v-1.6M17.2 17.5v-1.6M21 17.5v-1.6" opacity=".35"/>'),
  'avail-none':   svgIco('<path d="M2.5 17.5h19"/><path d="M4 17.5v-1.6M8.4 17.5v-1.6M12.8 17.5v-1.6M17.2 17.5v-1.6M21 17.5v-1.6" opacity=".35"/>'),

  /* ---- experience: foothill, ridge, summit ---- */
  'lvl-new':  svgIco('<path d="M2.5 18.5h19"/><path d="M5 18.5l4.4-4.6 4 4.6"/>'),
  'lvl-some': svgIco('<path d="M2.5 18.5h19"/><path d="M3 18.5l5.4-7.4 3.4 4.2 3-3.8 5.2 7"/>'),
  'lvl-adv':  svgIco('<path d="M2.5 19h19"/><path d="M2.8 19l6-11.6 3.4 5.2L16 4l5.2 15"/><path d="M14.6 7.4l2.6 1.3M9.4 10.6l2 1"/>'),

  /* ---- milestones: things you pass on a walk ---- */
  'ms-first':  svgIco('<path d="M2.5 17.5h19"/><path d="M6 17.5a6 6 0 0112 0"/><path d="M12 4.5v2.4M5.6 7.2l1.7 1.7M18.4 7.2l-1.7 1.7"/>'),
  'ms-pace':   svgIco('<circle cx="12" cy="12" r="8.4"/><path d="M15.4 8.6l-2 5.2-5.2 2 2-5.2z"/>'),
  'ms-way':    svgIco('<path d="M12 21c4.2-5.2 6.2-8.4 6.2-11A6.2 6.2 0 005.8 10c0 2.6 2 5.8 6.2 11z"/><circle cx="12" cy="10" r="2.2"/>'),
  'ms-25':     svgIco('<path d="M2.5 19h19"/><path d="M3.4 19l6-10.6L13 14l3-4.6L20.6 19"/>'),
  'ms-50':     svgIco('<path d="M2.5 19.5h19"/><path d="M2.8 19.5l6.4-12.8 3.6 6.2L16.4 6l4.8 13.5"/><path d="M14.8 9.4l2.6 1.3"/>'),
  'ms-100':    svgIco('<circle cx="12" cy="9" r="4.6"/><path d="M9.4 13l-1.4 7 4-2.2 4 2.2-1.4-7"/>'),
  'ms-200':    svgIco('<path d="M4 17.5h16"/><path d="M4 17.5L3 7.4l4.6 3.4L12 4.2l4.4 6.6L21 7.4l-1 10.1z"/>'),
  'ms-w4':     svgIco('<path d="M18.6 14.4A7.4 7.4 0 019.1 5 7.9 7.9 0 1018.6 14.4z"/>'),
  'ms-w12':    svgIco('<path d="M12 20.5V12"/><path d="M12 12c0-3.6 2.6-6.4 6.4-6.4 0 3.8-2.8 6.4-6.4 6.4z"/><path d="M12 15c-3.2 0-5.6-2.2-5.6-5.6C9.6 9.4 12 11.8 12 15z"/>'),
  'ms-w26':    svgIco('<circle cx="12" cy="12" r="8.4"/><path d="M12 3.6a8.4 8.4 0 010 16.8z" fill="currentColor" stroke="none"/>'),
  'ms-w52':    svgIco('<path d="M12 2.6v3.2M12 18.2v3.2M2.6 12h3.2M18.2 12h3.2"/><path d="M5.4 5.4l2.3 2.3M16.3 16.3l2.3 2.3M18.6 5.4l-2.3 2.3M7.7 16.3l-2.3 2.3"/><circle cx="12" cy="12" r="3.4"/>'),
  'ms-floor':  svgIco('<circle cx="12" cy="13.4" r="7.2"/><path d="M12 9.8v3.6l2.4 1.6"/><path d="M9.6 2.8h4.8M12 2.8v3.4"/>'),
  'ms-return': svgIco('<path d="M20.4 12a8.4 8.4 0 11-2.6-6.1"/><path d="M20.8 4.4v4.8h-4.8"/>'),
  'ms-tonne':  svgIco('<path d="M2.5 12h19"/><rect x="4" y="8.6" width="2.6" height="6.8" rx="1"/><rect x="17.4" y="8.6" width="2.6" height="6.8" rx="1"/><rect x="7.2" y="6.8" width="2.6" height="10.4" rx="1"/><rect x="14.2" y="6.8" width="2.6" height="10.4" rx="1"/>'),
  'ms-burn':   svgIco('<path d="M12 21.2c3.8 0 6.4-2.4 6.4-5.8 0-4.4-4.4-5.6-3.4-11-2.6 1-4.6 3.4-4.6 6 0 1.8-1 2.4-1.8 1.4-.5-.6-.7-1.5-.7-2.3-1.4 1.6-2.3 3.8-2.3 5.9 0 3.4 2.6 5.8 6.4 5.8z"/>'),

  /* ---- environments ---- */
  'env-full':  svgIco('<path d="M2.5 12h19"/><rect x="4" y="8.6" width="2.6" height="6.8" rx="1"/><rect x="17.4" y="8.6" width="2.6" height="6.8" rx="1"/><rect x="7.2" y="6.8" width="2.6" height="10.4" rx="1"/><rect x="14.2" y="6.8" width="2.6" height="10.4" rx="1"/>'),
  'env-hotel': svgIco('<rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5V5.4A1.4 1.4 0 0110.4 4h3.2A1.4 1.4 0 0115 5.4v2.1"/><path d="M3.5 13h17"/>'),
  'env-bw':    svgIco('<circle cx="12" cy="4.2" r="1.9"/><path d="M12 6.2v4.6"/><path d="M12 8.2L6.4 6M12 8.2l5.6-2.2"/><path d="M12 10.8l-3.4 4.4L6 21M12 10.8l3.4 4.4L18 21"/>'),

  /* ---- programmes ---- */
  'pg-anchor3': svgIco('<circle cx="12" cy="5.2" r="2"/><path d="M12 7.2v12.4"/><path d="M8.4 9.4h7.2"/><path d="M4.4 13.6c0 4 3.4 6.4 7.6 6.4s7.6-2.4 7.6-6.4"/><path d="M2.8 13.6h3.2M18 13.6h3.2"/>'),
  'pg-ul4':     svgIco('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 12h17"/>'),
  'pg-ul5':     svgIco('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 10h17M3.5 15h17"/>'),
  'pg-bro5':    svgIco('<path d="M12 3.2l7.6 4.4v8.8L12 20.8 4.4 16.4V7.6z"/>'),
  'pg-ppl6':    svgIco('<path d="M12 3.2l7.6 4.4v8.8L12 20.8 4.4 16.4V7.6z"/><path d="M12 3.2v17.6M4.4 7.6l15.2 8.8M19.6 7.6L4.4 16.4"/>'),
  'pg-hold2':   svgIco('<path d="M4 12h16"/><path d="M7.4 8.6h9.2M7.4 15.4h9.2" opacity=".4"/>'),

  /* ---- goals ---- */
  'goal-health':  svgIco('<path d="M12 20.4S3.8 15.4 3.8 9.6A4.6 4.6 0 0112 7.4a4.6 4.6 0 018.2 2.2c0 5.8-8.2 10.8-8.2 10.8z"/>'),
  'goal-consist': svgIco('<path d="M2.5 18h19"/><path d="M4.6 18v-2.6M8.4 18v-5.2M12.2 18v-4M16 18v-6.8M19.8 18v-5.4"/>'),

  /* ---- meals ---- */
  'meal-b': svgIco('<circle cx="12" cy="12.6" r="3.6"/><path d="M12 4.8v2M12 18.4v2M4.6 12.6h2M17.4 12.6h2M6.6 7.2l1.4 1.4M16 17l1.4 1.4M17.4 7.2L16 8.6M8 17l-1.4 1.4"/>'),
  'meal-l': svgIco('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 010 16z" fill="currentColor" stroke="none"/>'),
  'meal-d': svgIco('<path d="M18.6 14.4A7.4 7.4 0 019.1 5 7.9 7.9 0 1018.6 14.4z"/>'),
  'meal-s': svgIco('<path d="M12 3.4l2.3 5.6 6 .5-4.6 3.9 1.4 5.9L12 16.2l-5.1 3.1 1.4-5.9L3.7 9.5l6-.5z"/>'),

  /* ---- More screen and settings ---- */
  routines:  svgIco('<rect x="3.5" y="4.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="4.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="14.5" width="7" height="5" rx="1.6"/><rect x="13.5" y="14.5" width="7" height="5" rx="1.6"/>'),
  map:       svgIco('<path d="M3 6.4l6-2.2v13.4l-6 2.2z"/><path d="M9 4.2l6 2.2v13.4L9 17.6"/><path d="M15 6.4l6-2.2v13.4l-6 2.2z"/>'),
  chart:     svgIco('<path d="M3.5 20.5h17"/><path d="M6.6 20.5v-5.2M11 20.5V8.4M15.4 20.5v-8M19.8 20.5V4.6"/>'),
  ruler:     svgIco('<rect x="2.6" y="8.4" width="18.8" height="7.2" rx="1.6" transform="rotate(-8 12 12)"/><path d="M6.6 9.6v2.6M10.2 9.1v3.6M13.8 8.6v2.6M17.4 8.1v3.6"/>'),
  clock:     svgIco('<circle cx="12" cy="12" r="8.4"/><path d="M12 7.4V12l3 2"/>'),
  doc:       svgIco('<path d="M6 3.5h7.4L18.6 8.8V20.5H6z"/><path d="M13.4 3.5v5.3h5.2"/><path d="M8.8 13h6.4M8.8 16.4h4.4"/>'),
  mobility:  svgIco('<circle cx="12" cy="4.2" r="1.9"/><path d="M12 6.2v3.4"/><path d="M4.8 9.4l3.6 2.4 3.6-2.2 3.6 2.2 3.6-2.4"/><path d="M12 9.6l-2.8 5.2L7 21M12 9.6l2.8 5.2L17 21"/>'),
  target:    svgIco('<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="4.4"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>'),
  globe:     svgIco('<circle cx="12" cy="12" r="8.4"/><path d="M3.6 12h16.8"/><path d="M12 3.6c2.2 2.4 3.4 5.3 3.4 8.4S14.2 18 12 20.4C9.8 18 8.6 15.1 8.6 12S9.8 6 12 3.6z"/>'),
  person:    svgIco('<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20.4a7.2 7.2 0 0114.4 0"/>'),
  download:  svgIco('<path d="M12 3.6v11.2"/><path d="M7.6 10.6L12 15l4.4-4.4"/><path d="M4.4 18.6h15.2"/>'),
  upload:    svgIco('<path d="M12 15.4V4.2"/><path d="M7.6 8.6L12 4.2l4.4 4.4"/><path d="M4.4 18.6h15.2"/>'),
  warn:      svgIco('<path d="M12 3.8L21.2 19.8H2.8z"/><path d="M12 9.8v4.2M12 16.8v.1"/>'),
  lock:      svgIco('<rect x="4.6" y="10.4" width="14.8" height="9.6" rx="2.2"/><path d="M8 10.4V7.8a4 4 0 018 0v2.6"/>'),
  science:   svgIco('<path d="M9.6 3.5v6L4.2 18.4a2 2 0 001.7 3h12.2a2 2 0 001.7-3L14.4 9.5v-6"/><path d="M8.2 3.5h7.6"/><path d="M7.2 14.6h9.6"/>'),
  book:      svgIco('<path d="M3.6 5a5.6 5.6 0 018.4 1.6A5.6 5.6 0 0120.4 5v13a5.6 5.6 0 00-8.4 1.4A5.6 5.6 0 003.6 18z"/><path d="M12 6.6v12.8"/>'),
  play:      svgIco('<path d="M8 5.4l10 6.6-10 6.6z" fill="currentColor" stroke-linejoin="round"/>'),
  disk:      svgIco('<path d="M4.6 4.5h11.6l3.2 3.2v11.8H4.6z"/><path d="M8 4.5v5h6.6v-5"/><rect x="7.4" y="13" width="9.2" height="6.5" rx="1"/>'),
  phone:     svgIco('<rect x="6.4" y="2.6" width="11.2" height="18.8" rx="2.4"/><path d="M10.6 5.4h2.8"/><path d="M12 18.2v.1"/>'),
  search:    svgIco('<circle cx="10.8" cy="10.8" r="6.6"/><path d="M15.6 15.6L20.4 20.4"/>'),
  split:     svgIco('<rect x="3.6" y="4.6" width="16.8" height="14.8" rx="2"/><path d="M3.6 9.4h16.8"/><path d="M9 9.4v10"/>'),
  repeat:    svgIco('<path d="M4 9.4A5 5 0 019 4.6h11"/><path d="M17 1.8l3 2.8-3 2.8"/><path d="M20 14.6a5 5 0 01-5 4.8H4"/><path d="M7 22.2l-3-2.8 3-2.8"/>'),
  bag:       svgIco('<rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5V5.4A1.4 1.4 0 0110.4 4h3.2A1.4 1.4 0 0115 5.4v2.1"/>'),
  bolt:      svgIco('<path d="M13.4 2.4L4.6 13.6h6L10.6 21.6l8.8-11.2h-6z"/>'),
  plaster:   svgIco('<rect x="2.6" y="8.4" width="18.8" height="7.2" rx="3.6" transform="rotate(-40 12 12)"/><path d="M9.4 9.4l5.2 5.2" opacity=".5"/>'),
  stone:     svgIco('<path d="M4.4 16.6l2.4-7.2 5.6-3.4 6.6 3.2 1 7.4-7.6 3.6z"/>'),
  fire:      svgIco('<path d="M12 21.2c3.8 0 6.4-2.4 6.4-5.8 0-4.4-4.4-5.6-3.4-11-2.6 1-4.6 3.4-4.6 6 0 1.8-1 2.4-1.8 1.4-.5-.6-.7-1.5-.7-2.3-1.4 1.6-2.3 3.8-2.3 5.9 0 3.4 2.6 5.8 6.4 5.8z"/>'),
  moon:      svgIco('<path d="M18.6 14.4A7.4 7.4 0 019.1 5 7.9 7.9 0 1018.6 14.4z"/>'),
  plate:     svgIco('<circle cx="12" cy="13" r="7"/><path d="M4.6 4.6v6M20 4.6v5.2M18 4.6h4"/>'),
  ban:       svgIco('<circle cx="12" cy="12" r="8.4"/><path d="M6.1 6.1l11.8 11.8"/>'),
  building:  svgIco('<rect x="4.6" y="3.6" width="14.8" height="16.8" rx="1.8"/><path d="M8.4 7.4h2.2M13.4 7.4h2.2M8.4 11h2.2M13.4 11h2.2"/><path d="M10.4 20.4v-4.2h3.2v4.2"/>'),
  wrench:    svgIco('<path d="M15.4 3.6a5.4 5.4 0 00-5 8.4L3.6 18.8a2 2 0 002.8 2.8l6.8-6.8a5.4 5.4 0 007.4-6.6l-3 3-2.8-.7-.7-2.8 3-3a5.4 5.4 0 00-2.7-1.1z"/>'),

  /* ---- marks. Stroked, never glyphs — see the note in the handbook. ---- */
  tick:      svgIco('<path d="M4.4 12.4l5.2 5.2L19.6 7.4" stroke-width="2.2"/>'),
  cross:     svgIco('<path d="M6.2 6.2l11.6 11.6M17.8 6.2L6.2 17.8" stroke-width="2.1"/>'),
  arrowL:    svgIco('<path d="M19 12H5.4M11 5.4L4.4 12l6.6 6.6" stroke-width="2"/>'),
  arrowR:    svgIco('<path d="M5 12h13.6M13 5.4L19.6 12 13 18.6" stroke-width="2"/>'),
  arrowU:    svgIco('<path d="M12 19V5.4M5.4 12L12 5.4l6.6 6.6" stroke-width="2"/>'),
  arrowD:    svgIco('<path d="M12 5v13.6M5.4 12l6.6 6.6 6.6-6.6" stroke-width="2"/>'),
  chevD:     svgIco('<path d="M6 9.6l6 5.4 6-5.4" stroke-width="2"/>'),
  chevR:     svgIco('<path d="M9.6 5.4l5.4 6.6-5.4 6.6" stroke-width="2"/>'),
  peakMark:  svgIco('<path d="M12 5.6l7 12.8H5z"/>'),
  minus:     svgIco('<path d="M5.4 12h13.2" stroke-width="2.1"/>'),
  link:      svgIco('<path d="M4 8.6h13l-3-3M20 15.4H7l3 3" stroke-width="1.9"/>'),
  dot:       svgIco('<circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/>')
});

Object.assign(ICO, {
  'gear-cable':   svgIco('<path d="M5 3.6v16.8M19 3.6v16.8"/><rect x="7.6" y="5.6" width="8.8" height="3.2" rx="1.2"/><path d="M12 8.8v4.2"/><path d="M9.6 13h4.8l-1.2 5.4h-2.4z"/>'),
  'lvl-solid':    svgIco('<path d="M2.5 18.8h19"/><path d="M3 18.8l5.6-8.6 3.2 4 3.2-4.6 5.6 9.2"/><path d="M13.4 10.6l2 1"/>'),
  'goal-strength':svgIco('<path d="M2.5 12h19"/><rect x="4" y="8.6" width="2.6" height="6.8" rx="1"/><rect x="17.4" y="8.6" width="2.6" height="6.8" rx="1"/><rect x="7.2" y="6.8" width="2.6" height="10.4" rx="1"/><rect x="14.2" y="6.8" width="2.6" height="10.4" rx="1"/>'),
  'goal-muscle':  bodyIco('<path d="M8.2 8.5L6 13M15.8 8.5L18 13"/><circle cx="6.6" cy="11.6" r="1.6"/><circle cx="17.4" cy="11.6" r="1.6"/>'),
  /* A trend coming down, deliberately not a weighing scale: a scale is the
     object people who have had a bad time with this associate with being
     judged, and nothing in this app is allowed to read that way. It is the
     mirror of goal-consist's rising bars, in the same chart vocabulary the
     rest of the app already speaks. */
  'goal-lean':    svgIco('<path d="M3.4 7.2l5.4 5.6 3.4-2.9 7.4 7.1"/><path d="M15.4 19.1h4.6v-4.6"/>'),
  cog:            svgIco('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.6v2.8M12 18.6v2.8M2.6 12h2.8M18.6 12h2.8"/><path d="M5.4 5.4l2 2M16.6 16.6l2 2M18.6 5.4l-2 2M7.4 16.6l-2 2"/>'),
  summit:         svgIco('<path d="M2 20h20"/><path d="M2.4 20l6.6-13 3.6 5.6L16.2 4 21.6 20z"/><path d="M14.6 7.6l2.8 1.4M7.6 11.4l2.4 1.2"/>'),
  half:           svgIco('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 010 16z" fill="currentColor" stroke="none"/>'),
  pin:            svgIco('<path d="M12 21c4.2-5.2 6.2-8.4 6.2-11A6.2 6.2 0 005.8 10c0 2.6 2 5.8 6.2 11z"/><circle cx="12" cy="10" r="2.2"/>'),
  compass:        svgIco('<circle cx="12" cy="12" r="8.4"/><path d="M15.4 8.6l-2 5.2-5.2 2 2-5.2z"/>')
});

/* ---- tone: what a thing is, not how bright the screen should be ---- */

/* The journey. Terrain at every scale, the markers you pass, and the two or
   three things that mean effort. */
toneIcons('ember', [
  'ms-first', 'ms-pace', 'ms-way', 'ms-25', 'ms-50', 'ms-100', 'ms-200',
  'ms-w4', 'ms-w12', 'ms-w26', 'ms-w52', 'ms-floor', 'ms-return', 'ms-tonne', 'ms-burn',
  'lvl-new', 'lvl-some', 'lvl-adv', 'lvl-solid',
  'cardio-light', 'cardio-some', 'cardio-lots',
  'summit', 'peakMark', 'compass', 'pin', 'map', 'stone', 'fire', 'bolt', 'chart',
  'goal-strength', 'goal-consist',
  /* A session you built and the shape of a training week are training, not
     furniture. */
  'routines', 'pg-anchor3', 'pg-ul4', 'pg-ul5', 'pg-bro5', 'pg-ppl6', 'pg-hold2'
]);

/* The body. Every anatomical figure, and the things done to keep one working. */
toneIcons('teal', [
  'shoulder', 'lowback', 'knee', 'elbow', 'wrist', 'neck', 'hip', 'ankle',
  'area-Back', 'area-Shoulders', 'area-Chest', 'area-Core',
  'area-Quads', 'area-Glutes', 'area-Arms', 'area-Calves',
  'stretch', 'mobility', 'env-bw', 'goal-health', 'goal-muscle', 'goal-lean',
  'person', 'plaster', 'science', 'ruler'
]);

/* Time, covering ground through it, and anything that is there to be read. */
toneIcons('sky', [
  'car-treadmill-run', 'car-incline-walk', 'car-bike', 'car-rower', 'car-stair',
  'car-jump-rope', 'car-run', 'car-walk', 'car-swim', 'car-hike',
  'avail-long', 'avail-normal', 'avail-short', 'avail-micro', 'avail-none',
  'clock', 'stopwatch', 'water', 'moon', 'repeat', 'globe',
  'meal-b', 'meal-l', 'meal-d', 'meal-s',
  'book', 'doc', 'search', 'phone', 'disk'
]);

/* Careful. Three icons, and they are the only three that should catch the eye
   before you have decided to look at them. */
toneIcons('amber', ['warn', 'ban', 'lock']);

/* ---- the mass under the line ----
   The same outer shape the stroke already describes, filled at low alpha in
   the icon's own colour. Only where there is a genuine inside: a chevron, an
   arrow or a rule has no body, and filling one is a smear rather than an icon.
   The terrain family is the clearest win — a ridgeline closed to its baseline
   is a mountain rather than a zigzag. */
Object.assign(ICO_MASS, {
  /* terrain, closed to the ground it stands on */
  'lvl-new':      '<path d="M5 18.5l4.4-4.6 4 4.6z"/>',
  'lvl-some':     '<path d="M3 18.5l5.4-7.4 3.4 4.2 3-3.8 5.2 7z"/>',
  'lvl-adv':      '<path d="M2.8 19l6-11.6 3.4 5.2L16 4l5.2 15z"/>',
  'lvl-solid':    '<path d="M3 18.8l5.6-8.6 3.2 4 3.2-4.6 5.6 9.2z"/>',
  'cardio-light': '<path d="M6 17l3.4-2.6L13 17z"/>',
  'cardio-some':  '<path d="M4 18.5l4.6-5.4 3.2 3.4L16 11l5.5 7.5z"/>',
  'cardio-lots':  '<path d="M2.8 19.5l5-9.4 3.4 4.6L15.6 5l5.6 14.5z"/>',
  'car-hike':     '<path d="M3.5 20l5.6-9.6 3 4.2 3.6-6.4L21 20z"/>',
  'car-incline-walk': '<path d="M3 19L15.5 6.5 15.5 19z"/>',
  summit:         '<path d="M2.4 20l6.6-13 3.6 5.6L16.2 4 21.6 20z"/>',
  peakMark:       '<path d="M12 5.6l7 12.8H5z"/>',
  'ms-25':        '<path d="M3.4 19l6-10.6L13 14l3-4.6L20.6 19z"/>',
  'ms-50':        '<path d="M2.8 19.5l6.4-12.8 3.6 6.2L16.4 6l4.8 13.5z"/>',
  'ms-200':       '<path d="M4 17.5L3 7.4l4.6 3.4L12 4.2l4.4 6.6L21 7.4l-1 10.1z"/>',
  'ms-first':     '<path d="M6 17.5a6 6 0 0112 0z"/>',
  'ms-way':       '<path d="M12 21c4.2-5.2 6.2-8.4 6.2-11A6.2 6.2 0 005.8 10c0 2.6 2 5.8 6.2 11z"/>',
  'ms-w4':        '<path d="M18.6 14.4A7.4 7.4 0 019.1 5 7.9 7.9 0 1018.6 14.4z"/>',
  'ms-w26':       '<circle cx="12" cy="12" r="8.4"/>',
  'ms-floor':     '<circle cx="12" cy="13.4" r="7.2"/>',
  'ms-burn':      '<path d="M12 21.2c3.8 0 6.4-2.4 6.4-5.8 0-4.4-4.4-5.6-3.4-11-2.6 1-4.6 3.4-4.6 6 0 1.8-1 2.4-1.8 1.4-.5-.6-.7-1.5-.7-2.3-1.4 1.6-2.3 3.8-2.3 5.9 0 3.4 2.6 5.8 6.4 5.8z"/>',
  'ms-pace':      '<circle cx="12" cy="12" r="8.4"/>',
  'ms-100':       '<circle cx="12" cy="9" r="4.6"/>',

  /* rounds and bodies */
  pin:            '<path d="M12 21c4.2-5.2 6.2-8.4 6.2-11A6.2 6.2 0 005.8 10c0 2.6 2 5.8 6.2 11z"/>',
  compass:        '<circle cx="12" cy="12" r="8.4"/>',
  globe:          '<circle cx="12" cy="12" r="8.4"/>',
  clock:          '<circle cx="12" cy="12" r="8.4"/>',
  stopwatch:      '<circle cx="12" cy="13.4" r="7.2"/>',
  target:         '<circle cx="12" cy="12" r="8.4"/>',
  ban:            '<circle cx="12" cy="12" r="8.4"/>',
  search:         '<circle cx="10.8" cy="10.8" r="6.6"/>',
  person:         '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20.4a7.2 7.2 0 0114.4 0z"/>',
  moon:           '<path d="M18.6 14.4A7.4 7.4 0 019.1 5 7.9 7.9 0 1018.6 14.4z"/>',
  water:          '<path d="M12 3.2s6 6.2 6 10.1a6 6 0 01-12 0C6 9.4 12 3.2 12 3.2z"/>',
  fire:           '<path d="M12 21.2c3.8 0 6.4-2.4 6.4-5.8 0-4.4-4.4-5.6-3.4-11-2.6 1-4.6 3.4-4.6 6 0 1.8-1 2.4-1.8 1.4-.5-.6-.7-1.5-.7-2.3-1.4 1.6-2.3 3.8-2.3 5.9 0 3.4 2.6 5.8 6.4 5.8z"/>',
  bolt:           '<path d="M13.4 2.4L4.6 13.6h6L10.6 21.6l8.8-11.2h-6z"/>',
  stone:          '<path d="M4.4 16.6l2.4-7.2 5.6-3.4 6.6 3.2 1 7.4-7.6 3.6z"/>',
  'goal-health':  '<path d="M12 20.4S3.8 15.4 3.8 9.6A4.6 4.6 0 0112 7.4a4.6 4.6 0 018.2 2.2c0 5.8-8.2 10.8-8.2 10.8z"/>',
  'meal-s':       '<path d="M12 3.4l2.3 5.6 6 .5-4.6 3.9 1.4 5.9L12 16.2l-5.1 3.1 1.4-5.9L3.7 9.5l6-.5z"/>',
  'meal-d':       '<path d="M18.6 14.4A7.4 7.4 0 019.1 5 7.9 7.9 0 1018.6 14.4z"/>',
  'meal-l':       '<circle cx="12" cy="12" r="8"/>',
  half:           '<circle cx="12" cy="12" r="8"/>',
  'gear-kettlebell': '<path d="M9.6 8.6a6.2 6.2 0 104.8 0z"/>',

  /* boxes and panels */
  warn:           '<path d="M12 3.8L21.2 19.8H2.8z"/>',
  lock:           '<rect x="4.6" y="10.4" width="14.8" height="9.6" rx="2.2"/>',
  bag:            '<rect x="3.5" y="7.5" width="17" height="12" rx="2"/>',
  'env-hotel':    '<rect x="3.5" y="7.5" width="17" height="12" rx="2"/>',
  doc:            '<path d="M6 3.5h7.4L18.6 8.8V20.5H6z"/>',
  disk:           '<path d="M4.6 4.5h11.6l3.2 3.2v11.8H4.6z"/>',
  building:       '<rect x="4.6" y="3.6" width="14.8" height="16.8" rx="1.8"/>',
  phone:          '<rect x="6.4" y="2.6" width="11.2" height="18.8" rx="2.4"/>',
  split:          '<rect x="3.6" y="4.6" width="16.8" height="14.8" rx="2"/>',
  'pg-ul4':       '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/>',
  'pg-ul5':       '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/>',
  'pg-bro5':      '<path d="M12 3.2l7.6 4.4v8.8L12 20.8 4.4 16.4V7.6z"/>',
  'pg-ppl6':      '<path d="M12 3.2l7.6 4.4v8.8L12 20.8 4.4 16.4V7.6z"/>',
  routines:       '<rect x="3.5" y="4.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="4.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="14.5" width="7" height="5" rx="1.6"/><rect x="13.5" y="14.5" width="7" height="5" rx="1.6"/>',
  map:            '<path d="M3 6.4l6-2.2v13.4l-6 2.2z"/><path d="M15 6.4l6-2.2v13.4l-6 2.2z"/>',
  desk:           '<rect x="3" y="4.5" width="18" height="11" rx="1.6"/>',
  camera:         '<rect x="2.5" y="7.5" width="12" height="9" rx="1.8"/>',
  lifting:        '<rect x="3" y="8.5" width="18" height="10" rx="1.8"/>',
  'gear-bench':   '<rect x="3" y="8" width="18" height="3.4" rx="1.4"/>',
  plaster:        '<rect x="2.6" y="8.4" width="18.8" height="7.2" rx="3.6" transform="rotate(-40 12 12)"/>',
  chart:          '<path d="M5.4 20.5v-5.2h2.4v5.2zM9.8 20.5V8.4h2.4v12.1zM14.2 20.5v-8h2.4v8zM18.6 20.5V4.6H21v15.9z"/>',
  'goal-consist': '<path d="M3.4 18v-2.6h2.4V18zM7.2 18v-5.2h2.4V18zM11 18v-4h2.4v4zM14.8 18v-6.8h2.4V18zM18.6 18v-5.4H21V18z"/>',

  /* the plate stack, four times over — every icon that means load */
  'gear-barbell':  '<rect x="4" y="8.6" width="2.6" height="6.8" rx="1"/><rect x="17.4" y="8.6" width="2.6" height="6.8" rx="1"/><rect x="7.2" y="6.8" width="2.6" height="10.4" rx="1"/><rect x="14.2" y="6.8" width="2.6" height="10.4" rx="1"/>',
  'gear-dumbbell': '<rect x="3" y="8.6" width="3" height="6.8" rx="1.2"/><rect x="18" y="8.6" width="3" height="6.8" rx="1.2"/><rect x="6.2" y="7" width="2.2" height="10" rx="1"/><rect x="15.6" y="7" width="2.2" height="10" rx="1"/>',
  'env-full':      '<rect x="4" y="8.6" width="2.6" height="6.8" rx="1"/><rect x="17.4" y="8.6" width="2.6" height="6.8" rx="1"/><rect x="7.2" y="6.8" width="2.6" height="10.4" rx="1"/><rect x="14.2" y="6.8" width="2.6" height="10.4" rx="1"/>',
  'goal-strength': '<rect x="4" y="8.6" width="2.6" height="6.8" rx="1"/><rect x="17.4" y="8.6" width="2.6" height="6.8" rx="1"/><rect x="7.2" y="6.8" width="2.6" height="10.4" rx="1"/><rect x="14.2" y="6.8" width="2.6" height="10.4" rx="1"/>',
  'ms-tonne':      '<rect x="4" y="8.6" width="2.6" height="6.8" rx="1"/><rect x="17.4" y="8.6" width="2.6" height="6.8" rx="1"/><rect x="7.2" y="6.8" width="2.6" height="10.4" rx="1"/><rect x="14.2" y="6.8" width="2.6" height="10.4" rx="1"/>',
  plate:           '<circle cx="12" cy="13" r="7"/>'
});

finishIcons();
