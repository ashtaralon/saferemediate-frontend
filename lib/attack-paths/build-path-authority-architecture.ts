/**
 * Zoom0 Reachability — path-authority architecture (P0a / P0b).
 *
 * Contract: path-layer nodes ⊆ selected convergence path DTO nodes;
 * path-layer edges = exact DTO (source, target, type, direction, evidence).
 * No same-VPC IGW/SG promotion. No estate dep-map membership. No invented
 * traffic metrics without selected-path observed network evidence.
 */

import { selectSpotlightPaths } from "@/lib/attack-paths/build-spotlight-active-node-ids"
import type {
  ConvergenceHop,
  ConvergencePath,
} from "@/lib/attack-paths/convergence-types"
import type { CanvasEdge, CanvasRelationshipType } from "@/lib/types/attack-canvas"

export interface PathAuthorityJewelRef {
  id: string
  canonical_id?: string | null
  name?: string | null
  type?: string | null
}

/** Minimal lane shapes — compatible with TFM SystemArchitecture buckets. */
export interface PathAuthorityArchitecture {
  computeServices: Array<{
    id: string
    name: string
    shortName: string
    type: "compute" | "lambda"
    instanceId?: string
  }>
  principals: []
  entryPoints: []
  resources: Array<{
    id: string
    name: string
    shortName: string
    type: "storage" | "dynamodb" | "database" | "kms" | "secret" | "network"
    isCrownJewel?: boolean
  }>
  subnets: Array<{
    id: string
    name: string
    shortName: string
    isPublic: boolean | null
    connectedComputeIds: string[]
  }>
  securityGroups: Array<{
    id: string
    type: "security_group"
    name: string
    shortName: string
    usedCount: number
    totalCount: number | null
    gapCount: number
    connectedSources: string[]
    connectedTargets: string[]
  }>
  nacls: Array<{
    id: string
    type: "nacl"
    name: string
    shortName: string
    usedCount: number
    totalCount: number | null
    gapCount: number
    connectedSources: string[]
    connectedTargets: string[]
  }>
  iamRoles: Array<{
    id: string
    type: "iam_role"
    name: string
    shortName: string
    usedCount: number
    totalCount: number | null
    gapCount: number
    connectedSources: string[]
    connectedTargets: string[]
  }>
  instanceProfiles: Array<{
    id: string
    type: "iam_role"
    name: string
    shortName: string
    usedCount: number
    totalCount: number | null
    gapCount: number
    connectedSources: string[]
    connectedTargets: string[]
  }>
  iamPolicies: []
  vpcEndpoints: Array<{
    id: string
    name: string
    shortName: string
    vpcId: null
    serviceName: null
    serviceShort: string
    endpointType: null
  }>
  egressGateways: Array<{
    id: string
    name: string
    shortName: string
    vpcId: null
    kind:
      | "InternetGateway"
      | "NATGateway"
      | "EgressOnlyInternetGateway"
      | "TransitGateway"
      | "VPCEndpoint"
    kindLabel: string
  }>
  flows: []
  edges: CanvasEdge[]
  onPathEdgeIds: Set<string>
  onPathNodeIds: Set<string>
  totalBytes: number
  totalConnections: number
  totalGaps: number
  structuralFallbackUsed: boolean
  /** Path-authority mode never invents estate traffic totals. */
  metricsBasis: "vpc_flow_logs"
}

function truncate(name: string, max = 14): string {
  if (!name) return ""
  return name.length <= max ? name : `${name.slice(0, max - 1)}…`
}

function normType(t: string | undefined | null): string {
  return (t || "").toLowerCase().replace(/[^a-z0-9]/g, "")
}

function extractInstanceId(id: string | null | undefined): string {
  if (!id) return ""
  const match = id.match(/i-[a-f0-9]+/)
  return match ? match[0] : id
}

const KNOWN_RELS = new Set<string>([
  "USES_ROLE",
  "ASSUMES_ROLE",
  "ASSUMES_ROLE_ACTUAL",
  "HAS_INSTANCE_PROFILE",
  "HAS_POLICY",
  "SECURED_BY",
  "HAS_NETWORK_INTERFACE",
  "IN_SUBNET",
  "IN_VPC",
  "RUNS_IN_VPC",
  "ASSOCIATED_WITH",
  "ROUTES_VIA",
  "BELONGS_TO",
  "ACCESSES_RESOURCE",
  "ACTUAL_TRAFFIC",
  "ACTUAL_API_CALL",
  "ACTUAL_S3_ACCESS",
  "READS_FROM",
  "WRITES_TO",
  "RUNTIME_CALLS",
])

