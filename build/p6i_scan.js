/* ============================================================
   SCANNING — the sheet, the camera loop, and what happens after
   ============================================================ */

let SCAN = null;   /* { stream, video, canvas, raf, det, stop } */

function stopScan() {
  if (!SCAN) return;
  if (SCAN.raf) cancelAnimationFrame(SCAN.raf);
  if (SCAN.timer) clearTimeout(SCAN.timer);
  try { (SCAN.stream.getTracks() || []).forEach(t => t.stop()); } catch (e) {}
  SCAN = null;
}

function sheetScan() {
  if (!cameraSupported()) {
    openSheet(`
      <div class="row between mb"><h2 class="h1">No camera here</h2></div>
      <p class="small mb">This browser will not hand over a camera &mdash; usually because the page is
        not on https, or the device has not got one. Everything else still works: search the
        catalogue, or add the food by hand once and it is yours from then on.</p>
      <button class="btn primary block lg" data-act="fuel-search">Search instead</button>
      <button class="btn quiet block mt-s" data-act="close">Not now</button>`);
    return;
  }
  openSheet(`
    <div class="row between mb"><h2 class="h1">Scan a packet</h2></div>
    <div class="scan-stage">
      <video id="scan-v" playsinline muted autoplay></video>
      <div class="scan-frame" aria-hidden="true"><i></i><i></i><i></i><i></i>
        <span class="scan-line"></span></div>
      <div class="scan-hint" id="scan-hint">Hold the barcode inside the box</div>
    </div>
    <p class="small mt mb" id="scan-note">Nothing is uploaded and nothing is photographed &mdash;
      the picture is read on the device, frame by frame, and thrown away.</p>
    <button class="btn ghost block" data-act="scan-type">Type the number instead</button>
    <button class="btn quiet block mt-s" data-act="close">Stop</button>
  `, { key: 'scan' });
  startScan();
}

async function startScan() {
  const video = document.getElementById('scan-v');
  if (!video) return;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      /* The back camera, and a resolution with enough pixels across a barcode
         to resolve a module. 640 wide gives about 6 pixels per module on a
         packet held where the guide box asks for it. */
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
  } catch (e) {
    const hint = document.getElementById('scan-hint');
    const note = document.getElementById('scan-note');
    if (hint) hint.textContent = 'No camera';
    if (note) note.innerHTML = /NotAllowed|Permission/i.test(e && e.name + e.message)
      ? 'Permission was declined. You can allow the camera for this site in your browser settings, or type the number in below.'
      : 'That camera could not be opened. Typing the number in works just as well.';
    return;
  }
  const canvas = document.createElement('canvas');
  SCAN = { stream, video, canvas, det: nativeDetector(), raf: null, timer: null };
  video.srcObject = stream;
  try { await video.play(); } catch (e) {}

  const tick = async () => {
    if (!SCAN) return;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (vw && vh) {
      let code = null;
      /* The platform's decoder first where there is one: it reads angles and
         blur this one will not, and it costs nothing to ask. */
      if (SCAN.det) {
        try {
          const found = await SCAN.det.detect(video);
          if (found && found.length) code = found[0].rawValue;
        } catch (e) { SCAN.det = null; }   /* one failure is enough, stop asking */
      }
      if (!code) {
        /* A band across the middle, not the whole frame. It is where the guide
           box is, and a quarter of the pixels is a quarter of the work — which
           is what keeps this at frame rate on a phone. */
        const bw = Math.min(900, vw);
        const bh = Math.max(60, Math.round(vh * 0.32));
        canvas.width = bw; canvas.height = bh;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(video, (vw - bw) / 2, (vh - bh) / 2, bw, bh, 0, 0, bw, bh);
        code = decodeImageData(ctx.getImageData(0, 0, bw, bh));
      }
      if (code && validBarcode(code)) { onScanned(normBarcode(code)); return; }
    }
    SCAN.raf = requestAnimationFrame(tick);
  };
  SCAN.raf = requestAnimationFrame(tick);
}

/* A code, read. What happens next depends entirely on whether you have seen
   this packet before — which is the whole design. */
async function onScanned(code) {
  stopScan();
  buzz([18, 40, 18]);
  /* Your own library first, always. A packet you have already named never
     causes a request, however the setting is set. */
  const food = foodForBarcode(code);
  if (food) { sheetPortion(food.id, food.per || 1); return; }

  if (!offEnabled()) { sheetScanNew(code); return; }

  openSheet(`<div class="center" style="padding:44px 0">
    <div class="h1">Looking it up</div>
    <div class="scan-code mono mt mb">${h(code)}</div>
    <div class="bar thin"><i style="width:45%"></i></div>
    <p class="tiny mt">Asking Open Food Facts. If it does not answer, you can name it yourself.</p>
  </div>`);
  const found = await offLookup(code);
  /* Every kind of no lands in the same place — which is exactly where you were
     before this feature existed. */
  if (!found) { sheetScanNew(code, true); return; }
  sheetScanFound(found);
}

