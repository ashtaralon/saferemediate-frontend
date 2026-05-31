"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { BackToDashboard } from "@/components/back-to-dashboard"
import { ExecuteActions } from "@/components/iam-shared-roles-execute-actions"
import { ExecutionHistory } from "@/components/iam-shared-roles-execution-history"
import { GateReadinessPanel } from "@/components/iam-shared-roles-gate-readiness"
import { ReplayVerifyPanel } from "@/components/iam-shared-roles-replay-verify"
import {
  approveSplitPlan,
  fetchSimulationRun,
  fetchSplitPlan,
  postSimulate,
} from "@/lib/api-client"
import type {
  ConsumerEvidence,
  EvidenceState,
  SplitPlan,
  SplitPlanGroup,
  SplitPlanState,
} from "@/lib/types"
import type {
  SimulationRun,
} from "@/lib/types/atlas-simulate"

interface Props {
  planId: string
}

// ─── Color maps ────────────────────────────────────────────────────

const STATE_COLORS: Record<SplitPlanState, string> = {
  PROPOSED: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-700/50",
  APPROVED: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-700/50",
  EXECUTING: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-700/50",
  EXECUTED: "bg-zinc-100 text-zinc-900 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-200 dark:border-zinc-700",
  REJECTED: "bg-red-100 text-red-900 border-red-300 dark:bg-red-950/40 dark:text-red-200 dark:border-red-700/50",
  EXPIRED: "bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-700",
}

const EVIDENCE_COLORS: Record<EvidenceState, string> = {
  HIGH: "bg-emerald-100 text-emerald-900 border-emerald-300",
  NONE: "bg-zinc-100 text-zinc-700 border-zinc-300",
  CONFLICTED: "bg-orange-100 text-orange-900 border-orange-300",
  COMPLEX_POLICY: "bg-purple-100 text-purple-900 border-purple-300",
}

// Operator-facing translation of machine reason codes.
// Raw codes still travel in the JSON for engineers.
const REASON_LABELS: Record<string, string> = {
  no_observed_actions: "Awaiting first observed activity",
  missing_session_issuer_attribution: "Per-role attribution pending data plane fix",
  out_of_scope_actions: "Observed activity includes actions outside this role's policy",
}

function humanReason(code: string): string {
  // Codes are of the form "key: description" — split and look up the key.
  const key = code.split(":")[0]?.trim()
  return key ? (REASON_LABELS[key] ?? code) : code
}

// ─── Root component ────────────────────────────────────────────────

