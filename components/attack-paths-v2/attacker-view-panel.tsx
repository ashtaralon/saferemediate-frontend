"use client"

// Attacker View — Slice 9 v1.1.
//
// Renders the path + lateral pivots as a dynamic flow map using the
// same TrafficFlowMap renderer the Per-Path view uses. Visual
// consistency with the other lens (animated lanes, click-to-detail,
// SG/IAM cards) — but the underlying architecture comes from the
// /api/attack-chain/graph-view endpoint, which surfaces the actual
// Neo4j graph: every lateral role the attacker could assume, every
// other resource on the role, every other workload sharing the role.
//
// 2026-05-22: rewrote from the v1.0 tree-list rendering (developer-
// grade JSON dump). The TrafficFlowMap reuse means operators see the
// attack surface in the same visual language as Per-Path, just with
// the lateral fan-out lanes populated by the graph-view endpoint.

import { useMemo } from "react"
import { Crown, AlertTriangle, Eye, RefreshCw } from "lucide-react"
import dynamic from "next/dynamic"
import { FreshnessBanner } from "@/components/freshness-banner"
import type {
  SystemArchitecture,
  ServiceNode,
  SubnetNode,
  SecurityCheckpoint,
  TrafficFlow,
  EgressGatewayNode,
} from "@/components/dependency-map/traffic-flow-map"
import type {
  IdentityAttackPath,
  CrownJewelSummary,
} from "@/components/identity-attack-paths/types"
import { useRetryFetch } from "@/lib/use-retry-fetch"
import type { CanvasEdge, CanvasRelationshipType } from "@/lib/types/attack-canvas"
import { AtlasInlineSection } from "./atlas-inline-section"

// Heavy renderer — lazy-load so the v2 page doesn't pull the full
// dep-map bundle until the operator switches to attacker view.
const TrafficFlowMap = dynamic(() => import("@/components/dependency-map/traffic-flow-map"), {
  ssr: false,
})

interface AttackerViewPanelProps {
  path: IdentityAttackPath
  jewel: CrownJewelSummary | null
  systemName: string
}

interface GraphViewResponse {
  system_name: string
  node_count: number
  nodes: GraphViewNode[]
  laterals_by_node: Record<string, GraphViewEdge[]>
  generated_at: string
}

interface GraphViewNode {
  id: string
  name: string | null
  labels: string[]
  type: string
  key_properties: Record<string, any>
}

interface GraphViewEdge {
  direction: "in" | "out"
  type: string
  neighbor_id: string
  neighbor_arn: string | null
  neighbor_name: string | null
  neighbor_labels: string[]
  neighbor_type: string
  observed: boolean | null
  bytes: number | null
  hit_count: number | null
  port: number | null
  protocol: string | null
  first_seen: string | null
  last_seen: string | null
  on_path: boolean
  significance:
    | "escalation"
    | "data"
    | "identity"
    | "network"
    | "forensic"
    | "control"
    | "misc"
}

