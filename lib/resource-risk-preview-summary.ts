import type { DecisionOutcomeCanonical, SimulateFixSafety } from "@/lib/types"

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
        ? `A safe plan for all ${count} dependent system${count === 1 ? "" : "s"}`
        : "A safe plan for every system using this role",
      action: "Verify each system does not use the permissions proposed for removal, or split the shared role first.",
    })
  }
  if (reasonCodes.has("CUSTOMER_IN_SHADOW_BOOTSTRAP")) {
    add("shadow-bootstrap", {
      label: "Completed automation onboarding",
      action: "Finish the account's safety-onboarding checks before enabling automated changes.",
    })
  }

  if (!safety.rollback_available) {
    add("rollback", {
      label: "A verified rollback path",
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
        label: "Needs review",
        headline: "Review the evidence before changing this role",
        detail: "Cyntro found a viable change, but it requires operator review.",
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
