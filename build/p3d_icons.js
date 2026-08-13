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
