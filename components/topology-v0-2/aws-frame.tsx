"use client"

/**
 * Topology v0.2 — AWS canonical-frame canvas (light theme port).
 *
 * Renders the canonical AWS architecture diagram as scaffold + places
 * Neo4j-confirmed workloads into the correct (AZ × tier) cells. Always
 * uses the same Cloud → Region → VPC → AZ × (Web / App / Data) structure
 * the operator already knows.
 *
 * Phase A (this file):
 *   - Light theme matching the deleted v0.2-estate design mockup's palette
 *     (--cy-navy headline, --tier-web/app/data pastel rows, subnet-public
 *     mint, subnet-private sky, AWS-frame slate borders).
 *   - AZ collapse: only renders AZs that carry >=1 subnet for the current
 *     system's primary VPC (drops empty demo / cross-VPC AZs). Generic
 *     across systems — not specific to any one customer's account.
 *   - Bigger workload chips + bigger subnet cells.
 *   - Black tier sidebars labeled WEB TIER / APPLICATION TIER / DATABASE
 *     TIER for orientation.
 *   - Encoding legend at the bottom (carmine halo = Worst etc).
 *
 * Phase B (follow-up) will add:
 *   - SG containers inside subnets (needs SG metadata in vpc_topology).
 *   - IAM control-plane strip at the bottom (needs IAMRole rollup).
 *   - Animated SVG flow lines (needs ACTUAL_TRAFFIC edges).
 *
 * Per CLAUDE.md rule #1 the scaffold is structural — service icons only
 * appear when Neo4j confirms the resource. Empty cells stay drawn with
 * honest copy.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  type IamRoleRollup,
  type ScoreTier,
  type SecurityGroupMeta,
  SIGNAL_LABEL,
  type SubnetMeta,
  type SubnetTier,
  type TopologyNode,
  type TrafficEdge,
  type TrafficEdgeClass,
  type VpcTopology,
} from "./types"
import { normalizeVpcTopology } from "./normalize-topology"
import { createMap } from "./native-map"
import type { EstateFlowMode } from "./estate-flow-edges"
import {
  ALB_HEADER_TYPES,
  RDS_TYPES,
  REGIONAL_EDGE_SERVICE_TYPES,
  SERVERLESS_TYPES,
  SYNTHETIC_TIER_TYPES,
} from "./estate-placement"
import {
  chipRole,
  chipSizeForRole,
  planGlanceCell,
  shouldGlanceStackRail,
  shouldShowStackDepth,
  type ChipSize,
  type ServiceStack,
  type ViewDensity,
} from "./estate-glance"
import { awsIconUrl, awsServiceLabel } from "./aws-architecture-icons"

interface Props {
  vpcTopology: VpcTopology
  /** Filtered/scoped nodes for subnet grid, edge rail, and traffic edges. */
  nodes: TopologyNode[]
  /**
   * Full system node list for the serverless tier — MUST NOT be VPC-scoped or
   * FilterRail-filtered. Serverless Lambdas have no vpc_id and must always
   * appear in the SERVERLESS · OUTSIDE VPC tier regardless of map scope.
   */
  serverlessSourceNodes?: TopologyNode[]
  /**
   * Full system node list for the regional data tier — MUST NOT be VPC-scoped or
   * FilterRail-filtered. S3/KMS/DDB/RDS/Secrets are regional services and must
   * always appear in REGIONAL DATA SERVICES regardless of map scope.
   */
  regionalDataSourceNodes?: TopologyNode[]
  /** Lane 3 — overlay edges (dep-map all access or IAP attack paths). Falls back to trafficEdges. */
  overlayEdges?: TrafficEdge[]
  flowMode?: EstateFlowMode
  onFlowModeChange?: (mode: EstateFlowMode) => void
  attackPathFlowCount?: number
  trafficEdges?: TrafficEdge[]
  selectedNodeId: string | null
  highlightedRoleName?: string | null
  onSelect: (id: string) => void
  /**
   * Presentation mode (fullscreen map): hide diagnostic sections below the
   * AWS frame (Outside-VPC Lambdas, Stale workloads, IAM control-plane
   * strip, Traffic flow band, Encoding legend) and apply a small compact
   * layout pass on the frame itself. Inline page keeps everything.
   *
   * NO `transform: scale` — overlays measure live DOM rects, and a scaled
   * parent collapses their coordinate system (see reverted PR #227).
   */
  /**
   * When true (All VPCs · Compare picker), subnet grid uses the full unscoped
   * node list and does not hide subnets from non-primary VPCs in the frame.
   */
  mergedVpcView?: boolean
  /** AZ ids hidden by the operator — remaining columns expand to fill the grid. */
  hiddenAzs?: string[]
  presentationMode?: boolean
  /**
   * Fit-to-viewport zoom factor. The fullscreen host wraps this frame in a
   * `transform: scale()` container; AwsFrame does NOT apply the transform, it
   * only forwards the factor to FlowOverlay so the animated edges undo the
   * scale ((rect - origin) / scale) and stay pinned to chips at any zoom —
   * retiring the PR #227 no-scale constraint. Default 1 = inline page, no change.
   */
  scale?: number
  /**
   * At Fit zoom, chips are unreadable at full density. When true, cells with
   * more than DENSITY_STACK_THRESHOLD same-type workloads collapse into an
   * icon + count stack tile, and the right rails group by service type. Full
   * cards return at 100%. Driven by the host from the live zoom (P0-B).
   * Ignored when viewDensity is "glance" (Glance always uses role hierarchy).
   */
  densityCollapsed?: boolean
  /**
   * Architecture density mode (generic — any system).
   * - glance (default): mutual services → one icon + ×N; click opens detail.
   * - inventory: same small-icon language, one icon per real node; click opens detail.
   */
  viewDensity?: ViewDensity
  /** Business system name — used in All VPCs · Compare architecture strip. */
  systemLabel?: string
}

/** @deprecated use REGIONAL_EDGE_SERVICE_TYPES from estate-placement */
const EDGE_SERVICE_TYPES = REGIONAL_EDGE_SERVICE_TYPES
const LAMBDA_ARN_PREFIX = "arn:aws:lambda:"

/** One chip per function — twins share display name even when ids/ARNs differ. */
function lambdaFunctionKey(node: TopologyNode): string | null {
  if (!node.type || !SERVERLESS_TYPES.has(node.type)) return null
  return node.name
}

/** Prefer the node operators should trust: arn-keyed, live, scored. */
function lambdaSurvivorRank(node: TopologyNode): number {
  let rank = 0
  if (node.id.startsWith(LAMBDA_ARN_PREFIX)) rank += 1_000
  if (!node.stale) rank += 500
  if (node.score?.value != null) rank += node.score.value
  return rank
}

/**
 * BE-12 interim: one canvas chip per logical Lambda function. Collapses
 * arn-null :Service twins, duplicate ids, and any other graph drift that
 * returns multiple nodes for the same function name/ARN.
 */
export function dedupeLambdaServiceTwins(source: TopologyNode[]): TopologyNode[] {
  const bestByKey = new Map<string, TopologyNode>()

  for (const n of source) {
    const key = lambdaFunctionKey(n)
    if (!key) continue
    const prev = bestByKey.get(key)
    if (!prev || lambdaSurvivorRank(n) > lambdaSurvivorRank(prev)) {
      bestByKey.set(key, n)
      continue
    }
    if (
      lambdaSurvivorRank(n) === lambdaSurvivorRank(prev)
      && n.id.startsWith(LAMBDA_ARN_PREFIX)
      && !prev.id.startsWith(LAMBDA_ARN_PREFIX)
    ) {
      bestByKey.set(key, n)
    }
  }

  if (bestByKey.size === 0) return source

  const keptIds = new Set([...bestByKey.values()].map(n => n.id))
  return source.filter(n => {
    const key = lambdaFunctionKey(n)
    if (!key) return true
    return keptIds.has(n.id)
  })
}

const TIER_SIDEBAR_WIDTH = { compact: "28px", normal: "32px" } as const
/** Minimum AZ column width — keep readable but leave room for VPCE + flow corridor + edge rail. */
const AZ_COLUMN_MIN_PX = 118

/** Dedicated ALB glyph — AWS Architecture Icon–style fan-out. */
function AlbGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="6" r="3" fill="currentColor" />
      <circle cx="5" cy="18" r="2.4" fill="currentColor" />
      <circle cx="12" cy="18" r="2.4" fill="currentColor" />
      <circle cx="19" cy="18" r="2.4" fill="currentColor" />
      <path
        d="M12 9V13M12 13L5 15.8M12 13L12 15.6M12 13L19 15.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Compact AWS-style service glyphs (icon language, not emoji). */
function AwsServiceGlyph({
  kind,
  size = 18,
}: {
  kind: "ec2" | "lambda" | "rds" | "s3" | "ddb" | "igw" | "nat"
  size?: number
}) {
  const common = { width: size, height: size, viewBox: "0 0 48 48", fill: "none" as const, "aria-hidden": true as const }
  switch (kind) {
    case "ec2":
      return (
        <svg {...common}>
          <rect x="10" y="12" width="28" height="24" rx="2" fill="currentColor" fillOpacity={0.95} />
          <rect x="14" y="16" width="8" height="6" fill="#232F3E" />
          <rect x="26" y="16" width="8" height="6" fill="#232F3E" />
          <rect x="14" y="26" width="20" height="3" fill="#232F3E" />
        </svg>
      )
    case "lambda":
      return (
        <svg {...common}>
          <path d="M14 36L22 12h6l8 24h-6.2l-1.4-4.2H21.6L20.2 36H14zm8.8-9.2h6.4L26 16.8 22.8 26.8z" fill="currentColor" />
        </svg>
      )
    case "rds":
      return (
        <svg {...common}>
          <ellipse cx="24" cy="14" rx="12" ry="5" fill="currentColor" />
          <path d="M12 14v8c0 2.8 5.4 5 12 5s12-2.2 12-5v-8" stroke="currentColor" strokeWidth="2.5" />
          <path d="M12 22v8c0 2.8 5.4 5 12 5s12-2.2 12-5v-8" stroke="currentColor" strokeWidth="2.5" />
        </svg>
      )
    case "s3":
      return (
        <svg {...common}>
          <path d="M10 18l14-6 14 6-14 6-14-6z" fill="currentColor" />
          <path d="M10 18v12l14 6V24L10 18zM38 18v12l-14 6V24l14-6z" fill="currentColor" fillOpacity={0.85} />
        </svg>
      )
    case "ddb":
      return (
        <svg {...common}>
          <rect x="12" y="10" width="24" height="28" rx="3" fill="currentColor" />
          <path d="M18 18h12M18 24h12M18 30h8" stroke="#2E73B8" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      )
    case "igw":
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="10" stroke="currentColor" strokeWidth="2.5" />
          <path d="M14 24h20M24 14c4 3.5 4 16.5 0 20M24 14c-4 3.5-4 16.5 0 20" stroke="currentColor" strokeWidth="2" />
        </svg>
      )
    case "nat":
      return (
        <svg {...common}>
          <rect x="11" y="14" width="26" height="20" rx="3" fill="currentColor" />
          <path d="M18 24h12M27 20l4 4-4 4" stroke="#8C4FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
  }
}

function regionPrefix(az: string | null | undefined): string | null {
  if (!az) return null
  const i = az.lastIndexOf("-")
  return i > 0 ? az.slice(0, i) : null
}

/** Primary region from real VPC subnets — used to drop cross-region demo scaffold. */
function primaryRegionFromSubnets(subnets: SubnetMeta[], vpcId: string | null): string | null {
  for (const s of subnets) {
    if (vpcId && s.vpc_id === vpcId && s.az) return regionPrefix(s.az)
  }
  for (const s of subnets) {
    if (s.vpc_id && s.az) return regionPrefix(s.az)
  }
  return null
}

function subnetInCanvasScope(
  s: SubnetMeta,
  vpcId: string | null,
  primaryRegion: string | null,
): boolean {
  if (!s.az) return false
  if (vpcId && s.vpc_id && s.vpc_id !== vpcId) return false
  if (vpcId && !s.vpc_id && primaryRegion) {
    const prefix = regionPrefix(s.az)
    if (prefix && prefix !== primaryRegion) return false
  }
  return true
}

/** Block cross-VPC synthetic placement when a single VPC card is selected. */
function workloadInCanvasVpc(
  n: TopologyNode,
  canvasVpcId: string | null,
  subnetById: Map<string, SubnetMeta>,
): boolean {
  if (!canvasVpcId) return true
  if (n.vpc_id && n.vpc_id !== canvasVpcId) return false
  if (n.subnet_id) {
    const sub = subnetById.get(n.subnet_id)
    if (sub?.vpc_id && sub.vpc_id !== canvasVpcId) return false
  }
  return true
}

/** AZ columns available for the current VPC / merged canvas scope. */
export function listTopologyAzs(
  subnets: SubnetMeta[],
  canvasVpcId: string | null,
): string[] {
  const primaryRegion = primaryRegionFromSubnets(subnets, canvasVpcId)
  const azs = new Set<string>()
  for (const s of subnets) {
    if (!subnetInCanvasScope(s, canvasVpcId, primaryRegion)) continue
    if (s.az) azs.add(s.az)
  }
  return [...azs].sort()
}

/** Apply operator-hidden AZs; never hide every column. */
export function visibleTopologyAzs(allAzs: string[], hiddenAzs: Iterable<string>): string[] {
  const hidden = new Set(hiddenAzs)
  if (hidden.size === 0) return allAzs
  const visible = allAzs.filter(az => !hidden.has(az))
  return visible.length > 0 ? visible : allAzs
}

/** Lambdas with no resolvable subnet/AZ — VPC scope and FilterRail must not hide these. */
export function extractServerlessOutsideVpc(
  source: TopologyNode[],
  subnets: SubnetMeta[],
): TopologyNode[] {
  const subnetById = createMap(subnets.map(s => [s.id, s]))
  const out: TopologyNode[] = []
  for (const n of dedupeLambdaServiceTwins(source)) {
    if (n.stale) continue
    if (!n.type || !SERVERLESS_TYPES.has(n.type)) continue
    const sub = n.subnet_id ? subnetById.get(n.subnet_id) : null
    if (sub?.az) continue
    out.push(n)
  }
  out.sort((a, b) => (a.score?.rank ?? 999) - (b.score?.rank ?? 999))
  return out
}

/** Regional edge services (S3/KMS/DDB/Secrets) — right rail, not VPC grid. RDS is VPC-bound → data tier. */
export function extractRegionalDataServices(source: TopologyNode[]): TopologyNode[] {
  const out: TopologyNode[] = []
  for (const n of source) {
    if (n.stale) continue
    if (!n.type || !REGIONAL_EDGE_SERVICE_TYPES.has(n.type)) continue
    out.push(n)
  }
  out.sort((a, b) => (a.score?.rank ?? 999) - (b.score?.rank ?? 999))
  return out
}

// Friendly metadata for the VPCE boundary chips. The AWS service-name
// suffix (e.g. "com.amazonaws.eu-west-1.s3" → "s3") maps to a label,
// the canonical endpoint type, and a one-line operator-facing purpose
// so a SOC analyst can read the canvas without already knowing what
// each PrivateLink endpoint enables.
//
// Endpoint type is also returned by the BE in `vpc_topology.edges.vpces[i].endpoint_type`;
// we fall back to that when the suffix isn't in the table, but for the
// common services keeping the type here makes the canvas robust to
// missing/blank values from older collectors.
type VpceServiceMeta = { label: string; type: "Gateway" | "Interface"; purpose: string }
const VPCE_SERVICE_META: Record<string, VpceServiceMeta> = {
  s3: { label: "Amazon S3", type: "Gateway", purpose: "Private S3 access without NAT/IGW" },
  dynamodb: { label: "Amazon DynamoDB", type: "Gateway", purpose: "Private DynamoDB API access" },
  ssm: { label: "AWS Systems Manager", type: "Interface", purpose: "Private SSM API · Session Manager" },
  ssmmessages: { label: "SSM Messages", type: "Interface", purpose: "Session Manager message channel" },
  ec2messages: { label: "EC2 Messages", type: "Interface", purpose: "SSM agent heartbeats" },
  ec2: { label: "Amazon EC2 API", type: "Interface", purpose: "Private EC2 API access" },
  kms: { label: "AWS KMS", type: "Interface", purpose: "Encryption key API" },
  secretsmanager: { label: "Secrets Manager", type: "Interface", purpose: "Private secret retrieval" },
  ecr: { label: "Amazon ECR API", type: "Interface", purpose: "Container registry API" },
  "ecr.dkr": { label: "ECR Docker", type: "Interface", purpose: "Container image pulls" },
  logs: { label: "CloudWatch Logs", type: "Interface", purpose: "Log ingestion" },
  monitoring: { label: "CloudWatch", type: "Interface", purpose: "Metric ingestion" },
  events: { label: "EventBridge", type: "Interface", purpose: "Event bus API" },
  sns: { label: "Amazon SNS", type: "Interface", purpose: "Topic publish" },
  sqs: { label: "Amazon SQS", type: "Interface", purpose: "Queue API" },
  sts: { label: "AWS STS", type: "Interface", purpose: "Token / role-assume" },
  lambda: { label: "AWS Lambda API", type: "Interface", purpose: "Invoke / manage functions" },
  rds: { label: "Amazon RDS API", type: "Interface", purpose: "RDS control-plane" },
  athena: { label: "Amazon Athena", type: "Interface", purpose: "Query API" },
  "execute-api": { label: "API Gateway", type: "Interface", purpose: "Private API Gateway routing" },
}

/**
 * PrivateLink-style VPCE icon — solid purple square background with a
 * white shield-and-arrow inner glyph (mirrors the AWS official
 * VPC Endpoint icon language: a "gated portal" between the VPC and a
 * regional service). Same icon for every VPCE — service identity lives
 * in the chip text — so the boundary strip stays scannable.
 */
function VpceIcon({ size = 32 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ display: "block" }}
    >
      {/* Purple rounded-square plate — AWS PrivateLink palette */}
      <rect x="1" y="1" width="30" height="30" rx="5" fill="#7E3FF2" />
      {/* Shield outline — the "gate" */}
      <path
        d="M16 6 L23.5 9 L23.5 16 C23.5 20 20 23 16 25 C12 23 8.5 20 8.5 16 L8.5 9 Z"
        fill="none"
        stroke="white"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      {/* Arrow piercing through — traffic entering the endpoint */}
      <path
        d="M11 15 L18 15 M15 12 L18 15 L15 18"
        stroke="white"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}


function resolveVpceMeta(serviceName: string | null | undefined, endpointTypeFallback: string | null | undefined): VpceServiceMeta {
  // Try suffix exactly (e.g. "ecr.dkr") then last segment ("s3").
  if (serviceName) {
    const parts = serviceName.split(".")
    // Try double-segment suffix first ("ecr.dkr") then single ("s3").
    const last2 = parts.slice(-2).join(".")
    const last1 = parts[parts.length - 1]
    const hit = VPCE_SERVICE_META[last2] ?? VPCE_SERVICE_META[last1]
    if (hit) return hit
    // Unknown service — return a best-guess fallback.
    const typeGuess: "Gateway" | "Interface" =
      endpointTypeFallback?.toLowerCase() === "gateway" ? "Gateway" : "Interface"
    return {
      label: last1 ? last1.toUpperCase() : "VPCE",
      type: typeGuess,
      purpose: "Private endpoint into AWS service plane",
    }
  }
  return { label: "VPCE", type: "Interface", purpose: "Private AWS service endpoint" }
}

// Palette ported from the (now-deleted) v0.2-estate design mockup's CSS variables.
const PAL = {
  navy: "#0D1B2A",
  navy2: "#142536",
  teal: "#00C2A8",
  carmine: "#E04545",
  amber: "#F5A623",
  slate: "#5A6B7A",
  ink: "#1A2330",
  bg: "#F4F6F8",
  cardBg: "#FFFFFF",
  awsFrame: "#232F3E",
  awsOrange: "#FF9900",
  awsBlue: "#2E73B8",
  tierWeb: "#E8F5E9",
  tierApp: "#E3F2FD",
  tierDb: "#EDE7F6",
  subnetPublic: "#C8E6C9",
  subnetPrivate: "#BBDEFB",
} as const

const TIER_LABEL: Record<SubnetTier, string> = {
  web: "Public subnet (web tier)",
  app: "Private subnet (app tier)",
  data: "Private subnet (data tier)",
  unknown: "Unclassified subnet",
}

