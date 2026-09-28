/**
 * Ops perimeter model — the pure half of the "10-second map" layout.
 *
 * The Network topology canvas answers three operator questions, one per
 * direction of the page:
 *
 *   NORTH  the Internet band   — who comes in, and what we reach out to
 *   CENTER the VPC grid        — AZ columns x Public / App / Data (unchanged)
 *   EAST   the AWS service rail — Lambda, S3, DynamoDB, KMS … outside the VPC
 *
 * Every function here reads the topology payload and nothing else. None of
 * them invents a device, a route or a count:
 *
 *   - a missing NAT per AZ is read off `nat_gws[].subnet_id` -> subnet.az;
 *   - a cross-AZ NAT dependency needs an edge whose `via_nat_id` names a NAT
 *     in another AZ than the source's own subnet — that is CONFIGURED routing
 *     (route tables), and is labelled as such, never as observed traffic;
 *   - a "no gateway endpoint" door needs S3 / DynamoDB traffic whose
 *     `structural_route` is NAT or IGW AND no Gateway VPCE for that service;
 *   - an egress destination is an AWS service only when the evidence carried
 *     `aws_service`; the projection's own `kind` is a classification and is
 *     rendered as one ("classified AWS range"), never as an attribution.
 *
 * Unknown stays unknown: every count that the payload does not carry is
 * `null`, and the renderer says so instead of printing 0.
 */

import type { ExternalDestinationMap, ExternalDestinationNode, ExternalEgressSummary } from "./estate-egress-summary"
import type { EdgeNatGw, EdgeVpce, SubnetMeta, TopologyNode, TrafficEdge } from "./types"

/** Mirrors `AWS_S3_PUBLIC_SENTINEL_ID` in aws-frame.tsx (the regional-rail
 *  sentinel for observed traffic to S3 with no named bucket). Duplicated as a
 *  literal so this pure module does not import the 10k-line renderer. */
const AWS_S3_SENTINEL_IDS: ReadonlySet<string> = new Set(["__aws_s3__"])

// ---------------------------------------------------------------------------
// Egress destinations — four honest classes
// ---------------------------------------------------------------------------

export type EgressDestinationClass =
  /** The evidence named the service (VPC Flow Logs v5 pkt-dst-aws-service). */
  | "aws_attributed"
  /** The projection classified the address as AWS-owned (s3 / other_aws) but
   *  no evidence attributes it. Still an address. */
  | "aws_classified"
  /** Classified as outside AWS. */
  | "external"
  /** Unclassified, or traffic whose destination was never named. */
  | "unknown"

export const EGRESS_CLASS_ORDER: readonly EgressDestinationClass[] = [
  "aws_attributed",
  "aws_classified",
  "external",
  "unknown",
]

export const EGRESS_CLASS_COPY: Record<EgressDestinationClass, { title: string; hint: string }> = {
  aws_attributed: {
    title: "AWS services",
    hint: "Named by flow-log evidence. Usually belongs on a VPC endpoint, not the NAT.",
  },
  aws_classified: {
    title: "AWS address ranges",
    hint: "Address falls in an AWS range; no evidence names the service.",
  },
  external: {
    title: "Third-party",
    hint: "Outside AWS. Domain names need Route 53 Resolver query logs.",
  },
  unknown: {
    title: "Unclassified",
    hint: "Not classified — unknown, not safe.",
  },
}

const AWS_KINDS = new Set(["s3", "other_aws", "dynamodb"])

export function egressDestinationClass(node: Pick<ExternalDestinationNode, "identity" | "kind">): EgressDestinationClass {
  if (node.identity === "aws_service") return "aws_attributed"
  const kind = (node.kind ?? "").toLowerCase()
  if (AWS_KINDS.has(kind)) return "aws_classified"
  if (kind === "external" || kind === "ntp") return "external"
  return "unknown"
}

export interface EgressDestinationGroup {
  cls: EgressDestinationClass
  nodes: ExternalDestinationNode[]
  /** Distinct workloads observed reaching any node in this group. */
  sourceCount: number
}

/** Groups the DRAWN nodes only; `hiddenNodes` stay behind the "+N more"
 *  disclosure, and the unnamed remainder is always in `unknown`. */
export function groupExternalDestinations(map: ExternalDestinationMap): EgressDestinationGroup[] {
  const byClass = new Map<EgressDestinationClass, ExternalDestinationNode[]>()
  for (const node of map.nodes) {
    const cls = egressDestinationClass(node)
    const list = byClass.get(cls) ?? []
    list.push(node)
    byClass.set(cls, list)
  }
  return EGRESS_CLASS_ORDER.flatMap(cls => {
    const nodes = byClass.get(cls) ?? []
    if (nodes.length === 0 && !(cls === "unknown" && map.remainder)) return []
    const sources = new Set(nodes.flatMap(n => n.sources))
    return [{ cls, nodes, sourceCount: sources.size }]
  })
}

