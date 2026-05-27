"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  Network,
  Play,
  RefreshCw,
  Undo2,
  XCircle,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  approveSGSplitPlan,
  executeSGSplitPlan,
  fetchSGGateReadiness,
  fetchSGPlanHistory,
  fetchSGSplitPlan,
  rollbackSGSplitPlan,
} from "@/lib/api-client"
import { HeroStrip } from "./sg-shared-sgs/hero-strip"
import { BeforeAfterCards } from "./sg-shared-sgs/before-after-cards"
import { SwapPlanTab } from "./sg-shared-sgs/swap-plan-tab"
import { KVRow } from "./sg-shared-sgs/kv-row"

// SG-9d redesigned detail view. Parent stays lean (orchestration +
// data fetching + action panel). Each tab is its own sub-component.
// Tab order matches the operator's mental flow:
//   Before & After (the decision)
//   Rules diff      (the contents of the new SGs)
//   Swap plan       (what Apply actually does)
//   Gates           (preflight readiness)
//   History         (audit trail)

interface DetailViewProps {
  planId: string
}

export default function SGSharedSGsDetailView({ planId }: DetailViewProps) {
  const [plan, setPlan] = useState<any>(null)
  const [history, setHistory] = useState<any>(null)
  const [gates, setGates] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [actor, setActor] = useState("alon")
  const [busy, setBusy] = useState<"approve" | "execute" | "rollback" | null>(null)
  const [actionResult, setActionResult] = useState<string | null>(null)
  const [tab, setTab] = useState<string>("before-after")

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      fetchSGSplitPlan(planId),
      fetchSGPlanHistory(planId).catch(() => ({ executions: [], rollbacks: [] })),
      fetchSGGateReadiness(planId, "CREATE_ONLY").catch(() => null),
    ])
      .then(([p, h, g]) => {
        if (!cancelled) {
          setPlan(p)
          setHistory(h)
          setGates(g)
        }
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

  // ── derived props for sub-components ───────────────────────────
  const reductionPct = useMemo(() => {
    const v =
      plan?.blast_radius_summary?.after?.summary
        ?.average_blast_reduction_pct_for_grouped
    return typeof v === "number" ? v : null
  }, [plan])

  const avgBlastAfter = useMemo(() => {
    // average_blast_reduction_pct_for_grouped is reduction %, not the
    // absolute "remaining" count. Derive remaining = before × (1 - r/100).
    const before = plan?.before_summary?.blast_radius_if_any_compromised
    if (typeof before !== "number" || reductionPct == null) return null
    return before * (1 - reductionPct / 100)
  }, [plan, reductionPct])

  // ── action handlers ────────────────────────────────────────────
  const handleApprove = async () => {
    setBusy("approve")
    setActionResult(null)
    try {
      const result = await approveSGSplitPlan(planId, actor)
      setActionResult(`✓ Approved — state=${result.state}`)
      reload()
    } catch (e: any) {
      setActionResult(`✗ ${e.message}`)
    } finally {
      setBusy(null)
    }
  }

  const handleExecute = async () => {
    setBusy("execute")
    setActionResult(null)
    try {
      const result = await executeSGSplitPlan(planId, "CREATE_ONLY", actor, false)
      setActionResult(
        `✓ Executed CREATE_ONLY — created=${result.created?.length ?? 0} ` +
          `skipped=${result.skipped?.length ?? 0} failed=${result.failed?.length ?? 0}` +
          ` (final_plan_state=${result.final_plan_state})`
      )
      reload()
    } catch (e: any) {
      setActionResult(`✗ ${e.message}`)
    } finally {
      setBusy(null)
    }
  }

  const handleRollback = async () => {
    if (!confirm("Roll back CREATE_ONLY for this plan? This will delete every tagged SG.")) return
    setBusy("rollback")
    setActionResult(null)
    try {
      const result = await rollbackSGSplitPlan(planId, actor, false)
      setActionResult(
        `✓ Rollback CREATE_ONLY — deleted=${result.deleted?.length ?? 0} ` +
          `absent=${result.absent?.length ?? 0} failed=${result.failed?.length ?? 0}` +
          ` (final_plan_state=${result.final_plan_state})`
      )
      reload()
    } catch (e: any) {
      setActionResult(`✗ ${e.message}`)
    } finally {
      setBusy(null)
    }
  }

  // ── render ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Loading plan…</span>
      </div>
    )
  }

  if (error || !plan) {
    return (
      <div className="p-6 space-y-3">
        <div className="flex items-center gap-3">
          <Link
            href="/sg/shared-sgs"
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Plan not found</h1>
        </div>
        <div className="text-sm text-red-700 dark:text-red-300">
          {error || `No plan with id=${planId}`}
        </div>
      </div>
    )
  }

  const state: string = plan.state || "UNKNOWN"
  const sgInfo = plan.shared_sg || {}
  const groups: any[] = plan.eligible_groups || []
  const blockedConsumers: any[] = plan.blocked_consumers || []
  const dataCaveats: string[] = plan.data_caveats || []
  const membership = plan.membership_dependency_analysis || {}
  const beforeSummary = plan.before_summary ?? null
  const swapPlan = plan.swap_plan ?? null

  return (
    <div className="space-y-5 p-6">
      <PlanHeader
        sgName={sgInfo.sg_name || sgInfo.sg_id || planId}
        planId={planId}
        state={state}
        expired={!!plan.expired}
        onReload={reload}
        loading={loading}
      />

      <HeroStrip
        before={beforeSummary}
        blastRadiusAfter={avgBlastAfter}
        reductionPct={reductionPct}
      />

      <ActionPanel
        actor={actor}
        setActor={setActor}
        busy={busy}
        state={state}
        expired={!!plan.expired}
        actionResult={actionResult}
        gates={gates}
        onApprove={handleApprove}
        onExecute={handleExecute}
        onRollback={handleRollback}
      />

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList>
          <TabsTrigger value="before-after">Before &amp; After</TabsTrigger>
          <TabsTrigger value="swap-plan">Swap plan</TabsTrigger>
          <TabsTrigger value="gates">Gates</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="before-after" className="space-y-4">
          <BeforeAfterCards
            planId={planId}
            sgInfo={sgInfo}
            before={beforeSummary}
            groups={groups}
            avgBlastAfter={avgBlastAfter}
            reductionPct={reductionPct}
            membershipExternalIn={membership.external_inbound_refs || []}
            membershipExternalOut={membership.external_outbound_refs || []}
            membershipSelfRefs={membership.self_refs || []}
          />
          {dataCaveats.length > 0 && (
            <Card>
              <CardContent className="p-3 space-y-1 text-xs">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-medium text-[11px] uppercase tracking-wide">
                  <Info className="w-3.5 h-3.5" />
                  Data caveats
                </div>
                {dataCaveats.map((c, i) => (
                  <div key={i} className="text-zinc-700 dark:text-zinc-200">• {c}</div>
                ))}
              </CardContent>
            </Card>
          )}
          {blockedConsumers.length > 0 && (
            <BlockedConsumersBlock blocked={blockedConsumers} />
          )}
        </TabsContent>

        <TabsContent value="swap-plan" className="space-y-3">
          <SwapPlanTab swapPlan={swapPlan} />
        </TabsContent>

        <TabsContent value="gates" className="space-y-3">
          <GatesTab gates={gates} />
        </TabsContent>

        <TabsContent value="history" className="space-y-3">
          <HistoryTab history={history} />
        </TabsContent>
      </Tabs>
    </div>
  )
}


