import type { EdgeIgw, EdgeVpce, TopologyNode, TrafficEdge } from "./types"

export interface FocusedServicePath {
  id: string
  nodeIds: string[]
  edges: TrafficEdge[]
}

interface Chain {
  nodeIds: string[]
  edges: TrafficEdge[]
}

export function vpceServiceNodeId(vpceId: string): string {
  return `${vpceId}::aws-service`
}

export function vpceServiceLabel(vpce: Pick<EdgeVpce, "id" | "service_name">): string {
  const service = vpce.service_name?.split(".").pop()?.toLowerCase()
  switch (service) {
    case "ec2messages":
      return "EC2 Messages"
    case "ssmmessages":
      return "SSM Messages"
    case "ssm":
      return "Systems Manager"
    case "s3":
      return "Amazon S3"
    case "dynamodb":
      return "DynamoDB"
    default:
      return service ? service.toUpperCase() : `AWS service · ${vpce.id}`
  }
}

function vpceServiceNodeType(vpce: Pick<EdgeVpce, "service_name">): string {
  const service = vpce.service_name?.split(".").pop()?.toLowerCase()
  if (service === "s3") return "S3"
  if (service === "dynamodb") return "DynamoDB"
  return "AWSService"
}

export function buildVpceInspectorNodes(
  vpces: EdgeVpce[],
  context: Pick<TopologyNode, "account_id" | "region" | "vpc_id"> = {
    account_id: null,
    region: null,
    vpc_id: null,
  },
): TopologyNode[] {
  const nodes: TopologyNode[] = []
  for (const vpce of vpces) {
    const label = vpceServiceLabel(vpce)
    nodes.push({
      id: vpce.id,
      name: `${label} VPC endpoint`,
      type: "VpcEndpoint",
      subnet_id: null,
      vpc_id: vpce.vpc_id ?? context.vpc_id ?? null,
      account_id: context.account_id ?? null,
      region: context.region ?? null,
      score: null,
      stale: null,
      is_jewel: false,
    })
    nodes.push({
      id: vpceServiceNodeId(vpce.id),
      name: label.startsWith("Amazon ") ? label : `AWS ${label}`,
      type: vpceServiceNodeType(vpce),
      subnet_id: null,
      vpc_id: null,
      account_id: context.account_id ?? null,
      region: context.region ?? null,
      score: null,
      stale: null,
      is_jewel: false,
    })
  }
  return nodes
}

/** Canvas anchor of the primary internet gateway. Egress edges terminate here
 *  whatever the gateway is called (aws-frame keys the first IGW chip by it and
 *  every further IGW by its own id). A flow id, never a resource id. */
export const IGW_CANVAS_ANCHOR_ID = "__igw__"

/** Suffix of the synthetic AWS-service hop `vpceServiceNodeId` mints. */
const VPCE_SERVICE_NODE_SUFFIX = "::aws-service"

/**
 * True for an id the frame mints for the canvas — `__igw__`, `__aws_s3__`,
 * `__aws_api__`, a `vpce-…::aws-service` hop — which no graph read can
 * resolve. The frame spells its sentinels `__name__`; nothing AWS issues as an
 * id is spelled that way (ARNs, `i-…`, `vpce-…`, bucket names). Such an id may
 * drive selection, focus and flow routing; it must never reach an API as a
 * resource id (2026-09-12 review: "InternetGateway __igw__ not found in graph").
 */
export function isCanvasAnchorId(id: string | null | undefined): boolean {
  if (typeof id !== "string") return false
  return /^__.+__$/.test(id) || id.endsWith(VPCE_SERVICE_NODE_SUFFIX)
}

/**
 * The internet gateway the `__igw__` anchor stands for, by AWS id.
 *
 * The anchor IS the frame's first gateway (`vpc_topology.edges.igws[0]`), so
 * that entry's id is the answer when the payload carries one. The structural
 * hop data on the edges — `egress_hops[kind=igw]`, `via_igw_id` — names the
 * same gateway from the route side and is the fallback, accepted only when
 * every hop agrees on ONE gateway: picking between two would be a guess.
 * Null when neither names a gateway: the identity is unresolved, and the
 * caller must say so rather than send the anchor to an API.
 */
export function resolveIgwResourceId(
  igws: readonly Pick<EdgeIgw, "id">[] | null | undefined,
  edges: readonly Pick<TrafficEdge, "egress_hops" | "via_igw_id">[] = [],
): string | null {
  const usable = (id: unknown): id is string =>
    typeof id === "string" && id.trim().length > 0 && !isCanvasAnchorId(id)
  const primary = igws?.[0]?.id
  if (usable(primary)) return primary
  const fromHops = new Set<string>()
  for (const e of edges) {
    for (const hop of e.egress_hops ?? []) {
      if (hop && String(hop.kind).toLowerCase() === "igw" && usable(hop.id)) fromHops.add(hop.id)
    }
    if (usable(e.via_igw_id)) fromHops.add(e.via_igw_id)
  }
  return fromHops.size === 1 ? [...fromHops][0] : null
}

