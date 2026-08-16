# Decisions

Every real decision made while building Guzo Fit, why, and what was rejected.
Newest sections roughly last. Where a decision was reversed, both states are recorded.

---

## Standing instructions from L

These were said explicitly and should be treated as constraints, not preferences.

- **"Guzo Fit as the formal name."** Chosen after discovering `guzo.app` was taken. Not "Guzo", not "GuzoFit" as one word in prose — the wordmark renders `Gu**z**o` + `Fit`.
- **Build for a camera operator's life.** Changing hours, long shoot days, hotel rooms, no equipment some weeks. Planning around a busy, unpredictable schedule is *the* defining capability, not a feature.
- **Goals are strength + general health + muscle gain**, in that framing. Three environments must always work: full commercial gym, hotel/minimal gym, bodyweight only.
- **Personal beta first, commercial competitor later.** Build it properly, but the immediate user is L on an iPhone.
- **Apple Developer account is already enrolled.** Native wrap work was explicitly authorised: *"I need the developer account for more than just this app so I've already enrolled."*
- **"Look over your drawings"** — after one bad knee joint was spotted, the instruction was to check them all, not just fix the reported one. That generalises: when a bug is found by inspection, go looking for the whole class.
- **Never fetch web content by any means other than WebSearch/WebFetch.** No curl, wget, python requests, or any workaround, ever, for any reason.

---

## Product and positioning

### The app is a journey, not a streak

**Decided:** No streak counter anywhere. A missed day is free. Nothing goes red. The week chip reads "3/5 this week", not "12 day streak".

**Why:** The product's central claim is that a missed session costs nothing and the plan reshapes around your life. A streak counter contradicts that in the most prominent position on the screen — it asks you to protect an unbroken run, which is loss aversion applied to someone whose job routinely makes training impossible.

**Rejected:** streaks, badges for consecutive days, any "you broke your streak" messaging, red anything on a missed day.

### Name and domain

**Decided:** "Guzo Fit". `ጉዞ` is Amharic for journey; `የእግር ጉዞ` is the everyday word for hiking. The route / waypoint / base camp / distance-covered metaphor all descends from it.

**Why:** `guzo.app` was already registered by someone else. Checked and confirmed before committing.

**Rejected:** shipping as plain "Guzo" and hoping, or picking an unrelated name and losing the metaphor the whole interface is built on.

### Copy never shames

**Decided:** "That isn't you falling short; it's the plan shrinking to match the week you actually have." A day marked *Not happening* comes off the route completely and never counts as missed.

**Why:** The target user genuinely cannot train some days. An app that treats that as failure gets deleted in week three.

---

## Architecture

### One HTML file, no backend, no framework

**Decided:** Single self-contained file, vanilla JS, `localStorage`, no build tooling beyond `cat`.

**Why:** It has to work in a hotel basement with no signal. It has to install by uploading one file. It has to be inspectable end to end. No framework earns its weight against those three.

**Rejected:** React/Vite (bundle, toolchain, no benefit for one screen at a time); IndexedDB (the whole state is a few hundred KB and fits comfortably in one blob); any server (see below).

**Cost accepted:** no module system, so every part file shares one global scope, and a duplicate top-level name silently wins. That cost was later paid in full — see *The `daysBetween` collision*.

### No database, no accounts, no sync

**Decided:** Nothing leaves the device. No Supabase, no Postgres, no auth.

**Why:** No user accounts means no privacy surface, no GDPR exposure, no auth flows, no server bill, and nothing to break when offline. For a personal beta it is strictly better. Backup is a JSON export the user controls.

**Rejected:** Supabase or any BaaS. It would have added auth, RLS policy design, migration management and a network dependency to an app whose main promise is that it works when nothing else does. **If a future prompt asks about "the Supabase schema" for this project, there isn't one and never was.**

**Revisit when:** multi-device sync is actually wanted. The blob is already the natural sync unit.

### Build by concatenation, order is load order

**Decided:** `build.sh` cats an explicit `PARTS` list. The order in that variable is the runtime load order.

**Why:** Zero tooling, readable diffs, and the file split is purely for human navigation.

**Cost:** duplicate declarations across parts are silent. Mitigated afterwards by `dupes.mjs`, which now runs inside `build.sh` and fails the build.

### One delegated event listener

**Decided:** A single `click` listener with a `switch` on `data-act`. No inline `onclick`, no per-element listeners.

**Why:** Every screen is a full `innerHTML` re-render, so per-element listeners would leak or die on every repaint. Delegation survives re-renders for free.

---

## The training engine

### Sessions are generated from slots against a time budget

**Decided:** `SLOTS[type]` defines an ordered list of pattern/tier/set requirements; `generateSession()` fills them from the exercise catalogue subject to environment, blocked equipment, injuries, and a minutes budget.

**Why:** It is deterministic and it can explain itself. Every choice traces to a rule.

### The ladder: four session sizes, all of which count

**Decided:** full / trim / short / micro (three minutes). Every one counts as a session. No partial credit.

**Why:** "There is no such thing as a partial session" is the psychological core of the product. Partial credit would reintroduce the failure state the whole design removes.

### Readiness sizes the session; it does not score you

**Decided:** The check-in produces a score that picks a rung, and the hero card explains *why* today is that size. Readiness is not a peer card competing with the session — it is the reason the session is that size.

**Rejected:** a standalone readiness card on Today. It competed for attention and answered a question nobody had asked yet.

### Sleep is scored against *your* normal, not eight hours

**Decided:** `readinessScore` uses `S.profile.sleepNorm`, with the floor at norm − 3.

**Why:** Six hours is a catastrophe for one person and an ordinary Tuesday for another.

### Programmes are cycles, not calendars

**Decided:** Six programmes, each `{cycle:[...], target:N}`. `buildWeekPlan` distributes `target` sessions across the days with the most available time.

**Rejected:** fixed weekday assignments (Mon = chest). They break the moment a shoot runs long, which is the entire problem being solved.

---

## The week's order (latest major feature)

### A day you set yourself is pinned

**Decided:** `week.plan[k].pinned`. Rebuilds and reflows never overwrite a pinned day.

**Why:** The app gets to arrange the days you have not had an opinion about, and no others. Without this, changing an availability setting silently undid a session you had deliberately chosen.

### Changing a day asks what to do with the rest — but only when it matters

**Decided:** Three modes. `swap` is offered only when another unsettled day already holds the session you picked. `reflow` is offered only when there are later days to re-lay. If neither applies, the change is applied immediately with no dialogue.

**Why:** An unconditional confirm dialog is a tax on every single interaction. A dialog that only appears when there is a real consequence is information.

**Rejected:** always rotating everything (rewrites days you already decided on); silently changing only that day (leaves you training Pull twice and Push never).

### The far side of a swap is NOT pinned

**Decided:** `applySpec(k, spec, pin)` — `pin` is true only for the day the user acted on.

**Why:** You chose Saturday; the app moved Tuesday to make room. Pinning Tuesday would freeze a day you never expressed an opinion about, and the next reflow would step around it and leave a duplicate. Found by testing, not by reasoning.

### "I already trained this week" records the session and nothing else

**Decided:** `markTrainedElsewhere` sets `{done, elsewhere, pinned}` on the plan entry. It writes no `S.sessions` record, no sets, no tonnage, and no learned weights.

**Why:** This came directly from L: *"I started using this app today but I've already had my other workouts for the week so I'm already on back."* The plan opening on session one while you are three deep is the single worst first impression the app can make. But the app must not claim to know what it wasn't there for — fabricating volume would corrupt progression and every statistic downstream.

**Also decided:** it refuses days that have not happened yet.

### The rebuild steps past patterns already used

**Decided:** When filling unpinned days around pinned ones, `buildWeekPlan` advances the cycle index past any type the pinned days already consumed.

**Why:** Without it, pinning three of five days produced two Lower days and no Pull. The rotation resynced correctly and still lost a movement pattern for the week.

### A routine can be the week's session

**Decided:** `buildRoutineSession(id, asPlanned)`. On a planned day it is not an extra and finishing it marks the day done. Anywhere else it stays an extra.

**Why:** L asked for both behaviours at different times — "I may want to do an additional ab routine at night" (extra) and later, to assign a routine to a day (the session). The `asPlanned` flag is the whole difference.

---

## Nutrition (Fuel)

### The week leads, not the day

**Decided:** The Fuel screen opens on the seven-day average, with the day below it.

**Why:** Chasing a perfect daily number is the failure mode, and the eating-behaviour literature on rigid restraint supports the reasoning. The app already refuses to mark a missed training day red; marking a Tuesday red for eating 400 over would be incoherent.

**Honesty note:** the specific UX claim is MacroFactor's, not an independent finding. Recorded as such in the code comment.

### Nothing in Fuel ever goes red, and there is a test enforcing it

**Decided:** `test.mjs` scans `#s-fuel` for the rose colour and for shaming language while over target.

### Protein-only mode hides calories completely

**Decided:** One switch. Calories vanish from every surface including the "where the target comes from" panel, which gets a protein-specific replacement. Everything keeps being recorded.

**Why:** Clinicians and users have asked other apps for exactly this and been given half-measures. The evidence on tracking and disordered eating is a consistent association with weak causal support — but the RCTs finding no harm all excluded people already at risk, which is precisely the group that matters. One switch is cheap insurance.

### Adaptive TDEE is offered *alongside* the formula, never instead of it

**Decided:** Both numbers are shown, with the formula labelled "Formula said".

**Why:** MacroFactor popularised working expenditure backwards from intake against trended weight and publishes accuracy data — but that analysis is theirs and has not been independently replicated. The logic is sound; the evidence is not conclusive. Showing both is honest.

### It refuses to report an implausible measurement, and says why

**Decided:** Refuses below 1000 or above 6000 kcal, **and** refuses when it disagrees with the Mifflin-St Jeor estimate by more than 35% — naming under-logging as the cause.

**Why:** With a partly-logged diary the maths cheerfully produced "1,040 kcal" against a formula estimate of 2,750. Mifflin-St Jeor is good to about ±10% on an individual; a gap that size is not an unusual metabolism, it is a food diary missing a third of its entries (self-report under-reporting runs ~20–30%). Reporting it with a straight face would send someone to eat less on the strength of days they forgot to finish.

### 1.6 g/kg protein, with the confidence interval stated

**Decided:** Morton et al. 2018 (49 studies, 1,863 trained participants), plateau ~1.6 g/kg, CI reaching 2.2. Both numbers shown.

**Rejected:** quoting 2.2 as the target. It is the top of a confidence interval, not a recommendation.

### The food library is small, generic and offline

**Decided:** 113 whole foods with USDA reference values. No brands, no barcode scanning, no remote database.

**Why:** Offline is non-negotiable. People eat the same twenty things, which the recents list exploits. Brand databases are the part of MyFitnessPal everyone complains about.

---

## Body data

### Mifflin-St Jeor, with its error bar printed on screen

**Decided:** `10×kg + 6.25×cm − 5×age + (5 | −161 | −78)`, and the UI says "accurate to about ±10% for any one person".

**Why:** A number presented without its uncertainty invites false precision.

### Bodyweight is stored in display units, and the maths converts

**Decided:** `S.profile.bodyweight[].w` is in whatever unit the profile shows; `bodyKg()` and `adaptiveTdee()` convert.

**Cost:** this is a trap. Two tests were written seeding kilograms into a pounds profile and validated the wrong behaviour. Any new test touching bodyweight must set `S.profile.units` explicitly.

---

## Form diagrams

### Hand-built SVG with two-link inverse kinematics

**Decided:** 45 diagrams, two frames each, generated from joint positions rather than drawn by hand.

### An anatomical checker, because a drawing can be confidently wrong

**Decided:** `knees.mjs` enforces that the knee bends in the anterior direction.

**Why:** L spotted a backwards knee on the Bulgarian split squat. Checking all of them found **14 backwards knees across 9 exercises**, plus a pistol squat that changed which way it was facing between frames.

**Rejected:** an equivalent elbow test. The shoulder rotates freely, so there is no equivalent anatomical law to test against — asserting one would have produced false failures. Better no check than a wrong check.

---

## Testing philosophy

### Instruments measure the painted result, not the source

**Decided:** Contrast is measured by screenshotting each text run and reading actual pixels; collisions are measured from `getBoundingClientRect`.

**Why:** CSS-derived contrast cannot composite alpha, gradients or blur. It produced confident false positives *and* missed real failures.

### A test that can't fail is worse than no test

This principle was earned three separate times:

1. **The steps test seeded its data with the same bug it was meant to catch** — `addDays()` returning a Date into a string-keyed store — so it validated the bug instead of finding it.
2. **The contrast checker silently measured nothing.** It assumed 8-bit RGBA; Chromium palettises small flat clips; the decoder threw; the caller swallowed it with `continue`. It reported "no failures" having sampled almost nothing.
3. **The sheet checker opened every other sheet as a no-op** — close and open in one tick — and still printed "sheets checked: 21".

Every one of those printed a green result. All three are fixed, and the instruments now report what they *couldn't* measure rather than staying quiet.

### Report false findings honestly

An early probe reported that ticking a set and reloading destroyed the session. It was the harness — `addInitScript` re-seeding blank state on every load. It was reported as a harness bug rather than shipped as a finding.

### Silent caps are lies

`collide.mjs` printed a hardcoded "27 sheets" long after the list had grown. Coverage numbers are now computed from the arrays they describe.

---

## Platform

### iOS will not run JavaScript from `file://`

**Decided:** The app must be hosted. Instructions say so, and `#s-boot` explains it in-app if the script never runs.

**Why:** An earlier instruction told L to open the file from the Files app. That cannot work — verified, not assumed. The blank screen he reported was this.

**Rejected:** any "open the file locally" path. There isn't one on iOS.

### Steps are the weakest HealthKit signal; sleep is the strongest

**Decided:** In the native wrap, prioritise sleep ingestion over step counting.

**Why:** Steps are noisy, device-dependent and barely affect training decisions. Sleep drives readiness, which sizes the session — it changes what the app actually does.

### Screen wake lock is requested but cannot be relied on

**Decided:** `wakeOn()` during a session, re-acquired on `visibilitychange`.

**Why:** The Screen Wake Lock API is supported in Safari 16.4+ but was silently inert in home-screen web apps until iOS 18.4. It degrades quietly, which is the correct failure mode. It is a real reason to want the native wrap.

### GitHub Actions macOS runners, so no Mac is needed

**Decided:** `guzo-native/.github/workflows/ios.yml` builds and uploads using an App Store Connect API key.

---

## UI decisions worth keeping

- **Today was 11 modules; it is now 5** (`home-top → hero → day-strip → week → routines`). Everything else was competing with the one question the screen exists to answer.
- **The exercise picker opens as collapsed muscle groups**, not a flat list of 236. Search matches muscle names and equipment, so typing "back" finds the whole back. Searching auto-expands everything — a closed accordion over search results is a list you have to tap twice to read.
- **Multi-select when building a routine.** The sheet stays open, each add is confirmed in place, and you leave via Done. Being thrown out after every choice was the single worst interaction in the app.
- **The plate calculator uses `fmtP()`, not `fmtW()`.** Rounding 1.25 kg to "1.3" is cosmetic elsewhere and wrong on a plate list.
- **Last-time recall shows the real history**, not a summary — "80×8, 80×8, 80×6 · 3 days ago".
- **Arrows and chevrons are stroked SVG paths, not text glyphs.** A hairline `↓` antialiases to roughly half its nominal contrast; it passes a CSS review and fails a pixel check.
- **`--faint` was #5a636e (2.98:1) and is now #868f9a.** Unreadable in daylight, which is where a gym is.
- **Pinch zoom is not blocked.** `viewport-fit=cover` without `user-scalable=no`.
- **Five nav tabs, always.** Fuel replaces Route in the bar when enabled; Route stays reachable from More.

---

### The service worker has to be a real file, so the deploy is two files

**Decided:** `build/sw.js`, copied to the site root by `build.sh`. Deploy is `index.html` + `sw.js`.

**Reversed:** the original "one deployable file, no exceptions" rule. L released it explicitly: *"I have no loyalty to a one file system. Do what works best especially in the future as I continue development."*

**Why:** there was no alternative. A service worker script must be fetched over http(s). It cannot be inlined in the HTML, built from a Blob, or served as a `data:` URL. The single-file rule and the offline promise were in direct conflict, and only one of them could survive.

**What the old approach actually did:** nothing. The Blob registration was rejected by every browser and the `.catch(() => {})` swallowed it, so the app shipped with no worker, no cache and no offline support while claiming all three. Verified in a real browser before changing anything — zero registrations, zero cache keys.

**Rejected:** keeping one file and quietly dropping the offline claim. The app is for someone who trains in hotel basements; that is the use case, not an edge case.

**Cost accepted:** uploading only `index.html` now gives you an online-only app. It degrades rather than breaks, and logs one line saying so.

### Navigation is network-first, not cache-first

**Decided:** the worker serves the cached shell only when the network fails or takes longer than 3.5s. Everything else is cache-first.

**Why:** there is no in-app update prompt, so a cache-first shell would pin a phone to whatever version it first installed — every future fix would land on the host and never reach the device. The bounded wait is what keeps that from costing anything offline, where a request that hangs rather than failing is the normal case.

**Rejected:** cache-first with a version bump to bust it. It only works if `VERSION` is bumped every release, and `VERSION` has sat at 1.1.0 across many changes. A correctness guarantee that depends on remembering a manual step is not one.

### An instrument has to be proven red

**Decided:** `sw.mjs` was run against the bug it was written for. Reinstating the Blob registration takes it from 17 passed to 12 failed — and the first two attempts hung, then crashed, rather than reporting, so both were fixed.

**Why:** this project's history is three green results that measured nothing. A worker that never registered is exactly the failure a source-reading check cannot see, so the instrument drives a browser, cuts the network, and then changes what the server returns to prove updates still arrive.

---

### Availability decides the week; ties are spread, not front-loaded

**Decided:** `pickDays()` groups usable days into bands of equal available minutes, fills from the most available band down, and spaces its picks across a band that holds more candidates than there are slots left.

**Why:** the sort was already correct and the bug was underneath it. `.sort()` is stable, so a fresh profile — where all seven days carry the same default — came out in calendar order as a single band, and `.slice(0, n)` took Monday to Friday every time. A five-day programme put nothing at all on the weekend, and someone opening the app for the first time on a Saturday met an empty plan.

**Rejected:** spreading unconditionally. The reason the app asks how much time you have is that more time wins; spreading is a tie-break, not a policy. There is a check asserting that two long weekend days beat five short weekdays.

