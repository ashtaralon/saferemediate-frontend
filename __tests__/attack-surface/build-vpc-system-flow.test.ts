import { describe, expect, it } from "vitest"
import { buildVpcSystemFlow } from "@/lib/attack-surface/build-vpc-system-flow"
import { shapeSystemAttackGraph } from "@/lib/attack-surface/shape-system-attack-graph"
import type { TopologyResponse } from "@/components/attack-paths-v2/containment-model"
import type { CrownJewelSummary, IdentityAttackPath } from "@/components/identity-attack-paths/types"

const mkJewel = (id: string, name: string, type: string): CrownJewelSummary => ({
  id, name, type, severity: "HIGH", path_count: 0, highest_risk_score: 0,
  is_internet_exposed: false, data_classification: null, priority_score: 0,
})

const topology: TopologyResponse = {
  system_name: "demo",
  vpcs: [
    {
      id: "vpc-1",
      name: "prod-vpc",
      cidr: "10.0.0.0/16",
      region: "eu-west-1",
      azs: [
        {
          name: "eu-west-1a",
          subnets: [
            {
              id: "subnet-app",
              name: "app",
              cidr: "10.0.1.0/24",
              is_public: false,
              workloads: [{ id: "i-abc", name: "web", type: "EC2Instance" }],
            },
          ],
        },
      ],
      internet_gateways: [],
      vpc_endpoints: [],
    },
  ],
}

const paths = [
  {
    id: "path-1",
    crown_jewel_id: "arn:aws:s3:::secrets",
    evidence_type: "observed",
    severity: { overall_score: 70, severity: "HIGH" },
    nodes: [{ id: "i-abc", name: "web", type: "EC2Instance" }],
  },
] as IdentityAttackPath[]

describe("buildVpcSystemFlow", () => {
  it("places all footholds and jewels with aggregated edges", () => {
    const graph = shapeSystemAttackGraph(
      "demo",
      [mkJewel("arn:aws:s3:::secrets", "secrets", "S3Bucket")],
      paths,
      topology,
    )
    const flow = buildVpcSystemFlow(topology, graph, null)
    expect(flow).not.toBeNull()
    expect(flow!.nodes.some((n) => n.id === "i-abc")).toBe(true)
    expect(flow!.nodes.some((n) => n.id === "arn:aws:s3:::secrets")).toBe(true)
    expect(flow!.edges.length).toBeGreaterThanOrEqual(1)
  })

  it("dims non-selected nodes when jewel is selected", () => {
    const graph = shapeSystemAttackGraph(
      "demo",
      [mkJewel("arn:aws:s3:::secrets", "secrets", "S3Bucket")],
      paths,
      topology,
    )
    const flow = buildVpcSystemFlow(topology, graph, { kind: "jewel", key: "arn:aws:s3:::secrets" })
    const compute = flow!.nodes.find((n) => n.id === "i-abc")
    expect(compute?.style?.opacity).toBe(1)
  })
})
