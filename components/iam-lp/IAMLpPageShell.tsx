"use client"

import { useMemo, useState } from "react"
import { AdvancedDrawer } from "./AdvancedDrawer"
import { ChangeSetCard } from "./ChangeSetCard"
import { EvidenceTable } from "./EvidenceTable"
import { ExecutionPlan } from "./ExecutionPlan"
import { VerdictHero } from "./VerdictHero"
import { buildDecisionSplit } from "./resolvers/decisionSplit"
import { normalizeIamGapAnalysis } from "./resolvers/normalizeGap"
import type { ExecutionState, IamGapAnalysisWire } from "./types"

type IAMLpPageShellProps = {
  roleName: string
  systemName?: string
  accountId?: string
  gap: IamGapAnalysisWire | null
  loading?: boolean
  execution: ExecutionState
  onSimulate: (permissions: string[]) => Promise<void>
  onApplySafeSet: (permissions: string[]) => Promise<void>
  onRequestApproval: (permissions: string[]) => Promise<void>
  onRollback: () => Promise<void>
  llmSummary?: { executive: string; evidence: string; change: string } | null
}

export function IAMLpPageShell({
  roleName,
  systemName,
  accountId,
  gap,
  loading = false,
  execution,
  onSimulate,
  onApplySafeSet,
  onRequestApproval,
  onRollback,
  llmSummary,
}: IAMLpPageShellProps) {
  const [expandedChangeSet, setExpandedChangeSet] = useState(false)
  const normalizedGap = useMemo(
    () => (gap ? normalizeIamGapAnalysis(gap) : null),
    [gap],
  )
  const split = useMemo(() => buildDecisionSplit(normalizedGap), [normalizedGap])

  if (loading && !gap) {
    return (
      <section className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm text-slate-600">Loading IAM least-privilege analysis…</div>
      </section>
    )
  }

  return (
    <section className="space-y-6">
      <header className="rounded-[28px] border border-slate-200 bg-slate-950 px-6 py-5 text-white shadow-sm">
        <div className="text-sm uppercase tracking-[0.16em] text-slate-400">Role</div>
        <div className="mt-1 text-2xl font-semibold">{roleName}</div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-300">
          {systemName && <div>System · {systemName}</div>}
          {accountId && <div>Account · {accountId}</div>}
        </div>
      </header>

      <VerdictHero gap={normalizedGap} split={split} execution={execution} llmSummary={llmSummary} />
      <EvidenceTable gap={normalizedGap} />
      <ChangeSetCard
        gap={normalizedGap}
        split={split}
        expanded={expandedChangeSet}
        onToggleExpanded={() => setExpandedChangeSet((value) => !value)}
      />
      <ExecutionPlan
        gap={normalizedGap}
        split={split}
        execution={execution}
        onSimulate={onSimulate}
        onApplySafeSet={onApplySafeSet}
        onRequestApproval={onRequestApproval}
        onRollback={onRollback}
      />
      <AdvancedDrawer gap={normalizedGap} />
    </section>
  )
}
