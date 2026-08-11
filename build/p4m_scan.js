/* ============================================================
   BARCODE — reading one, with no library and no network
   ------------------------------------------------------------
   Two halves, and only one of them is easy.

   Reading the code off a packet is pure signal processing on pixels this
   device already has, so it is done here. Where the platform provides
   BarcodeDetector — Chromium, so Android and desktop Chrome — that is used,
   because a native decoder is faster and handles angles this one will not.
   **Safari does not implement it at all**, on any iPhone, which is the phone
   this app was built for, so there is a decoder below as well.

   Turning that code into a food is the other half, and it is not a signal
   problem — it needs a product database. This app has never made an external
   request and does not have one. So a barcode is bound to a food in *your*
   library the first time you scan it, and every scan after that is one tap.
   People eat the same twenty packaged things; the second scan of your protein
   tub is the one that matters, and that one works offline forever.

   EAN-13 / UPC-A only. Those are what is on food.
   ============================================================ */

/* Left-hand odd parity. The other two alphabets are derived rather than
   written out: G is L reversed, R is L inverted, and three hand-typed tables
   of ten seven-bit patterns is three chances to typo one. */
const EAN_L = ['0001101','0011001','0010011','0111101','0100011',
               '0110001','0101111','0111011','0110111','0001011'];
const EAN_G = EAN_L.map(s => s.split('').reverse().join(''));
const EAN_R = EAN_L.map(s => s.split('').map(c => c === '1' ? '0' : '1').join(''));
/* Which alphabet each of the six left digits uses. The pattern *is* the first
   digit — EAN-13 encodes thirteen digits in twelve digits' worth of modules by
   hiding the first one in the parity of the rest. */
const EAN_PARITY = ['000000','001011','001101','001110','010011',
                    '011001','011100','010101','010110','011010'];

/* d1 + 3·d2 + d3 + 3·d4 … over the first twelve, and the thirteenth is
   whatever makes it a multiple of ten. A barcode that does not checksum is a
   misread, not a product — without this a smeared frame produces a plausible
   thirteen-digit number and binds your protein tub to it. */
function eanChecksum(digits) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += digits[i] * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

function validBarcode(code) {
  const s = String(code || '').replace(/\D/g, '');
  if (s.length === 12) return validBarcode('0' + s);          // UPC-A is EAN-13
  if (s.length !== 13) return false;
  const d = s.split('').map(Number);
  return eanChecksum(d) === d[12];
}

/* Pad a UPC-A to the EAN-13 it actually is, so one product has one key. */
function normBarcode(code) {
  const s = String(code || '').replace(/\D/g, '');
  return s.length === 12 ? '0' + s : s;
}

/* ------------------------------------------------------------
   One row of pixels → thirteen digits.
   ------------------------------------------------------------
   Deliberately not a general reader. It assumes the code is roughly upright
   and roughly fills the guide box, which is what a person pointing a phone at
   a packet inside a printed frame actually does, and it gives up cheaply so
   the next frame can try instead. Trying thirty frames a second beats being
   clever about one of them. */
