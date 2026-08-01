#!/usr/bin/env bash
# TypeScript error ratchet.
#
# next.config.js sets `typescript: { ignoreBuildErrors: true }`, so the build
# ships regardless of type errors and nothing stops the count from growing.
# It has reached 262. The two largest classes are TS18048 ("possibly
# undefined", 39) and TS2339 ("property does not exist", 38) — precisely the
# null-safety family that produced a run of production defects in the Resource
# Risk tab: `100 - null` rendering an unmeasured role as a perfect score, a
# nullable band declared non-nullable, counts coerced from null to 0.
#
# Those were all found by hand. The compiler already knew.
#
# Turning ignoreBuildErrors off today would simply break the build, so this is
# a RATCHET: the count may fall, never rise. New code must be type-clean even
# while the existing debt is paid down.
#
# Mechanic mirrors check_ir_purity.sh / check_signal_language.sh: a baseline
# file, drift fails the build, the baseline only shrinks.
#
# Exit codes:
#   0 — error count <= baseline (and the baseline is updated on the way down)
#   1 — error count > baseline (fix the new errors, do not raise the baseline)
#   2 — configuration error, or the compiler did not actually run

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASELINE_FILE="$ROOT/scripts/tsc_error_baseline.txt"
TSC="$ROOT/node_modules/.bin/tsc"

if [[ ! -f "$BASELINE_FILE" ]]; then
  echo "config error: missing $BASELINE_FILE" >&2
  exit 2
fi
BASELINE="$(tr -d '[:space:]' < "$BASELINE_FILE")"

# Guard the guard.
#
# `npx tsc` in a checkout without node_modules resolves to a PLACEHOLDER
# package that prints "This is not the tsc command you are looking for" and
# emits nothing matching "error TS" — so a grep -c returns 0 and the ratchet
# reports a perfect score having compiled nothing. That exact false green
# happened on 2026-08-01 and hid 18 real errors. Refuse to run unless the
# project's own compiler is present.
if [[ ! -x "$TSC" ]]; then
  echo "config error: $TSC not found — run 'pnpm install' first." >&2
  echo "Refusing to report a count without a compiler: 'no errors' and" >&2
  echo "'never ran' are indistinguishable in the output." >&2
  exit 2
fi

OUTPUT="$("$TSC" --noEmit 2>&1 || true)"
COUNT="$(printf '%s\n' "$OUTPUT" | grep -c 'error TS' || true)"

# A compiler that ran but produced no diagnostics at all is suspicious given a
# non-zero baseline — far more likely a misconfiguration than 262 fixes.
if [[ "$COUNT" -eq 0 && "$BASELINE" -gt 0 ]]; then
  echo "ALARM: tsc reported ZERO errors against a baseline of $BASELINE." >&2
  echo "That is either a genuine cleanup (lower the baseline deliberately) or" >&2
  echo "the compiler did not type-check the project. Verify before trusting." >&2
  printf '%s\n' "$OUTPUT" | head -5 >&2
  exit 2
fi

echo "tsc errors: $COUNT (baseline $BASELINE)"

if [[ "$COUNT" -gt "$BASELINE" ]]; then
  echo ""
  echo "ALARM: $COUNT type errors, up from baseline $BASELINE."
  echo "The build ignores these (next.config.js ignoreBuildErrors), so nothing"
  echo "else will stop them. Fix the new errors; do not raise the baseline."
  echo ""
  echo "Most-affected files:"
  printf '%s\n' "$OUTPUT" | grep 'error TS' | sed 's/(.*//' | sort | uniq -c | sort -rn | head -10
  exit 1
fi

if [[ "$COUNT" -lt "$BASELINE" ]]; then
  echo "$COUNT" > "$BASELINE_FILE"
  echo "baseline lowered to $COUNT — commit scripts/tsc_error_baseline.txt"
fi

exit 0