**Rejected:** rotating the start day, or seeding the choice from the date. Both make the plan non-deterministic across a week boundary for no benefit.

### One clock

**Decided:** `weekStart()` defaults through `today()`.

**Why:** it defaulted to `new Date()` while `today()` went through `dk()`, so the app had two independent sources of "now". A fixture that pinned `today()` left `weekStart()` on the real clock. It was correct on the day it was written and would have started failing the next time the real date crossed a Monday — the kind of test that goes red for a reason unrelated to anything anyone changed.

**The lesson, again:** the `daysBetween` collision was two definitions of one function. This was two definitions of one concept. Same failure, one level up.

### A bar that cannot exceed its track has to say so

**Decided:** the Fuel week track spans to `FUEL_BAR_CEIL` (140% of target) with a hairline marker at 100%.

**Why:** the old bar computed a percentage up to 140 and then clamped the fill to 100, so a day 40% over target was drawn exactly like a day that landed on it. The numeric readout beside it was right, which made the bar worse than useless — it disagreed with the number and looked authoritative.

**Rejected:** colouring the overshoot. Fuel never goes red, and there is a check enforcing it. Being over on a Tuesday is information, not a failure; the marker says where the target was and lets the bar say the rest.

**Rejected:** scaling every bar to the week's own maximum. The target is the thing worth comparing against, and a floating baseline would make two different weeks incomparable.

### Dangling references are repaired at boot, not guarded at every read

**Decided:** `repairRefs()` runs once at boot, before `buildWeekPlan`, and again whenever a routine is deleted.

**Why:** nothing enforces referential integrity — every link between stores is a bare string key. The read-side guards that existed were honest about it (`planLabel()` renders "Deleted routine" rather than crashing) but left the day unstartable with no way to fix it from the UI. Sweeping once at the boundary is cheaper than defending every read, and it repairs devices whose state broke before the fix existed.

**Decided:** a day that loses its routine falls back to an ordinary planned session rather than being emptied. The day was chosen deliberately; removing it from the route is a bigger edit than the one that was asked for.

---

### The update path is the app's job, not the host's

**Decided:** the shell fetch bypasses the HTTP cache (`cache:'reload'`), the app asks for a worker update whenever it returns to the foreground, and a controller handover reloads the page once.

**Why:** "network-first" is a claim about behaviour, and a bare `fetch()` does not make it true — the browser's HTTP cache satisfies it, and GitHub Pages sends `max-age=600`. Separately, an installed home-screen app resumes rather than navigating, so the navigation path that was supposed to deliver updates never executed. Both failures were silent, and between them a deployed release could never arrive.

**Rejected:** an in-app "update available" prompt. It is one more thing to tap on a screen whose whole point is removing friction, and the reload is safe — state is written on every mutation.

**Decided:** never reload mid-session. State survives it, but pulling the screen out from under someone between sets is precisely the kind of thing this app is supposed to not do. It lands on the next launch.

**The lesson:** a test kinder than production is a test that passes for the wrong reason. `sw.mjs` sent `no-cache` where the real host sends `max-age=600`, and that one header is the difference between catching this and shipping it twice.

### Fuel intake is asked only when Fuel is on

**Decided:** height, age, sex, activity, meals-a-day and dietary restrictions live in chapter four of onboarding, behind the Fuel yes/no, and are skipped entirely when the answer is no.

**Why:** the intake's founding rule is that every question changes a generated session. None of these do — they are Mifflin-St Jeor inputs and suggestion filters. Asking everyone would have broken the rule the form is built on; asking nobody left `energyTargets()` returning null for every new user, so Fuel opened with no target at all and the formula path was dead until somebody found the Profile sheet.

**Also decided:** the same questions live on permanently as Fuel's "How you eat" sheet, because Fuel can be switched on from More months later and that person was never asked any of it.

### Suggestions propose; they never act

**Decided:** `suggestMeals()` returns a shape for the day. Logging one is a deliberate tap, and it goes through `logFood()` like anything else.

**Why:** this is the first thing in the app that proposes rather than records. Anything that wrote to the diary on its own would corrupt the one dataset the app is honest about — and adaptive TDEE reads that diary back, so an invented entry would come back as a wrong expenditure estimate weeks later.

**Decided:** variety comes from the date, never from `Math.random()`. The same day suggests the same plate every time it is opened.

**Why:** a suggestion that reshuffled on every render is noise. It would also make the feature untestable, which is the same objection in a different coat.

### Dietary tags are conservative, and the app says it is not an allergen database

**Decided:** where a real product usually contains something, the food is tagged as containing it. Oats carry `gluten` — naturally free of it, routinely contaminated in milling. Dark chocolate carries `dairy`.

**Why:** the costs are not symmetric. Wrongly excluding a food costs one fewer suggestion. Wrongly including one means somebody eats it.

**Decided:** the UI states plainly, in both the onboarding screen and the preferences sheet, that these are generic reference foods rather than products with labels, and that anything medical needs the packet read.

**Why:** the app cannot know what brand of bread is in the hotel. Implying otherwise would be the most harmful thing in the product.

### The nav floats

**Decided:** a fixed, blurred pill inset from the edges, roughly 56px tall, with the selected tab as a filled pill.

**Why:** the old bar's padding plus the safe-area inset plus a top border came to roughly 100px of permanent chrome for five icons. Floating it gives that height back.

**Rejected:** genuine transparency. The labels are `--faint`; over arbitrary scrolling content that fails a pixel-sampled contrast check while passing a look at the CSS — the same failure mode as the hairline glyphs. The blur is the finish, the near-opaque background is the substance.

**Rejected:** keeping the 2px hairline indicator above the active icon. At that size it antialiases away, for the same reason the arrows in this app are stroked paths rather than text glyphs.

**Cost accepted:** the nav no longer occupies flow space, so every screen it covers carries its own `padding-bottom`. A new screen has to be added to that rule or its last card hides underneath.

---

## The `daysBetween` collision

Recorded separately because it is the most instructive bug in the project.

`p4_engine.js` declared `daysBetween(a, b)` returning a signed difference. `p4d_plates.js` later declared **its own** `daysBetween` — added defensively, because a malformed date in `S.sessions` had crashed the entire Train screen — which clamped the result with `Math.max(0, …)`.

Because `p4d_plates.js` loads after `p4_engine.js`, its declaration won **for the whole application**. `daysBetween` could not return a negative number anywhere. Every past-or-future test in the codebase went blind: `relDate()` called every past date "Today", and the new mid-week catch-up sheet offered days that had not happened yet.

**Resolution.** One definition, defensive about malformed input but signed. The one caller that genuinely wants a non-negative age clamps at the call site. `dupes.mjs` now fails the build on any duplicate top-level declaration across parts.

**The lesson:** in a concatenated single-scope app, a local defensive fix is a global behaviour change.

---

## The one external request: Open Food Facts barcode lookup

**Reversed.** "No third-party requests, ever" held for the entire life of this
app and is written into `CLAUDE.md`, `docs/decisions.md` and the service
worker's own comments. It no longer holds without qualification, and this
records both states rather than quietly editing the old one.

**Before.** The barcode scanner read the code on device and looked it up in
your own library. A packet it had never seen asked you to name it once; every
scan after that was one tap. That still works, unchanged, and is still what
happens with this switched off.

**The problem with that.** The *first* scan of every packet is a form. For
somebody buying twenty new things a month that is twenty forms, and the feature
reads as broken to anyone who has used MyFitnessPal — where the first scan is
the whole point.

**What was rejected.**

- *Shipping a product database.* Open Food Facts is roughly 3 million products
  and several gigabytes. There is no version of that inside a single HTML file.
- *A subset of the most common branded products.* Tried on paper and abandoned:
  "most common" is regional, brands reformulate, and a stale calorie figure
  presented as fact is worse than no figure. The whole-foods catalogue can be
  correct because whole foods do not change; a Snickers in 2019 is not a
  Snickers now.
- *A proxy of our own.* Would mean a backend, which would mean an account, a
  bill, and a thing that can go down. The app has none of those and the absence
  is the point.
- *Doing nothing.* Defensible, and was the position until asked directly.

**The terms it is allowed on.** These are the decision, not the implementation
detail:

1. **Off by default**, turned on by hand in Settings, with the copy saying
   plainly that it is the only thing the app ever sends anywhere.
2. **Nothing is sent but the barcode.** No account, no cookies
   (`credentials: 'omit'`), no history, no identifier. One host, one number.
3. **Never blocking.** Six seconds and it gives up.
4. **Never fatal.** Offline, refused, rate-limited, not-found and malformed all
   fall through to the sheet that asks you — which is exactly the behaviour
   that existed before. The feature failing costs nothing that was previously
   working.
5. **Never automatic.** What comes back is shown, with its numbers, before any
   of it is saved. It is data a stranger typed into a public database and the
   app has no business presenting it as fact — so it is also checked against the
   Atwater factors, and an entry whose macros do not add up says so.
6. **Asked once per packet.** The answer is saved as *your* food and bound to
   the code, so the same packet never causes a second request. Over time a
   user's library converges on their actual shopping and the network stops
   mattering again.
7. **Never cached by the service worker**, which has always ignored
   cross-origin requests. A stale cached answer would be worse than none.

**What this does not change.** Everything else still works with the network
off, including the scanner, and no other part of the app gained a request. The
offline promise now reads: *the app works entirely offline; one optional
feature asks one question of one server, and degrades to what it did before
when it cannot.*

---

## Train is a route, not a list of boxes

**Reported as:** "This screen still feels bulky and hate to say it boring."

**Measured before touching anything.** A three-movement session on a 390×844
screen came to **1,716px** — twice the viewport — with a single exercise filling
the whole of it. The back squat card was 417px, of which 255px was chrome and
162px was the three set rows anyone had come to log. Nine pixels in ten were
about a movement you were not doing.

The redundancy was as bad as the height. A bicycle crunch read `Bicycle Crunch
/ Core / CORE` — the muscle line and a badge saying the same word, one line
apart. Its target said `20`, the recall bar under it said `LAST 20 · 3 days
ago`, and every set row's placeholder offered `20`. Three copies of one number
in eighty pixels of stacked full-width bars.

**What the good ones do.** Hevy logs a set in two taps. Strong auto-populates
last time's weight and expects a tap, not typing. Fitbod is the cautionary one
and is described as cluttered for showing recommendations and muscle-group data
alongside the logging interface. The governing constraint is the same in every
review of the category: the logger has to be fast enough to update between sets
without losing your rest period to tapping and scrolling.

**The decision: a session has a position on it.** The same three states the
ascent on Progress uses — `walked`, `now`, `ahead`. Only the movement you are on
is a full card. The others are 58px lines, and every one of them opens on a tap,
so nothing is hidden; it is folded. The whole session fits on one screen and the
one thing you are actually doing is the one thing that is drawn.

- **The fold is derived, never stored.** `exFolded()` reads where you are, so
  undoing a set unfolds the movement again on its own and nothing has to
  remember that it did. `collapsed` is tri-state: absent means "fold what I am
  not on", and an explicit `true`/`false` is a choice you made and outranks it.
- **The number became a node.** A ring that fills with the sets you have ticked,
  in the same thirty pixels the flat "01" square spent on a number.
- **Two bars became one line of chips.** Target, last time and the plate line
  wrap on one row and disappear individually when there is nothing to say.
- **A badge that repeats the line above it was dropped**, matched token by token
  against the muscles already named — `Core` goes, `Arms` stays, because
  "Arms" is a substring of "Forearms" and a substring test would have taken the
  one badge that says something the muscle line does not.
- **The rail is pinned.** "Where am I" is the question you have while you are
  scrolling, and the answer was scrolling away with you.
- **The end of the route is a summit**, drawn with the ascent's own peak at the
  ascent's own coordinates — a session and a milestone are the same shape of
  thing and the app should not hold two ideas about what the top looks like.

**Measured after:** 1,716px → 1,132px, and the back squat card 417px → 323px
with every set row it had. The rest of the session went from "scroll to find it"
to three lines under your thumb.

### Two bugs the redesign was standing on

**A set row cannot be a fixed grid.** `.set-row` named five columns and its
children varied: a hold adds a run button, a run swaps distance for weight, a
bodyweight movement has no load column at all. The run button — shipped one
release earlier — was a *sixth* child, so the tick wrapped to a line of its own
and a timed set stood **105px** tall against everyone else's 54. Every previous
attempt at this row counted columns out in advance and every one of them broke
on a combination nobody had drawn. It is a flex line now, and there is no
combination left to get wrong.

**A weight box on a movement with no weight in it.** A plank offered a field
reading `— lb`; a bicycle crunch offered `0 +lb`. A third of every row given to
a question the movement does not ask. `wantsLoad()` shows the column where a
weight is part of the movement, or where you have ever actually logged one, and
the exercise menu turns it on for a weighted pull-up — with an explicit `false`
outranking the history, or turning it off on a movement you once did with a
plate would let the old weight switch it straight back on.

Neither bug reproduces the other's symptom, and **neither one alone reproduces
the 105px row** — restoring the grid on its own leaves five children on a plank
because the weight column is gone, and restoring the weight column on its own
leaves a flex line that simply gets narrower. `blanks.mjs` asserts both, and the
combined revert is what puts the plank back to 100px against the squat's 50.

### What a desktop browser could not have told you

The pinned rail sticks at `top: calc(-1 * (var(--safe-t) + 14px))` with a
matching padding and margin. All three cancel to nothing when
`env(safe-area-inset-top)` is `0px`, which is what a desktop browser reports —
so the check fakes a 47px inset and asserts the band reaches the scroller's top
edge while the card inside it clears the notch by exactly one notch.

Three things had to be got right, and each was found by measuring rather than by
reading the CSS:

1. **A sticky `top:0` sits at the top of the scroller's *content* box**, not its
   padding box. The bar stopped 14px down and `185 lb reps rpe` from the row
   above stayed legible in the strip over it.
2. **Padding alone moves where the card lands when stuck but not where it
   starts**, so the card jumps the moment you scroll. The negative `top` is what
   cancels it; the negative margin is what cancels the padding at rest. A probe
   walking the last two pixels before the catch is what proves there is no step.
3. **A taller band paints over the screen title at rest** — the first attempt
   clipped the descender of "Full body".

And the check itself had to be measured twice. `elementFromPoint` is a valid
proxy for "what is drawn here" only because both layers are hittable; the ridge
on Progress is the counter-example, where a `pointer-events:none` decoration
passed a hit-test check while painting straight over the words. The first
version of the pinned-band check also failed for a reason that was not there:
it measured into the screen-arrival stagger, where every rectangle on the screen
is a few pixels out.

---

## The range, and an icon set with a palette

Two asks in one message: put the mountains that stand behind the ascent on
Progress at the top of Train, "except it reveals itself as you progress through
the workout — each exercise illuminates a corresponding % of the mountain that
that exercise represents against the whole routine"; and go over the icons,
which were "bland" with "not enough contrasting colours".

### The range divides by work, not by movement count

A movement owns a slice of the horizon equal to **its sets over the session's
sets**. Ten sets of squats own more mountain than one set of calf raises, which
is the honest reading of "what this exercise represents against the whole
routine" — and the alternative, an equal slice each, would have made a warm-up
hang worth as much of the view as the main lift.

**Each movement lights its own slice**, in proportion to its own ticks, rather
than one bar filling from the left. Doing the finisher first lights the far end
of the range, because that is where that work sits. A single frontier would have
lit the squats you have not done.

The trail sits along the foot of the range, dividing on the same shares — which
is why `.rail-seg.now` no longer grows to `flex: 2.1`. Widening the movement you
are on moved every boundary along the range every time you finished something,
and a trail segment that slides out from under its own mountain is worse than no
alignment at all. It is brighter instead.

**One function computes the geometry.** `rangeGeom()` is read by the markup and
by the in-place update, and that is not tidiness — a revert that turned the
markup into a single frontier bar changed nothing any check could see, because
the first tick made `updateTrainProgress` rewrite the rects correctly from its
own copy of the maths. Two call sites that can disagree eventually will, and one
of them silently repairing the other is the worst version of it: the bug is
present, invisible, and waiting for a render that nothing follows with a tick.
The check now reads the rects straight off a render with no tick anywhere near
it.

Two things are drawn in HTML rather than inside the SVG, for one reason: the
range is `preserveAspectRatio="none"`, so anything round in it comes out an
ellipse whose eccentricity depends on how wide the phone is. The marker standing
on the skyline is an HTML element positioned in percentages, and the light on
the range is that marker's halo. The first attempt put the light in the SVG as a
gradient-filled rect, which read as a bar stuck to the left edge before you had
done anything.

### The icons

The diagnosis was one sentence: every icon in the app was a single 1.7px grey
stroke sitting in a flat grey square, a hundred and forty times. Two changes,
both applied in one place — an icon set is a system and editing it one glyph at
a time is how a system stops being one.

**Tone.** Three colours and a neutral, assigned by what a thing *is*:

- **Ember — the journey.** Terrain at every scale, the markers you pass,
  programmes, records, effort. The things this app is a metaphor about.
- **Teal — the body.** Every anatomical figure, and the things done to keep one
  working.
- **Sky — time, motion and anything there to be read.** Cardio modes, session
  lengths, clocks, meals, the guides.
- **Amber — careful.** Three icons: a warning, a block, a lock. They are the
  only ones that should catch the eye before you have decided to look.

Everything structural — gear, settings, marks, arrows — stays neutral, because
an icon set where everything is coloured is a sticker sheet, and the icons file
had already written that down before any of them had a colour at all.

**The tone applies only inside a tile** — a list row's icon well, an option, a
chip, a milestone. Everywhere else an icon still inherits its parent's colour,
so nothing that uses colour to mean *state* is overruled by an icon insisting on
its category. A chip that is on says so in ember and its icon goes with it.

**The well takes a wash of the same colour**, and this is most of the visible
difference: a coloured glyph in a grey box still reads grey, because the box is
four times the area. Done with `:has()` rather than a class at every call site —
the tone lives on the icon and there are a few hundred places one is written.

**The mass under the line.** A filled copy of the shape the stroke already
describes, at 16% of the icon's own colour, injected immediately after the
opening tag so it paints *under* the strokes. Seventy of the hundred and forty
have one; the rest are chevrons, arrows and rules, which have no inside, and
filling one is a smear rather than an icon.

### What is asserted, and what a class name is worth

A tone class is just a string until some CSS rule matches it, and a rule that is
renamed, rescoped or dropped leaves the class in the markup and the icon grey.
So `blanks.mjs` reads the colours back off rendered elements: the set carries at
least four distinct colours in a tile, every tone it declares resolves to a
different one, the mass is the first child of its SVG, a category colour never
overrules a state colour, and outside a tile an icon still inherits.

