import { describe, expect, it } from "vitest"
import {
  dedupeLambdaServiceTwins,
  extractServerlessOutsideVpc,
} from "@/components/topology-v0-2/aws-frame"
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

describe("dedupeLambdaServiceTwins", () => {
  it("drops arn-null name-id twins when an arn-keyed node shares the name", () => {
    const source = [
      node({
        id: "arn:aws:lambda:eu-west-1:123:function:BehaviorAnalyzer",
        name: "SafeRemediate-BehaviorAnalyzer",
      }),
      node({ id: "SafeRemediate-BehaviorAnalyzer", name: "SafeRemediate-BehaviorAnalyzer" }),
      node({ id: "standalone-fn", name: "standalone-fn" }),
    ]
    const out = dedupeLambdaServiceTwins(source)
    expect(out.map(n => n.id)).toEqual([
      "arn:aws:lambda:eu-west-1:123:function:BehaviorAnalyzer",
      "standalone-fn",
    ])
  })

  it("collapses many graph duplicates for the same function to one chip", () => {
    const dupes = Array.from({ length: 30 }, (_, i) =>
      node({
        id: `stub-${i}`,
        name: "SafeRemediate-BehaviorAnalyzer",
        score: i === 0 ? { value: 42, tier: "ELEVATED", rank: 1, confidence: { value: 1, tier: "FULL", reasons: [] }, contributors: [] } : null,
      }),
    )
    const canonical = node({
      id: "arn:aws:lambda:eu-west-1:123:function:BehaviorAnalyzer",
      name: "SafeRemediate-BehaviorAnalyzer",
      score: { value: 80, tier: "HIGH", rank: 2, confidence: { value: 1, tier: "FULL", reasons: [] }, contributors: [] },
    })
    const out = dedupeLambdaServiceTwins([...dupes, canonical])
    expect(out.filter(n => n.name === "SafeRemediate-BehaviorAnalyzer")).toHaveLength(1)
    expect(out.find(n => n.name === "SafeRemediate-BehaviorAnalyzer")?.id).toBe(
      "arn:aws:lambda:eu-west-1:123:function:BehaviorAnalyzer",
    )
  })
})
