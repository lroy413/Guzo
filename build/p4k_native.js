/* ============================================================
   NATIVE BRIDGE
   ------------------------------------------------------------
   Everything here is a no-op on the web. Not "degrades gracefully" — an
   actual no-op: no plugin, no call, no error, no console noise. The web
   build is the product, and the shell is an extra place it runs.

   What it exists for: the app's entire value is months of accumulated
   history, and inside a WKWebView that history lives in storage the OS may
   clear under pressure — storage that is not backed up the way native app
   data is. One eviction and someone loses a year of training. Manual export
   is not an answer, because the people who need it are the ones who did not
   run it.
   ============================================================ */

/* Capacitor injects window.Capacitor before the app script runs. Checking for
   the plugin rather than the platform string means a build with the plugin
   missing behaves like the web instead of throwing. */
function nativePrefs() {
  const C = typeof window !== 'undefined' ? window.Capacitor : null;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return null;
  const P = C.Plugins && C.Plugins.Preferences;
  return P && typeof P.set === 'function' ? P : null;
}

function isNative() { return !!nativePrefs(); }

/* The mirror is deliberately not the primary store.

   Preferences is async, and load() is synchronous and runs at boot before any
   promise could settle. Making the whole app async to accommodate one platform
   would be the tail wagging the dog, and every render path would have to learn
   about it.

   So localStorage stays the source of truth, and this is a copy written after
   it. On the web that copy never exists; on device it is what survives an
   eviction. */
let nativeMirrorPending = false;

function mirrorToNative() {
  const P = nativePrefs();
  if (!P) return;
  /* Coalesced. save() already debounces, but a long session still writes
     often, and there is no reason to hand the bridge a hundred copies of a
     500 KB blob when only the last one matters. */
  if (nativeMirrorPending) return;
  nativeMirrorPending = true;
  setTimeout(() => {
    nativeMirrorPending = false;
    try {
      P.set({ key: KEY, value: JSON.stringify(S) }).catch(() => {});
    } catch (e) { /* a mirror that fails must never break a save */ }
  }, 1200);
}

/* Called once at boot, after load(). If localStorage came up empty but the
   mirror has something meaningful, the WebView was cleared and this is the
   recovery — the same reasoning as LEGACY_KEYS, one layer down.

   "Meaningful" matters: restoring a blank over a blank is pointless, and
   restoring anything over a state the user has already started using would
   be destructive. It only ever fills a hole. */
async function restoreFromNativeIfEmpty() {
  const P = nativePrefs();
  if (!P) return false;
  if (S && (S.onboarded || (S.sessions || []).length)) return false;

  try {
    const got = await P.get({ key: KEY });
    if (!got || !got.value) return false;
    const parsed = JSON.parse(got.value);
    if (!parsed || !(parsed.onboarded || (parsed.sessions || []).length)) return false;

    S = Object.assign(blank(), parsed);
    S.profile = Object.assign(blank().profile, parsed.profile || {});
    S.settings = Object.assign(blank().settings, parsed.settings || {});
    save(true);
    if (S.onboarded) { repairRefs(); buildWeekPlan(); }
    syncNav();
    go(S.onboarded ? 'today' : 'onboard');
    toast('Restored from device backup', true);
    return true;
  } catch (e) {
    return false;
  }
}

/* ------------------------------------------------------------
   A rest that survives the screen going dark.
   ------------------------------------------------------------
   The countdown is a setInterval and its payoff is a vibrate. Put the phone in
   a pocket and the OS suspends the timer: nothing fires, and you find out the
   rest ended when you next look. The bar itself recovers — the end time is
   absolute, so the first tick after waking sees it has passed — but "recovers
   when you look" is not a timer, it is a stopwatch you have to check.

   A scheduled OS notification is the only thing that actually wakes you, and
   on the web there is no way to schedule one without a server to push it. So
   this is the shell's job, and the web build gets a sound instead. Inert here
   in exactly the same way as everything else in this file. */
function nativeNotifications() {
  const C = typeof window !== 'undefined' ? window.Capacitor : null;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return null;
  const N = C.Plugins && C.Plugins.LocalNotifications;
  return N && typeof N.schedule === 'function' ? N : null;
}

/* One fixed id, so scheduling a new rest replaces the old one rather than
   queueing a second alert behind it. Skipping a rest and starting another
   inside a minute is completely ordinary. */
const REST_NOTIF_ID = 8801;
let restPermAsked = false;

function scheduleRestAlert(seconds, body) {
  const N = nativeNotifications();
  if (!N || !(seconds > 0)) return false;
  const fire = () => {
    try {
      N.schedule({ notifications: [{
        id: REST_NOTIF_ID,
        title: 'Rest done',
        body: body || 'Back to it.',
        /* allowWhileIdle, or the alert is held until the phone next wakes —
           which is the one situation this exists for. */
        schedule: { at: new Date(Date.now() + seconds * 1000), allowWhileIdle: true }
      }] }).catch(() => {});
    } catch (e) { /* a missing alert must never interrupt a session */ }
  };
  /* Asked on the first rest rather than at boot: permission requested against
     a thing you just did is answerable, and one requested during onboarding
     for a feature you have not met yet is not. */
  if (!restPermAsked && typeof N.requestPermissions === 'function') {
    restPermAsked = true;
    try { N.requestPermissions().then(fire).catch(() => {}); return true; } catch (e) {}
  }
  fire();
  return true;
}

function cancelRestAlert() {
  const N = nativeNotifications();
  if (!N) return false;
  try { N.cancel({ notifications: [{ id: REST_NOTIF_ID }] }).catch(() => {}); } catch (e) {}
  return true;
}

/* Haptics, when the shell provides them. The web build already calls buzz()
   via navigator.vibrate, which iOS Safari does not implement at all — so on
   device this is the difference between feedback and silence. */
function nativeHaptic(style) {
  const C = typeof window !== 'undefined' ? window.Capacitor : null;
  const H = C && C.Plugins && C.Plugins.Haptics;
  if (!H) return false;
  try {
    if (style === 'heavy') H.impact({ style: 'HEAVY' });
    else if (style === 'light') H.impact({ style: 'LIGHT' });
    else H.impact({ style: 'MEDIUM' });
    return true;
  } catch (e) { return false; }
}
