// Killer containment map — builds the positioned SVG model from the SAME
// SystemArchitecture object TrafficFlowMap consumes (buildAttackerArchitecture
// over graph-view). Per cyntro_containment-map_binding-spec.md: same collectors,
// same data — lanes → nested AWS Cloud > Region > VPC > AZ > Subnet boxes.
//
// "Just this path" (default) renders only on-path nodes/edges from
// architecture.onPathNodeIds / onPathEdgeIds. "Full environment" merges
// supplementary topology-aws siblings when provided (§3 option b).

import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { SystemArchitecture, ServiceNode, SubnetNode, EgressGatewayNode, NodeType } from "@/components/dependency-map/traffic-flow-map"
import type { AttackPathReport } from "./attack-path-report-types"
import {
  type ContainmentModel,
  type CMFrame,
  type CMCard,
  type CMNote,
  type CMEdge,
  type Layer,
  type Category,
  type TopologyResponse,
  gateEdgeColor,
  EDGE_COLOR,
  isLambdaType,
  isCardWorkload,
  cmCardRenderHeight,
} from "./containment-model"
import { isOpaqueIamId } from "./friendly-names"
import { placeAzNetworkControls, placeExternalServicesRail, placeIdentityStack, routeTableCardId, subnetRouteNote } from "./cloud-graph-layout"

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase()

function withRenderHeight(card: Omit<CMCard, "h">): CMCard {
  return { ...card, h: cmCardRenderHeight(card) }
}

export type ContainmentViewMode = "path" | "full"

/** Path-centric view — single-column canvas aligned to attack-paths-v2-layout.html (~920px). */
function layoutScale(compact: boolean) {
  if (compact) {
    return {
      M: 8,
      CLOUD_PAD: 10,
      REGION_PAD: 12,
      VPC_PAD: 10,
      AZ_GAP: 10,
      AZW: 268,
      AZ_HEADER: 16,
      SUBNET_HEADER: 22,
      CARD_H: 34,
      CARD_GAP: 5,
      SUBNET_PAD: 6,
      REGIONAL_CARD_H: 38,
    }
  }
  return {
    M: 16,
    CLOUD_PAD: 18,
    REGION_PAD: 20,
    VPC_PAD: 18,
    AZ_GAP: 14,
    AZW: 320,
    AZ_HEADER: 26,
    SUBNET_HEADER: 36,
    CARD_H: 46,
    CARD_GAP: 8,
    SUBNET_PAD: 12,
    REGIONAL_CARD_H: 50,
  }
}

/** "Just this path" — one AZ column (foothold subnet) so the map matches the mock layout. */
function focusPathAzToFoothold(
  azMap: Map<string, { subnet: SubnetNode; computes: ServiceNode[] }[]>,
  architecture: SystemArchitecture,
  foothold: ServiceNode,
): Map<string, { subnet: SubnetNode; computes: ServiceNode[] }[]> {
  if (azMap.size <= 1) return azMap
  let targetAz: string | null = null
  for (const sn of architecture.subnets) {
    if (sn.connectedComputeIds.includes(foothold.id)) {
      targetAz = sn.availabilityZone || "unknown"
      break
    }
  }
  if (!targetAz) {
    for (const az of azMap.keys()) {
      targetAz = az
      break
    }
  }
  if (!targetAz || !azMap.has(targetAz)) return azMap
  const focused = new Map<string, { subnet: SubnetNode; computes: ServiceNode[] }[]>()
  focused.set(targetAz, azMap.get(targetAz)!)
  return focused
}

/** Enrich "Just this path" with sibling workloads from topology-aws (context layer). */
function mergeTopologyContextWorkloads(
  azMap: Map<string, { subnet: SubnetNode; computes: ServiceNode[] }[]>,
  fullTopology: TopologyResponse,
  vpcId: string,
  computeById: Map<string, ServiceNode>,
  addSubnetRow: (sn: SubnetNode, computes: ServiceNode[]) => void,
) {
  const topoVpc = fullTopology.vpcs.find((v) => v.id === vpcId) ?? fullTopology.vpcs[0]
  if (!topoVpc) return
  const placed = new Set<string>()
  for (const rows of azMap.values()) {
    for (const row of rows) {
      for (const c of row.computes) placed.add(c.id)
    }
  }
  for (const az of topoVpc.azs ?? []) {
    for (const ts of az.subnets ?? []) {
      const archSubnet = {
        id: ts.id,
        name: ts.name,
        shortName: ts.name,
        isPublic: ts.is_public,
        cidrBlock: ts.cidr ?? undefined,
        availabilityZone: az.name,
        connectedComputeIds: [] as string[],
        vpcId,
      } satisfies SubnetNode
      const computes: ServiceNode[] = []
      for (const w of ts.workloads ?? []) {
        if (isLambdaType(w.type)) continue
        if (placed.has(w.id)) continue
        const existing = computeById.get(w.id) ?? computeById.get(w.name)
        if (existing) {
          computes.push(existing)
          placed.add(existing.id)
        } else if (isCardWorkload(w.type)) {
          computes.push({ id: w.id, name: w.name, shortName: w.name, type: w.type as NodeType })
          placed.add(w.id)
        }
      }
      if (computes.length === 0 && (ts.workloads?.length ?? 0) > 0) continue
      addSubnetRow(archSubnet, computes)
    }
  }
}

/** Edge chip label — spec §2.5: "assumes role" only for real ASSUMES hops;
 *  HAS_INSTANCE_PROFILE / USES_ROLE → "runs as · via <profile>". */
export function edgeLabelForRelationship(
  rel: string,
  instanceProfileName?: string | null,
  excessAction?: string | null,
): string | null {
  const R = (rel || "").toUpperCase()
  if (R === "HAS_INSTANCE_PROFILE" || R === "USES_ROLE") {
    return instanceProfileName
      ? `runs as · via ${instanceProfileName}`
      : "runs as · via instance profile"
  }
  if (R === "ASSUMES_ROLE_ACTUAL" || R === "ASSUMES_ROLE") return "assumes role"
  if (R === "ENCRYPTED_BY") return "encrypts"
  if (R === "REACHES" || R === "ACTUAL_TRAFFIC") return "inbound · public IP"
  if (R === "ACCESSES_RESOURCE" || R === "ACTUAL_S3_ACCESS" || R === "READS_FROM") {
    return excessAction ? `${shortAction(excessAction)} · excess` : "data access"
  }
  if (R === "IN_SUBNET") return "in subnet"
  if (R === "SECURED_BY" || R === "USES_SECURITY_GROUP" || R === "HAS_SECURITY_GROUP") return "secured by"
  if (R === "ASSOCIATED_WITH") return "associated"
  if (R === "HAS_POLICY" || R === "ATTACHED_POLICY") return "attached policy"
  if (R === "ROUTES_VIA" || R === "ROUTES_VIA_INFERRED") return "routes via"
  if (R === "SENDS_TRAFFIC" || R === "ACTUAL_TRAFFIC") return "sends traffic"
  return null
}

