# Status

Verified against the build at **813,442 bytes**, `VERSION = '1.2.0'`.
Last sweep: `dupes` + `blanks` (362) + `engine` (239) + `fuel` (78) + `sw` (17) + `native` (23) + `import` (68) + `scan` (61) all green. Nothing known is broken.

---

## Finished and tested

| Area | State |
|---|---|
| Onboarding | Complete. Seeds starting weights from stated experience, deliberately conservative. |
| Session generation | Complete. 281 exercises, 6 programmes, 3 environments, 4 session sizes. |
| Progression | Complete. Learned weights per lift, deload after two sessions short of target. |
| Readiness check-in | Complete. Scored against your own sleep norm, sizes the session, explains itself. |
| Week planning | Complete. Availability + environment per day, plan distributed across the days with the most time. |
| Week ordering | Complete and new. Pin / swap / reflow, move a session between days, place one on an empty day. |
| "Already trained this week" | Complete. Marks days spent without inventing session records. |
| Custom routines | Complete. Build, reorder, run as an extra, or assign to a planned day, with an optional warm-up per routine. The builder and the picker hold their scroll position through every tap. |
| Reps or seconds | Complete. Any movement that is not a loaded compound can be counted either way, per routine item. A timed one counts itself down on the Train screen. |
| Supersets | Complete. A `supNext` boolean per routine item, so a link survives reorder and delete without renumbering. Editing around a pair breaks it rather than re-forming it silently. The whole runtime behaviour is one guard: no auto-rest between A and B. |
| Badges | Complete. Priority, Arms, Core, Mobility, Endurance, Unilateral, Heavy — capped at three per card, every one with a tone. |
| What a set row offers | Complete. Each row shows what you did in that slot last time, carries down from set 1 as you type, and records the unrounded value behind the rounded one it painted. |
| Personal bests | Complete. Called on the tick rather than at finish, marked in the row it happened in, taken back with the set. |
| Import a plan | Complete. Offered from Structure, from the routines list, and from inside the builder. A PDF or text file becomes one routine per day — or, from the builder, movements appended to the routine you already have open: text extracted on-device with no library, movements matched to the catalogue by name, supersets read off the plan's own 4A/4B notation, and everything shown for review before anything is built. |
| Circuits | Complete. A routine can run as a circuit: one pass through the list is a round, rest comes after the round. The Train screen becomes a runner. |
| Distance and pace | Complete. Thirteen movements that cover ground ask for a distance where everything else asks for a weight, and the pace falls out of the minutes already logged. Wheels read in speed. Distance has its own unit, because kilos and miles is a normal pairing. |
| When a day ends | Complete. `profile.dayStart` moves the boundary off midnight, up to 6am. Applied inside `today()`, so the whole app moves with it. Default 0. |
| Two sessions a day | Complete. Both are kept and both are shown; the session that discharged the day names it. |
| The week strip | Complete. Arrows and swipe move it between weeks — back as far as your first session, forward to next week. A day opens on a summary; the editors are one tap in. |
| Logging a past day | Complete. A day that has gone offers "Add something you did"; the session lands on that date, with its length worked out from the work rather than the clock. |
| Recovery days | Complete. Any day can be set to Recovery: mobility and stretching spread across the body, nothing loaded, nothing to beat. Choosable, never scheduled. |
| Form guides | 45 SVG diagrams, two frames each, anatomically checked. Reachable mid-session. |
| Plate calculator | Complete. Owned-plate aware, persists bar weight, follows the weight you type. |
| Last-time recall | Complete. |
| Barcode scanner | Complete for what it can honestly do: reads the code on device with no library, binds it to a food in your library the first time, one tap every time after. No product database — see below. |
| Fuel (nutrition) | Complete. 386 foods, custom foods, portions, edit/delete, copy-a-day, recents, a correction per food, per-entry macros, quick add, meals, and a ring. Searching accepts a space, and foods are named the way people say them. |
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

### The catalogue could not hold a written plan, and sessions had no shape

A real 5-day cut programme was handed over as the reference: warm-up blocks, main lifts, named supersets, a core block, a LISS finisher, per-movement cues and badges. Two gaps.

**Sixty-five movements, forty in the catalogue.** Of the twenty-five that looked missing, nine were name variants of something already there — Lying Leg Curl is Leg Curl, Rope Pushdown is Tricep Pushdown, Rower is Rowing Machine, Hollow Body Hold is Hollow Hold. Fifteen were genuinely absent and are in now: Deficit Romanian Deadlift, Trap Bar Deadlift, EZ Bar Curl, Weighted Pull-Up, Single-Leg Calf Raise, Inchworm, Dumbbell Triceps Kickback, Single-Arm Cable Lateral Raise, Single-Arm Cable Hammer Curl, Overhead Cable Triceps Extension, Cable Wood Chop, Leg Swing, Cross-Body Shoulder Stretch and Thoracic Foam Roll. 267 → 281.

