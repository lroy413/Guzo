# Status

Verified against the build at **613,638 bytes**, `VERSION = '1.2.0'`.
Last sweep: `dupes` + `blanks` (242) + `engine` (120) + `fuel` (37) + `sw` (17) + `native` (16) all green. Nothing known is broken.

---

## Finished and tested

| Area | State |
|---|---|
| Onboarding | Complete. Seeds starting weights from stated experience, deliberately conservative. |
| Session generation | Complete. 267 exercises, 6 programmes, 3 environments, 4 session sizes. |
| Progression | Complete. Learned weights per lift, deload after two sessions short of target. |
| Readiness check-in | Complete. Scored against your own sleep norm, sizes the session, explains itself. |
| Week planning | Complete. Availability + environment per day, plan distributed across the days with the most time. |
| Week ordering | Complete and new. Pin / swap / reflow, move a session between days, place one on an empty day. |
| "Already trained this week" | Complete. Marks days spent without inventing session records. |
| Custom routines | Complete. Build, reorder, run as an extra, or assign to a planned day, with an optional warm-up per routine. The builder and the picker hold their scroll position through every tap. |
| Reps or seconds | Complete. Any movement that is not a loaded compound can be counted either way, per routine item. A timed one counts itself down on the Train screen. |
| Circuits | Complete. A routine can run as a circuit: one pass through the list is a round, rest comes after the round. The Train screen becomes a runner. |
| When a day ends | Complete. `profile.dayStart` moves the boundary off midnight, up to 6am. Applied inside `today()`, so the whole app moves with it. Default 0. |
| Two sessions a day | Complete. Both are kept and both are shown; the session that discharged the day names it. |
| The week strip | Complete. Arrows and swipe move it between weeks — back as far as your first session, forward to next week. A day opens on a summary; the editors are one tap in. |
| Logging a past day | Complete. A day that has gone offers "Add something you did"; the session lands on that date, with its length worked out from the work rather than the clock. |
| Recovery days | Complete. Any day can be set to Recovery: mobility and stretching spread across the body, nothing loaded, nothing to beat. Choosable, never scheduled. |
| Form guides | 45 SVG diagrams, two frames each, anatomically checked. Reachable mid-session. |
| Plate calculator | Complete. Owned-plate aware, persists bar weight, follows the weight you type. |
| Last-time recall | Complete. |
| Fuel (nutrition) | Complete. 113 foods, custom foods, portions, edit/delete, copy-a-day, recents. |
| Diet preferences | Complete. Meals and snacks a day, four dietary patterns, seven exclusions. Asked during onboarding when Fuel is on, editable forever after from Fuel. |
| Suggested meals | Complete. Built from the same 113-food library, portioned against your targets, deterministic per day, and filtered by your restrictions. One tap logs a whole meal. |
| Adaptive TDEE | Complete. Refuses implausible answers and names under-logging as the cause. |
| Protein-only mode | Complete. Hides calories everywhere without deleting data. |
| Profile | Complete. Height, weight, age, sex, activity → Mifflin-St Jeor BMR and TDEE. |
| Daily metrics | Complete. Steps, sleep, bodyweight, manual entry. |
| Journey / milestones | Complete. |
| Export / import | Complete, JSON only. |
| Boot resilience | Complete. Static fallback panel; a blank screen is impossible. |
| Offline / PWA | Complete, and only recently true — see below. `sw.js` registers, caches the shell, opens with the network off, and stays network-first so updates still land. Covered by `sw.mjs`. |
| Deployment | Live at https://guzofit.app via a Cloudflare Worker building from `main` (`wrangler.jsonc`, published directory `dist/`). GitHub Pages still serves the same build at https://lroy413.github.io/Guzo/ and is useful as a staging URL. Two files either way: `index.html` + `sw.js`. |
| Accessibility | 44px minimum targets, 11px font floor, WCAG AA on 527 screen + 818 sheet text nodes, reduced-motion honoured, pinch zoom unblocked. |

---

## Before the App Store

