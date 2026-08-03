export type SnapshotServeState = "READY" | "PARTIAL" | "NOT_READY"

export type ExecutiveRisk = {
  id?: string | null
  name?: string | null
  resource_type?: string | null
  system_name?: string | null
  system_names?: string[]
  severity?: string | null
  priority_score?: number | null
  path_count?: number | null
  internet_exposed?: boolean | null
}

export type ExecutiveCandidate = {
  resource_type?: string | null
  resource_id?: string | null
  system?: string | null
  severity?: string | null
  unused_count?: number | null
  total_permissions?: number | null
  can_auto_apply?: boolean
  block_reason?: string | null
  remediation_id?: string | null
}

export type ExecutiveSnapshot = {
  schema_version: 1
  source: "neo4j"
  computed_at: string
  serve_state: SnapshotServeState
  analysis_complete: boolean
  counts_are_partial: boolean
  narrative: {
    tone: "action_required" | "monitor" | "unavailable"
    title: string
    body: string
  }
  material_risk: {
    serve_state: SnapshotServeState
    analysis_complete: boolean
    counts_are_lower_bounds: boolean
    reason?: string | null
    systems_discovered?: number | null
    systems_scanned?: number | null
    systems_uncomputed?: number | null
    attack_paths?: number | null
    crown_jewels?: number | null
    high_risk_targets?: number | null
    critical_risk_targets?: number | null
    externally_exposed_jewels?: number | null
    top_risks?: ExecutiveRisk[]
  }
  remediation: {
    serve_state: SnapshotServeState
    analysis_complete: boolean
    count_scope?: "returned_page" | "classified_risk_findings"
    page_limit?: number | null
    returned_count?: number | null
    ready_on_page?: number | null
    held_on_page?: number | null
    more_may_exist?: boolean | null
    top_candidates?: ExecutiveCandidate[]
  }
  evidence: {
    serve_state: SnapshotServeState
    analysis_complete: boolean
    reason?: string | null
    healthy?: number | null
    degraded?: number | null
    missing?: number | null
    total?: number | null
    top_blockers?: Array<{ source_type: string; reason: string; count: number }>
  }
  outcomes: {
    serve_state: SnapshotServeState
    analysis_complete: boolean
    window_days?: number | null
    permissions_removed?: number | null
    events_count?: number | null
    rollbacks_count?: number | null
    by_day?: Array<{ date: string; permissions_removed: number; events_count: number }>
  }
  error?: string
}

export function isExecutiveSnapshot(raw: unknown): raw is ExecutiveSnapshot {
  if (!raw || typeof raw !== "object") return false
  const p = raw as Partial<ExecutiveSnapshot>
  return (
    p.schema_version === 1 &&
    p.source === "neo4j" &&
    typeof p.computed_at === "string" &&
    typeof p.narrative?.title === "string" &&
    typeof p.material_risk === "object" &&
    typeof p.remediation === "object" &&
    typeof p.evidence === "object" &&
    typeof p.outcomes === "object"
  )
}

/** A snapshot with no measured section must not poison the last verified read. */
export function isCacheableExecutiveSnapshot(raw: unknown): boolean {
  if (!isExecutiveSnapshot(raw)) return false
  if (raw.serve_state === "READY") return true
  return (
    raw.serve_state === "PARTIAL" &&
    typeof raw.material_risk.attack_paths === "number" &&
    typeof raw.material_risk.crown_jewels === "number"
  )
}
