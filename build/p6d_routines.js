/* ============================================================
   ROUTINES — interface
   ============================================================ */

/* The strip on Today. Quiet by design: your own routines are an
   option, not a second set of obligations sitting under the first. */
function routineStripHTML() {
  const list = ensureRoutines().filter(r => r.items.length);
  if (!list.length) {
    return `<div class="sec-head"><span class="sec-t">Your routines</span></div>
    <button class="rt-empty" data-act="routines">
      <span class="rt-plus">+</span>
      <span class="grow"><span class="rt-empty-t">Build your own routine</span>
      <span class="rt-empty-b">Abs before bed, a rehab circuit, fifteen minutes of arms in a hotel room</span></span>
    </button>`;
  }
  return `<div class="sec-head"><span class="sec-t">Your routines</span><button class="sec-a" data-act="routines">Manage</button></div>
    <div class="rt-strip">
      ${list.slice(0, 6).map(r => `<button class="rt-chip" data-act="routine-start" data-v="${h(r.id)}">
        <span class="rt-emoji">${h(r.emoji)}</span>
        <span class="rt-chip-t">${h(r.name)}</span>
        <span class="rt-chip-b">${r.items.length} · ${routineMins(r)} min</span>
      </button>`).join('')}
    </div>`;
}

/* Everything logged today, once there is more than one thing. */
function todaySessionsHTML() {
  const list = sessionsOn(today());
  if (list.length < 2) return '';
  return `<div class="sec-head"><span class="sec-t">Logged today</span></div>
    <div class="list mb">
      ${list.map(s => {
        const v = sessionVolume(s);
        return `<div class="lrow">
          <div class="ico">${s.extra ? h((routineById(s.routineId) || {}).emoji || '✓') : '✓'}</div>
          <div class="grow">
            <div class="h3">${h(sessionTitle(s))}</div>
            <div class="tiny mt-s">${v.sets} sets · ${s.dur || 0} min${s.kcal ? ' · ' + s.kcal + ' kcal' : ''}${s.extra ? ' · extra' : ''}</div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

/* ---------- the list ---------- */
function sheetRoutines() {
  const list = ensureRoutines();
  openSheet(`
    <div class="row between mb">
      <h2 class="h1">Your routines</h2>
    </div>
    <p class="small mb">Sessions you build yourself. They sit alongside the week's plan rather than replacing it &mdash; running one never marks a planned day as done.</p>

    ${list.length ? `<div class="list mb">
      ${list.map(r => `<button class="lrow" data-act="routine-edit" data-v="${h(r.id)}" style="width:100%;text-align:left">
        <div class="ico">${h(r.emoji)}</div>
        <div class="grow">
          <div class="h3">${h(r.name)}</div>
          <div class="tiny mt-s">${h(routineSummary(r))}${r.uses ? ' · used ' + r.uses + '×' : ''}</div>
        </div>
        <span class="chev">›</span>
      </button>`).join('')}
    </div>` : `<div class="note mb"><p class="note-t">Nothing built yet.</p><p class="note-b">A routine is just a list of movements you want to be able to start in one tap.</p></div>`}

    <button class="btn primary block lg" data-act="routine-new">New routine</button>
  `);
}

/* ---------- the builder ---------- */
function sheetRoutineEdit(id) {
  const r = routineById(id);
  if (!r) { sheetRoutines(); return; }

  const rows = r.items.map((it, i) => {
    const ex = EX[it.exId];
    if (!ex) return '';
    const timed = itemIsTimed(it);
    const mode = it.mode || defaultMode(it.exId);
    return `<div class="rt-item">
      <div class="row between">
        <div class="grow">
          <div class="h3">${h(ex.name)}</div>
          <div class="tiny mt-s">${h(ex.primary)}${usesPlates(it.exId) ? ' · barbell' : ''}</div>
        </div>
        <span class="rt-pos mono">${i + 1}</span>
      </div>

      ${canRetime(it.exId) ? `<div class="seg sm mt-s">
        <button class="${mode === 'reps' ? 'on' : ''}" data-act="rt-mode" data-v="${h(id)}" data-i="${i}" data-m="reps">Reps</button>
        <button class="${mode === 'time' ? 'on' : ''}" data-act="rt-mode" data-v="${h(id)}" data-i="${i}" data-m="time">Time</button>
      </div>` : ''}

      <div class="rt-nums mt-s">
        ${r.circuit ? '' : `<div class="rt-num">
          <div class="rt-num-k">Sets</div>
          <div class="stepper sm">
            <button data-act="rt-adj" data-v="${h(id)}" data-i="${i}" data-f="sets" data-d="-1">&minus;</button>
            <input type="text" value="${it.sets}" readonly>
            <button data-act="rt-adj" data-v="${h(id)}" data-i="${i}" data-f="sets" data-d="1">+</button>
          </div>
        </div>`}
        <div class="rt-num">
          <div class="rt-num-k">${timed ? (itemLoad(it) === 'min' ? 'Minutes' : 'Seconds') : 'Reps'}</div>
          <div class="stepper sm">
            <button data-act="rt-adj" data-v="${h(id)}" data-i="${i}" data-f="reps" data-d="-1">&minus;</button>
            <input type="text" value="${it.reps}" readonly>
            <button data-act="rt-adj" data-v="${h(id)}" data-i="${i}" data-f="reps" data-d="1">+</button>
          </div>
        </div>
      </div>
      <div class="rt-ctl">
        <button data-act="rt-move" data-v="${h(id)}" data-i="${i}" data-d="-1" aria-label="Move ${h(ex.name)} up"${i === 0 ? ' disabled style="opacity:.35"' : ''}>↑</button>
        <button data-act="rt-move" data-v="${h(id)}" data-i="${i}" data-d="1" aria-label="Move ${h(ex.name)} down"${i === r.items.length - 1 ? ' disabled style="opacity:.35"' : ''}>↓</button>
        <button class="rt-del" data-act="rt-remove" data-v="${h(id)}" data-i="${i}" aria-label="Remove ${h(ex.name)}"><span class="rt-ctl-l">Remove</span></button>
      </div>
    </div>`;
  }).join('');

  openSheet(`
    <div class="row between mb">
      <h2 class="h1">${h(r.name)}</h2>
      <span class="pill">${routineMins(r)} min</span>
    </div>

    <div class="field mb">
      <div class="label">Name</div>
      <input class="input" id="rt-name" value="${h(r.name)}" maxlength="${ROUTINE_LIMITS.name}"
             autocomplete="off" enterkeyhint="done" data-rt-name="${h(id)}">
    </div>

    <div class="rt-emoji-row mb">
      ${ROUTINE_EMOJI.map(e => `<button class="rt-emoji-pick ${r.emoji === e ? 'on' : ''}" data-act="rt-emoji" data-v="${h(id)}" data-e="${e}">${e}</button>`).join('')}
    </div>

    ${r.items.length ? rows : `<div class="note mb"><p class="note-t">Empty so far.</p><p class="note-b">Add the movements you want, in the order you want to do them.</p></div>`}

    <button class="btn ghost block mt" data-act="rt-add" data-v="${h(id)}">+ Add a movement</button>

    <div class="list mt">
      <div class="lrow" data-act="rt-warmup" data-v="${h(id)}">
        <div class="ico">🤸</div>
        <div class="grow">
          <div class="h3">Warm-up first</div>
          <div class="tiny mt-s">${r.warmup
            ? 'One mobility movement in front, picked for what this routine trains'
            : 'Off &mdash; this routine starts on the first movement you listed'}</div>
        </div>
        <div class="switch ${r.warmup ? 'on' : ''}"></div>
      </div>
      <div class="lrow" data-act="rt-circuit" data-v="${h(id)}">
        <div class="ico">🔁</div>
        <div class="grow">
          <div class="h3">Run it as a circuit</div>
          <div class="tiny mt-s">${r.circuit
            ? 'One pass through the list is a round. Rest comes after the round, not between movements.'
            : 'Off &mdash; each movement is finished, with its rest, before the next one'}</div>
        </div>
        <div class="switch ${r.circuit ? 'on' : ''}"></div>
      </div>
    </div>

    ${r.circuit ? `<div class="rt-item mt-s">
      <div class="rt-nums">
        <div class="rt-num">
          <div class="rt-num-k">Rounds</div>
          <div class="stepper sm">
            <button data-act="rt-rounds" data-v="${h(id)}" data-d="-1">&minus;</button>
            <input type="text" value="${r.rounds}" readonly>
            <button data-act="rt-rounds" data-v="${h(id)}" data-d="1">+</button>
          </div>
        </div>
        <div class="rt-num">
          <div class="rt-num-k">Rest between</div>
          <div class="stepper sm">
            <button data-act="rt-rest" data-v="${h(id)}" data-d="-1">&minus;</button>
            <input type="text" value="${r.restRound ? fmtRest(r.restRound) : 'none'}" readonly>
            <button data-act="rt-rest" data-v="${h(id)}" data-d="1">+</button>
          </div>
        </div>
      </div>
      <p class="tiny mt-s">${r.items.length
        ? `${r.items.length} movement${r.items.length === 1 ? '' : 's'} back to back, ${r.rounds} time${r.rounds === 1 ? '' : 's'}${r.restRound ? `, with ${fmtRest(r.restRound)} between rounds` : ', with no rest between rounds'}.`
        : 'Add the movements and they run in the order you list them.'}</p>
    </div>` : ''}
    ${r.items.length ? `<button class="btn primary block lg mt" data-act="routine-start" data-v="${h(id)}">Start it now</button>` : ''}

    <div class="divide"></div>
    <button class="btn quiet block" data-act="rt-delete" data-v="${h(id)}" style="color:var(--rose)">Delete this routine</button>
    <p class="tiny center mt-s">Weights come from what you have been lifting, the same as any other session. Deleting a routine never touches the sessions you did with it.</p>
  `, { key: 'routine:' + id });
}
