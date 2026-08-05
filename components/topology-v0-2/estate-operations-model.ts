import type {
  IamRoleRollup,
  TopologyNode,
  TopologyRiskResponse,
  TrafficEdge,
} from "./types"

export type EstateLens = "operations" | "reliability" | "security" | "ownership"
export type EstatePlaneId = "edge" | "runtime" | "data" | "control"
export type EstatePriorityTone = "critical" | "warning" | "info"

export interface EstatePlane {
  id: EstatePlaneId
  label: string
  purpose: string
  nodes: TopologyNode[]
}

export interface EstatePriority {
  id: string
  tone: EstatePriorityTone
  lenses: EstateLens[]
  title: string
  detail: string
  nodeId?: string
  roleName?: string
}

export interface EstatePosture {
  activeResources: number
  relationships: number
  accounts: number
  regions: number
  vpcs: number
  availabilityZones: number
  crownJewels: number
  exposedResources: number
  highRiskResources: number
  degradedEvidence: number
  staleResources: number
  unknownPlacement: number
  multiAzResources: number
  singleAzStateful: number
  sharedResources: number
  sharedConsumerSystems: number
  riskyRoles: number
  evidenceCoveragePct: number | null
  evidenceFresh: boolean | null
}

export interface EstateCommandModel {
  planes: EstatePlane[]
  posture: EstatePosture
  priorities: EstatePriority[]
  connectionsByNode: Map<string, number>
  azCountByNode: Map<string, number>
  roles: IamRoleRollup[]
}

const EDGE_TYPES = new Set([
  "LoadBalancer",
  "APIGateway",
  "CloudFront",
  "Route53",
  "EventBridge",
])

const RUNTIME_TYPES = new Set([
  "EC2",
  "Lambda",
  "ECS",
  "ECSTask",
  "ECSCluster",
  "Fargate",
  "AutoScalingGroup",
])

const DATA_TYPES = new Set([
  "S3",
  "DynamoDB",
  "RDS",
  "KMSKey",
  "Secret",
  "SecretsManagerSecret",
  "SQS",
])

const VPC_BOUND_TYPES = new Set([
  "EC2",
  "ECS",
  "ECSTask",
  "ECSCluster",
  "Fargate",
  "AutoScalingGroup",
  "LoadBalancer",
  "RDS",
])

const STATEFUL_SUBNET_TYPES = new Set(["RDS"])

function contributorValue(node: TopologyNode, signal: string): number {
  return node.score?.contributors?.find(item => item.signal === signal)?.value ?? 0
}

export function isTopologyNodeExposed(node: TopologyNode): boolean {
  return (
    contributorValue(node, "network_exposure") > 0 ||
    contributorValue(node, "internet_dependency") > 0
  )
}

export function estatePlaneForNode(node: TopologyNode): EstatePlaneId {
  const type = node.type ?? ""
  if (EDGE_TYPES.has(type)) return "edge"
  if (RUNTIME_TYPES.has(type)) return "runtime"
  if (DATA_TYPES.has(type)) return "data"
  return "control"
}

function countConnections(edges: TrafficEdge[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const edge of edges) {
    counts.set(edge.source_id, (counts.get(edge.source_id) ?? 0) + 1)
    if (!edge.target_id.startsWith("__")) {
      counts.set(edge.target_id, (counts.get(edge.target_id) ?? 0) + 1)
    }
  }
  return counts
}

function countNodeAzs(data: TopologyRiskResponse): Map<string, number> {
  const subnetAz = new Map(
    (data.vpc_topology?.subnets ?? []).map(subnet => [subnet.id, subnet.az]),
  )
  const result = new Map<string, number>()
  for (const node of data.nodes ?? []) {
    const ids = node.subnet_ids?.length
      ? node.subnet_ids
      : node.subnet_id
        ? [node.subnet_id]
        : []
    const azs = new Set(
      ids.map(id => subnetAz.get(id)).filter((az): az is string => Boolean(az)),
    )
    result.set(node.id, azs.size)
  }
  return result
}

