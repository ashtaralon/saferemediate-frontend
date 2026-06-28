/**
 * Estate System view — enrichment helpers (IAP path counts, findings).
 * Pure functions only; fetch wiring lives in estate-map-view.tsx.
 */
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import type { TopologyNode } from "@/components/topology-v0-2/types"

export interface FindingsSeveritySummary {
  total?: number
  critical?: number
  high?: number
  medium?: number
  low?: number
  info?: number
  error?: string
}

export interface DecisionRoutingSummary {
  total_findings?: number
  scored_count?: number
  blocked_total?: number
  by_decision_total?: {
    AUTO_EXECUTE?: number
    CANARY_FIRST?: number
    REQUIRE_APPROVAL?: number
    MANUAL_REVIEW?: number
    BLOCK?: number
  }
  error?: string
}

export interface JewelPathIndex {
  byId: Map<string, CrownJewelSummary>
  byName: Map<string, CrownJewelSummary>
}

export function buildJewelPathIndex(jewels: CrownJewelSummary[]): JewelPathIndex {
  const byId = new Map<string, CrownJewelSummary>()
  const byName = new Map<string, CrownJewelSummary>()
  for (const j of jewels) {
    byId.set(j.id, j)
    if (j.canonical_id) byId.set(j.canonical_id, j)
    byName.set(j.name.toLowerCase(), j)
  }
  return { byId, byName }
}

export function jewelPathMetaForNode(
  node: TopologyNode,
  index: JewelPathIndex,
): CrownJewelSummary | null {
  return index.byId.get(node.id) ?? index.byName.get(node.name.toLowerCase()) ?? null
}

/** Honest path-count copy — never fabricates when materializer says not computed. */
export function pathCountLabel(j: CrownJewelSummary): string {
  if (j.paths_not_computed) return "no paths computed"
  const n = j.materialized_path_count ?? j.path_count ?? 0
  if (n === 0) return "0 attack paths"
  return `${n} attack path${n === 1 ? "" : "s"}`
}
