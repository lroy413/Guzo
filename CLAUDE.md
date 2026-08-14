# Guzo Fit — CLAUDE.md

> Handoff document. Written at the point development moved into Claude Code.
> Everything here was verified against the code, not remembered.

---

## What it is

Guzo Fit is a strength-and-health training app for people whose hours change week to week — it was built for a camera operator working long, unpredictable shoot days. It plans a week of training around the time you actually expect to have, shrinks each session to fit the day you actually got, and never punishes you for a day that didn't happen. It is a self-contained HTML file plus a service worker, running as an offline PWA with all data on the device.

`ጉዞ (guzo)` is Amharic for "journey"; `የእግር ጉዞ` ("foot journey") is the everyday word for hiking. The whole product metaphor — the route, waypoints, distance covered, base camp — comes from that.

---

## Stack

There is no framework, no bundler and no server. `package.json` exists only to pull in Playwright for the instruments; nothing in the app depends on it.

| Layer | What it actually is |
|---|---|
| App | One HTML file — inline `<style>`, inline `<script>` — plus `sw.js`. One optional third-party request, off by default. |
| Language | ES2020 vanilla JS, `'use strict'`, one global script scope |
| Persistence | `localStorage`, single key `guzo.v1` |
| Build | `build.sh` — `cat` of ordered part files |
| Tests | Playwright (headless Chromium) driving the built file over a local `http.createServer` |
| Native shell | Capacitor 8 (iOS), in `guzo-native/` — scaffolded, not yet wired |

**Import reads files, and still never fetches.** `p4l_import.js` gets text out of a PDF with ASCII85 + `DecompressionStream` + a walk of the content stream — no library, because one would be the first external request the app has ever made and would still not work offline. Three rules it learned the hard way: **group text by baseline**, or a table's two columns run together and a styled heading arrives in three pieces; **translate WinAnsi 0x80–0x9F**, the one range where PDF and latin1 disagree, or every dash vanishes and "5–6 reps" becomes fifty-six; and **an en dash is a range while an em dash is a separator**, so they must not be collapsed together. `parsePlan` anchors on the *prescription* rather than on any layout, because "N sets × M reps" is the one thing every written plan has in common. Nothing writes until `commitImport`.

**The barcode scanner reads, and does not look up.** `p4m_scan.js` decodes EAN-13/UPC-A from a video frame itself — `BarcodeDetector` where the platform has it, which **Safari does not, on any iPhone**, so there is a decoder underneath: threshold each row against *its own* range, sample the centre of all 95 modules, check both guards and the checksum. What it cannot do is say what the product *is* — that needs a database this app has no way to carry and no way to reach. So a code is bound to a food in your own library the first time you scan it, and every scan after that is one tap. **`closeSheet` and `openSheet` both call `stopScan()`**: a sheet has five ways to be dismissed and a page that keeps the camera running after you walk away is the worst bug this feature could have.

**Sound is synthesised, never fetched.** `chime()` builds two oscillators; an audio file would be the first external request in the entire app, and a `data:` URI big enough to be a pleasant tone is larger than the code that makes it. The context is built inside the tap that starts the rest — one created outside a gesture starts suspended and stays that way, silent for the whole session. It exists because **iOS Safari implements no `navigator.vibrate` at all**, so `buzz()` is silence on the phone this app was built for, and nothing on the web can schedule an OS notification without a server to push it. On device, `scheduleRestAlert()` does that properly and is a no-op everywhere else.

**One optional external request, and it is written down.** `offLookup()` asks Open Food Facts what a barcode is. It reverses "no third-party requests, ever" — see `docs/decisions.md`, which records both states. The terms it is allowed on are the decision: **off by default**, nothing sent but the barcode (`credentials:'omit'`), six-second ceiling, and every kind of failure — offline, refused, not found, malformed — falling through to the sheet that asks you, which is what the app did before it existed. What comes back is shown before it is saved, and checked against the Atwater factors, because it is data a stranger typed into a public database. The answer is bound to the code, so a packet is asked about once and never again.

**The only *unconditional* network code in the app** is a service worker that caches the app shell — `build/sw.js`, emitted to the site root as `sw.js` and registered from `p7_events.js`. Nothing else fetches anything unless you switch the barcode lookup on. This is deliberate — see `docs/decisions.md`.

**The deploy is four files, not one.** `index.html`, `sw.js`, `manifest.webmanifest` and `icon.svg`. A worker script has to be fetched over http(s), so it cannot be inlined, built from a Blob, or served as a `data:` URL — an earlier version tried the Blob route and registered nothing at all, silently, for the entire life of the file. If only `index.html` is uploaded the app still runs, online-only, and says so in the console.

**The manifest is what names the colour of everything *outside* the page.** Every box in this app is `inset:0` to the viewport — `html`, `body`, `#app`, every screen — so a strip at the foot of the screen cannot be the app's own layout; it is the region the OS paints around a home-screen app, and `background_color` is the only thing that has ever governed it. `apple-mobile-web-app-capable` still asks for a standalone window and is still in the head for older iOS, but it carries no colour. An app already on the home screen keeps whatever it was installed with: a manifest change reaches it only after it is removed and re-added.

---

## File structure and how it connects