**Two of my additions were duplicates and nothing caught them.** "Close-Grip Bench Press" went in beside the "Close-Grip Bench" already there, and a second "Upright Row" took the first one's id — which in a map-keyed catalogue means one silently shadows the other. Both were found by hand. `engine.mjs` now validates the whole catalogue on every run: eleven fields per row, no repeated id, **no repeated name** (two rows can be distinct to the parser and the same movement to a person), every pattern, load, muscle, equipment name, environment flag and tier from the sets the app actually understands, no backwards rep range, and every row parsed into both `EXLIST` and `EX`.

**And sessions are grouped now.** A written programme does not list twelve movements in a column; it blocks them, and the heading tells you how to treat what is under it — you read "Main lifts · heavy, long rests" and you know before you have read the exercise. `exBlock()` derives the block from flags the session already carries plus the catalogue's tier and pattern, so nothing migrates and a session from last year groups correctly.

The first version walked the array and started a heading whenever the block changed, which produced `Warm-up / Main lifts / Accessories / Finisher / Core / Finisher` the moment anything was out of order — and something is out of order as soon as you add a movement mid-session, because it lands at the end. So the display order **is** the block order: `sessionOrder()` returns indices, never a reordered copy, because every handler addresses an exercise by its real position and a copy would point `toggle-set` at the wrong movement. The cards, the rail and the "where you are" line all walk that one order.

A session that is all one thing — a recovery day is mobility top to bottom — gets no headings at all rather than a heading over everything.

**A check that passed by having nothing to look at.** "Core work is its own block" is an `.every()` over a filter, and a generated full session does not always contain core: the filter matched nothing and `.every()` on an empty list is true. It now asserts there was core and cardio in the session before classifying it, and the reverted subject prints `Plank:accessory`.

**Still to do from the plan: supersets.** The 5-day plan pairs movements — "4A then 4B immediately · rest 60 sec" — and the app has no way to express that outside a full circuit. The circuit feature covers "run these back to back" for a whole routine; a superset is the same idea scoped to a pair inside a larger session. Per-movement cue text and the badge vocabulary (Priority / Arms / Unilateral / Cut / Endurance) are also not modelled.

### The session screen was a spreadsheet

It held exactly the right data and read like one: five columns of table per set — a number, three unlabelled boxes and a tick — under a repeated uppercase header, on the one screen in the app you use one-handed with a bar on your back.

**The field is the container now, not the input.** The unit lives inside the box it belongs to, so the label is where you are already looking instead of in a header row above every exercise. The header row is gone; the focus ring belongs to the field; the tick is wider than everything else, because ticking is what you are there to do and typing is the exception.

**The card header stopped being a toolbar.** A form guide, a swap and a menu on every card, with the amber help button pulling harder than the movement you were about to do. All three live behind one menu now — form is something you read once, swapping is occasional — and the sheet leads with the movement and what it trains. Nothing was deleted; `blanks.mjs` asserts the swap, the note and the removal all still exist, because a feature deletion wearing a tidier screen is not a tidier screen.

**And the flat progress bar became a rail.** One segment per movement, filling as its sets are ticked, with the one you are on taking more of the width — the session as ground to cover, which is what the rest of the app already says it is. Tapping a segment goes to that movement, opening it if it had folded itself away. Under it, "Back Squat · 2 of 6", which is the question the old "1 of 14 sets" could not answer.

The rail moves **in place**. `updateTrainProgress()` touches those nodes directly; a `renderTrain()` mid-session would replace the body's innerHTML, close the keyboard and lose your caret.

**Two checks I wrote wrong.** One asserted an identity — `headerBtns === more + (headerBtns - more)` — which is true of every possible input; it now asserts that no swap or form button survives in the header and that there is exactly one menu per movement. The other tested "in place" by comparing `#train-body` before and after, which never changes because `renderTrain()` replaces its contents rather than the element; it compares an input node now, and it had to tick a movement with more than one set, since ticking the last set of an exercise legitimately folds the card away and rebuilds it.

**More gained an identity header**, replacing the least designed thing in the app — a bordered box with a 52px emoji square styled inline at the call site — and its section labels now match the ones on Progress.

### A design-system pass, and a sky

Asked for as a whole-app job: make it feel premium, keep the UX efficient, lean into the theme, have some fun with it. What follows is the system-level part of that — the things that change how every screen feels rather than how one screen looks.

**Motion has tokens now.** Three curves and three durations, used everywhere, so nothing in the app moves in a way nothing else does. Every duration is short: motion exists to explain where something came from, and past about 400ms it stops explaining and starts costing.

