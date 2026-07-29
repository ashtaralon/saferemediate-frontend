import type {
  ConfidenceGroup,
  Disposition,
  PermissionAction,
  PermissionRow,
} from "../types"

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

function serviceForPermission(permission: PermissionRow): string | null {
  if (permission.service_prefix) return permission.service_prefix.toLowerCase()
  const separator = permission.permission.indexOf(":")
  return separator > 0
    ? permission.permission.slice(0, separator).toLowerCase()
    : null
}

/**
 * The modal's existing decision contract, applied to each permission.
 * A restrictive duplicate wins later in buildDecisionSplit.
 */
export function dispositionForPermission(
  permission: PermissionRow,
  group: ConfidenceGroup,
  observedServices: ReadonlySet<string>,
): Disposition {
  if (
    permission.protected ||
    permission.reserved ||
    permission._action === "protected" ||
    permission._action === "reserved" ||
    group.protected ||
    group.action === "protected" ||
    group.action === "reserved"
  ) {
    return "protected"
  }

  if (group.auto_remediable === true) return "auto_apply"

  if (group.block_reason_code === "telemetry_asymmetry") {
    const service = serviceForPermission(permission)
    if (service && observedServices.has(service)) return "auto_apply"
  }

  return "needs_approval"
}
