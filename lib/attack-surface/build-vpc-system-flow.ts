/**
 * Account-wide VPC React Flow graph — all footholds + crown jewels from topology.
 * Complements per-path buildVpcFlowGraph (single spine).
 */

import type { Edge, Node } from "reactflow"
import { MarkerType, Position } from "reactflow"
import type { TopologyResponse } from "@/components/attack-paths-v2/containment-model"
import type { AttackGraphSelection, SystemAttackGraph } from "./system-attack-graph-types"
import {
  isAggregatedEdgeHot,
  isNodeHot,
  matchWorkload,
} from "./shape-system-attack-graph"
import {
  APP_SUBNET_ID,
  DATA_SUBNET_ID,
  VPC_CONTAINER_ID,
  type VpcFlowResult,
} from "./build-vpc-flow"
import type { AttackSurfaceEdgeData } from "@/components/attack-surface/attack-surface-edges"

const COL_W = 220
const ROW_H = 100
const JEWEL_COL_W = 240

function nodeOpacity(hot: boolean, selection: AttackGraphSelection): number {
  if (!selection) return 1
  return hot ? 1 : 0.22
}

function collectWorkloads(topology: TopologyResponse) {
  const list: Array<{ id: string; name: string; type: string; subnetId: string }> = []
  for (const vpc of topology.vpcs ?? []) {
    for (const az of vpc.azs ?? []) {
      for (const subnet of az.subnets ?? []) {
        for (const w of subnet.workloads ?? []) {
          list.push({
            id: w.id,
            name: w.name,
            type: w.type,
            subnetId: subnet.id,
          })
        }
      }
    }
  }
  return list
}

export function buildVpcSystemFlow(
  topology: TopologyResponse,
  graph: SystemAttackGraph,
  selection: AttackGraphSelection = null,
): VpcFlowResult | null {
  const vpc = topology.vpcs?.[0]
  if (!vpc || graph.footholds.length === 0) return null

  const workloads = collectWorkloads(topology)
  const nodes: Node[] = []
  const edges: Edge<AttackSurfaceEdgeData>[] = []

  const appRows = Math.max(1, Math.ceil(graph.footholds.length / 2))
  const appH = 120 + appRows * ROW_H
  const jewelRows = Math.max(1, graph.jewels.length)
  const dataH = 100 + jewelRows * ROW_H
  const vpcH = Math.max(520, appH + dataH + 80)

  nodes.push({
    id: VPC_CONTAINER_ID,
    type: "group",
    position: { x: 40, y: 60 },
    data: { label: vpc.name || vpc.id, variant: "vpc" },
    style: {
      width: 1100,
      height: vpcH,
      backgroundColor: "rgba(46, 125, 50, 0.04)",
      border: "2px solid #2E7D32",
      borderRadius: 4,
      zIndex: 0,
    },
    draggable: false,
    selectable: false,
  })

  nodes.push({
    id: APP_SUBNET_ID,
    parentId: VPC_CONTAINER_ID,
    type: "group",
    extent: "parent",
    position: { x: 40, y: 70 },
    data: { label: "Application subnets · footholds", variant: "subnet" },
    style: {
      width: 520,
      height: appH,
      backgroundColor: "rgba(227, 242, 253, 0.3)",
      border: "1px dashed #1565C0",
      borderRadius: 4,
      zIndex: 1,
    },
    draggable: false,
    selectable: false,
  })

  nodes.push({
    id: DATA_SUBNET_ID,
    parentId: VPC_CONTAINER_ID,
    type: "group",
    extent: "parent",
    position: { x: 600, y: 70 },
    data: { label: "Data plane · crown jewels", variant: "subnet" },
    style: {
      width: 440,
      height: dataH,
      backgroundColor: "rgba(255, 243, 224, 0.35)",
      border: "1px dashed #E65100",
      borderRadius: 4,
      zIndex: 1,
    },
    draggable: false,
    selectable: false,
  })

  const footNodeIds = new Map<string, string>()

  graph.footholds.forEach((foot, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const workload = matchWorkload(foot, workloads)
    const nodeId = workload?.id ?? `foot-${foot.key}`
    footNodeIds.set(foot.key, nodeId)
    const hot = isNodeHot("foot", foot.key, selection, graph.aggregatedEdges)

    nodes.push({
      id: nodeId,
      parentId: APP_SUBNET_ID,
      type: "awsComputeNode",
      extent: "parent",
      position: { x: 24 + col * COL_W, y: 36 + row * ROW_H },
      data: {
        name: foot.name,
        id: workload?.id ?? foot.type,
        alert: foot.pathCount > 1 ? `${foot.pathCount} paths` : undefined,
      },
      style: {
        width: 200,
        height: 80,
        zIndex: hot ? 12 : 8,
        opacity: nodeOpacity(hot, selection),
      },
      draggable: false,
    })
  })

  graph.jewels.forEach((jewel, i) => {
    const hot = isNodeHot("jewel", jewel.id, selection, graph.aggregatedEdges)
    nodes.push({
      id: jewel.id,
      parentId: DATA_SUBNET_ID,
      type: "awsCrownJewel",
      extent: "parent",
      position: { x: 24, y: 36 + i * ROW_H },
      data: {
        name: jewel.name,
        arn: jewel.id,
      },
      style: {
        width: JEWEL_COL_W,
        height: 76,
        zIndex: hot ? 12 : 8,
        opacity: nodeOpacity(hot, selection),
      },
      draggable: false,
    })
  })

  for (const agg of graph.aggregatedEdges) {
    const src = footNodeIds.get(agg.footKey)
    if (!src) continue
    const hot = isAggregatedEdgeHot(agg, selection)
    edges.push({
      id: `sys-${agg.key}`,
      source: src,
      target: agg.jewelId,
      type: "attackSurfaceEdge",
      data: {
        flowKind: agg.observed ? "exfil" : "attack",
        onPath: hot,
        dimmed: Boolean(selection) && !hot,
        observed: agg.observed,
        label: agg.observed ? "observed" : "configured",
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#D90429" },
      style: { zIndex: hot ? 20 : 5 },
    })
  }

  return {
    nodes,
    edges,
    width: 1180,
    height: vpcH + 120,
  }
}

/** Map React Flow node id → graph selection for click handlers. */
export function selectionFromFlowNode(
  graph: SystemAttackGraph,
  nodeId: string,
): AttackGraphSelection {
  const jewel = graph.byId.jewels.get(nodeId)
  if (jewel) return { kind: "jewel", key: jewel.id }

  for (const foot of graph.footholds) {
    if (foot.workloadIds.includes(nodeId) || `foot-${foot.key}` === nodeId) {
      return { kind: "foot", key: foot.key }
    }
  }
  return null
}

export function selectionFromFlowEdge(edgeId: string): AttackGraphSelection {
  if (!edgeId.startsWith("sys-")) return null
  const key = edgeId.slice(4)
  if (key.includes("||")) return { kind: "edge", key }
  return null
}