**Screens arrive rather than cross-fade.** The whole screen used to fade in as one block, which reads as a slide deck; content now comes up in sequence, first thing first. The stagger is driven by an `.entering` class that `go()` adds and a timer removes — deliberately not by `.screen.on`, because every render replaces the body's innerHTML and the animation would otherwise replay every time you ticked a set. Navigation is the only thing that should feel like arriving.

**One response to a finger.** Several components had their own press state and several had none, which is the difference you feel without being able to name it.

**The nav's selected pill grows into place** from under the icon instead of appearing fully formed, and the icon lifts a point. **The set tick — the single most repeated interaction in the app — got the one piece of deliberate delight in it**, driven by a transient class from the handler rather than by `.on`, so it fires when you tick a set and not eight times over when a card re-renders with sets already ticked.

**And the app is under a sky.** A journey on foot happens under one that changes, and this app gets used at 6am before a call time and at 2am after one. The ambient gradient shifts through dawn, day, dusk and night on a 1.2-second fade you should never catch happening.

Two rules make it safe. It touches **only** the background gradient — every surface, line and text colour is identical in all four bands, so nothing that was measured for contrast moves, and `blanks.mjs` asserts exactly that by reading the tokens in each band and requiring them to match. And it reads the **wall clock**, not `today()`: `profile.dayStart` moves where your day ends and it does not move sunrise, so at 2am with a 4am boundary the app correctly says Sunday and correctly draws a night sky.

That last property took two attempts to test honestly. The first check asserted it at 02:30, where a correct implementation and one that shifted the hour by the boundary both answer "night" — it proved nothing. It now tests at 06:30, where the answers differ, and prints `night vs dawn` when reverted.

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

### Supersets, badges, and a set row that says what it will record

Four things on the Train screen, and one bug the checks for them found.

**Supersets.** `supNext` on a routine item means "this one runs into the next
one". Chosen over group ids because ids need renumbering on every move and
delete, and drift out of sync the first time one is missed. The builder shows a
link control in every gap between movements and none after the last, which has
nothing to run into. `sessionOrder()` groups before it sorts — a tier-1 press
paired with a tier-3 raise would otherwise be pulled apart by the block sort,
which is the one thing a superset cannot survive. The entire runtime behaviour
is one guard in `toggle-set`: no auto-rest when `item.supNext`.

**The bug.** The flag travels with the item, which is what makes it survive a
reorder — and is also what let it latch onto whatever slid in underneath.
Moving a fly out of a bench+fly pair left the bench supersetted with the
overhead press, silently, looking exactly like a pair you had asked for.
`clearLinksAround()` now breaks every link in the window an edit touched,
including the one pointing into it. Found by writing the check, not by using
the app.

**Badges.** Priority, Arms, Core, Mobility, Endurance, Unilateral, Heavy,
capped at three. A row of six labels under every exercise is decoration; the
cap is what keeps a badge worth reading.

**What a set row offers.** One "Last: 82.5×8, 82.5×8, 80×6" line above the card
made you parse a list and count along it to find the row you were on. Each row
now offers what you did in that slot. But a placeholder that shows a number
obliges the tick to record *that* number, so `ghostFor()` resolves it once and
the render, the live carry-down and `toggle-set` all read the one answer. It
returns raw values: `fmtW` rounds 1.25 to 1.3, which is right for a label and
sends you to the wrong plate if it reaches the store. `lastSetAt()` had been
written for this and called from nowhere.

**Personal bests, on the tick.** `applyProgression` only rewrites `L.best` when
a session is finished, so the app knew you had set a record and waited until you
had put the phone away to say so.

**RPE is optional.** The column most people never fill, costing a fixed 64px of
a row that is tight on a phone. Off, weight and reps go from ~94px to ~125px
each. Stored as an explicit `false` so a save written before the setting existed
keeps the column.

**Three of the new checks were guarding nothing**, and reverting each subject is
what showed it. The trailing-link check was testing a guard in
`toggleSupersetLink` rather than `normaliseSupersets`; the badge cap asserted
`<= 3` while nothing earns more than three; the held-work exclusion passed an
unloaded plank, and `e1rm()` returns 0 for a zero weight, so nothing could beat
anything. All three now fail when reverted. A fourth probe threw on a missing
element instead of failing — killing the instrument before it printed — and now
returns a shaped miss.

---

### Rest says what it is for, the rail shows terrain, and the finish names what you beat

**Rest.** A third of a session's wall clock was getting a 44px strip with a
hairline bar in it. It still does not cover the screen — you read and log while
you rest — but the bar now runs full width, the countdown is legible from arm's
length, and it names the set on the other side of the wait: "Next · Bench
Press, set 2 of 3". Derived from what is ticked rather than stored, so it is
right after a reload, and it handles a circuit by asking `circuitPos`.

