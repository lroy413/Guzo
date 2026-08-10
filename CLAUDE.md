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
| App | One HTML file — inline `<style>`, inline `<script>` — plus `sw.js`. No third-party requests, ever. |
| Language | ES2020 vanilla JS, `'use strict'`, one global script scope |
| Persistence | `localStorage`, single key `guzo.v1` |
| Build | `build.sh` — `cat` of ordered part files |
| Tests | Playwright (headless Chromium) driving the built file over a local `http.createServer` |
| Native shell | Capacitor 8 (iOS), in `guzo-native/` — scaffolded, not yet wired |

**The only network code in the entire app** is a service worker that caches the app shell — `build/sw.js`, emitted to the site root as `sw.js` and registered from `p7_events.js`. Nothing else fetches anything, ever. This is deliberate — see `docs/decisions.md`.

**The deploy is two files, not one.** `index.html` and `sw.js`. A worker script has to be fetched over http(s), so it cannot be inlined, built from a Blob, or served as a `data:` URL — an earlier version tried the Blob route and registered nothing at all, silently, for the entire life of the file. If only `index.html` is uploaded the app still runs, online-only, and says so in the console.

---

## File structure and how it connects

```
/
├── build.sh                  ← the build. PARTS order IS the load order.
├── GuzoFit.html              ← build output (gitignored; identical to index.html)
├── index.html                ← deployed file 1 of 2
├── sw.js                     ← deployed file 2 of 2; copied from build/sw.js
├── package.json              ← playwright, for the instruments
├── .nojekyll                 ← Pages serves the tree verbatim
├── build/
│   ├── p1_head.html          ← <head> + ALL CSS (~63 KB). Design tokens at the top.
│   ├── p2_body.html          ← all screen markup, nav, sheet container, boot fallback
│   ├── p3_data.js            ← constants, 267 exercises, 6 programmes, copy strings
│   ├── p3b_intake.js         ← onboarding question definitions
│   ├── p3c_form.js           ← 45 hand-built SVG form diagrams
│   ├── p4_engine.js          ← state, dates, units, readiness, session generation, week plan
│   ├── p4b_journey.js        ← milestones, MET calorie estimates, bodyweight
│   ├── p4c_daily.js          ← steps / sleep / weight, wake lock
│   ├── p4d_plates.js         ← barbell plate maths, last-time recall
│   ├── p4e_routines.js       ← user-built routines
│   ├── p4f_body.js           ← height/age/sex/activity, Mifflin-St Jeor BMR, TDEE
│   ├── p4g_food.js           ← 113-food library, portions, logging
│   ├── p4h_energy.js         ← adaptive TDEE, weekly intake, protein targets
│   ├── p4i_order.js          ← week ordering: pin / swap / reflow / trained-elsewhere
│   ├── p4j_meals.js          ← diet preferences, dietary tags, suggested meals
│   ├── p4k_native.js         ← Capacitor bridge: storage mirror, haptics. Inert on the web.
│   ├── p5a_onboard.js        ← onboarding flow
│   ├── p5_ui.js              ← render(), Today, Plan, Train, Progress + shared helpers
│   ├── p6_more.js            ← More screen, Settings sheet, week sheet, exercise picker
│   ├── p6b_help.js           ← help and guide sheets
│   ├── p6c_daily.js          ← daily-metrics sheets
│   ├── p6d_routines.js       ← routine sheets
│   ├── p6e_profile.js        ← profile sheet
│   ├── p6f_fuel.js           ← Fuel screen + all food sheets
│   ├── p6g_order.js          ← week-order sheets
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
- **Schema version:** `VERSION = '1.2.0'` — now matching the root `package.json` and `guzo-native/package.json`. Bump all three together; the service worker keys its cache off this one, so a release rotates the cache cleanly
- **Legacy migration:** `LEGACY_KEYS = ['fittrek.v1']` — on load, if the current key is missing *or holds an empty state*, a meaningful legacy blob is copied across. The "or holds an empty state" part is deliberate: opening the app once before restoring would otherwise orphan the old save behind a blank one.

### State shape (`blank()` in `p4_engine.js`)

| Key | Shape | Notes |
|---|---|---|
| `v` | string | schema version stamp |
| `onboarded` | bool | gates the onboarding screen |
| `profile` | object | `name, units('kg'\|'lb'), goals[], level, envs[], programId, bodyweight[{d,w}], injuries[], priorities[], sleepNorm, sessionMins, dayStart, dayStartSeen, cardio{}, gear{}, heightCm, birthYear, sex, activity` |
| `settings` | object | `nutrition, proteinOnly, restMain, restAcc, autoRest, warmup, lineIdx` |
| `week` | object | `{ start:'YYYY-MM-DD', days:{}, plan:{} }` — see below |
| `readiness` | map | date key → `{sleepH, sleepQ, energy, sore, stress, score}` |
| `sessions` | array | completed sessions, append-only |
| `active` | object\|null | the in-progress session |
| `lifts` | map | exercise id → learned working weight / progression state |
| `nutrition` | object | `{ targets:{kcal,p,c,f}, days:{ dateKey:{items:[]} }, custom:[], prefs:{meals,snacks,pattern,exclude[]} }` |
| `billing` | object | `{pro, plan, trialStart}` — scaffolding only, nothing enforces it |
| `journey` | object | `{ reached:{} }` milestone flags |
| `daily` | map | date key → `{steps, sleepH, weight, src}` |
| `videos` | map | exercise id → user-supplied form video URL |
| `routines` | array | user-built session templates |
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

**Measure painted text with a Range, not the element box.** Small interactive text here is deliberately padded out to a 44px target, so element boxes overlap all over the layout by design and a checker using them reports the whole app as broken. `blanks.mjs`'s collision sweep walks text nodes and takes `Range.getBoundingClientRect()`, which is the rectangle the glyphs actually occupy. It also asserts how many nodes it measured, because a sweep that finds nothing by looking at nothing is the same shape of lie as a contrast checker that sampled no pixels.

**A negative vertical margin on an `inline-flex` element does not pull it over the block above.** It sits on a line box, so the margin resizes the line rather than moving the glyphs — measured: `margin-top:-16px` on `.home-late` moved its text by 1px. Use `position:relative; top:` if you actually mean to move something, and expect the collision sweep to catch it when you do.

**Motion has tokens, and every animation is behind `prefers-reduced-motion: no-preference`.** Three curves (`--ease-out`, `--ease-spring`, `--ease-in-out`) and three durations, so nothing in the app moves in a way nothing else does. The screen-arrival stagger is driven by an `.entering` class that `go()` adds and a timer removes — **not** by `.screen.on`, because every render replaces the body's innerHTML and the animation would otherwise replay on every state change. Navigation is the only thing that should feel like arriving.

**The `data-sky` band on `<html>` is ambient light and nothing else.** It shifts the background gradient by time of day (dawn / day / dusk / night) and **must never touch a colour that was measured for contrast** — surfaces, lines and text tokens are identical in all four bands, and `blanks.mjs` asserts it. It reads the wall clock, not `today()`: `profile.dayStart` moves where your day ends and it does not move sunrise.

**Train updates in place, never by re-rendering.** `updateTrainProgress()` moves the rail, the count, the kcal and the clock by touching those nodes directly. A `renderTrain()` mid-session replaces the body's innerHTML, which closes the keyboard and loses your caret — the reason `replaceExCard(i)` exists is to rebuild exactly one card when it folds away. A check that compares `#train-body` before and after proves nothing, because innerHTML is replaced and the element is not; compare an input node.

