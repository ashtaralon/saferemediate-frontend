"use client"

import React from "react"
import { ChevronRight } from "lucide-react"
import type { IdentityAttackPath } from "./types"

interface PathListPanelProps {
  paths: IdentityAttackPath[]
  onSelectPath: (index: number) => void
  jewelName?: string
}

// Editorial palette: severity is communicated by a thin left ribbon and a
// single colored numeric score. Everything else stays neutral so the eye
// goes to the data.
function severityColor(score: number): string {
  if (score >= 75) return "#dc2626" // red-600
  if (score >= 55) return "#ea580c" // orange-600
  if (score >= 35) return "#d97706" // amber-600
  return "#16a34a" // green-600
}

function severityLabel(score: number): string {
  if (score >= 75) return "CRITICAL"
  if (score >= 55) return "HIGH"
  if (score >= 35) return "MEDIUM"
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
    <div className="flex flex-col gap-4 px-6 pb-8 pt-3 overflow-auto">
      {/* Editorial jewel header — sentence-style summary, no candy color */}
      <div
        className="flex items-baseline justify-between gap-4 pb-3 border-b"
        style={{ borderColor: "rgba(148,163,184,0.15)" }}
      >
        <div className="flex flex-col min-w-0">
          <span
            className="text-[10px] uppercase tracking-[0.12em] font-semibold"
            style={{ color: "#94a3b8" }}
          >
            Crown jewel
          </span>
          <span
            className="text-base font-semibold truncate mt-0.5"
            style={{ color: "#f1f5f9" }}
          >
            {jewelName ?? "—"}
          </span>
        </div>
        <div className="flex items-baseline gap-1.5 shrink-0">
          <span
            className="text-2xl font-semibold tabular-nums"
            style={{ color: "#f1f5f9" }}
          >
            {paths.length}
          </span>
          <span
            className="text-[11px] uppercase tracking-[0.12em] font-semibold"
            style={{ color: "#94a3b8" }}
          >
            {paths.length === 1 ? "attack path" : "attack paths"}
          </span>
        </div>
      </div>

      {/* Severity tally — quiet horizontal list, no bg fills */}
      {sevCounts.critical + sevCounts.high + sevCounts.medium + sevCounts.low > 0 && (
        <div
          className="flex items-baseline gap-5 text-[11px] uppercase tracking-[0.1em] font-semibold"
          style={{ color: "#94a3b8" }}
        >
          {sevCounts.critical > 0 && (
            <span className="inline-flex items-baseline gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#dc2626" }} />
              <span style={{ color: "#f1f5f9" }}>{sevCounts.critical}</span>
              <span>critical</span>
            </span>
          )}
          {sevCounts.high > 0 && (
            <span className="inline-flex items-baseline gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#ea580c" }} />
              <span style={{ color: "#f1f5f9" }}>{sevCounts.high}</span>
              <span>high</span>
            </span>
          )}
          {sevCounts.medium > 0 && (
            <span className="inline-flex items-baseline gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#d97706" }} />
              <span style={{ color: "#f1f5f9" }}>{sevCounts.medium}</span>
              <span>medium</span>
            </span>
          )}
          {sevCounts.low > 0 && (
            <span className="inline-flex items-baseline gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#16a34a" }} />
              <span style={{ color: "#f1f5f9" }}>{sevCounts.low}</span>
              <span>low</span>
            </span>
          )}
          <span className="ml-auto text-[10px] tracking-[0.1em] normal-case font-normal" style={{ color: "#94a3b8" }}>
            sorted by severity · click a row to drill in
          </span>
        </div>
      )}

      {/* Path rows — thin neutral border, severity comes through as a single
          left bar + the colored score number. Hover lightens the surface. */}
      <div className="flex flex-col gap-2 mt-1">
        {sorted.map(({ p, originalIndex }, listIdx) => {
          const score = p.severity?.overall_score ?? 0
          const sevColor = severityColor(score)
          const sevText = (p.severity?.severity || severityLabel(score)).toUpperCase()
          const summary = pathSummary(p)
          const damage = p.damage_capability
          const verbs = damage?.verbs
          const services = damage?.reachable_services ?? {}
          const destructive = damage?.destructive_capable
          const planes = p.risk_reduction?.by_plane
          const evidenceTag = p.evidence_type === "observed" ? "OBSERVED" : "CONFIGURED"
          const totalVerbs = (verbs?.read ?? 0) + (verbs?.write ?? 0) + (verbs?.delete ?? 0) + (verbs?.admin ?? 0)

          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectPath(originalIndex)}
              className="group relative flex flex-col gap-2 text-left rounded-lg border transition-all hover:bg-white/[0.02]"
              style={{
                borderColor: "rgba(148,163,184,0.12)",
                background: "rgba(30,41,59,0.6)",
              }}
            >
              {/* Severity ribbon */}
              <span
                className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
                style={{ background: sevColor }}
              />

              {/* Top row: number · path # · meta · destructive · chevron */}
              <div className="flex items-center gap-4 pl-5 pr-4 pt-3">
                <div className="flex items-baseline gap-2 shrink-0 min-w-[64px]">
                  <span
                    className="text-2xl font-semibold tabular-nums leading-none"
                    style={{ color: sevColor }}
                    title={
                      p.severity?.damage_floor_applied && (p.severity?.damage_rationale?.length ?? 0) > 0
                        ? `Severity lifted by damage capability:\n• ${(p.severity?.damage_rationale ?? []).join("\n• ")}`
                        : `Severity ${sevText} (${score}/100)`
                    }
                  >
                    {score}
                  </span>
                  <span
                    className="text-[10px] uppercase tracking-[0.12em] font-semibold"
                    style={{ color: sevColor }}
                  >
                    {sevText}
                  </span>
                  {p.severity?.damage_floor_applied && (
                    <span
                      className="text-[10px] leading-none"
                      style={{ color: "#94a3b8" }}
                      title="Severity lifted by damage capability — hover the score for details"
                    >
                      ↑
                    </span>
                  )}
                </div>

                <div
                  className="flex items-baseline gap-2 text-[11px] uppercase tracking-[0.1em] font-semibold"
                  style={{ color: "#94a3b8" }}
                >
                  <span style={{ color: "#f1f5f9" }}>
                    Path #{listIdx + 1}
                  </span>
                  <span>·</span>
                  <span>{p.hop_count} hops</span>
                  <span>·</span>
                  <span style={{ color: p.evidence_type === "observed" ? "#22c55e" : "#94a3b8" }}>
                    {evidenceTag}
                  </span>
                </div>

                {destructive && (
                  <span
                    className="ml-auto inline-flex items-center px-2 py-0.5 rounded text-[9px] uppercase tracking-[0.12em] font-bold border"
                    style={{ color: "#fca5a5", borderColor: "rgba(220,38,38,0.4)" }}
                  >
                    Destructive
                  </span>
                )}
                {!destructive && <span className="ml-auto" />}
                <ChevronRight
                  className="w-4 h-4 shrink-0 transition-colors"
                  style={{ color: "#94a3b8" }}
                />
              </div>

              {/* Chain — clean typography, '›' separators, no icons */}
              {(summary.compute || summary.role || summary.jewel) ? (
                <div
                  className="pl-5 pr-4 text-sm font-medium truncate"
                  style={{ color: "#f1f5f9" }}
                >
                  {summary.compute && (
                    <span className="truncate">{summary.compute}</span>
                  )}
                  {summary.compute && summary.role && (
                    <span className="mx-2" style={{ color: "#94a3b8" }}>›</span>
                  )}
                  {summary.role && (
                    <span className="truncate" style={{ color: "#f1f5f9" }}>
                      {summary.role}
                    </span>
                  )}
                  {summary.role && summary.jewel && (
                    <span className="mx-2" style={{ color: "#94a3b8" }}>›</span>
                  )}
                  {summary.jewel && (
                    <span className="truncate" style={{ color: sevColor }}>
                      {summary.jewel}
                    </span>
                  )}
                </div>
              ) : (
                <div
                  className="pl-5 pr-4 text-xs italic"
                  style={{ color: "#94a3b8" }}
                >
                  Configured access only — no compute on this chain
                </div>
              )}

              {/* Damage narrative — LLM-generated concrete "what an
                  attacker could do" sentence. Renders BEFORE the
                  count-based chips so the operator sees the human
                  summary first. Falls through silently when null
                  (feature disabled or LLM call failed). */}
              {p.damage_narrative && (
                <div
                  className="pl-5 pr-4 text-xs leading-relaxed"
                  style={{ color: "#cbd5e1" }}
                >
                  <span
                    className="text-[10px] uppercase tracking-[0.12em] font-semibold mr-2"
                    style={{ color: "#94a3b8" }}
                  >
                    Potential damage
                  </span>
                  {p.damage_narrative}
                </div>
              )}

              {/* Stats — outlined chips, low saturation, clear labels */}
              <div className="flex items-center gap-x-5 gap-y-1.5 flex-wrap pl-5 pr-4 pb-3 mt-0.5">
                {damage?.state === "live" && verbs && totalVerbs > 0 && (
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-[10px] uppercase tracking-[0.12em] font-semibold"
                      style={{ color: "#94a3b8" }}
                    >
                      Damage
                    </span>
                    <span className="text-xs" style={{ color: "#f1f5f9" }}>
                      {verbs.delete > 0 && <span><span className="font-semibold tabular-nums">{verbs.delete}</span> delete</span>}
                      {verbs.delete > 0 && verbs.write > 0 && <span style={{ color: "#94a3b8" }}> · </span>}
                      {verbs.write > 0 && <span><span className="font-semibold tabular-nums">{verbs.write}</span> write</span>}
                      {(verbs.delete > 0 || verbs.write > 0) && verbs.read > 0 && <span style={{ color: "#94a3b8" }}> · </span>}
                      {verbs.read > 0 && <span><span className="font-semibold tabular-nums">{verbs.read}</span> read</span>}
                      {(verbs.delete > 0 || verbs.write > 0 || verbs.read > 0) && verbs.admin > 0 && <span style={{ color: "#94a3b8" }}> · </span>}
                      {verbs.admin > 0 && (
                        <span style={{ color: "#a78bfa" }}>
                          <span className="font-semibold tabular-nums">{verbs.admin}</span> admin
                        </span>
                      )}
                    </span>
                  </div>
                )}

                {Object.keys(services).length > 0 && (
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span
                      className="text-[10px] uppercase tracking-[0.12em] font-semibold"
                      style={{ color: "#94a3b8" }}
                    >
                      Touches
                    </span>
                    <span className="text-xs truncate" style={{ color: "#f1f5f9" }}>
                      {Object.entries(services)
                        .slice(0, 3)
                        .map(([svc, count]) => (
                          <span key={svc}>
                            <span className="font-semibold tabular-nums">{count}</span> {svc}
                          </span>
                        ))
                        .reduce<React.ReactNode[]>((acc, el, i) => {
                          if (i > 0) acc.push(<span key={`d-${i}`} style={{ color: "#94a3b8" }}> · </span>)
                          acc.push(el)
                          return acc
                        }, [])}
                      {Object.keys(services).length > 3 && (
                        <span style={{ color: "#94a3b8" }}> +{Object.keys(services).length - 3}</span>
                      )}
                    </span>
                  </div>
                )}

                {planes && planes.iam.action_count + planes.network.action_count + planes.data.action_count > 0 && (
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-[10px] uppercase tracking-[0.12em] font-semibold"
                      style={{ color: "#94a3b8" }}
                    >
                      Fix
                    </span>
                    <span className="text-xs" style={{ color: "#f1f5f9" }}>
                      {planes.iam.action_count > 0 && <span><span className="font-semibold tabular-nums">{planes.iam.action_count}</span> IAM</span>}
                      {planes.iam.action_count > 0 && (planes.network.action_count > 0 || planes.data.action_count > 0) && <span style={{ color: "#94a3b8" }}> · </span>}
                      {planes.network.action_count > 0 && <span><span className="font-semibold tabular-nums">{planes.network.action_count}</span> network</span>}
                      {planes.network.action_count > 0 && planes.data.action_count > 0 && <span style={{ color: "#94a3b8" }}> · </span>}
                      {planes.data.action_count > 0 && <span><span className="font-semibold tabular-nums">{planes.data.action_count}</span> data</span>}
                    </span>
                  </div>
                )}

                {typeof p.risk_reduction?.achievable_score === "number" && (
                  <span
                    className="ml-auto text-[11px] tabular-nums"
                    style={{ color: "#22c55e" }}
                  >
                    → {p.risk_reduction.achievable_score} after fix
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
