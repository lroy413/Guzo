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