/* What came back, before any of it is saved. Shown rather than logged: this is
   data a stranger typed into a public database, and the app has no business
   presenting it as fact. */
function sheetScanFound(f) {
  const odd = !offPlausible(f);
  openSheet(`
    <div class="row between mb"><h2 class="h1">Found it</h2></div>
    <div class="scan-code mono mb">${h(f.code)}</div>
    <div class="card mb">
      <div class="h3">${h(f.n)}</div>
      <div class="tiny mt-s">Per 100${h(f.u)}${f.serving ? ' &middot; packet says a serving is ' + h(f.serving) : ''}</div>
      <div class="fuel-4 mt">
        ${[['kcal', f.kcal], ['protein', f.p + 'g'], ['carbs', f.c + 'g'], ['fat', f.f + 'g']]
          .map(([k, v]) => `<div><div class="fuel-day-v mono">${v}</div>
            <div class="fuel-day-k">${k}</div></div>`).join('')}
      </div>
    </div>

    ${odd ? `<div class="banner soft mb">These numbers do not quite add up &mdash;
      the macros come to about ${Math.round(f.p * 4 + f.c * 4 + f.f * 9)} kcal, not ${f.kcal}.
      Open Food Facts is filled in by the public and this entry may be wrong.
      Check it against the packet before you keep it.</div>` : ''}

    <p class="small mb">Keeping it saves it as one of your foods and ties it to this barcode, so it
      is yours from now on and this never has to be looked up again.</p>

    <button class="btn primary block lg" data-act="off-keep">Keep it</button>
    <button class="btn ghost block mt-s" data-act="off-edit">Change the numbers first</button>
    <button class="btn quiet block mt-s" data-act="close">Not this</button>
  `, { key: 'offfound:' + f.code });
  window._offFound = f;
}

/* The first time. There is no product database behind this — see p4m_scan.js
   — so this asks, once, and never asks again for that packet. */
function sheetScanNew(code, looked) {
  const recent = recentFoods(6);
  openSheet(`
    <div class="row between mb"><h2 class="h1">New packet</h2></div>
    <div class="scan-code mono mb">${h(code)}</div>
    <p class="small mb">${looked
      ? 'Open Food Facts does not have this one, or could not be reached. Tell it once and every scan of this packet after today is a single tap &mdash; no lookup needed.'
      : 'This app has no product database and never phones anywhere, so it does not know what this is yet. Tell it once and every scan of this packet after today is a single tap.'}</p>

    <button class="btn primary block lg" data-act="scan-new-food" data-v="${h(code)}">Enter what is on the label</button>

    <div class="divide"></div>
    <div class="label mb-s">Or point it at something you already have</div>
    <input class="input mb" id="scan-q" placeholder="Search your foods" autocomplete="off"
      enterkeyhint="search" data-scan-q="${h(code)}">
    <div class="list" id="scan-results">
      ${recent.length ? recent.map(r => `<button class="lrow" data-act="scan-bind"
        data-v="${h(code)}" data-f="${h(r.food.id)}" style="width:100%;text-align:left">
        <div class="grow"><div class="h3" style="font-size:14.5px">${h(r.food.n)}</div>
        <div class="tiny mt-s">${r.food.kcal} kcal per ${h(portionLabel(r.food, r.food.per))}</div></div>
        <span class="chev">&rsaquo;</span></button>`).join('')
        : '<p class="tiny center">Nothing logged yet to bind it to.</p>'}
    </div>
    <button class="btn quiet block mt" data-act="close">Not now</button>
  `, { key: 'scannew:' + code });
}

/* Typing it in, for a packet whose barcode is creased, tiny, or wrapped round
   a corner — and for anyone whose browser will not give up a camera. */
function sheetScanType() {
  stopScan();
  openSheet(`
    <div class="row between mb"><h2 class="h1">Type the number</h2></div>
    <p class="small mb">The thirteen digits printed under the bars. Twelve is fine too &mdash;
      that is the same code with the leading zero left off.</p>
    <div class="field mb">
      <input class="input mono" id="scan-n" inputmode="numeric" placeholder="5000159484695"
        autocomplete="off" enterkeyhint="go">
    </div>
    <button class="btn primary block lg" data-act="scan-typed">Look it up</button>
    <button class="btn quiet block mt-s" data-act="scan">Back to the camera</button>
  `, { key: 'scantype' });
}