/**
 * The inspector node behind the primary IGW chip. `id` is the canvas anchor
 * (what the chip's `data-flow-id` and the selection carry); `resource_id` is
 * the gateway the payload names, or null when it names none. Null when the
 * payload has no gateway at all — then there is no chip either.
 */
export function buildIgwInspectorNode(
  igws: readonly EdgeIgw[] | null | undefined,
  edges: readonly Pick<TrafficEdge, "egress_hops" | "via_igw_id">[],
  context: Pick<TopologyNode, "account_id" | "region" | "vpc_id">,
): TopologyNode | null {
  const igw = igws?.[0]
  if (!igw) return null
  return {
    id: IGW_CANVAS_ANCHOR_ID,
    resource_id: resolveIgwResourceId(igws, edges),
    name: igw.name || "Internet gateway",
    type: "InternetGateway",
    subnet_id: null,
    vpc_id: igw.vpc_id ?? context.vpc_id ?? null,
    account_id: context.account_id ?? null,
    region: context.region ?? null,
    score: null,
    stale: null,
    is_jewel: false,
  }
}

/**
 * The id a resource request (Inventory inspector, operational dossier,
 * narration, change plan) may carry for a node: its own id for a graph node,
 * the AWS resource id it carries for a canvas anchor, and null when an anchor
 * resolved to none. A caller that gets null renders the unresolved state and
 * makes NO request. A canvas anchor never comes back from here.
 */
export function inspectableResourceId(
  node: Pick<TopologyNode, "id" | "resource_id">,
): string | null {
  if (!isCanvasAnchorId(node.id)) return node.id
  const rid = node.resource_id
  return typeof rid === "string" && rid.trim().length > 0 && !isCanvasAnchorId(rid) ? rid : null
}

function edgeRecency(edge: TrafficEdge): number {
  if (!edge.last_seen) return Number.NEGATIVE_INFINITY
  const time = Date.parse(edge.last_seen)
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time
}

function sortEdges(edges: TrafficEdge[]): TrafficEdge[] {
  return [...edges].sort(
    (a, b) =>
      Number(Boolean(b.last_seen)) - Number(Boolean(a.last_seen)) ||
      edgeRecency(b) - edgeRecency(a) ||
      String(a.protocol ?? "").localeCompare(String(b.protocol ?? "")),
  )
}

function inboundChains(
  currentId: string,
  incomingByTarget: Map<string, TrafficEdge[]>,
  depth: number,
  visited: Set<string>,
): Chain[] {
  const incoming = sortEdges(incomingByTarget.get(currentId) ?? [])
    .filter(edge => !visited.has(edge.source_id))
    .slice(0, 8)
  if (depth === 0 || incoming.length === 0) {
    return [{ nodeIds: [currentId], edges: [] }]
  }

  const chains: Chain[] = []
  for (const edge of incoming) {
    const nextVisited = new Set(visited)
    nextVisited.add(edge.source_id)
    for (const upstream of inboundChains(edge.source_id, incomingByTarget, depth - 1, nextVisited)) {
      chains.push({
        nodeIds: [...upstream.nodeIds, currentId],
        edges: [...upstream.edges, edge],
      })
    }
  }
  return chains
}

function outboundChains(
  currentId: string,
  outgoingBySource: Map<string, TrafficEdge[]>,
  depth: number,
  visited: Set<string>,
): Chain[] {
  const outgoing = sortEdges(outgoingBySource.get(currentId) ?? [])
    .filter(edge => !visited.has(edge.target_id))
    .slice(0, 8)
  if (depth === 0 || outgoing.length === 0) {
    return [{ nodeIds: [currentId], edges: [] }]
  }

  const chains: Chain[] = []
  for (const edge of outgoing) {
    const nextVisited = new Set(visited)
    nextVisited.add(edge.target_id)
    for (const downstream of outboundChains(edge.target_id, outgoingBySource, depth - 1, nextVisited)) {
      chains.push({
        nodeIds: [currentId, ...downstream.nodeIds],
        edges: [edge, ...downstream.edges],
      })
    }
  }
  return chains
}

export function expandRoutedServiceEdges(edges: TrafficEdge[]): TrafficEdge[] {
  const expanded: TrafficEdge[] = []
  for (const edge of edges) {
    const intermediateId =
      edge.via_vpce_id ??
      ((edge.via_igw || edge.egress_path === "public") && edge.target_id !== "__igw__"
        ? "__igw__"
        : null)
    if (!intermediateId) {
      expanded.push(edge)
      continue
    }

    expanded.push({
      ...edge,
      target_id: intermediateId,
      edge_class: edge.via_vpce_id ? "vpce" : "egress",
      protocol: edge.via_vpce_id ? "VPC_ENDPOINT" : "PUBLIC_EGRESS",
      last_seen: null,
      evidence_type: "configured",
      evidence_source: edge.via_vpce_id ? "aws_route_configuration" : "aws_egress_configuration",
      coverage_state: "complete",
      authority_state: "configured",
      path_basis: "configured_route",
      projection_generation: null,
      evidence_id: null,
      evidence_ids: [],
      normalization_basis: null,
      via_vpce_id: null,
      via_vpce_service_name: null,
      via_igw: null,
      egress_path: null,
    })
    expanded.push({
      ...edge,
      source_id: intermediateId,
      last_seen: null,
      evidence_type: "inferred",
      evidence_source: "route_service_expansion",
      coverage_state: "unknown",
      authority_state: "inferred",
      path_basis: "synthetic_expansion",
      projection_generation: null,
      evidence_id: null,
      evidence_ids: [],
      normalization_basis: null,
      via_vpce_id: null,
      via_vpce_service_name: null,
      via_igw: null,
      egress_path: null,
    })
  }
  return expanded
}

