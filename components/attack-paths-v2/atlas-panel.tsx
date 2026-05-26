"use client"

// ATLAS Panel — Phase 3.2 (2026-05-27).
//
// Renders the chain-search results from POST /api/atlas/search/{system}.
// Distinct from the existing Attacker View tabs in that:
//
//   1. The chains here come from the DETERMINISTIC catalog-driven engine
//      (api/atlas/engine.py), not graph-edge traversal.
//   2. Every step in every chain has been REPLAY-VALIDATED through the
//      policy evaluator before it appears.
//   3. The engine is scope-bounded by `max_hops`, `time_horizon_seconds`,
//      and an explicit set of operator-toggleable assumptions — every
//      chain says exactly which assumptions it consumed.
//
// What the operator sees today (v1):
//   - Foothold + target inputs (defaults: any workload with an IP,
//     and the URL's selected jewel)
//   - "Run search" button
//   - One card per returned chain showing the ordered primitives, the
//     captured/accessible artifacts, and the consumed assumptions
//   - Coverage warnings inline when the engine flags soundness or
//     budget issues
//
// What's deliberately deferred:
//   - Graph rendering of chains (Phase 3.3)
//   - Narrator agent for plain-English explanation (Phase 3.4)
//   - Operator-side assumption toggling UI (Phase 3.5)

import { useState, useEffect, useRef } from "react"
import { Shield, AlertCircle, ChevronRight, Loader2, Play, Clock } from "lucide-react"

// ─── Types — mirror api/atlas/types.py AtlasResponse ─────────────────

interface AtlasChainStep {
  step_index: number
  primitive_id: string
  from_state_fingerprint: string
  to_state_fingerprint: string
  state_delta: {
    added_compromised_workloads: string[]
    added_captured_identities: string[]
    added_accessible_resources: string[]
    added_synthetic_edges: string[]
    added_synthetic_nodes: string[]
  }
  edge_evidence_ids: string[]
}

interface AtlasChain {
  chain_id: string
  steps: AtlasChainStep[]
  total_cost: number
  feasibility_score: number
  primitives_used: string[]
  blocking_controls: string[]
  assumptions_consumed: string[]
  evidence_chain: Array<{
    edge_id: string | null
    node_id: string | null
    property_path: string | null
    description: string
  }>
}

interface AtlasResponse {
  request: {
    start_node_id: string
    target_node_id: string
    catalog_version: string
    assumption_set_version: string
    active_assumptions: string[]
    max_hops: number
    max_cost: number
    time_horizon_seconds: number
  }
  chains: AtlasChain[]
  dead_ends: Array<{
    dead_end_id: string
    steps: AtlasChainStep[]
    exhaustion_reason: string
  }>
  coverage_warnings: Array<{
    code: string
    message: string
    detail: Record<string, any>
  }>
  engine_version: string
  catalog_version: string
  assumption_set_version: string
  graph_snapshot_id: string
  generated_at: string
  elapsed_ms: number
}

interface AtlasPanelProps {
  systemName: string
  selectedJewelId: string | null
  selectedJewelName: string | null
  // Optional starting workload pre-fill. The page may pass a foothold
  // suggestion from the selected path; if absent, the operator types
  // one into the input.
  defaultStartWorkload?: string
}

// ─── Component ────────────────────────────────────────────────────────

