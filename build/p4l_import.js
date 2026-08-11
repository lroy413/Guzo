/* ============================================================
   IMPORT — turning a written plan into routines
   ------------------------------------------------------------
   You have a plan. It is a PDF a coach sent you, or a note you typed, or
   something a chat window produced. Retyping twenty-five movements into a
   builder is the reason it never makes it into the app.

   Three jobs, kept apart on purpose so each can be wrong on its own:

     1. get text out of the file            docText / pdfText
     2. find the structure in the text      parsePlan
     3. match the movements to the catalogue  matchExercise

   None of them writes anything. `parsePlan` returns a proposal and the review
   sheet is what turns it into routines, because a parser that silently creates
   twenty-five exercises is a parser you cannot trust and cannot correct. Every
   line the app is unsure about is shown as unsure.

   No library, and no network. PDF text extraction is ASCII85 + inflate +
   walking the content stream, all of which the platform already does:
   DecompressionStream is a Web API. Bringing in a PDF library would mean the
   first external request this app has ever made, and it would still not work
   offline, which is the whole product.
   ============================================================ */

/* ---------- byte helpers ---------- */
/* latin1 rather than utf-8: a PDF body is bytes, and decoding it as utf-8
   mangles any byte above 0x7F into a replacement character — including the
   bytes of the compressed streams we are about to inflate. */
function latin1(bytes) {
  let s = '';
  const CH = 8192;   // chunked, or a large file blows the argument limit
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return s;
}

/* ASCII85, as PDF spec 7.4.3 defines it. 'z' is four zero bytes; a partial
   final group is padded with 'u' and loses the padding bytes. */
function ascii85(bytes) {
  const out = [];
  let t = 0, n = 0;
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 0x7E) break;                      // '~' begins the ~> terminator
    if (c === 0x7A && n === 0) { out.push(0, 0, 0, 0); continue; }   // 'z'
    const v = c - 33;
    if (v < 0 || v > 84) continue;              // whitespace and anything else
    t = t * 85 + v; n++;
    if (n === 5) {
      out.push((t / 16777216) & 255, (t / 65536) & 255, (t / 256) & 255, t & 255);
      t = 0; n = 0;
    }
  }
  if (n > 1) {
    for (let i = n; i < 5; i++) t = t * 85 + 84;
    const b = [(t / 16777216) & 255, (t / 65536) & 255, (t / 256) & 255, t & 255];
    for (let i = 0; i < n - 1; i++) out.push(b[i]);
  }
  return new Uint8Array(out);
}

/* FlateDecode. PDF writes zlib-wrapped deflate, but enough producers emit raw
   deflate that trying both is worth the second attempt. Returns null rather
   than throwing: one unreadable stream in a document should cost that stream,
   not the import. */
async function inflate(bytes) {
  for (const fmt of ['deflate', 'deflate-raw']) {
    try {
      if (typeof DecompressionStream !== 'function') return null;
      const ds = new DecompressionStream(fmt);
      const stream = new Blob([bytes]).stream().pipeThrough(ds);
      const buf = await new Response(stream).arrayBuffer();
      return new Uint8Array(buf);
    } catch (e) { /* try the other framing */ }
  }
  return null;
}

/* ---------- PDF content streams ---------- */
/* A string as written in a content stream: (like this), with backslash escapes
   and octal codes. */
function pdfLiteral(raw) {
  let s = '';
  for (let i = 1; i < raw.length - 1; i++) {
    const c = raw[i];
    if (c !== '\\') { s += c; continue; }
    const n = raw[++i];
    if (n === 'n') s += '\n';
    else if (n === 'r') s += '\r';
    else if (n === 't') s += '\t';
    else if (n === 'b' || n === 'f') s += ' ';
    else if (n >= '0' && n <= '7') {
      let oct = n;
      while (oct.length < 3 && raw[i + 1] >= '0' && raw[i + 1] <= '7') oct += raw[++i];
      s += String.fromCharCode(parseInt(oct, 8));
    } else s += n;
  }
  return s;
}

