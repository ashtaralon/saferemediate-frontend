/**
 * Readings for the legacy Home view (app/page.tsx, shown when the V2/V3
 * dashboards are switched off). Each returns the backend's own numbers or
 * null; the page renders nothing for null. These tiles used to default every
 * missing figure to 0 ("0 allowed / 0 used", "0% removable", "0 urgent"), and
 * the gap card showed a "Confidence" that no backend computes.
 */

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export interface GapReading {
  allowed: number
  used: number
  unused: number
  roleLabel: string
}

/** The permission gap from an issues-summary answer (`byCategory.permissions`), or null. */
export function parseGapReading(summary: unknown): GapReading | null {
  const s = summary as { byCategory?: { permissions?: Record<string, unknown> }; resources?: Record<string, unknown> } | null
  const permissions = s?.byCategory?.permissions
  const allowed = finite(permissions?.allowed)
  const used = finite(permissions?.used)
  if (allowed === null || used === null) return null
  const unused = finite(permissions?.unused) ?? allowed - used
  const roles = finite(s?.resources?.iam_roles)
  return { allowed, used, unused, roleLabel: roles !== null ? `${roles} IAM Roles Analyzed` : "IAM roles" }
}

/** Share of granted permissions that look removable, or null when there is no reading or nothing is granted. */
export function removableGapPercent(gap: GapReading | null): number | null {
  if (!gap || gap.allowed <= 0) return null
  return Math.round((gap.unused / gap.allowed) * 100)
}

/** Critical + high findings from the summary's own severity counts, or null when either is not a number. */
export function urgentIssueCount(summary: { by_severity?: { critical?: unknown; high?: unknown } } | null | undefined): number | null {
  const critical = finite(summary?.by_severity?.critical)
  const high = finite(summary?.by_severity?.high)
  return critical === null || high === null ? null : critical + high
}
