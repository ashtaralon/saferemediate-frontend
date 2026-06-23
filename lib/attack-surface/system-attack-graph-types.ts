import type { CrownJewelSummary, IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { TopologyResponse } from "@/components/attack-paths-v2/containment-model"

export type RiskBand = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN"

export interface SystemFoothold {
  /** Stable key — foothold display name (matches Explorer). */
  key: string
  name: string
  type: string
  maxScore: number
  band: RiskBand
  pathCount: number
  /** Topology workload ids matched by name (may be empty). */
  workloadIds: string[]
}

export interface SystemJewelNode {
  id: string
  name: string
  type: string
  maxScore: number
  band: RiskBand
  pathCount: number
}

export interface SystemPathEdge {
  footKey: string
  footType: string
  jewelId: string
  score: number
  band: RiskBand
  evidence: string
  pathId: string
  damage: string[]
  hops: number
  path: IdentityAttackPath
}

export interface AggregatedAttackEdge {
  /** `footKey||jewelId` */
  key: string
  footKey: string
  jewelId: string
  band: RiskBand
  maxScore: number
  observed: boolean
  pathIds: string[]
}

export interface SystemAttackGraph {
  systemName: string
  jewels: SystemJewelNode[]
  footholds: SystemFoothold[]
  pathEdges: SystemPathEdge[]
  aggregatedEdges: AggregatedAttackEdge[]
  byId: {
    paths: Map<string, IdentityAttackPath>
    jewels: Map<string, SystemJewelNode>
    footholds: Map<string, SystemFoothold>
  }
}

export type AttackGraphSelection =
  | { kind: "foot"; key: string }
  | { kind: "jewel"; key: string }
  | { kind: "edge"; key: string }
  | null

export interface SystemAttackGraphBundle {
  graph: SystemAttackGraph
  topology: TopologyResponse | null
}

export type { CrownJewelSummary, IdentityAttackPath, TopologyResponse }
