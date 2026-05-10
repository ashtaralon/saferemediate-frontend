"use client"

import React from "react"
import { ChevronRight, AlertTriangle, Lock, Eye, Edit, Trash2 } from "lucide-react"
import type { IdentityAttackPath } from "./types"

interface PathListPanelProps {
  paths: IdentityAttackPath[]
  onSelectPath: (index: number) => void
  jewelName?: string
}

function severityColor(score: number): { bg: string; text: string; border: string } {
  if (score >= 75) return { bg: "bg-red-500/15", text: "text-red-300", border: "border-red-500/40" }
  if (score >= 50) return { bg: "bg-orange-500/15", text: "text-orange-300", border: "border-orange-500/40" }
  if (score >= 25) return { bg: "bg-amber-500/15", text: "text-amber-300", border: "border-amber-500/40" }
  return { bg: "bg-emerald-500/15", text: "text-emerald-300", border: "border-emerald-500/40" }
}

function severityLabel(score: number): string {
  if (score >= 75) return "CRITICAL"
  if (score >= 50) return "HIGH"
  if (score >= 25) return "MEDIUM"
  return "LOW"
}

function pathSummary(path: IdentityAttackPath): { compute?: string; role?: string; jewel?: string } {
  const nodes = path.nodes ?? []
  const compute = nodes.find((n) => n.lane === "compute" && /ec2|lambda|fargate|instance/i.test(n.type))
  const role = nodes.find((n) => n.lane === "iam")
  const jewel = nodes.find((n) => n.tier === "crown_jewel")
  return {
    compute: compute?.name,
    role: role?.name,
    jewel: jewel?.name,
  }
}

export function PathListPanel({ paths, onSelectPath, jewelName }: PathListPanelProps) {
  // Sort by severity desc — worst paths first so the operator sees the
  // riskiest exposure at the top of the list.
  const sorted = [...paths]
    .map((p, originalIndex) => ({ p, originalIndex }))
    .sort((a, b) => (b.p.severity?.overall_score ?? 0) - (a.p.severity?.overall_score ?? 0))

  return (
    <div className="flex flex-col gap-3 p-4 overflow-auto">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
          {paths.length} {paths.length === 1 ? "attack path" : "attack paths"} to {jewelName ?? "this jewel"}
        </h3>
        <span className="text-xs text-slate-500">sorted by severity · click to drill in</span>
      </div>

      {sorted.map(({ p, originalIndex }) => {
        const score = p.severity?.overall_score ?? 0
        const c = severityColor(score)
        const summary = pathSummary(p)
        const damage = p.damage_capability
        const verbs = damage?.verbs
        const services = damage?.reachable_services ?? {}
        const destructive = damage?.destructive_capable
        const planes = p.risk_reduction?.by_plane
        const evidenceTag = p.evidence_type === "observed" ? "OBSERVED" : "CONFIGURED"
        const sevText = (p.severity?.severity || severityLabel(score)).toUpperCase()

        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelectPath(originalIndex)}
            className={`group flex flex-col gap-2 text-left p-3 rounded-lg border transition-all ${c.border} ${c.bg} hover:translate-y-[-1px] hover:shadow-lg hover:border-slate-300/40`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`flex-shrink-0 w-12 h-12 rounded-md flex items-center justify-center font-bold text-lg border ${c.text} ${c.bg} ${c.border}`}
              >
                {score}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span className={`text-[10px] uppercase tracking-wider font-semibold ${c.text}`}>{sevText}</span>
                  <span className="text-[10px] text-slate-500">·</span>
                  <span className="text-[10px] text-slate-400">Path #{originalIndex + 1}</span>
                  <span className="text-[10px] text-slate-500">·</span>
                  <span className="text-[10px] text-slate-400">{p.hop_count} hops</span>
                  <span className="text-[10px] text-slate-500">·</span>
                  <span
                    className={`text-[10px] uppercase font-semibold ${p.evidence_type === "observed" ? "text-emerald-400" : "text-slate-500"}`}
                  >
                    {evidenceTag}
                  </span>
                  {destructive && (
                    <span className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-[9px] uppercase font-semibold text-red-300">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      Destructive
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-200 min-w-0">
                  {summary.compute && <span className="font-medium truncate">{summary.compute}</span>}
                  {summary.compute && summary.role && (
                    <ChevronRight className="w-3 h-3 text-slate-500 flex-shrink-0" />
                  )}
                  {summary.role && <span className="font-medium text-slate-300 truncate">{summary.role}</span>}
                  {summary.role && summary.jewel && (
                    <ChevronRight className="w-3 h-3 text-slate-500 flex-shrink-0" />
                  )}
                  {summary.jewel && <span className="font-medium text-amber-300 truncate">{summary.jewel}</span>}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-slate-200 self-center flex-shrink-0" />
            </div>

            {damage?.state === "live" && verbs && (verbs.read + verbs.write + verbs.delete + verbs.admin > 0) && (
              <div className="flex items-center gap-1.5 flex-wrap pl-[60px]">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Damage</span>
                {verbs.delete > 0 && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/15 border border-red-500/30 text-[10px] text-red-300">
                    <Trash2 className="w-2.5 h-2.5" /> delete: {verbs.delete}
                  </span>
                )}
                {verbs.write > 0 && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-500/15 border border-orange-500/30 text-[10px] text-orange-300">
                    <Edit className="w-2.5 h-2.5" /> write: {verbs.write}
                  </span>
                )}
                {verbs.read > 0 && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-[10px] text-blue-300">
                    <Eye className="w-2.5 h-2.5" /> read: {verbs.read}
                  </span>
                )}
                {verbs.admin > 0 && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/15 border border-purple-500/30 text-[10px] text-purple-300">
                    <Lock className="w-2.5 h-2.5" /> admin: {verbs.admin}
                  </span>
                )}
              </div>
            )}

            {Object.keys(services).length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pl-[60px]">
                <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Could touch</span>
                {Object.entries(services)
                  .slice(0, 5)
                  .map(([svc, count]) => (
                    <span
                      key={svc}
                      className="px-1.5 py-0.5 rounded bg-slate-700/40 border border-slate-600/40 text-[10px] text-slate-300"
                    >
                      {svc}: {count}
                    </span>
                  ))}
                {Object.keys(services).length > 5 && (
                  <span className="text-[10px] text-slate-500">+{Object.keys(services).length - 5} more</span>
                )}
              </div>
            )}

            {planes &&
              planes.iam.action_count + planes.network.action_count + planes.data.action_count > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pl-[60px]">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                    Remediate
                  </span>
                  {planes.iam.action_count > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-purple-500/15 border border-purple-500/30 text-[10px] text-purple-300">
                      {planes.iam.action_count} IAM
                    </span>
                  )}
                  {planes.network.action_count > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-[10px] text-blue-300">
                      {planes.network.action_count} network
                    </span>
                  )}
                  {planes.data.action_count > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-[10px] text-emerald-300">
                      {planes.data.action_count} data
                    </span>
                  )}
                  {typeof p.risk_reduction?.achievable_score === "number" && (
                    <span className="ml-auto text-[10px] text-slate-400">
                      → {p.risk_reduction.achievable_score} after fix
                    </span>
                  )}
                </div>
              )}
          </button>
        )
      })}
    </div>
  )
}
