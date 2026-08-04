"use client"

import { AlertTriangle, Loader2, RefreshCw, ShieldCheck, Waypoints } from "lucide-react"
import type {
  AtlasFootholdCandidate,
  AtlasFootholdEvaluation,
  AtlasLateralChain,
  AtlasLateralResponse,
} from "./use-atlas-lateral"

const LIKELIHOOD_LABEL = {
  EXPOSED: "Exposed foothold",
  CREDENTIAL_EXPOSURE: "Credential exposure",
  ASSUMED_COMPROMISE: "Assume compromise",
} as const

function shortId(value: string): string {
  const tail = value.split(/[/:]/).filter(Boolean).pop() ?? value
  return tail.length > 32 ? `${tail.slice(0, 29)}…` : tail
}

function evaluationLabel(candidate: AtlasFootholdCandidate): string {
  const evaluation = candidate.atlas_evaluation
  if (!evaluation) return "not evaluated"
  if (evaluation.state === "REACHABLE") {
    return `${evaluation.chain_count} modeled chain${evaluation.chain_count === 1 ? "" : "s"}`
  }
  if (evaluation.state === "DEAD_END") return "modeled dead end"
  if (evaluation.state === "ERROR") return "evaluation error"
  return "not evaluated"
}

function stepResult(chain: AtlasLateralChain, index: number): string | null {
  const delta = chain.steps[index]?.state_delta
  return (
    delta?.added_captured_identities?.[0] ??
    delta?.added_accessible_resources?.[0] ??
    delta?.added_compromised_workloads?.[0] ??
    delta?.added_synthetic_nodes?.[0] ??
    null
  )
}

export function AtlasLateralLensPanel({
  candidates,
  selectedFootholdId,
  selectedFoothold,
  response,
  evaluation,
  candidatesLoading,
  simulationLoading,
  error,
  onSelectFoothold,
  onRetry,
}: {
  candidates: AtlasFootholdCandidate[]
  selectedFootholdId: string | null
  selectedFoothold: AtlasFootholdCandidate | null
  response: AtlasLateralResponse | null
  evaluation: AtlasFootholdEvaluation | null
  candidatesLoading: boolean
  simulationLoading: boolean
  error: string | null
  onSelectFoothold: (id: string) => void
  onRetry: () => void
}) {
  return (
    <div
      className="rounded-lg border border-amber-200/70 bg-amber-50/40 px-3 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/10"
      data-testid="zoom0-atlas-lateral"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">
          <Waypoints className="h-3.5 w-3.5" />
          Attacker simulation · service → jewel
        </div>
        {response ? (
          <span className="text-[10px] font-mono text-muted-foreground">
            {response.catalog_version} · replay validated · {response.elapsed_ms}ms
          </span>
        ) : null}
      </div>

      {candidatesLoading ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading compute footholds…
        </p>
      ) : error && candidates.length === 0 ? (
        <p className="mt-2 flex items-center gap-2 text-[11px] text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5" /> {error}
          <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 underline">
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </p>
      ) : candidates.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          No supported compute services were found in the current graph projection.
        </p>
      ) : (
        <>
          <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <label className="min-w-0">
              <span className="sr-only">Initial compromised service</span>
              <select
                value={selectedFootholdId ?? ""}
                onChange={(event) => onSelectFoothold(event.target.value)}
                className="w-full rounded-md border border-amber-300/70 bg-background px-2.5 py-1.5 text-[11px] text-foreground outline-none focus:ring-2 focus:ring-amber-500/30 dark:border-amber-500/40"
                data-testid="atlas-foothold-picker"
              >
                {candidates.map((candidate) => (
                  <option key={candidate.workload_id} value={candidate.workload_id}>
                    {candidate.atlas_rank ? `#${candidate.atlas_rank} · ` : ""}{candidate.workload_name} · {candidate.workload_type} · {shortId(candidate.workload_id)} · {evaluationLabel(candidate)}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-[10px] text-muted-foreground">
              {evaluation
                ? `${evaluation.reachable_count} reachable · ${evaluation.evaluated_count}/${evaluation.eligible_count} evaluated${evaluation.coverage_state === "PARTIAL" ? " · partial" : ""}`
                : `${candidates.length} eligible service${candidates.length === 1 ? "" : "s"}`}
            </span>
          </div>

          {selectedFoothold ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className="rounded border border-amber-300/70 bg-background px-1.5 py-0.5 font-semibold text-amber-800 dark:border-amber-500/40 dark:text-amber-300">
                {LIKELIHOOD_LABEL[selectedFoothold.foothold_likelihood]}
              </span>
              <span className="text-muted-foreground">
                {selectedFoothold.foothold_reasons.join(" · ").replaceAll("_", " ")}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className={selectedFoothold.atlas_evaluation?.state === "REACHABLE" ? "font-semibold text-red-700 dark:text-red-300" : "text-muted-foreground"}>
                {evaluationLabel(selectedFoothold)}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className={selectedFoothold.observed_access_to_jewel ? "text-sky-700 dark:text-sky-300" : "text-amber-800 dark:text-amber-300"}>
                {selectedFoothold.observed_access_to_jewel
                  ? "access to this jewel observed"
                  : "no access to this jewel observed"}
              </span>
            </div>
          ) : null}

          {simulationLoading ? (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> ATLAS is enumerating and replaying chains…
            </p>
          ) : error ? (
            <p className="mt-2 text-[11px] text-amber-900 dark:text-amber-200">Simulation unavailable: {error}</p>
          ) : response ? (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
              <span className={response.chains.length > 0 ? "font-semibold text-red-700 dark:text-red-300" : "font-semibold text-emerald-700 dark:text-emerald-300"}>
                {response.chains.length > 0
                  ? `${response.chains.length} replay-validated attack chain${response.chains.length === 1 ? "" : "s"}`
                  : "No chain found within modeled scope"}
              </span>
              <span className="text-muted-foreground">{response.dead_ends.length} dead ends explored</span>
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="h-3 w-3" /> deterministic
              </span>
            </div>
          ) : null}

          {response?.coverage_warnings?.map((warning) => (
            <p key={warning.code} className="mt-1 text-[10px] text-amber-900 dark:text-amber-200">
              {warning.code}: {warning.message}
            </p>
          ))}
        </>
      )}
    </div>
  )
}

