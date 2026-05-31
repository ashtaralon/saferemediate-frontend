#!/usr/bin/env bash
# Shared Roles PR-A (2026-05-31) — operator-UI signal-language gate.
# SG-IAM-1 B2 extension (2026-05-31) — capability-claim subgate.
#
# Two independent gates on operator-visible TSX:
#
#   1. ACCUSATIVE — customer-state copy must be descriptive ("Engine
#      produced different result"), not accusative ("Suspicious engine
#      drift"). Anchor: feedback_signal_language.
#
#   2. CAPABILITY-CLAIM — copy must not make capability claims about
#      Cyntro (positive OR negative) that aren't verified against the
#      actual implementation at render time. "hasn't separated", "is
#      partial", "cannot determine" age into lies — worst when they
#      describe a limitation that was real once and has since been
#      fixed (negative phantoms). Anchor: pattern_no_phantom_capabilities_in_ui
#      (extended 2026-05-31 with the inversion scope).
#
# Each gate has its own forbidden substring list and its own baseline
# file. New hits in either gate fail the build; pre-existing hits live
# in the baselines until cleanup PRs land.
#
# Override: prefix a line with "// WAIVER: <reason>" to allowlist any
# single hit (e.g. quoting an external CSPM finding verbatim, or
# documenting a fact about a resource ["hasn't been modified in N
# days"] rather than a Cyntro-capability claim).
#
# Exit codes:
#   0  no new hits in either gate
#   1  new hits in at least one gate — fix or waiver before merge
#   2  configuration error

set -euo pipefail

# ── Gate 1: accusative substrings ────────────────────────────────
# Tuned to catch words that read as attribution-of-intent without
# false-positiving on benign uses (Attack Path as a feature name in
# routes is fine — those don't live in operator-visible TSX bodies;
# if they did, the WAIVER mechanism handles it).
FORBIDDEN_ACCUSATIVE='suspicious|malicious|hostile|threat|compromised|breach|rogue'
ACCUSATIVE_BASELINE_FILE="scripts/signal_language_baseline.txt"

# ── Gate 2: capability-claim substrings (SG-IAM-1 B2) ───────────
# These read as Cyntro-capability claims that age into lies. Negative
# phantoms ("UI claims Cyntro CAN'T do Y but can") are the dangerous
# inverse — they tell operators Cyntro is LESS capable than it is,
# damaging trust in the inverse direction from positive phantoms
# (which were already covered by pattern_no_phantom_capabilities_in_ui's
# original anchor).
#
# Substrings tuned per the relay block. Grandfathered hits live in
# capability_claim_baseline.txt — usually fact-about-resource phrasing
# like "resource hasn't been modified in N days" (not a Cyntro-capability
# claim).
FORBIDDEN_CAPABILITY="hasn't separated|hasn't been|isn't yet|not yet supported|coming soon|limited support|partial support|is partial|doesn't yet|cannot determine"
CAPABILITY_BASELINE_FILE="scripts/capability_claim_baseline.txt"

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

# Strip line numbers for baseline comparison. grep emits
# "file:line:content" but line numbers shift when imports / unrelated
# edits land above a hit. Baseline matching ignores line numbers so the
# same text in the same file still matches even after a vertical shift.
# Display output still shows line numbers for the human reader.
_strip_lineno() {
  # "components/foo.tsx:1879:If any..." -> "components/foo.tsx:If any..."
  sed -E 's/^([^:]+):[0-9]+:/\1:/'
}

# Run a single gate. Args: gate_name forbidden_regex baseline_file
# Sets global ${gate_name}_NEW_HITS to the newline-separated list of
# hits not in the gate's baseline. Empty string means clean.
_run_gate() {
  local gate_name="$1"
  local forbidden="$2"
  local baseline="$3"

  local hits
  hits=$(grep -inE "$forbidden" "${candidate_files[@]}" 2>/dev/null \
    | grep -v 'WAIVER:' || true)

  local new_hits=""
  if [[ -n "$hits" ]]; then
    if [[ -f "$baseline" ]]; then
      local normalized_baseline
      normalized_baseline=$(sort -u "$baseline")
      while IFS= read -r hit; do
        [[ -z "$hit" ]] && continue
        local normalized
        normalized=$(echo "$hit" | _strip_lineno)
        if ! grep -Fxq "$normalized" <<< "$normalized_baseline"; then
          new_hits+="$hit"$'\n'
        fi
      done <<< "$hits"
      new_hits=${new_hits%$'\n'}
    else
      # No baseline yet — strict default. Run with --update-baseline
      # once at gate introduction, then strict from there.
      new_hits="$hits"
    fi
  fi

  # Stash on a gate-named variable for the caller. Bash doesn't have
  # great return-string support; this is the cleanest way to keep
  # output usable for the multi-gate report.
  printf -v "${gate_name}_NEW_HITS" '%s' "$new_hits"
  printf -v "${gate_name}_ALL_HITS" '%s' "$hits"
}

