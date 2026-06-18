import { describe, expect, it } from "vitest"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import {
  aggregatePathEdges,
  bandOf,
  isAggregatedEdgeHot,
  shapeSystemAttackGraph,
} from "@/lib/attack-surface/shape-system-attack-graph"
import type { TopologyResponse } from "@/components/attack-paths-v2/containment-model"

const paths: IdentityAttackPath[] = [
  {
    id: "p1",
    crown_jewel_id: "jewel-a",
    evidence_type: "observed",
    severity: { overall_score: 80, severity: "HIGH" },
    nodes: [{ id: "i-1", name: "web-server", type: "EC2Instance" }],
    hop_count: 3,
  } as IdentityAttackPath,
  {
    id: "p2",
    crown_jewel_id: "jewel-a",
    evidence_type: "configured",
    severity: { overall_score: 55, severity: "MEDIUM" },
    nodes: [{ id: "i-2", name: "api-lambda", type: "Lambda" }],
    hop_count: 4,
  } as IdentityAttackPath,
]

const topology: TopologyResponse = {
  system_name: "demo",
  vpcs: [
    {
      id: "vpc-1",
      name: "prod",
      cidr: "10.0.0.0/16",
      region: "eu-west-1",
      azs: [
        {
          name: "eu-west-1a",
          subnets: [
            {
              id: "subnet-1",
              name: "app",
              cidr: "10.0.1.0/24",
              is_public: false,
              workloads: [{ id: "i-1", name: "web-server", type: "EC2Instance" }],
            },
          ],
        },
      ],
      internet_gateways: [],
      vpc_endpoints: [],
    },
  ],
}

describe("shapeSystemAttackGraph", () => {
  it("aggregates footholds and jewels across all paths", () => {
    const graph = shapeSystemAttackGraph("demo", [{ id: "jewel-a", name: "data-bucket", type: "S3Bucket" }], paths, topology)

    expect(graph.footholds).toHaveLength(2)
    expect(graph.jewels).toHaveLength(1)
    expect(graph.jewels[0]?.pathCount).toBe(2)
    expect(graph.footholds.find((f) => f.name === "web-server")?.workloadIds).toEqual(["i-1"])
    expect(graph.aggregatedEdges).toHaveLength(2)
  })

  it("aggregates duplicate foot→jewel pairs", () => {
    const agg = aggregatePathEdges(
      shapeSystemAttackGraph("demo", [], paths, null).pathEdges,
    )
    const pair = agg.find((e) => e.footKey === "web-server" && e.jewelId === "jewel-a")
    expect(pair?.pathIds).toEqual(["p1"])
    const lambdaPair = agg.find((e) => e.footKey === "api-lambda")
    expect(lambdaPair?.observed).toBe(false)
  })

  it("selection hot checks match Explorer semantics", () => {
    const graph = shapeSystemAttackGraph("demo", [{ id: "jewel-a", name: "j", type: "S3Bucket" }], paths, null)
    const edge = graph.aggregatedEdges[0]!
    expect(isAggregatedEdgeHot(edge, { kind: "jewel", key: "jewel-a" })).toBe(true)
    expect(isAggregatedEdgeHot(edge, { kind: "jewel", key: "other" })).toBe(false)
  })

  it("bandOf normalizes severity", () => {
    expect(bandOf("high")).toBe("HIGH")
    expect(bandOf("")).toBe("UNKNOWN")
  })
})