```
/
├── build.sh                  ← the build. PARTS order IS the load order.
├── GuzoFit.html              ← build output (gitignored; identical to index.html)
├── index.html                ← deployed file 1 of 4
├── sw.js                     ← deployed file 2 of 4; copied from build/sw.js
├── manifest.webmanifest      ← deployed file 3 of 4; names the colour the OS paints AROUND the app
├── icon.svg                  ← deployed file 4 of 4; the manifest's icon, a real file not a data: URI
├── package.json              ← playwright, for the instruments
├── .nojekyll                 ← Pages serves the tree verbatim
├── build/
│   ├── manifest.webmanifest  ← source of the deployed manifest
│   ├── icon.svg              ← source of the deployed icon
│   ├── p1_head.html          ← <head> + ALL CSS (~63 KB). Design tokens at the top.
│   ├── p2_body.html          ← all screen markup, nav, sheet container, boot fallback
│   ├── p3_data.js            ← constants, 391 exercises, 6 programmes, copy strings
│   ├── p3b_intake.js         ← onboarding question definitions
│   ├── p3c_form.js           ← 45 hand-built SVG form diagrams
│   ├── p3d_icons.js          ← ~140 drawn icons, four tones, no emoji anywhere user-facing
│   ├── p3e_body.js           ← the anatomical figure: silhouette, muscle regions, joints
│   ├── p4_engine.js          ← state, dates, units, readiness, session generation, week plan
│   ├── p4b_journey.js        ← milestones, MET calorie estimates, bodyweight
│   ├── p4c_daily.js          ← steps / sleep / weight, wake lock
│   ├── p4d_plates.js         ← barbell plate maths, last-time recall
│   ├── p4e_routines.js       ← user-built routines
│   ├── p4f_body.js           ← height/age/sex/activity, Mifflin-St Jeor BMR, TDEE
│   ├── p4g_food.js           ← 386-food library, portions, logging
│   ├── p4h_energy.js         ← adaptive TDEE, weekly intake, protein targets
│   ├── p4i_order.js          ← week ordering: pin / swap / reflow / trained-elsewhere
│   ├── p4j_meals.js          ← diet preferences, dietary tags, suggested meals
│   ├── p4k_native.js         ← Capacitor bridge: storage mirror, haptics, rest alerts. Inert on the web.
│   ├── p4l_import.js         ← PDF/text extraction, plan parsing, catalogue matching
│   ├── p4m_scan.js           ← EAN-13/UPC-A decoder, barcode→food bindings, camera support
│   ├── p4n_water.js          ← water target, logging, units, the daily streak
│   ├── p4o_stretch.js        ← occupations, stretch scoring, the daily list
│   ├── p5a_onboard.js        ← onboarding flow
│   ├── p5_ui.js              ← render(), Today, Plan, Train, Progress + shared helpers
│   ├── p6_more.js            ← More screen, Settings sheet, week sheet, exercise picker
│   ├── p6b_help.js           ← help and guide sheets
│   ├── p6c_daily.js          ← daily-metrics sheets
│   ├── p6d_routines.js       ← routine sheets
│   ├── p6e_profile.js        ← profile sheet
│   ├── p6f_fuel.js           ← Fuel screen, the food/water deck + all food sheets
│   ├── p6g_order.js          ← week-order sheets
│   ├── p6h_import.js         ← import review; the only thing that writes routines from a file
│   ├── p6i_scan.js           ← the scanner sheet and the camera loop
│   ├── p6j_stretch.js        ← the stretch sheets and its own three-question setup
│   ├── p7_events.js          ← ONE delegated click listener, input listeners, SW registration
│   ├── p8_tail.html          ← closing tags
│   └── sw.js                 ← service worker source; build.sh copies it to the root
├── docs/
│   ├── decisions.md
│   └── status.md
├── guzo-native/              ← Capacitor iOS shell. www/ is written by build.sh.
├── .github/workflows/ios.yml ← builds and uploads on a macOS runner; no Mac needed
└── *.mjs                     ← test instruments (see below)
```

**How the pieces connect.** There is no module system. Every part file contributes top-level functions to one shared scope, and later files can call earlier ones freely (function declarations hoist, so order only matters for `const`/`let` at module top level). The flow is:

```
user tap
  → p7_events.js delegated listener reads data-act
  → calls a mutator in p4*  (which calls save())
  → calls render() or a sheetX() in p5/p6
  → innerHTML into a #*-body div
```

There is no virtual DOM and no reactive binding. **Everything is a full innerHTML re-render of one container.** State changes do not automatically redraw; the event handler must call `render()` (or the specific `renderX()`) itself.

`S` is the single global state object. `save()` debounces a `JSON.stringify(S)` into `localStorage`; `save(true)` writes immediately.

---

## Data and persistence — THERE IS NO SUPABASE

**Read this before looking for a database.** This project has no Supabase, no Postgres, no backend, no API, no auth, and no user accounts. Nothing is synced or uploaded. There are no tables, no columns, no foreign keys and no RLS policies, because there is no server-side anything. If a future document or prompt refers to "the Supabase schema" for this project, that document is wrong.

What exists instead is one JSON blob in `localStorage`.

- **Key:** `guzo.v1` (`KEY` in `p3_data.js`)
- **Schema version:** `VERSION = '1.8.0'` — now matching the root `package.json` and `guzo-native/package.json`. Bump all three together; the service worker keys its cache off this one, so a release rotates the cache cleanly
- **Legacy migration:** `LEGACY_KEYS = ['fittrek.v1']` — on load, if the current key is missing *or holds an empty state*, a meaningful legacy blob is copied across. The "or holds an empty state" part is deliberate: opening the app once before restoring would otherwise orphan the old save behind a blank one.

### State shape (`blank()` in `p4_engine.js`)

| Key | Shape | Notes |
|---|---|---|
| `v` | string | schema version stamp |
| `onboarded` | bool | gates the onboarding screen |
| `profile` | object | `name, units('kg'\|'lb'), goals[], level, envs[], programId, bodyweight[{d,w}], injuries[], priorities[], sleepNorm, sessionMins, dayStart, dayStartSeen, cardio{}, gear{}, heightCm, birthYear, sex, activity` |
| `settings` | object | `nutrition, proteinOnly, restMain, restAcc, autoRest, warmup, rpe, restSound, lineIdx` — `rpe` and `restSound` are stored as an explicit `false`, never a truthy flag: a save written before either existed has no key, and reading it as merely falsy would take the column — or the sound — off everyone who used it |
| `week` | object | `{ start:'YYYY-MM-DD', days:{}, plan:{} }` — see below |
| `readiness` | map | date key → `{sleepH, sleepQ, energy, sore, stress, score}` |
| `sessions` | array | completed sessions, append-only |
| `active` | object\|null | the in-progress session |
| `lifts` | map | exercise id → learned working weight / progression state |
| `nutrition` | object | `{ targets:{kcal,p,c,f}, days:{ dateKey:{items:[]} }, custom:[], prefs:{...}, water:{days:{dateKey:ml}, goal, best} }` — water is always millilitres; the unit is a formatter |
| `billing` | object | `{pro, plan, trialStart}` — scaffolding only, nothing enforces it |
| `journey` | object | `{ reached:{} }` milestone flags |
| `daily` | map | date key → `{steps, sleepH, weight, src}` |
| `videos` | map | exercise id → user-supplied form video URL |
| `routines` | array | user-built session templates |
| `stretch` | object | `{onboarded, occupation, areas[], mins, done:{dateKey:[exId]}}` |
| `meta` | object | `{created, lastOpen}` |

### The two maps inside `week`

