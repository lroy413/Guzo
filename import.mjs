/* import.mjs — a written plan becomes routines, and never becomes them quietly.

   Three subjects, kept apart because each fails on its own: getting text out of
   a file, finding the structure in the text, and matching the movements to the
   catalogue.

   The PDF fixture is built here rather than committed. It is encoded the way
   the document this was written against is encoded — ASCII85 over Flate, which
   is what ReportLab emits — so the decode path under test is the real one, and
   the repo carries no binary nobody can read a diff of.

   Run: node import.mjs */

import http from 'node:http';
import zlib from 'node:zlib';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.GUZO_CHROME || undefined;
const html = readFileSync(join(ROOT, 'index.html'));

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

let pass = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log(`  ok    ${name}`); }
  else { failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
};

/* ---- the fixture ----
   Written the way the plan that prompted this is written: a two-column table
   where the movement and its prescription are separate show operations on
   separate baselines, a heading broken across three of them, an en dash inside
   a rep range, and a wrapped prose paragraph using T*. Every one of those is a
   thing that broke the extractor at least once. */
function a85encode(buf) {
  let out = '';
  for (let i = 0; i < buf.length; i += 4) {
    const chunk = buf.subarray(i, i + 4);
    const n = chunk.length;
    let t = 0;
    for (let k = 0; k < 4; k++) t = t * 256 + (k < n ? chunk[k] : 0);
    if (n === 4 && t === 0) { out += 'z'; continue; }
    const c = [];
    for (let k = 0; k < 5; k++) { c.unshift(String.fromCharCode(33 + (t % 85))); t = Math.floor(t / 85); }
    out += c.join('').slice(0, n + 1);
  }
  return out + '~>';
}

/* Text at an explicit position, as a table cell is written. */
const at = (x, y, s) => `BT /F1 11 Tf 1 0 0 1 ${x} ${y} Tm (${s}) Tj ET\n`;
/* And a wrapped paragraph, which advances by T* rather than by a new Tm. */
const para = (x, y, lines) =>
  `BT /F1 9 Tf 14 TL 1 0 0 1 ${x} ${y} Tm ` +
  lines.map((l, i) => (i ? 'T* ' : '') + `(${l}) Tj `).join('') + 'ET\n';

const content =
  at(60, 760, 'MONDAY') +
  at(140, 760, '\\227 OFF') +          /* 0x97, an em dash in WinAnsi */
  at(200, 760, 'WORK') +
  at(60, 740, 'Legs + Core') +
  at(60, 726, 'Quads \\267 Hamstrings \\267 Glutes \\267 Calves \\267') +
  at(60, 712, '~75 min') +
  at(60, 690, 'MAIN LIFTS \\227 STRENGTH') +
  at(60, 670, '1') +
  at(80, 670, 'Barbell back squat') +
  at(80, 656, '5 sets \\327 5\\2266 reps \\267 maintain weight') +   /* \326 is x, \226 an en dash */
  at(60, 636, '2') +
  at(80, 636, 'Close-grip bench press') +
  at(80, 622, '4 sets \\327 8 reps') +
  at(60, 600, 'SUPERSET A \\227 3A THEN 3B') +
  at(60, 580, '3') + at(70, 580, 'A') +
  at(90, 580, 'Leg curl \\227 3-sec eccentric') +
  at(90, 566, '4 sets \\327 12 reps') +
  at(60, 546, '3') + at(70, 546, 'B') +
  at(90, 546, 'Leg extension') +
  at(90, 532, '4 sets \\327 15 reps') +
  at(60, 500, 'CORE') +
  at(60, 480, 'C') + at(70, 480, '1') +
  at(90, 480, 'Plank hold') +
  at(90, 466, '45 sec \\267 no hip sag') +
  at(60, 450, 'C') + at(70, 450, '2') +
  at(90, 450, 'Bicycle crunch') +
  /* A circuit states its rounds once at the top, so the movement carries only
     the work: "20 reps", with no "N sets ×" in front of it. */
  at(90, 436, '20 reps \\267 slow tempo') +
  at(60, 416, '5') +
  /* Something the catalogue has never heard of. */
  at(80, 416, 'Interpretive dance') +
  at(80, 402, '3 sets \\327 10 reps') +
  /* Wrapped where the real document wraps it: the continuation starts with a
     word and then a duration, which is exactly what parses as work. */
  para(60, 380, ['Rest: 2\\2263 min',
                 'compounds \\267 60 sec supersets.']) +
  at(60, 340, 'TUESDAY') +
  at(60, 320, 'Push') +
  at(60, 300, '1') +
  at(80, 300, 'Barbell bench press') +
  at(80, 286, '5 sets \\327 5 reps');

