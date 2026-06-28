import { describe, expect, it } from "vitest"
import { extractRegionalDataServices } from "@/components/topology-v0-2/aws-frame"
import type { TopologyNode } from "@/components/topology-v0-2/types"

function node(partial: Partial<TopologyNode> & Pick<TopologyNode, "id" | "name">): TopologyNode {
  return {
    type: "S3",
    subnet_id: null,
    score: null,
    stale: null,
    is_jewel: false,
    ...partial,
  }
}

describe("extractRegionalDataServices", () => {
  it("collects S3/KMS/DDB/Secret and drops compute workloads and RDS", () => {
    const source = [
      node({ id: "s1", name: "logs-bucket", type: "S3" }),
      node({ id: "r1", name: "alon-prod-db", type: "RDS" }),
      node({ id: "l1", name: "alon-prod-authenticator", type: "Lambda" }),
      node({ id: "e1", name: "web", type: "EC2", subnet_id: "subnet-a" }),
    ]
    const out = extractRegionalDataServices(source)
    expect(out.map(n => n.name)).toEqual(["logs-bucket"])
  })
})
