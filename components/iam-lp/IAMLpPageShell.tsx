"use client"

import { useMemo, useState } from "react"
import { AdvancedDrawer } from "./AdvancedDrawer"
import { ChangeSetCard } from "./ChangeSetCard"
import { EvidenceTable } from "./EvidenceTable"
import { ExecutionPlan } from "./ExecutionPlan"
import { VerdictHero } from "./VerdictHero"
import { buildDecisionSplit } from "./resolvers/decisionSplit"
import type { ExecutionState, IamGapAnalysis } from "./types"

type IAMLpPageShellProps = {
  roleName: string
  systemName?: string
  accountId?: string
  gap: IamGapAnalysis | null
  loading?: boolean
  execution: ExecutionState
  verdictBucket: "blocked" | "manual_review" | "human_approval" | "auto_execute"
  blockedReason?: string | null
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
  verdictBucket,
  blockedReason,
  onSimulate,
  onApplySafeSet,
  onRequestApproval,
  onRollback,
  llmSummary,
}: IAMLpPageShellProps) {
  const [expandedChangeSet, setExpandedChangeSet] = useState(false)
  const split = useMemo(() => buildDecisionSplit(gap?.confidence_groups), [gap])

  if (loading && !gap) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm text-slate-600">Loading IAM least-privilege analysis…</div>
      </section>
    )
  }

  return (
    <section className="space-y-6">
      <header className="rounded-[24px] border border-slate-200 bg-slate-950 px-6 py-5 text-white shadow-sm">
        <div className="text-sm uppercase tracking-[0.16em] text-slate-400">Role</div>
        <div className="mt-1 text-2xl font-semibold">{roleName}</div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-300">
          {systemName && <div>System · {systemName}</div>}
          {accountId && <div>Account · {accountId}</div>}
        </div>
      </header>

      <VerdictHero
        gap={gap}
        split={split}
        execution={execution}
        verdictBucket={verdictBucket}
        blockedReason={blockedReason}
        llmSummary={llmSummary}
      />
      <EvidenceTable gap={gap} />
      <ChangeSetCard
        gap={gap}
        split={split}
        expanded={expandedChangeSet}
        onToggleExpanded={() => setExpandedChangeSet((value) => !value)}
      />
      <ExecutionPlan
        gap={gap}
        split={split}
        execution={execution}
        verdictBucket={verdictBucket}
        blockedReason={blockedReason}
        onSimulate={onSimulate}
        onApplySafeSet={onApplySafeSet}
        onRequestApproval={onRequestApproval}
        onRollback={onRollback}
      />
      <AdvancedDrawer gap={gap} />
    </section>
  )
}