**A screen is hidden, never removed.** `go()` toggles a class; every other screen's markup stays in the document. So an `id` inside anything two screens render is an `id` that exists twice — Today and Plan both draw the week strip, and giving it one made every lookup find whichever screen had rendered first. Use a class and scope by screen (`#today-body .week`).

**A routine item's `mode` beats the catalogue.** `EX[id].load` is one load type per exercise, which is right for a barbell and wrong for anything you might hold or keep moving through. A routine item carries `mode: 'reps' | 'time'`, and `itemLoad(it)` resolves the two. **Session exercises carry the resolved `load`, so everything downstream reads the item, not the catalogue** — `exerciseSeconds`, `setSummary`, the set-row labels, and the progression guard in `applyProgression`. Miss that last one and a movement set to seconds ratchets its rep target every time you hold it longer. `canRetime()` withholds the choice from loaded compounds, where reps against a working weight is the whole mechanism.

**Sheets that redraw themselves need a key.** `openSheet(html, { key })` remembers scroll position per key for as long as the sheet stack is open. Without one, every redraw jumps to the top — which for the routine builder and the exercise picker, both of which redraw on every single tap, made them unusable past the third movement. If a new sheet ever calls itself from one of its own handlers, give it a key. If it does not, leave it alone; an unkeyed sheet correctly starts at the top. Hand back between sheets with a plain `sheetX()` call rather than `closeSheet()` first — closing pops the one history entry the whole stack rides on and discards the remembered positions.

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
| `node blanks.mjs` | no `undefined` / `NaN` / `[object Object]` reaches any screen; the nav is a floating pill that content can scroll clear of; a sheet that redraws itself keeps your scroll position; the week strip moves by arrow and by swipe, a day opens on what it is rather than on an editor, two sessions in one day are both counted, a movement can be counted in reps or in seconds, no two pieces of painted text share a box, the route on Progress is drawn from the markers you actually reached, motion arrives once rather than on every render, and the session rail moves in place rather than by re-rendering |
| `node fuel.mjs` | meal suggestions are deterministic, hit the target, and never break a stated dietary restriction |
| `node engine.mjs` | the week spreads across all seven days, references never dangle, one clock drives everything, a Fuel bar means what it looks like, a recovery day is mobility spread across the body with nothing to beat, a routine warm-up matches what the routine trains, a session logged after the fact lands on the day it happened, a day can end at 4am instead of midnight, a circuit runs across the list before it repeats, and the sky follows the wall clock rather than your day boundary |
| `node native.mjs` | the Capacitor bridge is inert on the web, mirrors saves on device, and never restores over live data |

