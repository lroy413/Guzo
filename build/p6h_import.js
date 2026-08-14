/* ============================================================
   IMPORT — the review, and the only thing that writes
   ------------------------------------------------------------
   The parser proposes; this disposes. Nothing reaches S.routines until it has
   been on screen with the movement the app matched it to shown next to the
   line the document actually said, because an import that quietly creates
   fifty-two exercises is one you cannot check and cannot correct.

   Anything the matcher was not sure about is marked. Anything it could not
   place at all is off by default — an import that silently drops a movement
   and an import that silently invents one are the same bug.
   ============================================================ */

/* Transient by design: a half-reviewed import is not state worth keeping, and
   putting it in S would mean it survived a reload as a half-finished thing
   with no way back to the file. */
let IMPORT = null;

/* Where the movements are going, if not into new routines. Held outside
   IMPORT because it is decided before the file is even chosen. */
let IMPORT_INTO = null;

function routineName(id) {
  const r = id ? routineById(id) : null;
  return r ? r.name : '';
}

function sheetImport(intoId) {
  IMPORT_INTO = intoId || null;
  const into = routineName(IMPORT_INTO);
  openSheet(`
    <div class="row between mb"><h2 class="h1">${into ? 'Add from a file' : 'Import a plan'}</h2></div>
    <p class="small mb">${into
      ? `A PDF or a text file with a written programme in it. Everything you pick is added to
         <strong>${h(into)}</strong>, in the order the document lists it &mdash; nothing already in
         the routine is touched.`
      : `A PDF or a text file with a written programme in it &mdash; the kind a coach sends you,
         or one you wrote yourself. It reads the days, the movements and the sets, matches them to
         movements this app knows, and shows you everything before it builds anything.`}</p>

    <label class="imp-drop" for="imp-file">
      <span class="imp-drop-i">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3"/></svg>
      </span>
      <span class="imp-drop-t">Choose a file</span>
      <span class="imp-drop-b">PDF, text, markdown &middot; up to about 10 MB</span>
    </label>
    <input type="file" id="imp-file" class="hide" accept=".pdf,.txt,.md,.csv,text/plain,application/pdf">

    <div class="note mt">
      <p class="note-t">It never leaves the phone.</p>
      <p class="note-b">The file is read on the device, like everything else here. Nothing is uploaded,
        and this works with the network off.</p>
    </div>
    <p class="tiny center mt">${into
      ? 'Every movement is shown, matched to one this app knows, before anything is added.'
      : 'Each day becomes one of your routines. Nothing is scheduled and nothing already in the app is touched.'}</p>
  `, { key: 'import' });
}

/* Read → parse → review. Failure is reported as what went wrong, because
   "could not read that" is useless when the answer is "it is a scan". */
async function runImport(file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { toast('That file is too big to read here'); return; }
  openSheet(`<div class="center" style="padding:40px 0">
    <div class="h1">Reading it</div>
    <p class="small mt-s">${h(file.name || 'the file')}</p>
    <div class="bar thin mt"><i style="width:40%"></i></div></div>`);
  let lines = [];
  try {
    lines = await docLines(file);
  } catch (e) {
    sheetImportFailed('That file could not be opened.',
      'It may be password-protected, or damaged.');
    return;
  }
  if (!lines.length || !lines.join('').trim()) {
    sheetImportFailed('There is no text in that file.',
      /\.pdf$/i.test(file.name || '')
        ? 'A PDF made by scanning or photographing a page holds pictures of words rather than words. Nothing on the device can read those without sending them somewhere, which this app does not do.'
        : 'The file came back empty.');
    return;
  }
  const plan = parsePlan(lines);
  if (!plan.days.length) {
    sheetImportFailed('No sessions found in there.',
      'It reads lines like "Bench press &mdash; 4 sets × 8 reps", grouped under a day. If your plan is written another way, you can still build it by hand.');
    return;
  }
  IMPORT = {
    name: (file.name || 'Imported plan').replace(/\.[a-z0-9]+$/i, ''),
    days: plan.days.map(d => ({
      label: (d.name + (d.title ? ' — ' + d.title : '')).slice(0, ROUTINE_LIMITS.name),
      on: true,
      items: d.items.slice(0, ROUTINE_LIMITS.items).map(it => ({
        written: it.written,
        exId: it.match ? it.match.exId : null,
        score: it.match ? it.match.score : 0,
        sure: !!(it.match && it.match.confident),
        why: (it.match && it.match.why) || '',
        sets: it.sets, reps: it.reps, unit: it.unit,
        supNext: !!it.supNext,
        /* A movement with nowhere to go starts off. Inventing a squat because
           the line said something squat-ish is worse than leaving it out and
           saying so. */
        on: !!it.match
      }))
    })),
    stats: { found: plan.found, matched: plan.matched, sure: plan.sure }
  };
  sheetImportReview();
}