/** DTO aliases → canvas relationship (never invent; only normalize spelling). */
const REL_ALIASES: Record<string, CanvasRelationshipType> = {
  // Materializer stamps bucket/role → VPCE as EXFILTRATES_VIA; canvas
  // already treats ROUTES_VIA as configured routing association.
  EXFILTRATES_VIA: "ROUTES_VIA",
}

function isSecurityGroupId(id: string): boolean {
  return /^sg-[a-f0-9]+$/i.test(id)
}

function parseEdgeType(
  raw: string | null | undefined,
): { relationship: CanvasRelationshipType; reversed: boolean } | null {
  if (!raw || !raw.trim()) return null
  const reversed = raw.startsWith("~")
  const rel = (reversed ? raw.slice(1) : raw).toUpperCase().trim()
  const canonical = REL_ALIASES[rel] ?? rel
  if (!KNOWN_RELS.has(canonical)) return null
  return { relationship: canonical as CanvasRelationshipType, reversed }
}

/**
 * True only when a selected path carries observed *network* evidence
 * with concrete volume (bytes or hit_count) on a DTO edge.
 * Convergence hops today do not stamp per-edge bytes — so this stays
 * false until the server binds telemetry onto the path DTO.
 */
export function pathHasObservedNetworkEvidence(
  paths: ConvergencePath[],
  spotlightPathId?: string | null,
): boolean {
  const lane = selectSpotlightPaths(paths, spotlightPathId ?? null)
  for (const p of lane) {
    for (const h of p.hops ?? []) {
      const parsed = parseEdgeType(h.edge_type_from_prev)
      if (!parsed) continue
      const rel = parsed.relationship
      const isNetworkOrData =
        rel === "ACTUAL_TRAFFIC" ||
        rel === "ACTUAL_API_CALL" ||
        rel === "ACTUAL_S3_ACCESS" ||
        rel === "ACCESSES_RESOURCE" ||
        rel === "READS_FROM" ||
        rel === "WRITES_TO" ||
        rel === "RUNTIME_CALLS"
      if (!isNetworkOrData) continue
      const anyHop = h as ConvergenceHop & {
        bytes?: unknown
        hit_count?: unknown
        key_properties?: Record<string, unknown> | null
      }
      const props = anyHop.key_properties || null
      const bytes =
        typeof anyHop.bytes === "number"
          ? anyHop.bytes
          : typeof props?.bytes === "number"
            ? props.bytes
            : null
      const hits =
        typeof anyHop.hit_count === "number"
          ? anyHop.hit_count
          : typeof props?.hit_count === "number"
            ? props.hit_count
            : null
      if ((bytes != null && bytes > 0) || (hits != null && hits > 0)) {
        const evidence = (p.evidence || p.confidence || "").toLowerCase()
        if (evidence === "observed") return true
      }
    }
  }
  return false
}

/** Node ids that may appear in the path layer — DTO only, no VPC expand. */
export function collectPathAuthorityNodeIds(params: {
  paths: ConvergencePath[]
  spotlightPathId?: string | null
  jewel?: PathAuthorityJewelRef | null
}): Set<string> {
  const { paths, spotlightPathId, jewel } = params
  const out = new Set<string>()
  const lane = selectSpotlightPaths(paths, spotlightPathId ?? null)
  for (const p of lane) {
    if (p.source) out.add(p.source)
    if (p.workload_arn) {
      out.add(p.workload_arn)
      const inst = extractInstanceId(p.workload_arn)
      if (inst) out.add(inst)
    }
    if (p.identity) out.add(p.identity)
    if (p.cj_target_id) out.add(p.cj_target_id)
    for (const rv of p.routes_via ?? []) {
      if (rv) out.add(rv)
    }
    for (const h of p.hops ?? []) {
      if (h.node_id) out.add(h.node_id)
      if (h.subnet_id) out.add(h.subnet_id)
      // Only canonical sg-* ids — hop.security_groups often repeats the
      // SG *name* on every hop and must not invent path-layer cards.
      for (const sg of h.security_groups || []) {
        if (sg && isSecurityGroupId(sg)) out.add(sg)
      }
    }
  }
  if (jewel) {
    out.add(jewel.id)
    if (jewel.canonical_id) out.add(jewel.canonical_id)
  }
  return out
}

type PathAuthorityCheckpoint = {
  id: string
  type: "security_group" | "nacl" | "iam_role"
  name: string
  shortName: string
  usedCount: number
  totalCount: number | null
  gapCount: number
  connectedSources: string[]
  connectedTargets: string[]
}