function pdfHex(raw) {
  const h = raw.slice(1, -1).replace(/[^0-9A-Fa-f]/g, '');
  let s = '';
  for (let i = 0; i + 1 < h.length; i += 2) s += String.fromCharCode(parseInt(h.substr(i, 2), 16));
  return s;
}

/* Text out of one content stream, as lines.
   ------------------------------------------------------------
   Concatenating every string in document order does not work. A styled heading
   is emitted as several separate show operations — the plan this was written
   against produces "TUESDA", "Y — OFF", "WORK" as three of them — so joining
   them naively gives you broken words and joining them with spaces gives you
   broken words with gaps in.

   What actually separates lines is the text position, so this tracks it: Tm
   sets it absolutely, Td and TD move relative to the line start, T* and the
   quote operators advance by the leading. A change in y flushes the line.

   Deliberately not a PDF renderer. It ignores fonts, encodings beyond the
   standard byte range, clipping, and column layout, all of which matter for
   faithful reproduction and none of which matter for finding "4 sets × 12
   reps" in a document. */
function contentLines(content) {
  const lines = [];
  let parts = [], y = null, leading = 0, nums = [], inArray = false;

  const flush = () => {
    const t = parts.join('').replace(/[ \t]+/g, ' ').trim();
    if (t) lines.push(t);
    parts = [];
  };
  const moveTo = (ny) => {
    if (y === null) { y = ny; return; }
    /* A hair of tolerance: superscripts and inline styling nudge the baseline
       without starting a new line. */
    if (Math.abs(ny - y) > 0.75) { flush(); y = ny; }
  };

  const tok = /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]*>|\[|\]|[-+]?[0-9]*\.?[0-9]+|[A-Za-z*'"]+/g;
  let m;
  while ((m = tok.exec(content))) {
    const t = m[0];
    if (t === '[') { inArray = true; continue; }
    if (t === ']') { inArray = false; continue; }
    if (t.charAt(0) === '(') { parts.push(pdfLiteral(t)); continue; }
    if (t.charAt(0) === '<') { parts.push(pdfHex(t)); continue; }
    if (/^[-+]?[0-9]*\.?[0-9]+$/.test(t)) {
      /* Inside a TJ array a number is kerning, not a coordinate. A large
         negative one is how most producers write a space. */
      if (inArray) { if (parseFloat(t) < -120) parts.push(' '); }
      else nums.push(parseFloat(t));
      continue;
    }
    switch (t) {
      case 'Tm': if (nums.length >= 6) moveTo(nums[nums.length - 1]); break;
      case 'Td': if (nums.length >= 2) moveTo((y || 0) + nums[nums.length - 1]); break;
      case 'TD':
        if (nums.length >= 2) { leading = -nums[nums.length - 1]; moveTo((y || 0) + nums[nums.length - 1]); }
        break;
      case 'TL': if (nums.length) leading = nums[nums.length - 1]; break;
      /* T*, ' and " all begin a new line by the current leading. Without this
         a wrapped paragraph arrives as one line with its words run together —
         "supersets increase density andcalorie burn". */
      case 'T*': case "'": case '"':
        moveTo((y === null ? 0 : y) - (leading || 12));
        break;
      case 'BT': y = null; flush(); break;
      case 'ET': flush(); break;
      default: break;
    }
    nums = [];
  }
  flush();
  return lines;
}

/* Every text-bearing stream in the file, in document order. */
async function pdfText(buffer) {
  const bytes = new Uint8Array(buffer);
  const s = latin1(bytes);
  const lines = [];
  let i = 0, guard = 0;
  while (guard++ < 4000) {
    const st = s.indexOf('stream', i);
    if (st < 0) break;
    /* The stream's own dictionary sits immediately before it and says how it
       is encoded. Reading the filter from there rather than guessing means an
       image stream is skipped instead of being fed to the inflater. */
    const dictAt = s.lastIndexOf('<<', st);
    const dict = dictAt >= 0 ? s.slice(dictAt, st) : '';
    let p = st + 6;
    if (s.charAt(p) === '\r') p++;
    if (s.charAt(p) === '\n') p++;
    const en = s.indexOf('endstream', p);
    if (en < 0) break;
    i = en + 9;

    if (/\/(DCTDecode|JPXDecode|CCITTFaxDecode|LZWDecode|RunLengthDecode|JBIG2Decode)/.test(dict)) continue;
    let data = bytes.subarray(p, en);
    if (/ASCII85Decode/.test(dict)) data = ascii85(data);
    if (/FlateDecode/.test(dict)) {
      data = await inflate(data);
      if (!data) continue;
    }
    const txt = latin1(data);
    /* A content stream is the only kind we want, and it always shows text. */
    if (!/(^|[^A-Za-z])(Tj|TJ)([^A-Za-z]|$)/.test(txt)) continue;
    const got = contentLines(txt);
    for (let k = 0; k < got.length; k++) lines.push(got[k]);
  }
  return lines;
}