export function AtlasLateralChainCanvas({
  selectedFoothold,
  response,
  loading,
  jewelName,
  evaluation,
  recommendedFoothold,
  onSelectFoothold,
}: {
  selectedFoothold: AtlasFootholdCandidate | null
  response: AtlasLateralResponse | null
  loading: boolean
  jewelName: string
  evaluation: AtlasFootholdEvaluation | null
  recommendedFoothold: AtlasFootholdCandidate | null
  onSelectFoothold: (id: string) => void
}) {
  if (loading) {
    return <div className="flex h-full min-h-[360px] items-center justify-center text-[12px] text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Simulating attacker movement…</div>
  }
  if (!selectedFoothold) {
    return <div className="flex h-full min-h-[360px] items-center justify-center text-[12px] text-muted-foreground">Select an initial compromised service.</div>
  }
  if (!response) {
    return <div className="flex h-full min-h-[360px] items-center justify-center text-[12px] text-muted-foreground">Simulation evidence unavailable.</div>
  }
  if (response.chains.length === 0) {
    return (
      <div className="flex h-full min-h-[360px] flex-col items-center justify-center px-6 text-center">
        <ShieldCheck className="h-7 w-7 text-emerald-600" />
        <p className="mt-2 text-sm font-semibold text-foreground">No modeled chain from {selectedFoothold.workload_name} to {jewelName}</p>
        <p className="mt-1 max-w-xl text-[11px] text-muted-foreground">
          This result applies to the selected foothold—not every service. ATLAS explored {response.dead_ends.length} dead ends under catalog {response.catalog_version}.
        </p>
        {evaluation && evaluation.reachable_count > 0 && recommendedFoothold ? (
          <button
            type="button"
            onClick={() => onSelectFoothold(recommendedFoothold.workload_id)}
            className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-100 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"
          >
            View reachable chain from {recommendedFoothold.workload_name}
          </button>
        ) : null}
      </div>
    )
  }
  return (
    <div className="h-full min-h-[360px] overflow-auto p-5" data-testid="atlas-lateral-chain-canvas">
      <div className="space-y-4">
        {response.chains.slice(0, 8).map((chain, chainIndex) => (
          <div key={chain.chain_id} className="rounded-xl border border-red-200/80 bg-card p-4 shadow-sm dark:border-red-500/30">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-300">
                Attack chain {chainIndex + 1} · {chain.steps.length} moves
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">
                feasibility {Math.round(chain.feasibility_score * 100)}% · cost {chain.total_cost}
              </div>
            </div>
            <div className="mt-4 flex min-w-max items-stretch gap-2">
              <div className="w-44 rounded-lg border border-amber-300/70 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Initial foothold</div>
                <div className="mt-1 text-[12px] font-semibold text-foreground">{selectedFoothold.workload_name}</div>
                <div className="text-[10px] text-muted-foreground">{selectedFoothold.workload_type}</div>
              </div>
              {chain.steps.map((step, index) => {
                const result = stepResult(chain, index)
                const last = index === chain.steps.length - 1
                return (
                  <div key={`${chain.chain_id}-${step.step_index}`} className="flex items-center gap-2">
                    <span className="text-muted-foreground">→</span>
                    <div className={`w-52 rounded-lg border p-3 ${last ? "border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10" : "border-border bg-muted/30"}`}>
                      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Move {index + 1}</div>
                      <div className="mt-1 break-words font-mono text-[10px] font-semibold text-foreground">{step.primitive_id.replaceAll("_", " ")}</div>
                      {result ? <div className="mt-1 truncate text-[10px] text-muted-foreground" title={result}>{shortId(result)}</div> : null}
                    </div>
                  </div>
                )
              })}
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">→</span>
                <div className="w-44 rounded-lg border border-red-400 bg-red-100 p-3 dark:border-red-500/50 dark:bg-red-500/15">
                  <div className="text-[9px] uppercase tracking-wider text-red-700 dark:text-red-300">Crown jewel reached</div>
                  <div className="mt-1 text-[12px] font-semibold text-foreground">{jewelName}</div>
                </div>
              </div>
            </div>
            {chain.assumptions_consumed.length > 0 ? (
              <div className="mt-3 text-[10px] text-muted-foreground">
                Assumptions: {chain.assumptions_consumed.join(" · ").replaceAll("_", " ")}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