function emptyCheckpoint(
  type: PathAuthorityCheckpoint["type"],
  id: string,
  name: string,
  computeId?: string,
): PathAuthorityCheckpoint {
  return {
    id,
    type,
    name,
    shortName: truncate(name),
    usedCount: 0,
    // NOT_COLLECTED — never invent 0 rules as a safe posture.
    totalCount: null,
    gapCount: 0,
    connectedSources: computeId ? [computeId] : [],
    connectedTargets: [],
  }
}

function resourceTypeFromHop(nt: string, id: string): PathAuthorityArchitecture["resources"][number]["type"] {
  if (nt.includes("s3") || id.includes(":s3:") || id.includes("s3:::")) return "storage"
  if (nt.includes("dynamodb") || id.includes("dynamodb")) return "dynamodb"
  if (nt.includes("rds") || nt.includes("database") || id.includes(":rds:")) return "database"
  if (nt.includes("kms") || id.includes(":kms:")) return "kms"
  if (nt.includes("secret") || id.includes("secretsmanager")) return "secret"
  return "network"
}

function egressKind(
  nt: string,
  id: string,
): PathAuthorityArchitecture["egressGateways"][number]["kind"] | null {
  if (nt.includes("internetgateway") || id.startsWith("igw-")) return "InternetGateway"
  if (nt.includes("natgateway") || id.startsWith("nat-")) return "NATGateway"
  if (nt.includes("egressonly") || id.startsWith("eigw-")) return "EgressOnlyInternetGateway"
  if (nt.includes("transitgateway") || id.startsWith("tgw-")) return "TransitGateway"
  return null
}

function kindLabel(
  kind: PathAuthorityArchitecture["egressGateways"][number]["kind"],
): string {
  switch (kind) {
    case "InternetGateway":
      return "IGW"
    case "NATGateway":
      return "NAT GW"
    case "EgressOnlyInternetGateway":
      return "Egress-only IGW"
    case "TransitGateway":
      return "Transit GW"
    case "VPCEndpoint":
      return "VPCE"
  }
}

function pushEdge(
  edges: CanvasEdge[],
  seen: Set<string>,
  source: string,
  target: string,
  relationship: CanvasRelationshipType,
  pathEvidence: string,
): void {
  if (!source || !target || source === target) return
  const id = `${source}|${relationship}|${target}`
  if (seen.has(id)) return
  seen.add(id)
  const evidence = pathEvidence.toLowerCase()
  const observedCapable =
    relationship === "ACTUAL_TRAFFIC" ||
    relationship === "ACTUAL_API_CALL" ||
    relationship === "ACTUAL_S3_ACCESS" ||
    relationship === "ACCESSES_RESOURCE" ||
    relationship === "READS_FROM" ||
    relationship === "WRITES_TO" ||
    relationship === "RUNTIME_CALLS"
  edges.push({
    id,
    source_aws_id: source,
    target_aws_id: target,
    relationship,
    // Config edges: null. Observed-capable without bound volume: false
    // (never animate "Live Traffic" from estate guesses).
    observed: observedCapable ? evidence === "observed" : null,
    hit_count: null,
    bytes: null,
    first_seen: null,
    last_seen: null,
    port: null,
    protocol: null,
  })
}

/**
 * Build a TFM-compatible architecture strictly from selected path hops.
 * Estate / dep-map context must not be merged into this object.
 */