Three of the seven audit items are done — the paywall is gated behind `SHOW_PAYWALL`, there is a real privacy page, and every interactive element is keyboard-reachable and announced.

Four remain, and all four need the native scaffold in the repo first:

1. ~~`guzo-native/` is not in this repo.~~ **Built.** `capacitor.config.json` (`com.guzofit.app`), `package.json` pinning the plugins, `README.md`, `PRIVACY.md`, and `.github/workflows/ios.yml` which builds on a macOS runner. `build.sh` writes the web build into `guzo-native/www/`. `ios/` is generated in CI rather than committed, because it is entirely derived from the config and a committed copy drifts silently.
2. **Guideline 4.2, minimum functionality.** The app makes zero network calls and uses zero native APIs — verified, no `fetch`/`XHR`/`sendBeacon`/`WebSocket` anywhere outside `sw.js`. A Capacitor shell with no native capability is the classic rejection. HealthKit sleep is the answer and is already priority one.
3. ~~Storage durability.~~ **Done.** `localStorage` stays primary and Capacitor Preferences mirrors it, coalesced so twenty-five saves cost one bridge write. `restoreFromNativeIfEmpty()` recovers an evicted WebView and declines in every other case — `native.mjs` asserts that a stale mirror never overwrites live data, which is the rule that matters most.
4. **The missing instruments.** `contrast.mjs`, `collide.mjs`, `ux.mjs`, `test.mjs`, `audit.mjs`, `sheetcontrast.mjs`, `knees.mjs` and `png.mjs` are documented and absent. The floating nav, the Settings sheet and the Suggested section have never faced a pixel-sampled contrast or collision sweep.

Not blockers, worth doing: seven `confirm()`/`alert()` calls are unstyleable system dialogs in a native shell, and there is no web manifest.

## Half-built

**Native iOS wrap.** `guzo-native/` has a Capacitor 8 scaffold: config, `package.json` pinning the plugins, a GitHub Actions workflow that builds on a macOS runner with an App Store Connect API key, a README and a PRIVACY.md. **Nothing is wired.** No HealthKit reads, no local notifications, no Preferences-backed storage. The web build is not automatically copied into `guzo-native/www/`. Plan: `guzo-native-wrap-plan.md`.

**Billing.** `S.billing = {pro, plan, trialStart}` exists and a paywall sheet renders, but nothing gates on it — and nothing can. Its only reader is `can()`, which returns early on `BETA_UNLOCK_ALL` and has no callers, and no code path sets `pro` to true. `can()` now has exactly one caller, deciding whether the Fuel row shows a `PRO` badge, so the scaffolding is at least attached to something real.

**Legacy nutrition surface.** Deleted — see below. `sheetNutrition()` survives as a redirect into the Fuel screen so any stale entry point still lands somewhere sensible.

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

### The deploys were going to a URL nobody was looking at

`guzofit.app` is a separate, much older deployment. `guzofit.app/sw.js` returns 404 — no service worker at all, so it predates the two-file deploy entirely — and its page still renders "Quick log" where the current build renders "Fuel", putting it before the Fuel screen existed. Nothing pushed to this repo has ever reached it.

`https://lroy413.github.io/Guzo/` is and has been current: its live `sw.js` contains `cache: 'reload', credentials: 'same-origin'`, committed minutes before it was checked.

**There are two deployments of this app and only one of them is wired to the repo.** Until `guzofit.app` is pointed at GitHub Pages, or the built files are uploaded to whatever serves it, every release lands somewhere the user does not look.

The app's own footer said `guzofit.com`, which does not resolve at all. Corrected to `guzofit.app`.

Also added: a static build stamp in the boot panel, written by `build.sh` from the single `VERSION` constant. It is plain markup, so which version a host is serving can now be read off the page without executing it — the question that made this take two rounds to pin down.

### Deploys were live but never reached the phone

Two separate reasons, both in our code, neither on the host:

**The worker's "network-first" was not reaching the network.** `navigate()` used a bare `fetch(req)`, which is served by the browser's own HTTP cache — and GitHub Pages sends `Cache-Control: max-age=600` on HTML. So the branch whose entire job is to prefer fresh bytes could be answered from a stale copy without a packet leaving the device. The shell fetch now uses `cache:'reload'`.

