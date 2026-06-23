import type {
  TargetEdge,
  TargetLens,
  TargetNode,
  TargetNodeType,
  TargetTier,
  TargetTopology,
} from "@/lib/attack-map/to-target-topology"
import type { ConvergenceHop, ConvergencePath, CrownJewelConvergence } from "./convergence-types"

function mapNodeType(t: string): TargetNodeType {
  switch (t) {
    case "EC2Instance":
    case "ECSTask":
      return "compute"
    case "Lambda":
    case "LambdaFunction":
      return "lambda"
    case "RDS":
    case "RDSInstance":
    case "Aurora":
    case "DynamoDBTable":
      return "database"
    case "S3Bucket":
      return "s3"
    case "KMSKey":
      return "kms"
    case "IAMRole":
    case "InstanceProfile":
      return "iam"
    case "SecurityGroup":
      return "sg"
    case "RouteTable":
    case "Subnet":
    case "NetworkACL":
      return "nat"
    case "InternetGateway":
      return "igw"
    case "VPCEndpoint":
      return "vpce"
    default:
      return "compute"
  }
}

function tierFor(hop: ConvergenceHop): TargetTier {
  if (hop.is_crown_jewel || hop.plane === "data") return "external"
  if (hop.plane === "identity") return "external"
  if (hop.node_type === "Subnet") {
    return hop.subnet_public === true ? "public" : "private-app"
  }
  if (hop.subnet_public === true) return "public"
  if (hop.subnet_public === false) return "private-app"
  if (hop.plane === "network") return "private-app"
  return "private-app"
}

function azColumn(az: string | undefined, azList: string[]): string {
  if (!az) return "External"
  const idx = azList.indexOf(az)
  if (idx >= 0) return `AZ ${idx + 1}`
  if (az.length === 1) return `AZ ${az.toUpperCase()}`
  return az
}

function hopId(hop: ConvergenceHop): string {
  return hop.node_id || hop.name || "unknown"
}

function friendlyLabel(hop: ConvergenceHop): string {
  const name = hop.name?.trim()
  if (name && !/^AROA[A-Z0-9]+$/.test(name)) return name
  const id = hop.node_id
  if (id.startsWith("arn:")) {
    const tail = id.split(":").pop() ?? id
    return tail.split("/").pop() ?? tail
  }
  return id
}

/** Fan every convergence path onto the subnet-row × AZ-column map. */
export function convergenceToTargetTopology(
  data: CrownJewelConvergence,
  selectedPathId?: string | null,
): TargetTopology {
  const paths: ConvergencePath[] = (() => {
    if (!selectedPathId) return data.paths
    const filtered = data.paths.filter((p) => p.path_id === selectedPathId)
    return filtered.length > 0 ? filtered : data.paths
  })()

  const azSet = new Set<string>()
  for (const p of paths) {
    for (const h of p.hops) {
      if (h.az) azSet.add(h.az)
    }
  }
  const azList = [...azSet].sort()

  const nodeMap = new Map<string, TargetNode>()
  const edges: TargetEdge[] = []

  const addHop = (hop: ConvergenceHop, sharedRoleHub: boolean) => {
    const id = hopId(hop)
    const existing = nodeMap.get(id)
    if (existing) {
      existing.onPath = true
      if (sharedRoleHub) existing.sharedRoleHub = true
      return
    }
    nodeMap.set(id, {
      id,
      label: friendlyLabel(hop),
      subLabel: id.length > 22 ? `${id.slice(0, 14)}…` : id,
      type: mapNodeType(hop.node_type),
      subnet: tierFor(hop),
      az: hop.is_crown_jewel || hop.plane !== "network" ? "External" : azColumn(hop.az ?? undefined, azList),
      isCrownJewel: hop.is_crown_jewel,
      jewelTier: hop.is_crown_jewel ? "HIGH" : undefined,
      onPath: true,
      sharedRoleHub: sharedRoleHub || undefined,
    })
  }

  for (const path of paths) {
    const roleHub =
      !!path.identity && (data.choke_points[path.identity] ?? 0) > 1
    for (let i = 0; i < path.hops.length; i++) {
      const hop = path.hops[i]
      addHop(hop, roleHub && hop.plane === "identity")
      if (i === 0) continue
      const prev = path.hops[i - 1]
      const lens: TargetLens = hop.is_crown_jewel
        ? "reachability"
        : hop.plane === "identity"
          ? "lateral"
          : "reachability"
      const observed = path.confidence === "observed"
      edges.push({
        id: `${path.path_id}:${hopId(prev)}__${hopId(hop)}`,
        source: hopId(prev),
        target: hopId(hop),
        lens,
        status: observed ? "allowed" : "drifted",
        evidence: observed ? "observed" : "allowed",
        label: path.source ?? path.path_id,
      })
    }
  }

  const maxScore = paths.reduce((m, p) => Math.max(m, p.score), 0)
  const topChoke = Object.entries(data.choke_points).sort((a, b) => b[1] - a[1])[0]

  return {
    nodes: [...nodeMap.values()],
    edges,
    constraints: [],
    gaps: [],
    system: data.system,
    score: maxScore,
    jewelsReachable: 1,
    roleJewelCount: data.paths_total,
    sharedWorkloads: topChoke && topChoke[1] > 1 ? [topChoke[0]] : [],
  }
}