/* WinAnsiEncoding, 0x80–0x9F.
   ------------------------------------------------------------
   This is the one place PDF's default text encoding and latin1 disagree: latin1
   has control codes in that range and WinAnsi has the punctuation everyone
   actually uses. Reading the bytes as latin1 and stopping there loses every em
   dash, en dash, curly quote and bullet in the document — which in a training
   plan means "5 sets × 5–6 reps" arrives as "5 sets × 56 reps", a rep range
   silently turned into fifty-six.

   Everything from 0xA0 up already agrees, so · (0xB7) and × (0xD7) need no
   translation. */
const WINANSI_HIGH = {
  0x80:'€', 0x82:'‚', 0x83:'ƒ', 0x84:'„', 0x85:'…',
  0x86:'†', 0x87:'‡', 0x88:'ˆ', 0x89:'‰', 0x8A:'Š',
  0x8B:'‹', 0x8C:'Œ', 0x8E:'Ž', 0x91:'‘', 0x92:'’',
  0x93:'“', 0x94:'”', 0x95:'•', 0x96:'–', 0x97:'—',
  0x98:'˜', 0x99:'™', 0x9A:'š', 0x9B:'›', 0x9C:'œ',
  0x9E:'ž', 0x9F:'Ÿ'
};

/* Then flattened to the handful of shapes the parser and matcher look for, so
   neither has to know that six different characters all mean "times". */
function normPdfChars(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += (c >= 0x80 && c <= 0x9F && WINANSI_HIGH[c]) ? WINANSI_HIGH[c] : s.charAt(i);
  }
  return out
    /* An en dash is a range — "5–6 reps" — and an em dash is a separator.
       Collapsing them together turns a rep range into the number fifty-six, so
       the range one becomes a plain hyphen and the separator stays a dash. */
    .replace(/[–‒]/g, '-')
    .replace(/[—―]/g, '—')
    .replace(/[•·‧●▪]/g, '·')           // any bullet → middle dot
    .replace(/[×✕✖⨯]/g, '×')                 // any cross → ×
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, ' ');
}

/* ---------- one entry point for any file ---------- */
/* Returns lines, never a blob of text: everything downstream reasons about
   lines, and a PDF has no newlines to recover them from afterwards. */
async function docLines(file) {
  const name = (file.name || '').toLowerCase();
  if (/\.pdf$/.test(name) || file.type === 'application/pdf') {
    const buf = await file.arrayBuffer();
    return (await pdfText(buf)).map(normPdfChars);
  }
  const text = await file.text();
  return normPdfChars(text).split(/\r?\n/);
}

/* ============================================================
   MATCHING A WRITTEN NAME TO THE CATALOGUE
   ------------------------------------------------------------
   "Barbell back squat" is Back Squat. "DB seated overhead press" is Dumbbell
   Shoulder Press. "Cable tricep pushdown (rope)" is Tricep Pushdown. Nobody
   writes a plan using this app's names, and asking them to is the same as
   asking them to retype it.

   Scored rather than looked up, and the score comes back with the match so the
   review sheet can show a weak one as weak. A confident guess presented as a
   fact is how you end up with a squat day full of leg extensions.
   ============================================================ */

/* Written shorthand → what it means. Applied to whole words only, so "bb"
   becomes barbell and "abs" is left alone. */