`week.days[dateKey]` — **your constraints.** `{ avail:'long'\|'normal'\|'short'\|'micro'\|'none', env:'full'\|'hotel'\|'bw', note }`. Absent means the default (`normal`, first env).

`week.plan[dateKey]` — **the schedule.** `{ type, done, pinned?, routineId?, elsewhere? }`

- `type` — one of `PLAN_TYPES`, or `'custom'` when a routine is assigned
- `done` — the planned session is discharged
- `pinned` — **you** chose this day; rebuilds and reflows must not overwrite it
- `routineId` — a routine is standing in as this day's session
- `elsewhere` — trained before the app existed for you; marks the day spent without inventing a session record

### Relationships (all by string key, all client-side)

```
week.plan[date].routineId ──→ routines[].id
sessions[].exercises[].exId ──→ EX[id]   (static catalogue, not user data)
lifts[exId] ──────────────────→ EX[id]
nutrition.days[date].items[].foodId ──→ FOODS[].id or nutrition.custom[].id
profile.programId ────────────→ PROGRAMS[id]
```

Nothing enforces referential integrity. Deleting a routine leaves a dangling `routineId`; `planLabel()` renders `"Deleted routine"` rather than crashing, which is the pattern to copy.

### If you ever add a backend

The blob is already the natural sync unit. The honest shape would be one `profiles` row per user plus an append-only `sessions` table, with everything else staying local. Do not migrate `week.days` / `week.plan` to a server — they are re-derived constantly and would generate enormous write traffic for no benefit. Whatever you do, the app must keep working with the network off; that is a product promise, not a nice-to-have.

---

## Conventions actually in use

**Dates.** Every store in the app is keyed `'YYYY-MM-DD'`. `dk(date)` makes a key, `fromKey(k)` makes a Date, `addDays(d, n)` returns a **Date**, and `key(k)` normalises either into a key. **Any function that accepts a date must pass it through `key()` first.** This has already caused one silent class of bug (see `docs/decisions.md`).

**There is one clock, and it is `today()`.** `weekStart()` defaults through it rather than reading `new Date()` a second time, so pinning `today()` in a fixture pins the whole week. Do not reintroduce a second source of "now" — a fixture that pins one and not the other is correct only until the real date crosses a Monday.

That one entry point is also what makes `profile.dayStart` a three-line feature. A day does not have to end at midnight: set it to 4 and `today()` subtracts four hours before taking the date, so a session logged at 2am belongs to the day you have been awake for. Because everything reads `today()`, the week, the plan, readiness, the daily metrics and the food log all move together and none of them know the setting exists. Anything that genuinely wants the wall clock — the greeting, `lateFinishHint()`, a `toISOString()` audit stamp — reads hours or `Date.now()` directly and is unaffected. **New date-derived code goes through `today()`, never `new Date()`**; one call site missed this (`muscleVolume`) and was a silent second clock for months.

**Naming.**
- `sheetX()` opens a modal sheet. `renderX()` writes into a screen container.
- `S` is state. `A` is `S.active` inside session code.
- Date variables are `k` (a key) or `d` (a Date). Never mix.
- Predicates read as questions: `fuelOn()`, `hasForm()`, `planDaySettled()`.
- Data files use compact pipe-delimited template strings parsed at load (`EXDATA`, `FOODDATA`), not JSON arrays. It keeps the single file small and diffs readable.

**Events.** One delegated `click` listener in `p7_events.js` with a giant `switch` on `data-act`. Parameters ride on `data-v`, `data-k`, `data-i`, `data-r`, `data-m`, `data-d`. **Never add an inline `onclick`.** New interactive elements need a `data-act` and a `case`.

**Escaping.** `h()` escapes anything user-supplied going into a template string. Routine names, profile names and custom food names must always be wrapped.

**A one-word class is a landmine.** Component classes here are namespaced by feature (`.fuel-*`, `.dm-*`, `.imp-*`) — a bare `.empty` was the exception, an empty-state panel with `padding:44px 20px` on it. The day strip's own `.day-v.empty` modifier inherited that padding and grew from 23px to 88px, pushing the STEPS label two-thirds of the way down the card while the other two stayed put. `.pf-v.empty` had it too and nobody had noticed. It is `.blankstate` now, and a component's "nothing here" modifier is `.none`. **Never add a single-word class to `p1_head.html`.**

**Measure painted text with a Range, not the element box.** Small interactive text here is deliberately padded out to a 44px target, so element boxes overlap all over the layout by design and a checker using them reports the whole app as broken. `blanks.mjs`'s collision sweep walks text nodes and takes `Range.getBoundingClientRect()`, which is the rectangle the glyphs actually occupy. It also asserts how many nodes it measured, because a sweep that finds nothing by looking at nothing is the same shape of lie as a contrast checker that sampled no pixels.

**A sticky offset is measured from a rectangle already inset by the scroller's padding.** `.screen` carries `padding-top: calc(var(--safe-t) + 14px)`, so `.hdr{position:sticky; top:0}` pins the header exactly where it sits at rest, clear of the notch. Writing `top:var(--safe-t)` — which reads as the obviously correct thing — counts the safe area twice and parks the title a hundred pixels down a real iPhone. **A desktop browser cannot show you this**: `env(safe-area-inset-top)` is `0px` there, so both versions render identically. Fake the inset (`root.style.setProperty('--safe-t','47px')`) and assert the element moves by exactly one inset.

**Anything pinned over scrolling content must be opaque, and its colour is the page's own gradient rather than a guess at it.** The nav records why translucency fails — text underneath stays legible through it, which passes a CSS reading and fails a pixel check. The header band can't use a flat colour either, because `--bg-grad` shifts across four `data-sky` bands and a per-band veil is exactly what that rule forbids. Paint it with `var(--bg-grad)` at `background-attachment:fixed`, the same declarations `body` uses: attached to the viewport, it lands in the same place on the band as on the page, so it is invisible by construction in every band and at every width.

**An `<svg>` is a replaced element, so `height:auto` ignores `bottom`.** Sizing one with `position:absolute; top:X; bottom:0; height:auto` does not stretch it — the height resolves from its own viewBox aspect ratio, `bottom` is dropped as over-constrained, and the element comes out the same size whatever its container does. Every trail connector on the Progress ascent was exactly 100px tall until this was found. State the height (`height:calc(100% - 54px)`), and measure the rendered box in the check rather than reading the stylesheet.

