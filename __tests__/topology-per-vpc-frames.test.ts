import { describe, expect, it } from "vitest"
import {
  buildVpcFrames,
  computeCanvasGrid,
  frameVpcIds,
} from "@/components/topology-v0-2/aws-frame"
import type { SubnetMeta, TopologyNode } from "@/components/topology-v0-2/types"

// Mirrors the live alon-prod merged payload shape (FE #299/#301 follow-up):
// vpc-0329 owns its 10.0.x subnets; alon-prod's workloads ALSO run in vpc-086's
// 172.31.x subnets, which are tagged for the co-tenant `payment-production`
// (is_foreign). The merged Estate Map must render each VPC as its OWN frame,
// never cramming vpc-086's compute into vpc-0329's tiles.
const OWN = "vpc-0329"
const SHARED = "vpc-086"

function subnet(p: Partial<SubnetMeta> & Pick<SubnetMeta, "id">): SubnetMeta {
  return {
    name: p.id,
    az: "eu-west-1a",
    cidr: "10.0.0.0/24",
    tier: "web",
    tier_source: "property",
    vpc_id: OWN,
    ...p,
  }
}

function node(p: Partial<TopologyNode> & Pick<TopologyNode, "id">): TopologyNode {
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

const SUBNETS: SubnetMeta[] = [
  subnet({ id: "sn-web", az: "eu-west-1a", cidr: "10.0.1.0/24", tier: "web", vpc_id: OWN, owner_system_name: "alon-prod", is_foreign: false }),
  subnet({ id: "sn-app", az: "eu-west-1a", cidr: "10.0.10.0/24", tier: "app", vpc_id: OWN, owner_system_name: "alon-prod", is_foreign: false }),
  subnet({ id: "sn-data", az: "eu-west-1a", cidr: "10.0.20.0/24", tier: "data", vpc_id: OWN, owner_system_name: "alon-prod", is_foreign: false }),
  subnet({ id: "sn-086-a", az: "eu-west-1a", cidr: "172.31.16.0/20", tier: "web", vpc_id: SHARED, owner_system_name: "payment-production", is_foreign: true }),
  subnet({ id: "sn-086-b", az: "eu-west-1b", cidr: "172.31.32.0/20", tier: "web", vpc_id: SHARED, owner_system_name: "payment-production", is_foreign: true }),
]

const EC2_OWN = node({ id: "i-own", type: "EC2", vpc_id: OWN, subnet_id: "sn-app" })
const EC2_SHARED = node({ id: "i-086", type: "EC2", vpc_id: SHARED, subnet_id: "sn-086-a" })
const ALB_SHARED = node({ id: "alb-086", type: "LoadBalancer", vpc_id: SHARED, subnet_id: "sn-086-a" })
const NODES = [EC2_OWN, EC2_SHARED, ALB_SHARED]

type Grid = ReturnType<typeof computeCanvasGrid>
function gridNodeIds(grid: Grid): Set<string> {
  const ids = new Set<string>()
  for (const azMap of grid.byAzAndTier.values())
    for (const cell of azMap.values()) for (const n of cell) ids.add(n.id)
  for (const n of grid.albNodes) ids.add(n.id)
  return ids
}

describe("frameVpcIds", () => {
  it("orders primary first, then remaining subnet VPCs, deduped", () => {
    expect(frameVpcIds(SUBNETS, OWN)).toEqual([OWN, SHARED])
  })
  it("falls back to subnet order when no primary is given", () => {
    expect(frameVpcIds(SUBNETS, null)).toEqual([OWN, SHARED])
  })
})

describe("buildVpcFrames — merged view", () => {
  const { frames } = buildVpcFrames(SUBNETS, NODES, OWN, [], [], true)

  it("renders one frame per VPC in the payload (primary first)", () => {
    expect(frames.map(f => f.vid)).toEqual([OWN, SHARED])
  })

  it("flags the co-tenant VPC frame as foreign with its owning system", () => {
    const own = frames.find(f => f.vid === OWN)!
    const shared = frames.find(f => f.vid === SHARED)!
    expect(own.isForeign).toBe(false)
    expect(own.ownerSystem).toBeNull()
    expect(shared.isForeign).toBe(true)
    expect(shared.ownerSystem).toBe("payment-production")
  })

  it("renders the IAM control plane only in the primary frame", () => {
    expect(frames.map(f => f.showIamControlPlane)).toEqual([true, false])
  })

  it("places each VPC's compute in its OWN frame — no cross-VPC cramming", () => {
    const own = gridNodeIds(frames.find(f => f.vid === OWN)!.grid)
    const shared = gridNodeIds(frames.find(f => f.vid === SHARED)!.grid)
    // vpc-0329's EC2 sits in the vpc-0329 frame, never the vpc-086 frame.
    expect(own.has(EC2_OWN.id)).toBe(true)
    expect(shared.has(EC2_OWN.id)).toBe(false)
    // vpc-086's EC2 sits in the vpc-086 frame, never the vpc-0329 frame (the bug).
    expect(shared.has(EC2_SHARED.id)).toBe(true)
    expect(own.has(EC2_SHARED.id)).toBe(false)
  })

  it("routes an ALB to its own VPC frame's header band only", () => {
    const ownAlbs = frames.find(f => f.vid === OWN)!.grid.albNodes.map(n => n.id)
    const sharedAlbs = frames.find(f => f.vid === SHARED)!.grid.albNodes.map(n => n.id)
    expect(ownAlbs).not.toContain(ALB_SHARED.id)
    expect(sharedAlbs).toContain(ALB_SHARED.id)
  })

  it("groups the vpc-086 subnets into their real 172.31.x frame", () => {
    const shared = frames.find(f => f.vid === SHARED)!.grid
    // Both 172.31.x subnets' AZs are columns in the vpc-086 frame.
    expect(shared.azs).toEqual(["eu-west-1a", "eu-west-1b"])
    // The vpc-0329 frame only shows its own single AZ.
    const own = frames.find(f => f.vid === OWN)!.grid
    expect(own.azs).toEqual(["eu-west-1a"])
  })
})

describe("buildVpcFrames — scoped view", () => {
  it("renders only the selected VPC and never leaks a sibling VPC's compute", () => {
    const { frames } = buildVpcFrames(SUBNETS, NODES, OWN, [], [], false)
    expect(frames.map(f => f.vid)).toEqual([OWN])
    const ids = gridNodeIds(frames[0].grid)
    expect(ids.has(EC2_OWN.id)).toBe(true)
    expect(ids.has(EC2_SHARED.id)).toBe(false)
    expect(ids.has(ALB_SHARED.id)).toBe(false)
  })
})

describe("buildVpcFrames — duplicate node hardening", () => {
  it("renders a workload once even when the node list carries an id twice", () => {
    // fullSystemNodes can carry a :Service twin sharing the id — must not
    // double-render the chip (two flow anchors mis-route the overlay).
    const dupNodes = [EC2_OWN, EC2_SHARED, { ...EC2_SHARED }, ALB_SHARED]
    const { frames } = buildVpcFrames(SUBNETS, dupNodes, OWN, [], [], true)
    const shared = frames.find(f => f.vid === SHARED)!.grid
    let count = 0
    for (const azMap of shared.byAzAndTier.values())
      for (const cell of azMap.values())
        for (const n of cell) if (n.id === EC2_SHARED.id) count++
    expect(count).toBe(1)
  })
})

describe("buildVpcFrames — IGW on VPC edge", () => {
  it("attaches IGWs to their owning VPC frame", () => {
    const igws = [
      { id: "igw-own", name: "alon-prod-igw", vpc_id: OWN },
      { id: "igw-shared", name: "shared-igw", vpc_id: SHARED },
    ]
    const { frames } = buildVpcFrames(SUBNETS, NODES, OWN, [], [], true, igws)
    expect(frames.find(f => f.vid === OWN)!.igws.map(i => i.id)).toEqual(["igw-own"])
    expect(frames.find(f => f.vid === SHARED)!.igws.map(i => i.id)).toEqual([
      "igw-shared",
    ])
  })
})

describe("computeCanvasGrid — VPC isolation", () => {
  it("excludes a workload whose VPC differs from the canvas VPC", () => {
    // Defense in depth: even handed a mixed node list, a frame drops foreign VPC nodes.
    const grid = computeCanvasGrid(OWN, SUBNETS, [EC2_OWN, EC2_SHARED], [])
    const ids = gridNodeIds(grid)
    expect(ids.has(EC2_OWN.id)).toBe(true)
    expect(ids.has(EC2_SHARED.id)).toBe(false)
  })
})