const NAME_ABBR = {
  db:'dumbbell', dbs:'dumbbell', bb:'barbell', kb:'kettlebell', kbs:'kettlebell',
  bw:'bodyweight', ohp:'overhead press', rdl:'romanian deadlift',
  sldl:'stiff leg deadlift', bor:'barbell row', ohe:'overhead extension',
  tri:'tricep', tris:'tricep', bi:'bicep', bis:'bicep', quad:'quads',
  ham:'hamstring', hams:'hamstring', lat:'lat', lats:'lat', delt:'delt',
  pushup:'push up', pushups:'push up', pullup:'pull up', pullups:'pull up',
  chinup:'chin up', situp:'sit up', dips:'dip', rows:'row', curls:'curl',
  raises:'raise', presses:'press', squats:'squat', extensions:'extension',
  crunches:'crunch', lunges:'lunge', deadlifts:'deadlift'
};

/* Words that say nothing about which movement it is. "machine" and "weighted"
   describe how, not what; "seated" and "standing" deliberately are NOT here,
   because a seated calf raise and a standing one are different exercises. */
const NAME_STOP = new Set(['the','a','an','and','or','with','to','of','for','on',
  'in','at','your','machine','weighted','light','heavy','slow','strict','regular',
  'variation','style','grip','tempo','sec','second','seconds','min','reps','rep',
  'set','sets','each','side','sides','per','x']);

/* Equipment words, and the catalogue field they correspond to. Naming the
   wrong kit is a strong signal you have the wrong movement — a dumbbell bench
   press is not a barbell bench press. */
const EQ_WORDS = { barbell:'barbell', dumbbell:'dumbbell', kettlebell:'kettlebell',
  cable:'cable', machine:'machine', bodyweight:'bodyweight', band:'band',
  smith:'machine', ez:'barbell' };