**Decoration that is `position:absolute` paints over static content, and `pointer-events:none` hides that from `elementFromPoint`.** The ridge silhouette on Progress is absolutely positioned at the top of its card; every sibling that can sit under it is `position:relative` so it paints above. The trap is in the checking, not the fixing: a probe using `elementFromPoint` cannot see a `pointer-events:none` layer at all, so it reports the text as being on top whether or not it is being drawn over — it passed straight through a full revert. Hit-test order is paint order **only when both layers are hittable**, so make the decoration hittable for the length of the measurement and put it back.

**A negative vertical margin on an `inline-flex` element does not pull it over the block above.** It sits on a line box, so the margin resizes the line rather than moving the glyphs — measured: `margin-top:-16px` on `.home-late` moved its text by 1px. Use `position:relative; top:` if you actually mean to move something, and expect the collision sweep to catch it when you do.

**A button is an object: a lit top edge, a dark bottom one, a specular over the top half, and two shadows that collapse as it moves *down* a pixel.** A control that only shrinks on press reads as receding rather than as being pushed. The sweep of light across a solid button is driven by a transient class from a `pointerdown` listener, **never by `:active`** — a real tap releases after about eighty milliseconds and an animation bound to `:active` stops a seventh of the way across. `.btn.quiet` deliberately gets none of this; it is the way out of a screen, not the way through it, and it is the wrong shape for a secondary action.

**Motion has tokens, and every animation is behind `prefers-reduced-motion: no-preference`.** Three curves (`--ease-out`, `--ease-spring`, `--ease-in-out`) and three durations, so nothing in the app moves in a way nothing else does. The screen-arrival stagger is driven by an `.entering` class that `go()` adds and a timer removes — **not** by `.screen.on`, because every render replaces the body's innerHTML and the animation would otherwise replay on every state change. Navigation is the only thing that should feel like arriving.

**The `data-sky` band on `<html>` is ambient light and nothing else.** It shifts the background gradient by time of day (dawn / day / dusk / night) and **must never touch a colour that was measured for contrast** — surfaces, lines and text tokens are identical in all four bands, and `blanks.mjs` asserts it. It reads the wall clock, not `today()`: `profile.dayStart` moves where your day ends and it does not move sunrise.

**`dur` is time you were in the session, not wall clock.** `activeMs` accumulates in slices from a five-second pump, and a slice only counts when the session is open and unpaused, the page is visible, and either you touched something in the last ten minutes or a rest timer is running. `tickAt` advances even when the slice does not count, so nothing is back-filled — returning after four hours adds one interval. A slice is capped at a minute against a throttled timer or a sleeping device. `started`/`ended` remain the real wall clock; they are history, not duration. Reverting to `(ended - started)` prints 540 minutes for a nine-hour gap, which is the bug that was reported as 596.

**A session is shown in block order, not array order.** `exBlock(item)` derives warm-up / main / accessory / core / finisher from flags the session already carries plus the catalogue's tier and pattern — nothing is stored, so a session logged last year still groups. `sessionOrder(A)` returns **indices**, never a reordered copy: every handler addresses an exercise by its real position in `A.exercises`, and a reordered copy would point `toggle-set` at the wrong movement. The cards, the rail and `trainWhere()` all walk that one order, because a rail that disagrees with the list under it is worse than no rail.

**Train updates in place, never by re-rendering.** `updateTrainProgress()` moves the rail, the count, the kcal and the clock by touching those nodes directly, then calls `paintTrainStates()` to move the boundary between what you have covered and what is ahead. A `renderTrain()` mid-session replaces the body's innerHTML, which closes the keyboard and loses your caret — the reason `replaceExCard(i)` exists is to rebuild exactly one card when its shape genuinely changes. A check that compares `#train-body` before and after proves nothing, because innerHTML is replaced and the element is not; compare an input node.

**The range divides by work, and one function says how.** A movement owns a slice of the horizon equal to its sets over the session's sets, and lights that slice in proportion to its own ticks — so working out of order lights the ground that work actually sits on. `rangeGeom()` is read by both the markup and `updateTrainProgress`, and that is load-bearing: when they each did their own arithmetic, a revert that turned the markup into one frontier bar was invisible, because the first tick made the update rewrite the rects correctly from its own copy. **A check on a value two call sites compute must read it straight off a render, before anything that would repair it.** The trail under the range divides on the same shares, which is why `.rail-seg.now` cannot grow — a segment that widened itself would slide out from under its own mountain.

**The body is authored as points, and the male/female difference is four numbers.** `p3e_body.js` holds one anatomy on a 132×240 grid — a 7.5-head figure, shoulders two head-heights across — and `BODY_SHAPE` scales it at the shoulder, waist, hip and thigh, blended along a ramp so no band boundary kinks the silhouette. Only the right half is drawn; the left is that half mirrored into the *same* closed path, because two paths would put a seam down the centre line. **Every region must sit inside the silhouette at the same height** — the ribcage is much narrower than the shoulders, so a pectoral authored to the shoulder's width floats beside the body, and `stretch.mjs` asserts it point by point. The heat is seven days of `muscleVolume()` normalised against your own busiest muscle, never a fixed ceiling.

**A figure has two vocabularies and the tap has to answer in the right one.** Muscles are shapes; the eight `INJURIES` areas are *joints*, which are places. `bodyPick(view, sex, x, y, mode)` takes the mode for exactly this reason — the same pixel means Chest on one screen and shoulder on another. Region paths answer most taps; a miss falls through to the nearest target rather than to nothing, because a body map that sometimes ignores you reads as broken. **A visible marker and its tap target are different sizes on purpose**, and the target's rendered size is measured, not assumed — the first joint marker was 13 units and came out at 35px.

**An icon's tone is a category, never a state, and it only applies inside a tile.** `ICO_TONE` in `p3d_icons.js` assigns four: ember for the journey, teal for the body, sky for time and reading, amber for the three icons that mean careful. Everything structural stays neutral — an icon set where everything is coloured is a sticker sheet. The CSS scopes every tone to `.ico`, `.opt-ico`, `.chip` and `.milestone-ico`, so an icon elsewhere still inherits and nothing that uses colour to mean state is overruled. **A tone class is a string until a rule matches it**, so `blanks.mjs` reads the colours back off rendered elements rather than off the class list — and it samples one icon per tone, because a single sample stays green when a different tone is unscoped.

