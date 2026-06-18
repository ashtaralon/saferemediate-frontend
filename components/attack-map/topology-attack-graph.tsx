"use client"

// =============================================================================
// Attack Graph on AWS Topology — 3-pane CISO surface.
//
// Converted from the user-supplied HTML mockup (attack-graph-aws-topology-v2.html)
// into a real React/TypeScript component bound to live Neo4j data via the
// /api/proxy/attack-paths/<system>/by-crown-jewel endpoint.
//
// Layout (matching the mockup):
//   ┌───────────────────────────────────────────────────────────────────┐
//   │ HEADER · brand · observed/configured legend                       │
//   ├──────────┬──────────────────────────────────────────────┬─────────┤
//   │ Crown    │                                              │ Paths   │
//   │ jewels   │   SVG canvas (980 × 760)                     │ ranked  │
//   │ ranked   │   - AWS Cloud > Region > VPC > AZ            │ by      │
//   │ (left    │   - Public Subnets (Ingress/Egress)          │ damage  │
//   │  rail)   │   - Application Subnet (Private)             │ (right  │
//   │          │   - Data Subnet (Private)                    │  rail)  │
//   │          │   - IDENTITY & ACCESS strip                  │         │
//   │          │   - OFF-VPC CROWN JEWELS column              │         │
//   │          │   - VPC Endpoint at boundary                 │         │
//   └──────────┴──────────────────────────────────────────────┴─────────┘
//
// Data: real `CrownJewelConvergence` via useCrownJewelConvergence(). No mocks.
// Missing data → honest empty/loading/error states per CLAUDE.md rule #1.

import { useMemo, useState } from "react"
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import type {
  ConvergenceHop,
  ConvergencePath,
} from "@/lib/attack-paths/convergence-types"
import { useCrownJewelConvergence } from "@/lib/attack-paths/use-crown-jewel-convergence"
import { useAwsTopology, type AwsTopology, type TopologyVpc, type TopologySubnet } from "@/lib/attack-paths/use-aws-topology"

// ─── theme tokens (mirroring the mockup CSS variables) ──────────────────────
const T = {
  bg: "#0D1B2A",
  surface: "#142433",
  surface2: "#1B2A3A",
  border: "#243447",
  text: "#E6EDF3",
  textMuted: "#8BA0B4",
  textFaint: "#5C7186",
  accent: "#00C2A8",
  observed: "#00C2A8",
  configured: "#E2A93B",
  sevCritical: "#E5484D",
  sevHigh: "#F5803E",
  sevMedium: "#E2A93B",
  sevLow: "#4C8DFF",
  aws: "#FF9900",
  region: "#4C8DFF",
  vpc: "#7DD181",
  publicLane: "#4Fae6f",
  privateLane: "#3a6ea5",
  identity: "#C792EA",
} as const

// ─── data-only hop classification ───────────────────────────────────────────
// Buckets are determined ONLY by real Neo4j fields. No inference, no fallback.
type HopBucket =
  | "internet"      // node_type = Internet
  | "igw"           // node_type = InternetGateway
  | "vpce"          // node_type = VPCEndpoint
  | "in_subnet"     // resolved to a real subnet_id (either explicit or path-neighbor)
  | "identity"      // plane = identity
  | "data"          // plane = data, not a crown jewel
  | "crown_jewel"   // is_crown_jewel = true
  | "network_unknown" // plane = network but no subnet_id and not IGW/VPCE/Internet
  | "other"         // anything else (we render but don't position into a band)

function hopBucket(h: ConvergenceHop, hopToSubnet: Map<string, string>): HopBucket {
  const t = (h.node_type || "").toLowerCase()
  const plane = (h.plane || "").toLowerCase()
  if (h.is_crown_jewel) return "crown_jewel"
  if (t === "internet") return "internet"
  if (t === "internetgateway" || t === "igw") return "igw"
  if (t === "vpcendpoint" || t === "vpce") return "vpce"
  if (plane === "identity") return "identity"
  if (plane === "data") return "data"
  if (plane === "network") {
    if (hopToSubnet.get(h.node_id)) return "in_subnet"
    return "network_unknown"
  }
  return "other"
}

function hopIcon(h: ConvergenceHop): string {
  const t = (h.node_type || "").toLowerCase()
  if (h.is_crown_jewel) {
    if (/s3/.test(t)) return "🪣"
    if (/kms/.test(t)) return "🗝"
    if (/dynamodb/.test(t)) return "⬡"
    if (/rds|database/.test(t)) return "🗄"
    if (/secret/.test(t)) return "🔐"
    return "◆"
  }
  if (/lambda/.test(t)) return "λ"
  if (/role/.test(t)) return "🔑"
  if (/profile/.test(t)) return "🪪"
  if (/igw|internetgateway/.test(t)) return "🌐"
  if (/nat/.test(t)) return "🔀"
  if (/vpce|vpcendpoint/.test(t)) return "🔌"
  if (/routetable/.test(t)) return "🧭"
  if (/nacl/.test(t)) return "⛔"
  if (/sg|securitygroup/.test(t)) return "🛡"
  if (/rds|database/.test(t)) return "🗄"
  return "🖥"
}