/** Short cell chrome — tier type already lives on the WEB/APP/DATA sidebar. */
const TIER_CELL_SHORT: Record<SubnetTier, string> = {
  web: "Public",
  app: "Private",
  data: "Data",
  unknown: "Subnet",
}

const TIER_SIDEBAR_LABEL: Record<Exclude<SubnetTier, "unknown">, string> = {
  web: "WEB TIER",
  app: "APPLICATION TIER",
  data: "DATABASE TIER",
}

// Tier row backgrounds — the lightest tint, used behind the AZ × tier grid.
const TIER_BG: Record<SubnetTier, string> = {
  web: PAL.tierWeb,    // mint #E8F5E9
  app: PAL.tierApp,    // sky  #E3F2FD
  data: PAL.tierDb,    // lavender #EDE7F6
  unknown: "#ECEFF1",
}

// Subnet cell backgrounds — a slightly deeper version of the row tint so the
// subnet card visually nests inside the tier row without breaking the color
// scheme. Matches the mockup's behavior where subnets share the row hue.
const SUBNET_BG: Record<SubnetTier, string> = {
  web: "#DCEFDC",   // a touch deeper than #E8F5E9
  app: "#D2E5F8",   // a touch deeper than #E3F2FD
  data: "#E0D6F0",  // a touch deeper than #EDE7F6
  unknown: "#E0E5E9",
}

// Subnet borders — yet deeper, gives the card a visible edge in the row.
const SUBNET_BORDER: Record<SubnetTier, string> = {
  web: "#A5D6A7",
  app: "#90CAF9",
  data: "#B39DDB",
  unknown: "#B0BEC5",
}

// Subnet labels — deeper still (used for the bold "Public subnet (web tier)"
// text inside each cell, plus the CIDR / subnet name).
const SUBNET_LABEL_FG: Record<SubnetTier, string> = {
  web: "#1E8E3E",   // deep green
  app: "#1565C0",   // deep blue
  data: "#4527A0",  // deep purple
  unknown: "#37474F",
}

function tierBgChip(tier: ScoreTier): string {
  switch (tier) {
    case "WORST": return "background:#E04545;color:white"
    case "HIGH":   return "background:#F36A6A;color:white"
    case "ELEVATED": return "background:#F5A623;color:#3D2A00"
    case "QUIET":  return "background:#10B981;color:white"
  }
}

function severityRing(node: TopologyNode): { ring: string; halo: string } {
  if (node.stale)        return { ring: "#9CA3AF", halo: "0 0 0 3px rgba(156,163,175,0.15)" }
  if (!node.score)       return { ring: "#CBD5E1", halo: "none" }
  switch (node.score.tier) {
    case "WORST":    return { ring: PAL.carmine, halo: "0 0 0 4px rgba(224,69,69,0.18)" }
    case "HIGH":     return { ring: PAL.carmine, halo: "0 0 0 3px rgba(224,69,69,0.12)" }
    case "ELEVATED": return { ring: PAL.amber, halo: "0 0 0 3px rgba(245,166,35,0.12)" }
    case "QUIET":    return { ring: "#10B981", halo: "0 0 0 2px rgba(16,185,129,0.10)" }
  }
}

/**
 * Prefer official AWS Architecture Icons (thesvg.org / CC BY-ND).
 * Fallback glyphs only when slug is unknown — never invents a resource.
 */
function nodeIcon(type: string | null): { symbol: ReactNode; bg: string; fg: string; official?: boolean } {
  const url = awsIconUrl(type)
  if (url) {
    return {
      symbol: (
        // eslint-disable-next-line @next/next/no-img-element -- external architecture icon CDN
        <img
          src={url}
          alt=""
          width={28}
          height={28}
          className="w-7 h-7 object-contain"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ),
      bg: "transparent",
      fg: "inherit",
      official: true,
    }
  }
  switch (type) {
    case "EC2":
      return { symbol: <AwsServiceGlyph kind="ec2" />, bg: "#FF9900", fg: "white" }
    case "Lambda":
    case "LambdaFunction":
      return { symbol: <AwsServiceGlyph kind="lambda" />, bg: "#FF9900", fg: "white" }
    case "RDS":
    case "RDSInstance":
      return { symbol: <AwsServiceGlyph kind="rds" />, bg: "#2E73B8", fg: "white" }
    case "DynamoDB":
    case "DynamoDBTable":
      return { symbol: <AwsServiceGlyph kind="ddb" />, bg: "#2E73B8", fg: "white" }
    case "S3":
    case "S3Bucket":
      return { symbol: <AwsServiceGlyph kind="s3" />, bg: "#1E8E3E", fg: "white" }
    case "KMSKey":
      return { symbol: "KMS", bg: "#DD344C", fg: "white" }
    case "Secret":
    case "SecretsManagerSecret":
      return { symbol: "SEC", bg: "#DD344C", fg: "white" }
    case "AutoScalingGroup":
    case "ASG":
      return { symbol: "ASG", bg: "#FF9900", fg: "white" }
    case "TargetGroup":
      return { symbol: "TG", bg: "#8C4FFF", fg: "white" }
    case "EventBridge":
    case "EventBridgeRule":
      return { symbol: "EB", bg: "#E7157B", fg: "white" }
    case "SQS":
    case "SQSQueue":
      return { symbol: "SQS", bg: "#FF4F8B", fg: "white" }
    case "StepFunction":
    case "StateMachine":
      return { symbol: "SFN", bg: "#E7157B", fg: "white" }
    case "ECS":
    case "ECSCluster":
    case "ECSService":
      return { symbol: "ECS", bg: "#FF9900", fg: "white" }
    case "APIGateway":
    case "ApiGateway":
      return { symbol: "APIGW", bg: "#FF4F8B", fg: "white" }
    case "LoadBalancer":
    case "ALB":
    case "ApplicationLoadBalancer":
      return { symbol: <AlbGlyph />, bg: "#8C4FFF", fg: "white" }
    default:
      return { symbol: "?", bg: "#5A6B7A", fg: "white" }
  }
}

function formatIamChipSummary(role: IamRoleRollup): string {
  if (role.correlation_state === "stale_rollup") return "recomputing"
  if (role.correlation_state === "not_correlated") return "pending"
  if (role.allowed_actions === 0 || role.gap_percentage === 0) return "clean"
  return `${role.unused_actions}/${role.allowed_actions} unused`
}

function chipLayout(size: ChipSize): {
  className: string
  iconW: number
  iconH: number
  iconFs: number
  borderW: number
  borderColor?: string
} {
  if (size === "gateway") {
    return {
      className:
        "relative flex items-center gap-2.5 rounded-md px-3 py-2 text-left transition-shadow min-w-0 max-w-[260px] hover:shadow-md",
      iconW: 40,
      iconH: 36,
      iconFs: 11,
      borderW: 2,
      borderColor: PAL.awsOrange,
    }
  }
  if (size === "compact") {
    return {
      className:
        "relative flex items-center gap-1.5 rounded-md px-2 py-1 text-left transition-shadow min-w-0 max-w-[160px] hover:shadow-md",
      iconW: 24,
      iconH: 20,
      iconFs: 8,
      borderW: 1.5,
    }
  }
  return {
    className:
      "relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-shadow min-w-0 max-w-[200px] hover:shadow-md",
    iconW: 32,
    iconH: 26,
    iconFs: 10,
    borderW: 1.5,
  }
}