export default function IAMSharedRolesDetailView({ planId }: Props) {
  const [plan, setPlan] = useState<SplitPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchSplitPlan(planId)
      .then((p) => {
        if (!cancelled) setPlan(p)
      })
      .catch((e: any) => {
        if (!cancelled) setError(String(e?.message ?? e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [planId, reloadKey])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-zinc-700 dark:text-zinc-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm">Loading plan…</span>
      </div>
    )
  }

  if (error || !plan) {
    return (
      <div className="p-6 max-w-5xl">
        <BackLink />
        <Card className="border-l-4 border-l-red-600 mt-4">
          <CardContent className="py-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
            <div className="flex-1 space-y-2">
              <p className="text-sm font-medium">Could not load plan</p>
              <p className="text-xs text-zinc-700 dark:text-zinc-400 break-all">
                {error || "Empty response"}
              </p>
              <Button size="sm" variant="outline" onClick={reload}>
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <DetailShell plan={plan} reload={reload} />
}

// ─── Shell: two-pane operator layout ───────────────────────────────
//
// PR-D-1 (2026-05-31) — restructures the 13-section vertical stack
// into a sticky-left-rail (identity + status + primary actions) +
// tabbed-right-pane (working content) layout.
//
// PR-D-1 is layout-only: existing section components render verbatim,
// no behavior changes inside any of them. The complaint this fixes is
// (a) ~50% empty horizontal space inside max-w-6xl, and (b) deep
// vertical drilling to reach Approve/Execute/Rollback (~6 viewport
// heights from PlanHero).
//
// URL state via ?tab= matches Cyntro's existing convention
// (?canvas=v2, ?mode=attack-path). Deep-linkable, default-implicit.
// Sister to decision_url_mode_default_implicit_for_merged_tab.

type DetailTab = "comparison" | "reasoning" | "audit" | "engineering"

const DETAIL_TABS: ReadonlyArray<{ id: DetailTab; label: string }> = [
  { id: "comparison", label: "Comparison" },
  { id: "reasoning", label: "Plan reasoning" },
  { id: "audit", label: "Audit" },
  { id: "engineering", label: "Engineering" },
]

function DetailShell({
  plan,
  reload,
}: {
  plan: SplitPlan
  reload: () => void
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const rawTab = searchParams?.get("tab") ?? "comparison"
  const activeTab: DetailTab = DETAIL_TABS.some((t) => t.id === rawTab)
    ? (rawTab as DetailTab)
    : "comparison"

  const setTab = useCallback(
    (next: DetailTab) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "")
      if (next === "comparison") {
        // Default-implicit: drop the param for the default tab so the
        // URL stays clean. Explicit-canonical only for non-default
        // tabs. Matches the V2-promote convention.
        params.delete("tab")
      } else {
        params.set("tab", next)
      }
      const qs = params.toString()
      router.replace(qs ? `?${qs}` : "?", { scroll: false })
    },
    [router, searchParams]
  )

  return (
    <div className="p-6 mx-auto max-w-[1600px]">
      <BackLink />
      <div className="mt-4 flex flex-col lg:flex-row gap-6 items-start">
        {/* ─── LEFT RAIL — sticky, 360px, identity + status + actions ─── */}
        <aside
          className="w-full lg:w-[360px] lg:shrink-0 lg:sticky lg:top-6 self-start space-y-4"
          data-detail-rail="left"
        >
          <PlanHero plan={plan} />
          <BlastRadiusHero plan={plan} />
          <GateReadinessPanel
            planId={plan.plan_id}
            planState={plan.state}
            mode="CREATE_ONLY"
          />
          <ApprovalAction plan={plan} onApproved={reload} />
          <ExecuteActions
            planId={plan.plan_id}
            planState={plan.state}
            planExpired={plan.expired ?? false}
            onReload={reload}
          />
        </aside>

        {/* ─── RIGHT PANE — tabbed working content ─── */}
        <main
          className="flex-1 min-w-0 w-full space-y-5"
          data-detail-rail="right"
        >
          <DetailTabBar activeTab={activeTab} onTabChange={setTab} />
          {activeTab === "comparison" && (
            <>
              <ChainDeltaPanel
                planId={plan.plan_id}
                planState={plan.state}
              />
              <BeforeAfterCanvas plan={plan} />
            </>
          )}
          {activeTab === "reasoning" && (
            <div className="space-y-5">
              <WhyItMatters plan={plan} />
              <WhatCyntroWillDo />
              <WhereThisStands plan={plan} />
            </div>
          )}
          {activeTab === "audit" && (
            <ExecutionHistory
              planId={plan.plan_id}
              planState={plan.state}
            />
          )}
          {activeTab === "engineering" && (
            <EngineeringDetails plan={plan} />
          )}
        </main>
      </div>
    </div>
  )
}

// ─── TabBar — in-house, URL-state-driven, no Radix dependency ──────
//
// Cyntro has no Tabs primitive in components/ui/ and no Radix Tabs
// dependency. This is a small in-house implementation matching the
// existing button styling. If a second consumer surfaces, lift to a
// shared primitive at that point — not before (premature abstraction).

function DetailTabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: DetailTab
  onTabChange: (next: DetailTab) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Plan detail sections"
      className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-800"
      data-detail-tabs
    >
      {DETAIL_TABS.map((tab) => {
        const selected = tab.id === activeTab
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={selected}
            data-tab-id={tab.id}
            data-tab-selected={selected}
            onClick={() => onTabChange(tab.id)}
            className={
              "px-3 py-2 text-sm border-b-2 -mb-px transition-colors " +
              (selected
                ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100 font-medium"
                : "border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100")
            }
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Section: BackLink ─────────────────────────────────────────────

function BackLink() {
  return (
    <Link
      href="/iam/shared-roles"
      className="inline-flex items-center text-sm text-zinc-700 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
    >
      <ChevronLeft className="h-4 w-4 mr-1" />
      Back to shared roles
    </Link>
  )
}

// ─── Section: PlanHero ─────────────────────────────────────────────

function PlanHero({ plan }: { plan: SplitPlan }) {
  return (
    <header className="space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <BackToDashboard
            href="/iam/shared-roles"
            ariaLabel="Back to shared roles"
            className="p-2 -ml-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors mt-1 shrink-0"
          />
          <h1 className="text-3xl font-bold tracking-tight min-w-0 break-words">
            {plan.shared_role.role_name}
          </h1>
        </div>
        <Badge variant="outline" className={`${STATE_COLORS[plan.state]} text-sm shrink-0`}>
          {plan.state}
        </Badge>
      </div>
      <p className="text-sm text-zinc-700 dark:text-zinc-400 font-mono break-all">
        {plan.shared_role.role_arn}
      </p>
    </header>
  )
}

// ─── Section: BlastRadiusHero — executive headline number ──────────

function BlastRadiusHero({ plan }: { plan: SplitPlan }) {
  const brs = plan.blast_radius_summary
  if (!brs) {
    // Backend ships without this block — UI degrades gracefully.
    return null
  }
  const avg = brs.after.summary.average_reduction_pct_for_grouped
  const ratio = brs.after.summary.ratio_ready_label
  const awaiting = brs.after.summary.consumers_awaiting_evidence
  const conflicted = brs.after.summary.consumers_with_conflicting_evidence
  // Audit fix #2: must include complex_policy in the "all eligible"
  // check, otherwise the hero claims "All consumers eligible" when
  // some are blocked by complex-policy reasons.
  const complexPolicy = brs.after.summary.consumers_complex_policy ?? 0
  const hasReady = brs.after.summary.consumers_ready_to_split > 0
  const allBlockerCounts = awaiting + conflicted + complexPolicy

  // Build the "blocked breakdown" line from whatever non-zero categories
  // exist. Honest for any combination — including unknown future
  // categories the summary may add (those won't surface in the breakdown
  // but won't trigger the false "All eligible" message either).
  const blockerParts: React.ReactNode[] = []
  if (awaiting > 0)
    blockerParts.push(
      <span key="awaiting">
        Awaiting evidence: <strong>{awaiting}</strong>
      </span>,
    )
  if (conflicted > 0)
    blockerParts.push(
      <span key="conflicting">
        Conflicting: <strong>{conflicted}</strong>
      </span>,
    )
  if (complexPolicy > 0)
    blockerParts.push(
      <span key="complex">
        Complex policy: <strong>{complexPolicy}</strong>
      </span>,
    )

  return (
    <Card className="border-l-4 border-l-emerald-600">
      <CardContent className="py-5 flex items-center justify-between gap-6 flex-wrap">
        <div className="flex items-baseline gap-4">
          <div className="text-5xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {hasReady ? `${Math.round(avg)}%` : "—"}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
              Blast-radius reduction
            </span>
            <span className="text-xs text-zinc-700 dark:text-zinc-400">
              per Lambda when split
            </span>
          </div>
        </div>
        <div className="flex flex-col text-sm text-right">
          <span className="text-zinc-900 dark:text-zinc-100 font-medium">
            <strong className="tabular-nums">{ratio}</strong> ready to split
          </span>
          <span className="text-xs text-zinc-700 dark:text-zinc-400">
            {allBlockerCounts === 0 ? (
              <>All consumers eligible</>
            ) : (
              blockerParts.map((part, i) => (
                <span key={i}>
                  {part}
                  {i < blockerParts.length - 1 && " · "}
                </span>
              ))
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Section: ChainDeltaPanel — Layer D simulate (2026-05-27) ──────
//
// Lives between BlastRadiusHero (permission-reduction %) and
// BeforeAfterCanvas (visual split). Lets the operator trigger a
// counterfactual ATLAS run and see BEFORE/AFTER chain counts per
// crown jewel the role currently reaches.
//
// Three render states:
//   IDLE       → "Compute chain delta" CTA + brief explainer.
//   RUNNING    → progress bar with "Evaluating N of M jewels".
//   COMPLETED  → headline aggregate + per-jewel mini-cards + audit
//                footer (catalog/counterfactual_id/sim_id).
//   FAILED     → error message + Retry CTA.
//
// CTA is disabled unless the plan is PROPOSED — past that state the
// counterfactual no longer reflects reality (executed plans have
// already mutated AWS).

function ChainDeltaPanel({
  planId,
  planState,
}: {
  planId: string
  planState: SplitPlanState
}) {
  const [simId, setSimId] = useState<string | null>(null)
  const [run, setRun] = useState<SimulationRun | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // pollTick increments each polling cycle to drive useEffect; clean
  // way to schedule the next tick without nested setTimeout chains.
  const [pollTick, setPollTick] = useState(0)

  const enabled = planState === "PROPOSED"
  const polling = run?.status === "RUNNING"

  const startSimulate = useCallback(async () => {
    if (!enabled) return
    setStarting(true)
    setError(null)
    setRun(null)
    setSimId(null)
    try {
      const manifest = await postSimulate(planId)
      setSimId(manifest.sim_id)
      // Seed an initial "RUNNING with zero progress" state so the UI
      // flips immediately without waiting for the first poll.
      setRun({
        sim_id: manifest.sim_id,
        plan_id: manifest.plan_id,
        role_arn: manifest.role_arn,
        system_name: null,
        started_at: null,
        completed_at: null,
        status: "RUNNING",
        catalog_version: manifest.catalog_version,
        engine_version: manifest.engine_version,
        counterfactual_id: manifest.counterfactual_id,
        graph_snapshot_id: manifest.graph_snapshot_id,
        foothold_id: manifest.foothold.foothold_id,
        foothold_name: manifest.foothold.foothold_name,
        jewels_total: manifest.jewels_total,
        jewels_evaluated: 0,
        before_chains_total: 0,
        after_chains_total: 0,
        pairs_failed: 0,
        error_message: null,
        results: [],
        aggregate: {
          before_chains_total: 0,
          after_chains_total: 0,
          jewels_with_zero_after: 0,
          jewels_with_drop: 0,
        },
        progress: { evaluated: 0, total: manifest.jewels_total, failed: 0 },
        // Replay-state defaults — a freshly-started sim has never
        // been replayed. ReplayVerifyPanel is hidden while status
        // is RUNNING, so these are only ever read after the first
        // poll lands on COMPLETED with values from the backend.
        replay_count: 0,
        last_replayed_at: null,
        last_verdict: null,
        last_replay_id: null,
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setStarting(false)
    }
  }, [enabled, planId])

  // Polling loop. Re-runs whenever pollTick increments (we increment
  // inside the effect's setTimeout). Cancellation is by status check
  // — if status flipped terminal during the await, the next tick is
  // not scheduled.
  useEffect(() => {
    if (!simId || !polling) return
    let canceled = false
    const handle = setTimeout(async () => {
      try {
        const next = await fetchSimulationRun(simId)
        if (canceled) return
        setRun(next)
        if (next.status === "RUNNING") {
          setPollTick((t) => t + 1)
        }
      } catch (e: unknown) {
        if (canceled) return
        const msg = e instanceof Error ? e.message : String(e)
        // Don't terminate the loop on a single poll error — backend
        // may be transiently busy. Surface the error inline and try
        // again next tick.
        setError(msg)
        setPollTick((t) => t + 1)
      }
    }, 1500)
    return () => {
      canceled = true
      clearTimeout(handle)
    }
  }, [simId, polling, pollTick])

  return (
    <Card
      className={
        "border-l-4 " +
        (run?.status === "COMPLETED" && run.aggregate.jewels_with_drop > 0
          ? "border-l-emerald-600"
          : run?.status === "FAILED"
            ? "border-l-red-600"
            : "border-l-violet-600")
      }
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-zinc-600 dark:text-zinc-400 font-semibold flex items-center gap-2">
          ATLAS Chain delta
          <span className="text-[10px] font-normal tracking-normal text-zinc-500">
            · proven blast-radius reduction
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* IDLE state — explainer + CTA */}
        {!run && !starting && (
          <div className="space-y-2">
            <p className="text-xs text-zinc-700 dark:text-zinc-400">
              Run the ATLAS multi-hop chain planner against the proposed
              split. For each crown jewel this role currently reaches, we
              report BEFORE (today) and AFTER (with the split applied) chain
              counts — replay-grade audit lineage included. Read-only, no
              AWS mutation.
            </p>
            {!enabled && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Available only on PROPOSED plans — past that state the
                counterfactual no longer reflects reality.
              </p>
            )}
            <Button
              size="sm"
              disabled={!enabled || starting}
              onClick={startSimulate}
              className="mt-1"
            >
              {starting ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                  Starting…
                </>
              ) : (
                "Compute chain delta"
              )}
            </Button>
            {error && (
              <p className="text-xs text-red-600 dark:text-red-300 break-all">
                {error}
              </p>
            )}
          </div>
        )}

        {/* RUNNING state — progress bar */}
        {run && run.status === "RUNNING" && (
          <ChainDeltaProgress run={run} />
        )}

        {/* FAILED state */}
        {run && run.status === "FAILED" && (
          <div className="space-y-2">
            <p className="text-sm text-red-700 dark:text-red-300 break-all">
              Simulate failed: {run.error_message || "unknown error"}
            </p>
            <Button size="sm" variant="outline" onClick={startSimulate}>
              Retry
            </Button>
          </div>
        )}

        {/* COMPLETED state */}
        {run && run.status === "COMPLETED" && (
          <>
            <ChainDeltaResults run={run} onRerun={startSimulate} />
            {/* Phase 4 replay-verify surface — reads the 4 replay-state
              * fields off the same `run` prop and renders one of 6
              * resting states (or transient "verifying" mid-POST). On
              * successful re-verify, refetch the run so the panel
              * resolves to whatever new resting state the backend
              * indicates — drift self-heals via PR-A.0's atomic SET. */}
            <ReplayVerifyPanel
              run={run}
              onReverified={async () => {
                try {
                  const next = await fetchSimulationRun(run.sim_id)
                  setRun(next)
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e)
                  setError(msg)
                }
              }}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ChainDeltaProgress({ run }: { run: SimulationRun }) {
  const pct =
    run.progress.total > 0
      ? Math.round((run.progress.evaluated / run.progress.total) * 100)
      : 0
  return (
    <div className="space-y-2">
      <div className="text-xs text-zinc-700 dark:text-zinc-400 flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        Evaluating{" "}
        <strong className="tabular-nums">{run.progress.evaluated}</strong> of{" "}
        <strong className="tabular-nums">{run.progress.total}</strong> jewel
        {run.progress.total === 1 ? "" : "s"} · foothold{" "}
        <span className="font-mono text-[11px]">{run.foothold_name}</span>
      </div>
      <div className="w-full bg-zinc-200 dark:bg-zinc-800 rounded-full h-1.5 overflow-hidden">
        <div
          className="bg-violet-500 h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      {run.progress.failed > 0 && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">
          {run.progress.failed} pair{run.progress.failed === 1 ? "" : "s"}{" "}
          failed — those jewels will show as N/A
        </p>
      )}
    </div>
  )
}

function ChainDeltaResults({
  run,
  onRerun,
}: {
  run: SimulationRun
  onRerun: () => void
}) {
  const before = run.aggregate.before_chains_total
  const after = run.aggregate.after_chains_total
  const delta = before - after
  const droppedTo = before > 0 ? Math.round((delta / before) * 100) : 0
  // Coverage-gap MUST be checked before allClear — otherwise BEFORE=0
  // AFTER=0 with jewels_with_zero_after === jewels_total satisfies
  // allClear and produces the grammatically-broken "eliminates all 0
  // chains" headline (caught in production on 2026-05-27).
  const coverageGap = before === 0
  const allClear =
    !coverageGap &&
    run.aggregate.jewels_with_zero_after === run.jewels_total &&
    run.jewels_total > 0

  return (
    <div className="space-y-3">
      {/* Headline — adaptive copy. Branch ORDER matters: coverageGap
          comes first because every other case implies before > 0. */}
      <div
        className={
          "rounded-md border px-3 py-2 " +
          (coverageGap
            ? "bg-zinc-50 border-zinc-300 dark:bg-zinc-900/40 dark:border-zinc-700/50"
            : allClear
              ? "bg-emerald-50 border-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-700/50"
              : delta > 0
                ? "bg-emerald-50 border-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-700/50"
                : "bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-700/50")
        }
      >
        <div className="text-sm font-semibold">
          {coverageGap ? (
            <>ATLAS validated 0 chains BEFORE the split — coverage gap. The split is structurally fine, but today's catalog cannot prove its effect on this role + foothold.</>
          ) : allClear ? (
            <>Split eliminates all {before} ATLAS-validated chains across {run.jewels_total} jewel{run.jewels_total === 1 ? "" : "s"}.</>
          ) : delta > 0 ? (
            <>Split reduces {before} → {after} chains ({droppedTo}% drop) across {run.jewels_total} jewel{run.jewels_total === 1 ? "" : "s"}.</>
          ) : (
            <>Split keeps {after} chain{after === 1 ? "" : "s"} alive — same blast radius. Review the per-jewel breakdown below; the new role may grant actions that still enable the lateral.</>
          )}
        </div>
        <div className="text-xs text-zinc-700 dark:text-zinc-400 mt-1">
          Foothold:{" "}
          <span className="font-mono">{run.foothold_name}</span> ·{" "}
          {run.aggregate.jewels_with_drop} jewel
          {run.aggregate.jewels_with_drop === 1 ? "" : "s"} with reduction ·{" "}
          {run.aggregate.jewels_with_zero_after} of {run.jewels_total} reach 0 chains
          {run.pairs_failed > 0 && (
            <span className="text-amber-700 dark:text-amber-300">
              {" "}
              · {run.pairs_failed} pair{run.pairs_failed === 1 ? "" : "s"} failed
            </span>
          )}
        </div>
      </div>

      {/* Per-jewel mini-cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {run.results.map((r) => (
          <JewelDeltaCard key={r.result_id} r={r} />
        ))}
      </div>

      {/* Audit footer */}
      <div className="text-[10px] text-zinc-500 dark:text-zinc-500 pt-2 border-t border-zinc-200 dark:border-zinc-800 break-all">
        ATLAS{" "}
        <span className="font-mono">{run.engine_version}</span> · catalog{" "}
        <span className="font-mono">{run.catalog_version}</span> ·
        counterfactual{" "}
        <span className="font-mono" title={run.counterfactual_id ?? ""}>
          {run.counterfactual_id?.slice(0, 18)}…
        </span>{" "}
        · sim{" "}
        <span className="font-mono" title={run.sim_id}>
          {run.sim_id}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRerun}
          className="ml-2 h-auto py-0.5 px-1.5 text-[10px]"
        >
          Re-run
        </Button>
      </div>
    </div>
  )
}

function JewelDeltaCard({ r }: { r: { jewel_id: string; jewel_name: string; jewel_type: string; before_chain_count: number | null; after_chain_count: number | null; before_failed: boolean; after_failed: boolean; before_sample_chain_ids: string[]; after_sample_chain_ids: string[] } }) {
  const before = r.before_chain_count
  const after = r.after_chain_count
  const failed = r.before_failed || r.after_failed
  const delta = before !== null && after !== null ? before - after : null
  const tone = failed
    ? "border-zinc-300 dark:border-zinc-700"
    : delta !== null && delta > 0
      ? "border-emerald-300 dark:border-emerald-700/50"
      : before !== null && before > 0
        ? "border-amber-300 dark:border-amber-700/50"
        : "border-zinc-300 dark:border-zinc-700"
  return (
    <div className={"rounded-md border px-2.5 py-1.5 " + tone}>
      <div className="flex items-center gap-1.5">
        <span className="text-[8px] uppercase tracking-wider font-bold opacity-70">
          {r.jewel_type}
        </span>
        <span className="text-[11px] font-mono truncate flex-1" title={r.jewel_id}>
          {r.jewel_name}
        </span>
      </div>
      <div className="text-[11px] mt-1 tabular-nums flex items-center gap-1.5">
        {failed ? (
          <span className="text-zinc-500">N/A · engine failed</span>
        ) : (
          <>
            <span className="font-mono">{before ?? "—"}</span>
            <ArrowRight className="h-3 w-3 opacity-60" />
            <span className="font-mono font-semibold">{after ?? "—"}</span>
            {delta !== null && delta > 0 && (
              <span className="text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                −{delta}
              </span>
            )}
            {delta === 0 && before !== null && before > 0 && (
              <span className="text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                no change
              </span>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Section: BeforeAfterCanvas — the visual split ─────────────────

function BeforeAfterCanvas({ plan }: { plan: SplitPlan }) {
  const allowedActions = plan.shared_role.allowed_actions ?? []
  const allowedCount =
    plan.shared_role.allowed_actions_count ?? allowedActions.length
  const consumerCount = plan.discovery_facts.consumer_count
  const systemTags = plan.discovery_facts.system_tags
  const systemLine =
    systemTags.length === 0
      ? "untagged"
      : systemTags.length === 1
      ? systemTags[0]
      : systemTags.join(" + ")

  const eligible = plan.eligible_groups
  const blocked = plan.blocked_consumers
  const awaiting = blocked.filter((c) => c.evidence_state === "NONE")
  const conflicted = blocked.filter(
    (c) => c.evidence_state === "CONFLICTED"
  )
  const complex = blocked.filter(
    (c) => c.evidence_state === "COMPLEX_POLICY"
  )
  // Audit fix #6: pair groups with their reduction badge by group_id,
  // not by array index. Backend returns both lists in iteration order
  // today, but the UI shouldn't rely on that invariant — if either
  // list is ever filtered or reordered upstream, every badge would
  // attach to the wrong group silently.
  const brsGroupById = new Map(
    (plan.blast_radius_summary?.after.groups ?? []).map((g) => [g.group_id, g]),
  )

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* ─── BEFORE column ─── */}
      <Card className="border-l-4 border-l-zinc-400 dark:border-l-zinc-600 h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-wide text-zinc-600 dark:text-zinc-400 font-semibold">
            Before — current state
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
              One shared role
            </div>
            <div className="font-semibold mt-0.5 break-all">
              {plan.shared_role.role_name}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
              Grants <strong>{allowedCount}</strong> permission
              {allowedCount === 1 ? "" : "s"}
            </div>
            <ul className="mt-1 space-y-0.5 text-xs font-mono leading-snug">
              {(allowedActions.slice(0, 14) as string[]).map((p) => (
                <li key={p} className="break-all">
                  • {p}
                </li>
              ))}
              {allowedActions.length > 14 && (
                <li className="text-zinc-600 dark:text-zinc-400 italic">
                  + {allowedActions.length - 14} more
                </li>
              )}
            </ul>
          </div>
          <div className="pt-2 border-t">
            <div className="text-xs uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
              Attached to
            </div>
            <div className="text-base mt-0.5">
              <strong className="tabular-nums">{consumerCount}</strong> consumer
              {consumerCount === 1 ? "" : "s"}
              <span className="text-zinc-700 dark:text-zinc-400">
                {" "}
                in {systemLine}
              </span>
            </div>
            <div className="text-xs text-zinc-700 dark:text-zinc-400 mt-1">
              Every consumer inherits the same {allowedCount} permission
              {allowedCount === 1 ? "" : "s"} — there's no per-consumer
              scoping today.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── AFTER column ─── */}
      <div className="space-y-4">
        <Card className="border-l-4 border-l-emerald-600 h-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-zinc-600 dark:text-zinc-400 font-semibold">
              After — Cyntro's proposal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {eligible.length > 0 ? (
              <div className="space-y-3">
                {eligible.map((g) => (
                  <ProposedGroupCard
                    key={g.group_id}
                    group={g}
                    brsGroup={brsGroupById.get(g.group_id)}
                    roleAllowedCount={allowedCount}
                  />
                ))}
              </div>
            ) : (
              <div className="text-sm text-zinc-700 dark:text-zinc-400 py-2">
                No groups proposed yet — waiting for observed activity.
              </div>
            )}

            {awaiting.length > 0 && (
              <AwaitingCard awaiting={awaiting} />
            )}
            {conflicted.length > 0 && (
              <ConflictingCard conflicted={conflicted} />
            )}
            {complex.length > 0 && (
              <ComplexPolicyCard items={complex} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ProposedGroupCard({
  group,
  brsGroup,
  roleAllowedCount,
}: {
  group: SplitPlanGroup
  brsGroup?: { tailored_permission_count: number; reduction_pct_per_consumer: number; consumer_count: number }
  roleAllowedCount: number
}) {
  const statement = group.proposed_policy_document?.Statement as
    | Array<{ Action?: string | string[] }>
    | undefined
  const actionsRaw = statement?.[0]?.Action
  const tailored: string[] = Array.isArray(actionsRaw)
    ? actionsRaw
    : actionsRaw
    ? [actionsRaw]
    : []
  const reductionPct = brsGroup?.reduction_pct_per_consumer
  const consumerCount = group.consumers.length
  // Audit fix #5: don't assume the first consumer's kind applies to the
  // whole group. Backend's grouping_key includes consumer_type today so
  // groups should be homogeneous, but the UI shouldn't blindly trust
  // that — if the invariant ever changes, mislabeling silently is the
  // exact "false ≠ the simple case I had in mind" failure mode.
  const distinctKinds = Array.from(
    new Set(
      group.consumers
        .map((c) => c.consumer_type)
        .filter((k): k is string => Boolean(k)),
    ),
  )
  const kindLabel =
    distinctKinds.length === 0
      ? friendlyKind("Principal", consumerCount)
      : distinctKinds.length === 1
        ? friendlyKind(distinctKinds[0], consumerCount)
        : `principals (${distinctKinds
            .map((k) => friendlyKind(k, 1, true))
            .join(" + ")})`
  return (
    <div className="border rounded-md p-3 space-y-2 bg-emerald-50/40 dark:bg-emerald-950/10">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-400 font-semibold">
            {consumerCount} {kindLabel}
          </div>
          <div className="text-base font-bold mt-1 text-zinc-900 dark:text-zinc-100 break-all leading-snug">
            {group.consumers
              .map((c) => c.consumer_name || c.consumer_id)
              .join(", ")}
          </div>
        </div>
        {reductionPct !== undefined && (
          <Badge
            variant="outline"
            className="bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-700/50 shrink-0 tabular-nums"
          >
            {roleAllowedCount} → {tailored.length} ({Math.round(reductionPct)}% ↓)
          </Badge>
        )}
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
          Tailored permissions
        </div>
        <ul className="mt-1 space-y-0.5 text-xs font-mono leading-snug">
          {tailored.map((p) => (
            <li key={p} className="break-all">
              • {p}
            </li>
          ))}
        </ul>
      </div>
      <div className="pt-2 border-t text-xs text-zinc-700 dark:text-zinc-400">
        Proposed new role:{" "}
        <span className="font-mono break-all text-zinc-900 dark:text-zinc-100">
          {group.proposed_role_name}
        </span>
      </div>
    </div>
  )
}

function AwaitingCard({ awaiting }: { awaiting: ConsumerEvidence[] }) {
  // Three honest sub-buckets per audit (feedback_test_both_sides_of_a_partition):
  //
  //   1. Quarantine candidates — backend flagged is_quarantine_candidate=true
  //      (idle > threshold OR null + last_modified > threshold).
  //
  //   2. Active observation pending — has REAL timestamps proving recent
  //      modification, but no observed activity yet. Stay on shared role,
  //      keep watching.
  //
  //   3. Age unknown — stub nodes with no timestamps at all (project_label_
  //      set_duplicates_endemic.md pattern). We can't honestly say
  //      "recently deployed" OR "idle long enough to quarantine" — we
  //      just don't know.
  //
  // Old plans without is_quarantine_candidate / last_modified fall back
  // into "Age unknown" gracefully — that's the honest bucket for
  // missing data.
  const hasAnyTimestamp = (c: ConsumerEvidence) =>
    Boolean(c.last_observed_at || c.consumer_last_modified)

  const quarantineCandidates = awaiting.filter((c) => c.is_quarantine_candidate)
  const remainingAfterQ = awaiting.filter((c) => !c.is_quarantine_candidate)
  const observationPending = remainingAfterQ.filter(hasAnyTimestamp)
  const ageUnknown = remainingAfterQ.filter((c) => !hasAnyTimestamp(c))

  const thresholdDays =
    awaiting.find((c) => c.quarantine_threshold_days)?.quarantine_threshold_days ?? 90

  return (
    <div className="border rounded-md p-3 space-y-3 bg-amber-50/40 dark:bg-amber-950/10">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-zinc-700 dark:text-zinc-400 font-semibold">
            Awaiting evidence ({awaiting.length})
          </div>
          <div className="text-sm text-zinc-700 dark:text-zinc-300 mt-0.5 leading-relaxed">
            These consumers stay on the shared role until Cyntro observes
            their AWS API calls.
          </div>
        </div>
      </div>

      {/* Sub-bucket 1: Quarantine candidates */}
      {quarantineCandidates.length > 0 && (
        <QuarantineCandidatesSection
          candidates={quarantineCandidates}
          thresholdDays={thresholdDays}
        />
      )}

      {/* Sub-bucket 2: Active observation pending */}
      {observationPending.length > 0 && (
        <details className="border rounded-md p-2.5 bg-white/60 dark:bg-zinc-950/40">
          <summary className="cursor-pointer flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300 font-semibold">
                Active observation pending ({observationPending.length})
              </div>
              <div className="text-xs text-zinc-700 dark:text-zinc-300 mt-0.5">
                Recently deployed or modified — Cyntro is still watching for
                activity.
              </div>
            </div>
            <Badge
              variant="outline"
              className="bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-700/50 shrink-0 text-[10px]"
            >
              stay on shared role
            </Badge>
          </summary>
          <div className="space-y-1.5 pt-2">
            {observationPending.map((c) => (
              <div
                key={c.consumer_id}
                className="border rounded p-2 text-xs bg-white/40 dark:bg-zinc-950/20"
              >
                <div className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 break-all">
                  {c.consumer_name || c.consumer_id}
                </div>
                <div className="text-[10px] text-zinc-700 dark:text-zinc-400 mt-0.5">
                  {c.last_observed_at ? (
                    <>Last observed: {formatTime(c.last_observed_at)}</>
                  ) : c.consumer_last_modified ? (
                    <>
                      No observed activity yet · Last modified in AWS:{" "}
                      {formatTime(c.consumer_last_modified)}
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Sub-bucket 3: Age unknown — stub nodes with all-null timestamps.
          We don't know whether these are recently deployed or long-idle —
          can't honestly bucket them either way. Surface that gap. */}
      {ageUnknown.length > 0 && (
        <details className="border rounded-md p-2.5 bg-zinc-50/60 dark:bg-zinc-950/30 border-zinc-300 dark:border-zinc-700">
          <summary className="cursor-pointer flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wide text-zinc-700 dark:text-zinc-300 font-semibold">
                Age unknown ({ageUnknown.length})
              </div>
              <div className="text-xs text-zinc-700 dark:text-zinc-300 mt-0.5">
                Cyntro's graph has no modification timestamp for these
                consumers — we can't tell if they're recent or long-idle.
                Re-run resource reconciliation to populate metadata.
              </div>
            </div>
            <Badge
              variant="outline"
              className="bg-zinc-100 text-zinc-800 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-200 dark:border-zinc-700 shrink-0 text-[10px]"
            >
              need reconciliation
            </Badge>
          </summary>
          <div className="flex flex-wrap gap-1 pt-2">
            {ageUnknown.map((c) => (
              <Badge
                key={c.consumer_id}
                variant="outline"
                className="text-[11px] font-mono"
              >
                {c.consumer_name || c.consumer_id}
              </Badge>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

// Container for the Quarantine candidates sub-bucket. Owns the
// selection state and bulk actions; each row still owns its own
// per-row delete spinner / error / "Deleted" terminal state. When the
// parent bulk-deletes a row, it marks the consumer_id in
// `parentDeletedIds` and the row honors that as a forced terminal
// state.
function QuarantineCandidatesSection({
  candidates,
  thresholdDays,
}: {
  candidates: ConsumerEvidence[]
  thresholdDays: number
}) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [parentDeletedIds, setParentDeletedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; failed: number } | null>(null)
  const [bulkError, setBulkError] = useState<string | null>(null)
  // Names of consumers that already have an active quarantine record
  // (any phase except DELETED / RESTORED). Once a candidate has been
  // "moved" via the Orphan flow it lives in the Orphan tab and should
  // disappear from this list on the next mount — otherwise the
  // operator sees the same row in both places.
  const [movedNames, setMovedNames] = useState<Set<string>>(new Set())

  useEffect(() => {
    const systemNames = Array.from(
      new Set(
        candidates
          .map((c) => c.system_name)
          .filter((s): s is string => Boolean(s)),
      ),
    )
    if (systemNames.length === 0) return
    let cancelled = false
    ;(async () => {
      const collected = new Set<string>()
      for (const sys of systemNames) {
        try {
          const res = await fetch(
            `/api/proxy/quarantine/list/${encodeURIComponent(sys)}`,
          )
          if (!res.ok) continue
          const data = await res.json()
          const records: Array<{ resourceName: string; phase: string }> =
            data?.records ?? []
          for (const r of records) {
            if (!["DELETED", "RESTORED"].includes(r.phase) && r.resourceName) {
              collected.add(r.resourceName)
            }
          }
        } catch {
          // Best-effort — if the list endpoint is down, fall back to
          // showing all candidates rather than blocking the page.
        }
      }
      if (!cancelled) setMovedNames(collected)
    })()
    return () => {
      cancelled = true
    }
  }, [candidates])

  // Two layers of removal:
  //   - parentDeletedIds: bulk-delete acted on this row in-session
  //   - movedNames: previously moved-to-orphan (server-confirmed)
  const visibleCandidates = candidates.filter((c) => {
    if (parentDeletedIds.has(c.consumer_id)) return false
    const name = c.consumer_name || c.consumer_id
    if (movedNames.has(name)) return false
    return true
  })

  const selectableCandidates = visibleCandidates

  // Hide the entire section when every candidate has already been
  // moved or deleted in-session. Avoids a confusing empty box.
  if (visibleCandidates.length === 0) {
    return null
  }
  const allSelected =
    selectableCandidates.length > 0 &&
    selectableCandidates.every((c) => selectedIds.has(c.consumer_id))
  const someSelected = selectedIds.size > 0 && !allSelected

  const toggleAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(selectableCandidates.map((c) => c.consumer_id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const selectedCandidates = candidates.filter((c) => selectedIds.has(c.consumer_id))

  // Bulk Move to Orphan: chain pre-check + start-monitor + execute
  // per selected candidate so each one is actually written into the
  // quarantine list. Without this the navigation lands on the Orphan
  // tab but no rows appear — the user reported this as "they don't
  // move to the orphan!". Failures don't block the rest; the
  // navigation happens once the loop is done.
  const handleBulkMoveToOrphan = async () => {
    if (selectedCandidates.length === 0) return
    setBulkBusy(true)
    setBulkError(null)
    setBulkProgress({ done: 0, total: selectedCandidates.length, failed: 0 })
    const failures: string[] = []
    const movedRecordIds: string[] = []
    for (let i = 0; i < selectedCandidates.length; i++) {
      const c = selectedCandidates[i]
      try {
        const idleDays = c.last_observed_at
          ? Math.max(
              thresholdDays,
              Math.floor(
                (Date.now() - new Date(c.last_observed_at).getTime()) /
                  (1000 * 60 * 60 * 24),
              ),
            )
          : thresholdDays
        const pre = await fetch("/api/proxy/quarantine/pre-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resourceName: c.consumer_name || c.consumer_id,
            resourceType: c.consumer_type || "IAMConsumer",
            systemName: c.system_name,
            idleDays,
            connections: 0,
            recentCloudTrailEvents: 0,
            recentFlowLogHits: 0,
          }),
        })
        if (!pre.ok) throw new Error(`pre-check ${pre.status}`)
        const preData = await pre.json()
        if (preData.error) throw new Error(preData.error)
        if (!preData.recordId) throw new Error("no recordId")
        movedRecordIds.push(preData.recordId)
        // Pre-check alone creates the record (PRE_CHECK phase). The
        // operator drives MONITOR / QUARANTINE from the Orphan tab.
      } catch (e: any) {
        failures.push(`${c.consumer_name || c.consumer_id}: ${e?.message ?? "unknown"}`)
        setBulkProgress((p) =>
          p ? { ...p, done: p.done + 1, failed: p.failed + 1 } : p,
        )
        continue
      }
      setBulkProgress((p) => (p ? { ...p, done: p.done + 1 } : p))
    }
    setBulkBusy(false)
    if (failures.length > 0 && failures.length === selectedCandidates.length) {
      // All failed — surface the error, don't navigate.
      setBulkError(`All ${failures.length} failed: ${failures.slice(0, 2).join("; ")}${failures.length > 2 ? "…" : ""}`)
      return
    }
    if (failures.length > 0) {
      setBulkError(`${failures.length} of ${selectedCandidates.length} failed: ${failures.slice(0, 2).join("; ")}${failures.length > 2 ? "…" : ""}`)
    }
    // Group by system_name to pick the navigation target.
    const systemNames = Array.from(
      new Set(
        selectedCandidates
          .map((c) => c.system_name)
          .filter((s): s is string => Boolean(s)),
      ),
    )
    const href =
      systemNames.length === 1
        ? `/systems?systemName=${encodeURIComponent(systemNames[0])}&tab=orphan-services`
        : "/orphan-resources"
    // Hand the synth-row ids off to OrphanServicesTab so it can
    // highlight + scroll to the just-moved rows. Format must match
    // the synth-row id in orphan-services-tab.tsx (`qrec-${id}`).
    try {
      sessionStorage.setItem(
        "cyntro:just-moved-orphan-ids",
        JSON.stringify(movedRecordIds.map((rid) => `qrec-${rid}`)),
      )
    } catch {
      // sessionStorage unavailable; navigation still works.
    }
    // Hard nav so the operator definitely sees the page change and
    // the Orphan tab fetches fresh quarantine records.
    window.location.assign(href)
  }

  const handleBulkDelete = async () => {
    setBulkBusy(true)
    setBulkError(null)
    setBulkProgress({ done: 0, total: selectedCandidates.length, failed: 0 })
    const failures: string[] = []
    for (let i = 0; i < selectedCandidates.length; i++) {
      const c = selectedCandidates[i]
      try {
        const idleDays = c.last_observed_at
          ? Math.max(
              thresholdDays,
              Math.floor(
                (Date.now() - new Date(c.last_observed_at).getTime()) /
                  (1000 * 60 * 60 * 24),
              ),
            )
          : thresholdDays
        const pre = await fetch("/api/proxy/quarantine/pre-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resourceName: c.consumer_name || c.consumer_id,
            resourceType: c.consumer_type || "IAMConsumer",
            systemName: c.system_name,
            idleDays,
            connections: 0,
            recentCloudTrailEvents: 0,
            recentFlowLogHits: 0,
          }),
        })
        if (!pre.ok) throw new Error(`pre-check ${pre.status}`)
        const preData = await pre.json()
        if (preData.error) throw new Error(preData.error)
        const recordId = preData.recordId
        if (!recordId) throw new Error("no recordId")
        const del = await fetch("/api/proxy/quarantine/delete", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recordId, actor: "user", force: true }),
        })
        if (!del.ok) throw new Error(`delete ${del.status}`)
        setParentDeletedIds((prev) => {
          const next = new Set(prev)
          next.add(c.consumer_id)
          return next
        })
      } catch (e: any) {
        failures.push(`${c.consumer_name || c.consumer_id}: ${e?.message ?? "unknown"}`)
        setBulkProgress((p) =>
          p ? { ...p, done: p.done + 1, failed: p.failed + 1 } : p,
        )
        continue
      }
      setBulkProgress((p) => (p ? { ...p, done: p.done + 1 } : p))
    }
    if (failures.length > 0) {
      setBulkError(`${failures.length} of ${selectedCandidates.length} failed: ${failures.slice(0, 2).join("; ")}${failures.length > 2 ? "…" : ""}`)
    }
    setBulkBusy(false)
    setSelectedIds(new Set())
    // Clear progress after a short beat so the success message lingers.
    setTimeout(() => setBulkProgress(null), 1500)
  }

  return (
    // Collapsible by default — the per-role plan often has 10+ idle
    // consumers and we don't want to dominate the page until the
    // operator opens it. The summary still carries the count so they
    // can see the magnitude at a glance.
    <details className="border border-orange-300 dark:border-orange-700/50 rounded-md bg-orange-50/60 dark:bg-orange-950/20 group">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden p-2.5 flex items-center gap-2">
        <ChevronRight className="w-4 h-4 text-orange-700 dark:text-orange-300 transition-transform group-open:rotate-90 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wide text-orange-700 dark:text-orange-300 font-semibold">
            Quarantine candidates ({visibleCandidates.length})
          </div>
          <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
            No activity in the last {thresholdDays} days — likely unused.
          </div>
        </div>
      </summary>
      <div className="px-2.5 pb-2.5 space-y-2">
      <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
        Each consumer below was flagged for one of two reasons:
        either Cyntro observed activity that stopped &gt; {thresholdDays}{" "}
        days ago, or there's been no observed activity AND the AWS
        resource hasn't been modified in &gt; {thresholdDays} days.
        Select rows (or "Select all") to act in bulk. "Move to Orphan"
        opens the system's Inventory → Orphan tab so you can review
        the safety score and quarantine the resources there
        (quarantine is reversible). Delete is irreversible after the
        rollback window closes.
      </div>

      {/* Select-all + bulk action bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap border-t border-orange-300/50 dark:border-orange-700/30 pt-2">
        <label className="flex items-center gap-2 text-[11px] font-medium text-zinc-800 dark:text-zinc-200 cursor-pointer">
          <Checkbox
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            onCheckedChange={(v) => toggleAll(v === true)}
            disabled={bulkBusy || selectableCandidates.length === 0}
            aria-label="Select all quarantine candidates"
          />
          {selectedIds.size > 0
            ? `${selectedIds.size} selected`
            : `Select all (${selectableCandidates.length})`}
        </label>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleBulkMoveToOrphan}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50"
            >
              <ArrowRight className="w-3 h-3" />
              Move {selectedIds.size} to Orphan
            </button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  disabled={bulkBusy}
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded border border-red-300 dark:border-red-700/50 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                >
                  {bulkBusy ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3" />
                  )}
                  Delete {selectedIds.size}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Delete {selectedIds.size}{" "}
                    {selectedIds.size === 1 ? "consumer" : "consumers"}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Cyntro backs up each resource's configuration to a
                    quarantine record before the delete, so each one can
                    be restored from its rollback window. After the
                    window closes, the AWS resources are removed
                    permanently. Each delete runs sequentially so a
                    failure on one row does not block the rest.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleBulkDelete}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Delete {selectedIds.size}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <button
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkBusy}
              className="inline-flex items-center text-[10px] font-medium px-2 py-1 rounded text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {bulkProgress && (
        <div className="text-[10px] text-zinc-700 dark:text-zinc-300">
          {bulkBusy
            ? `Deleting ${bulkProgress.done + 1} of ${bulkProgress.total}…`
            : `Done: ${bulkProgress.done - bulkProgress.failed} deleted, ${bulkProgress.failed} failed.`}
        </div>
      )}
      {bulkError && (
        <div className="text-[10px] text-red-700 dark:text-red-300 leading-snug">
          {bulkError}
        </div>
      )}

      <div className="space-y-1.5 pt-1">
        {visibleCandidates.map((c) => (
          <QuarantineCandidateRow
            key={c.consumer_id}
            candidate={c}
            thresholdDays={thresholdDays}
            selected={selectedIds.has(c.consumer_id)}
            onToggleSelected={(checked) => toggleOne(c.consumer_id, checked)}
            parentDeleted={parentDeletedIds.has(c.consumer_id)}
            disableActions={bulkBusy}
          />
        ))}
      </div>
      </div>
    </details>
  )
}

// Per-row component for a single Quarantine candidate. Owns the
// delete state machine so multiple candidates can be acted on
// independently without inflating AwaitingCard.
//
// Two actions:
//   - Move to Orphan: pure navigation to the system's Inventory ->
//     Orphan tab. The actual Quarantine decision happens there, with
//     the safety score + recommendation panel in view. The orphan-
//     services list is already server-derived from idle metrics, so a
//     quarantine candidate visible here is also surfaced there.
//   - Delete: chains pre-check -> delete with an AlertDialog confirm.
//     Destructive — config is backed up to the quarantine record but
//     the AWS resource itself is removed after the rollback window
//     closes server-side.
function QuarantineCandidateRow({
  candidate,
  thresholdDays,
  selected,
  onToggleSelected,
  parentDeleted,
  disableActions,
}: {
  candidate: ConsumerEvidence
  thresholdDays: number
  selected: boolean
  onToggleSelected: (checked: boolean) => void
  parentDeleted: boolean
  disableActions: boolean
}) {
  type RowState = "idle" | "moving" | "deleting" | "moved" | "deleted"
  const [state, setState] = useState<RowState>("idle")
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  // Parent bulk-delete forces the terminal state regardless of the
  // row's own state machine (e.g. when the row was never clicked
  // individually but was part of a bulk delete).
  const effectiveState: RowState = parentDeleted ? "deleted" : state

  const idleDays = (() => {
    if (!candidate.last_observed_at) return thresholdDays
    const ms = Date.now() - new Date(candidate.last_observed_at).getTime()
    return Math.max(thresholdDays, Math.floor(ms / (1000 * 60 * 60 * 24)))
  })()

  const orphanHref = candidate.system_name
    ? `/systems?systemName=${encodeURIComponent(candidate.system_name)}&tab=orphan-services`
    : "/orphan-resources"

  // "Move to Orphan" creates a quarantine record (in PRE_CHECK phase)
  // and navigates the operator to the system's Orphan tab where the
  // row now surfaces. We deliberately stop at pre-check — moving
  // straight to start-monitor / execute returns 400 from the backend
  // (the state machine requires operator-driven progression). The
  // operator finishes the quarantine from the Orphan tab where the
  // safety score + phase buttons live.
  //
  // Before 2026-05-25 this was a passive <Link> — clicking did
  // nothing visible because the consumer was never written into the
  // quarantine list, and the Orphan tab had no row for it.
  const handleMoveToOrphan = async () => {
    setState("moving")
    setError(null)
    try {
      const pre = await fetch("/api/proxy/quarantine/pre-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceName: candidate.consumer_name || candidate.consumer_id,
          resourceType: candidate.consumer_type || "IAMConsumer",
          systemName: candidate.system_name,
          idleDays,
          connections: 0,
          recentCloudTrailEvents: 0,
          recentFlowLogHits: 0,
        }),
      })
      if (!pre.ok) throw new Error(`Pre-check failed (${pre.status})`)
      const preData = await pre.json()
      if (preData.error) throw new Error(preData.error)
      if (!preData.recordId) throw new Error("Pre-check did not return a recordId")
      setState("moved")
      // Hand the synth-row id off to OrphanServicesTab so it can
      // highlight + scroll to the just-moved row. Format must match
      // the synth-row id in orphan-services-tab.tsx (`qrec-${id}`).
      try {
        sessionStorage.setItem(
          "cyntro:just-moved-orphan-ids",
          JSON.stringify([`qrec-${preData.recordId}`]),
        )
      } catch {
        // sessionStorage may be unavailable; navigation still works.
      }
      // Hard nav so the user definitely sees the page change.
      window.location.assign(orphanHref)
    } catch (e: any) {
      setState("idle")
      setError(e?.message ?? "Unknown error")
    }
  }

  const handleDelete = async () => {
    setState("deleting")
    setError(null)
    try {
      const pre = await fetch("/api/proxy/quarantine/pre-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceName: candidate.consumer_name || candidate.consumer_id,
          resourceType: candidate.consumer_type || "IAMConsumer",
          systemName: candidate.system_name,
          idleDays,
          connections: 0,
          recentCloudTrailEvents: 0,
          recentFlowLogHits: 0,
        }),
      })
      if (!pre.ok) {
        const body = await pre.text().catch(() => "")
        throw new Error(`Pre-check failed (${pre.status})${body ? `: ${body}` : ""}`)
      }
      const preData = await pre.json()
      if (preData.error) throw new Error(preData.error)
      if (!preData.recordId) throw new Error("Pre-check did not return a recordId")
      const del = await fetch("/api/proxy/quarantine/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId: preData.recordId, actor: "user", force: true }),
      })
      if (!del.ok) throw new Error(`Delete failed (${del.status})`)
      setState("deleted")
    } catch (e: any) {
      setState("idle")
      setError(e?.message ?? "Unknown error")
    }
  }

  return (
    <div className="bg-white/60 dark:bg-zinc-950/40 border rounded p-2 text-xs">
      <div className="flex items-start gap-2">
        <Checkbox
          checked={selected}
          onCheckedChange={(v) => onToggleSelected(v === true)}
          disabled={effectiveState === "deleted" || disableActions}
          className="mt-0.5 shrink-0"
          aria-label={`Select ${candidate.consumer_name || candidate.consumer_id}`}
        />
        <div className="flex items-start justify-between gap-2 flex-wrap flex-1 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 break-all">
            {candidate.consumer_name || candidate.consumer_id}
          </div>
          <div className="text-[10px] text-zinc-700 dark:text-zinc-400 mt-0.5">
            {candidate.last_observed_at ? (
              <>
                Idle since: {formatTime(candidate.last_observed_at)} (no
                AWS API calls observed since)
              </>
            ) : candidate.consumer_last_modified ? (
              <>
                Never observed · Last modified in AWS:{" "}
                {formatTime(candidate.consumer_last_modified)}
              </>
            ) : (
              // Backend wouldn't normally flag a consumer with
              // both fields null — defensive fallback only.
              <>Flagged for quarantine — see Engineering details</>
            )}
          </div>
          {error ? (
            <div className="text-[10px] text-red-700 dark:text-red-300 mt-1 leading-snug">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {effectiveState === "deleted" ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
              <Trash2 className="w-3 h-3" />
              Deleted
            </span>
          ) : effectiveState === "moved" ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded bg-emerald-600 text-white">
              <CheckCircle2 className="w-3 h-3" />
              Moved
            </span>
          ) : (
            <>
              <button
                onClick={handleMoveToOrphan}
                disabled={effectiveState !== "idle" || disableActions}
                className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50"
              >
                {effectiveState === "moving" ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <ArrowRight className="w-3 h-3" />
                )}
                Move to Orphan
              </button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    disabled={effectiveState === "deleting" || disableActions}
                    className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded border border-red-300 dark:border-red-700/50 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                  >
                    {effectiveState === "deleting" ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}
                    Delete
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete{" "}
                      <span className="font-mono">
                        {candidate.consumer_name || candidate.consumer_id}
                      </span>
                      ?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Cyntro backs up the resource's configuration to its
                      quarantine record before the delete, so you can
                      restore from the rollback window. After the window
                      closes, the AWS resource is removed permanently.
                      Prefer "Move to Orphan" if you want to inspect the
                      safety score and quarantine first — quarantine is
                      reversible at any time.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}

function ConflictingCard({ conflicted }: { conflicted: ConsumerEvidence[] }) {
  return (
    <div className="border rounded-md p-3 space-y-3 bg-orange-50/40 dark:bg-orange-950/10 border-orange-300 dark:border-orange-700/50">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-orange-700 dark:text-orange-300 font-semibold">
            Conflicting evidence ({conflicted.length})
          </div>
          <div className="text-sm font-semibold mt-1 text-zinc-900 dark:text-zinc-100">
            What we observed doesn't match what this role allows.
          </div>
          <div className="text-xs text-zinc-700 dark:text-zinc-300 mt-1 leading-relaxed">
            Cyntro saw{" "}
            {conflicted.length === 1 ? "this consumer make" : "these consumers make"}{" "}
            AWS API calls that this role's policy does <strong>not</strong> grant
            permission for. Cyntro will not propose a scoped role until the
            mismatch is resolved.
          </div>
        </div>
      </div>

      {/* Per-consumer specifics */}
      <div className="space-y-2">
        {conflicted.map((c) => {
          const kindLabel = friendlyKind(
            c.consumer_type || "Principal",
            1
          )
          return (
            <div
              key={c.consumer_id}
              className="border rounded-md p-2 bg-white/60 dark:bg-zinc-950/40 text-xs"
            >
              <div className="text-[10px] uppercase tracking-wide text-zinc-600 dark:text-zinc-400 font-semibold">
                {kindLabel}
              </div>
              <div className="font-mono font-semibold mt-0.5 break-all text-zinc-900 dark:text-zinc-100">
                {c.consumer_name || c.consumer_id}
              </div>
              {c.observed_actions.length > 0 ? (
                <div className="mt-1">
                  <span className="text-zinc-700 dark:text-zinc-300">
                    Observed actions not in this role's policy:
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.observed_actions.map((a) => (
                      <Badge
                        key={a}
                        variant="outline"
                        className="text-[10px] font-mono bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-700/50"
                      >
                        {a}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-zinc-600 dark:text-zinc-400 mt-1">
                  No specific actions captured.
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Explanation: what this means, why it happens */}
      <div className="bg-white/50 dark:bg-zinc-950/30 border border-orange-200 dark:border-orange-800/40 rounded-md p-2.5 space-y-2 text-xs">
        <div className="text-[10px] uppercase tracking-wide text-zinc-600 dark:text-zinc-400 font-semibold">
          Why this can happen
        </div>
        <ol className="space-y-1.5 text-zinc-700 dark:text-zinc-300 list-decimal list-inside leading-relaxed">
          <li>
            <strong>The consumer also assumes another IAM role</strong> for some
            operations, and the graph hasn't separated per-role attribution yet.
            Most common cause today.
          </li>
          <li>
            <strong>The role's policy is incomplete</strong> in Cyntro's graph —
            AWS may grant the action, but our pre-computed `allowed_actions`
            list is missing it.
          </li>
          <li>
            <strong>Per-principal attribution is partial</strong> — observed
            activity from a different principal got attributed here by an STS
            session-name collision.
          </li>
        </ol>
      </div>

      <div className="text-[11px] text-zinc-700 dark:text-zinc-300 leading-relaxed">
        <strong>Recommended:</strong> manually review the consumer's recent
        activity in CloudTrail (or your CSPM) to confirm which role actually
        serves it. Once the right role is identified, Cyntro can propose a
        scoped split for the correct role.
      </div>
    </div>
  )
}

function ComplexPolicyCard({ items }: { items: ConsumerEvidence[] }) {
  return (
    <div className="border rounded-md p-3 space-y-2 bg-purple-50/40 dark:bg-purple-950/10">
      <div className="text-xs uppercase tracking-wide text-purple-700 dark:text-purple-300 font-semibold">
        Complex policy ({items.length})
      </div>
      <div className="flex flex-wrap gap-1">
        {items.map((c) => (
          <Badge
            key={c.consumer_id}
            variant="outline"
            className="text-[11px] font-mono"
          >
            {c.consumer_name || c.consumer_id}
          </Badge>
        ))}
      </div>
      <div className="text-xs text-zinc-700 dark:text-zinc-400">
        The role's policy uses conditions / deny rules the proposer can't
        safely simplify yet.
      </div>
    </div>
  )
}

// ─── Section: What we have ─────────────────────────────────────────

function WhatWeHave({ plan }: { plan: SplitPlan }) {
  const count = plan.discovery_facts.consumer_count
  const kindSummary = summarizeKinds(plan.discovery_facts.consumer_kinds, count)
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-zinc-600 dark:text-zinc-400 font-semibold">
          What we have
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-base leading-relaxed">
          This IAM role is attached to{" "}
          <strong className="text-zinc-900 dark:text-zinc-100">
            {count} {kindSummary}
          </strong>
          . Every one of them gets the{" "}
          <strong className="text-zinc-900 dark:text-zinc-100">
            same full set of permissions
          </strong>{" "}
          — including the permissions only some of them actually need.
        </p>
      </CardContent>
    </Card>
  )
}

// ─── Section: Why it matters ───────────────────────────────────────

function WhyItMatters({ plan }: { plan: SplitPlan }) {
  const cross = plan.discovery_facts.cross_system
  const systems = plan.discovery_facts.system_tags
  const count = plan.discovery_facts.consumer_count

  return (
    <Card
      className={
        cross
          ? "border-l-4 border-l-orange-600"
          : "border-l-4 border-l-zinc-300 dark:border-l-zinc-700"
      }
    >
      <CardHeader className="pb-2 flex flex-row items-center gap-2">
        {cross ? (
          <ShieldAlert className="h-4 w-4 text-orange-600" />
        ) : (
          <ShieldCheck className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
        )}
        <CardTitle className="text-xs uppercase tracking-wide text-zinc-600 dark:text-zinc-400 font-semibold">
          Why it matters
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-base leading-relaxed">
          If any one of these {count} principals is compromised, the attacker
          inherits the{" "}
          <strong className="text-zinc-900 dark:text-zinc-100">
            full union
          </strong>{" "}
          of every permission this role grants — not just the permissions that
          principal actually uses. This is{" "}
          <strong className="text-zinc-900 dark:text-zinc-100">
            blast radius
          </strong>
          .
        </p>
        {cross ? (
          <p className="text-base leading-relaxed text-orange-800 dark:text-orange-200 font-medium">
            ⚠ This role bridges {systems.length} systems
            {systems.length > 0 ? ` (${systems.join(" + ")})` : ""}. A compromise
            crosses team boundaries. This is the highest-severity sharing
            pattern.
          </p>
        ) : systems.length === 1 ? (
          <p className="text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            All consumers belong to the same system ({systems[0]}). The blast
            radius is contained within one team.
          </p>
        ) : (
          // systems.length === 0 — consumers aren't tagged with any system
          // yet. NOT the same as "same system" — we genuinely don't know
          // the blast radius scope until the auto-tagger runs.
          <p className="text-base leading-relaxed text-zinc-700 dark:text-zinc-300">
            Cyntro hasn't tagged these consumers to a system yet — the blast
            radius scope is unknown until the auto-tagger completes.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Section: What Cyntro will do ──────────────────────────────────

function WhatCyntroWillDo() {
  // Static product description. Same on every plan page — not data.
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-zinc-600 dark:text-zinc-400 font-semibold">
          What Cyntro will do
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2 text-base leading-relaxed list-decimal list-inside marker:text-zinc-500 marker:font-semibold">
          <li>Watch each consumer's actual API activity.</li>
          <li>Group consumers that need the same set of permissions.</li>
          <li>Propose one tighter, scoped IAM role per group.</li>
          <li>
            When you approve, create the new roles in AWS — unattached, safe to
            inspect.
          </li>
          <li>
            (Future) Swap each consumer over to its scoped role, with snapshot
            and rollback.
          </li>
        </ol>
      </CardContent>
    </Card>
  )
}

// ─── Section: Where this plan stands ───────────────────────────────

type ChecklistStatus = "done" | "ready" | "pending" | "blocked"

function WhereThisStands({ plan }: { plan: SplitPlan }) {
  const consumerCount = plan.discovery_facts.consumer_count
  const eligibleGroupCount = plan.eligible_groups.length
  const blockedCount = plan.blocked_consumers.length
  const observedCount = consumerCount - blockedCount
  const hasGroups = eligibleGroupCount > 0
  const isApprovable = plan.state === "PROPOSED" && hasGroups && !plan.expired

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-zinc-600 dark:text-zinc-400 font-semibold">
          Where this plan stands
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ChecklistItem status="done" label="Shared role identified" />
        <ChecklistItem
          status="done"
          label={`${consumerCount} consumers identified`}
        />
        <ChecklistItem
          status={observedCount > 0 ? "done" : "pending"}
          label={
            observedCount > 0
              ? `Observed activity available for ${observedCount} of ${consumerCount} consumers`
              : `Awaiting first observed activity: ${blockedCount} of ${consumerCount}`
          }
          hint={
            observedCount === 0
              ? "Cyntro hasn't yet seen these consumers make API calls. Check back as data accumulates."
              : null
          }
        />
        <ChecklistItem
          status={hasGroups ? "done" : "pending"}
          label={
            hasGroups
              ? `Groups proposed: ${eligibleGroupCount}`
              : "Groups proposed: 0 (will appear once activity is observed)"
          }
        />
        <ChecklistItem
          status={
            plan.state === "APPROVED"
              ? "done"
              : plan.state === "EXECUTED"
              ? "done"
              : isApprovable
              ? "ready"
              : "blocked"
          }
          label={
            plan.state === "APPROVED"
              ? "Approved"
              : plan.state === "EXECUTED"
              ? "Executed"
              : isApprovable
              ? "Ready for approval"
              : "Approval: not meaningful yet"
          }
          hint={
            !hasGroups && plan.state === "PROPOSED"
              ? "There are no proposed groups to approve. Approval activates when at least one group has observed activity."
              : null
          }
        />
      </CardContent>
    </Card>
  )
}

function ChecklistItem({
  status,
  label,
  hint,
}: {
  status: ChecklistStatus
  label: string
  hint?: string | null
}) {
  const icon =
    status === "done" ? (
      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
    ) : status === "ready" ? (
      <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
    ) : status === "pending" ? (
      <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
    ) : (
      <Circle className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />
    )
  return (
    <div className="flex items-start gap-2.5">
      {icon}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && (
          <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
            {hint}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Section: Approval action ──────────────────────────────────────

function ApprovalAction({
  plan,
  onApproved,
}: {
  plan: SplitPlan
  onApproved: () => void
}) {
  const [approvedBy, setApprovedBy] = useState("")
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const eligibleCount = plan.eligible_groups.length

  // Terminal states first. APPROVED state is rendered as a simple
  // banner — actual execute/rollback actions live in the
  // <ExecuteActions> section directly below this one.
  if (plan.state === "APPROVED") {
    return (
      <Card className="border-l-4 border-l-emerald-600">
        <CardContent className="py-3 flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>
            Approved. Use the Execute / Rollback actions below to run
            CREATE_ONLY or STAGED_LAMBDA_GROUP against AWS.
          </span>
        </CardContent>
      </Card>
    )
  }

  if (plan.state !== "PROPOSED") {
    return (
      <Card className="border-l-4 border-l-zinc-400">
        <CardContent className="py-3 text-sm text-zinc-700 dark:text-zinc-400">
          Approval not available in state{" "}
          <span className="font-mono">{plan.state}</span>.
        </CardContent>
      </Card>
    )
  }

  if (plan.expired) {
    return (
      <Card className="border-l-4 border-l-zinc-500">
        <CardContent className="py-3 text-sm text-zinc-700 dark:text-zinc-400">
          This plan has expired. Re-generate to approve.
        </CardContent>
      </Card>
    )
  }

  // 0 eligible groups: disabled button with honest copy.
  if (eligibleCount === 0) {
    return (
      <Card className="border-l-4 border-l-zinc-300 dark:border-l-zinc-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Approve this plan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-zinc-700 dark:text-zinc-400">
            There's nothing to approve yet. Once at least one group of
            consumers has observed activity, this button activates.
          </p>
          <Button disabled className="opacity-60 cursor-not-allowed">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Approve plan
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Active approval form — only when there's something to approve.
  const submit = async () => {
    if (!approvedBy.trim()) {
      setSubmitError("Approver identity is required")
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      await approveSplitPlan(
        plan.plan_id,
        approvedBy.trim(),
        note.trim() || undefined
      )
      onApproved()
    } catch (e: any) {
      setSubmitError(String(e?.message ?? e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="border-l-4 border-l-emerald-600">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Approve this plan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-zinc-700 dark:text-zinc-400">
          Approving locks in the {eligibleCount} proposed group
          {eligibleCount === 1 ? "" : "s"} and unlocks the next step (creating
          the new roles in AWS).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Your identity (email or name)"
            value={approvedBy}
            onChange={(e) => setApprovedBy(e.target.value)}
            disabled={submitting}
            className="h-9 px-3 text-sm rounded-md border bg-background"
          />
          <div className="text-xs text-zinc-600 dark:text-zinc-400 self-center">
            Self-attested until SSO. Recorded on the audit log.
          </div>
        </div>
        <Textarea
          placeholder="Optional approval note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={submitting}
          rows={2}
          className="text-sm"
        />
        {submitError && (
          <p className="text-xs text-red-600 break-all">{submitError}</p>
        )}
        <Button onClick={submit} disabled={submitting || !approvedBy.trim()}>
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
          )}
          {submitting ? "Approving…" : "Approve plan"}
        </Button>
      </CardContent>
    </Card>
  )
}

// ─── Section: Consumers and groups ─────────────────────────────────

function ConsumersAndGroups({ plan }: { plan: SplitPlan }) {
  const eligible = plan.eligible_groups
  const blocked = plan.blocked_consumers
  const hasGroups = eligible.length > 0

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-zinc-600 dark:text-zinc-400 font-semibold">
          {hasGroups
            ? `Proposed scoped roles (${eligible.length})`
            : `Consumers on this role (${blocked.length})`}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasGroups && (
          <div className="space-y-3">
            {eligible.map((g) => (
              <EligibleGroupCard key={g.group_id} group={g} />
            ))}
          </div>
        )}
        {blocked.length > 0 && (
          <details className={hasGroups ? "mt-2" : ""}>
            <summary className="cursor-pointer text-sm font-medium text-zinc-800 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-zinc-50">
              {hasGroups
                ? `Show ${blocked.length} consumer${blocked.length === 1 ? "" : "s"} awaiting evidence`
                : `Show consumer list`}
            </summary>
            <div className="mt-3 space-y-2">
              {blocked.map((c) => (
                <ConsumerRow key={c.consumer_id} consumer={c} />
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  )
}

function ConsumerRow({ consumer }: { consumer: ConsumerEvidence }) {
  const reason =
    consumer.blockers.length > 0
      ? humanReason(consumer.blockers[0])
      : consumer.evidence_state === "HIGH"
      ? "Ready to group"
      : "Status pending"
  return (
    <div className="flex items-start gap-3 p-3 border rounded-md">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">
          {consumer.consumer_name || consumer.consumer_id}
        </div>
        <div className="text-xs font-mono text-zinc-600 dark:text-zinc-400 break-all">
          {consumer.consumer_id}
        </div>
        {consumer.system_name && (
          <div className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">
            System: {consumer.system_name}
          </div>
        )}
      </div>
      <div className="text-xs text-zinc-700 dark:text-zinc-400 shrink-0 text-right max-w-[45%]">
        {reason}
      </div>
    </div>
  )
}

function EligibleGroupCard({ group }: { group: SplitPlanGroup }) {
  return (
    <Card className="border-l-4 border-l-emerald-600">
      <CardContent className="py-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold">
              {group.proposed_role_name}
            </div>
            <div className="text-[11px] font-mono text-zinc-700 dark:text-zinc-400 mt-0.5">
              {group.group_id}
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {group.grouping_key.system_name && (
              <Badge variant="outline" className="text-[11px]">
                {group.grouping_key.system_name}
              </Badge>
            )}
            {group.grouping_key.consumer_type && (
              <Badge variant="secondary" className="text-[11px]">
                {group.grouping_key.consumer_type}
              </Badge>
            )}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-zinc-700 dark:text-zinc-400 mb-1">
            Consumers in this group ({group.consumers.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {group.consumers.map((c) => (
              <Badge
                key={c.consumer_id}
                variant="outline"
                className="text-[11px] font-mono"
              >
                {c.consumer_name || c.consumer_id}
              </Badge>
            ))}
          </div>
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer text-zinc-700 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100">
            Proposed policy document
          </summary>
          <pre className="mt-2 p-2 rounded-md bg-muted text-[11px] overflow-x-auto">
            {JSON.stringify(group.proposed_policy_document, null, 2)}
          </pre>
        </details>
      </CardContent>
    </Card>
  )
}

// ─── Section: Engineering details (collapsed) ──────────────────────

function EngineeringDetails({ plan }: { plan: SplitPlan }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-sm font-medium text-zinc-700 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 p-2">
        Engineering details
      </summary>
      <div className="mt-2 p-4 border rounded-md space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-xs text-zinc-800 dark:text-zinc-200">
          <MetaLine label="Plan ID">{plan.plan_id}</MetaLine>
          <MetaLine label="Plan hash">{plan.plan_hash.slice(0, 16)}…</MetaLine>
          <MetaLine label="Created">{formatTime(plan.created_at)}</MetaLine>
          <MetaLine label="Expires">
            {formatTime(plan.expires_at)}
            {plan.expired && (
              <span className="text-red-600 ml-1">(expired)</span>
            )}
          </MetaLine>
          <MetaLine label="Requested by">{plan.requested_by}</MetaLine>
          <MetaLine label="Modes enabled">
            {plan.execution_modes_enabled.join(", ") || "—"}
          </MetaLine>
        </div>
        {plan.data_caveats.length > 0 && (
          <div className="space-y-1">
            <div className="text-[11px] uppercase tracking-wide text-zinc-600 dark:text-zinc-400 font-semibold">
              Data caveats (engineering)
            </div>
            {plan.data_caveats.map((c, i) => (
              <p
                key={i}
                className="text-xs text-zinc-700 dark:text-zinc-400 leading-relaxed"
              >
                {c}
              </p>
            ))}
          </div>
        )}
        <details>
          <summary className="cursor-pointer text-zinc-700 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100">
            Raw plan JSON
          </summary>
          <pre className="mt-2 p-3 rounded-md bg-muted text-[10px] overflow-x-auto leading-relaxed">
            {JSON.stringify(plan, null, 2)}
          </pre>
        </details>
      </div>
    </details>
  )
}

function MetaLine({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="font-mono">
      <span className="uppercase tracking-wide text-zinc-600 dark:text-zinc-400 font-semibold">
        {label}:
      </span>{" "}
      <span>{children}</span>
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────

function summarizeKinds(
  kinds: Record<string, number>,
  total: number
): string {
  // "18 Lambda functions" if homogeneous; "12 principals (8 Lambda, 4 EC2)"
  // if mixed. Names are operator-friendly, not raw kind labels.
  const entries = Object.entries(kinds).filter(([, n]) => n > 0)
  if (entries.length === 0) return "principals"
  if (entries.length === 1) {
    return friendlyKind(entries[0][0], entries[0][1])
  }
  const sorted = [...entries].sort((a, b) => b[1] - a[1])
  const breakdown = sorted
    .map(([k, n]) => `${n} ${friendlyKind(k, n, /*short*/ true)}`)
    .join(", ")
  return `principals (${breakdown})`
}

function friendlyKind(kind: string, n: number, short = false): string {
  // Map graph labels to operator-friendly names.
  const map: Record<string, [string, string]> = {
    LambdaFunction: ["Lambda function", "Lambda functions"],
    Lambda: ["Lambda function", "Lambda functions"],
    EC2Instance: ["EC2 instance", "EC2 instances"],
    InstanceProfile: ["instance profile", "instance profiles"],
    IAMRole: ["IAM role", "IAM roles"],
    Service: ["service", "services"],
    Resource: ["resource", "resources"],
  }
  const [singular, plural] = map[kind] || [kind, kind]
  if (short) {
    // Compact form for multi-kind breakdown, e.g. "Lambda" not "Lambda functions"
    const shortMap: Record<string, string> = {
      LambdaFunction: "Lambda",
      Lambda: "Lambda",
      EC2Instance: "EC2",
      InstanceProfile: "InstanceProfile",
      IAMRole: "IAMRole",
      Service: "Service",
      Resource: "Resource",
    }
    return shortMap[kind] || kind
  }
  return n === 1 ? singular : plural
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}