**The rail.** A break wherever the block changes, so the session reads as stages
of a route rather than one undifferentiated bar. That immediately introduced a
bug and the check caught it: `updateTrainProgress` walked `rail.children`, so
segment N mapped onto `order[N + breaks so far]` and every movement after a
break stopped filling. It selects `.rail-seg` now.

**The finish sheet lists your records.** The stars were on the rows during the
session and were otherwise the only trace of them. A personal best is the thing
you tell someone about; finding it should not mean scrolling back through a
session you have already finished.

**And one lie fixed.** Ticking an untouched row records what the row offered —
so tick at the offered 120, notice it was really 40, correct it, and the star
stayed on a set that never earned it. `refreshPR()` re-decides on every edit to
a ticked set.

Two of the checks for this were not testing what they claimed. The rail-fill
check asserted on the movement *before* the break, which maps correctly either
way; it now asserts on the one after it. The finish-sheet check called
`sessionPRsHTML()` and matched its return, which proves the function works and
says nothing about whether the sheet renders it — deleting the call from
`sheetSessionDone` left it green. It finishes a session for real and reads the
open sheet now. A third probe threw on a card that had legitimately folded
away, killing the instrument before it printed.

---

### A rest you can hear, and one the phone will wake you for

`tickRest()` was a 200ms `setInterval` whose payoff was `buzz()`. Two problems:
**iOS Safari implements no `navigator.vibrate` at all**, so on the phone this
app was built for the alert was silence; and putting the phone in a pocket
suspends the timer entirely.

On device that is now a real scheduled notification — `@capacitor/local-
notifications` was a pinned dependency and unwired. One fixed id, so a second
rest replaces the first rather than queueing behind it; withdrawn when you skip;
and permission asked on the first rest rather than at boot, because a permission
request against something you just did is answerable and one during onboarding
for a feature you have not met is not.

On the web it is a sound, because nothing else is possible without a server to
push a notification. Two oscillators rather than an audio file: an asset would
be the first external request in the app, and the context is built inside the
tap that starts the rest, since one created outside a gesture starts suspended
and stays that way.

Off by a switch in Rest timers, which plays the tone as you turn it on — a
sound you cannot hear until the next time you rest is a setting you have to
test by training.

**Two more of the checks were guarding nothing.** The chime checks called
`chime()` and asserted it returned true, which says nothing about whether a
rest running out calls it; deleting the call from `tickRest` left them green.
That one now runs a one-second rest and counts oscillators through a spy on the
platform's own `createOscillator`, so the subject is untouched. And the
withdraw-on-skip check counted cancellations without resetting first — `startRest`
cancels before it schedules, so the count was already 1 before `stopRest` ran.

---

### A treadmill run had a 323 lb one-rep max

Reported from a screenshot: High Points listing **Treadmill Run — 215lb × 15 —
323 lb**, above the squat.

The arithmetic was real. `e1rm(215, 15)` is 322.5. The numbers it was given
meant minutes and something typed into a weight field, and nothing stopped it.
Two causes:

- The e1RM block in `applyProgression` sat **above** the load guard, so a
  movement whose load is `min` or `time` got a best anyway if anything was in
  its weight field.
- Nothing excluded cardio *by what it is*. A cardio movement switched to reps
  in a routine resolves to a `bw` load and sailed through.

`tracksOneRM()` now decides it in one place: cardio, carries and mobility are
out by pattern, held and timed work by resolved load. Bodyweight stays, because
a weighted pull-up is a loaded lift and an unweighted one scores zero anyway.
Used by `applyProgression`, by `isPR` — which had a partial version of the same
rule — and by `allPRs`.

**Filtered on the way out as well as on the way in.** A save written before
this already holds a best for a treadmill run, and there is no honest migration:
you cannot tell which stored bests came from real lifts. The list drops them at
read time instead, so the nonsense disappears without guessing.

10 checks, 3 subjects proven red. Reverting the guard prints
`{"w":215,"r":15,"e1rm":322.5}` — the reported number, exactly.

---

### Train told you to redo the session you had just finished

Reported: go into Train after the day's main session and it says "Ready when
you are — Legs — Start full session", with the thing you actually did nowhere
on the screen. Coming back to add fifteen minutes of arms read as being told to
start over.

The idle header was unconditional. It now reports the day when the day is
discharged: what you did, the sets, the minutes, the tonnage, the calories, and
how many movements you beat your best on. Then it offers to add something,
framed as adding — "logged as an extra, today stays done" — rather than as a
second attempt. Teal rather than ember, because everywhere else in the app
ember means "this is next" and teal means "this is done", and the entire
complaint was that a finished day looked exactly like an unstarted one.