function normName(s) {
  let t = String(s || '').toLowerCase();
  /* Everything after a dash is how to do it, not what it is: "Leg curl — 3-sec
     eccentric", "Cable lateral raise — single arm". */
  t = t.split(/\s*—\s*/)[0];
  /* "Stationary bike or incline treadmill walk" — take the first offer. */
  t = t.split(/\s+or\s+/)[0];
  t = t.replace(/\([^)]*\)/g, ' ');
  t = t.replace(/[^a-z0-9+ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const words = [];
  t.split(' ').forEach(w => {
    if (!w) return;
    const ex = NAME_ABBR[w];
    if (ex) { ex.split(' ').forEach(x => words.push(x)); return; }
    words.push(w);
  });
  return words.join(' ');
}

function nameTokens(s) {
  return normName(s).split(' ').filter(w => w && !NAME_STOP.has(w));
}

/* One candidate's score against one written name, 0 to about 1.3. */
function nameScore(qTokens, qFlat, ex) {
  const cTokens = nameTokens(ex.name);
  if (!cTokens.length || !qTokens.length) return 0;
  let hit = 0;
  for (let i = 0; i < cTokens.length; i++) if (qTokens.indexOf(cTokens[i]) >= 0) hit++;
  if (!hit) return 0;
  /* Weighted toward covering the catalogue name rather than the written one:
     the written name is usually longer, carrying kit, tempo and body part, and
     penalising it for that would rank the vaguest catalogue entry highest. */
  let score = 0.62 * (hit / cTokens.length) + 0.38 * (hit / qTokens.length);

  /* Spacing is not a difference: "wood chop" is "woodchop". */
  const cFlat = normName(ex.name).replace(/ /g, '');
  if (qFlat.indexOf(cFlat) >= 0) {
    score += 0.3;
    /* And a nudge for covering more of it. "Close-grip bench press" contains
       both "Close-Grip Bench" and "Bench Press", which otherwise score exactly
       the same and the tie goes to whichever is earlier in the catalogue —
       which is how a close-grip press became an ordinary bench press. */
    score += 0.15 * Math.min(1, cFlat.length / Math.max(1, qFlat.length));
  }

  /* Kit named in the plan, checked against the kit in the catalogue. */
  const eq = (ex.eq || '').toLowerCase();
  let namedEq = null;
  for (let i = 0; i < qTokens.length; i++) {
    if (EQ_WORDS[qTokens[i]]) { namedEq = EQ_WORDS[qTokens[i]]; break; }
  }
  if (namedEq) {
    if (eq.indexOf(namedEq) >= 0) score += 0.12;
    /* Only a mismatch between two things that are actually kit. An exercise
       with no equipment field to speak of is not contradicted by anything. */
    else if (eq && eq !== 'none' && EQ_WORDS[eq]) score -= 0.22;
  }
  return score;
}

/* The best match, and how sure it is.
   confident  — use it
   unsure     — offer it, but say so
   null       — ask */
function matchExercise(written) {
  const qTokens = nameTokens(written);
  const qFlat = normName(written).replace(/ /g, '');
  if (!qTokens.length) return null;
  let best = null, second = 0, secondEx = null;
  for (let i = 0; i < EXLIST.length; i++) {
    const sc = nameScore(qTokens, qFlat, EXLIST[i]);
    if (!best || sc > best.score) {
      if (best) { second = best.score; secondEx = best.ex; }
      best = { ex: EXLIST[i], score: sc };
    } else if (sc > second) { second = sc; secondEx = EXLIST[i]; }
  }
  if (!best || best.score < 0.42) return null;
  /* A clear winner is worth more than a high score. Two catalogue entries
     scoring the same means the plan did not say enough to choose between
     them, whatever the number says. */
  const clear = best.score - second;
  const confident = best.score >= 0.72 && clear >= 0.06;
  /* Why it is unsure, in the terms the doubt actually arose in: either
     something else scored almost as well, or nothing scored well. "Check this"
     with no reason attached is just an instruction to worry. */
  const why = confident ? '' :
    (clear < 0.06 && secondEx
      ? 'Could also be ' + secondEx.name
      : 'Only a rough match for what your plan said');
  return { exId: best.ex.id, name: best.ex.name, score: Math.round(best.score * 100) / 100,
           confident: confident, why: why };
}

/* ============================================================
   FINDING THE STRUCTURE
   ------------------------------------------------------------
   Written plans do not share a format, so this does not assume one. It reads a
   stream of lines looking for three things: a line that starts a day, a line
   that prescribes work, and the name attached to it. Everything else is
   furniture and is skipped.

   The prescription is the anchor, because it is the one part of a training
   plan that is written the same way everywhere — some number of sets, some
   number of reps or seconds. The name is whatever readable line came last
   before it. That works for "Bench Press / 5 sets × 5 reps" laid out over two
   lines in a PDF table, and for "Bench Press 5x5" typed in a note, without
   either format being special-cased.
   ============================================================ */

/* Matched as a prefix, without a word boundary: a PDF splits a styled heading
   wherever it likes, and this document emits "TUESDA" / "Y — OFF" / "WORK" as
   three separate lines. Guarded by a length limit and by the line being a
   heading rather than prose, so "Front Raise" is never read as Friday. */
const DAYNAME_RE = /^(mon|tues|tue|wednes|wedne|wed|thurs|thur|thu|fri|satur|sat|sun)/i;
const DAY_FULL = { mon:'Monday', tue:'Tuesday', tues:'Tuesday', wed:'Wednesday',
  wednes:'Wednesday', wedne:'Wednesday', thu:'Thursday', thur:'Thursday',
  thurs:'Thursday', fri:'Friday', sat:'Saturday', satur:'Saturday', sun:'Sunday' };
/* "TUESDA" is Tuesday. The PDF cut the word in half and the routine should not
   be called that for the rest of its life. */
function dayLabel(line) {
  const m = String(line).trim().match(DAYNAME_RE);
  if (!m) return String(line).trim();
  const k = m[1].toLowerCase();
  const full = DAY_FULL[k] || DAY_FULL[k.slice(0, 3)];
  return full || String(line).trim();
}
function isDayLine(line) {
  const t = line.trim();
  if (t.length > 26 || !DAYNAME_RE.test(t)) return false;
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (!letters) return false;
  /* Either shouted, or written out in full as a weekday. */
  return letters === letters.toUpperCase() || /day\b/i.test(t);
}
/* "Rest: 2-3 min compounds", "Session note: ..." — prose about the session,
   carrying numbers that look exactly like a prescription. */
const PROSE_RE = /^(rest|note|notes|session note|cut note|approach|cut approach|tip|tips|coach|progression)\s*:/i;
/* The same labels arriving mid-line, which is where a wrap puts them: a
   paragraph broken after "for size." leaves "size. Rest: 90 sec" as its own
   line, and only the second half looks like prose. */
const PROSE_MID_RE = /\b(rest|note|tempo|progression)\s*:/i;
/* Words a plan uses to tag a movement rather than name one. */
const TAG_WORDS = new Set(['priority','cut','core','mobility','unilateral','arms',
  'endurance','heavy','optional','superset','circuit','amrap','warmup','warm-up',
  'finisher','strength','hypertrophy','notes','note','rest']);

function isFurniture(line) {
  const t = line.trim();
  if (!t) return true;
  if (/^page\s*\d+/i.test(t)) return true;
  if (/^\d+\s*$/.test(t) && t.length > 2) return true;          // a bare page number
  if (/^[-–—_=·•\s]+$/.test(t)) return true;                     // a rule
  return false;
}

/* A short line that is only an index or a superset letter: "1", "W", "C", "A".
   These arrive as their own lines out of a PDF table and mean something, so
   they are collected rather than dropped. */
function indexFragment(line) {
  const t = line.trim();
  if (t.length > 3) return null;
  return /^([A-Fa-f]|\d{1,2}|[A-Fa-f]\d{1,2}|\d{1,2}[A-Fa-f])$/.test(t) ? t.toUpperCase() : null;
}

function isTagLine(line) {
  const t = line.trim().toLowerCase().replace(/[^a-z- ]/g, '').trim();
  if (!t || t.split(/\s+/).length > 2) return false;
  return t.split(/\s+/).every(w => TAG_WORDS.has(w));
}

/* Mostly capitals and no prescription in it: a section heading. */
function isSectionHeader(line) {
  const t = line.trim();
  if (t.length < 3 || t.length > 60) return false;
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3) return false;
  const caps = t.replace(/[^A-Z]/g, '').length;
  return caps / letters.length > 0.8;
}