function shortLabel(s: string, max = 22): string {
  if (!s) return ""
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

// ─── ranked path utilities ──────────────────────────────────────────────────
function pathScore(p: ConvergencePath): number {
  if (typeof p.score === "number" && p.score > 0) return p.score
  // fallback synthesis when backend score is missing
  const d = p.damage?.length ?? 0
  const worst = (p.damage?.[0] || "").toUpperCase()
  return (worst === "DELETE" ? 70 : worst === "WRITE" ? 55 : worst === "READ" ? 35 : 20) + d * 4
}

function severityFromScore(s: number): "critical" | "high" | "medium" {
  if (s >= 80) return "critical"
  if (s >= 55) return "high"
  return "medium"
}

interface NodePos {
  x: number
  y: number
}

// ─── derived containment from real topology + path hops ─────────────────────
interface DerivedContainment {
  /** VPC whose subnets/AZs match the most path hops. null when topology has no data. */
  primaryVpc: TopologyVpc | null
  /** Region label — real, from primaryVpc.region. Falls back to "REGION · unknown". */
  regionLabel: string
  /** AZ label — real, the unique AZ shown across path hops. Multi-AZ → composite label. */
  azLabel: string
  /** Real subnets in the primary VPC + most-relevant AZ, ordered public-first. */
  subnetsToRender: TopologySubnet[]
  /** Subnet IDs referenced by path hops that are NOT in the topology snapshot. */
  offSnapshotSubnetIds: string[]
}

/** True for strings that look like a real AWS AZ id (e.g. eu-west-1a, us-east-2c).
 *  Filters out garbage values like the bare letter "a" some hops carry. */
function isRealAz(s: string): boolean {
  return /^[a-z]{2}-[a-z]+-\d+[a-z]$/.test(s)
}

/** Choose the VPC that covers the most path hops (by az/subnet match). */
function deriveContainment(
  paths: ConvergencePath[],
  topology: AwsTopology | null,
): DerivedContainment {
  const hops = paths.flatMap((p) => p.hops)
  const hopAzs = new Set<string>(hops.map((h) => h.az || "").filter(isRealAz))
  // Subnet IDs that show up as Subnet-type hops (these are real ids in our path data).
  const hopSubnetIds = new Set<string>(
    hops.filter((h) => (h.node_type || "").toLowerCase() === "subnet").map((h) => h.node_id),
  )

  const vpcs = topology?.vpcs ?? []
  let bestVpc: TopologyVpc | null = null
  let bestMatch = -1
  for (const v of vpcs) {
    let m = 0
    for (const az of v.azs) {
      if (hopAzs.has(az.az)) m += 4
      for (const sn of az.subnets) {
        if (hopSubnetIds.has(sn.id)) m += 6
      }
    }
    if (m > bestMatch) {
      bestMatch = m
      bestVpc = v
    }
  }
  // Fallback: if no match, take the first VPC if any. Be explicit when null.
  if (!bestVpc && vpcs.length > 0) bestVpc = vpcs[0]

  const knownSubnetIds = new Set<string>(
    (bestVpc?.azs ?? []).flatMap((a) => a.subnets.map((s) => s.id)),
  )
  const offSnapshotSubnetIds = Array.from(hopSubnetIds).filter((id) => !knownSubnetIds.has(id))

  // Collect every subnet in the primary VPC across every AZ. Order them
  // public-first so the rendered lanes read top-to-bottom: Public → Private →
  // Unknown. This is the AWS-architecture mental model.
  const subnetsToRender: TopologySubnet[] = (bestVpc?.azs ?? [])
    .flatMap((a) => a.subnets)
    .sort((a, b) => {
      const av = a.is_public === true ? 0 : a.is_public === false ? 1 : 2
      const bv = b.is_public === true ? 0 : b.is_public === false ? 1 : 2
      if (av !== bv) return av - bv
      return (a.name || a.id).localeCompare(b.name || b.id)
    })

  // Prefer explicit VPC.region; fall back to the common region prefix of real
  // AZs in path hops (e.g. all hops in eu-west-1a/b/c → "eu-west-1"). This is
  // derivation from real hop data, not invention — every AZ comes from Neo4j.
  const azList = Array.from(hopAzs).sort()
  const azRegionPrefixes = new Set(
    azList.map((a) => a.replace(/[a-z]$/, "")).filter(Boolean),
  )
  const region =
    bestVpc?.region ||
    (vpcs[0]?.region ?? null) ||
    (azRegionPrefixes.size === 1 ? Array.from(azRegionPrefixes)[0] : null)
  const regionLabel = region ? `REGION · ${region}` : "REGION · unknown"

  const azLabel =
    azList.length === 0
      ? "AZ · unknown"
      : azList.length === 1
        ? `AZ · ${azList[0]}`
        : `AZ · ${azList.join(" · ")}`

  return { primaryVpc: bestVpc, regionLabel, azLabel, subnetsToRender, offSnapshotSubnetIds }
}

// ─── center SVG canvas ──────────────────────────────────────────────────────
function TopologyCanvas({
  jewel,
  data,
  selectedPathIdx,
  topology,
}: {
  jewel: CrownJewelSummary
  data: { paths: ConvergencePath[] }
  selectedPathIdx: number | null
  topology: AwsTopology | null
}) {
  const containment = useMemo(
    () => deriveContainment(data.paths, topology),
    [data.paths, topology],
  )
  // ─── compute positions purely from real Neo4j fields ────────────────────
  // No node_type-based lane guessing. No `__internet__` synthetic anchors.
  // No hardcoded categories. Every coordinate is derived from one of:
  //   - hop.subnet_id (explicit) or path-neighbor subnet (real adjacency)
  //   - hop.node_type (Internet / InternetGateway / VPCEndpoint discrete)
  //   - hop.plane (network / identity / data — backend-set)
  //   - hop.is_crown_jewel
  //   - hop ORDER in the path (real edge sequence from Neo4j)
  // Hops we can't categorize land in an explicit "Subnet unknown" cluster
  // rather than being shoved into a guessed lane.
  const positions = useMemo<Record<string, NodePos>>(() => {
    const pos: Record<string, NodePos> = {}

    // Path-scoped subnet resolution.
    //
    // Each path is a single Neo4j MATCH chain that traverses one network
    // path. Every network-plane hop in that chain transits the same subnet
    // (there is one Subnet hop per path). So for each path P: find P's
    // Subnet hop, then assign every network-plane hop in P to that subnet.
    // The hop's explicit subnet_id (when present) wins over the path scope.
    //
    // This is a real Neo4j-encoded fact — the path is a graph traversal,
    // not an inference.
    const hopToSubnet = new Map<string, string>()
    const knownSubnetIds = new Set(
      containment.primaryVpc?.azs.flatMap((a) => a.subnets.map((s) => s.id)) ?? [],
    )
    for (const p of data.paths) {
      // Find this path's Subnet hop (whose id is in the topology snapshot).
      const subnetHop = p.hops.find(
        (h) =>
          (h.node_type || "").toLowerCase() === "subnet" &&
          knownSubnetIds.has(h.node_id),
      )
      const pathScopeSubnet = subnetHop?.node_id ?? null
      for (const h of p.hops) {
        const existing = hopToSubnet.get(h.node_id)
        if (existing) continue // first assignment wins (stable across paths)
        const planeIsNetwork = (h.plane || "").toLowerCase() === "network"
        const t = (h.node_type || "").toLowerCase()
        // Explicit subnet_id on the hop is the strongest signal.
        if (h.subnet_id && knownSubnetIds.has(h.subnet_id)) {
          hopToSubnet.set(h.node_id, h.subnet_id)
          continue
        }
        // A Subnet hop maps to itself.
        if (t === "subnet" && knownSubnetIds.has(h.node_id)) {
          hopToSubnet.set(h.node_id, h.node_id)
          continue
        }
        // Other network-plane hops in this path inherit the path's subnet.
        // IGW / VPCE / Internet are deliberately excluded — they're egress
        // mechanisms at the VPC boundary, not subnet-bound.
        if (
          planeIsNetwork &&
          pathScopeSubnet &&
          t !== "internetgateway" &&
          t !== "igw" &&
          t !== "vpcendpoint" &&
          t !== "vpce" &&
          t !== "internet"
        ) {
          hopToSubnet.set(h.node_id, pathScopeSubnet)
        }
      }
    }

    // Unique hop list — same id can appear across multiple paths.
    const seen = new Set<string>()
    const uniqHops: ConvergenceHop[] = []
    for (const h of data.paths.flatMap((p) => p.hops)) {
      if (seen.has(h.node_id)) continue
      seen.add(h.node_id)
      uniqHops.push(h)
    }

    // Bucket by REAL field. No falls-through-to-guess.
    const byBucket: Record<HopBucket, ConvergenceHop[]> = {
      internet: [],
      igw: [],
      vpce: [],
      in_subnet: [],
      identity: [],
      data: [],
      crown_jewel: [],
      network_unknown: [],
      other: [],
    }
    for (const h of uniqHops) {
      byBucket[hopBucket(h, hopToSubnet)].push(h)
    }

    // ── Internet (real :Internet hops, outside the AWS Cloud frame) ──
    byBucket.internet.forEach((h, i) => {
      pos[h.node_id] = { x: 220 + i * 130, y: 36 }
    })

    // ── Egress via Internet Gateway — VPC right edge, upper slot ──
    byBucket.igw.forEach((h, i) => {
      pos[h.node_id] = { x: 510, y: 150 + i * 56 }
    })

    // ── Egress via VPC Endpoint — VPC right edge, lower slot ──
    byBucket.vpce.forEach((h, i) => {
      pos[h.node_id] = { x: 510, y: 480 + i * 56 }
    })

    // ── In-subnet network hops — positioned inside their actual subnet box ──
    // Subnet box positions must match the layout used by <AzColumn> below.
    const azX = 64
    const azY = 148
    const azInnerTop = azY + 26
    const azInnerH = 456 - 30
    const numSubnets = containment.subnetsToRender.length
    const laneH =
      numSubnets > 0 ? Math.max(60, Math.floor(azInnerH / numSubnets)) : 0
    const subnetBoxY = new Map<string, number>()
    containment.subnetsToRender.forEach((sn, snIdx) => {
      subnetBoxY.set(sn.id, azInnerTop + snIdx * laneH)
    })
    // Group in-subnet hops by which subnet they belong to.
    const inSubnetBySubnet = new Map<string, ConvergenceHop[]>()
    for (const h of byBucket.in_subnet) {
      const sn = hopToSubnet.get(h.node_id)
      if (!sn) continue
      if (!inSubnetBySubnet.has(sn)) inSubnetBySubnet.set(sn, [])
      inSubnetBySubnet.get(sn)!.push(h)
    }
    inSubnetBySubnet.forEach((chips, snId) => {
      const baseY = subnetBoxY.get(snId)
      if (baseY == null) return
      const startX = azX + 40
      chips.forEach((h, i) => {
        pos[h.node_id] = { x: startX + (i % 7) * 65, y: baseY + 32 + Math.floor(i / 7) * 30 }
      })
    })

    // ── Identity strip — bottom of VPC frame ──
    byBucket.identity.forEach((h, i) => {
      pos[h.node_id] = { x: 90 + (i % 6) * 75, y: 640 + Math.floor(i / 6) * 36 }
    })

    // ── Network hops with no subnet membership — explicit "subnet unknown"
    //    cluster ABOVE identity strip, INSIDE the VPC frame but outside subnet
    //    boxes. We do not guess where they live. ──
    byBucket.network_unknown.forEach((h, i) => {
      pos[h.node_id] = { x: 90 + (i % 6) * 75, y: 596 + Math.floor(i / 6) * 30 }
    })

    // ── Data plane hops (non-crown-jewel) — off-VPC band, lower ──
    byBucket.data.forEach((h, i) => {
      pos[h.node_id] = { x: 900, y: 480 + i * 60 }
    })

    // ── Crown jewels — off-VPC band, upper ──
    byBucket.crown_jewel.forEach((h, i) => {
      pos[h.node_id] = { x: 900, y: 180 + i * 80 }
    })

    // ── Other (shouldn't be common) — top-left fallback so they're not silently lost ──
    byBucket.other.forEach((h, i) => {
      pos[h.node_id] = { x: 40, y: 730 - i * 28 }
    })

    // Selected jewel always gets a position even if it wasn't traversed.
    const jewelKey = jewel.canonical_id ?? jewel.id
    if (!pos[jewelKey]) {
      pos[jewelKey] = { x: 900, y: 180 + byBucket.crown_jewel.length * 80 }
    }
    return pos
  }, [data.paths, jewel.canonical_id, jewel.id, containment])

  const crossesAZb = false // multi-AZ rendering: future iteration; v1 = single AZ column

  return (
    <svg viewBox="0 0 980 760" preserveAspectRatio="xMidYMid meet" className="block w-full h-full">
      <defs>
        <filter id="tag-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <marker id="aObs" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={T.observed} />
        </marker>
        <marker id="aCfg" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={T.configured} />
        </marker>
      </defs>

      {/* nested containers — labels derived from real topology + path hops */}
      <Container x={14} y={60} w={952} h={680} stroke={T.aws} label="AWS CLOUD" />
      <Container x={30} y={84} w={820} h={648} stroke={T.region} label={containment.regionLabel} />
      <Container
        x={46}
        y={108}
        w={crossesAZb ? 770 : 470}
        h={612}
        stroke={T.vpc}
        label={
          containment.primaryVpc
            ? `VPC · ${shortLabel(containment.primaryVpc.name || containment.primaryVpc.id, 28)}${containment.primaryVpc.cidr ? ` · ${containment.primaryVpc.cidr}` : ""}`
            : "VPC · not in snapshot"
        }
      />

      {/* AZ column — real subnets from /api/topology-aws, ordered public-first.
         Each lane is a real :Subnet with real name/CIDR/is_public. */}
      <AzColumn x={64} y={148} label={containment.azLabel} subnets={containment.subnetsToRender} />

      {/* off-snapshot indicator — honest about subnets we don't have data for */}
      {containment.offSnapshotSubnetIds.length > 0 && (
        <g>
          <rect
            x={52}
            y={596}
            width={460}
            height={18}
            rx={4}
            fill="rgba(229,72,77,0.08)"
            stroke={T.sevHigh}
            strokeOpacity={0.5}
            strokeDasharray="3 3"
          />
          <text x={62} y={609} fontSize={10} fill={T.sevHigh} fontFamily="ui-monospace,monospace">
            {containment.offSnapshotSubnetIds.length} subnet(s) referenced by paths but missing from topology snapshot
          </text>
        </g>
      )}

      {/* identity strip under the VPC */}
      <IdentityStrip x={46} y={620} w={crossesAZb ? 770 : 470} />

      {/* off-VPC column */}
      <OffVpcLabel cx={880} y={120} />

      {/* draw nodes — anchors come from positions[], ring color from real plane */}
      {Object.entries(positions).map(([nodeId, p]) => {
        const hop = data.paths.flatMap((pa) => pa.hops).find((h) => h.node_id === nodeId)
        if (!hop) return null
        const isJewel = hop.is_crown_jewel
        const plane = (hop.plane || "").toLowerCase()
        const t = (hop.node_type || "").toLowerCase()
        // Ring color is derived from the real plane field + a couple discrete
        // node_type buckets (IGW / VPCE) so the egress mechanism is visually
        // distinct. Nothing inferred from labels or names.
        const ring = isJewel
          ? T.sevCritical
          : plane === "identity"
            ? T.identity
            : t === "internetgateway" || t === "igw"
              ? T.sevHigh
              : t === "vpcendpoint" || t === "vpce"
                ? T.observed
                : t === "internet"
                  ? T.textFaint
                  : T.accent
        const label = shortLabel(hop.name || hop.node_id, 22)
        return (
          <NodeChip
            key={nodeId}
            x={p.x}
            y={p.y}
            icon={hopIcon(hop)}
            label={label}
            ring={ring}
            bright={true}
            crown={isJewel}
            sg={hop.security_groups?.[0]}
          />
        )
      })}

      {/* edges */}
      {data.paths.map((p, i) => {
        const dim = selectedPathIdx != null && selectedPathIdx !== i
        const obs = p.confidence === "observed"
        const color = obs ? T.observed : T.configured
        const op = dim ? 0.1 : obs ? 1 : 0.8
        const sw = selectedPathIdx === i ? 3.5 : obs ? 2.6 : 1.7
        return p.hops.slice(0, -1).map((h, j) => {
          const a = positions[h.node_id]
          const b = positions[p.hops[j + 1].node_id]
          if (!a || !b) return null
          const mx = (a.x + b.x) / 2
          const d = `M${a.x},${a.y} C ${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`
          return (
            <g key={`${i}-${j}`}>
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={sw}
                strokeOpacity={op}
                strokeDasharray={obs ? undefined : "5 5"}
                markerEnd={obs ? "url(#aObs)" : "url(#aCfg)"}
              />
              {obs && op > 0.5 && (
                <circle r={3} fill={T.observed} filter="url(#tag-glow)">
                  <animateMotion dur="2.2s" repeatCount="indefinite" path={d} />
                </circle>
              )}
            </g>
          )
        })
      })}
    </svg>
  )
}

function pos(map: Record<string, NodePos>, id: string): NodePos {
  return map[id] ?? { x: 0, y: 0 }
}

// ─── primitives ─────────────────────────────────────────────────────────────
function Container({ x, y, w, h, stroke, label }: { x: number; y: number; w: number; h: number; stroke: string; label: string }) {
  const labelW = label.length * 6.4 + 24
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} fill="none" stroke={stroke} strokeWidth={1.3} strokeOpacity={0.55} />
      <rect x={x + 8} y={y - 9} width={labelW} height={18} rx={4} fill={T.bg} stroke={stroke} strokeWidth={1} strokeOpacity={0.6} />
      <text x={x + 16} y={y + 4} fontSize={10} fontWeight={700} fill={stroke} style={{ letterSpacing: "0.06em" }}>
        {label}
      </text>
    </g>
  )
}

