import type { ConfidenceGroup, Disposition, PermissionAction } from "../types"

export function dispositionForGroup(g: ConfidenceGroup): Disposition {
  if (g.protected || g.action === "protected" || g.action === "reserved") {
    return "protected"
  }
  if (g.auto_remediable === true && g.action === "safe_to_remove") {
    return "auto_apply"
  }
  return "needs_approval"
}

export function dispositionForAction(
  action: PermissionAction,
  autoRemediable: boolean,
): Disposition {
  if (action === "protected" || action === "reserved") return "protected"
  if (autoRemediable && action === "safe_to_remove") return "auto_apply"
  return "needs_approval"
}
