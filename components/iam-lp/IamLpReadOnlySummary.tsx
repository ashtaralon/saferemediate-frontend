"use client"

import { useMemo, useState } from "react"
import { ChangeSetCard } from "./ChangeSetCard"
import { EvidenceTable } from "./EvidenceTable"
import { VerdictHero } from "./VerdictHero"
import { buildDecisionSplit } from "./resolvers/decisionSplit"
import { normalizeIamGapAnalysis } from "./resolvers/normalizeGap"
import type { ExecutionState, IamGapAnalysisWire } from "./types"

type IamLpReadOnlySummaryProps = {
  gap: IamGapAnalysisWire
  pipelineDecision?: string | null
  pipelineReasons?: string[]
}

export function IamLpReadOnlySummary({
  gap,
  pipelineDecision,
  pipelineReasons,
}: IamLpReadOnlySummaryProps) {
  const [expanded, setExpanded] = useState(false)
  const normalized = useMemo(() => normalizeIamGapAnalysis(gap), [gap])
  const split = useMemo(() => buildDecisionSplit(normalized), [normalized])
  const execution = useMemo<ExecutionState>(
    () =>
      pipelineDecision
        ? {
            gate: {
              decision: pipelineDecision,
              reasons: pipelineReasons,
            },
          }
        : {},
    [pipelineDecision, pipelineReasons],
  )

  return (
    <div className="space-y-3" data-testid="iam-lp-read-only-summary">
      <VerdictHero
        gap={normalized}
        split={split}
        execution={execution}
      />
      <EvidenceTable gap={normalized} />
      <ChangeSetCard
        gap={normalized}
        split={split}
        expanded={expanded}
        onToggleExpanded={() => setExpanded((value) => !value)}
      />
    </div>
  )
}
