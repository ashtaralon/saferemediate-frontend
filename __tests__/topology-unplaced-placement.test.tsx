/// <reference types="vitest/globals" />
/**
 * Placement honesty — the map never guesses a cell, and never swallows a node.
 *
 * Guards the two defects recorded in docs/aws-map-presentation.md §7, both
 * measured against the live renderer before this suite existed:
 *
 * 1. **A guessed AZ was drawn as a fact.** `pickSyntheticAz` fell through
 *    "any subnet in this tier" -> "any subnet at all" -> the first AZ in
 *    map-iteration order, so a node with no subnet in the graph landed inside a
 *    specific AZ x tier cell — the map's strongest structural claim — on no
 *    evidence, unmarked.
 * 2. **A node the map could not place vanished.** `computeCanvasGrid` filled,
 *    sorted, and then omitted `unplacedNodes` from its return value, and
 *    `buildVpcFrames` discarded the whole no-VPC population.
 *
 * The first guard here is written as an INVARIANT over every occupied cell
 * rather than as an example, because `pickSyntheticAz` had three fallbacks and
 * an example only pins whichever one happened to fire. Type membership is read
 * from the placement tables' own exports for the same reason the catalog seam
 * guard does it: a hand-typed census goes stale silently.
 */
import React from "react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import {
  AwsFrame,
  buildVpcFrames,
  computeCanvasGrid,
  isOffCanvasByDesign,
  logicalGroupScope,
  workloadSubnetIds,
} from "@/components/topology-v0-2/aws-frame"
import {
  RAIL_PLACED_TYPES,
  SERVERLESS_TYPES,
  SYNTHETIC_TIER_TYPES,
} from "@/components/topology-v0-2/estate-placement"
import {
  withPlacementOverride,
  type PlacementOverrideMap,
} from "@/components/topology-v0-2/placement-overrides"
import type { SubnetMeta, TopologyNode, TrafficEdge, VpcTopology } from "@/components/topology-v0-2/types"

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})
afterEach(() => cleanup())

const VPC = "vpc-0c39cde96f29f8f4e"
const OTHER_VPC = "vpc-0aaaaaaaaaaaaaaaa"
const AZ_A = "eu-west-1a"
const AZ_B = "eu-west-1b"

function sn(p: Partial<SubnetMeta> & Pick<SubnetMeta, "id">): SubnetMeta {
  return {
    name: p.id,
    az: AZ_A,
    cidr: "10.42.0.0/24",
    tier: "web",
    tier_source: "property",
    vpc_id: VPC,
    ...p,
  }
}
function nd(p: Partial<TopologyNode> & Pick<TopologyNode, "id">): TopologyNode {
  return { name: p.id, type: "EC2", subnet_id: null, score: null, stale: null, is_jewel: false, ...p }
}

const SUBNETS: SubnetMeta[] = [
  sn({ id: "subnet-web-a", tier: "web", az: AZ_A }),
  sn({ id: "subnet-app-a", tier: "app", az: AZ_A, cidr: "10.42.10.0/24" }),
  sn({ id: "subnet-data-a", tier: "data", az: AZ_A, cidr: "10.42.20.0/24" }),
  sn({ id: "subnet-web-b", tier: "web", az: AZ_B, cidr: "10.42.1.0/24" }),
  // A subnet the collector got without an AZ: real subnet, no column for it.
  sn({ id: "subnet-no-az", tier: "app", az: null, cidr: "10.42.30.0/24" }),
]

/** Placed by real subnet evidence. Present in every payload so an all-absent
 *  result can never be mistaken for a broken probe. */
const CONTROL = nd({ id: "PROBE-control-placed", type: "EC2", vpc_id: VPC, subnet_id: "subnet-app-a" })

// The four unplaceable shapes, one per reason.
const NO_SUBNET = nd({ id: "PROBE-no-subnet", type: "EC2", vpc_id: VPC, subnet_id: null })
const DANGLING = nd({ id: "PROBE-dangling", type: "EC2", vpc_id: VPC, subnet_id: "subnet-not-in-payload" })
const NO_AZ = nd({ id: "PROBE-subnet-no-az", type: "EC2", vpc_id: VPC, subnet_id: "subnet-no-az" })
const UNKNOWN_TYPE = nd({ id: "PROBE-unknown-type", type: "QuantumLedger", vpc_id: VPC, subnet_id: null })

type Grid = ReturnType<typeof computeCanvasGrid>

function cellNodeIds(grid: Grid): Set<string> {
  const ids = new Set<string>()
  for (const azMap of grid.byAzAndTier.values())
    for (const cell of azMap.values()) for (const n of cell) ids.add(n.id)
  return ids
}
function reasonFor(grid: Grid, nodeId: string): string | undefined {
  return grid.unplacedNodes.find(u => u.node.id === nodeId)?.reason
}

