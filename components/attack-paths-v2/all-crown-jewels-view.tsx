"use client"

/**
 * All Crown Jewels — system-wide aggregated view.
 *
 * Renders when no specific CJ is selected. Shows every CJ on the
 * system + every path that reaches each, so the operator sees the
 * full attack-surface footprint at a glance instead of having to
 * pick a CJ first.
 *
 * Click any CJ → switches the page into single-CJ mode (?jewel=…).
 * Click any path → switches into single-path mode (?jewel=…&path=…).
 *
 * Data shape comes from the existing identity-attack-paths response
 * already fetched by the parent — this view is a pure renderer, no
 * additional network calls.
 */

import { useMemo } from "react"
import { Crown, ArrowRight, AlertTriangle } from "lucide-react"
import type {
  IdentityAttackPath,
  CrownJewelSummary,
} from "@/components/identity-attack-paths/types"

interface AllCrownJewelsViewProps {
  jewels: CrownJewelSummary[]
  paths: IdentityAttackPath[]
  onSelectJewel: (jewelId: string) => void
  onSelectPath: (jewelId: string, pathId: string) => void
  /** Other systems the operator can switch to when this one has 0 paths. */
  otherSystems?: string[]
  onSwitchSystem?: (s: string) => void
  currentSystem?: string
}

function severityColor(sev: string | number): string {
  const s = typeof sev === "number"
    ? sev >= 80 ? "CRITICAL" : sev >= 60 ? "HIGH" : sev >= 40 ? "MEDIUM" : "LOW"
    : sev
  if (s === "CRITICAL") return "border-red-500/40 bg-red-500/10 text-red-300"
  if (s === "HIGH") return "border-orange-500/40 bg-orange-500/10 text-orange-300"
  if (s === "MEDIUM") return "border-amber-500/40 bg-amber-500/10 text-amber-300"
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
}

function severityLabel(sev: string | number): string {
  return typeof sev === "number"
    ? sev >= 80 ? "CRITICAL" : sev >= 60 ? "HIGH" : sev >= 40 ? "MEDIUM" : "LOW"
    : sev
}

function shortName(s: string, max = 40): string {
  if (!s) return ""
  if (s.length <= max) return s
  return `${s.slice(0, max - 6)}…${s.slice(-4)}`
}

function nodeShort(s: string): string {
  // Strip ARN prefix, take tail after the last `/` or `:`. Generic —
  // no customer-specific patterns.
  let v = s.replace(/^arn:aws:[^:]+:[^:]*:[^:]*:[^:/]+[:/]/, "").replace(/^arn:aws:[^:]+:[^:]*:[^:]*:/, "")
  if (v.includes("/")) v = v.split("/").pop() || v
  if (v.length > 28) v = `${v.slice(0, 14)}…${v.slice(-10)}`
  return v
}

