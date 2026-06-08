// =============================================================================
// Unified Attack Path types — single source of truth for the merged tab.
// =============================================================================
//
// The "Attack Path" tab (replaces both "Per-Path View" and "Attacker View")
// reads ONE payload from /api/proxy/attack-path/<system>/<jewel>?path_id=X.
// The header, canvas, and footer all bind to this shape — no parallel
// fetches, no client-side joins.
//
// The facade endpoint that produces this payload is a strangler-pattern
// shim over the two pre-existing endpoints (identity-attack-paths +
// attack-chain/graph-view); when the backend ships a real unified
// Cypher query, the facade collapses and this type is unchanged.
// =============================================================================

import type {
  PathNodeDetail,
  PathEdgeDetail,
  SeverityBreakdown,
  RiskReduction,
  DamageCapability,
  ReachableNeighborsByRole,
  TargetBlastRadius,
} from "@/components/identity-attack-paths/types"

// The on-path chain — header breadcrumb + canvas overlay both bind here.
export interface AttackPathHops {
  nodes: PathNodeDetail[]
  edges: PathEdgeDetail[]
}

// Sibling list for the path-selector dropdown ("path 1 of N to this CJ").
// Light shape — just enough to populate the dropdown labels.
export interface AttackPathSibling {
  id: string
  hop_count: number
  evidence_type: "observed" | "configured" | string
  // Overall severity score (0–100); null when backend omitted the field.
  severity: number | null
}

export interface AttackPathJewelSummary {
  id: string
  name: string
  type: string
  path_count: number
}

// =============================================================================
// GraphView canvas payload (forwarded verbatim from the backend's
// /api/attack-chain/graph-view response — kept loose here to avoid a
// schema drift trap; the canvas adapter narrows it.)
// =============================================================================
export interface AttackPathGraphLateralEdge {
  direction: "incoming" | "outgoing"
  type: string
  neighbor: { id: string; type?: string; labels?: string[]; key_properties?: Record<string, unknown> }
  observed?: boolean
  bytes?: number | null
  hit_count?: number | null
  port?: number | null
  protocol?: string | null
  first_seen?: string | null
  last_seen?: string | null
  on_path?: boolean
}

export interface AttackPathGraphNode {
  id: string
  type?: string
  labels?: string[]
  key_properties?: Record<string, unknown>
}

export interface AttackPathGraphView {
  node_count?: number
  nodes?: AttackPathGraphNode[]
  laterals_by_node?: Record<string, AttackPathGraphLateralEdge[]>
  // Backend may evolve this shape — `unknown` for forward-compat.
  [k: string]: unknown
}

// =============================================================================
// The unified payload itself.
// =============================================================================
export interface AttackPathPayload {
  path_id: string
  system_name: string
  jewel: AttackPathJewelSummary

  // ---- Metadata block (formerly only on IdentityAttackPath) ----
  severity: SeverityBreakdown | null
  evidence_type: "observed" | "configured" | null
  hop_count: number
  path_kind: string | null
  path_kind_tag: "identity" | "network" | "hybrid" | "configured" | null

  // Damage + reduction reasoning ("WHAT CYNTRO WILL CLOSE ON THIS PATH").
  damage_capability: DamageCapability | null
  damage_narrative: string | null
  reduction_narrative: string | null
  risk_reduction: RiskReduction | null
  target_blast_radius: TargetBlastRadius | null

  // Per-role reachable-services data (the "All services in the flow"
  // expansion). Kept loose — consumer is the existing panel.
  reachable_neighbors: ReachableNeighborsByRole[] | null

  // ---- Chain (drives header breadcrumb + canvas on-path overlay) ----
  hops: AttackPathHops

  // ---- Canvas (drives Attacker-View 9-lane render with laterals) ----
  canvas: AttackPathGraphView

  // ---- Sibling paths for the "path X of N" selector ----
  sibling_paths: AttackPathSibling[]
}

// Error envelope returned by the facade on a fan-out failure.
export interface AttackPathFacadeError {
  error: string
  detail?: string
}
