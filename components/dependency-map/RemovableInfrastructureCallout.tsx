"use client"

/**
 * RemovableInfrastructureCallout — top-level "executive insight" panel
 * that surfaces REMOVE_ROUTE candidates above the path list.
 *
 * Maps to the project narrative "Internet Dependency: NONE on a public
 * RT" — a closeable insight, not a buried path row. Each candidate is
 * one row: RT id, route being removed (cidr → target_kind/target_id),
 * scope (N workloads), confidence signal text, and a three-step
 * Simulate → Apply → Rollback flow.
 *
 * Per feedback_no_mock_numbers_in_ui.md: three states (live / loading
 * / not-wired). No fabricated numbers. If the backend returns no
 * candidates, the callout renders NOTHING (silent absence — the empty
 * state belongs upstream).
 *
 * Per feedback_remediation_safety_signals.md: every row surfaces
 * confidence_signal + scope + (after simulate) the live pipeline result.
 *
 * Per feedback_signal_language.md: copy is "Removable", "No observed
 * egress", "Eligible for removal" — never "Suspicious" / "Safe".
 *
 * Per feedback_dont_ask_to_confirm.md: one click → SIMULATE → diff →
 * one click → FULL. No modal confirmations, no nag prompts.
 */

import { useMemo, useState } from "react"
import { ShieldOff, Activity, CheckCircle2, AlertTriangle, Loader2, RotateCcw, ChevronRight } from "lucide-react"

// ---------- Types ----------------------------------------------------

// Shape the egress-flow-map already passes us (we re-declare narrowly
// to avoid coupling the callout to the rest of the file).
export interface RemoveRouteCandidate {
  rtId: string
  proposalId: string | null
  cidr: string | null
  targetKind: string | null
  targetId: string | null
  targetName: string | null
  scopeWorkloadCount: number
  confidenceSignal: string
}

// Result shape the backend's /proposals/execute returns (matches
// api/posture_remediations.execute_proposal).
interface ExecuteResult {
  proposal_id?: string | null
  pipeline_id: string
  stage: string
  status: string
  change_results?: Array<{
    change_id: string
    success: boolean
    action: string
    snapshot_id?: string | null
    error?: string | null
    aws_calls?: string[]
  }>
  errors?: string[]
}

// Per-row execution state — the callout holds one of these per RT.
// `error` is for transport / 5xx failures (network, proxy, unhandled
// exception). `blocked` is for HTTP-200 pipeline blocks — the scorer
// or a safety gate refused the change on purpose. Conflating the two
// causes operators to retry "Request failed" as if it were a network
// blip when actually the system safely refused the action.
type RowState =
  | { phase: "idle" }
  | { phase: "simulating" }
  | { phase: "simulated"; result: ExecuteResult }
  | { phase: "applying"; simulateResult: ExecuteResult }
  | { phase: "applied"; result: ExecuteResult }
  | { phase: "rolling_back"; appliedResult: ExecuteResult }
  | { phase: "rolled_back"; snapshotId: string }
  | { phase: "blocked"; reasons: string[]; stage: string; status: string; lastPhase: RowState["phase"] }
  | { phase: "error"; message: string; lastPhase: RowState["phase"] }

// ---------- Public API ----------------------------------------------

