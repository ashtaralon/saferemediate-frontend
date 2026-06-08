// Type contracts for the unified Shared Resources surface.
// Mirrors docs/shared-resources-real-data-wiring.md (backend repo)
// §1 (list), §2 (narrowing-diff per resource), §3 (journey).
//
// Empirical shape audit 2026-06-01 against live alon-prod endpoints:
//
//  - /api/iam/shared-roles returns rows with the narrowing fields at
//    the TOP LEVEL of each row (NOT nested under a `narrowing` block).
//    Spec §1 example shows the `narrowing` block; reality differs.
//  - /api/sg/shared-sgs returns rows with the narrowing fields nested
//    under `narrowing` (matches spec §1 example).
//
// We normalize at the type layer with two row shapes + a discriminated
// union. The frontend's list view picks the right field path per type.

import type { LucideIcon } from "lucide-react"

export type HeadlineState =
  | "no_lp_data"
  | "no_rule_data"
  | "already_tight"
  | "awaiting_observation"
  | "narrowing_available"

export interface NarrowingMetrics {
  allowed_count: number
  keep_count: number
  narrow_count: number
  investigation_count: number
  narrowable_pct: number
  headline_state: HeadlineState
  is_platform_owned: boolean
  sort_score: number
}

/** IAM shared role list row — narrowing fields at TOP LEVEL. */
export interface SharedRoleRow extends NarrowingMetrics {
  type: "iam-role"
  role_arn: string
  role_name: string
  resource_type: "IAMRole"
  consumer_count: number
  consumer_kinds: Record<string, number>
  system_tags: string[]
  cross_system: boolean
  legacy_narrowable_pct?: number
  has_active_plan: boolean
  active_plan_id: string | null
}

/** SG shared SG list row — narrowing fields nested under .narrowing. */
export interface SharedSGRowRaw {
  sg_id: string
  sg_name: string
  vpc_id: string
  owner_id: string
  consumer_count: number
  consumer_breakdown: Record<string, number>
  rule_summary: {
    inbound: number
    outbound: number
    unused: number
    high_risk: number
    has_public_ingress: boolean
  }
  topology: {
    systems: string[]
    vpcs: string[]
  }
  freshness: {
    ingress_hash: string
    egress_hash: string
    last_synced: string | null
  }
  verdict: {
    discovery_candidate: boolean
    proposal_allowed: boolean
    create_only_allowed: boolean
    staged_allowed: boolean
    blocked_reasons: Array<{
      code: string
      phase_blocked: string
      message: string
      severity: string
    }>
  }
  narrowing: NarrowingMetrics & { traffic_ports_observed?: number }
}

/** Normalized SG row — narrowing fields hoisted to top level for
 *  uniform consumption alongside SharedRoleRow. */
export type SharedSGRow = NarrowingMetrics & {
  type: "security-group"
  sg_id: string
  sg_name: string
  vpc_id: string
  consumer_count: number
  consumer_breakdown: Record<string, number>
  rule_summary: SharedSGRowRaw["rule_summary"]
  traffic_ports_observed: number
  has_blocked_reasons: boolean
  blocked_reasons: SharedSGRowRaw["verdict"]["blocked_reasons"]
}

/** Discriminated union for unified rendering. */
export type SharedResourceRow = SharedRoleRow | SharedSGRow

/** Narrowing-diff response (per resource detail). */
export interface NarrowingDiff {
  resource_type: "iam-role" | "security-group"
  resource_arn?: string
  resource_id?: string
  resource_name?: string
  role_name?: string
  allowed_count: number
  keep_count: number
  narrow_count: number
  investigation_count: number
  narrowable_pct: number
  keep: Array<NarrowingDiffEntry>
  narrow_away: Array<NarrowingDiffEntry>
  investigate: Array<NarrowingDiffEntry>
  evidence_quality: {
    aggregate_c_source: number
    weakest_source: string
    writer: string
  }
  substrate_metadata: Record<string, string | number | null>
}

/** IAM uses {action, call_count, last_seen, observation_patterns,
 *  conflict_type}; SG uses {direction, protocol, from_port, to_port,
 *  cidr, matched_traffic_count, last_observed_at, reason,
 *  conflict_type, observed_source, traffic_count, port}. Render-side
 *  branches on which fields are present. */
export interface NarrowingDiffEntry {
  // IAM fields
  action?: string
  call_count?: number
  last_seen?: string | null
  observation_patterns?: string[]
  // SG fields
  direction?: "inbound" | "outbound"
  protocol?: string
  from_port?: number | null
  to_port?: number | null
  cidr?: string
  matched_traffic_count?: number
  last_observed_at?: string | null
  observed_source?: string
  traffic_count?: number
  port?: number
  // Shared
  reason?: string
  conflict_type?: string
}

/** Journey response — proposal lifecycle. */
export interface NarrowingProposalJourney {
  proposal_id: string
  resource_type: "iam-role" | "security-group"
  target_arn: string
  journey_step: 1 | 2 | 3
  journey_step_label: string
  scoped_roles_planned: number
  scoped_roles_created: number
  consumers_planned: number
  consumers_migrated: number
  shared_role_deletion_state: "pending" | "in_progress" | "completed"
  created_at: string
  approved_at: string | null
  approved_by: string | null
  derived_progress_pct: number
}

/** Headline state → operator-readable label + Tailwind class set.
 *  Per spec §1 chip-render-hints + feedback_signal_language:
 *  descriptive, not accusative. */
export const HEADLINE_STATE_PRESENTATION: Record<
  HeadlineState,
  { label: string; chipClass: string; tooltip: string }
> = {
  no_lp_data: {
    label: "No data",
    chipClass: "bg-slate-700/40 border-slate-600 text-slate-400",
    tooltip:
      "No least-privilege analysis data available yet for this resource — substrate hasn't observed enough behavior to compute keep/narrow recommendations.",
  },
  no_rule_data: {
    label: "No data",
    chipClass: "bg-slate-700/40 border-slate-600 text-slate-400",
    tooltip:
      "No SG rule analysis data available yet — substrate hasn't synced rules + traffic for this group.",
  },
  already_tight: {
    label: "Already tight",
    chipClass: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
    tooltip:
      "Every allowed action/rule has observed activity — no narrowing opportunity. The resource is already as tight as the observed evidence supports.",
  },
  awaiting_observation: {
    label: "Evidence pending",
    chipClass: "bg-amber-500/15 border-amber-500/40 text-amber-300",
    tooltip:
      "Substrate flagged this as potentially narrowable, but no positive activity is observed yet. Wait for more behavioral data before acting (or investigate manually).",
  },
  narrowing_available: {
    label: "Narrowable",
    chipClass: "bg-teal-500/15 border-teal-500/40 text-teal-300",
    tooltip:
      "Observed activity supports narrowing — high-confidence opportunity. Open detail for the keep / narrow-away / investigate breakdown.",
  },
}
