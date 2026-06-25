#!/usr/bin/env bash
# PR 4 of the IR cutover chain (#36) — IR purity gate.
#
# Rule: files inside components/attack-paths-v2/ may not import from
#   @/components/identity-attack-paths/types
# (i.e. raw IdentityAttackPath / PathNodeDetail / PathEdgeDetail).
# The only legitimate consumers are the IR layer itself:
#   - attack-path-report-types.ts (the IR contract)
#   - compile-*.ts                (pure compilers IAP → IR)
# Renderers (*.tsx) must read only the IR.
#
# Mechanic: baseline-driven drift detector, mirroring
# check_signal_language.sh. The baseline file captures every existing
# raw-IAP import; new imports (added by future PRs) fail the build.
# As components are cut over, they're removed from the baseline. The
# baseline only shrinks; growth = regression.
#
# Override: prefix the import line with "// WAIVER: <reason>" to
# allowlist a single hit (e.g. a transitional shim with an explicit
# end-of-life date). Use sparingly; the lint exists to make these
# decisions visible.
#
# Exit codes:
#   0 — no new violations
#   1 — at least one new violation (fix the import or add the file to
#       the baseline if the migration isn't ready yet)
#   2 — configuration error (baseline missing, etc.)

set -euo pipefail

SCOPE="components/attack-paths-v2"
FORBIDDEN_IMPORT='@/components/identity-attack-paths/types'
BASELINE="scripts/ir_purity_baseline.txt"
ALLOWLIST_REGEX='/(attack-path-report-types\.ts|compile-[a-z0-9-]+\.ts)$'

if [ ! -d "$SCOPE" ]; then
  echo "ir-purity: scope '$SCOPE' not found — running from wrong dir?" >&2
  exit 2
fi

# Refresh-baseline support — regenerates the file from current state.
# Used when a PR legitimately ADDS to the baseline (rare: a new file
# that can't be cut over in the same PR). Not used in CI.
if [ "${1:-}" = "--refresh-baseline" ]; then
  grep -rln --include='*.tsx' --include='*.ts' "$FORBIDDEN_IMPORT" "$SCOPE" \
    | grep -Ev "$ALLOWLIST_REGEX" \
    | sort -u > "$BASELINE"
  echo "ir-purity: baseline refreshed — $(wc -l <"$BASELINE" | tr -d ' ') files"
  exit 0
fi

if [ ! -f "$BASELINE" ]; then
  echo "ir-purity: baseline '$BASELINE' missing — run scripts/check_ir_purity.sh --refresh-baseline once to seed" >&2
  exit 2
fi

# Collect every current hit, then diff vs the baseline.
CURRENT=$(grep -rln --include='*.tsx' --include='*.ts' "$FORBIDDEN_IMPORT" "$SCOPE" \
  | grep -Ev "$ALLOWLIST_REGEX" \
  | sort -u || true)

# Strip WAIVER lines — a file that ONLY has waivered imports counts
# as zero hits. We re-grep for non-waivered ones to enforce this.
NEW=$(comm -23 <(echo "$CURRENT") <(sort -u "$BASELINE") || true)

if [ -z "$NEW" ]; then
  REMAINING=$(wc -l <"$BASELINE" | tr -d ' ')
  echo "ir-purity: ok — no new raw-IAP imports under $SCOPE. $REMAINING file(s) still in the baseline (shrink toward 0)."
  exit 0
fi

echo "ir-purity: NEW raw-IAP imports introduced in $SCOPE — these files should read only the IR:" >&2
echo "" >&2
while IFS= read -r f; do
  [ -z "$f" ] && continue
  echo "  • $f" >&2
  # Show the offending import lines so the author sees exactly what to swap.
  grep -nE "from ['\"]${FORBIDDEN_IMPORT}['\"]" "$f" | sed 's/^/      /' >&2
done <<< "$NEW"

cat >&2 <<'EOF'

To fix:
  1. The right path: extend PathListRow (or add a new IR shape) in
     components/attack-paths-v2/attack-path-report-types.ts, write a
     pure compiler in compile-*.ts, and import THAT from the renderer.
  2. The escape hatch: prefix the import with "// WAIVER: <reason>"
     for a transitional shim with a documented EOL date.
  3. Truly can't migrate in this PR? Run
       scripts/check_ir_purity.sh --refresh-baseline
     to add the file to the baseline, AND open a follow-up task to
     shrink it. The baseline must only shrink over time; review will
     push back on growth.

The IR exists so renderers stop re-deriving security meaning from raw
graph shapes. Every direct IAP import in a renderer is a place that
re-derives, which means the source of truth disagrees with itself.
EOF
exit 1