export function RemovableInfrastructureCallout({
  candidates,
}: {
  candidates: RemoveRouteCandidate[]
}) {
  if (candidates.length === 0) return null

  const totalScope = candidates.reduce((sum, c) => sum + c.scopeWorkloadCount, 0)
  const igwCount = candidates.filter(c => c.targetKind === "InternetGateway").length
  const natCount = candidates.filter(c => c.targetKind === "NATGateway").length

  return (
    <div
      className="rounded-xl border overflow-hidden mb-4"
      style={{ borderColor: "rgba(245,158,11,0.30)", background: "linear-gradient(180deg, rgba(245,158,11,0.05) 0%, rgba(15,23,42,0.4) 100%)" }}
    >
      {/* Editorial header — sentence-style, matches the path list's tone */}
      <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: "rgba(245,158,11,0.20)" }}>
        <div className="flex items-baseline justify-between gap-4">
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-amber-300/80">
              Removable infrastructure
            </span>
            <span className="text-base font-semibold mt-0.5 text-amber-50">
              {candidates.length === 1
                ? "1 route table has a public-egress route with no observed traffic"
                : `${candidates.length} route tables have public-egress routes with no observed traffic`}
            </span>
            <span className="text-[11px] mt-1 text-amber-200/70">
              Eligible for removal · {totalScope} workload{totalScope === 1 ? "" : "s"} share these RT
              {candidates.length === 1 ? "" : "s"} · zero observed egress in the 30-day window
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 shrink-0">
            <span className="text-2xl font-semibold tabular-nums text-amber-100">
              {candidates.length}
            </span>
            <span className="text-[11px] uppercase tracking-[0.12em] font-semibold text-amber-300/80">
              {candidates.length === 1 ? "candidate" : "candidates"}
            </span>
          </div>
        </div>
        {/* Gateway-mix sub-line (only if there is meaningful mix) */}
        {(igwCount > 0 || natCount > 0) && (
          <div className="mt-2 flex items-center gap-4 text-[10px] uppercase tracking-[0.1em] font-semibold text-amber-300/70">
            {igwCount > 0 && (
              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-amber-100">{igwCount}</span>
                <span>via internet gateway</span>
              </span>
            )}
            {natCount > 0 && (
              <span className="inline-flex items-baseline gap-1.5">
                <span className="text-amber-100">{natCount}</span>
                <span>via NAT gateway</span>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="divide-y" style={{ borderColor: "rgba(245,158,11,0.15)" }}>
        {candidates.map((c) => (
          <CandidateRow key={c.rtId} candidate={c} />
        ))}
      </div>
    </div>
  )
}

// ---------- Per-row Simulate → Apply → Rollback flow -----------------

function CandidateRow({ candidate }: { candidate: RemoveRouteCandidate }) {
  const [state, setState] = useState<RowState>({ phase: "idle" })

  const canSimulate = !!candidate.proposalId && !!candidate.cidr && !!candidate.targetKind && !!candidate.targetId

  async function runStage(maxStage: "SIMULATE" | "FULL") {
    if (!canSimulate) return
    const prevPhase = state.phase
    const lastResult = state.phase === "simulated" ? state.result : null
    setState(maxStage === "SIMULATE" ? { phase: "simulating" } : { phase: "applying", simulateResult: lastResult! })
    try {
      const res = await fetch("/api/proxy/posture-visibility/proposals/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal_id: candidate.proposalId,
          action: "REMOVE_ROUTE",
          resource_type: "RouteTable",
          resource_id: candidate.rtId,
          parameters: {
            cidr: candidate.cidr,
            target_kind: candidate.targetKind,
            target_id: candidate.targetId,
          },
          max_stage: maxStage,
          requested_by: "egress-flow-map:RemovableInfrastructureCallout",
        }),
      })
      const json = (await res.json()) as ExecuteResult & { detail?: string; error?: string }
      // Distinguish a transport / 5xx failure from a clean pipeline
      // block: a 200 response with non-empty errors[] is the scorer or
      // a safety gate refusing the change on purpose, not a request
      // failure. Surface those as the "blocked" phase with the
      // operator-facing reasons.
      if (!res.ok) {
        setState({
          phase: "error",
          message: json.detail || json.error || `HTTP ${res.status}`,
          lastPhase: prevPhase,
        })
        return
      }
      if (json.errors && json.errors.length > 0) {
        setState({
          phase: "blocked",
          reasons: json.errors,
          stage: json.stage || "?",
          status: json.status || "?",
          lastPhase: prevPhase,
        })
        return
      }
      if (maxStage === "SIMULATE") {
        setState({ phase: "simulated", result: json })
      } else {
        setState({ phase: "applied", result: json })
      }
    } catch (e: any) {
      setState({ phase: "error", message: e?.message || "request failed", lastPhase: prevPhase })
    }
  }

  async function rollback() {
    if (state.phase !== "applied") return
    const snapshotId = state.result.change_results?.[0]?.snapshot_id
    if (!snapshotId) {
      setState({ phase: "error", message: "applied result has no snapshot_id; cannot rollback", lastPhase: "applied" })
      return
    }
    setState({ phase: "rolling_back", appliedResult: state.result })
    try {
      const res = await fetch("/api/proxy/posture-visibility/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot_id: snapshotId,
          requested_by: "egress-flow-map:RemovableInfrastructureCallout",
          parameters: {
            cidr: candidate.cidr,
            target_kind: candidate.targetKind,
            target_id: candidate.targetId,
          },
        }),
      })
      const json = (await res.json()) as { success?: boolean; error?: string; detail?: string }
      if (!res.ok || json.success === false) {
        setState({
          phase: "error",
          message: json.detail || json.error || `rollback failed: HTTP ${res.status}`,
          lastPhase: "applied",
        })
        return
      }
      setState({ phase: "rolled_back", snapshotId })
    } catch (e: any) {
      setState({ phase: "error", message: e?.message || "rollback request failed", lastPhase: "applied" })
    }
  }

  return (
    <div className="px-5 py-3.5">
      <div className="flex items-start justify-between gap-4">
        {/* Left: identity + signal */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span className="font-mono text-[13px] font-semibold text-amber-50 truncate">
              {candidate.rtId}
            </span>
            <ChevronRight className="w-3 h-3 text-amber-400/50 shrink-0" />
            <span className="font-mono text-[12px] text-amber-100/90 truncate">
              {candidate.cidr || "?"}
            </span>
            <span className="text-[11px] text-amber-300/70 shrink-0">→</span>
            <span className="text-[12px] text-amber-100/90 truncate">
              {candidate.targetKind || "?"} <span className="font-mono">{candidate.targetId || ""}</span>
            </span>
          </div>
          <div className="text-[11px] text-amber-200/80 leading-relaxed">
            {candidate.confidenceSignal}
          </div>
          {/* Scope badge */}
          <div className="mt-1.5 inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-amber-200">
              Scope · {candidate.scopeWorkloadCount} workload{candidate.scopeWorkloadCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {/* Right: action buttons / state */}
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <RowActionGroup
            state={state}
            canSimulate={canSimulate}
            onSimulate={() => runStage("SIMULATE")}
            onApply={() => runStage("FULL")}
            onRollback={() => rollback()}
            onReset={() => setState({ phase: "idle" })}
          />
        </div>
      </div>

      {/* Bottom: phase-specific detail panel */}
      <RowDetailPanel state={state} />
    </div>
  )
}

// ---------- Action buttons -------------------------------------------

function RowActionGroup({
  state,
  canSimulate,
  onSimulate,
  onApply,
  onRollback,
  onReset,
}: {
  state: RowState
  canSimulate: boolean
  onSimulate: () => void
  onApply: () => void
  onRollback: () => void
  onReset: () => void
}) {
  if (state.phase === "idle" || state.phase === "error" || state.phase === "blocked") {
    return (
      <button
        type="button"
        disabled={!canSimulate}
        onClick={onSimulate}
        title={canSimulate ? "Dry-run the route deletion (no AWS mutation)" : "Backend did not emit a proposal_id for this candidate; cannot simulate"}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors ${
          canSimulate
            ? "border-amber-500/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25"
            : "border-slate-700 bg-slate-800/40 text-slate-500 cursor-not-allowed"
        }`}
      >
        Simulate
      </button>
    )
  }
  if (state.phase === "simulating") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold border border-amber-500/40 bg-amber-500/15 text-amber-100">
        <Loader2 className="w-3 h-3 animate-spin" />
        Simulating…
      </span>
    )
  }
  if (state.phase === "simulated") {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onReset}
          className="px-2 py-1 rounded text-[10px] font-semibold border border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-800"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onApply}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold border border-amber-400/60 bg-amber-500/25 text-amber-50 hover:bg-amber-500/35"
        >
          Apply
        </button>
      </div>
    )
  }
  if (state.phase === "applying") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold border border-amber-400/60 bg-amber-500/25 text-amber-50">
        <Loader2 className="w-3 h-3 animate-spin" />
        Applying…
      </span>
    )
  }
  if (state.phase === "applied") {
    return (
      <button
        type="button"
        onClick={onRollback}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold border border-emerald-500/40 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
      >
        <RotateCcw className="w-3 h-3" />
        Rollback
      </button>
    )
  }
  if (state.phase === "rolling_back") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold border border-emerald-500/40 bg-emerald-500/15 text-emerald-100">
        <Loader2 className="w-3 h-3 animate-spin" />
        Rolling back…
      </span>
    )
  }
  if (state.phase === "rolled_back") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold border border-slate-600 bg-slate-800/60 text-slate-300">
        <CheckCircle2 className="w-3 h-3" />
        Restored
      </span>
    )
  }
  return null
}

// ---------- Phase-specific detail panel ------------------------------

function RowDetailPanel({ state }: { state: RowState }) {
  if (state.phase === "idle") return null

  if (state.phase === "simulated") {
    const cr = state.result.change_results?.[0]
    const ok = cr?.success === true
    return (
      <div className="mt-2.5 rounded-md border border-amber-500/25 bg-slate-900/40 px-3 py-2 text-[11px]">
        <div className="flex items-center gap-1.5 mb-1">
          {ok ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-rose-300" />
          )}
          <span className="font-semibold text-slate-100">
            Simulation {ok ? "passed" : "failed"}
          </span>
          <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-400">
            stage={state.result.stage} · status={state.result.status}
          </span>
        </div>
        {ok ? (
          <p className="text-slate-300 leading-relaxed">
            AWS accepts the delete-route call. No mutation has run. Apply when ready.
          </p>
        ) : (
          <p className="text-rose-200/90 leading-relaxed">
            {cr?.error || (state.result.errors || []).join("; ") || "Pipeline blocked simulation; review and re-run."}
          </p>
        )}
      </div>
    )
  }

  if (state.phase === "applied") {
    const cr = state.result.change_results?.[0]
    return (
      <div className="mt-2.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[11px]">
        <div className="flex items-center gap-1.5 mb-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
          <span className="font-semibold text-emerald-50">Route deleted</span>
          <span className="ml-auto text-[10px] uppercase tracking-wider text-emerald-300/80">
            snapshot {cr?.snapshot_id || "?"}
          </span>
        </div>
        <p className="text-emerald-100/90 leading-relaxed">
          AWS calls: <span className="font-mono">{(cr?.aws_calls || []).join(", ") || "(none recorded)"}</span>.
          Click Rollback to restore the route via the snapshot.
        </p>
      </div>
    )
  }

  if (state.phase === "rolled_back") {
    return (
      <div className="mt-2.5 rounded-md border border-slate-600 bg-slate-800/40 px-3 py-2 text-[11px]">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-slate-300" />
          <span className="font-semibold text-slate-100">Route restored</span>
          <span className="ml-auto text-[10px] uppercase tracking-wider text-slate-400">
            snapshot {state.snapshotId}
          </span>
        </div>
      </div>
    )
  }

  if (state.phase === "blocked") {
    // The scorer or a safety gate refused the change. Different from a
    // request failure — this is the system working as designed.
    // Operator-facing copy is "blocked by safety gate", details list
    // the specific reasons (score, view_drift, behavioral_drift, etc.).
    return (
      <div className="mt-2.5 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[11px]">
        <div className="flex items-center gap-1.5 mb-1">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />
          <span className="font-semibold text-amber-100">Blocked by safety gate</span>
          <span className="ml-auto text-[10px] uppercase tracking-wider text-amber-300/80">
            stage={state.stage} · status={state.status}
          </span>
        </div>
        <ul className="text-amber-100/90 leading-relaxed font-mono list-disc pl-4 space-y-0.5">
          {state.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
        <p className="mt-1.5 text-amber-200/70 leading-relaxed">
          Click Simulate again after the underlying signal changes, or escalate
          to an authorized operator if the gate's verdict needs override.
        </p>
      </div>
    )
  }

  if (state.phase === "error") {
    return (
      <div className="mt-2.5 rounded-md border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-[11px]">
        <div className="flex items-center gap-1.5 mb-1">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-300" />
          <span className="font-semibold text-rose-100">Request failed</span>
        </div>
        <p className="text-rose-200/90 leading-relaxed font-mono">{state.message}</p>
      </div>
    )
  }

  return null
}

// ---------- Helper: derive candidates from EgressResponse-shaped data -

export function deriveRemoveRouteCandidates(
  workloads: Array<{ route_table?: { id: string; recommendation?: { type?: string } | null } | null }>,
): RemoveRouteCandidate[] {
  const seen = new Map<string, RemoveRouteCandidate>()
  for (const w of workloads) {
    const rt = w.route_table
    if (!rt || !rt.recommendation) continue
    if (rt.recommendation.type !== "REMOVE_ROUTE") continue
    if (seen.has(rt.id)) continue
    // Cast narrowly to the REMOVE_ROUTE shape — the discriminated union
    // is in egress-flow-map.tsx; we accept the structural fields we need.
    const rec = rt.recommendation as {
      type: "REMOVE_ROUTE"
      proposal_id?: string | null
      scope_workload_count: number
      candidate_route_cidr?: string | null
      candidate_route_target_kind?: string | null
      candidate_route_target_id?: string | null
      candidate_route_target_name?: string | null
      confidence_signal: string
    }
    seen.set(rt.id, {
      rtId: rt.id,
      proposalId: rec.proposal_id ?? null,
      cidr: rec.candidate_route_cidr ?? null,
      targetKind: rec.candidate_route_target_kind ?? null,
      targetId: rec.candidate_route_target_id ?? null,
      targetName: rec.candidate_route_target_name ?? null,
      scopeWorkloadCount: rec.scope_workload_count,
      confidenceSignal: rec.confidence_signal,
    })
  }
  return Array.from(seen.values()).sort((a, b) => {
    // Highest scope first — the most impactful candidate at the top.
    if (b.scopeWorkloadCount !== a.scopeWorkloadCount) {
      return b.scopeWorkloadCount - a.scopeWorkloadCount
    }
    return a.rtId.localeCompare(b.rtId)
  })
}