`sw.mjs` missed this because its test server sent `no-cache`, which forced a revalidation production never performs — the instrument was kinder than reality. It now sends `max-age=600`, and reverting the fix takes it from 17 passed to 12 passed / 5 failed, with the update check returning null.

**An installed app resumes; it does not navigate.** Reopening from the Home Screen restores the existing page rather than performing a navigation, so the network-first path never ran at all. A phone could sit on a weeks-old build while every deploy since was live. The app now calls `registration.update()` whenever it returns to the foreground, and reloads once when a new worker takes control — guarded so a first-ever visit does not flash, and so a session in progress is never interrupted.

### Fuel now asks how you eat, and suggests accordingly

Onboarding never asked height, age or sex, so `energyTargets()` returned null for every new user and Fuel opened with no target — the same gap that produced the `undefined` tile. Those three, plus activity level, are now asked in chapter four, **only when Fuel is switched on**. That condition is the point: `decisions.md` says nothing is collected for the sake of a longer form, and none of them changes a single set or rep.

Two more screens collect how you actually eat — meals and snacks a day, a dietary pattern, and exclusions — stored in `S.nutrition.prefs` and editable afterwards from Fuel's "How you eat" sheet, which is the only route for anyone who enabled Fuel long after onboarding.

`suggestMeals()` builds a day from the existing library: protein leads, the carb fills the remaining calories, portions round to something a person would actually measure. Variety comes from the date, so the same day always suggests the same plate and reopening Fuel does not reshuffle it. Restrictions are enforced by tags that are deliberately conservative — oats carry `gluten`, dark chocolate carries `dairy` — and **the UI states plainly that this is not an allergen database**.

### More is a hub; Settings is a sheet

More carried four lists, and "Modules" had become a drawer holding two real modules, two destinations and two settings — a switch for the mobility warm-up sat between a link to your routines and a link to the plate calculator.

