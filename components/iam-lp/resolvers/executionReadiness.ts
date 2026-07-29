import type { DecisionSplit, ExecutionState, IamGapAnalysis } from "../types"

const HARD_COVERAGE_CODES = new Set([
  "usage_not_computed",
  "no_policy_attached",
  "no_policy_data",
  "no_policy_document",
])

function normalizedSet(permissions: readonly string[]): string[] {
  return [...new Set(permissions.map((permission) => permission.trim()).filter(Boolean))].sort()
}

export function permissionSetsEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const a = normalizedSet(left)
  const b = normalizedSet(right)
  return a.length === b.length && a.every((permission, index) => permission === b[index])
}

export function hardCoverageBlockCode(gap: IamGapAnalysis): string | null {
  if (gap.is_remediable !== false) return null
  const code = gap.reason_code?.trim().toLowerCase() ?? ""
  if (HARD_COVERAGE_CODES.has(code) || code.startsWith("no_policy_")) return code
  return null
}

export type ExecutionReadiness = {
  canSimulate: boolean
  canApplySafe: boolean
  canRequestApproval: boolean
  reasons: string[]
}

export function buildExecutionReadiness(
  gap: IamGapAnalysis,
  split: DecisionSplit,
  execution: ExecutionState,
): ExecutionReadiness {
  const reasons: string[] = []
  const coverageBlock = hardCoverageBlockCode(gap)
  if (coverageBlock) reasons.push(`coverage:${coverageBlock}`)
  if (split.conservationError) reasons.push("decision_split_not_conserved")
  if (split.unclassifiedCount > 0) reasons.push("unclassified_permissions")

  const baseHeld = reasons.length > 0
  const simulation = execution.simulation
  const simulatedSetMatches =
    !!simulation &&
    permissionSetsEqual(
      simulation.permissions_to_remove,
      split.autoApplyPermissions,
    )
  const roleMatches =
    !simulation ||
    ((!simulation.role_name || simulation.role_name === gap.role_name) &&
      (!simulation.role_arn || simulation.role_arn === gap.role_arn))

  if (split.autoApplyCount === 0) reasons.push("auto_apply_set_empty")
  if (!simulation?.ok) reasons.push("simulation_not_ready")
  if (!simulation?.plan_token) reasons.push("plan_token_missing")
  if (simulation?.ok && !simulatedSetMatches) reasons.push("simulated_set_mismatch")
  if (simulation?.ok && !roleMatches) reasons.push("simulated_role_mismatch")

  return {
    canSimulate: !baseHeld && split.autoApplyCount + split.needsApprovalCount > 0,
    canApplySafe:
      !baseHeld &&
      split.autoApplyCount > 0 &&
      simulation?.ok === true &&
      !!simulation.plan_token &&
      simulatedSetMatches &&
      roleMatches,
    canRequestApproval:
      !baseHeld && split.needsApprovalCount > 0,
    reasons,
  }
}
