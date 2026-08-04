import type {
  DecisionSplit,
  Disposition,
  IamGapAnalysis,
  PermissionRow,
} from "../types"
import { dispositionForPermission } from "./permissionDisposition"

const PRECEDENCE: Record<Disposition, number> = {
  auto_apply: 1,
  needs_approval: 2,
  protected: 3,
}

function permissionService(permission: string): string | null {
  const separator = permission.indexOf(":")
  return separator > 0 ? permission.slice(0, separator).toLowerCase() : null
}

function permissionKey(permission: string): string {
  return permission.trim().toLowerCase()
}

function explicitUnusedRows(gap: IamGapAnalysis): PermissionRow[] {
  return [
    ...gap.unused_permissions,
    ...gap.permissions_analysis.filter(
      (permission) => permission.status?.toUpperCase() === "UNUSED",
    ),
  ]
}

export function buildDecisionSplit(gap: IamGapAnalysis | null | undefined): DecisionSplit {
  const expectedUnusedCount = gap?.summary.unused_count ?? null
  const empty: DecisionSplit = {
    autoApplyCount: 0,
    needsApprovalCount: 0,
    protectedCount: 0,
    unclassifiedCount: expectedUnusedCount ?? 0,
    identifiedUnusedCount: 0,
    missingPermissionIdentityCount: expectedUnusedCount ?? 0,
    expectedUnusedCount,
    autoApplyPermissions: [],
    needsApprovalPermissions: [],
    protectedPermissions: [],
    unclassifiedPermissions: [],
    conservationError: expectedUnusedCount !== 0,
    conservationErrors:
      expectedUnusedCount === 0
        ? []
        : expectedUnusedCount === null
          ? ["unused_count_missing"]
          : ["unused_permission_identities_missing"],
  }
  if (!gap) return empty

  const observedServices = new Set<string>()
  for (const permission of gap.used_permissions) {
    const service = permissionService(permission.permission)
    if (service) observedServices.add(service)
  }

  const decisions = new Map<
    string,
    { permission: string; disposition: Disposition | "unclassified" }
  >()

  for (const group of gap.confidence_groups.groups) {
    for (const permission of group.permissions) {
      const key = permissionKey(permission.permission)
      if (!key) continue
      const next = dispositionForPermission(permission, group, observedServices)
      const current = decisions.get(key)
      if (
        !current ||
        current.disposition === "unclassified" ||
        PRECEDENCE[next] > PRECEDENCE[current.disposition]
      ) {
        decisions.set(key, { permission: permission.permission, disposition: next })
      }
    }
  }

  for (const permission of explicitUnusedRows(gap)) {
    const key = permissionKey(permission.permission)
    if (!key) continue
    if (
      permission.protected ||
      permission.reserved ||
      permission._action === "protected" ||
      permission._action === "reserved"
    ) {
      decisions.set(key, {
        permission: permission.permission,
        disposition: "protected",
      })
    } else if (!decisions.has(key)) {
      decisions.set(key, {
        permission: permission.permission,
        disposition: "unclassified",
      })
    }
  }

  const autoApplyPermissions: string[] = []
  const needsApprovalPermissions: string[] = []
  const protectedPermissions: string[] = []
  const unclassifiedPermissions: string[] = []

  for (const decision of decisions.values()) {
    if (decision.disposition === "auto_apply") {
      autoApplyPermissions.push(decision.permission)
    } else if (decision.disposition === "needs_approval") {
      needsApprovalPermissions.push(decision.permission)
    } else if (decision.disposition === "protected") {
      protectedPermissions.push(decision.permission)
    } else {
      unclassifiedPermissions.push(decision.permission)
    }
  }

  const sort = (items: string[]) => items.sort((a, b) => a.localeCompare(b))
  sort(autoApplyPermissions)
  sort(needsApprovalPermissions)
  sort(protectedPermissions)
  sort(unclassifiedPermissions)

  const identifiedUnusedCount = decisions.size
  const missingPermissionIdentityCount =
    expectedUnusedCount === null
      ? 0
      : Math.max(0, expectedUnusedCount - identifiedUnusedCount)
  const unclassifiedCount =
    unclassifiedPermissions.length + missingPermissionIdentityCount
  const conservationErrors: string[] = []

  if (expectedUnusedCount === null) {
    conservationErrors.push("unused_count_missing")
  } else if (identifiedUnusedCount < expectedUnusedCount) {
    conservationErrors.push("unused_permission_identities_missing")
  } else if (identifiedUnusedCount > expectedUnusedCount) {
    conservationErrors.push("identified_unused_exceeds_unused_count")
  }

  const { total_permissions: total, used_count: used, unused_count: unused } = gap.summary
  if (total === null || used === null || unused === null) {
    conservationErrors.push("summary_counts_missing")
  } else if (used + unused !== total) {
    conservationErrors.push("summary_counts_do_not_conserve")
  }

  return {
    autoApplyCount: autoApplyPermissions.length,
    needsApprovalCount: needsApprovalPermissions.length,
    protectedCount: protectedPermissions.length,
    unclassifiedCount,
    identifiedUnusedCount,
    missingPermissionIdentityCount,
    expectedUnusedCount,
    autoApplyPermissions,
    needsApprovalPermissions,
    protectedPermissions,
    unclassifiedPermissions,
    conservationError: conservationErrors.length > 0 || unclassifiedCount > 0,
    conservationErrors,
  }
}
