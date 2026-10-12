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
 *
 * A system whose usage-graded findings/health the backend withheld
 * (lib/usage-held.ts::systemFindingsWithheld) has nothing to rank by: it is
 * never ranked as if its values were 0. When every candidate is withheld the
 * backend's own order (criticality, then name) decides.
 */

import { systemFindingsWithheld } from "@/lib/usage-held"

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
  findings_withheld_reason?: string | null
}

function severity(s: RankableSystem): { critical: number; high: number; health: number } {
  return {
    critical: s?.critical_count ?? s?.criticalIssues ?? 0,
    high: s?.high_count ?? s?.highIssues ?? 0,
    health: s?.health_score ?? s?.healthScore ?? 0,
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
  const measured = pool.filter((s) => !systemFindingsWithheld(s))
  const worst = measured.length ? [...measured].sort(compareBySeverityWorstFirst)[0] : pool[0]
  const name = worst?.name ?? list[0]?.name
  return typeof name === "string" && name ? name : null
}
