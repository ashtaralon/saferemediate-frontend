/** Coverage gaps and rejected-edge warnings from the topology-risk payload.

Phase 6 renders `traffic_authority.coverage_gaps[]`. The backend hoists the
same list as `lane_coverage.warnings`. Never invent a gap the payload did
not name.
*/
import type {
  LaneCoverage,
  LaneCoverageWarning,
  TopologyRiskResponse,
} from "./types"

export const PROJECTION_COUNTER_WARNINGS = {
  unclassified_external_targets: "egress_destinations_unclassified",
  unclassified_external_sources: "ingress_sources_unclassified",
  igw_to_database_rejected: "igw_to_database_rejected",
  unresolved_pairs: "unresolved_pairs",
} as const

export const REJECTED_COUNTER_WARNINGS = {
  non_vpc_lambda_edges: "non_vpc_lambda_edges_rejected",
} as const

export function resolveCoverageGaps(
  authority: TopologyRiskResponse["traffic_authority"] | null | undefined,
): LaneCoverageWarning[] {
  if (!authority) return []
  if (Array.isArray(authority.coverage_gaps)) return authority.coverage_gaps
  const coverage = authority.lane_coverage
  if (!coverage) return []
  if (Array.isArray(coverage.coverage_gaps)) return coverage.coverage_gaps
  return Array.isArray(coverage.warnings) ? coverage.warnings : []
}

export function unnamedCounters(
  coverage: LaneCoverage | null | undefined,
  gaps: LaneCoverageWarning[],
): string[] {
  if (!coverage) return []
  const byCode = new Map(gaps.map(gap => [gap.code, gap]))
  const missing: string[] = []
  for (const [counter, code] of Object.entries(PROJECTION_COUNTER_WARNINGS)) {
    const count = Number(coverage.projection?.[counter as keyof NonNullable<LaneCoverage["projection"]>] ?? 0)
    if (count > 0 && byCode.get(code)?.count !== count) missing.push(counter)
  }
  for (const [counter, code] of Object.entries(REJECTED_COUNTER_WARNINGS)) {
    const count = Number(coverage.rejected_edges?.[counter as keyof NonNullable<LaneCoverage["rejected_edges"]>] ?? 0)
    if (count > 0 && byCode.get(code)?.count !== count) missing.push(counter)
  }
  return missing
}