That last one was written wrong first and passed a revert. It sampled a single
icon, so unscoping a *different* tone left it green. It samples one icon per
tone now — the same lesson as the spread check that could not fail on a fresh
profile, arriving from a different direction.

---

## A button is an object, and Today opens on one

### The buttons

The whole set was a coloured rectangle with a 2.5% scale on press. Three things
give a control a body, and none of them is a bigger drop shadow:

1. **A lit top edge and a dark bottom one.** Light in this app comes from above
   — the cards say so, the ridge says so — so a control gets a bright inner line
   at its top and a dark one at its foot. That single pair does more than any
   amount of shadow, because it is what an object under a light actually looks
   like.
2. **A specular over the top half**, falling off before the middle. A gradient
   running the full height reads as a colour; one that stops reads as a surface
   catching light.
3. **Two shadows.** A tight dark one for contact and a wide tinted one for lift,
   both collapsing on press while the button moves **down** a pixel. A control
   that only shrinks reads as receding rather than as being pushed.

And a sweep of light across a solid button when you press it — **on
`pointerdown`, not on `:active`**. A real tap releases after about eighty
milliseconds, so a CSS animation bound to `:active` stops a seventh of the way
across. Transient class, removed on a timer, exactly as the set tick's flourish
already worked.

`.btn.quiet` is the one variant that deliberately gets none of this. It is the
way *out* of a screen, not the way through it, and it earns its affordance on
press instead. What it should never have been used for was the second and third
things you might do on Today — "Choose a different size" and "Doing something
else today?" were stacked lines of centred grey text under the Start button,
indistinguishable from captions and costing two full rows to say so. They are a
pair of ghost buttons side by side now, built from a list because either can be
absent: a routine has no size ladder and an unplanned day has nothing to swap,
and a `btn-row` with one child in it is a full-width button that reads as a
second primary.

### Today

The range stands behind the day's session the way it stands behind the ascent on
Progress — and its skyline **draws itself on when you arrive**, off `.entering`
rather than `.screen.on`. That distinction is the whole difference between
motion that explains something and motion that is just movement: bound to the
screen being visible it would redraw every time you logged a weight. The done
hero's skyline is teal, because that day is a summit.

`pathLength="1"` on the drawn line, so the dash arithmetic is the same at any
width. The range is `preserveAspectRatio="none"` and its real path length is not
a number the code can know.

The week went from "0/3 THIS WEEK" — three characters of monospace pretending to
be a status — to an arc that fills as the week does, which is the language the
exercise nodes and the milestones already speak. Two edge cases, both measured
rather than assumed: **nothing done draws no arc at all**, because a dash
pattern offset to its own full length still paints a subpixel sliver where the
two ends meet, and at twelve o'clock that reads as a session done when none are;
and **more done than planned does not wrap past full**, which is a real state —
an extra session on a day already discharged.

The daily strip's three labels carry their icons now. Three em-dashes over three
uppercase words was the whole strip before anything was logged, and the icons
are what make it read as three different things rather than three empty boxes.

### What is asserted

A button's press physics are a pseudo-element and a shadow — nothing about them
changes the markup, so all of it is read off the rendered element with a real
pointer held down. Two versions of that check passed for the wrong reason before
it worked: read in the same turn as the press, the transform is still at its
resting value, and the released state is `none` while the mid-flight one is an
identity matrix — so "did it change" was true whatever the press did. It waits
for the transition on both sides now.

The sweep is driven through a real `pointerdown` event rather than by setting
the class by hand, because the listener is the part that has to still be wired;
a check that adds `.sheen` itself proves the CSS and nothing else.

And the skyline's arrival needed its own check. Being inside a
`prefers-reduced-motion: no-preference` block is not the same as being bound to
arrival — moving the selector from `.screen.entering` to `.screen` keeps the
animation name inside the guard and leaves that check green while the line
redraws on every render. The new one reads `animationName` off the element with
`.entering` present and again after an ordinary render.

---

## The body is data, not a picture

Asked for as a glowing anatomical figure you can rotate and touch. The honest
answer was: yes to a figure, yes to touching it, yes to male and female, and no
to true 3D — a rigged mesh is megabytes plus a loader, and both break the
single-file, zero-request, works-on-a-plane promise the whole app bends around.
"Rotate" is front ↔ back, which costs nothing real: no muscle in the catalogue
is only reachable from the side.

### Why it is authored as points

The obvious way is a traced illustration and it is wrong twice over. A raster
would be the first binary asset in a file that has never had one, and would
need a copy per view, sex and density. A traced SVG would be one frozen
drawing — the proportions could not change, a region could not be lit by how
hard it was trained, and the female figure would be a second drawing rather
than the same anatomy.

So it follows `p3c_form.js`, which has drawn 45 form diagrams from four joints
and inverse kinematics since long before this. Every region is a short list of
coordinates on a 132 × 240 grid, smoothed into a closed path at render time.
Three things fall out of that:

- **One anatomy, two bodies.** The male/female difference is four numbers — the
  horizontal scale at shoulder, waist, hip and thigh — applied to every point as
  it is emitted, blended along a ramp so no boundary puts a kink in the
  silhouette. `Rather not say` sits between them rather than defaulting to
  either, which is the same answer the energy equation already gives that
  choice.
- **One half, drawn once.** Everything left of centre is the right half
  mirrored into the same closed path, so the figure cannot come out lopsided
  and there is no seam down the middle where two strokes would meet.
- **Regions are addressable.** A muscle is a named shape, so it can be lit,
  dimmed, tapped, or coloured by seven days of volume.

### The proportions took three passes

The first figure was 100 units wide and everything in it was wrong for one
reason: with the arms hanging clear of the body — which they must, because
biceps and triceps are two of the ten regions and neither is reachable on a
figure with its arms pinned to its sides — a realistic shoulder span does not
fit in a box as wide as the body is at the hip. It is 132 wide now, on a 7.5-head
figure: head height 32, shoulders two head-heights across, crotch at four heads,
knee at five and a half.

The second pass fixed the thing that reads as a rendering fault rather than as
bad anatomy: **the ribcage is a good deal narrower than the shoulders**, so a
pectoral authored to the shoulder's width hangs in mid-air beside the body. And
a `Core` as wide as the torso at every height draws a belly rather than a
midsection — obliques taper towards the hip and the silhouette does the work of
saying where the body ends.

### The heat is your own week, not a target

`bodyHeat()` normalises seven days of `muscleVolume()` against the busiest
muscle rather than against a fixed ceiling, because there is no honest fixed
ceiling: twenty sets is a heavy week for one person and a Tuesday for another.
What the figure says is *this is where your week went*, which is true of any
week. It is emphatically not *you are 60% of the way to enough*, which would be
inventing a target the app has never had and does not want.

A week with nothing in it lights nothing, and draws itself cold. That is the
honest picture of a week with no sessions in it.

### Two constraints that shaped the interaction

**Touch targets.** The floor is 44px, and at a figure ~460px tall a biceps is
about 26 × 60. Each region carries an invisible twin with a 13-unit transparent
stroke and `pointer-events: all`, which makes fill *and* stroke hittable whether
or not either is painted — a 26px muscle with a 39px target and no 39px muscle
drawn. That is not enough on its own, so a tap the region paths miss falls
through to the nearest region by centroid. A body map that sometimes ignores you
reads as broken rather than as precise.

**Teal is absent from the heat.** It already means *done* in this app. A body
map where teal meant "trained hard" would be one colour saying two things one
screen apart, so the heat runs through ember and the selection is the brightest
thing on the screen.

### What the checks caught

The geometry check found a real defect on its first run — the hamstring's outer
edge poked 0.8 units outside the leg at the knee, which at phone size is a
visible sliver of muscle floating beside the silhouette. It compares every
authored point against the silhouette at the same height, through the same
transform the figure is drawn with.

The tap check sweeps the whole 132 × 240 box rather than sampling a few points,
because the gaps between regions are exactly where a hit test stops answering
and they are not where you would think to look. And the sex check measures
shoulder and hip span *through* `bodyPt()` rather than reading the table, which
would only prove the table has different numbers in it.

One revert passed that should not have: renaming `Calves` to something else on
the back view left the check green, because Calves is also on the front. Proving
it needed a muscle that appears on one view only.

### Not done yet

The stretch setup still picks sore areas from eight chips rather than by
pointing at the figure, and the onboarding sex question is untouched — see the
note above on why a BMR coefficient with a "rather not say" option is the
weakest place for a body-picker, not the strongest.

### Pointing at what hurts

The stretch setup asked "anything sore or stiff?" with eight chips. It asks the
same question with a figure now, and the chips stayed underneath as the record
of what you picked and the way to take one back.

That is not a nicer way of reading a list, it is a different act: you do not
have to translate "the outside of my knee" into a word first, and the eight
words were the whole reason the question felt like paperwork.

**The joints are a different layer, not more muscles.** The eight things
`INJURIES` names — shoulder, elbow, wrist, neck, lower back, hip, knee, ankle —
are joints, and a joint is a *place* rather than a shape. Drawn as muscle
regions, "wrist" would have covered the forearm and "lower back" the glutes,
which is not where either of them hurts. So the muscles stay drawn underneath,
dimmed, as the anatomy the joint sits in, and they are not hittable in this
mode.

**One function flags an area**, whether the tap came from the figure, from a
chip, or from the nearest-marker fallback. Three call sites writing to the same
array would drift, and the one that drifted would be the figure — the only one
of the three with no visible list to check itself against.

**`mode` decides the vocabulary.** The same pixel means a muscle on one screen
and a joint on another, and a fallback answering in the wrong one would quietly
flag your shoulder when you asked to stretch your chest. The check asserts the
answer comes back in the vocabulary the figure is showing, and the revert that
drops the mode argument goes red with `Shoulders / Shoulders`.

### What the checks caught this round

**A joint target 9px under the floor.** The marker ring is 4.4 units and its
target was 13, which rendered at 35px — a marker big enough to tap accurately
would be too big to place accurately, so the two are separated, and the
separation has to be measured rather than assumed. Sixteen units is the
smallest radius that clears 44px at the width the sheet gives the figure.

**Two calf points outside the leg**, after the shins were widened to stop being
the dimmest thing on the screen.

And two reverts passed that should not have, both the same shape: removing a
target from *one* view leaves it on the other, so the union still covers it.
Proving either needed a target that appears on one view only — which is now
twice this exact miss has happened, once for `Calves` and once for `lowback`.

---

## The route is a route

The screen called **The route** opened with a billboard. Three lines of copy
explaining why the feature is good, under an eyebrow reading "the part that
matters", above a primary button — 45% of the viewport, every time you opened
the tab, pitching the tab to someone who had already opened it. A screen you
visit weekly does not get to sell itself weekly.

Under it, seven rows at 180px each. Every one carried a 44px tick that
duplicated an icon two columns to its left, a date, a subtitle, and a pill
reading **"A normal day"** — which is the default, so the screen printed the
word *normal* seven times to say nothing at all. A week was 1,260px of that.

**What replaced the billboard** is the week's actual shape: sessions done
against sessions planned, and how many minutes are still ahead of you. The
pitch survives as one sentence underneath, where it is context rather than a
poster.

**What replaced the rows** is the thing the screen is named after. Seven
waypoints on one trail — teal behind you, ember where you are, dashed ahead —
which is the language the ascent on Progress and the range on Train already
speak. 180px became 66.

Three details that are the difference between a trail and a decorated list:

- **The rail is its own column**, so the line runs continuously between nodes
  rather than being drawn per row and meeting at a seam every 66px.
- **The line above today is covered and the line below it is not.** That is the
  whole claim of the drawing, and it is read off the rendered element in the
  check, because both are backgrounds and neither changes the markup.
- **A day says what it is only when it is not the default.** The chip appears
  for a micro day or a rest day and for nothing else.

A day that went by without a session is not marked in red and does not break
the trail. It is simply not filled in — see the tone rule, which has said since
the beginning that a missed day is free.

---

## Age, and the discipline of asking for it

Age was collected only if you turned Fuel on, and the code said outright why:
*"Height, age and sex change nothing about training — they are the Mifflin-St
Jeor inputs."* Asked for now, in chapter one, always. Which raises the question
that should be asked before any app collects a date of birth: **what is it
allowed to change?**

The evidence, looked up rather than assumed:

- **Recovery is genuinely equivocal.** The 2023 scoping review is explicit: four
  studies found worse symptoms in older participants, two found the opposite,
  and the rest found no difference. There is no honest basis for slowing
  someone's programme because of their birth year.
- **The practical end is better supported.** Three sessions a week, 48–72 hours
  apart, is enough recovery for most older adults.
- **Anabolic resistance is well established.** The same protein dose produces a
  smaller synthesis response in older muscle, so the intake that saturates it is
  higher.

So age does exactly two things, and the negative list is the more important
half:

**It says when two hard days land back to back** — and only says it. A week
quietly rebuilt around a number someone gave for the energy equation is not
something they asked for, and the functional evidence is nowhere near strong
enough to spend somebody's Tuesday on. The notice appears above the route, names
the two days, cites the review, and states in the copy that nothing has been
changed. It is silent for anyone the evidence does not cover.

**It is checked against the protein guidelines** — which is not the same as
raising the target, and the difference is a finding worth writing down. The
obvious move is a floor that rises with age. It was written, and it never once
bound: `energyTargets()` already lands around 1.9 g/kg for anyone it can compute
for, above the highest age-adjusted guideline there is. **A floor that can never
be reached is dead code with a comment on it.** It came out, and the guarantee
moved to `engine.mjs`, which asserts the target still clears the older-adult
floor at every band — so if the protein model is ever lowered, that is what
catches it. Strictly better than the line of code it replaced.

**And nothing else.** Not the readiness score, not the rung ladder, not a single
rep range. `engine.mjs` asserts that too, by computing readiness, the suggested
rung and a catalogue row at 30 and at 71 and comparing the strings — which is
the check that goes red on the revert that makes `readinessScore()` peek at
`ageYears()`. That is the temptation this whole section exists to close off: an
app that knows your age will find somewhere to use it, and the places it would
reach for first are the ones with no evidence behind them at all.

The onboarding screen says all of this in three sentences, because a number
collected without a stated reason is a number people give wrong.

---

## A marker is something you have, not something you were given

Found by looking at Progress with a seeded history and noticing the hero said
**"Day 1 · nothing behind you yet"** directly above a stats row reading
**fourteen sessions**. It looked like a fixture artefact. It was not.

`milestonesReached()` read `S.journey.reached` — a map of flags written by
`checkMilestones()` when a session completes. Three ways that breaks, and the
third is permanent:

1. **A session logged by any path that does not call `checkMilestones()`** leaves
   the flag unset. The ascent then says nothing is behind you while every other
   number on the screen disagrees.
2. **A restore or an import** brings the sessions and not the flags.
3. **A milestone added in a later release is unreachable by everyone who has
   already passed it**, because the recorder only ever looks forward. Ship a
   300-session marker in a future version and the person with 400 sessions never
   gets it — for good.

Every milestone already carries a `test(st)` against `journeyStats()`. Asking it
is the whole fix, and it is the rule this codebase applies everywhere else:
**derive it, and store only what cannot be derived.** Here that is the date — so
a marker recorded as it happened still says when, and one derived from your
counts says nothing rather than guessing.

Fixing it surfaced two more, both of which had been sitting behind the first:

- **The ascent listed one marker twice**, once behind you and once ahead, because
  the "behind" list was now derived and the "ahead" list was still reading flags.
  Two sources for *have I passed this* will always eventually disagree.
- **Four markers all claimed "Today"**, because `relDate(null)` renders as today
  and every derived marker has a null date.

And one more of the same family: **`journeyDay()` counted from `meta.created`
alone**, so a restored or imported history produced a journey that started after
its own first session. It takes the earlier of the two now.

`engine.mjs` at 277. All four go red on their reverts — including the one that
matters most, where a marker only counts if it was recorded.

---

## Two screens that were explaining themselves

### The stretch intro

The first thing anyone sees when they tap Stretch was **four hundred words in
three grey boxes**, with the button that starts the feature below the fold.
Every word of it was true and load-bearing — the dosing, the timing, the fact
that nothing is collected for its own sake — and none of that is a reason to
make somebody read an essay before they are allowed to try something.

The claims are all still there and still cited. They are three lines instead of
three paragraphs, and **the figure does the work the prose was doing**: it says
what this is about before you have read anything. The whole sheet now fits on
one screen with the button on it.

It is lit with a plausible week rather than yours, deliberately. You have not
trained anything through this feature yet, and a cold figure on the screen that
is selling mobility work says the wrong thing about mobility work.

`stretch.mjs` asserts the shape rather than the words: the figure is present,
it is under 130 words, every claim still carries a source, and the button is
within a phone screen of the top. That last one had to be measured against 720px
of assumed phone rather than against `window.innerHeight` — the instrument's
window is 720 tall and a real phone is 844, so a viewport comparison there
measures the test runner.

### The Fuel legend

Three lines of text with a coloured dot in front of them, sitting directly under
a ring that had just drawn the same numbers as arcs. The dot carried no
quantity, so the ring said *you are a third of the way through your protein* and
the row under it said *12/170g* and neither helped you read the other.

They are the same arcs, unrolled: each macro's own share of its own target, in
its own colour. A legend that explains the ring by repeating it in the shape
text can be read in.

Writing the check found the reason fat's dot had always been the grey one:
**the ring has no fat arc.** It draws kcal, protein and carbs, and fat was
legend-only — so the legend read as though fat were not really being counted.
The bar is now the only place fat is drawn at all, which is a better fix than a
fourth ring on a ring that is already three deep.

The check compares the bars to the **ring itself** rather than to a recomputed
target. Recomputing would only prove the check can do arithmetic, and it would
keep passing if the ring quietly started using a different target from the bars
— which is the entire failure mode of two things drawing one number.

---

## The figure, made person-shaped

Three things were wrong and all three were the same mistake: authoring a body
part as the shape it *approximately* is rather than as the shape it is.

**A head is not an egg.** The first one was widest at the middle and tapered
evenly to a rounded point, which is a head from across a room and a balloon up
close. A cranium is widest high and above the ears; the jaw angles in below it;
and the notch where the jaw meets the neck is most of what makes a head read as
a head rather than as a shape on a stick. Two points close together at the jaw
angle force the corner that the Catmull-Rom was rounding away.

**A neck is short.** It ran thirteen units from chin to shoulder — longer than
a head is wide. With the smoothing running through it, the head and the neck
came out as one continuous tube.

