import { selectSpotlightPaths } from "@/lib/attack-paths/build-spotlight-active-node-ids"
import type { ConvergenceHop, ConvergencePath } from "@/lib/attack-paths/convergence-types"

/** Minimal flow shape for checkpoint patching (avoids importing TFM). */
export interface SpotlightFlowCheckpoint {
  sourceId: string
  targetId: string
  sgId?: string
  naclId?: string
  instanceProfileId?: string
  roleId?: string
  vpceId?: string
  subnetId?: string
}

function normHopType(t: string | undefined | null): string {
  return (t || "").toLowerCase().replace(/[^a-z0-9]/g, "")
}

function extractInstanceId(id: string): string {
  const m = id.match(/i-[a-f0-9]+/)
  return m ? m[0] : id
}

/** Pull checkpoint ids from a convergence hop chain (kill-chain spine). */
export function checkpointIdsFromHops(hops: ConvergenceHop[]): {
  subnetId?: string
  sgId?: string
  naclId?: string
  instanceProfileId?: string
  roleId?: string
  vpceId?: string
} {
  const out: {
    subnetId?: string
    sgId?: string
    naclId?: string
    instanceProfileId?: string
    roleId?: string
    vpceId?: string
  } = {}
  for (const h of hops) {
    const id = h.node_id
    if (!id) continue
    const nt = normHopType(h.node_type)
    if (h.subnet_id && !out.subnetId) out.subnetId = h.subnet_id
    if (nt.includes("subnet") && !out.subnetId) out.subnetId = id
    if (nt.includes("securitygroup") || nt === "sg") out.sgId = id
    if (nt.includes("networkacl") || nt === "nacl") out.naclId = id
    if (nt.includes("instanceprofile")) out.instanceProfileId = id
    if (
      (nt.includes("iamrole") || (nt.includes("role") && !nt.includes("profile"))) &&
      !nt.includes("instanceprofile")
    ) {
      out.roleId = id
    }
    if (nt.includes("vpcendpoint") || nt === "vpce") out.vpceId = id
    for (const sg of h.security_groups || []) {
      if (sg && !out.sgId) out.sgId = sg
    }
  }
  return out
}

/** Minimal checkpoint shape compatible with TFM SecurityCheckpoint. */
export interface SpotlightCheckpoint {
  id: string
  type: "security_group" | "iam_role" | "nacl"
  name: string
  shortName: string
  usedCount: number
  totalCount: number
  gapCount: number
  connectedSources: string[]
  connectedTargets: string[]
}

export interface SpotlightServiceNode {
  id: string
  name: string
  shortName: string
  type: "compute" | "lambda"
  instanceId?: string
}

export interface SpotlightArchitectureBuckets {
  computeServices: SpotlightServiceNode[]
  securityGroups: SpotlightCheckpoint[]
  iamRoles: SpotlightCheckpoint[]
  instanceProfiles?: SpotlightCheckpoint[]
  nacls?: SpotlightCheckpoint[]
}

function truncate(name: string, max = 14): string {
  if (!name) return ""
  return name.length <= max ? name : `${name.slice(0, max - 1)}…`
}

function normType(t: string | undefined | null): string {
  return (t || "").toLowerCase().replace(/[^a-z0-9]/g, "")
}

function seedCheckpoint(
  type: SpotlightCheckpoint["type"],
  id: string,
  name: string,
  computeId?: string,
): SpotlightCheckpoint {
  return {
    id,
    type,
    name,
    shortName: truncate(name, 14),
    usedCount: 0,
    totalCount: 0,
    gapCount: 0,
    connectedSources: computeId ? [computeId] : [],
    connectedTargets: [],
  }
}

function mergeCheckpoint(
  list: SpotlightCheckpoint[],
  seen: Set<string>,
  item: SpotlightCheckpoint,
  computeId?: string,
): void {
  if (seen.has(item.id)) {
    if (computeId) {
      const existing = list.find((x) => x.id === item.id)
      if (existing && !existing.connectedSources.includes(computeId)) {
        existing.connectedSources.push(computeId)
      }
    }
    return
  }
  seen.add(item.id)
  list.push(item)
}

