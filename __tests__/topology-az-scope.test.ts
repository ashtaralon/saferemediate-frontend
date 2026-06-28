import { describe, expect, it } from "vitest"
import { listTopologyAzs, visibleTopologyAzs } from "@/components/topology-v0-2/aws-frame"
import type { SubnetMeta } from "@/components/topology-v0-2/types"

function subnet(partial: Partial<SubnetMeta> & Pick<SubnetMeta, "id">): SubnetMeta {
  return {
    name: partial.id,
    az: "eu-west-1a",
    cidr: "10.0.0.0/24",
    tier: "web",
    tier_source: "property",
    vpc_id: "vpc-1",
    ...partial,
  }
}

describe("visibleTopologyAzs", () => {
  it("drops hidden AZs and expands survivors", () => {
    const all = ["eu-west-1a", "eu-west-1b", "eu-west-1c"]
    expect(visibleTopologyAzs(all, ["eu-west-1b"])).toEqual(["eu-west-1a", "eu-west-1c"])
    expect(visibleTopologyAzs(all, ["eu-west-1a", "eu-west-1c"])).toEqual(["eu-west-1b"])
  })

  it("never hides every column", () => {
    const all = ["eu-west-1a", "eu-west-1b"]
    expect(visibleTopologyAzs(all, ["eu-west-1a", "eu-west-1b"])).toEqual(all)
  })
})

describe("listTopologyAzs", () => {
  it("lists scoped subnet AZs for a VPC", () => {
    const subnets = [
      subnet({ id: "s-a", az: "eu-west-1a", vpc_id: "vpc-1" }),
      subnet({ id: "s-b", az: "eu-west-1b", vpc_id: "vpc-1" }),
      subnet({ id: "s-x", az: "us-east-1a", vpc_id: "vpc-2" }),
    ]
    expect(listTopologyAzs(subnets, "vpc-1")).toEqual(["eu-west-1a", "eu-west-1b"])
  })
})