function sortedNodes(nodes: TopologyNode[]): TopologyNode[] {
  return [...nodes].sort((left, right) => {
    if (left.is_jewel !== right.is_jewel) return left.is_jewel ? -1 : 1
    if (Boolean(left.stale) !== Boolean(right.stale)) return left.stale ? 1 : -1
    return (right.score?.value ?? -1) - (left.score?.value ?? -1) ||
      left.name.localeCompare(right.name)
  })
}

function uniqueValues(values: Array<string | null | undefined>): number {
  return new Set(values.filter((value): value is string => Boolean(value))).size
}

function buildPriorities(
  posture: EstatePosture,
  active: TopologyNode[],
  roles: IamRoleRollup[],
  azCountByNode: Map<string, number>,
): EstatePriority[] {
  const priorities: EstatePriority[] = []
  const worst = active
    .filter(node => node.score?.tier === "WORST" || node.score?.tier === "HIGH")
    .sort((left, right) => (right.score?.value ?? 0) - (left.score?.value ?? 0))[0]
  if (worst) {
    priorities.push({
      id: `risk:${worst.id}`,
      tone: "critical",
      lenses: ["operations", "security"],
      title: `${worst.name} is the highest-risk resource`,
      detail: `Score ${worst.score?.value ?? "unknown"} · ${worst.score?.tier ?? "unscored"}${worst.is_jewel ? " · crown jewel" : ""}`,
      nodeId: worst.id,
    })
  }

  const exposed = active.filter(isTopologyNodeExposed)
  if (exposed.length > 0) {
    priorities.push({
      id: "public-exposure",
      tone: "critical",
      lenses: ["operations", "security"],
      title: `${exposed.length} resource${exposed.length === 1 ? " has" : "s have"} an internet path`,
      detail: "Review entry reachability and unused internet egress before enforcement.",
      nodeId: exposed[0].id,
    })
  }

  const singleAz = active.find(node =>
    STATEFUL_SUBNET_TYPES.has(node.type ?? "") && (azCountByNode.get(node.id) ?? 0) === 1,
  )
  if (singleAz) {
    priorities.push({
      id: `single-az:${singleAz.id}`,
      tone: "warning",
      lenses: ["operations", "reliability"],
      title: `${singleAz.name} is observed in one availability zone`,
      detail: "Validate failover configuration and recovery objectives for this stateful service.",
      nodeId: singleAz.id,
    })
  }

  const riskyRole = [...roles]
    .filter(role => role.gap_percentage != null && role.gap_percentage >= 50)
    .sort((left, right) => (right.gap_percentage ?? 0) - (left.gap_percentage ?? 0))[0]
  if (riskyRole) {
    priorities.push({
      id: `role:${riskyRole.name}`,
      tone: "warning",
      lenses: ["operations", "security", "ownership"],
      title: `${riskyRole.name} has a ${Math.round(riskyRole.gap_percentage ?? 0)}% permission gap`,
      detail: `${riskyRole.unused_actions}/${riskyRole.allowed_actions} allowed actions are unused.`,
      roleName: riskyRole.name,
    })
  }

  if (posture.staleResources > 0 || posture.degradedEvidence > 0) {
    priorities.push({
      id: "evidence-quality",
      tone: "warning",
      lenses: ["operations", "reliability", "security", "ownership"],
      title: "Estate decisions have evidence gaps",
      detail: `${posture.staleResources} stale · ${posture.degradedEvidence} degraded, low-confidence, or unscored.`,
    })
  }

  if (posture.unknownPlacement > 0) {
    priorities.push({
      id: "unknown-placement",
      tone: "info",
      lenses: ["operations", "reliability", "ownership"],
      title: `${posture.unknownPlacement} VPC-bound resource${posture.unknownPlacement === 1 ? " is" : "s are"} missing placement`,
      detail: "Refresh subnet attachment and ownership metadata before architecture review.",
    })
  }

  if (posture.sharedResources > 0) {
    priorities.push({
      id: "shared-boundary",
      tone: "info",
      lenses: ["operations", "ownership", "security"],
      title: `${posture.sharedResources} shared resource${posture.sharedResources === 1 ? " crosses" : "s cross"} system boundaries`,
      detail: `${posture.sharedConsumerSystems} external consumer system${posture.sharedConsumerSystems === 1 ? "" : "s"} observed or declared.`,
    })
  }

  if (priorities.length === 0) {
    priorities.push({
      id: "no-priority",
      tone: "info",
      lenses: ["operations", "reliability", "security", "ownership"],
      title: "No urgent estate exception is proven",
      detail: `Coverage ${posture.evidenceCoveragePct ?? 0}% · review scoped resources and evidence freshness.`,
    })
  }
  return priorities
}