**A session has a position on it, and only the movement you are on is a card.** `exStand(ei)` returns `walked` / `now` / `ahead` — the ascent's own three states — and everything else is a 58px line that opens on a tap. **The fold is derived, never stored**: `exFolded()` reads where you are, so undoing a set unfolds the movement again on its own. `collapsed` is *tri-state* — absent means "fold what I am not on", and an explicit `true`/`false` is a choice you made and outranks it. A handler that writes `!item.collapsed` instead of `!exFolded(...)` makes opening a movement you are not on undo itself on the next repaint, which looks exactly like the tap not registering.

**A set row cannot be a fixed grid, and this has broken three times.** Its children vary by movement: a hold adds a run button, a run swaps distance for weight, a bodyweight movement has no load column at all. `.set-row` named five columns; the run button was a sixth child, so the tick wrapped to a line of its own and a timed set stood 105px against everyone else's 54. It is `display:flex` with `flex:1 1 0` fields — dropping a child redistributes on its own and there is no combination left to count wrong. **Never reintroduce `grid-template-columns` on `.set-row`.**

**A movement with no weight in it is not asked for one.** `wantsLoad(item, prev)` gates the load column: always on for `wt`, otherwise only where a weight has actually been logged, targeted, or turned on from the exercise menu. `addLoad === false` is an explicit off and outranks the history behind it, or turning the column off on something you once did with a plate lets the old weight switch it straight back on. A plank offering `— lb` and a crunch offering `0 +lb` is what this replaced.

**Anything sticky inside `.screen` needs three declarations, and a desktop browser can prove none of them.** `.screen` is padded `calc(var(--safe-t) + 14px)`, and a sticky `top:0` lands at the top of the scroller's **content** box — so the bar stops one padding down and content scrolls through the strip above it. The band needs `top:calc(-1 * strip)` to reach the scroller's edge, `padding-top:strip` so the card still clears the notch, and `margin-top:calc(-1 * strip)` so it does not move at rest. All three cancel to zero when `env(safe-area-inset-top)` is `0px`, which is what a desktop browser reports: **fake the inset** and assert the band's top is 0 and the card inside it is exactly one inset down. Padding without the negative top makes the card jump the frame it catches; a taller band without the negative margin paints over the screen title.

**A screen is hidden, never removed.** `go()` toggles a class; every other screen's markup stays in the document. So an `id` inside anything two screens render is an `id` that exists twice — Today and Plan both draw the week strip, and giving it one made every lookup find whichever screen had rendered first. Use a class and scope by screen (`#today-body .week`).

**A routine item's `mode` beats the catalogue.** `EX[id].load` is one load type per exercise, which is right for a barbell and wrong for anything you might hold or keep moving through. A routine item carries `mode: 'reps' | 'time'`, and `itemLoad(it)` resolves the two. **Session exercises carry the resolved `load`, so everything downstream reads the item, not the catalogue** — `exerciseSeconds`, `setSummary`, the set-row labels, and the progression guard in `applyProgression`. Miss that last one and a movement set to seconds ratchets its rep target every time you hold it longer. `canRetime()` withholds the choice from loaded compounds, where reps against a working weight is the whole mechanism.

**A superset is one boolean, and editing around it breaks it.** `supNext` on a routine item means "this one runs into the next one" — no group ids, because those need renumbering on every move and delete and drift out of sync the first time one is missed. The flag travels with the item, which is what makes it survive a reorder and also what makes it dangerous: pull one half of a pair out and it latches onto whatever slid in underneath, giving you a bench press supersetted with an overhead press that looks exactly like a pair you asked for. `clearLinksAround()` breaks every link in the window an edit touched, including the one *pointing into* it, and `normaliseSupersets()` strips a link off the last item so it can never suppress the session's final rest. `sessionOrder()` groups before it sorts, or the block sort pulls a pair apart. The entire runtime behaviour is one guard in `toggle-set`: no auto-rest when `item.supNext`. Everything else is labelling.

**A set row must record what it offered.** `ghostFor(item, si, prev)` resolves one answer — what you are lifting today, then what you lifted last time, then the prescription — and the render, the live carry-down and `toggle-set` all read it. Three call sites that can disagree eventually will, same reason `supFor()` is computed rather than passed. **It returns raw values and the caller formats**: `fmtW` rounds 1.25 to 1.3, which is right for a label and sends you to the wrong plate if it reaches the store. Pass `prev` in from the card, or a four-set card walks the whole session history four times inside the render path.

**Sheets that redraw themselves need a key.** `openSheet(html, { key })` remembers scroll position per key for as long as the sheet stack is open. Without one, every redraw jumps to the top — which for the routine builder and the exercise picker, both of which redraw on every single tap, made them unusable past the third movement. If a new sheet ever calls itself from one of its own handlers, give it a key. If it does not, leave it alone; an unkeyed sheet correctly starts at the top. Hand back between sheets with a plain `sheetX()` call rather than `closeSheet()` first — closing pops the one history entry the whole stack rides on and discards the remembered positions.

**Trim where you search, never where you echo what somebody is still typing.** A sheet that redraws on every keystroke refills its own field, so any normalising done on the way *out* is applied to text the user has not finished writing. The food search painted `value="${h(query)}"` — the trimmed string it searched with — which swallowed a trailing space the instant it was typed and made two-word foods impossible to enter: "turkey sa" came back "turkeysa". Paint the raw state; normalise at the point of use. The same applies to case-folding, collapsing repeats, and stripping punctuation.

**Food ids are positional (`'f' + i` over `FOODDATA`), so a row may be renamed or appended but never moved.** A reorder silently repoints every logged entry, per-food correction and barcode binding in every existing save, with nothing to notice it. Rename in place; add at the end.

**CSS.** All in `p1_head.html`. Design tokens at the top (`--ember:#E9B44C` is the brand accent). Utility classes (`row`, `between`, `grow`, `mb`, `mt-s`, `tiny`, `small`, `mono`, `em`) plus component classes namespaced by feature (`.fuel-*`, `.ord-*`, `.pick-*`, `.rt-*`, `.pf-*`). Minimum touch target is 44px; nothing renders below 11px.

**Comments.** Non-obvious code carries a comment explaining *why*, especially where a naive implementation would be wrong. This is load-bearing — several comments record bugs that were expensive to find. Do not strip them.

**Tone.** Copy never shames. There is no streak counter, nothing goes red, a missed day is free. If you write UI text, match that.