Two things it must not get wrong in the other direction, both checked:

- **An extra does not discharge a planned day.** Abs at 10pm is not the Upper
  session you owe, so Train still offers the session you owe. The plan is asked
  first wherever there is one.
- **A day is discharged once.** Anything started after that is marked `extra`
  in `startSession`, so finishing a second session cannot re-mark a day that
  was already marked, and both sessions are kept.

A day with no planned session that you trained on anyway now reads as done too
— that was a second gap, found because the first seed happened to land on an
unplanned day and the check failed for a reason that turned out to be real.

14 checks, 3 subjects proven red. One of mine was wrong first: it passed
`buildRoutineSession(id, true)`, and that flag is `asPlanned`, not `extra` — so
the probe was asking for the exact opposite of what it was testing.

---

### The screen stopped short of the bottom of the phone

Reported from a screenshot: a row of routine cards sliced in half, dead black
space under them, and the floating nav sitting over the top of it.

`#app` was `height:100dvh` inside a body that is `position:fixed; inset:0`. On
iOS Safari those two disagree the moment the address bar collapses — the
dynamic viewport grows, the fixed body does not — so `#app` became taller than
its parent and `body{overflow:hidden}` cut the overflow off. Every screen's
`padding-bottom` was correct and irrelevant, because the clipping happened a
level above it.

It is `height:100%` now. The body already *is* the visible viewport and
re-measures itself as the toolbars come and go, so 100% of it fills the screen
exactly and by definition, with no unit that can drift out of agreement with it.

11 checks: every screen reaches the bottom edge and no further, each one can
still scroll clear of the floating nav, and `#app` is declared in `%` rather
than a viewport unit. Putting `100dvh` back prints `100dvh`; zeroing the
clearance prints `pad 0 vs nav 60` on four screens.

---

### A run has a distance, and never had a weight

Reported as: "A run should not be calculated as weight, not sure how to track
it." The set row painted a weight field on every movement without asking what
the movement was, so a treadmill run asked how heavy it was — and whatever went
in there became a working weight the progression engine tried to add to. That
is the same root as the 323 lb one-rep max fixed a change earlier; this is the
data-entry half of it.

**The weight column becomes a distance column on anything that covers ground.**
Not a fourth field crammed into a row that is already tight on a phone — the
right question replacing one that was never answerable there. Distance plus the
minutes already logged is a pace, which is the number a runner actually wants,
and it is derived rather than stored.

Which movements travel is an **explicit list of ids**, because no rule gets it
right. Every cardio movement is timed; only some of them go anywhere. A stair
climber measures floors, a skipping rope measures nothing, and battle ropes and
a sled are cardio that stays where it is — offering those a distance would be
the same category error as offering a run a weight. Thirteen ids are in;
everything else keeps its weight field.

Wheels read in **speed** and everything on foot or in water reads in **pace** —
the same division, and this only decides which way up. "2:00 /km" is not a
number a cyclist has ever used.

**Distance is its own unit setting, not derived from the weight one.** Weighing
in kilos and running in miles is the ordinary case across most of Britain, and
deriving one from the other would tell those people their five-mile run was
8.05. `convertStoredDistances` is deliberately a separate function from
`convertStoredWeights` for the same reason: one pass over both would eventually
be called with the wrong factor and silently rewrite every number in the app.

**27 checks, seven subjects proven red.** The row is read off the real Train
screen and the distance is typed into the real field and ticked with the real
button, so what is proven is what a person would see. Two things went wrong on
the way and both were worth having:

- Putting `d` into the Enter order between `w` and `r` sent every barbell row
  looking for a field it does not have, found nothing, and **dropped the
  keyboard instead of going to reps** — a regression in the most-used path in
  the app, caught before it shipped only because a check walks that order.
  It steps to the next field the row actually has now.
- The pace-line check read the card *after* the app had correctly folded it
  away, because ticking the only set completes the exercise. A one-set fixture
  was testing the wrong moment, not a broken pace line.

And a third, found by the revert rather than by the run: with the subject
reverted there is no distance field, and the probe did `el.value =` on null —
killing the instrument before it printed anything, so the red looked like a
hang. It returns a shaped object on every miss now. **A probe that throws has
not run**, which this file has already had to learn three times.

### The food search ate every space you typed

Reported with a screenshot of the search field reading **"Turkeysa"**.

The sheet redraws on every keystroke and refills the field from its own state,
and the value it refilled with was the *trimmed* query — the same string used
to run the search. So a trailing space was swallowed the instant it was typed,
and the next letter arrived against a field that had already closed the gap.
Two words were impossible to type. One line:

