import type { ConvergencePath } from "@/lib/attack-paths/convergence-types"

export interface SpotlightJewelRef {
  id: string
  canonical_id?: string | null
}

export interface SpotlightArchitectureSlice {
  computeServices: Array<{ id: string; name?: string; instanceId?: string }>
  securityGroups: Array<{ id: string; name?: string }>
  iamRoles: Array<{ id: string; name?: string }>
  flows: Array<{
    sourceId: string
    targetId: string
    sgId?: string
    naclId?: string
    roleId?: string
    vpceId?: string
    egressGatewayId?: string
  }>
  vpcEndpoints?: Array<{ id: string }>
}

function extractInstanceId(id: string | null | undefined): string {
  if (!id) return ""
  const match = id.match(/i-[a-f0-9]+/)
  return match ? match[0] : id
}

function resolveComputeId(
  path: ConvergencePath,
  architecture?: SpotlightArchitectureSlice | null,
): string | null {
  if (!architecture) return null
  const keys = [path.workload_arn, path.source].filter(Boolean) as string[]
  for (const key of keys) {
    const instanceKey = extractInstanceId(key)
    const byId = architecture.computeServices.find(
      (s) =>
        s.id === key ||
        s.id === instanceKey ||
        s.instanceId === key ||
        s.instanceId === instanceKey,
    )
    if (byId) return byId.id
    const lower = key.toLowerCase()
    const byName = architecture.computeServices.find(
      (s) => (s.name || "").toLowerCase() === lower,
    )
    if (byName) return byName.id
  }
  return null
}

function resolveRoleIds(
  path: ConvergencePath,
  architecture?: SpotlightArchitectureSlice | null,
): string[] {
  const out: string[] = []
  if (path.identity) out.push(path.identity)
  if (!architecture?.iamRoles?.length) return out
  const byName = architecture.iamRoles.find(
    (r) =>
      r.id === path.identity ||
      (path.identity_name && r.name === path.identity_name),
  )
  if (byName && !out.includes(byName.id)) out.push(byName.id)
  return out
}

/** Union (or single-path) node ids for Crown Jewel Spotlight canvas dimming. */
export function buildSpotlightActiveNodeIds(params: {
  paths: ConvergencePath[]
  spotlightPathId?: string | null
  jewel?: SpotlightJewelRef | null
  architecture?: SpotlightArchitectureSlice | null
}): Set<string> {
  const { paths, spotlightPathId, jewel, architecture } = params
  const out = new Set<string>()
  if (!paths.length) return out

  const pathsToInclude = spotlightPathId
    ? paths.filter((p) => p.path_id === spotlightPathId)
    : paths

  for (const p of pathsToInclude) {
    if (p.source) out.add(p.source)
    if (p.workload_arn) out.add(p.workload_arn)
    if (p.identity) out.add(p.identity)
    if (p.cj_target_id) out.add(p.cj_target_id)
    for (const roleId of resolveRoleIds(p, architecture)) out.add(roleId)

    for (const h of p.hops || []) {
      if (h.node_id) out.add(h.node_id)
      if (h.subnet_id) out.add(h.subnet_id)
      for (const sg of h.security_groups || []) {
        if (sg) out.add(sg)
      }
    }

    const computeId = resolveComputeId(p, architecture)
    if (computeId) {
      out.add(computeId)
      const instanceKey = extractInstanceId(computeId)
      if (architecture?.flows?.length) {
        for (const flow of architecture.flows) {
          const matchesSource =
            flow.sourceId === computeId ||
            flow.sourceId === instanceKey ||
            extractInstanceId(flow.sourceId) === instanceKey
          if (!matchesSource) continue
          if (flow.sgId) out.add(flow.sgId)
          if (flow.naclId) out.add(flow.naclId)
          if (flow.roleId) out.add(flow.roleId)
          if (flow.vpceId) out.add(flow.vpceId)
          if (flow.egressGatewayId) out.add(flow.egressGatewayId)
        }
      }
    }

    if (architecture?.securityGroups?.length && p.source) {
      const lower = p.source.toLowerCase()
      for (const sg of architecture.securityGroups) {
        if ((sg.name || "").toLowerCase().includes(lower)) out.add(sg.id)
      }
    }
  }

  if (jewel) {
    out.add(jewel.id)
    if (jewel.canonical_id) out.add(jewel.canonical_id)
  }

  if (architecture?.vpcEndpoints?.length && pathsToInclude.length > 0) {
    for (const vpce of architecture.vpcEndpoints) {
      if (vpce.id) out.add(vpce.id)
    }
  }

  return out
}
