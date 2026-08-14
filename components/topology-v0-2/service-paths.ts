import type { TopologyNode, TrafficEdge } from "./types"

export interface FocusedServicePath {
  id: string
  nodeIds: string[]
  edges: TrafficEdge[]
}

interface Chain {
  nodeIds: string[]
  edges: TrafficEdge[]
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
    .slice(0, 4)
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
    .slice(0, 4)
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
      via_vpce_id: null,
      via_vpce_service_name: null,
      via_igw: null,
      egress_path: null,
    })
    expanded.push({
      ...edge,
      source_id: intermediateId,
      via_vpce_id: null,
      via_vpce_service_name: null,
      via_igw: null,
      egress_path: null,
    })
  }
  return expanded
}

export function buildFocusedServicePaths(
  selectedNodeId: string,
  nodes: TopologyNode[],
  edges: TrafficEdge[],
  maxPaths = 8,
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

  for (const before of upstream) {
    for (const after of downstream) {
      const nodeIds = [...before.nodeIds, ...after.nodeIds.slice(1)]
      const pathEdges = [...before.edges, ...after.edges]
      if (new Set(nodeIds).size !== nodeIds.length) {
        if (before.edges.length > 0 && addPath(before.nodeIds, before.edges)) return paths
        if (after.edges.length > 0 && addPath(after.nodeIds, after.edges)) return paths
        continue
      }
      if (addPath(nodeIds, pathEdges)) return paths
    }
  }

  return paths
}