# Baseline regen — updates BOTH baselines from the current tree.
if [[ "${1:-}" == "--update-baseline" ]]; then
  _run_gate ACCUSATIVE "$FORBIDDEN_ACCUSATIVE" "$ACCUSATIVE_BASELINE_FILE"
  _run_gate CAPABILITY "$FORBIDDEN_CAPABILITY" "$CAPABILITY_BASELINE_FILE"
  echo "${ACCUSATIVE_ALL_HITS}" | _strip_lineno | sort -u > "$ACCUSATIVE_BASELINE_FILE"
  echo "${CAPABILITY_ALL_HITS}" | _strip_lineno | sort -u > "$CAPABILITY_BASELINE_FILE"
  echo "[check_signal_language] baselines written:" >&2
  echo "  ${ACCUSATIVE_BASELINE_FILE}" >&2
  echo "  ${CAPABILITY_BASELINE_FILE}" >&2
  exit 0
fi

# Run both gates.
_run_gate ACCUSATIVE "$FORBIDDEN_ACCUSATIVE" "$ACCUSATIVE_BASELINE_FILE"
_run_gate CAPABILITY "$FORBIDDEN_CAPABILITY" "$CAPABILITY_BASELINE_FILE"

fail=0

if [[ -n "${ACCUSATIVE_NEW_HITS:-}" ]]; then
  echo "New accusative copy in operator UI:" >&2
  echo "${ACCUSATIVE_NEW_HITS}" >&2
  echo "" >&2
  echo "Customer-state copy must be descriptive, not accusative." >&2
  echo "Allowed: 'differs from recorded', 'no longer reachable', 'review signal'." >&2
  echo "Forbidden: Suspicious / Malicious / Hostile / Threat / Compromised / Breach / Rogue." >&2
  echo "Override (when reading verbatim from external CSPM): add" >&2
  echo "  // WAIVER: quoting external Wiz finding verbatim" >&2
  echo "to the same line. See feedback_signal_language_grep_gate.md in memory." >&2
  echo "" >&2
  fail=1
fi

if [[ -n "${CAPABILITY_NEW_HITS:-}" ]]; then
  echo "New capability-claim copy in operator UI:" >&2
  echo "${CAPABILITY_NEW_HITS}" >&2
  echo "" >&2
  echo "UI text must not make Cyntro-capability claims (positive OR negative)" >&2
  echo "that aren't verified against the actual implementation at render time." >&2
  echo "Anchor: pattern_no_phantom_capabilities_in_ui (extended 2026-05-31)." >&2
  echo "" >&2
  echo "Each hit needs one of:" >&2
  echo "  (a) verification — name what code/data verifies the claim, in a" >&2
  echo "      comment adjacent to the copy" >&2
  echo "  (b) rewrite — describe the observable symptom, not the internal" >&2
  echo "      mechanism (e.g. drop 'the graph hasn't separated' clauses)" >&2
  echo "  (c) WAIVER — if the substring describes a resource fact rather" >&2
  echo "      than a Cyntro-capability claim ('resource hasn't been modified" >&2
  echo "      in N days'), add // WAIVER: descriptive-fact-not-capability-claim" >&2
  echo "" >&2
  fail=1
fi

if [[ $fail -eq 1 ]]; then
  exit 1
fi

# All clean. Report grandfathered counts so operators see ratchet progress.
accusative_count=0
capability_count=0
if [[ -f "$ACCUSATIVE_BASELINE_FILE" ]]; then
  accusative_count=$(wc -l < "$ACCUSATIVE_BASELINE_FILE" | tr -d ' ')
fi
if [[ -f "$CAPABILITY_BASELINE_FILE" ]]; then
  capability_count=$(wc -l < "$CAPABILITY_BASELINE_FILE" | tr -d ' ')
fi

echo "[check_signal_language] ${#candidate_files[@]} files scanned, no new hits." >&2
echo "  Accusative gate: ${accusative_count} grandfathered hits" >&2
echo "  Capability-claim gate: ${capability_count} grandfathered hits" >&2
exit 0
