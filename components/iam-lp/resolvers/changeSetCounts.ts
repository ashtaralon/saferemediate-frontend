import type { DecisionSplit, IamGapAnalysis } from "../types"

export type ChangeSetCounts = {
  current: number | null
  observed: number | null
  unused: number | null
  afterSafeApply: number | null
  targetAfterApproval: number | null
}

export function buildChangeSetCounts(
  gap: IamGapAnalysis,
  split: DecisionSplit,
): ChangeSetCounts {
  const current = gap.summary.total_permissions
  return {
    current,
    observed: gap.summary.used_count,
    unused: gap.summary.unused_count,
    afterSafeApply:
      current === null ? null : current - split.autoApplyCount,
    targetAfterApproval:
      current === null
        ? null
        : current - split.autoApplyCount - split.needsApprovalCount,
  }
}