---

## Fragile areas

**1. `build.sh` PARTS order is the load order.** Two part files declaring the same top-level name is legal JavaScript and completely silent — the later one wins app-wide. This already happened: a defensive copy of `daysBetween` in `p4d_plates.js` clamped its result to `Math.max(0, …)`, and because that file loads later, *every past-or-future check in the app lost the ability to see the past.* `dupes.mjs` now runs inside `build.sh` and fails the build on any duplicate. Do not remove that check.

**2. `addDays()` returns a Date, stores are keyed by string.** Passing one where the other is expected fails silently — the lookup just misses, no error. Six call sites had this bug; two shipped. Normalise through `key()` at every store boundary.

**3. `render()` is not automatic.** Mutate state and forget to call `render()` and the screen is simply stale. There is no reactivity to save you.

**4. The boot fallback panel.** `#s-boot` is visible in raw markup and switched off by the *first executable line* of the script. The nav starts `hide`. This exists because iOS refuses to run JS in a file opened from storage, and the app would otherwise be a black rectangle. Do not "clean up" the default-visible panel or the default-hidden nav.

**5. `lastPerformance()` runs inside the train render path.** A malformed date in `S.sessions` there takes down the whole Train screen. Keep it defensive.

**6. Weight formatting.** `fmtW()` rounds to 1 decimal, which turns 1.25 kg into "1.3". On a plate list that sends you to the wrong plate. `fmtP()` (2 decimals) exists for plate maths. Use the right one.

**7. Exercise field is `eq`, not `equipment`.** Silent `undefined` if you get it wrong.

**8. Hairline glyphs fail pixel-sampled contrast.** `↑ ↓ ← ✓ ›` at small sizes antialias to roughly half the contrast their colour promises. They pass a CSS inspection and fail the real check. Use stroked SVG paths for arrows and chevrons.

**9. The nav has exactly five tabs.** Turning Fuel on hides Route and shows Fuel (`syncNav()`). Tests must navigate via `go()` or scope selectors to `#nav`, because `[data-go="plan"]` also matches a row on the More screen.

**10a. `#app` is sized from the body, never in viewport units.** `html, body` are `position:fixed; inset:0`, so the body already *is* the visible viewport and re-measures itself as browser chrome comes and goes; `#app{height:100%}` fills it exactly by definition. It was `100dvh`, and on iOS Safari the dynamic viewport and a fixed inset-0 box disagree the moment the address bar collapses — dvh grows, the fixed body does not — so `#app` became taller than its parent and `body{overflow:hidden}` sliced the bottom off. Cards cut in half with dead space under them, and no `padding-bottom` can fix it because the clipping happens a level above. **Never reintroduce `vh`/`dvh` on `#app`.**

**10. The nav is `position:fixed`.** It floats as a pill rather than sitting in the flex flow, so it takes no layout space — every screen it covers carries its own `padding-bottom` to scroll clear of it. Add a screen and it needs adding to that rule, or its last card sits under the nav.

**11. `innerText` returns painted text, not template text.** `.sec-t` and `.eyebrow` are `text-transform:uppercase`, so a test matching `/Suggested/` against `innerText` fails while the markup plainly says "Suggested". Match case-insensitively, or read `textContent`.

---

## Running it locally

```sh
./build.sh                  # → GuzoFit.html, index.html (~491 KB) and sw.js
python3 -m http.server 8000 # then open http://localhost:8000/index.html
```

**It must be served over http.** Opening the file with `file://` will not run in Safari at all, and the service worker needs a real origin.

### Test instruments

Run from the repo root, against the built file. Each spins up its own server and headless Chromium.