**A straight line is a straight line however many points are on it.** The
trapezius had six points and they were all at the same slope, which is the
definition of a straight diagonal and read as a coat hanger. A real trapezius
leaves the neck close to flat and only turns down as it goes over the ball of
the shoulder.

The same class of fix elsewhere: the waist is now genuinely narrower than the
ribs above it and the hips below it, where before all three sat within four
units of each other and the torso was a rectangle with rounded corners; the
upper arm narrows into the elbow and the forearm swells below it, where before
the whole limb was one tube; the knee is the narrowest part of the leg and the
calf belly sits high on the shin with a long taper to an ankle a third its
width; and there is daylight between the thighs, which a standing figure has and
this one did not.

The geometry check paid for itself again — five region points ended up outside
the new, tapered limbs, and it named all five with their coordinates.

---

## A label that labels six of nine rows is not a label

Today's stretch list carried a coloured chip on every row naming why the
movement was there, under a chip row above it naming the same three reasons in
a different colour system. Six of the nine rows read **"flagged"**. This is the
identical failure to the Route screen's pill that printed "A normal day" seven
times: a label repeated on most of its rows stops carrying information and
becomes texture, and paying for it in row height (80px) and in a third palette
makes it worse than nothing.

The reason is now the **heading of a group**, and the rows underneath it are
plain — name, muscle, and the dose right-aligned in its own column. Each group
carries its own done count, so the thing the chips were actually being read for
(how much of *this* is left) is answered once per group instead of inferred
across nine rows. Rows are 63px. The body-map entry moved off its own row onto
the header as a single button; the warning is one line.

**A movement can have no reason at all.** `dailyStretch()` returns `why: null`
for anything that is just rounding the session out, so the grouping falls back
through `(x.why || '')` into a "Rounding it out" group. On a profile with no
flagged areas, no occupation and no training history that is *every* movement —
without the fallback the list renders empty, and the first version of the check
could not see it because its fixture supplied all three reasons. This is the
third time in this project a coverage check over a union has needed a
single-case subject to be able to fail; the other two were `Calves` and
`lowback` on the body map.

Two further defects in the check itself, both the same shape: `pills` and `rowH`
were read off the sheet body **after** a second `sheetStretch()` had replaced
that node's innerHTML for the bare fixture, so they measured a render they were
not named after — and any `.str-grp` element held across that call is detached,
where `getBoundingClientRect()` returns zeros and a width assertion passes by
measuring nothing. Everything about a render is now read before the next one.

The heading-wrap check measures **painted text width against a fixed 300px**
rather than rendered height. The instrument's window is 1280 wide, so the sheet
in it is about three times a phone's and no copy ever wraps — a height check
there passes whatever you write.

All four subjects were reverted individually and confirmed red. The bare-row
one prints `0 of 7`.

---

## Onboarding was painting the names of its icons

`opt()` interpolated whatever its `ico` parameter held. Three call sites passed
ready-made markup; **nine passed an ICO key**. So the first screens a new user
ever sees rendered `goal-strength`, `lvl-new`, `area-Back`, `cardio-light`,
`car-walk`, `env-full`, `gear-barbell` and `pg-anchor3` as lowercase slugs in
the box the icon belongs in. Sixty-three option boxes; fifty-one of them wrong.

Every one of those icons had been drawn and was sitting in `ICO` under exactly
the key being printed. Nothing was missing but the lookup. `opt()` resolves it
now — a key never starts with `<`, so the three markup call sites fall through
untouched, and the resolution lives in the one place rather than in twelve.

**Two conventions in one parameter is what produced this**, and the fix is not
to pick one and edit twelve call sites — it is to make the parameter accept
both in a single function, so a thirteenth call site cannot be silently wrong.

### Why nothing caught it

No instrument in the project had ever rendered an onboarding screen. The blank
sweep, the emoji sweep, the palette check and the collision sweep all walk
`['today','plan','train','fuel','progress','more']` and a list of sheets.
Onboarding is neither, and it is the one surface every user sees exactly when
they are deciding whether the app is any good.

The check now renders all twelve `OB_RENDER` steps and asserts three things,
each of which fails on its own: no option box holds text, every box holds a
drawn `<svg>`, and **no screen gives every option the same icon** — the
session-length screen had four identical stopwatches, which is an icon that has
stopped distinguishing, the same failure as the stretch chip that labelled six
of nine rows. The four durations use the rising `avail-*` ladder instead: it is
the same quantity the app already draws that way.

### The emoji sweep had a hole exactly where the emoji were

`blanks.mjs` asserts no emoji is painted on any screen or sheet, it does read
the Settings sheet, and a `⏱` was sitting in that sheet the whole time. The
pattern covered `2190–21FF`, `2600–27BF`, `2B00–2BFF` and `1F000–1FAFF` — and
skipped **`2300–23FF`**, Miscellaneous Technical, which is where the clock, the
stopwatch, the hourglass and the media controls live. That is precisely the
block a training app reaches into. All four survivors (`⏱` ×3, `⏸`) were in it,
and `ICO.stopwatch` had been drawn for months.

A check that runs, reads the right surface, and reports green because its
pattern excludes the one range that matters is worse than no check: it is a
green light with a documented promise behind it.

### The chevron glyph, finally

Fragile area #8 has said since it was written that `↑ ↓ ← ✓ ›` antialias to
about half the contrast their colour promises and must be stroked paths. There
were still **twenty-eight `›` glyphs**, including every row of Settings, the
picker's open/closed marker on two screens, and the hero note. `ICO.chevR` and
`ICO.chevD` already existed. The three chevrons with their own sizing had it as
a `font-size`, which an SVG ignores — each states a box now.

---

## Onboarding, once anything was looking at it

Three more, all on the same unswept surface and all found by rendering it
rather than reading it.

**The step counter opened on zero and never reached its total.** `done`
counted the questions *behind* the current step and the label formatted it as
"N of M", so the first question of onboarding read **"0 of 16"** and the last
read "15 of 16". It is the ordinal of the question you are looking at now, so
it includes the current step.

The denominator was already skip-aware and stays that way: the shortest run
asks 16 questions and the longest 21, and the total has to be the number of
screens that particular run will actually show. The check walks both, asserts
the first is 1, the last equals the total, the number never repeats or jumps,
and the screen count matches the total — then asserts **the two runs are
different lengths**, or the pair above is one check run twice and the skipped
questions are never exercised.

**"Anchor 3 — 3 days".** The structure options were titled
`name + ' — ' + target + ' days'`, which prints the number twice on four of the
six — "The Five — 5 days", "Body Part Five — 5 days" — and was long enough to
wrap the title and knock the RECOMMENDED badge onto a line of its own. Every
description already opens with the count in words. The count is now a column of
its own on the right of the row, which is better than either: it is the answer
to the question the screen is asking, so it should be readable straight down
the options instead of hunted for inside each name. Same move as the stretch
list's dose column, for the same reason.

**A probe that scrolls the wrong node reports the whole app as broken.** The
first version of the footer-overlap check drove `.ob-body`, which has
`overflow-y:auto` and — being `flex:1` inside a `min-height:100%` wrapper —
never actually overflows. `#s-onboard` is the scroller. Nothing moved, and nine
of twenty-seven steps looked permanently cut off, one of them by 598px. The
corrected probe walks up from the element and takes the first ancestor that
both allows overflow *and* has some, reports which node it found and how far it
moved, and every step is clear. **There was no bug.** The rewritten probe is
kept in this note rather than in the suite, because what it proves is a
property of flexbox, not of this app.

The counter, the icons, the titles and the emoji were all on the one surface no
instrument had ever rendered. That is not a coincidence — it is what unswept
means.

---

## Losing weight was not on the list, and goals did almost nothing

Asked why there is no weight-loss option. There is now, and answering the
question turned up something larger: **goals barely existed.**

An exhaustive trace found exactly five reads of `S.profile.goals` in the whole
app, and only one of them mattered — a protein multiplier and a calorie offset
in `energyTargets()`, keyed on `'muscle'`. `'strength'`, `'health'` and
`'consist'` were read by **nothing**. Picking or unpicking them changed not one
byte of behaviour. Meanwhile the screen said:

> This sets rep ranges, accessory volume, and how the app talks to you.

False on all three counts. Rep targets come from `targetFor(exId)`, which takes
an exercise id and nothing else; slot counts come from `SLOTS` adjusted by rung,
priorities, warm-up and the time budget; and there is no goal-conditional copy
anywhere in the running app. A promise made on the screen where somebody tells
you what they want is the worst possible place to keep one you are not keeping.

And `energyTargets()` had been testing `goals.includes('lean')` since before
this work — a −400 kcal branch keyed on a value no code path could produce. The
machinery for fat loss was already there, waiting for an option that did not
exist.

### What fat loss actually does

Calories come off maintenance, and protein goes to **2.2 g/kg**. The evidence
puts the useful range at 1.8–2.7 g/kg under a deficit with training, with
2.4 g/kg beating 1.2 g/kg for holding lean mass; 2.2 sits deliberately
mid-range, because this is a number handed to somebody unsupervised and it
should be defensible rather than maximal.

Picking it pre-selects Fuel, because a deficit you cannot see is not a plan.
Pre-selected, not forced — the Fuel screen still asks and "not for now" still
works.

**Asking to bulk and cut at once resolves to cutting.** A surplus and a deficit
are opposite answers to one question, and averaging them silently produces a
number that serves neither while looking deliberate.

**A deficit never lands under the resting rate.** The existing flat 1200 floor
does not catch this: a small sedentary person can have a maintenance under 1600
and clear 1200 comfortably on the way down.

### What goals now change, and what they deliberately do not

