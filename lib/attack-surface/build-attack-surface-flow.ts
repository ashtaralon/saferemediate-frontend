/**
 * SystemArchitecture → fixed-column React Flow payload for the Attack Surface Map.
 * Ignores force-directed layout; nodes stack vertically within swimlanes.
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
  SURFACE_COLUMNS,
  SURFACE_LAYOUT,
  type SurfaceColumnId,
} from "./column-schema"
import { classifySurfaceEdge } from "./edge-classification"
import type { AttackSurfaceEdgeData } from "@/components/attack-surface/attack-surface-edges"
import type { AttackSurfaceNodeData } from "@/components/attack-surface/attack-surface-nodes"

export interface SurfaceFlowInput {
  architecture: SystemArchitecture
  path: IdentityAttackPath
}

export interface SurfaceFlowResult {
  nodes: Node<AttackSurfaceNodeData | { label: string; columnId?: SurfaceColumnId; isJewelZone?: boolean }>[]
  edges: Edge<AttackSurfaceEdgeData>[]
  width: number
  height: number
  meta: { region?: string; vpcId?: string }
}

interface SurfaceItem {
  id: string
  column: SurfaceColumnId
  title: string
  sub?: string
  typeLabel: string
  cat: string
  isCrownJewel?: boolean
  onPath: boolean
  metric?: string
  badge?: string
  step?: number
}

function isJewelResource(node: ServiceNode): boolean {
  if (node.isCrownJewel) return true
  const t = node.type
  return t === "storage" || t === "database" || t === "dynamodb"
}

function typeLabelForService(node: ServiceNode): string {
  switch (node.type) {
    case "compute":
      return "EC2"
    case "lambda":
      return "LAMBDA"
    case "storage":
      return "S3"
    case "database":
      return "RDS"
    case "dynamodb":
      return "DYNAMODB"
    case "api_gateway":
      return "API GATEWAY"
    case "load_balancer":
      return "LOAD BALANCER"
    case "principal":
      return "PRINCIPAL"
    case "internet":
      return "INTERNET"
    case "api_call":
      return "API CALL"
    default:
      return node.type.toUpperCase().replace(/_/g, " ")
  }
}

function catForService(node: ServiceNode): string {
  if (node.type === "storage" || node.type === "database" || node.type === "dynamodb") return "storage"
  if (node.type === "principal" || node.type === "internet") return "user"
  if (node.type === "api_call") return "security"
  return "compute"
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

function checkpointTypeLabel(cp: SecurityCheckpoint): string {
  if (cp.type === "security_group") return "SECURITY GROUP"
  if (cp.type === "nacl") return "NACL"
  return "IAM ROLE"
}

function checkpointCat(cp: SecurityCheckpoint): string {
  if (cp.type === "iam_role") return "security"
  return "network"
}

function onPath(
  id: string,
  arch: SystemArchitecture,
  path: IdentityAttackPath,
): boolean {
  if (arch.onPathNodeIds?.has(id)) return true
  return (path.nodes ?? []).some((n) => n.id === id)
}

function pushService(
  items: SurfaceItem[],
  seen: Set<string>,
  node: ServiceNode,
  column: SurfaceColumnId,
  arch: SystemArchitecture,
  path: IdentityAttackPath,
  overrides?: Partial<SurfaceItem>,
): void {
  if (seen.has(node.id)) return
  seen.add(node.id)
  const jewel = isJewelResource(node)
  items.push({
    id: node.id,
    column: jewel && column !== "entry_compute" ? "crown_jewels" : column,
    title: node.shortName || node.name,
    sub: node.instanceId ?? node.id,
    typeLabel: jewel ? "👑 CROWN JEWEL" : typeLabelForService(node),
    cat: catForService(node),
    isCrownJewel: jewel,
    onPath: onPath(node.id, arch, path),
    ...overrides,
  })
}

function pushCheckpoint(
  items: SurfaceItem[],
  seen: Set<string>,
  cp: SecurityCheckpoint,
  column: SurfaceColumnId,
  arch: SystemArchitecture,
  path: IdentityAttackPath,
  typeLabel?: string,
): void {
  if (seen.has(cp.id)) return
  seen.add(cp.id)
  const isPolicy = /policy/i.test(cp.name) || typeLabel === "IAM POLICY"
  const metric = metricForCheckpoint(cp)
  const isRole = cp.type === "iam_role"
  items.push({
    id: cp.id,
    column,
    title: cp.shortName || cp.name,
    sub: metric ?? cp.id,
    typeLabel: typeLabel ?? (isPolicy ? "IAM POLICY" : checkpointTypeLabel(cp)),
    cat: checkpointCat(cp),
    onPath: cp.onPath ?? onPath(cp.id, arch, path),
    metric,
    badge:
      cp.onPath === false ? "LATERAL" : isRole && (cp.onPath ?? onPath(cp.id, arch, path)) ? "🔑" : undefined,
  })
}

function pushSubnet(
  items: SurfaceItem[],
  seen: Set<string>,
  subnet: SubnetNode,
  arch: SystemArchitecture,
  path: IdentityAttackPath,
): void {
  if (seen.has(subnet.id)) return
  seen.add(subnet.id)
  items.push({
    id: subnet.id,
    column: "transit",
    title: subnet.shortName || subnet.name,
    sub: subnet.cidrBlock ?? subnet.id,
    typeLabel: subnet.isPublic ? "PUBLIC SUBNET" : "SUBNET",
    cat: "network",
    onPath: onPath(subnet.id, arch, path),
  })

  if (subnet.routeTableId && !seen.has(subnet.routeTableId)) {
    seen.add(subnet.routeTableId)
    items.push({
      id: subnet.routeTableId,
      column: "transit",
      title: subnet.routeTableId,
      sub:
        typeof subnet.routeTableCount === "number"
          ? `${subnet.routeTableCount} routes`
          : subnet.routeTableId,
      typeLabel: "ROUTE TABLE",
      cat: "network",
      onPath: false,
    })
  }
}

function pushGateway(
  items: SurfaceItem[],
  seen: Set<string>,
  gw: EgressGatewayNode | VPCEndpointNode,
  arch: SystemArchitecture,
  path: IdentityAttackPath,
  kindLabel: string,
): void {
  if (seen.has(gw.id)) return
  seen.add(gw.id)
  items.push({
    id: gw.id,
    column: "transit",
    title: gw.shortName || gw.name,
    sub: gw.id,
    typeLabel: kindLabel,
    cat: "network",
    onPath: onPath(gw.id, arch, path),
  })
}

export function assignColumnForLabel(labels: string[]): SurfaceColumnId | null {
  const upper = labels.map((l) => l.toUpperCase())
  if (upper.some((l) => ["COMPUTE", "WORKLOAD", "CONTAINER"].includes(l))) return "entry_compute"
  if (upper.some((l) => ["SECURITYGROUP", "NACL"].includes(l))) return "firewalls"
  if (upper.some((l) => ["ROUTETABLE", "GATEWAY", "VPCENDPOINT"].includes(l))) return "transit"
  if (upper.some((l) => ["IAMUSER", "IAMROLE", "STS", "IAMPOLICY", "INSTANCEPROFILE"].includes(l)))
    return "identity"
  if (upper.some((l) => ["STORAGE", "DATABASE", "SECRETSMANAGER", "SNAPSHOT", "CROWNJEWELS"].includes(l)))
    return "crown_jewels"
  return null
}

function collectItems(arch: SystemArchitecture, path: IdentityAttackPath): SurfaceItem[] {
  const items: SurfaceItem[] = []
  const seen = new Set<string>()

  for (const n of arch.entryPoints ?? []) pushService(items, seen, n, "entry_compute", arch, path)
  for (const n of arch.principals ?? []) pushService(items, seen, n, "entry_compute", arch, path)
  for (const n of arch.computeServices) pushService(items, seen, n, "entry_compute", arch, path)

  for (const sg of arch.securityGroups) pushCheckpoint(items, seen, sg, "firewalls", arch, path)
  for (const nacl of arch.nacls) pushCheckpoint(items, seen, nacl, "firewalls", arch, path)

  for (const subnet of arch.subnets) pushSubnet(items, seen, subnet, arch, path)
  for (const vpce of arch.vpcEndpoints)
    pushGateway(items, seen, vpce, arch, path, `VPCE · ${vpce.serviceShort || "endpoint"}`)
  for (const gw of arch.egressGateways)
    pushGateway(items, seen, gw, arch, path, gw.kindLabel || "GATEWAY")

  for (const role of arch.iamRoles) pushCheckpoint(items, seen, role, "identity", arch, path)
  for (const ip of arch.instanceProfiles ?? [])
    pushCheckpoint(items, seen, ip, "identity", arch, path, "INSTANCE PROFILE")
  for (const pol of arch.iamPolicies ?? [])
    pushCheckpoint(items, seen, pol, "identity", arch, path, "IAM POLICY")

  for (const call of arch.apiCalls ?? []) pushService(items, seen, call, "execution", arch, path)
  for (const gate of arch.exfilGate ?? [])
    pushService(
      items,
      seen,
      { id: gate.id, name: gate.name, shortName: gate.shortName, type: "api_call" },
      "execution",
      arch,
      path,
      { typeLabel: "EXECUTION GATE", cat: "security" },
    )

  for (const res of arch.resources) {
    const jewel = isJewelResource(res)
    pushService(items, seen, res, jewel ? "crown_jewels" : "execution", arch, path, {
      isCrownJewel: jewel,
      typeLabel: jewel ? "👑 CROWN JEWEL" : typeLabelForService(res),
      badge: jewel ? "CJ" : undefined,
    })
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

export function buildAttackSurfaceFlow(input: SurfaceFlowInput): SurfaceFlowResult {
  const { architecture: arch, path } = input
  const items = collectItems(arch, path)
  const itemById = new Map(items.map((i) => [i.id, i]))

  const colCounts = new Map<SurfaceColumnId, number>()
  for (const col of SURFACE_COLUMNS) colCounts.set(col.id, 0)

  const { cardWidth, cardHeight, cardGap, laneWidth, laneHeader, lanePadTop, lanePadBottom, canvasPadX, canvasPadY } =
    SURFACE_LAYOUT

  const nodes: SurfaceFlowResult["nodes"] = []
  const yByColumn = new Map<SurfaceColumnId, number>()

  for (const col of SURFACE_COLUMNS) {
    yByColumn.set(col.id, lanePadTop)
  }

  // Lane backdrops (behind cards)
  let maxColumnHeight = lanePadTop + lanePadBottom
  for (const col of SURFACE_COLUMNS) {
    const colItems = items.filter((i) => i.column === col.id)
    const colHeight =
      colItems.length === 0
        ? lanePadTop + lanePadBottom + 80
        : lanePadTop + colItems.length * (cardHeight + cardGap) - cardGap + lanePadBottom
    maxColumnHeight = Math.max(maxColumnHeight, colHeight)

    nodes.push({
      id: `lane-${col.id}`,
      type: "surfaceLane",
      position: { x: col.x - 20, y: 0 },
      data: { label: col.label, columnId: col.id },
      style: { width: laneWidth, height: colHeight, zIndex: 0 },
      selectable: false,
      draggable: false,
    })
  }

  // Crown jewel aura in column 6
  const jewelItems = items.filter((i) => i.column === "crown_jewels")
  if (jewelItems.length > 0) {
    const col = SURFACE_COLUMNS.find((c) => c.id === "crown_jewels")!
    const jewelHeight =
      lanePadTop + jewelItems.length * (cardHeight + cardGap) - cardGap + lanePadBottom
    nodes.push({
      id: "lane-cj-glow",
      type: "surfaceJewelZone",
      position: { x: col.x - 28, y: laneHeader - 8 },
      data: { label: "Protected data at rest", isJewelZone: true },
      style: { width: laneWidth + 16, height: jewelHeight, zIndex: 1 },
      selectable: false,
      draggable: false,
    })
  }

  for (const item of items) {
    const col = SURFACE_COLUMNS.find((c) => c.id === item.column)!
    const y = yByColumn.get(item.column)!
    yByColumn.set(item.column, y + cardHeight + cardGap)

    nodes.push({
      id: item.id,
      type: "surfaceResource",
      position: { x: col.x, y },
      data: {
        title: item.title,
        sub: item.sub,
        typeLabel: item.typeLabel,
        cat: item.cat,
        onPath: item.onPath,
        isCrownJewel: item.isCrownJewel,
        metric: item.metric,
        badge: item.badge,
        step: item.step,
        copyValue: item.sub ?? item.title,
      },
      style: { width: cardWidth, height: cardHeight, zIndex: 10 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: false,
    })
  }

  const edges: Edge<AttackSurfaceEdgeData>[] = []
  const jewelIds = new Set(items.filter((i) => i.isCrownJewel).map((i) => i.id))

  for (const e of canvasEdgesFromArch(arch)) {
    const src = itemById.get(e.source_aws_id)
    const tgt = itemById.get(e.target_aws_id)
    if (!src || !tgt) continue

    const flowKind = classifySurfaceEdge(e.relationship, {
      targetIsJewel: jewelIds.has(e.target_aws_id),
      observed: e.observed,
    })

    const pairKey = `${e.source_aws_id}->${e.target_aws_id}`
    const onPathEdge =
      arch.onPathEdgeIds?.has(e.id) ||
      arch.pathEdgePairKeys?.has(pairKey) ||
      arch.pathEdgePairKeys?.has(`${e.target_aws_id}->${e.source_aws_id}`) ||
      (src.onPath && tgt.onPath)

    edges.push({
      id: e.id,
      source: e.source_aws_id,
      target: e.target_aws_id,
      type: "surfaceEdge",
      animated: flowKind === "network" || flowKind === "exfil",
      data: {
        flowKind,
        label: e.relationship.replace(/_/g, " "),
        observed: e.observed,
        onPath: Boolean(onPathEdge),
        pulseDelay: (edges.length % 5) * 0.4,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
      },
      zIndex: flowKind === "exfil" ? 30 : flowKind === "identity" ? 20 : 10,
    })
  }

  const rightmost = SURFACE_COLUMNS[SURFACE_COLUMNS.length - 1].x + laneWidth
  const width = rightmost + canvasPadX
  const height = maxColumnHeight + canvasPadY + laneHeader

  const vpcId = arch.vpcGroups?.[0]?.vpcId ?? arch.workloadNetwork?.vpc_id ?? undefined

  return { nodes, edges, width, height, meta: { region: arch.region, vpcId: vpcId ?? undefined } }
}
