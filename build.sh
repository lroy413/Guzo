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
  build/p4_engine.js
  build/p4b_journey.js
  build/p4c_daily.js
  build/p4d_plates.js
  build/p4e_routines.js
  build/p4f_body.js
  build/p4g_food.js
  build/p4h_energy.js
  build/p4i_order.js
  build/p5a_onboard.js
  build/p5_ui.js
  build/p6_more.js
  build/p6b_help.js
  build/p6c_daily.js
  build/p6d_routines.js
  build/p6e_profile.js
  build/p6f_fuel.js
  build/p6g_order.js
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

# index.html is the deployed file and is byte-identical to GuzoFit.html. Two
# names for one artefact: GuzoFit.html is what the build is called, index.html
# is what a static host needs it to be called.
cp GuzoFit.html index.html

bytes=$(wc -c < GuzoFit.html | tr -d ' ')
echo "build: ${#PARTS[@]} parts → GuzoFit.html, index.html (${bytes} bytes)"