// ---------------------------------------------------------------------------
// NAT placement per AZ — the resilience read
// ---------------------------------------------------------------------------

export interface CrossAzNatRoute {
  sourceId: string
  sourceAz: string
  natId: string
  natAz: string
}

export interface NatAzCoverage {
  /** AZ -> NAT ids whose own subnet is in that AZ. */
  natsByAz: Map<string, string[]>
  /** AZs drawn on the grid that host no NAT. Empty when every AZ has one, or
   *  when the VPC has no NAT at all (then `noNat` is true instead). */
  azsWithoutNat: string[]
  /** The VPC has zero NAT gateways — not an AZ gap, a different story. */
  noNat: boolean
  /** Workloads whose route table sends them to a NAT in ANOTHER AZ. Configured
   *  routing, never an observed packet path. */
  crossAzRoutes: CrossAzNatRoute[]
  /** NATs the payload gives no subnet (or an unknown one) — cannot be placed,
   *  so they cannot count for or against an AZ. */
  unplacedNatIds: string[]
}

function subnetIdsOf(n: Pick<TopologyNode, "subnet_id" | "subnet_ids">): string[] {
  const out = new Set<string>()
  if (Array.isArray(n.subnet_ids)) for (const s of n.subnet_ids) if (s) out.add(s)
  if (n.subnet_id) out.add(n.subnet_id)
  return [...out]
}

export function natAzCoverage(args: {
  natGws: readonly EdgeNatGw[]
  subnets: readonly SubnetMeta[]
  azs: readonly string[]
  edges: readonly TrafficEdge[]
  nodes: readonly TopologyNode[]
}): NatAzCoverage {
  const { natGws, subnets, azs, edges, nodes } = args
  const subnetAz = new Map(subnets.map(s => [s.id, s.az]))
  const natsByAz = new Map<string, string[]>()
  const natAz = new Map<string, string>()
  const unplacedNatIds: string[] = []
  for (const nat of natGws) {
    const az = nat.subnet_id ? subnetAz.get(nat.subnet_id) ?? null : null
    if (!az) {
      unplacedNatIds.push(nat.id)
      continue
    }
    natAz.set(nat.id, az)
    natsByAz.set(az, [...(natsByAz.get(az) ?? []), nat.id])
  }
  const noNat = natGws.length === 0
  // An unplaced NAT could be in any AZ, so while one exists no AZ can be
  // said to lack a NAT: the marker would be a guess.
  const azsWithoutNat = noNat || unplacedNatIds.length > 0 ? [] : azs.filter(az => !natsByAz.has(az))

  const nodeById = new Map(nodes.map(n => [n.id, n]))
  const crossAzRoutes: CrossAzNatRoute[] = []
  const seen = new Set<string>()
  for (const e of edges) {
    const natId = e.via_nat_id ?? e.egress_hops?.find(h => h.kind === "nat")?.id ?? null
    if (!natId) continue
    const targetAz = natAz.get(natId)
    const src = nodeById.get(e.source_id)
    if (!targetAz || !src) continue
    // A multi-subnet workload is cross-AZ only if NONE of its subnets is in
    // the NAT's AZ — otherwise the route may well be local.
    const srcAzs = subnetIdsOf(src)
      .map(id => subnetAz.get(id))
      .filter((az): az is string => Boolean(az))
    if (srcAzs.length === 0 || srcAzs.includes(targetAz)) continue
    const key = `${src.id}->${natId}`
    if (seen.has(key)) continue
    seen.add(key)
    crossAzRoutes.push({ sourceId: src.id, sourceAz: srcAzs[0], natId, natAz: targetAz })
  }
  return { natsByAz, azsWithoutNat, noNat, crossAzRoutes, unplacedNatIds }
}

// ---------------------------------------------------------------------------
// Missing gateway endpoints — AWS traffic taking the internet path
// ---------------------------------------------------------------------------

export type GatewayEndpointService = "s3" | "dynamodb"

export interface MissingGatewayEndpoint {
  service: GatewayEndpointService
  /** Workloads whose S3 / DynamoDB traffic routes via NAT or IGW. */
  sourceIds: string[]
  /** Which gateway the route names (structural). */
  via: ("NAT" | "IGW")[]
}

function hasGatewayEndpoint(vpces: readonly EdgeVpce[], service: GatewayEndpointService): boolean {
  return vpces.some(v => {
    const last = (v.service_name ?? "").split(".").pop()?.toLowerCase()
    const isGateway = (v.endpoint_type ?? "").toLowerCase() === "gateway"
    // An endpoint with no endpoint_type but the right service still counts:
    // the payload named the service, and a false "missing" door is worse
    // than a missing one.
    return last === service && (isGateway || !v.endpoint_type)
  })
}