Three real levers: protein, calories, and rest length (three minutes on
compounds when strength is the goal and size is not — "longer rests" is that
option's own wording). Plus leftover minutes going into accessory sets.

**Volume is governed by time in this app, by design**, and that is the honest
answer to "more accessory work". The first implementation inflated the
accessory slots on the way in, and it was *net negative*: the earlier
accessories ate the budget, a later slot was dropped whole, and a 75-minute
session went from 8 movements and 20 sets to 7 and 19. Losing three sets to
gain one is not more accessory work. It spends the **slack after the session is
built** instead — strictly additive, invisible on a tight day, and never on a
main lift. A check that only asked "did the sets go up" would have passed the
broken version; the checks assert movements never drop, sets never drop, and
main-lift sets never move.

Selection bias by goal was considered and rejected: `pickExercise` sorts
least-recently-done first, which is deliberate variety, and overriding it for a
goal would trade a real property for a cosmetic one.

Every option's note now describes something the code does.

### Age: the evidence says the intuitive change is wrong

Asked for age to change reps or intensity. The NSCA position statement puts
adults over 60 at **70–85% of 1RM** — so automatically de-loading older lifters
is not supported, and was not done. What is supported is recovery spacing
between hard sessions, which the app already had, and a higher protein floor,
which it claimed and did not have.

`AGE_BANDS[].protein` (1.6 / 1.7 / 1.8) was inert. An earlier note in
`proteinTarget()` said the floor was dead code and was *correct at the time* —
the model gave 1.9 g/kg to everyone, which cleared the highest guideline. That
stopped being true the moment the base became goal-dependent: anyone not
choosing "build muscle" now starts at 1.6, and for a seventy-year-old the band
is the only thing between them and a twenty-year-old's number. It binds now,
and the check asserts it **raises** the target rather than merely clears it —
the old check could not fail, because the default goals include "build muscle"
so the band never had to do anything.

### The age you gave was being thrown away

`ob-finish` wrote `birthYear` inside `if (obDraft.nutrition)`. That was right
when height, age and sex were all collected on the measure screen. The age step
is its own question in the "You" chapter now and `obSkip()` never skips it — so
**answering it and then declining Fuel deleted it**, silently, along with the
band and the back-to-back-hard notice that same screen had just promised.
Proven before fixing: born 1958, Fuel off, `birthYear` null, `ageYears()` null,
gap 0.

### Two things found by reverting

A check on the sub-resting-rate floor **passed with the floor removed**. The
fixture was a 48 kg, 152 cm, 76-year-old whose resting rate is about 890 — the
flat 1200 already covered it, so the case the floor exists for was never
reached. The window has to be aimed at: with the lowest activity factor the app
has, a deficit only breaks the resting rate between about 1200 and 1600.

And the privacy page printed the literal characters **`Guzo Fit v${VERSION}.`**
— the `${` had been escaped in the source, so the substitution never ran. It is
the same class as an "undefined" reaching a screen, and it slips past that
sweep completely, because what it leaves behind is neither empty nor any of the
words that pattern knows. Now swept across every help page.

That page also still claimed *"The app makes no network requests except to load
its own two files"* and *"There is no third party in this app to share anything
with"*. Both stopped being true when the opt-in Open Food Facts lookup shipped.
A privacy policy that under-declares is worse than one that over-declares, and
this one is written to be the actual policy. It now names the lookup, says what
it sends, and shows whether it is currently on.

---

## Onboarding, measured against the apps it competes with

Twenty-six screens, twenty questions, 2,703 words, and **exactly one screen
that showed the user anything back about themselves**. After the last question,
`ready` announced a further task — the week setup, seven more taps — so the
first exercise name appeared somewhere past interaction twenty-seven, and even
then Today said "Full body · 60 min" with the movements behind a Start button.

For comparison, Fitbod asks goal, experience and equipment and then shows a
full session with rep, set and weight targets. The subscription benchmarks say
the same thing from the commercial end: reaching a value moment before the
paywall roughly doubles trial starts, and most of the purchase decision happens
on day zero.

### The tension, and why it was not a real one

The instruction was to make onboarding *more* thorough, even if longer. The
benchmark data says time-to-value is what converts. Those look opposed and are
not: the problem was never the number of questions, it was that twenty
questions bought the user nothing until the end. **The fix is to give something
back during them, not to ask less.**

So the flow now ends on the session itself. `preview` sits after `seed` — so
the weights are the ones just confirmed rather than numbers that change a
screen later — and immediately before `ready`, so the one screen that asks for
more work is preceded by the reason to do it.

### It is generated, not mocked

By the real engine, from the real draft. A preview that is not the thing is a
promise rather than a payoff, and a mock would go stale the first time session
generation changed. Which means it honours the kit, the injuries and the seeded
weights, and the checks assert all three by building it four ways — full gym,
hotel room, bodyweight only, and a body with every injury flagged.

**The hazard is state.** `generateSession()` reads `S`, not the draft, so the
draft has to be written into `S` to build anything — and it *also* lazily
initialises rep targets into `S.lifts` through `targetFor()`, which is easy to
miss and would leave a half-seeded profile behind for somebody who walked back
and changed their answers. So the whole of `S` is snapshotted and restored in a
`finally` rather than unwound field by field. Reverting that restore fails the
check with `lifts 27/28` — twenty-seven catalogue entries written into a save
by a screen that only meant to draw a list.

### On the word count

Cut where it was worst: `structure` 262 → 186, `goals` 177 → 137, and the age
footnote by half. The total is roughly flat, because the preview adds words of
its own — but they are words that *give* rather than ask, which is the metric
that actually mattered.

Deliberately not cut further. The breakdown is 841 words of headings and
intros, **902 in option descriptions**, and 473 in footnotes. The option
descriptions are where the trade-off lives — "a missed day leaves half of you
untrained" is the sentence that makes the choice possible — and stripping those
would leave a shorter flow that is harder to answer. Screen count and word
count are proxies; the thing worth optimising is how much of what is on the
screen is load-bearing.

---

## The home indicator was being respected twice

Reported from a photo of Strava next to this app: the nav should sit closer to
the bottom, and the screen should reach it.

`.nav` was `bottom: calc(10px + var(--safe-b))`. On an iPhone that is 10 plus a
34px safe-area inset — **44px of empty screen under a floating pill**, which is
what made the app look like it stopped short of the bottom.

The inset exists so that a bar pinned flat to the screen edge clears the home
indicator. A floating pill already holds itself off the edge, so adding the
whole inset on top is the same clearance counted twice. The indicator itself is
a ~5px bar about 8px up, so it occupies the bottom 13px and nothing else. Half
the inset plus a small margin — `calc(8px + var(--safe-b) * .5)`, 25px on a
phone — clears it by twelve pixels and reads as anchored.

`.sheet` keeps the **full** inset, because it genuinely is a panel pinned flat
to the edge and that is the case the convention is for. The distinction is not
cosmetic: it is whether the element has a margin of its own.

The screens were worse. `padding-bottom: calc(var(--safe-b) + 96px)` reserved
130px under a nav occupying 85 — a round number with the whole inset stacked on
it. It tracks the pill now: 60px of nav, the same half-inset offset, and 10px
of clearance.

### Everything that floats above the nav encodes the nav's offset

The rest timer and the toast are both pinned a fixed distance off the bottom,
so retuning the nav without them leaves the timer hovering with a gap
underneath. Both now use the same half-inset arithmetic. The check asserts the
gap **does not change with the inset**, which is the real invariant and does not
need editing the next time the nav moves.

### None of this was visible to any existing check

`blanks.mjs` already asserted the nav "sits above the bottom edge" — but
`env(safe-area-inset-bottom)` is `0px` in a desktop browser, so it measured
10px and would have passed at 400px just as happily. This is the third time in
this project that a bottom- or top-inset bug has been invisible until the inset
was faked; the header sticky offset was the first.

One existing check had to be rewritten rather than retuned. `o.pad >= 90` was a
constant chosen to match a 96px padding, so changing the nav's offset broke a
check about scrolling for reasons that had nothing to do with scrolling. It
compares against the nav's measured footprint now.

---

## Sixty-two sheets, and nothing had ever opened them

The emoji sweep reads nine sheets. The blank sweep reads a screen at a time.
There are sixty-two sheets. Rendering all of them found three real bugs in
about a minute, the same way rendering onboarding did.

**The day editor painted `avail-long`, `avail-normal`, `avail-short`,
`avail-micro`, `avail-none` and `env-hotel` as lowercase text** in the icon
box. It is the same bug as onboarding, and it survived that fix because the
sheet hand-rolled `opt()`'s markup rather than calling it — the fix went into
the function and the copies never saw it.

Which is the actual lesson, and it is not "remember to check the copies". The
sheet had to hand-roll because `opt()` could not express the extra `data-k` and
`data-b` attributes it needed. **A function is only the single source of a
thing if it can express what its callers need**; where it cannot, callers fork
it, and the fork is invisible until something renders it. `opt()` takes a
`data` map now and the sheet calls it.

Compounding it: `sheetDayStart` declared a *local* `const opt`, which shadowed
the global option helper across that whole function. `dupes.mjs` cannot see
this — it checks top-level declarations — and it is a large part of why this
file grew its own copies of a row that already had somewhere to live.

**"How big is today?" printed `undefined` where each size's duration goes,
on all four rows.** It read `r.mins` off `RUNGS`, which has no such field,
while `rungMinsLabel()` sat two files away being used correctly by the help
page and the Train screen. Two call sites right, one inventing its own
accessor, and nothing to notice.

**The units-repair sheet drew its conversion arrow as `&rarr;`.** Fragile area
#8 has said since it was written that hairline arrow glyphs antialias to about
half the contrast their colour promises. The arrows in the help pages stay as
text and that is deliberate: "Settings → Display → Auto-Lock" is a sentence,
and an inline SVG inside running prose wraps badly and reads worse. The
distinction is whether the arrow is interface or typography.

### The sweep found a fourth thing that was not a bug

`sheetScanFound` reported an `undefined` — because the fixture passed a raw
Open Food Facts product instead of the normalised object the sheet takes.
`offParse()` returns **null** unless the name and all four macros are present,
so a half-empty product can never reach that sheet. The fixture was wrong, not
the app. Worth writing down: a sweep this broad will produce findings that are
its own fault, and each one has to be traced before it is "fixed".

## The welcome screen promised four minutes

Twenty-one questions at a brisk fifteen seconds each is five and a quarter
minutes before the seven-tap week setup and before reading a word of the 2,700
on screen. Four was not reachable.

Understating is the one direction that costs trust: somebody promised four and
still going at seven has been misled by the first screen in the app. It says
six, and the same sentence now names the payoff — which is the thing actually
worth knowing before starting a long form.

The check derives the floor from the question count rather than hard-coding it,
so adding questions without revisiting the claim fails here instead of
shipping. Its first version read "down to three minutes on a hotel floor" from
the size ladder — which appears earlier on that screen — and reported no claim
at all; it is anchored on "about"/"around" now.

---

## Today says what is in the session; the stretch list stops shouting

Two changes in opposite directions, and they are the same judgement: show what
somebody needs to decide with, hide what they already know.

**Today** said "Full body · 60 min" and kept the movements behind Start — the
one thing you want before deciding whether today is a training day. It lists
them now, with sets and reps, above the button.

**The stretch sheet** was nine rows of movements before anything else, and the
presets — which answer a different and more urgent question, "my back is
wrecked and I have fifteen minutes" — sat underneath all of them where nobody
scrolled. The list is closed on arrival behind a "What's in it" row, Start is
directly under the summary, and the presets are reachable without scrolling at
all. "Something else" and "Save as routine" moved inside the fold, because both
act on a list you have not asked to see.

The open/closed flag is cleared by the **one true entry point** and nowhere
else. This sheet redraws itself by calling `sheetStretch()` again on every tick,
reroll and back — resetting inside the render would slam the list shut the
instant somebody ticked a movement in it, which reads exactly like the tap not
registering. Asserted directly.

### previewSession(), and why it snapshots everything

Both screens draw a real generated session, and `generateSession()` lazily
writes rep targets into `S.lifts` through `targetFor()`. Fine when you are
starting a session; poison when you are only drawing one. Today re-renders on
every state change, so a leak there would seed a catalogue into the save of
anyone who merely looked at the screen.

One function now, shared with the onboarding preview, snapshotting the whole of
`S` and restoring it in a `finally`. Field-by-field unwinding was rejected for
the usual reason: it needs updating every time generation touches something new
and fails silently when it is not. Measured at **2.8ms against a 211KB save** —
two hundred sessions, a year of training three times a week — which is
affordable once per render and buys not having to memoise behind a cache key
that would need to name every input to generation to stay correct.

### Three of my own checks were wrong before they were right

Counting `.hw-row` nodes found them inside a hidden container just as happily,
so wrapping the whole block in `hide` left the check green — it was measuring
markup, not the screen. It filters on rendered height now.

The state-leak baseline was captured *after* the first render, so the first
render wrote the lift entries and the next two rewrote the same keys: `S`
looked stable while being wrong. Taken before any render now.

And the rest-timer check demanded two separately-rounded rectangles be
identical, which a fractional layout height broke by one pixel. The invariant
is that the gap does not grow by the whole 34px inset; 2px of tolerance keeps
that and stops the check crying wolf about its own arithmetic.

**A fourth failure was not a check at all.** A revert was restored without
rebuilding, so the next run measured a stale `index.html` and reported a leak
that did not exist. Restoring a file is not restoring the build.

## The build stamp could not answer the question it existed for

`build.sh` stamped the boot panel with `VERSION`, and its comment said this is
"what makes 'is this host current?' answerable at all". `VERSION` changes on a
release; this repo ships many builds per release, so every build for weeks read
`1.8.0` and the question was unanswerable.

It carries the commit now — `1.8.0+5593fd3` — taken from the CI variable where
there is one and from `git rev-parse` otherwise, so a wrong guess at
Cloudflare's variable name degrades to the checkout's own SHA rather than
silently dropping back to a bare version.

This matters more than it looks, because the deployed file is 1MB and a fetch
of it returns roughly the first 1,200 characters. Every content check against
the live site is therefore blind — asking whether "Lose fat" appears returned
"absent" for both the new copy *and* the old, which proves only that the fetch
was truncated. The boot panel sits inside those first 1,200 characters, so the
stamp is the one thing about a deployment that can actually be read from
outside.

---

## An imported plan kept its structure and then lost it on the way to the screen

Reported against a real five-day split: the warm-up "went somewhere else" and
the superset "didn't come together". Both were true. Neither was a parsing
failure — `parsePlan` worked all of it out and nothing carried the answer
through.

**The warm-up.** `blockFrom()` correctly read `WARM-UP — 8 MIN` and returned
`warmup`, and `applyImportItem()` wrote `sets`, `reps` and `mode` and threw the
block away. A routine has a whole-routine `warmup` boolean — "prepend a
generated mobility movement" — and no per-item block, so the plan's own warm-up
became an ordinary movement and Train re-derived it from the catalogue. A band
pull-apart is tier 3, so an eight-minute opener landed in **Accessories, below
four back movements**.

The block now travels: parser → routine item → session item, and `exBlock()`
reads a stated block in preference to the catalogue's tier. **Only a stated
one** — `blockFrom()` returns `accessory` when it cannot tell, and storing that
would pin a barbell row to Accessories on the strength of a shrug. So a plan
that says warm-up gets a warm-up, and a plan that says nothing keeps deriving.

**The superset.** `sessionOrder()` groups pairs before sorting precisely so the
block sort cannot pull one apart, and it did its job. The render then walked
the result comparing **each item's own block** to the previous one and emitted
a heading wherever they differed — so a rear-delt fly (tier 3, accessory)
paired with an EZ bar curl (tier 2, main) came out as

    ACCESSORIES / Superset A / Reverse Pec Deck / MAIN LIFTS / EZ Bar Curl

The pair moved together and was then split by a caption. Two call sites
computing the same thing and disagreeing: `exBlockShown()` is the one they both
read now, and the rail — which drew its break the same way — reads it too.

**And the index.** A PDF table gives the index either as its own line or in
front of the name, and only the column was handled. The other left `7A` glued
to the front of the movement, matched the catalogue against *that*, and lost
the superset letter entirely — so no pair ever formed from that layout.
`indexFragment()` also accepted only `A-F`, while `blockFrom()` reads `W`, `C`
and `F` to mean warm-up, core and finisher: `C` and `F` were inside `A-F` by
luck and `W` was not, so a plan that indexed its warm-up `W` had that line
dropped.

### Three of my own mistakes, again worth writing down

`exBlockShown()` read `supersetAt()` as an array. It returns
`{ run, pos, letter }`, so `g.length` was `undefined`, which is falsy, which
fell straight through to the item's own block — the exact behaviour the
function existed to replace, silently, and it took a render to notice.

The check that should have caught the split **passed against the bug**. Its
sequence walked `.ex-card, .ex-node`, and a movement matches both, so the
second contributed a nameless `X:` entry — sitting exactly where a wrongly
inserted heading would be. The adjacency assertion was satisfied by an empty
string. It takes one named entry per movement now, and the revert prints
`SUP | X:Reverse Pec Deck | H:MAIN LIFTS`.

And the first reproduction used a fixture with the index inline, which is the
layout the parser did *not* handle — so it showed no supersets at all and made
the pairing look completely broken rather than broken for one of two layouts.
The fixture was wrong before the parser was.

---

## Six import bugs, found by reading the actual file

The plan that produced them is a twelve-page export, and every one of these was
invisible against a hand-written fixture. What follows is what a real document
does that a reconstruction of it does not.

**The day's own subtitle became the first movement.** Wednesday's header is
"Pull-Up Progression · Back Thickness · ~65 min", and the layout wrapped it, so
`~65 min` arrived on its own line. There was already a guard for exactly this —
a middot-separated list of short parts followed by a duration is a summary, not
a movement — and the wrap left **two** parts where it wanted three. So the day
opened with a movement called "Pull-Up Progression" lasting sixty-five minutes,
matched to Pull-Up, and clamped by `ROUTINE_LIMITS.reps` into **a pull-up held
for three hundred seconds**. That was the first row on the reported screenshot.

The guard now also fires on a bare duration, on a middot-separated name, before
the day has a single movement in it. Keyed on the day being empty rather than
on no heading having been seen, because this document's day names arrive split
as "WEDNES" and "DAY" — and the orphaned "DAY" is all capitals, so it registers
as a section heading before the summary line is reached.

**A dropped movement corrupted the next one's index.** Indexes arrive as their
own lines, and `idx = (idx + frag).slice(-3)` was right for "5" then "A" and
wrong for everything else. When a prescription could not be read its index was
never consumed, so the next one merged onto it: `1` + `2` became `12`, `3` + `4`
became `34`, and on the arms day `W` + `1` became `W1` — which `blockFrom()`
reads as a warm-up, **filing a barbell curl for four sets of eight as a
warm-up** because the movement above it had been dropped. A letter continues an
index; a number starts a new one.

**Three prescription shapes were unreadable, and each one lost a real
movement.** "5 sets · max strict reps then band-assist to 8" is the headline
movement of a pull-up-priority day and had no rep count, so it vanished. "2
rounds · 30 sec each" is Friday's warm-up, so an arms day imported with **no
warm-up at all** — the same complaint that started this, one day over. "10 each
side · 2-sec hold" is a dead bug. All three are read now; the open-rep one
takes its reps from whatever it matched, because clamping a null to 1 would
import the plan's centrepiece as five sets of one.

Reading "N sets" without a rep count has a cost, and it is the coaching
appendix: "5 sets of 5 strict, 1 short of failure. Add a rep weekly." is prose
*about* a movement. It is held to a short line with no sentence in it, and
there is a check that the paragraph stays out.

**And a unit word is not a movement.** "2 rounds · 30 sec each" puts "rounds"
in front of the first number the name-finder looks for, and it clears the
three-letter bar — so Friday's warm-up imported as an exercise called
**"rounds"** rather than falling back to the line above it, where its name was.

Net on the real document: **53 movements with a phantom among them → 59, with
every training day carrying its warm-up.** Sunday went from two movements to
five.

### The fixture was wrong before the parser was

The first reproduction of this was hand-transcribed, and it put each index
inline with its movement name — the layout the parser did *not* handle. So it
showed no supersets at all and made the pairing look completely broken, when
the truth was that it worked for one of two layouts and the reported document
used the other. Both are handled now, but the lesson is the order: **the
document was available and I reconstructed it anyway.** Every bug above needed
the file.

The checks are written as line arrays reproducing each layout rather than by
committing the document, which is somebody's training plan and not a fixture.

---

## Finishing a session is destructive, which is why there was nothing to go back to

Reported: finish was tapped one movement early, and there was no way back in.

The obvious reading is that the session was closed and needed reopening. The
actual problem is worse. `finishSession()` runs

    A.exercises = A.exercises.filter(i => i.sets.some(s => s.done));

so **every movement with nothing ticked is deleted**. Tap finish early and the
rest of the workout is not merely closed, it is gone — a naive "reopen" would
have handed back a session containing only the one movement that had a tick in
it, which is technically a reopen and completely useless. The rest of the
workout is what you went back for.

So the undo is captured *before* the finish starts taking things apart, and it
holds the full list. The kept movements are the same objects in both arrays, so
their ticks are the same ticks.

### What has to be reversed, and what must not be

Finishing does seven things, and reopening has to undo six of them: take the
session back out of the log, restore the full exercise list, unwind the
progression, un-mark the day on the week, put the stretch log back, and
decrement the routine's use count.

**Progression is the one that matters and the one it would be easy to skip.**
`applyProgression()` writes to `S.lifts`, so reopening without unwinding it
banks the session's gains once now and again when the session is finished for
real. Only the entries the session touched are restored — anything it never
looked at keeps whatever else has written to it.

Milestones are deliberately *not* reversed. `milestonesReached()` derives from
`journeyStats()` now, so a marker whose evidence went away stops showing on its
own; and a stored flag that stays is the app keeping something rather than
taking it back, which is the right way for this app to be wrong.

### One slot, one day, the last session

`S.lastFinish` is replaced on every finish rather than stored per session,
because progression compounds: a session with another one logged on top of it
cannot have its lifts restored without unpicking the later one's too. So the
offer is the last session, while it is still today — `today()` rather than a
wall-clock window, so a session finished at 1am under a 4am day boundary is
still today's.

Offered in exactly two places, both of which are where the mistake is noticed:
the finish sheet, and Today's completed hero for when that sheet has already
been dismissed. Not a Settings toggle for a concept nobody has a name for.

### And a check that threw instead of failing

The revert that shortens the captured list leaves `exercises[1]` undefined, so
the "can be finished again" step threw and the whole instrument died before
printing anything — which reads as a hang, not as the red it was meant to be.
Third time in this project. Guarded now, and the revert prints `1 of 7`.

---

## The dead band at the bottom was the canvas, not the layout

Reported twice, and the second time with the bottom of the screen circled: a
black strip under the nav that reads as the app failing to fill the phone.

Measured on a device-sized viewport with both insets faked, everything is
exactly right — `body`, `#app` and the active `.screen` all run 0 to 852 on an
852px viewport, the nav sits 25px off the bottom, and the last card stops 14px
clear of it. **The layout was never the problem.**

`html, body` are `position:fixed; inset:0`, so the body *is* the viewport by
construction. That is deliberate and documented: `#app` used to be `100dvh` and
on iOS the dynamic viewport and a fixed inset-0 box disagree the moment a
toolbar collapses, which sliced the bottom off every card. The fix was to stop
using viewport units — and the consequence is that when iOS hands the web view
a strip it did not have at layout time (a toolbar collapsing, an in-call banner
resizing it), the body does not grow into it.

That strip is painted by the **canvas**, and the canvas had no colour.
`getComputedStyle(document.documentElement).backgroundColor` was
`rgba(0, 0, 0, 0)` and its image was `none` — the app relied entirely on the
rule that propagates the body's background to the canvas, which is written for
an element in normal flow and is exactly the thing to stop assuming about a
fixed, inset-0 body. Where it does not happen, the strip comes out
transparent-over-black against a near-black app: a dead band.

`html` now carries the same declarations, the same gradient, the same
`background-attachment: fixed`, so wherever the seam falls the two sides are
the same pixels. A desktop browser never leaves a strip, so nothing here could
have shown it — the check asserts the property that makes the seam invisible
rather than trying to produce one.

**Honestly stated:** this removes the only mechanism by which that band can be
a different colour from the app. It does not make the strip usable — content
still cannot extend into space the fixed body does not own — and if the band
turns out to be the standalone letterbox rather than a collapsed toolbar, that
needs a web app manifest with a `background_color`, which would make the deploy
three files instead of two.

## Base camp is a place now

It is the only screen in the app named after somewhere and it looked like a
settings index: an identity strip and three lists of rows.

Built out of what the app already speaks — the same ridge as Today and
Progress, the same hero shell, the same stat row — because a camp assembled
from new components would be a different app on one screen. Two things are new
and both of them *are* the camp: a sky with stars in it, and firelight coming
up off the bottom edge. The glow is what makes it read as somewhere a person is
sitting rather than a header with a mountain behind it. It breathes on a
six-and-a-half second cycle, behind `prefers-reduced-motion`, slow enough to be
noticed only if you look for it — a fire flickering on a UI cadence would be a
distraction on the screen you come to when you are done.

Two corrections after seeing it rendered. The card carried a "Base camp"
eyebrow directly under a screen header saying **Base camp** — a label repeating
the title it sits under is doing nothing, so the eyebrow carries the day count
instead. And the stat row inherited `--teal`, which in this app means
*completed*: right over "logged today", wrong over a standing total, where it
reads as a session you have just finished. The camp's numbers are ember,
because the journey is ember.

---

## The camp came out of its card

A camp inside a rounded rectangle is a picture of a camp. Full-bleed, the
mountains are where you are.

The sky, the stars, the range and the firelight are now one backdrop behind the
whole of Base camp, reaching the edges of the phone, with the name and the
numbers standing in it and no border anywhere. It is broken out through the
screen's own horizontal padding and given that padding back as its own, so the
picture reaches the edges while the words stay on the same left margin as every
other line on the screen.

**It scrolls with the content, and that was a decision.** Fixing it to the
viewport gives parallax on paper and, in practice, three lists sliding over a
horizon that never moves — which reads as a bug rather than as depth.

Three things went wrong on the way, and each is a general trap:

**A backdrop with its own height overruns the thing it is behind.** The first
version was `position:absolute` with `height:432px` on `#more-body`, so it ran
straight on underneath the first three list rows: the mountains were drawn, and
you could see fragments of them at the left edge between opaque cards. It is
one block now — `.camp` — that sizes itself to the type standing in it, with
the range anchored to that block's floor and the room it needs supplied as
padding under the stats. The check asserts the range ends above the first list,
and reverting to a fixed height prints `ridge ends 516, list starts 477`.

**`overflow:hidden` ends a picture on a rule.** The ridge fills are opaque and
darker than the page, so clipping them left a hard horizontal line across the
screen with the mountains sliced off along it — a panel, which is the thing
this stopped being. The backdrop is masked out at the foot instead, so the
range settles into the night and the seam has nowhere to appear.

**And a full-bleed check cannot be measured in a wide window.** `.screen > *`
caps the column at 640px and centres it, so in the instrument's 1280 window the
backdrop correctly reaches the edges of a 672px column and the assertion read
`304–976 vs 0–1280` — a full-bleed backdrop reported as inset by three hundred
pixels. Measured at phone width, where the column *is* the screen, which is the
case worth asserting. Same lesson as the onboarding title-wrap check, which had
to be measured at 390 for the same reason.

---

## Night at base camp: snow, shimmer, a fire and a real moon

Four pieces of decoration, added together because they are one picture. All
four are the kind of thing a later layout change breaks silently, so each got a
check and each check was proved red against its own revert.

**Snow is computed from the range, not drawn beside it.** `ridgeSnow(pts)`
walks the far ridge's own points, calls a point a peak when it is lower in y
than both neighbours, and runs a cap a fifth of the way down each side with a
dip in the underside so the snowline is not a ruled edge. A hand-drawn second
path would land near the peaks today and drift the first time the range is
reshaped, so the check asserts every cap's apex is a vertex the range actually
has — reverting the apex by 1.5 units prints `0 of 4 on a vertex`.

**Only the far ridge gets any, and only above the snowline.** `if (y > 46)
continue` leaves the low peaks bare; snow on every summit is a row of white
triangles rather than a horizon. `ridgeHTML(ns, lit, snow)` takes it as a flag
and only base camp passes it: **the other bands sit behind body text**, and
`#DDE7F5` at .46 under a heading is a contrast failure waiting to be written.
The check asserts Today's range has none, and giving it some prints `1 on
Today`.

**An SVG shape with no `fill` is black, and the geometry can be perfectly
right while that is happening.** The caps were emitted, positioned and shaped
correctly for a full build before anyone looked — as solid black triangles on
every peak. The check reads the *computed* fill, not the class.

**A twinkle keyframe must multiply the star's own brightness, never name
one.** Each star carries its resting opacity as `--o` and the shimmer peaks at
`calc(var(--o) * 2.1)`, so a faint star stays faint. Writing `opacity:1` in the
keyframe flattens twelve differently-distant stars into one blinking row —
which a screenshot cannot show you, because the sky spends 88% of every cycle
at rest. The check steps one star to 94% of its own cycle by hand rather than
waiting eleven seconds, and asserts the dimmest one lands short of full white:
the literal prints `0.35 → 1`. The delays come from the index walked by a
non-integer step, not from `Math.random()` — a random sky is a sky no check can
reproduce.

**A `filter` on an element blurs its whole alpha silhouette, including the
parts that are supposed to be dark.** The moon is three shapes: a dark disc,
the lit half, and one ellipse that carves into that half or extends it. Putting
the glow on the `<svg>` painted a one-percent crescent as a third-lit moon —
and every check about the geometry still passed, because the geometry was
right. The glow belongs on the lit shapes, where the dark ellipse paints over
the inward bleed and only the limb that has any light gives any off.

**The moon's arithmetic is checkable in closed form, so it is checked that
way.** Lit area is half a disc plus or minus half an ellipse of the same
height, which works out to exactly `illum` of the disc when `rx = |1 − 2k|·r`
and something else entirely when it is not. The check compares the drawn
fraction against `moonIllum()` at twelve points across a cycle; `rx = k·r`
prints eleven mismatches, and swapping the limb prints `12 of 12 on the wrong
side`. It is a *mean* synodic cycle — accurate to a few hours, never wrong
about which way the crescent points. It reads the wall clock, not `today()`:
`profile.dayStart` moves where your day ends, not where the sky is.

**The fire is a sibling of the backdrop, and that is the whole placement
decision.** `.camp-bg` is masked out at its foot so the range can dissolve into
the page — which also fades to nothing anything drawn down there, which is
exactly where a camp sits. Outside the mask it keeps its light, and the dark
foreground it stands in is why a 30px flame reads at all. The check asserts it
is not a descendant of `.camp-bg` and carries no mask of its own.

**A glow still carrying alpha at the foot of its own box is the seam again.**
`.camp` bleeds nothing past its edge, so the firelight gradient has to reach
zero inside the box: it is centred on the flame's base and its radius stops
short of the floor — one equation, not three guesses. Move the flame without
moving the radius and the hard rule the mask exists to prevent comes back,
drawn by the thing standing in front of it.

**And the fire has to stand on something.** The check reads the near ridge's
own path out of the DOM, interpolates it at the flame's x and maps it through
the box it was painted into — the range is `preserveAspectRatio="none"`, so a
copy of the numbers would be a second source of truth that drifts. Lifting the
flame 32px prints `-30px below the ridgeline`.

**A probe that navigates away detaches everything queried before it.** The
"Today has no snow" probe leaves and comes back, and every render replaces
`#more-body`'s innerHTML. Four checks read `getComputedStyle` on nodes captured
earlier and got `''` for every property — no throw, no error, just empty
strings that two of the assertions accepted. The navigation runs first now.
Same shape as the leak baseline captured after a render that had already
leaked: **if a probe moves the page, everything it touches must be read on the
side of the move it belongs to.**

---

## The long band above base camp was the page, not the band

Reported as "the top band kind of long", with an offer to accept a smaller,
more translucent one. The band was doing exactly what it was designed to do:
`.hdr::before` repaints `var(--bg-grad)` at `background-attachment:fixed`, so
it is invisible against the page at every scroll position and in all four sky
bands. Nothing painted up there was wrong.

**What was up there was nothing.** A notch, a title and a gap — all
page-coloured — sitting above a sky that only began where the base camp block
began. The dark strip was the absence of the picture, and no amount of work on
the band would have moved it. So the backdrop is lifted behind the header
instead: `.camp-bg` starts `--safe-t + 104px` above its own block, and the sky
now runs from the status bar down to the mountains.

**The lift overshoots the header rather than measuring it.** Anything above a
scroller's content box is clipped and unreachable, so overshooting costs
nothing, while a measured value would be one more thing to keep in step with a
title's font size. What it must not do is fall short — and falling short by
exactly one notch is invisible in a desktop browser, where
`env(safe-area-inset-top)` is `0px`. The check fakes a 59px inset and asserts
the sky still reaches `y = 0`; reverting the lift to a flat `-104px` prints
`sky 29` with the notch in and passes without it.

**The mask stops had to move from shares of the box to pixels off its foot.**
`68%` and `86%` were the same thing as `100% - 115px` and `100% - 50px` while
the box was 359px tall. The lift makes it 464, which slides the fade up into
the middle of the range and dissolves the mountains the mask exists to protect.
Reverting to percentages prints `fade starts 142px off the foot of a 464px
box`.

**And then the band did have to change, because now there is something behind
it.** On More it paints nothing and blurs instead. This reverses the rule
recorded above for that one screen, and the reversal is narrower than it looks:

- The objection to translucency is that whatever scrolls underneath stays
  legible through it. That is true of a veil, which lowers contrast without
  destroying structure, and false of an 18px blur. Measured as edge energy —
  mean absolute difference between neighbouring pixels along a row, which is
  what letterforms are made of — text under the band goes from `27.0` to
  `1.2`. Brightness alone would never have caught a regression here: a blur
  preserves the mean, so taking the radius to zero leaves the average almost
  unchanged with every word underneath perfectly sharp.
- A blur cannot hold a brightness floor, so the guarantee changes from "opaque"
  to "the title still clears AA over the content this screen actually has".
  Swept across every scroll position, the tightest point is **3.58:1** — an
  ember icon tile smearing under the band. The title is 24px at weight 700,
  which is large-scale text, where AA is 3:1. This is why the exception is
  scoped to `#s-more` and not made general: put a white sheet under this band
  and it goes white, and More is the screen whose scrolling content is all dark
  cards.
- A veil would also have had to darken the sky it is standing on, which is the
  band coming straight back.

**Two of the new checks first passed against a picture of a sheet.** The stretch
sheet from an earlier probe was still open, and its scrim dimmed the whole
screen — so the title-over-the-band sweep read a dark, uniform surface and
sailed through, and the "flatten the backdrop and find the fade" probe measured
the ordinary camp because the fill it asked for was under a scrim it could not
see. Everything below that point is measured in pixels; it closes the sheet
first, and asserts `#scrim` is not up before believing any of it. **A pixel
check inherits every piece of state the probes above it left behind.**

**A threshold in relative luminance has almost no resolution at these values.**
The first version of "the band adds nothing to the sky" compared relative
luminance and allowed `0.012`. Down here a 40% black veil moves relative
luminance by `0.003` and slid straight through. It compares raw channels now,
against the same pixel with the band's own treatment switched off — not against
a pixel lower down, because the sky is a gradient and two heights differ by
several counts on their own.

---

## A manifest, because the band is not the app's to paint

Third report of a strip at the foot of the screen; the first two fixes — painting
the canvas, and removing an over-constrained `height:100%` — both missed. What
finally narrowed it was reading the layout rather than guessing at it: `html`,
`body` and `#app` are all `inset:0` to the viewport, every screen is a child of
that, and the nav is `position:fixed`. **There is no box in this app that can
end short of the bottom of the screen.** So the strip is not the app's layout at
all — it is the region the OS paints *around* a home-screen app.

The only thing that has ever governed that colour is a web app manifest's
`background_color`, and this deploy had no manifest. `apple-mobile-web-app-capable`
still asks for a standalone window and is still in the head for older iOS, but
it carries no colour, and Apple has been deprecating it in favour of the
manifest's `display` since 16.4.

The deploy is four files now: `index.html`, `sw.js`, `manifest.webmanifest`,
`icon.svg`. The icon is a real file rather than a `data:` URI in `src` —
support for that is uneven, and an install that silently drops the icon is the
failure this is meant to remove.

**Checked end to end, not by reading the source.** A `<link rel="manifest">` to
a file the host does not serve is exactly as useful as no manifest, and that
failure is invisible in the markup. The check fetches it from the page, parses
it, asserts `background_color` equals the `theme-color` meta, asserts
`display: standalone`, and fetches the icon it names.

**And the instrument's own server had to start behaving like a host.** It
returned the app's HTML for every path, so a manifest pointing at a missing
icon came back `200` and the icon check passed. Anything that looks like an
asset and is not one now 404s. **A test server that answers everything proves
nothing about what a real one would answer.**

*This has not been confirmed on the device yet.* It is the best-supported
remaining explanation, not a verified fix, and an app already on the home
screen keeps whatever it was installed with — it reaches an existing install
only after the icon is removed and re-added.

---

## The range, rebuilt from references

Sent three reference images and asked for the mountains to look better. What
they have in common is what this did not:

**Depth comes from the number of tonal steps, not from the spread between
them.** Three layers is a diagram of a mountain range whatever you do to the
colours. There are five now — haze, far, mid-far, mid, near — and the two extra
ones are gated behind the same `full` flag as the snow, because everywhere else
the range is a 104px band sitting behind body text and five overlapping fills
there is mud.

**Every layer is a gradient from its own ridgeline down.** That is the whole of
atmospheric perspective: haze collects with distance and into a valley, so a
silhouette is palest where it meets the sky and darkest at its foot. Flat fills
give you cut paper, which is what this was.

**The warmth is the light, not the mountain.** The far range was an ember fill —
painting the peaks the colour of the sunrise and leaving nothing for the sunrise
to be. It is cool and pale now, and the warm light is behind it.

**A glow inside the range's own box is a glow behind an opaque mountain.** The
first attempt put it in the ridge SVG, whose box is the bottom 168px of the
scene and whose every layer fills to the floor — so the only part that showed
was the sliver above the highest ridgeline, which is to say none of it. It is a
sibling element 300px tall now, and the peaks stand against it.

**No linework in the full scene.** The lit skyline is the only thing that says
"range" at 96px behind a card heading; at 250px in open sky it is the loudest
thing on the screen, and two of them crossing the whole width read as a line
chart. Where there is room for tone to do the work, tone does it.

**One dominant massif, not a sawtooth.** Evenly spaced equal peaks are teeth.
The range has a subject right of centre with a shoulder falling off it, a
secondary summit left, and everything else subordinate — and the near mass
climbs at the left edge rather than running level, because layers that only get
shorter towards the front read as stacked strips.

**Two checks were finding layers by their paint.** `path[fill="#12161c"]` and
"the first path with a `url()` fill" both pointed at the wrong silhouette the
moment a layer was added in front — the snow check reported every cap as off
the mountain, and the fire check reported no ridge at all. They read
`.ridge-far` and `.ridge-near` now. **A layer's name is stable; its paint is
not.**

---

## A sky with stars in all of it, and a moon that is only a moon

**Twelve stars was a field for a 208px strip.** Lifted behind the header the
backdrop is two and a half times that, and twelve dots across it read as a sky
with nothing in it — which is how it was reported. The field is generated now:
a jittered grid, six by nine, thinning towards the horizon, each star pushed off
its cell centre by its own hash.

**Deterministic, not random.** `Math.random()` gives a field no screenshot can
be repeated against, and it clusters — and the fix for clustering is a jittered
grid anyway, which spreads by construction.

**Stars are held to dust where words are.** A bright one landed squarely over
the `a` in "Sat" and read as a diacritic. Thinning the field there is how the
sky came to look empty in the first place, so the stars stay and their
brightness is capped instead.

**The moon lost its caption and moved into the sky.** It is scenery now, at
z-index 0 behind the name, positioned off `.camp-bg`'s own top plus one lift —
both terms carry `--safe-t`, so it lands in the same place at every notch.
Anchored any other way it drifts by exactly one inset between a desktop browser
and a phone. The phase is still named, in a `<title>`: nothing on screen says
it, and a screen reader still can. **That is the difference between "not
painted" and "not there".**

**Two of the new checks could not fail, and both were the same mistake —
measuring the subject against itself.** Star spread was `span / height of the
star layer`, which stays high however small the layer is; it is measured
against the sky now. And a clipped SVG child still reports its geometric
position, so a field squeezed into a band across the top still measured as
spanning everything — only stars inside the layer's own box are counted.

---

## One range on every screen, and what it cost

Asked for: apply the base camp range everywhere. Doing it naively — deleting
the `full` gate so every band gets all five layers, the haze and the snow —
looks right on Today and breaks Progress and Plan. Measured, "of 15" landed on
a snow cap at **1.08:1**.

**A comment I wrote during this change was wrong and is corrected here.** It
said the gate "was a guess, and the wrong one". The gate was buying exactly
what it claimed to; what was wrong was the *shape* of it, not the reason for
it. A boolean meant two ranges in one app that did not look like the same
place, when what was needed was one range at different intensities.

Three fixes were tried in order, and the two that failed are the useful part:

**Dimming the band as a whole does not work.** `.ridge{opacity}` takes the
near mass down with the pale layers, so the silhouette dissolves before the
type clears — at 0.22 the range is nearly gone and Progress still measured
3.98 against a 4.5 bar.

**Giving the band headroom does not work either.** Extending the viewBox
upward so the skyline sits below the card's heading is the right instinct and
it fixed the heading — and moved the collision onto the row underneath, because
the ascent card is a dense list from its heading down and there is nowhere in
it that is not behind something. That parameter was added, measured, and
removed again.

**What works is dimming only the layers that carry light.** The near mass is
`#05080C`; over a dark card it adds essentially no luminance, so it is free
against the text and it is the layer the silhouette lives in. Holding it and
pulling the haze, the far range, the mid-far and the snow separates the two
concerns completely.

**And the largest single contributor was not a silhouette at all.** On Plan the
text failed at 3.36:1 and dimming all five layers moved it by three
hundredths. The culprit was the two lit skylines — 1.4px ember strokes at .55
opacity, the brightest thing in the band by a wide margin, and the one element
none of the layer rules touched. Dropping them took "sessions done" from
3.36:1 to 4.88:1 on its own. `full` is now `tonal` and means exactly that: the
range carries itself on tone, no strokes.

**A contrast probe must attribute the light it measures.** The first sweep read
the brightest pixel in each glyph box, which is usually a neighbour — an ember
ring, a chevron, a card border — so it blamed the mountains for contrast they
had nothing to do with, and reported failures on Today that were not real.
It screenshots twice, with the range and without, and only pixels that changed
are the range's to answer for. That is what made "6% covered" legible as *a
snow cap clipping the corner of the box* rather than as noise.

**The check that this replaced was asserting a gate.** "A range that asked for
none having none" tested that Today had no snow — true, and meaningless the
moment snow was meant to be everywhere. It is now a sweep over every text node
on every screen that overlaps a band, which is what the gate existed to
protect. Reverting the per-band dimming prints five failures across two
screens; putting the ember skylines back on Plan prints two.

**Set thresholds with margin, not at them.** One candidate tuning put Progress
at exactly 4.50 against a 4.50 bar. It passed, and it would have gone red on
any change to that card's type. Backed off a notch to 4.69.

---

## Base camp became a camp

More was four lists of rows. It is a place now: four lit tents are the
destinations, the fire is Fuel, the range is the route and the moon is
Settings. Every `data-act` is the one its row carried, so the event layer is
untouched by the whole change — `ev.target.closest('[data-act]')` already
worked on SVG, and the drawings inherit routing for free.

**What the camp shows is exactly the destinations the nav is not already
offering.** Fuel and the route swap places in the tab bar — `syncNav` hides one
to show the other — so whichever is missing from the nav is the one that gets
an object here. That single rule is why the fire and the mountain come and go,
and it is checked in both states: a rule asserted in one state is half a rule.
When Fuel is off the fire is still *drawn*, because a camp has a fire; it just
is not a door.

**Labels are HTML, not SVG text.** Scaled inside the drawing they shrink with
the tent, and the back of the camp would be setting 8px type on a 320px phone
under a floor this app puts at 11. The tents carry the depth; the words stay
the size words have to be.

**The scrim, not a smaller range.** At 250px the range reaches up behind the
name, the date and the stats, and measured, "Set out Fri 14 Aug" fell to
1.68:1. Shrinking the range to clear the type gives back the thing the screen
exists to be, and dimming it hits the far peaks hardest — which is the part
worth looking at. A gradient behind the head instead: opaque where the words
are, gone before the summits, costing the scene nothing because there is
nothing to see that high. Removing it prints five failures.

**`flex:1` needed a floor.** The camp fills the screen rather than scrolling —
a list grows, a place does not. But `flex:1 1 auto` also lets it *shrink*, and
the moraine is absolutely positioned at a fixed height, so on a short phone the
ground climbed over the name. `min-height:560px` makes it overflow and scroll
instead, which is the right answer on a 4-inch screen even though this is a
place.

**Nothing may sit under the floating nav.** The nav is `position:fixed` and
takes no layout space, so the camp's floor is 32px above its top edge and every
tent's *label* — not its drawing — has to clear that. "Your routines" ended
6px under it, and the probe that should have caught it compared `rect.bottom`
against `nav.top` where the helper had already flattened the rect to `t`. A
comparison against `undefined` is always false, and a check that cannot fail
reported a pass.

**A fixed sleep is a flake waiting for the app to get heavier.** The rest-timer
probe measured its floaters after a hard-coded 340ms and went red the day More
became a full-screen scene — reporting a 10px overlap that does not exist and
could not be reproduced in isolation. It waits for two identical frames now.

### And a real bug the camp uncovered, which was not what it first looked like

Tapping the new mountain threw `k.split is not a function` out of `stripRange`,
and the first diagnosis — "the Plan screen crashes for every new user" — was
wrong in a way worth recording. It came from a *test fixture* setting
`meta.created` to a timestamp. The app stores an ISO string.

The real defect is quieter and survived because of it. `fromKey()` wants
`'YYYY-MM-DD'`; handed an ISO string it does not throw — it splits on the
dashes, hands `"05T20:51:56.901Z"` to the Date constructor, and comes back
Invalid, which `dk()` renders as `"NaN-NaN-NaN"`. `daysBetween` then returns
NaN and the strip's reach back through your own history collapses to zero. The
user-visible symptom is a dead back arrow on the week strip for anyone who has
not finished a session yet.

Every other reader of `meta.created` already does `dk(new Date(...))`. This one
did not, and **the first check written for it passed against the bug** — it
asserted "no error was thrown", and nothing ever throws. It asserts the range
itself now; reverting prints `min 0` where six weeks of history should be.

---

## The mountain, the stats on it, and a membership pill

Base camp got the shared `ridgeHTML` range — five low silhouettes across a
104px band — and it was reported as a downgrade from the mockup's massif. It
was. That function draws a *range*, which is right behind a card heading and
wrong as the thing you are standing at the foot of. `massifHTML()` draws one
mountain with a summit, and it is the only drawing in the app that is the
subject of its own screen.

**Its box has to be as tall as the drawing.** At `preserveAspectRatio="xMidYMax
slice"` a 430×560 scene in a 250px box crops everything above the lower slopes
— the summit was simply not on screen, which reads as "the mountain got
smaller" rather than as "the mountain got cropped". 430px shows the peak and
still bleeds the foot into the moraine.

**The stats moved onto the mountain.** They are the distance you have covered
and that is the thing you are covering; it is also the only part of the scene
wide enough to carry four numbers without a row of its own.

**The membership pill is not the paywall, and that distinction is load-bearing.**
`sheetPaywall()` is a pricing preview with £69.99 on it and no payment wired up
behind it — kept unreachable on purpose, and refused by its own handler as
well, because a price with nothing behind it reads as an unfinished app.
Pointing the new pill at it broke a check that has been guarding exactly that
since the paywall was hidden. `sheetMembership()` says what your copy *is*
instead; the paywall is linked from inside it only if `SHOW_PAYWALL` ever goes
true. The check now asserts membership is reachable **and** carries no price.

**The mountain opens the route unconditionally.** It was on the fire's terms —
an object only while the nav was not offering that destination — and that rule
is right for the fire, which would otherwise lead somewhere switched off. It is
wrong for the mountain: a mountain that looks tappable and is not is worse than
a second way to reach a screen.

### The failure this scene invites, and the check that now catches it

Every destination is a drawing, laid over the others in one composition, so the
failure mode is not a missing handler — it is an element that exists, carries
the right `data-act`, and is **covered**. `.camp-head` is a text block with
150px of bottom padding to hold the range clear of the type; at `z-index:3`
that empty box sat over the top half of the mountain and ate every tap meant
for it. Nothing in the markup looked wrong. `elementFromPoint` on the summit
returned `.camp-head`.

The fix is `pointer-events:none` on the block and `auto` on the one control
inside it — a block of text is not a target. The check presses the middle of
every object and asks what answers, and it measures each target: the membership
pill came back at 36px against a 44px floor. **Reverting `pointer-events` prints
"the mountain hit nothing", and none of the other seventeen camp checks
notice** — which is the whole argument for having it.

---

## Stop guessing at the strip: make the app say what the screen is

Reported four times, from four screenshots, and diagnosed wrong three times —
first as the canvas not being painted, then as an over-constrained `html/body`,
then as a missing manifest. Each fix was defensible on its own and none of them
was the answer, because the numbers that settle it are not in a picture: the
*resolved* safe-area insets, whether iOS considers this a standalone app, and
how big it believes the window is.

So Settings prints them. Window, screen, visual viewport, `body`, `#app`, the
four insets, `display-mode` and `navigator.standalone`. It is seven lines in a
card and it converts an argument into a reading.

**The insets have to be measured, not read.** `getPropertyValue('--safe-t')`
hands back the literal text `env(safe-area-inset-top,0px)` — it looks exactly
like a working readout and tells you nothing about the device. The only way to
see the length iOS substituted is to make an element use it and read the
computed padding back off that. The check asserts no `env(` reaches the output,
and reverting the `parseFloat` prints the expression.

**And the check asserts the numbers are about THIS window**, matched against
the viewport the instrument set — a diagnostic that prints `screen.width` looks
entirely correct and describes the wrong box. That particular revert cannot be
proved red here, because headless Chromium reports `screen` and `window`
identically; the hardcoded-size revert proves the same property.

### The part of it that was real, and fixable without knowing the cause

`.camp-head` reserved 150px of bottom padding to hold the range clear of the
type. The scrim does that job now, so it was 150px of nothing that the camp
still had to find room for — with a long name and a two-line subtitle the scene
overflowed and the bottom row of tents finished behind the nav. It is 34px now,
and the camp fits without scrolling on every size from 375×667 up; at 320×568
it scrolls, and nothing is left under the nav once you reach the foot.

**The scrim moved with it, and moving it broke it silently.** Hung off
`.camp-head` it shifted whenever that padding changed, and the stats — which
are placed against the camp's own floor — slid out from under it. Re-anchored
to `.camp`, with the fade over a fixed 80px rather than a percentage so it does
not stretch with the box. **As a pseudo-element it is the first child**, so at
the same z-index as `.camp-bg` the backdrop painted straight over it and the
scrim did nothing at all — text back to 3.69:1 with the CSS still present and
looking correct.

---

## The strip, finally: iOS counts the notch and takes it out as well

Four reports, three wrong diagnoses, and the answer arrived the moment the app
was asked to describe its own screen instead of being guessed at from a
photograph. The phone said:

```
window 402x812 · screen 402x874 · safe t62 r0 b34 l0
display-mode standalone · apple standalone yes
```

**The sixty-two pixels are missing from the window AND still reported by the
inset.** iOS handed the app a viewport that already excludes the status bar,
and `env(safe-area-inset-top)` describes the screen's safe area rather than the
window's. Padding by it reserves the notch a second time, and everything sits a
status bar too low — which is the empty band, and also why the camp overflowed
and the bottom row of tents went behind the nav.

The other state is the ordinary one: a full-height window reporting the same
inset, where the padding is exactly right and removing it would put the title
under the clock. **Both states report the same inset**, so the inset cannot
distinguish them; the window's height against the screen's can.
`calibrateSafeTop()` sets `--safe-t` to 0 only when the whole inset is already
missing from the window, only in a standalone app, and re-asks on resize and
rotation.

Two details that make it testable rather than hopeful. `screen.width/height`
do not rotate on iOS, so the comparison picks the screen's long side only while
the window is itself tall. And the inset is read through a `.safe-probe` class
rather than an inline style, so an instrument can fake a phone's 62px on a
desktop — where `env()` is always `0px`, which is precisely the state this
function exists to tell apart from a real one. Both branches are asserted with
`screen.height` and `navigator.standalone` faked in.

### The scrim was hiding the mountain, and every contrast check was happier for it

"The mountain looks faint." It was: the scrim that keeps the name legible
spanned the whole upper camp at 90% and took the range from **148 to 21** on a
brightness sample. Nothing caught it, because every text check reads better the
darker the backdrop gets — a scene can be measured for legibility from every
angle and still be measured into invisibility.

Node by node, exactly one thing needed it: the "Set out …" line, at 1.35:1 over
the summit's snow. The name clears on its own at 34px, the stats sit low where
the mountain is dark anyway, and the membership pill — which was the single
worst-contrast text on the screen — only needed its own background. Opaque
pill, scrim bounded to `.camp-head`, and the range is back at 119–142 with
every word still passing.

**So the scene has a floor as well as a ceiling now.** A check samples the
mountain below the head and asserts it is something you can see. Spreading the
scrim back over it prints `34 of 255` while every other camp check stays green.

### And a third date-fragile probe

The week-route check seeded `today() + 2` and asserted a constraint chip
appeared on it. The strip runs Monday to Sunday of the current week, so from
Friday onward that day is in next week's strip and the chip has no row to
appear on — it went red the moment the date rolled over to a Saturday. It takes
the day off the screen now. That is the third probe in this file written
against `today()` plus an offset, and the lesson has not changed: **if a probe
needs a particular relative day, take it from what the screen is showing.**

---

## A window shorter than the screen does not say which end is missing

The previous entry claimed the strip was solved. It was not, and the way it
was wrong is the point.

The phone reports `window 402x812` against `screen 402x874` with
`safe-area-inset-top: 62`. Sixty-two pixels of screen are not in the window.
That reading is **equally consistent with two opposite situations**:

- the window starts *below* the status bar, so the top inset is already spent
  and reserving it again pushes everything down a status bar; or
- the window starts *at the top* and is 62px short at the **foot** — in which
  case the status bar genuinely is over the content, the inset is needed, and
  zeroing it puts the title under the clock while leaving the strip exactly
  where it was.

The first calibration assumed the first case from the height difference alone.
That is not evidence, it is one of two readings of the same number, and the
diagnostic that produced it had no line that could tell them apart — so the
next readout came back byte-identical and said nothing about whether the fix
had fired or what it had done.

`window.screenY` is the missing datum: where the window sits on the screen.
The rule requires it now — no offset, no change — and the diagnostic prints it
alongside whether the app decided the inset was spent, so a readout answers
the question instead of restating it.

**The check was complicit.** It asserted the two states it had been written
around and passed; the third — a window merely short at the foot — was never
constructed, because the code under test could not distinguish it and neither
could the person writing the check. Reverting to the height-only rule now
prints `"0px"` where the inset is needed. **A check built from the same
assumption as the code cannot find the assumption.**

---

## The safe-area calibration is gone, and that is the finding

It was wrong twice on a real phone, in both directions, and the second attempt
was wrong *after* being told what the first attempt got wrong.

- First rule: the window is 62px shorter than the screen, therefore the top
  inset is already spent. Zeroed it. The strip stayed and the readout came back
  byte-identical, because nothing in the diagnostic could say whether the rule
  had fired.
- Second rule: require `window.screenY` as positive evidence that the window
  starts below the status bar. iOS reported `screenY` of 62 for a window that
  visibly starts at the top — so the rule fired again, and this time the title
  landed under the Dynamic Island.

Both rules were reasonable readings of the numbers available. Neither was a
measurement of the thing that actually matters, which is *where the window is
painted*, and iOS does not report that in any field this app can read.

So there is no calibration. `--safe-t` is `env(safe-area-inset-top)` and always
reserved, which is what the app did for its whole life before this and is
correct wherever the status bar overlays content. The diagnostic keeps
reporting `screenY` and the outer size, because they are still the only way to
see what a device is doing — they just are not a basis for changing layout.

**The general lesson, and it cost two bad deploys:** a value that is consistent
with two opposite situations is not evidence for either. Both rules were built
by picking the reading that matched the symptom, and a check written from the
same assumption cannot catch that — the third case only got constructed after
the device disproved the second rule, not before.

The strip at the foot is 62px of screen the web view is not given. Nothing in
CSS reaches it; the only lever is what the OS paints there, which is the
manifest's `background_color`, and that is already the app's own `--bg`.

**Also gone: "Everything you might want is pitched here."** It restated the
screen it was printed on, sat between someone's name and the one control under
it, and cost two lines of the room the camp needed.

---

## The app draws its own edges, because the numbers cannot settle it

*"Still not reaching the bottom, for some reason."*

Fifth reading of the same strip. The readout from the phone now says:

```
window 402x812 · screen 402x874 · visual 402x812 @0
body 402x812 @0 · #app 402x812 @0
safe t62 r0 b34 l0 · window at y0 · outer 402x874
```

The window is the whole screen and starts at the top; the layout viewport
inside it is 62px short. Every box in the app is `position:fixed; inset:0`,
which resolves against the layout viewport, so every box is short too.

**Two hypotheses were killed by measurement rather than by argument.**

*The gradient tiles into the strip.* `html` paints `--bg-grad` with
`background-attachment:fixed`, and a fixed-attachment background is sized to
the viewport and then repeated across the painting area — so a canvas taller
than the viewport should show the gradient's bright top edge again, as a
lighter band at the foot. Reproduced exactly: a 402×874 window with an
812-tall `html`, sampled at y800, y840 and y870. All three came back
`10,12,15`. The positioning area is the *window*, not the short layout
viewport, so there is no second tile and no seam. `background-repeat:no-repeat`
changed nothing, which is the control that says the first result meant
something.

*The strip is mispainted.* It is not — it is `#0a0c0f`, the same as the app's
own last row. What makes it read as a band is that base camp's floor is
lighter than the page background. The canvas propagation added earlier is
working; it just cannot help on a screen whose bottom is not page-coloured.

**What is left cannot be told apart from the numbers.** A window shorter than
its screen is equally consistent with the viewport starting below the status
bar and with it ending above the home indicator, and iOS reports
`env(safe-area-inset-*)` from the device rather than from the viewport, so the
insets agree with both. `screenY` already lied once. This is the same trap
written up one section above — *a value consistent with two opposite
situations is not evidence for either* — and it was walked into again, which
is why the fix this time is not another reading of the same fields.

So the app paints a test pattern instead. Settings → This screen → **Show
edges** puts a class on the root that gives each box its own colour: magenta
on `html`, which is what paints the canvas, cyan on `body`, yellow on `#app`,
green on the nav. One photograph answers both questions at once — a strip that
comes out magenta is inside the page and reachable from CSS, a strip that comes
out anything else is outside the web view where no stylesheet can go, and the
outlines say which box stops short and at which end.

Three details are load-bearing, and two of them were found by the check:

- **The sheet has to close first**, or the photograph is of the sheet.
- **`transition:none`.** The root carries a 1.2s cross-fade on
  `background-color` — that is the sky following the hour, deliberately slow
  enough that you never catch it happening. Inherited, it meant the pattern
  faded in over more than a second, so a tap followed straight away by a
  screenshot captured a half-mixed colour: the one picture this exists to
  take, taken wrong. The check read `rgb(8,9,13)` where it expected magenta
  and found this before any device did.
- **The way out is a control, not a timer.** A pattern that reverted itself
  part-way through a screenshot would produce exactly the kind of picture that
  started all this.

Nothing is written to the save; it is a class on the root and it is gone on
the next launch. Six reverts were run against the check — sheet left open,
pattern the same colour as the page, cross-fade left on, no way out, a way out
too small to hit, and the control removed altogether — and each produces
exactly one failure.

**Also removed: `interactive-widget=resizes-visual` from the viewport meta.**
A Chrome-only key that Safari does not implement, naming the default value on
every engine that does — inert everywhere, while sharing a meta with
`viewport-fit=cover`, the one declaration the full-bleed layout depends on.
Removing it is the cheapest available test of whether an unknown key was
costing the parse of the key next to it. If the numbers do not move, it cost
nothing, and that is a fact worth having rather than a suspicion worth keeping.

---

## The camp's floor stops where the nav reservation starts

*"I've uninstalled and reinstalled multiple times. It's strange because my
other apps built here don't have this issue."*

That sentence relocated the bug. Same phone, same iOS, same install flow,
other web apps full-bleed — so whatever this is, it is in this app's code, and
the manifest-baked-in-at-install theory is dead.

Every screen reserves `--navpad` of padding at its foot so its last card can
scroll clear of the floating nav. On a screen made of cards that reservation is
invisible, because the cards sit on the page and the reservation *is* the page.
Base camp is not made of cards. It is a scene with its own floor, and the floor
ends where `.camp` ends — so the reserved room read as a band of bare page
across the bottom of the phone. Measured at a 34px inset: the moraine's bottom
lands 41px above the foot of `#app`, 25 of those fully exposed below the nav
pill. Every other app on the phone looks right for exactly the reason this one
did not.

The floor now carries on beneath, and three things about how:

- **Extended, not moved.** Giving `.camp` the padding back would drag
  `.camp-spots` down with it and put the bottom row of tents under the nav —
  the thing the reservation exists to prevent. The objects stay where they
  stand; only the ground continues.
- **A separate block, not a taller `.camp-ground`.** That gradient's stops are
  proportional, so stretching the box moves its transparent-to-solid ramp down
  the screen, and that ramp is where the range's foot meets the moraine. Same
  trap the backdrop's mask already carries a note about.
- **`--navpad` is a token now.** The number had one author and two readers;
  written out twice, a change to the nav's height would leave a band under the
  camp and nothing else on any screen looking wrong.

**The check was written wrong first, and passed for the wrong reason.** It
compared the colour at the last row against the colour of the floor above it,
which is the right idea and unusable: the moraine ends on `#06070C` and the
page behind it is `#08090d`, three levels apart at near black. Deleting the
extension outright left it green; truncating it to 12px turned it red. A check
that catches a partial break and misses the total one is measuring noise. It is
geometric now — the used height of the pseudo-element against the gap it has to
cover — plus an assertion that the extension's colour still equals the last
stop of the moraine's own gradient, since those are two declarations that have
to agree and a pixel sample provably cannot tell them apart. Four reverts, four
single failures.

**What this does not claim.** In headless the band is a three-level difference
at near black. That is a real defect and it is fixed, but it is not obviously
the bar being reported — on an OLED at near black a three-level step is far
more visible than it is in a screenshot, and it is also possible this is a
second, smaller thing sitting underneath a larger one. The 62px between
`window.innerHeight` and the screen is still unexplained and still needs the
edges photograph. Saying so is the point: the last four times, a plausible fix
was shipped as *the* fix and it was not.

---

## `lvh` — the fifth reading, and the one that was a measurement

```
window 402x812 · screen 402x874 · outer 402x874 · window at y0
svh 812   lvh 874   dvh 812   vh 874
```

The window is the whole screen and starts at the top. The layout viewport
inside it is the **small** viewport, 62px shorter, and `position:fixed`
resolves against exactly that — so every box in the app stopped 62px above the
foot of the phone, and the strip below them was never anything the app had been
asked to paint. `svh` and `dvh` agree with the short one. `lvh` is the only
length that reaches the window, and it is a real 874.

Four previous answers were readings of the same ambiguous numbers. This one is
a length the phone measured and reported. The difference is the whole lesson of
the two sections above it, and the diagnostic that printed it exists precisely
because guessing had already failed four times.

```css
@media (display-mode: standalone){
  html,body{height:100lvh;bottom:auto}
}
```

**Gated, and that is the subtlety.** In a browser tab `lvh` is the viewport
with the address bar *retracted*, so a body sized by it while the bar is
showing runs off the bottom of the screen and `overflow:hidden` cuts it — the
same failure that got `100dvh` banned from `#app`, one level up. A standalone
app has no retractable chrome, so there `lvh` is simply the window and cannot
move. Height only: left and right still come from the insets, `#app` stays at
`height:100%` and is therefore its parent by definition, and `bottom:auto` is
written out rather than left to the over-constraint rule that would drop it
anyway — relying on that rule silently once was enough.

**A desktop browser can prove none of this.** In Chromium, app mode included —
which does report `display-mode: standalone`, confirmed by launching with
`--app=` — `lvh` equals `innerHeight`, so the rule is a genuine no-op locally
and no measurement can see its effect. Two things that look like they would
help do not:

- `Emulation.setEmulatedMedia` with a `display-mode` feature does not take in
  this build; the media query still reports false. `--app=` is what works.
- `getComputedStyle` returns the **used** value for a positioned box, so
  `bottom` reads `0px` whether it was authored `0` or `auto`. It cannot tell
  the two states apart.

So the check reads the rule out of the CSSOM, which is the one place the unit
survives, and separately proves behaviourally that a body taller than the
viewport carries `#app` with it. The unit is the thing worth guarding: `svh`
and `dvh` both read 812 on that phone, so either of them compiles, applies,
matches the media query, and changes nothing whatsoever. Five reverts — no rule,
`svh`, `dvh`, `bottom` left at 0, and the rule ungated — each produce exactly
one failure.

**The bar had two causes, not one.** The camp's floor stopping at the nav
reservation was real and is fixed; this is the other 62px. It was right not to
call the first one the answer.

---

## `lvh` worked, and did not help — reverted

The rule took. The readout went from `body 402x812` to `body 402x874`, which
is exactly what it was written to do. The band at the foot of the screen did
not move by a pixel.

**A box the size of the window is not a box you can see all of.**
`window.innerHeight` stayed at 812. So the app was painting 874px of content
into a viewport that renders 812, and the last 62px hung off the bottom where
nothing draws it — every screen quietly lost the end of its scroll area and
nothing was gained. Reverted, and the check inverted: `html` and `body` take
their height from the insets and from nothing else, and any viewport unit on
either — `vh`, `svh`, `lvh`, `dvh`, gated or not, `height` or `min-height` — is
now a failure. The old check asserted the unit was `lvh`; the new one asserts
there is no unit at all. Both were reverted to prove them.

**What this rules out, which is the useful part.** The strip is not the app
being too short for its viewport. Sized by the viewport it is actually given,
the app fills that viewport exactly — `body 402x812` against `window 402x812`.
Whatever the strip is, it is outside the box the page is allowed to paint, and
no length in any stylesheet reaches it. Three of the five theories died here.

**And the test pattern could not answer it either, for a reason worth writing
down.** With the body sized to 874 it covered the entire window, so `html`'s
magenta — the whole mechanism for distinguishing "inside the page" from
"outside the web view" — had nowhere to show. The photograph came back with no
magenta anywhere, which looks like a decisive answer and is actually the
instrument being blinded by the fix it was meant to evaluate. A diagnostic and
the change it is measuring cannot share a surface.

So the pattern gained two bars. `position:fixed`, full width, 14px, labelled
TOP OF VIEWPORT and BOTTOM OF VIEWPORT. They mark the edges of the box
`position:fixed` resolves against — the same box every screen is sized from —
and they answer the one question left, which is not *how big* it is but *where
on the screen* it sits:

- Orange hard against the top of the screen, under the clock → the web view
  starts at the top and the strip is at the foot.
- Orange below the status bar with black above it → the web view was placed
  under an opaque status bar, and the app has been reserving `--safe-t` for a
  notch it was never given. The inset counted twice — which is what two earlier
  calibrations were built to fix, and they got it backwards in both directions.

3px outlines were used the first time and are invisible in a photograph of a
phone; that is why this round exists. The bars are named because one bar in a
picture is ambiguous about which end it is. Seven reverts across the two
checks, one failure each.

---

## `black-translucent` was what took the bottom 62px

The test pattern's two bars settled it in one photograph, after five wrong
answers reasoned from numbers.

- **Top bar: above the clock.** The layout viewport starts at screen y0 and the
  status bar overlays the app. That is precisely what `black-translucent` asks
  for, and it was working.
- **Bottom bar: 62px short of the foot, black below it.** Viewport y0..812 on
  an 874 screen.

Those two facts cannot both be right, and the contradiction is iOS's: **the
viewport height was reduced by the status bar as though it were opaque, while
the origin stayed at y0 as though it were translucent.** Reserved once in the
height, waived once in the position, and the difference falls off the bottom
where nothing paints it. `lvh 874` against `svh 812` had been saying the same
thing from the other end the whole time — the engine modelling 62px of
retractable chrome in an app that has none.

`black-translucent` is the half that pins the origin to y0, and it is also the
one meta an ordinary PWA does not carry. That is the answer to *"my other apps
built here don't have this issue"*: they never asked for the translucent bar,
so both halves of iOS's decision agreed and the window ran to the foot of the
screen.

Removed. Both halves now agree on an opaque status bar: the window is placed
below it and reaches the bottom. The check locks the whole head configuration —
`viewport-fit=cover` present, `apple-mobile-web-app-capable` yes,
status-bar-style *not* translucent — because that meta reads like the
declaration that gives you MORE screen and every instinct is to put it back.

**What to watch on the next launch.** With the window below the status bar,
`env(safe-area-inset-top)` should report 0. If it still reports 62 the app will
reserve a notch it was never given and push the title down — the "added up top"
failure both earlier calibrations produced, from opposite directions. It is one
line of the Settings readout, so it is a look rather than an investigation. No
calibration has been added for it: the whole history of this bug is rules built
on inference, and there is no reason to build a sixth.

**The method, since it is the only part that generalises.** Five explanations
came from reading fields that were consistent with two opposite situations. The
thing that worked was an instrument whose output could only mean one thing —
and it only worked on the third attempt at building it. The first version used
3px outlines, invisible in a photograph of a phone. The second was blinded by
the fix it was measuring: with the body sized to the full window it covered the
canvas, so the magenta that distinguishes "inside the page" from "outside the
web view" had nowhere to show, and a picture with no magenta in it looked like
an answer. Bars, thick, labelled, on the viewport rather than on any box —
that could only mean one thing, and it did.

---

## The moon wears a gear

Bigger — 42px to 58px in a 72px target — and carrying a faint gear, because
what it opens was only ever in its screen-reader name. Everyone else had to
discover Settings by pressing the sky.

**It was a sun first.** The obvious move is to scale `ICO.cog` into the moon's
coordinates. That icon is teeth radiating from a small hub with no body ring,
which is fine at 24px in the nav and reads as a rising sun at 58px on a bright
disc — wrong twice over on a moon, and it is also the glyph already on the More
tab, so the moon would have been wearing the button that got you there. A ring
for the wheel, a hole at the centre, teeth standing off the rim. Authored in
the moon's own coordinates rather than transformed in, because a scaled icon
brings its stroke width with it and the weight stops being one anybody chose.

**One mid tone, drawn last.** The gear crosses a shape that is half #F3ECDC and
half near-black. A colour picked against either half disappears on the other,
and on a crescent that shows as a gear with a bite out of it — worse than no
gear at all. Drawn last so the terminator does not paint across it.

**The check was too weak twice, and the reverts found it.** Eight were run;
two passed that should not have.

- A near-black gear passed, because the assertion was only that its luminance
  lay *between* the two fills. Sitting a hair above the unlit disc satisfies
  that and is invisible on it. It now composites the translucent stroke over
  each half and requires 1.35:1 against both — what you would actually see,
  rather than what was declared.
- A tooth flung out past the rim passed, because the assertion was on the
  bounding box's *width*. A gear already symmetric about the origin barely
  widens when one tooth escapes. It now measures reach from the centre on every
  axis.

That second measurement changed the design: composited, the lighter grey-blue
cleared 2.2:1 on the dark half and only 1.37:1 on the lit one. Visible, but
with nothing left for anyone who later nudges the opacity. #7C8CA8 balances it
at 2.2 and 1.5. Balanced across the two halves is the property worth holding,
not maximum contrast on either.

---

## Two `case 'import':` in one switch, and a backup nobody could restore

*"I saved a backup .json file before reinstalling the app, but I go to import
it back in and the import doesn't accept .json files."*

The app was doing exactly that. The delegated listener had **two**
`case 'import':` — the plan importer near the top of the switch, the backup
restore seven hundred lines below — and in a JavaScript switch the first match
wins. So Settings → "Restore from backup" opened the PDF-and-text plan
importer, which refuses JSON, and `importData()` had never run in its life.

Legal, silent, no warning at build time or runtime. The same shape as two part
files declaring one top-level name, which `build.sh` has refused since the
`daysBetween` incident — one level down, and unguarded.

**`dupes.mjs` now fails the build on it too.** Scoped per switch rather than
per file, since the same label in two different switches is correct and common.
Frames are tracked on the masked source so braces inside strings do not count,
and the label text is read from the RAW source at the same offset — masking
blanks string bodies, so the masked copy knows where the labels are and not
what they say, and `mask()` preserving offsets exactly is what makes reading
one through the other legitimate. Restoring the collision takes the build from
green to `exit 1` naming both lines. 257 labels across 2 switches; this was the
only one.

**The existing check passed throughout.** `Settings offers import` asked
whether the row EXISTS. It did. A check written from the same assumption as the
code cannot find that assumption — third time that sentence has been written in
this file. The replacement follows the tap to what it does: a file input has to
be opened and the plan sheet has to not appear.

**Two more things were wrong behind it**, and both would have bitten the moment
the routing was fixed:

- `accept="application/json,.json"` on the picker. iOS resolves `accept` to
  UTIs and filters the Files picker by them; a backup Safari wrote from a Blob
  download commonly lands typed `public.plain-text` or `public.data`, does not
  conform to `public.json`, and is greyed out. The filter is gone. It could
  only ever wrongly exclude — the content is parsed and checked whatever the
  picker hands over, and that check is the real gate.
- One error message for every failure. "That file did not read as a backup"
  covers a photo, a truncated download and a real export from a build that
  named things differently, and those want completely different things from
  you. It now says which.

**And a way in that no picker can refuse.** Paste the backup text. A file
picker is a thing that can say no, and the person reaching for this is holding
the only copy of their training history — that should not rest on one API
behaving. Both paths go through one `applyBackup()`, so they cannot drift on
what counts as a backup or on what restoring does.

**The probe had to hand the store back.** It is the only one in `blanks.mjs`
that replaces the whole of `S` on purpose. Left holding its own fixture, it
changed what later screens render and a contrast sweep three hundred lines away
went red on text whose colour nobody had touched.

---

## `--muted` is calibrated for surfaces, and a mountain is not one

The week hero on Plan reads "N /M sessions done" over the range. The number is
`--text`; the "/M" and the label are `--muted`, whose token comment says
"4.5:1 on every surface in the app" — and that is true, and the range is not a
surface. Measured against the brightest ridge pixel behind them: **4.41 and
4.40 against a 4.5 requirement.** Close enough to read fine and to fail, which
is the worst kind of miss.

A token rather than a hex in two rules — `--on-range` — because two selectors
need it and a third will want it the next time something is drawn over the
mountains. It measures 5.43–5.55:1 on the same pixels.

**Checked across dates and across sky bands, because both were candidates.**
The hero's text changes width with the week plan, so the box the ridge is
sampled through moves day to day; and the ridge is dimmed per `data-sky`
elsewhere in the app, so the hour was a candidate too. Twenty-one consecutive
dates: worst 5.43. All four bands: identical, so this particular range is not
band-dimmed. Reverting to `--muted` reproduces 4.41/4.40 exactly.

**One thing not explained, and worth saying rather than papering over.** An
earlier run of the same build reported this check green at the same 4.4-ish
values. Two runs since have both reproduced the failure, so it is not simply
flaky in one direction — something in the sampling varies a little between
runs and 4.4 sits close enough to 4.5 to land on either side of it. The fix
does not depend on knowing which: at 5.4 there is a fifth of the requirement in
hand, and variation that small cannot reach it. If it ever goes red again the
margin is the evidence that the cause is elsewhere.

---

## The day as a fire

*"Similar to the water tracker, I want to be on theme and make the main counter
a campfire and when you add your foods is like adding 'fuel to the fire' and it
grows bigger."*

The metaphor was already load-bearing everywhere else: the fire at base camp
IS the Fuel tab, the Fuel toggle in Settings is a fire icon, and eating is the
one thing in a training app that literally is adding fuel. The rings stay —
`fuelViz()` picks, and Settings has the switch.

**Concentric, because that is what a fire is.** An outer luminous envelope, a
brighter body, a near-white core. Three nested layers is not a diagram
borrowed from the rings; it is how flame is built, and it takes the ring order
outside in — calories, protein, carbs — without either shape being bent to fit.

**Not clamped to each other.** A tall protein flame inside a short calorie one
reads as a bright core standing up through it, which is a thing fires do.
Clamping would hide exactly the divergence the middle layer exists to show, on
the day you have hit your protein and eaten very little else.

**Never out.** Every layer has a resting height over a bed of embers and two
logs that are always drawn. The first pass set that resting height at 26 and a
day with nothing logged rendered a bare hearth — technically a fire, and it
read as an empty state, which on this screen is a verdict. At 38 an unfed fire
is plainly alight and still less than half of a fed one.

**Four rounds on the silhouette, all of them decided by looking.** A
parametric teardrop with a tuned belly is a candle. Widening it and rounding
the crown made it a flame icon. What turned it into a campfire was two changes
together: proportions (wide and low, not tall and narrow) and a **forked
crown** — a main tongue and a shorter one beside it with a valley between. The
fork is on the outer layer only; the body of a fire is smoother than its edge.
Per-layer lean on top of that, so no layer mirrors itself and no two nest
concentrically. Three symmetric flames inside one another draw a diagram of a
flame.

**Heat gradients in `userSpaceOnUse`, not the default.** Box-relative stops
rescale with the path, so a small flame would show the full ramp compressed
into 30px and look identical to a large one. Anchored to the geometry, a low
fire is the bottom of the ramp — which is what a low fire looks like.

**Absent means fire.** Only the choice to go back to rings is stored, so no
existing save needs a migration to get the new default and the default stays
changeable later. The mirror of the `rpe` / `restSound` problem, where absent
had to mean ON and an explicit `false` was the only way to say otherwise.

**Blazing is not a celebration.** All three reached shortens the flicker rates
and starts three sparks. Nothing flashes, nothing bounces, no copy
congratulates you. The fire is bigger because you fed it.

**The reverts found a real hole.** Seven were run; six went red immediately.
The seventh — `lit = mainPct >= 100`, blazing off the headline number alone —
passed every case in the block, because there was no fixture where calories
reached target and a macro did not. That is the only state that separates "all
three" from "the big one", and it was missing. Added, and the revert goes red.
The existing ring checks were rescoped rather than deleted: they now ask for
rings explicitly, which is what keeping them as a choice actually means.

---

## Date-fragile probe number three

`engine.mjs`'s back-to-back-hard-days check went red, and the app was right.

The fixture seeds only the days from today forward — a warning about two hard
days touching has nothing to say about days already behind you — so how many
days it seeds depends on where in the week it runs. Measured across all seven
weekdays:

```
Mon seeded 7 · Tue 6 · Wed 5 · Thu 4 · Fri 3 · Sat 2 · Sun 1
hit true      true     true     true     true     true    FALSE
```

One day cannot be two days in a row. `backToBackHard()` correctly found
nothing; the fixture could not build the situation it was asking about. The
check ran green Monday to Saturday for its whole life and went red the first
Sunday anyone ran the suite.

Pinned to a Monday, which pins `weekStart()` with it because there is one
clock — the same fix as the two probes already recorded here. And the seeded
count is now **asserted**, because the whole failure was a fixture quietly
building a smaller situation than the one it was checking: pinning to a Sunday
turns both checks red, which is the proof that the assertion is load-bearing
rather than decorative.

**Both of the failures found this session were in the instruments or in a token
calibrated against the wrong surface — neither was a user-visible regression
from the work being done.** Worth writing down because the instinct on a red
check is to look at what just changed.

---

## The fire, second pass

Three things, all from looking at it on a phone.

**The notch.** The forked crown — a main tongue and a shorter one with a valley
between — was the first thing anyone noticed, and not in a good way: a hard V
bitten out of the upper right. It is a shoulder now, the right side easing out
and flattening between roughly 60% and 75% of the height instead of dropping
into a notch. The silhouette is still asymmetric and still not a teardrop.

The lesson is about the size of the answer. The shape only needed to stop being
symmetric; "split the crown" solved that and a great deal more that nobody had
asked for. Measurable, which is the useful part: walking the rendered path and
tracking how far the outline climbs back UP after its highest point gives
**12.2% of the height with the fork, 0% with the shoulder**. Control points
that draw a notch look no different from ones that do not, so the check walks
the path rather than reading the numbers that made it.

**Sparks at every size.** They only appeared once all three targets were hit,
which made them a reward rather than a fire. Four now, at any level, on long
staggered periods (9–13.5s) so one drifts up every few seconds rather than four
pulsing together — most of each keyframe is spent at zero opacity, and that
waiting is the point. Reaching all three shortens the periods rather than
switching them on. They launch from the top of the outer flame rather than a
fixed height, so they leave the fire instead of appearing in the air above a
small one.

**Which flame is which.** The three layers are `--ff-out` / `--ff-mid` /
`--ff-core` — a red, an orange and a yellow, the natural ramp of a fire and
also three genuinely distinct hues at 9px. Three tints of one orange would be
handsome and carry no information.

They are tokens, and the middle stop of each gradient IS the token, so the
colour the legend shows for a macro is literally the colour of the flame it
names. Two places writing that colour separately is how a mapping stops being
true. Protein takes the body's colour and carbs the core's, scoped to
`.viz-fire` so the rings keep the macro hues their arcs are drawn in. Calories
has no legend row — it is the big number — so its key rides in front of the
unit as a swatch rather than as a coloured label: `--ff-out` is a deep ember,
right for the outermost flame against a dark page and under 4.5:1 as 10.5px
uppercase text. A graphic carries the identity at 3:1 and the word stays the
colour it was measured at.

Seven reverts, one failure each — including one for the rings picking up the
fire's colours, since a mapping that leaks is worse than none.
