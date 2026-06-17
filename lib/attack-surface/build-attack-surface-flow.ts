/**
 * SystemArchitecture → blueprint-positioned React Flow payload for the Attack Surface Map.
 */

import type { Edge, Node } from "reactflow"
import { MarkerType, Position } from "reactflow"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type {
  SecurityCheckpoint,
  ServiceNode,
  SubnetNode,
  SystemArchitecture,
  VPCEndpointNode,
  EgressGatewayNode,
} from "@/components/dependency-map/traffic-flow-map"
import type { CanvasEdge } from "@/lib/types/attack-canvas"
import {
  blueprintPosition,
  BLUEPRINT_CANVAS,
  nodeDimensions,
  type AwsNodeType,
  type BlueprintSlot,
} from "./blueprint-layout"
import { classifySurfaceEdge } from "./edge-classification"
import type { AttackSurfaceEdgeData } from "@/components/attack-surface/attack-surface-edges"
import type { AttackSurfaceNodeData } from "@/components/attack-surface/attack-surface-nodes"

export const SURFACE_ATTACKER_ID = "__surface_attacker__"

export interface SurfaceFlowInput {
  architecture: SystemArchitecture
  path: IdentityAttackPath
}

export interface SurfaceFlowResult {
  nodes: Node<AttackSurfaceNodeData | { isJewelZone?: boolean }>[]
  edges: Edge<AttackSurfaceEdgeData>[]
  width: number
  height: number
  meta: { region?: string; vpcId?: string }
}

interface SurfaceItem {
  id: string
  layoutSlot: BlueprintSlot
  layoutIndex: number
  awsType: AwsNodeType
  displayType: string
  title: string
  sub?: string
  typeLabel: string
  cat: string
  isCrownJewel?: boolean
  onPath: boolean
  metric?: string
  badge?: string
  alertText?: string
  step?: number
  isEntry?: boolean
  isGateway?: boolean
  isCompute?: boolean
}

function isJewelResource(node: ServiceNode): boolean {
  if (node.isCrownJewel) return true
  const t = node.type
  return t === "storage" || t === "database" || t === "dynamodb"
}

function onPath(id: string, arch: SystemArchitecture, path: IdentityAttackPath): boolean {
  if (arch.onPathNodeIds?.has(id)) return true
  return (path.nodes ?? []).some((n) => n.id === id)
}

function metricForCheckpoint(cp: SecurityCheckpoint): string | undefined {
  const unused = cp.gapCount ?? Math.max(0, cp.totalCount - cp.usedCount)
  if (cp.type === "iam_role" && unused > 0) return `${unused} Unused Permissions`
  if (cp.type === "security_group" && cp.totalCount > 0) {
    const open = cp.totalCount - cp.usedCount
    if (open > 0) return `${open} Unused Rules`
  }
  return undefined
}

function pushItem(items: SurfaceItem[], seen: Set<string>, item: SurfaceItem): void {
  if (seen.has(item.id)) return
  seen.add(item.id)
  items.push(item)
}

function makeItem(
  base: Omit<SurfaceItem, "layoutIndex">,
  slotCounts: Map<BlueprintSlot, number>,
): SurfaceItem {
  const layoutIndex = slotCounts.get(base.layoutSlot) ?? 0
  slotCounts.set(base.layoutSlot, layoutIndex + 1)
  return { ...base, layoutIndex }
}

function addAttacker(
  items: SurfaceItem[],
  seen: Set<string>,
  arch: SystemArchitecture,
  slotCounts: Map<BlueprintSlot, number>,
): string | null {
  const entries = [...(arch.entryPoints ?? []), ...(arch.principals ?? [])]
  if (entries.length === 0) return null

  const primary = entries.find((e) => e.type === "internet" || e.type === "principal") ?? entries[0]
  pushItem(
    items,
    seen,
    makeItem(
      {
        id: SURFACE_ATTACKER_ID,
        layoutSlot: "attacker",
        awsType: "EXTERNAL",
        displayType: "INITIAL ACCESS",
        title: primary.shortName || primary.name || "ATTACKER (External)",
        sub: "Compromised API Credentials / Leaked Keys",
        typeLabel: "ATTACKER",
        cat: "user",
        onPath: true,
        isEntry: true,
      },
      slotCounts,
    ),
  )
  return SURFACE_ATTACKER_ID
}

