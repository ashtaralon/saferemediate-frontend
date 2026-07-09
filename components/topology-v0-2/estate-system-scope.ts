/**
 * Estate Map · system scope (own + used-shared).
 *
 * Contract (Alon, 2026-07-09):
 * - Show services that belong to the selected system.
 * - Show a shared VPC / foreign subnet ONLY when this system's workloads
 *   actually use it (occupy a subnet or sit in that VPC).
 * - Never surface peer-system inventory that this system does not use.
 *
 * Backend topology-risk already gates nodes by system tag; this module is the
 * FE honesty net for scaffold (subnets / VPCs / edges / IAM) that can leak
 * unused shared infrastructure into Compare.
 */

import type {
  AvailableVpc,
  IamRoleRollup,
  SubnetMeta,
  TopologyNode,
  TrafficEdge,
  VpcTopology,
} from "./types"

export type SystemScopeInput = {
  systemName: string
  nodes: TopologyNode[]
  vpcTopology: VpcTopology
  trafficEdges: TrafficEdge[]
  availableVpcs?: AvailableVpc[] | null
}

export type SystemScopeResult = {
  nodes: TopologyNode[]
  vpcTopology: VpcTopology
  trafficEdges: TrafficEdge[]
  availableVpcs: AvailableVpc[]
  /** VPC ids this system owns or uses (workloads / own-tagged subnets). */
  usedVpcIds: string[]
}

/**
 * VPCs the system may draw:
 * - any VPC that hosts a system node, OR
 * - any VPC with a non-foreign (own-tagged) subnet in the payload.
 * Foreign/shared VPCs with zero system workloads are dropped.
 */
export function usedVpcIdsForSystem(
  nodes: TopologyNode[],
  subnets: SubnetMeta[],
): Set<string> {
  const used = new Set<string>()
  for (const n of nodes) {
    if (n.vpc_id) used.add(n.vpc_id)
  }
  for (const s of subnets) {
    if (!s.vpc_id) continue
    // Own-tagged subnet grid always counts (system's architecture VPC).
    if (!s.is_foreign) used.add(s.vpc_id)
  }
  return used
}

/**
 * Foreign/shared subnets stay only when a system node occupies them
 * (`subnet_id` match). Own-tagged subnets always stay (empty cells are honest
 * architecture). Unused peer subnets in a shared VPC are dropped.
 */
export function filterSubnetsForSystemUse(
  subnets: SubnetMeta[],
  nodes: TopologyNode[],
  usedVpcs: Set<string>,
): SubnetMeta[] {
  return subnets.filter(s => {
    if (!s.vpc_id || !usedVpcs.has(s.vpc_id)) return false
    if (!s.is_foreign) return true
    return nodes.some(n => n.subnet_id === s.id)
  })
}

/**
 * Drop VPCs this system does not use.
 * - Keep if system workloads live there (node.vpc_id or BE workload_count > 0)
 * - Keep if own-tagged subnets live there (tagged_subnet_count > 0 / !is_foreign)
 * - Drop shared VPC with neither
 */
export function filterAvailableVpcsForSystemUse(
  availableVpcs: AvailableVpc[] | null | undefined,
  usedVpcs: Set<string>,
  nodes: TopologyNode[],
): AvailableVpc[] {
  return (availableVpcs ?? []).filter(v => {
    if (!v.vpc_id) return false
    const hasNode = nodes.some(n => n.vpc_id === v.vpc_id)
    const wl = v.workload_count ?? 0
    const tagged = v.tagged_subnet_count ?? 0
    if (hasNode || wl > 0) return usedVpcs.has(v.vpc_id) || hasNode
    if (tagged > 0 && usedVpcs.has(v.vpc_id)) return true
    return false
  })
}

function filterScaffoldEdges<T extends { vpc_id?: string | null }>(
  items: T[] | undefined,
  usedVpcs: Set<string>,
): T[] {
  return (items ?? []).filter(i => !i.vpc_id || usedVpcs.has(i.vpc_id))
}

export function filterIamRolesForVisibleWorkloads(
  roles: IamRoleRollup[] | undefined,
  nodeIds: Set<string>,
): IamRoleRollup[] {
  return (roles ?? []).filter(r => {
    const wids = r.workload_ids ?? []
    if (wids.length === 0) return false
    return wids.some(id => nodeIds.has(id))
  })
}

