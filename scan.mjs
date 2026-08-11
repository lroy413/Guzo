/* scan.mjs — a barcode is read off pixels, with no library and no network.

   The fixtures are real EAN-13 bitmaps generated here from the spec, at
   several module widths, with quiet zones, noise and a shifted threshold —
   because a decoder that only works on the image the decoder drew is not a
   decoder. Every one of them is checked against its own checksum first, so a
   fixture that is wrong fails as a fixture rather than as a bug.

   Run: node scan.mjs */

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.GUZO_CHROME || undefined;
const html = readFileSync(join(ROOT, 'index.html'));
const server = http.createServer((q, r) => {
  r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(html);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

let pass = 0; const failures = [];
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log(`  ok    ${name}`); }
  else { failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};

/* ---- the fixture generator, written from the spec independently of the app ---- */
const L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const G = L.map(s => [...s].reverse().join(''));
const R = L.map(s => [...s].map(c => c === '1' ? '0' : '1').join(''));
const PAR = ['000000','001011','001101','001110','010011','011001','011100','010101','010110','011010'];
function checkDigit(d12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += d12[i] * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}
function eanBits(code) {
  const d = String(code).split('').map(Number);
  const par = PAR[d[0]];
  let s = '101';
  for (let i = 0; i < 6; i++) s += (par[i] === '0' ? L : G)[d[i + 1]];
  s += '01010';
  for (let i = 0; i < 6; i++) s += R[d[i + 7]];
  return s + '101';
}
/* Bits → RGBA, with a quiet zone, a chosen module width, optional noise and a
   chosen black/white pair so the decoder cannot rely on 0 and 255. */
function render(code, opts) { return renderBits(eanBits(code), opts); }
function renderBits(bits, { mw = 3, h = 40, quiet = 12, black = 20, white = 235, noise = 0 } = {}) {
  const w = (bits.length + quiet * 2) * mw;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const mod = Math.floor(x / mw) - quiet;
      const on = mod >= 0 && mod < bits.length && bits[mod] === '1';
      let v = on ? black : white;
      if (noise) v = Math.max(0, Math.min(255, v + (((x * 7 + y * 13) % 17) - 8) * noise));
      const p = (y * w + x) * 4;
      data[p] = data[p + 1] = data[p + 2] = v; data[p + 3] = 255;
    }
  }
  return { width: w, height: h, data: [...data] };
}

const CODES = ['5000159484695', '0012000161155', '4006381333931', '9780201379624'];
CODES.forEach(c => {
  const d = c.split('').map(Number);
  if (checkDigit(d) !== d[12]) throw new Error('fixture ' + c + ' does not checksum — fix the fixture');
});

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await (await browser.newContext()).newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error' && !/MIME type/.test(m.text())) errs.push(m.text()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));