function sheetImportFailed(title, body) {
  openSheet(`
    <div class="row between mb"><h2 class="h1">${h(title)}</h2></div>
    <p class="small mb">${body}</p>
    <button class="btn primary block lg" data-act="import">Try another file</button>
    <button class="btn quiet block mt-s" data-act="close">Not now</button>
  `);
}

function importCounts() {
  if (!IMPORT) return { days: 0, items: 0, unsure: 0, missing: 0 };
  let days = 0, items = 0, unsure = 0, missing = 0;
  IMPORT.days.forEach(d => {
    const on = d.items.filter(i => i.on && i.exId);
    if (d.on && on.length) { days++; items += on.length; }
    d.items.forEach(i => {
      if (!i.exId) missing++;
      else if (!i.sure && i.on && d.on) unsure++;
    });
  });
  return { days, items, unsure, missing };
}

function sheetImportReview() {
  if (!IMPORT) { sheetImport(); return; }
  const c = importCounts();

  const dayHTML = (d, di) => {
    const live = d.items.filter(i => i.on && i.exId).length;
    return `<div class="imp-day${d.on ? '' : ' off'}">
      <button class="imp-day-h" data-act="imp-day" data-i="${di}" aria-pressed="${d.on ? 'true' : 'false'}">
        <span class="grow">
          <span class="imp-day-t">${h(d.label)}</span>
          <span class="imp-day-b">${live} movement${live === 1 ? '' : 's'}${
            live ? ' · ' + importMins(d) + ' min' : ''}</span>
        </span>
        <span class="switch ${d.on ? 'on' : ''}"></span>
      </button>
      ${d.on ? d.items.map((it, ii) => {
        const ex = it.exId ? EX[it.exId] : null;
        const cls = !it.exId ? 'miss' : (it.sure ? '' : 'unsure');
        return `<div class="imp-item ${cls}${it.on ? '' : ' off'}">
          <button class="imp-tick ${it.on ? 'on' : ''}" data-act="imp-item" data-i="${di}" data-s="${ii}"
            aria-pressed="${it.on ? 'true' : 'false'}"
            aria-label="${it.on ? 'Leave out' : 'Include'} ${h(it.written)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>
          </button>
          <button class="imp-body" data-act="imp-swap" data-i="${di}" data-s="${ii}">
            <span class="imp-name">${ex ? h(ex.name) : 'Not in the catalogue'}</span>
            ${/* The line the document actually said, always. Without it you
                  cannot tell a good match from a confident wrong one. */''}
            <span class="imp-from">${h(it.written)}</span>
            <span class="imp-meta">
              <span class="mono">${it.sets} × ${it.reps}${it.unit === 'reps' ? '' : (it.unit === 'min' ? ' min' : 's')}</span>
              ${it.supNext ? '<span class="imp-tag">runs into the next</span>' : ''}
              ${!it.exId ? '<span class="imp-tag warn">pick one</span>'
                : (!it.sure ? `<span class="imp-tag warn">${h(it.why || 'check this')}</span>` : '')}
            </span>
          </button>
        </div>`;
      }).join('') : ''}
    </div>`;
  };

  openSheet(`
    <div class="row between mb"><h2 class="h1">What it found</h2></div>
    ${IMPORT_INTO ? `<div class="banner soft mb">Adding to <strong>${h(routineName(IMPORT_INTO))}</strong>
      &mdash; every movement you leave ticked, in this order, after what is already in it.</div>` : ''}
    <div class="imp-sum mb">
      <div class="imp-sum-n">${c.days}</div>
      <div class="grow"><div class="imp-sum-t">session${c.days === 1 ? '' : 's'}, ${c.items} movement${c.items === 1 ? '' : 's'}</div>
      <div class="imp-sum-b">${
        c.missing || c.unsure
          ? [c.unsure ? c.unsure + ' worth checking' : '', c.missing ? c.missing + ' not found' : '']
              .filter(Boolean).join(' · ')
          : 'Every movement matched something this app knows'}</div></div>
    </div>
    <p class="small mb">Tap a movement to change what it matched to. Untick anything you do not want.
      ${IMPORT_INTO ? 'Turn off a whole session to leave it out.'
        : 'Everything here becomes one routine per session &mdash; nothing is scheduled.'}</p>

    ${IMPORT.days.map(dayHTML).join('')}

    <button class="btn primary block lg mt" data-act="imp-commit"${c.items ? '' : ' disabled style="opacity:.4"'}>
      ${!c.items ? 'Nothing selected'
        : (IMPORT_INTO ? `Add ${c.items} movement${c.items === 1 ? '' : 's'}`
                       : `Build ${c.days} routine${c.days === 1 ? '' : 's'}`)}</button>
    <button class="btn quiet block mt-s" data-act="import">Choose a different file</button>
    <p class="tiny center mt-s">Weights come from what you have been lifting, the same as any other
      session. ${IMPORT_INTO ? 'What is already in the routine stays where it is.'
        : 'Nothing already in the app is changed.'}</p>
  `, { key: 'import-review' });
}

/* Roughly how long a day will take, using the app's own estimate rather than
   whatever the document claimed. */
