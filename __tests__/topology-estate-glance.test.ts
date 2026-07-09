/// <reference types="vitest/globals" />
/**
 * Glance density planner — service stacks (one icon + siblings behind).
 * No system-specific names; fixtures are arbitrary TopologyNodes.
 */
import { describe, expect, it } from "vitest"

import {
  chipRole,
  chipSizeForRole,
  planGlanceCell,
  planServiceStacks,
  shouldGlanceStackRail,
  shouldShowStackDepth,
  sortForGlance,
} from "@/components/topology-v0-2/estate-glance"
import { awsIconUrl } from "@/components/topology-v0-2/aws-architecture-icons"
import type { TopologyNode } from "@/components/topology-v0-2/types"

function nd(p: Partial<TopologyNode> & Pick<TopologyNode, "id">): TopologyNode {
  return {
    name: p.name ?? p.id,
    type: "EC2",
    subnet_id: null,
    score: null,
    stale: null,
    is_jewel: false,
    ...p,
  }
}

describe("estate-glance chip roles", () => {
  it("classifies ALB as gateway, EC2/RDS as anchor, Lambda as volume", () => {
    expect(chipRole(nd({ id: "1", type: "LoadBalancer" }))).toBe("gateway")
    expect(chipRole(nd({ id: "2", type: "EC2" }))).toBe("anchor")
    expect(chipRole(nd({ id: "3", type: "RDS" }))).toBe("anchor")
    expect(chipRole(nd({ id: "4", type: "Lambda" }))).toBe("volume")
    expect(chipSizeForRole("gateway")).toBe("gateway")
  })
})

describe("planServiceStacks — mutual services collapse", () => {
  it("collapses many Lambdas into one stack with real count", () => {
    const workloads = [
      nd({ id: "l1", type: "Lambda", name: "fn-a" }),
      nd({ id: "l2", type: "Lambda", name: "fn-b" }),
      nd({ id: "l3", type: "Lambda", name: "fn-c" }),
    ]
    const stacks = planServiceStacks(workloads)
    expect(stacks).toHaveLength(1)
    expect(stacks[0]!.type).toBe("Lambda")
    expect(stacks[0]!.nodes).toHaveLength(3)
    expect(shouldShowStackDepth(stacks[0]!)).toBe(true)
  })

  it("collapses many EC2 into one stack (ASG-style mutual compute)", () => {
    const workloads = Array.from({ length: 5 }, (_, i) =>
      nd({ id: `e${i}`, type: "EC2", name: `web-${i}` }),
    )
    const stacks = planServiceStacks(workloads)
    expect(stacks).toHaveLength(1)
    expect(stacks[0]!.nodes).toHaveLength(5)
    expect(stacks[0]!.label).toBe("EC2")
  })

  it("keeps distinct types as separate stacks (ALB + EC2 + RDS)", () => {
    const stacks = planServiceStacks([
      nd({ id: "a", type: "LoadBalancer", name: "alb" }),
      nd({ id: "e", type: "EC2", name: "web" }),
      nd({ id: "r", type: "RDS", name: "db", is_jewel: true }),
    ])
    expect(stacks.map(s => s.type)).toEqual(["LoadBalancer", "RDS", "EC2"])
    expect(stacks.find(s => s.type === "RDS")?.nodes[0]?.is_jewel).toBe(true)
  })

  it("never invents nodes — empty in, empty out", () => {
    expect(planServiceStacks([])).toEqual([])
    expect(planGlanceCell([])).toEqual({ stacks: [] })
  })
})

describe("aws architecture icons", () => {
  it("maps common types to thesvg.org AWS slugs", () => {
    expect(awsIconUrl("Lambda")).toContain("aws-aws-lambda")
    expect(awsIconUrl("EC2")).toContain("aws-amazon-ec2")
    expect(awsIconUrl("LoadBalancer")).toContain("application-load-balancer")
    expect(awsIconUrl("S3")).toContain("simple-storage-service")
    expect(awsIconUrl("IGW")).toContain("internet-gateway")
  })
})

describe("sortForGlance / rail stacking", () => {
  it("orders gateway before anchor before volume", () => {
    const sorted = sortForGlance([
      nd({ id: "l", type: "Lambda" }),
      nd({ id: "e", type: "EC2" }),
      nd({ id: "a", type: "ALB" }),
    ])
    expect(sorted.map(n => n.id)).toEqual(["a", "e", "l"])
  })

  it("stacks rails when more than one real node", () => {
    expect(shouldGlanceStackRail([nd({ id: "1", type: "S3" })])).toBe(false)
    expect(shouldGlanceStackRail([nd({ id: "1", type: "S3" }), nd({ id: "2", type: "S3" })])).toBe(true)
  })
})