```js
value="${h(foodQ || '')}"   // the raw text, not the trimmed one
```

**Trim where you search, never where you echo what somebody is still typing.**

The check types the phrase one key at a time on a real keyboard and reads the
field back *after every key*, because the property is per-keystroke: asserting
only the final value would pass a space that vanished and came back. Reverted,
it prints the reporter's own string — `["turkey sa","turkeysa"]`.

Two things about the instrument were wrong before it worked. Sending all
fifteen keys back to back outran the redraw, so keys landed on nodes the sheet
had already replaced, focus escaped, and a space activated whatever button
caught it. And the section needed its own fresh page: the sections above hand
between a dozen sheets, and `sheetOpen` plus the single history entry the sheet
stack rides on outlive them, so the first redraw met a stale popstate and the
search sheet was replaced by the one underneath. An earlier attempt to clear
that with `closeSheet()` first made it worse for exactly the reason the handbook
already gives — `closeSheet` calls `history.back()`, which lands *after* the
evaluate returns and shuts the sheet just opened.

### Sandwiches, named the way people ask for them

The other half of the same report: "it should have sandwiches. like a turkey
sandwhich, roast beef sandwich etc." The library had three, and all three were
filed in catalogue order — `Sandwich, BLT` — which is unfindable by typing what
you ate. They are `BLT sandwich`, `Chicken salad sandwich` and
`Shop-bought sandwich` now, renamed **in place**: food ids are positional
(`'f' + i`), so a rename is free and a reorder would silently repoint every
logged entry, correction and barcode binding in every existing save. Appending
is safe for the same reason.

Twenty-three rows were added — sandwiches, toasties, a sub, a wrap, rolls, a
bagel and toast — all Atwater-checked before they went in, and all named as
speech rather than as a filing system.

### The catalogue is 386 foods, and a check that catches the typos

Size was never the constraint. The pipe-delimited format costs 38 bytes a food
raw and 16.6 gzipped, so the 250 added here cost about 10 KB raw and 4 KB over
the wire — on a 784 KB app that installs once, nothing. Room for several
thousand more if it is ever worth it.

What it needed first was a way to catch a transposed digit, because nobody
proofreads three hundred rows of numbers successfully. **Atwater**: protein and
carbohydrate carry 4 kcal a gram, fat carries 9, and every real food obeys that
to within a few percent. `fuel.mjs` now asserts it on every row, with the
tolerance sized for fibre, polyols and rounding — and two documented
exemptions, because alcohol is 7 kcal a gram and none of the three macros, and
a whole meal counted per item is legitimately 900 calories where 900 per
hundred grams is denser than pure fat.

It earned itself immediately: it caught **37 foods added that already existed**,
and reverting one digit of the almonds row prints "says 579, macros give 217".

The 250 new rows are whole foods and staples — cuts of meat and fish, cheeses
and dairy, breads and grains, pulses, vegetables, fruit, nuts and oils,
condiments, drinks, supplements and prepared meals. Branded products are
deliberately not here; that is what the barcode binding is for. Twenty-three
sandwiches and other made-up meals followed, for the reason above.

### Checking a flagged import no longer throws away the import

Reported: tapping a movement marked "check this" opens the exercise picker, and
the ✕ closes the whole sheet stack — so checking one of fifty-two movements lost
the other fifty-one and the import had to be started again.

The picker now carries a back arrow when it is reached from an import, and
going back returns to the review with every other selection intact. It also
shows the line your plan actually said, so you are choosing against the source
rather than from memory.

And the flag says *why*. "Check this" on its own is an instruction to worry:
the matcher already knows whether the doubt is "something else scored almost as
well" or "nothing scored well", so it now says **"Could also be Bench Press"**
or **"Only a rough match for what your plan said"**.

---

### A barcode scanner, and the half of it that cannot be built here

A barcode scanner is two features and only one of them is a signal problem.

**Reading the code** is pure pixels and is done on device. `BarcodeDetector` is
used where the platform has it — Chromium, so Android and desktop Chrome — and
**Safari implements it on no iPhone at all**, which is the phone this app was
built for, so there is a decoder underneath: threshold each row against its own
range, find the code's extent, sample the centre of all 95 modules, verify both
guard patterns and the checksum. Twenty-one rows are tried from the middle
outward, because the row the guide box points at is exactly the row a
reflection lands on.

**Saying what the product is** is not a signal problem. It needs a product
database — Open Food Facts has three million and it is an HTTP request away,
which is a promise this app has never broken. So the scanner does not pretend:
the first time it sees a packet it says it does not know, and asks once. After
that the code is bound to a food in your own library and every scan is a single
tap. People eat the same twenty packaged things; the second scan of your
protein tub is the one that matters, and that one works with the network off,
forever.