function edgeReachesService(e: TrafficEdge, service: GatewayEndpointService, serviceNodeIds: ReadonlySet<string>): boolean {
  if (serviceNodeIds.has(e.target_id)) return true
  if (service === "s3" && AWS_S3_SENTINEL_IDS.has(e.target_id)) return true
  const svc = service.toUpperCase()
  if (e.destinations?.some(d => (d.aws_service ?? "").toUpperCase() === svc || d.kind === service)) return true
  if (e.egress_breakdown?.some(b => (b.aws_service ?? "").toUpperCase() === svc || b.kind === service)) return true
  return false
}

export function missingGatewayEndpoints(args: {
  edges: readonly TrafficEdge[]
  vpces: readonly EdgeVpce[]
  /** Regional-rail nodes, so an edge to a named bucket / table counts. */
  regionalNodes: readonly Pick<TopologyNode, "id" | "type">[]
}): MissingGatewayEndpoint[] {
  const { edges, vpces, regionalNodes } = args
  const idsByService: Record<GatewayEndpointService, Set<string>> = {
    s3: new Set(regionalNodes.filter(n => /^s3/i.test(n.type ?? "")).map(n => n.id)),
    dynamodb: new Set(regionalNodes.filter(n => /dynamo/i.test(n.type ?? "")).map(n => n.id)),
  }
  const out: MissingGatewayEndpoint[] = []
  for (const service of ["s3", "dynamodb"] as const) {
    if (hasGatewayEndpoint(vpces, service)) continue
    const sources = new Set<string>()
    const via = new Set<"NAT" | "IGW">()
    for (const e of edges) {
      const route = e.structural_route
      if (route !== "NAT" && route !== "IGW") continue
      if (!edgeReachesService(e, service, idsByService[service])) continue
      sources.add(e.source_id)
      via.add(route)
    }
    if (sources.size > 0) out.push({ service, sourceIds: [...sources].sort(), via: [...via].sort() })
  }
  return out
}

// ---------------------------------------------------------------------------
// Logical groups -> hull specs for the overlay
// ---------------------------------------------------------------------------

export interface LogicalGroupHullSpec {
  groupId: string
  label: string
  kind: "asg" | "target_group" | "cluster" | "other"
  memberIds: string[]
  azs: string[]
  /** Members resolve to exactly one AZ while the grid draws more than one. */
  singleAz: boolean
}

export function logicalGroupKind(type: string | null | undefined): LogicalGroupHullSpec["kind"] {
  const t = (type ?? "").toLowerCase()
  if (t.includes("autoscaling")) return "asg"
  if (t.includes("targetgroup")) return "target_group"
  // Clusters arrive typed by engine ("RDS", "Neptune", "DocumentDB") as often
  // as "…Cluster"; a group node of a database type IS its cluster.
  if (t.includes("cluster") || /^(rds|aurora|neptune|docdb|documentdb|elasticache|redshift)/.test(t)) return "cluster"
  return "other"
}

const KIND_SHORT: Record<LogicalGroupHullSpec["kind"], string> = {
  asg: "ASG",
  target_group: "TG",
  cluster: "Cluster",
  other: "Group",
}

export function logicalGroupHullLabel(spec: Pick<LogicalGroupHullSpec, "kind" | "label" | "azs" | "singleAz">): string {
  const span = spec.azs.length === 0 ? "AZ unknown" : spec.singleAz ? `1 AZ only` : `${spec.azs.length} AZs`
  return `${KIND_SHORT[spec.kind]} · ${spec.label} · ${span}`
}

// ---------------------------------------------------------------------------
// The one-line readout
// ---------------------------------------------------------------------------

export type ReadoutTone = "neutral" | "warn" | "unknown"

export interface ReadoutSegment {
  key: "ingress" | "egress" | "aws" | "evidence"
  label: string
  value: string
  tone: ReadoutTone
  title: string
}

