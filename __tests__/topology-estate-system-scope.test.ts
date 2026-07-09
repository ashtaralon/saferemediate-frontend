/// <reference types="vitest/globals" />
import { describe, expect, it } from "vitest"

import {
  applySystemEstateScope,
  filterAvailableVpcsForSystemUse,
  filterSubnetsForSystemUse,
  usedVpcIdsForSystem,
} from "@/components/topology-v0-2/estate-system-scope"
import type { SubnetMeta, TopologyNode, VpcTopology } from "@/components/topology-v0-2/types"

const OWN = "vpc-0329e985173bed24f"
const SHARED = "vpc-086bcc2186fa42c96"
const UNUSED_PEER = "vpc-0deadbeef00000001"

function sn(p: Partial<SubnetMeta> & Pick<SubnetMeta, "id" | "vpc_id">): SubnetMeta {
  return {
    name: p.id,
    az: "eu-west-1a",
    cidr: "10.0.0.0/24",
    tier: "web",
    tier_source: "property",
    is_foreign: false,
    owner_system_name: "alon-prod",
    ...p,
  }
}

function nd(p: Partial<TopologyNode> & Pick<TopologyNode, "id">): TopologyNode {
  return {
    name: p.id,
    type: "EC2",
    subnet_id: null,
    score: null,
    stale: null,
    is_jewel: false,
    ...p,
  }
}

describe("usedVpcIdsForSystem", () => {
  it("includes own-tagged subnet VPCs and workload VPCs", () => {
    const nodes = [nd({ id: "i-1", vpc_id: SHARED, subnet_id: "sn-shared" })]
    const subnets = [
      sn({ id: "sn-own", vpc_id: OWN, is_foreign: false }),
      sn({
        id: "sn-shared",
        vpc_id: SHARED,
        is_foreign: true,
        owner_system_name: "payment-production",
      }),
    ]
    const used = usedVpcIdsForSystem(nodes, subnets)
    expect(used.has(OWN)).toBe(true)
    expect(used.has(SHARED)).toBe(true)
  })

  it("does not include unused foreign VPC with no workloads", () => {
    const nodes = [nd({ id: "i-1", vpc_id: OWN, subnet_id: "sn-own" })]
    const subnets = [
      sn({ id: "sn-own", vpc_id: OWN }),
      sn({
        id: "sn-peer",
        vpc_id: UNUSED_PEER,
        is_foreign: true,
        owner_system_name: "other-system",
      }),
    ]
    const used = usedVpcIdsForSystem(nodes, subnets)
    expect(used.has(OWN)).toBe(true)
    expect(used.has(UNUSED_PEER)).toBe(false)
  })
})

describe("filterSubnetsForSystemUse", () => {
  it("keeps foreign subnet only when a system node occupies it", () => {
    const nodes = [nd({ id: "i-1", vpc_id: SHARED, subnet_id: "sn-used" })]
    const subnets = [
      sn({
        id: "sn-used",
        vpc_id: SHARED,
        is_foreign: true,
        owner_system_name: "payment-production",
      }),
      sn({
        id: "sn-unused",
        vpc_id: SHARED,
        az: "eu-west-1c",
        is_foreign: true,
        owner_system_name: "payment-production",
      }),
    ]
    const used = usedVpcIdsForSystem(nodes, subnets)
    const filtered = filterSubnetsForSystemUse(subnets, nodes, used)
    expect(filtered.map(s => s.id)).toEqual(["sn-used"])
  })

  it("drops foreign subnets in a VPC the system does not use", () => {
    const nodes = [nd({ id: "i-1", vpc_id: OWN, subnet_id: "sn-own" })]
    const subnets = [
      sn({ id: "sn-own", vpc_id: OWN }),
      sn({
        id: "sn-peer",
        vpc_id: UNUSED_PEER,
        is_foreign: true,
        owner_system_name: "other-system",
      }),
    ]
    const used = usedVpcIdsForSystem(nodes, subnets)
    const filtered = filterSubnetsForSystemUse(subnets, nodes, used)
    expect(filtered.map(s => s.id)).toEqual(["sn-own"])
  })
})

