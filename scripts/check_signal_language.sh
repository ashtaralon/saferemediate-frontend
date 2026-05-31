#!/usr/bin/env bash
# Shared Roles PR-A (2026-05-31) — operator-UI accusative-copy gate.
#
# Turns feedback_signal_language into a machine-checkable assertion.
# Customer-state copy in operator UI must be descriptive ("Engine
# produced different result"), not accusative ("Suspicious engine drift").
# When the discipline is convention-only it erodes — one PR at a time
# adds "Suspicious egress detected" with good intent and no one notices
# in review. This script is the gate.
#
# Scope: operator-visible TSX surfaces. Engine-internal vocabulary
# (predicate names, ATLAS-related code, type docstrings) is exempt
# per feedback_polish_boundary_engine_vs_operator — those surfaces
# aren't included in the search globs below.
#
# Override: prefix a line with "// WAIVER: <reason>" to allowlist
# (e.g. quoting an external CSPM finding verbatim).
#
# Exit codes:
#   0  no accusative substrings found in scope
#   1  hits found — fix or waiver before merge
#   2  configuration error

set -euo pipefail

# Forbidden substrings on customer-state copy. Case-insensitive.
# Tuned to catch the words that read as attribution-of-intent without
# false-positiving on benign uses (e.g. "Attack Path" as a feature
# name in routes is fine — those don't live in operator-visible TSX
# bodies; if they did, the WAIVER mechanism handles it).
FORBIDDEN='suspicious|malicious|hostile|threat|compromised|breach|rogue'

# Operator-visible TSX scope. Expand this list as new operator
# surfaces ship. Test fixtures and type-definition files stay out of
# scope (engine vocabulary appears there by design).
SCOPE_GLOBS=(
  'components/iam-shared-roles-*.tsx'
  'components/iap-*.tsx'
  'components/iam-*.tsx'
  'components/attack-paths-*.tsx'
  'components/attack-paths-v2/*.tsx'
  'components/dependency-map/*.tsx'
  'components/egress-*.tsx'
  'app/iam/**/*.tsx'
)

# Find candidate files, then grep. Skip files that don't exist (glob
# match against an absent path returns the literal pattern in bash).
candidate_files=()
for glob in "${SCOPE_GLOBS[@]}"; do
  # shellcheck disable=SC2206
  matches=( $glob )
  for f in "${matches[@]}"; do
    [[ -f "$f" ]] && candidate_files+=( "$f" )
  done
done

if [[ ${#candidate_files[@]} -eq 0 ]]; then
  echo "[check_signal_language] no operator-UI TSX files in scope; skipping" >&2
  exit 0
fi

# Run the grep. Strip waiver lines after the match so they don't fail
# the gate. Output preserves file:line:content for direct click-to-fix.
hits=$(grep -inE "$FORBIDDEN" "${candidate_files[@]}" 2>/dev/null \
  | grep -v 'WAIVER:' || true)

# Baseline mechanism — when this gate ships into a codebase that
# already has accusative copy in other components, those existing
# hits are real findings worth fixing but they belong in their own
# cleanup PR (or chain of PRs), not in the PR that introduces the
# gate. The baseline file at scripts/signal_language_baseline.txt
# captures the grandfathered set; new hits not in the baseline still
# fail the gate. Ratchet-style — same as how teams retrofit linting
# onto large existing codebases.
#
# To regenerate the baseline after a cleanup PR lands:
#   bash scripts/check_signal_language.sh --update-baseline
BASELINE_FILE="scripts/signal_language_baseline.txt"

# Strip line numbers for comparison: grep emits "file:line:content"
# but line numbers shift when imports / unrelated edits land above a
# hit. Baseline matching ignores line numbers so the same text in
# the same file still matches even after a vertical shift. Display
# output still shows line numbers for the human reader.
_strip_lineno() {
  # "components/foo.tsx:1879:If any..." -> "components/foo.tsx:If any..."
  sed -E 's/^([^:]+):[0-9]+:/\1:/'
}

if [[ "${1:-}" == "--update-baseline" ]]; then
  echo "$hits" | _strip_lineno | sort -u > "$BASELINE_FILE"
  echo "[check_signal_language] baseline written: ${BASELINE_FILE}" >&2
  exit 0
fi

# Compare hits against baseline (line numbers stripped on both sides).
# A "new" hit is one whose (file, content) tuple is absent from the
# baseline — moving an existing hit up/down a few lines doesn't count.
# Output preserves the original file:line:content shape so failures
# stay clickable.
new_hits=""
if [[ -n "$hits" ]]; then
  if [[ -f "$BASELINE_FILE" ]]; then
    normalized_baseline=$(sort -u "$BASELINE_FILE")
    while IFS= read -r hit; do
      [[ -z "$hit" ]] && continue
      normalized=$(echo "$hit" | _strip_lineno)
      if ! grep -Fxq "$normalized" <<< "$normalized_baseline"; then
        new_hits+="$hit"$'\n'
      fi
    done <<< "$hits"
    new_hits=${new_hits%$'\n'}
  else
    # No baseline yet — treat all hits as new. Strict default; teams
    # typically run --update-baseline once at gate introduction, then
    # strict from there.
    new_hits="$hits"
  fi
fi

if [[ -n "$new_hits" ]]; then
  echo "New accusative copy in operator UI:" >&2
  echo "$new_hits" >&2
  echo "" >&2
  echo "Customer-state copy must be descriptive, not accusative." >&2
  echo "Allowed: 'differs from recorded', 'no longer reachable', 'review signal'." >&2
  echo "Forbidden: Suspicious / Malicious / Hostile / Threat / Compromised / Breach / Rogue." >&2
  echo "Override (when reading verbatim from external CSPM): add" >&2
  echo "  // WAIVER: quoting external Wiz finding verbatim" >&2
  echo "to the same line. See pattern_signal_language_grep_gate.md in memory." >&2
  exit 1
fi

if [[ -f "$BASELINE_FILE" ]]; then
  baseline_count=$(wc -l < "$BASELINE_FILE" | tr -d ' ')
  echo "[check_signal_language] ${#candidate_files[@]} files scanned, no new accusative copy (${baseline_count} pre-existing hits grandfathered via baseline)." >&2
else
  echo "[check_signal_language] ${#candidate_files[@]} files clean of accusative copy." >&2
fi
exit 0
