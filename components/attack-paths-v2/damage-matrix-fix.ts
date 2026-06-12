// Frontend mirror of the backend api/s3_damage_matrix.py contract.
//
// The backend now emits, per S3 crown-jewel, a per-cell damage matrix where each
// *allowed* mutating/admin cell is bound to the exact least-privilege patch that
// removes it. This module types that payload and selects the recommended fix so
// the Damage-Aware Path Card can show a fix tied to the actual damage cell
// (e.g. "Remove s3:DeleteObject") instead of the generic top risk-reducer.

export interface BoundFix {
  type: "iam_action_patch"
  operation: "remove_action" | "replace_wildcard"
  role: string
  action: string
  resource_scope: string
}

export interface DamageCause {
  principal: string
  action: string
  resource: string
}

export interface DamageCellExpectedResult {
  removes: string
  retains_read: boolean
}

export interface DamageCell {
  cell: string
  label: string
  verb: "read" | "write" | "delete" | "admin"
  allowed: boolean
  scope: "bucket" | "object" | "prefix"
  prefixes: string[]
  confidence: "configured" | "observed" | "confirmed" | "blocked" | "configured_absent"
  severity: number
  cause: DamageCause | null
  fix: BoundFix | null
  expected_result: DamageCellExpectedResult | null
}

export interface RecommendedFix {
  cell: string
  label: string
  fix: BoundFix
  cause: DamageCause
  expected_result: DamageCellExpectedResult | null
  action_label: string
}

export interface DamageMatrix {
  service: string
  resource: string
  principal: string
  cells: DamageCell[]
  recommended_fix: RecommendedFix | null
}

const READ_LIKE = new Set(["list_bucket", "read_object"])

function fixLabel(fix: BoundFix): string {
  return fix.operation === "replace_wildcard"
    ? `Replace ${fix.action} on ${fix.role} with scoped S3 actions`
    : `Remove ${fix.action} from ${fix.role}`
}

/**
 * Prefer the backend's bound recommended_fix; otherwise derive it from the most
 * dangerous allowed cell (skipping pure read cells, which are rarely the LP win).
 * Returns null when the matrix is absent or nothing dangerous is removable.
 */
export function selectRecommendedFix(
  matrix: DamageMatrix | null | undefined,
): RecommendedFix | null {
  if (!matrix) return null
  if (matrix.recommended_fix) return matrix.recommended_fix

  const candidates = (matrix.cells ?? []).filter(
    (c) => c.allowed && c.fix && !READ_LIKE.has(c.cell),
  )
  if (candidates.length === 0) return null

  const top = candidates.reduce((a, b) => (b.severity > a.severity ? b : a))
  return {
    cell: top.cell,
    label: top.label,
    fix: top.fix as BoundFix,
    cause: top.cause as DamageCause,
    expected_result: top.expected_result,
    action_label: fixLabel(top.fix as BoundFix),
  }
}

/** One-line human summary of what applying the bound fix does. */
export function expectedResultLabel(rec: RecommendedFix | null | undefined): string | null {
  if (!rec?.expected_result) return null
  return rec.expected_result.retains_read
    ? `${rec.label} removed; read access retained`
    : `${rec.label} removed`
}

/** Number of allowed (dangerous) damage cells — for the card subtitle. */
export function allowedCellCount(matrix: DamageMatrix | null | undefined): number {
  return (matrix?.cells ?? []).filter((c) => c.allowed).length
}
