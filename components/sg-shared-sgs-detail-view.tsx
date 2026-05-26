"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  Network,
  Play,
  RefreshCw,
  ShieldAlert,
  Undo2,
  XCircle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  fetchSGStagePreview,
  rollbackSGSplitPlan,
} from "@/lib/api-client"

// SG-9b detail view. Mirrors iam-shared-roles-detail-view.tsx but
// LEAN — single file, single tab structure, no per-group deep nesting.
// SG-9c will add per-group STAGED preview UI + richer drift surfaces.

interface DetailViewProps {
  planId: string
}

export default function SGSharedSGsDetailView({ planId }: DetailViewProps) {
  const router = useRouter()
  const [plan, setPlan] = useState<any>(null)
  const [history, setHistory] = useState<any>(null)
  const [gates, setGates] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [actor, setActor] = useState("alon")
  const [busy, setBusy] = useState<"approve" | "execute" | "rollback" | null>(null)
  const [actionResult, setActionResult] = useState<string | null>(null)

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
  const blastRadius = plan.blast_radius_summary || {}
  const membership = plan.membership_dependency_analysis || {}
  const stagedBlocked = Boolean(plan.staged_would_be_blocked)

  return (
    <div className="space-y-5 p-6">
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
                {sgInfo.sg_name || sgInfo.sg_id || planId}
              </h1>
              <div className="text-xs text-muted-foreground font-mono mt-0.5">
                plan {planId}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StateBadge state={state} expired={!!plan.expired} />
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </header>

      {/* Action panel */}
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
              onClick={handleApprove}
              disabled={busy !== null || state !== "PROPOSED" || plan.expired}
              title={
                state !== "PROPOSED"
                  ? "Approve only valid in PROPOSED state"
                  : plan.expired
                  ? "Plan expired"
                  : "Approve PROPOSED → APPROVED"
              }
            >
              {busy === "approve" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
              Approve
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleExecute}
              disabled={busy !== null || state !== "APPROVED" || plan.expired}
              title={
                state !== "APPROVED"
                  ? "Execute only valid in APPROVED state"
                  : "Execute CREATE_ONLY"
              }
            >
              {busy === "execute" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
              Execute CREATE_ONLY
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRollback}
              disabled={
                busy !== null ||
                !["APPROVED", "EXECUTED", "EXPIRED"].includes(state)
              }
              title="Rollback CREATE_ONLY — deletes every tagged SG"
            >
              {busy === "rollback" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Undo2 className="w-3 h-3 mr-1" />}
              Rollback
            </Button>
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

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="groups">Groups ({groups.length})</TabsTrigger>
          <TabsTrigger value="topology">Topology</TabsTrigger>
          <TabsTrigger value="gates">Gates</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Shared SG</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="sg_id" value={sgInfo.sg_id} mono />
              <Row label="sg_name" value={sgInfo.sg_name} />
              <Row label="vpc_id" value={sgInfo.vpc_id} mono />
              <Row label="owner_id" value={sgInfo.owner_id} mono />
              <Row label="region" value={sgInfo.region} />
              <Row label="inbound rules" value={sgInfo.inbound_rule_count} />
              <Row label="outbound rules" value={sgInfo.outbound_rule_count} />
              <Row label="unused" value={sgInfo.unused_rules_count} />
              <Row label="high-risk" value={sgInfo.high_risk_rule_count} />
              <Row
                label="public ingress"
                value={sgInfo.has_public_ingress ? "yes" : "no"}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Blast-radius reduction
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row
                label="source attachments (before)"
                value={blastRadius?.before?.source_attachment_count}
              />
              <Row
                label="groups proposed (after)"
                value={blastRadius?.after?.summary?.group_count}
              />
              <Row
                label="ready to split"
                value={blastRadius?.after?.summary?.ratio_label}
              />
              <Row
                label="avg reduction per consumer"
                value={
                  blastRadius?.after?.summary
                    ?.average_blast_reduction_pct_for_grouped !== undefined
                    ? `${blastRadius.after.summary.average_blast_reduction_pct_for_grouped}%`
                    : undefined
                }
              />
            </CardContent>
          </Card>

          {dataCaveats.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Info className="w-4 h-4 text-amber-500" />
                  Data caveats
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {dataCaveats.map((c, i) => (
                  <div key={i} className="text-muted-foreground">• {c}</div>
                ))}
              </CardContent>
            </Card>
          )}

          {blockedConsumers.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Blocked consumers ({blockedConsumers.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {blockedConsumers.slice(0, 10).map((c: any, i: number) => (
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
                {blockedConsumers.length > 10 && (
                  <div className="text-[11px] opacity-60">
                    +{blockedConsumers.length - 10} more…
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="groups" className="space-y-3">
          {groups.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No eligible groups in this plan. Inspect blocked_consumers + data_caveats.
              </CardContent>
            </Card>
          ) : (
            groups.map((g) => (
              <GroupCard key={g.group_id} group={g} planId={planId} />
            ))
          )}
        </TabsContent>

        <TabsContent value="topology" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                Membership-dependency analysis
                {stagedBlocked && (
                  <Badge
                    variant="outline"
                    className="text-[10px] border-red-300 text-red-700 dark:border-red-700 dark:text-red-300"
                  >
                    STAGED would be blocked
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {membership.evidence_completeness === "degraded" && (
                <div className="text-amber-700 dark:text-amber-300">
                  ⚠ Evidence degraded — see SG-0 pending items
                </div>
              )}

              <Row
                label="external inbound refs"
                value={membership.external_inbound_refs?.length ?? 0}
              />
              <Row
                label="external outbound refs"
                value={membership.external_outbound_refs?.length ?? 0}
              />
              <Row
                label="internal refs"
                value={membership.internal_outbound_refs?.length ?? 0}
              />
              <Row
                label="self refs"
                value={membership.self_refs?.length ?? 0}
              />

              {(membership.blocker_summary || []).length > 0 && (
                <div className="space-y-1 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Blocker summary
                  </div>
                  {membership.blocker_summary.map((b: any, i: number) => (
                    <div key={i} className="flex items-start gap-2">
                      <AlertTriangle
                        className={`w-3 h-3 mt-0.5 shrink-0 ${
                          b.severity === "hard" ? "text-red-500" : "text-amber-500"
                        }`}
                      />
                      <div>
                        <span className="font-mono">{b.code}</span>
                        <span className="text-[10px] opacity-60 ml-1">
                          [{b.phase_blocked}/{b.severity}]
                        </span>
                        <div className="text-muted-foreground">{b.message}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gates" className="space-y-3">
          {gates ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  Gate readiness · mode={gates.mode}
                  {gates.ready ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300"
                    >
                      ready
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] border-red-300 text-red-700 dark:border-red-700 dark:text-red-300"
                    >
                      first_blocker: {gates.first_blocker}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs">
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
              </CardContent>
            </Card>
          ) : (
            <div className="text-sm text-muted-foreground">Gate readiness unavailable.</div>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Executions ({history?.executions?.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {(history?.executions || []).length === 0 && (
                <div className="text-muted-foreground">No executions yet.</div>
              )}
              {(history?.executions || []).map((e: any) => (
                <div
                  key={e.execution_id}
                  className="rounded border border-zinc-200 dark:border-zinc-800 p-2 space-y-1"
                >
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
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Rollbacks ({history?.rollbacks?.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {(history?.rollbacks || []).length === 0 && (
                <div className="text-muted-foreground">No rollbacks yet.</div>
              )}
              {(history?.rollbacks || []).map((r: any) => (
                <div
                  key={r.rollback_id}
                  className="rounded border border-zinc-200 dark:border-zinc-800 p-2 space-y-1"
                >
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
        </TabsContent>
      </Tabs>
    </div>
  )
}


// ──────────────────────────────────────────────────────────────────


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


function Row({
  label, value, mono,
}: {
  label: string
  value: string | number | null | undefined
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-[12px]" : ""}>
        {value === null || value === undefined || value === "" ? (
          <span className="text-zinc-400">—</span>
        ) : (
          String(value)
        )}
      </span>
    </div>
  )
}


function GroupCard({ group, planId }: { group: any; planId: string }) {
  const [preview, setPreview] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePreview = async () => {
    setLoading(true)
    setError(null)
    setPreview(null)
    try {
      const result = await fetchSGStagePreview(planId, group.group_id)
      setPreview(result)
    } catch (e: any) {
      setError(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-start justify-between gap-2">
          <div>
            <div className="font-mono text-[12px]">{group.proposed_group_name}</div>
            <div className="text-[10px] text-muted-foreground font-normal mt-0.5">
              {group.group_id}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePreview}
            disabled={loading}
            className="text-[11px] h-7"
            title="STAGED dry-run preview — reads live AWS, no mutation"
          >
            {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
            Preview STAGED
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <Row label="vpc_id" value={group.proposed_vpc_id} mono />
        <Row label="system_name" value={group.grouping_key?.system_name} />
        <Row label="consumer_type" value={group.grouping_key?.consumer_type} />
        <Row label="consumers" value={(group.consumers || []).length} />
        <Row
          label="proposed inbound rules"
          value={(group.proposed_inbound_rules || []).length}
        />
        <Row
          label="proposed outbound rules"
          value={(group.proposed_outbound_rules || []).length}
        />

        {error && (
          <div className="text-red-700 dark:text-red-300 text-[11px]">{error}</div>
        )}

        {preview && (
          <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-1">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              STAGED preview · {preview.summary?.ratio_label}
            </div>
            {(preview.overall_blockers || []).map((b: any, i: number) => (
              <div key={i} className="flex items-start gap-1 text-[11px]">
                <AlertTriangle className="w-3 h-3 mt-0.5 text-red-500" />
                <span className="font-mono">{b.code}</span>
                <span className="text-muted-foreground">{b.message}</span>
              </div>
            ))}
            {(preview.consumers || []).slice(0, 5).map((c: any) => (
              <div
                key={c.consumer_id}
                className="rounded border border-zinc-200 dark:border-zinc-800 p-2 space-y-0.5"
              >
                <div className="font-mono text-[11px]">{c.consumer_id}</div>
                {c.actionable ? (
                  <div className="text-[11px]">
                    {c.sgs_to_remove?.length ? `−${c.sgs_to_remove.join(",")} ` : ""}
                    {c.sgs_to_add?.length ? `+${c.sgs_to_add.join(",")}` : ""}
                  </div>
                ) : (
                  <div className="text-[11px] text-amber-700 dark:text-amber-300">
                    {(c.blockers || []).map((b: any) => b.code).join(" · ")}
                  </div>
                )}
              </div>
            ))}
            {(preview.consumers || []).length > 5 && (
              <div className="text-[10px] opacity-60">
                +{preview.consumers.length - 5} more…
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
