import type { DecisionOutcomeCanonical, SimulateFixProblem, SimulateFixSafety } from "@/lib/types"

export interface PreviewPermissionCounts {
  usedCount: number
  unusedCount: number
  totalCount: number
  unusedPercent: number
}

export function previewPermissionCounts(
  problem: SimulateFixProblem | null | undefined,
  fallback: Omit<PreviewPermissionCounts, "unusedPercent">,
): PreviewPermissionCounts {
  const hasPreviewCounts = Number.isFinite(problem?.used_count)
    && Number.isFinite(problem?.unused_count)
    && (problem?.used_count ?? -1) >= 0
    && (problem?.unused_count ?? -1) >= 0

  const usedCount = hasPreviewCounts ? problem!.used_count : fallback.usedCount
  const unusedCount = hasPreviewCounts ? problem!.unused_count : fallback.unusedCount
  const totalCount = hasPreviewCounts ? usedCount + unusedCount : fallback.totalCount
  const unusedPercent = hasPreviewCounts && Number.isFinite(problem?.gap_percent)
    ? Math.max(0, Math.min(100, Math.round(problem!.gap_percent)))
    : totalCount > 0
      ? Math.round((unusedCount / totalCount) * 100)
      : 0

  return { usedCount, unusedCount, totalCount, unusedPercent }
}

export function simulationPlanCounts(
  problem: SimulateFixProblem | null | undefined,
  requestedRemovalCount: number,
  fallback: Omit<PreviewPermissionCounts, "unusedPercent">,
): {
  removeCount: number
  remainCount: number
  observedUsedCount: number
  totalCount: number
} {
  const counts = previewPermissionCounts(problem, fallback)
  const removeCount = Math.max(0, Math.min(counts.totalCount, requestedRemovalCount))
  return {
    removeCount,
    remainCount: counts.totalCount - removeCount,
    observedUsedCount: counts.usedCount,
    totalCount: counts.totalCount,
  }
}

export interface PreviewNeed {
  id: string
  label: string
  action: string
}

const PLANE_COPY: Record<string, Omit<PreviewNeed, "id">> = {
  cloudtrail: {
    label: "CloudTrail activity history",
    action: "Connect or resync CloudTrail activity for this account.",
  },
  config: {
    label: "AWS Config inventory",
    action: "Enable or resync AWS Config for this account.",
  },
  access_advisor: {
    label: "IAM Access Advisor usage",
    action: "Collect service-level last-accessed data for this role.",
  },
  behavioral_pu: {
    label: "Behavioral permission-usage evidence",
    action: "Enable permission-usage collection and let the next sync complete.",
  },
  flow_logs: {
    label: "VPC Flow Logs",
    action: "Enable or connect VPC Flow Logs for this account.",
  },
  s3_access: {
    label: "S3 data-access activity",
    action: "Enable or connect S3 data-event collection.",
  },
}

const SOURCE_COPY: Record<string, Omit<PreviewNeed, "id">> = {
  ROLE_CONSUMERS: {
    label: "Complete role-to-workload mapping",
    action: "Resync the identity graph so every workload using this role is known.",
  },
  BEHAVIORAL_MAP: {
    label: "Identity dependency graph",
    action: "Restore or resync the behavioral map for this account.",
  },
  TELEMETRY: {
    label: "Role activity evidence",
    action: "Connect the required activity sources and run data collection.",
  },
  TELEMETRY_PLANES: {
    label: "Complete evidence coverage",
    action: "Enable the missing evidence sources listed here.",
  },
}

export function previewEvidenceNeeds(safety: SimulateFixSafety): PreviewNeed[] {
  const needs: PreviewNeed[] = []
  const seen = new Set<string>()
  const add = (id: string, copy?: Omit<PreviewNeed, "id">) => {
    if (!copy || seen.has(id)) return
    seen.add(id)
    needs.push({ id, ...copy })
  }

  for (const plane of safety.telemetry_planes_missing ?? []) {
    add(`plane:${plane}`, PLANE_COPY[plane])
  }

  for (const source of safety.missing_evidence_sources ?? []) {
    // Exact plane names are more useful than the generic umbrella item.
    if (source === "TELEMETRY_PLANES" && (safety.telemetry_planes_missing?.length ?? 0) > 0) continue
    add(`source:${source}`, SOURCE_COPY[source])
  }

  const reasonCodes = new Set(safety.decision_reason_codes ?? [])
  if (reasonCodes.has("SHARED_ROLE_WITHOUT_SPLIT_PLAN")) {
    const count = safety.consumer_count ?? 0
    add("shared-role", {
      label: count > 0
        ? `This role is shared by ${count} system${count === 1 ? "" : "s"}`
        : "This role is shared by multiple systems",
      action: "Verify those systems do not need the permissions, or split the role.",
    })
  }
  if (reasonCodes.has("CUSTOMER_IN_SHADOW_BOOTSTRAP")) {
    add("shadow-bootstrap", {
      label: "Safety onboarding is not complete",
      action: "Complete this account's safety checks.",
    })
  }

  if (!safety.rollback_available) {
    add("rollback", {
      label: "Rollback is not ready",
      action: "Create and verify a restorable IAM policy snapshot.",
    })
  }

  return needs
}

export function automationReadiness(decision?: DecisionOutcomeCanonical | null): {
  label: string
  headline: string
  detail: string
  tone: "ready" | "review" | "paused"
} {
  switch (decision) {
    case "AUTO_EXECUTE":
      return {
        label: "Ready",
        headline: "Cyntro can safely apply this change",
        detail: "Required evidence and rollback checks passed.",
        tone: "ready",
      }
    case "CANARY_FIRST":
      return {
        label: "Canary first",
        headline: "Start with a limited change",
        detail: "Cyntro has enough evidence to test the change on a controlled scope first.",
        tone: "review",
      }
    case "REQUIRE_APPROVAL":
      return {
        label: "Approval required",
        headline: "The change is ready for human approval",
        detail: "Cyntro will not apply it until an authorized operator approves.",
        tone: "review",
      }
    case "MANUAL_REVIEW":
      return {
        label: "Review required",
        headline: "Cyntro will not change this role yet",
        detail: "A person must review the proposed change before it can be applied.",
        tone: "review",
      }
    case "BLOCK":
    case "EXCLUDE":
    default:
      return {
        label: "Not ready",
        headline: "Cyntro will not change this role yet",
        detail: "The over-permission finding is separate. This hold means Cyntro cannot yet prove the proposed removal is safe.",
        tone: "paused",
      }
  }
}
