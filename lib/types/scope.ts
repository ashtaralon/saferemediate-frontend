/** Canonical scope enums — mirrors unified/enums.py (multi_account_boundaries.md). */

export type TenantOwnership =
  | "owned"
  | "linked_managed"
  | "linked_unmanaged"
  | "external"
  | "unknown"

export type EvidenceTier =
  | "full"
  | "silent_but_healthy"
  | "cloudtrail_only"
  | "traffic_only"
  | "inventory_only"
  | "not_onboarded"

export type EdgeEvidence = "observed" | "configured" | "inferred" | "unknown"

export type EdgeType = "control_plane" | "data_plane" | "network"

export const TENANT_OWNERSHIP_VALUES: readonly TenantOwnership[] = [
  "owned",
  "linked_managed",
  "linked_unmanaged",
  "external",
  "unknown",
]

export const EVIDENCE_TIER_VALUES: readonly EvidenceTier[] = [
  "full",
  "silent_but_healthy",
  "cloudtrail_only",
  "traffic_only",
  "inventory_only",
  "not_onboarded",
]

export const EVIDENCE_TIER_LABEL: Record<EvidenceTier, string> = {
  full: "full",
  silent_but_healthy: "silent",
  cloudtrail_only: "CT only",
  traffic_only: "traffic only",
  inventory_only: "inventory",
  not_onboarded: "not onboarded",
}
