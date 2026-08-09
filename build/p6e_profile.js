/* ============================================================
   PROFILE — the whole picture
   ============================================================ */

function sheetProfile() {
  const comp = profileCompleteness();
  const kg = bodyKg();
  const bw = (S.profile.bodyweight || []).slice(-1)[0];
  const e = energyTargets();
  const age = ageYears();
  const hLabel = heightLabel();
  const imperial = S.profile.units === 'lb';

  openSheet(`
    <div class="row between mb">
      <h2 class="h1">Profile</h2>
      <span class="pill ${comp.done === comp.total ? 'tl' : ''}">${comp.done}/${comp.total}</span>
    </div>
    ${comp.missing.length ? `<p class="small mb">Still missing: ${comp.missing.join(', ')}. Each one makes the plan or the numbers a little less of a guess.</p>`
      : `<p class="small mb">Everything the app can use, it has.</p>`}

    <div class="eyebrow mt-l mb-s">You</div>
    <div class="field mb">
      <div class="label">Name</div>
      <input class="input" id="pf-name" value="${h(S.profile.name || '')}" autocomplete="given-name" enterkeyhint="done">
    </div>

    <div class="pf-grid mb">
      <button class="pf-cell" data-act="pf-height">
        <span class="pf-k">Height</span>
        <span class="pf-v ${hLabel ? '' : 'empty'}">${hLabel || 'Add'}</span>
      </button>
      <button class="pf-cell" data-act="daily">
        <span class="pf-k">Weight</span>
        <span class="pf-v ${bw ? '' : 'empty'}">${bw ? fmtW(bw.w) + ' ' + unit() : 'Add'}</span>
      </button>
      <button class="pf-cell" data-act="pf-age">
        <span class="pf-k">Age</span>
        <span class="pf-v ${age ? '' : 'empty'}">${age || 'Add'}</span>
      </button>
    </div>

    <div class="field mb">
      <div class="label">Sex</div>
      <div class="chip-grid c3">
        ${SEXES.map(x => `<div class="chip ${S.profile.sex === x.k ? 'on' : ''}" data-act="pf-sex" data-v="${x.k}" style="font-size:12.5px">${x.label}</div>`).join('')}
      </div>
      <p class="tiny mt-s">Only used by the resting-energy equation. Nothing else in the app reads it.</p>
    </div>

    <div class="field mb">
      <div class="label">Your day job</div>
      <div class="list">
        ${ACTIVITY.map(x => `<button class="lrow ${S.profile.activity === x.k ? 'on' : ''}" data-act="pf-activity" data-v="${x.k}" style="width:100%;text-align:left">
          <div class="grow"><div class="h3" style="font-size:14.5px">${x.label}</div><div class="tiny mt-s">${x.note}</div></div>
          <span class="small">${S.profile.activity === x.k ? '✓' : ''}</span>
        </button>`).join('')}
      </div>
      <p class="tiny mt-s">Fourteen hours on your feet with a camera is not a sedentary day, whatever the training log says.</p>
    </div>

    ${e ? `<div class="card accent mt-l">
      <div class="eyebrow em">Energy</div>
      ${e.bmr ? `<div class="row between mt-s"><span class="small">Resting rate</span><span class="mono">${e.bmr} kcal</span></div>` : ''}
      ${e.maint ? `<div class="row between mt-s"><span class="small">Maintenance</span><span class="mono">${e.maint} kcal</span></div>` : ''}
      <div class="row between mt-s"><span class="small"><strong>Target</strong></span><span class="mono em">${e.kcal} kcal · ${e.p}g protein</span></div>
      <p class="tiny mt-s">${e.basis === 'from your resting rate'
        ? 'Mifflin-St Jeor, then adjusted for how you spend the day and what you are training for. Accurate to about &plusmn;10% for any one person &mdash; treat it as a starting point and move it based on what the scale actually does over a month.'
        : 'Estimated from bodyweight alone. Add height and age and this gets meaningfully better.'}</p>
    </div>` : `<div class="note mt-l"><p class="note-t">No energy estimate yet.</p><p class="note-b">Add ${bodyGaps().join(', ')} and Guzo can work out your resting rate rather than guessing from weight.</p></div>`}

    <div class="eyebrow mt-l mb-s">Training</div>
    <div class="list mb">
      <button class="lrow" data-act="open-program" style="width:100%;text-align:left">
        <div class="ico">📋</div><div class="grow"><div class="h3">Split</div><div class="tiny mt-s">${h(programOf().label)}</div></div><span class="chev">›</span></button>
      <button class="lrow" data-act="open-envs" style="width:100%;text-align:left">
        <div class="ico">📍</div><div class="grow"><div class="h3">Where you train</div><div class="tiny mt-s">${(S.profile.envs||[]).map(k=>ENVS[k]?ENVS[k].label:k).join(', ') || 'Not set'}</div></div><span class="chev">›</span></button>
      <button class="lrow" data-act="pf-session" style="width:100%;text-align:left">
        <div class="ico">⏱</div><div class="grow"><div class="h3">A normal session</div><div class="tiny mt-s">${S.profile.sessionMins || 60} minutes &mdash; everything scales from this</div></div><span class="chev">›</span></button>
      <button class="lrow" data-act="pf-sleep" style="width:100%;text-align:left">
        <div class="ico">🌙</div><div class="grow"><div class="h3">A normal night</div><div class="tiny mt-s">${S.profile.sleepNorm || 7.5}h &mdash; readiness is scored against this, not against eight</div></div><span class="chev">›</span></button>
    </div>

    <div class="field mb">
      <div class="label">Units</div>
      <div class="chip-grid c2">
        <div class="chip ${S.profile.units==='kg'?'on':''}" data-act="set-units" data-v="kg">Kilograms</div>
        <div class="chip ${S.profile.units==='lb'?'on':''}" data-act="set-units" data-v="lb">Pounds</div>
      </div>
    </div>
    <button class="btn primary block lg" data-act="save-profile">Save</button>
  `);
}