function decodeRow(row) {
  const n = row.length;
  if (n < 100) return null;

  /* Threshold at the midpoint of this row's own range rather than at a fixed
     value: a packet under a kitchen light and one under a fridge light have
     nothing in common except that the bars are darker than the gaps. */
  let lo = 255, hi = 0;
  for (let i = 0; i < n; i++) { if (row[i] < lo) lo = row[i]; if (row[i] > hi) hi = row[i]; }
  if (hi - lo < 40) return null;                 // no contrast: not a barcode
  const mid = (lo + hi) / 2;

  /* The code runs from the first dark pixel to the last. */
  let a = 0; while (a < n && row[a] >= mid) a++;
  let b = n - 1; while (b > a && row[b] >= mid) b--;
  const span = b - a + 1;
  if (span < 95) return null;                     // fewer pixels than modules

  const mw = span / 95;
  const bits = [];
  for (let i = 0; i < 95; i++) {
    /* The centre of each module, so a half-pixel of drift either way is
       harmless. */
    const x = Math.round(a + (i + 0.5) * mw);
    bits.push(row[Math.min(n - 1, Math.max(0, x))] < mid ? 1 : 0);
  }
  const s = bits.join('');

  /* Guards are not decoration — they are how you know you found a barcode and
     not a barcode-shaped pattern on the label next to it. */
  if (s.slice(0, 3) !== '101') return null;
  if (s.slice(45, 50) !== '01010') return null;
  if (s.slice(92, 95) !== '101') return null;

  const left = [], parity = [];
  for (let i = 0; i < 6; i++) {
    const chunk = s.substr(3 + i * 7, 7);
    let d = EAN_L.indexOf(chunk);
    if (d >= 0) { parity.push('0'); }
    else { d = EAN_G.indexOf(chunk); if (d < 0) return null; parity.push('1'); }
    left.push(d);
  }
  const first = EAN_PARITY.indexOf(parity.join(''));
  if (first < 0) return null;

  const right = [];
  for (let i = 0; i < 6; i++) {
    const d = EAN_R.indexOf(s.substr(50 + i * 7, 7));
    if (d < 0) return null;
    right.push(d);
  }

  const digits = [first].concat(left, right);
  if (eanChecksum(digits) !== digits[12]) return null;
  return digits.join('');
}

/* Several rows across the frame, because one of them will be over a crease,
   a highlight, or the gap between two packets. Rows are tried from the middle
   outward — the middle is where the guide box tells you to put it. */
function decodeImageData(img) {
  const { width: w, height: hgt, data } = img;
  if (!w || !hgt) return null;
  const gray = new Uint8ClampedArray(w);
  const order = [];
  const rows = 21;
  for (let i = 0; i < rows; i++) {
    const off = Math.round((i % 2 ? 1 : -1) * Math.ceil(i / 2) * (hgt / (rows + 1)));
    const y = Math.round(hgt / 2) + off;
    if (y >= 0 && y < hgt) order.push(y);
  }
  for (let oi = 0; oi < order.length; oi++) {
    const y = order[oi], base = y * w * 4;
    for (let x = 0; x < w; x++) {
      const p = base + x * 4;
      /* Rec. 601 luma. Green carries most of the perceived brightness, and a
         plain average reads a red packet as darker than it looks. */
      gray[x] = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
    }
    const got = decodeRow(gray);
    if (got) return got;
  }
  return null;
}

/* ---------- barcodes you have already told it about ---------- */
/* code → foodId. Lives in the same blob as everything else, so it is in the
   export, the native mirror and the legacy migration for free. */
function barcodeMap() {
  if (!S.nutrition.codes || typeof S.nutrition.codes !== 'object') S.nutrition.codes = {};
  return S.nutrition.codes;
}

function foodForBarcode(code) {
  const c = normBarcode(code);
  if (!c) return null;
  const id = barcodeMap()[c];
  return id ? foodById(id) : null;
}

function bindBarcode(code, foodId) {
  const c = normBarcode(code);
  if (!c || !foodById(foodId)) return false;
  barcodeMap()[c] = foodId;
  save(true);
  return true;
}

function unbindBarcode(code) {
  const c = normBarcode(code);
  if (!barcodeMap()[c]) return false;
  delete barcodeMap()[c];
  save(true);
  return true;
}

/* ---------- the camera ---------- */
/* Reported rather than assumed: a desktop browser with no camera, a context
   without a secure origin, and a phone where you said no to the permission are
   three different answers and the sheet says which. */
function cameraSupported() {
  return !!(typeof navigator !== 'undefined' && navigator.mediaDevices &&
            navigator.mediaDevices.getUserMedia);
}

function nativeDetector() {
  if (typeof BarcodeDetector !== 'function') return null;
  try {
    return new BarcodeDetector({ formats: ['ean_13', 'upc_a', 'ean_8', 'upc_e'] });
  } catch (e) { return null; }
}

