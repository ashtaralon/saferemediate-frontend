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
import { Crown, ChevronRight, ShieldAlert, AlertTriangle, Sparkles, Maximize2, Minimize2, AlertOctagon } from "lucide-react"
import TrafficFlowMap, {
  type TrafficFlowMapPathFilter,
  type SystemArchitecture,
} from "@/components/dependency-map/traffic-flow-map"
import type {
  IdentityAttackPath,
  CrownJewelSummary,
} from "@/components/identity-attack-paths/types"
import { isPrincipalNodeType, PRINCIPAL_NODE_TYPES } from "@/components/identity-attack-paths/types"
import { NetworkPlanePanel, IdentityPlanePanel, DataPlanePanel } from "./plane-panels"
import { HardeningPanel } from "./hardening-panel"
import { DamagePanel } from "./damage-panel"
import { AtlasInlineSection } from "./atlas-inline-section"

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

// Short uppercase label for the decoration chips attached to
// traversal-node breadcrumbs. Kept stable + abbreviated so operators
// can scan the chip row without parsing AWS service names.
function decorationLabel(type: string): string {
  switch (type) {
    case "SecurityGroup":
      return "sg"
    case "Subnet":
      return "subnet"
    case "VPC":
      return "vpc"
    case "NetworkACL":
    case "NACL":
      return "nacl"
    case "InstanceProfile":
      return "ip"
    case "NetworkNode":
      return "net"
    default:
      return type.toLowerCase()
  }
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

  // Classify nodes as breadcrumb traversal hops or contextual
  // decorations attached to a workload.
  //
  // 2026-05-22 follow-on credibility fix: the legacy breadcrumb
  // rendered EVERY node in path.nodes in lane order, including
  // SG/VPC/Subnet/NACL. Those don't have direct graph edges in
  // sequence (real path had 7 nodes but only 5 edges, with SG/VPC/
  // Subnet contributing zero chain edges) — so the chevrons between
  // them implied a graph traversal that didn't exist. Filtering them
  // out of the breadcrumb means every remaining chevron is backed by
  // a real edge. Decorations get rendered as chips attached to the
  // immediately-preceding workload node.
  // TRAVERSAL_TYPES = nodes that should appear in the chain breadcrumb
  // (entry → … → crown_jewel). Includes the legacy "CloudTrailPrincipal"
  // for back-compat plus every principal-like canonical type the IAP
  // backend may now emit (AWSPrincipal/Principal/Root) after the
  // 2026-05-22 type-canonicalization fix — without this, the entry
  // node would silently drop out of the breadcrumb for root + STS
  // sessions whose Neo4j labels resolve to AWSPrincipal.
  const TRAVERSAL_TYPES = new Set<string>([
    ...PRINCIPAL_NODE_TYPES,
    "HumanIdentity",
    "IAMUser",
    "ExternalIP",
    "EC2Instance",
    "LambdaFunction",
    "ECSTask",
    "FargateTask",
    "IAMRole",
    "S3Bucket",
    "DynamoDBTable",
    "RDSInstance",
    "RDS",
    "KMSKey",
    "Secret",
    "NetworkEndpoint",
  ])
  const DECORATION_TYPES = new Set([
    "SecurityGroup",
    "NetworkACL",
    "NACL",
    "Subnet",
    "VPC",
    "InstanceProfile",
    "NetworkNode",
  ])
  const { traversalNodes, decorationsByNeighbor } = useMemo(() => {
    const nodes = path.nodes ?? []
    const traversal: typeof nodes = []
    const decorations: Array<{ idx: number; node: (typeof nodes)[number] }> = []
    // Walk in order; carry the most recent traversal node so the
    // following decorations group under it. Decorations BEFORE any
    // traversal node attach to the first traversal node (rare —
    // network gates ahead of the entry).
    nodes.forEach((n, i) => {
      if (TRAVERSAL_TYPES.has(n.type)) {
        traversal.push(n)
      } else if (DECORATION_TYPES.has(n.type)) {
        decorations.push({ idx: Math.max(0, traversal.length - 1), node: n })
      } else {
        // Unknown — render as traversal so we never accidentally hide
        // a path node we don't have a classification for. Better to
        // over-render than to silently drop a hop.
        traversal.push(n)
      }
    })
    // Group decorations by the traversal-node index they attach to.
    const byNeighbor = new Map<number, typeof nodes>()
    decorations.forEach(({ idx, node }) => {
      const arr = byNeighbor.get(idx) ?? []
      arr.push(node)
      byNeighbor.set(idx, arr)
    })
    return { traversalNodes: traversal, decorationsByNeighbor: byNeighbor }
  }, [path])

  // Per-hop evidence map — Slice 5b credibility fix (2026-05-21 audit).
  //
  // The old single "OBSERVED" / "CONFIGURED" badge merged every hop's
  // evidence into one claim. Real attack chains have mixed evidence:
  // typically ONE observed edge (CloudTrail role→S3) and the rest
  // configured (USES_ROLE, SECURED_BY, IN_SUBNET). Painting the whole
  // path "OBSERVED" was misleading.
  //
  // This builds a map keyed by "src|dst" returning the observation flag
  // from path.edges. The chain renderer below uses it to color each
  // chevron (and the summary header to count observed vs configured
  // hops honestly). If multiple edges connect the same pair (USES_ROLE
  // + ASSUMES_ROLE), the hop is marked observed if ANY edge is observed.
  const edgeEvidence = useMemo(() => {
    const map = new Map<string, "observed" | "configured">()
    for (const e of path.edges ?? []) {
      // Bidirectional: chain layout may go src→dst or dst→src.
      const fwd = `${e.source}|${e.target}`
      const rev = `${e.target}|${e.source}`
      const cur = map.get(fwd) ?? map.get(rev)
      const next: "observed" | "configured" = e.is_observed ? "observed" : "configured"
      // Observed wins — never downgrade an observed hop because of a
      // sibling configured edge between the same nodes.
      const merged: "observed" | "configured" =
        cur === "observed" || next === "observed" ? "observed" : "configured"
      map.set(fwd, merged)
      map.set(rev, merged)
    }
    return map
  }, [path])

  // Aggregate counts for the header summary chip.
  //
  // Uses traversalNodes (graph-traversal hops) rather than the full
  // path.nodes list so we don't surface bogus "unknown" hops between
  // SG/VPC/Subnet decorations that were never meant to be sequential
  // chain edges. Counts only the chevrons actually drawn.
  const evidenceSummary = useMemo(() => {
    const nodes = traversalNodes
    let observed = 0
    let configured = 0
    let unknown = 0
    for (let i = 1; i < nodes.length; i++) {
      const prev = nodes[i - 1]
      const here = nodes[i]
      const key = `${prev.id}|${here.id}`
      const revKey = `${here.id}|${prev.id}`
      const evidence = edgeEvidence.get(key) ?? edgeEvidence.get(revKey)
      if (evidence === "observed") observed++
      else if (evidence === "configured") configured++
      else unknown++
    }
    return { observed, configured, unknown, total: Math.max(0, nodes.length - 1) }
  }, [traversalNodes, edgeEvidence])

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
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-2">
              <span>PATH ANALYSIS</span>
              {onToggleExpand && (
                <button
                  onClick={onToggleExpand}
                  title={isExpanded ? "Collapse (Esc)" : "Expand to full screen"}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:border-slate-600 transition-colors normal-case tracking-normal"
                >
                  {isExpanded ? (
                    <>
                      <Minimize2 className="h-2.5 w-2.5" />
                      <span className="text-[9px] font-semibold uppercase tracking-wider">Collapse</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="h-2.5 w-2.5" />
                      <span className="text-[9px] font-semibold uppercase tracking-wider">Expand</span>
                    </>
                  )}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider rounded border px-2 py-0.5 ${sevTone}`}>
                {sevLabel}
                {sevScore !== undefined && sevScore !== null && (
                  <span className="ml-1.5 opacity-80">{sevScore}/100</span>
                )}
              </span>
              {/* Root-principal badge — operator-critical signal that the
                  6-factor severity scorer doesn't yet weight. Surfaces at
                  the path title and again on the COMPUTE/IAM chip via
                  the chain visualization below. */}
              {isRootPrincipal && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider rounded border border-red-500/50 bg-red-500/15 text-red-200 px-2 py-0.5"
                  title="This path was authenticated with the AWS account root user. Root credentials bypass every IAM permission boundary and SCP — their presence on any attack path is a hard finding regardless of the rest of the chain."
                >
                  <AlertOctagon className="h-3 w-3" />
                  Auth: root
                </span>
              )}
              <span className="text-[11px] text-slate-400">
                {path.hop_count ?? path.nodes.length - 1} hops
              </span>
              {/* Per-hop evidence summary — replaces the legacy single
                  "OBSERVED" / "CONFIGURED" badge per the 2026-05-21
                  credibility audit. Renders the count of observed vs
                  configured hops in the chain. Tooltip explains the
                  evidence classes so operators understand what each
                  color means. Color coding matches the chain chevrons
                  below: green=observed, amber=configured. */}
              <span
                className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider rounded border border-slate-700 bg-slate-900/60 px-1.5 py-0.5"
                title="Per-hop evidence: green = CloudTrail/flow-log observed; amber = configured-only (USES_ROLE / SECURED_BY / IN_SUBNET); gray = unknown."
              >
                <span className="text-slate-400">Evidence:</span>
                {evidenceSummary.observed > 0 && (
                  <span className="text-emerald-400">
                    {evidenceSummary.observed} observed
                  </span>
                )}
                {evidenceSummary.observed > 0 && evidenceSummary.configured > 0 && (
                  <span className="text-slate-600">·</span>
                )}
                {evidenceSummary.configured > 0 && (
                  <span className="text-amber-300">
                    {evidenceSummary.configured} configured
                  </span>
                )}
                {evidenceSummary.unknown > 0 && (
                  <>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-500">{evidenceSummary.unknown} unknown</span>
                  </>
                )}
              </span>
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

        {/* Chain breadcrumb — traversal nodes only (decorations like
            SG/VPC/Subnet/NACL are rendered as chips below). Each
            chevron is colored by the edge's actual evidence class. By
            filtering to traversal nodes, every chevron in this row
            is backed by a real edge in the graph (no more "ghost
            traversals" between network controls that have no
            sequential edges connecting them). */}
        <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-400 font-mono overflow-x-auto">
          {traversalNodes.map((n, i) => {
            // Root marker — same widening as the header isRootPrincipal
            // memo above so root keeps highlighting after the
            // 2026-05-22 canonical-type fix.
            const isRootHere = isPrincipalNodeType(n.type) && n.name === "root"
            const toneClass = isRootHere
              ? "text-red-300 font-semibold inline-flex items-center gap-1"
              : n.tier === "crown_jewel"
                ? "text-amber-200"
                : n.tier === "entry"
                  ? "text-rose-200"
                  : "text-slate-300"
            // For the chevron BEFORE this node (i>0), look up the edge
            // evidence between traversalNodes[i-1] and traversalNodes[i].
            let chevTone = "text-slate-600"
            let chevTitle: string | undefined
            if (i > 0) {
              const prev = traversalNodes[i - 1]
              const ev = edgeEvidence.get(`${prev.id}|${n.id}`) ?? edgeEvidence.get(`${n.id}|${prev.id}`)
              if (ev === "observed") {
                chevTone = "text-emerald-400"
                chevTitle = `Observed: ${prev.name} → ${n.name} (CloudTrail / flow log evidence)`
              } else if (ev === "configured") {
                chevTone = "text-amber-500/70"
                chevTitle = `Configured: ${prev.name} → ${n.name} (USES_ROLE / ASSUMES_ROLE — IAM attachment, no direct traffic evidence)`
              } else {
                chevTone = "text-slate-600"
                chevTitle = `Unknown evidence: ${prev.name} → ${n.name} (no direct graph edge — the BFS connected these via intermediaries not shown in the breadcrumb)`
              }
            }
            return (
              <span key={`${n.id}-${i}`} className="flex items-center gap-1 shrink-0">
                {i > 0 && (
                  <ChevronRight
                    className={`h-3 w-3 ${chevTone}`}
                    aria-label={chevTitle}
                  />
                )}
                <span className={toneClass} title={chevTitle}>
                  {isRootHere && <AlertOctagon className="h-3 w-3" />}
                  {n.name}
                </span>
                {/* Decoration chips attached to this traversal node —
                    network controls (SG/Subnet/VPC/NACL) and IAM-binding
                    wrappers (InstanceProfile). Rendered inline immediately
                    after the node so operators see the context without
                    inferring sequential traversal through them. */}
                {(decorationsByNeighbor.get(i) ?? []).map((dec) => (
                  <span
                    key={`dec-${dec.id}`}
                    className="inline-flex items-center gap-0.5 text-[9px] font-mono text-slate-500 rounded border border-slate-700 bg-slate-900/40 px-1 py-0.5"
                    title={`${dec.type}: ${dec.name} — context attached to ${n.name}, not a chain hop. No direct edge connects this to the next breadcrumb entry.`}
                  >
                    <span className="text-[8px] uppercase tracking-wider text-slate-600">{decorationLabel(dec.type)}</span>
                    <span className="text-slate-400">{dec.name}</span>
                  </span>
                ))}
              </span>
            )
          })}
        </div>
        {/* Evidence legend — operator can hover the badge above for a
            tooltip, but a small inline legend makes the per-hop coloring
            self-explanatory on first read. Hidden when the chain only
            has one evidence class (no point in legend-ing for a single
            color). */}
        {evidenceSummary.observed > 0 && evidenceSummary.configured > 0 && (
          <div className="mt-1.5 flex items-center gap-3 text-[9px] uppercase tracking-wider text-slate-500">
            <span className="inline-flex items-center gap-1">
              <ChevronRight className="h-2.5 w-2.5 text-emerald-400" /> observed hop
            </span>
            <span className="inline-flex items-center gap-1">
              <ChevronRight className="h-2.5 w-2.5 text-amber-500/70" /> configured-only hop
            </span>
          </div>
        )}
      </div>

      {/* ─── Embedded path-filtered map ────────────────────────── */}
      <div className="border-b border-slate-800/60 bg-slate-950/40">
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
            {/* Merged "Attack Path" lens (2026-05-31): the canvas
                always renders the full Attacker-View architecture (9
                lanes, VPC boundary, lateral fan-outs with on_path /
                lateral distinction, 3-state edge coloring, hover
                provenance). Header / breadcrumb / closure card above
                bind to `path` — the metadata wrapper Per-Path
                contributed to the merge. The earlier "sparse path-
                filter polyline" fallback was deleted with M5 (it was
                the per-path canvas the merge spec dropped as the
                wrong default).
                observedMode=true suppresses the synthesized API CALLS
                lane that renders fabricated "N calls (simulated)"
                counts derived from totalBytes/51200 — the 2026-05-21
                credibility bug. Real action counts surface in the
                DataPlanePanel below via damage_capability +
                ACTUAL_S3_ACCESS edge data, which IS observed truth. */}
            <TrafficFlowMap
              systemName={systemName}
              architectureOverride={architecture ?? null}
              titleOverride=""
              innerTitleOverride="Flow Map"
              innerSubtitleOverride="On-path chain + lateral pivots"
              pathBadgeOverride={pathFilter.pathLabel}
              observedMode={true}
              jewelEmphasis={canvasV2}
              jewelSeverity={canvasV2 ? path.severity?.severity : undefined}
            />
          </div>
          {/* ATLAS — Phase 3.2.4 (2026-05-27). Inline catalog-driven
              chain search for this path. Sits in the empty space under
              the Flow Map so the operator sees ATLAS without switching
              tabs. Auto-derives foothold (EC2/Lambda) + target (jewel)
              from the path itself — no inputs. */}
          <AtlasInlineSection systemName={systemName} path={path} jewel={jewel} />
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

      {/* ─── Plane panels (Slice 2 — live data) ────────────────── */}
      <div className="px-6 py-6 space-y-4">
        <NetworkPlanePanel path={path} />
        <IdentityPlanePanel path={path} />
        <DataPlanePanel path={path} />

        {/* Slice 3 — plain-English damage projection (iam-action-to-english
            lookup + LLM damage_narrative + damage_capability counts). */}
        <DamagePanel path={path} />

        {/* Slice 4 — live hardening recommendations */}
        <HardeningPanel path={path} systemName={systemName} />
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