export function buildEstateCommandModel(data: TopologyRiskResponse): EstateCommandModel {
  const nodes = data.nodes ?? []
  const active = nodes.filter(node => !node.stale)
  const roles = data.vpc_topology?.iam_roles ?? []
  const trafficEdges = data.traffic_edges ?? []
  const connectionsByNode = countConnections(trafficEdges)
  const azCountByNode = countNodeAzs(data)
  const subnets = data.vpc_topology?.subnets ?? []
  const coverage = data.system_kpis?.posture_coverage
  const coveragePct = coverage && coverage.total > 0
    ? Math.round((coverage.scored / coverage.total) * 100)
    : null
  const sharedConsumerSystems = new Set(
    (data.foreign_shared_access ?? []).map(edge => edge.foreign_system).filter(Boolean),
  )

  const posture: EstatePosture = {
    activeResources: active.length,
    relationships: trafficEdges.length,
    accounts: uniqueValues([
      data.selected_account_id,
      data.account_id,
      ...active.map(node => node.account_id),
    ]),
    regions: uniqueValues([
      data.selected_region_id,
      data.region,
      ...active.map(node => node.region),
    ]),
    vpcs: uniqueValues([
      data.selected_vpc_id,
      data.vpc_id,
      ...active.map(node => node.vpc_id),
      ...subnets.map(subnet => subnet.vpc_id),
    ]),
    availabilityZones: uniqueValues(subnets.map(subnet => subnet.az)),
    crownJewels: active.filter(node => node.is_jewel).length,
    exposedResources: active.filter(isTopologyNodeExposed).length,
    highRiskResources: active.filter(node =>
      node.score?.tier === "WORST" || node.score?.tier === "HIGH",
    ).length,
    degradedEvidence: active.filter(node =>
      !node.score || node.score.confidence.tier !== "FULL",
    ).length,
    staleResources: nodes.length - active.length,
    unknownPlacement: active.filter(node =>
      VPC_BOUND_TYPES.has(node.type ?? "") && !node.subnet_id && !(node.subnet_ids?.length),
    ).length,
    multiAzResources: active.filter(node => (azCountByNode.get(node.id) ?? 0) > 1).length,
    singleAzStateful: active.filter(node =>
      STATEFUL_SUBNET_TYPES.has(node.type ?? "") && (azCountByNode.get(node.id) ?? 0) === 1,
    ).length,
    sharedResources: active.filter(node =>
      Boolean(node.is_foreign) ||
      Boolean(node.owner_systems?.length) ||
      (node.foreign_consumer_system_count ?? 0) > 0,
    ).length,
    sharedConsumerSystems: sharedConsumerSystems.size,
    riskyRoles: roles.filter(role => role.gap_percentage != null && role.gap_percentage >= 50).length,
    evidenceCoveragePct: coveragePct,
    evidenceFresh: data.system_kpis?.posture_freshness?.is_fresh ?? null,
  }

  const planes: EstatePlane[] = [
    { id: "edge", label: "Edge & ingress", purpose: "How requests enter", nodes: [] },
    { id: "runtime", label: "Runtime", purpose: "What executes the service", nodes: [] },
    { id: "data", label: "Data & state", purpose: "What must survive", nodes: [] },
    { id: "control", label: "Control plane", purpose: "Regional and supporting services", nodes: [] },
  ]
  const byPlane = new Map(planes.map(plane => [plane.id, plane]))
  for (const node of nodes) byPlane.get(estatePlaneForNode(node))?.nodes.push(node)
  for (const plane of planes) plane.nodes = sortedNodes(plane.nodes)

  return {
    planes,
    posture,
    priorities: buildPriorities(posture, active, roles, azCountByNode),
    connectionsByNode,
    azCountByNode,
    roles: [...roles].sort((left, right) =>
      (right.gap_percentage ?? -1) - (left.gap_percentage ?? -1),
    ),
  }
}
