/// <reference types="vitest/globals" />
/**
 * Fullscreen right-rail clip — structural regression.
 *
 * In fullscreen the region grid pins the off-VPC rail column to a
 * minmax(0,1fr) track and clips overflow, and computeFit pins the content
 * box to the viewport height, so a rail taller than the viewport was cut
 * off and nothing could reach the hidden Regional chips (2026-09-02). The
 * column now bounds two LANES — Lambda | Regional — and each lane body owns
 * its own scroll (RailLaneBody), so both lanes stay on screen together; the
 * nested Lambda-tier cap is gone. Each lane also keeps a floor sized for one
 * full row of dense, half-row chips (RAIL_LANE_MIN_PX): the 96px floor the
 * split shipped with could not hold a full-size chip once the coverage pill
 * took its share of the column. happy-dom has no layout, so the geometry
 * itself is covered by tests/integration/
 * topology-fullscreen-rail-fixture.spec.ts; this pins the structure.
 */
import React from "react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"

import {
  AwsFrame,
  RAIL_LANE_CORRIDOR_W_PX,
  RAIL_LANE_MIN_PX,
  RAIL_LANE_ROW_PX,
  RAIL_LANE_W_PX,
  railLaneFloorPx,
} from "@/components/topology-v0-2/aws-frame"
import type { SubnetMeta, TopologyNode, VpcTopology } from "@/components/topology-v0-2/types"

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

function sn(p: Partial<SubnetMeta> & Pick<SubnetMeta, "id">): SubnetMeta {
  return { name: p.id, az: "eu-west-1a", cidr: "10.42.0.0/24", tier: "web", tier_source: "property", vpc_id: VPC, ...p }
}
function nd(p: Partial<TopologyNode> & Pick<TopologyNode, "id">): TopologyNode {
  return { name: p.id, type: "EC2", subnet_id: null, score: null, stale: null, is_jewel: false, ...p }
}

const vpcTopology: VpcTopology = {
  region: "eu-west-1",
  account_id: "416651950952",
  vpc_id: VPC,
  azs: ["eu-west-1a"],
  subnets: [
    sn({ id: "subnet-web-1a", tier: "web", cidr: "10.42.0.0/24" }),
    sn({ id: "subnet-app-1a", tier: "app", cidr: "10.42.10.0/24" }),
  ],
  edges: { igws: [], nat_gws: [], vpces: [] },
  unknown_subnet_count: 0,
  security_groups: [],
  iam_roles: [],
}

// One in-VPC workload, three non-VPC Lambdas (serverless rail), two buckets
// (regional rail): both rail tiers render, so the column exists to assert on.
const nodes: TopologyNode[] = [
  nd({ id: "i-web", type: "EC2", vpc_id: VPC, subnet_id: "subnet-web-1a" }),
  nd({ id: "fn-a", name: "cyntro-tb-prod-consumer-a", type: "Lambda" }),
  nd({ id: "fn-b", name: "cyntro-tb-prod-consumer-b", type: "Lambda" }),
  nd({ id: "fn-c", name: "cyntro-tb-prod-consumer-c", type: "Lambda" }),
  nd({ id: "arn:aws:s3:::cyntro-tb-prod-appdata", name: "cyntro-tb-prod-appdata", type: "S3" }),
  nd({ id: "arn:aws:s3:::cyntro-tb-prod-logs", name: "cyntro-tb-prod-logs", type: "S3" }),
]

// EventBridge rules named for the Lambdas they fire — the shape C1 runs, and
// the one that broke the lane: the rules render in a BAND inside the Lambda
// lane, so they compete with the Lambda chips for the lane's height and they
// share the Lambdas' naming prefix.
const triggerNodes: TopologyNode[] = [
  nd({ id: "rule-a", name: "cyntro-tb-prod-consumer-a-schedule", type: "EventBridgeRule" }),
  nd({ id: "rule-b", name: "cyntro-tb-prod-consumer-b-schedule", type: "EventBridgeRule" }),
  nd({ id: "rule-c", name: "cyntro-tb-prod-consumer-c-schedule", type: "EventBridgeRule" }),
]

