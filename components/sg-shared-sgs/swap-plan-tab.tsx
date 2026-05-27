"use client"

import { Camera, Plus, ShieldCheck, Tag, Lock, Repeat, Clock } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { SharedSGSwapPlan } from "@/lib/types"

// SG-9d Swap-plan tab. Answers "what will Apply actually do?" — the
// biggest UX gap in today's view. Two sections:
//
//   Phase 1: CREATE_ONLY stepper (snapshot → create → authorize → tag)
//   Phase 2: per-consumer-kind cards (Lambda atomic vs ENI parallel)
//
// Each per-kind card explicitly states the AWS API, the mechanism,
// downtime, and rollback path. SG-7b kinds are visible but disabled,
// with a "Coming in SG-7b" chip — we surface them so operators see
// the full plan, not just what's shippable today.

const PHASE_1_STEP_META: Record<string, { label: string; icon: any; desc: string }> = {
  snapshot_source_state: {
    label: "Snapshot source SG",
    icon: Camera,
    desc: "Writes SGSnapshot row to Neo4j + S3 before any mutation.",
  },
  create_scoped_sgs: {
    label: "Create scoped SGs",
    icon: Plus,
    desc: "boto3 CreateSecurityGroup, one per system×kind grouping.",
  },
  authorize_cloned_rules: {
    label: "Authorize cloned rules",
    icon: ShieldCheck,
    desc: "Revoke AWS default egress + authorize the parent SG's rules verbatim.",
  },
  tag_cyntro_plan_id: {
    label: "Tag with plan id",
    icon: Tag,
    desc: "cyntro:plan_id + cyntro:source_sg tags — rollback + sweeper key off these.",
  },
}

export function SwapPlanTab({ swapPlan }: { swapPlan: SharedSGSwapPlan | null }) {
  if (!swapPlan) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Swap plan unavailable for this plan.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <Phase1Card phase1={swapPlan.phase_1} />
      <Phase2Section perKind={swapPlan.phase_2_per_consumer_kind} />
    </div>
  )
}

function Phase1Card({ phase1 }: { phase1: SharedSGSwapPlan["phase_1"] }) {
  return (
    <Card className="border-l-4 border-l-emerald-500">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider font-medium text-emerald-700 dark:text-emerald-300">
              Phase 1 · CREATE_ONLY
            </span>
            <Badge
              variant="outline"
              className="text-[9px] uppercase tracking-wider border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300"
            >
              executable today
            </Badge>
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {phase1.downtime_seconds === 0 ? "0 s downtime" : `${phase1.downtime_seconds} s`}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          {phase1.steps.map((stepKey, idx) => {
            const meta = PHASE_1_STEP_META[stepKey] || {
              label: stepKey,
              icon: Lock,
              desc: "",
            }
            const Icon = meta.icon
            return (
              <div
                key={stepKey}
                className="relative p-3 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40"
              >
                <div className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] flex items-center justify-center font-medium tabular-nums">
                  {idx + 1}
                </div>
                <Icon className="w-4 h-4 text-emerald-700 dark:text-emerald-300 mb-1.5" />
                <div className="text-xs font-medium">{meta.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                  {meta.desc}
                </div>
              </div>
            )
          })}
        </div>

        <div className="text-[11px] text-muted-foreground border-t border-zinc-200 dark:border-zinc-800 pt-2">
          <b className="text-foreground">Consumer impact:</b>{" "}
          {phase1.consumer_impact === "none"
            ? "none — no consumer is modified in Phase 1. The source SG remains attached to every existing consumer. Scoped SGs are created and parked, awaiting Phase 2 swap."
            : phase1.consumer_impact}
        </div>
      </CardContent>
    </Card>
  )
}