try {
  await page.goto(origin + '/', { waitUntil: 'load' });

  console.log('reading the bars\n');

  const read = (img) => page.evaluate((i) => decodeImageData(
    { width: i.width, height: i.height, data: new Uint8ClampedArray(i.data) }), img);

  for (const c of CODES) {
    const got = await read(render(c));
    check(`${c} is read back off the pixels`, got === c, String(got));
  }

  /* A phone does not hold the packet at one distance. */
  for (const mw of [2, 3, 5, 8]) {
    const got = await read(render(CODES[0], { mw }));
    check(`...at ${mw} pixels per module`, got === CODES[0], String(got));
  }
  /* Nor under one light. A fixed threshold reads a grey packet as all bars. */
  const dim = await read(render(CODES[0], { black: 90, white: 150 }));
  check('...on a low-contrast packet', dim === CODES[0], String(dim));
  const noisy = await read(render(CODES[0], { mw: 4, noise: 1.6 }));
  check('...with sensor noise in it', noisy === CODES[0], String(noisy));

  /* A packet photographed under a bright light sits entirely in the top half
     of the range; one in shadow sits entirely in the bottom. A fixed threshold
     reads the first as all white and the second as all black, whatever the
     bars are doing. Both of these straddle nothing at 128. */
  const bright = await read(render(CODES[0], { mw: 4, black: 150, white: 240 }));
  check('...on an over-lit packet', bright === CODES[0], String(bright));
  const shadow = await read(render(CODES[0], { mw: 4, black: 12, white: 105 }));
  check('...and one in shadow', shadow === CODES[0], String(shadow));

  /* A highlight straight across the middle of the code. The row the guide box
     points at is exactly the row a reflection lands on, which is why more than
     one is tried. */
  const streaked = render(CODES[0], { mw: 4, h: 60 });
  await page.evaluate(() => {});
  {
    const { width: w, height: hh, data } = streaked;
    for (let y = Math.round(hh / 2) - 4; y <= Math.round(hh / 2) + 4; y++) {
      for (let x = 0; x < w; x++) data[(y * w + x) * 4] = data[(y * w + x) * 4 + 1] = data[(y * w + x) * 4 + 2] = 250;
    }
  }
  const streak = await read(streaked);
  check('...and through a reflection across the middle', streak === CODES[0], String(streak));

  /* And it has to refuse rather than guess. A decoder that returns a plausible
     thirteen digits from a picture of a fence binds your protein tub to a
     fence. */
  const blank = await page.evaluate(() => {
    const w = 400, h = 40, d = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let i = 3; i < d.length; i += 4) d[i] = 255;
    return decodeImageData({ width: w, height: h, data: d });
  });
  check('a blank frame reads as nothing', blank === null, String(blank));
  const stripes = await page.evaluate(() => {
    const w = 400, h = 40, d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = (x % 9 < 4) ? 10 : 245, p = (y * w + x) * 4;
      d[p] = d[p+1] = d[p+2] = v; d[p+3] = 255;
    }
    return decodeImageData({ width: w, height: h, data: d });
  });
  check('...and so does a picture of even stripes', stripes === null, String(stripes));

  /* Two frames that are barcode-shaped and are not this barcode. Each one is a
     valid image in every respect except the one thing being tested, so it is
     that check refusing them and not some accident of the fixture. */
  const badGuard = (() => {
    const img = render(CODES[0], { mw: 4 });
    /* Start guard 101 → 111, everything else untouched: every digit still
       decodes and the checksum still passes. */
    const bits = eanBits(CODES[0]).split('');
    bits[1] = '1';
    const forged = renderBits(bits.join(''), { mw: 4 });
    return forged;
  })();
  const guardRejected = await read(badGuard);
  check('a frame with the wrong guard pattern is refused', guardRejected === null,
    String(guardRejected));

  const badSum = (() => {
    const bits = eanBits(CODES[0]).split('');
    /* Swap the last digit's pattern for a different valid one. Guards intact,
       every chunk a real R pattern, and the thirteen digits no longer add up. */
    const last = CODES[0][12], other = String((+last + 3) % 10);
    const start = 50 + 5 * 7;
    R[+other].split('').forEach((c, i) => { bits[start + i] = c; });
    return renderBits(bits.join(''), { mw: 4 });
  })();
  const sumRejected = await read(badSum);
  check('...and so is one whose digits do not add up', sumRejected === null,
    String(sumRejected));

  /* The checksum is the thing standing between a smeared frame and a wrong
     product. */
  const sums = await page.evaluate(() => ({
    good: validBarcode('5000159484695'),
    oneOff: validBarcode('5000159484694'),
    upc: validBarcode('012000161155'),
    upcNorm: normBarcode('012000161155'),
    short: validBarcode('12345'),
    junk: validBarcode('abcdefghijklm')
  }));
  check('a real code checks out', sums.good === true);
  check('...and one digit wrong does not', sums.oneOff === false);
  check('a 12-digit UPC-A is accepted', sums.upc === true);
  check('...and normalised to the EAN-13 it is', sums.upcNorm === '0012000161155', sums.upcNorm);
  check('nothing else is a barcode', sums.short === false && sums.junk === false);

  console.log('\nwhat a code is bound to\n');

  const bind = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.settings.nutrition = true; save(true);
    const whey = FOODS.find(f => /whey/i.test(f.n));
    const before = foodForBarcode('5000159484695');
    bindBarcode('5000159484695', whey.id);
    const after = foodForBarcode('5000159484695');
    /* A UPC and the EAN it pads to are the same packet, so binding one has to
       find the other — otherwise the same tub is two products. */
    bindBarcode('012000161155', whey.id);
    const viaUpc = foodForBarcode('0012000161155');
    /* A correction to the food follows the barcode, because the barcode points
       at the food rather than copying it. */
    fixFood(whey.id, { per: 1, kcal: 250, p: 50, c: 6, f: 4 });
    const corrected = foodForBarcode('5000159484695');
    const bogus = bindBarcode('5000159484695', 'nope-not-a-food');
    unbindBarcode('5000159484695');
    return { before: before === null, after: after && after.id === whey.id,
             viaUpc: viaUpc && viaUpc.id === whey.id,
             corrected: corrected && corrected.kcal, bogus,
             gone: foodForBarcode('5000159484695') === null,
             stored: Object.keys(S.nutrition.codes).length };
  });
  /* This is the whole design: there is no product database, so the first scan
     asks and every one after it does not. */
  check('a packet it has never seen matches nothing', bind.before === true);
  check('...and once you say what it is, it matches that', bind.after === true);
  check('a UPC-A and its EAN-13 are one packet', bind.viaUpc === true);
  check('...and your correction to the food comes with it', bind.corrected === 250,
    String(bind.corrected));
  check('a barcode cannot be bound to a food that does not exist', bind.bogus === false);
  check('a binding can be taken back', bind.gone === true);
  check('bindings live in the save, so they export and back up',
    bind.stored === 1, String(bind.stored));

  console.log('\nthe sheet\n');

  const ui = await page.evaluate(() => {
    S = blank(); S.onboarded = true; S.settings.nutrition = true; save(true);
    syncNav(); go('fuel'); renderFuel();
    const onFuel = !!document.querySelector('#fuel-body [data-act="scan"]');
    /* Typing it in is the way through for a creased barcode or a browser that
       will not give up a camera. */
    sheetScanType();
    const typed = !!document.getElementById('scan-n');
    closeSheet();
    sheetScanNew('5000159484695');
    const asks = document.getElementById('sheet-body');
    return { onFuel, typed,
             showsCode: /5000159484695/.test(asks.innerText),
             offersEntry: !!asks.querySelector('[data-act="scan-new-food"]'),
             offersBind: !!asks.querySelector('#scan-q'),
             bad: /undefined|NaN|\[object/.test(asks.innerText) };
  });
  check('Fuel offers the scanner', ui.onFuel === true);
  check('you can type the number instead', ui.typed === true);

  /* Permission declined, which is the single most common way this ends. The
     browser advertises a camera right up until you ask for one, so the honest
     test is to ask and be refused rather than to look for the absence of an
     API. A dead black rectangle with no explanation is the failure mode. */
  const denied = await page.evaluate(async () => {
    S = blank(); S.onboarded = true; S.settings.nutrition = true; save(true);
    go('fuel'); sheetScan();
    await new Promise(r => setTimeout(r, 700));
    const body = document.getElementById('sheet-body');
    const note = (document.getElementById('scan-note') || {}).textContent || '';
    const hint = (document.getElementById('scan-hint') || {}).textContent || '';
    const live = !!(typeof SCAN !== 'undefined' && SCAN);
    closeSheet();
    return { note, hint, live, offersType: !!body.querySelector('[data-act="scan-type"]') };
  });
  check('a refused camera is explained rather than left blank',
    /permission|declined|could not/i.test(denied.note), denied.note.slice(0, 70));
  check('...the frame says so too', /no camera/i.test(denied.hint), denied.hint);
  check('...nothing is left running', denied.live === false);
  check('...and typing the number is still offered', denied.offersType === true);

  /* Closing the sheet has to release the camera. There is no other signal —
     the ✕, the scrim, Escape, the back button and a drag all land in
     closeSheet, and a page that keeps a torch-lit camera open after you have
     walked away is the worst bug this feature could have. */
  const released = await page.evaluate(async () => {
    let stopped = 0;
    SCAN = { stream: { getTracks: () => [{ stop: () => { stopped++; } }] }, raf: null, timer: null };
    closeSheet();
    const afterClose = { stopped, cleared: SCAN === null };
    SCAN = { stream: { getTracks: () => [{ stop: () => { stopped++; } }] }, raf: null, timer: null };
    openSheet('<p>something else</p>');
    const afterOpen = { stopped, cleared: SCAN === null };
    closeSheet();
    return { afterClose, afterOpen };
  });
  check('closing the sheet turns the camera off',
    released.afterClose.stopped === 1 && released.afterClose.cleared, JSON.stringify(released.afterClose));
  check('...and so does opening another one over it',
    released.afterOpen.stopped === 2 && released.afterOpen.cleared, JSON.stringify(released.afterOpen));
  check('an unknown packet shows you the code it read', ui.showsCode === true);
  check('...and offers both ways to name it', ui.offersEntry && ui.offersBind);
  check('no placeholder text in the scanner', ui.bad === false);

  console.log('\nlooking a packet up\n');

  /* Stubbed, always. A test that reaches the real internet is a test that
     fails when a stranger's server is slow. The payload is shaped exactly as
     the v2 API returns it — verified against a real response — so the parser
     under test is parsing the real thing. */
  const OFF_OK = {
    code: '5000159484695', status: 1, status_verbose: 'product found',
    product: {
      product_name: 'Snickers', brands: 'Mars,Snickers', quantity: '50 g',
      serving_size: '50 g', nutrition_data_per: '100g',
      nutriments: { 'energy-kcal_100g': 484, 'energy-kj_100g': 2025,
                    proteins_100g: 8.2, carbohydrates_100g: 59.4, fat_100g: 23.6 }
    }
  };
  /* Half of Europe records kilojoules and no calories at all. */
  const OFF_KJ = { code: '4006381333931', status: 1, product: {
    product_name: 'Kilojoule Bar', brands: 'EU',
    nutriments: { 'energy-kj_100g': 1000, proteins_100g: 5, carbohydrates_100g: 30, fat_100g: 10 } } };
  /* Somebody typed it in wrong, which is what a public database is. */
  const OFF_ODD = { code: '0012000161155', status: 1, product: {
    product_name: 'Impossible Crisps', brands: 'Nobody',
    nutriments: { 'energy-kcal_100g': 500, proteins_100g: 1, carbohydrates_100g: 2, fat_100g: 1 } } };
  const OFF_MISSING = { code: '9780201379624', status: 0, status_verbose: 'product not found' };

  const stub = (mode, payload) => page.evaluate(([m, pl]) => {
    window.__offCalls = [];
    window.fetch = (url, opts) => {
      window.__offCalls.push({ url: String(url), creds: opts && opts.credentials });
      if (m === 'reject') return Promise.reject(new Error('offline'));
      if (m === 'http500') return Promise.resolve({ ok: false, status: 500 });
      if (m === 'garbage') return Promise.resolve({ ok: true, json: () => Promise.reject(new Error('not json')) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(pl) });
    };
  }, [mode, payload]);

  const lookup = async (mode, payload, code, setup) => {
    await stub(mode, payload);
    return page.evaluate(async ([c, sc]) => {
      S = blank(); S.onboarded = true; S.settings.nutrition = true;
      eval(sc || '');
      save(true);
      /* Caught here, not left to propagate. offLookup swallowing every kind of
         failure is the thing under test — and a version that throws instead
         would otherwise take the whole instrument down and read as a crash
         rather than as a red. */
      let got = null, threw = null;
      try { got = await offLookup(c); } catch (e) { threw = String(e && e.message || e); }
      return { got, threw, calls: window.__offCalls };
    }, [code, setup || '']);
  };

  /* Off by default. This is the one thing in the app that talks to anything,
     and it does not do it until somebody says so. */
  const offByDefault = await lookup('ok', OFF_OK, '5000159484695');
  check('barcode lookup is off until you turn it on',
    offByDefault.got === null && offByDefault.calls.length === 0,
    `${offByDefault.calls.length} requests`);

  const on = 'S.settings.off = true;';
  const hit = await lookup('ok', OFF_OK, '5000159484695', on);
  check('with it on, a packet comes back', hit.got && hit.got.n === 'Snickers, Mars',
    JSON.stringify(hit.got && hit.got.n));
  check('...with its macros per 100g',
    hit.got && hit.got.kcal === 484 && hit.got.p === 8.2 && hit.got.c === 59.4 && hit.got.f === 23.6,
    JSON.stringify(hit.got));
  check('...and the serving the packet states', hit.got && hit.got.serving === '50 g',
    hit.got && hit.got.serving);
  /* One host, one barcode, and nothing else — no cookies, no account. */
  check('the request carries the barcode and nothing else',
    hit.calls.length === 1 && /openfoodfacts\.org\/api\/v2\/product\/5000159484695\.json/.test(hit.calls[0].url),
    hit.calls[0] && hit.calls[0].url);
  check('...and is sent without credentials', hit.calls[0] && hit.calls[0].creds === 'omit',
    hit.calls[0] && String(hit.calls[0].creds));

  const kj = await lookup('ok', OFF_KJ, '4006381333931', on);
  /* 1000 kJ is 239 kcal. Dropping kilojoule-only entries would lose a large
     part of the European database for no reason. */
  check('a kilojoule-only entry is converted', kj.got && kj.got.kcal === 239,
    String(kj.got && kj.got.kcal));

  /* Every kind of no lands in the same place, because to the caller they mean
     the same thing: ask the person instead. */
  for (const [mode, label] of [['reject', 'no connection'], ['http500', 'a server error'],
                               ['garbage', 'a reply that is not JSON']]) {
    const r = await lookup(mode, null, '5000159484695', on);
    check(`${label} falls through rather than failing`,
      r.got === null && r.threw === null, r.threw ? 'threw: ' + r.threw : JSON.stringify(r.got));
  }
  const miss = await lookup('ok', OFF_MISSING, '9780201379624', on);
  check('a packet the database does not have falls through too', miss.got === null,
    JSON.stringify(miss.got));
  const offline = await lookup('ok', OFF_OK, '5000159484695',
    on + ' Object.defineProperty(navigator, "onLine", { value: false, configurable: true });');
  check('and with the network off it does not even ask',
    offline.got === null && offline.calls.length === 0, `${offline.calls.length} requests`);

  /* Crowd-sourced data gets checked before it is offered. */
  const odd = await page.evaluate(() => ({
    good: offPlausible({ kcal: 484, p: 8.2, c: 59.4, f: 23.6 }),
    bad: offPlausible({ kcal: 500, p: 1, c: 2, f: 1 })
  }));
  check('a sane entry reads as sane', odd.good === true);
  check('...and one whose numbers do not add up is flagged', odd.bad === false);

  const flow = await page.evaluate(async ([ok, bad]) => {
    /* The offline probe above redefined navigator.onLine on this page and it
       stays redefined — so without putting it back, every probe after it runs
       offline and passes for the wrong reason. */
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    S = blank(); S.onboarded = true; S.settings.nutrition = true; S.settings.off = true; save(true);
    window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(ok) });
    await onScanned('5000159484695');
    const body = document.getElementById('sheet-body');
    const shown = /Snickers/.test(body.innerText);
    /* Nothing is saved until you keep it — this is a stranger's data. */
    const savedEarly = customFoods().length;
    const keep = body.querySelector('[data-act="off-keep"]');
    /* Fail with what it actually did, rather than throwing on a null and
       killing the instrument before it prints anything. */
    if (!keep) return { shown, savedEarly, saved: -1, name: null, bound: null,
                        warned: false, sheet: body.innerText.slice(0, 120) };
    keep.click();
    const after = customFoods();
    const bound = foodForBarcode('5000159484695');

    /* And a suspect entry says so instead of pretending. */
    S = blank(); S.onboarded = true; S.settings.nutrition = true; S.settings.off = true; save(true);
    window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(bad) });
    await onScanned('0012000161155');
    const warned = /do not quite add up/i.test(document.getElementById('sheet-body').innerText);
    closeSheet();
    return { shown, savedEarly, saved: after.length, name: after[0] && after[0].n,
             bound: !!bound && bound.n, warned, sheet: '' };
  }, [OFF_OK, OFF_ODD]);
  check('a found packet is shown before anything is saved',
    flow.shown === true && flow.savedEarly === 0, `shown ${flow.shown}, saved ${flow.savedEarly}`);
  check('...keeping it saves it as your own food',
    flow.saved === 1 && flow.name === 'Snickers, Mars', flow.name + ' | ' + flow.sheet);
  check('...and binds it to the barcode, so it never needs looking up again',
    flow.bound === 'Snickers, Mars', String(flow.bound));
  check('an entry whose numbers do not add up says so', flow.warned === true);

  const degrade = await page.evaluate(async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    S = blank(); S.onboarded = true; S.settings.nutrition = true; S.settings.off = true; save(true);
    window.fetch = () => Promise.reject(new Error('offline'));
    await onScanned('5000159484695');
    const txt = document.getElementById('sheet-body').innerText;
    closeSheet();
    return { asks: /New packet/i.test(txt), explains: /Open Food Facts/i.test(txt) };
  });
  check('a failed lookup lands on the same sheet as having no lookup at all',
    degrade.asks === true);
  check('...and says why it is asking', degrade.explains === true);

  check('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await browser.close(); server.close();
}
console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log('\nfailures:'); failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