export function AllCrownJewelsView({
  jewels,
  paths,
  onSelectJewel,
  onSelectPath,
  otherSystems = [],
  onSwitchSystem,
  currentSystem,
}: AllCrownJewelsViewProps) {
  // Group paths by crown_jewel_id.
  const pathsByJewel = useMemo(() => {
    const m = new Map<string, IdentityAttackPath[]>()
    for (const p of paths) {
      if (!p.crown_jewel_id) continue
      if (!m.has(p.crown_jewel_id)) m.set(p.crown_jewel_id, [])
      m.get(p.crown_jewel_id)!.push(p)
    }
    // Sort each group by severity descending (highest risk on top).
    for (const arr of m.values()) {
      arr.sort((a, b) => (b.severity?.overall_score ?? 0) - (a.severity?.overall_score ?? 0))
    }
    return m
  }, [paths])

  // Sort jewels by path_count desc, then severity desc.
  const sortedJewels = useMemo(() => {
    return [...jewels].sort((a, b) => {
      const pc = (b.path_count ?? 0) - (a.path_count ?? 0)
      if (pc !== 0) return pc
      return (b.priority_score ?? 0) - (a.priority_score ?? 0)
    })
  }, [jewels])

  const totalPaths = paths.length

  return (
    <div className="p-6 bg-slate-950 min-h-full overflow-auto">
      {/* Header */}
      <div className="mb-6 flex items-baseline gap-3 flex-wrap">
        <h2 className="text-base font-bold text-slate-100 tracking-wide uppercase">
          All Crown Jewel Paths
        </h2>
        <span className="text-[10px] text-slate-500 italic">
          {currentSystem ? `${currentSystem} · ` : ""}
          {jewels.length} crown jewel{jewels.length === 1 ? "" : "s"} ·{" "}
          {totalPaths} path{totalPaths === 1 ? "" : "s"} total · sourced from Neo4j
        </span>
      </div>

      {/* 0-paths system switcher banner — when the operator lands on
          a system whose CJs have no attack paths recorded, surface a
          one-click switcher instead of staring at empty cards. */}
      {totalPaths === 0 && jewels.length > 0 && otherSystems.length > 0 && onSwitchSystem && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="text-xs font-semibold text-amber-200 mb-2">
            No attack paths recorded on this system
          </div>
          <p className="text-[11px] text-amber-300/80 mb-3">
            {jewels.length} crown jewel{jewels.length === 1 ? "" : "s"} defined,
            but no observed or modeled paths reach them. Switch to a system with active paths:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {otherSystems.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSwitchSystem(s)}
                className="text-[11px] font-semibold rounded-md border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1 text-amber-200 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {jewels.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-8 text-center">
          <div className="text-sm text-slate-400">
            No crown jewels defined for this system yet.
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedJewels.map((jewel) => {
            const jpaths = pathsByJewel.get(jewel.id) ?? []
            return (
              <div
                key={jewel.id}
                className="rounded-lg border border-slate-700 bg-slate-900/40 overflow-hidden"
              >
                {/* CJ Header */}
                <button
                  type="button"
                  onClick={() => onSelectJewel(jewel.id)}
                  className="w-full px-4 py-3 flex items-center justify-between gap-3 bg-gradient-to-r from-amber-900/10 to-transparent hover:from-amber-900/20 transition-colors border-b border-slate-700/60"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Crown className="h-4 w-4 text-amber-400 shrink-0" />
                    <div className="flex flex-col items-start min-w-0">
                      <div className="text-sm font-bold text-slate-100 truncate max-w-full">
                        {shortName(jewel.name, 60)}
                      </div>
                      <div className="text-[9px] uppercase tracking-wider text-slate-500 mt-0.5">
                        {jewel.type} ·{" "}
                        {jewel.is_internet_exposed && (
                          <span className="text-rose-400 font-semibold">internet-exposed · </span>
                        )}
                        {jpaths.length} path{jpaths.length === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider rounded border px-2 py-0.5 ${severityColor(jewel.severity)}`}
                    >
                      {jewel.severity}
                    </span>
                    <span className="text-xs font-mono text-slate-300">
                      {Math.round(jewel.highest_risk_score)}
                    </span>
                  </div>
                </button>

                {/* Paths list */}
                {jpaths.length === 0 ? (
                  <div className="px-4 py-3 text-[10px] text-slate-500 italic">
                    No paths recorded to this jewel.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {jpaths.map((p) => {
                      const src = p.nodes?.[0]?.name || p.nodes?.[0]?.id || "?"
                      const tgt = p.nodes?.[p.nodes.length - 1]?.name || p.nodes?.[p.nodes.length - 1]?.id || "?"
                      const sev = p.severity?.overall_score ?? 0
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => onSelectPath(jewel.id, p.id)}
                          className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-slate-800/40 transition-colors text-left"
                        >
                          <span
                            className={`text-[8px] font-bold uppercase tracking-wider rounded border px-1.5 py-0.5 ${severityColor(sev)}`}
                          >
                            {severityLabel(sev)}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 w-6 text-right">
                            {Math.round(sev)}
                          </span>
                          <span className="text-[10px] text-slate-300 min-w-0 flex items-center gap-1.5 flex-1">
                            <span className="font-mono truncate max-w-[28%]">{nodeShort(src)}</span>
                            <ArrowRight className="h-3 w-3 text-slate-600 shrink-0" />
                            <span className="font-mono truncate max-w-[28%]">{nodeShort(tgt)}</span>
                          </span>
                          <span className="text-[9px] text-slate-500 shrink-0">
                            {p.hop_count} hop{p.hop_count === 1 ? "" : "s"}
                          </span>
                          {p.evidence_type === "observed" && (
                            <span className="text-[8px] font-semibold uppercase tracking-wider rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 px-1.5 py-0.5 shrink-0">
                              Observed
                            </span>
                          )}
                          {(p.severity?.damage_floor_applied) && (
                            <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
