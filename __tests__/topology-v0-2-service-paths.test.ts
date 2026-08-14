import { describe, expect, it } from "vitest"
import {
  buildFocusedServicePaths,
  expandRoutedServiceEdges,
} from "@/components/topology-v0-2/service-paths"
import type { TopologyNode, TrafficEdge } from "@/components/topology-v0-2/types"

function node(id: string, type = "EC2"): TopologyNode {
  return {
    id,
    name: id,
    type,
    subnet_id: null,
    score: null,
    stale: null,
    is_jewel: false,
  }
}

function edge(
  sourceId: string,
  targetId: string,
  partial: Partial<TrafficEdge> = {},
): TrafficEdge {
  return {
    source_id: sourceId,
    target_id: targetId,
    port: null,
    protocol: "ACTUAL_TRAFFIC",
    last_seen: "2026-08-14T10:00:00Z",
    edge_class: "internal",
    ...partial,
  }
}

describe("focused service paths", () => {
  it("builds upstream through selected service to downstream dependencies", () => {
    const nodes = [
      node("load-balancer", "LoadBalancer"),
      node("app"),
      node("bucket", "S3"),
    ]
    const paths = buildFocusedServicePaths(
      "app",
      nodes,
      [
        edge("load-balancer", "app"),
        edge("app", "bucket", { edge_class: "edge_service", protocol: "ACTUAL_S3_ACCESS" }),
      ],
    )

    expect(paths).toHaveLength(1)
    expect(paths[0]?.nodeIds).toEqual(["load-balancer", "app", "bucket"])
    expect(paths[0]?.edges.map(item => item.protocol)).toEqual([
      "ACTUAL_TRAFFIC",
      "ACTUAL_S3_ACCESS",
    ])
  })

  it("expands a routed S3 dependency through its VPC endpoint", () => {
    const expanded = expandRoutedServiceEdges([
      edge("app", "bucket", {
        edge_class: "edge_service",
        protocol: "ACTUAL_S3_ACCESS",
        via_vpce_id: "vpce-s3",
        via_vpce_service_name: "com.amazonaws.eu-west-1.s3",
      }),
    ])

    expect(expanded.map(item => `${item.source_id}->${item.target_id}`)).toEqual([
      "app->vpce-s3",
      "vpce-s3->bucket",
    ])
    expect(expanded[0]?.edge_class).toBe("vpce")
    expect(expanded[1]?.edge_class).toBe("edge_service")

    const paths = buildFocusedServicePaths(
      "app",
      [node("app"), node("vpce-s3", "VpcEndpoint"), node("bucket", "S3")],
      expanded,
    )
    expect(paths[0]?.nodeIds).toEqual(["app", "vpce-s3", "bucket"])
  })

  it("does not loop forever when the dependency graph contains a cycle", () => {
    const paths = buildFocusedServicePaths(
      "app",
      [node("app"), node("worker")],
      [edge("app", "worker"), edge("worker", "app")],
    )

    expect(paths.length).toBeGreaterThan(0)
    expect(paths.every(path => new Set(path.nodeIds).size === path.nodeIds.length)).toBe(true)
  })
})

