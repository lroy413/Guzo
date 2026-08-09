/* dupes.mjs — duplicate top-level declarations across the part files.
   Runs inside build.sh; also runnable on its own.

   Why this exists. The app is a `cat` of ~25 files into ONE global script
   scope. Declaring the same top-level name in two parts is legal JavaScript
   and produces no warning at build time and no error at runtime — the file
   that loads later simply wins, for the whole application.

   That is not a theoretical hazard. p4_engine.js declared daysBetween(a, b)
   returning a signed difference. p4d_plates.js later declared its own, added
   defensively after a malformed date crashed the Train screen, which clamped
   the result with Math.max(0, …). Because p4d_plates.js loads afterwards, its
   version won everywhere: daysBetween could not return a negative number
   anywhere in the app, relDate() called every past date "Today", and the
   catch-up sheet started offering days that had not happened yet. One local
   defensive fix became a global behaviour change.

   So: one name, one part. This fails the build on any collision.

   On not lying. A checker that silently measures nothing prints the same
   green as one that measured everything — this project has been bitten by
   that three separate times. So this file masks comments and string bodies
   before scanning rather than hoping regexes miss them, and it reports its
   own coverage (parts read, names seen). If it cannot read a part it says so
   and exits non-zero instead of quietly scanning less. */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const QUIET = process.argv.includes('--quiet');

/* build.sh owns the parts list; read it from there so the two cannot drift.
   A second hardcoded copy would be exactly the kind of silent divergence
   this file exists to catch. */