function shortAction(a: string): string {
  const m = a.match(/^([a-z0-9-]+):([A-Z][a-z]+)/)
  if (!m) return a
  return `${m[1]}:${m[2]}*`
}

interface Anchor {
  cx: number
  cy: number
  x: number
  y: number
  w: number
  h: number
}

function rightMid(a: Anchor) {
  return { x: a.x + a.w, y: a.y + a.h / 2 }
}
function leftMid(a: Anchor) {
  return { x: a.x, y: a.y + a.h / 2 }
}
function topMid(a: Anchor) {
  return { x: a.x + a.w / 2, y: a.y }
}
function botMid(a: Anchor) {
  return { x: a.x + a.w / 2, y: a.y + a.h }
}
function r(n: number) {
  return Math.round(n * 10) / 10
}
function curveD(a: { x: number; y: number }, b: { x: number; y: number }) {
  const midY = (a.y + b.y) / 2
  return `M${r(a.x)},${r(a.y)} C${r(a.x)},${r(midY)} ${r(b.x)},${r(midY)} ${r(b.x)},${r(b.y)}`
}

function workloadCategory(type: string): Category {
  if (/rds|aurora|dynamodb|database|storage|s3|bucket/i.test(type)) return "storage"
  if (/lambda/i.test(type)) return "compute"
  return "compute"
}
function workloadIcon(type: string): string {
  if (isLambdaType(type)) return "ƒ"
  if (/rds|aurora|database/i.test(type)) return "▤"
  return "▣"
}

function nodeOnPath(id: string, onPath: Set<string>, mode: ContainmentViewMode): boolean {
  if (mode === "full") return true
  return onPath.has(norm(id))
}

function computeOnPath(
  compute: ServiceNode,
  onPathIds: Set<string>,
  pathNodes: IdentityAttackPath["nodes"],
  mode: ContainmentViewMode,
  srcLabel: string,
): boolean {
  if (mode === "full") return true
  if (srcLabel && norm(compute.name) === srcLabel) return true
  if (nodeOnPath(compute.id, onPathIds, mode)) return true
  if (compute.instanceId && nodeOnPath(compute.instanceId, onPathIds, mode)) return true
  for (const n of pathNodes ?? []) {
    if (srcLabel && norm(n.name) === srcLabel && norm(n.name) === norm(compute.name)) return true
    if (n.id === compute.id || n.id === compute.instanceId) return true
    if (compute.instanceId && n.id?.includes(compute.instanceId)) return true
  }
  return false
}

function hasEdge(edges: CMEdge[], id: string): boolean {
  return edges.some((e) => e.id === id)
}

function pushUniqueCard(cards: CMCard[], card: CMCard): void {
  if (cards.some((c) => c.id === card.id)) return
  cards.push(card)
}

function pushPathEdge(edges: CMEdge[], edge: CMEdge): void {
  if (hasEdge(edges, edge.id)) return
  edges.push({ ...edge, layer: "path" })
}

function pushCtxEdge(edges: CMEdge[], edge: CMEdge): void {
  if (hasEdge(edges, edge.id)) return
  edges.push({ ...edge, layer: edge.layer ?? "ctx" })
}

function resolveEndpointId(
  id: string,
  architecture: SystemArchitecture,
  anchors: Record<string, Anchor>,
): string | undefined {
  if (anchors[id]) return id
  const sn = architecture.subnets.find((s) => s.id === id)
  if (sn?.routeTableId) {
    const rtId = routeTableCardId(sn.routeTableId)
    if (anchors[rtId]) return rtId
  }
  return undefined
}

