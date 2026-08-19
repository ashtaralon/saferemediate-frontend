import { describe, expect, test } from "vitest"
import { normalizeIamRole, normalizeVpcTopology } from "@/components/topology-v0-2/normalize-topology"
import { createMap } from "@/components/topology-v0-2/native-map"
import type { IamRoleRollup, VpcTopology } from "@/components/topology-v0-2/types"

describe("createMap", () => {
  test("works when global Map name is shadowed by a non-constructor", () => {
    const shadow = (() => "icon") as unknown as MapConstructor
    const original = globalThis.Map
    ;(globalThis as { Map: unknown }).Map = shadow
    try {
      const m = createMap([["a", 1] as const])
      expect(m.get("a")).toBe(1)
    } finally {
      ;(globalThis as { Map: MapConstructor }).Map = original
    }
  })
})

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
    expect(normalized.route_tables).toEqual([])
    expect(normalized.effective_routes).toEqual([])
  })

  test("normalizes missing per-subnet effective routes", () => {
    const topo = {
      region: "eu-west-1",
      account_id: "123",
      vpc_id: "vpc-1",
      azs: ["eu-west-1a"],
      subnets: [{
        id: "subnet-1", name: "web", az: "eu-west-1a", cidr: "10.0.0.0/24",
        tier: "web", tier_source: "property", route_table_id: "rtb-1",
      }],
      edges: { igws: [], nat_gws: [], vpces: [] },
      unknown_subnet_count: 0,
    } satisfies VpcTopology

    expect(normalizeVpcTopology(topo).subnets[0]?.effective_routes).toEqual([])
  })

  test("keeps igw rows intact, including vpc_id provenance", () => {
    const topo = {
      region: "eu-west-1",
      account_id: "123",
      vpc_id: "vpc-1",
      azs: [],
      subnets: [],
      edges: {
        igws: [{ id: "igw-1", name: "frame-igw", vpc_id: "vpc-1" }],
        nat_gws: [],
        vpces: [],
      },
      unknown_subnet_count: 0,
    } satisfies VpcTopology

    const normalized = normalizeVpcTopology(topo)
    expect(normalized.edges.igws).toEqual([
      { id: "igw-1", name: "frame-igw", vpc_id: "vpc-1" },
    ])
  })
})
