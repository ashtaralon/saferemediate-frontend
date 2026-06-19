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

/** Discrete kind tag for SVG icon glyph rendering. Drives <IconGlyph>. */
type IconKind =
  | "s3"
  | "kms"
  | "dynamodb"
  | "rds"
  | "secret"
  | "lambda"
  | "ec2"
  | "iamrole"
  | "profile"
  | "igw"
  | "nat"
  | "vpce"
  | "routetable"
  | "nacl"
  | "sg"
  | "internet"
  | "subnet"
  | "generic"

function hopIconKind(h: ConvergenceHop): IconKind {
  const t = (h.node_type || "").toLowerCase()
  if (h.is_crown_jewel) {
    if (/s3/.test(t)) return "s3"
    if (/kms/.test(t)) return "kms"
    if (/dynamodb/.test(t)) return "dynamodb"
    if (/rds|database|aurora/.test(t)) return "rds"
    if (/secret/.test(t)) return "secret"
    return "generic"
  }
  if (/lambda/.test(t)) return "lambda"
  if (/role/.test(t)) return "iamrole"
  if (/profile/.test(t)) return "profile"
  if (/igw|internetgateway/.test(t)) return "igw"
  if (/nat/.test(t)) return "nat"
  if (/vpce|vpcendpoint/.test(t)) return "vpce"
  if (/routetable/.test(t)) return "routetable"
  if (/nacl/.test(t)) return "nacl"
  if (/sg|securitygroup/.test(t)) return "sg"
  if (/rds|database/.test(t)) return "rds"
  if (/internet/.test(t)) return "internet"
  if (/subnet/.test(t)) return "subnet"
  return "ec2"
}

/** Inline SVG icon glyph — drawn into the topology canvas at (x, y), 14×14
 *  centered. Stroke uses `color`. Designed for legibility at 1× zoom; the
 *  shapes are deliberately abstract so they survive aggressive font scaling.
 *  Replaces the emoji glyphs (🪣 🔌 🌐 🔑 etc.) the canvas was using. */
