"use client"

// Path Analysis panel — the right column of the v2 page.
//
// Slice 1 ships: header (score + 1-line summary + chain), embedded
// path-filtered TrafficFlowMap (the egress-flow-map style visualization
// from the design discussion), and stub placeholders for the
// NETWORK / IDENTITY / DATA plane sections (Slice 2), Potential Damage
// (Slice 3), and Recommended Hardening (Slice 4).
//
// The map is path-filtered: only nodes on THIS path render, with the
// connection lines through SG / NACL / IAM / VPCE drawn as a single
// polyline. This is the same TrafficFlowMap renderer we use in the
// existing attack-paths drill-in, just embedded smaller.

import { useMemo } from "react"
import { Crown, ChevronRight, ShieldAlert, AlertTriangle, Sparkles } from "lucide-react"
import TrafficFlowMap, {
  type TrafficFlowMapPathFilter,
} from "@/components/dependency-map/traffic-flow-map"
import type {
  IdentityAttackPath,
  CrownJewelSummary,
} from "@/components/identity-attack-paths/types"

interface PathAnalysisPanelProps {
  path: IdentityAttackPath
  jewel: CrownJewelSummary | null
  systemName: string
}

// Map severity level → tone for the score badge. Same palette as the
// path list so the operator sees consistent severity coloring across
// the page.
function severityTone(level?: string) {
  const l = (level || "").toLowerCase()
  if (l === "critical") return "bg-red-500/15 border-red-500/40 text-red-200"
  if (l === "high") return "bg-orange-500/15 border-orange-500/40 text-orange-200"
  if (l === "medium") return "bg-amber-500/15 border-amber-500/40 text-amber-200"
  if (l === "low") return "bg-emerald-500/15 border-emerald-500/40 text-emerald-200"
  return "bg-slate-500/15 border-slate-500/40 text-slate-200"
}