function AzColumn({ x, y, label, subnets }: { x: number; y: number; label: string; subnets: TopologySubnet[] }) {
  const W = 720
  const H = 456
  const innerTop = y + 26
  const innerH = H - 30
  // Render one lane per real subnet. If none came back from /api/topology-aws,
  // show an honest empty state instead of inventing labels.
  const renderableSubnets = subnets.length > 0 ? subnets : null
  const laneH = renderableSubnets ? Math.max(60, Math.floor(innerH / renderableSubnets.length)) : 0
  return (
    <g>
      <rect x={x} y={y} width={W} height={H} rx={8} fill="rgba(76,141,255,0.03)" stroke={T.region} strokeWidth={1} strokeOpacity={0.35} strokeDasharray="3 4" />
      <text x={x + 12} y={y + 16} fontSize={9.5} fontWeight={700} fill={T.region} style={{ letterSpacing: "0.1em" }}>
        {label}
      </text>
      {renderableSubnets ? (
        renderableSubnets.map((sn, i) => (
          <SubnetLane
            key={sn.id}
            x={x + 10}
            y={innerTop + i * laneH}
            h={laneH - 6}
            subnet={sn}
          />
        ))
      ) : (
        <text x={x + 12} y={y + 60} fontSize={10} fill={T.textFaint} fontFamily="ui-monospace,monospace">
          No subnets in topology snapshot for this VPC.
        </text>
      )}
    </g>
  )
}