export function buildInspectorServiceEdges(
  edges: TrafficEdge[],
  vpces: EdgeVpce[],
): TrafficEdge[] {
  const expanded = expandRoutedServiceEdges(edges)
  const vpceById = new Map(vpces.map(vpce => [vpce.id, vpce]))
  const latestDirectEdgeByVpce = new Map<string, TrafficEdge>()

  for (const edge of edges) {
    if (!vpceById.has(edge.target_id) || edge.via_vpce_id) continue
    const existing = latestDirectEdgeByVpce.get(edge.target_id)
    if (!existing || edgeRecency(edge) > edgeRecency(existing)) {
      latestDirectEdgeByVpce.set(edge.target_id, edge)
    }
  }

  for (const [vpceId, sourceEdge] of latestDirectEdgeByVpce) {
    expanded.push({
      source_id: vpceId,
      target_id: vpceServiceNodeId(vpceId),
      port: sourceEdge.port,
      protocol: "AWS_SERVICE",
      last_seen: null,
      edge_class: "edge_service",
      external_destinations: null,
      evidence_type: "inferred",
      evidence_source: "vpce_service_catalog",
      coverage_state: "unknown",
      authority_state: "inferred",
      path_basis: "synthetic_expansion",
      projection_generation: null,
      evidence_id: null,
      evidence_ids: [],
      normalization_basis: null,
      via_vpce_id: null,
      via_vpce_service_name: null,
    })
  }

  return expanded
}

export function buildFocusedServicePaths(
  selectedNodeId: string,
  nodes: TopologyNode[],
  edges: TrafficEdge[],
  maxPaths = 16,
): FocusedServicePath[] {
  const selectedExists =
    nodes.some(node => node.id === selectedNodeId) ||
    edges.some(edge => edge.source_id === selectedNodeId || edge.target_id === selectedNodeId)
  if (!selectedExists) return []

  const relevantEdges = expandRoutedServiceEdges(edges)
  const incomingByTarget = new Map<string, TrafficEdge[]>()
  const outgoingBySource = new Map<string, TrafficEdge[]>()
  for (const edge of relevantEdges) {
    incomingByTarget.set(edge.target_id, [...(incomingByTarget.get(edge.target_id) ?? []), edge])
    outgoingBySource.set(edge.source_id, [...(outgoingBySource.get(edge.source_id) ?? []), edge])
  }

  const upstream = inboundChains(
    selectedNodeId,
    incomingByTarget,
    2,
    new Set([selectedNodeId]),
  )
  const downstream = outboundChains(
    selectedNodeId,
    outgoingBySource,
    3,
    new Set([selectedNodeId]),
  )

  const paths: FocusedServicePath[] = []
  const seen = new Set<string>()
  const addPath = (nodeIds: string[], pathEdges: TrafficEdge[]): boolean => {
    if (new Set(nodeIds).size !== nodeIds.length) return false
    const key = `${nodeIds.join(">")}::${pathEdges.map(edge => edge.protocol ?? "").join(">")}`
    if (seen.has(key)) return false
    seen.add(key)
    paths.push({
      id: key,
      nodeIds,
      edges: pathEdges,
    })
    return paths.length >= maxPaths
  }

  const deterministicDownstream = downstream.filter(
    chain =>
      chain.edges.length > 0 &&
      chain.edges.every(edge =>
        edge.path_basis === "configured_route" ||
        edge.path_basis === "synthetic_expansion"
      ),
  )
  const selectedType = nodes.find(node => node.id === selectedNodeId)?.type?.toLowerCase() ?? ""
  const canContinueThroughSelected =
    selectedType.includes("endpoint") &&
    deterministicDownstream.length === 1

  for (const before of upstream) {
    if (before.edges.length === 0) continue
    if (canContinueThroughSelected) {
      const after = deterministicDownstream[0]
      const nodeIds = [...before.nodeIds, ...after.nodeIds.slice(1)]
      const pathEdges = [...before.edges, ...after.edges]
      if (new Set(nodeIds).size === nodeIds.length && addPath(nodeIds, pathEdges)) return paths
    } else if (addPath(before.nodeIds, before.edges)) {
      return paths
    }
  }

  for (const after of canContinueThroughSelected ? [] : downstream) {
    if (after.edges.length > 0 && addPath(after.nodeIds, after.edges)) return paths
  }

  return paths
}
