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
  PathNodeDetail,
} from "@/components/identity-attack-paths/types"
import { isPrincipalNodeType } from "@/components/identity-attack-paths/types"
import { filterActivePaths } from "@/lib/active-filters"
import { NetworkPlanePanel, IdentityPlanePanel, DataPlanePanel } from "./plane-panels"
import { HardeningPanel } from "./hardening-panel"
import { AtlasInlineSection } from "./atlas-inline-section"
import { AttackPathCardLight } from "./attack-path-card-light"
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

// Kill-chain strip (2026-06-11). The map's lane layout makes the
// numbered spine zigzag visually; this strip gives reviewers the
// LINEAR story: ENTRY → IDENTITY → NETWORK PASSAGE → DATA, with the
// same 1-based step numbers the map badges carry. Replaces the old
// canvasV2-gated "ENTRY → via N hops → REACHES" caption — always on
// when a path is present. Purely presentational.
type KillChainPhase = "ENTRY" | "IDENTITY" | "NETWORK" | "DATA"

function killChainPhase(node: PathNodeDetail): KillChainPhase {
  const t = (node.type || "").toLowerCase()
  // Order matters: "instanceprofile" contains "instance" (a workload
  // hint) — identity patterns must win first.
  if (/role|instance.?profile|policy/.test(t)) return "IDENTITY"
  if (/s3|bucket|rds|dynamo|kms|secret/.test(t)) return "DATA"
  if (/subnet|security.?group|nacl|networkacl|route|vpce|vpc.?endpoint|igw|internet.?gateway|nat/.test(t)) return "NETWORK"
  if (isPrincipalNodeType(node.type) || /ec2|lambda|ecs|instance|principal|user/.test(t)) return "ENTRY"
  // Unknown type → fall back to the path tier the backend assigned.
  if (node.tier === "network_control") return "NETWORK"
  if (node.tier === "identity") return "IDENTITY"
  if (node.tier === "crown_jewel") return "DATA"
  return "ENTRY"
}

function KillChainStrip({ nodes }: { nodes: PathNodeDetail[] }) {
  // Segments: every node is its own segment EXCEPT consecutive NETWORK
  // nodes, which collapse into one "NETWORK PASSAGE · n hops" segment
  // (step range + tooltip list) so the strip stays one line.
  const segments = useMemo(() => {
    const segs: Array<{ phase: KillChainPhase; nodes: Array<PathNodeDetail & { step: number }> }> = []
    nodes.forEach((n, idx) => {
      const phase = killChainPhase(n)
      const entry = { ...n, step: idx + 1 }
      const prev = segs[segs.length - 1]
      if (phase === "NETWORK" && prev?.phase === "NETWORK") prev.nodes.push(entry)
      else segs.push({ phase, nodes: [entry] })
    })
    return segs
  }, [nodes])
  if (segments.length === 0) return null
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 px-6 py-3 border-b border-border bg-card"
      data-kill-chain-strip="true"
    >
      {segments.map((seg, i) => {
        const grouped = seg.nodes.length > 1
        const first = seg.nodes[0]
        const last = seg.nodes[seg.nodes.length - 1]
        const numberLabel = grouped ? `${first.step}–${last.step}` : String(first.step)
        const title = seg.nodes.map((n) => `${n.step}. ${n.name} (${n.type})`).join("\n")
        const isLast = i === segments.length - 1
        return (
          <span key={`${seg.phase}-${first.step}`} className="flex items-center gap-2 min-w-0" title={title}>
            {/* Same badge style as the map's numbered spine badges */}
            <span
              className={`${grouped ? "px-1.5 min-w-[18px]" : "w-[18px]"} h-[18px] rounded-full flex items-center justify-center text-[10px] font-semibold text-white shadow-md shrink-0`}
              style={{ backgroundColor: "var(--canvas-danger)" }}
            >
              {numberLabel}
            </span>
            <span className="flex flex-col leading-tight min-w-0">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                {grouped ? `Network passage · ${seg.nodes.length} hops` : seg.phase}
              </span>
              {!grouped && (
                <span className="text-[11px] font-mono text-foreground truncate">
                  {captionTruncate(first.name)}
                </span>
              )}
            </span>
            {isLast && seg.phase === "DATA" && (
              <Crown className="h-3 w-3 text-amber-500 shrink-0" />
            )}
            {!isLast && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
          </span>
        )
      })}
    </div>
  )
}