export function PathAnalysisPanel({ path, jewel, systemName }: PathAnalysisPanelProps) {
  // Build the TrafficFlowMap pathFilter shape from the path's nodes
  // and edges. The filter tells the map "show only these nodes; draw
  // the polyline through these checkpoint hops." applyPathFilter()
  // in traffic-flow-map.tsx consumes this and reduces the unfiltered
  // System Architecture down to the path-relevant subset.
  const pathFilter = useMemo<TrafficFlowMapPathFilter>(() => {
    const nodeIds = path.nodes?.map((n) => n.id) ?? []
    const pathNodes = (path.nodes ?? []).map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      tier: n.tier,
      lane: n.lane,
    }))
    const pathEdges = (path.edges ?? []).map((e) => ({
      source: e.source,
      target: e.target,
      type: e.type,
      label: e.label,
      port: e.port,
      protocol: e.protocol,
      bytes: e.traffic_bytes,
      hits: e.hit_count,
      is_observed: e.is_observed,
    }))
    // The crown-jewel node is the LAST node on the path. The map
    // renders it with the crown icon overlay so the operator sees
    // visually which resource is the attack target vs. waypoints.
    const crownJewelIds = jewel ? [jewel.id] : []
    return {
      nodeIds,
      pathNodes,
      pathEdges,
      crownJewelIds,
      jewelName: jewel?.name,
      pathLabel: `Path → ${jewel?.name ?? path.id}`,
    }
  }, [path, jewel])

  const start = path.nodes?.[0]
  const target = path.nodes?.[path.nodes.length - 1]
  const sevTone = severityTone(path.severity?.severity)
  const sevLabel = (path.severity?.severity || "—").toUpperCase()
  const sevScore = path.severity?.overall_score

  // Concise narrative line. Prefer the LLM-generated damage_narrative
  // when present; fall back to a deterministic "service A → service B"
  // string so the panel always reads. Per feedback_no_mock_numbers_in_ui
  // we don't fabricate a narrative when the backend has nothing.
  const summaryLine =
    path.damage_narrative ||
    (start && target
      ? `${start.name} can reach ${target.name} in ${path.hop_count ?? path.nodes.length - 1} hop${
          (path.hop_count ?? 1) === 1 ? "" : "s"
        }.`
      : "Path summary unavailable.")

  return (
    <div className="flex flex-col h-full">
      {/* ─── Header ────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-slate-800/60 bg-slate-950/95 backdrop-blur sticky top-0 z-10">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
              PATH ANALYSIS
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider rounded border px-2 py-0.5 ${sevTone}`}>
                {sevLabel}
                {sevScore !== undefined && sevScore !== null && (
                  <span className="ml-1.5 opacity-80">{sevScore}/100</span>
                )}
              </span>
              <span className="text-[11px] text-slate-400">
                {path.hop_count ?? path.nodes.length - 1} hops
              </span>
              {path.evidence_type === "observed" && (
                <span className="text-[10px] text-emerald-400 uppercase tracking-wider">
                  observed
                </span>
              )}
              {path.evidence_type === "configured" && (
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                  configured
                </span>
              )}
              {path.path_kind_tag && (
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                  {path.path_kind_tag}
                </span>
              )}
            </div>
          </div>
          {jewel && (
            <div className="text-right shrink-0">
              <div className="flex items-center gap-1.5 justify-end mb-0.5">
                <Crown className="h-3 w-3 text-amber-400" />
                <span className="text-[10px] uppercase tracking-wider text-slate-500">
                  crown jewel
                </span>
              </div>
              <div className="text-xs font-mono text-amber-200/90 truncate max-w-[260px]" title={jewel.name}>
                {jewel.name}
              </div>
            </div>
          )}
        </div>

        {/* One-line narrative — LLM damage_narrative when available */}
        <div className="mt-3 text-sm text-slate-200 leading-snug">
          {summaryLine}
        </div>

        {/* Chain summary — start → target with ▶ separators */}
        <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-400 font-mono overflow-x-auto">
          {(path.nodes ?? []).map((n, i) => (
            <span key={`${n.id}-${i}`} className="flex items-center gap-1 shrink-0">
              {i > 0 && <ChevronRight className="h-3 w-3 text-slate-600" />}
              <span className={n.tier === "crown_jewel" ? "text-amber-200" : n.tier === "entry" ? "text-rose-200" : "text-slate-300"}>
                {n.name}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* ─── Embedded path-filtered map ────────────────────────── */}
      <div className="border-b border-slate-800/60 bg-slate-950/40">
        <div className="px-6 pt-4 pb-2 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">
            FLOW MAP · services on this path
          </div>
          <div className="text-[10px] text-slate-500">
            click any service for plane-level details ↓
          </div>
        </div>
        {/* Fixed-height container so the map fits the 3-column panel
            without dominating the page. 520px shows two lanes worth
            of content (compute row + resources row) cleanly on
            alon-prod-sized data. */}
        <div className="px-6 pb-4">
          <div
            className="relative rounded-xl border border-slate-800 bg-slate-950/80 overflow-hidden"
            style={{ height: "520px" }}
          >
            <TrafficFlowMap
              systemName={systemName}
              pathFilter={pathFilter}
              titleOverride=""
              innerTitleOverride="Flow Map"
              innerSubtitleOverride="Services on this attack path"
              pathBadgeOverride={pathFilter.pathLabel}
            />
          </div>
        </div>
      </div>

      {/* ─── Reduction projection (LLM-generated when available) ── */}
      {(path.reduction_narrative || path.risk_reduction) && (
        <div className="px-6 py-4 border-b border-slate-800/60 bg-emerald-500/[0.03]">
          <div className="flex items-start gap-3">
            <Sparkles className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-emerald-400 mb-1">
                What Cyntro will close on this path
              </div>
              <div className="text-sm text-slate-200 leading-snug">
                {path.reduction_narrative ||
                  (path.risk_reduction?.reduction_summary ?? "Hardening summary will appear here once computed.")}
              </div>
              {path.risk_reduction && (
                <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400">
                  {path.risk_reduction.current_score !== undefined &&
                    path.risk_reduction.achievable_score !== undefined && (
                      <span>
                        Score:{" "}
                        <span className="text-slate-200 font-semibold">
                          {path.risk_reduction.current_score}
                        </span>{" "}
                        <span className="text-slate-500">→</span>{" "}
                        <span className="text-emerald-300 font-semibold">
                          {path.risk_reduction.achievable_score}
                        </span>
                      </span>
                    )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Slice 2+ placeholders ─────────────────────────────── */}
      <div className="px-6 py-6 space-y-4">
        <PlanePlaceholder
          title="NETWORK PLANE"
          subtitle="SG rules, NACLs, VPC endpoints, public-IP exposure on this path."
          icon={<ShieldAlert className="h-4 w-4 text-orange-300" />}
        />
        <PlanePlaceholder
          title="IDENTITY PLANE"
          subtitle="Role + instance profile chain, allowed/used/unused actions, multi-role pivots."
          icon={<ShieldAlert className="h-4 w-4 text-pink-300" />}
        />
        <PlanePlaceholder
          title="DATA PLANE"
          subtitle="Reachable resources from this path, observed actions, theoretical actions per allowed policy."
          icon={<ShieldAlert className="h-4 w-4 text-violet-300" />}
        />
        <PlanePlaceholder
          title="POTENTIAL DAMAGE"
          subtitle="Plain-English projection of what an attacker on this path could actually do."
          icon={<AlertTriangle className="h-4 w-4 text-red-300" />}
        />
        <PlanePlaceholder
          title="RECOMMENDED HARDENING"
          subtitle="Observation-grounded narrowing — drop unused permissions, close SG ingress, narrow S3 to observed actions."
          icon={<Sparkles className="h-4 w-4 text-emerald-300" />}
        />
      </div>
    </div>
  )
}

// Slice 2-4 plane sections render in place of these stubs. Each
// shows what the section IS, so the operator sees the layout shape
// without us fabricating content per feedback_no_mock_numbers_in_ui.
function PlanePlaceholder({
  title,
  subtitle,
  icon,
}: {
  title: string
  subtitle: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/20 p-4">
      <div className="flex items-center gap-2">
        {icon}
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
          {title}
        </div>
        <span className="ml-auto text-[9px] uppercase tracking-wider text-slate-600">
          coming next
        </span>
      </div>
      <div className="text-[12px] text-slate-500 mt-1.5 leading-snug">{subtitle}</div>
    </div>
  )
}