export function AttackerViewPanel({ path, jewel, systemName }: AttackerViewPanelProps) {
  // Stable request body — recomputed only when path identity / system
  // changes. Without useMemo the body would be a fresh string on every
  // render and the fetchInit reference flip would trip useRetryFetch's
  // dependency comparison.
  const requestBody = useMemo(() => {
    const nodeIds = (path.nodes ?? []).map((n) => n.id)
    const pathEdges = (path.edges ?? []).map((e) => ({
      source: e.source,
      target: e.target,
    }))
    return JSON.stringify({
      system_name: systemName,
      node_ids: nodeIds,
      path_edges: pathEdges,
      // 2026-05-26: bumped from 30 → 200. The cap is applied per node
      // INSIDE the Cypher `collect[0..$cap]` slice, BEFORE dedup. So a
      // CJ with N principals × M duplicate edges per principal (e.g.
      // cyntro-demo-prod-data has 4 principals × 2–11 dup edges = 22
      // raw rows) eats headroom against the cap and silently drops
      // real lateral attackers. CyntroLambdaTier1-pilot (492 hits)
      // and part of alon-demo-ec2-role's edge list both fell off at
      // 30. 200 is generous enough that a realistic CJ never bumps
      // it, and tight enough that a pathologically-connected node
      // doesn't blow up the payload.
      lateral_cap_per_node: 200,
    })
  }, [path.id, path.nodes, path.edges, systemName])

  // Auto-retry on 502/503/504 — the Render backend's IAP endpoint can
  // saturate the worker pool when a slow query is in flight, causing
  // graph-view to return 5xx transiently even though it's a fast
  // query in isolation (~0.75s warm). useRetryFetch handles the
  // transient-status set + provides a manual retry handle.
  //
  // refetchKey=path.id triggers a fresh sequence when the user clicks
  // a different path in the left rail. maxRetries=2 means the user
  // gets 3 attempts spaced ~1s/2s before seeing the error UI — covers
  // a typical worker-pool blip without making them stare at a spinner
  // for the worst case.
  const fetchInit = useMemo<RequestInit>(
    () => ({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
    }),
    [requestBody],
  )
  const {
    data,
    loading,
    error,
    retry,
    retrying,
    attempt,
  } = useRetryFetch<GraphViewResponse>(
    "/api/proxy/attack-chain/graph-view",
    {
      fetchInit,
      refetchKey: path.id,
      maxRetries: 2,
      initialDelayMs: 1000,
    },
  )

  // Synthesize a SystemArchitecture from the graph-view response.
  // Path nodes get added to their canonical lanes; lateral nodes also
  // get added to lanes (so the operator sees the fan-out); flows are
  // synthesized from both the path's chain edges AND any lateral
  // edges with real observed bytes or hits so the TrafficFlowMap
  // animates the actual data flow rather than implying connections
  // that don't have evidence.
  const architecture = useMemo<SystemArchitecture | null>(() => {
    if (!data) return null
    return buildAttackerArchitecture(data, path)
  }, [data, path])

  // ── Lateral attackers (Phase 1.7 — 2026-05-26) ────────────────────
  //
  // "Show me ANY path to the crown jewel" was the original CISO ask.
  // The current canvas shows ONE chain (the path the user selected
  // from the IAP list). But the CJ may have multiple distinct
  // principals with observed ACCESSES_RESOURCE hits — Lambdas,
  // service-roles, anonymous principals — that don't share an EC2
  // origin and so don't appear in the same chain. Without surfacing
  // them, the operator scrolling the Attacker View thinks they see
  // the full picture and they don't.
  //
  // Collection rule: any neighbor of the CJ via incoming
  // ACCESSES_RESOURCE with hit_count > 0, that ISN'T already a node
  // on the current rendered chain. Hit-count threshold filters out
  // historical / zero-traffic edges.
  const lateralAttackers = useMemo(() => {
    if (!data) return [] as Array<{
      id: string
      name: string
      type: string
      hits: number
      firstSeen: string | null
      lastSeen: string | null
    }>
    const cjIds = new Set(
      (path.nodes ?? []).filter((n) => n.tier === "crown_jewel").map((n) => n.id),
    )
    const pathIds = new Set((path.nodes ?? []).map((n) => n.id))
    type AttackerRow = {
      id: string
      name: string
      type: string
      hits: number
      firstSeen: string | null
      lastSeen: string | null
    }
    // Per-principal accumulator — aggregate across duplicate edges
    // emitted by the collector (the graph carries multiple
    // ACCESSES_RESOURCE edges per (principal, resource) pair when the
    // CloudTrail/silver writer ran more than once or the node has
    // dual labels). Verified 2026-05-28 on alon-prod /
    // cyntro-demo-prod-data: e.g. alon-demo-ec2-role has 11 such
    // edges with hits varying 3..6. Without aggregation we'd take
    // whichever edge arrived first — a non-deterministic display.
    //
    // Policy: max(hits) + broadest seen window. Mirrors the anonymous-
    // principal aggregation and matches the backend's per-resource
    // MAX-then-SUM rule for the same root cause (see
    // attack_chain_view.py `_enrich_live_role_usage`).
    const namedAcc = new Map<string, AttackerRow>()
    // Aggregate edges with no resolved neighbor_id (CloudTrail
    // Principal stubs without a recognised role ARN) into a single
    // "anonymous principal" row so the operator sees the real hit
    // count instead of those events being silently dropped. The
    // backend keeps these edges as long as they carry hits/bytes;
    // the frontend collapses them here.
    let anonHits = 0
    let anonFirstSeen: string | null = null
    let anonLastSeen: string | null = null
    for (const cjId of cjIds) {
      const laterals = data.laterals_by_node?.[cjId] ?? []
      for (const e of laterals) {
        if (e.type !== "ACCESSES_RESOURCE") continue
        if (e.direction !== "in") continue
        const hits = e.hit_count ?? 0
        if (hits <= 0) continue
        const nid = e.neighbor_id || ""
        if (!nid) {
          // Anonymous CloudTrail principal — aggregate.
          anonHits = Math.max(anonHits, hits)
          if (e.first_seen && (!anonFirstSeen || e.first_seen < anonFirstSeen)) {
            anonFirstSeen = e.first_seen
          }
          if (e.last_seen && (!anonLastSeen || e.last_seen > anonLastSeen)) {
            anonLastSeen = e.last_seen
          }
          continue
        }
        if (pathIds.has(nid)) continue
        const prev = namedAcc.get(nid)
        if (!prev) {
          namedAcc.set(nid, {
            id: nid,
            name: e.neighbor_name || nid,
            type: e.neighbor_type || "Unknown",
            hits,
            firstSeen: e.first_seen ?? null,
            lastSeen: e.last_seen ?? null,
          })
        } else {
          if (hits > prev.hits) prev.hits = hits
          if (e.first_seen && (!prev.firstSeen || e.first_seen < prev.firstSeen)) {
            prev.firstSeen = e.first_seen
          }
          if (e.last_seen && (!prev.lastSeen || e.last_seen > prev.lastSeen)) {
            prev.lastSeen = e.last_seen
          }
        }
      }
    }
    const attackers: AttackerRow[] = Array.from(namedAcc.values())
    if (anonHits > 0) {
      attackers.push({
        id: "anonymous-principal",
        name: "(anonymous principal)",
        type: "Principal",
        hits: anonHits,
        firstSeen: anonFirstSeen,
        lastSeen: anonLastSeen,
      })
    }
    return attackers.sort((a, b) => b.hits - a.hits)
  }, [data, path])

  // 2026-05-26 (Phase 1.3): single source of truth for the chain's
  // observed-traffic stats. Previously this useMemo iterated a
  // different edge set than `buildAttackerArchitecture` did, producing
  // the audit's "header says 771 KB on the wire / canvas mini-header
  // says 0 B Traffic" contradiction. Now we derive both numbers off
  // architecture.flows[] (the exact set the canvas renders) so the
  // two headers cannot disagree.
  const flowSummary = useMemo(() => {
    if (!architecture) return { observedFlows: 0, totalBytes: 0, totalHits: 0 }
    let observedFlows = 0
    let totalBytes = 0
    let totalHits = 0
    for (const f of architecture.flows ?? []) {
      // isActive = backend or path edge marked observed, or has
      // hits/bytes. Same predicate the canvas uses to animate the line.
      if (!f.isActive) continue
      observedFlows++
      totalBytes += f.bytes || 0
      totalHits += f.connections || 0
    }
    return { observedFlows, totalBytes, totalHits }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [architecture])

  if (loading) {
    const retryLabel =
      retrying && attempt > 0
        ? `Backend was slow — retrying (attempt ${attempt + 1})…`
        : "Querying Neo4j for the path's neighborhood…"
    return (
      <div className="flex flex-col h-full">
        <Header jewel={jewel} subtitle="Loading the live attack surface…" />
        <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
          {retryLabel}
        </div>
      </div>
    )
  }
  if (error) {
    // Error copy distinguishes the two failure modes operators care
    // about: transient 5xx (backend worker pool busy — retry usually
    // works) vs everything else (bad request / network gone). Both get
    // a Retry button so the operator can act without reloading the page.
    const looks5xx = /\b5\d\d\b/.test(error)
    return (
      <div className="flex flex-col h-full">
        <Header jewel={jewel} subtitle="Could not load attacker view" />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 max-w-md text-sm text-red-200">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-semibold">Graph view failed</span>
            </div>
            <div className="text-xs text-red-200/80">{error}</div>
            {looks5xx && (
              <div className="mt-2 text-[11px] text-red-200/60">
                The backend's worker pool was likely busy with a slow
                upstream query (the per-system IAP enrichment can run
                long). Retrying usually clears it.
              </div>
            )}
            <button
              type="button"
              onClick={retry}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-500/20"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }
  if (!data || !architecture) return null

  // Path-only header — reflects what's actually on the canvas after
  // Slice 9.4. Operator sees the chain length + observed-flow count +
  // total observed bytes. No lateral-pivot count in the header
  // anymore (move to Exposure view for the full fan-out).
  //
  // 2026-05-26 terminology fix: previously "${node_count} hops" but
  // node_count is the count of NODES the graph-view returned (path
  // + security-critical enriched neighbors). A "hop" is an edge in
  // the chain — what we want is `path.edges.length`. Saying "16 hops"
  // when the chain has ~6 hops overstates blast radius to the CISO.
  const nodeCount = data.node_count
  const hopCount = (path.edges ?? []).length
  const subtitle =
    flowSummary.observedFlows === 0
      ? `${nodeCount} node${nodeCount === 1 ? "" : "s"} · ${hopCount} hop${hopCount === 1 ? "" : "s"} · no observed traffic on this path`
      : `${nodeCount} node${nodeCount === 1 ? "" : "s"} · ${hopCount} hop${hopCount === 1 ? "" : "s"} · ${
          flowSummary.observedFlows
        } observed flow${flowSummary.observedFlows === 1 ? "" : "s"} · ${formatBytesShort(
          flowSummary.totalBytes,
        )} on the wire`

  return (
    <div className="flex flex-col h-full">
      <Header jewel={jewel} subtitle={subtitle} />
      <div className="flex-1 min-h-0">
        <TrafficFlowMap
          systemName={systemName}
          architectureOverride={architecture}
          observedMode={true}
          titleOverride=""
          innerTitleOverride="Attack Surface"
          innerSubtitleOverride="Path chain + lateral pivots, sourced from Neo4j as-is"
          pathBadgeOverride={`Path → ${jewel?.name ?? path.id}`}
          // VPC is genuinely on the attack chain (network container
          // between SG and Subnet), not a layered overlay — show its
          // boundary by default so the path doesn't visually skip the
          // hop. Operator can still toggle it off via the header.
          defaultShowVPCBoundaries={true}
          // 2026-05-28 — Phase 2 V1 slice 1. Crown jewel cards
          // visually dominate (1.15x scale + persistent emerald
          // glow) so the operator's eye lands on the attack target
          // first, before scanning the lateral fan-out. Default off
          // for non-attacker surfaces — System Map / Per-Path /
          // Exfil keep their existing visual weighting.
          jewelEmphasis={true}
        />
      </div>
      {/* ATLAS chains inline — Phase 3.2.1 (2026-05-27). Auto-derives
          foothold + target from the selected path and renders
          deterministic catalog-driven chains compactly below the canvas.
          Renders nothing if the path doesn't have an entry-tier node or
          jewel id, so it never adds visual noise to a path it can't
          analyze. */}
      <AtlasInlineSection systemName={systemName} path={path} jewel={jewel} />
      {lateralAttackers.length > 0 ? (
        <LateralAttackersPanel
          attackers={lateralAttackers}
          jewelName={jewel?.name ?? "this jewel"}
        />
      ) : null}
    </div>
  )
}

// ── Lateral attackers panel ──────────────────────────────────────────
//
// Renders below the canvas when the CJ has incoming ACCESSES_RESOURCE
// hits from principals NOT on the current chain. Answers the CISO's
// "show me any path to the crown jewel" — the canvas above shows ONE
// chain; this panel surfaces the others as evidence-grounded rows.
//
// Copy discipline (feedback_signal_language): no "Suspicious" or
// alert language. We say "Other principals observed accessing …"
// because that is exactly what the graph evidence is.

interface LateralAttacker {
  id: string
  name: string
  type: string
  hits: number
  firstSeen: string | null
  lastSeen: string | null
}

function LateralAttackersPanel({
  attackers,
  jewelName,
}: {
  attackers: LateralAttacker[]
  jewelName: string
}) {
  const formatNumber = (n: number): string => {
    if (n < 1000) return String(n)
    if (n < 1000000) return `${(n / 1000).toFixed(1)}K`
    return `${(n / 1000000).toFixed(1)}M`
  }
  const formatRelative = (iso: string | null): string => {
    if (!iso) return "—"
    try {
      const d = new Date(iso)
      if (isNaN(d.getTime())) return "—"
      return d.toISOString().slice(0, 10)
    } catch {
      return "—"
    }
  }
  return (
    <div className="border-t border-slate-800/60 bg-slate-950/70">
      <div className="px-6 py-3 flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-amber-300/90 flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" />
            Other ways in · {attackers.length} principal
            {attackers.length === 1 ? "" : "s"} observed
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Principals with observed <span className="font-mono">ACCESSES_RESOURCE</span> to
            {" "}<span className="text-amber-200/90 font-mono">{jewelName}</span> that aren't
            on this chain. Sorted by hit count.
          </div>
        </div>
      </div>
      <div className="px-6 pb-4">
        <div className="rounded-md border border-slate-800/80 overflow-hidden">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-900/70">
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 font-semibold">Principal</th>
                <th className="px-3 py-2 font-semibold">Type</th>
                <th className="px-3 py-2 font-semibold text-right">Hits</th>
                <th className="px-3 py-2 font-semibold">First seen</th>
                <th className="px-3 py-2 font-semibold">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {attackers.map((a) => (
                <tr
                  key={a.id}
                  className="border-t border-slate-800/60 text-slate-200 hover:bg-slate-900/40"
                >
                  <td
                    className="px-3 py-2 font-mono text-slate-200 truncate max-w-[420px]"
                    title={a.id}
                  >
                    {a.name}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{a.type}</td>
                  <td className="px-3 py-2 text-right font-mono text-amber-200/90">
                    {formatNumber(a.hits)}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{formatRelative(a.firstSeen)}</td>
                  <td className="px-3 py-2 text-slate-400">{formatRelative(a.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-[10px] text-slate-500 mt-2 italic">
          Each row is one principal with at least one observed CloudTrail
          API call against this jewel. Rendered from Neo4j
          {" "}<span className="font-mono">ACCESSES_RESOURCE</span> edges, max-merged per
          {" "}<span className="font-mono">(principal, resource)</span>.
        </div>
      </div>
    </div>
  )
}

// ─── Header ──────────────────────────────────────────────────────────

function Header({ jewel, subtitle }: { jewel: CrownJewelSummary | null; subtitle: string }) {
  return (
    <div className="px-6 py-3 border-b border-slate-800/60 bg-slate-950/95 backdrop-blur sticky top-0 z-10 flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5 flex items-center gap-1.5">
          <Eye className="h-3 w-3 text-red-300" />
          ATTACKER VIEW · live attack surface
          {/* Honest freshness pill — sources graph age from
              CollectorRun.finished_at. Replaces the implicit "live"
              claim with the actual seconds-since-last-write. */}
          <FreshnessBanner variant="pill" className="ml-2" />
        </div>
        <div className="text-[11px] text-slate-400">{subtitle}</div>
      </div>
      {jewel && (
        <div className="text-right shrink-0">
          <div className="flex items-center gap-1.5 justify-end mb-0.5">
            <Crown className="h-3 w-3 text-amber-400" />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">target</span>
          </div>
          {/* Crown jewel name. 2026-05-26: widened from max-w-[260px]
              so the full bucket name fits — S3 bucket names can be up
              to 63 chars, and the old truncation hid the prod-data
              identifier behind an ellipsis. CISO scanning the header
              must be able to see WHICH bucket is under attack without
              hovering for a tooltip. */}
          <div
            className="text-xs font-mono text-amber-200/90 break-all max-w-[520px]"
            title={jewel.name}
          >
            {jewel.name}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Architecture synthesis ──────────────────────────────────────────

const CLASS_LABELS = {
  escalation: "escalation",
  data: "data-access",
  identity: "identity",
  forensic: "observed",
  network: "network",
  control: "control",
  misc: "misc",
} as const

// Strip ARN noise from a name when present — "arn:aws:iam::1234:role/foo"
// → "foo". Keep the original when the input doesn't look like an ARN.
function friendlyName(rawName: string | null, id: string): string {
  const candidate = rawName || id
  if (!candidate) return id
  if (candidate.includes(":::")) {
    return candidate.split(":::")[1] || candidate
  }
  if (candidate.startsWith("arn:")) {
    const tail = candidate.split("/").pop()
    if (tail) return tail
  }
  return candidate
}

// Compact byte formatter used in the header subtitle.
function formatBytesShort(n: number): string {
  if (n <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`
}

function shortName(name: string, maxLen = 22): string {
  if (!name) return ""
  if (name.length <= maxLen) return name
  // Middle-truncate so prefix AND suffix stay visible — "SafeRemediate-Test-Frontend-1"
  // becomes "SafeRem…Frontend-1" instead of "SafeRemediate-Tes…" which makes
  // every SafeRemediate-* instance look identical.
  const half = Math.floor((maxLen - 1) / 2)
  return name.slice(0, half) + "…" + name.slice(-(maxLen - half - 1))
}

// Map graph-view node type → TrafficFlowMap lane bucket. The TFM has
// 5 lanes the attacker view will populate:
//   compute            → COMPUTE
//   resource           → RESOURCES (S3, RDS, DynamoDB, KMS, Secret)
//   sg                 → SECURITY GROUPS
//   nacl               → NACLS
//   iam_role           → IAM ROLES (true IAMRoles only)
//   instance_profile   → INSTANCE PROFILES (separate from roles —
//                        AWS's binding object between EC2 and Role.
//                        Previously merged into iam_role which caused
//                        the "IAM ROLES (3)" miscount on Attacker view.
//                        Split 2026-05-22 per audit.)
//   iam_policy         → IAM POLICIES (the actual grant document; IS
//                        the finding for over-permissive paths)
//   subnet             → SUBNETS lane (rendered as decoration column)
function bucketForGraphType(
  type: string,
):
  | "compute"
  | "resource"
  | "sg"
  | "nacl"
  | "iam_role"
  | "instance_profile"
  | "iam_policy"
  | "subnet"
  | "vpc"
  | "principal"
  | "egress_gateway"
  | "network_interface"
  | "ignore" {
  const t = (type || "").toLowerCase()
  if (t.includes("ec2") || t.includes("lambda") || t.includes("ecs") || t.includes("fargate"))
    return "compute"
  if (
    t === "s3bucket" ||
    t === "dynamodbtable" ||
    t === "rdsinstance" ||
    t === "rds" ||
    t === "kmskey" ||
    t === "secret"
  )
    return "resource"
  if (t === "securitygroup") return "sg"
  if (t === "networkacl" || t === "nacl") return "nacl"
  // IAMRole / InstanceProfile / IAMPolicy are THREE different node
  // types with different semantics. Exact-match checks only — the
  // earlier `t.includes("instanceprofile")` was too eager and silently
  // stripped IAMRole nodes from the path on the legacy Attacker View
  // (any node whose serialized type contained that substring fell out
  // of every lane). Per 2026-05-22 hotfix: keep exact-match dispatch
  // and accept the InstanceProfile-count edge case for multi-label
  // nodes (InstanceProfile-bucket lookups can resolve to 0 when the
  // backend surfaces "IAMRole" instead of "InstanceProfile" as
  // node.type — preferable to dropping the entire role from the view).
  if (t === "iamrole" || t === "role") return "iam_role"
  if (t === "instanceprofile") return "instance_profile"
  if (t === "iampolicy") return "iam_policy"
  if (t === "subnet") return "subnet"
  if (t === "vpc") return "vpc"
  if (t === "cloudtrailprincipal" || t === "iamuser" || t === "humanidentity" || t === "awsprincipal" || t.includes("principal"))
    return "principal"
  // Egress gateways — IGW, NAT, EgressOnlyIGW, TransitGateway, VPCEndpoint.
  // VPCEndpoint added 2026-05-29 (path-scoped): AWS most-specific-route
  // routes service-specific traffic (e.g. S3 reads) via the gateway VPCE
  // when one is attached to the path's RT. Surfacing it in the same
  // EGRESS GATEWAYS lane as IGW gives the operator the honest answer for
  // "where do bytes for THIS jewel actually go". The backend already
  // filters VPCEs by service-match against the path target, so anything
  // that reaches here is graph-grounded.
  if (
    t === "internetgateway" ||
    t === "natgateway" ||
    t === "egressonlyinternetgateway" ||
    t === "transitgateway" ||
    t === "vpcendpoint"
  )
    return "egress_gateway"
  // NetworkInterface — the ENI carries the SG attachment and IP. Right
  // now we route it to the compute lane (it acts as a workload-side
  // attachment). Visual distinction TBD; getting it on the canvas
  // matters more than which lane today.
  if (t === "networkinterface" || t === "eni") return "network_interface"
  return "ignore"
}

function buildAttackerArchitecture(
  graph: GraphViewResponse,
  path: IdentityAttackPath,
): SystemArchitecture {
  const computeServices: ServiceNode[] = []
  const resources: ServiceNode[] = []
  const subnets: SubnetNode[] = []
  const securityGroups: SecurityCheckpoint[] = []
  const nacls: SecurityCheckpoint[] = []
  // Identity types are split (2026-05-22 fix). Previously all three
  // were mashed into iamRoles[] which made "IAM ROLES (3)" lie on
  // single-role paths and hid the EC2→InstanceProfile→Role chain.
  // 2026-05-28 — Phase 2 V1 slice 3 (edge semantic states).
  // Classify the underlying graph edge as "AWS-required" (locked,
  // operator can't remove via remediation) vs. "operator-controllable"
  // (the IAM permission / SG rule that drives this flow is scopable).
  //
  // Locked edges represent infrastructure plumbing — removing them
  // isn't the right remediation lever. The renderer paints them
  // static (no animation) so the operator's eye lands on edges with
  // real remediation handles.
  //
  // Generic categorization by relationship type. NOT a service-
  // specific list — every IAM/STS control-plane attachment belongs
  // here regardless of resource type (per
  // feedback_no_hardcoded_demo_service_names).
  const isLockedEdgeType = (t: string | undefined | null): boolean => {
    if (!t) return false
    const T = t.toUpperCase()
    return (
      T === "HAS_INSTANCE_PROFILE" ||
      T === "USES_ROLE" ||
      T === "ASSUMES_ROLE" ||
      T === "ASSUMES_ROLE_ACTUAL" ||
      T === "USED_IDENTITY" ||
      T === "HAS_POLICY"
    )
  }

  const iamRoles: SecurityCheckpoint[] = []
  const instanceProfiles: SecurityCheckpoint[] = []
  const iamPolicies: SecurityCheckpoint[] = []
  const egressGateways: EgressGatewayNode[] = []
  const flows: TrafficFlow[] = []
  // Principals (AWSPrincipal / CloudTrailPrincipal / IAMUser / root) —
  // rendered in their own dedicated lane on the canvas. Previously
  // pushed into computeServices with type:'principal' which made `root`
  // render under the Compute lane heading — a category mistake that
  // suggested root was a workload running on this chain. Per the
  // 2026-05-23 audit feedback: principals are actors, not compute.
  const principals: ServiceNode[] = []
  // VPC tracker — collected during the first pass so we can build the
  // TFM `vpcGroups` payload that drives the existing VPCBoundaries
  // renderer (toggled by the "VPC" checkbox in the header). VPCs were
  // previously dropped via the "ignore" bucket; for a path that goes
  // EC2 → SG → VPC → Subnet → Role the container hop just vanished
  // from the canvas without any indication. Now we surface them.
  const vpcsById = new Map<string, { vpcId: string; vpcName: string }>()

  // Crown jewel ids from the path so we can tag resource cards.
  const crownJewelIds = new Set(
    (path.nodes ?? []).filter((n) => n.tier === "crown_jewel").map((n) => n.id),
  )

  // Dedup key combines (lowercased friendly name, lane bucket) so that
  // a Role and an InstanceProfile sharing a name stay distinct, but
  // dual-label-graph duplicates of the same logical node collapse.
  // The Neo4j graph has each node under multiple ids (full ARN, short
  // id, dual-label Resource/Service) — without canonical dedup the
  // lanes end up with 2-3 cards for the same workload.
  const seen = new Set<string>() // raw ids already added
  const seenByCanonical = new Set<string>() // canonical "name|lane" keys

  const canonicalKey = (name: string | null, id: string, lane: string): string => {
    const fname = friendlyName(name, id).toLowerCase()
    return `${fname}|${lane}`
  }

  const computeSubtype = (type: string): "compute" | "lambda" => {
    return type.toLowerCase().includes("lambda") ? "lambda" : "compute"
  }
  const resourceSubtype = (type: string): "storage" | "database" | "dynamodb" => {
    const t = type.toLowerCase()
    if (t.includes("dynamo")) return "dynamodb"
    if (t.includes("rds") || t.includes("database")) return "database"
    return "storage"
  }

  const addAsCompute = (id: string, type: string, name: string | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "compute")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    computeServices.push({
      id,
      name: display,
      shortName: shortName(display),
      type: computeSubtype(type),
      instanceId: id.startsWith("i-") ? id : id.slice(-12),
    })
  }
  // Principal (CloudTrailPrincipal / AWSPrincipal / IAMUser / HumanIdentity)
  // — the actor making the API call. Pushed into a dedicated
  // `principals[]` array so the TFM canvas can render them in their
  // own leftmost lane.
  //
  // History note: an earlier version pushed principals into
  // `computeServices` with type:'principal'. That fixed the "only the
  // target renders" bug for API-only paths, but introduced a category
  // mistake — `root` rendered under "COMPUTE" which suggested it was
  // a workload on this chain. Per 2026-05-23 audit feedback the lane
  // is now separate so the visual reads correctly: principals are
  // actors, not compute.
  const addAsPrincipal = (id: string, name: string | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "principal")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    principals.push({
      id,
      name: display,
      shortName: shortName(display),
      type: "principal",
      instanceId: id.slice(-12),
    })
  }
  const addAsResource = (id: string, type: string, name: string | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "resource")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    const sub = resourceSubtype(type)
    const node: ServiceNode = {
      id,
      name: display,
      shortName: shortName(display),
      type: sub,
    }
    if (crownJewelIds.has(id)) {
      ;(node as any).isCrownJewel = true
    }
    resources.push(node)
  }
  // True IAMRole only (InstanceProfile is handled by addAsInstanceProfile
  // and IAMPolicy by addAsPolicy — each owns its own array). usedCount /
  // totalCount / gapCount now pipe through from the role node's
  // key_properties (allowed_actions_count / used_actions_count /
  // unused_actions_count) so the IAM Roles lane card shows the real
  // gap story — "1 used / 6 excess" — instead of dashes. This is what
  // makes the Cyntro closure narrative visible on the canvas; the
  // 2026-05-23 audit called the empty IAM Policies lane "the most
  // visible product-value gap right now". With the counts piped here
  // the role's status ring also colour-codes by usage percent (the
  // shared IAMRoleNode logic already had the visual rules; just
  // wasn't getting real data).
  const addAsRole = (
    id: string,
    _type: string,
    name: string | null,
    props?: Record<string, any> | null,
  ) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "iam_role")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    const p = props || {}
    const totalCount = Number(p.allowed_actions_count ?? 0) || 0
    // 2026-05-26 audit fix: trust LIVE evidence over collector scalars.
    // The `used_actions_count` field on cyntro-demo-ec2-s3-role lies
    // (=0) while the role has USES_PERMISSION → s3:GetObject + s3:PutObject
    // and 789K observed ACCESSES_RESOURCE hits. Phase 0 backend stamps
    // `used_actions_count_likely_stale=true` when the scalar is 0 but
    // real hits > 0. Prefer the live count in that case.
    //
    // live_uses_permission_edge_count = COUNT of distinct USES_PERMISSION
    // edges off the role — i.e., distinct actions observed in use.
    // That IS the operator-meaningful "used actions" number.
    const scalarUsed = Number(p.used_actions_count ?? 0) || 0
    const stale = p.used_actions_count_likely_stale === true
    // Canonical edge is :USED_ACTION (per cloudtrail_silver.py gold
    // output). The backend now reads from that edge type — the
    // previous USES_PERMISSION read was a wrong-relationship-name bug
    // caught in the 2026-05-26 audit. Old live_uses_permission_edge_count
    // is read as a fallback for stale Vercel deploys; new code prefers
    // live_used_action_count.
    const liveUsed = Number(
      p.live_used_action_count ??
        p.live_uses_permission_edge_count ??
        0,
    ) || 0
    const usedCount = stale && liveUsed > 0 ? liveUsed : scalarUsed
    // Math invariant: gap = max(0, allowed − used). DO NOT trust the
    // collector's `unused_actions_count` field — at least one writer
    // emits values that don't match. Recompute from the (now honest)
    // usedCount.
    const gapCount = Math.max(0, totalCount - usedCount)
    // 2026-05-26 (Phase 1.7-followup): pipe the live observed-activity
    // evidence through to the role card. Backend now reads :USED_ACTION
    // edges (canonical per cloudtrail_silver.py gold-output schema) and
    // emits live_used_action_count + live_used_action_event_count.
    // ACCESSES_RESOURCE evidence remains as a secondary signal via
    // live_observed_total_hits.
    const liveHits = Number(p.live_observed_total_hits ?? 0) || 0
    const liveResources = Number(p.live_observed_resource_count ?? 0) || 0
    const liveEventCount = Number(p.live_used_action_event_count ?? 0) || 0
    const scalarEdgesDisagree =
      p.used_actions_count_scalar_edges_disagree === true
    iamRoles.push({
      id,
      type: "iam_role",
      name: display,
      shortName: shortName(display),
      usedCount,
      totalCount,
      gapCount,
      connectedSources: [],
      connectedTargets: [],
      ...(liveHits > 0
        ? {
            liveObservedTotalHits: liveHits,
            liveObservedResourceCount: liveResources,
          }
        : {}),
      ...(liveEventCount > 0
        ? { liveUsedActionEventCount: liveEventCount }
        : {}),
      ...(scalarEdgesDisagree ? { usageScalarEdgesDisagree: true } : {}),
    })
  }
  // InstanceProfile — AWS's binding object that wires an EC2 instance
  // to an IAM role. Semantically distinct from a role; previously
  // collapsed into iamRoles which produced the wrong "IAM ROLES (3)"
  // count for a single-role path. The InstanceProfile typically shares
  // its name with the role it points at (alon-prod convention), so the
  // canonical key includes the "instance_profile" lane discriminator
  // to keep them as separate cards.
  const addAsInstanceProfile = (id: string, name: string | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "instance_profile")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    instanceProfiles.push({
      // Keep `type: "iam_role"` on the checkpoint so existing
      // SecurityCheckpoint consumers (status color, drilldown) still
      // work — the distinction is encoded by which array the node
      // lands in, not by the type discriminator. We can introduce a
      // dedicated 'instance_profile' type on SecurityCheckpoint in a
      // follow-up if the rendering needs to diverge further.
      id,
      type: "iam_role",
      name: display,
      shortName: shortName(display),
      usedCount: 0,
      totalCount: 0,
      gapCount: 0,
      connectedSources: [],
      connectedTargets: [],
    })
  }
  // SG populates totalCount from the graph node's rule counters. Per
  // 2026-05-22 audit the panel was initializing all SGs with
  // totalCount=0 which made TFM render "0 rules" even on the
  // saferemediate-test-app-sg (real rules in Neo4j). Now we pipe:
  //   - total_rules  (preferred — single canonical scalar set by the
  //                   security_group_collector)
  //   - inbound_rule_count + outbound_rule_count (fallback for older
  //                   collector versions that hadn't materialized
  //                   total_rules yet)
  //   - inbound_rules.length + outbound_rules.length (last-resort
  //                   fallback from the raw rule arrays)
  // gapCount uses unused_rules_count when present (rules with no
  // observed traffic match) — that's the "configured-but-unused"
  // signal the operator can act on.
  const addAsSG = (
    id: string,
    name: string | null,
    props?: Record<string, any> | null,
    onPath?: boolean,
  ) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "sg")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    const p = props || {}
    const inboundCount = Number(p.inbound_rule_count ?? 0) || 0
    const outboundCount = Number(p.outbound_rule_count ?? 0) || 0
    const inboundArr = Array.isArray(p.inbound_rules) ? p.inbound_rules.length : 0
    const outboundArr = Array.isArray(p.outbound_rules) ? p.outbound_rules.length : 0
    // Fallback chain — prefer scalar total_rules, fall back to summed
    // count fields, then to array-length fallback. Don't use ??-chains
    // here: the intermediate sums are always numbers (never nullish),
    // so the chain collapses to the first non-null and skips the
    // fallbacks. Plain `||` on zero gives the right effect.
    let totalCount = Number(p.total_rules ?? 0) || 0
    if (totalCount === 0) totalCount = inboundCount + outboundCount
    if (totalCount === 0) totalCount = inboundArr + outboundArr
    const gapCount = Number(p.unused_rules_count ?? 0) || 0
    const usedCount = totalCount > 0 ? Math.max(0, totalCount - gapCount) : 0
    // Surface the collector's authoritative "this SG accepts inbound
    // 0.0.0.0/0" flag. The renderer uses it to badge SGs that are
    // public when rules[] isn't passed (lateral SGs carry counters +
    // flags but not the raw rule array). 2026-05-25 user feedback:
    // a DB SG with public_ingress was rendering plain because the
    // chip only inspected rules[].isPublic — and lateral chips have
    // no rules[]. Reading the flag bridges that gap.
    const hasPublicIngress =
      p.has_public_ingress === true || p.has_public_inbound === true
    securityGroups.push({
      id,
      type: "security_group",
      name: display,
      shortName: shortName(display),
      usedCount,
      totalCount,
      gapCount,
      connectedSources: [],
      connectedTargets: [],
      hasPublicIngress,
      // onPath defaults to undefined (back-compat for callers that
      // don't supply the signal — chip falls back to "treat as on-
      // path"). Explicit false dims the chip + adds the LATERAL badge.
      ...(onPath === false ? { onPath: false } : onPath === true ? { onPath: true } : {}),
    })
  }
  // NACL populates totalCount from rule counters on the graph node.
  // Per 2026-05-22 audit the panel rendered "NACLs (1) · 0 affected"
  // even when the subnet was associated and the NACL had rules. The
  // "0 affected" label comes from totalCount=0 (TFM checks blastRadius
  // from these scalars). Source fields on :NACL nodes:
  //   - total_rules (preferred)
  //   - inbound_rule_count + outbound_rule_count (fallback)
  //   - inbound_rules.length + outbound_rules.length (last-resort)
  // gapCount uses inbound_deny_count + outbound_deny_count when
  // present — explicit denies are the high-signal rules an operator
  // should know about.
  const addAsNACL = (
    id: string,
    name: string | null,
    props?: Record<string, any> | null,
    onPath?: boolean,
  ) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "nacl")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    const p = props || {}
    const inboundCount = Number(p.inbound_rule_count ?? 0) || 0
    const outboundCount = Number(p.outbound_rule_count ?? 0) || 0
    // 2026-05-24 data-quirk fix: inbound_rules / outbound_rules come
    // back from Neo4j as JSON-encoded STRINGS (not arrays) on some
    // collector versions. Array.isArray() returned false, so the
    // previous fallback never fired even on NACLs with real rule
    // data. Parse the string defensively so the last-resort path
    // doesn't silently no-op. (`total_rules` scalar is preferred
    // when present, which it is on the current collector — this is
    // belt-and-suspenders against older/inconsistent writers.)
    const rulesArrayLength = (val: any): number => {
      if (Array.isArray(val)) return val.length
      if (typeof val === "string" && val.length > 0) {
        try {
          const parsed = JSON.parse(val)
          return Array.isArray(parsed) ? parsed.length : 0
        } catch {
          return 0
        }
      }
      return 0
    }
    const inboundArr = rulesArrayLength(p.inbound_rules)
    const outboundArr = rulesArrayLength(p.outbound_rules)
    // Same fallback chain pattern as addAsSG — see comment there.
    let totalCount = Number(p.total_rules ?? 0) || 0
    if (totalCount === 0) totalCount = inboundCount + outboundCount
    if (totalCount === 0) totalCount = inboundArr + outboundArr
    const denyCount = Number(p.inbound_deny_count ?? 0) + Number(p.outbound_deny_count ?? 0)
    const gapCount = denyCount || 0
    const usedCount = totalCount > 0 ? Math.max(0, totalCount - gapCount) : 0
    // subnet_count — number of subnets this NACL applies to. Drives
    // the "M subnets" pill on the NACL card so the operator sees the
    // blast surface; the previous "0 affected" label was always 0 on
    // NACLs with only allow rules.
    const subnetCount = Number(p.subnet_count ?? 0) || 0
    // 2026-05-25 user feedback: surface the NACL's risk flags so the
    // chip can render "Default · No filtering" (AWS default NACL is
    // 0.0.0.0/0 ALLOW ALL on both directions) and "High risk" badges.
    // Reads from the collector-written booleans on the NetworkACL
    // node. With these populated on lateral NACLs (via the graph-view
    // security-critical enrichment pass, commit 80fd29e on backend),
    // a default-public NACL no longer renders as a plain "2 rules"
    // chip — it screams "Default · No filtering" in red.
    const isDefault = p.is_default === true
    const hasHighRisk = p.has_high_risk === true
    const hasPublicInboundAllow = p.has_public_inbound_allow === true
    const naclEntry: SecurityCheckpoint = {
      id,
      type: "nacl",
      name: display,
      shortName: shortName(display),
      usedCount,
      totalCount,
      gapCount,
      connectedSources: [],
      connectedTargets: [],
      isDefault,
      hasHighRisk,
      hasPublicInboundAllow,
    }
    if (subnetCount > 0) {
      naclEntry.subnetCount = subnetCount
    }
    // onPath: explicit boolean only when caller supplied it (so chips
    // without the signal stay full-brightness as back-compat).
    if (onPath === true || onPath === false) {
      naclEntry.onPath = onPath
    }
    nacls.push(naclEntry)
  }
  // IAMPolicy — the actual permission grant document, IS the finding
  // for over-permissive paths (e.g. S3OverPermissiveAccess on
  // alon-prod). Promoted from "🤝 emoji-prefixed card in iamRoles lane"
  // to its own iamPolicies array per 2026-05-22 fix. No name prefix
  // needed now that they have their own lane and aren't competing for
  // visual space with role cards.
  //
  // totalCount = permission_count (the number of distinct actions the
  // policy grants) when present on the graph node. gapCount = unused
  // permissions when we can compute them (currently we can't from the
  // graph-view payload alone — would need to join against the role's
  // observed actions). usedCount falls out the same way.
  const addAsPolicy = (id: string, name: string | null, props?: Record<string, any> | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "iam_policy")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    const p = props || {}
    const totalCount = Number(p.permission_count ?? 0) || 0
    iamPolicies.push({
      id,
      type: "iam_role", // keep existing checkpoint discriminator —
                       // SecurityCheckpoint.type doesn't yet have an
                       // 'iam_policy' variant; the distinction is
                       // encoded by being in iamPolicies[]
      name: display,
      shortName: shortName(display),
      usedCount: 0,
      totalCount,
      gapCount: 0,
      connectedSources: [],
      connectedTargets: [],
    })
  }

  // Egress gateway (IGW / NAT / EgressOnlyIGW / TransitGateway) →
  // egressGateways lane. The TFM already renders this lane (chip
  // item 10 from the topology work); we just need to populate it.
  const addAsEgressGateway = (
    id: string,
    name: string | null,
    gatewayType: string,
    vpcId: string | null,
    serviceName?: string | null,
  ) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "egress_gateway")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    // Map graph node-type → EgressGatewayNode.kind. Includes VPCEndpoint
    // (2026-05-29 — gateway VPCEs are egress gateways too, mirroring AWS
    // most-specific-route behavior). When the graph gives us an
    // unexpected string, default to InternetGateway — safer fallback
    // since most laterals we'd surface here historically were IGWs.
    const t = (gatewayType || "").toLowerCase()
    const kind: EgressGatewayNode["kind"] =
      t === "natgateway"
        ? "NATGateway"
        : t === "egressonlyinternetgateway"
          ? "EgressOnlyInternetGateway"
          : t === "transitgateway"
            ? "TransitGateway"
            : t === "vpcendpoint"
              ? "VPCEndpoint"
              : "InternetGateway"
    // For VPCEs, surface the service token ("s3", "dynamodb", etc.)
    // as the chip label so the operator can distinguish "VPCE · s3"
    // from "VPCE · dynamodb" when an account has multiple gateway
    // endpoints. service_name format: 'com.amazonaws.<region>.<service>'.
    const svcToken = (serviceName || "")
      .toLowerCase()
      .split(".")
      .pop() || ""
    const kindLabel: Record<EgressGatewayNode["kind"], string> = {
      InternetGateway: "IGW",
      NATGateway: "NAT GW",
      EgressOnlyInternetGateway: "Egress-only IGW",
      TransitGateway: "Transit GW",
      VPCEndpoint: svcToken ? `VPCE · ${svcToken}` : "VPCE",
    }
    egressGateways.push({
      id,
      name: display,
      shortName: shortName(display),
      vpcId,
      kind,
      kindLabel: kindLabel[kind],
      serviceHint: kind === "VPCEndpoint" ? svcToken || undefined : undefined,
    })
  }

  // NetworkInterface (ENI) — folded into its parent EC2 / workload as
  // a chip on the existing Compute card. Previously rendered as a
  // separate "ENI eni-…" Compute row, which the 2026-05-23 audit
  // flagged as visual clutter (the ENI is conceptually part of the
  // workload, not a peer compute resource). When parentComputeId is
  // omitted (e.g. orphan ENI surfaced via a Subnet path-node), fall
  // back to attaching to the first available compute on the path so
  // the ENI is visible somewhere; if no compute exists at all, skip.
  const addAsNetworkInterface = (id: string, name: string | null, parentComputeId?: string) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "network_interface")
    if (seenByCanonical.has(canon)) return
    const parent =
      (parentComputeId
        ? computeServices.find((c) => c.id === parentComputeId)
        : undefined) ?? computeServices[0]
    if (!parent) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    const enis = parent.enis ?? (parent.enis = [])
    if (!enis.some((e) => e.id === id)) {
      enis.push({ id, name: display, shortName: shortName(display) })
    }
  }

  // VPC — render via TFM's VPCBoundaries by populating vpcGroups (built
  // at the end). Path nodes that match the VPC bucket land here; they
  // also seed seen/seenByCanonical so flow synthesis treats them as
  // legit endpoints (USES_VPC / IN_VPC config edges are filtered out
  // separately so they don't draw an extra line, but the visual
  // container box is what the operator actually wants here).
  const addAsVPC = (id: string, name: string | null) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "vpc")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    vpcsById.set(id, { vpcId: id, vpcName: display })
  }
  const addAsSubnet = (
    id: string,
    name: string | null,
    vpcId: string | null,
    isPublic: boolean | null,
    rt?: { id?: string | null; count?: number | null; isMain?: boolean | null } | null,
  ) => {
    if (seen.has(id)) return
    const canon = canonicalKey(name, id, "subnet")
    if (seenByCanonical.has(canon)) return
    seen.add(id)
    seenByCanonical.add(canon)
    const display = friendlyName(name, id)
    // shortName is what the TFM SubnetNode card renders as the
    // identifier — without it, the card shows ONLY the
    // Public/Private/Unknown posture chip and no name. v1.2 omitted
    // this field, which is why every subnet read as just "Private"
    // in the previous screenshot.
    subnets.push({
      id,
      name: display,
      shortName: shortName(display),
      // Preserve null three-state (Public / Private / Unknown). Coercing
      // to boolean lost the "Unknown" state when subnet_is_public is
      // unclassified — per the earlier credibility audit.
      isPublic,
      vpcId: vpcId || undefined,
      connectedComputeIds: [],
      // Route-table chip metadata (backend feat 9bc86f9). All optional —
      // older backends without the RouteTable enrichment will simply
      // skip the chip rather than render blanks.
      routeTableId: rt?.id || undefined,
      routeTableCount:
        typeof rt?.count === "number" && rt.count > 0 ? rt.count : undefined,
      routeTableIsMain: rt?.isMain === true ? true : undefined,
    })
  }

  // On-path SG / NACL detection.
  //
  // A SecurityGroup is "on-path" if the path's compute is SECURED_BY
  // it (real graph edge from a path node). A NACL is "on-path" if a
  // path subnet ASSOCIATED_WITH it. Lateral SGs/NACLs are in the
  // same VPC but lack that direct edge — they're pivot surface, not
  // gates on this chain.
  //
  // Pre-pass over laterals_by_node before the lane-population loop:
  // any SG that appears as a neighbor under a SECURED_BY (or alias)
  // edge from ANY path node id gets marked on-path. Same for NACLs
  // with ASSOCIATED_WITH / HAS_NACL. Everything else stays undefined
  // and the chip falls back to "treat as on-path" — the SG/NACL
  // helpers below pass the explicit boolean only when the pre-pass
  // saw a real edge, so callers without the signal aren't penalized.
  //
  // 2026-05-26 user feedback: "why is there no traffic through
  // default / three-tier-lambda-sg?" — those are lateral SGs that
  // got pulled into the lane via VPC-membership enrichment (commit
  // 80fd29e) but have no SECURED_BY edge to the path's EC2.
  // Treating all 5 SGs as visually equal made the operator hunt
  // for the actual gate; dimming the 4 lateral ones surfaces the
  // one true gate at a glance.
  const SG_ATTACH_EDGES = new Set([
    "SECURED_BY",
    "HAS_SECURITY_GROUP",
    "USES_SECURITY_GROUP",
  ])
  const NACL_ATTACH_EDGES = new Set([
    "ASSOCIATED_WITH",
    "HAS_NACL",
  ])
  const onPathSgIds = new Set<string>()
  const onPathNaclIds = new Set<string>()
  for (const [, edges] of Object.entries(graph.laterals_by_node)) {
    for (const e of edges) {
      const neighborId = e.neighbor_id
      if (!neighborId) continue
      const t = (e.type || "").toUpperCase()
      if (SG_ATTACH_EDGES.has(t)) {
        onPathSgIds.add(neighborId)
      } else if (NACL_ATTACH_EDGES.has(t)) {
        onPathNaclIds.add(neighborId)
      }
    }
  }

  // First pass — add every path node to its canonical lane.
  // SG / NACL / IAMPolicy helpers now receive key_properties so
  // totalCount / gapCount / rule arrays come from real graph data
  // (fix for the "0 rules" / "0 affected" / "permission_count missing"
  // class of credibility bugs).
  for (const node of graph.nodes) {
    const bucket = bucketForGraphType(node.type)
    const props = (node.key_properties as Record<string, any> | undefined) ?? null
    if (bucket === "compute") addAsCompute(node.id, node.type, node.name)
    else if (bucket === "resource") addAsResource(node.id, node.type, node.name)
    else if (bucket === "iam_role") addAsRole(node.id, node.type, node.name, props)
    else if (bucket === "instance_profile") addAsInstanceProfile(node.id, node.name)
    else if (bucket === "iam_policy") addAsPolicy(node.id, node.name, props)
    else if (bucket === "sg") addAsSG(node.id, node.name, props, onPathSgIds.has(node.id))
    else if (bucket === "nacl") addAsNACL(node.id, node.name, props, onPathNaclIds.has(node.id))
    else if (bucket === "principal") addAsPrincipal(node.id, node.name)
    else if (bucket === "vpc") addAsVPC(node.id, node.name)
    else if (bucket === "egress_gateway") {
      const vpcId = props?.vpc_id ?? null
      // service_name is set for VPCEndpoint nodes
      // ('com.amazonaws.<region>.<service>') by attack_chain_view.py's
      // SEC_CRITICAL_LABELS enrichment pass; unused for IGW/NAT.
      const serviceName = (props?.service_name as string | undefined) ?? null
      addAsEgressGateway(node.id, node.name, node.type, vpcId, serviceName)
    } else if (bucket === "network_interface") {
      addAsNetworkInterface(node.id, node.name)
    } else if (bucket === "subnet") {
      const vpcId = props?.vpc_id ?? null
      // Subnet is_public has three collector-side property names in
      // flight: `public` (canonical, written by
      // subnet_visibility_collector), `subnet_is_public` (legacy
      // CSPM ingest), `is_public` (older wrapper). Read all three
      // with `public` winning so the card stops rendering "Unknown"
      // when the visibility collector has already classified the
      // route table.
      const isPub =
        props?.public ??
        props?.subnet_is_public ??
        props?.is_public ??
        null
      // Route-table metadata — backend graph-view joins RouteTable
      // and injects route_table_route_count / route_table_is_main on
      // the Subnet's key_properties (feat 9bc86f9). Falls back to
      // just the route_table_id when count isn't surfaced.
      const rt = {
        id: (props?.route_table_id as string | undefined) ?? null,
        count: (props?.route_table_route_count as number | undefined) ?? null,
        isMain: (props?.route_table_is_main as boolean | undefined) ?? null,
      }
      addAsSubnet(node.id, node.name, vpcId, isPub, rt)
    }
    // 'ignore' — bucket didn't match a node type we render in any lane.
  }

  // Slice 9.5 — distinguish PATH INFRASTRUCTURE from LATERAL PIVOTS.
  //
  // 9.4 stripped EVERY lateral. That was over-correction: it also
  // removed NACL / IGW / ENI / Policy, which aren't "what else this
  // role could do" — they're the actual network/identity controls
  // ATTACHED to path nodes, modeled as decoration edges in Neo4j
  // rather than as BFS hops.
  //
  // The honest rule:
  //   Path infrastructure (attached to a path node) → INCLUDE
  //     - NACL associated with the path's subnet
  //     - IGW/NAT the path's subnet routes through
  //     - ENI on the path's EC2
  //     - IAMPolicy attached to the path's role
  //   Lateral pivots (siblings/alternatives reachable from a path
  //   node but unrelated to THIS attack) → SKIP
  //     - Other roles the path role can ASSUME_ROLE into
  //     - Other resources the path role can ACCESSES_RESOURCE
  //     - Other workloads sharing the path role via USES_ROLE
  //     - Other accessors of the crown jewel
  // Operators who want the full pivot fan-out switch to Exposure view.
  // Path-infrastructure rule — RESTRICTED to attachments of the
  // CORRECT path-node type. The 2026-05-22 over-include bug: we were
  // adding every ENI lateral of every path node, including the SG's
  // reverse-associations (5 ENIs from sibling workloads sharing the
  // SG). Result: 6 ENI cards in Compute lane for what should be 1.
  //
  // Rule per neighbor type — only add when the SOURCE path node is
  // the natural carrier:
  //   ENI         → only when path node is a workload (EC2 / Lambda)
  //   NACL        → only when path node is a Subnet
  //   IGW/NAT     → only when path node is a Subnet or VPC
  //   IAMPolicy   → only when path node is an IAMRole
  //
  // Skip every other ENI / NACL / IGW reference (those are siblings
  // discovered via SG fan-out etc).
  const pathNodeTypeByKey = new Map<string, string>()
  for (const node of graph.nodes) {
    pathNodeTypeByKey.set(node.id, bucketForGraphType(node.type))
  }

  // Pre-compute the set of InstanceProfile ids that the path's IAMRole
  // ACTUALLY routes through. Read incoming USES_ROLE laterals on each
  // path role; any IP that appears there is a real on-chain hop.
  //
  // Background (2026-05-24 user report): when an EC2 has both a
  // HAS_INSTANCE_PROFILE edge (its static AWS config) AND a direct
  // USES_ROLE edge to a different role (CloudTrail-observed via STS
  // AssumeRole), the BFS picks the CloudTrail role (because that's
  // the one with ACCESSES_RESOURCE → jewel). The InstanceProfile's
  // USES_ROLE target is the *other* role, not the one on the path,
  // so adding it as a lateral produced an orphan card with no flow
  // line — the IP lane card rendered but couldn't be wired through
  // (its role isn't on the chain, and the TFM has no flow checkpoint
  // for InstanceProfile anyway).
  //
  // Filter: only add the IP if it directly USES_ROLE → a path role.
  // Otherwise it's a sibling attachment that belongs in System Detail
  // or Per-Path view, not the Attacker chain.
  const ipsOnPathChain = new Set<string>()
  for (const role of iamRoles) {
    const roleLaterals = graph.laterals_by_node[role.id] || []
    for (const e of roleLaterals) {
      if (
        e.direction === "in" &&
        e.type === "USES_ROLE" &&
        bucketForGraphType(e.neighbor_type) === "instance_profile"
      ) {
        ipsOnPathChain.add(e.neighbor_id)
      }
    }
  }

  // Dedupe flow synthesis — same edge can appear from both this
  // loop's on_path branch AND the path.edges loop below. Without a
  // key set we doubled the role→jewel flow's hit count (the
  // 1,579,582 connections bug).
  const flowKeys = new Set<string>()

  // 2026-05-25 (Phase 2 — explicit-edges refactor): the previous
  // `pathCheckpoints` object (getter-backed sgId/naclId/instanceProfileId/
  // roleId/egressGatewayId) was the source of the cross-plane drawing
  // bug — every synthesized flow routed its polyline through this
  // single bundle, which mixed identity-plane (Role, InstanceProfile)
  // checkpoints with network-plane (SG, NACL, IGW) checkpoints, then
  // drew them as a single continuous SVG path implying a serial
  // dependency. That implication was false — identity-plane and
  // network-plane are parallel pre-conditions, not steps.
  //
  // The new rendering contract (TrafficFlowMap `architecture.edges`)
  // takes one line per real graph edge, tagged with its plane, and
  // colors / animates by plane. We build the edges array below from
  // path.edges + graph.laterals_by_node directly. Routing through
  // bundled checkpoints is no longer needed.
  //
  // See feedback_test_both_sides_of_a_partition.md for the failure
  // mode that this fixes.

  // Branch A flows are deferred — synthesized AFTER the lateral loop
  // completes so that lateral-added checkpoints (IGW, etc.) populated
  // during the loop are available when the flow's egressGatewayId
  // getter resolves. Capturing during the loop would freeze the
  // getter against an incomplete egressGateways[] (depends on which
  // path node iterates first), which produced the 2026-05-23 audit's
  // "orphan IGW with 771 KB observed bytes" bug.
  const pendingOnPathFlows: Array<{
    sourceId: string
    targetId: string
    edge: GraphViewEdge
  }> = []

  for (const [pathNodeId, edges] of Object.entries(graph.laterals_by_node)) {
    const pathNodeBucket = pathNodeTypeByKey.get(pathNodeId)
    for (const e of edges) {
      const neighborId = e.neighbor_id
      if (!neighborId) continue

      // Branch A — edge between two path nodes (on_path=true). The
      // inter-hop observed-traffic edges that animate the chain.
      // Deferred: defer flow synthesis until after the lateral loop
      // (see pendingOnPathFlows above for rationale).
      if (e.on_path) {
        const hits = e.hit_count ?? 0
        const bytes = e.bytes ?? 0
        if (hits === 0 && bytes === 0 && !e.observed) continue
        if (!seen.has(neighborId)) continue
        const sourceId = e.direction === "out" ? pathNodeId : neighborId
        const targetId = e.direction === "out" ? neighborId : pathNodeId
        pendingOnPathFlows.push({ sourceId, targetId, edge: e })
        continue
      }

      // Branch B — true lateral. Only add when this neighbor is the
      // natural infrastructure attachment of the path node type.
      const neighborBucket = bucketForGraphType(e.neighbor_type)
      if (neighborBucket === "network_interface") {
        if (pathNodeBucket === "compute") {
          // Pass the path node id so the ENI attaches to THAT compute
          // card (rather than the first compute by accident on
          // multi-EC2 paths).
          addAsNetworkInterface(neighborId, e.neighbor_name, pathNodeId)
        }
        // ENI lateral on a non-workload path node (SG / Subnet / VPC)
        // — those are sibling-workload ENIs, skip.
        continue
      }
      if (neighborBucket === "nacl") {
        if (pathNodeBucket === "subnet") {
          // Lateral fallback. Typically no-ops because the on-path
          // NACL is added via the graph.nodes loop above (seen.has
          // short-circuits the helper). Passing onPath here in case
          // the lateral fallback is the only path that fires.
          addAsNACL(neighborId, e.neighbor_name, null, onPathNaclIds.has(neighborId))
        }
        continue
      }
      if (neighborBucket === "egress_gateway") {
        if (pathNodeBucket === "subnet" || pathNodeBucket === "ignore") {
          // VPC nodes bucket as 'ignore' currently (no VPC lane in
          // TFM). Subnet ROUTES_VIA → IGW or VPCE is the canonical edge.
          // service_name comes through on the neighbor node when it's
          // enriched server-side (the backend's SEC_CRITICAL_LABELS
          // path puts VPCEndpoint properties on graph.nodes); the
          // lateral edge itself doesn't carry it, so we look up the
          // enriched node from graph.nodes and pull service_name there.
          const enrichedNode = graph.nodes.find((n) => n.id === neighborId)
          const svcName =
            (enrichedNode?.key_properties as Record<string, any> | undefined)
              ?.service_name ?? null
          addAsEgressGateway(neighborId, e.neighbor_name, e.neighbor_type, null, svcName)
        }
        continue
      }
      if (neighborBucket === "iam_policy") {
        if (pathNodeBucket === "iam_role" || pathNodeBucket === "principal") {
          // Principal → IAMPolicy is the natural attachment too (an
          // IAMUser carries inline/attached policies directly, no role
          // hop). Surfacing it tells the operator WHICH grant document
          // authorized the observed API call.
          addAsPolicy(neighborId, e.neighbor_name)
        }
        continue
      }
      if (neighborBucket === "iam_role") {
        if (pathNodeBucket === "principal") {
          // Principal → IAMRole is path infrastructure for assumed-role
          // sessions: the CloudTrailPrincipal is a session, the role is
          // what gave it permissions. Without the role card the operator
          // sees only "<session> accessed <bucket>" with no answer to
          // "which role's permissions made this possible?" — exactly the
          // E2E context the user complained was missing. Sibling roles
          // (assume-role chains the path didn't take) still skip via the
          // default branch at the bottom.
          addAsRole(neighborId, e.neighbor_type, e.neighbor_name)
        }
        continue
      }
      if (neighborBucket === "instance_profile") {
        // Only add when (a) the path node is a compute (natural
        // carrier) AND (b) the IP actually USES_ROLE → a role on the
        // path. The second gate prevents the orphan-card class of
        // bug: an EC2 may carry HAS_INSTANCE_PROFILE → IP whose role
        // is NOT the one on this attack chain (see ipsOnPathChain
        // precompute above for full context).
        if (pathNodeBucket === "compute" && ipsOnPathChain.has(neighborId)) {
          addAsInstanceProfile(neighborId, e.neighbor_name)
        }
        continue
      }
      if (neighborBucket === "vpc") {
        // Phase 1.2 (2026-05-26): synthesize the VPC entry from
        // lateral edges so VPCBoundaries always has a named boundary
        // to render. The VPC node is rarely included in the path's
        // node_ids by upstream IAP (the chain is workload→subnet→
        // role→jewel, no VPC hop). Without this branch, vpcsById is
        // empty and the dashed boundary doesn't render — the operator
        // sees the path floating in the canvas with no container
        // context. IN_VPC / RUNS_IN_VPC laterals on Compute/Subnet
        // carry neighbor_name (e.g. "Payment-Production-VPC"), which
        // is exactly what we need for the label.
        if (pathNodeBucket === "compute" || pathNodeBucket === "subnet") {
          addAsVPC(neighborId, e.neighbor_name)
        }
        continue
      }
      // Otherwise: lateral pivot (sibling role / other bucket / etc).
      // Skip — Exposure view handles the full fan-out.
    }
  }

  // Drain the deferred on-path flows now that the lateral loop has
  // finished populating egressGateways / instanceProfiles / etc. The
  // pathCheckpoints getters resolve against the final state of each
  // array, so flow.egressGatewayId is now correctly set to the IGW
  // that lateral processing added during the loop.
  for (const { sourceId, targetId, edge: e } of pendingOnPathFlows) {
    const key = `${sourceId}->${targetId}`
    if (flowKeys.has(key)) continue
    flowKeys.add(key)
    const hits = e.hit_count ?? 0
    const bytes = e.bytes ?? 0
    flows.push({
      sourceId,
      targetId,
      // 2026-05-25 (Phase 2 explicit-edges refactor): checkpoint-bundle
      // fields (sgId/naclId/instanceProfileId/roleId/egressGatewayId)
      // are intentionally NOT populated. The renderer now consumes
      // `architecture.edges[]` (built below) and draws one line per
      // graph edge tagged with its plane. Routing one synthesized flow
      // through both Role (identity) AND IGW (network) on one polyline
      // was the cross-plane drawing bug the audit caught. Flow stays
      // for backward-compat header math (totalBytes / totalConnections).
      ports: e.port ? [String(e.port)] : [],
      protocol: e.protocol || (e.type.includes("S3") ? "s3" : "tcp"),
      bytes,
      connections: hits || 1,
      isActive: !!e.observed || hits > 0 || bytes > 0,
      // 2026-05-28 — carry forensic provenance through to TFM's
      // hover detail panel. ISO timestamps from the live graph edge.
      firstSeen: (e as any).first_seen ?? null,
      lastSeen: (e as any).last_seen ?? null,
      // 2026-05-28 — Phase 2 V1 slice 3 (edge semantic states).
      // Flag AWS-required relationships as locked so the renderer
      // can paint them as observed-static (slate, no animation)
      // rather than observed-animated (which implies "removable").
      isLocked: isLockedEdgeType(e.type),
    })
  }

  // Path edges — add as the primary flows (these are the chain).
  // Source/target must already be in seen for the TFM to render the
  // line between them. Most path edges are config-only (USES_ROLE,
  // SECURED_BY, IN_SUBNET) so they don't create new flow lines;
  // only the observed data-bearing edges do.
  //
  // 2026-05-22 fix: also keep edges with hit_count > 0. The IAP
  // backend's role→S3 ACCESSES_RESOURCE edge often carries
  // hit_count (CloudTrail action count) without populating
  // traffic_bytes — pre-fix we lost these flows entirely.
  for (const edge of path.edges ?? []) {
    if (!seen.has(edge.source) || !seen.has(edge.target)) continue
    const observed = edge.is_observed ?? false
    const bytes = edge.traffic_bytes ?? 0
    const hits = edge.hit_count ?? 0
    if (!observed && bytes === 0 && hits === 0) continue
    const t = (edge.type || "").toUpperCase()
    if (
      t === "USES_ROLE" ||
      t === "SECURED_BY" ||
      t === "USES_SECURITY_GROUP" ||
      t === "IN_SUBNET" ||
      t === "IN_VPC" ||
      t === "RUNS_IN_VPC" ||
      t === "HAS_INSTANCE_PROFILE" ||
      t === "HAS_POLICY" ||
      t === "ASSUMES_ROLE"
    )
      continue
    // Dedupe — same flow may also be in the lateral loop's on_path
    // branch. Without this guard the role→jewel observed flow showed
    // up twice (1,579,582 connections bug from the 2026-05-22 audit).
    const flowKey = `${edge.source}->${edge.target}`
    if (flowKeys.has(flowKey)) continue
    flowKeys.add(flowKey)
    flows.push({
      sourceId: edge.source,
      targetId: edge.target,
      // 2026-05-25: checkpoint fields removed — see Branch A note.
      // Rendering now driven by `architecture.edges[]` (built below).
      ports: edge.port ? [String(edge.port)] : [],
      protocol: edge.protocol || (t.includes("S3") ? "s3" : "tcp"),
      bytes,
      connections: edge.hit_count ?? 1,
      isActive: observed,
      // 2026-05-28 — forensic provenance from the path edge.
      firstSeen: (edge as any).first_seen ?? null,
      lastSeen: (edge as any).last_seen ?? null,
      // 2026-05-28 — Phase 2 V1 slice 3 (edge semantic states).
      isLocked: isLockedEdgeType(edge.type),
    })
  }

  // ─── Chain-completion flows ──────────────────────────────────────
  //
  // If we have a compute workload OR a principal AND a crown-jewel
  // resource on the path but NO synthesized observed flow between
  // them yet (because the BFS only emitted role→S3 with traffic, not
  // compute→S3), add a chain-completing flow so the line draws
  // source → SG → NACL → role → resource visually. Marked
  // isActive=false (dimmed gray) since it's a CONFIGURED relationship,
  // not observed traffic. Principals are included as sources now that
  // they're in their own lane — without this the principal lane
  // would render as a card with no outgoing line on direct-access
  // paths (root → S3 etc.) when the BFS edge filter dropped the
  // observed terminal edge for any reason.
  const pathComputes = computeServices.filter((c) => !c.name.startsWith("ENI "))
  const pathSources = [...pathComputes, ...principals]
  const pathResources = resources
  for (const source of pathSources) {
    for (const resource of pathResources) {
      const key = `${source.id}->${resource.id}`
      if (flowKeys.has(key)) continue
      flowKeys.add(key)
      flows.push({
        sourceId: source.id,
        targetId: resource.id,
        // 2026-05-25: checkpoint fields removed. Chain-completion is
        // now expressed via the real graph edges in `architecture.edges[]`
        // (the path's HAS_INSTANCE_PROFILE → USES_ROLE → HAS_POLICY →
        // ACCESSES_RESOURCE sequence). If no such graph edge exists,
        // no line is drawn — invented "configured chain" lines were
        // the source of the cross-plane visual bug.
        ports: [],
        protocol: "configured",
        bytes: 0,
        connections: 0,
        isActive: false,
      })
    }
  }

  // ─── vpcGroups assembly ──────────────────────────────────────────
  //
  // TFM's VPCBoundaries draws bounding boxes from this payload (gated
  // by the "VPC" toggle in the header). For each VPC node on the path
  // we group: its subnets (matched via subnet.vpcId) and a per-subnet
  // anchor set used to compute the bounding box.
  //
  // What MUST be in the anchor set (genuinely VPC-scoped — these are
  // the 6 in-VPC node types from the architecture writeup):
  //   - Compute (EC2 / Lambda living in the subnet)
  //   - Subnet card itself
  //   - Security Groups (VPC-scoped)
  //   - NACLs (subnet-scoped, so VPC-scoped)
  //   - (ENI + RouteTable are folded into compute / subnet cards as
  //     chips, not separate cards — anchoring the parents covers them)
  //
  // What's INTENTIONALLY excluded (and was the source of the prior
  // "VPC box engulfs S3" bug):
  //   - IAMRoles (IAM service, GLOBAL)
  //   - InstanceProfiles (IAM service, GLOBAL)
  //   - IAMPolicies (IAM service, GLOBAL)
  //   - Resources (S3/DynamoDB/KMS — global services; in-VPC RDS would
  //     anchor via IN_SUBNET on the rare path that has it)
  //   - EgressGateways (IGW/NAT — they ATTACH to a VPC but the canvas
  //     lays them out in row 2 next to RESOURCES; if anchored, the
  //     box stretches down and engulfs S3 geometrically. The IGW
  //     visually sits AT the boundary today, which is correct.)
  //
  // 2026-05-25 rewrite: previously the per-subnet anchor was ONLY
  // computes when IN_SUBNET edges existed (fallback added SG+NACL but
  // only fired when IN_SUBNET was empty). On paths WITH IN_SUBNET
  // edges — i.e. most paths — SGs and NACLs were missing from the
  // anchor, the bounding box was undersized, and operators saw the
  // SG / NACL cards visually OUTSIDE the dashed VPC box even though
  // they're VPC-scoped. The user's audit writeup specifically called
  // this out as "VPC boundary not drawn at all" (effectively: drawn
  // too small to register as the obvious container).
  const subnetToComputes = new Map<string, string[]>()
  for (const edge of path.edges ?? []) {
    const t = (edge.type || "").toUpperCase()
    if (t !== "IN_SUBNET") continue
    // Direction: compute -> subnet
    const subnetId = edge.target
    const computeId = edge.source
    if (!subnetId || !computeId) continue
    if (!subnetToComputes.has(subnetId)) subnetToComputes.set(subnetId, [])
    subnetToComputes.get(subnetId)!.push(computeId)
  }

  // Architecture-wide set of network-scoped card ids — SGs + NACLs.
  // These get added to EVERY subnet's anchor so the outer VPC box
  // wraps them regardless of which subnet's bbox they sit closest to.
  // Duplicates across subnets are harmless (VPCBoundaries dedupes
  // implicitly via the element-set bounding-box math).
  const networkAnchorIds = [
    ...securityGroups.map((sg) => sg.id),
    ...nacls.map((n) => n.id),
  ]

  // 2026-05-24: REVERTED — the synthetic Internet node (added briefly
  // in commit 5ea36fe) was a category error. AWS IAM "Principal" means
  // an identity (user, role, federated user, service principal); the
  // public internet is a network traffic source, not an identity. A
  // CISO / cloud-engineer reviewer spots the mis-categorization in
  // seconds. The IGW + the SG's `tcp 0-65535 from 0.0.0.0/0` rule
  // (when surfaced) already communicate "this chain is internet-
  // exposed" without needing a separate node. Kept this block as a
  // hostile comment so future PRs don't re-add the node without the
  // upstream context.
  //
  // If we DO want a visible "outside the perimeter" anchor later,
  // either (a) add a dedicated ENTRY / NETWORK SOURCE lane (separate
  // grid column), or (b) render as an annotation chip on the IGW
  // card itself ("↔ Internet"). Both keep the AWS-IAM ontology
  // consistent. Don't put it in PRINCIPALS.

  const vpcGroups = Array.from(vpcsById.values()).map((v) => {
    const groupSubnets = subnets
      .filter((s) => s.vpcId === v.vpcId || !s.vpcId)
      .map((s) => ({
        subnetId: s.id,
        subnetName: s.shortName ?? s.name,
        // SubnetNode.isPublic is three-state (true/false/null). VPCBoundaries
        // expects boolean; coerce null → false (private fallback) for the
        // boundary-coloring decision only — the SubnetNode card itself
        // still renders the honest three-state Unknown chip.
        isPublic: s.isPublic === true,
        // Anchor set per subnet (2026-05-25 fix):
        //   1. computes in this subnet (via IN_SUBNET edges, if any)
        //   2. the subnet's own card (data-subnet-id anchor — locks the
        //      inner subnet-box bounds to the actual card position)
        //   3. all architecture-wide network anchors (SGs + NACLs) — see
        //      networkAnchorIds above. Without these the outer VPC box
        //      was undersized and the SG/NACL cards rendered outside it.
        nodeIds: [
          ...(subnetToComputes.get(s.id) ?? []),
          s.id,
          ...networkAnchorIds,
        ],
      }))
    return { vpcId: v.vpcId, vpcName: v.vpcName, subnets: groupSubnets }
  })

  // ── Mark role↔IP binding twins (Phase 1.1, revised 2026-05-26) ──
  //
  // Backend marks pairs via `key_properties.binding_twin_id`. We stamp
  // a `bindingTwinIp` flag on the role's checkpoint so the renderer
  // can show a hint chip, BUT we KEEP both cards in the architecture
  // arrays so the sidebar counts (IAM ROLES (1) · INSTANCE PROFILES (1))
  // reflect what's actually in the graph. The previous "collapse-and-
  // drop-the-IP" behavior produced INSTANCE PROFILES (0) which was a
  // lie about the graph state — the hop exists, just folded visually.
  // User audit caught the count regression and the fix is to keep the
  // count honest.
  for (const role of iamRoles) {
    const roleNode = graph.nodes.find((n) => n.id === role.id)
    const twinId = (roleNode?.key_properties as Record<string, any> | undefined)?.binding_twin_id
    if (typeof twinId === "string" && twinId && seen.has(twinId)) {
      if (instanceProfiles.some((ip) => ip.id === twinId)) {
        ;(role as any).bindingTwinIp = true
      }
    }
  }

  // ── Chain-scope live-evidence per role (Phase 1.8 — 2026-05-26) ──
  //
  // Backend's _enrich_live_usage sums per-resource MAX hit_count across
  // ALL resources the role has accessed (975,913 = 789,820 prod-data +
  // 186,093 analytics). Honest as a "this role HAS been used" signal,
  // but misleading on a chain-scoped view: the operator reads the
  // "976K hits" chip on a role card sitting next to ONE jewel and
  // assumes that's hits to THAT jewel. It isn't.
  //
  // Filter to outgoing ACCESSES_RESOURCE edges that target the chain's
  // CJ(s). Now the chip shows the chain-scoped number — 789,820 in this
  // case — matching what the operator expects from the chain context.
  for (const role of iamRoles as any[]) {
    const roleLaterals = graph.laterals_by_node?.[role.id] ?? []
    let cjHits = 0
    for (const e of roleLaterals) {
      if (e.type !== "ACCESSES_RESOURCE") continue
      if (e.direction !== "out") continue
      const nid = e.neighbor_id || ""
      if (!nid || !crownJewelIds.has(nid)) continue
      const h = e.hit_count ?? 0
      if (h > cjHits) cjHits = h
    }
    if (cjHits > 0) {
      role.liveObservedTotalHits = cjHits
      role.liveObservedResourceCount = 1
    } else if (role.liveObservedTotalHits) {
      // Role had cross-resource live activity but NOT to this chain's
      // jewel. Drop the chip on this view — showing cross-resource
      // totals here is exactly the audit's complaint.
      delete role.liveObservedTotalHits
      delete role.liveObservedResourceCount
    }
  }

  // ENTRY lane (Phase 2 — 2026-05-25): explicit attacker-entry nodes.
  // For now we surface every principal (root / IAMUser / federated /
  // CloudTrailPrincipal) — those are the identity-side entry points
  // the operator most often asks about ("how did the attacker get in?").
  // Network entry-points (Internet → IGW / ALB / APIGW) populate the
  // EGRESS lane today; promoting them into ENTRY when they're inbound
  // is a follow-up that needs ingress-vs-egress distinction in the
  // graph-view payload. Back-compat: TFM also falls back to
  // architecture.principals when entryPoints is empty.
  const entryPoints = principals.slice()

  // ─── Explicit edges (Phase 2 — 2026-05-25) ────────────────────────
  //
  // Build a 1:1 CanvasEdge[] from the real graph relationships that
  // TrafficFlowMap will draw as one line per edge, tagged with its
  // plane. Two sources:
  //
  //   1. `path.edges` — IAP-traced edges (the chain itself). All edge
  //      types are included; the renderer will filter / color by
  //      plane via planeForString. We keep config edges (USES_ROLE,
  //      HAS_INSTANCE_PROFILE, IN_SUBNET, ASSOCIATED_WITH, ROUTES_VIA,
  //      etc.) because they ARE the topology — without them the cards
  //      sit disconnected. Pre-refactor these were continued past in
  //      the flow-synthesis loop, which is why operators saw an
  //      EC2 with no lines to its SG/Subnet/Role unless we faked them.
  //
  //   2. `graph.laterals_by_node` — neighbor edges off path nodes,
  //      both on_path observed-traffic edges (data plane) and config
  //      edges to the lateral attachment cards (NACL, SG, IP, IGW).
  //
  // Both endpoints MUST be in `seen` (a card was actually rendered
  // for them). Edges to nodes the layout chose not to render are
  // dropped — counted but never invented. Dedupe by canonical key.
  const edgeKeys = new Set<string>()
  const builtEdges: CanvasEdge[] = []

  // ── Edge visual-noise filter (2026-05-26, Fix #3) ─────────────────
  //
  // Phase 2 wired ALL graph edges 1:1 to the canvas. Faithful but
  // visually noisy: 30 edges → 30 SVG bezier curves → curves crossing
  // unrelated lane cards. User-audit caught the "Role → IGW → S3"
  // misread, which was a curve from a different edge passing through
  // the IGW card geometrically.
  //
  // The fix is to drop edge types that are either:
  //   a) container/context edges already represented by other visuals
  //      (IN_VPC, RUNS_IN_VPC — the dashed VPC boundary IS this hop)
  //   b) shortcut aliases of a canonical edge that we already draw
  //      (USES_SECURITY_GROUP is a legacy alias for SECURED_BY;
  //      compute→role via USES_ROLE / ASSUMES_ROLE / ASSUMES_ROLE_ACTUAL
  //      duplicates the canonical compute→IP→role chain)
  //
  // The data is preserved in the Neo4j graph; we just don't draw a
  // visible line for these. Chain backbone (HAS_INSTANCE_PROFILE,
  // USES_ROLE on IP, ACCESSES_RESOURCE, SECURED_BY, IN_SUBNET,
  // ASSOCIATED_WITH, ROUTES_VIA) stays untouched.
  const SKIP_REL_TYPES = new Set([
    "IN_VPC",
    "RUNS_IN_VPC",
    "BELONGS_TO",         // VPC↔{SG, NACL} container — VPC boundary box renders this
    "BELONGS_TO_SYSTEM",
    "USES_SECURITY_GROUP", // legacy alias for SECURED_BY
  ])
  // For compute→role direct edges, only skip if the FULL IP chain is
  // also present (compute→IP exists AND IP→role exists). When the
  // chain is missing, the direct edge is the only thing tying the
  // compute to the role and we must keep it.
  const hasComputeToIpEdge = (path.edges ?? []).some(
    (e) => (e.type || "").toUpperCase() === "HAS_INSTANCE_PROFILE",
  )
  const computeRoleShortcutSkip = hasComputeToIpEdge
    ? new Set(["USES_ROLE", "ASSUMES_ROLE", "ASSUMES_ROLE_ACTUAL"])
    : new Set<string>()

  const pushCanvasEdge = (
    source: string,
    target: string,
    rawType: string,
    observed: boolean | null,
    bytes: number | null,
    hitCount: number | null,
    port: number | null,
    protocol: string | null,
    firstSeen: string | null,
    lastSeen: string | null,
  ) => {
    if (!source || !target) return
    if (!seen.has(source) || !seen.has(target)) return
    const rel = (rawType || "").toUpperCase()
    if (!rel) return
    if (SKIP_REL_TYPES.has(rel)) return
    // Compute→role shortcut filter — only when the canonical IP chain
    // is present. Check by id pattern: compute ids don't start with
    // `arn:`; role ids do.
    if (computeRoleShortcutSkip.has(rel)) {
      const looksLikeCompute = !source.startsWith("arn:")
      const looksLikeRole = target.includes(":role/")
      if (looksLikeCompute && looksLikeRole) return
    }
    const id = `${source}|${rel}|${target}`
    if (edgeKeys.has(id)) return
    edgeKeys.add(id)
    builtEdges.push({
      id,
      source_aws_id: source,
      target_aws_id: target,
      // Cast through string — CanvasRelationshipType is a closed enum,
      // but the IAP / graph-view producers emit raw Neo4j relationship
      // strings. planeForString handles unknowns conservatively
      // ("network"); the cast is safe because the renderer never
      // narrows on this field, only reads it for hover labels.
      relationship: rel as CanvasRelationshipType,
      observed,
      hit_count: hitCount,
      bytes,
      first_seen: firstSeen,
      last_seen: lastSeen,
      port,
      protocol,
    })
  }

  // (1) From the IAP path's edges — the chain backbone.
  for (const e of path.edges ?? []) {
    pushCanvasEdge(
      e.source,
      e.target,
      e.type,
      e.is_observed ?? null,
      e.traffic_bytes ?? null,
      e.hit_count ?? null,
      e.port ?? null,
      e.protocol ?? null,
      null,
      null,
    )
  }

  // (2) From laterals — both on_path observed edges AND lateral
  //     attachments to the cards we rendered (NACL, SG, IP, IGW, Role).
  for (const [pathNodeId, neighbors] of Object.entries(graph.laterals_by_node)) {
    for (const e of neighbors) {
      const neighborId = e.neighbor_id
      if (!neighborId) continue
      const source = e.direction === "out" ? pathNodeId : neighborId
      const target = e.direction === "out" ? neighborId : pathNodeId
      pushCanvasEdge(
        source,
        target,
        e.type,
        e.observed,
        e.bytes,
        e.hit_count,
        e.port,
        e.protocol,
        e.first_seen,
        e.last_seen,
      )
    }
  }

  return {
    computeServices,
    principals,
    entryPoints,
    resources,
    subnets,
    securityGroups,
    nacls,
    iamRoles,
    // 2026-05-22: identity types are split across three arrays so the
    // sidebar count is honest ("IAM ROLES (1) · INSTANCE PROFILES (1)
    // · IAM POLICIES (1)" instead of the previous wrong "IAM ROLES
    // (3)"). Both new arrays are optional on SystemArchitecture for
    // back-compat — consumers that don't know about them just ignore
    // the new lanes.
    //
    // 2026-05-26 (Phase 1.1, revised): the IP card stays in the
    // architecture so the sidebar count is honest about the graph
    // ("INSTANCE PROFILES (1)" reflects the real HAS_INSTANCE_PROFILE
    // hop). The role's checkpoint carries bindingTwinIp:true so the
    // renderer can disambiguate the visual without dropping the count.
    // The earlier "collapse-and-drop" approach lied about the graph
    // state — user audit caught it.
    instanceProfiles,
    iamPolicies,
    vpcEndpoints: [],
    egressGateways,
    flows,
    // 2026-05-25 (Phase 2 explicit-edges refactor): real graph edges
    // populate `edges`. ConnectionLinesSVG branches on this — when
    // non-empty it draws ONE line per CanvasEdge tagged with plane.
    // Cross-plane zigzag synthesis is eliminated.
    edges: builtEdges,
    totalBytes: flows.reduce((s, f) => s + (f.bytes || 0), 0),
    totalConnections: flows.reduce((s, f) => s + (f.connections || 0), 0),
    totalGaps: 0,
    vpcGroups,
  }
}
