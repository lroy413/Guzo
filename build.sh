#!/usr/bin/env bash
#
# The build. There is no bundler and no package manager — the whole thing is
# a `cat` of the parts below, in this order.
#
# THE ORDER OF `PARTS` IS THE RUNTIME LOAD ORDER. Everything shares one global
# script scope, so a name declared in two parts is legal JavaScript and
# completely silent: the later file wins for the whole application. That is
# not hypothetical — a defensive copy of `daysBetween` in p4d_plates.js once
# clamped its result to Math.max(0, …) and, because that file loads after
# p4_engine.js, every past-or-future check in the app lost the ability to see
# the past. `dupes.mjs` below is what stops it happening again. Do not remove
# that check, and do not reorder these files without knowing why.
#
set -euo pipefail
cd "$(dirname "$0")"

PARTS=(
  build/p1_head.html
  build/p2_body.html
  build/p3_data.js
  build/p3b_intake.js
  build/p3c_form.js
  build/p3d_icons.js
  build/p3e_body.js
  build/p4_engine.js
  build/p4b_journey.js
  build/p4c_daily.js
  build/p4d_plates.js
  build/p4e_routines.js
  build/p4f_body.js
  build/p4g_food.js
  build/p4h_energy.js
  build/p4i_order.js
  build/p4j_meals.js
  build/p4k_native.js
  build/p4l_import.js
  build/p4m_scan.js
  build/p4n_water.js
  build/p4o_stretch.js
  build/p5a_onboard.js
  build/p5_ui.js
  build/p6_more.js
  build/p6b_help.js
  build/p6c_daily.js
  build/p6d_routines.js
  build/p6e_profile.js
  build/p6f_fuel.js
  build/p6g_order.js
  build/p6h_import.js
  build/p6i_scan.js
  build/p6j_stretch.js
  build/p7_events.js
  build/p8_tail.html
)

for f in "${PARTS[@]}"; do
  [ -f "$f" ] || { echo "build: missing part $f" >&2; exit 1; }
done

# Duplicate top-level declarations are silent at runtime, so they are caught
# here instead — before the parts are ever concatenated.
if command -v node >/dev/null 2>&1; then
  node dupes.mjs --quiet || { echo "build: aborted, see dupes.mjs output" >&2; exit 1; }
else
  echo "build: WARNING — node not found, duplicate check skipped" >&2
fi

cat "${PARTS[@]}" > GuzoFit.html

# __GUZO_BUILD__ lives in the boot panel, which is plain markup — so what a host
# is serving is readable without executing the page. That matters more than it
# sounds: the deployed file is over a megabyte, and fetching it returns roughly
# the first 1,200 characters, so every other content check against the live site
# is blind. The boot panel sits inside that window, which makes this stamp the
# one thing about a deployment that can be verified from outside.
VERSION_STR=$(sed -n "s/^const VERSION = '\([^']*\)';.*/\1/p" build/p3_data.js | head -1)
[ -n "$VERSION_STR" ] || { echo "build: could not read VERSION from build/p3_data.js" >&2; exit 1; }

# The stamp carries the commit as well as the version, because the version alone
# could not answer the question the stamp exists for. VERSION changes on a
# release; this repo ships many builds per release, so every build for weeks
# read "1.8.0" and "is this host serving the latest?" was unanswerable — which
# is exactly what the comment above claimed it made answerable.
#
# The CI variable first and git second: on Cloudflare both work, so a wrong
# guess at the variable name degrades to the checkout's own SHA rather than
# silently dropping back to a bare version. Locally the SHA is HEAD at build
# time, i.e. the parent of the commit that will contain this file — harmless,
# because the served artefact is the one Cloudflare rebuilds from the commit
# it checked out, and that one is exact.
BUILD_SHA="${WORKERS_CI_COMMIT_SHA:-${CF_PAGES_COMMIT_SHA:-${GITHUB_SHA:-}}}"
BUILD_SRC="ci"
if [ -z "$BUILD_SHA" ] && command -v git >/dev/null 2>&1; then
  BUILD_SHA=$(git rev-parse --short=7 HEAD 2>/dev/null || echo "")
  [ -n "$BUILD_SHA" ] && BUILD_SRC="git"
fi
# Last resort: hash the bytes just built. No VCS, no CI variable, no network —
# it cannot fail, and it answers the real question ("are these the bytes I
# built?") even better than a commit does. Without it, a host whose environment
# provides neither git nor a recognised CI variable would silently go back to
# stamping a bare version, which is the exact failure this whole thing exists
# to remove — and it would look identical to a deploy that never ran.
if [ -z "$BUILD_SHA" ]; then
  for hasher in sha1sum shasum md5sum; do
    if command -v "$hasher" >/dev/null 2>&1; then
      BUILD_SHA="c$("$hasher" GuzoFit.html | cut -c1-6)"
      BUILD_SRC="content"
      break
    fi
  done
fi
BUILD_STR="$VERSION_STR"
if [ -n "$BUILD_SHA" ]; then
  BUILD_STR="${VERSION_STR}+$(printf '%s' "$BUILD_SHA" | cut -c1-7)"
else
  echo "build: WARNING — no commit or hash available, stamping a bare version" >&2
fi

grep -q '__GUZO_BUILD__' GuzoFit.html || { echo "build: build stamp placeholder is missing" >&2; exit 1; }
sed -i "s/__GUZO_BUILD__/${BUILD_STR}/g" GuzoFit.html

# index.html is the deployed file and is byte-identical to GuzoFit.html. Two
# names for one artefact: GuzoFit.html is what the build is called, index.html
# is what a static host needs it to be called.
cp GuzoFit.html index.html

# The service worker cannot be inlined — a worker script has to be fetched over
# http(s), so it ships as its own file next to index.html. Deploying without it
# is survivable: registration fails, the app runs online-only and says so.
[ -f build/sw.js ] || { echo "build: missing build/sw.js" >&2; exit 1; }
cp build/sw.js sw.js

# dist/ is what Cloudflare publishes. It holds exactly the two deployed files
# and nothing else — pointing the Worker at the repo root would put build/,
# docs/ and every test instrument on the open internet. Regenerated here rather
# than committed, so it can never drift from the parts.
rm -rf dist
mkdir -p dist
cp index.html dist/index.html
cp sw.js dist/sw.js

# The iOS shell serves the same two files. Copied rather than symlinked so
# `cap sync` picks up real content, and only when the shell exists — the web
# build must not depend on the native wrapper being present.
if [ -d guzo-native ]; then
  mkdir -p guzo-native/www
  cp index.html guzo-native/www/index.html
  cp sw.js      guzo-native/www/sw.js
fi

bytes=$(wc -c < GuzoFit.html | tr -d ' ')
swbytes=$(wc -c < sw.js | tr -d ' ')
echo "build: ${#PARTS[@]} parts → index.html (${bytes} bytes) + sw.js (${swbytes} bytes) → dist/ · ${BUILD_STR} (${BUILD_SRC})"
