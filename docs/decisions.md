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