function importMins(d) {
  const items = d.items.filter(i => i.on && i.exId);
  if (!items.length) return 0;
  const secs = items.reduce((a, it) => {
    const per = it.unit === 'min' ? it.reps * 60 : (it.unit === 'sec' ? it.reps : it.reps * 3.5);
    return a + it.sets * (per + (it.supNext ? 12 : 55));
  }, 0);
  return Math.max(1, Math.round(secs / 60));
}

/* Everything selected, appended to one routine you already had, in document
   order. A pair whose two halves came from different days can never form,
   because the link is only ever set between neighbours inside one day. */
function commitImportInto(id) {
  const r = routineById(id);
  if (!r) return { made: 0, added: 0, skipped: 0 };
  let added = 0, skipped = 0;
  IMPORT.days.forEach(d => {
    if (!d.on) return;
    const chosen = [];
    d.items.forEach((it, oi) => { if (it.on && it.exId) chosen.push({ it: it, oi: oi }); });
    const base = r.items.length;
    chosen.forEach(c => {
      if (!addToRoutine(r.id, c.it.exId)) { skipped++; return; }
      applyImportItem(r.items[r.items.length - 1], c.it);
      added++;
    });
    chosen.forEach((c, n) => {
      const next = chosen[n + 1];
      const here = r.items[base + n], after = r.items[base + n + 1];
      if (c.it.supNext && next && next.oi === c.oi + 1 && here && after) here.supNext = true;
    });
  });
  normaliseSupersets(r);
  save(true);
  IMPORT = null; IMPORT_INTO = null;
  return { made: added ? 1 : 0, added: added, skipped: skipped, into: r.id };
}

/* Sets, reps and the unit, from the document onto a routine item. Shared, so
   the two commit paths cannot disagree about what an imported movement is. */
function applyImportItem(item, it) {
  if (!item) return;
  /* The block the document stated, carried onto the routine so the session
     built from it opens where the author opened it. Only a stated one:
     blockFrom() returns 'accessory' when it could not tell, and storing that
     would pin a barbell row to Accessories on the strength of a shrug.

     Without this the plan's warm-up became an ordinary movement and Train
     re-derived its block from the catalogue — a band pull-apart is tier 3, so
     an eight-minute warm-up landed in Accessories below four back movements. */
  if (it.block && it.block !== 'accessory') item.block = it.block;
  item.sets = Math.max(1, Math.min(ROUTINE_LIMITS.sets, it.sets));
  /* The document's unit wins over the catalogue's, the same as anywhere else a
     movement can be counted either way — but only where the app allows the
     choice, or a bench press imported as "60 sec" would turn off its own
     progression. */
  if ((it.unit === 'sec' || it.unit === 'min') && canRetime(it.exId)) {
    item.mode = 'time';
    item.reps = Math.max(1, Math.min(ROUTINE_LIMITS.reps, it.unit === 'min' ? it.reps * 60 : it.reps));
    if (itemLoad(item) === 'min') item.reps = Math.max(1, it.unit === 'min' ? it.reps : Math.round(it.reps / 60));
  } else {
    item.mode = 'reps';
    item.reps = Math.max(1, Math.min(ROUTINE_LIMITS.reps, it.reps));
  }
}

/* The only functions here that write. */
function commitImport() {
  if (!IMPORT) return { made: 0, skipped: 0 };
  if (IMPORT_INTO) return commitImportInto(IMPORT_INTO);
  let made = 0, skipped = 0;
  IMPORT.days.forEach(d => {
    /* The original position travels with each kept movement. A superset is a
       link to the movement immediately after it, so it can only survive if
       that exact movement was kept too — filtering first and pairing on the
       filtered list re-forms the link around whatever moved up underneath,
       which is the same silent re-pairing clearLinksAround exists to stop. */
    const chosen = [];
    d.items.forEach((it, oi) => { if (it.on && it.exId) chosen.push({ it: it, oi: oi }); });
    const items = chosen.map(c => c.it);
    if (!d.on || !items.length) return;
    const r = newRoutine(d.label);
    items.forEach(it => {
      if (!addToRoutine(r.id, it.exId)) { skipped++; return; }
      applyImportItem(r.items[r.items.length - 1], it);
    });
    /* Links applied in a second pass, after every movement is in.
       normaliseSupersets strips a link off whatever is currently last — which,
       while the list is still being built, is the movement that just arrived.
       Setting them inline meant every single pair was deleted one item later,
       silently, and the import produced no supersets at all. */
    chosen.forEach((c, n) => {
      const next = chosen[n + 1];
      if (c.it.supNext && next && next.oi === c.oi + 1 && r.items[n] && r.items[n + 1]) {
        r.items[n].supNext = true;
      }
    });
    /* And then strips one left dangling because the second half of a pair was
       unticked in the review. */
    normaliseSupersets(r);
    made++;
  });
  save(true);
  IMPORT = null; IMPORT_INTO = null;
  return { made: made, added: 0, skipped: skipped };
}