export function buildPathAuthorityArchitecture(params: {
  paths: ConvergencePath[]
  spotlightPathId?: string | null
  jewel?: PathAuthorityJewelRef | null
}): PathAuthorityArchitecture {
  const { paths, spotlightPathId, jewel } = params
  const lane = selectSpotlightPaths(paths, spotlightPathId ?? null)

  const computeServices: PathAuthorityArchitecture["computeServices"] = []
  const resources: PathAuthorityArchitecture["resources"] = []
  const subnets: PathAuthorityArchitecture["subnets"] = []
  const securityGroups: PathAuthorityCheckpoint[] = []
  const nacls: PathAuthorityCheckpoint[] = []
  const iamRoles: PathAuthorityCheckpoint[] = []
  const instanceProfiles: PathAuthorityCheckpoint[] = []
  const vpcEndpoints: PathAuthorityArchitecture["vpcEndpoints"] = []
  const egressGateways: PathAuthorityArchitecture["egressGateways"] = []

  const seen = {
    compute: new Set<string>(),
    resource: new Set<string>(),
    subnet: new Set<string>(),
    sg: new Set<string>(),
    nacl: new Set<string>(),
    role: new Set<string>(),
    ip: new Set<string>(),
    vpce: new Set<string>(),
    egress: new Set<string>(),
  }

  const edges: CanvasEdge[] = []
  const edgeSeen = new Set<string>()
  const onPathNodeIds = collectPathAuthorityNodeIds(params)
  /** SG display-name → canonical sg-* id from SecurityGroup hops. */
  const sgNameToId = new Map<string, string>()

  const seedHop = (hop: ConvergenceHop, workloadId: string) => {
    const id = hop.node_id
    if (!id) return
    const name = hop.name || id
    const nt = normType(hop.node_type)

    if (nt.includes("ec2") || nt === "compute" || nt.includes("lambda")) {
      if (!seen.compute.has(id)) {
        seen.compute.add(id)
        computeServices.push({
          id,
          name,
          shortName: truncate(name),
          type: nt.includes("lambda") ? "lambda" : "compute",
          instanceId: extractInstanceId(id) || id.substring(0, 12),
        })
      }
    } else if (nt.includes("securitygroup") || nt === "sg") {
      if (!seen.sg.has(id)) {
        seen.sg.add(id)
        securityGroups.push(emptyCheckpoint("security_group", id, name, workloadId))
      }
      if (name && !isSecurityGroupId(name)) {
        sgNameToId.set(name.toLowerCase(), id)
      }
      if (isSecurityGroupId(id)) {
        sgNameToId.set(id.toLowerCase(), id)
      }
    } else if (nt.includes("networkacl") || nt === "nacl") {
      if (!seen.nacl.has(id)) {
        seen.nacl.add(id)
        nacls.push(emptyCheckpoint("nacl", id, name, workloadId))
      }
    } else if (nt.includes("instanceprofile")) {
      if (!seen.ip.has(id)) {
        seen.ip.add(id)
        instanceProfiles.push(emptyCheckpoint("iam_role", id, name, workloadId))
      }
    } else if (
      nt.includes("iamrole") ||
      (nt.includes("role") && !nt.includes("profile"))
    ) {
      if (!seen.role.has(id)) {
        seen.role.add(id)
        iamRoles.push(emptyCheckpoint("iam_role", id, name, workloadId))
      }
    } else if (nt.includes("subnet")) {
      if (!seen.subnet.has(id)) {
        seen.subnet.add(id)
        subnets.push({
          id,
          name,
          shortName: truncate(name),
          isPublic:
            typeof hop.subnet_public === "boolean" ? hop.subnet_public : null,
          connectedComputeIds: workloadId ? [workloadId] : [],
        })
      }
    } else if (
      nt.includes("vpcendpoint") ||
      nt === "vpce" ||
      id.startsWith("vpce-")
    ) {
      if (!seen.vpce.has(id)) {
        seen.vpce.add(id)
        vpcEndpoints.push({
          id,
          name,
          shortName: truncate(name),
          vpcId: null,
          serviceName: null,
          serviceShort: "VPCE",
          endpointType: null,
        })
      }
    } else {
      const eg = egressKind(nt, id)
      if (eg) {
        if (!seen.egress.has(id)) {
          seen.egress.add(id)
          egressGateways.push({
            id,
            name,
            shortName: truncate(name),
            vpcId: null,
            kind: eg,
            kindLabel: kindLabel(eg),
          })
        }
      } else if (
        hop.is_crown_jewel ||
        nt.includes("s3") ||
        nt.includes("dynamodb") ||
        nt.includes("rds") ||
        nt.includes("kms") ||
        nt.includes("secret") ||
        id.includes(":s3:") ||
        id.includes("s3:::")
      ) {
        if (!seen.resource.has(id)) {
          seen.resource.add(id)
          resources.push({
            id,
            name,
            shortName: truncate(name),
            type: resourceTypeFromHop(nt, id),
            isCrownJewel: !!hop.is_crown_jewel,
          })
        }
      }
    }

    // Subnet attachment id only — never invent SG cards from name strings
    // stamped on every hop (that inflated 3 SGs → 7).
    if (hop.subnet_id && !seen.subnet.has(hop.subnet_id)) {
      seen.subnet.add(hop.subnet_id)
      subnets.push({
        id: hop.subnet_id,
        name: hop.subnet_id,
        shortName: truncate(hop.subnet_id),
        isPublic:
          typeof hop.subnet_public === "boolean" ? hop.subnet_public : null,
        connectedComputeIds: workloadId ? [workloadId] : [],
      })
    }
  }

  const resolveSgId = (raw: string): string | null => {
    if (!raw) return null
    if (isSecurityGroupId(raw)) return raw
    return sgNameToId.get(raw.toLowerCase()) ?? null
  }

  for (const p of lane) {
    const workloadId =
      extractInstanceId(p.workload_arn) ||
      (p.workload_arn ?? "").trim() ||
      ""
    const hops = p.hops ?? []
    for (const hop of hops) seedHop(hop, workloadId)

    if (p.identity?.trim() && !seen.role.has(p.identity)) {
      seen.role.add(p.identity)
      iamRoles.push(
        emptyCheckpoint(
          "iam_role",
          p.identity,
          p.identity_name ?? p.identity,
          workloadId || undefined,
        ),
      )
    }

    if (
      workloadId &&
      !seen.compute.has(workloadId) &&
      !seen.compute.has(p.workload_arn || "")
    ) {
      const id = p.workload_arn || workloadId
      if (!seen.compute.has(id)) {
        seen.compute.add(id)
        const name = p.source || id
        computeServices.push({
          id,
          name,
          shortName: truncate(name),
          type: "compute",
          instanceId: workloadId,
        })
      }
    }

    // Exact stored edges only — consecutive hops with a typed edge.
    for (let i = 1; i < hops.length; i++) {
      const prev = hops[i - 1]
      const cur = hops[i]
      if (!prev.node_id || !cur.node_id) continue
      const parsed = parseEdgeType(cur.edge_type_from_prev)
      if (!parsed) continue
      const source = parsed.reversed ? cur.node_id : prev.node_id
      const target = parsed.reversed ? prev.node_id : cur.node_id
      pushEdge(
        edges,
        edgeSeen,
        source,
        target,
        parsed.relationship,
        p.evidence || p.confidence || "configured",
      )
    }

    // Parallel attachment edges rooted at the workload (DTO fields).
    const computeId =
      computeServices.find(
        (c) =>
          c.id === p.workload_arn ||
          c.instanceId === workloadId ||
          c.id === workloadId,
      )?.id || workloadId
    if (computeId) {
      for (const hop of hops) {
        if (hop.subnet_id) {
          pushEdge(
            edges,
            edgeSeen,
            computeId,
            hop.subnet_id,
            "IN_SUBNET",
            p.evidence || p.confidence || "configured",
          )
        }
        for (const sgRaw of hop.security_groups || []) {
          const sgId = resolveSgId(sgRaw)
          if (!sgId) continue
          if (!seen.sg.has(sgId)) {
            seen.sg.add(sgId)
            securityGroups.push(
              emptyCheckpoint("security_group", sgId, sgRaw, workloadId),
            )
          }
          pushEdge(
            edges,
            edgeSeen,
            computeId,
            sgId,
            "SECURED_BY",
            p.evidence || p.confidence || "configured",
          )
        }
      }
    }
  }

  if (jewel) {
    const jewelId = jewel.canonical_id || jewel.id
    if (jewelId && !seen.resource.has(jewelId) && !seen.resource.has(jewel.id)) {
      const id = jewel.id
      seen.resource.add(id)
      if (jewel.canonical_id) seen.resource.add(jewel.canonical_id)
      const name = jewel.name || jewel.id
      resources.push({
        id,
        name,
        shortName: truncate(name),
        type: resourceTypeFromHop(normType(jewel.type), jewelId),
        isCrownJewel: true,
      })
    } else {
      for (const r of resources) {
        if (
          r.id === jewel.id ||
          r.id === jewel.canonical_id ||
          (jewel.canonical_id && r.id.endsWith(jewel.canonical_id))
        ) {
          r.isCrownJewel = true
        }
      }
    }
  }

  return {
    computeServices,
    principals: [],
    entryPoints: [],
    resources,
    subnets,
    securityGroups: securityGroups as PathAuthorityArchitecture["securityGroups"],
    nacls: nacls as PathAuthorityArchitecture["nacls"],
    iamRoles: iamRoles as PathAuthorityArchitecture["iamRoles"],
    instanceProfiles: instanceProfiles as PathAuthorityArchitecture["instanceProfiles"],
    iamPolicies: [],
    vpcEndpoints,
    egressGateways,
    flows: [],
    edges,
    onPathEdgeIds: new Set(edges.map((e) => e.id)),
    onPathNodeIds,
    totalBytes: 0,
    totalConnections: 0,
    totalGaps: 0,
    structuralFallbackUsed: false,
    metricsBasis: "vpc_flow_logs",
  }
}