function collectItems(arch: SystemArchitecture, path: IdentityAttackPath): SurfaceItem[] {
  const items: SurfaceItem[] = []
  const seen = new Set<string>()
  const slotCounts = new Map<BlueprintSlot, number>()

  addAttacker(items, seen, arch, slotCounts)

  const igw = arch.egressGateways.find((g) => g.kind === "InternetGateway")
  if (igw) {
    pushItem(
      items,
      seen,
      makeItem(
        {
          id: igw.id,
          layoutSlot: "igw",
          awsType: "GATEWAY",
          displayType: "INTERNET GATEWAY",
          title: igw.shortName || igw.name,
          sub: igw.id,
          typeLabel: "IGW",
          cat: "network",
          onPath: onPath(igw.id, arch, path),
          isGateway: true,
        },
        slotCounts,
      ),
    )
  }

  for (const n of arch.computeServices) {
    const op = onPath(n.id, arch, path)
    pushItem(
      items,
      seen,
      makeItem(
        {
          id: n.id,
          layoutSlot: "compute",
          awsType: "COMPUTE",
          displayType: "EC2 INSTANCE",
          title: n.shortName || n.name,
          sub: n.instanceId ?? n.id,
          typeLabel: "EC2",
          cat: "compute",
          onPath: op,
          isCompute: true,
        },
        slotCounts,
      ),
    )
  }

  for (const sg of arch.securityGroups) {
    const op = sg.onPath ?? onPath(sg.id, arch, path)
    pushItem(
      items,
      seen,
      makeItem(
        {
          id: sg.id,
          layoutSlot: "security_group",
          awsType: "SECURITY_GROUP",
          displayType: "SECURITY GROUP (SHIELD)",
          title: sg.shortName || sg.name,
          sub: sg.id,
          typeLabel: "SECURITY GROUP",
          cat: "network",
          onPath: op,
          badge: op ? "🛡️" : undefined,
          alertText: sg.hasPublicIngress ? "Public ingress exposure" : undefined,
        },
        slotCounts,
      ),
    )
  }

  for (const nacl of arch.nacls) {
    const op = nacl.onPath ?? onPath(nacl.id, arch, path)
    pushItem(
      items,
      seen,
      makeItem(
        {
          id: nacl.id,
          layoutSlot: "nacl",
          awsType: "NACL",
          displayType: "NETWORK ACL",
          title: nacl.shortName || nacl.name,
          sub: nacl.isDefault ? "Stateless Perimeter Check" : nacl.id,
          typeLabel: "NACL",
          cat: "network",
          onPath: op,
        },
        slotCounts,
      ),
    )
  }

  for (const subnet of arch.subnets) {
    const op = onPath(subnet.id, arch, path)
    pushItem(
      items,
      seen,
      makeItem(
        {
          id: subnet.id,
          layoutSlot: "subnet",
          awsType: "SUBNET",
          displayType: subnet.isPublic ? "PUBLIC SUBNET" : "PRIVATE SUBNET",
          title: subnet.shortName || subnet.name,
          sub: subnet.cidrBlock ?? subnet.id,
          typeLabel: "SUBNET",
          cat: "network",
          onPath: op,
        },
        slotCounts,
      ),
    )

    if (subnet.routeTableId && !seen.has(subnet.routeTableId)) {
      pushItem(
        items,
        seen,
        makeItem(
          {
            id: subnet.routeTableId,
            layoutSlot: "route_table",
            awsType: "ROUTE_TABLE",
            displayType: "ROUTE TABLE (LEDGER)",
            title: subnet.routeTableId,
            sub:
              typeof subnet.routeTableCount === "number"
                ? `Active Data Routes: ${subnet.routeTableCount}`
                : subnet.routeTableId,
            typeLabel: "ROUTE TABLE",
            cat: "network",
            onPath: false,
          },
          slotCounts,
        ),
      )
    }
  }

  for (const vpce of arch.vpcEndpoints) {
    pushItem(
      items,
      seen,
      makeItem(
        {
          id: vpce.id,
          layoutSlot: "subnet",
          awsType: "VPCE",
          displayType: `VPCE · ${vpce.serviceShort || "endpoint"}`,
          title: vpce.shortName || vpce.name,
          sub: vpce.id,
          typeLabel: "VPCE",
          cat: "network",
          onPath: onPath(vpce.id, arch, path),
        },
        slotCounts,
      ),
    )
  }

  for (const gw of arch.egressGateways) {
    if (gw.kind === "InternetGateway") continue
    pushItem(
      items,
      seen,
      makeItem(
        {
          id: gw.id,
          layoutSlot: "igw",
          awsType: "GATEWAY",
          displayType: gw.kindLabel || "GATEWAY",
          title: gw.shortName || gw.name,
          sub: gw.id,
          typeLabel: gw.kindLabel,
          cat: "network",
          onPath: onPath(gw.id, arch, path),
          isGateway: true,
        },
        slotCounts,
      ),
    )
  }

  for (const role of arch.iamRoles) {
    const op = role.onPath ?? onPath(role.id, arch, path)
    const metric = metricForCheckpoint(role)
    pushItem(
      items,
      seen,
      makeItem(
        {
          id: role.id,
          layoutSlot: "iam_role",
          awsType: "IAM_ROLE",
          displayType: "IAM ROLE (CAPSULE)",
          title: role.shortName || role.name,
          sub: role.id,
          typeLabel: "IAM ROLE",
          cat: "security",
          onPath: op,
          metric,
          badge: op ? "🔑" : undefined,
          alertText: metric ? `${metric} Identified` : undefined,
        },
        slotCounts,
      ),
    )
  }

  for (const ip of arch.instanceProfiles ?? []) {
    const op = ip.onPath ?? onPath(ip.id, arch, path)
    pushItem(
      items,
      seen,
      makeItem(
        {
          id: ip.id,
          layoutSlot: "instance_profile",
          awsType: "INSTANCE_PROFILE",
          displayType: "INSTANCE PROFILE",
          title: ip.shortName || ip.name,
          sub: "Linked to Workload Metadata",
          typeLabel: "INSTANCE PROFILE",
          cat: "security",
          onPath: op,
        },
        slotCounts,
      ),
    )
  }

  for (const pol of arch.iamPolicies ?? []) {
    pushItem(
      items,
      seen,
      makeItem(
        {
          id: pol.id,
          layoutSlot: "iam_role",
          awsType: "IAM_POLICY",
          displayType: "IAM POLICY",
          title: pol.shortName || pol.name,
          sub: pol.id,
          typeLabel: "IAM POLICY",
          cat: "security",
          onPath: pol.onPath ?? onPath(pol.id, arch, path),
        },
        slotCounts,
      ),
    )
  }

  for (const call of arch.apiCalls ?? []) {
    pushItem(
      items,
      seen,
      makeItem(
        {
          id: call.id,
          layoutSlot: "execution",
          awsType: "EXECUTION",
          displayType: "API CALL",
          title: call.shortName || call.name,
          sub: call.id,
          typeLabel: "API CALL",
          cat: "security",
          onPath: onPath(call.id, arch, path),
        },
        slotCounts,
      ),
    )
  }

  for (const res of arch.resources) {
    const jewel = isJewelResource(res)
    pushItem(
      items,
      seen,
      makeItem(
        {
          id: res.id,
          layoutSlot: jewel ? "crown_jewel" : "execution",
          awsType: jewel ? "STORAGE" : "EXECUTION",
          displayType: jewel ? "👑 CROWN JEWEL" : res.type.toUpperCase(),
          title: res.shortName || res.name,
          sub: res.id,
          typeLabel: jewel ? "👑 CROWN JEWEL" : res.type,
          cat: jewel ? "storage" : "compute",
          isCrownJewel: jewel,
          onPath: onPath(res.id, arch, path),
        },
        slotCounts,
      ),
    )
  }

  const stepMap = arch.pathStepByNodeId
  if (stepMap) {
    for (const item of items) {
      const step = stepMap.get(item.id)
      if (step != null) item.step = step
    }
  } else {
    let step = 1
    for (const pn of path.nodes ?? []) {
      const item = items.find((i) => i.id === pn.id)
      if (item) item.step = step++
    }
  }

  return items
}

