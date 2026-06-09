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

import { useMemo, useRef, useState } from "react"
import { Crown, ChevronRight, Maximize2, Minimize2, AlertOctagon } from "lucide-react"
import TrafficFlowMap, {
  type TrafficFlowMapPathFilter,
  type SystemArchitecture,
} from "@/components/dependency-map/traffic-flow-map"
import { AttackPathFlowViz } from "@/components/identity-attack-paths/attack-path-flow-viz"
import type {
  IdentityAttackPath,
  CrownJewelSummary,
} from "@/components/identity-attack-paths/types"
import { isPrincipalNodeType } from "@/components/identity-attack-paths/types"
import { filterActivePaths } from "@/lib/active-filters"
import { NetworkPlanePanel, IdentityPlanePanel, DataPlanePanel } from "./plane-panels"
import { HardeningPanel } from "./hardening-panel"
import { ClosureOutcomeSection } from "./closure-outcome-panel"
import { AtlasInlineSection } from "./atlas-inline-section"
import {
  DamageScopeDrawer,
  type DamageScopeTarget,
} from "./damage-scope-drawer"
import { DamageAwarePathCard } from "./damage-aware-path-card"
import { useDamageScope } from "./use-damage-scope"

interface PathAnalysisPanelProps {
  path: IdentityAttackPath
  jewel: CrownJewelSummary | null
  systemName: string
  /** When true, the parent has hidden the left + center columns so this
   *  panel fills the whole screen. We render a Minimize button in the
   *  header to return to the 3-column layout. */
  isExpanded?: boolean
  onToggleExpand?: () => void
  /** When provided, the embedded canvas renders the full Attacker-View
   *  architecture (lateral fan-outs, 9-lane layout, hover provenance)
   *  instead of the sparse path-filter view. Used by the merged
   *  "Attack Path" tab so the canvas inherits Attacker View's lens
   *  while the header / breadcrumb / closure card stay Per-Path. When
   *  null/undefined, the legacy path-filter mode renders. */
  architecture?: SystemArchitecture | null
  /** Visual v2 opt-in (?canvas=v2). Adds the caption strip above the
   *  canvas, the severity halo on the jewel card, and (in later
   *  passes) lateral dimming + verb chips + palette consolidation.
   *  Pure visual layer — no data/contract impact. Default false so
   *  legacy operators see the unchanged canvas. */
  canvasV2?: boolean
}