function WorkloadChip({
  node, selected, onClick, iamSummary, size,
}: {
  node: TopologyNode
  selected: boolean
  onClick: () => void
  iamSummary?: string | null
  /** Visual hierarchy — gateway landmarks vs named anchors vs compact. */
  size?: ChipSize
}) {
  const stale = !!node.stale
  const { ring, halo } = severityRing(node)
  const ic = nodeIcon(node.type)
  const resolvedSize = size ?? chipSizeForRole(chipRole(node))
  const layout = chipLayout(resolvedSize)
  const placementUnknown =
    node.type != null && RDS_TYPES.has(node.type) && !node.subnet_id
  // Edge-service observed-usage line — surfaces "in use vs idle" without
  // requiring a drawable source chip. Per the operator-trust contract:
  // a bucket touched by 19 hidden Lambdas / IAMRoles must NEVER look idle
  // just because the source side isn't a topology chip.
  const isEdgeService = node.type != null && EDGE_SERVICE_TYPES.has(node.type)
  const isSharedDataResource =
    isEdgeService || (node.type != null && RDS_TYPES.has(node.type))
  const hasUsageData = node.observed_edge_count != null || node.observed_source_count != null
  const usageEdges = node.observed_edge_count ?? 0
  const usageSources = node.observed_source_count ?? 0
  // Compact badge — chips are 200px max so a 30-char line truncates. Use
  // short abbreviations; full long-form is in the tooltip.
  const usageLine = isEdgeService && hasUsageData
    ? (usageEdges === 0
      ? "no observed access"
      : `${usageSources} src · ${usageEdges} acc`)
    : null
  // Cross-system consumers of THIS shared resource (tag-scoped systems).
  const foreignSysCount = isSharedDataResource
    ? (node.foreign_consumer_system_count ?? 0)
    : 0
  const foreignSystems = node.foreign_consumer_systems ?? []
  const foreignLine =
    foreignSysCount > 0
      ? `${foreignSysCount} external system${foreignSysCount === 1 ? "" : "s"}`
      : null
  // Rich tooltip — when the BE attached a source_breakdown, show the
  // per-kind tally + top sources. Falls back to a short one-liner when
  // older BE deploys don't include the breakdown.
  const bd = node.source_breakdown
  let usageTitle = ""
  if (usageLine || foreignLine) {
    const lines: string[] = []
    if (usageLine) {
      if (bd) {
        lines.push(`Observed access: ${usageEdges} edges · ${usageSources} distinct sources`)
        lines.push("")
        const kindLines = [
          bd.visible_chip ? `${bd.visible_chip} visible workload chip${bd.visible_chip === 1 ? "" : "s"}` : null,
          bd.hidden_workload ? `${bd.hidden_workload} hidden workload${bd.hidden_workload === 1 ? "" : "s"} (snake_case-tagged Lambda/EC2)` : null,
          bd.iam_role ? `${bd.iam_role} IAM role${bd.iam_role === 1 ? "" : "s"}` : null,
          bd.iam_user ? `${bd.iam_user} IAM user${bd.iam_user === 1 ? "" : "s"}` : null,
          bd.sts_session ? `${bd.sts_session} STS session${bd.sts_session === 1 ? "" : "s"}` : null,
          bd.other ? `${bd.other} other` : null,
        ].filter((x): x is string => x !== null)
        lines.push("Source types:")
        kindLines.forEach(l => lines.push(`  • ${l}`))
        if (bd.visible_chip === 0 && usageSources > 0) {
          lines.push("")
          lines.push("No visible workload arrows.")
          lines.push("Observed sources are IAM roles or STS sessions, which")
          lines.push("are shown in evidence/detail views rather than as")
          lines.push("topology chips.")
        }
        if (bd.top_sources && bd.top_sources.length > 0) {
          lines.push("")
          lines.push("Top sources:")
          bd.top_sources.forEach(s => {
            const kindLabel = ({
              visible_chip: "Workload",
              hidden_workload: "Hidden workload",
              iam_role: "IAMRole",
              iam_user: "IAMUser",
              sts_session: "STSSession",
              other: "Other",
            } as const)[s.kind]
            lines.push(`  • ${kindLabel}: ${s.name ?? s.id ?? "?"} (${s.edge_count})`)
          })
        }
      } else {
        lines.push(
          `Observed access in graph: ${usageEdges} edges from ${usageSources} distinct sources.`,
        )
        lines.push(
          "Includes hidden sources (Lambdas, IAM roles, STS sessions) that aren't drawable workload chips.",
        )
      }
    }
    if (foreignLine) {
      if (lines.length) lines.push("")
      lines.push(`External systems using this resource (by system tag): ${foreignSysCount}`)
      foreignSystems.forEach(s => lines.push(`  • ${s}`))
      lines.push("Co-located peers without access edges are not listed.")
    }
    usageTitle = "\n\n" + lines.join("\n")
  }
  const borderColor =
    resolvedSize === "gateway"
      ? (layout.borderColor ?? ring)
      : node.is_jewel
        ? "#C9A227"
        : ring
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${node.name}${usageTitle}`}
      data-flow-id={node.id}
      data-chip-size={resolvedSize}
      className={layout.className}
      style={{
        background: node.is_jewel ? "#FFFBEB" : PAL.cardBg,
        border: `${layout.borderW}px solid ${borderColor}`,
        boxShadow: selected
          ? `0 0 0 3px ${PAL.teal}, ${halo}`
          : halo === "none" ? undefined : halo,
        opacity: stale ? 0.62 : 1,
      }}
    >
      <span
        className="flex items-center justify-center rounded-md shrink-0"
        style={{
          background: ic.official
            ? "transparent"
            : resolvedSize === "gateway"
              ? PAL.awsFrame
              : ic.bg,
          color: resolvedSize === "gateway" && !ic.official ? PAL.awsOrange : ic.fg,
          width: `${layout.iconW}px`,
          height: `${layout.iconH}px`,
          fontSize: `${layout.iconFs}px`,
          fontWeight: 700,
          letterSpacing: "0.04em",
        }}
      >
        {ic.symbol}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {node.is_jewel && (
            <span style={{ color: PAL.amber, fontSize: "11px" }} title="Crown jewel">
              ♛
            </span>
          )}
          <span className="text-[12px] font-semibold truncate" style={{ color: PAL.ink }}>
            {node.name}
          </span>
        </div>
        <div
          className="text-[10px] font-mono mt-0.5 truncate"
          style={{
            color: PAL.slate,
            // Slightly dim + italic for "no observed access" so idle reads honest
            fontStyle: usageLine === "no observed access" ? "italic" : "normal",
            opacity: usageLine === "no observed access" ? 0.75 : 1,
          }}
        >
          {iamSummary ? (
            <span style={{ color: iamSummary?.includes("0/0") || iamSummary?.includes("clean") ? "#059669" : PAL.carmine }}>
              IAM · {iamSummary}
            </span>
          ) : foreignLine ? (
            <span style={{ color: "#B45309" }} data-testid="topology-foreign-consumer-badge">
              {foreignLine}
              {usageLine && usageLine !== "no observed access" ? ` · ${usageLine}` : ""}
            </span>
          ) : (
            usageLine ?? `${node.type ?? "?"}${node.id && node.id !== node.name ? ` · ${node.id.slice(0, 24)}` : ""}`
          )}
        </div>
      </div>
      {node.score && (
        <span
          className="text-[11px] font-bold px-1.5 py-0.5 rounded shrink-0"
          style={{ ...Object.fromEntries(tierBgChip(node.score.tier).split(';').map(p => p.split(':') as [string, string])) }}
        >
          {node.score.value}
        </span>
      )}
      {placementUnknown && (
        <span
          className="text-[8px] font-bold shrink-0 px-1 py-0.5 rounded"
          style={{ background: "#FEF3C7", color: "#92400E" }}
          title="Graph has no subnet_id for this RDS — BE-11 collector gap"
        >
          subnet unknown
        </span>
      )}
      {stale && (
        <span className="text-[9px] font-bold shrink-0" style={{ color: PAL.slate }}>STALE</span>
      )}
    </button>
  )
}

function selectWorstInGroup(nodes: TopologyNode[]): TopologyNode | undefined {
  return (
    nodes.find(n => n.score?.tier === "WORST") ??
    nodes.find(n => n.score?.tier === "HIGH") ??
    nodes[0]
  )
}

/**
 * AWS diagram convention: one service icon with siblings stacked behind
 * (Lambda × N, EC2 × N, ASG × N) — not every mutual instance drawn.
 */
/** Shared icon shell for Glance stacks + Inventory per-node icons. */
function ServiceIconShell({
  type,
  selected,
  depth,
  countBadge,
  label,
  sublabel,
  title,
  onClick,
  testId,
  flowId,
  extraAttrs,
  dense = false,
}: {
  type: string | null | undefined
  selected: boolean
  depth?: boolean
  countBadge?: number
  label: string
  sublabel: string
  title: string
  onClick: () => void
  testId: string
  flowId?: string
  extraAttrs?: Record<string, string | number | undefined>
  /** Cell density — smaller glyph, drop sublabel so 1 service fits without scroll. */
  dense?: boolean
}) {
  const ic = nodeIcon(type)
  const showDepth = Boolean(depth && countBadge && countBadge > 1)
  const glyph = dense ? 28 : 36
  const stackBox = dense ? (showDepth ? 36 : 30) : showDepth ? 48 : 40
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      data-testid={testId}
      data-flow-id={flowId}
      {...extraAttrs}
      className={
        dense
          ? "relative flex flex-col items-center gap-0 min-w-[52px] max-w-[96px] px-0.5 pt-0.5 pb-0.5 rounded-md hover:bg-white/60 transition-colors shrink-0"
          : "relative flex flex-col items-center gap-0.5 min-w-[68px] max-w-[120px] px-1.5 pt-1.5 pb-1 rounded-md hover:bg-white/60 transition-colors shrink-0"
      }
      style={{
        boxShadow: selected ? `0 0 0 2px ${PAL.teal}` : undefined,
      }}
    >
      <span
        className="relative inline-flex items-center justify-center"
        style={{ width: dense ? 40 : 48, height: stackBox }}
      >
        {showDepth ? (
          <>
            <span
              className="absolute rounded-md border bg-white"
              style={{
                width: glyph,
                height: glyph,
                left: dense ? 1 : 2,
                top: dense ? 6 : 8,
                borderColor: "#CBD5E1",
                zIndex: 0,
              }}
              aria-hidden
            />
            <span
              className="absolute rounded-md border bg-white"
              style={{
                width: glyph,
                height: glyph,
                left: dense ? 3 : 5,
                top: dense ? 3 : 5,
                borderColor: "#E2E8F0",
                zIndex: 1,
              }}
              aria-hidden
            />
          </>
        ) : null}
        <span
          className="relative z-[2] flex items-center justify-center rounded-md"
          style={{
            width: glyph,
            height: glyph,
            background: ic.official ? "#FFFFFF" : ic.bg,
            border: "1px solid #E2E8F0",
            color: ic.fg,
            marginLeft: showDepth ? (dense ? 6 : 8) : 0,
          }}
        >
          {ic.symbol}
        </span>
        {showDepth ? (
          <span
            className="absolute top-0 right-0 z-[3] text-[9px] font-bold font-mono rounded-full px-1 py-0.5"
            style={{ background: PAL.awsFrame, color: "#fff", border: "1px solid #fff" }}
          >
            ×{countBadge}
          </span>
        ) : null}
      </span>
      <span
        className={
          dense
            ? "text-[9px] font-semibold text-center leading-tight truncate w-full"
            : "text-[10px] font-semibold text-center leading-tight truncate w-full"
        }
        style={{ color: PAL.ink }}
      >
        {label}
      </span>
      {!dense && sublabel ? (
        <span className="text-[9px] font-mono text-center truncate w-full" style={{ color: PAL.slate }}>
          {sublabel}
        </span>
      ) : null}
    </button>
  )
}

function ServiceStackChip({
  stack,
  selectedNodeId,
  onSelect,
  dense = false,
}: {
  stack: ServiceStack
  selectedNodeId: string | null
  onSelect: (id: string) => void
  dense?: boolean
}) {
  const depth = shouldShowStackDepth(stack)
  const selected = stack.nodes.some(n => n.id === selectedNodeId)
  const title = depth
    ? `${stack.nodes.length} × ${stack.label} (real nodes) — click to inspect`
    : `${stack.representative.name} · ${stack.label}`
  return (
    <ServiceIconShell
      type={stack.type}
      selected={selected}
      depth={depth}
      countBadge={stack.nodes.length}
      label={depth ? stack.label : stack.representative.name}
      sublabel={depth ? `${stack.nodes.length} in cell` : stack.label}
      title={title}
      onClick={() => onSelect(stack.representative.id)}
      testId="topology-service-stack"
      flowId={stack.representative.id}
      dense={dense}
      extraAttrs={{
        "data-stack-type": stack.type,
        "data-stack-count": stack.nodes.length,
        "data-flow-ids": stack.nodes.map(n => n.id).join("|"),
      }}
    />
  )
}

/** Inventory — one small icon per real node; click opens DetailPanel. */
function ServiceNodeIcon({
  node,
  selected,
  onSelect,
  dense = false,
}: {
  node: TopologyNode
  selected: boolean
  onSelect: (id: string) => void
  dense?: boolean
}) {
  const typeLabel = node.type ?? "?"
  return (
    <ServiceIconShell
      type={node.type}
      selected={selected}
      label={node.name}
      sublabel={typeLabel}
      title={`${node.name} · ${typeLabel} — click for details`}
      onClick={() => onSelect(node.id)}
      testId="topology-service-node-icon"
      flowId={node.id}
      dense={dense}
      extraAttrs={{ "data-node-id": node.id }}
    />
  )
}

function GlanceCellWorkloads({
  workloadsHere,
  selectedNodeId,
  onSelect,
  compact,
}: {
  workloadsHere: TopologyNode[]
  selectedNodeId: string | null
  onSelect: (id: string) => void
  roleForWorkload?: (nodeId: string) => IamRoleRollup | undefined
  compact?: boolean
}) {
  const plan = planGlanceCell(workloadsHere)
  return (
    <div
      className={
        compact
          ? "flex flex-wrap gap-1.5 justify-center content-center flex-1 min-h-0"
          : "flex flex-wrap gap-2 justify-center content-center flex-1 min-h-0"
      }
      data-testid="topology-cell-glance"
    >
      {plan.stacks.map(stack => (
        <ServiceStackChip
          key={stack.type}
          stack={stack}
          selectedNodeId={selectedNodeId}
          onSelect={onSelect}
          dense
        />
      ))}
    </div>
  )
}

function InventoryCellWorkloads({
  workloadsHere,
  selectedNodeId,
  onSelect,
  compact,
}: {
  workloadsHere: TopologyNode[]
  selectedNodeId: string | null
  onSelect: (id: string) => void
  compact?: boolean
}) {
  return (
    <div
      className={
        compact
          ? "flex flex-wrap gap-1.5 justify-center content-center flex-1 min-h-0"
          : "flex flex-wrap gap-2 justify-center content-center flex-1 min-h-0"
      }
      data-testid="topology-cell-inventory"
    >
      {workloadsHere.map(n => (
        <ServiceNodeIcon
          key={n.id}
          node={n}
          selected={n.id === selectedNodeId}
          onSelect={onSelect}
          dense
        />
      ))}
    </div>
  )
}

function SubnetCell({
  tier, az, subnetsHere, workloadsHere, sgIndex, selectedNodeId, onSelect,
  compact = false, roleForWorkload, densityCollapsed = false,
  viewDensity = "glance",
}: {
  tier: SubnetTier
  az: string
  subnetsHere: SubnetMeta[]
  workloadsHere: TopologyNode[]
  sgIndex: Map<string, SecurityGroupMeta>
  selectedNodeId: string | null
  onSelect: (id: string) => void
  compact?: boolean
  roleForWorkload?: (nodeId: string) => IamRoleRollup | undefined
  densityCollapsed?: boolean
  viewDensity?: ViewDensity
}) {
  void sgIndex
  void densityCollapsed
  const empty = subnetsHere.length === 0
  const labelFg = SUBNET_LABEL_FG[tier]
  const glance = viewDensity === "glance"
  const hasWorkloads = workloadsHere.length > 0
  // Icons lead; chrome is a one-line strip. Floors sized for 1–2 dense icons
  // without forcing an inner scrollbar (Alon, 2026-07-10).
  const cellMinHeight =
    tier === "data"
      ? hasWorkloads
        ? compact
          ? "72px"
          : "80px"
        : compact
          ? "40px"
          : "44px"
      : hasWorkloads
        ? compact
          ? "88px"
          : "96px"
        : compact
          ? "48px"
          : "56px"
  const subnetTitle =
    subnetsHere.length === 0
      ? null
      : subnetsHere
          .map(s => s.name || s.cidr || s.id)
          .filter(Boolean)
          .join(" · ")
  const cidrHint =
    subnetsHere.length === 1 && subnetsHere[0]?.cidr
      ? subnetsHere[0].cidr
      : subnetsHere.length > 1
        ? `${subnetsHere.length} subnets`
        : null
  const chromeTitle = [TIER_CELL_SHORT[tier], subnetTitle].filter(Boolean).join(" · ")
  const renderWorkloads = () =>
    glance ? (
      <GlanceCellWorkloads
        workloadsHere={workloadsHere}
        selectedNodeId={selectedNodeId}
        onSelect={onSelect}
        roleForWorkload={roleForWorkload}
        compact={compact}
      />
    ) : (
      <InventoryCellWorkloads
        workloadsHere={workloadsHere}
        selectedNodeId={selectedNodeId}
        onSelect={onSelect}
        compact={compact}
      />
    )
  return (
    <div
      className="rounded-md px-1.5 py-1 h-full min-h-0 flex flex-col overflow-hidden"
      style={{
        background: empty ? "transparent" : SUBNET_BG[tier],
        border: empty ? `1px dashed ${PAL.slate}80` : `1.5px solid ${SUBNET_BORDER[tier]}`,
        minHeight: cellMinHeight,
        height: "100%",
        opacity: empty ? 0.55 : 1,
      }}
      data-testid={hasWorkloads ? "topology-subnet-cell-workloads" : "topology-subnet-cell"}
      title={[TIER_LABEL[tier], subnetTitle, cidrHint].filter(Boolean).join(" · ")}
    >
      {/* One-line chrome — full "Private subnet (data tier)" lives on the
          tier sidebar; keep cell chrome thin so icons are visible. */}
      <div className="flex items-center justify-between gap-1 shrink-0 min-h-0 leading-none mb-0.5">
        <div
          className="text-[9px] uppercase tracking-[0.08em] font-bold truncate min-w-0"
          style={{ color: labelFg }}
          data-testid="topology-subnet-cell-chrome"
        >
          {chromeTitle || TIER_CELL_SHORT[tier]}
        </div>
        {cidrHint ? (
          <div
            className="text-[9px] font-mono font-semibold shrink-0 tabular-nums"
            style={{ color: labelFg, opacity: 0.8 }}
          >
            {cidrHint}
          </div>
        ) : null}
      </div>

      {empty ? (
        workloadsHere.length > 0 ? (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="text-[9px] italic shrink-0 mb-0.5" style={{ color: PAL.slate }}>
              subnet not resolved
            </div>
            {renderWorkloads()}
          </div>
        ) : (
          <div className="text-[10px] italic flex-1 flex items-center" style={{ color: PAL.slate }}>
            no {tier} subnet in {az}
          </div>
        )
      ) : workloadsHere.length === 0 ? (
        <div className="text-[10px] italic flex-1 flex items-center" style={{ color: PAL.slate }}>
          no workloads here
        </div>
      ) : (
        renderWorkloads()
      )}
    </div>
  )
}

function IamRoleCard({
  role, allWorkloads, highlighted = false, compact = false,
}: { role: IamRoleRollup; allWorkloads: TopologyNode[]; highlighted?: boolean; compact?: boolean }) {
  const uncorrelated = role.correlation_state === "not_correlated"
  const staleRollup = role.correlation_state === "stale_rollup"
  const deleted = role.correlation_state === "deleted_in_aws"
  const gap = role.gap_percentage
  const isClean = !uncorrelated && !staleRollup && !deleted && (role.allowed_actions === 0 || gap === 0)
  const isCritical = !uncorrelated && !staleRollup && gap !== null && gap >= 80
  const accent = isClean ? "#10B981" : isCritical ? PAL.carmine : staleRollup ? "#6366F1" : PAL.amber
  const remediated = role.last_remediated_at
    ? new Date(role.last_remediated_at).toISOString().slice(0, 10)
    : null
  const workloadIds = Array.isArray(role.workload_ids) ? role.workload_ids : []
  const attachmentModes = Array.isArray(role.attachment_modes) ? role.attachment_modes : []
  const consumers = allWorkloads.filter(w => workloadIds.includes(w.id))
  const isShared = workloadIds.length > 1
  return (
    <div
      className={
        compact
          ? "rounded-md p-1.5 min-w-[132px] max-w-[160px] shrink-0"
          : "rounded-md p-3 min-w-[200px] max-w-[260px] shrink-0"
      }
      style={{
        background: "white",
        borderStyle: "solid",
        borderColor: accent,
        borderWidth: "1.5px",
        borderTopWidth: compact ? "2px" : "3px",
        boxShadow: highlighted ? `0 0 0 3px ${PAL.teal}` : undefined,
      }}
    >
      <div
        className={compact ? "text-[10px] font-semibold truncate" : "text-[12px] font-semibold truncate"}
        style={{ color: PAL.ink }}
        title={role.name}
      >
        {role.name}
      </div>
      <div className={compact ? "mt-1" : "mt-1.5 mb-1.5"}>
        {role.allowed_actions === 0 ? (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded inline-block"
            style={{ background: "#D1FAE5", color: "#065F46" }}
          >
            0/0 actions
          </span>
        ) : (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded inline-block"
            style={{
              background: isCritical ? "#FECACA" : "#FEF3C7",
              color: isCritical ? "#7F1D1D" : "#92400E",
            }}
          >
            {role.unused_actions}/{role.allowed_actions} unused
          </span>
        )}
      </div>
      {!compact ? (
        <>
          <div className="text-[10px] leading-snug" style={{ color: PAL.slate }}>
            {uncorrelated ? (
              <>not yet correlated · behavioral join pending</>
            ) : staleRollup ? (
              <>recomputing · usage edges present, scalar stale</>
            ) : deleted ? (
              <>deleted in AWS · tombstone</>
            ) : role.allowed_actions === 0 ? (
              <>
                {remediated ? `Remediated ${remediated} · ` : ""}
                least-privilege achieved
              </>
            ) : (
              <>
                {gap !== null ? `${Math.round(gap)}% gap` : "gap unknown"}
                {remediated ? ` · remediation ${remediated}` : " · never remediated"}
              </>
            )}
          </div>
          {consumers.length > 0 && (
            <div className="mt-2 pt-2 border-t" style={{ borderColor: "#E5E7EB" }}>
              {consumers.slice(0, 3).map(c => (
                <div key={c.id} className="text-[10px] truncate" style={{ color: PAL.ink }}>
                  {c.name}
                </div>
              ))}
              {consumers.length > 3 && (
                <div className="text-[10px] italic" style={{ color: PAL.slate }}>
                  + {consumers.length - 3} more
                </div>
              )}
              <div className="text-[9px] uppercase tracking-wider mt-1" style={{ color: PAL.slate }}>
                {attachmentModes.includes("instance_profile") ? "via instance profile" : ""}
                {attachmentModes.includes("instance_profile") && attachmentModes.includes("direct") ? " · " : ""}
                {attachmentModes.includes("direct") ? "USES_ROLE" : ""}
                {isShared ? " · shared" : ""}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}

function IamControlPlane({
  roles, allWorkloads, highlightedRoleName, embeddedInVpc = false, compact = false,
}: {
  roles: IamRoleRollup[]
  allWorkloads: TopologyNode[]
  highlightedRoleName?: string | null
  embeddedInVpc?: boolean
  compact?: boolean
}) {
  if (roles.length === 0) return null
  const criticalCount = roles.filter(
    r => r.correlation_state !== "not_correlated"
      && r.correlation_state !== "stale_rollup"
      && r.gap_percentage !== null
      && r.gap_percentage >= 80
      && r.allowed_actions > 0,
  ).length
  const cleanCount = roles.filter(
    r => r.correlation_state !== "not_correlated"
      && r.correlation_state !== "stale_rollup"
      && (r.allowed_actions === 0 || r.gap_percentage === 0),
  ).length
  const uncorrelatedCount = roles.filter(r => r.correlation_state === "not_correlated").length
  const staleRollupCount = roles.filter(r => r.correlation_state === "stale_rollup").length
  return (
    <div
      className={
        embeddedInVpc
          ? compact
            ? "rounded-r-md p-1.5 relative flex-1 min-h-0 overflow-y-auto"
            : "rounded-r-md p-3 relative flex-1"
          : "rounded-md p-4 relative"
      }
      style={
        embeddedInVpc
          ? { background: "#F3E5F5", border: `1.5px solid #DD344C`, borderLeft: "none" }
          : { background: PAL.cardBg, border: `2px solid #DD344C`, borderLeftWidth: "8px" }
      }
    >
      {!compact ? (
        <div
          className="absolute -top-2.5 left-6 px-2 text-[10px] uppercase tracking-[0.14em] font-bold"
          style={{ background: embeddedInVpc ? "#F3E5F5" : PAL.cardBg, color: "#DD344C" }}
        >
          IAM · Control plane
        </div>
      ) : null}
      <div className={`flex items-baseline justify-between ${compact ? "mb-0.5" : embeddedInVpc ? "mt-0 mb-2" : "mt-1 mb-3"}`}>
        {!compact ? (
          <div className="text-[12px] font-semibold" style={{ color: PAL.ink }}>
            Roles attached to this VPC
          </div>
        ) : (
          <div className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: PAL.ink }}>
            IAM roles
          </div>
        )}
        {!compact ? (
          <div className="text-[10px]" style={{ color: PAL.slate }}>
            derived from instance-profile + USES_ROLE edges ·{" "}
            {roles.length} role{roles.length === 1 ? "" : "s"}
            {criticalCount > 0 ? ` · ${criticalCount} critical gap${criticalCount === 1 ? "" : "s"}` : ""}
            {cleanCount > 0 ? ` · ${cleanCount} clean` : ""}
            {uncorrelatedCount > 0 ? ` · ${uncorrelatedCount} pending correlation` : ""}
            {staleRollupCount > 0 ? ` · ${staleRollupCount} recomputing` : ""}
          </div>
        ) : (
          <div className="text-[9px]" style={{ color: PAL.slate }}>
            {roles.length} role{roles.length === 1 ? "" : "s"}
          </div>
        )}
      </div>
      <div className={`flex gap-3 overflow-x-auto ${compact ? "pb-0 items-center" : "pb-1"}`}>
        {roles.map(r => (
          <IamRoleCard
            key={r.name}
            role={r}
            allWorkloads={allWorkloads}
            highlighted={highlightedRoleName === r.name}
            compact={compact}
          />
        ))}
      </div>
    </div>
  )
}