function formatFlowLabel(bytes?: number | null, connections?: number | null): string | undefined {
  const parts: string[] = []
  if (connections != null && connections > 0) parts.push(`${connections} calls`)
  if (bytes != null && bytes > 0) {
    parts.push(bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`)
  }
  return parts.length > 0 ? parts.join(" · ") : undefined
}

function appendTrafficFlowEdges(
  edges: CMEdge[],
  anchors: Record<string, Anchor>,
  architecture: SystemArchitecture,
  onPathNodeIds: Set<string>,
): void {
  for (const f of architecture.flows ?? []) {
    const hops: Array<{ id?: string; label?: string }> = [
      { id: f.sourceId },
      { id: f.sgId, label: "via SG" },
      { id: f.naclId, label: "via NACL" },
      { id: f.instanceProfileId, label: "via profile" },
      { id: f.roleId, label: "via role" },
      { id: f.vpceId ?? f.egressGatewayId, label: f.vpceId ? "via VPCE" : "via gateway" },
      { id: f.targetId },
    ]
    let prev: string | undefined
    for (const hop of hops) {
      if (!hop.id) continue
      if (!anchors[hop.id]) continue
      if (prev && anchors[prev]) {
        const srcA = anchors[prev]
        const tgtA = anchors[hop.id]
        const flowLabel = formatFlowLabel(f.bytes, f.connections)
        const onPath = onPathNodeIds.has(prev) && onPathNodeIds.has(hop.id)
        pushCtxEdge(edges, {
          id: `flow-${prev}-${hop.id}`,
          d: curveD(rightMid(srcA), leftMid(tgtA)),
          style: f.isActive === false ? "priv" : "path",
          color: f.isActive === false ? EDGE_COLOR.priv : EDGE_COLOR.path,
          label: hop.label ?? flowLabel,
          labelX: (srcA.cx + tgtA.cx) / 2,
          labelY: (srcA.cy + tgtA.cy) / 2,
          layer: onPath ? "path" : "ctx",
          sourceId: prev,
          targetId: hop.id,
          observed: f.isActive !== false,
          flowActive: f.isActive !== false && ((f.connections ?? 0) > 0 || (f.bytes ?? 0) > 0),
          hitCount: f.connections ?? null,
          bytes: f.bytes ?? null,
        })
      }
      prev = hop.id
    }
  }
}

/** Always materialize the attack spine — multiple animated hops (not only when zero path edges). */
function ensureAttackPathSpine(
  edges: CMEdge[],
  anchors: Record<string, Anchor>,
  opts: {
    hasInternetEntry: boolean
    igwAnchor?: Anchor
    igwH: number
    igwId?: string
    footholdId?: string
    roleId?: string
    jewelId?: string
    kmsId?: string
    gates: AttackPathReport["gates"]
    profileName: string | null
    excess: string[]
    profileId?: string
  },
): void {
  const { hasInternetEntry, igwAnchor, igwH, gates, profileName, excess } = opts
  const profileAnchor = opts.profileId ? anchors[opts.profileId] : undefined

  if (hasInternetEntry && anchors.user && igwAnchor) {
    const userH = anchors.user.h ?? 28
    pushPathEdge(edges, {
      id: "syn-user-igw",
      d: `M${r(anchors.user.cx)},${r(anchors.user.y + userH)} L${r(igwAnchor.cx)},${r(igwAnchor.y)}`,
      style: "path",
      color: EDGE_COLOR.path,
      label: "inbound · public IP",
      labelX: anchors.user.cx,
      labelY: (anchors.user.y + igwAnchor.y) / 2,
      layer: "path",
      sourceId: "user",
      targetId: opts.igwId,
      observed: gates.network === "OPEN_OBSERVED",
    })
  }
  if (igwAnchor && anchors.foothold) {
    pushPathEdge(edges, {
      id: "syn-igw-foot",
      d: `M${r(igwAnchor.cx)},${r(igwAnchor.y + igwH)} L${r(anchors.foothold.cx)},${r(anchors.foothold.y)}`,
      style: "path",
      color: EDGE_COLOR.path,
      layer: "path",
      sourceId: opts.igwId,
      targetId: opts.footholdId,
      observed: gates.network === "OPEN_OBSERVED",
    })
  }
  if (anchors.foothold && profileAnchor) {
    pushPathEdge(edges, {
      id: "syn-foot-profile",
      d: curveD(rightMid(anchors.foothold), leftMid(profileAnchor)),
      style: "path",
      color: gateEdgeColor(gates.identity),
      label: "via profile",
      labelX: (anchors.foothold.cx + profileAnchor.cx) / 2,
      labelY: (anchors.foothold.cy + profileAnchor.cy) / 2,
      layer: "path",
      sourceId: opts.footholdId,
      targetId: opts.profileId,
    })
  }
  if (profileAnchor && anchors.role) {
    pushPathEdge(edges, {
      id: "syn-profile-role",
      d: curveD(botMid(profileAnchor), topMid(anchors.role)),
      style: "path",
      color: gateEdgeColor(gates.identity),
      label: profileName ? `runs as · ${profileName}` : "runs as · via instance profile",
      labelX: (profileAnchor.cx + anchors.role.cx) / 2,
      labelY: (profileAnchor.cy + anchors.role.cy) / 2,
      layer: "path",
      sourceId: opts.profileId,
      targetId: opts.roleId,
    })
  } else if (anchors.foothold && anchors.role) {
    pushPathEdge(edges, {
      id: "syn-foot-role",
      d: curveD(botMid(anchors.foothold), topMid(anchors.role)),
      style: "path",
      color: gateEdgeColor(gates.identity),
      label: profileName ? `runs as · via ${profileName}` : "runs as · via instance profile",
      labelX: (anchors.foothold.cx + anchors.role.cx) / 2,
      labelY: (anchors.foothold.cy + anchors.role.cy) / 2,
      layer: "path",
      sourceId: opts.footholdId,
      targetId: opts.roleId,
    })
  }
  if (anchors.role && anchors.jewel) {
    pushPathEdge(edges, {
      id: "syn-role-jewel",
      d: `M${r(anchors.role.x + anchors.role.w)},${r(anchors.role.cy)} L${r(anchors.jewel.x)},${r(anchors.jewel.cy)}`,
      style: "path",
      color: gateEdgeColor(gates.data_plane ?? gates.network),
      label: excess[0] ? `${shortAction(excess[0])} · excess` : "data access",
      labelX: (anchors.role.cx + anchors.jewel.cx) / 2,
      labelY: anchors.role.cy - 8,
      layer: "path",
      sourceId: opts.roleId,
      targetId: opts.jewelId,
    })
  }
  if (anchors.jewel && anchors.kms) {
    const kmsAnchor = anchors.kms
    if (kmsAnchor) {
      pushPathEdge(edges, {
        id: "syn-jewel-kms",
        d: `M${r(anchors.jewel.x + anchors.jewel.w)},${r(anchors.jewel.cy)} L${r(kmsAnchor.x)},${r(kmsAnchor.cy)}`,
        style: "enc",
        color: EDGE_COLOR.enc,
        label: "encrypts",
        labelX: (anchors.jewel.cx + kmsAnchor.cx) / 2,
        labelY: anchors.jewel.cy + 12,
        layer: "path",
        sourceId: opts.jewelId,
        targetId: opts.kmsId,
      })
    }
  }
}

function ensurePathSpineFromPathNodes(
  edges: CMEdge[],
  path: IdentityAttackPath,
  anchors: Record<string, Anchor>,
  gates: AttackPathReport["gates"],
): void {
  const nodes = path.nodes ?? []
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i]
    const b = nodes[i + 1]
    const src = anchors[a.id]
    let tgt: Anchor | undefined = anchors[b.id]
    if (!tgt) {
      // Anchors are keyed by node id; look at the KEY (not the value) when
      // resolving a fuzzy id/name match.
      const match = Object.entries(anchors).find(
        ([id]) => norm(id) === norm(b.id) || norm(b.name) === norm(id),
      )
      tgt = match?.[1]
    }
    if (!src || !tgt) continue
    const id = `syn-spine-${a.id}-${b.id}`
    pushPathEdge(edges, {
      id,
      d: curveD(rightMid(src), leftMid(tgt)),
      style: "path",
      color: EDGE_COLOR.path,
      labelX: (src.cx + tgt.cx) / 2,
      labelY: (src.cy + tgt.cy) / 2,
      layer: "path",
      sourceId: a.id,
      targetId: b.id,
    })
  }
}

function resolveRoleDisplayName(
  role: { id?: string; name: string; shortName?: string },
  path: IdentityAttackPath,
): string {
  const fromDamage = path.damage_capability?.role_name?.trim()
  if (fromDamage && !isOpaqueIamId(fromDamage)) return fromDamage
  const raw = role.shortName ?? role.name
  if (!isOpaqueIamId(raw)) return raw
  const matchNode = (path.nodes ?? []).find(
    (n) =>
      n.id === role.id ||
      n.canonical_id === role.id ||
      (role.id && (n.id === role.id || n.canonical_id === role.id)),
  )
  const arn = matchNode?.canonical_id
  if (typeof arn === "string" && arn.startsWith("arn:") && arn.includes(":role/")) {
    const tail = arn.split("/").pop()
    if (tail) return tail
  }
  const fromNode = (path.nodes ?? []).find(
    (n) => /role|iam/i.test(n.type ?? "") && n.name && !isOpaqueIamId(n.name),
  )?.name
  if (fromNode) return fromNode
  return raw
}

function resolveSubnetLabel(sn: SubnetNode, architecture: SystemArchitecture): string {
  const enriched =
    architecture.subnets.find((s) => s.id === sn.id) ??
    architecture.subnets.find((s) => s.shortName === sn.shortName && sn.shortName)
  const source = enriched ?? sn
  const name = source.shortName ?? source.name
  const cidr = source.cidrBlock ?? sn.cidrBlock
  if (source.isPublic === true) return `Public subnet · ${cidr ?? name}`
  if (source.isPublic === false) return `Private subnet · ${cidr ?? name}`
  if (name && name !== "subnet" && !name.startsWith("subnet-")) {
    return cidr ? `${name} · ${cidr}` : name
  }
  return cidr ? `subnet · ${cidr}` : "subnet"
}

function deriveRegion(
  architecture: SystemArchitecture,
  path: IdentityAttackPath,
  fullTopology?: TopologyResponse | null,
): string {
  if (architecture.region) return architecture.region
  for (const sn of architecture.subnets) {
    if (sn.availabilityZone) {
      const m = sn.availabilityZone.match(/^([a-z0-9-]+-\d+)/i)
      if (m) return m[1]
    }
  }
  for (const pn of path.nodes ?? []) {
    const fromArn = (pn.id || "").match(/arn:aws:[^:]+:([a-z0-9-]+-\d):/)
    if (fromArn) return fromArn[1]
    const canonArn = (pn.canonical_id || "").match(/arn:aws:[^:]+:([a-z0-9-]+-\d):/)
    if (canonArn) return canonArn[1]
    const awsRegion = pn.ip_metadata?.aws?.region
    if (awsRegion) return awsRegion
  }
  for (const sn of architecture.subnets) {
    if (sn.availabilityZone) {
      const m = sn.availabilityZone.match(/^([a-z0-9-]+-\d+)/i)
      if (m) return m[1]
    }
  }
  const topoVpc = fullTopology?.vpcs?.[0]
  if (topoVpc && "region" in topoVpc && typeof (topoVpc as { region?: string }).region === "string") {
    return (topoVpc as { region: string }).region
  }
  return "—"
}

function deriveVpcCidr(
  architecture: SystemArchitecture,
  vpcId: string,
  fullTopology?: TopologyResponse | null,
): string | undefined {
  const vpc = architecture.vpcGroups?.find((v) => v.vpcId === vpcId)
  if (vpc?.cidrBlock) return vpc.cidrBlock
  const topoVpc = fullTopology?.vpcs?.find((v) => v.id === vpcId) ?? fullTopology?.vpcs?.[0]
  if (topoVpc?.cidr) return topoVpc.cidr
  const sn = architecture.subnets.find((s) => s.vpcId === vpcId && s.cidrBlock)
  if (sn?.cidrBlock) return sn.cidrBlock
  return undefined
}

function footholdAlreadyPlaced(azMap: Map<string, { subnet: SubnetNode; computes: ServiceNode[] }[]>, foothold: ServiceNode): boolean {
  for (const rows of azMap.values()) {
    for (const row of rows) {
      if (row.computes.some((c) => c.id === foothold.id || norm(c.name) === norm(foothold.name))) return true
    }
  }
  return false
}

function ensureFootholdSubnetRow(
  azMap: Map<string, { subnet: SubnetNode; computes: ServiceNode[] }[]>,
  foothold: ServiceNode,
  architecture: SystemArchitecture,
  path: IdentityAttackPath,
  srcLabel: string,
  addSubnetRow: (sn: SubnetNode, computes: ServiceNode[]) => void,
): void {
  if (footholdAlreadyPlaced(azMap, foothold)) return

  const entryNode = path.nodes?.find((n) => norm(n.name) === srcLabel || n.id === foothold.id)
  const infraSubnet = entryNode?.infra_context?.subnets?.[0]
  let sn =
    architecture.subnets.find((s) => s.connectedComputeIds.includes(foothold.id)) ??
    architecture.subnets.find((s) => infraSubnet && s.id === infraSubnet.id) ??
    architecture.subnets[0]

  if (!sn) {
    sn = {
      id: infraSubnet?.id ?? "subnet-path",
      name: infraSubnet?.name ?? "subnet",
      shortName: infraSubnet?.name ?? "subnet",
      isPublic: entryNode?.subnet_is_public ?? null,
      vpcId: entryNode?.infra_context?.vpcs?.[0]?.id ?? architecture.vpcGroups?.[0]?.vpcId,
      availabilityZone: undefined,
      cidrBlock: undefined,
      connectedComputeIds: [foothold.id],
    }
  }

  addSubnetRow(sn, [foothold])
}

/**
 * Build containment layout from SystemArchitecture (graph-view path-scoped).
 * Returns null when there's no compute foothold to anchor (identity-only paths).
 */
export function buildContainmentFromArchitecture(
  architecture: SystemArchitecture,
  path: IdentityAttackPath,
  report: AttackPathReport,
  mode: ContainmentViewMode = "path",
  fullTopology?: TopologyResponse | null,
): ContainmentModel | null {
  const {
    M,
    CLOUD_PAD,
    REGION_PAD,
    VPC_PAD,
    AZ_GAP,
    AZW,
    AZ_HEADER,
    SUBNET_HEADER,
    CARD_H,
    CARD_GAP,
    SUBNET_PAD,
    REGIONAL_CARD_H,
  } = layoutScale(mode === "path")
  const onPathNodes = architecture.onPathNodeIds ?? new Set<string>()
  const onPathEdges = architecture.onPathEdgeIds ?? new Set<string>()
  const cs = report.current_state
  const srcLabel = norm(cs.source_label)
  const excess = report.remediation_diff?.remove_actions ?? []
  const gates = report.gates ?? {}

  const computeById = new Map(architecture.computeServices.map((c) => [c.id, c]))
  const vpc = architecture.vpcGroups?.[0]
  if (!vpc && architecture.subnets.length === 0) return null

  const vpcId = vpc?.vpcId ?? architecture.subnets[0]?.vpcId ?? "vpc"
  const vpcCidr = deriveVpcCidr(architecture, vpcId, fullTopology)
  const region = deriveRegion(architecture, path, fullTopology)

  // Resolve foothold compute — the path entry workload in the architecture.
  let footholdCompute: ServiceNode | null = null
  for (const c of architecture.computeServices) {
    if (srcLabel && norm(c.name) === srcLabel) {
      footholdCompute = c
      break
    }
  }
  if (!footholdCompute) {
    for (const c of architecture.computeServices) {
      if (onPathNodes.has(c.id) || nodeOnPath(c.id, onPathNodes, "path")) {
        footholdCompute = c
        break
      }
    }
  }
  if (!footholdCompute) return null

  const frames: CMFrame[] = []
  const cards: CMCard[] = []
  const notes: CMNote[] = []
  const edges: CMEdge[] = []
  const anchors: Record<string, Anchor> = {}

  // Subnets grouped by AZ — merge full topology subnets when mode=full.
  type SubnetRow = { subnet: SubnetNode; computes: ServiceNode[] }
  const azMap = new Map<string, SubnetRow[]>()

  const addSubnetRow = (sn: SubnetNode, computes: ServiceNode[]) => {
    const az = sn.availabilityZone || "unknown"
    if (!azMap.has(az)) azMap.set(az, [])
    azMap.get(az)!.push({ subnet: sn, computes })
  }

  if (mode === "full" && fullTopology?.vpcs?.length) {
    const topoVpc = fullTopology.vpcs.find((v) => v.id === vpcId) ?? fullTopology.vpcs[0]
    for (const az of topoVpc.azs ?? []) {
      for (const ts of az.subnets ?? []) {
        const archSubnet = architecture.subnets.find((s) => s.id === ts.id)
        const computes: ServiceNode[] = []
        for (const w of ts.workloads ?? []) {
          const existing = computeById.get(w.id) ?? computeById.get(w.name)
          if (existing) {
            computes.push(existing)
          } else if (isCardWorkload(w.type) || isLambdaType(w.type)) {
            computes.push({ id: w.id, name: w.name, shortName: w.name, type: w.type as NodeType })
          }
        }
        addSubnetRow(
          archSubnet ?? {
            id: ts.id,
            name: ts.name,
            shortName: ts.name,
            isPublic: ts.is_public,
            cidrBlock: ts.cidr ?? undefined,
            availabilityZone: az.name,
            connectedComputeIds: computes.map((c) => c.id),
          },
          computes,
        )
      }
    }
  } else {
    for (const sn of architecture.subnets) {
      let computes = sn.connectedComputeIds
        .map((id) => computeById.get(id))
        .filter((c): c is ServiceNode => !!c)
      const hostsFoothold =
        sn.connectedComputeIds.includes(footholdCompute!.id) ||
        computes.some((c) => c.id === footholdCompute!.id || norm(c.name) === srcLabel)
      if (hostsFoothold && !computes.some((c) => c.id === footholdCompute!.id)) {
        computes.push(footholdCompute!)
      }
      addSubnetRow(sn, computes)
    }
    ensureFootholdSubnetRow(azMap, footholdCompute, architecture, path, srcLabel, addSubnetRow)
  }

  if (mode === "path" && fullTopology?.vpcs?.length) {
    mergeTopologyContextWorkloads(azMap, fullTopology, vpcId, computeById, addSubnetRow)
  }

  const azNames = Array.from(azMap.keys()).sort()
  const nAZ = Math.max(azNames.length, 1)
  const cloudX = M
  const EXTERNAL_RAIL_W = 220
  const maxInnerW = 920 - M * 2 - CLOUD_PAD * 2 - REGION_PAD * 2 - EXTERNAL_RAIL_W - AZ_GAP
  let laneW = AZW
  const neededInner = nAZ * laneW + (nAZ + 1) * AZ_GAP
  if (neededInner > maxInnerW) {
    laneW = Math.max(196, Math.floor((maxInnerW - (nAZ + 1) * AZ_GAP) / nAZ))
  }
  const regionX = cloudX + CLOUD_PAD
  const vpcX = regionX + REGION_PAD
  const vpcInnerW = nAZ * laneW + (nAZ + 1) * AZ_GAP
  const regionW = vpcInnerW + REGION_PAD * 2
  const cloudW = regionW + CLOUD_PAD * 2
  const cloudGraphW = cloudW + EXTERNAL_RAIL_W + AZ_GAP

  const igw = architecture.egressGateways.find((g) => g.kind === "InternetGateway")
  const footholdSubnet = architecture.subnets.find((s) =>
    s.connectedComputeIds.includes(footholdCompute!.id),
  )
  const entryNode = path.nodes?.find((n) => norm(n.name) === srcLabel)
  const explicitIE = entryNode?.is_internet_exposed
  // An InternetGateway only lands in egressGateways when the path's subnet
  // actually ROUTES_VIA it (build-attacker-architecture egress lateral + Rule
  // B), so its presence IS the internet-routability signal. We deliberately do
  // NOT gate on footholdSubnet.isPublic: the collector's public flag is mapped
  // from the wrong field upstream (subnet carries `public`, the mapper reads
  // `isPublic`) and is unreliable. explicitIE === false still suppresses entry
  // when the backend positively knows the foothold isn't internet-exposed.
  void footholdSubnet
  const hasInternetEntry = explicitIE === true || (explicitIE !== false && !!igw)

  let y = M
  if (hasInternetEntry) {
    const uw = 120
    const ux = cloudX + cloudW / 2 - uw / 2
    const userCard = withRenderHeight({
      id: "user",
      x: ux,
      y,
      w: uw,
      cat: "user",
      icon: "◐",
      title: "User / Internet",
      sub: "0.0.0.0/0",
      onPath: true,
      layer: "path",
    })
    cards.push(userCard)
    anchors.user = { x: ux, y, w: uw, h: userCard.h, cx: ux + uw / 2, cy: y + userCard.h / 2 }
    y += userCard.h + 8
  }

  const cloudY = y
  const regionY = cloudY + 28
  let igwH = cmCardRenderHeight({ cat: "network", onPath: true, title: "Internet Gateway" })
  const vpcY = regionY + (igw ? igwH + 10 : 24)
  const azY = vpcY + 40

  // The SG that secures the foothold is folded ONTO the compute card (shown
  // with the service it protects) rather than exiled to the control band, so
  // skip it when placing standalone SG chips.
  const foldSg = architecture.securityGroups[0]
  const foldSgId = foldSg?.id
  const skipSgIds = foldSgId ? new Set([foldSgId]) : undefined

  let maxAzBottom = azY
  azNames.forEach((azName, ai) => {
    const ax = vpcX + AZ_GAP + ai * (laneW + AZ_GAP)
    const rows = azMap.get(azName) ?? []

    placeAzNetworkControls({
      architecture,
      azName,
      ax,
      azY,
      azW: laneW,
      cardH: Math.min(44, CARD_H),
      cards: (c) => pushUniqueCard(cards, c),
      anchors,
      onPathNodeIds: onPathNodes,
      mode,
      skipSgIds,
    })

    let sy = azY + AZ_HEADER
    if (rows.length === 0) {
      notes.push({ id: `az-empty-${ai}`, x: ax + laneW / 2, y: sy + 30, text: "no workloads observed", anchor: "middle" })
      frames.push({
        id: `az-${azName}`,
        x: ax,
        y: azY,
        w: laneW,
        h: 60,
        rx: 10,
        kind: "az",
        label: azName === "unknown" ? "AZ" : `AZ: ${azName}`,
        layer: "ctx",
      })
      maxAzBottom = Math.max(maxAzBottom, azY + 60)
      return
    }
    for (const { subnet: sn, computes } of rows) {
      const visible = computes
      const bodyH =
        visible.length > 0
          ? visible.reduce((sum, c) => {
              const draftIsFoothold = c.id === footholdCompute!.id || norm(c.name) === srcLabel
              const draft: Pick<CMCard, "cat" | "badge" | "onPath" | "title" | "sgName"> = {
                cat: workloadCategory(c.type),
                onPath: computeOnPath(c, onPathNodes, path.nodes, mode, srcLabel),
                title: c.name,
                badge: draftIsFoothold
                  ? "FOOTHOLD"
                  : isLambdaType(c.type)
                    ? "LAMBDA"
                    : undefined,
                sgName: draftIsFoothold && foldSg ? (foldSg.shortName ?? foldSg.name) : undefined,
              }
              return sum + cmCardRenderHeight(draft) + CARD_GAP
            }, CARD_GAP)
          : 28
      const rtExtra = sn.routeTableId ? cmCardRenderHeight({ cat: "network", onPath: false, title: "rtb" }) + CARD_GAP : 0
      const subnetH = SUBNET_HEADER + rtExtra + bodyH
      frames.push({
        id: sn.id,
        x: ax + SUBNET_PAD,
        y: sy,
        w: laneW - SUBNET_PAD * 2,
        h: subnetH,
        rx: 9,
        kind: "subnet",
        label: resolveSubnetLabel(sn, architecture),
        sub: sn.routeTableId ? `rtb · ${sn.routeTableId}` : sn.id,
        layer: "ctx",
      })
      const rtNote = subnetRouteNote(sn, ax + 14, sy)
      if (rtNote) notes.push(rtNote)
      let cardY = sy + SUBNET_HEADER
      const cw = Math.min(laneW - SUBNET_PAD * 2 - 16, 220)
      const cx = ax + SUBNET_PAD + 8
      if (sn.routeTableId) {
        const rtId = routeTableCardId(sn.routeTableId)
        const rtCard = withRenderHeight({
          id: rtId,
          x: cx,
          y: cardY,
          w: cw,
          cat: "network",
          icon: "⇄",
          title: sn.routeTableId,
          sub: "Route table",
          onPath: onPathNodes.has(rtId) || onPathNodes.has(sn.id),
          layer: "ctx",
        })
        pushUniqueCard(cards, rtCard)
        anchors[rtId] = { x: cx, y: cardY, w: cw, h: rtCard.h, cx: cx + cw / 2, cy: cardY + rtCard.h / 2 }
        cardY += rtCard.h + CARD_GAP
      }
      if (visible.length === 0) {
        notes.push({ id: `sn-empty-${sn.id}`, x: ax + laneW / 2, y: sy + SUBNET_HEADER + 24, text: "no workloads observed", anchor: "middle" })
      }
      for (const c of visible) {
        const onPath = computeOnPath(c, onPathNodes, path.nodes, mode, srcLabel)
        const isFoothold = c.id === footholdCompute!.id || norm(c.name) === srcLabel
        const layer: Layer = onPath ? "path" : "ctx"
        const sgName = isFoothold && foldSg ? (foldSg.shortName ?? foldSg.name) : undefined
        const sgPublic = sgName
          ? Boolean(foldSg?.hasPublicIngress) || /public/i.test(foldSg?.name ?? "")
          : undefined
        const cardDraft: Pick<CMCard, "cat" | "badge" | "onPath" | "title" | "sgName"> = {
          cat: workloadCategory(c.type),
          onPath,
          title: c.name,
          badge: isFoothold ? "FOOTHOLD" : isLambdaType(c.type) ? "LAMBDA" : undefined,
          sgName,
        }
        const ch = cmCardRenderHeight(cardDraft)
        cards.push({
          id: c.id,
          x: cx,
          y: cardY,
          w: cw,
          h: ch,
          cat: cardDraft.cat,
          icon: workloadIcon(c.type),
          title: c.name,
          sub: c.instanceId && c.instanceId !== c.name ? c.instanceId : undefined,
          badge: cardDraft.badge,
          onPath,
          layer,
          sgName,
          sgPublic,
        })
        anchors[c.id] = { x: cx, y: cardY, w: cw, h: ch, cx: cx + cw / 2, cy: cardY + ch / 2 }
        if (isFoothold) anchors.foothold = anchors[c.id]
        cardY += ch + CARD_GAP
      }
      sy += subnetH + 10
    }
    frames.push({
      id: `az-${azName}`,
      x: ax,
      y: azY,
      w: laneW,
      h: sy - azY,
      rx: 10,
      kind: "az",
      label: azName === "unknown" ? "AZ" : `AZ: ${azName}`,
      layer: "ctx",
    })
    maxAzBottom = Math.max(maxAzBottom, sy)
  })

  // VPC-level gateways (VPCE at VPC level per spec §2.4 — not inside an AZ).
  let gatewayBottom = maxAzBottom + 8
  const nats = architecture.egressGateways.filter((g) => g.kind === "NATGateway")
  let natMaxH = 0
  nats.forEach((nat, i) => {
    const onPath = onPathNodes.has(nat.id)
    const nw = Math.min(200, vpcInnerW - AZ_GAP * 2)
    const nx = vpcX + AZ_GAP + i * (nw + 12)
    const natCard = withRenderHeight({
      id: nat.id,
      x: nx,
      y: gatewayBottom,
      w: nw,
      cat: "network",
      icon: "⇅",
      title: nat.kindLabel || "NAT Gateway",
      sub: nat.shortName ?? nat.id,
      onPath,
      layer: onPath ? "path" : "ctx",
    })
    cards.push(natCard)
    natMaxH = Math.max(natMaxH, natCard.h)
    anchors[nat.id] = {
      x: nx,
      y: gatewayBottom,
      w: nw,
      h: natCard.h,
      cx: nx + nw / 2,
      cy: gatewayBottom + natCard.h / 2,
    }
  })
  if (nats.length) gatewayBottom += natMaxH + 8

  const vpces = architecture.egressGateways.filter((g) => g.kind === "VPCEndpoint")
  let vpceMaxH = 0
  vpces.forEach((vpce, i) => {
    const onPath = onPathNodes.has(vpce.id)
    const vw = Math.min(220, vpcInnerW - AZ_GAP * 2)
    const vx = vpcX + (i % 2 === 0 ? AZ_GAP : vpcInnerW - vw - AZ_GAP)
    const badge = onPath ? undefined : "UNUSED"
    const vpceCard = withRenderHeight({
      id: vpce.id,
      x: vx,
      y: gatewayBottom,
      w: vw,
      cat: "network",
      icon: "⛒",
      title: vpce.kindLabel || "VPC Endpoint",
      sub: vpce.serviceHint ? `VPCE · ${vpce.serviceHint}` : vpce.id,
      badge,
      onPath,
      layer: onPath ? "path" : "ctx",
    })
    cards.push(vpceCard)
    vpceMaxH = Math.max(vpceMaxH, vpceCard.h)
    anchors[vpce.id] = {
      x: vx,
      y: gatewayBottom,
      w: vw,
      h: vpceCard.h,
      cx: vx + vw / 2,
      cy: gatewayBottom + vpceCard.h / 2,
    }
  })
  if (vpces.length) gatewayBottom += vpceMaxH + 8

  frames.push({
    id: vpcId,
    x: vpcX,
    y: vpcY,
    w: vpcInnerW,
    h: gatewayBottom - vpcY + VPC_PAD,
    rx: 12,
    kind: "vpc",
    label: `VPC · ${vpcId}${vpcCidr ? ` · ${vpcCidr}` : ""}`,
    layer: "frame",
  })

  // Regional band — identity stack (profile → role → policy), crown jewel, KMS.
  const profile = architecture.instanceProfiles?.[0]
  const role = architecture.iamRoles[0]
  const jewel = architecture.resources.find((r) => r.isCrownJewel) ?? architecture.resources[0]
  const kms = architecture.resources.find((r) => /kms|key/i.test(r.type))

  const regionalY = gatewayBottom + VPC_PAD + 30
  const regionalCardsY = regionalY + 16
  notes.push({
    id: "regional-header",
    x: regionX + REGION_PAD,
    y: regionalY + 6,
    text: "REGIONAL & GLOBAL SERVICES (outside the VPC)",
    anchor: "start",
  })

  const identityX = regionX + REGION_PAD
  const identityW = 220
  notes.push({
    id: "identity-header",
    x: identityX,
    y: regionalCardsY - 12,
    text: "IDENTITY & ACCESS",
    anchor: "start",
  })
  const identityStack = placeIdentityStack({
    architecture,
    x: identityX,
    y: regionalCardsY,
    w: identityW,
    mode,
    onPathNodeIds: onPathNodes,
    cards: (c) => {
      const { h: _drop, ...rest } = c
      pushUniqueCard(cards, withRenderHeight(rest))
    },
    anchors,
  })
  if (role && anchors[role.id]) {
    anchors.role = anchors[role.id]
    const roleIdx = cards.findIndex((c) => c.id === role.id)
    if (roleIdx >= 0) {
      cards[roleIdx] = {
        ...cards[roleIdx],
        title: resolveRoleDisplayName(role, path),
      }
    }
  }

  let rxPos = identityX + identityStack.width + 14
  let regionalMaxH = Math.max(identityStack.bottom - regionalCardsY, 0)
  if (jewel) {
    const jw = mode === "path" ? 200 : 240
    const jewelCard = withRenderHeight({
      id: jewel.id,
      x: rxPos,
      y: regionalCardsY,
      w: jw,
      cat: "storage",
      icon: "◈",
      title: cs.target_label || jewel.name,
      sub: jewel.type,
      badge: "CROWN JEWEL",
      onPath: true,
      layer: "path",
    })
    cards.push(jewelCard)
    regionalMaxH = Math.max(regionalMaxH, jewelCard.h)
    anchors[jewel.id] = {
      x: rxPos,
      y: regionalCardsY,
      w: jw,
      h: jewelCard.h,
      cx: rxPos + jw / 2,
      cy: regionalCardsY + jewelCard.h / 2,
    }
    anchors.jewel = anchors[jewel.id]
    rxPos += jw + 36
  }
  if (kms) {
    const kw = 230
    const kmsCard = withRenderHeight({
      id: kms.id,
      x: rxPos,
      y: regionalCardsY,
      w: kw,
      cat: "security",
      icon: "⚷",
      title: kms.shortName ?? kms.name,
      sub: "KMS key",
      badge: "ENCRYPTS",
      onPath: true,
      layer: "path",
    })
    cards.push(kmsCard)
    regionalMaxH = Math.max(regionalMaxH, kmsCard.h)
    anchors[kms.id] = {
      x: rxPos,
      y: regionalCardsY,
      w: kw,
      h: kmsCard.h,
      cx: rxPos + kw / 2,
      cy: regionalCardsY + kmsCard.h / 2,
    }
  }

  const externalRailX = cloudX + cloudW + 24
  placeExternalServicesRail({
    architecture,
    x: externalRailX,
    y: regionalCardsY,
    cardH: REGIONAL_CARD_H,
    cards: (c) => pushUniqueCard(cards, c),
    anchors,
    onPathNodeIds: onPathNodes,
  })
  notes.push({
    id: "external-rail-label",
    x: externalRailX,
    y: regionalY + 6,
    text: "EXTERNAL & GLOBAL SERVICES",
    anchor: "start",
  })

  const regionBottom = regionalCardsY + Math.max(regionalMaxH, REGIONAL_CARD_H) + REGION_PAD
  frames.push({
    id: `region-${region}`,
    x: regionX,
    y: regionY,
    w: regionW,
    h: regionBottom - regionY,
    rx: 12,
    kind: "region",
    label: `Region — ${region}`,
    layer: "frame",
  })
  frames.push({
    id: "aws-cloud",
    x: cloudX,
    y: cloudY,
    w: cloudW,
    h: regionBottom - cloudY + CLOUD_PAD,
    rx: 14,
    kind: "cloud",
    label: "AWS Cloud",
    layer: "frame",
  })

  let igwAnchor: Anchor | undefined
  // Render the real IGW whenever it's a relevant egress on this path (present in
  // egressGateways), not only on internet INGRESS. The path's subnet ROUTES_VIA
  // it and the jewel EXFILTRATES_VIA it, so the gateway is real even when the
  // foothold itself isn't internet-exposed (is_internet_exposed === false).
  if (igw) {
    const iw = 132
    const ix = cloudX + cloudW / 2 - iw / 2
    const iy = regionY + 6
    const igwCard = withRenderHeight({
      id: igw.id,
      x: ix,
      y: iy,
      w: iw,
      cat: "network",
      icon: "⇅",
      title: "Internet Gateway",
      sub: igw.shortName ?? igw.id,
      onPath: true,
      layer: "path",
    })
    igwH = igwCard.h
    pushUniqueCard(cards, igwCard)
    igwAnchor = { x: ix, y: iy, w: iw, h: igwH, cx: ix + iw / 2, cy: iy + igwH / 2 }
    anchors[igw.id] = igwAnchor
  }

  const H = regionBottom + CLOUD_PAD + M
  const profileName = profile?.shortName ?? profile?.name ?? null

  // Neo4j graph edges — lateral movement, identity chain, network attachments.
  for (const e of architecture.edges ?? []) {
    if (mode === "path" && !onPathEdges.has(e.id)) continue
    const srcId = resolveEndpointId(e.source_aws_id, architecture, anchors)
    const tgtId = resolveEndpointId(e.target_aws_id, architecture, anchors)
    if (!srcId || !tgtId) continue
    const src = anchors[srcId]
    const tgt = anchors[tgtId]
    if (!src || !tgt) continue
    const rel = e.relationship || ""
    const label = edgeLabelForRelationship(rel, profileName, excess[0] ?? null)
    const isPriv = !onPathEdges.has(e.id) && mode === "full"
    const onPath = onPathEdges.has(e.id)
    const color = isPriv
      ? EDGE_COLOR.priv
      : rel.toUpperCase().includes("ENCRYPT")
        ? EDGE_COLOR.enc
        : rel.toUpperCase().includes("ASSUME") || rel.toUpperCase().includes("INSTANCE_PROFILE") || rel.toUpperCase().includes("USES_ROLE")
          ? gateEdgeColor(gates.identity)
          : gateEdgeColor(gates.data_plane ?? gates.network)
    pushCtxEdge(edges, {
      id: e.id,
      d: curveD(botMid(src), topMid(tgt)),
      style: isPriv ? "priv" : rel.toUpperCase().includes("ENCRYPT") ? "enc" : "path",
      color,
      label: label ?? undefined,
      labelX: (src.cx + tgt.cx) / 2,
      labelY: (src.cy + tgt.cy) / 2,
      layer: onPath ? "path" : "ctx",
      sourceId: srcId,
      targetId: tgtId,
      observed: e.observed,
      hitCount: e.hit_count,
      bytes: e.bytes,
      flowActive: e.observed === true || (e.hit_count ?? 0) > 0,
    })
  }

  appendTrafficFlowEdges(edges, anchors, architecture, onPathNodes)

  ensureAttackPathSpine(edges, anchors, {
    hasInternetEntry,
    igwAnchor,
    igwH,
    igwId: igw?.id,
    footholdId: footholdCompute?.id,
    roleId: role?.id,
    profileId: profile?.id,
    jewelId: jewel?.id,
    kmsId: kms?.id,
    gates,
    profileName,
    excess,
  })
  ensurePathSpineFromPathNodes(edges, path, anchors, gates)

  const sg0 = architecture.securityGroups[0]
  if (anchors.foothold && sg0 && anchors[sg0.id]) {
    const sgA = anchors[sg0.id]
    const foot = anchors.foothold
    pushCtxEdge(edges, {
      id: "syn-foot-sg",
      d: curveD(rightMid(foot), leftMid(sgA)),
      style: "path",
      color: EDGE_COLOR.path,
      label: "secured by",
      labelX: (foot.cx + sgA.cx) / 2,
      labelY: (foot.cy + sgA.cy) / 2 - 6,
      layer: "ctx",
      sourceId: footholdCompute!.id,
      targetId: sg0.id,
      flowActive: true,
    })
  }
  const nacl0 = architecture.nacls[0]
  if (anchors.foothold && nacl0 && anchors[nacl0.id]) {
    const naclA = anchors[nacl0.id]
    const foot = anchors.foothold
    pushCtxEdge(edges, {
      id: "syn-foot-nacl",
      d: curveD(topMid(naclA), topMid(foot)),
      style: "priv",
      color: EDGE_COLOR.priv,
      label: "via NACL",
      labelX: (naclA.cx + foot.cx) / 2,
      labelY: naclA.y - 6,
      layer: "ctx",
      sourceId: nacl0.id,
      targetId: footholdCompute!.id,
    })
  }

  // Private unused VPCE route (context layer).
  const vpce = vpces[0]
  if (vpce && anchors.foothold && anchors.jewel && anchors[vpce.id] && !onPathEdges.has(vpce.id)) {
    const va = anchors[vpce.id]
    edges.push({
      id: "priv-foot-vpce",
      d: curveD(rightMid(anchors.foothold), topMid(va)),
      style: "priv",
      color: EDGE_COLOR.priv,
      label: "private · unused",
      labelX: (anchors.foothold.cx + va.cx) / 2,
      labelY: va.y - 8,
      layer: "ctx",
    })
  }

  return {
    width: cloudGraphW + M * 2 + 8,
    height: H + 12,
    frames,
    cards,
    notes,
    edges,
    meta: {
      vpcId,
      region,
      hasInternetEntry,
      onPathCount: cards.filter((c) => c.onPath).length,
      lambdaCount: cards.filter((c) => c.badge === "LAMBDA").length,
    },
  }
}
