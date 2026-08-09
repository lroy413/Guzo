/* ============================================================
   DAILY METRICS — steps, sleep, bodyweight
   ------------------------------------------------------------
   Three numbers that describe the day around the training rather
   than the training itself. They can arrive three ways:

     manual    — typed in the sheet
     shortcut  — handed over by an iOS Shortcut reading Apple Health
     health    — read directly by the native build (later)

   Every field records where it came from, because a number you
   typed and a number a sensor produced deserve different trust,
   and because the native migration later needs to know which
   values it is allowed to overwrite.

   Deliberately NOT wired into programming yet. The evidence that
   occupational step volume impairs lower-body resistance training
   is genuinely absent — the concurrent-training literature is
   built on structured running, and step-REDUCTION studies point
   the other way (cutting to ~1,200 steps/day dropped myofibrillar
   protein synthesis ~27%). So it is collected and shown, and it
   waits until there are months of real data to test against.
   ============================================================ */

const DAILY_FIELDS = ['steps', 'sleepH', 'bw'];

const DAILY_LIMITS = {
  steps:  { min: 0,  max: 200000, label: 'Steps' },
  sleepH: { min: 0,  max: 24,     label: 'Sleep' },
  bw:     { min: 20, max: 400,    label: 'Bodyweight' }
};

const SRC_LABEL = { manual: 'typed', shortcut: 'Shortcut', health: 'Apple Health', url: 'Shortcut' };

function ensureDaily() {
  if (!S.daily) S.daily = {};
  return S.daily;
}

function dailyOn(date) {
  ensureDaily();
  return S.daily[key(date)] || null;
}

function dailyToday() { return dailyOn(today()); }

function stepsOn(date) { const d = dailyOn(date); return d && d.steps > 0 ? d.steps : null; }
function sleepOn(date) { const d = dailyOn(date); return d && d.sleepH > 0 ? d.sleepH : null; }

/* ---------- writing ---------- */
function setDaily(dateIn, field, value, src) {
  const date = key(dateIn);
  if (!DAILY_LIMITS[field]) return false;
  const n = parseFloat(value);
  if (isNaN(n)) return false;
  const lim = DAILY_LIMITS[field];
  if (n < lim.min || n > lim.max) return false;

  ensureDaily();
  const rec = S.daily[date] || (S.daily[date] = { src: {} });
  if (!rec.src) rec.src = {};
  rec[field] = field === 'steps' ? Math.round(n) : Math.round(n * 10) / 10;
  rec.src[field] = src || 'manual';
  rec.at = new Date().toISOString();

  /* Bodyweight also belongs in the profile log — that is what the
     calorie maths and the bodyweight-exercise loads already read. */
  if (field === 'bw') {
    const list = S.profile.bodyweight || (S.profile.bodyweight = []);
    const existing = list.find(e => e.d === date);
    if (existing) existing.w = rec.bw;
    else {
      list.push({ d: date, w: rec.bw });
      list.sort((a, b) => a.d < b.d ? -1 : 1);
    }
  }
  return true;
}

function clearDaily(dateIn, field) {
  const date = key(dateIn);
  const rec = dailyOn(date);
  if (!rec) return;
  delete rec[field];
  if (rec.src) delete rec.src[field];
}

/* ---------- baselines ----------
   Compared against your own recent normal, never a target. A
   10,000-step line drawn by a 1960s Japanese pedometer ad is not
   a fact about your body. */
function stepsBaseline(days) {
  ensureDaily();
  const n = days || 14;
  const vals = [];
  for (let i = 1; i <= n; i++) {
    const s = stepsOn(dk(addDays(today(), -i)));
    if (s) vals.push(s);
  }
  if (vals.length < 3) return null;
  vals.sort((a, b) => a - b);
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[mid] : Math.round((vals[mid - 1] + vals[mid]) / 2);
}

/* Returns a plain-language read of today against your own median.
   No colour-coded judgement, no goal ring, no shortfall. */
function stepsRead(n) {
  const base = stepsBaseline();
  if (!base || !n) return null;
  const r = n / base;
  if (r >= 1.6) return { k: 'high',  t: 'well above your usual day' };
  if (r >= 1.25) return { k: 'up',   t: 'a busier day than usual' };
  if (r <= 0.45) return { k: 'low',  t: 'a much quieter day than usual' };
  if (r <= 0.75) return { k: 'down', t: 'a quieter day than usual' };
  return { k: 'even', t: 'about your usual' };
}

function stepDays(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = dk(addDays(today(), -i));
    out.push({ d, v: stepsOn(d) });
  }
  return out;
}

/* ============================================================
   INGEST
   Two doors, because iOS may or may not hand a home-screen web app
   a URL that a Shortcut opened. Whichever one works on your phone,
   the other costs nothing to leave in place.
   ============================================================ */

/* Accepts, in rough order of how a Shortcut is likely to produce it:
     guzo steps=12400 sleep=6.5 bw=82.1
     steps=12400&sleep=6.5
     {"steps":12400,"sleep":6.5}
     12400                       ← a bare number means steps
   Field aliases keep the Shortcut side forgiving. */