function partsFromBuild() {
  const sh = readFileSync(join(ROOT, 'build.sh'), 'utf8');
  const block = sh.match(/PARTS=\(([\s\S]*?)\)/);
  if (!block) throw new Error('could not find PARTS=( … ) in build.sh');
  return block[1]
    .split('\n')
    .map(l => l.replace(/#.*$/, '').trim())
    .filter(Boolean);
}

/* Replace the *contents* of comments, strings and template literals with
   spaces, preserving every newline and every offset. Masking rather than
   deleting keeps line numbers exact, so a reported collision points at the
   real line. Template placeholders (${…}) are left live, because code inside
   them is still code — though nothing at column 0 can be inside one. */
function mask(src) {
  const out = src.split('');
  const n = src.length;
  let unterminated = null;
  let i = 0;

  /* An explicit mode stack, and every branch advances `i` by at least one.
     The first version of this tried to be clever with indexOf and hung the
     build on a nested `${` — hence the flat loop and the invariant. */
  const stack = [{ mode: 'code', braces: 0 }];
  const blankAt = j => { if (j < n && out[j] !== '\n') out[j] = ' '; };

  /* Last significant character of code, used only to tell a regex literal
     from a division. Without this, h()'s /[&<>"']/g reads as an opening
     double quote and swallows the rest of the part — which is exactly how
     this file first reported two "unterminated string" failures. */
  let lastSig = null;
  const VALUE_ENDED = ')';
  const REGEX_OK = '(,=:[!&|?{};+-*%~^<>';
  const REGEX_KEYWORDS = new Set([
    'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete',
    'void', 'case', 'do', 'else', 'yield', 'await'
  ]);

  const regexAllowed = at => {
    if (lastSig === null) return true;
    if (REGEX_OK.includes(lastSig)) return true;
    if (!/[\w$]/.test(lastSig)) return false;
    let j = at - 1;
    while (j >= 0 && /\s/.test(src[j])) j--;
    const end = j;
    while (j >= 0 && /[\w$]/.test(src[j])) j--;
    return REGEX_KEYWORDS.has(src.slice(j + 1, end + 1));
  };

  while (i < n) {
    const top = stack[stack.length - 1];
    const c = src[i], d = src[i + 1];

    if (top.mode === 'tpl') {
      if (c === '\\') { blankAt(i); blankAt(i + 1); i += 2; continue; }
      if (c === '`') { stack.pop(); lastSig = VALUE_ENDED; i++; continue; }
      if (c === '$' && d === '{') {
        stack.push({ mode: 'code', braces: 0 });
        lastSig = '{';
        i += 2;
        continue;
      }
      blankAt(i); i++;
      continue;
    }

    if (c === '/' && d === '*') {
      out[i] = ' '; out[i + 1] = ' '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { blankAt(i); i++; }
      if (i >= n) { unterminated = unterminated || { what: 'block comment' }; break; }
      out[i] = ' '; out[i + 1] = ' '; i += 2;
      continue;
    }
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') { blankAt(i); i++; }
      continue;
    }
    if (c === '/' && regexAllowed(i)) {
      /* A regex literal. Mask its body so quotes inside a character class
         stay inert — /[&<>"']/g must not read as an opening quote. */
      let j = i + 1;
      let inClass = false, closed = false;
      while (j < n) {
        const ch = src[j];
        if (ch === '\\') { blankAt(j); blankAt(j + 1); j += 2; continue; }
        if (ch === '\n') break;
        if (inClass) { if (ch === ']') inClass = false; }
        else if (ch === '[') inClass = true;
        else if (ch === '/') { closed = true; break; }
        blankAt(j); j++;
      }
      if (!closed) { unterminated = unterminated || { what: 'regex literal' }; i++; continue; }
      j++;
      while (j < n && /[a-z]/.test(src[j])) j++; // flags
      lastSig = VALUE_ENDED;
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      i++;
      while (i < n && src[i] !== q && src[i] !== '\n') {
        if (src[i] === '\\') { blankAt(i); blankAt(i + 1); i += 2; continue; }
        blankAt(i); i++;
      }
      lastSig = VALUE_ENDED;
      if (i < n && src[i] === q) i++;
      else unterminated = unterminated || { what: `${q} string` };
      continue;
    }
    if (c === '`') { stack.push({ mode: 'tpl' }); i++; continue; }
    if (c === '{') { top.braces++; lastSig = '{'; i++; continue; }
    if (c === '}') {
      // Closing a ${ … } placeholder returns to the template literal.
      if (top.braces === 0 && stack.length > 1) stack.pop();
      else { top.braces--; lastSig = '}'; }
      i++;
      continue;
    }
    if (!/\s/.test(c)) lastSig = c;
    i++;
  }

  if (stack.length > 1) unterminated = unterminated || { what: 'template literal' };
  return { masked: out.join(''), unterminated };
}

/* Names declared at column 0 of the masked source. Column 0 is the whole
   trick: every part's own top level sits flush left, and anything nested —
   inside an IIFE, a function body, an object — is indented, so it cannot be
   mistaken for a global. */
function declarations(masked) {
  const found = [];
  const lines = masked.split('\n');

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (!line || /^\s/.test(line)) continue;

    let m = /^(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(line);
    if (m) { found.push({ name: m[1], line: li + 1, kind: 'function' }); continue; }

    m = /^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (m) { found.push({ name: m[1], line: li + 1, kind: 'class' }); continue; }

    m = /^(?:export\s+)?(const|let|var)\s+([\s\S]*)$/.exec(line);
    if (!m) continue;
    const kind = m[1];

    /* A single statement can declare several names — `let restEnd = 0,
       restTotal = 0, restTick = null;` is three globals, and missing two of
       them would be exactly the blind spot this file is supposed to close.
       So walk the declarator list to the end of the statement, across lines,
       and take the leading binding of each top-level comma group. */
    let buf = m[2];
    let depth = bracketDepth(buf);
    let lj = li;
    while (depth > 0 && lj + 1 < lines.length) {
      lj++;
      buf += '\n' + lines[lj];
      depth = bracketDepth(buf);
    }
    const semi = indexOfTopLevel(buf, ';');
    if (semi !== -1) buf = buf.slice(0, semi);

    for (const seg of splitTopLevel(buf)) {
      for (const name of bindingsOf(seg)) found.push({ name, line: li + 1, kind });
    }
  }
  return found;
}

function bracketDepth(s) {
  let d = 0;
  for (const ch of s) {
    if (ch === '(' || ch === '[' || ch === '{') d++;
    else if (ch === ')' || ch === ']' || ch === '}') d--;
  }
  return d;
}

function indexOfTopLevel(s, target) {
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[' || ch === '{') d++;
    else if (ch === ')' || ch === ']' || ch === '}') d--;
    else if (ch === target && d === 0) return i;
  }
  return -1;
}

function splitTopLevel(s) {
  const parts = [];
  let d = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[' || ch === '{') d++;
    else if (ch === ')' || ch === ']' || ch === '}') d--;
    else if (ch === ',' && d === 0) { parts.push(s.slice(start, i)); start = i + 1; }
  }
  parts.push(s.slice(start));
  return parts.map(p => p.trim()).filter(Boolean);
}

/* The binding side of one declarator: `foo = 1` → foo; `{a, b: c} = x` →
   a, c; `[x, , y] = z` → x, y. */
function bindingsOf(seg) {
  const eq = indexOfTopLevel(seg, '=');
  const lhs = (eq === -1 ? seg : seg.slice(0, eq)).trim();
  if (!lhs) return [];
  if (/^[A-Za-z_$][\w$]*$/.test(lhs)) return [lhs];
  if (/^[{[]/.test(lhs)) {
    const names = [];
    // Renamed ({a: b}) binds b; shorthand ({a}) binds a. Defaults are ignored.
    const inner = lhs.slice(1, -1);
    for (const seg2 of splitTopLevel(inner)) {
      const colon = indexOfTopLevel(seg2, ':');
      const target = (colon === -1 ? seg2 : seg2.slice(colon + 1)).trim();
      const bare = target.replace(/^\.\.\./, '').split('=')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(bare)) names.push(bare);
      else if (/^[{[]/.test(bare)) names.push(...bindingsOf(bare));
    }
    return names;
  }
  return [];
}

/* ---------------------------------------------------------------- */

let parts;
try {
  parts = partsFromBuild();
} catch (e) {
  console.error(`dupes: ${e.message}`);
  process.exit(2);
}

const js = parts.filter(p => p.endsWith('.js'));
const seen = new Map(); // name -> [{file, line, kind}]
const problems = [];
let namesSeen = 0;

for (const rel of js) {
  let src;
  try {
    src = readFileSync(join(ROOT, rel), 'utf8');
  } catch (e) {
    console.error(`dupes: cannot read ${rel} — ${e.message}`);
    process.exit(2);
  }
  const { masked, unterminated } = mask(src);
  if (unterminated) {
    problems.push(`${rel}: unterminated ${unterminated.what} — scan may be incomplete`);
  }
  for (const d of declarations(masked)) {
    namesSeen++;
    if (!seen.has(d.name)) seen.set(d.name, []);
    seen.get(d.name).push({ file: rel, line: d.line, kind: d.kind });
  }
}

const dupes = [...seen.entries()].filter(([, hits]) => hits.length > 1);

/* A part that could not be parsed is a failure, not a footnote. Reporting
   "0 duplicates" off a partial scan is the exact lie this file guards
   against. */
if (problems.length) {
  console.error('dupes: FAILED to scan cleanly');
  for (const p of problems) console.error('  ' + p);
  process.exit(2);
}

if (dupes.length) {
  console.error(`dupes: ${dupes.length} duplicate top-level declaration(s) across ${js.length} parts\n`);
  for (const [name, hits] of dupes) {
    console.error(`  ${name}`);
    for (const hit of hits) console.error(`      ${hit.kind.padEnd(8)} ${hit.file}:${hit.line}`);
    const last = hits[hits.length - 1];
    console.error(`      → ${last.file} loads last, so its ${name} wins for the whole app\n`);
  }
  console.error('  One name, one part. Rename, or delete the redundant copy.');
  process.exit(1);
}

if (!QUIET) {
  console.log(`dupes: ok — ${namesSeen} top-level declarations across ${js.length} parts, ${seen.size} distinct, 0 duplicates`);
}