function IconGlyph({ x, y, kind, color }: { x: number; y: number; kind: IconKind; color: string }) {
  // All shapes live in a 14×14 box centered at (0,0). Translate to (x, y).
  const stroke = { stroke: color, strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" }
  let body: React.ReactNode = null
  switch (kind) {
    case "s3":
    case "rds":
      // Cylinder for object stores / databases.
      body = (
        <>
          <ellipse cx={0} cy={-4.5} rx={5.5} ry={1.8} {...stroke} />
          <path d="M -5.5 -4.5 L -5.5 4.5 C -5.5 6.3 -2.8 6.5 0 6.5 C 2.8 6.5 5.5 6.3 5.5 4.5 L 5.5 -4.5" {...stroke} />
          <path d="M -5.5 -0.5 C -5.5 1.3 -2.8 1.5 0 1.5 C 2.8 1.5 5.5 1.3 5.5 -0.5" {...stroke} strokeOpacity={0.55} />
        </>
      )
      break
    case "kms":
    case "secret":
      // Key — circle bow + shaft + teeth.
      body = (
        <>
          <circle cx={-3} cy={-1} r={3.2} {...stroke} />
          <path d="M -0.2 0.8 L 6 0.8 M 4.2 0.8 L 4.2 3.2 M 6 0.8 L 6 3" {...stroke} />
        </>
      )
      break
    case "iamrole":
      // Person silhouette (identity / role).
      body = (
        <>
          <circle cx={0} cy={-3.2} r={2.4} {...stroke} />
          <path d="M -4.5 6 C -4.5 1.8 -2 0.5 0 0.5 C 2 0.5 4.5 1.8 4.5 6" {...stroke} />
        </>
      )
      break
    case "profile":
      // ID badge — rounded rect + bar.
      body = (
        <>
          <rect x={-5.5} y={-4.5} width={11} height={9} rx={1.5} {...stroke} />
          <path d="M -3 -1.5 L 3 -1.5 M -3 1 L 1 1" {...stroke} />
        </>
      )
      break
    case "ec2":
      // Server stack — 2 horizontal rectangles with a status dot.
      body = (
        <>
          <rect x={-5.5} y={-4.5} width={11} height={4} rx={1} {...stroke} />
          <rect x={-5.5} y={0.5} width={11} height={4} rx={1} {...stroke} />
          <circle cx={-3} cy={-2.5} r={0.6} fill={color} />
          <circle cx={-3} cy={2.5} r={0.6} fill={color} />
        </>
      )
      break
    case "lambda":
      // Lightning bolt.
      body = (
        <path d="M -1 -6 L -4 1 L 0 1 L -2 6 L 5 -1 L 0 -1 L 2 -6 Z" stroke={color} strokeWidth={1.2} strokeLinejoin="round" fill={color} fillOpacity={0.25} />
      )
      break
    case "igw":
      // Globe — circle with equator + meridian.
      body = (
        <>
          <circle cx={0} cy={0} r={5.5} {...stroke} />
          <ellipse cx={0} cy={0} rx={2.4} ry={5.5} {...stroke} strokeOpacity={0.7} />
          <path d="M -5.3 0 L 5.3 0" {...stroke} strokeOpacity={0.7} />
        </>
      )
      break
    case "nat":
      // Bidirectional arrow exchange.
      body = (
        <>
          <path d="M -5 -2 L 5 -2 L 3 -4 M 5 -2 L 3 0" {...stroke} />
          <path d="M 5 3 L -5 3 L -3 1 M -5 3 L -3 5" {...stroke} />
        </>
      )
      break
    case "vpce":
      // Plug — rectangle body + 2 prongs.
      body = (
        <>
          <rect x={-3} y={-5.5} width={6} height={7} rx={1.2} {...stroke} />
          <path d="M -1 -5.5 L -1 -7.5 M 1 -5.5 L 1 -7.5" {...stroke} />
          <path d="M 0 1.5 L 0 6" {...stroke} />
        </>
      )
      break
    case "routetable":
      // Branching arrows.
      body = (
        <>
          <path d="M -5 0 L 5 0" {...stroke} />
          <path d="M 0 0 L 0 -4 L 4 -4" {...stroke} />
          <path d="M 0 0 L 0 4 L 4 4" {...stroke} />
          <path d="M 2 -6 L 4 -4 L 2 -2" {...stroke} />
          <path d="M 2 6 L 4 4 L 2 2" {...stroke} />
        </>
      )
      break
    case "nacl":
      // Shield with bar (blocks).
      body = (
        <>
          <path d="M 0 -6 L 5.5 -3 L 5.5 1.5 C 5.5 4 3 6 0 6.5 C -3 6 -5.5 4 -5.5 1.5 L -5.5 -3 Z" {...stroke} />
          <path d="M -2 0 L 2 0" {...stroke} strokeWidth={1.6} />
        </>
      )
      break
    case "sg":
      // Shield with checkmark.
      body = (
        <>
          <path d="M 0 -6 L 5.5 -3 L 5.5 1.5 C 5.5 4 3 6 0 6.5 C -3 6 -5.5 4 -5.5 1.5 L -5.5 -3 Z" {...stroke} />
          <path d="M -2.4 0.2 L -0.5 2 L 2.8 -1.2" {...stroke} />
        </>
      )
      break
    case "dynamodb":
      // Hexagon (NoSQL "table" cell).
      body = (
        <path d="M 0 -6 L 5 -3 L 5 3 L 0 6 L -5 3 L -5 -3 Z" {...stroke} />
      )
      break
    case "internet":
      // Cloud silhouette.
      body = (
        <path d="M -4 2.5 C -6 2.5 -6 -1 -3.5 -1.2 C -3 -3.8 1 -4 2 -1.5 C 4.5 -1.8 5.5 1.8 3.5 2.5 Z" {...stroke} />
      )
      break
    case "subnet":
      // Dotted square (subnet container).
      body = (
        <rect x={-5} y={-5} width={10} height={10} rx={1} strokeDasharray="2 2" {...stroke} />
      )
      break
    case "generic":
    default:
      // Diamond fallback.
      body = (
        <path d="M 0 -6 L 6 0 L 0 6 L -6 0 Z" {...stroke} />
      )
  }
  return <g transform={`translate(${x}, ${y})`}>{body}</g>
}

function shortLabel(s: string, max = 22): string {
  if (!s) return ""
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

/** Distinct edge color per path index — picked to be readable on the dark
 *  topology canvas (saturated, well-spaced on the hue wheel). Wraps with
 *  modulo so we never run out of colors. */
const PATH_COLORS = [
  "#00C2A8", // teal
  "#E2A93B", // amber
  "#FF8C61", // coral
  "#C792EA", // purple
  "#4C8DFF", // blue
  "#7DD181", // green
  "#FF6BAA", // pink
  "#FFCB6B", // yellow
] as const
function pathColor(idx: number): string {
  return PATH_COLORS[idx % PATH_COLORS.length]
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
interface VpcLayoutInfo {
  vpc: TopologyVpc
  /** Subnets in this VPC, ordered public-first, filtered to non-empty subnets only. */
  subnets: TopologySubnet[]
  /** Distinct AZs across hops that touch this VPC. */
  azs: string[]
}

interface DerivedContainment {
  /** Every VPC that has at least one path hop touching it. Empty when no
   *  topology data. Ordered: most-hop-traversed first. */
  vpcsToRender: VpcLayoutInfo[]
  /** Region label — real, from any VPC.region or AZ prefix. */
  regionLabel: string
  /** Subnet IDs referenced by path hops that are NOT in any rendered VPC. */
  offSnapshotSubnetIds: string[]
}

/** True for strings that look like a real AWS AZ id (e.g. eu-west-1a, us-east-2c).
 *  Filters out garbage values like the bare letter "a" some hops carry. */
function isRealAz(s: string): boolean {
  return /^[a-z]{2}-[a-z]+-\d+[a-z]$/.test(s)
}

/** Decide which VPCs the canvas should render — every VPC with at least
 *  one path hop touching it, plus their subnets that are actually used.
 *  Empty VPCs and empty subnets are dropped so the canvas isn't wasted
 *  on inert containers. Every field comes from Neo4j (via topology-aws). */
function deriveContainment(
  paths: ConvergencePath[],
  topology: AwsTopology | null,
): DerivedContainment {
  const hops = paths.flatMap((p) => p.hops)
  const hopAzs = new Set<string>(hops.map((h) => h.az || "").filter(isRealAz))
  // Subnet IDs that show up as Subnet-type hops (real ids in our path data).
  const hopSubnetIds = new Set<string>(
    hops.filter((h) => (h.node_type || "").toLowerCase() === "subnet").map((h) => h.node_id),
  )

  const vpcs = topology?.vpcs ?? []
  // Render EVERY VPC and EVERY subnet the endpoint returns — full Neo4j
  // topology, not just the path-traversed slice. Path edges then overlay
  // on top. The score is now used only for ordering (most path-relevant
  // VPC at the top), not for filtering.
  const scored: Array<{ vpc: TopologyVpc; score: number; subnets: TopologySubnet[]; azs: string[] }> = []
  for (const v of vpcs) {
    let score = 0
    const allAzs = new Set<string>()
    for (const az of v.azs) {
      if (az.az) allAzs.add(az.az)
      if (hopAzs.has(az.az)) score += 4
      for (const sn of az.subnets) {
        if (hopSubnetIds.has(sn.id)) score += 6
      }
    }
    // ALL subnets in the VPC — ordered public-first, then by name.
    const subnets: TopologySubnet[] = v.azs
      .flatMap((a) => a.subnets)
      .sort((a, b) => {
        const av = a.is_public === true ? 0 : a.is_public === false ? 1 : 2
        const bv = b.is_public === true ? 0 : b.is_public === false ? 1 : 2
        if (av !== bv) return av - bv
        return (a.name || a.id).localeCompare(b.name || b.id)
      })
    scored.push({
      vpc: v,
      score,
      subnets,
      azs: Array.from(allAzs).sort(),
    })
  }
  // Path-traversed VPCs render first (score > 0), then any other VPCs the
  // endpoint returned so the operator sees the full topology.
  scored.sort((a, b) => b.score - a.score)

  const vpcsToRender: VpcLayoutInfo[] = scored.map((s) => ({
    vpc: s.vpc,
    subnets: s.subnets,
    azs: s.azs,
  }))

  // Off-snapshot: any Subnet-hop id that isn't in ANY rendered VPC.
  const allRenderedSubnetIds = new Set<string>(
    vpcsToRender.flatMap((v) => v.vpc.azs.flatMap((a) => a.subnets.map((s) => s.id))),
  )
  const offSnapshotSubnetIds = Array.from(hopSubnetIds).filter(
    (id) => !allRenderedSubnetIds.has(id),
  )

  // Region label — prefer any VPC.region; fall back to common AZ prefix.
  const azList = Array.from(hopAzs).sort()
  const azRegionPrefixes = new Set(
    azList.map((a) => a.replace(/[a-z]$/, "")).filter(Boolean),
  )
  const region =
    vpcsToRender.find((v) => v.vpc.region)?.vpc.region ||
    (vpcs[0]?.region ?? null) ||
    (azRegionPrefixes.size === 1 ? Array.from(azRegionPrefixes)[0] : null)
  const regionLabel = region ? `REGION · ${region}` : "REGION · unknown"

  return { vpcsToRender, regionLabel, offSnapshotSubnetIds }
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
      containment.vpcsToRender.flatMap((v) =>
        v.vpc.azs.flatMap((a) => a.subnets.map((s) => s.id)),
      ),
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

    // ── per-VPC layout band computation ─────────────────────────────────
    // Each VPC stacks vertically inside the Region frame. The Region is
    // x=30 y=84 w=820 h=636. We allocate vertical bands per VPC,
    // proportional to its subnet count (so a 6-subnet VPC gets ~2x the
    // height of a 2-subnet VPC).
    const REGION_X = 46
    const REGION_W = 814
    const REGION_INNER_TOP = 108
    const REGION_INNER_H = 612
    const VPC_GAP = 10
    const vpcWeights = containment.vpcsToRender.map((v) =>
      Math.max(1, v.subnets.length),
    )
    const totalWeight = vpcWeights.reduce((s, w) => s + w, 0) || 1
    const totalGap = Math.max(0, containment.vpcsToRender.length - 1) * VPC_GAP
    const availableH = REGION_INNER_H - totalGap
    const vpcLayouts = containment.vpcsToRender.map((v, i) => {
      const h = Math.floor((vpcWeights[i] / totalWeight) * availableH)
      const y =
        REGION_INNER_TOP +
        vpcWeights
          .slice(0, i)
          .reduce(
            (s, w) => s + Math.floor((w / totalWeight) * availableH) + VPC_GAP,
            0,
          )
      // Reserve right slice of each VPC for egress chips (IGW/VPCE).
      const EGRESS_W = 100
      return {
        info: v,
        x: REGION_X,
        y,
        w: REGION_W - EGRESS_W,
        h,
        egressX: REGION_X + REGION_W - EGRESS_W + 24,
      }
    })

    // Per-subnet box positions within each VPC.
    const subnetBoxes = new Map<
      string,
      { x: number; y: number; w: number; h: number }
    >()
    // Per-VPC quick lookups for egress + identity placement.
    const vpcEgressX = new Map<string, number>()
    const vpcIdentityBand = new Map<string, { x: number; y: number; w: number }>()
    for (const layout of vpcLayouts) {
      const { info, x, y, w, h, egressX } = layout
      // Inside the VPC frame: 22px header, 20px identity footer.
      const innerTop = y + 28
      const innerBottom = y + h - 26
      const innerH = innerBottom - innerTop
      const nSubnets = info.subnets.length
      if (nSubnets > 0) {
        const laneH = Math.max(48, Math.floor(innerH / nSubnets))
        info.subnets.forEach((sn, si) => {
          subnetBoxes.set(sn.id, {
            x: x + 10,
            y: innerTop + si * laneH,
            w: w - 20,
            h: laneH - 4,
          })
        })
      }
      vpcEgressX.set(info.vpc.id, egressX)
      vpcIdentityBand.set(info.vpc.id, {
        x: x + 14,
        y: y + h - 18,
        w: w - 28,
      })
    }

    // Find which VPC a hop belongs to (via its resolved subnet membership).
    const subnetToVpc = new Map<string, string>()
    for (const layout of vpcLayouts) {
      for (const sn of layout.info.vpc.azs.flatMap((a) => a.subnets)) {
        subnetToVpc.set(sn.id, layout.info.vpc.id)
      }
    }
    const hopToVpc = new Map<string, string>()
    for (const [hopId, snId] of hopToSubnet.entries()) {
      const v = subnetToVpc.get(snId)
      if (v) hopToVpc.set(hopId, v)
    }
    // Identity / network-unknown hops in a path also belong to the VPC
    // that path's subnet hop resolved to. Walk paths to assign them.
    for (const p of data.paths) {
      const pathSubnet = p.hops.find(
        (h) =>
          (h.node_type || "").toLowerCase() === "subnet" &&
          knownSubnetIds.has(h.node_id),
      )?.node_id
      const pathVpc = pathSubnet ? subnetToVpc.get(pathSubnet) : null
      if (!pathVpc) continue
      for (const h of p.hops) {
        if (!hopToVpc.has(h.node_id)) hopToVpc.set(h.node_id, pathVpc)
      }
    }

    // ── Internet (real :Internet hops, outside the AWS Cloud frame) ──
    byBucket.internet.forEach((h, i) => {
      pos[h.node_id] = { x: 240 + i * 130, y: 38 }
    })

    // ── IGW / VPCE chips at their VPC's right egress slot ──
    // Group by VPC so multiple IGWs in one VPC stack vertically.
    const igwsByVpc = new Map<string, ConvergenceHop[]>()
    const vpcesByVpc = new Map<string, ConvergenceHop[]>()
    for (const h of byBucket.igw) {
      const v = hopToVpc.get(h.node_id) ?? vpcLayouts[0]?.info.vpc.id ?? "_"
      if (!igwsByVpc.has(v)) igwsByVpc.set(v, [])
      igwsByVpc.get(v)!.push(h)
    }
    for (const h of byBucket.vpce) {
      const v = hopToVpc.get(h.node_id) ?? vpcLayouts[0]?.info.vpc.id ?? "_"
      if (!vpcesByVpc.has(v)) vpcesByVpc.set(v, [])
      vpcesByVpc.get(v)!.push(h)
    }
    for (const layout of vpcLayouts) {
      const igws = igwsByVpc.get(layout.info.vpc.id) ?? []
      const vpces = vpcesByVpc.get(layout.info.vpc.id) ?? []
      const slotTop = layout.y + 40
      const slotBot = layout.y + layout.h - 60
      const slotH = Math.max(60, slotBot - slotTop)
      igws.forEach((h, i) => {
        pos[h.node_id] = {
          x: layout.egressX,
          y: slotTop + i * 50,
        }
      })
      vpces.forEach((h, i) => {
        pos[h.node_id] = {
          x: layout.egressX,
          y: slotTop + slotH - 30 - i * 50,
        }
      })
    }

    // ── In-subnet network hops — placed inside their subnet box ──
    // Group by node_type ROW: workload chips on row 1, SG/NACL/Subnet
    // metadata chips on row 2, so workload labels don't overlap each
    // other and so the "what's running here" reading stays clean.
    const inSubnetBySubnet = new Map<string, ConvergenceHop[]>()
    for (const h of byBucket.in_subnet) {
      const sn = hopToSubnet.get(h.node_id)
      if (!sn) continue
      if (!inSubnetBySubnet.has(sn)) inSubnetBySubnet.set(sn, [])
      inSubnetBySubnet.get(sn)!.push(h)
    }
    const isWorkloadType = (h: ConvergenceHop) => {
      const t = (h.node_type || "").toLowerCase()
      return t === "ec2instance" || t === "lambdafunction" || t === "rdsinstance"
    }
    // First pass: position EVERY workload from the topology snapshot so
    // the canvas reflects what Neo4j has, not just what the paths touch.
    // Each subnet's `workloads` come from /api/topology-aws which reads
    // (w)-[:IN_SUBNET]->(s) edges. Path-touched workloads will overwrite
    // these positions later if they end up in different subnets.
    for (const layout of vpcLayouts) {
      for (const sn of layout.info.subnets) {
        const box = subnetBoxes.get(sn.id)
        if (!box) continue
        const topoWorkloads = sn.workloads ?? []
        const colsW = 4
        const strideW = Math.max(80, Math.floor((box.w - 50) / colsW))
        const startX = box.x + 32
        const startY = box.y + 36
        topoWorkloads.forEach((w, i) => {
          const id = w.id
          if (!id) return
          pos[id] = {
            x: startX + (i % colsW) * strideW,
            y: startY + Math.floor(i / colsW) * 38,
          }
        })
      }
    }

    // Second pass: position path-touched chips in their subnet box. These
    // ride alongside topology workloads but get bright colors in render.
    inSubnetBySubnet.forEach((chips, snId) => {
      const box = subnetBoxes.get(snId)
      if (!box) return
      // Split workloads from metadata.
      const workloads = chips.filter(isWorkloadType)
      const meta = chips.filter((h) => !isWorkloadType(h))
      const colsW = 4
      const strideW = Math.max(80, Math.floor((box.w - 50) / colsW))
      const startX = box.x + 32
      const startY = box.y + 36
      // Path-touched workloads keep their topology-assigned position when
      // present (matched by id). Otherwise grid into the top band.
      const topoIds = new Set((vpcLayouts
        .flatMap((vl) => vl.info.subnets)
        .find((s) => s.id === snId)?.workloads ?? []).map((w) => w.id))
      let gridIdx = 0
      workloads.forEach((h) => {
        if (topoIds.has(h.node_id) && pos[h.node_id]) return
        pos[h.node_id] = {
          x: startX + (gridIdx % colsW) * strideW,
          y: startY + Math.floor(gridIdx / colsW) * 38,
        }
        gridIdx++
      })
      // Metadata strip — smaller stride, sits at the box bottom so it
      // doesn't push workloads around.
      const colsM = 8
      const strideM = Math.max(50, Math.floor((box.w - 40) / colsM))
      const metaY = box.y + box.h - 20
      meta.forEach((h, i) => {
        pos[h.node_id] = {
          x: startX + (i % colsM) * strideM,
          y: metaY,
        }
      })
    })

    // ── Identity hops — placed adjacent to the workload they secure ──
    // For each identity hop, walk paths to find its associated workload
    // (EC2/Lambda/RDS — the closest preceding workload hop in the same
    // path). Position the identity chip below that workload chip so the
    // role/profile reads as "owned by this workload" without ambiguity.
    // Falls back to the VPC's identity band when no workload is found
    // (orphan roles, paths starting from an identity).
    const identityToWorkload = new Map<string, string>()
    const workloadTypes = new Set(["ec2instance", "lambdafunction", "rdsinstance"])
    for (const p of data.paths) {
      let lastWorkload: string | null = null
      for (const h of p.hops) {
        const t = (h.node_type || "").toLowerCase()
        if (workloadTypes.has(t)) {
          lastWorkload = h.node_id
          continue
        }
        const plane = (h.plane || "").toLowerCase()
        if (plane === "identity" && lastWorkload && !identityToWorkload.has(h.node_id)) {
          identityToWorkload.set(h.node_id, lastWorkload)
        }
      }
    }
    // Lookup table for clamping identity chips to their host VPC bounds.
    const vpcBoundsById = new Map<string, { x: number; y: number; w: number; h: number }>()
    for (const layout of vpcLayouts) {
      vpcBoundsById.set(layout.info.vpc.id, {
        x: layout.x,
        y: layout.y,
        w: layout.w,
        h: layout.h,
      })
    }
    const identityByVpc = new Map<string, ConvergenceHop[]>()
    const identityStackByWorkload = new Map<string, number>()
    for (const h of byBucket.identity) {
      const workloadId = identityToWorkload.get(h.node_id)
      const workloadPos = workloadId ? pos[workloadId] : null
      if (workloadPos) {
        const stack = identityStackByWorkload.get(workloadId!) ?? 0
        // Clamp the identity chip to stay inside the workload's VPC frame
        // so role chips never spill onto the left margin (no off-canvas).
        const vpcId = hopToVpc.get(workloadId!) ?? null
        const vpc = vpcId ? vpcBoundsById.get(vpcId) : null
        let ix = workloadPos.x
        let iy = workloadPos.y + 46 + stack * 32
        if (vpc) {
          const minX = vpc.x + 24
          const maxX = vpc.x + vpc.w - 24
          const minY = vpc.y + 28
          const maxY = vpc.y + vpc.h - 22
          ix = Math.max(minX, Math.min(maxX, ix))
          iy = Math.max(minY, Math.min(maxY, iy))
        }
        pos[h.node_id] = { x: ix, y: iy }
        identityStackByWorkload.set(workloadId!, stack + 1)
        continue
      }
      const v = hopToVpc.get(h.node_id) ?? vpcLayouts[0]?.info.vpc.id ?? "_"
      if (!identityByVpc.has(v)) identityByVpc.set(v, [])
      identityByVpc.get(v)!.push(h)
    }
    identityByVpc.forEach((chips, vpcId) => {
      const band = vpcIdentityBand.get(vpcId)
      if (!band) {
        chips.forEach((h, i) => {
          pos[h.node_id] = { x: 80 + (i % 6) * 75, y: 730 - Math.floor(i / 6) * 28 }
        })
        return
      }
      const stride = Math.max(60, Math.floor((band.w - 20) / 8))
      chips.forEach((h, i) => {
        pos[h.node_id] = { x: band.x + 20 + (i % 7) * stride, y: band.y }
      })
    })

    // ── Network-unknown hops — bottom strip below all VPCs, honest cluster ──
    byBucket.network_unknown.forEach((h, i) => {
      pos[h.node_id] = { x: 80 + (i % 7) * 70, y: 728 + Math.floor(i / 7) * 22 }
    })

    // ── Data plane hops (non-crown-jewel) — off-VPC band, lower ──
    byBucket.data.forEach((h, i) => {
      pos[h.node_id] = { x: 920, y: 460 + i * 60 }
    })

    // ── Crown jewels — off-VPC band, upper ──
    byBucket.crown_jewel.forEach((h, i) => {
      pos[h.node_id] = { x: 920, y: 170 + i * 80 }
    })

    // ── Other — top-left fallback so they're not silently lost ──
    byBucket.other.forEach((h, i) => {
      pos[h.node_id] = { x: 40, y: 730 - i * 28 }
    })

    // Selected jewel always gets a position even if it wasn't traversed.
    const jewelKey = jewel.canonical_id ?? jewel.id
    if (!pos[jewelKey]) {
      pos[jewelKey] = { x: 920, y: 170 + byBucket.crown_jewel.length * 80 }
    }
    return pos
  }, [data.paths, jewel.canonical_id, jewel.id, containment])

  // Set of every node_id that appears in any path hop — used to decide if a
  // topology entity should render bright (in a path) or muted (just exists).
  const pathHopIds = useMemo(
    () => new Set(data.paths.flatMap((p) => p.hops.map((h) => h.node_id))),
    [data.paths],
  )

  // Recompute VPC layouts for the SVG render (same math as positions block).
  const vpcLayouts = useMemo(() => {
    const REGION_X = 46
    const REGION_W = 814
    const REGION_INNER_TOP = 108
    const REGION_INNER_H = 612
    const VPC_GAP = 10
    const weights = containment.vpcsToRender.map((v) =>
      Math.max(1, v.subnets.length),
    )
    const totalW = weights.reduce((s, w) => s + w, 0) || 1
    const totalGap = Math.max(0, containment.vpcsToRender.length - 1) * VPC_GAP
    const availableH = REGION_INNER_H - totalGap
    return containment.vpcsToRender.map((v, i) => {
      const h = Math.floor((weights[i] / totalW) * availableH)
      const y =
        REGION_INNER_TOP +
        weights
          .slice(0, i)
          .reduce(
            (s, w) => s + Math.floor((w / totalW) * availableH) + VPC_GAP,
            0,
          )
      const EGRESS_W = 100
      return {
        info: v,
        x: REGION_X,
        y,
        w: REGION_W - EGRESS_W,
        h,
        egressX: REGION_X + REGION_W - EGRESS_W + 24,
      }
    })
  }, [containment.vpcsToRender])

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

      {/* ── Per-VPC frames stacked vertically ─────────────────────────── */}
      {vpcLayouts.map((vl) => {
        const azPart = vl.info.azs.length ? ` · AZ ${vl.info.azs.join(" · ")}` : ""
        const vpcLabel = `VPC · ${shortLabel(vl.info.vpc.name || vl.info.vpc.id, 22)}${vl.info.vpc.cidr ? ` · ${vl.info.vpc.cidr}` : ""}${azPart}`
        // Topology-level IGWs / VPCEs attached to this VPC. Rendered at the
        // VPC's right egress slot — always shown, dim when no path uses
        // them so the operator sees the full topology, not the path slice.
        const vpcIgws = vl.info.vpc.internet_gateways ?? []
        const vpcVpces = vl.info.vpc.vpc_endpoints ?? []
        return (
          <g key={vl.info.vpc.id}>
            <Container x={vl.x} y={vl.y} w={vl.w} h={vl.h} stroke={T.vpc} label={vpcLabel} />
            {/* subnet lanes inside this VPC */}
            {vl.info.subnets.length > 0 ? (
              vl.info.subnets.map((sn, si) => {
                const laneH = Math.max(48, Math.floor((vl.h - 54) / vl.info.subnets.length))
                return (
                  <SubnetLane
                    key={sn.id}
                    x={vl.x + 10}
                    y={vl.y + 28 + si * laneH}
                    w={vl.w - 20}
                    h={laneH - 4}
                    subnet={sn}
                  />
                )
              })
            ) : (
              <text
                x={vl.x + 18}
                y={vl.y + vl.h / 2}
                fontSize={11}
                fill={T.textFaint}
                fontFamily="ui-monospace,monospace"
              >
                No subnets in topology snapshot
              </text>
            )}
            {/* identity band label */}
            <text
              x={vl.x + 14}
              y={vl.y + vl.h - 24}
              fontSize={8.5}
              fontWeight={700}
              fill={T.identity}
              style={{ letterSpacing: "0.08em" }}
            >
              IDENTITY · profiles + roles
            </text>
            {/* Topology-level IGW / VPCE chips at the right egress slot.
               Always rendered from the topology snapshot; muted when no
               path uses them. */}
            {vpcIgws.map((g, i) => {
              const inPath = !!(g.id && positions[g.id])
              if (inPath) return null // path-hop renderer will draw it bright
              return (
                <NodeChip
                  key={`vpc-igw-${vl.info.vpc.id}-${g.id ?? i}`}
                  x={vl.egressX}
                  y={vl.y + 50 + i * 50}
                  iconKind="igw"
                  label={shortLabel(g.name || g.id || "IGW", 16)}
                  ring={T.sevHigh}
                  bright={false}
                />
              )
            })}
            {vpcVpces.map((g, i) => {
              const inPath = !!(g.id && positions[g.id])
              if (inPath) return null
              return (
                <NodeChip
                  key={`vpc-vpce-${vl.info.vpc.id}-${g.id ?? i}`}
                  x={vl.egressX}
                  y={vl.y + vl.h - 70 - i * 50}
                  iconKind="vpce"
                  label={shortLabel(g.name || g.id || "VPCE", 16)}
                  ring={T.observed}
                  bright={false}
                />
              )
            })}
            {/* Topology-level workloads from subnet.workloads[]. Muted unless
               a path hop touches them. Their positions were assigned in the
               positions[] block above so chip positioning here matches. */}
            {vl.info.subnets.flatMap((sn) =>
              (sn.workloads ?? []).map((w) => {
                if (!w.id) return null
                const inPath = pathHopIds.has(w.id)
                if (inPath) return null // bright render below handles it
                const p = positions[w.id]
                if (!p) return null
                const kind: IconKind =
                  (w.type || "").toLowerCase().includes("lambda")
                    ? "lambda"
                    : (w.type || "").toLowerCase().includes("rds")
                      ? "rds"
                      : "ec2"
                return (
                  <NodeChip
                    key={`topo-wl-${w.id}`}
                    x={p.x}
                    y={p.y}
                    iconKind={kind}
                    label={shortLabel(w.name || w.id, 16)}
                    ring={T.textFaint}
                    bright={false}
                  />
                )
              }),
            )}
          </g>
        )
      })}

      {/* off-VPC column header */}
      <OffVpcLabel cx={920} y={148} />

      {/* off-snapshot indicator — honest about subnets paths reference that
         aren't in the topology snapshot. Lives in a footer band so it
         doesn't overlap any VPC content. */}
      {containment.offSnapshotSubnetIds.length > 0 && (
        <g>
          <rect
            x={36}
            y={744}
            width={820}
            height={14}
            rx={3}
            fill="rgba(229,72,77,0.08)"
            stroke={T.sevHigh}
            strokeOpacity={0.5}
            strokeDasharray="3 3"
          />
          <text
            x={46}
            y={754}
            fontSize={9}
            fill={T.sevHigh}
            fontFamily="ui-monospace,monospace"
          >
            {containment.offSnapshotSubnetIds.length} subnet(s) referenced by paths but missing from topology snapshot
          </text>
        </g>
      )}

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
        // Tighter chip labels to reduce horizontal overlap when chips
        // cluster (e.g. multiple EC2 instances in one subnet box).
        const label = shortLabel(hop.name || hop.node_id, 16)
        return (
          <NodeChip
            key={nodeId}
            x={p.x}
            y={p.y}
            iconKind={hopIconKind(hop)}
            label={label}
            ring={ring}
            bright={true}
            crown={isJewel}
          />
        )
      })}

      {/* edges — each path gets its own color so the operator can trace
         which workload uses which IGW vs VPCE. Selected path gets full
         opacity + thicker stroke; unselected paths dim. Configured-only
         edges (no observed traffic) stay dashed regardless of color. */}
      {data.paths.map((p, i) => {
        const dim = selectedPathIdx != null && selectedPathIdx !== i
        const obs = p.confidence === "observed"
        const color = pathColor(i)
        const op = dim ? 0.08 : obs ? 0.95 : 0.65
        const sw = selectedPathIdx === i ? 3.5 : obs ? 2.4 : 1.6
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
              />
              {obs && op > 0.5 && (
                <circle r={2.5} fill={color} filter="url(#tag-glow)">
                  <animateMotion dur="2.4s" repeatCount="indefinite" path={d} />
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

function SubnetLane({
  x,
  y,
  w,
  h,
  subnet,
}: {
  x: number
  y: number
  w: number
  h: number
  subnet: TopologySubnet
}) {
  const isPublic = subnet.is_public === true
  const isPrivate = subnet.is_public === false
  const color = isPublic ? T.publicLane : isPrivate ? T.privateLane : T.textFaint
  const tint = isPublic
    ? "rgba(79,174,111,0.06)"
    : isPrivate
      ? "rgba(58,110,165,0.07)"
      : "rgba(140,140,140,0.04)"
  const kindLabel = isPublic ? "PUBLIC" : isPrivate ? "PRIVATE" : "VISIBILITY UNKNOWN"
  const name = shortLabel(subnet.name || subnet.id, 38)
  const cidr = subnet.cidr ? ` · ${subnet.cidr}` : ""
  const rt = subnet.route_table_id
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={6}
        fill={tint}
        stroke={color}
        strokeWidth={1}
        strokeOpacity={0.5}
      />
      <text
        x={x + 10}
        y={y + 14}
        fontSize={9.5}
        fontWeight={700}
        fill={color}
        style={{ letterSpacing: "0.04em" }}
      >
        {kindLabel} · {name}
        {cidr}
      </text>
      {/* Route table tag — real :Subnet.route_table_id from topology-aws.
         Rendered at the top-right of the subnet box so it reads as "this
         subnet's RT" without competing with the workload chips inside. */}
      {rt ? (
        <g>
          <rect
            x={x + w - 116}
            y={y + 4}
            width={108}
            height={14}
            rx={3}
            fill="rgba(76,141,255,0.10)"
            stroke={T.sevLow}
            strokeWidth={0.8}
            strokeOpacity={0.55}
          />
          <IconGlyph x={x + w - 105} y={y + 11} kind="routetable" color={T.sevLow} />
          <text
            x={x + w - 92}
            y={y + 14}
            fontSize={8.6}
            fontWeight={600}
            fill={T.sevLow}
            fontFamily="ui-monospace,monospace"
          >
            RT · {shortLabel(rt, 14)}
          </text>
        </g>
      ) : null}
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

function NodeChip({
  x,
  y,
  iconKind,
  label,
  ring,
  bright,
  crown,
}: {
  x: number
  y: number
  iconKind: IconKind
  label: string
  ring: string
  bright: boolean
  crown?: boolean
}) {
  const op = bright ? 1 : 0.35
  return (
    <g opacity={op}>
      <ellipse cx={x} cy={y + 14} rx={16} ry={4} fill="#000" fillOpacity={0.25} />
      {crown ? (
        <circle
          cx={x}
          cy={y}
          r={36}
          fill="rgba(229,72,77,0.08)"
          stroke={T.sevCritical}
          strokeWidth={1}
          strokeDasharray="3 4"
        />
      ) : null}
      <circle cx={x} cy={y} r={14} fill={T.surface2} stroke={ring} strokeWidth={1.6} />
      <IconGlyph x={x} y={y} kind={iconKind} color={ring} />
      <text
        x={x}
        y={y + 26}
        textAnchor="middle"
        fontSize={8.8}
        fontWeight={500}
        fill={T.text}
        fillOpacity={0.9}
        fontFamily="ui-monospace, monospace"
      >
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
              <RailJewelIcon type={j.type} color={sevColor} />
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

/** Small inline-SVG icon for the crown-jewel rail cards. Wraps <IconGlyph>
 *  inside an HTML-embeddable 18×18 SVG so the rail (HTML, not SVG canvas)
 *  can render the same icon vocabulary the canvas uses. */
function RailJewelIcon({ type, color }: { type: string; color: string }) {
  const t = (type || "").toUpperCase().replace(/\s+/g, "")
  const kind: IconKind =
    t.includes("S3") ? "s3"
      : t.includes("KMS") ? "kms"
      : t.includes("DYNAMO") ? "dynamodb"
      : t.includes("RDS") || t.includes("AURORA") ? "rds"
      : t.includes("SECRET") ? "secret"
      : "generic"
  return (
    <svg
      width={18}
      height={18}
      viewBox="-9 -9 18 18"
      style={{ display: "inline-block", flex: "0 0 auto" }}
    >
      <IconGlyph x={0} y={0} kind={kind} color={color} />
    </svg>
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
        // Path color matches the canvas edge color so the operator can
        // visually trace which workload uses which IGW/VPCE.
        const edgeColor = pathColor(originalIndex)
        return (
          <button
            key={p.path_id}
            type="button"
            onClick={() => onSelect(active ? null : originalIndex)}
            onMouseEnter={() => {
              if (selectedIdx == null) onSelect(originalIndex)
            }}
            onMouseLeave={() => {
              if (selectedIdx === originalIndex) onSelect(null)
            }}
            className="block w-full cursor-pointer text-left transition-colors"
            style={{
              background: active ? T.surface2 : "transparent",
              borderLeft: `4px solid ${edgeColor}`,
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
