# Status

Verified against the build at **490,608 bytes**, `VERSION = '1.1.0'`.
Last full sweep: all instruments green except the known bug below, which no instrument covers.

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
| Accessibility | 44px minimum targets, 11px font floor, WCAG AA on 527 screen + 818 sheet text nodes, reduced-motion honoured, pinch zoom unblocked. |

---

## Half-built

**Native iOS wrap.** `guzo-native/` has a Capacitor 8 scaffold: config, `package.json` pinning the plugins, a GitHub Actions workflow that builds on a macOS runner with an App Store Connect API key, a README and a PRIVACY.md. **Nothing is wired.** No HealthKit reads, no local notifications, no Preferences-backed storage. The web build is not automatically copied into `guzo-native/www/`. Plan: `guzo-native-wrap-plan.md`.

**Billing.** `S.billing = {pro, plan, trialStart}` exists and a paywall sheet renders, but nothing gates on it. Fuel is labelled `PRO` in the More screen and is free to switch on.

**Legacy nutrition surface.** Superseded by the Fuel screen but still present and still wired: `nutritionTileHTML()`, `QUICKFOODS`, and the `nut-quick` / `nut-custom` / `nut-add` / `nut-del` / `nut-targets` handlers in `p7_events.js`. `sheetNutrition()` is now just a redirect to the Fuel screen. The tile still renders on Today — see the bug below.

**Version drift.** `VERSION = '1.1.0'` in `p3_data.js`; `guzo-native/package.json` says `1.2.0`. Nothing reconciles them.

**Programme switching mid-week.** `set-program` changes `S.profile.programId` but does not rebuild or re-flow the current week, so the rotation shown can belong to the previous programme until the week rolls over. Not obviously wrong, not obviously right — undecided.

---

## Broken

### 1. The legacy Fuel tile prints "undefined" on Today — CONFIRMED

**Repro**
1. Fresh state with `S.nutrition.targets = {}` (this is what `nut-target-reset` leaves when `energyTargets()` returns null, i.e. no height/age on file).
2. Turn Fuel on (More → Modules → Fuel).
3. Go to Today and scroll to the bottom.

**Observed:** `0 / undefined kcal` and `0g of undefinedg`.

**Cause:** `nutritionTileHTML()` in `p6_more.js` reads `S.nutrition.targets` directly instead of falling back through `energyTargets()` the way the Fuel screen does.

**Correct fix:** delete the tile. It is a worse duplicate of the Fuel screen's day card, and Fuel has its own nav tab now. Remove the call at `p5_ui.js:249`, then `nutritionTileHTML` and `QUICKFOODS`, then the orphaned `nut-*` handlers.

**Why no instrument caught it:** neither `contrast.mjs` nor `collide.mjs` asserts anything about text *content*, and `test.mjs` never renders Today with Fuel on and empty targets.

### 2. Weekend days never get a session by default

**Repro:** fresh profile, all seven days at default availability, any programme with `target ≤ 5`. Open Today on a Saturday.

**Observed:** the whole week's plan sits on Mon–Fri; Saturday and Sunday are empty and the hero reads "unplanned".

**Cause:** `buildWeekPlan` sorts usable days by available minutes and takes the top N. With every day equal, the sort is stable and `.sort()` on the date keys leaves Monday first — so the first five calendar days always win.

**Severity:** low now that the order list offers empty days explicitly, but it means a Saturday-first user meets an empty plan.

### 3. Fuel week bars saturate at 100%

`renderFuel` computes `pct` up to 140 and then clamps the bar height to 100. A day 40% over target is visually identical to a day exactly on target. The numeric readout is correct; only the bar misleads.

### 4. Deleting a routine leaves a dangling reference

If a routine is assigned to a planned day and then deleted, `week.plan[k].routineId` still points at it. `planLabel()` renders `"Deleted routine"` and nothing crashes, but the day is unstartable — the hero's Start button calls `buildRoutineSession`, which returns null. There is no cleanup and no repair path in the UI.

### 5. Test-suite clock dependency

The week-ordering tests override `today()` to a fixed Tuesday. Anything that reads the real clock instead — `weekStart()` does — can drift relative to the override. It is correct today; it is fragile. Any new time-sensitive test must pin the clock the same way and should not mix pinned and real time in one fixture.

---

## Next five, in priority order

### 1. Delete the legacy nutrition surface
Fixes bug #1, removes roughly 80 lines of dead code and five orphaned event cases. Lowest risk, highest ratio. Add a `test.mjs` case that renders Today with Fuel on, empty targets, and asserts no `undefined`/`NaN` anywhere in `#today-body` — that assertion is worth running across every screen.

### 2. Wire HealthKit sleep in the native wrap
Sleep is the signal that changes what the app does; it drives readiness, which sizes the session. Steps are noise by comparison. `@capgo/capacitor-health` is already pinned. This is also what makes the native build worth shipping at all, alongside a wake lock that actually holds.

### 3. Warm-up ramp calculator
Given a working weight, produce the ramp sets. It is deterministic, it is the most-requested thing missing from a session screen, it needs no new data, and the plate calculator already knows how to express a load in plates.

### 4. Supersets
Structurally the largest remaining gap in the session model. `S.active.exercises` is a flat list; supersets need a grouping concept that survives generation, reordering, the rest timer, and progression. Design it before writing it — and note that the routine builder will need to express it too.

### 5. Repair paths for dangling references
Fixes bug #4 and the class it belongs to. On load, sweep `week.plan` for `routineId`s that no longer resolve and clear them; do the same for `lifts` and `videos` keyed to exercise ids that no longer exist. One function, called once at boot, plus a test that deletes a referenced routine and asserts the week is still startable.

---

## Explicitly deferred

- **CSV export.** JSON export works and round-trips. CSV is a nicety.
- **AI-assisted workout building.** Scoped, not started. Needs a proxy to hold an API key (the app has no backend). The recommended shape is constrained generation against the existing 236-exercise catalogue with client-side validation — the model proposes IDs, the deterministic engine still disposes. Estimated a weekend to function, a week to trust. Cost is negligible (~$0.004 per generated session on Haiku with the catalogue cached).
- **Scheduling routines into future weeks.** They can be assigned to any day of the current week; next week's plan is not addressable yet.
- **Multi-device sync.** See `docs/decisions.md` — deliberately out of scope.