function canvasEdgesFromArch(arch: SystemArchitecture): CanvasEdge[] {
  if (arch.edges?.length) return arch.edges
  return (arch.flows ?? []).map((f, i) => ({
    id: `flow-${i}-${f.sourceId}-${f.targetId}`,
    source_aws_id: f.sourceId,
    target_aws_id: f.targetId,
    relationship: "ACTUAL_TRAFFIC" as const,
    observed: f.isActive ?? null,
    hit_count: f.connections ?? null,
    bytes: f.bytes ?? null,
    first_seen: f.firstSeen ?? null,
    last_seen: f.lastSeen ?? null,
    port: null,
    protocol: f.protocol ?? null,
  }))
}

function synthesizeKillChainEdges(
  items: SurfaceItem[],
  edges: Edge<AttackSurfaceEdgeData>[],
): void {
  const bySlot = (slot: BlueprintSlot) => items.filter((i) => i.layoutSlot === slot)
  const attacker = items.find((i) => i.id === SURFACE_ATTACKER_ID)
  const igw = bySlot("igw")[0]
  const compute = bySlot("compute").find((i) => i.onPath) ?? bySlot("compute")[0]

  if (attacker && igw) {
    edges.push({
      id: "syn-attacker-igw",
      source: attacker.id,
      target: igw.id,
      type: "surfaceEdge",
      animated: true,
      data: { flowKind: "attack", label: "Initial Access Vector", onPath: true },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      zIndex: 40,
    })
  }

  if (igw && compute) {
    edges.push({
      id: "syn-igw-compute",
      source: igw.id,
      target: compute.id,
      type: "surfaceEdge",
      animated: true,
      data: { flowKind: "attack", label: "SSRF → Credential Theft", onPath: true },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      zIndex: 40,
    })
  }
}

