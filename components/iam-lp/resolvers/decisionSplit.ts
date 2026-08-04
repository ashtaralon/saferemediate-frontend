import type { ConfidenceGroups, DecisionSplit } from "../types"
import { dispositionForGroup } from "./permissionDisposition"

export function buildDecisionSplit(cg: ConfidenceGroups | undefined): DecisionSplit {
  const empty: DecisionSplit = {
    autoApplyCount: 0,
    needsApprovalCount: 0,
    protectedCount: 0,
    autoApplyPermissions: [],
    needsApprovalPermissions: [],
    protectedPermissions: [],
  }

  if (!cg?.groups?.length) return empty

  const out: DecisionSplit = { ...empty }
  for (const group of cg.groups) {
    const disposition = dispositionForGroup(group)
    const permissions = (group.permissions || []).map((p) => p.permission).filter(Boolean)

    if (disposition === "auto_apply") {
      out.autoApplyCount += group.permission_count
      out.autoApplyPermissions.push(...permissions)
    } else if (disposition === "protected") {
      out.protectedCount += group.permission_count
      out.protectedPermissions.push(...permissions)
    } else {
      out.needsApprovalCount += group.permission_count
      out.needsApprovalPermissions.push(...permissions)
    }
  }

  return out
}