/* What a plan prescribes, in the shapes plans write it.
   "5 sets × 5-6 reps", "4 × 12", "2 × 30 sec each side", "8 min", "3x8".
   A rep range takes its low end, matching how the app seeds a working target
   from the catalogue — the top of the range is what you work toward. */
function parsePrescription(line) {
  const t = line.replace(/\s+/g, ' ').trim();
  let m;

  m = t.match(/(\d{1,2})\s*(?:sets?\s*)?[×x*]\s*(\d{1,3})(?:\s*[-to]+\s*(\d{1,3}))?\s*(reps?|secs?|seconds?|mins?|minutes?)?/i);
  if (m) {
    const unitWord = (m[4] || '').toLowerCase();
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 14).toLowerCase();
    let unit = 'reps';
    if (/^sec|^second/.test(unitWord) || /^\s*sec/.test(after)) unit = 'sec';
    else if (/^min/.test(unitWord) || /^\s*min/.test(after)) unit = 'min';
    return { sets: +m[1], reps: +m[2], unit: unit, range: m[3] ? +m[3] : null };
  }

  /* A single set, written as just the work: "10 reps each side", "20 reps ·
     slow tempo", "45 sec · squeeze glutes". Circuits are written this way
     because the rounds are stated once at the top rather than per movement. */
  m = t.match(/^(\d{1,3})\s*(reps?)\b/i);
  if (m) return { sets: 1, reps: +m[1], unit: 'reps', range: null };

  /* A finisher is usually just a duration: "8 min · 60-65% max HR". */
  m = t.match(/^(?:\D{0,12})?(\d{1,3})\s*(mins?|minutes?)\b/i);
  if (m) return { sets: 1, reps: +m[1], unit: 'min', range: null };

  m = t.match(/^(?:\D{0,12})?(\d{1,3})\s*(secs?|seconds?)\b/i);
  if (m) return { sets: 1, reps: +m[1], unit: 'sec', range: null };

  return null;
}