export function AtlasPanel({
  systemName,
  selectedJewelId,
  selectedJewelName,
  defaultStartWorkload,
}: AtlasPanelProps) {
  const [startNodeId, setStartNodeId] = useState<string>(defaultStartWorkload ?? "")
  const [targetNodeId, setTargetNodeId] = useState<string>(selectedJewelId ?? "")
  const [maxHops, setMaxHops] = useState<number>(6)
  const [horizonDays, setHorizonDays] = useState<number>(0)

  const [response, setResponse] = useState<AtlasResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sync the target field when the user picks a different jewel in the
  // sidebar. We only auto-fill if the user hasn't typed something custom.
  // `userEditedTarget` tracks whether the operator has manually edited
  // away from the auto-filled value; once true, jewel changes don't
  // overwrite their custom target.
  const userEditedTarget = useRef(false)
  useEffect(() => {
    if (!userEditedTarget.current && selectedJewelId && targetNodeId !== selectedJewelId) {
      setTargetNodeId(selectedJewelId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJewelId])

  async function runSearch() {
    if (!startNodeId.trim() || !targetNodeId.trim()) {
      setError("Both foothold and target are required.")
      return
    }
    setLoading(true)
    setError(null)
    setResponse(null)
    try {
      const res = await fetch(
        `/api/proxy/atlas/search/${encodeURIComponent(systemName)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start_node_id: startNodeId.trim(),
            target_node_id: targetNodeId.trim(),
            max_hops: maxHops,
            time_horizon_seconds: horizonDays * 24 * 3600,
          }),
        },
      )
      const data = await res.json()
      if (!res.ok) {
        setError(data?.detail || data?.error || `Backend ${res.status}`)
        return
      }
      setResponse(data as AtlasResponse)
    } catch (err: any) {
      setError(String(err?.message ?? err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-semibold text-slate-100">
            ATLAS — Deterministic Chain Search
          </h2>
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
            v0.1
          </span>
        </div>
        <p className="text-sm text-slate-400 max-w-3xl">
          Every chain below is produced by the catalog-driven engine and
          replay-validated through the policy evaluator. Chains say what
          attacker assumptions they consumed and what controls would
          block them.
        </p>
      </header>

      {/* Controls */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">
              Foothold (start workload)
            </label>
            <input
              type="text"
              value={startNodeId}
              onChange={(e) => setStartNodeId(e.target.value)}
              placeholder="e.g. i-0aa725bf8ff4c2001"
              className="w-full bg-slate-950 border border-slate-700 text-slate-100 text-sm rounded px-3 py-1.5 font-mono focus:border-emerald-500 focus:outline-none"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              EC2 instance id where the attacker first lands.
            </p>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">
              Target (crown jewel or role)
            </label>
            <input
              type="text"
              value={targetNodeId}
              onChange={(e) => {
                userEditedTarget.current = true
                setTargetNodeId(e.target.value)
              }}
              placeholder="arn:aws:iam:::..."
              className="w-full bg-slate-950 border border-slate-700 text-slate-100 text-sm rounded px-3 py-1.5 font-mono focus:border-emerald-500 focus:outline-none"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              {selectedJewelName ? (
                <>Auto-filled from selected jewel: <span className="text-slate-300">{selectedJewelName}</span>. Edit to target a different role/resource.</>
              ) : (
                "ARN of a role or resource the attacker is trying to reach."
              )}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">
              Max hops
            </label>
            <input
              type="number"
              value={maxHops}
              min={1}
              max={20}
              onChange={(e) => setMaxHops(parseInt(e.target.value || "6", 10))}
              className="w-full bg-slate-950 border border-slate-700 text-slate-100 text-sm rounded px-3 py-1.5"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">
              Time horizon (days, 0 = no filter)
            </label>
            <input
              type="number"
              value={horizonDays}
              min={0}
              max={365}
              onChange={(e) => setHorizonDays(parseInt(e.target.value || "0", 10))}
              className="w-full bg-slate-950 border border-slate-700 text-slate-100 text-sm rounded px-3 py-1.5"
            />
          </div>
        </div>
        <button
          onClick={runSearch}
          disabled={loading || !startNodeId.trim() || !targetNodeId.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed border border-emerald-500/40 text-emerald-200 text-sm font-medium rounded transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching graph…
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Run ATLAS search
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <div className="text-sm text-red-200">{error}</div>
        </div>
      )}

      {/* Results */}
      {response && <AtlasResultsView response={response} />}

      {/* Empty state */}
      {!response && !loading && !error && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-8 text-center">
          <p className="text-sm text-slate-400">
            Click <span className="text-emerald-300 font-medium">Run ATLAS search</span> to find every chain from foothold to target.
          </p>
          <p className="text-[11px] text-slate-500 mt-2">
            The engine loads identity grants + graph truth from Neo4j, runs deterministic BFS over the v_2026_05_01 primitive catalog, and replay-validates every chain it returns.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Result rendering ─────────────────────────────────────────────────

function AtlasResultsView({ response }: { response: AtlasResponse }) {
  const { chains, dead_ends, coverage_warnings } = response

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 flex items-center gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Chains</div>
          <div className={`text-2xl font-bold ${chains.length > 0 ? "text-red-300" : "text-emerald-300"}`}>
            {chains.length}
          </div>
        </div>
        <div className="h-10 w-px bg-slate-800" />
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Dead-ends</div>
          <div className="text-2xl font-bold text-slate-300">{dead_ends.length}</div>
        </div>
        <div className="h-10 w-px bg-slate-800" />
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Warnings</div>
          <div className="text-2xl font-bold text-amber-300">{coverage_warnings.length}</div>
        </div>
        <div className="h-10 w-px bg-slate-800" />
        <div className="flex items-center gap-1 text-[10px] text-slate-500">
          <Clock className="w-3 h-3" />
          <span>{response.elapsed_ms}ms · catalog {response.catalog_version} · engine {response.engine_version}</span>
        </div>
      </div>

      {/* Coverage warnings (always render if present — soundness signals) */}
      {coverage_warnings.length > 0 && (
        <div className="space-y-2">
          {coverage_warnings.map((w, i) => (
            <div
              key={i}
              className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200"
            >
              <span className="font-mono text-[10px] text-amber-300">{w.code}</span>
              <span className="ml-2">{w.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Empty (no chains found) — the GOOD outcome */}
      {chains.length === 0 && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-6">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-emerald-200">
              No reachable chain under the configured catalog + assumptions.
            </span>
          </div>
          <p className="text-xs text-slate-400">
            The engine explored every applicable primitive from the foothold and could not satisfy the preconditions of any chain ending at the target. This is the soundness contract — ATLAS never fabricates chains.
          </p>
          {dead_ends.length > 0 && (
            <p className="text-xs text-slate-500 mt-2">
              {dead_ends.length} dead-end path{dead_ends.length === 1 ? "" : "s"} explored.
            </p>
          )}
        </div>
      )}

      {/* Chain cards */}
      {chains.map((chain, i) => (
        <ChainCard key={chain.chain_id} chain={chain} index={i + 1} />
      ))}
    </div>
  )
}

function ChainCard({ chain, index }: { chain: AtlasChain; index: number }) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/5 overflow-hidden">
      <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/30 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-red-200">Chain {index}</span>
          <span className="font-mono text-[10px] text-slate-500">
            {chain.chain_id.slice(0, 16)}…
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-400">
          <span>cost <span className="text-slate-200">{chain.total_cost}</span></span>
          <span>feasibility <span className="text-slate-200">{(chain.feasibility_score * 100).toFixed(0)}%</span></span>
          <span>{chain.steps.length} hop{chain.steps.length === 1 ? "" : "s"}</span>
        </div>
      </div>
      <div className="p-4 space-y-2">
        {chain.steps.map((step, idx) => (
          <StepRow key={step.step_index} step={step} isLast={idx === chain.steps.length - 1} />
        ))}
      </div>
      {chain.assumptions_consumed.length > 0 && (
        <div className="px-4 pb-3 -mt-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Assumptions consumed</div>
          <div className="flex flex-wrap gap-1">
            {chain.assumptions_consumed.map((a) => (
              <span
                key={a}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-300 border border-slate-700"
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      )}
      {chain.blocking_controls.length > 0 && (
        <div className="px-4 pb-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Could be blocked by</div>
          <div className="flex flex-wrap gap-1">
            {chain.blocking_controls.map((b) => (
              <span
                key={b}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-200 border border-emerald-500/30"
              >
                {b}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StepRow({ step, isLast }: { step: AtlasChainStep; isLast: boolean }) {
  const d = step.state_delta
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center pt-0.5 shrink-0">
        <div className="w-6 h-6 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center text-[10px] font-bold text-red-200">
          {step.step_index + 1}
        </div>
        {!isLast && <div className="w-px h-full bg-red-500/30 mt-1" />}
      </div>
      <div className="flex-1 min-w-0 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-red-200">{step.primitive_id}</span>
        </div>
        <div className="mt-1 space-y-0.5 text-xs text-slate-400">
          {d.added_captured_identities.length > 0 && (
            <div className="flex items-start gap-1">
              <ChevronRight className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
              <span>
                captured: <span className="font-mono text-amber-200 break-all">{d.added_captured_identities.join(", ")}</span>
              </span>
            </div>
          )}
          {d.added_accessible_resources.length > 0 && (
            <div className="flex items-start gap-1">
              <ChevronRight className="w-3 h-3 text-violet-400 mt-0.5 shrink-0" />
              <span>
                accessible: <span className="font-mono text-violet-200 break-all">{d.added_accessible_resources.join(", ")}</span>
              </span>
            </div>
          )}
          {d.added_compromised_workloads.length > 0 && (
            <div className="flex items-start gap-1">
              <ChevronRight className="w-3 h-3 text-rose-400 mt-0.5 shrink-0" />
              <span>
                workload compromised: <span className="font-mono text-rose-200 break-all">{d.added_compromised_workloads.join(", ")}</span>
              </span>
            </div>
          )}
          {d.added_synthetic_nodes.length > 0 && (
            <div className="flex items-start gap-1">
              <ChevronRight className="w-3 h-3 text-cyan-400 mt-0.5 shrink-0" />
              <span>
                spawned: <span className="font-mono text-cyan-200 break-all">{d.added_synthetic_nodes.join(", ")}</span>
              </span>
            </div>
          )}
          {d.added_synthetic_edges.length > 0 && (
            <div className="flex items-start gap-1">
              <ChevronRight className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
              <span>
                added edge: <span className="font-mono text-emerald-200 break-all">{d.added_synthetic_edges.join(", ")}</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
