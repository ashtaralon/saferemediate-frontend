import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  buildVpcFrames,
  computeCanvasGrid,
  frameVpcIds,
} from "@/components/topology-v0-2/aws-frame"
import {
  applySystemEstateScope,
  narrowSystemEstateToVpc,
} from "@/components/topology-v0-2/estate-system-scope"
import {
  allWorkloadTypes,
  applyFilters,
  applyFiltersOffCanvas,
  defaultFilters,
} from "@/components/topology-v0-2/filter-rail"
import { normalizeVpcTopology } from "@/components/topology-v0-2/normalize-topology"
import type { SubnetMeta, TopologyNode, VpcTopology } from "@/components/topology-v0-2/types"

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

// The scoped canvas keeps a sibling VPC's ALB out of its grid (above) — correct,
// it is not in this VPC — but it also said NOTHING about it: `outsideUnplaced`
// excludes ingress types, so the device left no trace anywhere on screen. The
// reference names where it really is; it must never become a chip in this VPC.
describe("buildVpcFrames — foreign ingress reference", () => {
  it("reports a sibling VPC's ALB, with the VPC and the system owning it", () => {
    const { frames, foreignIngress } = buildVpcFrames(SUBNETS, NODES, OWN, [], [], false)
    expect(foreignIngress.map(r => r.id)).toEqual([ALB_SHARED.id])
    expect(foreignIngress[0]).toMatchObject({
      name: ALB_SHARED.id,
      type: "LoadBalancer",
      vpcId: SHARED,
      // Every vpc-086 subnet is is_foreign, tagged for the co-tenant.
      ownerSystem: "payment-production",
    })
    // Referenced, never drawn: no chip in the frame on screen.
    expect(gridNodeIds(frames[0].grid).has(ALB_SHARED.id)).toBe(false)
    expect(frames[0].grid.albNodes).toEqual([])
  })

  it("stays empty in merged view, where that VPC has its own frame and ALB band", () => {
    const { frames, foreignIngress } = buildVpcFrames(SUBNETS, NODES, OWN, [], [], true)
    expect(foreignIngress).toEqual([])
    // Not a silent drop — the ALB is drawn, in the frame it belongs to.
    expect(frames.find(f => f.vid === SHARED)!.grid.albNodes.map(n => n.id)).toEqual([
      ALB_SHARED.id,
    ])
  })

  it("claims no owner for a VPC whose subnets this system owns", () => {
    // Same shape, but the sibling VPC is ours: there is no co-tenant to name, so
    // the reference says where the ALB is and stops. Never invent a tenant.
    const ownedSibling = SUBNETS.map(s =>
      s.vpc_id === SHARED ? { ...s, is_foreign: false, owner_system_name: "alon-prod" } : s,
    )
    const { foreignIngress } = buildVpcFrames(ownedSibling, NODES, OWN, [], [], false)
    expect(foreignIngress).toHaveLength(1)
    expect(foreignIngress[0].vpcId).toBe(SHARED)
    expect(foreignIngress[0].ownerSystem).toBeNull()
  })

  it("says the VPC is unrecorded rather than guessing one", () => {
    const albNoVpc = node({ id: "alb-nowhere", type: "LoadBalancer", vpc_id: null, subnet_id: null })
    const { foreignIngress } = buildVpcFrames(SUBNETS, [EC2_OWN, albNoVpc], OWN, [], [], false)
    expect(foreignIngress.map(r => r.id)).toEqual([albNoVpc.id])
    expect(foreignIngress[0].vpcId).toBeNull()
    expect(foreignIngress[0].ownerSystem).toBeNull()
  })

  it("leaves a stale device to the stale bucket instead of reporting it twice", () => {
    // The real payload shape: staleness is an evidence object, not a flag.
    const staleAlb: TopologyNode = {
      ...ALB_SHARED,
      id: "alb-stale",
      stale: { since: "2025-04-02T00:00:00Z", reason: "no_observed_traffic_395d" },
    }
    const { staleNodes, foreignIngress } = buildVpcFrames(
      SUBNETS,
      [EC2_OWN, staleAlb],
      OWN,
      [],
      [],
      false,
    )
    expect(foreignIngress).toEqual([])
    expect(staleNodes.map(n => n.id)).toContain(staleAlb.id)
  })

  it("names every ingress type the band would have drawn, not just ALBs", () => {
    const apiGw = node({ id: "apigw-086", type: "APIGateway", vpc_id: SHARED, subnet_id: "sn-086-a" })
    const { foreignIngress } = buildVpcFrames(SUBNETS, [...NODES, apiGw], OWN, [], [], false)
    expect(foreignIngress.map(r => r.id).sort()).toEqual([ALB_SHARED.id, apiGw.id].sort())
  })
})