function parseIngest(text) {
  if (!text) return null;
  const raw = String(text).trim();
  if (!raw || raw.length > 400) return null;

  const out = {};
  const put = (key, val) => {
    const map = { steps:'steps', step:'steps', s:'steps',
                  sleep:'sleepH', sleeph:'sleepH', hours:'sleepH',
                  bw:'bw', weight:'bw', bodyweight:'bw' };
    const f = map[String(key).toLowerCase()];
    if (!f) return;
    const n = parseFloat(String(val).replace(/[^0-9.\-]/g, ''));
    if (!isNaN(n)) out[f] = n;
  };

  /* bare number → steps */
  if (/^\d{1,6}$/.test(raw)) { out.steps = parseInt(raw, 10); return out; }

  /* JSON */
  if (raw[0] === '{') {
    try {
      const o = JSON.parse(raw);
      Object.keys(o).forEach(k => put(k, o[k]));
      if (o.date && /^\d{4}-\d{2}-\d{2}$/.test(o.date)) out.date = o.date;
      return Object.keys(out).length ? out : null;
    } catch (e) { return null; }
  }

  /* key=value pairs, separated by spaces, & or , */
  const pairs = raw.replace(/^guzo[:\s]*/i, '').split(/[\s&,]+/);
  pairs.forEach(p => {
    const m = p.split('=');
    if (m.length === 2) put(m[0], m[1]);
  });
  const dm = raw.match(/date=(\d{4}-\d{2}-\d{2})/);
  if (dm) out.date = dm[1];

  return Object.keys(out).length ? out : null;
}

/* Applies a parsed payload. Returns a list of human-readable
   descriptions of what actually landed, for the confirmation. */
function applyIngest(parsed, src) {
  if (!parsed) return [];
  const date = parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : today();
  const done = [];
  DAILY_FIELDS.forEach(f => {
    if (parsed[f] == null) return;
    if (setDaily(date, f, parsed[f], src || 'shortcut')) {
      done.push(f === 'steps' ? fmtSteps(parsed.steps) + ' steps'
              : f === 'sleepH' ? parsed.sleepH + 'h sleep'
              : parsed.bw + ' ' + unit());
    }
  });
  if (done.length) save(true);
  return done;
}

/* Door one: a Shortcut opens https://…/?steps=12400&sleep=6.5
   Absorbed at boot, then scrubbed from the address bar so a reload
   can never double-apply it or leave your data sitting in history. */
function ingestFromURL() {
  try {
    if (!location.search || location.search.length < 3) return [];
    const q = new URLSearchParams(location.search);
    const obj = {};
    ['steps', 'sleep', 'sleepH', 'bw', 'weight', 'date'].forEach(k => {
      if (q.has(k)) obj[k] = q.get(k);
    });
    if (!Object.keys(obj).length) return [];

    const parsed = {};
    if (obj.steps != null) parsed.steps = parseFloat(obj.steps);
    if (obj.sleep != null || obj.sleepH != null) parsed.sleepH = parseFloat(obj.sleep != null ? obj.sleep : obj.sleepH);
    if (obj.bw != null || obj.weight != null) parsed.bw = parseFloat(obj.bw != null ? obj.bw : obj.weight);
    if (obj.date) parsed.date = obj.date;

    const done = applyIngest(parsed, 'url');
    history.replaceState(null, '', location.pathname);
    return done;
  } catch (e) { return []; }
}

/* Door two: the Shortcut copies the line, you tap Paste. iOS shows
   its own paste confirmation — that prompt is the OS, not us. */
function ingestFromClipboard() {
  if (!navigator.clipboard || !navigator.clipboard.readText) {
    toast('This browser will not hand over the clipboard');
    return;
  }
  navigator.clipboard.readText().then(txt => {
    const done = applyIngest(parseIngest(txt), 'shortcut');
    if (!done.length) { toast('Nothing readable on the clipboard'); return; }
    toast('Logged ' + done.join(', '), true);
    sheetDaily();
    render();
  }).catch(() => toast('Clipboard was not shared'));
}

/* ---------- formatting ---------- */
function fmtSteps(n) {
  if (n == null) return '—';
  return n >= 10000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n);
}

/* ============================================================
   SCREEN WAKE LOCK
   ------------------------------------------------------------
   A phone that sleeps between sets is the single most irritating
   thing about logging a workout on the web. The lock is dropped
   by the browser whenever the page is hidden, so it has to be
   re-taken every time you come back — answering a call, checking
   a message, or just the screen timing out mid-rest.

   Supported from Safari 16.4, but it silently did nothing inside
   a home-screen web app until iOS 18.4. There is no way to detect
   that from script: the promise resolves either way. So this is
   best-effort, and the session screen says so rather than
   promising something the OS may quietly refuse.
   ============================================================ */
let wakeSentinel = null;
let wakeWanted = false;

function wakeSupported() {
  return !!(navigator.wakeLock && navigator.wakeLock.request);
}

async function wakeAcquire() {
  if (!wakeWanted || !wakeSupported() || wakeSentinel) return;
  try {
    wakeSentinel = await navigator.wakeLock.request('screen');
    wakeSentinel.addEventListener('release', () => { wakeSentinel = null; });
  } catch (e) { wakeSentinel = null; }
}

function wakeOn() { wakeWanted = true; wakeAcquire(); }

function wakeOff() {
  wakeWanted = false;
  if (wakeSentinel) { try { wakeSentinel.release(); } catch (e) {} }
  wakeSentinel = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') wakeAcquire();
  else wakeSentinel = null;      // the browser has already dropped it
});