/* ============================================================
   OPEN FOOD FACTS — the one external request in the app
   ------------------------------------------------------------
   This is a deliberate reversal of "no third-party requests, ever". It is
   written down in docs/decisions.md rather than slipped in, because the rule
   it breaks is one the rest of this file was designed around.

   What it buys: the *first* scan of a packet working, instead of the second.
   What it costs: one request, to one host, containing one barcode.

   The terms it is allowed on:
     · off by default, and turned on by hand in Settings
     · never blocking — six seconds and it gives up
     · never fatal — offline, refused, rate-limited and malformed all fall
       through to asking you, which is exactly what happened before
     · the answer is saved as *your* food and bound to the code, so the packet
       is yours from then on and the request never happens again
     · nothing is sent but the barcode: no account, no cookies, no history

   The service worker does not touch it — it has always ignored cross-origin
   requests, so this cannot end up in the app-shell cache. */
function offEnabled() { return !!(S.settings && S.settings.off); }

const OFF_HOST = 'https://world.openfoodfacts.org/api/v2/product/';
const OFF_FIELDS = 'product_name,brands,quantity,serving_size,nutrition_data_per,nutriments';

/* Crowd-sourced data, so it is checked before it is offered. Atwater again:
   protein and carbohydrate at 4 kcal a gram, fat at 9. A row that misses by a
   wide margin is somebody's typo on the internet, and the review sheet says so
   rather than quietly logging it. */
function offPlausible(f) {
  if (!f) return false;
  const est = f.p * 4 + f.c * 4 + f.f * 9;
  return Math.abs(est - f.kcal) <= Math.max(60, f.kcal * 0.35);
}

function offParse(json, code) {
  if (!json || json.status !== 1 || !json.product) return null;
  const p = json.product, n = p.nutriments || {};
  const num = v => { const x = parseFloat(v); return (isNaN(x) || x < 0) ? null : x; };

  /* kcal where it is recorded. Plenty of European entries carry only kilojoules
     — 4.184 of them to the calorie — and dropping those would lose a good part
     of the database for no reason. */
  let kcal = num(n['energy-kcal_100g']);
  if (kcal === null) {
    const kj = num(n['energy-kj_100g']) !== null ? num(n['energy-kj_100g']) : num(n.energy_100g);
    if (kj !== null) kcal = kj / 4.184;
  }
  const prot = num(n.proteins_100g), carb = num(n.carbohydrates_100g), fat = num(n.fat_100g);
  if (kcal === null || prot === null || carb === null || fat === null) return null;

  const brand = String(p.brands || '').split(',')[0].trim();
  const label = String(p.product_name || '').trim();
  const name = [label, brand].filter(Boolean).join(', ').slice(0, 60);
  if (!name) return null;

  const r1 = v => Math.round(v * 10) / 10;
  return { n: name, u: 'g', per: 100, kcal: Math.round(kcal),
           p: r1(prot), c: r1(carb), f: r1(fat), g: 'meal',
           serving: String(p.serving_size || '').trim(), code: normBarcode(code) };
}

/* Returns the food, or null for every kind of no. The caller cannot tell the
   difference between "not found", "no signal" and "switched off", and does not
   need to: all three mean the same thing to it — ask the person instead. */
async function offLookup(code) {
  if (!offEnabled()) return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  const c = normBarcode(code);
  if (!validBarcode(c)) return null;
  try {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 6000) : null;
    const res = await fetch(OFF_HOST + encodeURIComponent(c) + '.json?fields=' + OFF_FIELDS,
      { credentials: 'omit', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
    if (timer) clearTimeout(timer);
    if (!res || !res.ok) return null;
    return offParse(await res.json(), c);
  } catch (e) {
    /* A refused request, a dropped connection, a six-second wait, a body that
       is not JSON. Every one of them means "ask instead". */
    return null;
  }
}