/**
 * The no-fabrication contract, stated once: a node occupies cell (az, tier)
 * only if one of ITS OWN subnets resolves to that az and that tier — or an
 * engineer put it there and the grid says so.
 */
function cellsWithoutEvidence(grid: Grid, subnets: SubnetMeta[]): string[] {
  const byId = new Map(subnets.map(s => [s.id, s]))
  const bad: string[] = []
  for (const [az, azMap] of grid.byAzAndTier) {
    for (const [tier, cell] of azMap) {
      for (const n of cell) {
        if (grid.operatorPlacedIds.has(n.id)) continue
        const backed = workloadSubnetIds(n).some(sid => {
          const s = byId.get(sid)
          if (!s || s.az !== az) return false
          // A classified subnet tier is the row; the backend hint fills only
          // an unknown one (2026-09-11 review).
          const effective = s.tier !== "unknown" ? s.tier : (n.placement_tier ?? s.tier)
          return effective === tier
        })
        if (!backed) bad.push(`${n.id} @ ${az}::${tier}`)
      }
    }
  }
  return bad
}

describe("computeCanvasGrid — a cell is evidence or it is nothing", () => {
  const nodes = [CONTROL, NO_SUBNET, DANGLING, NO_AZ, UNKNOWN_TYPE]
  const grid = computeCanvasGrid(VPC, SUBNETS, nodes, [])

  it("places no node in an AZ x tier cell without a subnet that says so", () => {
    expect(cellsWithoutEvidence(grid, SUBNETS)).toEqual([])
  })

  it("still places the control node, so the invariant above is not vacuous", () => {
    expect(cellNodeIds(grid).has(CONTROL.id)).toBe(true)
    expect(grid.byAzAndTier.get(AZ_A)?.get("app")?.map(n => n.id)).toContain(CONTROL.id)
  })

  it("keeps every unplaceable node out of the grid entirely", () => {
    const placed = cellNodeIds(grid)
    for (const n of [NO_SUBNET, DANGLING, NO_AZ, UNKNOWN_TYPE]) {
      expect(placed.has(n.id)).toBe(false)
    }
  })
})

describe("computeCanvasGrid — the gap is reported, with its reason", () => {
  const nodes = [CONTROL, NO_SUBNET, DANGLING, NO_AZ, UNKNOWN_TYPE]
  const grid = computeCanvasGrid(VPC, SUBNETS, nodes, [])

  it("returns the bucket at all (it used to be filled, sorted and dropped)", () => {
    expect(grid.unplacedNodes.map(u => u.node.id).sort()).toEqual(
      [NO_SUBNET.id, DANGLING.id, NO_AZ.id, UNKNOWN_TYPE.id].sort(),
    )
  })

  it.each([
    [NO_SUBNET.id, "no-subnet-in-graph"],
    [DANGLING.id, "subnet-not-in-graph"],
    [NO_AZ.id, "az-unknown-for-subnet"],
    [UNKNOWN_TYPE.id, "type-unrecognized"],
  ])("%s -> %s", (nodeId, reason) => {
    expect(reasonFor(grid, nodeId)).toBe(reason)
  })

  it("never reports the placed control node as a gap", () => {
    expect(reasonFor(grid, CONTROL.id)).toBeUndefined()
  })

  it("sends a synthetic-tier type with no subnet to the gap, not to its tier", () => {
    // Knowing a Neptune belongs in `data` is not knowing WHICH data subnet.
    // `SYNTHETIC_TIER_TYPES` used to be enough to fabricate an AZ for it.
    const dataTyped = Object.entries(SYNTHETIC_TIER_TYPES).find(([, tier]) => tier === "data")
    expect(dataTyped).toBeDefined()
    const db = nd({ id: "PROBE-db-no-subnet", type: dataTyped![0], vpc_id: VPC, subnet_id: null })
    const g = computeCanvasGrid(VPC, SUBNETS, [CONTROL, db], [])
    expect(cellNodeIds(g).has(db.id)).toBe(false)
    expect(reasonFor(g, db.id)).toBe("no-subnet-in-graph")
  })

  it("sends a backend placement_tier with no subnet to the gap, not to that tier", () => {
    const tiered = nd({ id: "PROBE-tier-no-subnet", type: "EC2", vpc_id: VPC, subnet_id: null, placement_tier: "app" })
    const g = computeCanvasGrid(VPC, SUBNETS, [CONTROL, tiered], [])
    expect(cellNodeIds(g).has(tiered.id)).toBe(false)
    expect(reasonFor(g, tiered.id)).toBe("no-subnet-in-graph")
  })

  it("routes a stale unplaceable node to the stale bucket, never to both", () => {
    const staleNode = nd({
      id: "PROBE-stale",
      type: "EC2",
      vpc_id: VPC,
      subnet_id: null,
      stale: { since: "2025-01-01T00:00:00Z", reason: "no traffic observed" },
    })
    const g = computeCanvasGrid(VPC, SUBNETS, [CONTROL, staleNode], [])
    expect(g.staleNodes.map(n => n.id)).toContain(staleNode.id)
    expect(reasonFor(g, staleNode.id)).toBeUndefined()
  })
})