describe("filterAvailableVpcsForSystemUse", () => {
  it("drops shared VPC with zero workloads and zero tagged subnets", () => {
    const nodes = [nd({ id: "i-1", vpc_id: OWN })]
    const used = new Set([OWN])
    const out = filterAvailableVpcsForSystemUse(
      [
        { vpc_id: OWN, name: "own", workload_count: 3, tagged_subnet_count: 6 },
        {
          vpc_id: UNUSED_PEER,
          name: "peer",
          workload_count: 0,
          tagged_subnet_count: 0,
        },
      ],
      used,
      nodes,
    )
    expect(out.map(v => v.vpc_id)).toEqual([OWN])
  })

  it("keeps shared VPC when system workloads live there", () => {
    const nodes = [nd({ id: "i-1", vpc_id: SHARED })]
    const used = new Set([OWN, SHARED])
    const out = filterAvailableVpcsForSystemUse(
      [
        { vpc_id: OWN, name: "own", workload_count: 3, tagged_subnet_count: 6 },
        {
          vpc_id: SHARED,
          name: "shared",
          workload_count: 8,
          tagged_subnet_count: 0,
        },
      ],
      used,
      nodes,
    )
    expect(out.map(v => v.vpc_id).sort()).toEqual([OWN, SHARED].sort())
  })
})

describe("applySystemEstateScope", () => {
  it("scopes scaffold to used VPCs and drops unused peer IGW/VPCE", () => {
    const nodes = [
      nd({ id: "i-own", vpc_id: OWN, subnet_id: "sn-own" }),
      nd({ id: "i-shared", vpc_id: SHARED, subnet_id: "sn-shared" }),
    ]
    const vpcTopology: VpcTopology = {
      region: "eu-west-1",
      account_id: "745783559495",
      vpc_id: OWN,
      azs: ["eu-west-1a"],
      subnets: [
        sn({ id: "sn-own", vpc_id: OWN }),
        sn({
          id: "sn-shared",
          vpc_id: SHARED,
          is_foreign: true,
          owner_system_name: "payment-production",
        }),
        sn({
          id: "sn-peer-only",
          vpc_id: UNUSED_PEER,
          is_foreign: true,
          owner_system_name: "other-system",
        }),
      ],
      edges: {
        igws: [
          { id: "igw-own", name: "igw-own", vpc_id: OWN },
          { id: "igw-peer", name: "igw-peer", vpc_id: UNUSED_PEER },
        ],
        nat_gws: [],
        vpces: [
          { id: "vpce-1", name: "ssm", vpc_id: OWN },
          { id: "vpce-peer", name: "ssm-peer", vpc_id: UNUSED_PEER },
        ],
      },
      unknown_subnet_count: 0,
      security_groups: [],
      iam_roles: [
        {
          name: "role-a",
          arn: "arn:a",
          workload_ids: ["i-own"],
          attachment_modes: [],
          allowed_actions: 1,
          used_actions: 0,
          gap_percentage: 100,
          correlation_state: "correlated",
        },
        {
          name: "role-orphan",
          arn: "arn:b",
          workload_ids: ["i-not-on-map"],
          attachment_modes: [],
          allowed_actions: 1,
          used_actions: 0,
          gap_percentage: 100,
          correlation_state: "correlated",
        },
      ],
    }
    const result = applySystemEstateScope({
      systemName: "alon-prod",
      nodes,
      vpcTopology,
      trafficEdges: [
        {
          source_id: "i-own",
          target_id: "__igw__",
          kind: "egress",
        },
        {
          source_id: "i-not-on-map",
          target_id: "__igw__",
          kind: "egress",
        },
      ],
      availableVpcs: [
        { vpc_id: OWN, name: "own", workload_count: 1, tagged_subnet_count: 1 },
        {
          vpc_id: SHARED,
          name: "shared",
          workload_count: 1,
          tagged_subnet_count: 0,
        },
        {
          vpc_id: UNUSED_PEER,
          name: "peer",
          workload_count: 0,
          tagged_subnet_count: 0,
        },
      ],
    })
    expect(result.vpcTopology.subnets.map(s => s.id).sort()).toEqual(
      ["sn-own", "sn-shared"].sort(),
    )
    expect(result.vpcTopology.edges.igws.map(i => i.id)).toEqual(["igw-own"])
    expect(result.vpcTopology.edges.vpces.map(v => v.id)).toEqual(["vpce-1"])
    expect(result.vpcTopology.iam_roles.map(r => r.name)).toEqual(["role-a"])
    expect(result.availableVpcs.map(v => v.vpc_id).sort()).toEqual(
      [OWN, SHARED].sort(),
    )
    expect(result.trafficEdges).toHaveLength(1)
    expect(result.trafficEdges[0]!.source_id).toBe("i-own")
  })
})
