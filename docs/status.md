# Status

Verified against the build at **492,541 bytes**, `VERSION = '1.1.0'`.
Last full sweep: all instruments green. Nothing known is broken.

---

## Finished and tested

| Area | State |
|---|---|
| Onboarding | Complete. Seeds starting weights from stated experience, deliberately conservative. |
| Session generation | Complete. 236 exercises, 6 programmes, 3 environments, 4 session sizes. |
| Progression | Complete. Learned weights per lift, deload after two sessions short of target. |
| Readiness check-in | Complete. Scored against your own sleep norm, sizes the session, explains itself. |
| Week planning | Complete. Availability + environment per day, plan distributed across the days with the most time. |
| Week ordering | Complete and new. Pin / swap / reflow, move a session between days, place one on an empty day. |
| "Already trained this week" | Complete. Marks days spent without inventing session records. |
| Custom routines | Complete. Build, reorder, run as an extra, or assign to a planned day. |
| Form guides | 45 SVG diagrams, two frames each, anatomically checked. Reachable mid-session. |
| Plate calculator | Complete. Owned-plate aware, persists bar weight, follows the weight you type. |
| Last-time recall | Complete. |
| Fuel (nutrition) | Complete. 113 foods, custom foods, portions, edit/delete, copy-a-day, recents. |
| Adaptive TDEE | Complete. Refuses implausible answers and names under-logging as the cause. |
| Protein-only mode | Complete. Hides calories everywhere without deleting data. |
| Profile | Complete. Height, weight, age, sex, activity → Mifflin-St Jeor BMR and TDEE. |
| Daily metrics | Complete. Steps, sleep, bodyweight, manual entry. |
| Journey / milestones | Complete. |
| Export / import | Complete, JSON only. |
| Boot resilience | Complete. Static fallback panel; a blank screen is impossible. |
| Offline / PWA | Complete, and only recently true — see below. `sw.js` registers, caches the shell, opens with the network off, and stays network-first so updates still land. Covered by `sw.mjs`. |
| Deployment | Live on GitHub Pages from `main` at https://lroy413.github.io/Guzo/. Two files: `index.html` + `sw.js`. |
| Accessibility | 44px minimum targets, 11px font floor, WCAG AA on 527 screen + 818 sheet text nodes, reduced-motion honoured, pinch zoom unblocked. |

---

## Half-built

**Native iOS wrap.** `guzo-native/` has a Capacitor 8 scaffold: config, `package.json` pinning the plugins, a GitHub Actions workflow that builds on a macOS runner with an App Store Connect API key, a README and a PRIVACY.md. **Nothing is wired.** No HealthKit reads, no local notifications, no Preferences-backed storage. The web build is not automatically copied into `guzo-native/www/`. Plan: `guzo-native-wrap-plan.md`.

**Billing.** `S.billing = {pro, plan, trialStart}` exists and a paywall sheet renders, but nothing gates on it — and nothing can. Its only reader is `can()`, which returns early on `BETA_UNLOCK_ALL` and has no callers, and no code path sets `pro` to true. `can()` now has exactly one caller, deciding whether the Fuel row shows a `PRO` badge, so the scaffolding is at least attached to something real.

**Legacy nutrition surface.** Deleted — see below. `sheetNutrition()` survives as a redirect into the Fuel screen so any stale entry point still lands somewhere sensible.

**Version drift.** `VERSION = '1.1.0'` in `p3_data.js`; `guzo-native/package.json` says `1.2.0`. Nothing reconciles them.

**Programme switching mid-week.** `set-program` changes `S.profile.programId` but does not rebuild or re-flow the current week, so the rotation shown can belong to the previous programme until the week rolls over. Not obviously wrong, not obviously right — undecided.

---

## Fixed since the last sweep

### The service worker never registered — offline support did not exist

The worker was assembled as a Blob and registered by object URL. A worker script has to be fetched over http(s), so every browser rejected it with *"The URL protocol of the script is not supported"*, and the `.catch(() => {})` around the call meant nothing was ever reported. Verified in Chromium before fixing: zero registrations, zero caches, zero console output.

So the app had **no offline capability at all**, for the whole life of that code, while `decisions.md` called working with no signal "a product promise, not a nice-to-have". Nothing caught it because no instrument drove a browser and pulled the network out, and reading the caching strategy told you nothing about whether it ran.

Fixed by shipping a real `build/sw.js`, copied to the site root by `build.sh`. Navigation is network-first with a 3.5s bound, everything else cache-first; the cache is keyed to `VERSION` via the registration query string and stale caches are retired on activate. Registration is still allowed to fail — upload only `index.html` and the app runs online-only — but it now says so in the console instead of pretending.

Cost: the deploy is two files rather than one. That constraint was explicitly released.

`sw.mjs` covers it, and was itself checked against the bug: reinstating the Blob registration takes it from 17 passed to 12 failed.

---

### The legacy Fuel tile printed "undefined" on Today — bug #1, now gone