describe("computeCanvasGrid — off the canvas by design is not a gap", () => {
  // Derived from the catalog, not hand-listed: `mapSlotForType` returns
  // "hidden" as its DEFAULT, so treating "hidden" as "unknown type" would have
  // buried the real gaps under every IAM role, VPC and Internet node.
  const designed = ["IAMRole", "IAMPolicy", "VPC", "Subnet", "SecurityGroup", "Internet"]

  it("agrees with the catalog that these are off-canvas by design", () => {
    for (const t of designed) expect(isOffCanvasByDesign(t)).toBe(true)
    expect(isOffCanvasByDesign("QuantumLedger")).toBe(false)
  })

  it("reports none of them as unplaced, while still reporting a real gap", () => {
    const nodes = [
      CONTROL,
      UNKNOWN_TYPE,
      ...designed.map(t => nd({ id: `PROBE-${t}`, type: t, vpc_id: VPC, subnet_id: null })),
    ]
    const grid = computeCanvasGrid(VPC, SUBNETS, nodes, [])
    const reported = new Set(grid.unplacedNodes.map(u => u.node.id))
    // The control gap is present — so an empty-set assertion below is real.
    expect(reported.has(UNKNOWN_TYPE.id)).toBe(true)
    for (const t of designed) expect(reported.has(`PROBE-${t}`)).toBe(false)
  })
})

describe("computeCanvasGrid — a node drawn on a rail is not also a gap", () => {
  it("does not report rail-placed or serverless types as unplaced", () => {
    const railType = [...RAIL_PLACED_TYPES][0]
    const serverlessType = [...SERVERLESS_TYPES][0]
    expect(railType).toBeDefined()
    expect(serverlessType).toBeDefined()
    const rail = nd({ id: "PROBE-rail", type: railType, vpc_id: VPC, subnet_id: null })
    const fn = nd({ id: "PROBE-serverless", type: serverlessType, vpc_id: VPC, subnet_id: null })
    const grid = computeCanvasGrid(VPC, SUBNETS, [CONTROL, UNKNOWN_TYPE, rail, fn], [])
    const reported = new Set(grid.unplacedNodes.map(u => u.node.id))
    expect(reported.has(UNKNOWN_TYPE.id)).toBe(true)
    expect(reported.has(rail.id)).toBe(false)
    expect(reported.has(fn.id)).toBe(false)
  })

  it("does not report another VPC's node as this frame's gap", () => {
    const foreign = nd({ id: "PROBE-foreign", type: "EC2", vpc_id: OTHER_VPC, subnet_id: null })
    const grid = computeCanvasGrid(VPC, SUBNETS, [CONTROL, foreign], [])
    expect(grid.unplacedNodes.map(u => u.node.id)).not.toContain(foreign.id)
  })
})

describe("computeCanvasGrid — engineer override", () => {
  const overrides = (n: TopologyNode, vpc: string, az: string, tier: "web" | "app" | "data") =>
    withPlacementOverride({}, n.id, vpc, az, tier) as PlacementOverrideMap

  it("places the node where the engineer said, and marks it as theirs", () => {
    const grid = computeCanvasGrid(VPC, SUBNETS, [CONTROL, NO_SUBNET], [], overrides(NO_SUBNET, VPC, AZ_B, "web"))
    expect(grid.byAzAndTier.get(AZ_B)?.get("web")?.map(n => n.id)).toContain(NO_SUBNET.id)
    expect(grid.operatorPlacedIds.has(NO_SUBNET.id)).toBe(true)
    // It is no longer a gap — it has an answer, just not the graph's.
    expect(reasonFor(grid, NO_SUBNET.id)).toBeUndefined()
  })

  it("loses to evidence: a node the graph CAN place ignores the override", () => {
    const grid = computeCanvasGrid(VPC, SUBNETS, [CONTROL], [], overrides(CONTROL, VPC, AZ_B, "web"))
    expect(grid.byAzAndTier.get(AZ_A)?.get("app")?.map(n => n.id)).toContain(CONTROL.id)
    expect(grid.byAzAndTier.get(AZ_B)?.get("web") ?? []).toEqual([])
    expect(grid.operatorPlacedIds.has(CONTROL.id)).toBe(false)
  })

  it("refuses an AZ no subnet in this VPC reports — that would conjure a column", () => {
    const grid = computeCanvasGrid(VPC, SUBNETS, [CONTROL, NO_SUBNET], [], overrides(NO_SUBNET, VPC, "eu-west-1c", "web"))
    expect(cellNodeIds(grid).has(NO_SUBNET.id)).toBe(false)
    expect(grid.operatorPlacedIds.size).toBe(0)
    expect(reasonFor(grid, NO_SUBNET.id)).toBe("no-subnet-in-graph")
  })

  it("refuses an override addressed to a different VPC frame", () => {
    // Same-region VPCs share AZ names, so matching on AZ alone would draw this
    // node in every frame at once.
    const grid = computeCanvasGrid(VPC, SUBNETS, [CONTROL, NO_SUBNET], [], overrides(NO_SUBNET, OTHER_VPC, AZ_A, "web"))
    expect(cellNodeIds(grid).has(NO_SUBNET.id)).toBe(false)
    expect(reasonFor(grid, NO_SUBNET.id)).toBe("no-subnet-in-graph")
  })

  it("an operator-placed cell is still evidence-free, and the invariant knows it", () => {
    const grid = computeCanvasGrid(VPC, SUBNETS, [CONTROL, NO_SUBNET], [], overrides(NO_SUBNET, VPC, AZ_B, "web"))
    // Exempt only because `operatorPlacedIds` names it. Drop the id from that
    // set and the same placement reads as a fabrication.
    expect(cellsWithoutEvidence(grid, SUBNETS)).toEqual([])
    const asIfUnmarked = { ...grid, operatorPlacedIds: new Set<string>() }
    expect(cellsWithoutEvidence(asIfUnmarked, SUBNETS)).toEqual([`${NO_SUBNET.id} @ ${AZ_B}::web`])
  })
})