`png.mjs` is the shared PNG decoder and ink-vs-background analysis used by both contrast instruments. Everything else at the root (`diag*.mjs`, `shot*.mjs`, `probe.mjs`, `lose*.mjs`, `tiers.mjs`, `freq.mjs`, `resil.mjs`, `nostore.mjs`, `sheet.mjs`, `final.mjs`, `gaps.mjs`) is a one-off probe kept for reference; none are part of the suite.

The full sweep takes roughly 15 minutes. Run `test.mjs` and `dupes.mjs` on every change; run the rest before shipping. `sw.mjs`, `blanks.mjs`, `engine.mjs` and `fuel.mjs` need `npm install` first, and take about two minutes between them.

Every instrument here has to be able to fail, and both new ones were checked against the bug they were written for. Reinstate the Blob registration and `sw.mjs` goes from 17 passed to 12 failed rather than hanging or crashing. Put the legacy Fuel tile back and `blanks.mjs` goes red on Today with `"0 / undefined kcal"`. Each of `engine.mjs`'s four subjects was reverted individually and the matching checks confirmed red — the weekend one prints `[0,1,2,3,4]`, the bar one prints `["100%","100%","50%"]`. Put `sh.scrollTop = 0` back in `openSheet` and `blanks.mjs` goes 83/3 with the real distances printed (`1211 → 0` on the builder, `10106 → 0` in the picker); restore that and put `closeSheet()` back in `pick-finish` and it goes 85/1. The recovery and warm-up checks were reverted one subject at a time too — dropping the `type === 'recovery'` branch prints `squat, push-h, pull-h, pull-h, cardio`, a flat least-recent sort prints `6 glutes, 3 regions`, and removing the mobility guard in `applyProgression` prints `mob-cat-cow → 9 (from 8)`.

The week-strip and day-sheet subjects were reverted the same way — the old `day-tap` routing prints `open-week, wk-avail, wk-avail, wk-avail, wk-avail, wk-avail, open-week`, which is exactly the complaint that prompted the change.

