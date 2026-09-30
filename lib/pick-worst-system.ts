/**
 * Pick the "worst" system to default views to — e.g. the Estate map opened with
 * no `?systemName=` param. Mirrors the dashboard's "Systems Needing Attention"
 * ranking EXACTLY (components/systems-view.tsx: "rank by critical desc, high
 * desc, health asc"), so the default landing system matches what the operator
 * already sees flagged as most-at-risk.
 *
 * Reads both snake_case (backend) and camelCase (typed) spellings via the same
 * `??` chain systems-view uses, so it tracks whatever /api/proxy/systems sends.
 * Prefers rankable, non-rejected entries (the payload carries `rankable` /
 * `rejected` boundary flags); falls back to the full list, then the first
 * entry, so it always resolves a real system name when one exists.
 */

export interface RankableSystem {
  name?: string
  rankable?: boolean
  rejected?: boolean
  health_score?: number | null
  healthScore?: number | null
  critical_count?: number | null
  criticalIssues?: number | null
  high_count?: number | null
  highIssues?: number | null
}

function severity(s: RankableSystem): { critical: number; high: number; health: number } {
  // A system whose findings were not computed (null from the backend, e.g. a
  // fresh install before LP findings exist) is not "0 criticals, health 0":
  // it ranks AFTER every measured system, so the auto-picked landing system is
  // one the operator can actually act on.
  return {
    critical: s?.critical_count ?? s?.criticalIssues ?? -1,
    high: s?.high_count ?? s?.highIssues ?? -1,
    health: s?.health_score ?? s?.healthScore ?? 101,
  }
}

/** Worst-first comparator: most criticals, then most highs, then lowest health. */
export function compareBySeverityWorstFirst(a: RankableSystem, b: RankableSystem): number {
  const A = severity(a)
  const B = severity(b)
  if (B.critical !== A.critical) return B.critical - A.critical
  if (B.high !== A.high) return B.high - A.high
  return A.health - B.health
}

/** Returns the worst system's `name`, or null when the list is empty / nameless. */
export function pickWorstSystemName(
  systems: RankableSystem[] | null | undefined,
): string | null {
  const list = Array.isArray(systems) ? systems : []
  if (!list.length) return null
  const rankable = list.filter((s) => s?.rankable !== false && !s?.rejected)
  const pool = rankable.length ? rankable : list
  const worst = [...pool].sort(compareBySeverityWorstFirst)[0]
  const name = worst?.name ?? list[0]?.name
  return typeof name === "string" && name ? name : null
}