function TrafficFlowBand({
  edges, nodes,
}: { edges: TrafficEdge[]; nodes: TopologyNode[] }) {
  const nodeById = useMemo(() => {
    const m = new Map<string, TopologyNode>()
    for (const n of nodes) m.set(n.id, n)
    return m
  }, [nodes])
  return (
    <div
      className="rounded-md p-4 relative"
      style={{ background: PAL.cardBg, border: `1px solid #E2E8F0` }}
    >
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[10px] uppercase tracking-[0.14em] font-bold" style={{ color: PAL.ink }}>
          Observed traffic — animated arrows above
        </div>
        <div className="text-[10px]" style={{ color: PAL.slate }}>
          {edges.length} flow{edges.length === 1 ? "" : "s"} ·{" "}
          {edges.filter(e => (e.edge_class ?? "internal") === "internal").length} internal ·{" "}
          {edges.filter(e => e.edge_class === "edge_service").length} edge-service ·{" "}
          {edges.filter(e => e.edge_class === "vpce").length} vpce ·{" "}
          {edges.filter(e => e.edge_class === "database").length} database ·{" "}
          {edges.filter(e => e.edge_class === "egress").length} egress
        </div>
      </div>
      {edges.length === 0 ? (
        <div className="text-[11px] italic" style={{ color: PAL.slate }}>
          No observed traffic flows from any rendered workload.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {edges.slice(0, 12).map((e, i) => {
            const src = nodeById.get(e.source_id)
            const dst = e.target_id === "__igw__"
              ? { name: "Internet (via IGW)" }
              : nodeById.get(e.target_id) ?? { name: e.target_id }
            const cls = e.edge_class ?? "internal"
            const classChip = cls === "egress"
              ? { bg: "#FEF3C7", fg: "#7B3F00", txt: e.external_destinations ? `egress · ${e.external_destinations} dest` : "egress" }
              : cls === "edge_service"
              ? { bg: "#EDE7F6", fg: "#4527A0", txt: e.protocol ?? "edge" }
              : cls === "vpce"
              ? { bg: "#DBEAFE", fg: "#1E40AF", txt: "VPCE" }
              : cls === "database"
              ? e.is_exposed
                ? {
                    bg: "#FEE2E2",
                    fg: "#991B1B",
                    // Count only when we have a real engine port — never ":?".
                    // QUERIES_DB edges may be is_exposed via publicly_accessible
                    // with port=null; those get "exposed · RDS" (Alon, 2026-07-10).
                    txt:
                      e.external_sources && e.port != null
                        ? `${e.external_sources} external sources on :${e.port}`
                        : e.port
                          ? `exposed · RDS :${e.port}`
                          : "exposed · RDS",
                  }
                : { bg: "#D2E5F8", fg: "#1565C0", txt: e.port ? `RDS · ${e.port}` : "RDS" }
              : { bg: "#E0F2FE", fg: "#075985", txt: e.port ? `${e.port}/${e.protocol ?? "TCP"}` : (e.protocol ?? "TCP") }
            const arrowColor = cls === "egress" ? "#FF9900" : cls === "edge_service" ? "#7E57C2" : cls === "vpce" ? "#3B82F6" : cls === "database" ? (e.is_exposed ? "#DC2626" : "#2E73B8") : PAL.teal
            return (
              <div
                key={`${e.source_id}-${e.target_id}-${e.port}-${i}`}
                className="flex items-center gap-2 text-[11px]"
                style={{ color: PAL.ink }}
              >
                <span className="font-semibold truncate max-w-[200px]">
                  {src?.name ?? e.source_id}
                </span>
                <span style={{ color: arrowColor }}>→</span>
                <span className="font-semibold truncate max-w-[200px]">
                  {dst.name}
                </span>
                <span
                  className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{ background: classChip.bg, color: classChip.fg }}
                >
                  {classChip.txt}
                </span>
              </div>
            )
          })}
          {edges.length > 12 && (
            <div className="text-[10px] italic mt-1" style={{ color: PAL.slate }}>
              + {edges.length - 12} more flows
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── P0-B: semantic-zoom density tiles ──────────────────────────────────────
// At Fit zoom, full cards are unreadable confetti. Collapse same-type workloads
// into an icon + count "stack tile" ("EC2 × 22 · 3 crit"). Counts are REAL
// (node.score.tier — no fabrication). Click a tile to expand that group into
// full chips; click the header to re-collapse.
const DENSITY_STACK_THRESHOLD = 4

type NodeTypeGroup = { key: string; nodes: TopologyNode[]; criticalCount: number }

function groupNodesByType(nodes: TopologyNode[]): NodeTypeGroup[] {
  const groups = new Map<string, NodeTypeGroup>()
  for (const n of nodes) {
    const key = n.type ?? "Other"
    const g = groups.get(key) ?? { key, nodes: [], criticalCount: 0 }
    g.nodes.push(n)
    if (n.score?.tier === "WORST" || n.score?.tier === "HIGH") g.criticalCount += 1
    groups.set(key, g)
  }
  // Risk-first: most-critical groups, then largest, first.
  return [...groups.values()].sort(
    (a, b) => b.criticalCount - a.criticalCount || b.nodes.length - a.nodes.length,
  )
}

/** Short, human type label for a stack tile ("EC2Instance" → "EC2"). */
function shortTypeLabel(type: string): string {
  return type.replace(/Function|Instance|Table|Bucket|Key|Manager/g, "") || type
}

function StackTile({
  group,
  onExpand,
  glanceLabel = false,
}: {
  group: NodeTypeGroup
  onExpand: () => void
  /** Glance: AWS stack-behind — one icon, siblings implied by ×N. */
  glanceLabel?: boolean
}) {
  const icon = nodeIcon(group.nodes[0]?.type ?? null)
  const worst = group.criticalCount > 0
  const label = awsServiceLabel(group.key)
  const count = group.nodes.length
  return (
    <button
      type="button"
      onClick={onExpand}
      title={`${count} × ${group.key}${group.criticalCount ? ` · ${group.criticalCount} critical` : ""} — click to inspect`}
      className="inline-flex items-center gap-2 rounded-md border px-2 py-1.5 transition hover:brightness-95"
      style={{
        background: "#FFFFFF",
        borderColor: worst ? PAL.carmine : "#CBD5E1",
        boxShadow: worst ? "0 0 0 2px rgba(224,69,69,0.12)" : undefined,
      }}
      data-testid="topology-density-stack-tile"
      data-glance-stack={glanceLabel ? "true" : undefined}
      data-stack-count={count}
      // Flow-edge anchor fallback: when density collapse removes the member
      // chips from the DOM, FlowOverlay re-anchors their edges to this tile
      // (matched via the member ids below) instead of dropping the whole
      // flow story at overview zoom.
      data-flow-ids={group.nodes.map(n => n.id).join("|")}
    >
      <span className="relative inline-flex" style={{ width: 28, height: 28 }}>
        {count >= 2 ? (
          <span
            className="absolute rounded border bg-white"
            style={{ inset: "3px -3px -3px 3px", borderColor: "#CBD5E1", zIndex: 0 }}
            aria-hidden
          />
        ) : null}
        <span
          className="relative z-[1] inline-flex items-center justify-center rounded w-7 h-7 shrink-0"
          style={{
            background: icon.official ? "#FFFFFF" : icon.bg,
            color: icon.fg,
            border: "1px solid #E2E8F0",
          }}
        >
          {icon.symbol}
        </span>
      </span>
      <span className="text-[11px] font-semibold whitespace-nowrap" style={{ color: "#1A2330" }}>
        {label}
        {count >= 2 ? (
          <span className="ml-1 font-mono text-[10px]" style={{ color: PAL.slate }}>
            ×{count}
          </span>
        ) : null}
      </span>
      {group.criticalCount > 0 ? (
        <span className="text-[9px] font-bold rounded px-1 py-0.5" style={{ background: PAL.carmine, color: "white" }}>
          {group.criticalCount} crit
        </span>
      ) : null}
    </button>
  )
}

function ServerlessComputeTier({
  nodes,
  selectedNodeId,
  onSelect,
  compact = false,
  viewDensity = "glance",
}: {
  nodes: TopologyNode[]
  selectedNodeId: string | null
  onSelect: (id: string) => void
  roleForWorkload?: (nodeId: string) => IamRoleRollup | undefined
  compact?: boolean
  densityCollapsed?: boolean
  viewDensity?: ViewDensity
}) {
  if (nodes.length === 0) return null
  const glance = viewDensity === "glance"
  const useStacks = glance && shouldGlanceStackRail(nodes)
  const groups = useStacks ? groupNodesByType(nodes) : null
  return (
    <div
      className={compact ? "rounded-md p-2" : "rounded-md p-2.5"}
      data-testid="topology-serverless-tier"
      style={{
        background: "#EEF2FF",
        border: "1px solid #C7D2FE",
        borderLeft: "3px solid #4338CA",
      }}
    >
      <div className={compact ? "text-[10px] uppercase tracking-[0.12em] font-semibold mb-1" : "text-[10px] uppercase tracking-[0.12em] font-semibold mb-1.5"} style={{ color: "#312E81" }}>
        Serverless · outside VPC ({nodes.length})
      </div>
      <div
        className={
          compact
            ? "flex flex-wrap gap-1 max-w-full max-h-[160px] overflow-y-auto justify-center"
            : "flex flex-wrap gap-1.5 max-w-full justify-center"
        }
      >
        {groups
          ? groups.map(g => (
              <StackTile
                key={g.key}
                group={g}
                glanceLabel
                onExpand={() => {
                  const worst = selectWorstInGroup(g.nodes)
                  if (worst) onSelect(worst.id)
                }}
              />
            ))
          : nodes.map(n => (
              <ServiceNodeIcon
                key={n.id}
                node={n}
                selected={n.id === selectedNodeId}
                onSelect={onSelect}
              />
            ))}
      </div>
    </div>
  )
}

function RegionalDataServicesTier({
  nodes,
  selectedNodeId,
  onSelect,
  compact = false,
  viewDensity = "glance",
}: {
  nodes: TopologyNode[]
  selectedNodeId: string | null
  onSelect: (id: string) => void
  compact?: boolean
  densityCollapsed?: boolean
  viewDensity?: ViewDensity
}) {
  if (nodes.length === 0) return null
  const glance = viewDensity === "glance"
  const useStacks = glance && shouldGlanceStackRail(nodes)
  const groups = useStacks ? groupNodesByType(nodes) : null
  return (
    <div
      className={compact ? "rounded-md p-2 mt-2" : "rounded-md p-2.5 mt-2"}
      data-testid="topology-regional-data-tier"
      style={{
        background: "#EDE7F6",
        border: "1px solid #D1C4E9",
        borderLeft: "3px solid #5E35B1",
      }}
    >
      <div className="text-[10px] uppercase tracking-[0.12em] font-semibold mb-1.5" style={{ color: "#311B92" }}>
        Regional · S3 / DDB / KMS ({nodes.length})
      </div>
      <div className="flex flex-wrap gap-1.5 max-w-full justify-center">
        {groups
          ? groups.map(g => (
              <StackTile
                key={g.key}
                group={g}
                glanceLabel
                onExpand={() => {
                  const worst = selectWorstInGroup(g.nodes)
                  if (worst) onSelect(worst.id)
                }}
              />
            ))
          : nodes.map(n => (
              <ServiceNodeIcon
                key={n.id}
                node={n}
                selected={n.id === selectedNodeId}
                onSelect={onSelect}
              />
            ))}
      </div>
    </div>
  )
}

function DiagnosticsAccordion({
  serverlessCount,
  staleCount,
  trafficCount,
  children,
}: {
  serverlessCount: number
  staleCount: number
  trafficCount: number
  children: ReactNode
}) {
  const [open, setOpen] = useState(serverlessCount > 0 || staleCount > 0)
  const summary = [
    serverlessCount > 0 ? `${serverlessCount} serverless` : null,
    staleCount > 0 ? `${staleCount} stale` : null,
    trafficCount > 0 ? `${trafficCount} flows` : null,
  ].filter(Boolean).join(" · ")

  return (
    <div className="rounded-md" style={{ background: PAL.cardBg, border: "1px solid #E2E8F0" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-[10px] uppercase tracking-[0.14em] font-semibold" style={{ color: PAL.ink }}>
          Diagnostics
        </span>
        <span className="text-[10px]" style={{ color: PAL.slate }}>
          {summary || "encoding legend"} {open ? "▴" : "▾"}
        </span>
      </button>
      {open ? <div className="px-4 pb-4 space-y-3">{children}</div> : null}
    </div>
  )
}

function EncodingLegend() {
  return (
    <div
      className="rounded-md px-4 py-3 text-[11px]"
      style={{
        background: PAL.cardBg,
        border: `1px solid #E2E8F0`,
        color: PAL.ink,
      }}
    >
      <div
        className="font-semibold uppercase tracking-[0.14em] mb-2 text-[10px]"
        style={{ color: PAL.slate }}
      >
        Encoding
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full" style={{ width: 12, height: 12, background: PAL.carmine, boxShadow: `0 0 0 3px rgba(224,69,69,0.20)` }} />
          <span>Worst (carmine halo + pulse)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full" style={{ width: 12, height: 12, background: "transparent", border: `2px solid ${PAL.amber}` }} />
          <span>High / elevated (ring only)</span>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: PAL.amber, fontSize: "14px" }}>♛</span>
          <span>Crown-jewel halo</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full" style={{ width: 12, height: 12, background: "transparent", border: `2px solid ${PAL.teal}` }} />
          <span>Clean · remediated (teal ring)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full" style={{ width: 12, height: 12, background: "#9CA3AF", opacity: 0.6 }} />
          <span>Stale (dimmed)</span>
        </div>
      </div>
    </div>
  )
}

// ─── Animated SVG flow overlay ──────────────────────────────────────
//
// Draws arrows from each workload chip to its observed destinations
// (other workload chips, the IGW perimeter for egress, edge-service
// chips on the right rail). Lines are absolutely positioned over the
// canvas container with `pointer-events:none` so they never block
// chip clicks. Path coordinates are recomputed on every render and on
// window resize so the lines stay anchored when chips shift.

interface FlowPath {
  d: string
  cls: TrafficEdgeClass
  protocol: string | null
  port: number | null
  externalDestinations: number | null
  badgeX: number
  badgeY: number
  badgeLabel: string
  /** DB exposure honesty — red stroke + badge when true. */
  isExposed?: boolean
  highlight?: "attack_path" | null
}

// ── Orthogonal flow routing ─────────────────────────────────────────────
// AWS reference diagrams route flows with right-angle elbows through the
// gutters BETWEEN panels — never diagonally through a subnet card. Free-form
// beziers made the map unreadable the moment more than a handful of edges
// rendered (2026-07-04, Alon on prod: "no way to see the map e2e with the
// right data flow"). Rects arrive here already in the frame's natural
// (pre-scale) coordinate space.

type Pt = { x: number; y: number }

/** Chip rect in natural coordinates with derived edges/center. */
type NatRect = { l: number; t: number; r: number; b: number; cx: number; cy: number }

/** Manhattan polyline → SVG path with rounded corners. */
function orthoPath(pts: Pt[], radius = 8): string {
  // Drop zero-length segments so corner math never divides by zero.
  const p: Pt[] = [pts[0]]
  for (const q of pts.slice(1)) {
    const last = p[p.length - 1]
    if (Math.abs(q.x - last.x) > 0.5 || Math.abs(q.y - last.y) > 0.5) p.push(q)
  }
  if (p.length < 2) return ""
  let d = `M ${p[0].x} ${p[0].y}`
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1], b = p[i], c = p[i + 1]
    const rIn = Math.min(radius, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2)
    const inX = b.x - Math.sign(b.x - a.x) * rIn
    const inY = b.y - Math.sign(b.y - a.y) * rIn
    const outX = b.x + Math.sign(c.x - b.x) * rIn
    const outY = b.y + Math.sign(c.y - b.y) * rIn
    d += ` L ${inX} ${inY} Q ${b.x} ${b.y} ${outX} ${outY}`
  }
  d += ` L ${p[p.length - 1].x} ${p[p.length - 1].y}`
  return d
}

/** Midpoint of the longest segment — where the badge reads as "on the line". */
function longestSegmentMid(pts: Pt[]): Pt {
  let best: Pt = { x: (pts[0].x + pts[pts.length - 1].x) / 2, y: (pts[0].y + pts[pts.length - 1].y) / 2 }
  let bestLen = -1
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    if (len > bestLen) {
      bestLen = len
      best = { x: (pts[i].x + pts[i - 1].x) / 2, y: (pts[i].y + pts[i - 1].y) / 2 }
    }
  }
  return best
}

/** One orthogonal leg src→dst.
 *  Rightward legs exit the chip's RIGHT edge, run a vertical corridor just
 *  before the target column (shared bus when `corridorX` is set), and enter
 *  the target's LEFT edge. Vertical legs exit bottom/top with a per-edge
 *  `exitSpread` so a fan-out (ALB → N workloads) spreads at the source like
 *  a real architecture diagram instead of stacking on one line. */
function orthoLeg(src: NatRect, dst: NatRect, corridorX: number | null, exitSpread: number): Pt[] {
  const H_GAP = 40
  if (dst.l - src.r > H_GAP) {
    const cx = Math.max(src.r + 12, corridorX ?? dst.l - 20)
    return [
      { x: src.r, y: src.cy },
      { x: cx, y: src.cy },
      { x: cx, y: dst.cy },
      { x: dst.l, y: dst.cy },
    ]
  }
  if (src.l - dst.r > H_GAP) {
    const cx = Math.min(src.l - 12, corridorX ?? dst.r + 20)
    return [
      { x: src.l, y: src.cy },
      { x: cx, y: src.cy },
      { x: cx, y: dst.cy },
      { x: dst.r, y: dst.cy },
    ]
  }
  const exitX = Math.min(Math.max(src.cx + exitSpread, src.l + 8), Math.max(src.l + 8, src.r - 8))
  const vOverlap = !(dst.t > src.b + 4 || dst.b < src.t - 4)
  if (vOverlap) {
    // Side-by-side chips: loop below both instead of slicing through them.
    const midY = Math.max(src.b, dst.b) + 14
    return [
      { x: exitX, y: src.b },
      { x: exitX, y: midY },
      { x: dst.cx, y: midY },
      { x: dst.cx, y: dst.b },
    ]
  }
  const goingDown = dst.cy >= src.cy
  const exitY = goingDown ? src.b : src.t
  const enterY = goingDown ? dst.t : dst.b
  const midY = (exitY + enterY) / 2
  return [
    { x: exitX, y: exitY },
    { x: exitX, y: midY },
    { x: dst.cx, y: midY },
    { x: dst.cx, y: enterY },
  ]
}

function FlowModeToggle({
  mode,
  onChange,
  attackPathCount,
}: {
  mode: EstateFlowMode
  onChange: (mode: EstateFlowMode) => void
  attackPathCount: number
}) {
  return (
    <div
      className="flex items-center gap-1 rounded-md p-0.5"
      style={{ background: "#EEF2F6", border: "1px solid #CBD5E1" }}
      data-testid="topology-flow-mode-toggle"
    >
      <button
        type="button"
        aria-pressed={mode === "all_access"}
        onClick={() => onChange("all_access")}
        className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide transition-colors"
        style={{
          background: mode === "all_access" ? "#FFFFFF" : "transparent",
          color: mode === "all_access" ? "#1A2330" : "#5A6B7A",
          boxShadow: mode === "all_access" ? "0 1px 2px rgba(0,0,0,0.06)" : undefined,
        }}
      >
        All access
      </button>
      <button
        type="button"
        aria-pressed={mode === "attack_paths"}
        onClick={() => onChange("attack_paths")}
        className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wide transition-colors"
        style={{
          background: mode === "attack_paths" ? "#FFFFFF" : "transparent",
          color: mode === "attack_paths" ? "#B91C1C" : "#5A6B7A",
          boxShadow: mode === "attack_paths" ? "0 1px 2px rgba(0,0,0,0.06)" : undefined,
        }}
      >
        Attack paths only{attackPathCount > 0 ? ` (${attackPathCount})` : ""}
      </button>
    </div>
  )
}

function FlowOverlay({
  edges, containerRef, scale = 1, densityCollapsed = false,
}: {
  edges: TrafficEdge[]
  containerRef: React.RefObject<HTMLDivElement | null>
  /** Host zoom factor. getBoundingClientRect returns post-transform coords, so
   *  every measured delta and the SVG's own size are divided by `scale` to draw
   *  in the frame's natural (pre-scale) space — edges stay pinned to chips at
   *  any zoom. Default 1 = no parent transform, unchanged behavior. */
  scale?: number
  /** In deps so the LOD chip↔stack-tile swap always triggers a re-measure —
   *  member chips leave/enter the DOM on this flag. */
  densityCollapsed?: boolean
}) {
  const [paths, setPaths] = useState<FlowPath[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })

  // useEffect (not useLayoutEffect) + retry-until-chips-found pattern.
  // On the prod minified build the layout-effect variant fired before all
  // 25 chip refs had committed to the DOM, found 0 matches, set paths=[]
  // and never re-ran (PR #220 + #221 prod regression — manual DOM inject
  // proved the geometry math is correct).
  // useEffect runs AFTER paint so the chips are present; we also poll a
  // few times with a short backoff in case the cells animate in.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false

    // Resolve an edge endpoint to a live element. Exact chip first; when the
    // LOD density collapse has replaced chips with stack tiles, fall back to
    // the tile that lists the id in data-flow-ids — the flow story must
    // survive overview zoom (2026-07-04 prod bug: every edge vanished at Fit).
    const resolveFlowEl = (id: string): { el: HTMLElement; grouped: boolean } | null => {
      const exact = container.querySelector<HTMLElement>(
        `[data-flow-id="${CSS.escape(id)}"]`,
      )
      if (exact) return { el: exact, grouped: false }
      const tiles = container.querySelectorAll<HTMLElement>("[data-flow-ids]")
      for (const t of tiles) {
        const ids = (t.getAttribute("data-flow-ids") ?? "").split("|")
        if (ids.includes(id)) return { el: t, grouped: true }
      }
      return null
    }

    // Clip an endpoint rect against its scrollable/overflow-hidden ancestors.
    // A rail chip scrolled out of its rail otherwise anchors the edge at its
    // off-screen position — the arrow lands over unrelated content (the
    // "dangling ACTUAL_S3_CALL" prod bug). Fully-clipped endpoints collapse
    // to the nearest visible point on the clipping boundary, so the edge
    // honestly points INTO the rail instead of through it.
    const visibleRect = (el: HTMLElement, rect: DOMRect): DOMRect => {
      let clipL = -Infinity, clipT = -Infinity, clipR = Infinity, clipB = Infinity
      let p = el.parentElement
      while (p && p !== container.parentElement) {
        const st = window.getComputedStyle(p)
        if (/(auto|scroll|hidden)/.test(st.overflowY + st.overflowX)) {
          const pr = p.getBoundingClientRect()
          clipL = Math.max(clipL, pr.left)
          clipT = Math.max(clipT, pr.top)
          clipR = Math.min(clipR, pr.right)
          clipB = Math.min(clipB, pr.bottom)
        }
        p = p.parentElement
      }
      const L = Math.max(rect.left, clipL)
      const T = Math.max(rect.top, clipT)
      const R = Math.min(rect.right, clipR)
      const B = Math.min(rect.bottom, clipB)
      if (R > L && B > T) return new DOMRect(L, T, R - L, B - T)
      // Fully clipped — pin a 2px anchor at the clamped center.
      const cx = Math.min(Math.max((rect.left + rect.right) / 2, clipL), clipR)
      const cy = Math.min(Math.max((rect.top + rect.bottom) / 2, clipT), clipB)
      return new DOMRect(cx - 1, cy - 1, 2, 2)
    }

    const recompute = () => {
      if (cancelled) return
      const containerRect = container.getBoundingClientRect()
      if (containerRect.width === 0) return
      // Natural (pre-scale) size: containerRect is the post-transform box, so
      // dividing recovers the SVG's own coordinate extent (viewBox === natural).
      setSize({ w: containerRect.width / scale, h: containerRect.height / scale })
      const toNat = (rect: DOMRect): NatRect => {
        const l = (rect.left - containerRect.left) / scale
        const t = (rect.top - containerRect.top) / scale
        const w = rect.width / scale
        const h = rect.height / scale
        return { l, t, r: l + w, b: t + h, cx: l + w / 2, cy: t + h / 2 }
      }

      // Pass 1 — resolve endpoints, bundle same-pair edges (a stack tile
      // absorbing N member edges renders ONE line with an "N flows" chip),
      // measure each element once.
      type RouteJob = {
        e: TrafficEdge
        cls: TrafficEdgeClass
        src: NatRect
        dst: NatRect
        inter: NatRect | null
        srcKey: number
        count: number
        highlight: "attack_path" | null
      }
      const elKeys = new Map<HTMLElement, number>()
      const keyOf = (el: HTMLElement) => {
        const k = elKeys.get(el) ?? elKeys.size
        elKeys.set(el, k)
        return k
      }
      const bundles = new Map<string, RouteJob>()
      const jobs: RouteJob[] = []
      for (const e of edges) {
        const src = resolveFlowEl(e.source_id)
        const dst = resolveFlowEl(e.target_id)
        if (!src || !dst) continue
        if (src.el === dst.el) continue // both ends collapsed into the same tile — no self-arrow
        const cls = e.edge_class ?? "internal"
        const grouped = src.grouped || dst.grouped
        const bk = `${keyOf(src.el)}→${keyOf(dst.el)}·${cls}`
        if (grouped) {
          const existing = bundles.get(bk)
          if (existing) {
            existing.count += 1
            if (e.flow_highlight === "attack_path") existing.highlight = "attack_path"
            continue
          }
        }
        // via_vpce routing — for S3/DDB Gateway VPCE paths the BE attaches
        // the VPCE id so the flow physically renders THROUGH that chip.
        // Falls back to a direct route if the chip isn't in the DOM.
        let inter: NatRect | null = null
        if (e.via_vpce_id) {
          const interEl = container.querySelector<HTMLElement>(
            `[data-flow-id="${CSS.escape(e.via_vpce_id)}"]`,
          )
          if (interEl) inter = toNat(visibleRect(interEl, interEl.getBoundingClientRect()))
        }
        const job: RouteJob = {
          e,
          cls,
          src: toNat(visibleRect(src.el, src.el.getBoundingClientRect())),
          dst: toNat(visibleRect(dst.el, dst.el.getBoundingClientRect())),
          inter,
          srcKey: keyOf(src.el),
          count: 1,
          highlight: e.flow_highlight ?? null,
        }
        if (grouped) bundles.set(bk, job)
        jobs.push(job)
      }

      // Pass 2 — lane assignment. Rail-bound legs bucket by target column and
      // share one corridor (bus) with a small per-edge offset so parallel
      // lines read as lanes, not a tangle; vertical fan-outs spread their
      // exit points across the source chip.
      const H_GAP = 40
      const corridorLane = new Map<RouteJob, number | null>()
      const colBuckets = new Map<number, RouteJob[]>()
      for (const j of jobs) {
        const target = j.inter ?? j.dst
        if (target.l - j.src.r > H_GAP) {
          const bucket = Math.round(target.l / 32)
          const arr = colBuckets.get(bucket) ?? []
          arr.push(j)
          colBuckets.set(bucket, arr)
        } else {
          corridorLane.set(j, null)
        }
      }
      for (const arr of colBuckets.values()) {
        const colLeft = Math.min(...arr.map(j => (j.inter ?? j.dst).l))
        arr.sort((a, b) => a.src.cy - b.src.cy)
        arr.forEach((j, i) => corridorLane.set(j, colLeft - 18 - i * 7))
      }
      const fanGroups = new Map<number, RouteJob[]>()
      for (const j of jobs) {
        if (corridorLane.get(j) === null) {
          const arr = fanGroups.get(j.srcKey) ?? []
          arr.push(j)
          fanGroups.set(j.srcKey, arr)
        }
      }
      const exitSpreads = new Map<RouteJob, number>()
      for (const arr of fanGroups.values()) {
        arr.sort((a, b) => a.dst.cx - b.dst.cx)
        arr.forEach((j, i) => exitSpreads.set(j, (i - (arr.length - 1) / 2) * 12))
      }

      // Pass 3 — generate orthogonal paths + on-line badges.
      const next: FlowPath[] = []
      for (const j of jobs) {
        const laneX = corridorLane.get(j) ?? null
        const spread = exitSpreads.get(j) ?? 0
        let pts: Pt[]
        let badge: Pt
        let routedViaVpce = false
        if (j.inter) {
          const leg1 = orthoLeg(j.src, j.inter, laneX, spread)
          const leg2 = orthoLeg(j.inter, j.dst, null, 0)
          pts = [...leg1, ...leg2]
          badge = { x: j.inter.cx, y: j.inter.cy + 18 }
          routedViaVpce = true
        } else {
          pts = orthoLeg(j.src, j.dst, laneX, spread)
          // Anchor the egress label to its source chip (in-tier) instead of the
          // longest-segment midpoint, which lands up in the IGW / subnet-header
          // band where every egress line converges and the tags pile up.
          badge = j.cls === "egress"
            ? { x: j.src.cx, y: j.src.t - 16 }
            : longestSegmentMid(pts)
        }
        const d = orthoPath(pts)
        if (!d) continue
        const e = j.e
        const cls = j.cls
        let badgeLabel = ""
        if (cls === "egress") {
          badgeLabel = e.external_destinations
            ? `egress · ${e.external_destinations} dest`
            : "egress"
        } else if (cls === "edge_service") {
          if (routedViaVpce || e.egress_path === "vpce") {
            // Short-form service tag from the VPCE service_name suffix.
            const svc = e.via_vpce_service_name ?? ""
            const tag = svc.endsWith(".s3")
              ? "S3"
              : svc.endsWith(".dynamodb")
                ? "DDB"
                : "VPCE"
            badgeLabel = `${tag} access · via VPCE`
          } else if (e.egress_path === "public") {
            // Prefer VPCE — public/NAT path is an exfil-shaped finding.
            badgeLabel = `${e.protocol ?? "AWS"} · via IGW/NAT (prefer VPCE)`
          } else {
            badgeLabel = e.protocol ?? "edge"
          }
        } else if (cls === "vpce") {
          badgeLabel = "VPCE"
        } else if (cls === "database") {
          if (e.is_exposed) {
            // Count badge only with a real port. QUERIES_DB / config-only
            // exposure uses "exposed · RDS" — never invent ":?".
            badgeLabel =
              e.external_sources && e.port != null
                ? `${e.external_sources} external sources on :${e.port}`
                : e.port
                  ? `exposed · RDS :${e.port}`
                  : "exposed · RDS"
          } else {
            badgeLabel = e.port ? `RDS · ${e.port}` : "RDS"
          }
        } else if (
          e.protocol === "LAUNCHES" ||
          e.protocol === "TARGETS" ||
          e.protocol === "HAS_TARGET_GROUP" ||
          e.protocol === "TRIGGERS" ||
          e.protocol === "ENCRYPTED_BY" ||
          e.protocol === "ACCESSES_RESOURCE"
        ) {
          badgeLabel =
            e.protocol === "HAS_TARGET_GROUP"
              ? "TG"
              : e.protocol === "ACCESSES_RESOURCE"
                ? "secret"
                : e.protocol === "ENCRYPTED_BY"
                  ? "KMS"
                  : e.protocol
        } else {
          badgeLabel = e.port ? `${e.port}/${e.protocol ?? "TCP"}` : (e.protocol ?? "TCP")
        }
        if (j.count > 1 && !e.is_exposed) badgeLabel = `${j.count} flows`
        next.push({
          d,
          cls,
          protocol: e.protocol,
          port: e.port,
          externalDestinations: e.external_destinations ?? null,
          badgeX: badge.x,
          badgeY: badge.y - 6,
          badgeLabel,
          isExposed: Boolean(e.is_exposed),
          highlight: j.highlight,
        })
      }

      // Pass 4 — de-overlap badges against BOTH other badges AND chip boxes.
      // Each label is treated as a BOX (half-width ≈ 3.2px/char) and nudged to
      // the NEAREST clear y — searching up and down from its anchor — so a tag
      // never paints over a chip or its name, and egress labels lift clear of
      // their source chip. Point-only checks under-detected wide labels (prod:
      // VPCE tags on EC2 names, egress tags on the subnet header).
      const chipObstacles: NatRect[] = []
      const seenObstacle = new Set<string>()
      for (const j of jobs) {
        for (const r of [j.src, j.dst]) {
          const k = `${Math.round(r.l)}:${Math.round(r.t)}`
          if (seenObstacle.has(k)) continue
          seenObstacle.add(k)
          chipObstacles.push(r)
        }
      }
      const placed: { x: number; y: number; hw: number }[] = []
      const clearAt = (x: number, y: number, hw: number): boolean => {
        for (const o of chipObstacles) {
          if (x + hw > o.l - 4 && x - hw < o.r + 4 && y + 7 > o.t - 4 && y - 7 < o.b + 4) {
            return false
          }
        }
        for (const q of placed) {
          if (Math.abs(q.x - x) < hw + q.hw + 6 && Math.abs(q.y - y) < 13) return false
        }
        return true
      }
      for (const p of next) {
        const hw = Math.max(14, (p.badgeLabel.length * 6.4) / 2)
        let y = p.badgeY
        if (!clearAt(p.badgeX, y, hw)) {
          let found = false
          for (let dist = 14; dist <= 160 && !found; dist += 14) {
            for (const cand of [p.badgeY - dist, p.badgeY + dist]) {
              if (clearAt(p.badgeX, cand, hw)) {
                y = cand
                found = true
                break
              }
            }
          }
        }
        p.badgeY = y
        placed.push({ x: p.badgeX, y, hw })
      }
      setPaths(next)
    }
    // Double-rAF scheduler: measuring in the same frame as a transform /
    // LOD commit reads pre-commit rects (one whole zoom step behind). Two
    // animation frames guarantee layout has settled before we measure.
    let raf1 = 0
    let raf2 = 0
    const schedule = () => {
      if (cancelled) return
      window.cancelAnimationFrame(raf1)
      window.cancelAnimationFrame(raf2)
      raf1 = window.requestAnimationFrame(() => {
        raf2 = window.requestAnimationFrame(recompute)
      })
    }
    // Initial run + a short retry ladder. If no chips have refs yet
    // (data still loading, fonts mid-layout, etc.) we'll catch them on
    // the next tick or two. Cheap; max ~600ms of polling.
    recompute()
    const t1 = window.setTimeout(recompute, 100)
    const t2 = window.setTimeout(recompute, 300)
    const t3 = window.setTimeout(recompute, 600)
    const ro = new ResizeObserver(schedule)
    ro.observe(container)
    window.addEventListener("resize", schedule)
    // Any scroll inside the frame (tier cells, serverless/regional rails)
    // moves chip rects without resizing anything — capture-phase listener
    // catches every scrollable descendant so edges follow their chips
    // instead of dangling at the pre-scroll position.
    container.addEventListener("scroll", schedule, { capture: true, passive: true })
    return () => {
      cancelled = true
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearTimeout(t3)
      window.cancelAnimationFrame(raf1)
      window.cancelAnimationFrame(raf2)
      ro.disconnect()
      window.removeEventListener("resize", schedule)
      container.removeEventListener("scroll", schedule, { capture: true })
    }
    // edges + scale + densityCollapsed are the meaningful deps — containerRef
    // is stable by definition (React.useRef returns the same object every
    // render), and adding it has historically masked real prod-only
    // mount-timing bugs (see comment above). scale must be here so the
    // recompute closure (and its ResizeObserver callback) always divides by
    // the CURRENT zoom; densityCollapsed because the chip↔stack-tile swap
    // replaces the DOM elements edges anchor to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, scale, densityCollapsed])

  const colorByCls: Record<TrafficEdgeClass, string> = {
    internal: "#0E8B7A",      // teal — intra-canvas chip↔chip
    edge_service: "#7E57C2",  // purple — to right-rail S3/KMS/DDB
    vpce: "#3B82F6",          // blue — to VPC endpoint chips
    egress: "#FF9900",        // AWS orange — to IGW perimeter
    database: "#2E73B8",      // RDS blue — workload→database tier
  }

  // Always render the SVG (even empty) so the React tree mounts on the
  // first paint and the layout effect can populate paths/size on the
  // next tick. Returning null here on first render caused the deployed
  // build to never re-attach the SVG after state arrived (PR #220 prod
  // regression — manual SVG injection works, the React mount does not).
  const hasSize = size.w > 0 && size.h > 0

  return (
    <svg
      aria-hidden="true"
      width={hasSize ? size.w : "100%"}
      height={hasSize ? size.h : "100%"}
      viewBox={hasSize ? `0 0 ${size.w} ${size.h}` : undefined}
      className="absolute inset-0"
      // z-index lifts the SVG above the subnet/AZ chip boxes that paint
      // later in the DOM tree. Without it, `z-auto` puts the SVG on the
      // same stacking level as those siblings, and the chips end up
      // covering every path whose midpoint falls inside a box (only the
      // egress→IGW line escaped because its mid sits OUTSIDE the frame).
      // pointer-events stays none so chip clicks still pass through.
      style={{ pointerEvents: "none", overflow: "visible", zIndex: 20 }}
    >
      <defs>
        {(["internal", "edge_service", "vpce", "database", "egress"] as TrafficEdgeClass[]).map(c => (
          <marker
            key={c}
            id={`flow-arrow-${c}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={colorByCls[c]} />
          </marker>
        ))}
      </defs>
      {paths.map((p, i) => {
        const stroke =
          p.highlight === "attack_path" || p.isExposed
            ? "#DC2626"
            : colorByCls[p.cls]
        const markerCls = p.isExposed ? "database" : p.cls
        return (
        <g key={i}>
          {/* Soft halo behind the line so it's visible over the busy chip grid */}
          <path
            d={p.d}
            fill="none"
            stroke={stroke}
            strokeWidth="4"
            strokeOpacity="0.12"
            strokeLinecap="round"
          />
          <path
            d={p.d}
            fill="none"
            stroke={stroke}
            strokeWidth={p.isExposed ? 2 : 1.5}
            strokeOpacity="0.85"
            strokeDasharray={p.highlight === "attack_path" || p.isExposed ? "6 4" : "5 4"}
            strokeLinecap="round"
            markerEnd={`url(#flow-arrow-${markerCls})`}
          >
            <animate
              attributeName="stroke-dashoffset"
              from="18"
              to="0"
              dur="2s"
              repeatCount="indefinite"
            />
          </path>
          <g transform={`translate(${p.badgeX}, ${p.badgeY})`}>
            <rect
              x={-Math.max(p.badgeLabel.length * 3.8, 14)}
              y={-7}
              width={Math.max(p.badgeLabel.length * 7.6, 28)}
              height={14}
              rx={3}
              fill="white"
              stroke={stroke}
              strokeWidth="0.75"
              opacity="0.94"
            />
            <text
              x={0}
              y={3}
              textAnchor="middle"
              fontSize="8"
              fontWeight="600"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fill={stroke}
            >
              {p.badgeLabel}
            </text>
          </g>
        </g>
        )
      })}
    </svg>
  )
}

/** Ordered VPC ids to render as frames: primary first (the canonical frame),
 *  then every other VPC that owns >=1 subnet in the payload, stable by id.
 *  Scoped mode passes a single id instead. */
export function frameVpcIds(subnets: SubnetMeta[], primaryVpcId: string | null): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  if (primaryVpcId) {
    ids.push(primaryVpcId)
    seen.add(primaryVpcId)
  }
  for (const s of subnets) {
    const v = s.vpc_id
    if (v && !seen.has(v)) {
      seen.add(v)
      ids.push(v)
    }
  }
  return ids
}

interface CanvasGrid {
  byAzAndTier: Map<string, Map<SubnetTier, TopologyNode[]>>
  subnetsByCell: Map<string, SubnetMeta[]>
  albNodes: TopologyNode[]
  staleNodes: TopologyNode[]
  azs: string[]
  azGridColumns: string
  vpcGridMinWidth: number
}

/** Pure per-VPC grid computation — no hooks, so it runs once per frame inside a
 *  single parent useMemo. `nodes` MUST already be scoped to `canvasVpcId` (the
 *  parent partitions workloads by resolved VPC); this only buckets them into
 *  the (az x tier) cells for that one frame. */
export function computeCanvasGrid(
  canvasVpcId: string | null,
  subnets: SubnetMeta[],
  nodes: TopologyNode[],
  hiddenAzs: string[],
): CanvasGrid {
  const primaryRegion = primaryRegionFromSubnets(subnets, canvasVpcId)
  const scopedSubnets = subnets.filter(s => subnetInCanvasScope(s, canvasVpcId, primaryRegion))
  const subnetById = createMap(scopedSubnets.map(s => [s.id, s]))
  const byAzAndTier = new Map<string, Map<SubnetTier, TopologyNode[]>>()
  const serverlessNodes: TopologyNode[] = []
  const unplacedNodes: TopologyNode[] = []
  const staleNodes: TopologyNode[] = []
  const albNodes: TopologyNode[] = []

  const pickSyntheticAz = (tier: SubnetTier): string | null => {
    const tierSubnet = scopedSubnets.find(s => s.tier === tier && s.az)
    if (tierSubnet?.az) return tierSubnet.az
    const anySub = scopedSubnets.find(s => s.az)
    if (anySub?.az) return anySub.az
    return [...byAzAndTier.keys()][0] ?? null
  }

  const placeInTier = (n: TopologyNode, az: string, tier: SubnetTier) => {
    const azMap = byAzAndTier.get(az) ?? new Map<SubnetTier, TopologyNode[]>()
    const cell = azMap.get(tier) ?? []
    cell.push(n)
    azMap.set(tier, cell)
    byAzAndTier.set(az, azMap)
  }

  const tryPlaceInGrid = (n: TopologyNode): boolean => {
    if (n.type && REGIONAL_EDGE_SERVICE_TYPES.has(n.type)) return true
    if (!workloadInCanvasVpc(n, canvasVpcId, subnetById)) return false
    const sub = n.subnet_id ? subnetById.get(n.subnet_id) ?? null : null
    const overrideTier =
      n.placement_tier === "web" || n.placement_tier === "app" || n.placement_tier === "data"
        ? n.placement_tier
        : null
    if (overrideTier) {
      const az = sub?.az ?? pickSyntheticAz(overrideTier)
      if (az) {
        placeInTier(n, az, overrideTier)
        return true
      }
    }
    if (sub?.az) {
      placeInTier(n, sub.az, sub.tier)
      return true
    }
    if (n.type && SERVERLESS_TYPES.has(n.type)) {
      serverlessNodes.push(n)
      return true
    }
    const syntheticTier = n.type ? SYNTHETIC_TIER_TYPES[n.type] : undefined
    if (syntheticTier) {
      const az = pickSyntheticAz(syntheticTier)
      if (az) {
        placeInTier(n, az, syntheticTier)
        return true
      }
    }
    return false
  }

  for (const n of dedupeLambdaServiceTwins(nodes)) {
    // ALBs fan out across every AZ -> spanning header band, never a tier cell.
    // Gate by canvas VPC so a sibling VPC's ALB never leaks into this frame.
    if (n.type && ALB_HEADER_TYPES.has(n.type)) {
      if (workloadInCanvasVpc(n, canvasVpcId, subnetById)) albNodes.push(n)
      continue
    }
    if (n.stale) {
      if (tryPlaceInGrid(n)) continue
      staleNodes.push(n)
      continue
    }
    if (tryPlaceInGrid(n)) continue
    unplacedNodes.push(n)
  }

  for (const azMap of byAzAndTier.values()) {
    for (const list of azMap.values()) {
      list.sort((a, b) => (a.score?.rank ?? 999) - (b.score?.rank ?? 999))
    }
  }
  serverlessNodes.sort((a, b) => (a.score?.rank ?? 999) - (b.score?.rank ?? 999))
  unplacedNodes.sort((a, b) => (a.score?.rank ?? 999) - (b.score?.rank ?? 999))
  albNodes.sort((a, b) => (a.score?.rank ?? 999) - (b.score?.rank ?? 999))

  const scaffoldAzs = scopedSubnets.map(s => s.az).filter(Boolean) as string[]
  const populatedAzs = new Set<string>([...byAzAndTier.keys(), ...scaffoldAzs])

  const subnetsByCell = new Map<string, SubnetMeta[]>()
  for (const s of subnets) {
    if (!subnetInCanvasScope(s, canvasVpcId, primaryRegion)) continue
    if (!s.az || !populatedAzs.has(s.az)) continue
    const k = `${s.az}::${s.tier}`
    const list = subnetsByCell.get(k) ?? []
    list.push(s)
    subnetsByCell.set(k, list)
  }

  const azs = visibleTopologyAzs([...populatedAzs].sort(), hiddenAzs)
  const azGridColumns = azs.map(() => `minmax(${AZ_COLUMN_MIN_PX}px, 1fr)`).join(" ")
  const vpcGridMinWidth =
    azs.length > 0 ? Math.max(240, azs.length * (AZ_COLUMN_MIN_PX + 6) + 40) : 240

  return { byAzAndTier, subnetsByCell, albNodes, staleNodes, azs, azGridColumns, vpcGridMinWidth }
}

export interface VpcFrameSpec {
  vid: string | null
  grid: CanvasGrid
  natGws: VpcTopology["edges"]["nat_gws"]
  /** Internet gateways attached to this VPC (BE edges.igws). */
  igws: VpcTopology["edges"]["igws"]
  isForeign: boolean
  ownerSystem: string | null
  showIamControlPlane: boolean
}

/** Assemble the per-VPC frame specs + the aggregated stale-workload list the
 *  merged Estate Map renders. Pure (no hooks) so it is unit-testable and runs
 *  inside a single parent useMemo. Partitions workloads by resolved VPC so each
 *  frame only ever sees its OWN VPC's compute — the anti-cramming guarantee
 *  behind FE #299/#301. Scoped mode (mergedVpcView=false) renders just the
 *  primary VPC; merged mode renders one frame per VPC in the payload. */
export function buildVpcFrames(
  subnets: SubnetMeta[],
  nodes: TopologyNode[],
  primaryVpcId: string | null,
  natGws: VpcTopology["edges"]["nat_gws"],
  hiddenAzs: string[],
  mergedVpcView: boolean,
  igws: VpcTopology["edges"]["igws"] = [],
): { frames: VpcFrameSpec[]; staleNodes: TopologyNode[] } {
  const subnetVpc = createMap(subnets.map(s => [s.id, s.vpc_id ?? null]))
  const resolveVpc = (n: TopologyNode): string | null =>
    n.vpc_id ?? (n.subnet_id ? subnetVpc.get(n.subnet_id) ?? null : null)
  const ids = mergedVpcView
    ? frameVpcIds(subnets, primaryVpcId)
    : primaryVpcId
      ? [primaryVpcId]
      : frameVpcIds(subnets, primaryVpcId)
  const frameIdSet = new Set(ids)
  const nodesByFrame = new Map<string, TopologyNode[]>()
  for (const id of ids) nodesByFrame.set(id, [])
  const outside: TopologyNode[] = []
  // Dedupe by node id: the merged `fullSystemNodes` source can carry the same
  // workload twice (e.g. a :Service:EC2Instance twin sharing the id), which
  // otherwise renders the chip twice in one cell and gives the flow overlay two
  // anchors for one id — querySelector picks the first, mis-routing that edge.
  // dedupeLambdaServiceTwins only collapses Lambda twins; this covers the rest.
  const seenNodeId = new Set<string>()
  for (const n of dedupeLambdaServiceTwins(nodes)) {
    if (seenNodeId.has(n.id)) continue
    seenNodeId.add(n.id)
    const v = resolveVpc(n)
    if (v && frameIdSet.has(v)) nodesByFrame.get(v)!.push(n)
    else outside.push(n)
  }
  // NAT gateways grouped by their subnet's VPC; unresolved -> primary frame.
  const natByVpc = new Map<string, VpcTopology["edges"]["nat_gws"]>()
  for (const nat of natGws) {
    const v0 = nat.subnet_id ? subnetVpc.get(nat.subnet_id) ?? null : null
    const target = v0 && frameIdSet.has(v0) ? v0 : ids[0] ?? null
    if (!target) continue
    const list = natByVpc.get(target) ?? []
    list.push(nat)
    natByVpc.set(target, list)
  }
  // IGWs grouped by owning vpc_id (BE >= #305); unresolved -> primary frame.
  const igwByVpc = new Map<string, VpcTopology["edges"]["igws"]>()
  for (const igw of igws) {
    const v0 = igw.vpc_id ?? null
    const target = v0 && frameIdSet.has(v0) ? v0 : ids[0] ?? null
    if (!target) continue
    const list = igwByVpc.get(target) ?? []
    list.push(igw)
    igwByVpc.set(target, list)
  }
  const frames: VpcFrameSpec[] = ids.map((vid, idx) => {
    const vidSubnets = subnets.filter(s => s.vpc_id === vid)
    // A frame is "foreign" when THIS system owns none of its subnets — it only
    // occupies a co-tenant's shared-VPC subnets (all is_foreign). Badge it.
    const isForeign = vidSubnets.length > 0 && vidSubnets.every(s => s.is_foreign === true)
    const ownerSystem = isForeign
      ? vidSubnets.find(s => s.owner_system_name)?.owner_system_name ?? null
      : null
    return {
      vid,
      grid: computeCanvasGrid(vid, subnets, nodesByFrame.get(vid) ?? [], hiddenAzs),
      natGws: natByVpc.get(vid) ?? [],
      igws: igwByVpc.get(vid) ?? [],
      isForeign,
      ownerSystem,
      showIamControlPlane: idx === 0,
    }
  })
  // Diagnostics "Stale workloads" = stale-unplaced across every frame, plus
  // stale nodes with no VPC frame that aren't serverless / regional (those have
  // their own tiers). Each node is in exactly one bucket — no dedupe needed.
  const staleNodes: TopologyNode[] = [
    ...frames.flatMap(f => f.grid.staleNodes),
    ...outside.filter(n =>
      n.stale
      && !(n.type && REGIONAL_EDGE_SERVICE_TYPES.has(n.type))
      && !(n.type && SERVERLESS_TYPES.has(n.type)),
    ),
  ]
  return { frames, staleNodes }
}

const TIERS: ("web" | "app" | "data")[] = ["web", "app", "data"]

/** Locked min-heights for All VPCs · Compare (Layout B). Tiers own vertical
 *  space — Web density must never steal App height. Data stays shorter
 *  (usually 1–2 services). Bands grow via `fr` above these floors so
 *  fullscreen fills like single-VPC. Overflow scrolls inside the cell. */
export const COMPARE_TIER_MIN_PX: Record<"web" | "app" | "data" | "iam", number> = {
  web: 200,
  app: 176,
  data: 110,
  iam: 64,
}

/** Fullscreen floors — Web/App own the viewport; Data stays shorter.
 *  Raised so the map reads larger after reclaiming Users/Internet chrome. */
export const PRESENTATION_TIER_MIN_PX: Record<"web" | "app" | "data" | "iam", number> = {
  web: 120,
  app: 108,
  data: 72,
  iam: 48,
}

/** Compare VPC chrome must not collapse when fr-tier rows compete for height. */
export const COMPARE_VPC_CHROME_MIN_PX = 64

/** Above this count, Compare bands become too narrow — fall back to
 *  primary VPC detail + peer strip (Layout C). */
export const COMPARE_BANDS_MAX_VPCS = 3

function shortVpcId(vid: string | null): string {
  if (!vid) return "unknown"
  return vid.length > 18 ? `${vid.slice(0, 14)}…` : vid
}

/** Human label for a Compare VPC column — owner system beats truncated id. */
function compareVpcTitle(frame: VpcFrameSpec, isPrimary?: boolean): string {
  if (frame.isForeign && frame.ownerSystem) return frame.ownerSystem
  if (isPrimary) return "Own VPC · primary"
  return "Own VPC"
}

function countTierWorkloads(frame: VpcFrameSpec, tier: "web" | "app" | "data"): number {
  let n = 0
  for (const azMap of frame.grid.byAzAndTier.values()) {
    n += azMap.get(tier)?.length ?? 0
  }
  return n
}

function frameHasTier(frame: VpcFrameSpec, tier: "web" | "app" | "data"): boolean {
  for (const az of frame.grid.azs) {
    const sn = frame.grid.subnetsByCell.get(`${az}::${tier}`) ?? []
    const wl = frame.grid.byAzAndTier.get(az)?.get(tier) ?? []
    if (sn.length > 0 || wl.length > 0) return true
  }
  return false
}

/**
 * Compare VPC column widths — weight by AZ count so a 2-AZ VPC isn't crushed
 * to the same width as a 1-AZ peer (equal 1fr made each AZ cell ~half as wide).
 */
export function compareVpcColumnTemplate(frames: Pick<VpcFrameSpec, "grid">[]): string {
  return frames
    .map(f => {
      const azN = Math.max(1, f.grid.azs.length)
      return `minmax(0, ${azN}fr)`
    })
    .join(" ")
}

/** One-glance architecture story for the Compare view. */
export function buildCompareArchitectureStory(
  frames: VpcFrameSpec[],
  systemLabel?: string,
): string {
  const tiersPresent = TIERS.filter(t => frames.some(f => frameHasTier(f, t)))
  const tierPath =
    tiersPresent.length === 3
      ? "Internet → Web → App → Data"
      : tiersPresent.length === 0
        ? "No tiered subnets observed"
        : `Internet → ${tiersPresent.map(t => t[0]!.toUpperCase() + t.slice(1)).join(" → ")}`
  const shared = frames.filter(f => f.isForeign)
  const own = frames.length - shared.length
  const vpcBit =
    shared.length > 0
      ? `${own} own VPC${own === 1 ? "" : "s"} · ${shared.length} shared (${shared.map(s => s.ownerSystem ?? shortVpcId(s.vid)).join(", ")})`
      : `${frames.length} VPC${frames.length === 1 ? "" : "s"}`
  const prefix = systemLabel ? `${systemLabel} · ` : ""
  return `${prefix}${tierPath} · ${vpcBit}`
}

function VpcColumnChrome({
  frame,
  compact,
  isPrimary,
}: {
  frame: VpcFrameSpec
  compact?: boolean
  isPrimary?: boolean
}) {
  const cidrs = [
    ...new Set(
      [...frame.grid.subnetsByCell.values()].flat().map(s => s.cidr).filter(Boolean) as string[],
    ),
  ].slice(0, 2)
  const cidrHint = cidrs.length > 0 ? cidrs.join(" · ") : null
  const webN = countTierWorkloads(frame, "web")
  const appN = countTierWorkloads(frame, "app")
  const dataN = countTierWorkloads(frame, "data")
  const isShared = Boolean(frame.isForeign)
  const accent = isShared ? "#B45309" : "#0E8B7A"
  const border = isShared ? "#F59E0B" : "#00C2A8"
  const title = compareVpcTitle(frame, isPrimary)
  return (
    <div
      className={compact ? "px-2 py-1.5" : "px-2.5 py-2"}
      style={{
        background: isShared ? "#FFFBEB" : "#F0FDFA",
        borderBottom: `2px solid ${border}`,
        minHeight: COMPARE_VPC_CHROME_MIN_PX,
      }}
      data-testid="topology-vpc-column-chrome"
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
            {isShared ? (
              <span
                className="px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-[0.1em] shrink-0"
                style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #F59E0B" }}
                title={`Shared VPC — subnets tagged for "${frame.ownerSystem ?? "peer"}". This system's workloads run here.`}
              >
                shared
              </span>
            ) : (
              <span
                className="px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-[0.1em] shrink-0"
                style={{ background: "#CCFBF1", color: "#0F766E", border: "1px solid #14B8A6" }}
              >
                {isPrimary ? "primary" : "own"}
              </span>
            )}
            <span
              className="text-[13px] font-bold truncate leading-tight"
              style={{ color: accent }}
              title={title}
              data-testid="topology-compare-vpc-title"
            >
              {title}
            </span>
          </div>
          <div
            className="text-[11px] font-mono font-semibold mt-0.5 truncate"
            style={{ color: PAL.ink }}
            title={frame.vid ?? "unknown"}
            data-testid="topology-compare-vpc-id"
          >
            {frame.vid ?? "unknown"}
          </div>
        </div>
        <span
          className="text-[10px] font-bold tabular-nums shrink-0 pt-0.5"
          style={{ color: accent }}
          title="Workloads in Web · App · Data"
        >
          W{webN} · A{appN} · D{dataN}
        </span>
      </div>
      {cidrHint ? (
        <div className="text-[10px] font-mono mt-1 truncate" style={{ color: "#5A6B7A" }}>
          {cidrHint}
        </div>
      ) : null}
      {frame.grid.azs.length > 0 ? (
        <div
          className="grid gap-1.5 mt-1.5 pt-1.5"
          style={{
            gridTemplateColumns: `repeat(${frame.grid.azs.length}, minmax(0, 1fr))`,
            borderTop: `1px dashed ${isShared ? "#FCD34D" : "#99F6E4"}`,
          }}
          data-testid="topology-vpc-az-headers"
        >
          {frame.grid.azs.map(az => (
            <div
              key={az}
              className="text-[10px] font-mono font-bold uppercase tracking-[0.08em] text-center truncate"
              style={{ color: "#334155" }}
              title={az}
            >
              {az}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Layout B — All VPCs · Compare (AWS multi-VPC grammar).
 *
 * Each VPC is a full-height bordered column (own = teal, shared = amber) so
 * multi-VPC estates read as distinct boxes — same idea as AWS multi-account /
 * multi-VPC architecture diagrams — while CSS subgrid keeps Web / App / Data
 * tier rows aligned across columns.
 *
 * Subcolumns = AZs. Overflow stays inside the tier cell.
 */
function MultiVpcCompareBands({
  frames,
  sgIndex,
  roleForWorkload,
  selectedNodeId,
  onSelect,
  compact,
  iamRoles,
  allWorkloads,
  highlightedRoleName,
  systemLabel,
}: {
  frames: VpcFrameSpec[]
  sgIndex: Map<string, SecurityGroupMeta>
  roleForWorkload: (id: string) => IamRoleRollup | undefined
  selectedNodeId: string | null
  onSelect: (id: string) => void
  compact: boolean
  iamRoles: IamRoleRollup[]
  allWorkloads: TopologyNode[]
  highlightedRoleName: string | null
  systemLabel?: string
}) {
  // Weight VPC columns by AZ count so a 2-AZ shared VPC isn't crushed to the
  // same width as a 1-AZ primary (equal 1fr made each AZ cell ~half as wide).
  const colTemplate = compareVpcColumnTemplate(frames)
  const story = buildCompareArchitectureStory(frames, systemLabel)
  // Compare always collapses density — Web stacks must never grow the band.
  // Glance is the default architecture density (role hierarchy + cell collapse).
  const densityCollapsed = true
  const viewDensity: ViewDensity = "glance"

  const hasAnyAlb = frames.some(f => f.grid.albNodes.length > 0)
  const hasAnyNat = frames.some(f => f.natGws.length > 0)
  const hasIngress = hasAnyAlb || hasAnyNat
  // Compare always uses Compare floors — presentation mins crush subnet cells
  // when width is split across VPC columns (Alon, 2026-07-09).
  const tierMins = COMPARE_TIER_MIN_PX
  const sidebarW = compact ? TIER_SIDEBAR_WIDTH.compact : TIER_SIDEBAR_WIDTH.normal

  // Parent rows: chrome → optional ingress → web → app → data.
  // VPC columns use subgrid so tier heights stay locked across VPCs.
  const bodyRowTemplate = [
    `minmax(${COMPARE_VPC_CHROME_MIN_PX}px, auto)`,
    hasIngress ? "auto" : null,
    `minmax(${tierMins.web}px, 1.2fr)`,
    `minmax(${tierMins.app}px, 1.15fr)`,
    `minmax(${tierMins.data}px, 0.75fr)`,
  ]
    .filter(Boolean)
    .join(" ")

  const tierRowStart = hasIngress ? 3 : 2

  return (
    <div
      className="grid gap-2 w-full h-full min-h-0 min-w-0"
      data-testid="topology-vpc-compare-bands"
      style={{
        width: "100%",
        ...(compact
          ? { height: "100%", minHeight: 0, overflowY: "auto" }
          : { minHeight: "min(78vh, 900px)" }),
        gridTemplateRows: [
          "auto", // system path
          "minmax(0, 1fr)", // VPC columns body — fills leftover width/height
        ]
          .filter(Boolean)
          .join(" "),
      }}
    >
      <div
        className="rounded-md px-2.5 py-1.5 flex items-center gap-2 min-w-0"
        style={{
          background: "linear-gradient(90deg, #F0FDFA 0%, #FFFFFF 55%)",
          border: "1px solid #99F6E4",
        }}
        data-testid="topology-compare-architecture-story"
      >
        <span
          className="text-[9px] font-bold uppercase tracking-[0.14em] shrink-0"
          style={{ color: "#0E8B7A" }}
        >
          System path
        </span>
        <span className="text-[11px] font-semibold truncate" style={{ color: PAL.ink }} title={story}>
          {story}
        </span>
      </div>

      <div
        className="grid min-h-0 min-w-0 w-full h-full"
        style={{
          width: "100%",
          height: "100%",
          gridTemplateColumns: `${sidebarW} ${colTemplate}`,
          gridTemplateRows: bodyRowTemplate,
          // Wide gutter = clear VPC boundary (AWS multi-VPC diagram grammar)
          columnGap: 20,
          rowGap: 0,
        }}
        data-testid="topology-compare-vpc-columns"
      >
        {/* Corner above tier labels */}
        <div style={{ gridColumn: 1, gridRow: 1 }} aria-hidden />

        {hasIngress ? (
          <div
            className="flex items-center justify-center self-stretch"
            style={{
              gridColumn: 1,
              gridRow: 2,
              background: PAL.ink,
              color: "white",
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
              fontSize: "9px",
              fontWeight: 700,
              letterSpacing: "0.14em",
              borderRadius: "6px 0 0 6px",
            }}
            data-testid="topology-compare-ingress-row"
          >
            INGRESS
          </div>
        ) : null}

        {TIERS.map((tier, tierIdx) => (
          <div
            key={`side-${tier}`}
            data-testid={tierIdx === 0 ? "topology-tier-stack" : `topology-tier-band-${tier}`}
            className="flex items-center justify-center self-stretch"
            style={{
              gridColumn: 1,
              gridRow: tierRowStart + tierIdx,
              background: PAL.ink,
              color: "white",
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.18em",
              borderRadius:
                tierIdx === TIERS.length - 1 && !hasIngress
                  ? "6px 0 0 6px"
                  : tierIdx === 0 && !hasIngress
                    ? "6px 0 0 0"
                    : 0,
              minHeight: tierMins[tier],
            }}
          >
            {TIER_SIDEBAR_LABEL[tier]}
          </div>
        ))}

        {frames.map((f, idx) => {
          const isShared = Boolean(f.isForeign)
          const borderColor = isShared ? "#F59E0B" : "#00C2A8"
          const columnBg = isShared ? "rgba(255, 251, 235, 0.72)" : "rgba(240, 253, 250, 0.55)"
          return (
            <div
              key={`col-${f.vid}`}
              className="min-w-0 min-h-0"
              style={{
                gridColumn: idx + 2,
                gridRow: "1 / -1",
                display: "grid",
                gridTemplateRows: "subgrid",
                border: `2.5px solid ${borderColor}`,
                borderRadius: 8,
                background: columnBg,
                boxShadow: isShared
                  ? "inset 0 0 0 1px rgba(245, 158, 11, 0.25)"
                  : "inset 0 0 0 1px rgba(0, 194, 168, 0.2)",
                // Allow stack chips to paint; tier cells own scroll if needed
                overflow: "hidden",
              }}
              data-testid={`topology-compare-vpc-column-${f.vid}`}
              data-vpc-role={isShared ? "shared" : idx === 0 ? "primary" : "own"}
            >
              <div
                className="overflow-hidden"
                style={{
                  borderBottom: `1.5px solid ${borderColor}`,
                  background: isShared ? "#FFFBEB" : "#F0FDFA",
                }}
              >
                <VpcColumnChrome frame={f} compact={compact} isPrimary={idx === 0} />
              </div>

              {hasIngress ? (
                <div
                  className={`px-2 flex flex-col items-center gap-1 ${
                    f.grid.albNodes.length > 0 || f.natGws.length > 0 ? "py-2" : "py-1"
                  }`}
                  style={{
                    borderBottom: `1px dashed ${isShared ? "#FCD34D" : "#99F6E4"}`,
                    background:
                      f.grid.albNodes.length > 0
                        ? isShared
                          ? "#FFF7ED"
                          : "#F5F3FF"
                        : "transparent",
                    minHeight: f.grid.albNodes.length > 0 || f.natGws.length > 0 ? 52 : 28,
                  }}
                >
                  {f.grid.albNodes.length > 0 ? (
                    <>
                      <div className="flex items-center gap-1" style={{ color: PAL.slate }}>
                        <AlbGlyph size={12} />
                        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold">
                          {f.grid.albNodes.length === 1
                            ? "Application Load Balancer"
                            : `Load Balancers (${f.grid.albNodes.length})`}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 justify-center">
                        {f.grid.albNodes.map(n => (
                          <WorkloadChip
                            key={n.id}
                            node={n}
                            size="gateway"
                            selected={n.id === selectedNodeId}
                            onClick={() => onSelect(n.id)}
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-[10px] italic" style={{ color: PAL.slate }}>
                      No ALB
                    </div>
                  )}
                  {f.natGws.length > 0 ? (
                    <div className="flex flex-wrap gap-1 justify-center">
                      {f.natGws.map(n => (
                        <span
                          key={n.id}
                          className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-md"
                          style={{
                            background: "linear-gradient(180deg, #FFF9F0 0%, #FFFFFF 100%)",
                            border: "2px solid #FF9900",
                            color: "#7B3F00",
                          }}
                          data-testid="topology-nat-gateway-chip"
                          title={`NAT gateway · ${n.name} (from vpc_topology.edges)`}
                        >
                          <span
                            className="inline-flex items-center justify-center rounded text-[9px] font-bold w-7 h-7 shrink-0"
                            style={{ background: PAL.awsFrame, color: PAL.awsOrange }}
                          >
                            NAT
                          </span>
                          {n.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {TIERS.map((tier, tierIdx) => {
                const azs = f.grid.azs
                const azCols =
                  azs.length > 0 ? azs.map(() => "minmax(0, 1fr)").join(" ") : "1fr"
                const hasTierContent = frameHasTier(f, tier)
                const emptyTierCopy =
                  tier === "data"
                    ? "No data subnet observed · no RDS / DB workload in this VPC"
                    : `No ${tier} subnet observed in this VPC`
                return (
                  <div
                    key={`${f.vid}-${tier}`}
                    className="p-2.5 min-h-0 h-full flex flex-col"
                    style={{
                      background: TIER_BG[tier],
                      borderTop:
                        tierIdx === 0 && !hasIngress
                          ? undefined
                          : `1px solid ${isShared ? "rgba(245, 158, 11, 0.35)" : "rgba(0, 194, 168, 0.28)"}`,
                      minHeight: tierMins[tier],
                      // Visible overflow so Glance stack chips aren't clipped;
                      // AZ grid scrolls if content still exceeds the band.
                      overflow: "visible",
                    }}
                    data-testid={`topology-compare-cell-${f.vid}-${tier}`}
                  >
                    {!hasTierContent ? (
                      <div
                        className="text-[11px] italic flex-1 flex items-center justify-center text-center px-2 rounded-md"
                        style={{
                          color: PAL.slate,
                          background: "rgba(255,255,255,0.55)",
                          border: `1px dashed ${isShared ? "#FCD34D" : "#99F6E4"}`,
                        }}
                        data-testid={tier === "data" ? "topology-data-tier-empty" : undefined}
                      >
                        {emptyTierCopy}
                      </div>
                    ) : (
                      <div
                        className="grid gap-1.5 flex-1 min-h-0 overflow-hidden content-stretch"
                        style={{ gridTemplateColumns: azCols }}
                      >
                        {azs.map(az => {
                          const subnetsHere = f.grid.subnetsByCell.get(`${az}::${tier}`) ?? []
                          const workloadsHere = f.grid.byAzAndTier.get(az)?.get(tier) ?? []
                          return (
                            <SubnetCell
                              key={`${f.vid}-${az}-${tier}`}
                              tier={tier}
                              az={az}
                              subnetsHere={subnetsHere}
                              workloadsHere={workloadsHere}
                              sgIndex={sgIndex}
                              selectedNodeId={selectedNodeId}
                              onSelect={onSelect}
                              compact
                              roleForWorkload={roleForWorkload}
                              densityCollapsed={densityCollapsed}
                              viewDensity={viewDensity}
                            />
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* IAM omitted on Compare Glance — Inventory / DetailPanel own roles. */}
    </div>
  )
}

/** Layout C fallback — primary VPC full detail + peer VPC summary cards. */
function PrimaryPlusPeerStrip({
  frames,
  sgIndex,
  roleForWorkload,
  selectedNodeId,
  highlightedRoleName,
  onSelect,
  presentationMode,
  densityCollapsed,
  viewDensity,
  iamRoles,
  allWorkloads,
}: {
  frames: VpcFrameSpec[]
  sgIndex: Map<string, SecurityGroupMeta>
  roleForWorkload: (id: string) => IamRoleRollup | undefined
  selectedNodeId: string | null
  highlightedRoleName: string | null
  onSelect: (id: string) => void
  presentationMode: boolean
  densityCollapsed: boolean
  viewDensity: ViewDensity
  iamRoles: IamRoleRollup[]
  allWorkloads: TopologyNode[]
}) {
  const [primary, ...peers] = frames
  if (!primary) return null
  return (
    <div className="flex flex-col gap-3 w-full min-w-0 flex-1" data-testid="topology-primary-peer-strip">
      <VpcCanvasFrame
        vpcId={primary.vid}
        grid={primary.grid}
        natGws={primary.natGws}
        igws={primary.igws}
        isForeign={primary.isForeign}
        ownerSystem={primary.ownerSystem}
        showIamControlPlane
        iamRoles={iamRoles}
        allWorkloads={allWorkloads}
        sgIndex={sgIndex}
        roleForWorkload={roleForWorkload}
        selectedNodeId={selectedNodeId}
        highlightedRoleName={highlightedRoleName}
        onSelect={onSelect}
        presentationMode={presentationMode}
        densityCollapsed={densityCollapsed}
        viewDensity={viewDensity}
      />
      {peers.length > 0 ? (
        <div className="flex flex-wrap gap-2" data-testid="topology-peer-vpc-cards">
          {peers.map(p => {
            const wl = [...p.grid.byAzAndTier.values()].reduce(
              (n, az) => n + [...az.values()].reduce((m, cell) => m + cell.length, 0),
              0,
            ) + p.grid.albNodes.length
            return (
              <div
                key={p.vid}
                className="rounded-md px-3 py-2 min-w-[160px]"
                style={{ border: "1.5px solid #00C2A8", background: PAL.cardBg }}
              >
                <div className="text-[10px] font-mono font-bold" style={{ color: "#0E8B7A" }} title={p.vid ?? undefined}>
                  VPC · {p.vid && p.vid.length > 14 ? `${p.vid.slice(0, 10)}…` : p.vid}
                </div>
                <div className="text-[10px] mt-1" style={{ color: PAL.slate }}>
                  {wl} workloads · {p.grid.azs.length} AZs
                  {p.isForeign && p.ownerSystem ? ` · shared (${p.ownerSystem})` : ""}
                </div>
                <div className="text-[9px] font-semibold mt-0.5" style={{ color: "#0E8B7A" }}>
                  W{countTierWorkloads(p, "web")} · A{countTierWorkloads(p, "app")} · D{countTierWorkloads(p, "data")}
                </div>
                <div className="text-[9px] italic mt-1" style={{ color: PAL.slate }}>
                  Select this VPC in scope for full 3-tier detail
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

interface VpcCanvasFrameProps {
  vpcId: string | null
  grid: CanvasGrid
  natGws: VpcTopology["edges"]["nat_gws"]
  igws?: VpcTopology["edges"]["igws"]
  isForeign: boolean
  ownerSystem: string | null
  showIamControlPlane: boolean
  iamRoles: IamRoleRollup[]
  allWorkloads: TopologyNode[]
  sgIndex: Map<string, SecurityGroupMeta>
  roleForWorkload: (id: string) => IamRoleRollup | undefined
  selectedNodeId: string | null
  highlightedRoleName: string | null
  onSelect: (id: string) => void
  presentationMode: boolean
  densityCollapsed: boolean
  viewDensity: ViewDensity
}

/** One AWS VPC frame — its own AZ x tier grid, subnets, workloads, IGW/NAT
 *  edge, and (primary frame only) IAM control plane. Presentational: all
 *  placement is precomputed in `grid`. Rendered once per VPC so the merged
 *  Estate Map shows each VPC's REAL subnet skeleton instead of cramming
 *  every VPC's workloads into the primary VPC's tiles (FE #299/#301). */
function VpcCanvasFrame({
  vpcId,
  grid,
  natGws,
  igws = [],
  isForeign,
  ownerSystem,
  showIamControlPlane,
  iamRoles,
  allWorkloads,
  sgIndex,
  roleForWorkload,
  selectedNodeId,
  highlightedRoleName,
  onSelect,
  presentationMode,
  densityCollapsed,
  viewDensity,
}: VpcCanvasFrameProps) {
  void igws // IGWs render on the region network rail (with VPCEs), not in-frame.
  const { byAzAndTier, subnetsByCell, albNodes, azs, azGridColumns, vpcGridMinWidth } = grid
  const hasNats = natGws.length > 0
  // IGWs render on the region VPCE rail (right of VPC), not above Web.

  const natBand = hasNats && (
    <div className="mb-1.5 pb-1 border-b border-dashed" style={{ borderColor: "#CBD5E1" }}>
      <div className="text-[9px] uppercase tracking-[0.12em] font-semibold mb-1" style={{ color: PAL.slate }}>
        NAT gateways ({natGws.length})
      </div>
      <div className="flex flex-wrap gap-1.5">
        {natGws.map(n => (
          <span
            key={n.id}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1.5 rounded-md"
            style={{
              background: "linear-gradient(180deg, #FFF9F0 0%, #FFFFFF 100%)",
              border: "2px solid #FF9900",
              color: "#7B3F00",
            }}
            data-testid="topology-nat-gateway-chip"
            title={`NAT gateway · ${n.name} (from vpc_topology.edges)`}
          >
            <span
              className="inline-flex items-center justify-center rounded w-8 h-8 shrink-0"
              style={{ background: "#8C4FFF", color: "white" }}
            >
              <AwsServiceGlyph kind="nat" size={20} />
            </span>
            NAT GW · {n.name}
          </span>
        ))}
      </div>
    </div>
  )

  {/* Load balancers — rendered ABOVE the AZ grid, spanning its full width,
      never inside a single AZ's tier cell. An ALB fans out across every AZ
      behind it; it doesn't live "in" one the way an EC2 instance does. */}
  const albBand = albNodes.length > 0 && (
    <div
      className="mb-1.5 pb-1.5 flex flex-col items-center border-b border-dashed"
      style={{ borderColor: "#C2CDD6" }}
      data-testid="topology-alb-band"
    >
      <div className="flex items-center gap-1.5 mb-1" style={{ color: PAL.slate }}>
        <AlbGlyph size={16} />
        <span className="text-[9px] uppercase tracking-[0.14em] font-semibold">
          {albNodes.length === 1 ? "Application Load Balancer" : `Load Balancers (${albNodes.length})`}
        </span>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {albNodes.map(n => (
          <WorkloadChip
            key={n.id}
            node={n}
            size="gateway"
            selected={n.id === selectedNodeId}
            onClick={() => onSelect(n.id)}
          />
        ))}
      </div>
    </div>
  )

  const azHeaderRow = (
    <div className="flex gap-0">
      <div
        className="rounded-l-md shrink-0"
        style={{ width: presentationMode ? TIER_SIDEBAR_WIDTH.compact : TIER_SIDEBAR_WIDTH.normal }}
        aria-hidden
      />
      <div
        className={presentationMode ? "rounded-r-md px-2 pt-1 pb-0.5 flex-1" : "rounded-r-md px-2.5 pt-1.5 pb-1 flex-1"}
        style={{ background: "#EEF2F6" }}
      >
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: azGridColumns }}
          data-testid="topology-az-column-headers"
        >
          {azs.map(az => (
            <div
              key={`az-header-${az}`}
              className="text-[10px] font-mono font-bold uppercase tracking-[0.1em] text-center truncate"
              style={{ color: PAL.slate }}
              title={az}
            >
              {az}
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const iamCpBlock = (compact: boolean) => (
    <>
      <div
        className="rounded-l-md flex items-center justify-center shrink-0"
        style={{
          background: "#DD344C",
          color: "white",
          width: compact ? TIER_SIDEBAR_WIDTH.compact : TIER_SIDEBAR_WIDTH.normal,
          writingMode: "vertical-rl",
          transform: "rotate(180deg)",
          fontSize: "9px",
          fontWeight: 700,
          letterSpacing: "0.14em",
        }}
      >
        IAM CP
      </div>
      <IamControlPlane
        roles={iamRoles}
        allWorkloads={allWorkloads}
        highlightedRoleName={highlightedRoleName}
        embeddedInVpc
        compact={compact}
      />
    </>
  )

  // Glance / fullscreen = network map. IAM roles belong in Inventory (and
  // DetailPanel), not as a permanent bottom band that steals VPC height.
  const showIamOnMap =
    !presentationMode &&
    viewDensity === "inventory" &&
    showIamControlPlane &&
    iamRoles.length > 0

  return (
    <div
      className={
        presentationMode
          ? "rounded-md p-1.5 relative min-w-0 w-full h-full min-h-0"
          : "rounded-md p-2 relative shrink-0"
      }
      data-testid="topology-vpc-frame"
      style={
        presentationMode
          ? {
              // Fullscreen: this frame is a subgrid item of the multi-VPC
              // grid wrapper in AwsFrame — it inherits that grid's row
              // tracks instead of sizing its own, so Web/App/Data line up
              // across every VPC frame regardless of content density
              // (Alon: "the merged VPCs need to be perfectly parallel").
              // width 100% of the region grid's 1fr column — fills leftover
              // space beside fixed VPCE / edge rails.
              background: PAL.cardBg,
              border: `2px solid #00C2A8`,
              minWidth: 0,
              width: "100%",
              height: "100%",
              display: "grid",
              gridTemplateRows: "subgrid",
              gridRow: "1 / -1",
              overflow: "hidden",
            }
          : {
              background: PAL.cardBg,
              border: `2px solid #00C2A8`,
              minWidth: `${vpcGridMinWidth}px`,
              flex: "1 1 auto",
              overflow: "visible",
            }
      }
    >
      {/* In-flow header (not absolute -top) so VPC id / shared badge never
          clip under the parent overflow-x-auto / border edge. */}
      <div
        className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] font-semibold mb-1 px-0.5"
        style={{ color: "#0E8B7A", gridRow: presentationMode ? 1 : undefined }}
        data-testid="topology-vpc-frame-header"
      >
        <span className="truncate" title={vpcId ?? "unknown"}>
          VPC · {vpcId ?? "unknown"}
        </span>
        {isForeign && ownerSystem ? (
          <span
            className="px-1 rounded-sm text-[8px] font-semibold normal-case tracking-normal shrink-0"
            style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #F59E0B" }}
            title={`Shared VPC — these subnets are tagged for "${ownerSystem}". This system's workloads run here, but ${ownerSystem} owns the subnets.`}
          >
            shared · {ownerSystem}
          </span>
        ) : null}
      </div>

      {presentationMode ? (
        azs.length === 0 ? (
          <div
            className="text-[12px] italic py-6 text-center"
            style={{ color: PAL.slate, gridRow: "2 / -1" }}
          >
            No tagged subnets in this VPC.
          </div>
        ) : (
          <>
            {/* Row 2 (subgrid): NAT + ALB + AZ headers — height = max across
                VPCs so every Web tier starts on the same Y. */}
            <div style={{ gridRow: 2, minHeight: 0 }} className="min-h-0">
              {natBand}
              {albBand}
              <div className="mt-1">{azHeaderRow}</div>
            </div>

            {/* Rows 3-5 (subgrid): Web / App / Data — no IAM row on Glance/
                fullscreen; Inventory keeps IAM below the tier stack. */}
            {TIERS.map((tier, tierIdx) => (
              <div
                key={tier}
                data-testid={tierIdx === 0 ? "topology-tier-stack" : undefined}
                className="flex gap-0 min-h-0 h-full"
                style={{
                  gridRow: tierIdx + 3,
                  minHeight: presentationMode
                    ? PRESENTATION_TIER_MIN_PX[tier]
                    : COMPARE_TIER_MIN_PX[tier],
                }}
              >
                <div
                  className="rounded-l-md flex items-center justify-center shrink-0 self-stretch"
                  style={{
                    background: PAL.ink,
                    color: "white",
                    width: TIER_SIDEBAR_WIDTH.compact,
                    writingMode: "vertical-rl",
                    transform: "rotate(180deg)",
                    fontSize: "10px",
                    fontWeight: 700,
                    letterSpacing: "0.18em",
                  }}
                >
                  {TIER_SIDEBAR_LABEL[tier]}
                </div>
                <div
                  className="rounded-r-md p-1.5 flex-1 flex flex-col min-h-0 h-full overflow-hidden"
                  style={{ background: TIER_BG[tier] }}
                >
                  <div
                    className="grid gap-1.5 flex-1 min-h-0 h-full overflow-hidden content-stretch"
                    style={{ gridTemplateColumns: azGridColumns }}
                  >
                    {azs.map(az => {
                      const subnetsHere = subnetsByCell.get(`${az}::${tier}`) ?? []
                      const workloadsHere = byAzAndTier.get(az)?.get(tier) ?? []
                      return (
                        <SubnetCell
                          key={`${az}-${tier}`}
                          tier={tier}
                          az={az}
                          subnetsHere={subnetsHere}
                          workloadsHere={workloadsHere}
                          sgIndex={sgIndex}
                          selectedNodeId={selectedNodeId}
                          onSelect={onSelect}
                          compact
                          roleForWorkload={roleForWorkload}
                          densityCollapsed={densityCollapsed}
                          viewDensity={viewDensity}
                        />
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </>
        )
      ) : azs.length === 0 ? (
        <div className="text-[12px] italic py-6 text-center" style={{ color: PAL.slate }}>
          No tagged subnets in this VPC.
        </div>
      ) : viewDensity === "glance" ? (
        /* AWS Architecture grammar: AZ columns, Public/App/Data stacked inside.
           Multi-VPC Compare keeps shared tier bands; single-VPC Glance matches
           the canonical AWS reference (AZ as failure-domain columns). */
        <div className="mt-2" data-testid="topology-aws-az-columns">
          <div className="space-y-2">
            {natBand}
            {albBand}
            <div
              className="grid gap-2.5"
              style={{
                gridTemplateColumns: azGridColumns,
                // Shared tracks: AZ title + Public + App + Data — empty DB
                // cells match occupied siblings across AZs.
                // Web/App grow; Data stays shorter. Floors match dense icon cells.
                gridTemplateRows:
                  "auto minmax(100px, 1.35fr) minmax(96px, 1.2fr) minmax(64px, 0.6fr)",
                alignItems: "stretch",
              }}
              data-testid="topology-tier-stack"
            >
              {azs.map(az => (
                <div
                  key={az}
                  className="rounded-md p-2 min-w-0 min-h-0 gap-2"
                  style={{
                    border: "2px dashed #3B48CC",
                    background: "rgba(59,72,204,0.03)",
                    display: "grid",
                    gridTemplateRows: "subgrid",
                    gridRow: "1 / -1",
                  }}
                  data-testid={`topology-az-column-${az}`}
                >
                  <div
                    className="text-[10px] font-mono font-bold uppercase tracking-[0.1em] text-center pb-1"
                    style={{ color: "#3B48CC", borderBottom: "1px solid rgba(59,72,204,0.2)" }}
                    title={az}
                  >
                    Availability Zone · {az}
                  </div>
                  {TIERS.map(tier => {
                    const subnetsHere = subnetsByCell.get(`${az}::${tier}`) ?? []
                    const workloadsHere = byAzAndTier.get(az)?.get(tier) ?? []
                    return (
                      <SubnetCell
                        key={`${az}-${tier}`}
                        tier={tier}
                        az={az}
                        subnetsHere={subnetsHere}
                        workloadsHere={workloadsHere}
                        sgIndex={sgIndex}
                        selectedNodeId={selectedNodeId}
                        onSelect={onSelect}
                        compact
                        roleForWorkload={roleForWorkload}
                        densityCollapsed={densityCollapsed}
                        viewDensity={viewDensity}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
            {showIamOnMap ? (
              <div className="flex gap-0">{iamCpBlock(false)}</div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <div className="space-y-2">
            {natBand}
            {albBand}
            {azHeaderRow}
            <div data-testid="topology-tier-stack" className="contents">
              {TIERS.map(tier => (
                <div
                  key={tier}
                  className="flex gap-0 min-h-0"
                  style={{ minHeight: COMPARE_TIER_MIN_PX[tier] }}
                >
                  <div
                    className="rounded-l-md flex items-center justify-center shrink-0"
                    style={{
                      background: PAL.ink,
                      color: "white",
                      width: TIER_SIDEBAR_WIDTH.normal,
                      writingMode: "vertical-rl",
                      transform: "rotate(180deg)",
                      fontSize: "10px",
                      fontWeight: 700,
                      letterSpacing: "0.18em",
                    }}
                  >
                    {TIER_SIDEBAR_LABEL[tier]}
                  </div>
                  <div className="rounded-r-md p-1.5 flex-1" style={{ background: TIER_BG[tier] }}>
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: azGridColumns }}>
                      {azs.map(az => {
                        const subnetsHere = subnetsByCell.get(`${az}::${tier}`) ?? []
                        const workloadsHere = byAzAndTier.get(az)?.get(tier) ?? []
                        return (
                          <SubnetCell
                            key={`${az}-${tier}`}
                            tier={tier}
                            az={az}
                            subnetsHere={subnetsHere}
                            workloadsHere={workloadsHere}
                            sgIndex={sgIndex}
                            selectedNodeId={selectedNodeId}
                            onSelect={onSelect}
                            compact={presentationMode}
                            roleForWorkload={roleForWorkload}
                            densityCollapsed={densityCollapsed}
                            viewDensity={viewDensity}
                          />
                        )
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {showIamOnMap ? (
              <div className="flex gap-0">{iamCpBlock(false)}</div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}


export function AwsFrame({
  vpcTopology,
  nodes,
  mergedVpcView = false,
  hiddenAzs = [],
  serverlessSourceNodes,
  regionalDataSourceNodes,
  overlayEdges,
  flowMode = "all_access",
  onFlowModeChange,
  attackPathFlowCount = 0,
  trafficEdges,
  selectedNodeId,
  highlightedRoleName = null,
  onSelect,
  presentationMode = false,
  scale = 1,
  densityCollapsed = false,
  viewDensity = "glance",
  systemLabel,
}: Props) {
  const topo = useMemo(() => normalizeVpcTopology(vpcTopology), [vpcTopology])
  // SG lookup for the SubnetCell groupings.
  const sgIndex = useMemo(() => {
    const m = new Map<string, SecurityGroupMeta>()
    for (const sg of topo.security_groups ?? []) {
      m.set(sg.id, sg)
    }
    return m
  }, [topo.security_groups])
  const iamRoles = topo.iam_roles ?? []
  const roleForWorkload = useMemo(() => {
    const m = new Map<string, IamRoleRollup>()
    for (const role of iamRoles) {
      for (const wid of role.workload_ids ?? []) {
        if (!m.has(wid)) m.set(wid, role)
      }
    }
    return (nodeId: string) => m.get(nodeId)
  }, [iamRoles])
  const trafficEdgesList = trafficEdges ?? []
  const overlayEdgeList = overlayEdges ?? trafficEdgesList
  const vpceIds = useMemo(
    () => new Set((topo.edges.vpces ?? []).map(v => v.id)),
    [topo.edges.vpces],
  )
  const regionalTierNodes = useMemo(
    () => extractRegionalDataServices(regionalDataSourceNodes ?? nodes),
    [regionalDataSourceNodes, nodes],
  )
  const serverlessTierNodes = useMemo(
    () => extractServerlessOutsideVpc(serverlessSourceNodes ?? nodes, topo.subnets),
    [serverlessSourceNodes, nodes, topo.subnets],
  )
  const visibleEdges = useMemo(() => {
    const visible = new Set(nodes.map(n => n.id))
    for (const n of regionalTierNodes) visible.add(n.id)
    for (const n of serverlessTierNodes) visible.add(n.id)
    return overlayEdgeList.filter(e => {
      if (!visible.has(e.source_id)) return false
      if (e.target_id === "__igw__") return true
      if (vpceIds.has(e.target_id)) return true
      return visible.has(e.target_id)
    })
  }, [overlayEdgeList, nodes, regionalTierNodes, serverlessTierNodes, vpceIds])
  // One frame PER VPC. Merged mode renders every VPC that owns a subnet in the
  // payload (primary first); scoped mode renders just the selected VPC. Each
  // frame receives ONLY its own VPC's workloads so a second VPC's compute is
  // never force-fit into the primary's tiles (FE #299/#301 follow-up). Logic
  // lives in the pure, unit-tested buildVpcFrames().
  const { frames, staleNodes } = useMemo(
    () =>
      buildVpcFrames(
        topo.subnets,
        nodes,
        topo.vpc_id,
        topo.edges.nat_gws,
        hiddenAzs,
        mergedVpcView,
        topo.edges.igws,
      ),
    [topo.subnets, topo.vpc_id, topo.edges.nat_gws, topo.edges.igws, nodes, hiddenAzs, mergedVpcView],
  )
  const hasIgw = topo.edges.igws.length > 0
  // Story-strip caption only — the clickable / flow-anchor IGW chip lives
  // on the VPCE rail (right of VPC), same column as VPC endpoints.
  const primaryIgw = topo.edges.igws[0]
  const hasVpces = topo.edges.vpces.length > 0
  const showNetworkRail = hasIgw || hasVpces
  // Prefer IGWs from the primary/scoped frame; fall back to topo list.
  const railIgws =
    frames.flatMap(f => f.igws).length > 0
      ? frames.flatMap(f => f.igws)
      : topo.edges.igws
  const accountSuffix = topo.account_id ? `· acct ${topo.account_id}` : ""
  const flowContainerRef = useRef<HTMLDivElement | null>(null)

  const attackPathEdgeCount = attackPathFlowCount

  const tierMin = presentationMode ? PRESENTATION_TIER_MIN_PX : COMPARE_TIER_MIN_PX

  return (
    <div
      ref={flowContainerRef}
      className={
        presentationMode
          ? "rounded-xl p-1 space-y-0.5 relative w-full h-full min-h-0 min-w-0 overflow-hidden flex flex-col"
          : "rounded-2xl p-2 space-y-1.5 relative w-full max-w-none min-w-0 overflow-x-auto"
      }
      style={{ background: PAL.bg, border: `1px solid #DDE3E8`, width: "100%" }}
    >
      {onFlowModeChange ? (
        <div
          className={
            presentationMode
              ? "flex items-center justify-end gap-2 pb-0"
              : "flex items-center justify-end gap-2 pb-1"
          }
        >
          <span
            className={
              presentationMode
                ? "text-[9px] uppercase tracking-wider font-semibold"
                : "text-[10px] uppercase tracking-wider font-semibold"
            }
            style={{ color: PAL.slate }}
          >
            Flow overlay
          </span>
          <FlowModeToggle
            mode={flowMode}
            onChange={onFlowModeChange}
            attackPathCount={attackPathEdgeCount}
          />
        </div>
      ) : null}
      {/* Users → Internet — clustered toward center (not pinned to corners).
          IGW chip lives on the VPCE rail. */}
      <div
        className={
          presentationMode
            ? "flex items-center justify-center gap-6 py-0.5 w-full min-w-0 shrink-0"
            : "flex items-center justify-center gap-8 py-1 w-full min-w-0"
        }
        data-testid="topology-users-internet-strip"
      >
        <div className="flex items-center gap-2 shrink-0" style={{ color: PAL.ink }}>
          <span
            className="inline-flex items-center justify-center rounded-lg"
            style={{
              width: presentationMode ? 40 : 48,
              height: presentationMode ? 40 : 48,
              background: "#EEF2FF",
              border: "1.5px solid #6366F1",
              fontSize: presentationMode ? 20 : 24,
            }}
            aria-hidden
          >
            👥
          </span>
          <div className="flex flex-col leading-tight">
            <span
              className={
                presentationMode
                  ? "text-[14px] uppercase tracking-[0.12em] font-bold"
                  : "text-[16px] uppercase tracking-[0.12em] font-bold"
              }
              style={{ color: PAL.ink }}
            >
              Users
            </span>
            <span className="text-[10px] font-medium" style={{ color: PAL.slate }}>
              Clients & operators
            </span>
          </div>
        </div>
        <div
          className="w-[min(28vw,220px)] shrink border-t-[3px] border-dashed"
          style={{ borderColor: "#94A3B8" }}
          aria-hidden
        />
        <div className="flex items-center gap-2 shrink-0" style={{ color: PAL.ink }}>
          <span
            className="inline-flex items-center justify-center rounded-lg"
            style={{
              width: presentationMode ? 40 : 48,
              height: presentationMode ? 40 : 48,
              background: "#EFF6FF",
              border: "1.5px solid #3B82F6",
              fontSize: presentationMode ? 20 : 24,
            }}
            aria-hidden
          >
            ☁
          </span>
          <div className="flex flex-col leading-tight">
            <span
              className={
                presentationMode
                  ? "text-[14px] uppercase tracking-[0.12em] font-bold"
                  : "text-[16px] uppercase tracking-[0.12em] font-bold"
              }
              style={{ color: PAL.ink }}
            >
              Internet
            </span>
            <span className="text-[10px] font-medium" style={{ color: PAL.slate }}>
              {hasIgw
                ? `Public path via IGW${primaryIgw ? ` · ${primaryIgw.name}` : ""}`
                : "No IGW attached"}
            </span>
          </div>
        </div>
      </div>

      {/* AWS Cloud frame */}
      <div
        className={
          presentationMode
            ? "rounded-lg p-1.5 relative overflow-hidden w-full min-w-0 flex-1 min-h-0 flex flex-col"
            : "rounded-lg p-2.5 relative overflow-visible w-full min-w-0"
        }
        style={{ background: PAL.cardBg, border: `2px solid ${PAL.awsFrame}` }}
      >
        <div
          className={
            presentationMode
              ? "text-[11px] uppercase tracking-[0.14em] font-semibold mb-1.5 px-0.5"
              : "absolute -top-2.5 left-4 px-2 text-[11px] uppercase tracking-[0.14em] font-semibold"
          }
          style={{ background: presentationMode ? "transparent" : PAL.bg, color: PAL.awsFrame }}
        >
          ☁ AWS Cloud {accountSuffix}
        </div>

        {/* Region */}
        <div
          className={
            presentationMode
              ? "rounded-md p-1.5 relative overflow-hidden w-full min-w-0 flex-1 min-h-0 flex flex-col"
              : "rounded-md p-2.5 mt-1.5 relative overflow-visible w-full min-w-0"
          }
          style={{ background: PAL.cardBg, border: `1.5px dashed ${PAL.slate}` }}
        >
          <div
            className={
              presentationMode
                ? "text-[10px] uppercase tracking-[0.14em] font-semibold mb-2 px-0.5"
                : "absolute -top-2.5 left-4 px-2 text-[10px] uppercase tracking-[0.14em] font-semibold"
            }
            style={{ background: presentationMode ? "transparent" : PAL.cardBg, color: PAL.slate }}
          >
            Region · {topo.region ?? "unknown"}
          </div>

          {/* VPC · VPCE · edge rail — regional/serverless on the right (AWS canonical layout).
              Fullscreen uses CSS grid: VPC column = 1fr (fills leftover width),
              rails stay fixed. Flex alone left the VPC at intrinsic ~half width
              even after the fit content was stretched (Alon, 2026-07-09). */}
          <div
            className={
              presentationMode
                ? "mt-1 w-full flex-1 min-h-0 grid items-stretch gap-x-3 min-w-0 overflow-hidden"
                : "mt-2 w-full min-w-0 grid items-stretch gap-x-3 overflow-x-auto overflow-y-visible pb-0.5"
            }
            style={{
              width: "100%",
              gridTemplateColumns: [
                "minmax(0, 1fr)",
                showNetworkRail ? "118px" : null,
                serverlessTierNodes.length > 0 || regionalTierNodes.length > 0
                  ? "72px"
                  : null,
                serverlessTierNodes.length > 0 || regionalTierNodes.length > 0
                  ? "188px"
                  : null,
              ]
                .filter(Boolean)
                .join(" "),
              ...(presentationMode
                ? { gridTemplateRows: "minmax(0, 1fr)" }
                : { gridTemplateRows: "auto" }),
            }}
            data-testid="topology-region-fill-grid"
          >
            {mergedVpcView && frames.length > 1 ? (
              <div
                className={
                  presentationMode
                    ? "min-w-0 w-full h-full flex flex-col"
                    : "flex-1 min-w-0 w-full self-stretch"
                }
                data-testid="topology-compare-fill"
                style={presentationMode ? { minWidth: 0, width: "100%", height: "100%" } : { minWidth: 0 }}
              >
                {frames.length > COMPARE_BANDS_MAX_VPCS ? (
                  <PrimaryPlusPeerStrip
                    frames={frames}
                    sgIndex={sgIndex}
                    roleForWorkload={roleForWorkload}
                    selectedNodeId={selectedNodeId}
                    highlightedRoleName={highlightedRoleName}
                    onSelect={onSelect}
                    presentationMode={presentationMode}
                    densityCollapsed={densityCollapsed}
                    viewDensity={viewDensity}
                    iamRoles={iamRoles}
                    allWorkloads={nodes}
                  />
                ) : (
                  <MultiVpcCompareBands
                    frames={frames}
                    sgIndex={sgIndex}
                    roleForWorkload={roleForWorkload}
                    selectedNodeId={selectedNodeId}
                    onSelect={onSelect}
                    compact={presentationMode}
                    iamRoles={iamRoles}
                    allWorkloads={nodes}
                    highlightedRoleName={highlightedRoleName}
                    systemLabel={systemLabel}
                  />
                )}
              </div>
            ) : presentationMode ? (
              <div
                className="grid items-stretch w-full h-full min-h-0 min-w-0"
                data-testid="topology-single-vpc-grid"
                style={{
                  gridTemplateColumns: "minmax(0, 1fr)",
                  // Presentation floors + equal fr — Data stays on screen at
                  // width-fill 100% (COMPARE mins were too tall for one viewport).
                  gridTemplateRows: `auto auto minmax(${tierMin.web}px, 1.35fr) minmax(${tierMin.app}px, 1.2fr) minmax(${tierMin.data}px, 0.65fr)`,
                  gap: "6px",
                  width: "100%",
                  height: "100%",
                  minWidth: 0,
                  minHeight: 0,
                }}
              >
                {frames.map(f => (
                  <VpcCanvasFrame
                    key={f.vid ?? "unknown"}
                    vpcId={f.vid}
                    grid={f.grid}
                    natGws={f.natGws}
                    igws={f.igws}
                    isForeign={f.isForeign}
                    ownerSystem={f.ownerSystem}
                    showIamControlPlane={f.showIamControlPlane}
                    iamRoles={iamRoles}
                    allWorkloads={nodes}
                    sgIndex={sgIndex}
                    roleForWorkload={roleForWorkload}
                    selectedNodeId={selectedNodeId}
                    highlightedRoleName={highlightedRoleName}
                    onSelect={onSelect}
                    presentationMode={presentationMode}
                    densityCollapsed={densityCollapsed}
                    viewDensity={viewDensity}
                  />
                ))}
              </div>
            ) : (
              frames.map(f => (
                <VpcCanvasFrame
                  key={f.vid ?? "unknown"}
                  vpcId={f.vid}
                  grid={f.grid}
                  natGws={f.natGws}
                  igws={f.igws}
                  isForeign={f.isForeign}
                  ownerSystem={f.ownerSystem}
                  showIamControlPlane={f.showIamControlPlane}
                  iamRoles={iamRoles}
                  allWorkloads={nodes}
                  sgIndex={sgIndex}
                  roleForWorkload={roleForWorkload}
                  selectedNodeId={selectedNodeId}
                  highlightedRoleName={highlightedRoleName}
                  onSelect={onSelect}
                  presentationMode={presentationMode}
                  densityCollapsed={densityCollapsed}
                  viewDensity={viewDensity}
                />
              ))
            )}

            {/* Network rail — IGW + VPCEs, right of VPC (same column). */}
            {showNetworkRail && (
              <div
                className={`flex flex-col gap-1.5 self-stretch justify-start pt-1 z-10 ${
                  presentationMode ? "" : "ml-4 shrink-0"
                }`}
                style={{ width: "118px" }}
                data-testid="topology-network-rail"
              >
                {railIgws.map((igw, idx) => (
                  <div
                    key={igw.id}
                    data-flow-id={idx === 0 ? "__igw__" : igw.id}
                    data-igw-id={igw.id}
                    data-testid="topology-igw-rail-chip"
                    title={[
                      `${igw.name} (${igw.id})`,
                      igw.vpc_id ? `VPC · ${igw.vpc_id}` : null,
                      "Internet Gateway · VPC attachment",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    className="rounded-md shadow-sm overflow-hidden flex items-stretch"
                    style={{
                      background: "linear-gradient(180deg, #EFF6FF 0%, #FFFFFF 100%)",
                      border: "2px solid #3B82F6",
                      color: "#1E40AF",
                    }}
                  >
                    <div
                      className="flex items-center justify-center shrink-0 px-1.5"
                      style={{ background: "#8C4FFF", color: "white" }}
                    >
                      <AwsServiceGlyph kind="igw" size={22} />
                    </div>
                    <div className="flex-1 min-w-0 px-1.5 py-1">
                      <div className="text-[8px] font-bold uppercase tracking-[0.12em] leading-none">
                        IGW
                      </div>
                      <div className="text-[10px] font-semibold leading-tight truncate mt-0.5">
                        {igw.name}
                      </div>
                    </div>
                  </div>
                ))}
                {topo.edges.vpces.map(v => {
                  const meta = resolveVpceMeta(v.service_name, v.endpoint_type)
                  const tooltip = [
                    meta.label,
                    `${meta.type} endpoint · ${v.id}`,
                    v.service_name ?? "",
                    meta.purpose,
                  ].filter(Boolean).join("\n")
                  return (
                    <div
                      key={v.id}
                      data-flow-id={v.id}
                      title={tooltip}
                      className="rounded-md shadow-sm overflow-hidden flex items-stretch"
                      style={{
                        background: "#DBEAFE",
                        border: "1.5px solid #3B82F6",
                        color: "#1E40AF",
                      }}
                    >
                      <div
                        className="flex items-center justify-center shrink-0 px-1.5"
                        style={{ background: "white" }}
                      >
                        <VpceIcon size={32} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between px-2 pt-1 pb-0.5 text-[8px] font-bold uppercase tracking-[0.12em] leading-none">
                          <span>VPCE</span>
                          <span
                            className="px-1 rounded-sm text-[7px]"
                            style={{
                              background: meta.type === "Gateway" ? "#1E40AF" : "#3B82F6",
                              color: "white",
                            }}
                          >
                            {meta.type === "Gateway" ? "GW" : "IF"}
                          </span>
                        </div>
                        <div className="px-2 text-[10px] font-semibold leading-tight truncate">
                          {meta.label}
                        </div>
                        <div className="px-2 pb-1 text-[8px] leading-snug" style={{ color: "#1E3A8A", opacity: 0.85 }}>
                          {meta.purpose}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {(serverlessTierNodes.length > 0 || regionalTierNodes.length > 0) ? (
              <>
                <div
                  className={`self-stretch min-h-[80px] ${presentationMode ? "" : "shrink-0 mx-3"}`}
                  style={{
                    width: "72px",
                    borderLeft: "1px dashed #CBD5E1",
                    borderRight: "1px dashed #CBD5E1",
                    background: "linear-gradient(90deg, transparent, rgba(238,242,246,0.6), transparent)",
                  }}
                  data-testid="topology-flow-corridor"
                  aria-hidden
                />
                <div
                  className={`flex flex-col gap-2 w-[188px] max-w-[188px] min-h-0 ${
                    presentationMode ? "" : "shrink-0 ml-1"
                  }`}
                  // In fullscreen the zoom viewport owns scrolling + fits the map;
                  // the old internal rail scroll clipped chips and broke flow
                  // anchoring under scale. Let the rail grow; density tiles keep
                  // it short. (P0-A/B — replaces the calc(100vh-220px) overflow.)
                  data-testid="topology-edge-services-rail"
                >
                  <ServerlessComputeTier
                    nodes={serverlessTierNodes}
                    selectedNodeId={selectedNodeId}
                    onSelect={onSelect}
                    roleForWorkload={roleForWorkload}
                    compact={presentationMode}
                    densityCollapsed={densityCollapsed}
                    viewDensity={viewDensity}
                  />
                  <RegionalDataServicesTier
                    nodes={regionalTierNodes}
                    selectedNodeId={selectedNodeId}
                    onSelect={onSelect}
                    compact={presentationMode}
                    densityCollapsed={densityCollapsed}
                    viewDensity={viewDensity}
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* Sections below the AWS frame — diagnostic. Hidden in
          presentation/fullscreen mode so the map itself is the focus.
          Inline page keeps everything.  */}
      {!presentationMode && (
        <DiagnosticsAccordion
          serverlessCount={serverlessTierNodes.length}
          staleCount={staleNodes.length}
          trafficCount={visibleEdges.length}
        >
          {serverlessTierNodes.length > 0 ? (
            <div
              className="rounded-md p-3"
              style={{ background: PAL.cardBg, border: "1px solid #E2E8F0" }}
            >
              <div className="text-[10px] uppercase tracking-[0.14em] font-semibold mb-2" style={{ color: PAL.ink }}>
                Serverless compute ({serverlessTierNodes.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {serverlessTierNodes.map(n => (
                  <WorkloadChip
                    key={n.id}
                    node={n}
                    selected={n.id === selectedNodeId}
                    onClick={() => onSelect(n.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {staleNodes.length > 0 ? (
            <div
              className="rounded-md p-3"
              style={{ background: PAL.cardBg, border: "1px solid #E2E8F0" }}
            >
              <div className="text-[10px] uppercase tracking-[0.14em] font-semibold mb-2" style={{ color: PAL.ink }}>
                Stale workloads ({staleNodes.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {staleNodes.map(n => (
                  <WorkloadChip
                    key={n.id}
                    node={n}
                    selected={n.id === selectedNodeId}
                    onClick={() => onSelect(n.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <TrafficFlowBand edges={visibleEdges} nodes={nodes} />
          <EncodingLegend />
        </DiagnosticsAccordion>
      )}

      {/* Animated traffic flow arrows — rendered LAST so DOM stacking
          order paints them on top of every chip box. z-index alone was
          not enough on prod (the subnet/AZ boxes are static siblings,
          and elementsFromPoint still returned them first). */}
      <FlowOverlay edges={visibleEdges} containerRef={flowContainerRef} scale={scale} densityCollapsed={densityCollapsed} />
    </div>
  )
}