// The fixtures above MIRROR the live payload; this reads it, THROUGH THE SCOPE
// PIPELINE THE PAGE USES. Calling buildVpcFrames with the raw payload passes
// whether or not the product works: measured on the running app, the estate view
// narrows the node list to the selected VPC first (46 nodes -> 38), so the
// vpc-086 ALB never reaches buildVpcFrames at all and every assertion that hands
// it the full list is testing a call the page never makes.
describe("scoped Estate Map pipeline — against the captured alon-prod payload", () => {
  const payload = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "docs/mocks/topology-snapshot-alon-prod.json"),
      "utf8",
    ),
  ) as { vpc_topology: VpcTopology; nodes: TopologyNode[] }
  const primary = payload.vpc_topology.vpc_id
  if (!primary) throw new Error("captured payload has no vpc_topology.vpc_id to scope to")
  const nodes = payload.nodes
  // Exactly what estate-map-view builds before it renders AwsFrame.
  const estate = applySystemEstateScope({
    systemName: "alon-prod",
    nodes,
    vpcTopology: normalizeVpcTopology(payload.vpc_topology),
    trafficEdges: [],
    availableVpcs: [],
  })
  const scoped = narrowSystemEstateToVpc(estate, primary)

  it("the payload still carries an ingress device outside the primary VPC", () => {
    // The premise of the assertions below. If a re-capture ever moves the ALB
    // into the primary VPC, this fails loudly instead of leaving them vacuous.
    const ingress = nodes.filter(n => n.type === "LoadBalancer")
    expect(ingress).toHaveLength(1)
    expect(ingress[0].vpc_id).not.toBe(primary)
  })

  it("the narrow really does remove it, so the reference is the only way to see it", () => {
    // The mechanism, asserted rather than assumed: this is why deriving the
    // reference from buildVpcFrames' own `outside` bucket was not enough.
    expect(estate.nodes.some(n => n.type === "LoadBalancer")).toBe(true)
    expect(scoped.nodes.some(n => n.type === "LoadBalancer")).toBe(false)
    expect(scoped.crossVpc?.nodes.map(n => n.name)).toContain("alon-prod-3tier-alb")
    // And the co-tenant's subnets come back with it — without them the owning
    // system cannot be named and the line would say "VPC <id>" and stop.
    expect(scoped.crossVpc?.subnets.length).toBeGreaterThan(0)
  })

  it("scoped: references the ALB's real VPC and its co-tenant, and draws no chip", () => {
    const { frames, foreignIngress } = buildVpcFrames(
      scoped.vpcTopology.subnets,
      scoped.nodes,
      scoped.vpcTopology.vpc_id,
      scoped.vpcTopology.edges.nat_gws,
      [],
      false,
      scoped.vpcTopology.edges.igws,
      undefined,
      scoped.crossVpc,
    )
    expect(frames.map(f => f.vid)).toEqual([primary])
    expect(foreignIngress).toHaveLength(1)
    expect(foreignIngress[0]).toMatchObject({
      name: "alon-prod-3tier-alb",
      type: "LoadBalancer",
      vpcId: "vpc-086bcc2186fa42c96",
      ownerSystem: "payment-production",
    })
    expect(frames[0].grid.albNodes).toEqual([])
    expect(gridNodeIds(frames[0].grid).has(foreignIngress[0].id)).toBe(false)
  })

  // The narrow reports its removals (above), and the view then runs them through
  // the operator's filters before handing them to AwsFrame. That step is where the
  // fix first failed in the browser while every unit test here was green.
  describe("the operator's filters, applied to what is off-canvas", () => {
    // What the rail is handed in single-VPC view: gridSourceNodes (= the narrowed
    // list) unioned with the serverless nodes, which are a subset of it.
    const filters = defaultFilters(null, scoped.nodes)
    const offered = allWorkloadTypes(null, scoped.nodes)
    const removed = scoped.crossVpc?.nodes ?? []
    const isAlb = (n: TopologyNode) => n.name === "alon-prod-3tier-alb"

    it("never offers the removed device's type, so a plain type gate deletes it", () => {
      // The mechanism, measured not assumed: the universe comes from the KEPT
      // nodes, so `LoadBalancer` is absent by construction and `applyFilters`
      // drops the one device the reference exists to name — while passing every
      // other removed node. This is the bug the browser found; assert it so a
      // future refactor back to plain `applyFilters` fails here, not in Playwright.
      expect(offered.has("LoadBalancer")).toBe(false)
      expect(removed.some(isAlb)).toBe(true)
      const naive = applyFilters(removed, filters)
      expect(naive.some(isAlb)).toBe(false)
      expect(naive.length).toBe(removed.length - 1)
    })

    it("keeps it, because a type the rail never showed was never ticked off", () => {
      const kept = applyFiltersOffCanvas(removed, filters, offered)
      expect(kept.some(isAlb)).toBe(true)
      // Untouched filters hide nothing: the whole removal set comes through.
      expect(kept.length).toBe(removed.length)
    })

    it("still honours a type the rail DID show and the operator unticked", () => {
      // A VPC with its own load balancer offers the type, so unticking it is a
      // real decision and must silence the reference too.
      const offeredWithLb = new Set([...offered, "LoadBalancer"])
      const ticked = { ...filters, types: offeredWithLb }
      expect(applyFiltersOffCanvas(removed, ticked, offeredWithLb).some(isAlb)).toBe(true)
      const unticked = {
        ...filters,
        types: new Set([...offeredWithLb].filter(t => t !== "LoadBalancer")),
      }
      expect(applyFiltersOffCanvas(removed, unticked, offeredWithLb).some(isAlb)).toBe(false)
    })

    it("respects severity, whose universe is a fixed list and not derived", () => {
      const noQuiet = { ...filters, tiers: new Set<never>() as typeof filters.tiers }
      expect(applyFiltersOffCanvas(removed, noQuiet, offered)).toEqual([])
    })
  })

  it("merged: the ALB is drawn in its own VPC's band, so nothing is referenced", () => {
    // No narrow, so no removals to report — and the device is on screen instead.
    expect(estate.crossVpc).toBeUndefined()
    const { frames, foreignIngress } = buildVpcFrames(
      estate.vpcTopology.subnets,
      estate.nodes,
      estate.vpcTopology.vpc_id,
      estate.vpcTopology.edges.nat_gws,
      [],
      true,
      estate.vpcTopology.edges.igws,
    )
    expect(foreignIngress).toEqual([])
    const albFrame = frames.find(f => f.vid === "vpc-086bcc2186fa42c96")
    expect(albFrame?.grid.albNodes.map(n => n.name)).toEqual(["alon-prod-3tier-alb"])
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

// The IGW and the VPC endpoints used to render in one region-level column beside
// the VPC card, so nothing ever had to decide WHICH VPC an endpoint belonged to.
// Drawing them on a frame's boundary makes that a per-frame question, and a
// wrong answer labels a sibling VPC's endpoint on this VPC's edge.
describe("buildVpcFrames — VPC endpoints on the owning frame's boundary", () => {
  const VPCES = [
    { id: "vpce-own-s3", service_name: "com.amazonaws.eu-west-1.s3", endpoint_type: "Gateway", vpc_id: OWN },
    { id: "vpce-shared-ssm", service_name: "com.amazonaws.eu-west-1.ssm", endpoint_type: "Interface", vpc_id: SHARED },
  ]

  it("gives each frame only its own endpoints", () => {
    const { frames } = buildVpcFrames(SUBNETS, NODES, OWN, [], [], true, [], undefined, undefined, VPCES)
    expect(frames.find(f => f.vid === OWN)!.vpces.map(v => v.id)).toEqual(["vpce-own-s3"])
    expect(frames.find(f => f.vid === SHARED)!.vpces.map(v => v.id)).toEqual(["vpce-shared-ssm"])
  })

  it("drops a sibling VPC's endpoint from a scoped canvas rather than re-homing it", () => {
    // Scoped to OWN: the SHARED endpoint has a real vpc_id that this view draws
    // no frame for. Falling back to the primary frame would put an SSM endpoint
    // on the wrong VPC's boundary — the exact mislabel narrowSystemEstateToVpc
    // guards against upstream.
    const { frames } = buildVpcFrames(SUBNETS, NODES, OWN, [], [], false, [], undefined, undefined, VPCES)
    expect(frames.map(f => f.vid)).toEqual([OWN])
    expect(frames[0].vpces.map(v => v.id)).toEqual(["vpce-own-s3"])
  })

  it("falls back to the primary frame only when vpc_id is missing entirely", () => {
    // BE deploy lag on the vpc_id stamp: unattributed is not the same as
    // attributed-elsewhere, and matches the existing igw rule.
    const unstamped = [{ id: "vpce-nostamp", service_name: "com.amazonaws.eu-west-1.s3" }]
    const { frames } = buildVpcFrames(SUBNETS, NODES, OWN, [], [], true, [], undefined, undefined, unstamped)
    expect(frames.find(f => f.vid === OWN)!.vpces.map(v => v.id)).toEqual(["vpce-nostamp"])
    expect(frames.find(f => f.vid === SHARED)!.vpces).toEqual([])
  })

  it("is empty when the payload carries no endpoints", () => {
    const { frames } = buildVpcFrames(SUBNETS, NODES, OWN, [], [], true)
    expect(frames.every(f => f.vpces.length === 0)).toBe(true)
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