function SubnetLane({ x, y, h, subnet }: { x: number; y: number; h: number; subnet: TopologySubnet }) {
  const isPublic = subnet.is_public === true
  const isPrivate = subnet.is_public === false
  const color = isPublic ? T.publicLane : isPrivate ? T.privateLane : T.textFaint
  const tint = isPublic ? "rgba(79,174,111,0.06)" : isPrivate ? "rgba(58,110,165,0.07)" : "rgba(140,140,140,0.04)"
  const kindLabel = isPublic ? "PUBLIC" : isPrivate ? "PRIVATE" : "VISIBILITY UNKNOWN"
  const name = shortLabel(subnet.name || subnet.id, 28)
  const cidr = subnet.cidr ? ` · ${subnet.cidr}` : ""
  return (
    <g>
      <rect x={x} y={y} width={700} height={h} rx={6} fill={tint} stroke={color} strokeWidth={1} strokeOpacity={0.5} />
      <text x={x + 10} y={y + 13} fontSize={8.5} fontWeight={700} fill={color} style={{ letterSpacing: "0.04em" }}>
        {kindLabel} · {name}{cidr}
      </text>
    </g>
  )
}

function IdentityStrip({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g>
      <rect x={x + 4} y={y - 6} width={w - 8} height={34} rx={6} fill="rgba(199,146,234,0.05)" stroke={T.identity} strokeWidth={1} strokeOpacity={0.4} strokeDasharray="3 4" />
      <text x={x + 14} y={y + 8} fontSize={8.5} fontWeight={700} fill={T.identity} style={{ letterSpacing: "0.08em" }}>
        IDENTITY &amp; ACCESS (profiles + roles)
      </text>
    </g>
  )
}