function renderFrame(presentationMode: boolean, frameNodes: TopologyNode[] = nodes) {
  return render(
    <AwsFrame
      vpcTopology={vpcTopology}
      nodes={frameNodes}
      mergedVpcView={false}
      presentationMode={presentationMode}
      viewDensity="inventory"
      selectedNodeId={null}
      onSelect={() => {}}
    />,
  )
}

describe("fullscreen off-VPC rail: two lanes, each owning one bounded scroll", () => {
  it("presentation mode: the column bounds the lanes and each lane body scrolls", () => {
    renderFrame(true)
    const rail = screen.getByTestId("topology-edge-services-rail")
    expect(rail.className).toMatch(/\boverflow-hidden\b/)
    expect(rail.className).not.toMatch(/\boverflow-y-auto\b/)
    expect(rail.className).toMatch(/\bmin-h-0\b/)
    expect(rail).toHaveAttribute("data-scroll-region", "edge-services-rail")
    // Both lanes are inside the column …
    const serverless = within(rail).getByTestId("topology-serverless-tier")
    const regional = within(rail).getByTestId("topology-regional-data-tier")
    expect(serverless.className).toMatch(/\bflex-col\b/)
    expect(regional.className).toMatch(/\bflex-col\b/)
    // … each lane body is the scroll owner of its lane …
    const serverlessBody = within(serverless).getByTestId("topology-serverless-lane-body")
    const regionalBody = within(regional).getByTestId("topology-regional-lane-body")
    for (const body of [serverlessBody, regionalBody]) {
      expect(body.className).toMatch(/\boverflow-y-auto\b/)
      expect(body.className).toMatch(/\bmin-h-0\b/)
      // `flex-auto` (1 1 auto), NEVER `flex-1` (1 1 0%). With a 0% basis the
      // body is the only child of the lane whose hypothetical height is zero,
      // so it absorbs every pixel the rest of the lane overruns instead of
      // sharing the deficit: on C1 the triggers band's 291.5px left the Lambda
      // body 1.75px and not one Lambda chip was on screen, inside a lane that
      // was 402px tall and never came near RAIL_LANE_MIN_PX (2026-09-11).
      expect(body.className).toMatch(/\bflex-auto\b/)
      expect(body.className).not.toMatch(/\bflex-1\b/)
      // A lane floor cannot protect the body inside it, so the body carries its
      // own: one dense row, whatever the arithmetic above it says.
      expect(body.style.minHeight).toBe(`${RAIL_LANE_ROW_PX}px`)
      expect(body).toHaveAttribute("data-scroll-region")
    }
    // … and nothing else scrolls or caps height (the old max-h-[190px]
    // overflow-y-auto on the Lambda chip wrapper).
    const scrollers = Array.from(rail.querySelectorAll("[class*='overflow-y-auto']"))
    expect(scrollers).toHaveLength(2)
    expect(scrollers[0]).toBe(serverlessBody)
    expect(scrollers[1]).toBe(regionalBody)
    expect(rail.querySelectorAll("[class*='max-h-[']")).toHaveLength(0)
  })

  it("both rail tier headers are flow obstacles (badge nudge pass keeps labels off them)", () => {
    renderFrame(true)
    const rail = screen.getByTestId("topology-edge-services-rail")
    const serverless = within(rail).getByTestId("topology-serverless-tier")
    const regional = within(rail).getByTestId("topology-regional-data-tier")
    const serverlessHeader = serverless.querySelector('[data-flow-obstacle="serverless-tier-header"]')
    const regionalHeader = regional.querySelector('[data-flow-obstacle="regional-tier-header"]')
    expect(serverlessHeader).not.toBeNull()
    // The title is one line at a 200px lane width; the qualifier that used to
    // wrap it onto a second line still reads, on the detail line below.
    expect(serverlessHeader).toHaveTextContent("Lambda runtime (3)")
    expect(serverlessHeader).toHaveTextContent("outside subnet grid")
    expect(regionalHeader).not.toBeNull()
    // The header names what the lane actually holds. This fixture's regional
    // lane is two S3 buckets, so it must not claim DynamoDB or KMS — the
    // overstatement C1 production QA caught on 2026-09-02.
    expect(regionalHeader).toHaveTextContent("Regional · S3 (2)")
    expect(regionalHeader?.textContent).not.toContain("DDB")
    expect(regionalHeader?.textContent).not.toContain("KMS")
  })

  it("fullscreen lane chips span the lane, one per row; each lane carries the floor", () => {
    renderFrame(true)
    const rail = screen.getByTestId("topology-edge-services-rail")
    for (const lane of ["serverless", "regional"] as const) {
      const body = within(rail).getByTestId(`topology-${lane}-lane-body`)
      const chips = within(body).getAllByTestId("topology-service-node-icon")
      expect(chips.length).toBeGreaterThan(0)
      for (const chip of chips) {
        // One per row: a chip's left edge is reachable by an inbound edge
        // without crossing a neighbour, which is what lets a rail bundle end
        // on the service it names (C1 production QA, 2026-09-02).
        expect(chip.className).toContain("w-full")
        expect(chip.className).toContain("flex-row")
        expect(chip.className).not.toContain("max-w-[112px]")
        expect(chip.className).not.toContain("calc(50%-4px)")
      }
      // The chip container stacks rather than wrapping two abreast.
      expect(body.firstElementChild?.className ?? "").toContain("flex-col")
    }
    // happy-dom has no layout: the column measures 0, so the full floor holds.
    expect(within(rail).getByTestId("topology-serverless-tier").style.minHeight).toBe(`${RAIL_LANE_MIN_PX}px`)
    expect(within(rail).getByTestId("topology-regional-data-tier").style.minHeight).toBe(`${RAIL_LANE_MIN_PX}px`)
  })

  it("the triggers band is a bounded guest in the Lambda lane, not a squatter", () => {
    renderFrame(true, [...nodes, ...triggerNodes])
    const rail = screen.getByTestId("topology-edge-services-rail")
    const serverless = within(rail).getByTestId("topology-serverless-tier")
    const band = within(serverless).getByTestId("topology-triggers-band")
    const list = within(band).getByTestId("topology-triggers-band-list")
    // The band shrinks with the lane instead of pushing the chips out. On C1 it
    // was an unbounded `flex flex-col` block: six rules one per row in a 200px
    // lane measured 291.5px of the lane's 402, and the Lambda body — the only
    // 0%-basis child — was left 1.75px (2026-09-11). The header stays put while
    // the list scrolls, which is why the count above it is still readable.
    expect(band.className).toMatch(/\bflex-auto\b/)
    expect(band.className).toMatch(/\bmin-h-0\b/)
    expect(band.className).toMatch(/\bflex-col\b/)
    expect(list.className).toMatch(/\boverflow-y-auto\b/)
    expect(list.className).toMatch(/\bmin-h-0\b/)
    expect(list.className).toMatch(/\bflex-auto\b/)
    expect(list.style.minHeight).toBe(`${RAIL_LANE_ROW_PX}px`)
    expect(list).toHaveAttribute("data-scroll-region", "triggers-band")
    // Three scroll owners now, in DOM order — the band sits ABOVE the Lambda
    // body inside its lane. Nothing else in the column scrolls or caps height.
    const serverlessBody = within(serverless).getByTestId("topology-serverless-lane-body")
    const regionalBody = within(rail).getByTestId("topology-regional-lane-body")
    expect(Array.from(rail.querySelectorAll("[class*='overflow-y-auto']"))).toEqual([
      list,
      serverlessBody,
      regionalBody,
    ])
    expect(rail.querySelectorAll("[class*='max-h-[']")).toHaveLength(0)
    // Prefix elision is the LANE's, band included: eliding only the Lambdas left
    // every trigger chip reading the whole shared prefix, which is the same "six
    // copies of nothing" this elision exists to remove, one band higher.
    const triggerChips = within(list).getAllByTestId("topology-service-node-icon")
    expect(triggerChips).toHaveLength(triggerNodes.length)
    for (const chip of triggerChips) {
      expect(chip.textContent ?? "").toContain("…")
      expect(chip.textContent ?? "").not.toContain("cyntro-tb-prod-")
    }
    // …and the header's claim covers every chip it speaks for, not just the
    // Lambdas: 3 Lambdas + 3 rules.
    expect(within(serverless).getByTestId("topology-serverless-name-prefix")).toHaveAttribute(
      "title",
      `${nodes.filter(n => n.type === "Lambda").length + triggerNodes.length} of ${
        nodes.filter(n => n.type === "Lambda").length + triggerNodes.length
      } chips omit this shared prefix`,
    )
  })

  it("the lanes are side-by-side columns with a corridor between them", () => {
    renderFrame(true)
    const rail = screen.getByTestId("topology-edge-services-rail")
    expect(rail.className).toMatch(/\bgrid\b/)
    // 200 | 40 | 200. Lambda runtime and Regional read as two parallel lanes
    // at the right end of the region, and the traffic between them crosses the
    // corridor rather than running down the column it shares with its target.
    expect(rail.style.gridTemplateColumns).toBe(
      `${RAIL_LANE_W_PX}px ${RAIL_LANE_CORRIDOR_W_PX}px ${RAIL_LANE_W_PX}px`,
    )
    expect(rail.style.width).toBe(`${RAIL_LANE_W_PX * 2 + RAIL_LANE_CORRIDOR_W_PX}px`)
    expect(Array.from(rail.children).map(child => child.getAttribute("data-testid"))).toEqual([
      "topology-serverless-tier",
      "topology-interlane-corridor",
      "topology-regional-data-tier",
    ])
  })

  it("railLaneFloorPx: the full floor unless the column itself is shorter", () => {
    expect(railLaneFloorPx(null)).toBe(RAIL_LANE_MIN_PX)
    expect(railLaneFloorPx(0)).toBe(RAIL_LANE_MIN_PX)
    expect(railLaneFloorPx(390)).toBe(RAIL_LANE_MIN_PX)
    // Side by side each lane owns the WHOLE column, so a 300px column that had
    // to be halved into a 146px floor while the lanes were stacked now affords
    // the full row to both.
    expect(railLaneFloorPx(300)).toBe(RAIL_LANE_MIN_PX)
    expect(railLaneFloorPx(RAIL_LANE_MIN_PX)).toBe(RAIL_LANE_MIN_PX)
    expect(railLaneFloorPx(100)).toBe(100)
    expect(railLaneFloorPx(4)).toBe(4)
  })

  it("embedded mode is unchanged: the rail and its lanes grow with the page", () => {
    renderFrame(false)
    const rail = screen.getByTestId("topology-edge-services-rail")
    expect(rail.className).not.toMatch(/\boverflow-y-auto\b/)
    expect(rail.className).toMatch(/\bshrink-0\b/)
    expect(rail.querySelectorAll("[class*='overflow-y-auto']")).toHaveLength(0)
    expect(screen.getByTestId("topology-serverless-lane-body")).not.toHaveAttribute("data-scroll-region")
    expect(screen.queryByTestId("topology-serverless-lane-more")).toBeNull()
    // Full-size inventory chips and no lane floor: the page grows instead.
    const chips = within(rail).getAllByTestId("topology-service-node-icon")
    expect(chips.length).toBeGreaterThan(0)
    for (const chip of chips) {
      expect(chip.className).toContain("min-w-[76px]")
      expect(chip.className).not.toContain("w-full")
    }
    expect(within(rail).getByTestId("topology-serverless-tier").style.minHeight).toBe("")
    expect(within(rail).getByTestId("topology-regional-data-tier").style.minHeight).toBe("")
  })
})