// ─── sub-blocks kept inline (small) ─────────────────────────────


function PlanHeader({
  sgName, planId, state, expired, onReload, loading,
}: {
  sgName: string
  planId: string
  state: string
  expired: boolean
  onReload: () => void
  loading: boolean
}) {
  return (
    <header className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/sg/shared-sgs"
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Back to list"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Network className="w-5 h-5 text-zinc-500" />
              {sgName}
            </h1>
            <div className="text-xs text-muted-foreground font-mono mt-0.5">
              plan {planId}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StateBadge state={state} expired={expired} />
          <Button variant="outline" size="sm" onClick={onReload} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>
    </header>
  )
}


function StateBadge({ state, expired }: { state: string; expired: boolean }) {
  const styles: Record<string, string> = {
    PROPOSED: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    APPROVED: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
    EXECUTING: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
    EXECUTED: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
    REJECTED: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    EXPIRED: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
        styles[state] || styles.PROPOSED
      }`}
    >
      {state}
      {expired && <span className="text-[10px] opacity-70 ml-1">(expired)</span>}
    </span>
  )
}


function ActionPanel({
  actor, setActor, busy, state, expired, actionResult, gates,
  onApprove, onExecute, onRollback,
}: {
  actor: string
  setActor: (s: string) => void
  busy: "approve" | "execute" | "rollback" | null
  state: string
  expired: boolean
  actionResult: string | null
  gates: any
  onApprove: () => void
  onExecute: () => void
  onRollback: () => void
}) {
  const gatesPassed = gates?.gates?.filter((g: any) => g.status === "passed").length ?? 0
  const gatesTotal = gates?.gates?.length ?? 0
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="actor" className="text-xs">Actor (self-attested)</Label>
            <Input
              id="actor"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              className="w-40 h-8"
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onApprove}
            disabled={busy !== null || state !== "PROPOSED" || expired}
          >
            {busy === "approve" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
            Approve
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={onExecute}
            disabled={busy !== null || state !== "APPROVED" || expired}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {busy === "execute" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
            Execute CREATE_ONLY
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRollback}
            disabled={busy !== null || !["APPROVED", "EXECUTED", "EXPIRED"].includes(state)}
          >
            {busy === "rollback" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Undo2 className="w-3 h-3 mr-1" />}
            Rollback
          </Button>
          {gates && (
            <div className="ml-auto text-[11px] flex items-center gap-1.5">
              {gates.ready ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-amber-600" />
              )}
              <span className="text-muted-foreground">
                Gates <span className="tabular-nums">{gatesPassed}/{gatesTotal}</span>
                {!gates.ready && gates.first_blocker && (
                  <> · first blocker: <span className="font-mono">{gates.first_blocker}</span></>
                )}
              </span>
            </div>
          )}
        </div>
        {actionResult && (
          <div
            className={`text-xs p-2 rounded ${
              actionResult.startsWith("✓")
                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
                : "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-200"
            }`}
          >
            {actionResult}
          </div>
        )}
      </CardContent>
    </Card>
  )
}


function BlockedConsumersBlock({ blocked }: { blocked: any[] }) {
  return (
    <Card>
      <CardContent className="p-3 space-y-2 text-xs">
        <div className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">
          Blocked consumers ({blocked.length})
        </div>
        {blocked.slice(0, 10).map((c, i) => (
          <div key={i} className="flex items-start gap-2">
            <Badge variant="outline" className="text-[10px] font-normal shrink-0">
              {c.evidence_state}
            </Badge>
            <div>
              <div className="font-mono">{c.consumer_name || c.consumer_id}</div>
              {(c.blockers || []).slice(0, 2).map((b: string, j: number) => (
                <div key={j} className="text-muted-foreground">↳ {b}</div>
              ))}
            </div>
          </div>
        ))}
        {blocked.length > 10 && (
          <div className="text-[11px] opacity-60">+{blocked.length - 10} more…</div>
        )}
      </CardContent>
    </Card>
  )
}


function GatesTab({ gates }: { gates: any }) {
  if (!gates) {
    return <div className="text-sm text-muted-foreground">Gate readiness unavailable.</div>
  }
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Gate readiness</span>
          <Badge variant="outline" className="text-[10px]">mode={gates.mode}</Badge>
          {gates.ready ? (
            <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300">
              ready
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300">
              blocked · {gates.first_blocker}
            </Badge>
          )}
        </div>
        <div className="space-y-1.5 text-xs">
          {(gates.gates || []).map((g: any) => (
            <div key={g.name} className="flex items-start gap-2">
              {g.status === "passed" ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
              ) : g.status === "failed" ? (
                <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
              ) : (
                <Clock className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
              )}
              <div>
                <span className="font-medium">{g.name}</span>
                <span className="text-[10px] opacity-60 ml-1">[{g.status}]</span>
                <div className="text-muted-foreground">{g.message}</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}


function HistoryTab({ history }: { history: any }) {
  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 space-y-2 text-xs">
          <div className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">
            Executions ({history?.executions?.length ?? 0})
          </div>
          {(history?.executions || []).length === 0 && (
            <div className="text-muted-foreground">No executions yet.</div>
          )}
          {(history?.executions || []).map((e: any) => (
            <div key={e.execution_id} className="rounded border border-zinc-200 dark:border-zinc-800 p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono">{e.execution_id}</span>
                <Badge variant="outline" className="text-[10px]">{e.status}</Badge>
              </div>
              <div className="text-muted-foreground">
                {e.mode} · by {e.requested_by} · {e.started_at}
              </div>
              <div>
                created={e.created_sg_ids?.length ?? 0} ·
                skipped={e.skipped_group_names?.length ?? 0} ·
                failed={e.failed_group_names?.length ?? 0}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 space-y-2 text-xs">
          <div className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">
            Rollbacks ({history?.rollbacks?.length ?? 0})
          </div>
          {(history?.rollbacks || []).length === 0 && (
            <div className="text-muted-foreground">No rollbacks yet.</div>
          )}
          {(history?.rollbacks || []).map((r: any) => (
            <div key={r.rollback_id} className="rounded border border-zinc-200 dark:border-zinc-800 p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono">{r.rollback_id}</span>
                <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
              </div>
              <div className="text-muted-foreground">
                {r.mode} · by {r.rolled_back_by} · {r.started_at}
              </div>
              <div>
                deleted={r.deleted_sg_names?.length ?? 0} ·
                absent={r.absent_sg_names?.length ?? 0} ·
                failed={r.failed_sg_names?.length ?? 0}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

// KVRow is exported from ./sg-shared-sgs/kv-row for re-use; suppress
// unused-import warning by referencing it here.
export { KVRow }