| Command | What it proves |
|---|---|
| `node test.mjs` | 146 functional checks end to end, plus zero console errors |
| `node audit.mjs` | every sheet dismisses four ways; no dead ends; every button fires |
| `node collide.mjs` | overlap / zero-gap / spill / offscreen / clipped, across 3 devices × 3 states × 6 screens × 49 sheets |
| `node contrast.mjs` | pixel-sampled WCAG AA on every screen text node |
| `node sheetcontrast.mjs` | the same for all 25 sheets |
| `node ux.mjs` | touch targets, font floors, input modes, reachability |
| `node knees.mjs` | anatomical check on the SVG form diagrams |
| `node dupes.mjs` | duplicate top-level declarations (also runs in `build.sh`) |
| `node sw.mjs` | the service worker registers, caches, survives the network being cut, and still lets an update through |
| `node blanks.mjs` | no `undefined` / `NaN` / `[object Object]` reaches any screen; base camp is a camp rather than a list — its tents opening the destinations the nav is not already offering, the fire being Fuel only while Fuel is on and a fire regardless, the moon opening Settings with a target you can hit and a name you can hear, no list left on it, and every word of the name and the numbers still legible over the range behind them; a place rather than a card with a picture in it — its sky reaching the edges of the phone and the top of it, behind a header that blurs what passes under it instead of painting over it while every other screen still paints, its range drawn in open sky rather than behind the first list and not dissolved by a mask that grew with the box, the same range on every screen — snow and all, no band ending on a rule, and every word of text over any of them still legible against it, every cap sitting on a peak the range actually has — found by name rather than by paint — and painted rather than left to fill black, a sky whose stars fill all of it rather than a band across the top and are the same on every render, shimmering one at a time and each back to its own brightness rather than to a fixed white, a moon in the sky rather than the header — named for a screen reader without being printed, and drawing exactly as much of itself as is lit right across a cycle with its glow on the lit limb rather than on the whole disc, and a fire drawn at the foot of the range, standing on the near ridge and outside the mask that would fade it, the canvas behind the app is painted with the same thing the body paints, so a strip iOS hands the web view cannot come out black, a manifest the host actually serves, naming the colour the OS paints around the app and asking for a standalone window, the nav is a floating pill that content can scroll clear of, sitting clear of the home indicator without counting its inset twice — with the rest timer and the toast tracking it at any inset; a sheet that redraws itself keeps your scroll position; the week strip moves by arrow and by swipe, a day opens on what it is rather than on an editor, two sessions in one day are both counted, a movement can be counted in reps or in seconds, no two pieces of painted text share a box, no help page prints a placeholder it forgot to evaluate, every one of the sixty-odd sheets opening without painting a blank or the name of an icon, Today naming the movements in the session it offers without seeding them into the save, today's stretch opening with its list folded away and the presets in reach, the welcome screen not promising a time the flow cannot be done in, onboarding showing a real generated first session before it asks for the week — built from the kit and the injuries you gave it and leaving no trace of itself in the save, no emoji is painted on any screen or sheet — including the clock-and-stopwatch block a training app actually reaches for, every onboarding option drawing an icon rather than naming one and no screen giving all of its options the same icon, the day strip's three columns share a baseline whatever is filled in, the ascent on Progress is drawn from the markers you actually reached and draws them exactly once, its waypoints sit on the trail rather than beside it, every connector fills the row it spans and the ridge never paints over the words, the screen header stays put when you scroll past it — clearing the notch by exactly one notch, over a band that is opaque to what passes under it and invisible against the sky it sits on, motion arrives once rather than on every render, the session rail moves in place rather than by re-rendering, the rail breaks where the block changes and fills the movement after a break rather than the break, rest names the set on the other side of it, a record is taken back when the set that set it is corrected downward, the finish sheet lists what you beat, a rest running out is audible and the bar puts itself away, the builder offers a superset in every gap but not after the last movement, ticking the first half of a pair starts no rest and the second half does, a set row offers what you did in that slot last time and records the unrounded weight behind the rounded one it painted, typing into set 1 carries down without rebuilding the card, a personal best marks the row it happened in and is taken back with the set, the RPE column can be turned off for the width, only the movement you are on is a full card and every other one is still there as a line, a movement you open by hand stays open when the screen repaints, a hold asks for no weight and offers a button that runs it while a loaded lift still asks, every set row is one line and the same height whatever it carries, the session rail pins to the top of the screen — clearing a faked notch by exactly one notch, over a band nothing scrolls through, the range divides by work rather than by movement count and each movement lights its own share of it wherever in the session it sits, the trail underneath divides where the range does, and the icon set carries more than one colour — every tone it declares resolving to a distinct one, the mass drawn under the line, a category colour never overruling a state colour, a button that presses down as well as in and sweeps light across itself once per tap, the skyline on Today drawing itself on when you arrive and not on every render after it, the week drawn as an arc that is absent at zero and does not wrap past full, and the route drawn as a trail — one waypoint per day, exactly one of them where you are, covered above it and open below, a day naming its constraint only when it is not the default |
| `node fuel.mjs` | meal suggestions are deterministic, hit the target, and never break a stated dietary restriction; a preset food can be corrected to match your packet without rewriting what you already ate, one entry can be corrected on its own, bare macros can be logged with no food behind them, a day is grouped into meals, the ring's three arcs each carry their own circumference, food and water are two faces of one card that sizes to whichever is in front and never rebuilds the bottle to switch, a two-word food can actually be typed into the search, foods are named the way people say them, and every food's calories match its macros by the Atwater factors |
| `node engine.mjs` | the week spreads across all seven days, references never dangle, one clock drives everything, a Fuel bar means what it looks like, a recovery day is mobility spread across the body with nothing to beat, a routine warm-up matches what the routine trains, a session logged after the fact lands on the day it happened, a day can end at 4am instead of midnight, a circuit runs across the list before it repeats, the sky follows the wall clock rather than your day boundary, the exercise catalogue has no duplicate or malformed rows, editing around a superset breaks the pair rather than re-forming it, every badge the catalogue can produce has a tone and no movement earns more than three, a record needs something to beat, changing units converts every stored weight rather than relabelling it, only a loaded lift can have an estimated one-rep max, a session records the time you were in it rather than the gap between opening it and closing it, a session finished by mistake can be picked back up with every movement it started with rather than only the ticked ones — its progression unwound, its day taken back off the week, and only while it is the last one logged today, Train offers a start button whether or not the day is done, a timed movement has a button that runs it and starting one never ticks it, a marker counting because you passed it rather than because it was recorded — listed once, dated only when the date is known, and a restored history starting the journey where it started; age landing in a band that says when two hard days touch and moves nothing for it, the protein target already clearing every age-adjusted floor, age changing nothing it has no evidence for, losing fat is a goal you can pick — taking calories off maintenance, raising protein into the range that holds lean mass, resolving to a cut when asked to bulk and cut at once, and never landing under the resting rate; the size goal buying accessory sets out of the minutes left over rather than out of a movement, and the strength goal buying rest; the age floor raising the protein target rather than merely clearing it, and the age you gave surviving a no to Fuel; and a movement that covers ground asks for a distance instead of a weight — with its own unit, a pace derived from the minutes, speed rather than pace on wheels, and the Enter key still stepping weight → reps on everything else |
| `node stretch.mjs` | the catalogue is deep enough that an hour is a fraction of it and every region can carry a focused session, a preset stays inside the areas it names while still honouring your injuries and your kit, every hold accumulates about a minute on its area, a session is the length you asked for from five minutes to an hour, every option chip carries a drawn icon and none of them is an emoji, the daily stretch is doable where you are, an injury still excludes work here, a band movement needs bands, it is the length you asked for, spread across the body rather than piled on one region, it says which of your answers put each movement there — as the heading over a group rather than as a chip on every row, on one line, with every movement under exactly one of them including the ones there is no reason to give, ticking it logs no session and sets no weight, an unfinished day never breaks the run, today's list can be saved as an ordinary routine, and it runs on the Train screen with the holds arriving as holds without ever discharging the day you committed to; and the body map — every muscle drawn inside the body it belongs to, every muscle the engine reasons about reachable on it, a tap from anywhere on the figure landing on something, the female figure a different shape rather than the same one relabelled, the heat a share of your own week and cold when there is none of it, every sore-area marker a place on the body and a 44px target, and a tap answering in the vocabulary the figure is showing |
| `node scan.mjs` | an EAN-13 is read off generated pixels at four module widths, in shadow, over-lit, noisy and through a reflection; a wrong guard or a failed checksum is refused; a UPC-A and its EAN-13 are one packet; closing the sheet turns the camera off; and the Open Food Facts lookup is off by default, sends nothing but the barcode, falls through on every kind of failure, and shows what it found before saving it |
| `node import.mjs` | a PDF decodes without a library, a rep range survives WinAnsi, a plan splits into days, a written name finds the right movement in the catalogue, an index in front of a movement is read as an index rather than matched as part of its name, an index left pending by an unreadable line does not merge into the next one, a day's own subtitle is not imported as a sixty-five-minute movement, a prescription that states sets and leaves the reps open keeps both, a circuit written as rounds is not named "rounds", while a paragraph about sets is still not a movement, a stated warm-up opens the session instead of deriving its way into the accessories, a 7A/7B pair sits under one heading with no rail break through it, and nothing is built until you say so |
| `node native.mjs` | the Capacitor bridge is inert on the web, mirrors saves on device, never restores over live data, and schedules one rest alert per rest — asked for once, withdrawn when the rest is skipped |