// V2-1 helper: middle-truncate a jewel name for the caption strip.
// Jewel names are usually friendly already (e.g. "cyntro-demo-prod-
// data-745783559495") but the trailing 12-digit account ID is
// noise — keep prefix + suffix readable, truncate the middle. Full
// name still surfaces on hover via the title attribute.
function captionTruncate(name: string, maxLen = 36): string {
  if (!name) return ""
  if (name.length <= maxLen) return name
  const half = Math.floor((maxLen - 1) / 2)
  return name.slice(0, half) + "…" + name.slice(-(maxLen - half - 1))
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

export function PathAnalysisPanel({
  path,
  jewel,
  systemName,
  isExpanded = false,
  onToggleExpand,
  architecture,
  canvasV2 = false,
}: PathAnalysisPanelProps) {
  const [damageScopeTarget, setDamageScopeTarget] = useState<DamageScopeTarget | null>(
    null,
  )
  const [damageScopeOpen, setDamageScopeOpen] = useState(false)
  const damageScopePortalContainerRef = useRef<HTMLDivElement | null>(null)
  // Flow Map = rich TrafficFlowMap (Stack sidebar, ROUTE TABLES, EGRESS
  // GATEWAYS, lateral pivots). Lateral Movement = the 5-column lane
  // diagram (Entry → Compute → Identity → Pivot → Crown Jewel) from
  // Identity Attack Paths — same view operators had under the "Lanes"
  // toggle before Attack Paths v2 dropped it.
  const [mapView, setMapView] = useState<"flow" | "lateral">("flow")
  const [technicalOpen, setTechnicalOpen] = useState(false)

  const lateralPaths = useMemo(() => filterActivePaths([path]), [path])

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

  // Root-principal detection — surfaces as a header badge AND a chip
  // overlay on the COMPUTE/IAM lane card. The auth identity is
  // already on path.nodes[0] (a principal-like wrapper) but the
  // scorer doesn't yet boost root paths (see open task — backend +20
  // floor). Operators scanning the score-sorted path list miss the
  // worst signal without an explicit badge here.
  // Post 2026-05-22 canonical-type fix: root arrives as type
  // "AWSPrincipal" (was "CloudTrailPrincipal"); widen via
  // isPrincipalNodeType so the badge still lights up.
  const isRootPrincipal = useMemo(() => {
    const p = (path.nodes ?? []).find((n) => isPrincipalNodeType(n.type))
    return p?.name === "root"
  }, [path])

  const jewelNodeId = useMemo(() => {
    if (jewel?.id) return jewel.id
    const dataTypes = new Set([
      "S3Bucket",
      "DynamoDBTable",
      "RDSInstance",
      "RDS",
      "KMSKey",
      "Secret",
      "SecretsManagerSecret",
    ])
    const nodes = path.nodes ?? []
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (dataTypes.has(nodes[i].type)) return nodes[i].id
    }
    return nodes[nodes.length - 1]?.id ?? null
  }, [path, jewel])

  const damageScopeFetchTarget = useMemo(
    () =>
      jewelNodeId
        ? { systemName, pathId: path.id, nodeId: jewelNodeId }
        : null,
    [systemName, path.id, jewelNodeId],
  )
  const { data: damageScopeData, loading: damageScopeLoading, error: damageScopeError } =
    useDamageScope(damageScopeFetchTarget)

  return (
    <div className="flex flex-col h-full">
      {/* Compact chrome — path narrative lives on DamageAwarePathCard */}
      <div className="px-6 py-2 border-b border-slate-800/60 bg-slate-950/95 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider rounded border px-2 py-0.5 ${sevTone}`}>
              {sevLabel}
              {sevScore !== undefined && sevScore !== null && (
                <span className="ml-1.5 opacity-80">{sevScore}/100</span>
              )}
            </span>
            {isRootPrincipal && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider rounded border border-red-500/50 bg-red-500/15 text-red-200 px-2 py-0.5"
                title="Authenticated with AWS account root user"
              >
                <AlertOctagon className="h-3 w-3" />
                Auth: root
              </span>
            )}
            <span className="text-[11px] text-slate-500">
              {path.hop_count ?? path.nodes.length - 1} hops
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {jewel && (
              <div className="flex items-center gap-1.5 text-xs font-mono text-amber-200/90 truncate max-w-[200px]" title={jewel.name}>
                <Crown className="h-3 w-3 text-amber-400 shrink-0" />
                {jewel.name}
              </div>
            )}
            {onToggleExpand && (
              <button
                onClick={onToggleExpand}
                title={isExpanded ? "Collapse (Esc)" : "Expand to full screen"}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:border-slate-600 transition-colors"
              >
                {isExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
              </button>
            )}
          </div>
        </div>
      </div>

      <DamageAwarePathCard
        path={path}
        jewel={jewel}
        systemName={systemName}
        scope={damageScopeData}
        scopeLoading={damageScopeLoading}
        scopeError={damageScopeError}
      />

      <div className="px-6 py-4 border-b border-slate-800/60">
        <ClosureOutcomeSection pathId={path.id} />
      </div>

      {/* Supporting evidence — flow map + plane breakdown (not the hero) */}
      <div className="border-b border-slate-800/60 bg-slate-950/40">
        <div className="px-6 pt-3 pb-1">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">
            Supporting evidence
          </div>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Network topology, lateral movement, and per-plane signals
          </p>
        </div>
        {/* V2-1: Caption strip — one-line story above the canvas.
            ENTRY: <hop[0]> → via N hops → REACHES: <jewel>.
            Mirrors the breadcrumb up top but binds visually to the
            canvas (not the metadata header) so the eye gets a
            reading direction WITH the diagram, not 200px above it.
            Behind ?canvas=v2 — legacy operators see no change. */}
        {canvasV2 && start && target && (
          <div className="px-6 pt-4 pb-1 flex items-center gap-2 text-[11px]">
            <span className="text-slate-500 uppercase tracking-wider font-medium shrink-0">
              Entry
            </span>
            <span
              className="font-mono text-slate-200 truncate max-w-[280px]"
              title={start.name}
            >
              {start.name}
            </span>
            <ChevronRight className="h-3 w-3 text-slate-600 shrink-0" />
            <span className="text-slate-400 shrink-0">
              via <span className="font-semibold text-slate-200">{path.hop_count}</span>{" "}
              {path.hop_count === 1 ? "hop" : "hops"}
            </span>
            <ChevronRight className="h-3 w-3 text-slate-600 shrink-0" />
            <span className="text-slate-500 uppercase tracking-wider font-medium shrink-0">
              Reaches
            </span>
            <span
              className="font-mono text-amber-300 truncate"
              title={jewel?.name ?? target.name}
            >
              {captionTruncate(jewel?.name ?? target.name)}
            </span>
            {jewel?.name && (
              <Crown className="h-3 w-3 text-amber-400 shrink-0" />
            )}
          </div>
        )}
        <div className="px-6 pt-4 pb-2 flex items-center justify-between gap-3">
          <div className="inline-flex items-center bg-slate-800/60 rounded p-0.5 border border-slate-700 shrink-0">
            <button
              type="button"
              onClick={() => setMapView("flow")}
              className={`px-2.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                mapView === "flow"
                  ? "bg-blue-500/20 text-blue-200"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Rich system map — Stack Components sidebar, ROUTE TABLES, EGRESS GATEWAYS, lateral pivot edges"
            >
              Flow Map
            </button>
            <button
              type="button"
              onClick={() => setMapView("lateral")}
              className={`px-2.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                mapView === "lateral"
                  ? "bg-fuchsia-500/20 text-fuchsia-200"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="5-column lateral movement layout — Entry · Compute · Identity · Pivot · Crown Jewel"
            >
              Lateral Movement
            </button>
          </div>
          <div className="text-[10px] text-slate-500 text-right min-w-0">
            {mapView === "flow"
              ? "click a data resource (canvas or Storage sidebar) for damage scope"
              : "Entry → Compute → Identity → Pivot → Crown Jewel"}
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
            {mapView === "flow" ? (
              <TrafficFlowMap
                systemName={systemName}
                architectureOverride={architecture ?? null}
                pathFilter={pathFilter}
                titleOverride=""
                innerTitleOverride="Flow Map"
                innerSubtitleOverride="On-path chain + lateral pivots"
                pathBadgeOverride={pathFilter.pathLabel}
                observedMode={true}
                jewelEmphasis={canvasV2}
                jewelSeverity={canvasV2 ? path.severity?.severity : undefined}
                canvasV2={canvasV2}
                entryNodeId={canvasV2 ? start?.id : undefined}
                fullscreenContainerRef={damageScopePortalContainerRef}
                onDamageScopeDataNode={(node) => {
                  setDamageScopeTarget({
                    nodeId: node.id,
                    nodeName: node.name,
                    nodeType: node.type,
                    systemName,
                    pathId: path.id,
                  })
                  setDamageScopeOpen(true)
                }}
              />
            ) : (
              <div className="h-full overflow-auto">
                <AttackPathFlowViz
                  paths={lateralPaths}
                  selectedPathIndex={0}
                  onNodeClick={() => {}}
                  selectedNodeId={null}
                />
              </div>
            )}
          </div>
          {/* ATLAS — Phase 3.2.4 (2026-05-27). Inline catalog-driven
              chain search for this path. Sits in the empty space under
              the Flow Map so the operator sees ATLAS without switching
              tabs. Auto-derives foothold (EC2/Lambda) + target (jewel)
              from the path itself — no inputs. */}
          <AtlasInlineSection systemName={systemName} path={path} jewel={jewel} />
        </div>
      </div>

      <div className="px-6 py-4 border-t border-slate-800/60">
        <button
          type="button"
          onClick={() => setTechnicalOpen((o) => !o)}
          className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-400 hover:text-slate-200"
        >
          <ChevronRight
            className={`h-3 w-3 transition-transform ${technicalOpen ? "rotate-90" : ""}`}
          />
          Technical detail — network / identity / data planes
        </button>
        {technicalOpen && (
          <div className="mt-4 space-y-4">
            <NetworkPlanePanel path={path} />
            <IdentityPlanePanel path={path} />
            <DataPlanePanel path={path} />
            <HardeningPanel path={path} systemName={systemName} defaultCollapsed />
          </div>
        )}
      </div>

      <DamageScopeDrawer
        target={damageScopeTarget}
        open={damageScopeOpen}
        onOpenChange={setDamageScopeOpen}
        portalContainerRef={damageScopePortalContainerRef}
      />
    </div>
  )
}
