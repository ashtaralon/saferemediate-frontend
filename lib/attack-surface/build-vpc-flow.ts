/**
 * React Flow nested VPC / subnet groups + asset nodes from live architecture.
 */

import type { Edge, Node } from "reactflow"
import { MarkerType } from "reactflow"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { SystemArchitecture } from "@/components/dependency-map/traffic-flow-map"
import type { CanvasEdge } from "@/lib/types/attack-canvas"
import { buildVpcCanvasModel } from "./build-vpc-canvas-model"
import { classifySurfaceEdge } from "./edge-classification"
import type { AttackSurfaceEdgeData } from "@/components/attack-surface/attack-surface-edges"

export const VPC_CONTAINER_ID = "vpc-container"
export const APP_SUBNET_ID = "private-subnet-container"
export const DATA_SUBNET_ID = "data-subnet-container"

export interface VpcFlowResult {
  nodes: Node[]
  edges: Edge<AttackSurfaceEdgeData>[]
  width: number
  height: number
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

export function buildVpcFlowGraph(
  architecture: SystemArchitecture,
  path: IdentityAttackPath,
): VpcFlowResult | null {
  const model = buildVpcCanvasModel(architecture, path)
  if (!model) return null

  const compute =
    architecture.computeServices.find((c) => c.id === model.appServer?.id) ??
    architecture.computeServices.find((c) => c.shortName === model.appServer?.name) ??
    architecture.computeServices[0]

  const sg =
    architecture.securityGroups.find((s) => s.id === model.securityGroup?.id) ??
    architecture.securityGroups[0]

  const jewel = architecture.resources.find((r) => r.id === model.crownJewel?.arn)

  const nodes: Node[] = []

  // Ingress (root canvas)
  if (model.attacker) {
    nodes.push({
      id: "attacker-external",
      type: "awsAttacker",
      position: { x: 480, y: 20 },
      data: { name: model.attacker.name, detail: model.attacker.detail },
      draggable: false,
    })
  }

  if (model.igw) {
    nodes.push({
      id: model.igw.id,
      type: "awsIgw",
      position: { x: 530, y: 120 },
      data: { name: model.igw.name, id: model.igw.id },
      draggable: false,
    })
  }

  // VPC boundary group (React Flow native group + label overlay)
  nodes.push({
    id: VPC_CONTAINER_ID,
    type: "group",
    position: { x: 50, y: 150 },
    data: { label: model.vpcLabel ? `${model.vpcLabel}` : "VPC BOUNDARY", variant: "vpc" },
    style: {
      width: 1100,
      height: 650,
      backgroundColor: "rgba(46, 125, 50, 0.04)",
      border: "2px solid #2E7D32",
      borderRadius: 4,
      zIndex: 0,
    },
    draggable: false,
    selectable: false,
  })

  const subnetLabel = model.subnet
    ? `Application Subnet (Private) - ${model.subnet.cidr}`
    : "Application Subnet (Private)"

  nodes.push({
    id: APP_SUBNET_ID,
    parentId: VPC_CONTAINER_ID,
    type: "group",
    extent: "parent",
    position: { x: 50, y: 120 },
    data: { label: subnetLabel, variant: "subnet" },
    style: {
      width: 450,
      height: 350,
      backgroundColor: "rgba(227, 242, 253, 0.3)",
      border: "1px dashed #1565C0",
      borderRadius: 4,
      zIndex: 1,
    },
    draggable: false,
    selectable: false,
  })

  if (model.appServer && compute) {
    nodes.push({
      id: compute.id,
      parentId: APP_SUBNET_ID,
      type: "awsComputeNode",
      extent: "parent",
      position: { x: 40, y: 80 },
      data: {
        name: model.appServer.name,
        id: model.appServer.id,
        alert: model.appServer.alert,
      },
      style: { width: 200, height: 80, zIndex: 10 },
      draggable: false,
    })
  }

  if (model.securityGroup && sg) {
    nodes.push({
      id: sg.id,
      parentId: APP_SUBNET_ID,
      type: "awsSecurityGroupOverlay",
      extent: "parent",
      position: { x: 35, y: 75 },
      data: { name: model.securityGroup.name, id: model.securityGroup.id },
      style: { width: 230, height: 90, zIndex: 5 },
      draggable: false,
      selectable: false,
    })
  }

  if (model.routeTable) {
    nodes.push({
      id: `rt-${model.routeTable.name}`,
      parentId: APP_SUBNET_ID,
      type: "awsRouteTable",
      extent: "parent",
      position: { x: 40, y: 200 },
      data: { name: model.routeTable.name, detail: model.routeTable.detail },
      style: { width: 200, height: 50, zIndex: 8 },
      draggable: false,
    })
  }

  if (model.nacl) {
    const nacl = architecture.nacls[0]
    nodes.push({
      id: nacl?.id ?? "nacl-overlay",
      parentId: APP_SUBNET_ID,
      type: "awsNacl",
      extent: "parent",
      position: { x: 280, y: 200 },
      data: { id: model.nacl.id },
      style: { width: 110, height: 50, zIndex: 8 },
      draggable: false,
    })
  }

  // Data subnet + crown jewel placement inside VPC
  nodes.push({
    id: DATA_SUBNET_ID,
    parentId: VPC_CONTAINER_ID,
    type: "group",
    extent: "parent",
    position: { x: 50, y: 490 },
    data: { label: model.dataSubnetLabel, variant: "subnet" },
    style: {
      width: 450,
      height: 140,
      backgroundColor: "rgba(227, 242, 253, 0.25)",
      border: "1px solid #1565C0",
      borderRadius: 4,
      zIndex: 1,
    },
    draggable: false,
    selectable: false,
  })

  if (model.iamRole) {
    const role = architecture.iamRoles[0]
    nodes.push({
      id: role?.id ?? "iam-role-capsule",
      type: "awsIamRole",
      position: { x: 800, y: 280 },
      data: {
        name: model.iamRole.name,
        label: model.iamRole.label,
        alert: model.iamRole.alert,
      },
      style: { width: 260, height: 70, zIndex: 12 },
      draggable: false,
    })
  }

  if (model.crownJewel && jewel) {
    nodes.push({
      id: jewel.id,
      type: "awsCrownJewel",
      position: { x: 920, y: 480 },
      data: { name: model.crownJewel.name, arn: model.crownJewel.arn },
      style: { width: 200, height: 200, zIndex: 15 },
      draggable: false,
    })
  }

  const nodeIds = new Set(nodes.map((n) => n.id))
  const jewelIds = new Set(
    architecture.resources.filter((r) => r.isCrownJewel || r.type === "storage").map((r) => r.id),
  )

  const edges: Edge<AttackSurfaceEdgeData>[] = []

  for (const e of canvasEdgesFromArch(architecture)) {
    if (!nodeIds.has(e.source_aws_id) || !nodeIds.has(e.target_aws_id)) continue
    const flowKind = classifySurfaceEdge(e.relationship, {
      targetIsJewel: jewelIds.has(e.target_aws_id),
      observed: e.observed,
    })
    edges.push({
      id: e.id,
      source: e.source_aws_id,
      target: e.target_aws_id,
      type: "surfaceEdge",
      animated: flowKind === "attack" || flowKind === "exfil" || flowKind === "network",
      data: {
        flowKind,
        label: e.relationship.replace(/_/g, " "),
        observed: e.observed,
        onPath: true,
      },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    })
  }

  if (model.attacker && model.igw) {
    edges.push({
      id: "syn-attacker-igw",
      source: "attacker-external",
      target: model.igw.id,
      type: "surfaceEdge",
      animated: true,
      data: { flowKind: "attack", onPath: true },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      zIndex: 30,
    })
  }

  if (model.igw && compute) {
    edges.push({
      id: "syn-igw-compute",
      source: model.igw.id,
      target: compute.id,
      type: "surfaceEdge",
      animated: true,
      data: { flowKind: "attack", label: model.attackLabels.ingress, onPath: true },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      zIndex: 30,
    })
  }

  const roleId = architecture.iamRoles[0]?.id
  if (roleId && jewel && nodeIds.has(roleId) && nodeIds.has(jewel.id)) {
    edges.push({
      id: "syn-role-jewel",
      source: roleId,
      target: jewel.id,
      type: "surfaceEdge",
      animated: true,
      data: { flowKind: "exfil", label: model.attackLabels.exfil, onPath: true },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      zIndex: 30,
    })
  }

  return { nodes, edges, width: 1200, height: 850 }
}