export function assignColumnForLabel(labels: string[]): BlueprintSlot | null {
  const upper = labels.map((l) => l.toUpperCase())
  if (upper.some((l) => ["COMPUTE", "WORKLOAD", "CONTAINER"].includes(l))) return "compute"
  if (upper.some((l) => ["SECURITYGROUP"].includes(l))) return "security_group"
  if (upper.some((l) => ["NACL"].includes(l))) return "nacl"
  if (upper.some((l) => ["ROUTETABLE", "GATEWAY", "VPCENDPOINT"].includes(l))) return "route_table"
  if (upper.some((l) => ["IAMUSER", "IAMROLE", "STS", "IAMPOLICY", "INSTANCEPROFILE"].includes(l)))
    return "iam_role"
  if (upper.some((l) => ["STORAGE", "DATABASE", "SECRETSMANAGER", "SNAPSHOT", "CROWNJEWELS"].includes(l)))
    return "crown_jewel"
  return null
}

export function buildAttackSurfaceFlow(input: SurfaceFlowInput): SurfaceFlowResult {
  const { architecture: arch, path } = input
  const items = collectItems(arch, path)
  const itemById = new Map(items.map((i) => [i.id, i]))

  const nodes: SurfaceFlowResult["nodes"] = []
  let maxY = 0

  const jewelItems = items.filter((i) => i.isCrownJewel)
  if (jewelItems.length > 0) {
    const pos = blueprintPosition("crown_jewel", 0)
    const size = nodeDimensions("STORAGE", true)
    nodes.push({
      id: "lane-cj-glow",
      type: "surfaceJewelZone",
      position: { x: pos.x - 12, y: pos.y - 12 },
      data: { isJewelZone: true },
      style: { width: size.width + 24, height: size.height + 24, zIndex: 1 },
      selectable: false,
      draggable: false,
    })
  }

  for (const item of items) {
    const pos = blueprintPosition(item.layoutSlot, item.layoutIndex)
    const dims = nodeDimensions(item.awsType, item.isCrownJewel)
    maxY = Math.max(maxY, pos.y + dims.height)

    nodes.push({
      id: item.id,
      type: "surfaceResource",
      position: pos,
      data: {
        title: item.title,
        sub: item.sub,
        typeLabel: item.typeLabel,
        displayType: item.displayType,
        awsType: item.awsType,
        cat: item.cat,
        onPath: item.onPath,
        isCrownJewel: item.isCrownJewel,
        metric: item.metric,
        badge: item.badge,
        alertText: item.alertText,
        step: item.step,
        copyValue: item.sub ?? item.title,
      },
      style: { width: dims.width, height: dims.height, zIndex: 10 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: false,
    })
  }

  const edges: Edge<AttackSurfaceEdgeData>[] = []
  const jewelIds = new Set(items.filter((i) => i.isCrownJewel).map((i) => i.id))
  const entryIds = new Set(items.filter((i) => i.isEntry || i.isGateway).map((i) => i.id))

  for (const e of canvasEdgesFromArch(arch)) {
    const src = itemById.get(e.source_aws_id)
    const tgt = itemById.get(e.target_aws_id)
    if (!src || !tgt) continue

    const flowKind = classifySurfaceEdge(e.relationship, {
      targetIsJewel: jewelIds.has(e.target_aws_id),
      observed: e.observed,
      sourceIsEntry: entryIds.has(e.source_aws_id) || src.isEntry || src.isGateway,
      targetIsCompute: tgt.isCompute,
    })

    const pairKey = `${e.source_aws_id}->${e.target_aws_id}`
    const onPathEdge =
      arch.onPathEdgeIds?.has(e.id) ||
      arch.pathEdgePairKeys?.has(pairKey) ||
      arch.pathEdgePairKeys?.has(`${e.target_aws_id}->${e.source_aws_id}`) ||
      (src.onPath && tgt.onPath)

    const label = e.relationship.replace(/_/g, " ")
    const exfilLabel =
      flowKind === "exfil" && e.relationship === "ACCESSES_RESOURCE"
        ? "s3:GetObject Siphoning"
        : label

    edges.push({
      id: e.id,
      source: e.source_aws_id,
      target: e.target_aws_id,
      type: "surfaceEdge",
      animated: flowKind === "attack" || flowKind === "exfil" || flowKind === "network",
      data: {
        flowKind,
        label: exfilLabel,
        observed: e.observed,
        onPath: Boolean(onPathEdge),
        pulseDelay: (edges.length % 5) * 0.4,
      },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      zIndex: flowKind === "attack" || flowKind === "exfil" ? 30 : flowKind === "identity" ? 20 : 10,
    })
  }

  synthesizeKillChainEdges(items, edges)

  const vpcId = arch.vpcGroups?.[0]?.vpcId ?? arch.workloadNetwork?.vpc_id ?? undefined

  return {
    nodes,
    edges,
    width: BLUEPRINT_CANVAS.width,
    height: Math.max(BLUEPRINT_CANVAS.height, maxY + BLUEPRINT_CANVAS.padY),
    meta: { region: arch.region, vpcId: vpcId ?? undefined },
  }
}
