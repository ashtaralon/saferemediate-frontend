import { describe, expect, test } from "vitest"
import { normalizeIamRole, normalizeVpcTopology } from "@/components/topology-v0-2/normalize-topology"
import type { IamRoleRollup, VpcTopology } from "@/components/topology-v0-2/types"

describe("normalizeIamRole", () => {
  test("coerces missing attachment_modes before includes()", () => {
    const role = {
      name: "demo-role",
      role_arn: null,
      allowed_actions: 10,
      used_actions: 1,
      unused_actions: 9,
      gap_percentage: 90,
      last_remediated_at: null,
      workload_ids: ["i-abc"],
      attachment_modes: undefined,
    } satisfies IamRoleRollup

    const normalized = normalizeIamRole(role)
    expect(normalized.attachment_modes.includes("direct")).toBe(false)
    expect(normalized.workload_ids.includes("i-abc")).toBe(true)
  })
})

describe("normalizeVpcTopology", () => {
  test("fills missing edges and subnets", () => {
    const partial = {
      region: "eu-west-1",
      account_id: "123",
      vpc_id: "vpc-1",
      azs: [],
      subnets: undefined,
      edges: undefined,
      unknown_subnet_count: 0,
    } as unknown as VpcTopology

    const normalized = normalizeVpcTopology(partial)
    expect(normalized.subnets).toEqual([])
    expect(normalized.edges.igws).toEqual([])
    expect(normalized.edges.nat_gws).toEqual([])
    expect(normalized.edges.vpces).toEqual([])
  })
})
