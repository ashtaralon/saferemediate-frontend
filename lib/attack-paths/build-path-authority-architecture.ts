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
import { hopRuleTotalCount } from "@/lib/attack-paths/hop-rule-total-count"
import type {
  CanvasEdge,
  CanvasEdgePathEvidence,
  CanvasRelationshipType,
} from "@/lib/types/attack-canvas"

export interface PathAuthorityJewelRef {
  id: string
  canonical_id?: string | null
  name?: string | null
  type?: string | null
}

/**
 * Whether an EMPTY network lane is a settled fact or just un-hydrated detail.
 *
 * `ConvergencePath.hops_load_state` already spells the rule out — "pending:
 * summary only — do NOT treat empty hops as 'no network'" — but nothing carried
 * that state as far as the renderer, so the map's banner read empty buckets as a
 * positive finding ("No Network Controls · Network defenses do not apply") on
 * paths whose detail had never loaded. The dossier honours the same contract via
 * its `hopsPending` prop; the map was the one consumer that did not.
 *
 * `settled` is true only when every path in the lane reports `ready`. Absence of
 * the field is NOT treated as ready: an older payload that predates
 * hops_load_state cannot prove the lane is empty, and this must fail closed.
 */
export interface PathAuthorityNetworkPosture {
  settled: boolean
  reason:
    | "hops_ready"
    | "hops_pending"
    | "hops_error"
    | "hops_fallback"
    | "hops_state_absent"
    | "no_paths"
}