describe("buildVpcFrames — the no-VPC population is reported, not discarded", () => {
  const ORPHAN = nd({ id: "PROBE-no-vpc", type: "EC2", vpc_id: null, subnet_id: null })
  const ORPHAN_UNKNOWN = nd({ id: "PROBE-no-vpc-unknown", type: "QuantumLedger", vpc_id: null, subnet_id: null })

  it("surfaces a node that resolved to no VPC at all", () => {
    const { unplacedNodes } = buildVpcFrames(SUBNETS, [CONTROL, ORPHAN, ORPHAN_UNKNOWN], VPC, [], [], true)
    const byId = new Map(unplacedNodes.map(u => [u.node.id, u.reason]))
    expect(byId.get(ORPHAN.id)).toBe("no-subnet-in-graph")
    expect(byId.get(ORPHAN_UNKNOWN.id)).toBe("type-unrecognized")
    expect(byId.has(CONTROL.id)).toBe(false)
  })

  it("reports each unplaceable node exactly once across all frames", () => {
    const multi = [...SUBNETS, sn({ id: "subnet-other", vpc_id: OTHER_VPC, az: AZ_A, tier: "web" })]
    const { unplacedNodes } = buildVpcFrames(multi, [CONTROL, NO_SUBNET, ORPHAN], VPC, [], [], true)
    const ids = unplacedNodes.map(u => u.node.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("routes an overridden no-VPC node into the frame the engineer chose", () => {
    const ov = withPlacementOverride({}, ORPHAN.id, VPC, AZ_A, "data")
    const { frames, unplacedNodes } = buildVpcFrames(SUBNETS, [CONTROL, ORPHAN], VPC, [], [], true, [], ov)
    const frame = frames.find(f => f.vid === VPC)!
    expect(frame.grid.byAzAndTier.get(AZ_A)?.get("data")?.map(n => n.id)).toContain(ORPHAN.id)
    expect(frame.grid.operatorPlacedIds.has(ORPHAN.id)).toBe(true)
    expect(unplacedNodes.map(u => u.node.id)).not.toContain(ORPHAN.id)
  })
})

// ---------------------------------------------------------------------------
// Rendered surface. happy-dom has no layout, so these pin structure only.
// ---------------------------------------------------------------------------

function topology(): VpcTopology {
  return {
    region: "eu-west-1",
    account_id: "416651950952",
    vpc_id: VPC,
    azs: [AZ_A, AZ_B],
    subnets: SUBNETS,
    edges: { igws: [], nat_gws: [], vpces: [] },
    unknown_subnet_count: 0,
    security_groups: [],
    iam_roles: [],
  }
}

function renderFrame(extra: Partial<React.ComponentProps<typeof AwsFrame>> = {}) {
  return render(
    <AwsFrame
      vpcTopology={topology()}
      nodes={[CONTROL, NO_SUBNET, DANGLING, NO_AZ, UNKNOWN_TYPE]}
      mergedVpcView={false}
      presentationMode={false}
      viewDensity="inventory"
      selectedNodeId={null}
      onSelect={() => {}}
      {...extra}
    />,
  )
}

describe("AwsFrame — the unplaced area is on screen", () => {
  it("renders one group per reason, each labelled with what to do about it", () => {
    renderFrame()
    const area = screen.getByTestId("topology-unplaced-area")
    expect(area).toHaveTextContent("Not placed · the graph does not say where (4)")
    const reasons = screen
      .getAllByTestId("topology-unplaced-group")
      .map(g => g.getAttribute("data-unplaced-reason"))
    expect(reasons).toEqual([
      "no-subnet-in-graph",
      "subnet-not-in-graph",
      "az-unknown-for-subnet",
      "type-unrecognized",
    ])
  })

  it("draws every node that used to vanish, including the unknown type", () => {
    renderFrame()
    const area = screen.getByTestId("topology-unplaced-area")
    for (const n of [NO_SUBNET, DANGLING, NO_AZ, UNKNOWN_TYPE]) {
      expect(within(area).getByText(n.name!)).toBeTruthy()
    }
  })

  it("sits outside every AZ grid — it is a region statement, not a cell", () => {
    renderFrame()
    const area = screen.getByTestId("topology-unplaced-area")
    expect(area.closest('[data-testid^="topology-subnet-cell"]')).toBeNull()
    expect(area.closest('[data-flow-obstacle="az-header-row"]')).toBeNull()
  })

  it("renders nothing when the graph placed everything", () => {
    renderFrame({ nodes: [CONTROL] })
    expect(screen.queryByTestId("topology-unplaced-area")).toBeNull()
  })
})

describe("AwsFrame — the engineer's placement control", () => {
  it("offers no picker when the host wired no handler", () => {
    renderFrame()
    expect(screen.queryByTestId("topology-placement-picker")).toBeNull()
  })

  it("offers one picker per unplaced node when a handler is wired", () => {
    renderFrame({ onPlaceNode: () => {} })
    expect(screen.getAllByTestId("topology-placement-picker")).toHaveLength(4)
  })

  it("reports the full target — vpc, az and tier — so the host cannot guess a frame", () => {
    const onPlaceNode = vi.fn()
    renderFrame({ onPlaceNode })
    const picker = screen
      .getAllByTestId("topology-placement-picker")
      .find(p => p.getAttribute("data-node-id") === NO_SUBNET.id)!
    fireEvent.change(picker, { target: { value: `${VPC}::${AZ_B}::data` } })
    expect(onPlaceNode).toHaveBeenCalledWith(NO_SUBNET.id, { vpc_id: VPC, az: AZ_B, tier: "data" })
  })

  it("only offers AZs this VPC actually has", () => {
    renderFrame({ onPlaceNode: () => {} })
    const picker = screen.getAllByTestId("topology-placement-picker")[0]
    const values = Array.from(picker.querySelectorAll("option"))
      .map(o => (o as HTMLOptionElement).value)
      .filter(Boolean)
    expect(values).toEqual([
      `${VPC}::${AZ_A}::web`,
      `${VPC}::${AZ_A}::app`,
      `${VPC}::${AZ_A}::data`,
      `${VPC}::${AZ_B}::web`,
      `${VPC}::${AZ_B}::app`,
      `${VPC}::${AZ_B}::data`,
    ])
  })

  it("refuses a malformed option value rather than writing half an override", () => {
    const onPlaceNode = vi.fn()
    renderFrame({ onPlaceNode })
    const picker = screen.getAllByTestId("topology-placement-picker")[0]
    fireEvent.change(picker, { target: { value: `${VPC}::${AZ_A}::unknown` } })
    fireEvent.change(picker, { target: { value: AZ_A } })
    expect(onPlaceNode).not.toHaveBeenCalled()
  })
})

describe("AwsFrame — an operator-placed chip stays tellable from evidence", () => {
  const placed = withPlacementOverride({}, NO_SUBNET.id, VPC, AZ_B, "web")

  it("badges the chip and marks it in the DOM", () => {
    renderFrame({ placementOverrides: placed })
    const badges = screen.getAllByTestId("topology-operator-placed-badge")
    expect(badges.length).toBeGreaterThan(0)
    const marked = document.querySelectorAll('[data-operator-placed="true"]')
    expect(marked.length).toBeGreaterThan(0)
  })

  it("does not badge a chip the graph placed", () => {
    renderFrame({ nodes: [CONTROL] })
    expect(screen.queryByTestId("topology-operator-placed-badge")).toBeNull()
    expect(document.querySelectorAll('[data-operator-placed="true"]')).toHaveLength(0)
  })

  it("lists the placement as operator provenance, with a way to undo it", () => {
    const onPlaceNode = vi.fn()
    renderFrame({ placementOverrides: placed, onPlaceNode })
    const list = screen.getByTestId("topology-operator-placed-list")
    expect(list).toHaveTextContent("Placed by an engineer (1) — operator provenance, not evidence")
    const entry = within(list).getByTestId("topology-operator-placed-entry")
    expect(entry).toHaveAttribute("data-node-id", NO_SUBNET.id)
    fireEvent.click(within(list).getByTestId("topology-clear-placement"))
    expect(onPlaceNode).toHaveBeenCalledWith(NO_SUBNET.id, null)
  })

  it("wires the host, or the picker never reaches a user", () => {
    // Source-level on purpose: `estate-map-view.tsx` has no render harness in
    // this suite (it owns fetches, account-scope context and dynamic imports),
    // and `estate-dependency-proxy.test.ts` sets the precedent for asserting its
    // contract from source. Everything above passes props directly to AwsFrame,
    // so without this the whole feature could be dark in production and green
    // in CI.
    const view = readFileSync(
      resolve(__dirname, "../components/topology-v0-2/estate-map-view.tsx"),
      "utf8",
    )
    expect(view).toContain("placementOverrides={placementOverrides}")
    expect(view).toContain("onPlaceNode={handlePlaceNode}")
    // The fence lives in placement-overrides.ts; the view must use it rather
    // than reach for the unscoped load/save and reintroduce the ordering bug.
    expect(view).toContain("loadScopedOverrides(systemName, azScopeKey)")
    expect(view).toContain("persistScopedOverrides(placementState, systemName, azScopeKey)")
    expect(view).toContain("readScopedOverrides(placementState, systemName, azScopeKey)")
    expect(view).not.toContain("savePlacementOverrides(")
  })

  it("does not list a placement whose cell the map no longer draws", () => {
    // The AZ went away between collections. The chip is not on the canvas, so
    // claiming it is would be the same lie in the opposite direction.
    const stale = withPlacementOverride({}, NO_SUBNET.id, VPC, "eu-west-1c", "web")
    renderFrame({ placementOverrides: stale })
    expect(screen.queryByTestId("topology-operator-placed-list")).toBeNull()
    // ...and the node is still reported as a gap.
    const area = screen.getByTestId("topology-unplaced-area")
    expect(within(area).getByText(NO_SUBNET.name!)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Logical groups. A target group binds instances, an ASG spans subnets, a DB
// cluster owns its instances: none has a subnet of its own, so "no subnet in
// the graph — run a full sync" was the wrong diagnosis and the wrong remedy for
// all six unplaced resources on C1 (2026-09-11 network-topology review).
// ---------------------------------------------------------------------------

describe("computeCanvasGrid — a logical group is a group, not a collector gap", () => {
  const TG = nd({ id: "PROBE-tg", type: "TargetGroup", vpc_id: VPC, subnet_id: null })
  const ASG = nd({ id: "PROBE-asg", type: "AutoScalingGroup", vpc_id: VPC, subnet_id: null })
  const CLUSTER = nd({ id: "PROBE-aurora-cluster", type: "RDS", resource_label: "RDSCluster", vpc_id: VPC, subnet_id: null })
  const INSTANCE = nd({ id: "PROBE-aurora-instance", type: "RDS", resource_label: "RDSInstance", vpc_id: VPC, subnet_id: null })

  it("reports target groups, ASGs and DB clusters as groups, never as a missing subnet", () => {
    const g = computeCanvasGrid(VPC, SUBNETS, [CONTROL, TG, ASG, CLUSTER], [])
    for (const n of [TG, ASG, CLUSTER]) {
      expect(cellNodeIds(g).has(n.id)).toBe(false)
      expect(reasonFor(g, n.id)).toBe("logical-group")
    }
  })

  it("tells a cluster from its instance by the graph label, not the canvas type", () => {
    // Both project as `type: "RDS"`; only `resource_label` separates them.
    const g = computeCanvasGrid(VPC, SUBNETS, [CONTROL, CLUSTER, INSTANCE], [])
    expect(reasonFor(g, CLUSTER.id)).toBe("logical-group")
    expect(reasonFor(g, INSTANCE.id)).toBe("no-subnet-in-graph")
  })

  it("still places a group whose subnets the graph resolves — an ASG spans real subnets", () => {
    const spanning = nd({
      id: "PROBE-asg-placed",
      type: "AutoScalingGroup",
      vpc_id: VPC,
      subnet_id: "subnet-web-a",
      subnet_ids: ["subnet-web-a", "subnet-web-b"],
    })
    const g = computeCanvasGrid(VPC, SUBNETS, [CONTROL, spanning], [])
    expect(cellNodeIds(g).has(spanning.id)).toBe(true)
    expect(reasonFor(g, spanning.id)).toBeUndefined()
  })

  it("classifies a cluster that resolved to no VPC the same way", () => {
    const orphanCluster = nd({
      id: "PROBE-neptune-cluster",
      type: "Neptune",
      resource_label: "NeptuneCluster",
      vpc_id: null,
      subnet_id: null,
    })
    const { unplacedNodes } = buildVpcFrames(SUBNETS, [CONTROL, orphanCluster], VPC, [], [], true)
    expect(unplacedNodes.find(u => u.node.id === orphanCluster.id)?.reason).toBe("logical-group")
  })
})

// The band a group is drawn in. The classifier's `logical-group` verdict says
// "a group whose members carry the placement", not "the graph does not say
// where" — yet both readings stood on one amber area headed as a placement gap
// (2026-09-12 review: all six items under "Not placed · the graph does not say
// where" were groups, while the copy beneath said none of them was a gap). The
// amber area is now the gaps alone; a group has a neutral band of its own,
// linked to the members the payload's edges name.

describe("AwsFrame — a group is drawn in its own band, never counted as a placement gap", () => {
  const TG = nd({ id: "PROBE-tg", name: "cyntro-tb-prod-tg-web", type: "TargetGroup", vpc_id: VPC, subnet_id: null })
  const WEB_B = nd({ id: "PROBE-web-b", name: "web-b", type: "EC2", vpc_id: VPC, subnet_id: "subnet-web-b" })
  const targets = (memberId: string): TrafficEdge => ({ source_id: TG.id, target_id: memberId, protocol: "TARGETS" })

  it("heads and counts the amber area by the real gaps alone, and the band by the groups", () => {
    renderFrame({ nodes: [CONTROL, NO_SUBNET, TG] })
    const area = screen.getByTestId("topology-unplaced-area")
    expect(screen.getByTestId("topology-unplaced-area-header")).toHaveTextContent(
      "Not placed · the graph does not say where (1)",
    )
    expect(
      screen.getAllByTestId("topology-unplaced-group").map(g => g.getAttribute("data-unplaced-reason")),
    ).toEqual(["no-subnet-in-graph"])
    expect(within(area).queryByText(TG.name!)).toBeNull()

    const band = screen.getByTestId("topology-logical-group-band")
    expect(screen.getByTestId("topology-logical-group-band-header")).toHaveTextContent(
      "Logical groups · members carry the placement (1)",
    )
    expect(band).toHaveTextContent("Not a collector gap")
    expect(band.textContent).not.toMatch(/run a full sync/)
    expect(band.textContent).not.toMatch(/does not say where/)
    expect(within(band).getByText(TG.name!)).toBeTruthy()
    const entry = screen.getByTestId("topology-logical-group")
    expect(entry.getAttribute("data-node-id")).toBe(TG.id)
    expect(entry.getAttribute("data-vpc-id")).toBe(VPC)
  })

  it("renders no placement-gap area at all when only groups are unplaced", () => {
    renderFrame({ nodes: [CONTROL, TG] })
    expect(screen.queryByTestId("topology-unplaced-area")).toBeNull()
    expect(screen.getByTestId("topology-logical-group-band")).toBeTruthy()
  })

  it("links the group to the members the payload's TARGETS edges name and spans their zones", () => {
    const onSelect = vi.fn()
    renderFrame({
      nodes: [CONTROL, WEB_B, TG],
      trafficEdges: [targets(CONTROL.id), targets(WEB_B.id)],
      onSelect,
    })
    const entry = screen.getByTestId("topology-logical-group")
    expect(entry.getAttribute("data-member-ids")).toBe(`${CONTROL.id}|${WEB_B.id}`)
    // CONTROL sits in subnet-app-a (eu-west-1a), WEB_B in subnet-web-b (eu-west-1b):
    // the span is the members' own zones, not a cell for the group.
    expect(entry.getAttribute("data-scope-azs")).toBe(`${AZ_A}|${AZ_B}`)
    expect(screen.getByTestId("topology-logical-group-scope")).toHaveTextContent(
      `VPC ${VPC} · spans ${AZ_A}, ${AZ_B}`,
    )
    const members = screen.getAllByTestId("topology-logical-group-member")
    expect(members.map(m => m.textContent)).toEqual([CONTROL.name, WEB_B.name])
    fireEvent.click(members[1])
    expect(onSelect).toHaveBeenCalledWith(WEB_B.id)
    expect(screen.queryByTestId("topology-logical-group-members-unlinked")).toBeNull()
  })

  it("says so when the payload links no member, rather than inventing one", () => {
    renderFrame({
      nodes: [CONTROL, TG],
      // Traffic INTO the group is not membership.
      trafficEdges: [{ source_id: CONTROL.id, target_id: TG.id, protocol: "ACTUAL_TRAFFIC" }],
    })
    const entry = screen.getByTestId("topology-logical-group")
    expect(entry.getAttribute("data-member-ids")).toBe("")
    expect(entry.getAttribute("data-scope-azs")).toBe("")
    expect(screen.getByTestId("topology-logical-group-members-unlinked")).toHaveTextContent(
      "members not linked in this payload",
    )
    expect(screen.getByTestId("topology-logical-group-scope")).toHaveTextContent(`VPC ${VPC}`)
    expect(screen.queryAllByTestId("topology-logical-group-member")).toEqual([])
  })

  it("offers the engineer no picker for a group, while a real gap keeps its picker", () => {
    renderFrame({ nodes: [CONTROL, NO_SUBNET, TG], onPlaceNode: () => {} })
    const pickers = screen.getAllByTestId("topology-placement-picker")
    expect(pickers.map(p => p.getAttribute("data-node-id"))).toEqual([NO_SUBNET.id])
    expect(
      within(screen.getByTestId("topology-logical-group-band")).queryByTestId("topology-placement-picker"),
    ).toBeNull()
  })
})

describe("logicalGroupScope — members and zones from the payload only", () => {
  const TG = nd({ id: "PROBE-tg", type: "TargetGroup", vpc_id: VPC, subnet_id: null })
  const CLUSTER = nd({ id: "PROBE-cluster", type: "RDS", resource_label: "RDSCluster", vpc_id: VPC, subnet_id: null })
  const A = nd({ id: "PROBE-a", type: "EC2", vpc_id: VPC, subnet_id: "subnet-web-a" })
  const B = nd({
    id: "PROBE-b",
    type: "RDS",
    vpc_id: VPC,
    subnet_id: "subnet-data-a",
    subnet_ids: ["subnet-data-a", "subnet-web-b"],
  })
  const e = (source_id: string, target_id: string, protocol: string): TrafficEdge => ({ source_id, target_id, protocol })

  it("reads TARGETS and LAUNCHES from the group, MEMBER_OF_CLUSTER into it, and nothing else", () => {
    const edges = [
      e(TG.id, A.id, "TARGETS"),
      e("asg-1", A.id, "LAUNCHES"),
      e(B.id, CLUSTER.id, "MEMBER_OF_CLUSTER"),
      e(A.id, TG.id, "ACTUAL_TRAFFIC"),
      e("alb-1", TG.id, "HAS_TARGET_GROUP"),
    ]
    expect(logicalGroupScope(TG, edges, [A, B], SUBNETS).memberIds).toEqual([A.id])
    expect(logicalGroupScope(CLUSTER, edges, [A, B], SUBNETS).memberIds).toEqual([B.id])
    expect(logicalGroupScope({ id: "asg-1" }, edges, [A, B], SUBNETS).memberIds).toEqual([A.id])
  })

  it("spans exactly the zones the members' own subnets resolve to — every subnet of a Multi-AZ member, none for a member the frame was not handed", () => {
    const edges = [e(B.id, CLUSTER.id, "MEMBER_OF_CLUSTER"), e("PROBE-not-handed", CLUSTER.id, "MEMBER_OF_CLUSTER")]
    const scope = logicalGroupScope(CLUSTER, edges, [A, B], SUBNETS)
    expect(scope.memberIds).toEqual([B.id, "PROBE-not-handed"])
    expect(scope.azs).toEqual([AZ_A, AZ_B])
  })

  it("accepts the legacy `kind` spelling and dedupes a member named twice", () => {
    const edges: TrafficEdge[] = [{ source_id: TG.id, target_id: A.id, kind: "TARGETS" }, e(TG.id, A.id, "TARGETS")]
    expect(logicalGroupScope(TG, edges, [A], SUBNETS)).toEqual({ memberIds: [A.id], azs: [AZ_A] })
  })
})


// ---------------------------------------------------------------------------
// The subnet's tier is the row. A Neptune writer in a PUBLIC subnet used to be
// drawn in the private database row because its TYPE said "data"; the review
// of 2026-09-11 called that out, and it hides the very finding a security map
// exists to show.
// ---------------------------------------------------------------------------

describe("computeCanvasGrid — the subnet's tier is the row, the type is not", () => {
  it("draws a database in a public subnet in that subnet's row, not the data row", () => {
    const db = nd({ id: "PROBE-db-public", type: "RDS", vpc_id: VPC, subnet_id: "subnet-web-a", placement_tier: "data" })
    const g = computeCanvasGrid(VPC, SUBNETS, [CONTROL, db], [])
    expect(g.byAzAndTier.get(AZ_A)?.get("web")?.map(n => n.id)).toContain(db.id)
    expect(g.byAzAndTier.get(AZ_A)?.get("data")?.map(n => n.id) ?? []).not.toContain(db.id)
  })

  it("uses the backend hint only for a subnet the graph could not classify", () => {
    const subnets = [...SUBNETS, sn({ id: "subnet-untiered-a", tier: "unknown", az: AZ_A, cidr: "10.42.40.0/24" })]
    const db = nd({ id: "PROBE-db-untiered", type: "RDS", vpc_id: VPC, subnet_id: "subnet-untiered-a", placement_tier: "data" })
    const g = computeCanvasGrid(VPC, subnets, [CONTROL, db], [])
    expect(g.byAzAndTier.get(AZ_A)?.get("data")?.map(n => n.id)).toContain(db.id)
  })

  it("places a single-subnet instance in exactly one cell", () => {
    const db = nd({ id: "PROBE-db-one", type: "RDS", vpc_id: VPC, subnet_id: "subnet-data-a", subnet_ids: ["subnet-data-a"] })
    const g = computeCanvasGrid(VPC, SUBNETS, [CONTROL, db], [])
    const cells: string[] = []
    for (const [az, azMap] of g.byAzAndTier)
      for (const [tier, cell] of azMap) if (cell.some(n => n.id === db.id)) cells.push(`${az}::${tier}`)
    expect(cells).toEqual([`${AZ_A}::data`])
  })
})