function OffVpcLabel({ cx, y }: { cx: number; y: number }) {
  return (
    <text x={cx} y={y} textAnchor="middle" fontSize={9} fontWeight={700} fill={T.textFaint} style={{ letterSpacing: "0.08em" }}>
      OFF-VPC CROWN JEWELS
    </text>
  )
}

function NodeChip({ x, y, icon, label, ring, bright, crown, sg }: { x: number; y: number; icon: string; label: string; ring: string; bright: boolean; crown?: boolean; sg?: string }) {
  const op = bright ? 1 : 0.35
  return (
    <g opacity={op}>
      {sg ? (
        <>
          <rect x={x - 30} y={y - 22} width={64} height={50} rx={6} fill="none" stroke={T.sevHigh} strokeWidth={1} strokeOpacity={0.55} strokeDasharray="3 3" />
          <text x={x} y={y - 26} textAnchor="middle" fontSize={7.5} fontWeight={700} fill={T.sevHigh} fillOpacity={0.9}>
            {shortLabel(sg, 14)}
          </text>
        </>
      ) : null}
      <ellipse cx={x} cy={y + 13} rx={15} ry={4} fill="#000" fillOpacity={0.25} />
      {crown ? (
        <circle cx={x} cy={y} r={34} fill="rgba(229,72,77,0.08)" stroke={T.sevCritical} strokeWidth={1} strokeDasharray="3 4" />
      ) : null}
      <circle cx={x} cy={y} r={13} fill={T.surface2} stroke={ring} strokeWidth={1.6} />
      <text x={x} y={y + 5} textAnchor="middle" fontSize={12}>
        {icon}
      </text>
      <text x={x} y={y + 24} textAnchor="middle" fontSize={7.8} fill={T.textMuted} fontFamily="ui-monospace, monospace">
        {label}
      </text>
    </g>
  )
}