function seedFromHop(
  hop: ConvergenceHop,
  buckets: {
    computeServices: SpotlightServiceNode[]
    securityGroups: SpotlightCheckpoint[]
    iamRoles: SpotlightCheckpoint[]
    instanceProfiles: SpotlightCheckpoint[]
    nacls: SpotlightCheckpoint[]
  },
  seen: {
    compute: Set<string>
    sg: Set<string>
    role: Set<string>
    ip: Set<string>
    nacl: Set<string>
  },
  workloadId: string,
): void {
  const id = hop.node_id
  const name = hop.name || id
  if (!id) return
  const nt = normType(hop.node_type)

  if (nt.includes("ec2") || nt === "compute" || nt.includes("lambda")) {
    if (!seen.compute.has(id)) {
      seen.compute.add(id)
      buckets.computeServices.push({
        id,
        name,
        shortName: truncate(name, 14),
        type: nt.includes("lambda") ? "lambda" : "compute",
        instanceId: id.match(/i-[a-f0-9]+/)?.[0] ?? id.substring(0, 12),
      })
    }
    return
  }

  if (nt.includes("securitygroup") || nt === "sg") {
    mergeCheckpoint(
      buckets.securityGroups,
      seen.sg,
      seedCheckpoint("security_group", id, name, workloadId),
      workloadId,
    )
    return
  }

  if (nt.includes("iamrole") || (nt.includes("role") && !nt.includes("profile"))) {
    mergeCheckpoint(
      buckets.iamRoles,
      seen.role,
      seedCheckpoint("iam_role", id, name, workloadId),
      workloadId,
    )
    return
  }

  if (nt.includes("instanceprofile")) {
    mergeCheckpoint(
      buckets.instanceProfiles,
      seen.ip,
      seedCheckpoint("iam_role", id, name, workloadId),
      workloadId,
    )
    return
  }

  if (nt.includes("networkacl") || nt === "nacl") {
    mergeCheckpoint(
      buckets.nacls,
      seen.nacl,
      seedCheckpoint("nacl", id, name, workloadId),
      workloadId,
    )
  }
}

/**
 * Seed COMPUTE / SG / IAM cards from convergence hop chains when the
 * dep-map architecture omits them (no SECURED_BY / USES_ROLE edge).
 */
export function enrichArchitectureForSpotlight<T extends SpotlightArchitectureBuckets>(
  arch: T,
  paths: ConvergencePath[],
  spotlightPathId: string | null,
): T {
  const lanePaths = selectSpotlightPaths(paths, spotlightPathId)
  if (!lanePaths.length) return arch

  const computeServices = [...arch.computeServices]
  const securityGroups = [...arch.securityGroups]
  const iamRoles = [...arch.iamRoles]
  const instanceProfiles = [...(arch.instanceProfiles ?? [])]
  const nacls = [...(arch.nacls ?? [])]

  const seen = {
    compute: new Set(computeServices.map((c) => c.id)),
    sg: new Set(securityGroups.map((s) => s.id)),
    role: new Set(iamRoles.map((r) => r.id)),
    ip: new Set(instanceProfiles.map((ip) => ip.id)),
    nacl: new Set(nacls.map((n) => n.id)),
  }

  const buckets = {
    computeServices,
    securityGroups,
    iamRoles,
    instanceProfiles,
    nacls,
  }

  for (const p of lanePaths) {
    const workloadId = (p.workload_arn ?? "").trim()
    for (const hop of p.hops ?? []) {
      seedFromHop(hop, buckets, seen, workloadId)
    }
    if (p.identity?.trim() && !seen.role.has(p.identity)) {
      mergeCheckpoint(
        iamRoles,
        seen.role,
        seedCheckpoint(
          "iam_role",
          p.identity,
          p.identity_name ?? p.identity,
          workloadId || undefined,
        ),
        workloadId || undefined,
      )
    }
  }

  return {
    ...arch,
    computeServices,
    securityGroups,
    iamRoles,
    instanceProfiles,
    nacls,
  }
}

/**
 * Wire observed traffic flows through the kill-chain checkpoints when
 * dep-map edges omit SECURED_BY / USES_ROLE (common on spotlight paths).
 * Without this, ConnectionLinesSVG draws a direct EC2→S3 line and the
 * SG/NACL/Role/VPCE cards float disconnected despite showing in the strip.
 */
export function patchSpotlightFlowCheckpoints<T extends { flows: SpotlightFlowCheckpoint[] }>(
  arch: T,
  paths: ConvergencePath[],
  spotlightPathId: string | null,
): T {
  const lanePaths = selectSpotlightPaths(paths, spotlightPathId)
  if (!lanePaths.some((p) => (p.hops?.length ?? 0) > 0)) return arch

  const byCompute = new Map<string, ReturnType<typeof checkpointIdsFromHops>>()
  for (const p of lanePaths) {
    if (!p.hops?.length) continue
    const ck = checkpointIdsFromHops(p.hops)
    const keys = new Set<string>()
    if (p.workload_arn) keys.add(p.workload_arn)
    if (p.source) keys.add(p.source)
    keys.add(extractInstanceId(p.workload_arn ?? p.source ?? ""))
    for (const k of keys) {
      if (!k) continue
      const prev = byCompute.get(k) ?? {}
      byCompute.set(k, { ...prev, ...ck })
    }
  }

  const patchedFlows = arch.flows.map((flow) => {
    const ck =
      byCompute.get(flow.sourceId) ??
      byCompute.get(extractInstanceId(flow.sourceId))
    if (!ck) return flow
    return {
      ...flow,
      subnetId: flow.subnetId ?? ck.subnetId,
      sgId: flow.sgId ?? ck.sgId,
      naclId: flow.naclId ?? ck.naclId,
      instanceProfileId: flow.instanceProfileId ?? ck.instanceProfileId,
      roleId: flow.roleId ?? ck.roleId,
      vpceId: flow.vpceId ?? ck.vpceId,
    }
  })

  return { ...arch, flows: patchedFlows }
}