`nutritionTileHTML()` read `S.nutrition.targets` raw, so a profile with no height or age on file rendered `0 / undefined kcal` and `0g of undefinedg` at the bottom of Today. Fixed the way this document prescribed: the tile is deleted rather than patched. It was a worse duplicate of the Fuel screen's day card, and Fuel has had its own nav tab for a while.

Gone with it: `nutritionTileHTML`, `QUICKFOODS`, and the five orphaned handlers `nut-quick`, `nut-custom`, `nut-add`, `nut-del`, `nut-targets`. The `nut-target-*` handlers stay — those are live, produced by the Fuel screen. About 4.4 KB and two top-level declarations lighter.

`blanks.mjs` is the regression test, and it is the assertion this document asked for: no `undefined`, `NaN` or `[object Object]` on any screen, across three empty states. Proven red — reinstate the tile and it fails on Today with the exact observed string.

### The last four bugs — all fixed, all covered

**Weekend days never got a session.** `buildWeekPlan` sorted usable days by available minutes and took the top n. `.sort()` is stable, so with every day at the same default the whole week was one band in calendar order and `.slice(0, n)` took Mon–Fri every time; a five-day programme put nothing on the weekend, and a Saturday-first user met an empty plan. Minutes still decide outright — `pickDays()` walks the bands from most to least available — but when a band holds more candidates than slots left, the picks are spaced across it. Seven equal days at a target of three now gives Mon/Thu/Sun.

**Fuel week bars saturated at 100%.** `pct` was computed up to 140 and then the fill was clamped to 100, so a day 40% over target was drawn identically to one that landed on it. The track now spans to `FUEL_BAR_CEIL` with a hairline at the 100% mark, so a bar is read against where the target actually was. Deliberately not a colour change: nothing in Fuel goes red, and the instrument asserts that.

**Deleting a routine left a dangling reference.** `deleteRoutine` spliced the list and nothing else, so `week.plan[k].routineId` kept pointing at nothing: the day rendered as "Deleted routine" and was unstartable, with no repair path in the UI. `repairRefs()` now runs on delete and again at boot — before `buildWeekPlan`, so a stale entry is not mistaken for a settled day — and the day falls back to an ordinary planned session rather than being emptied. It also drops `lifts` and `videos` keyed to exercise ids that no longer resolve. The boot sweep matters for devices that already deleted a routine before this existed.

**Two clocks.** `weekStart()` defaulted to `new Date()` while `today()` went through `dk()`, so a fixture pinning `today()` left `weekStart()` on the real clock. It was correct on the day it was written and would have drifted the next time the real date crossed a Monday. `weekStart()` now defaults through `today()`.

### The Fuel module row read as a paywall

The More row rendered `Fuel PRO` with an empty chevron slot when off. No affordance said "switch", and the badge said "locked" — so the reasonable move was to go and activate Pro, which does nothing at all, and Fuel stayed out of the navbar. This cost a real debugging session that started as "is the latest file deployed?".

`billing.pro` gates nothing anywhere. Its only reader is `can()`, which returns early on `BETA_UNLOCK_ALL` and has no callers; no code path even sets `pro` to true.

The badge is now `${can('nutrition') ? '' : ' <span class="pro-tag">PRO</span>'}` — invisible during the beta, back automatically if a tier ever locks it — and the control is the same `.switch` the mobility row below it uses, so it shows both states. That also retires a hairline `✓`, which fragile area 8 says fails a pixel-sampled contrast check.

---

## Broken

Nothing known. The four that were listed here are fixed below; each one has a
check in `engine.mjs` that was proven red against it first.

---

## Next three, in priority order

### 1. Wire HealthKit sleep in the native wrap
Sleep is the signal that changes what the app does; it drives readiness, which sizes the session. Steps are noise by comparison. `@capgo/capacitor-health` is already pinned. This is also what makes the native build worth shipping at all, alongside a wake lock that actually holds.

### 2. Warm-up ramp calculator
Given a working weight, produce the ramp sets. It is deterministic, it is the most-requested thing missing from a session screen, it needs no new data, and the plate calculator already knows how to express a load in plates.

### 3. Supersets
Structurally the largest remaining gap in the session model. `S.active.exercises` is a flat list; supersets need a grouping concept that survives generation, reordering, the rest timer, and progression. Design it before writing it — and note that the routine builder will need to express it too.

---

## Explicitly deferred

- **CSV export.** JSON export works and round-trips. CSV is a nicety.
- **AI-assisted workout building.** Scoped, not started. Needs a proxy to hold an API key (the app has no backend). The recommended shape is constrained generation against the existing 236-exercise catalogue with client-side validation — the model proposes IDs, the deterministic engine still disposes. Estimated a weekend to function, a week to trust. Cost is negligible (~$0.004 per generated session on Haiku with the catalogue cached).
- **Scheduling routines into future weeks.** They can be assigned to any day of the current week; next week's plan is not addressable yet.
- **Multi-device sync.** See `docs/decisions.md` — deliberately out of scope.