export function filterTrafficEdgesForVisible(
  edges: TrafficEdge[],
  visibleIds: Set<string>,
  vpceIds: Set<string>,
): TrafficEdge[] {
  return edges.filter(e => {
    const src = e.source_id
    const tgt = e.target_id
    if (!src || !visibleIds.has(src)) return false
    if (tgt === "__igw__") return true
    if (vpceIds.has(tgt)) return true
    return visibleIds.has(tgt)
  })
}

/**
 * Apply own + used-shared scope to a topology-risk payload slice.
 * Nodes are assumed already system-tagged by the backend.
 */
export function applySystemEstateScope(input: SystemScopeInput): SystemScopeResult {
  const nodes = input.nodes
  const vt = input.vpcTopology
  const usedVpcs = usedVpcIdsForSystem(nodes, vt.subnets ?? [])

  const subnets = filterSubnetsForSystemUse(vt.subnets ?? [], nodes, usedVpcs)
  const availableVpcs = filterAvailableVpcsForSystemUse(
    input.availableVpcs,
    usedVpcs,
    nodes,
  )

  const finalVpcs = new Set<string>([
    ...nodes.map(n => n.vpc_id).filter((x): x is string => !!x),
    ...subnets.map(s => s.vpc_id).filter((x): x is string => !!x),
    ...availableVpcs.map(v => v.vpc_id).filter(Boolean),
  ])

  const nodeIds = new Set(nodes.map(n => n.id))
  const edges = vt.edges ?? { igws: [], nat_gws: [], vpces: [] }
  const igws = filterScaffoldEdges(edges.igws, finalVpcs)
  const nat_gws = filterScaffoldEdges(edges.nat_gws, finalVpcs)
  const vpces = filterScaffoldEdges(edges.vpces, finalVpcs)
  const vpceIds = new Set(vpces.map(v => v.id))
  const iam_roles = filterIamRolesForVisibleWorkloads(vt.iam_roles, nodeIds)
  const trafficEdges = filterTrafficEdgesForVisible(
    input.trafficEdges,
    nodeIds,
    vpceIds,
  )

  const azs = [
    ...new Set(
      subnets
        .map(s => s.az)
        .filter((az): az is string => typeof az === "string" && az.length > 0),
    ),
  ].sort()

  return {
    nodes,
    availableVpcs,
    trafficEdges,
    usedVpcIds: [...finalVpcs],
    vpcTopology: {
      ...vt,
      azs: azs.length > 0 ? azs : vt.azs ?? [],
      subnets,
      edges: { igws, nat_gws, vpces },
      iam_roles,
    },
  }
}

/**
 * Narrow an already system-scoped estate to a single VPC picker selection.
 *
 * MUST set ``vpcTopology.vpc_id`` to ``vpcId``. AwsFrame / buildVpcFrames use
 * that field as the canvas frame id. Filtering subnets/nodes to a sibling VPC
 * while leaving the primary id (e.g. vpc-0329) produces an empty
 * "No tagged subnets in this VPC" frame — picker/counts say vpc-086, canvas
 * label stays vpc-0329 (Alon screenshot, 2026-07-10).
 */
export function narrowSystemEstateToVpc(
  scoped: SystemScopeResult,
  vpcId: string,
): SystemScopeResult {
  return {
    ...scoped,
    nodes: scoped.nodes.filter(n => {
      if (n.vpc_id === vpcId) return true
      // Regional / serverless stay visible on rails in single-VPC view.
      if (!n.vpc_id) return true
      return false
    }),
    vpcTopology: {
      ...scoped.vpcTopology,
      vpc_id: vpcId,
      subnets: (scoped.vpcTopology.subnets ?? []).filter(s => s.vpc_id === vpcId),
      edges: {
        igws: (scoped.vpcTopology.edges?.igws ?? []).filter(
          i => !i.vpc_id || i.vpc_id === vpcId,
        ),
        nat_gws: (scoped.vpcTopology.edges?.nat_gws ?? []).filter(
          i => !i.vpc_id || i.vpc_id === vpcId,
        ),
        vpces: (scoped.vpcTopology.edges?.vpces ?? []).filter(
          // Require vpc_id match when present. Missing vpc_id is kept only
          // during BE deploy lag (pre-vpc_id payloads); once BE stamps
          // vpc_id, sibling-VPC endpoints (e.g. vpc-0329 SSM on a vpc-086
          // frame) are dropped.
          i => !i.vpc_id || i.vpc_id === vpcId,
        ),
      },
    },
  }
}