/* Which part of a session a movement belongs to, from the index letter the
   plan gave it or the heading above it. */
function blockFrom(idx, heading) {
  const i = (idx || '').toUpperCase();
  if (i.charAt(0) === 'W') return 'warmup';
  if (i.charAt(0) === 'C') return 'core';
  if (i.charAt(0) === 'F') return 'finisher';
  const h = (heading || '').toUpperCase();
  if (/WARM|MOBILITY/.test(h)) return 'warmup';
  if (/CORE|ABS/.test(h)) return 'core';
  if (/FINISH|CARDIO|LISS|CONDITION/.test(h)) return 'finisher';
  if (/MAIN|STRENGTH|COMPOUND/.test(h)) return 'main';
  return 'accessory';
}

function parsePlan(lines) {
  const days = [];
  let day = null, heading = '', idx = '', nameLine = '', awaitTitle = false, inProse = false, sinceDay = 99;

  const startDay = (label) => {
    /* Two day headings in a row with nothing between them are one session
       written for two days — this plan heads its home circuit "THU + SUN —
       HOME CORE CIRCUIT". Starting a second day there orphans the first as an
       empty one and loses half the label. */
    /* Capped at two, and only when what is already open is itself a weekday.
       A document that opens with a seven-day calendar would otherwise fold the
       entire week into one label — and "LA FITNESS + HOME" is a banner, not a
       day that Monday belongs to. */
    const dayWords = t => (String(t).match(DAYNAME_RE) ? 1 : 0) +
      (String(t).split(/\s+/).filter(w => DAYNAME_RE.test(w)).length);
    if (day && !day.items.length && day.name && label && sinceDay <= 2 &&
        isDayLine(day.name) && isDayLine(label) && dayWords(day.name) <= 2) {
      day.name = (day.name + ' ' + label).replace(/\s*[—·|:+]+\s*$/, '').replace(/\s+/g, ' ').trim();
      awaitTitle = true; sinceDay = 0;
      return;
    }
    day = { name: label, title: '', items: [] };
    days.push(day);
    heading = ''; idx = ''; nameLine = ''; awaitTitle = true; inProse = false; sinceDay = 0;
  };

  for (let n = 0; n < lines.length; n++) {
    const line = (lines[n] || '').replace(/\s+/g, ' ').trim();
    if (isFurniture(line)) continue;
    /* Adjacency is what makes two day headings one session. A weekday left
       open by a calendar table at the top of the document is sixteen lines
       away from the first real one and has nothing to do with it. */
    sinceDay++;

    /* Prose about the session, not the session. Skipped before anything reads
       numbers out of it — "Rest: 2-3 min compounds · 60 sec supersets" parses
       as a prescription otherwise, and invents a movement called "compounds". */
    if (PROSE_RE.test(line) || PROSE_MID_RE.test(line)) { inProse = true; idx = ''; nameLine = ''; continue; }
    /* And it keeps going over a line wrap. "Rest: 2-3 min compounds · 60 sec
       supersets." breaks after "and", and the tail parses as a movement called
       "compounds" doing one set of sixty seconds. Prose runs until something
       structural starts again. */
    if (inProse) {
      if (isSectionHeader(line) || isDayLine(line) || indexFragment(line)) inProse = false;
      else continue;
    }

    /* A heading is checked before a prescription, because "WARM-UP — 10 MIN"
       and "FINISHER — 8 MIN LISS" both read as work otherwise. Nothing that
       prescribes real work is written in capitals. */
    if (isSectionHeader(line) && !isDayLine(line)) {
      heading = line;
      awaitTitle = false;
      if (!day && !/WARM|MAIN|CORE|FINISH|SUPERSET|CIRCUIT|REST|NOTE|PAGE/.test(line.toUpperCase())) {
        startDay(line); heading = '';
      }
      continue;
    }

    const presc = parsePrescription(line);

    /* A day header, but never one that also prescribes work — "Monday 3 × 10"
       is a movement on an already-open day, not a new one. */
    if (!presc && (isDayLine(line) || /^day\s*\d+\b/i.test(line))) {
      startDay(isDayLine(line) ? dayLabel(line) : line.replace(/[—·|:]+\s*$/, '').trim());
      continue;
    }

    if (presc) {
      /* The name is whatever sits in FRONT of the numbers on this line, and if
         nothing does, it was the last readable line before them. Taking the
         line up to the first separator instead reads "5 sets × 5-6 reps" as a
         movement called "5 sets × 5-6 reps", which is what it did first. */
      const at = line.match(/(\d{1,2}\s*(?:sets?\s*)?[×x*]\s*\d|\b\d{1,3}\s*(?:mins?|secs?|minutes?|seconds?)\b)/i);
      const head = at ? line.slice(0, at.index) : '';
      const clean = head.replace(/^[\d\s.)\]:\-—·]+/, '').replace(/[\s:\-—·]+$/, '').trim();
      /* Three letters minimum. A stray "+" or "&" left over by a line break is
         not a movement, and matching it against the catalogue produces
         confident nonsense. */
      const usable = t => t && t.replace(/[^A-Za-z]/g, '').length >= 3 && !indexFragment(t);
      const written = usable(clean) ? clean : (usable(nameLine) ? nameLine : '');
      /* "Quads · Hamstrings · Glutes · Calves ·" followed by "~75 min" is the
         day's summary, not a movement lasting seventy-five minutes. A list of
         body parts is never one exercise. */
      /* A row of body parts, not a movement. Every part has to be short for
         this to fire: a real cue line is prose and would otherwise be thrown
         away along with the movement it belongs to. */
      const parts = written.split('·').map(x => x.trim()).filter(Boolean);
      if (!written || (parts.length >= 3 && parts.every(x => x.split(/\s+/).length <= 2))) {
        idx = ''; nameLine = ''; continue;
      }
      if (!day) startDay('Imported');

      const block = blockFrom(idx, heading);
      day.items.push({
        written: written.trim(),
        sets: Math.min(ROUTINE_LIMITS.sets, Math.max(1, presc.sets)),
        reps: Math.min(ROUTINE_LIMITS.reps, Math.max(1, presc.reps)),
        unit: presc.unit,
        block: block,
        /* The plan's own notation for a pair: 4A runs into 4B. Read off the
           index rather than off the SUPERSET heading, because the heading is
           prose and the index is structure. */
        sup: /A$/.test(idx) ? 'A' : (/B$/.test(idx) ? 'B' : null),
        idx: idx,
        note: line.trim(),
        match: matchExercise(written)
      });
      idx = ''; nameLine = '';
      continue;
    }

    const frag = indexFragment(line);
    if (frag) { idx = (idx + frag).slice(-3); continue; }

    if (isTagLine(line)) continue;

    /* A day heading that the PDF broke into pieces: "TUESDA" opened the day and
       "Y — OFF" and "WORK" are the rest of the same heading, not its subtitle. */
    if (awaitTitle) {
      const letters = line.replace(/[^A-Za-z]/g, '');
      if (line.length <= 12 || (letters && letters === letters.toUpperCase())) continue;
      awaitTitle = false;
    }

    /* A readable line: a candidate name, or the day's subtitle. */
    if (day && !day.title && !day.items.length && line.length < 44 && !nameLine) day.title = line;
    nameLine = line;
  }

  /* A weekday named in a calendar table at the top of a document opens a day
     that never gets anything in it. */
  const real = days.filter(d => d.items.length);
  real.forEach(d => {
    /* The plan writes a pair as 4A then 4B. The app writes it as a link on the
       first of the two, and normaliseSupersets will strip one that ends up
       last — so a pair broken across a day boundary cannot leave a dangling
       link. */
    d.items.forEach((it, i) => {
      const next = d.items[i + 1];
      it.supNext = !!(it.sup === 'A' && next && next.sup === 'B');
    });
  });
  return { days: real,
           found: real.reduce((a, d) => a + d.items.length, 0),
           matched: real.reduce((a, d) => a + d.items.filter(x => x.match).length, 0),
           sure: real.reduce((a, d) => a + d.items.filter(x => x.match && x.match.confident).length, 0) };
}