/* ---------- the small editors ---------- */
function sheetHeight() {
  const cm = profileNum('heightCm');
  const imperial = S.profile.units === 'lb';
  const inches = cm ? cm / 2.54 : null;
  openSheet(`
    <h2 class="h1">Height</h2>
    <p class="small mt-s mb">Used for the resting-energy equation. It is the one body measurement that does not change, so it only ever needs entering once.</p>
    ${imperial ? `
      <div class="pf-grid mb">
        <div class="field"><div class="label">Feet</div>
          <input class="input mono" id="pf-ft" type="text" inputmode="numeric" value="${inches ? Math.floor(inches/12) : ''}" placeholder="5"></div>
        <div class="field"><div class="label">Inches</div>
          <input class="input mono" id="pf-in" type="text" inputmode="numeric" value="${inches ? Math.round(inches - Math.floor(inches/12)*12) : ''}" placeholder="10"></div>
      </div>` : `
      <div class="field mb"><div class="label">Centimetres</div>
        <input class="input mono" id="pf-cm" type="text" inputmode="decimal" value="${cm || ''}" placeholder="178"></div>`}
    <button class="btn primary block lg" data-act="pf-height-save">Save</button>
  `);
  setTimeout(() => { const el = document.getElementById(imperial ? 'pf-ft' : 'pf-cm'); if (el) el.focus(); }, 260);
}

function sheetAge() {
  const y = profileNum('birthYear');
  const now = new Date().getFullYear();
  openSheet(`
    <h2 class="h1">Year of birth</h2>
    <p class="small mt-s mb">Resting energy falls with age &mdash; roughly 5 kcal a day per year in the equation. Without it the estimate drifts by a couple of hundred calories.</p>
    <div class="field mb"><div class="label">Year</div>
      <input class="input mono" id="pf-year" type="text" inputmode="numeric" maxlength="4" value="${y || ''}" placeholder="${now - 32}"></div>
    <button class="btn primary block lg" data-act="pf-age-save">Save</button>
  `);
  setTimeout(() => { const el = document.getElementById('pf-year'); if (el) el.focus(); }, 260);
}

function sheetSessionMins() {
  const m = S.profile.sessionMins || 60;
  openSheet(`
    <h2 class="h1">A normal session</h2>
    <p class="small mt-s mb">Every other size is worked out from this one. Set it to what an ordinary day actually looks like, not what a good week looks like.</p>
    <div class="field mb">
      <div class="row between"><div class="label">Minutes</div><div class="tiny mono">${m}</div></div>
      <div class="stepper">
        <button data-act="pf-session-adj" data-v="-5">&minus;</button>
        <input type="text" value="${m}" readonly>
        <button data-act="pf-session-adj" data-v="5">+</button>
      </div>
    </div>
  `);
}

function sheetSleepNorm() {
  const n = S.profile.sleepNorm || 7.5;
  openSheet(`
    <h2 class="h1">A normal night</h2>
    <p class="small mt-s mb">Readiness is scored against your normal, not against a textbook eight hours. Six is a catastrophe for one person and an ordinary Tuesday for another.</p>
    <div class="field mb">
      <div class="row between"><div class="label">Hours</div><div class="tiny mono">${n}h</div></div>
      <div class="stepper">
        <button data-act="pf-sleep-adj" data-v="-0.5">&minus;</button>
        <input type="text" value="${n}" readonly>
        <button data-act="pf-sleep-adj" data-v="0.5">+</button>
      </div>
    </div>
  `);
}
