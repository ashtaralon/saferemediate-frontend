"use client"

/**
 * Topology v0.2 — workload detail panel.
 *
 * Slide-in panel surfacing the full contributor breakdown, evidence per
 * signal, freshness chips, warning callouts, confidence reasons, and raw
 * evidence fields (where the contract provides them).
 *
 * Every value is real — render `—` placeholder when the field is absent
 * rather than fabricate. Remediation CTAs (Trace, Suggest VPCE, Re-sync,
 * Quarantine) are deferred — they belong to flows the topology-risk endpoint
 * doesn't own.
 */

import {
  type Contributor,
  type NodeScore,
  SIGNAL_LABEL,
  type TopologyNode,
} from "./types"

interface Props {
  node: TopologyNode | null
  onClose: () => void
  /** Handoff to Traffic Map (observed flows). */
  onOpenTrafficMap?: () => void
  /** Handoff to Risk → Attack Paths. */
  onOpenAttackPaths?: () => void
}

function ConfidenceBadge({ tier }: { tier: NodeScore["confidence"]["tier"] }) {
  const colors: Record<NodeScore["confidence"]["tier"], string> = {
    FULL: "bg-emerald-900/40 text-emerald-200 border-emerald-700/50",
    DEGRADED: "bg-amber-900/40 text-amber-200 border-amber-700/50",
    LOW: "bg-rose-900/40 text-rose-200 border-rose-700/50",
  }
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded border ${colors[tier]}`}>
      {tier}
    </span>
  )
}

function ContributorRow({ c }: { c: Contributor }) {
  const valuePct = Math.round(c.value * 100)
  const weightPct = Math.round(c.weight * 100)
  const weightedPct = Math.round(c.value * c.weight * 100)
  return (
    <div className="rounded border border-slate-700/60 p-3 bg-slate-900/50">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-xs font-semibold text-slate-100">
          {SIGNAL_LABEL[c.signal]}
        </div>
        <div className="text-[10px] text-slate-500 font-mono">
          weight {weightPct}% × value {valuePct}% = {weightedPct} pts
        </div>
      </div>

      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden mb-2">
        <div
          className={`h-full ${valuePct > 60 ? "bg-rose-400" : valuePct > 30 ? "bg-amber-400" : "bg-teal-400"}`}
          style={{ width: `${valuePct}%` }}
        />
      </div>

      <div className="flex items-center gap-2 text-[10px] mb-2">
        <span
          className={`px-1.5 py-0.5 rounded font-mono ${
            c.freshness.is_fresh
              ? "bg-emerald-900/30 text-emerald-300"
              : "bg-amber-900/30 text-amber-300"
          }`}
        >
          {c.freshness.source}{" "}
          {c.freshness.is_fresh
            ? "fresh"
            : c.freshness.age_days !== null && c.freshness.age_days !== undefined
            ? `${c.freshness.age_days}d stale`
            : "stale"}
        </span>
        {c.freshness.threshold_days !== undefined && (
          <span className="text-slate-500">threshold {c.freshness.threshold_days}d</span>
        )}
      </div>

      {c.evidence && Object.keys(c.evidence).length > 0 && (
        <details className="text-[10px] mb-2">
          <summary className="text-slate-400 cursor-pointer hover:text-slate-200">
            Evidence
          </summary>
          <pre className="mt-1 p-2 bg-slate-950/60 rounded text-slate-300 overflow-x-auto whitespace-pre-wrap break-words font-mono">
            {JSON.stringify(c.evidence, null, 2)}
          </pre>
        </details>
      )}

      {c.warnings && c.warnings.length > 0 && (
        <div className="space-y-1.5">
          {c.warnings.map(w => (
            <div key={w.code} className="text-[10px] bg-amber-900/15 border border-amber-700/40 rounded p-1.5">
              <div className="text-amber-200 font-semibold">{w.code}</div>
              <div className="text-amber-100/80 mt-0.5">{w.message}</div>
              <div className="text-slate-400 mt-0.5 italic">{w.auto_resolves_when}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function DetailPanel({ node, onClose, onOpenTrafficMap, onOpenAttackPaths }: Props) {
  if (!node) return null

  const isStale = !!node.stale
  const score = node.score

  return (
    <aside
      className="fixed top-0 right-0 h-full w-full md:w-[480px] bg-slate-950/95 backdrop-blur border-l border-slate-700 shadow-2xl overflow-y-auto z-40"
      role="dialog"
      aria-label={`Detail for workload ${node.name}`}
    >
      <div className="sticky top-0 bg-slate-950/95 backdrop-blur border-b border-slate-700 p-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-teal-400 font-semibold">
            Spotlight · {node.type ?? "Workload"}
          </div>
          <div className="text-base font-semibold text-slate-100 mt-1 flex items-center gap-2 truncate">
            {node.is_jewel && <span className="text-amber-300" title="Crown jewel">♛</span>}
            {node.name}
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">{node.id}</div>
          {node.subnet_id && (
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">subnet {node.subnet_id}</div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-100 text-xl leading-none px-2"
          aria-label="Close detail panel"
        >
          ×
        </button>
      </div>

      {(onOpenTrafficMap || onOpenAttackPaths) ? (
        <div
          className="px-4 py-2.5 flex flex-wrap gap-2 border-b border-slate-700"
          data-testid="topology-detail-handoffs"
        >
          {onOpenTrafficMap ? (
            <button
              type="button"
              onClick={onOpenTrafficMap}
              className="text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded border border-teal-700/50 text-teal-300 hover:bg-teal-900/30"
            >
              Open in Traffic Map
            </button>
          ) : null}
          {onOpenAttackPaths ? (
            <button
              type="button"
              onClick={onOpenAttackPaths}
              className="text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded border border-rose-700/50 text-rose-300 hover:bg-rose-900/30"
            >
              {node.is_jewel ? "View attack paths to this jewel" : "View attack paths"}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="p-4 space-y-5">
        {isStale && (
          <div className="rounded border border-slate-600/60 bg-slate-900/60 p-3">
            <div className="text-xs font-semibold text-slate-300">Stale — excluded from rank</div>
            <div className="text-[11px] text-slate-400 mt-1">
              Reason: <span className="font-mono">{node.stale!.reason}</span>
            </div>
            {node.stale!.since && (
              <div className="text-[11px] text-slate-500 mt-1">since {node.stale!.since}</div>
            )}
          </div>
        )}

        {score && (
          <>
            <section>
              <h3 className="text-[11px] uppercase tracking-[0.14em] text-slate-400 font-semibold mb-2">
                Score
              </h3>
              <div className="flex items-baseline gap-3">
                <div className="text-4xl font-bold text-slate-50">{score.value}</div>
                <div className="text-sm text-slate-400">/ 100</div>
                <div className="ml-auto text-xs uppercase tracking-wide text-slate-300">{score.tier}</div>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Rank #{score.rank ?? "—"} on this system
              </div>
            </section>

            <section>
              <h3 className="text-[11px] uppercase tracking-[0.14em] text-slate-400 font-semibold mb-2">
                Confidence{" "}
                <ConfidenceBadge tier={score.confidence.tier} />
              </h3>
              <div className="text-xs text-slate-300 mb-2">
                {Math.round(score.confidence.value * 100)}% (MIN-of-contributors)
              </div>
              {score.confidence.reasons.length > 0 && (
                <div className="space-y-1.5">
                  {score.confidence.reasons.map(r => (
                    <div
                      key={r.signal}
                      className={`text-[11px] rounded border p-2 ${
                        r.is_fresh
                          ? "border-emerald-700/40 bg-emerald-900/10"
                          : "border-amber-700/40 bg-amber-900/10"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-200">
                          {SIGNAL_LABEL[r.signal as keyof typeof SIGNAL_LABEL] ?? r.signal}
                        </span>
                        <span className={r.is_fresh ? "text-emerald-300" : "text-amber-300"}>
                          {r.is_fresh ? "fresh" : `${r.age_days ?? "?"}d stale (threshold ${r.threshold_days}d)`}
                        </span>
                      </div>
                      {!r.is_fresh && (
                        <div className="text-slate-400 mt-1 italic">{r.auto_resolves_when}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-[11px] uppercase tracking-[0.14em] text-slate-400 font-semibold mb-2">
                Contributors · ordered by contract §3.2
              </h3>
              <div className="space-y-2">
                {score.contributors.map(c => (
                  <ContributorRow key={c.signal} c={c} />
                ))}
              </div>
            </section>
          </>
        )}

        <div className="pt-3 text-[10px] text-slate-500 border-t border-slate-700/40">
          All values from <span className="font-mono">/api/topology-risk</span> per contract
          docs/topology-v0.2-risk-contract.md. No fabricated data.
        </div>
      </div>
    </aside>
  )
}