const deflated = zlib.deflateSync(Buffer.from(content, 'latin1'));
const stream = a85encode(deflated);
const pdfBody =
  '%PDF-1.4\n' +
  '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
  '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
  '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R\n' +
  '   /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n' +
  '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n' +
  '4 0 obj\n<< /Filter [ /ASCII85Decode /FlateDecode ] /Length ' + stream.length + ' >>\nstream\n' +
  stream + '\nendstream\nendobj\n' +
  'trailer\n<< /Root 1 0 R >>\n%%EOF\n';
const PDF_BYTES = [...Buffer.from(pdfBody, 'latin1')];

const TEXT_PLAN = [
  'Day 1 — Upper',
  'Bench Press 4x8',
  'Barbell Row — 4 sets x 10 reps',
  'Lateral Raise 3 x 15',
  '',
  'Day 2 — Lower',
  'Back Squat 5x5',
  'Romanian Deadlift 3 x 8',
  'Plank 3 x 45 sec'
].join('\n');

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const ctx = await browser.newContext();
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error' && !/MIME type/.test(m.text())) consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

try {
  await page.goto(origin + '/', { waitUntil: 'load' });

  // ================= 1. getting text out of a PDF ========================
  console.log('reading a PDF\n');

  const lines = await page.evaluate(async (arr) =>
    (await pdfText(new Uint8Array(arr).buffer)).map(normPdfChars), PDF_BYTES);

  check('an ASCII85-over-Flate stream is decoded', lines.length > 10, `${lines.length} lines`);
  check('...into the words that were written',
    lines.some(l => /Barbell back squat/.test(l)), lines.slice(0, 3).join(' | '));
  /* WinAnsi 0x80–0x9F is where PDF and latin1 disagree, and it is where every
     dash lives. Read as latin1 alone, "5–6 reps" arrives as "56 reps" — a rep
     range silently turned into fifty-six. */
  check('a rep range survives the encoding',
    lines.some(l => /5\s*-\s*6 reps/.test(l)),
    lines.filter(l => /reps/.test(l))[0]);
  check('...and so does the multiplication sign',
    lines.some(l => /×/.test(l)), lines.filter(l => /sets/.test(l))[0]);
  /* Concatenating every show operation in order runs a table's two columns
     together; grouping by baseline is what keeps them apart. */
  check('a movement and its prescription stay on separate lines',
    lines.indexOf('Barbell back squat') >= 0 &&
    lines.some(l => /^5 sets/.test(l)),
    lines.slice(6, 10).join(' | '));
  /* And a wrapped paragraph advances with T*, which if ignored joins its lines
     without a space — "compounds. Keep theweight honest". */
  check('a wrapped paragraph is not run together',
    !lines.some(l => /theweight|andcalorie/.test(l)),
    lines.filter(l => /Keep/.test(l)).join(' | '));

  // ================= 2. finding the structure ============================
  console.log('\nfinding the structure\n');

  const plan = await page.evaluate((ls) => {
    const p = parsePlan(ls);
    return { days: p.days.map(d => ({ name: d.name, title: d.title,
      items: d.items.map(i => ({ written: i.written, sets: i.sets, reps: i.reps,
        unit: i.unit, sup: !!i.supNext, block: i.block,
        match: i.match ? i.match.name : null, sure: !!(i.match && i.match.confident) })) })),
      found: p.found, matched: p.matched };
  }, lines);

  check('a plan splits into its days', plan.days.length === 2,
    plan.days.map(d => d.name).join(', '));
  /* "MONDAY" / "— OFF" / "WORK" is one heading the PDF broke into three. */
  check('a day heading broken across lines is still one day',
    plan.days[0] && plan.days[0].name === 'Monday', plan.days[0] && plan.days[0].name);
  check('...and its subtitle is the subtitle, not the next fragment',
    plan.days[0] && plan.days[0].title === 'Legs + Core', plan.days[0] && plan.days[0].title);

  const d0 = (plan.days[0] || { items: [] }).items;
  check('every movement on the day is found', d0.length === 7,
    d0.map(i => i.written).join(' | '));
  /* The name is what sits in front of the numbers, or the line before them.
     Taking the line up to the first separator reads "5 sets × 5-6 reps" as a
     movement called "5 sets × 5-6 reps". */
  check('the movement is named, not the prescription',
    d0[0] && d0[0].written === 'Barbell back squat', d0[0] && d0[0].written);
  check('a rep range takes its low end', d0[0] && d0[0].sets === 5 && d0[0].reps === 5,
    d0[0] && `${d0[0].sets}x${d0[0].reps}`);
  /* Written without a "sets ×" prefix, which is how a circuit states work. */
  check('a bare duration is a prescription too',
    d0[4] && d0[4].reps === 45 && d0[4].unit === 'sec',
    d0[4] && `${d0[4].reps} ${d0[4].unit}`);
  /* "20 reps · slow tempo" with no "N sets ×" in front of it, which is how a
     circuit writes a movement. */
  check('...and so is work written without a set count',
    d0[5] && d0[5].written === 'Bicycle crunch' && d0[5].sets === 1 && d0[5].reps === 20,
    d0[5] && `${d0[5].written} ${d0[5].sets}x${d0[5].reps}`);
  check('a movement the catalogue has never heard of is left unmatched',
    d0[6] && d0[6].written === 'Interpretive dance' && d0[6].match === null,
    d0[6] && d0[6].written + ' → ' + d0[6].match);
  check('the index letter says which block a movement is in',
    d0[4] && d0[4].block === 'core' && d0[0].block === 'main',
    d0.map(i => i.block).join(','));
  /* 3A runs into 3B. Read off the index, because the SUPERSET heading is prose
     and the index is structure. */
  check('a pair written 3A / 3B becomes a link on the first of them',
    d0[2] && d0[3] && d0[2].sup === true && d0[3].sup === false,
    d0.map(i => i.written + ':' + i.sup).join(' | '));

  /* "Quads · Hamstrings · Glutes · Calves ·" then "~75 min" is the day's
     summary. Read as a movement it becomes one set of seventy-five minutes. */
  check('a row of body parts is not a movement lasting 75 minutes',
    !d0.some(i => /Quads|Hamstrings/.test(i.written)),
    d0.map(i => i.written).join(' | '));
  /* And "Rest: 2-3 min compounds · 60 sec supersets" parses as a prescription
     unless prose is recognised as prose — including its second line. */
  check('prose about the session is not work',
    !d0.some(i => /compounds|supersets\./i.test(i.written)) && d0.length === 7,
    d0.map(i => i.written).join(' | '));

  const txt = await page.evaluate((t) => {
    const p = parsePlan(t.split('\n'));
    return p.days.map(d => ({ name: d.name, items: d.items.map(i =>
      `${i.written}|${i.sets}x${i.reps}${i.unit === 'reps' ? '' : i.unit}|${i.match ? i.match.name : '-'}`) }));
  }, TEXT_PLAN);
  check('a plain-text plan works the same way', txt.length === 2,
    txt.map(d => d.name).join(', '));
  /* Here the name and the numbers are on ONE line, which is how a person types
     it. The same rule has to cover both. */
  check('...with the name in front of the numbers on one line',
    txt[0] && txt[0].items[0].indexOf('Bench Press|4x8|Bench Press') === 0,
    txt[0] && txt[0].items[0]);
  check('...and "3 x 45 sec" read as seconds',
    txt[1] && /Plank\|3x45sec/.test(txt[1].items[2]), txt[1] && txt[1].items[2]);

  // ================= 3. matching the catalogue ===========================
  console.log('\nmatching the catalogue\n');

  const match = await page.evaluate(() => {
    const m = s => { const r = matchExercise(s); return r ? r.name + (r.confident ? '' : ' ?') : null; };
    return {
      squat: m('Barbell back squat'), rdl: m('Deficit Romanian deadlift'),
      press: m('Leg press machine'), curl: m('Leg curl — 3-sec eccentric'),
      bulg: m('Bulgarian split squat'), crunch: m('Weighted cable crunch'),
      pushdown: m('Cable tricep pushdown (rope)'), chop: m('Cable wood chop — high to low'),
      bike: m('Stationary bike or incline treadmill walk'),
      cgbp: m('Close-grip bench press'), bench: m('Barbell bench press'),
      dbrow: m('Single-arm DB row'), nonsense: m('Interpretive dance'),
      empty: m('   '), digits: m('12345')
    };
  });
  check('a barbell back squat is a Back Squat', match.squat === 'Back Squat', match.squat);
  check('a deficit RDL keeps its deficit', /Deficit Romanian Deadlift/.test(match.rdl || ''), match.rdl);
  check('"machine" is not part of the name', /^Leg Press/.test(match.press || ''), match.press);
  check('a tempo note after a dash is dropped', /^Leg Curl/.test(match.curl || ''), match.curl);
  check('a bracketed attachment is dropped', /^Tricep Pushdown/.test(match.pushdown || ''), match.pushdown);
  check('spacing is not a difference', /Wood ?Chop/i.test(match.chop || ''), match.chop);
  check('"X or Y" takes the first offer', /Stationary Bike/.test(match.bike || ''), match.bike);
  check('an abbreviation is expanded', /Dumbbell Row/.test(match.dbrow || ''), match.dbrow);
  /* "Close-grip bench press" contains both "Close-Grip Bench" and "Bench
     Press", which score identically without a tie-break — and the tie went to
     whichever sits earlier in the catalogue. */
  check('a close-grip press is not an ordinary bench press',
    /^Close-Grip Bench/.test(match.cgbp || ''), match.cgbp);
  check('...and an ordinary one still is', /^Bench Press/.test(match.bench || ''), match.bench);
  check('something that is not an exercise matches nothing', match.nonsense === null, match.nonsense);
  check('...and neither does an empty or numeric line',
    match.empty === null && match.digits === null, `${match.empty} / ${match.digits}`);

  // ================= 4. nothing is built until you say so =================
  console.log('\nthe review, and what it builds\n');

  const built = await page.evaluate(async (arr) => {
    S = blank(); S.onboarded = true; save(true);
    const file = new File([new Uint8Array(arr)], 'plan.pdf', { type: 'application/pdf' });
    await runImport(file);
    const open = document.getElementById('sheet').classList.contains('on');
    const body = document.getElementById('sheet-body');
    const before = ensureRoutines().length;
    const rows = body.querySelectorAll('.imp-item').length;
    /* The line the document said has to be on screen next to the movement the
       app chose, or a confident wrong match is indistinguishable from a right
       one. */
    const showsSource = /Barbell back squat/.test(body.innerText);
    const showsMatch = /Back Squat/.test(body.innerText);
    /* A movement it could not place starts unticked and says so. Building a
       squat because the line said something squat-ish is worse than leaving it
       out and admitting it. */
    const missRow = body.querySelector('.imp-item.miss');
    const missOff = !!missRow && !missRow.querySelector('.imp-tick.on');
    const missSays = !!missRow && /pick one/i.test(missRow.innerText);

    const r = commitImport();
    const after = ensureRoutines();
    return { open, before, rows, showsSource, showsMatch, missOff, missSays, made: r.made,
      bad: /undefined|NaN|\[object/.test(body.innerText),
      routines: after.map(x => ({ name: x.name, n: x.items.length,
        names: x.items.map(i => EX[i.exId].name),
        sup: supersetGroups(x.items).map(g => g.map(i => EX[x.items[i].exId].name).join('+')),
        modes: x.items.map(i => itemLoad(i)) })) };
  }, PDF_BYTES);

  check('a file opens the review', built.open === true);
  check('...listing every movement it found', built.rows === 8, String(built.rows));
  check('...showing the line the document actually said', built.showsSource === true);
  check('...beside the movement it matched', built.showsMatch === true);
  /* The whole reason the review exists. */
  check('nothing is written before you commit', built.before === 0, String(built.before));
  check('an unmatched movement starts unticked', built.missOff === true);
  check('...and asks you to pick one', built.missSays === true);
  check('committing builds one routine per day', built.made === 2 && built.routines.length === 2,
    built.routines.map(r => r.name).join(', '));
  check('...named for the day', /^Monday/.test(built.routines[0].name), built.routines[0].name);
  check('...carrying the movements in order',
    built.routines[0].names.join(',') === 'Back Squat,Close-Grip Bench,Leg Curl,Leg Extension,Plank,Bicycle Crunch',
    built.routines[0].names.join(','));
  /* normaliseSupersets strips a link off whatever is last, so setting the
     links while the list is still being built deletes every one of them a
     movement later. */
  check('...and the superset survives into the routine',
    built.routines[0].sup.length === 1 && built.routines[0].sup[0] === 'Leg Curl+Leg Extension',
    JSON.stringify(built.routines[0].sup));
  check('a movement written in seconds is stored in seconds',
    built.routines[0].modes[4] === 'time', built.routines[0].modes.join(','));
  check('no placeholder text in the review', built.bad === false);

  const unticked = await page.evaluate(async (arr) => {
    S = blank(); S.onboarded = true; save(true);
    await runImport(new File([new Uint8Array(arr)], 'plan.pdf', { type: 'application/pdf' }));
    /* Drop the second half of the pair, and turn the whole second day off. */
    IMPORT.days[0].items[3].on = false;
    IMPORT.days[1].on = false;
    const r = commitImport();
    const list = ensureRoutines();
    return { made: r.made, n: list.length,
      names: list[0] ? list[0].items.map(i => EX[i.exId].name) : [],
      sup: list[0] ? supersetGroups(list[0].items).length : -1 };
  }, PDF_BYTES);
  check('unticking a movement leaves it out', unticked.names.indexOf('Leg Extension') < 0,
    unticked.names.join(','));
  /* And the link that pointed at it goes with it, rather than reaching past to
     whatever is now underneath. */
  check('...and the link that pointed at it goes too', unticked.sup === 0, String(unticked.sup));
  check('turning a day off builds nothing for it', unticked.made === 1 && unticked.n === 1,
    `${unticked.made} made, ${unticked.n} routines`);

  const junk = await page.evaluate(async () => {
    S = blank(); S.onboarded = true; save(true);
    const before = ensureRoutines().length;
    await runImport(new File(['just some prose about nothing at all'], 'x.txt', { type: 'text/plain' }));
    const txt = document.getElementById('sheet-body').innerText;
    return { before, after: ensureRoutines().length, txt: txt.slice(0, 60),
             said: /No sessions found/i.test(txt) };
  });
  check('a file with no plan in it says so', junk.said === true, junk.txt);
  check('...and builds nothing', junk.after === junk.before, String(junk.after));

  // ================= 5. where you find it, and adding into a routine ======
  console.log('\nthe ways in\n');

  const doors = await page.evaluate(() => {
    S = blank(); S.onboarded = true; save(true);
    const has = () => !!document.querySelector('#sheet-body [data-act="import"]');
    /* Where you go to decide how your training is shaped. */
    sheetProgram();
    const structure = has();
    /* Where your own sessions live. */
    sheetRoutines();
    const routines = has();
    /* And inside the thing you are building, which is where adding twenty
       movements one tap at a time actually hurts. */
    const r = newRoutine('Legs');
    addToRoutine(r.id, 'bb-back-squat');
    sheetRoutineEdit(r.id);
    const el = document.querySelector('#sheet-body [data-act="import-into"]');
    const builder = !!el && el.dataset.v === r.id;
    closeSheet();
    return { structure, routines, builder };
  });
  check('Structure offers the import', doors.structure === true);
  check('...so does the routines list', doors.routines === true);
  check('...and the builder offers it for the routine you have open',
    doors.builder === true);

  const into = await page.evaluate(async (arr) => {
    S = blank(); S.onboarded = true; save(true);
    const r = newRoutine('Legs');
    addToRoutine(r.id, 'bb-deadlift');          // already in it, must survive
    sheetImport(r.id);
    await runImport(new File([new Uint8Array(arr)], 'plan.pdf', { type: 'application/pdf' }));
    const body = document.getElementById('sheet-body');
    const saysInto = /Adding to/.test(body.innerText) && /Legs/.test(body.innerText);
    const before = ensureRoutines().length;
    /* Only the first day. */
    IMPORT.days[1].on = false;
    const res = commitImport();
    const list = ensureRoutines();
    const legs = routineById(r.id);
    return { saysInto, before, after: list.length, added: res.added,
      names: legs.items.map(i => EX[i.exId].name),
      sup: supersetGroups(legs.items).map(g => g.map(i => EX[legs.items[i].exId].name).join('+')) };
  }, PDF_BYTES);
  check('importing into a routine says which one', into.saysInto === true);
  /* The whole difference between the two modes. */
  check('...adds to it rather than building new ones',
    into.after === 1 && into.before === 1, `${into.before} → ${into.after}`);
  check('...keeps what was already in it, first',
    into.names[0] === 'Deadlift', into.names.join(','));
  check('...appends the imported movements after it',
    into.names.join(',') === 'Deadlift,Back Squat,Close-Grip Bench,Leg Curl,Leg Extension,Plank,Bicycle Crunch',
    into.names.join(','));
  check('...and the superset comes with them',
    into.sup.length === 1 && into.sup[0] === 'Leg Curl+Leg Extension', JSON.stringify(into.sup));
  /* A day that was turned off contributes nothing, and the movement that would
     have followed it is not linked to across the gap. */
  check('...while a day turned off contributes nothing',
    into.names.indexOf('Bench Press') < 0, into.names.join(','));

  // ================= 6. checking a flagged match, and getting back =========
  console.log('\nwhen it is not sure\n');

  const unsure = await page.evaluate(async (arr) => {
    S = blank(); S.onboarded = true; save(true);
    await runImport(new File([new Uint8Array(arr)], 'plan.pdf', { type: 'application/pdf' }));
    const body = () => document.getElementById('sheet-body');
    const flagged = [...body().querySelectorAll('.imp-item.unsure')];
    /* "check this" on its own is an instruction to worry. It has to say what
       the doubt actually is. */
    const reasons = flagged.map(el => (el.querySelector('.imp-tag.warn') || {}).textContent || '');
    const rowsBefore = body().querySelectorAll('.imp-item').length;

    flagged[0].querySelector('.imp-body').click();
    const inPicker = !!document.getElementById('pick-q');
    const said = /your plan said/i.test(body().innerText);
    /* The bug: the ✕ closes the whole stack, so checking one movement lost the
       other fifty-one and the import had to be started again. */
    const back = body().querySelector('[data-act="imp-back"]');
    if (!back) return { reasons, rowsBefore, inPicker, said, hasBack: false, rowsAfter: -1 };
    back.click();
    return { reasons, rowsBefore, inPicker, said, hasBack: true,
             rowsAfter: body().querySelectorAll('.imp-item').length };
  }, PDF_BYTES);

  check('a match it is unsure about is flagged', unsure.reasons.length > 0,
    String(unsure.reasons.length));
  check('...and says why, not just "check this"',
    unsure.reasons.every(r => r && !/^check this$/i.test(r)), unsure.reasons.join(' | '));
  check('tapping it opens the picker', unsure.inPicker === true);
  check('...showing the line your plan actually said', unsure.said === true);
  check('...with a way back that is not the ✕', unsure.hasBack === true);
  check('...and going back keeps the rest of the import',
    unsure.rowsAfter === unsure.rowsBefore && unsure.rowsBefore > 1,
    `${unsure.rowsBefore} → ${unsure.rowsAfter}`);

  /* ---- a plan's own structure survives the import ----
     Reported from a real 5-day split: the warm-up "went somewhere else" and
     the superset "didn't come together". Both were true, and neither was a
     parser bug — the parser worked all of it out and nothing carried the
     answer through.

     Written with the index in front of the name rather than in a column of its
     own, because a PDF table gives you either and only the column was handled:
     the other left "7A" glued to the front of the movement and matched the
     catalogue against it, and lost the superset letter, so no pair ever
     formed. */
  const PLAN = [
    'WEDNESDAY', 'Pull — Back Priority',
    'WARM-UP — 8 MIN',
    'W Band pull-aparts', '3 × 20',
    'BACK — HEAVY LOADABLE THICKNESS',
    '3 Barbell bent-over row — underhand', '5 sets × 6–8 reps',
    '4 Lat pulldown — neutral close grip', '4 sets × 8–10 reps',
    'REAR DELT + BICEPS',
    'SUPERSET A — 7A THEN 7B · REST 60 SEC',
    '7A Reverse pec deck', '3 sets × 15 reps',
    '7B EZ bar curl', '3 sets × 8–10 reps'
  ];
  const shape = await page.evaluate((lines) => {
    S = blank(); S.onboarded = true; save(true); buildWeekPlan(true);
    IMPORT = parsePlan(lines);
    const parsed = IMPORT.days[0].items.map(i => ({
      idx: i.idx, written: i.written, block: i.block, sup: i.sup, supNext: !!i.supNext,
      id: i.match ? i.match.exId : null
    }));
    IMPORT.days.forEach(d => { d.on = true; d.items.forEach(i => {
      i.on = !!i.match; i.exId = i.match ? i.match.exId : null; }); });
    commitImport();
    const r = S.routines[S.routines.length - 1];
    S.active = buildRoutineSession(r.id, 'full');
    save(true); go('train'); renderTrain();
    const body = document.getElementById('train-body');
    /* Walked in painted order, so a heading landing between two halves of a
       pair is visible as a sequence rather than inferred from class names. */
    const seq = [];
    body.querySelectorAll('.sec-head.blk, .sup-head, .ex-card, .ex-node').forEach(el => {
      if (el.classList.contains('sec-head')) { seq.push('H:' + el.innerText.split('\n')[0].trim()); return; }
      if (el.classList.contains('sup-head')) { seq.push('SUP'); return; }
      /* One entry per movement, named. A card and its node both match the
         selector, and the second contributed a nameless "X:" — which sat
         exactly where a wrongly-inserted heading would be, so the adjacency
         assertion below passed while the heading was there. Take the first
         line that reads like a name, and drop anything nameless. */
      const name = (el.innerText || '').split('\n')
        .map(x => x.trim()).find(x => /[A-Za-z]{3}/.test(x) && !/^\d/.test(x));
      if (name) seq.push('X:' + name);
    });
    return { parsed, seq, routineItems: r.items.map(i => ({ id: i.exId, block: i.block || null })),
             breaks: body.querySelectorAll('.rail-brk').length };
  }, PLAN);

  const warm = shape.parsed[0];
  check('an index in front of the name is read as an index',
    warm.idx === 'W', `idx=${warm.idx || '(none)'}`);
  check('...and stripped off the movement it was in front of',
    /^Band pull-aparts$/i.test(warm.written || ''), warm.written);
  check('a warm-up heading puts the movement in the warm-up',
    warm.block === 'warmup', String(warm.block));
  check('...and it is still a warm-up by the time it reaches the session',
    (shape.routineItems[0] || {}).block === 'warmup',
    JSON.stringify(shape.routineItems[0]));
  /* The whole complaint, stated as the screen: the warm-up is the first thing
     under the first heading, not four movements down under Accessories. */
  check('...so it opens the session rather than landing in the accessories',
    /^H:/.test(shape.seq[0] || '') && /warm/i.test(shape.seq[0] || ''),
    (shape.seq[0] || '') + ' / ' + (shape.seq[1] || ''));

  const supAt = shape.parsed.findIndex(i => i.supNext);
  check('7A into 7B is read as a superset', supAt >= 0,
    shape.parsed.map(i => i.idx + (i.sup || '')).join(' '));
  /* Nothing between the two halves. sessionOrder() groups supersets before it
     sorts, but the headings were drawn per item — so a rear-delt fly paired
     with a curl came out as "Superset A / fly", then a MAIN LIFTS heading, then
     the curl. The pair moved together and was split by a caption. */
  const sup = shape.seq.indexOf('SUP');
  check('...and nothing is drawn between its two halves',
    sup >= 0 && /^X:/.test(shape.seq[sup + 1] || '') && /^X:/.test(shape.seq[sup + 2] || ''),
    shape.seq.slice(Math.max(0, sup), sup + 3).join(' | '));
  check('...nor a break in the rail through the middle of it',
    shape.breaks === 2, `${shape.breaks} breaks for 3 blocks`);

  /* ---- the shapes a real exported plan actually arrives in ----
     Every fixture below is a layout taken from a document that imported
     wrongly, reproduced rather than the document itself. Each line is its own
     entry because that is what contentLines() hands parsePlan: a table column
     arrives as a line of its own, and a heading wrapped by the layout engine
     arrives as two. */
  const REAL = await page.evaluate(() => {
    const run = (lines) => {
      S = blank(); S.onboarded = true; save(true);
      const r = parsePlan(lines);
      return (r.days[0] || { items: [] }).items.map(i => ({
        idx: i.idx, w: i.written, block: i.block,
        sets: i.sets, reps: i.reps, unit: i.unit,
        id: i.match ? i.match.exId : null
      }));
    };
    return {
      /* A day's own subtitle, wrapped by the layout so the duration lands on
         the next line. The "list of body parts" guard counts middot-separated
         parts, and the wrap left two instead of three. */
      summary: run(['WEDNESDAY', 'Pull — Back Priority',
        'Pull-Up Progression · Back Thickness ·', '~65 min',
        'WARM-UP — 8 MIN', 'W', 'Band pull-aparts', '3 × 20',
        'BACK', '3', 'Barbell bent-over row', '5 sets × 6-8 reps']),
      /* An index whose movement could not be read leaves the index pending. */
      merged: run(['MONDAY', 'Legs', 'MAIN LIFTS',
        '1', 'Pull-up progression — Stage 2-3', 'max strict reps then band-assist',
        '2', 'Negative pull-ups', '3 sets × 4 reps']),
      /* Sets stated, reps left to the athlete. */
      openReps: run(['MONDAY', 'Pull', 'MAIN LIFTS',
        '1', 'Barbell bent-over row', '5 sets · go heavy · flat back']),
      /* A circuit warm-up: rounds first, work after. */
      rounds: run(['FRIDAY', 'Arms', 'WARM-UP — 5 MIN',
        'W', 'Arm circles + band pull-aparts', '2 rounds · 30 sec each']),
      /* A per-side count with no "reps" in it. */
      eachSide: run(['THURSDAY', 'Core', 'CORE CIRCUIT',
        '1', 'Dead bug', '10 each side · 2-sec hold']),
      /* And the appendix prose that must NOT become a movement, which is the
         cost of reading "N sets" without a rep count. */
      prose: run(['SATURDAY', 'Pull', 'LADDER',
        'Stage 3', '5-6 strict reps',
        '5 sets of 5 strict, 1 short of failure. Add a rep weekly.'])
    };
  });

  check('a wrapped day summary is not imported as a movement',
    REAL.summary.length === 2 && !REAL.summary.some(i => i.unit === 'min'),
    REAL.summary.map(i => `${i.w} ${i.sets}x${i.reps}${i.unit === 'reps' ? '' : ' ' + i.unit}`).join(' | '));
  check('...so the warm-up is the first thing in the day',
    (REAL.summary[0] || {}).block === 'warmup', JSON.stringify(REAL.summary[0]));
  /* 1 then 2 became "12", and blockFrom reads the first character — which is
     how an arms day filed a barbell curl as a warm-up after "W" merged with
     the "1" of the movement below it. */
  check('an index left pending does not merge into the next one',
    REAL.merged.length >= 1 && REAL.merged[REAL.merged.length - 1].idx === '2',
    REAL.merged.map(i => i.idx).join(','));
  check('a prescription that states sets and leaves the reps open is kept',
    REAL.openReps.length === 1 && REAL.openReps[0].sets === 5,
    JSON.stringify(REAL.openReps[0]));
  check('...with the reps taken from the movement it matched',
    (REAL.openReps[0] || {}).reps > 1, String((REAL.openReps[0] || {}).reps));
  check('a circuit written as rounds keeps both its rounds and its work',
    REAL.rounds.length === 1 && REAL.rounds[0].sets === 2
    && REAL.rounds[0].reps === 30 && REAL.rounds[0].unit === 'sec',
    JSON.stringify(REAL.rounds[0]));
  /* The name is the movement above it, not the unit word the prescription
     line happens to start with. */
  check('...and is not named after the word "rounds"',
    /arm circles/i.test((REAL.rounds[0] || {}).w || ''), (REAL.rounds[0] || {}).w);
  check('a per-side count is read as work', REAL.eachSide.length === 1
    && REAL.eachSide[0].reps === 10, JSON.stringify(REAL.eachSide[0]));
  check('and a paragraph about sets is still not a movement',
    REAL.prose.length === 0, JSON.stringify(REAL.prose));

  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

} finally {
  await browser.close();
  server.close();
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\nfailures:');
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