More is now three lists of places to go: **Your journey** (the journey, your routines, and Route and Today's fuel when Fuel is on, since Route leaves the nav), **Guides**, and **App** with a single Settings row.

`sheetSettings()` holds everything you tune, grouped by what it is about rather than which file implements it: Training (structure, where you train, rest timers, bar and plates, mobility warm-up), Modules (Fuel, and How you eat when it is on), You (profile), and Your data (export, restore, reset).

"Shape this week" was dropped from More entirely. It was never a setting, and Today and Plan already offer it in five places.

The Settings sheet needs its own toggle cases — `set-toggle-fuel` and `set-toggle-warmup`. The More-screen handlers re-render More, which is the wrong surface when the switch being tapped is inside an open sheet: the sheet would sit there showing the old state.

`blanks.mjs` covers it, and the checks that matter are the ones that click every row rather than just reading it. An orphaned action renders perfectly and does nothing when tapped, which looks identical to a row nobody has tried.

The evidence card that sat at the bottom of More is gone. It was a shorter copy of the `why` help page — three studies against five — and two copies of the same prose drift until one of them is quietly wrong. Settings links to the real one instead.

**Known rough edge:** closing a sub-sheet opened from Settings returns you to More, not to Settings. Sheets have no back stack, only a close, and threading a return target through every sub-sheet was more invasive than the annoyance warranted.

### The nav is a floating pill

The old bar was full width, in the flex flow, with its own padding plus the safe-area inset plus a top border — roughly 100px of permanent chrome for five icons. It is now a fixed, blurred pill inset from the edges, about 56px tall, with the selected tab as a filled pill rather than a 2px hairline that antialiased away. The background stays near-opaque deliberately: the labels are `--faint`, and a genuinely transparent pill would leave them over whatever scrolled underneath.

### Progress was correct and lifeless

Asked for directly: *"The progress screen feels clunky and boring. A lot of information but I feel like we should lean into the journey aspect a little more."* Eight stacked cards of accurate numbers, and the one screen where ጉዞ should be visible rather than implied was the one screen that looked like a spreadsheet.

**The route is the hero now.** A trail climbing across the card with your markers pinned along it: solid ground and a solid line behind you, dashed ahead, a teal dot on the trail between the last marker you reached and the one you are walking towards. Underneath it, the next marker named and how far away it is.

Everything in it is real. The trail is your milestones in the order you actually reached them, capped at five shown with the remainder stated rather than dropped ("+3 behind you"). Nothing is invented to make the picture nicer — a journey you did not take is not worth drawing.

Three things it took two passes to get right, all caught by looking at a screenshot of the rendered screen rather than at the code:

- **The ground was filled under the whole width**, including the part ahead of you. That drew a grey panel rather than terrain, and said — wrongly — that ground you have not covered is already yours. Fill is now only under the walked section, running off the left edge and tapering to a slope on the right. Closing it straight down from the last marker drew a wall, which is the one shape terrain never makes.
- **The "you are here" dot sat on top of the last marker**, hiding it and claiming you were standing still on it. It sits between markers now.
- **With nothing reached, the single pin landed at the *start* of the trail** and the dashed line climbed away from it — drawing the thing you are walking towards as something already behind you. The markers are padded to the right-hand end.

**The markers card was hollow.** One session in it was three thin rows with the word "Ahead" on two of them — the absence of information dressed as information. Every row now states what its marker costs, drawn from a `MILESTONE_NEED` table beside the milestones; the one you are walking towards shows your real count against it and a bar; the one you just passed shows the sentence that was written for it, which until now was only ever seen once, in the sheet at the end of a session. Four ahead instead of two, because two makes the road look like it ends just past your feet, and what is beyond them is counted rather than hidden.

Only the next marker carries a bar. Four rows of "1 / 10, 1 / 25, 1 / 50" is a scoreboard of everything you have not done yet, which is the opposite of what the screen is for — the rest state their cost on one line, title left and price right, so the row is balanced instead of a heading with dead space beside it.

`engine.mjs` cross-checks every stated requirement against the milestone's own `test`, by running it one below the stated goal and at it. A number in the copy that drifts from the number that awards the marker is the worst kind of wrong here — the screen would promise one thing and the app do another — and the check prints exactly that when reverted: `s5: awarded at 5, claims 6`.

**The eight-week volume chart became the climb** — the same numbers as ground rather than columns, so a light week is a flat stretch of trail instead of a short bar next to a tall one. The week you are standing in is drawn dashed and labelled "so far", because it is always partial and drawing it solid made the line dive to the floor on a Monday.

**The four tiles became a trail log** — one quiet row of figures between hairlines, instead of four bordered boxes competing with each other and with every card below.

The rest of the screen keeps all its data and gains section headers in the same language: the ground behind you, what you have covered, high points, carrying weight, energy spent.

`blanks.mjs` asserts the drawing tracks the state rather than decorating it — markers reached are solid, the one ahead is not, an empty history draws an empty route, and **the trail passes through its own pins**. That last check found a flaw in itself first: it measured every pin against the walked line, and reported the correctly-placed pin ahead as 53 units adrift because that one sits on the dashed segment. Four subjects reverted individually and confirmed red, including swapping the Catmull-Rom for a curve that only approximates its points — which floats every pin 14 units off the trail.

### A phantom card on Today — reported, not reproduced

Sent as a screenshot at 1:55am: a region on Today with several pieces of text painted on top of each other — "STEPS", "TUE", "Tap to log the day around it", "4", "Off" — and the week strip below the nav missing the cell for Tuesday the 4th.

**It is almost certainly a repaint artifact rather than a layout bug**, and one detail in the image settles it: "STEPS" sits on a different baseline from "SLEEP" and "WEIGHT". Those three labels each follow a fixed-height 23px value inside stretch-aligned flex cells of the same row. There is no state in which CSS puts them on different lines. Two paint states composited into one frame explains every part of the image, including a week-strip cell appearing somewhere its markup never goes.

It could not be reproduced in Chromium. The state was rebuilt exactly — boundary at 4am, clock frozen at 01:55, a circuit routine logged as the day's session, sleep and weight on file, steps empty — across four screens and two times of day, sweeping every text node for overlap. Nothing.

So the work went into the mechanism instead. The only thing that re-renders Today from a touch on that region is the week-strip swipe, added two changes earlier, and it had two hazards worth removing on their own merits:

- **A gesture that scrolled the screen now never counts as a swipe.** The geometry test alone (horizontal travel beats vertical) lets a fast diagonal flick through, and the `render()` it triggers replaces the whole screen's markup while the browser is still painting the scroll.
- **The move is deferred a frame.** `requestAnimationFrame` keeps the re-render out of the browser's own touch-end paint.

Both were reverted individually and confirmed red.

**A real, smaller bug was found on the way.** The after-midnight note bought its 44px touch target with `margin:-11px 0`, and its box ran 4.2px into the date line above — so the last few pixels of "Sun 9 Aug" opened the day-boundary setting instead. Fixed with padding below rather than a negative margin above.

Two things I got wrong while chasing this, both worth recording. The first detector measured element boxes and reported overlaps everywhere, because this codebase pads small interactive text out to 44px on purpose; it now measures painted glyphs with a Range over the text node. And the negative margin turned out not to move anything at all — `.home-late` is `inline-flex`, so it sits on a line box and a negative vertical margin resizes the line rather than shifting the text. `margin-top:-16px` moved its glyphs by one pixel. The hit-target overlap was real; the visual one I assumed alongside it never existed.

The sweep is now part of `blanks.mjs`, asserts how much text it measured, and was proven red against a deliberate collision.

### A movement had one unit, and a routine had one shape

Two requests that turned out to be the same gap: the app was deciding things it should have been asking.

**Reps or seconds is the item's choice now.** The catalogue gives every exercise one load type, which is correct for a barbell — a back squat is reps under load and nothing else — and wrong for everything you might hold or keep moving through. A crunch is 15 reps or 40 seconds depending on how you train, and the app was picking.

A routine item carries `mode`, the catalogue still supplies the default, and `itemLoad()` resolves the two. **Session exercises carry the resolved load rather than the catalogue's**, so `exerciseSeconds`, `setSummary`, the set-row labels and the progression guard all read the item. That last one matters more than it looks: `applyProgression`'s unloaded branch adds a rep every time you clear the target, so a movement switched to seconds would have ratcheted its rep target every time you held it *longer*. Twelve timed sessions took it from 15 to 27 when the guard was reverted to prove the check.

The choice is withheld from loaded compounds. Reps against a working weight is the entire mechanism there — the progression, the plate maths and the e1RM all read it — and switching a bench press to seconds would quietly turn all of that off in exchange for a number nobody wants.

**A timed movement counts itself down.** The rest bar was only ever a rest timer; it now takes a label, an appearance and something to do at zero, so the same bar counts work in teal and rest in ember. Starting it does not tick the set — the timer finishing does — because ticking up front would record work you have not done if you stop halfway.

**Circuits.** Asked as a question worth answering directly: *"I work each exercise once for the duration or reps and move to the next like a superset and then do the whole routine in 3 sets. Is that interval training?"* It is a **circuit**. Interval training means prescribed work-and-rest periods; a circuit means working through a list and repeating it. A circuit whose movements are all timed is fairly called both, which is what this now builds.

A routine can be set to run as one: rounds, and a rest that goes after the round rather than between movements. Per-movement set counts disappear when it is on, because a pass through the list *is* the set.

The Train screen becomes a runner for it. A list of six cards with three set rows each is eighteen checkboxes to hunt for while you are moving continuously — the card screen assumes you stop between sets, which in a circuit you specifically do not. The runner shows one movement, the round you are on, and what is next. **Where you are is derived from which sets are ticked, not stored**: set `r` of exercise `i` is round `r`, so it survives a reload, a crash and leaving the session half-done, and there is no second copy of the truth to go stale. The underlying session is unchanged, so volume, energy, progression and history all work on it without knowing.

Reverting the round-major walk to exercise-major printed `Crunch > Crunch > Bicycle > Bicycle > Plank > Plank` — a superset, which is the thing a circuit is not.

**A check I had to rewrite.** "A movement set to seconds never earns reps" asserted `lifts[].r` stayed `null`, and it went red immediately: `targetFor()` seeds that field at the catalogue's low rep the first time an exercise is used. The value was never *progressed*, just initialised. Asserting it stays at the seed across twelve sessions is the real property and is properly falsifiable.

**And a mistake of my own worth recording.** I ran `git checkout build/p1_head.html` to undo a one-line regression probe and discarded every CSS change for this feature along with it. The suite caught it — the touch-target check went red with `rt-mode=33` — but only because that check existed. `git checkout <file>` takes the whole file, not the last edit.

### Midnight was treated as a fact about people

Reported as a problem the user could not name: *"I do my routines after work, but I get off at 2am. Which in the app counts as the next day but for me it's still the same day cause I haven't went to bed."* And the harder half of it: *"I work out twice a day sometimes, so my main workout would be in the am before work and my late night routine would be in the am after work. Technically next day but not quite."*

That second sentence is the one that made this worth doing properly. Two sessions in a day is already supported — the app keeps every session and an extra never discharges the planned one — but the calendar was splitting a single real day in half. The morning session landed on Monday, the 2am one on Tuesday, and neither day looked like what actually happened: one showed a session with the routine missing, the next showed a routine with no session and a plan going unmet.

`profile.dayStart` is the hour your day rolls over, 0 to 6, defaulting to 0. It is applied **inside `today()`** rather than at any call site, which is the whole reason it is a small change: `today()` is the single clock the app reads, so the week, the plan, readiness, the daily metrics and the food log all move together and none of them have to know the setting exists. Anything that genuinely wants the wall clock — the greeting, the discovery hint, a `toISOString()` audit stamp — reads hours or `Date.now()` and is untouched.

Nothing already saved is rewritten. The setting changes where the line falls from now on, and the sheet says so.

**It had to be visible.** A screen showing a date a day behind is indistinguishable from a bug, so between midnight and the boundary Today carries a line — "Still Mon until 4am" — which is also the way into the setting.

**And it had to be findable.** Someone finishing at 2am does not go looking through Settings for a concept they have no name for; they notice the app put their session on the wrong day and assume that is how it works. So the offer appears in the session-done sheet when the boundary is still midnight and the clock reads between 0 and 5. Answering it either way — including choosing midnight — sets `dayStartSeen` and it never appears again.

**One real bug found on the way.** `muscleVolume()` computed its cutoff from `new Date()` rather than `today()` — a second source of "now", which is exactly what the one-clock rule in CLAUDE.md exists to prevent. It had been there long enough to predate this work and would have silently ignored the boundary.

**And a display bug the second half of the complaint exposed.** With two sessions on a day, the week strip labelled it from whichever came *last* in the array and the Plan list from whichever came *first* — so one day could describe itself two different ways on two screens, depending only on the order things were logged. `daySessions()` now names the day by the session that discharged it and counts the rest: "Upper +1" on the strip, "Logged · Upper + 1 more" on Plan.

**Two probes in the suite were date-fragile and this is how it came out.** `engine.mjs`'s Fuel-bar check seeded `weekStart()+0,1,2` and read the first three bars, but that chart is a trailing seven days ending today — so on a Monday two seeded days are in the future and the three bars read are last week's empty ones. `blanks.mjs`'s past-day probe used `today−2`, which falls into last week early in one. Both had passed for months and went red the first time the suite ran across a Sunday-to-Monday boundary. They now count back from `today()` and look up by date key rather than position. Recorded in CLAUDE.md, because "correct on the day it was written" is the failure mode this project has hit before.

### The week strip only ever showed this week, and every day opened on an editor

Three complaints, one shape: the dashboard could not answer a question, it could only offer to change something.

**The strip moves now.** Arrows either side of the label, and a horizontal swipe. Forward reaches next week — no further, because the plan is only ever built one week ahead and inventing sessions beyond that would be a promise the app has not made. Backward reaches as far as your first logged session, which for a fresh profile is nowhere and for an old one is a year; past weeks show what was actually logged rather than what was planned, because plans are not kept — `S.week` holds exactly one week and is rebuilt when its start key changes. Leaving the screen resets it, since "this week" on a dashboard has to mean this week.

The Plan screen's day list follows the same offset. Two controls on one screen disagreeing about which week you are looking at would be worse than no navigation at all.

**Tapping a day opens on what the day is.** It used to route by whether a session happened to be placed: chips if yes, the availability ladder if no. A day that had gone always took the second branch — so tapping Tuesday asked how much time you expect to have on Tuesday, a question about a day that has already happened, and the way out was a button marked "Done" that went to the week screen rather than back where you tapped from.

Now the calendar decides. A past day gets a summary of what you logged and one action; today and the days ahead get a summary of what is planned, with "Change the session" and "Time and place" one tap further in. The availability editor returns to the day it was opened from, and keeps that route through its own redraws. Nothing routes through the week screen unless you went there yourself.

**A day that has gone can be logged.** "Add something you did" opens an empty session dated to that day, so a day you trained without the app in your hand stops sitting there as a blank forever. Two numbers would have been lies if this were left alone: the duration, because the wall clock measures how long you spent typing (six sets of squats entered on the bus would record as twenty seconds), and `lifts[].lastDate`, which every rotation in the app reads to decide what has gone longest — writing an older date into it unconditionally would send it backwards and re-suggest something you did this morning. The length now comes from the completed work, and `lastDate` only ever moves forward.

**One bug of my own.** The strip carried `id="week-strip"`. Today and Plan both render it and screens are hidden rather than removed, so the id was in the document twice and every lookup found whichever screen had rendered first. It is a class now, scoped per screen. Recorded in CLAUDE.md, because nothing about the symptom points at the cause.

### Recovery days, and an optional warm-up on a routine

Asked for together, and they turned out to share a gap: the app had ten mobility movements and used them one at a time as a warm-up opener on generated full sessions. Nothing else could reach them. A routine you built yourself started cold, and there was no way to say "today is stretching" — a recovery day could only be expressed as a rest day, which is a different thing.

**Warm-ups.** Per routine rather than global, because "abs before bed" does not need one and "hotel full body" does. `r.warmup` defaults off, is backfilled onto older routines in `ensureRoutines()` so a save from before the field existed behaves like one made today, and `buildRoutineSession()` prepends exactly one mobility movement when it is on. The movement is chosen against what the routine actually trains — `WARMUP_REGIONS` maps each muscle to the regions worth opening for it, so an arms routine gets shoulders and thoracic spine and a leg routine gets hips and ankles. Least-recently-done breaks ties, so a routine run three times a week does not open with the same movement every time. If the environment and injury exclusions leave nothing, the routine simply starts without one; a missing warm-up must never stop a session.

**Recovery days.** `'recovery'` is a plan type, so any day can be set to it from the day sheet — but it is in no programme's cycle and `buildWeekPlan` will never place one. A day the app decided was recovery is a rest day with homework.

`recoverySession()` is deliberately not `generateSession` with a smaller budget. A training day shrunk to fifteen minutes is still training. It picks 8 / 6 / 4 / 3 movements by size, and the picks round-robin across body regions before recency, because sorting the mobility pool by least-recently-done — what the engine does everywhere else — fills the whole session with whichever region has gone longest. Nothing carries a load, and Today gets its own hero with no size ladder and no readiness prompt: both of those answer "how hard should today be", and offering them would quietly reframe stretching as a workout you are allowed to shorten. Finishing one marks the day done like any other session.

The rest-day hero also gained "Or stretch for ten minutes", beside the existing three-minute offer. It is an escape hatch, not an obligation — the day still says nothing is owed.

**A real bug fell out of this.** `applyProgression`'s unloaded branch adds a rep every time you clear the target and has no ceiling, because there is no weight to switch to instead. That is right for push-ups and wrong for a stretch: the existing mobility warm-up had been quietly ratcheting, and a recovery day of eight stretches would have made it obvious as "Cat-Cow × 47". Mobility now returns early — `lastDate` is still stamped, because that is exactly what rotates the picks.

The catalogue went 251 → 267, with 16 stretches added so a recovery day has 27 movements across 9 regions to draw on rather than 10 across 4.

Every subject was reverted individually and confirmed red. Two of the checks were wrong on the first attempt and passed for the wrong reason — on a fresh profile every movement has the same `lastDate`, so the alphabetical tiebreak interleaved regions by luck and both the spread check and the warm-up matching check were vacuous. They now seed a real history and compare two routines at opposite ends of the body. A third, "the rest day does not nag", was a keyword blocklist that flagged the correct copy (`Nothing is owed` matches `/owe/`); it was replaced with a positive assertion of the rule instead.

### Building a routine threw you back to the top on every tap

Reported from use, not found by an instrument: *"everytime I choose an exercise it auto scrolls to the top, also when trying to adjust the reps/time it auto scrolls up."*

`openSheet()` is a wholesale `innerHTML` write followed by an unconditional `scrollTop = 0`, which is right for a sheet you are opening and wrong for one that redraws itself. Building a routine does nothing but redraw: the picker rebuilds on every exercise you add, the builder rebuilds on every nudge of the sets or reps, and the two hand back and forth. Past the third movement, every single tap threw you to the top of a long list and you scrolled back down to make the next one.

`openSheet(html, { key })` now remembers a scroll position per key for as long as the sheet stack is open — so a sheet keeps its place both when it redraws itself and when you come back to it from another sheet, which is the builder → picker → builder round trip. Keys are on the eight sheets that call themselves: the routine builder, the exercise picker, Settings, How you eat, profile, readiness, nutrition targets and the week sheet. Unkeyed sheets still open at the top, and `closeSheet()` forgets everything, so reopening a builder tomorrow does not drop you mid-list.

`pick-finish` also stopped calling `closeSheet()` before handing back to the builder. `rt-add` opens the picker over the builder without closing anything, so closing on the way back popped the one history entry the whole stack rides on, pushed a new one, and discarded the remembered positions. It now calls `sheetRoutineEdit(id)` directly; the train path still closes, because that returns to a screen rather than a sheet.

Measured in `blanks.mjs` rather than described: the probe builds a twelve-movement routine, parks the sheet halfway down, and asserts the position survives a rep nudge, an exercise being added in the picker, and the trip back. Proven red both halves — reinstating `scrollTop = 0` gives 83 passed / 3 failed printing `1211 → 0` and `10106 → 0`, and putting `closeSheet()` back in `pick-finish` alone gives 85 / 1.

### Fifteen more core exercises

`bw-hollow-rock` aside, the catalogue's core work was mostly planks and carries — nothing you would actually pick to build a routine called "abs before bed". Added: Crunch, Bicycle Crunch, Reverse Crunch, Oblique Crunch, Flutter Kick, Scissor Kick, Lying Leg Raise, Heel Tap, Seated Knee Tuck, Plank Up-Down, Side Plank Hip Dip, Dragon Flag, Weighted Crunch, Weighted Russian Twist and Rope Crunch. 236 → 267 exercises, Core 27 → 42. All bodyweight ones carry the `fhb` environment flag, so they are available in a hotel room and with no kit at all, which is where a core routine is most likely to be run.

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
- **AI-assisted workout building.** Scoped, not started. Needs a proxy to hold an API key (the app has no backend). The recommended shape is constrained generation against the existing 267-exercise catalogue with client-side validation — the model proposes IDs, the deterministic engine still disposes. Estimated a weekend to function, a week to trust. Cost is negligible (~$0.004 per generated session on Haiku with the catalogue cached).
- **Scheduling routines into future weeks.** They can be assigned to any day of the current week; next week's plan is not addressable yet.
- **Multi-device sync.** See `docs/decisions.md` — deliberately out of scope.