/** "3h ago", "4d ago" — from an ISO timestamp; null when unparseable. */
export function ageLabel(iso: string, now: number): string | null {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  const mins = Math.max(0, Math.round((now - t) / 60000))
  if (mins < 60) return `${mins}m ago`
  const h = Math.round(mins / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export function buildOpsReadout(args: {
  loadBalancerCount: number
  igwCount: number
  nat: NatAzCoverage
  egress: ExternalEgressSummary | null
  /** Rail counts by service label, e.g. { Lambda: 6, S3: 3 }. */
  awsServiceCounts: ReadonlyArray<{ label: string; count: number }>
  missingEndpoints: readonly MissingGatewayEndpoint[]
  trafficAuthorityState: string | null | undefined
  /** Lines the map will animate, counted from the same edges it draws. When
   *  given, the Traffic segment says how many are live vs historical instead
   *  of one blanket state — the account can be legacy while a lane is live. */
  motionCounts?: { live: number; historical: number; newestSeenAt?: string | null; now?: number }
}): ReadoutSegment[] {
  const { loadBalancerCount, igwCount, nat, egress, awsServiceCounts, missingEndpoints, trafficAuthorityState, motionCounts } = args

  const ingress: ReadoutSegment = {
    key: "ingress",
    label: "In",
    value:
      igwCount === 0
        ? loadBalancerCount > 0
          ? `${loadBalancerCount} LB · no IGW attached`
          : "no IGW attached"
        : `IGW → ${loadBalancerCount} LB${loadBalancerCount === 1 ? "" : "s"}`,
    tone: "neutral",
    title: "Configured: internet gateway attached to this VPC and the load balancers the grid places.",
  }

  const natCount = [...nat.natsByAz.values()].reduce((a, l) => a + l.length, 0) + nat.unplacedNatIds.length
  const natAzs = [...nat.natsByAz.keys()].sort()
  const workloads = egress?.legs.length ?? 0
  const egressWarn = nat.azsWithoutNat.length > 0 || missingEndpoints.length > 0
  const egressParts = [
    nat.noNat ? "no NAT" : `${natCount} NAT${natCount === 1 ? "" : "s"}${natAzs.length ? ` (${natAzs.join(", ")})` : ""}`,
    egress ? `${workloads} workload${workloads === 1 ? "" : "s"} observed leaving` : "egress not observed",
  ]
  if (missingEndpoints.length > 0) {
    egressParts.push(`${missingEndpoints.map(m => m.service.toUpperCase()).join("/")} via internet path`)
  }
  const egressSeg: ReadoutSegment = {
    key: "egress",
    label: "Out",
    value: egressParts.join(" · "),
    tone: egressWarn ? "warn" : "neutral",
    title: [
      nat.azsWithoutNat.length > 0 ? `No NAT in ${nat.azsWithoutNat.join(", ")} (configured).` : null,
      nat.crossAzRoutes.length > 0
        ? `${nat.crossAzRoutes.length} workload route(s) cross AZs to reach a NAT (route tables, not observed packets).`
        : null,
      missingEndpoints.length > 0
        ? "AWS service traffic routes via NAT/IGW and no gateway endpoint exists for it."
        : null,
    ]
      .filter(Boolean)
      .join(" "),
  }

  const aws: ReadoutSegment = {
    key: "aws",
    label: "AWS deps",
    value:
      awsServiceCounts.length === 0
        ? "none in payload"
        : awsServiceCounts.map(s => `${s.label} ${s.count}`).join(" · "),
    tone: "neutral",
    title: "Regional services outside the VPC that this system's payload names.",
  }

  const authoritative = trafficAuthorityState === "authoritative" || trafficAuthorityState === "authoritative_positive_only"
  const evidence: ReadoutSegment = {
    key: "evidence",
    label: "Traffic",
    value: authoritative
      ? trafficAuthorityState === "authoritative_positive_only"
        ? "confirmed paths only"
        : "authoritative"
      : trafficAuthorityState === "legacy_unverified"
        ? "historical, not live"
        : trafficAuthorityState
          ? "rebuilding"
          : "state not reported",
    tone: authoritative ? "neutral" : "unknown",
    title: authoritative
      ? "Moving lines are generation-backed observations."
      : "Lines show configured or historical direction; a missing line is not proof of no traffic.",
  }

  if (motionCounts && (motionCounts.live > 0 || motionCounts.historical > 0)) {
    // "Confirmed", never "live": authority grades the EVIDENCE (generation-
    // backed observation), not its recency. On C1 the confirmed edges were
    // last seen a month before this label called them live (QA 2026-09-29).
    const age = motionCounts.newestSeenAt ? ageLabel(motionCounts.newestSeenAt, motionCounts.now ?? Date.now()) : null
    const parts = [
      motionCounts.live > 0 ? `${motionCounts.live} confirmed` : null,
      motionCounts.historical > 0 ? `${motionCounts.historical} historical` : null,
      age ? `newest ${age}` : null,
    ].filter(Boolean)
    evidence.value = parts.join(" · ")
    evidence.tone = "unknown"
    evidence.title = `${evidence.title} Confirmed = generation-backed observations; historical = timestamped legacy observations. Neither means current: see "newest". Configured-only links are not counted.`
  }
  return [ingress, egressSeg, aws, evidence]
}