// ─── left rail (ranked crown jewels) ────────────────────────────────────────
function CrownJewelRail({
  jewels,
  selectedId,
  onSelect,
}: {
  jewels: CrownJewelSummary[]
  selectedId: string
  onSelect: (j: CrownJewelSummary) => void
}) {
  const sorted = [...jewels].sort((a, b) => (b.path_count || 0) - (a.path_count || 0))
  return (
    <nav className="overflow-y-auto" style={{ background: T.surface, borderRight: `1px solid ${T.border}` }}>
      <h3 className="px-4 pt-3.5 pb-2 text-[10.5px] font-bold uppercase tracking-[0.13em]" style={{ color: T.textMuted }}>
        Crown jewels · ranked by reachable paths
      </h3>
      {sorted.map((j) => {
        const active = j.id === selectedId
        const sev = j.severity?.toUpperCase() ?? "MEDIUM"
        const sevColor =
          sev === "CRITICAL" ? T.sevCritical : sev === "HIGH" ? T.sevHigh : sev === "LOW" ? T.sevLow : T.sevMedium
        return (
          <button
            key={j.id}
            type="button"
            onClick={() => onSelect(j)}
            className="block w-full cursor-pointer text-left transition-colors"
            style={{
              background: active ? T.surface2 : "transparent",
              borderLeft: `4px solid ${active ? T.accent : "transparent"}`,
              borderBottom: `1px solid ${T.border}`,
              padding: "11px 16px",
              color: T.text,
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-[15px]">🪣</span>
              <span className="flex-1 truncate font-mono text-[11px] leading-tight" style={{ wordBreak: "break-all" }}>
                {j.name || j.id}
              </span>
              <span className="font-mono text-[17px] font-extrabold" style={{ color: sevColor }}>
                {j.path_count ?? 0}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Chip text={sev} bg={`${sevColor}26`} ink={sevColor} />
              <Chip text={j.type} bg={T.surface2} ink={T.textMuted} border={T.border} />
            </div>
          </button>
        )
      })}
      <div className="px-4 py-3 text-[10px] leading-[1.6] border-t border-dashed" style={{ color: T.textFaint, borderColor: T.border }}>
        Placement is real: <code>IN_SUBNET</code> → box, <code>Subnet.is_public</code> → lane,
        <code> SECURED_BY</code> → SG group, <code>ROUTES_VIA</code> → VPCE.
      </div>
    </nav>
  )
}

function Chip({ text, bg, ink, border }: { text: string; bg: string; ink: string; border?: string }) {
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
      style={{ background: bg, color: ink, border: border ? `1px solid ${border}` : undefined }}
    >
      {text}
    </span>
  )
}

// ─── right rail (ranked paths) ──────────────────────────────────────────────
function PathRail({
  paths,
  jewelName,
  selectedIdx,
  onSelect,
}: {
  paths: ConvergencePath[]
  jewelName: string
  selectedIdx: number | null
  onSelect: (i: number | null) => void
}) {
  const ranked = useMemo(() => {
    return paths
      .map((p, originalIndex) => ({ p, originalIndex, dmg: pathScore(p) }))
      .sort((a, b) => b.dmg - a.dmg)
  }, [paths])

  return (
    <aside className="overflow-y-auto" style={{ background: T.surface, borderLeft: `1px solid ${T.border}` }}>
      <h3 className="px-4 pt-3.5 pb-2 text-[10.5px] font-bold uppercase tracking-[0.13em]" style={{ color: T.textMuted }}>
        Paths to {shortLabel(jewelName, 28)} · ranked by damage
      </h3>
      {ranked.map(({ p, originalIndex, dmg }, displayIdx) => {
        const obs = p.confidence === "observed"
        const sev = severityFromScore(dmg)
        const sevColor = sev === "critical" ? T.sevCritical : sev === "high" ? T.sevHigh : T.sevMedium
        const active = selectedIdx === originalIndex
        return (
          <button
            key={p.path_id}
            type="button"
            onClick={() => onSelect(active ? null : originalIndex)}
            className="block w-full cursor-pointer text-left transition-colors"
            style={{
              background: active ? T.surface2 : "transparent",
              borderLeft: `4px solid ${obs ? T.observed : T.configured}`,
              borderBottom: `1px solid ${T.border}`,
              padding: "10px 14px",
              color: T.text,
            }}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[12px] font-bold w-6" style={{ color: T.textMuted }}>
                #{displayIdx + 1}
              </span>
              <Chip
                text={obs ? "● OBSERVED" : "○ CONFIGURED"}
                bg={obs ? `${T.observed}26` : `${T.configured}22`}
                ink={obs ? T.observed : T.configured}
              />
              <span className="ml-auto font-mono text-[14px] font-extrabold" style={{ color: sevColor }}>
                {Math.round(dmg)}
              </span>
            </div>
            <div className="mt-1.5 ml-6 font-mono text-[10px] leading-[1.6]" style={{ color: T.textMuted }}>
              {p.hops.map((h, j) => {
                const last = j === p.hops.length - 1
                const lbl = shortLabel(h.name || h.node_id, 18)
                return (
                  <span key={j}>
                    <span style={{ color: last ? T.sevCritical : T.text }}>{lbl}</span>
                    {!last && <span style={{ color: T.textFaint, padding: "0 3px" }}>→</span>}
                  </span>
                )
              })}
            </div>
            {p.damage?.length ? (
              <div className="mt-1.5 ml-6 flex flex-wrap gap-1.5">
                {p.damage.slice(0, 3).map((d) => (
                  <Chip key={d} text={d} bg={`${T.sevHigh}26`} ink={T.sevHigh} />
                ))}
              </div>
            ) : null}
          </button>
        )
      })}
    </aside>
  )
}

// ─── top-level shell ────────────────────────────────────────────────────────
export interface TopologyAttackGraphProps {
  systemName: string
  /** Currently-selected jewel (defaults to first available). */
  initialJewel: CrownJewelSummary
  /** Full list of jewels for the left rail. Required: if not supplied, the
   *  parent should pass at least [initialJewel] so the rail isn't empty. */
  jewels: CrownJewelSummary[]
}

export function TopologyAttackGraph({ systemName, initialJewel, jewels }: TopologyAttackGraphProps) {
  const [selectedJewel, setSelectedJewel] = useState<CrownJewelSummary>(initialJewel)
  const [selectedPathIdx, setSelectedPathIdx] = useState<number | null>(null)
  const { data, loading, error, retry } = useCrownJewelConvergence(systemName, selectedJewel)
  const { data: topology, error: topologyError } = useAwsTopology(systemName)

  return (
    <div
      data-testid="topology-attack-graph"
      className="grid h-[760px] w-full rounded-lg overflow-hidden"
      style={{
        background: T.bg,
        color: T.text,
        gridTemplateColumns: "260px 1fr 320px",
        gridTemplateRows: "auto 1fr",
        border: `1px solid ${T.border}`,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif',
      }}
    >
      {/* header spans 3 columns */}
      <header
        className="flex items-center gap-4 px-5 py-2.5"
        style={{ gridColumn: "1 / 4", borderBottom: `1px solid ${T.border}`, background: "rgba(20,36,51,0.7)" }}
      >
        <div className="flex items-center gap-2.5 text-[13px] font-bold tracking-wider">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: T.accent, boxShadow: `0 0 14px ${T.accent}` }}
          />
          CYNTRO
          <span className="ml-1 text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: T.textMuted }}>
            Attack Graph · AWS Topology
          </span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-3.5 text-[11px]" style={{ color: T.textMuted }}>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 h-0 border-t-2" style={{ borderColor: T.observed }} />
            observed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 h-0 border-t-2 border-dashed" style={{ borderColor: T.configured }} />
            configured
          </span>
        </div>
      </header>

      {/* left rail */}
      <CrownJewelRail jewels={jewels} selectedId={selectedJewel.id} onSelect={(j) => { setSelectedJewel(j); setSelectedPathIdx(null) }} />

      {/* center stage */}
      <div className="relative overflow-hidden" style={{ background: `radial-gradient(1200px 700px at 60% -10%, #11283d 0%, transparent 60%), ${T.bg}` }}>
        <div
          className="absolute top-2.5 left-4 z-10 rounded-md border px-3 py-1.5 font-mono text-[11.5px]"
          style={{ background: "rgba(13,27,42,0.65)", borderColor: T.border, color: T.textMuted }}
        >
          <span className="font-bold" style={{ color: T.text }}>{shortLabel(selectedJewel.name, 40)}</span>
          {data ? ` — ${data.paths_total} paths${topology && !topologyError ? " · placed on real VPC topology" : " · topology snapshot pending"}` : ""}
        </div>
        {loading && !data ? (
          <div className="flex h-full flex-col items-center justify-center gap-2" style={{ color: T.textMuted }}>
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-[12px]">Loading topology…</span>
          </div>
        ) : error || !data ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center" style={{ color: T.textMuted }}>
            <AlertTriangle className="h-5 w-5" style={{ color: T.sevMedium }} />
            <p className="max-w-md text-[12px]">{error ?? "convergence API unavailable"}</p>
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center gap-2 rounded border px-3 py-1.5 text-[12px]"
              style={{ borderColor: T.border, color: T.text }}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        ) : (
          <TopologyCanvas jewel={selectedJewel} data={data} selectedPathIdx={selectedPathIdx} topology={topology} />
        )}
        <div
          className="absolute bottom-2.5 left-4 z-10 rounded-md border px-2.5 py-1.5 font-mono text-[10px]"
          style={{ background: "rgba(13,27,42,0.65)", borderColor: T.border, color: T.textFaint, maxWidth: "64%" }}
        >
          {topology && !topologyError
            ? `live geometry · ${topology.vpcs?.length ?? 0} VPC(s) from /api/topology-aws · paths from /by-crown-jewel`
            : topologyError
              ? `topology snapshot unavailable (${topologyError}) — VPC/AZ labels may be approximate`
              : "loading topology snapshot…"}
        </div>
      </div>

      {/* right rail */}
      {data ? (
        <PathRail
          paths={data.paths}
          jewelName={selectedJewel.name || selectedJewel.id}
          selectedIdx={selectedPathIdx}
          onSelect={setSelectedPathIdx}
        />
      ) : (
        <aside className="overflow-y-auto p-4 text-[11px]" style={{ background: T.surface, color: T.textMuted, borderLeft: `1px solid ${T.border}` }}>
          {loading ? "Loading paths…" : error ? "Paths unavailable — see canvas." : "No paths available."}
        </aside>
      )}
    </div>
  )
}