function Phase2Section({
  perKind,
}: {
  perKind: SharedSGSwapPlan["phase_2_per_consumer_kind"]
}) {
  const kinds = Object.entries(perKind)
  if (kinds.length === 0) {
    return null
  }

  // Sort: supported_in_v1 first (so the operator sees what's actionable),
  // then by consumer_count descending.
  const sorted = [...kinds].sort(([, a], [, b]) => {
    if (a.supported_in_v1 !== b.supported_in_v1) {
      return a.supported_in_v1 ? -1 : 1
    }
    return (b.consumer_count || 0) - (a.consumer_count || 0)
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider font-medium text-foreground">
          Phase 2 · STAGED swap
        </span>
        <span className="text-[10px] text-muted-foreground">
          per consumer kind · executed opt-in, one at a time
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {sorted.map(([kind, descriptor]) => (
          <Phase2KindCard key={kind} kind={kind} descriptor={descriptor} />
        ))}
      </div>
    </div>
  )
}

function Phase2KindCard({
  kind,
  descriptor,
}: {
  kind: string
  descriptor: SharedSGSwapPlan["phase_2_per_consumer_kind"][string]
}) {
  const supported = descriptor.supported_in_v1
  const mechIsAtomic = descriptor.mechanism === "atomic_set_replace"
  const mechIsParallel = descriptor.mechanism === "parallel_attach_then_detach"
  const borderTone = supported
    ? "border-l-emerald-500"
    : "border-l-slate-400"

  return (
    <Card className={`border-l-4 ${borderTone}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{kind}</span>
            <Badge variant="outline" className="text-[10px] tabular-nums">
              {descriptor.consumer_count} consumer{descriptor.consumer_count === 1 ? "" : "s"}
            </Badge>
          </div>
          {supported ? (
            <Badge
              variant="outline"
              className="text-[9px] uppercase tracking-wider border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300"
            >
              v1 ready
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-[9px] uppercase tracking-wider border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300"
            >
              SG-7b · pending
            </Badge>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline gap-2 text-[11px]">
            <span className="text-muted-foreground uppercase tracking-wide">Mechanism</span>
            <span className="font-mono text-foreground">{descriptor.mechanism}</span>
          </div>
          <div className="flex items-baseline gap-2 text-[11px]">
            <span className="text-muted-foreground uppercase tracking-wide">AWS API</span>
            <span className="font-mono text-foreground">{descriptor.aws_api || "—"}</span>
          </div>
          <div className="flex items-baseline gap-2 text-[11px]">
            <span className="text-muted-foreground uppercase tracking-wide">Downtime</span>
            <span className="text-foreground tabular-nums">
              {descriptor.downtime_seconds === 0
                ? "0 seconds"
                : descriptor.downtime_seconds == null
                ? "unknown"
                : `${descriptor.downtime_seconds} s`}
            </span>
          </div>
          <div className="flex items-baseline gap-2 text-[11px]">
            <span className="text-muted-foreground uppercase tracking-wide">Rollback</span>
            <span className="text-foreground font-mono">{descriptor.rollback}</span>
          </div>
        </div>

        {mechIsAtomic && <AtomicMechanismDiagram />}
        {mechIsParallel && <ParallelMechanismDiagram />}

        <div className="text-[11px] text-muted-foreground border-t border-zinc-200 dark:border-zinc-800 pt-2">
          {descriptor.human_summary}
        </div>
      </CardContent>
    </Card>
  )
}

// Tiny illustrative diagrams. Pure CSS, no SVG sprite — keeps the
// component portable.

function AtomicMechanismDiagram() {
  return (
    <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
        How the swap fires
      </div>
      <div className="flex items-center gap-2 text-[10px] font-mono">
        <span className="px-2 py-1 rounded bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800/40">
          [sg-source]
        </span>
        <span className="text-muted-foreground">→ one API call →</span>
        <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-800/40">
          [sg-scoped]
        </span>
      </div>
      <div className="text-[10px] text-muted-foreground mt-1.5">
        Atomic at AWS API level. No transient two-SG state.
      </div>
    </div>
  )
}

function ParallelMechanismDiagram() {
  return (
    <div className="rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
        How the swap fires
      </div>
      <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
        <Stage
          label="Today"
          chips={[{ text: "sg-source", tone: "amber" }]}
        />
        <Stage
          label="Step 1: attach"
          chips={[
            { text: "sg-source", tone: "amber" },
            { text: "sg-scoped", tone: "emerald" },
          ]}
        />
        <Stage
          label="Step 2: detach"
          chips={[{ text: "sg-scoped", tone: "emerald" }]}
        />
      </div>
      <div className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
        <Repeat className="w-2.5 h-2.5" />
        Zero downtime: rule union = either side alone (v1 clones verbatim).
      </div>
    </div>
  )
}

function Stage({
  label,
  chips,
}: {
  label: string
  chips: { text: string; tone: "amber" | "emerald" }[]
}) {
  return (
    <div className="space-y-1">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="space-y-0.5">
        {chips.map((c, i) => (
          <div
            key={i}
            className={[
              "px-1.5 py-0.5 rounded text-center border text-[10px]",
              c.tone === "amber"
                ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800/40"
                : "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-800/40",
            ].join(" ")}
          >
            {c.text}
          </div>
        ))}
      </div>
    </div>
  )
}
