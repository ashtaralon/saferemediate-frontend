import type {
  ExecutiveCandidate,
  ExecutiveSnapshot,
  SnapshotServeState,
} from "@/lib/executive-snapshot"

export type SystemPath = {
  path_id?: string | null
  source_name?: string | null
  source_type?: string | null
  crown_jewel_id?: string | null
  crown_jewel_name?: string | null
  severity?: string | null
  score?: number | null
  impact_headline?: string | null
  impact_confidence?: string | null
  damage_types?: string[]
  evidence_type?: string | null
  identity_gate?: string | null
  route_gate?: string | null
  data_plane_gate?: string | null
}

export type ResourceRiskFinding = {
  resource_name?: string | null
  resource_arn?: string | null
  resource_type?: string | null
  category?: string | null
  severity?: string | null
  attacker_narrative?: string | null
  remediation_id?: string | null
  classified_at?: string | null
}

export type SystemExecutiveSnapshot = Omit<ExecutiveSnapshot, "material_risk" | "outcomes"> & {
  system_name: string
  material_risk: ExecutiveSnapshot["material_risk"] & { top_paths?: SystemPath[] }
  resource_risk: {
    serve_state: SnapshotServeState
    analysis_complete: boolean
    total?: number | null
    by_severity?: Record<string, number>
    by_category?: Record<string, number>
    top_findings?: ResourceRiskFinding[]
  }
  remediation: ExecutiveSnapshot["remediation"] & { top_candidates?: ExecutiveCandidate[] }
  context: {
    serve_state: SnapshotServeState
    analysis_complete: boolean
    resource_count?: number | null
    resource_families?: Record<string, number>
    account_id?: string | null
    region?: string | null
    environment?: string | null
    criticality?: string | null
  }
  outcomes: {
    serve_state: SnapshotServeState
    analysis_complete: boolean
    window_days?: number | null
    permissions_removed?: number | null
    events_count?: number | null
    rollbacks_count?: number | null
    latest_event?: Record<string, unknown> | null
  }
}

export function isSystemExecutiveSnapshot(raw: unknown): raw is SystemExecutiveSnapshot {
  if (!raw || typeof raw !== "object") return false
  const value = raw as Partial<SystemExecutiveSnapshot>
  return (
    value.schema_version === 1 &&
    value.source === "neo4j" &&
    typeof value.system_name === "string" &&
    typeof value.computed_at === "string" &&
    typeof value.material_risk === "object" &&
    typeof value.resource_risk === "object" &&
    typeof value.remediation === "object" &&
    typeof value.context === "object"
  )
}

export function isCacheableSystemExecutiveSnapshot(raw: unknown): boolean {
  if (!isSystemExecutiveSnapshot(raw)) return false
  if (raw.serve_state === "READY") return true
  return raw.serve_state === "PARTIAL" && typeof raw.material_risk.attack_paths === "number"
}