/** Minimal lane shapes — compatible with TFM SystemArchitecture buckets. */
export interface PathAuthorityArchitecture {
  /** Provenance for an empty network lane. See PathAuthorityNetworkPosture. */
  networkPosture: PathAuthorityNetworkPosture
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
    rulesCoverage?: "COLLECTED" | "NOT_COLLECTED" | "UNKNOWN" | null
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
    rulesCoverage?: "COLLECTED" | "NOT_COLLECTED" | "UNKNOWN" | null
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
    rulesCoverage?: "COLLECTED" | "NOT_COLLECTED" | "UNKNOWN" | null
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
    rulesCoverage?: "COLLECTED" | "NOT_COLLECTED" | "UNKNOWN" | null
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
  /**
   * Gateway / VPCE id → which fan-in path_ids touch it (hop or edge).
   * Drives "N of M paths" ownership chips — never invent ownership.
   */
  gatewayPathOwnership: Record<
    string,
    { pathIds: string[]; totalPaths: number }
  >
  /** Hop / workload node id → path_ids that include it (DTO only). */
  pathIdsByNodeId: Record<string, string[]>
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

function isComputeHop(nt: string, id: string): boolean {
  const t = normType(nt)
  return (
    t.includes("ec2") ||
    t === "compute" ||
    t.includes("lambda") ||
    id.startsWith("i-") ||
    id.includes(":instance/") ||
    id.includes(":function:")
  )
}

function isInstanceProfileHop(nt: string): boolean {
  return normType(nt).includes("instanceprofile")
}

function isIamRoleHop(nt: string): boolean {
  const t = normType(nt)
  return t.includes("iamrole") || (t.includes("role") && !t.includes("profile"))
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

export type GatewayPathOwnership = PathAuthorityArchitecture["gatewayPathOwnership"]

/** Which fan-in paths touch a gateway/VPCE id (hop node or edge endpoint). */
export function buildGatewayPathOwnership(
  paths: ConvergencePath[],
  spotlightPathId?: string | null,
  /** SERVE eligible_total when present — never imply drawn === estate. */
  eligibleTotal?: number | null,
): GatewayPathOwnership {
  const lane = selectSpotlightPaths(paths, spotlightPathId ?? null)
  const totalPaths =
    typeof eligibleTotal === "number" &&
    Number.isFinite(eligibleTotal) &&
    eligibleTotal > 0
      ? eligibleTotal
      : lane.length
  const byGw = new Map<string, Set<string>>()
  const touch = (gwId: string, pathId: string) => {
    if (!gwId || !pathId) return
    let set = byGw.get(gwId)
    if (!set) {
      set = new Set()
      byGw.set(gwId, set)
    }
    set.add(pathId)
  }
  for (const p of lane) {
    const pid = p.path_id
    for (const h of p.hops ?? []) {
      const id = h.node_id
      if (!id) continue
      const nt = normType(h.node_type)
      if (
        id.startsWith("igw-") ||
        id.startsWith("nat-") ||
        id.startsWith("eigw-") ||
        id.startsWith("tgw-") ||
        id.startsWith("vpce-") ||
        nt.includes("internetgateway") ||
        nt.includes("natgateway") ||
        nt.includes("vpcendpoint") ||
        nt.includes("transitgateway")
      ) {
        touch(id, pid)
      }
    }
  }
  const out: GatewayPathOwnership = {}
  for (const [id, set] of byGw) {
    out[id] = { pathIds: [...set].sort(), totalPaths }
  }
  return out
}

/** Node id → fan-in path_ids that list it as a hop / workload / identity. */
export function buildPathIdsByNodeId(
  paths: ConvergencePath[],
  spotlightPathId?: string | null,
): Record<string, string[]> {
  const lane = selectSpotlightPaths(paths, spotlightPathId ?? null)
  const byNode = new Map<string, Set<string>>()
  const touch = (nodeId: string, pathId: string) => {
    if (!nodeId || !pathId) return
    let set = byNode.get(nodeId)
    if (!set) {
      set = new Set()
      byNode.set(nodeId, set)
    }
    set.add(pathId)
  }
  for (const p of lane) {
    const pid = p.path_id
    if (p.workload_arn) {
      touch(p.workload_arn, pid)
      const inst = extractInstanceId(p.workload_arn)
      if (inst) touch(inst, pid)
    }
    if (p.identity) touch(p.identity, pid)
    if (p.cj_target_id) touch(p.cj_target_id, pid)
    for (const h of p.hops ?? []) {
      if (h.node_id) touch(h.node_id, pid)
      if (h.subnet_id) touch(h.subnet_id, pid)
      for (const sg of h.security_groups || []) {
        if (sg && isSecurityGroupId(sg)) touch(sg, pid)
      }
    }
  }
  const out: Record<string, string[]> = {}
  for (const [id, set] of byNode) {
    out[id] = [...set].sort()
  }
  return out
}

/**
 * True when a selected path carries observed *network/data* evidence
 * with concrete volume (bytes or hit_count) on a DTO edge.
 * Uses per-edge hop stamps — path.confidence (identity_gate) alone is
 * not sufficient and must not be required.
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
      if (!isObservedCapable(parsed.relationship)) continue
      const edge = hopIncomingEdgeEvidence(h)
      if (edge.hit_count != null && edge.hit_count > 0) return true
      if (edge.evidence === "observed") {
        const props = h.key_properties || null
        const bytes =
          typeof props?.bytes === "number" ? (props.bytes as number) : null
        if (bytes != null && bytes > 0) return true
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
  rulesCoverage?: "COLLECTED" | "NOT_COLLECTED" | "UNKNOWN" | null
  gapCount: number
  connectedSources: string[]
  connectedTargets: string[]
}

function normalizeRulesCoverage(
  raw: string | null | undefined,
): "COLLECTED" | "NOT_COLLECTED" | "UNKNOWN" | null {
  if (!raw) return null
  const u = raw.trim().toUpperCase()
  if (u === "COLLECTED" || u === "NOT_COLLECTED" || u === "UNKNOWN") return u
  return null
}

function emptyCheckpoint(
  type: PathAuthorityCheckpoint["type"],
  id: string,
  name: string,
  computeId?: string,
  totalCount?: number | null,
  rulesCoverage?: "COLLECTED" | "NOT_COLLECTED" | "UNKNOWN" | null,
): PathAuthorityCheckpoint {
  return {
    id,
    type,
    name,
    shortName: truncate(name),
    usedCount: 0,
    totalCount: totalCount ?? null,
    rulesCoverage: rulesCoverage ?? null,
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

type EdgePushMeta = {
  collapsed_hop_ids?: string[]
  via_label?: string
  /** Per-edge evidence from hops_json — wins over path.confidence. */
  hop_evidence?: string | null
  hit_count?: number | null
  first_seen?: string | null
  last_seen?: string | null
}

function isObservedCapable(relationship: CanvasRelationshipType): boolean {
  return (
    relationship === "ACTUAL_TRAFFIC" ||
    relationship === "ACTUAL_API_CALL" ||
    relationship === "ACTUAL_S3_ACCESS" ||
    relationship === "ACCESSES_RESOURCE" ||
    relationship === "READS_FROM" ||
    relationship === "WRITES_TO" ||
    relationship === "RUNTIME_CALLS"
  )
}

/** Normalize hops_json / path evidence spellings to observed|configured|… */
export function normalizeEdgeEvidence(raw: string | null | undefined): string {
  const e = (raw || "").toLowerCase().trim()
  if (e === "config") return "configured"
  return e
}

/**
 * Per-edge evidence from a ConvergenceHop that carries edge_type_from_prev.
 * Prefer hop.edge_evidence / hit_count over path-level identity_gate confidence.
 */
export function hopIncomingEdgeEvidence(hop: ConvergenceHop): {
  evidence: string | null
  hit_count: number | null
  first_seen: string | null
  last_seen: string | null
} {
  const anyHop = hop as ConvergenceHop & {
    evidence?: string | null
    bytes?: unknown
  }
  const props = hop.key_properties || null
  const hitRaw =
    typeof hop.hit_count === "number"
      ? hop.hit_count
      : typeof props?.hit_count === "number"
        ? (props.hit_count as number)
        : null
  const hit_count =
    hitRaw != null && Number.isFinite(hitRaw) && hitRaw > 0 ? hitRaw : null
  let evidence: string | null = normalizeEdgeEvidence(
    hop.edge_evidence ?? anyHop.evidence ?? (props?.evidence as string | undefined),
  )
  if (!evidence && hit_count != null) evidence = "observed"
  if (evidence === "") evidence = null
  const first_seen =
    (typeof hop.first_seen === "string" && hop.first_seen) ||
    (typeof props?.first_seen === "string" ? props.first_seen : null) ||
    null
  const last_seen =
    (typeof hop.last_seen === "string" && hop.last_seen) ||
    (typeof props?.last_seen === "string" ? props.last_seen : null) ||
    null
  return { evidence, hit_count, first_seen, last_seen }
}

function resolveEdgeObserved(
  relationship: CanvasRelationshipType,
  _pathEvidence: string,
  hopEvidence: string | null | undefined,
  hitCount: number | null | undefined,
): boolean | null {
  if (!isObservedCapable(relationship)) return null
  const hop = normalizeEdgeEvidence(hopEvidence)
  if (hop === "observed" || (hitCount != null && hitCount > 0)) return true
  // No hop stamp / explicit configured: do NOT use path.confidence
  // (identity_gate). That signal downgraded observed ACCESSES_RESOURCE
  // to Configured when identity was OPEN_CONFIG.
  return false
}

function pushEdge(
  edges: CanvasEdge[],
  seen: Set<string>,
  source: string,
  target: string,
  relationship: CanvasRelationshipType,
  pathId: string,
  pathEvidence: string,
  meta?: EdgePushMeta,
): void {
  if (!source || !target || source === target) return
  const id = `${source}|${relationship}|${target}`
  const nextObserved = resolveEdgeObserved(
    relationship,
    pathEvidence,
    meta?.hop_evidence,
    meta?.hit_count,
  )
  const nextHits =
    typeof meta?.hit_count === "number" && meta.hit_count > 0
      ? meta.hit_count
      : null
  const nextPathEvidence: CanvasEdgePathEvidence = {
    path_id: pathId,
    observed: nextObserved,
    hit_count: nextHits,
    first_seen: meta?.first_seen ?? null,
    last_seen: meta?.last_seen ?? null,
  }

  if (seen.has(id)) {
    const existing = edges.find((e) => e.id === id)
    if (!existing) return
    // Merge rule: if any canonical edge is observed, the combined edge
    // is observed. Configured must never overwrite observed.
    if (nextObserved === true && existing.observed !== true) {
      existing.observed = true
    }
    if (nextHits != null) {
      existing.hit_count = Math.max(existing.hit_count ?? 0, nextHits)
    }
    if (meta?.last_seen) {
      if (
        !existing.last_seen ||
        String(meta.last_seen) > String(existing.last_seen)
      ) {
        existing.last_seen = meta.last_seen
      }
    }
    if (meta?.first_seen) {
      if (
        !existing.first_seen ||
        String(meta.first_seen) < String(existing.first_seen)
      ) {
        existing.first_seen = meta.first_seen
      }
    }
    if (meta?.collapsed_hop_ids?.length && !existing.collapsed_hop_ids?.length) {
      existing.collapsed_hop_ids = meta.collapsed_hop_ids
    }
    if (meta?.via_label && !existing.via_label) {
      existing.via_label = meta.via_label
    }
    if (pathId) {
      existing.path_ids = [...new Set([...(existing.path_ids ?? []), pathId])].sort()
      const pathEvidenceRows = existing.path_evidence ?? []
      const prior = pathEvidenceRows.find((row) => row.path_id === pathId)
      if (!prior) {
        existing.path_evidence = [...pathEvidenceRows, nextPathEvidence].sort(
          (a, b) => a.path_id.localeCompare(b.path_id),
        )
      } else {
        if (nextObserved === true) prior.observed = true
        if (nextHits != null) {
          prior.hit_count = Math.max(prior.hit_count ?? 0, nextHits)
        }
        if (
          nextPathEvidence.first_seen &&
          (!prior.first_seen ||
            nextPathEvidence.first_seen < prior.first_seen)
        ) {
          prior.first_seen = nextPathEvidence.first_seen
        }
        if (
          nextPathEvidence.last_seen &&
          (!prior.last_seen || nextPathEvidence.last_seen > prior.last_seen)
        ) {
          prior.last_seen = nextPathEvidence.last_seen
        }
      }
    }
    return
  }
  seen.add(id)
  edges.push({
    id,
    source_aws_id: source,
    target_aws_id: target,
    relationship,
    observed: nextObserved,
    hit_count: nextHits,
    bytes: null,
    first_seen: meta?.first_seen ?? null,
    last_seen: meta?.last_seen ?? null,
    port: null,
    protocol: null,
    ...(pathId ? { path_ids: [pathId], path_evidence: [nextPathEvidence] } : {}),
    ...(meta?.collapsed_hop_ids?.length
      ? { collapsed_hop_ids: meta.collapsed_hop_ids }
      : {}),
    ...(meta?.via_label ? { via_label: meta.via_label } : {}),
  })
}

/**
 * Collapse exact EC2 → InstanceProfile → Role consecutive hops into one
 * USES_ROLE edge labeled "via <profile>". Never invent USES_ROLE without
 * both typed hops present in the DTO walk.
 */
function tryCollapseProfileHops(
  hops: ConvergenceHop[],
  i: number,
): {
  source: string
  target: string
  relationship: CanvasRelationshipType
  collapsed_hop_ids: string[]
  via_label: string
  skipNext: boolean
} | null {
  if (i + 1 >= hops.length) return null
  const a = hops[i - 1]
  const b = hops[i]
  const c = hops[i + 1]
  if (!a?.node_id || !b?.node_id || !c?.node_id) return null
  if (!isComputeHop(a.node_type, a.node_id)) return null
  if (!isInstanceProfileHop(b.node_type)) return null
  if (!isIamRoleHop(c.node_type)) return null

  const ab = parseEdgeType(b.edge_type_from_prev)
  const bc = parseEdgeType(c.edge_type_from_prev)
  if (!ab || !bc) return null

  // Accept common DTO spellings for the two hops; collapse to USES_ROLE.
  const abOk =
    ab.relationship === "HAS_INSTANCE_PROFILE" ||
    ab.relationship === "USES_ROLE" ||
    ab.relationship === "ASSOCIATED_WITH"
  const bcOk =
    bc.relationship === "USES_ROLE" ||
    bc.relationship === "ASSUMES_ROLE" ||
    bc.relationship === "HAS_INSTANCE_PROFILE" ||
    bc.relationship === "ASSOCIATED_WITH"
  if (!abOk || !bcOk) return null

  const profileName = (b.name || b.node_id).trim()
  return {
    source: a.node_id,
    target: c.node_id,
    relationship: "USES_ROLE",
    collapsed_hop_ids: [a.node_id, b.node_id, c.node_id],
    via_label: `uses role via ${profileName}`,
    skipNext: true,
  }
}

/**
 * Is an empty network lane a fact, or just detail we never fetched?
 *
 * Fails closed on purpose. Anything other than "every path says ready" leaves
 * `settled: false`, because the only claim this function can support is "the
 * hop DTOs settled and contained no network hop." A missing `hops_load_state`
 * (older payload) proves nothing and must not be read as ready — that is the
 * exact inference `ConvergencePath` warns against.
 *
 * Worst state wins so one un-hydrated path cannot be masked by ready siblings.
 */
export function deriveNetworkPosture(
  lane: ConvergencePath[],
): PathAuthorityNetworkPosture {
  if (!lane.length) return { settled: false, reason: "no_paths" }

  let sawAbsent = false
  let sawPending = false
  let sawError = false
  let sawFallback = false
  for (const p of lane) {
    switch (p.hops_load_state) {
      case "ready":
        break
      case "pending":
        sawPending = true
        break
      case "error":
        sawError = true
        break
      case "fallback":
        sawFallback = true
        break
      default:
        sawAbsent = true
    }
  }
  // Most-severe first: an error is more informative to surface than a pending.
  if (sawError) return { settled: false, reason: "hops_error" }
  if (sawPending) return { settled: false, reason: "hops_pending" }
  if (sawFallback) return { settled: false, reason: "hops_fallback" }
  if (sawAbsent) return { settled: false, reason: "hops_state_absent" }
  return { settled: true, reason: "hops_ready" }
}

/**
 * Build a TFM-compatible architecture strictly from selected path hops.
 * Estate / dep-map context must not be merged into this object.
 */
export function buildPathAuthorityArchitecture(params: {
  paths: ConvergencePath[]
  spotlightPathId?: string | null
  jewel?: PathAuthorityJewelRef | null
  /** SERVE cardinality.eligible_total for gateway N-of-M honesty. */
  eligibleTotal?: number | null
}): PathAuthorityArchitecture {
  const { paths, spotlightPathId, jewel, eligibleTotal } = params
  const lane = selectSpotlightPaths(paths, spotlightPathId ?? null)
  const networkPosture = deriveNetworkPosture(lane)

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

  const seedHop = (
    hop: ConvergenceHop,
    workloadId: string,
    /** Per-path name→sg-* map — never share across fan-in siblings. */
    sgNameToId: Map<string, string>,
  ) => {
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
      const ruleTotal = hopRuleTotalCount(hop)
      const coverage = normalizeRulesCoverage(hop.rules_coverage)
      if (!seen.sg.has(id)) {
        seen.sg.add(id)
        securityGroups.push(
          emptyCheckpoint(
            "security_group",
            id,
            name,
            workloadId,
            ruleTotal,
            coverage,
          ),
        )
      } else {
        // Attachment edges may create the SG shell first without rules —
        // upgrade when the SecurityGroup hop DTO arrives with COLLECTED count.
        const existing = securityGroups.find((s) => s.id === id)
        if (existing) {
          if (existing.totalCount == null && ruleTotal != null) {
            existing.totalCount = ruleTotal
          }
          if (!existing.rulesCoverage && coverage) {
            existing.rulesCoverage = coverage
          }
        }
      }
      if (name && !isSecurityGroupId(name)) {
        sgNameToId.set(name.toLowerCase(), id)
      }
      if (isSecurityGroupId(id)) {
        sgNameToId.set(id.toLowerCase(), id)
      }
    } else if (nt.includes("networkacl") || nt === "nacl") {
      const ruleTotal = hopRuleTotalCount(hop)
      const coverage = normalizeRulesCoverage(hop.rules_coverage)
      if (!seen.nacl.has(id)) {
        seen.nacl.add(id)
        nacls.push(
          emptyCheckpoint("nacl", id, name, workloadId, ruleTotal, coverage),
        )
      } else {
        const existing = nacls.find((n) => n.id === id)
        if (existing) {
          if (existing.totalCount == null && ruleTotal != null) {
            existing.totalCount = ruleTotal
          }
          if (!existing.rulesCoverage && coverage) {
            existing.rulesCoverage = coverage
          }
        }
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
        iamRoles.push(
          emptyCheckpoint("iam_role", id, name, workloadId, hopRuleTotalCount(hop)),
        )
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

  for (const p of lane) {
    const workloadId =
      extractInstanceId(p.workload_arn) ||
      (p.workload_arn ?? "").trim() ||
      ""
    const hops = p.hops ?? []
    // Scope SG name resolution to this path only — a shared map would let
    // path A's "default" resolve path B's name stamp to the wrong sg-*.
    const sgNameToId = new Map<string, string>()
    for (const hop of hops) seedHop(hop, workloadId, sgNameToId)

    const resolveSgId = (raw: string): string | null => {
      if (!raw) return null
      if (isSecurityGroupId(raw)) return raw
      return sgNameToId.get(raw.toLowerCase()) ?? null
    }

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
    // Collapse EC2 → InstanceProfile → Role when both hops are present.
    for (let i = 1; i < hops.length; i++) {
      const collapsed = tryCollapseProfileHops(hops, i)
      if (collapsed) {
        pushEdge(
          edges,
          edgeSeen,
          collapsed.source,
          collapsed.target,
          collapsed.relationship,
          p.path_id,
          p.evidence || p.confidence || "configured",
          {
            collapsed_hop_ids: collapsed.collapsed_hop_ids,
            via_label: collapsed.via_label,
          },
        )
        if (collapsed.skipNext) i += 1
        continue
      }
      const prev = hops[i - 1]
      const cur = hops[i]
      if (!prev.node_id || !cur.node_id) continue
      const parsed = parseEdgeType(cur.edge_type_from_prev)
      if (!parsed) continue
      const source = parsed.reversed ? cur.node_id : prev.node_id
      const target = parsed.reversed ? prev.node_id : cur.node_id
      const edgeEv = hopIncomingEdgeEvidence(cur)
      pushEdge(
        edges,
        edgeSeen,
        source,
        target,
        parsed.relationship,
        p.path_id,
        p.evidence || p.confidence || "configured",
        {
          hop_evidence: edgeEv.evidence,
          hit_count: edgeEv.hit_count,
          first_seen: edgeEv.first_seen,
          last_seen: edgeEv.last_seen,
        },
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
            p.path_id,
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
            p.path_id,
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
    networkPosture,
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
    gatewayPathOwnership: buildGatewayPathOwnership(
      paths,
      spotlightPathId,
      eligibleTotal,
    ),
    pathIdsByNodeId: buildPathIdsByNodeId(paths, spotlightPathId),
    totalBytes: 0,
    totalConnections: 0,
    totalGaps: 0,
    structuralFallbackUsed: false,
    metricsBasis: "vpc_flow_logs",
  }
}
