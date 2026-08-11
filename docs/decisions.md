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