`png.mjs` is the shared PNG decoder and ink-vs-background analysis used by both contrast instruments. Everything else at the root (`diag*.mjs`, `shot*.mjs`, `probe.mjs`, `lose*.mjs`, `tiers.mjs`, `freq.mjs`, `resil.mjs`, `nostore.mjs`, `sheet.mjs`, `final.mjs`, `gaps.mjs`) is a one-off probe kept for reference; none are part of the suite.

The full sweep takes roughly 15 minutes. Run `test.mjs` and `dupes.mjs` on every change; run the rest before shipping. `sw.mjs`, `blanks.mjs`, `engine.mjs` and `fuel.mjs` need `npm install` first, and take about two minutes between them.

Every instrument here has to be able to fail, and both new ones were checked against the bug they were written for. Reinstate the Blob registration and `sw.mjs` goes from 17 passed to 12 failed rather than hanging or crashing. Put the legacy Fuel tile back and `blanks.mjs` goes red on Today with `"0 / undefined kcal"`. Each of `engine.mjs`'s four subjects was reverted individually and the matching checks confirmed red — the weekend one prints `[0,1,2,3,4]`, the bar one prints `["100%","100%","50%"]`. Put `sh.scrollTop = 0` back in `openSheet` and `blanks.mjs` goes 83/3 with the real distances printed (`1211 → 0` on the builder, `10106 → 0` in the picker); restore that and put `closeSheet()` back in `pick-finish` and it goes 85/1. The recovery and warm-up checks were reverted one subject at a time too — dropping the `type === 'recovery'` branch prints `squat, push-h, pull-h, pull-h, cardio`, a flat least-recent sort prints `6 glutes, 3 regions`, and removing the mobility guard in `applyProgression` prints `mob-cat-cow → 9 (from 8)`.

The week-strip and day-sheet subjects were reverted the same way — the old `day-tap` routing prints `open-week, wk-avail, wk-avail, wk-avail, wk-avail, wk-avail, open-week`, which is exactly the complaint that prompted the change.

**Two probes here were date-fragile and went red the first time the suite ran on a Monday.** `engine.mjs`'s Fuel-bar check seeded `weekStart()+0,1,2` and read the first three bars — but the chart is a *trailing* seven days ending today, so on a Monday two of the seeded days are in the future and the three bars read are last week's empty ones. `blanks.mjs`'s past-day probe used `today−2`, which falls into last week early in one. Both now count back from `today()` and look things up by date key rather than by position. If a probe needs a specific relative day, take it from what the screen is actually showing.

Three probes in `blanks.mjs` had to be rewritten to *fail* rather than throw: a missing element meant `.click()` on `null`, which killed the instrument before it printed anything, so a reverted subject looked like a hang rather than a red. **A probe that throws has not run.** Return a fully shaped object on the miss.

Two of those checks were written wrong first and passed for the wrong reason: on a fresh profile every mobility movement has the same `lastDate`, so the alphabetical tiebreak interleaved regions by luck and the spread check could not fail. Both now seed a real history. **A check whose subject you have not reverted is not a passing check, it is an untested one** — if you add an instrument, prove it red before you trust it green.

---

## Deployment

**Today:** upload `index.html`, `sw.js`, `manifest.webmanifest` **and `icon.svg`** to any static host — Cloudflare Pages, GitHub Pages, Netlify. Then on the phone: Safari → Share → Add to Home Screen.

Live at **https://guzofit.app**, served by a **Cloudflare Worker** that builds from `main`. `wrangler.jsonc` is the deploy config; the Worker's `name` in it must match the Worker in the Cloudflare dashboard exactly, or a deploy creates a second Worker, goes green, and changes nothing.

Cloudflare runs `./build.sh` and then `npx wrangler deploy`. The published directory is **`dist/`**, which `build.sh` regenerates with exactly the four deployed files — pointing the Worker at the repo root would publish `build/`, `docs/` and every test instrument.

`lroy413.github.io/Guzo/` still serves the same build from GitHub Pages and is useful as a staging URL. There is deliberately no `CNAME` file: the domain belongs to Cloudflare, and letting Pages claim it too would mean two hosts fighting over one name.

**There used to be two deployments.** `guzofit.app` was hosted separately and never received a single push from this repo: it served a build older than the Fuel screen, with no `sw.js` at all, while every release landed on the `github.io` URL nobody was opening. If a version ever looks stuck again, read the build stamp in the boot panel — `build.sh` writes it into plain markup precisely so a host can be asked what it is serving without executing the page.

Nothing in the app hardcodes a path. The worker registers `sw.js` relatively and its `SHELL` is `./`, so the site works identically at a domain root or under a subpath.

Updates reach an installed app because the worker is network-first on navigation: it serves the cached shell only when the network fails or is slower than 3.5s. Cache-first would pin a phone to whatever it first installed, and there is no in-app update prompt to rescue it.

**Domain:** `guzo.app` was already taken, which is why the product is "Guzo Fit". No domain is wired up yet.

**Storage on device.** `localStorage` stays the primary store — it is synchronous and `load()` runs at boot before any async API could answer. Capacitor Preferences is a *mirror*, written after each save and read only when localStorage comes up empty. That is what survives a WebView eviction, which is the one way a user loses everything. `restoreFromNativeIfEmpty()` only ever fills a hole; it declines if the current state has anything in it.

**Native (iOS):** `guzo-native/` holds a Capacitor 8 scaffold — `capacitor.config.json` (`appId: com.guzofit.app`), a `package.json` pinning `@capacitor/ios`, `@capacitor/haptics`, `@capacitor/local-notifications`, `@capacitor/preferences` and `@capgo/capacitor-health`, and a GitHub Actions workflow (`.github/workflows/ios.yml`) that builds on a macOS runner using an App Store Connect API key, so no Mac is required. The web build must be copied to `guzo-native/www/index.html` before `cap sync`. **None of the native plugins are wired into the app yet** — no HealthKit reads, no notifications. The full plan is in `guzo-native-wrap-plan.md`.