Bindings live in the same blob as everything else, so they export, back up and
mirror to the native store for free. A UPC-A and the EAN-13 it pads to are one
packet, or the same tub would be two products.

**41 checks against generated barcodes** — real EAN-13 bitmaps built from the
spec at four module widths, in shadow, over-lit, with sensor noise, and through
a reflection across the middle. Every fixture is checksummed before use, so a
wrong fixture fails as a fixture. Nine subjects proven red, and **four of them
were green the first time**: the fixtures were too clean to exercise a fixed
threshold, a missing guard check, a missing checksum, or single-row sampling.
Each needed a fixture built specifically to fail — an over-lit packet that
straddles nothing at 128, a forged frame with the start guard flipped from 101
to 111 and everything else valid, one with a digit's pattern swapped so the
checksum breaks and nothing else does, and one with a highlight painted across
the middle rows.

---

### Fuel could not be corrected, which made every total it produced suspect

The catalogue ships one whey protein at 120 kcal and 24g a scoop. That is a
reasonable average and it is not your tub — and there was no way anywhere in
the app to say so. The portion stepper changes how many scoops you had, never
what a scoop contains, so the only way out was to abandon the preset and retype
the food from scratch. For something being sold as Pro that is disqualifying: a
number you cannot correct makes every total built on it wrong.

Three ways in now, at three different scopes:

- **Fix the food, for good.** A correction stored against the preset rather
  than a replacement for it, so the original is still there and search still
  finds the thing by its usual name. Includes what counts as one serving,
  because "1 scoop" and "1 serving" are rarely the same. Entries already logged
  keep the numbers they were logged with — that is what you actually ate, and
  rewriting last week's dinner because you corrected a food today would be
  inventing history.
- **Fix this entry.** The meal that was bigger than the catalogue thinks,
  without claiming every future one will be. An entry corrected this way stops
  being re-resolved from its food, or the next quantity nudge would throw the
  correction away.
- **Quick add.** Bare macros, no food behind them, for the restaurant meal you
  will never log twice. Every competitor has had this for a decade.

**And a day now has a shape.** Breakfast, lunch, dinner, snacks — guessed from
the clock through `today()`'s day boundary, so someone whose day ends at 4am
eating at 2am is having dinner rather than breakfast, and always changeable
because the guess is only a starting point.

**The screen was three stacked bars and is now a ring** — three concentric arcs
that fill from empty on arrival, because a ring reads from across a kitchen and
a bar chart does not. Behind it, two very low-alpha blooms drift on a 34- and
41-second cycle. Deliberately under 0.06 alpha and behind every surface: this
app measures text contrast by sampling painted pixels, and a bright thing moving
under a paragraph would change the answer depending on when you looked.

23 checks, 9 subjects proven red. Three of them were weak first: one held a
reference to the entry it was about to mutate and compared it to itself, one
called `setEntryMacros` instead of clicking the button that calls it, and one
searched for markup that had never existed.

---

### Changing units changed the label and nothing else

Reported from a screenshot: a bodyweight that read 217 lb one day read 215 kg
the next. `set-units` was two statements — assign `profile.units`, save — and
every weight in the store is held in whatever unit was showing when it was
written. So flipping the setting did not change any data, it changed what all
of it *meant*. A 100 lb bench became a 100 kg bench and fed progression, the
plate maths and the personal-best comparison from there.

`convertStoredWeights` now moves the numbers with the label: bodyweight log,
learned working weights, personal bests and their estimated singles, lift
history, session prescriptions and every logged set. Reps, seconds and RPE are
untouched — they are not weights. Plate config is deliberately excluded: it is
already stored per unit as `barKG`/`barLB`, so it has both and picks the right
one, and converting it would corrupt the one part that was never broken.

**And a save the old toggle already mangled can be corrected.** Nothing can
detect it — 100 is a plausible bench in either unit — so the repair is offered
rather than applied, from a link under the units chips, and it shows the
arithmetic on your own bodyweight and heaviest lifts before you commit. It
rewrites training history, which is the one thing in this app that cannot be
got back, so it says that too.

16 checks driven through the real chips rather than through the converter, 7
subjects proven red. Reverting `set-units` to what shipped prints
`217 → 217` on every line.

---

### The day strip was broken, and is now a card that shows a week

Reported as "let's make this look more premium". It was worse than unpolished:
with Steps unlogged, the dash sat alone in mid-air and the STEPS label was 65px
below SLEEP and WEIGHT.

**The cause was a one-word class.** `p1_head.html` carried a bare `.empty`
empty-state panel with `padding:44px 20px` on it, and the strip's own
`.day-v.empty` modifier inherited it — `height:23px` lost to `min-height:auto`
resolving against 88px of padded content. `.pf-v.empty` on the profile sheet
had exactly the same bug and nobody had ever noticed. The panel is
`.blankstate` now and a component's "nothing here" modifier is `.none`.
Component classes in this file are namespaced by feature; that one was the
exception, and being the exception is what made it dangerous.

