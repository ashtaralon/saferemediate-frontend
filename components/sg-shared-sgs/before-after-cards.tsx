"use client"

import { ArrowRight, Info } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { KVRow } from "./kv-row"
import type { SharedSGBeforeSummary } from "@/lib/types"

// SG-9d centerpiece. Two cards side-by-side: BEFORE (today's shared
// SG) and AFTER (proposed scoped SGs). The left-border colors anchor
// the operator's eye to the safety contract:
//   BEFORE = amber (over-shared resource, needs attention — NOT
//            "you screwed up". Red would be accusatory before any
//            action has been taken).
//   AFTER  = emerald (decoupled posture, lower blast radius).
// Phase-1 footnote spans both cards so the "are you about to drop
// rules I need?" panic dies at first read.

interface AfterGroupRow {
  group_id: string
  proposed_group_name: string
  system_name: string | null
  consumer_type: string | null
  consumer_count: number
  inbound_count: number
  outbound_count: number
}

export function BeforeAfterCards({
  sgInfo,
  before,
  afterGroups,
  avgBlastAfter,
  reductionPct,
  onJumpToGroup,
}: {
  sgInfo: {
    sg_id?: string
    sg_name?: string
    vpc_id?: string | null
  }
  before: SharedSGBeforeSummary | null
  afterGroups: AfterGroupRow[]
  avgBlastAfter: number | null
  reductionPct: number | null
  onJumpToGroup: (groupId: string) => void
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <BeforeCard sgInfo={sgInfo} before={before} />
        <AfterCard
          afterGroups={afterGroups}
          avgBlastAfter={avgBlastAfter}
          reductionPct={reductionPct}
          onJumpToGroup={onJumpToGroup}
        />
      </div>

      <div className="flex items-start gap-2 text-[12px] text-muted-foreground px-1">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          <b className="text-foreground">Phase 1 (this plan)</b> decouples consumers onto separate SGs.
          Rules are cloned 1:1 from the source SG — no rule changes, no permission removal.
          Rule narrowing arrives in Phase 2 once evidence completeness is HIGH.
        </span>
      </div>
    </div>
  )
}

function BeforeCard({
  sgInfo,
  before,
}: {
  sgInfo: { sg_id?: string; sg_name?: string; vpc_id?: string | null }
  before: SharedSGBeforeSummary | null
}) {
  return (
    <Card className="border-l-4 border-l-amber-500 overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-amber-700 dark:text-amber-300 font-medium">
              Before · Today
            </span>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            1 shared SG
          </span>
        </div>

        <div className="space-y-1">
          <div className="font-mono text-[12px] break-all text-foreground">
            {sgInfo.sg_id || "—"}
          </div>
          <div className="text-sm text-muted-foreground">
            {sgInfo.sg_name || "—"}
          </div>
        </div>

        <KVRow label="VPC" value={sgInfo.vpc_id || "—"} mono />

        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Attachment
          </div>
          <div className="text-lg font-semibold tabular-nums">
            {before?.consumer_count ?? "—"} consumers
          </div>
          <div className="text-xs text-muted-foreground">
            across {before?.system_count ?? "—"} system{before?.system_count === 1 ? "" : "s"}
          </div>
        </div>

        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Rules
          </div>
          <div className="flex items-baseline gap-4">
            <span className="text-sm">
              <b className="tabular-nums">{before?.rules.inbound ?? "—"}</b>{" "}
              <span className="text-muted-foreground text-xs">inbound</span>
            </span>
            <span className="text-sm">
              <b className="tabular-nums">{before?.rules.outbound ?? "—"}</b>{" "}
              <span className="text-muted-foreground text-xs">outbound</span>
            </span>
          </div>
          {before && (
            <ul className="text-xs space-y-0.5 mt-1.5">
              {before.rules.unused_phase2 > 0 && (
                <Phase2Line
                  count={before.rules.unused_phase2}
                  label="marked unused"
                />
              )}
              {before.rules.high_risk_phase2 > 0 && (
                <Phase2Line
                  count={before.rules.high_risk_phase2}
                  label="high-risk"
                />
              )}
              <li className="flex items-center gap-1.5 text-muted-foreground">
                <span className="text-zinc-400">•</span>
                Public ingress:{" "}
                <span
                  className={
                    before.rules.public_ingress
                      ? "text-amber-700 dark:text-amber-300 font-medium"
                      : "text-foreground"
                  }
                >
                  {before.rules.public_ingress ? "yes" : "no"}
                </span>
              </li>
            </ul>
          )}
        </div>

        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-0.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Lateral exposure
          </div>
          <div className="text-sm">
            If any consumer is compromised:{" "}
            <b className="text-amber-700 dark:text-amber-300 tabular-nums">
              {before?.blast_radius_if_any_compromised ?? "—"} others
            </b>{" "}
            exposed
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function Phase2Line({ count, label }: { count: number; label: string }) {
  return (
    <li className="flex items-center gap-1.5 text-muted-foreground">
      <span className="text-zinc-400">•</span>
      <span className="tabular-nums">{count}</span>
      <span>{label}</span>
      <span className="inline-flex items-center px-1.5 py-0 rounded-sm bg-slate-100 dark:bg-slate-800 text-[9px] uppercase tracking-wider text-slate-600 dark:text-slate-300">
        phase 2
      </span>
    </li>
  )
}

function AfterCard({
  afterGroups,
  avgBlastAfter,
  reductionPct,
  onJumpToGroup,
}: {
  afterGroups: AfterGroupRow[]
  avgBlastAfter: number | null
  reductionPct: number | null
  onJumpToGroup: (groupId: string) => void
}) {
  const hasGroups = afterGroups.length > 0
  return (
    <Card className="border-l-4 border-l-emerald-500 overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300 font-medium">
            After · Proposed
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {afterGroups.length} scoped SG{afterGroups.length === 1 ? "" : "s"}
          </span>
        </div>

        {!hasGroups ? (
          <div className="text-sm text-muted-foreground py-4 text-center">
            No eligible groups. See <b>blocked consumers</b> in Overview tab.
          </div>
        ) : (
          <div className="space-y-1.5">
            {afterGroups.map((g) => (
              <button
                key={g.group_id}
                onClick={() => onJumpToGroup(g.group_id)}
                className="w-full text-left flex items-center gap-2 py-1.5 px-2 -mx-2 rounded hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20 transition-colors group"
              >
                <ArrowRight className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">
                    <span className="font-medium">{g.system_name || "—"}</span>
                    <span className="text-muted-foreground"> · {g.consumer_type || "—"}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {g.consumer_count} consumer{g.consumer_count === 1 ? "" : "s"}
                    {" · "}
                    {g.inbound_count} in / {g.outbound_count} out
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-0.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Lateral exposure
          </div>
          <div className="text-sm">
            Avg after split:{" "}
            <b className="text-emerald-700 dark:text-emerald-300 tabular-nums">
              {avgBlastAfter != null ? avgBlastAfter.toFixed(1) : "—"} others
            </b>
            {reductionPct != null && (
              <span className="text-muted-foreground">
                {" "}↘ {reductionPct.toFixed(0)}% reduction
              </span>
            )}
          </div>
        </div>

        <div className="pt-1 text-[11px] text-muted-foreground">
          Each new SG is attached only to its system&apos;s consumers.
        </div>
      </CardContent>
    </Card>
  )
}
