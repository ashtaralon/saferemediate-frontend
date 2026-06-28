import { describe, expect, it } from "vitest"
import { extractServerlessOutsideVpc } from "@/components/topology-v0-2/aws-frame"
import type { SubnetMeta, TopologyNode } from "@/components/topology-v0-2/types"

const subnet: SubnetMeta = {
  id: "subnet-a",
  name: "subnet-a",
  az: "eu-west-1a",
  cidr: "10.0.0.0/24",
  tier: "web",
  tier_source: "property",
  vpc_id: "vpc-1",
}

function node(partial: Partial<TopologyNode> & Pick<TopologyNode, "id" | "name">): TopologyNode {
  return {
    type: "Lambda",
    subnet_id: null,
    score: null,
    stale: null,
    is_jewel: false,
    ...partial,
  }
}

describe("extractServerlessOutsideVpc", () => {
  it("keeps vpc-less lambdas and drops placed ec2", () => {
    const source = [
      node({ id: "l1", name: "alon-prod-authenticator" }),
      node({ id: "l2", name: "placed-lambda", subnet_id: "subnet-a" }),
      node({ id: "e1", name: "web", type: "EC2", subnet_id: "subnet-a" }),
    ]
    const out = extractServerlessOutsideVpc(source, [subnet])
    expect(out.map(n => n.name)).toEqual(["alon-prod-authenticator"])
  })
})
