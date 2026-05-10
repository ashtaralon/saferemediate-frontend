"use client"

import React from "react"
import { ChevronRight, AlertTriangle, Lock, Eye, Edit, Trash2, Crown, Shield, Network, Database } from "lucide-react"
import type { IdentityAttackPath } from "./types"

interface PathListPanelProps {
  paths: IdentityAttackPath[]
  onSelectPath: (index: number) => void
  jewelName?: string
}

// High-contrast severity palette — saturated borders, opaque score chip,
// readable text on dark background.
function severityStyle(score: number): {
  scoreBg: string
  scoreText: string
  scoreBorder: string
  cardBorder: string
  cardBg: string
  ribbon: string
  label: string
} {
  if (score >= 75) {
    return {
      scoreBg: "bg-red-500",
      scoreText: "text-white",
      scoreBorder: "border-red-400",
      cardBorder: "border-red-500/60",
      cardBg: "bg-red-500/[0.06]",
      ribbon: "bg-red-500",
      label: "CRITICAL",
    }
  }
  if (score >= 55) {
    return {
      scoreBg: "bg-orange-500",
      scoreText: "text-white",
      scoreBorder: "border-orange-400",
      cardBorder: "border-orange-500/60",
      cardBg: "bg-orange-500/[0.06]",
      ribbon: "bg-orange-500",
      label: "HIGH",
    }
  }
  if (score >= 35) {
    return {
      scoreBg: "bg-amber-500",
      scoreText: "text-slate-900",
      scoreBorder: "border-amber-400",
      cardBorder: "border-amber-500/60",
      cardBg: "bg-amber-500/[0.05]",
      ribbon: "bg-amber-500",
      label: "MEDIUM",
    }
  }
  return {
    scoreBg: "bg-emerald-500",
    scoreText: "text-slate-900",
    scoreBorder: "border-emerald-400",
    cardBorder: "border-emerald-500/50",
    cardBg: "bg-emerald-500/[0.04]",
    ribbon: "bg-emerald-500",
    label: "LOW",
  }
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
  const sorted = [...paths]
    .map((p, originalIndex) => ({ p, originalIndex }))
    .sort((a, b) => (b.p.severity?.overall_score ?? 0) - (a.p.severity?.overall_score ?? 0))

  const sevCounts = sorted.reduce(
    (acc, { p }) => {
      const s = p.severity?.overall_score ?? 0
      if (s >= 75) acc.critical++
      else if (s >= 55) acc.high++
      else if (s >= 35) acc.medium++
      else acc.low++
      return acc
    },
    { critical: 0, high: 0, medium: 0, low: 0 },
  )

  return (
    <div className="flex flex-col gap-3 px-4 pb-6 pt-2 overflow-auto">
      {/* Crown jewel context strip — sticky-ish header so the operator
          never loses sight of WHICH jewel these paths target. */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-amber-500/40 bg-gradient-to-r from-amber-500/[0.08] to-transparent">
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-400 flex items-center justify-center shadow-md">
          <Crown className="w-4.5 h-4.5 text-amber-900" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-amber-200/70 font-semibold">
            Crown jewel
          </div>
          <div className="text-base font-bold text-amber-100 truncate">
            {jewelName ?? "Selected jewel"}
          </div>
        </div>
        <div className="flex items-baseline gap-2 text-right">
          <span className="text-2xl font-extrabold text-white tabular-nums">{paths.length}</span>
          <span className="text-[11px] uppercase tracking-wider text-slate-400">
            {paths.length === 1 ? "attack path" : "attack paths"}
          </span>
        </div>
      </div>

      {/* Severity histogram — quick read of how risky this jewel is overall */}
      {(sevCounts.critical + sevCounts.high + sevCounts.medium + sevCounts.low > 0) && (
        <div className="flex items-center gap-2 px-1">
          {sevCounts.critical > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/40">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-[11px] font-semibold text-red-200">
                {sevCounts.critical} CRITICAL
              </span>
            </span>
          )}
          {sevCounts.high > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/40">
              <span className="w-2 h-2 rounded-full bg-orange-500" />
              <span className="text-[11px] font-semibold text-orange-200">
                {sevCounts.high} HIGH
              </span>
            </span>
          )}
          {sevCounts.medium > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-[11px] font-semibold text-amber-200">
                {sevCounts.medium} MEDIUM
              </span>
            </span>
          )}
          {sevCounts.low > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[11px] font-semibold text-emerald-200">
                {sevCounts.low} LOW
              </span>
            </span>
          )}
          <span className="ml-auto text-[11px] text-slate-500">
            sorted by severity · click a card to drill in
          </span>
        </div>
      )}

      {sorted.map(({ p, originalIndex }, listIdx) => {
        const score = p.severity?.overall_score ?? 0
        const s = severityStyle(score)
        const summary = pathSummary(p)
        const damage = p.damage_capability
        const verbs = damage?.verbs
        const services = damage?.reachable_services ?? {}
        const destructive = damage?.destructive_capable
        const planes = p.risk_reduction?.by_plane
        const evidenceTag = p.evidence_type === "observed" ? "OBSERVED" : "CONFIGURED"
        const sevText = (p.severity?.severity || s.label).toUpperCase()
        const totalVerbs = (verbs?.read ?? 0) + (verbs?.write ?? 0) + (verbs?.delete ?? 0) + (verbs?.admin ?? 0)

        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelectPath(originalIndex)}
            className={`group relative flex flex-col gap-2.5 text-left rounded-xl border-2 ${s.cardBorder} ${s.cardBg} transition-all hover:border-white/30 hover:shadow-2xl hover:shadow-black/40 hover:translate-y-[-2px] overflow-hidden`}
            style={{ background: `linear-gradient(135deg, rgba(15,23,42,0.65), rgba(15,23,42,0.85))` }}
          >
            {/* Severity ribbon — left edge color stripe */}
            <span className={`absolute left-0 top-0 bottom-0 w-1 ${s.ribbon}`} />

            <div className="flex items-stretch gap-3.5 pl-4 pr-4 pt-3.5 pb-3">
              {/* Score chip — opaque, big, unambiguous. When the damage
                  floor lifted this path's score, hovering shows the
                  rationale (which damage signal triggered the lift)
                  via a native title tooltip + a tiny "↑ lifted" badge. */}
              <div className="flex-shrink-0 flex flex-col items-center gap-1">
                <div
                  className={`relative w-16 h-16 rounded-lg ${s.scoreBg} ${s.scoreText} flex flex-col items-center justify-center shadow-md ring-2 ring-black/20`}
                  title={
                    p.severity?.damage_floor_applied && (p.severity?.damage_rationale?.length ?? 0) > 0
                      ? `Severity lifted by damage capability:\n• ${(p.severity?.damage_rationale ?? []).join("\n• ")}`
                      : `Severity ${sevText} (${score}/100)`
                  }
                >
                  <span className="text-2xl font-black tabular-nums leading-none">{score}</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider opacity-80 mt-0.5">
                    {sevText}
                  </span>
                  {p.severity?.damage_floor_applied && (
                    <span
                      className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-white text-slate-900 text-[10px] font-black border border-slate-400 shadow-md"
                      aria-label="Damage floor applied — hover score for details"
                    >
                      ↑
                    </span>
                  )}
                </div>
              </div>

              {/* Top section: chain + meta */}
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold text-white">
                    Path #{listIdx + 1}
                  </span>
                  <span className="text-[10px] text-slate-500">·</span>
                  <span className="text-[11px] text-slate-300">{p.hop_count} hops</span>
                  <span className="text-[10px] text-slate-500">·</span>
                  <span
                    className={`text-[10px] uppercase font-bold tracking-wider ${
                      p.evidence_type === "observed" ? "text-emerald-400" : "text-slate-500"
                    }`}
                  >
                    {evidenceTag}
                  </span>
                  {destructive && (
                    <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-600 border border-red-300/50 text-[9px] uppercase font-bold text-white shadow-sm">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      Destructive
                    </span>
                  )}
                </div>

                {/* Chain summary: bigger, bolder */}
                {(summary.compute || summary.role || summary.jewel) ? (
                  <div className="flex items-center gap-1.5 text-sm text-white min-w-0 font-medium">
                    {summary.compute && (
                      <span className="truncate inline-flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                        {summary.compute}
                      </span>
                    )}
                    {summary.compute && summary.role && (
                      <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    )}
                    {summary.role && (
                      <span className="truncate inline-flex items-center gap-1.5">
                        <Network className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                        {summary.role}
                      </span>
                    )}
                    {summary.role && summary.jewel && (
                      <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    )}
                    {summary.jewel && (
                      <span className="truncate inline-flex items-center gap-1 text-amber-300 font-semibold">
                        <Crown className="w-3.5 h-3.5 flex-shrink-0" />
                        {summary.jewel}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic">Configured access only · no compute on chain</div>
                )}
              </div>

              <ChevronRight className="w-6 h-6 text-slate-400 group-hover:text-white self-center flex-shrink-0 transition-colors" />
            </div>

            {/* Stats row — damage capability with sharp colors */}
            {damage?.state === "live" && verbs && totalVerbs > 0 && (
              <div className="flex items-center gap-2 flex-wrap pl-[88px] pr-4">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">DAMAGE</span>
                {verbs.delete > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/30 border border-red-500/60 text-[11px] text-red-100 font-semibold">
                    <Trash2 className="w-3 h-3" /> delete: {verbs.delete}
                  </span>
                )}
                {verbs.write > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-500/30 border border-orange-500/60 text-[11px] text-orange-100 font-semibold">
                    <Edit className="w-3 h-3" /> write: {verbs.write}
                  </span>
                )}
                {verbs.read > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/30 border border-blue-500/60 text-[11px] text-blue-100 font-semibold">
                    <Eye className="w-3 h-3" /> read: {verbs.read}
                  </span>
                )}
                {verbs.admin > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/40 border border-purple-400/70 text-[11px] text-purple-50 font-bold ring-1 ring-purple-400/30">
                    <Lock className="w-3 h-3" /> admin: {verbs.admin}
                  </span>
                )}
              </div>
            )}

            {Object.keys(services).length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pl-[88px] pr-4">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">COULD TOUCH</span>
                {Object.entries(services)
                  .slice(0, 5)
                  .map(([svc, count]) => (
                    <span
                      key={svc}
                      className="px-2 py-0.5 rounded-md bg-slate-700/60 border border-slate-500/40 text-[11px] text-slate-200 font-medium"
                    >
                      {svc}: <span className="font-bold text-white">{count}</span>
                    </span>
                  ))}
                {Object.keys(services).length > 5 && (
                  <span className="text-[11px] text-slate-400 font-semibold">
                    +{Object.keys(services).length - 5} more
                  </span>
                )}
              </div>
            )}

            {planes &&
              planes.iam.action_count + planes.network.action_count + planes.data.action_count > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap pl-[88px] pr-4 pb-3">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">REMEDIATE</span>
                  {planes.iam.action_count > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/25 border border-purple-500/50 text-[11px] text-purple-100 font-semibold">
                      <Network className="w-3 h-3" /> {planes.iam.action_count} IAM
                    </span>
                  )}
                  {planes.network.action_count > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/25 border border-blue-500/50 text-[11px] text-blue-100 font-semibold">
                      <Shield className="w-3 h-3" /> {planes.network.action_count} network
                    </span>
                  )}
                  {planes.data.action_count > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/25 border border-emerald-500/50 text-[11px] text-emerald-100 font-semibold">
                      <Database className="w-3 h-3" /> {planes.data.action_count} data
                    </span>
                  )}
                  {typeof p.risk_reduction?.achievable_score === "number" && (
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-300 font-bold">
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