**Two probes here were date-fragile and went red the first time the suite ran on a Monday.** `engine.mjs`'s Fuel-bar check seeded `weekStart()+0,1,2` and read the first three bars — but the chart is a *trailing* seven days ending today, so on a Monday two of the seeded days are in the future and the three bars read are last week's empty ones. `blanks.mjs`'s past-day probe used `today−2`, which falls into last week early in one. Both now count back from `today()` and look things up by date key rather than by position. If a probe needs a specific relative day, take it from what the screen is actually showing.

Three probes in `blanks.mjs` had to be rewritten to *fail* rather than throw: a missing element meant `.click()` on `null`, which killed the instrument before it printed anything, so a reverted subject looked like a hang rather than a red. **A probe that throws has not run.** Return a fully shaped object on the miss.

Two of those checks were written wrong first and passed for the wrong reason: on a fresh profile every mobility movement has the same `lastDate`, so the alphabetical tiebreak interleaved regions by luck and the spread check could not fail. Both now seed a real history. **A check whose subject you have not reverted is not a passing check, it is an untested one** — if you add an instrument, prove it red before you trust it green.

---

## Deployment

**Today:** upload `index.html` **and `sw.js`** to any static host — Cloudflare Pages, GitHub Pages, Netlify. Then on the phone: Safari → Share → Add to Home Screen.

Live at **https://guzofit.app**, served by a **Cloudflare Worker** that builds from `main`. `wrangler.jsonc` is the deploy config; the Worker's `name` in it must match the Worker in the Cloudflare dashboard exactly, or a deploy creates a second Worker, goes green, and changes nothing.

Cloudflare runs `./build.sh` and then `npx wrangler deploy`. The published directory is **`dist/`**, which `build.sh` regenerates with exactly `index.html` and `sw.js` — pointing the Worker at the repo root would publish `build/`, `docs/` and every test instrument.

`lroy413.github.io/Guzo/` still serves the same build from GitHub Pages and is useful as a staging URL. There is deliberately no `CNAME` file: the domain belongs to Cloudflare, and letting Pages claim it too would mean two hosts fighting over one name.

**There used to be two deployments.** `guzofit.app` was hosted separately and never received a single push from this repo: it served a build older than the Fuel screen, with no `sw.js` at all, while every release landed on the `github.io` URL nobody was opening. If a version ever looks stuck again, read the build stamp in the boot panel — `build.sh` writes it into plain markup precisely so a host can be asked what it is serving without executing the page.

Nothing in the app hardcodes a path. The worker registers `sw.js` relatively and its `SHELL` is `./`, so the site works identically at a domain root or under a subpath.

Updates reach an installed app because the worker is network-first on navigation: it serves the cached shell only when the network fails or is slower than 3.5s. Cache-first would pin a phone to whatever it first installed, and there is no in-app update prompt to rescue it.

**Domain:** `guzo.app` was already taken, which is why the product is "Guzo Fit". No domain is wired up yet.

**Storage on device.** `localStorage` stays the primary store — it is synchronous and `load()` runs at boot before any async API could answer. Capacitor Preferences is a *mirror*, written after each save and read only when localStorage comes up empty. That is what survives a WebView eviction, which is the one way a user loses everything. `restoreFromNativeIfEmpty()` only ever fills a hole; it declines if the current state has anything in it.

**Native (iOS):** `guzo-native/` holds a Capacitor 8 scaffold — `capacitor.config.json` (`appId: com.guzofit.app`), a `package.json` pinning `@capacitor/ios`, `@capacitor/haptics`, `@capacitor/local-notifications`, `@capacitor/preferences` and `@capgo/capacitor-health`, and a GitHub Actions workflow (`.github/workflows/ios.yml`) that builds on a macOS runner using an App Store Connect API key, so no Mac is required. The web build must be copied to `guzo-native/www/index.html` before `cap sync`. **None of the native plugins are wired into the app yet** — no HealthKit reads, no notifications. The full plan is in `guzo-native-wrap-plan.md`.