// Map severity level → tone for the score badge. Same palette as the
// path list so the operator sees consistent severity coloring across
// the page.
function severityTone(level?: string) {
  const l = (level || "").toLowerCase()
  if (l === "critical") return "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300"
  if (l === "high") return "bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-300"
  if (l === "medium") return "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300"
  if (l === "low") return "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
  return "bg-muted border-border text-muted-foreground"
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
  // Supporting evidence is collapsible and DEFAULT CLOSED — the light
  // attack-path card is the hero/decision surface now; the flow map, the
  // dark damage-aware card, and per-plane signals are one click away for
  // the operator who wants to drill into the topology.
  const [evidenceOpen, setEvidenceOpen] = useState(false)

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

  // Accuracy-audit F5 (2026-06-11): per-path gate evidence summary from
  // the MATERIALIZED :AttackPath gates — always labeled with the exact
  // foothold → role pair it summarizes. The previous evidence chip
  // aggregated whichever underlying path variant happened to be loaded
  // (EC2-foothold route=OPEN_CONFIG vs orphan-role route=UNKNOWN)
  // without disambiguating, so the counts wobbled between views.
  const materializedEvidence = useMemo(() => {
    const mp = path.materialized_path
    if (!mp) return null
    const gateNames: Array<[string, string | undefined]> = [
      ["identity", mp.identity_gate],
      ["route", mp.route_gate],
      ["data-plane", mp.data_plane_gate],
    ]
    const counts = { observed: 0, configured: 0, blocked: 0, unknown: 0 }
    for (const [, g] of gateNames) {
      const v = (g || "UNKNOWN").toUpperCase()
      if (v === "OPEN_OBSERVED") counts.observed++
      else if (v === "OPEN_CONFIG") counts.configured++
      else if (v === "CLOSED") counts.blocked++
      else counts.unknown++
    }
    const parts: string[] = []
    if (counts.observed) parts.push(`${counts.observed} observed`)
    if (counts.configured) parts.push(`${counts.configured} configured`)
    if (counts.blocked) parts.push(`${counts.blocked} blocked`)
    if (counts.unknown) parts.push(`${counts.unknown} unknown`)
    const pathLabel = [mp.workload_name, mp.role_name].filter(Boolean).join(" → ")
    const detail = gateNames
      .map(([name, g]) => `${name}=${(g || "UNKNOWN").toUpperCase()}`)
      .join(" · ")
    return { parts, pathLabel, detail }
  }, [path.materialized_path])

  return (
    <div className="flex flex-col h-full">
      {/* Compact chrome — path narrative lives on DamageAwarePathCard */}
      <div className="px-6 py-2 border-b border-border bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {/* Labeled "path score" so it can't be confused with the
                compiler's Exposure (0–1) chip in the narrative — two
                different models, two different dimensions. */}
            <span
              className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider rounded border px-2 py-0.5 ${sevTone}`}
              title="IAP 6-factor path score (/100) — distinct from the compiler's Exposure model below"
            >
              <span className="opacity-70 mr-1 font-semibold normal-case">path score</span>
              {sevLabel}
              {sevScore !== undefined && sevScore !== null && (
                <span className="ml-1.5 opacity-80">{sevScore}/100</span>
              )}
            </span>
            {isRootPrincipal && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider rounded border border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300 px-2 py-0.5"
                title="Authenticated with AWS account root user"
              >
                <AlertOctagon className="h-3 w-3" />
                Auth: root
              </span>
            )}
            <span className="text-[11px] text-muted-foreground">
              {path.hop_count ?? path.nodes.length - 1} hops
            </span>
            {materializedEvidence && (
              <span
                className="text-[10px] uppercase tracking-wider text-muted-foreground truncate max-w-[360px]"
                title={`Gate evidence for THIS path${materializedEvidence.pathLabel ? ` (${materializedEvidence.pathLabel})` : ""}: ${materializedEvidence.detail}`}
              >
                Evidence
                {materializedEvidence.pathLabel && (
                  <span className="normal-case font-mono"> ({materializedEvidence.pathLabel})</span>
                )}
                : {materializedEvidence.parts.join(" · ")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {jewel && (
              <div className="flex items-center gap-1.5 text-xs font-mono text-amber-700 dark:text-amber-300 truncate max-w-[200px]" title={jewel.name}>
                <Crown className="h-3 w-3 text-amber-500 shrink-0" />
                {jewel.name}
              </div>
            )}
            {onToggleExpand && (
              <button
                onClick={onToggleExpand}
                title={isExpanded ? "Collapse (Esc)" : "Expand to full screen"}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                {isExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* HERO — light prod attack-path card (cyntro_attack-path-card_design.html).
          Pure renderer of the real backend AttackPathReport: header + risk +
          "how real" gates + the fix you approve. The flow map, the dark
          damage-aware card, and per-plane detail all move into "Supporting
          evidence" below so the clean light card is the default view. */}
      <div className="px-6 py-5 border-b border-border" style={{ background: "#eef1f5" }}>
        <AttackPathCardLight path={path} jewel={jewel} />
      </div>

      {/* Supporting evidence — flow map + plane breakdown (not the hero) */}
      <div className="border-b border-border bg-muted/30">
        <div className="px-6 pt-3 pb-1">
          <button
            type="button"
            onClick={() => setEvidenceOpen((o) => !o)}
            className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform ${evidenceOpen ? "rotate-90" : ""}`}
            />
            Supporting evidence
          </button>
          {evidenceOpen && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Network topology, lateral movement, and per-plane signals
            </p>
          )}
        </div>
        {evidenceOpen && (
        <>
        {/* Dark damage-aware card — demoted from hero into supporting
            evidence (the light card above now owns the damage/fix story).
            Kept here so its damage-scope drawer + per-cell detail stay
            available for the operator drilling in. */}
        <div className="px-6 pt-4">
          <DamageAwarePathCard
            path={path}
            jewel={jewel}
            systemName={systemName}
            scope={damageScopeData}
            scopeLoading={damageScopeLoading}
            scopeError={damageScopeError}
          />
        </div>
        {/* Kill-chain strip (2026-06-11) — replaces the canvasV2-gated
            "ENTRY → via N hops → REACHES" caption. Always on when the
            path has nodes: a LINEAR phase-by-phase read of the spine
            whose numbers match the map's step badges, since the lane
            layout makes the numbered spine zigzag on the canvas. */}
        {(path.nodes?.length ?? 0) > 0 && <KillChainStrip nodes={path.nodes} />}
        <div className="px-6 pt-4 pb-2 flex items-center justify-between gap-3">
          <div className="inline-flex items-center bg-muted rounded p-0.5 border border-border shrink-0">
            <button
              type="button"
              onClick={() => setMapView("flow")}
              className={`px-2.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                mapView === "flow"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
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
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="5-column lateral movement layout — Entry · Compute · Identity · Pivot · Crown Jewel"
            >
              Lateral Movement
            </button>
          </div>
          <div className="text-[10px] text-muted-foreground text-right min-w-0">
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
            className="relative rounded-xl border border-border bg-card overflow-hidden"
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
        </>
        )}
      </div>

      <div className="px-6 py-4 border-t border-border">
        <button
          type="button"
          onClick={() => setTechnicalOpen((o) => !o)}
          className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
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