**And the strip is now worth looking at.** A card rather than a bordered band —
everything else on Today is a card, and a strip with hairlines top and bottom
read as a divider with text in it. Each metric carries seven days of itself as
micro-bars: today in ember, a day you did not log as a stub rather than a bar,
because "not logged" and "zero" are different things. Bars are scaled between
the week's own low and high with a high floor, which is deliberately a shape
rather than a magnitude — the number above it is the magnitude, and a week of
bodyweight drawn from zero says nothing while the same week drawn from its own
low says your weight halved.

Every row is a fixed band, which is what actually guarantees the three columns
line up whatever combination of them you have filled in. Reverting that prints
`88,26` and two different label tops — the reported bug, exactly.

---

### The import is offered where you would look for it

It shipped with one entry point, at the bottom of the routines list, which is
the last place you would go looking. It is now on **Structure** — the screen you
are on when you are thinking about how your training is shaped — on the
**routines list**, and inside the **builder**, where it adds to the routine you
already have open rather than building new ones.

That third one is a different operation, so it is a different path:
`commitImportInto` appends in document order after whatever was already in the
routine, preserving the existing movements and only forming a superset between
two movements that were neighbours inside one day. A pair cannot form across a
day boundary, and a day you turned off contributes nothing.

`applyImportItem` is shared by both commit paths, so the two cannot disagree
about what an imported movement's sets, reps and unit are.

---

### A written plan can be uploaded, and becomes routines

The 5-day cut plan in this repo's history has fifty-two movements in it.
Retyping those into the builder is the reason a plan never makes it into the
app, so now you hand it the file.

**Getting text out of a PDF, with no library.** ASCII85 + `DecompressionStream`
+ a walk of the content stream. A library would be the first external request
this app has ever made and would still not work offline, which is the product.
Three things broke it and are now the reason it works: text has to be **grouped
by baseline**, or a two-column table runs its columns together and a styled
heading arrives as "TUESDA" / "Y — OFF" / "WORK"; **WinAnsi 0x80–0x9F** has to
be translated, because that is the one range where PDF and latin1 disagree and
it is where every dash lives — read as latin1 alone, "5–6 reps" is fifty-six;
and an **en dash is a range while an em dash is a separator**, so collapsing
them together does the same damage.

**Finding the structure without assuming a format.** `parsePlan` anchors on the
prescription, because "N sets × M reps" is the one part of a training plan
written the same way everywhere. The name is whatever readable line came last
before it — which covers a PDF table laying the two out on separate rows and a
person typing "Bench Press 5x5", without either being special-cased. Supersets
are read off the plan's own 4A/4B notation rather than off the SUPERSET
heading, because the heading is prose and the index is structure.

**Matching names to the catalogue,** scored rather than looked up, and the score
comes back with the match so a weak one can be shown as weak. On the real
document: 61 movements across 6 sessions, all matched, 3 flagged for checking.

**Nothing is written until you say so.** The review shows the line the document
actually said next to the movement the app chose. Anything unmatched starts
unticked — inventing a squat because a line said something squat-ish and
silently dropping a movement are the same bug.

**One real bug, found by writing the check:** unticking half a superset left the
link on its partner, which then pointed at whatever moved up underneath. Pairing
now happens against original positions, the same principle as
`clearLinksAround`. **And three of the twelve subjects came back green the first
time I reverted them** — the fixture did not contain prose that wrapped the way
the real document wraps it, a movement written without a set count, or anything
the catalogue could not match. All three now fail when reverted.

---

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

### 3. Set types — warm-up, drop, failure, AMRAP
Every set is a working set. A warm-up logged normally inflates volume, inflates the energy estimate, and feeds `applyProgression` — so warming up makes the app think you got stronger. Strong has had W/D/F markers for a decade. This is now the largest correctness gap on the Train screen.

---

## Explicitly deferred

- **CSV export.** JSON export works and round-trips. CSV is a nicety.
- **AI-assisted workout building.** Scoped, not started. Needs a proxy to hold an API key (the app has no backend). The recommended shape is constrained generation against the existing 267-exercise catalogue with client-side validation — the model proposes IDs, the deterministic engine still disposes. Estimated a weekend to function, a week to trust. Cost is negligible (~$0.004 per generated session on Haiku with the catalogue cached).
- **Scheduling routines into future weeks.** They can be assigned to any day of the current week; next week's plan is not addressable yet.
- **Multi-device sync.** See `docs/decisions.md` — deliberately out of scope.
