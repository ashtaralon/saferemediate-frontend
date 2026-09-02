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

import { AwsFrame, RAIL_LANE_MIN_PX, railLaneFloorPx } from "@/components/topology-v0-2/aws-frame"
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

function renderFrame(presentationMode: boolean) {
  return render(
    <AwsFrame
      vpcTopology={vpcTopology}
      nodes={nodes}
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
      expect(body.className).toMatch(/\bflex-1\b/)
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
    expect(serverlessHeader).toHaveTextContent("Lambda runtime · outside subnet grid (3)")
    expect(regionalHeader).not.toBeNull()
    expect(regionalHeader).toHaveTextContent("Regional · S3 / DDB / KMS (2)")
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

  it("railLaneFloorPx: the full floor when the column affords two, an equal split when it cannot", () => {
    expect(railLaneFloorPx(null)).toBe(RAIL_LANE_MIN_PX)
    expect(railLaneFloorPx(0)).toBe(RAIL_LANE_MIN_PX)
    expect(railLaneFloorPx(390)).toBe(RAIL_LANE_MIN_PX) // 2 × 154 + 8 ≤ 390
    expect(railLaneFloorPx(316)).toBe(RAIL_LANE_MIN_PX) // exactly two floors + the gap
    expect(railLaneFloorPx(300)).toBe(146) // (300 − 8) / 2
    expect(railLaneFloorPx(100)).toBe(46)
    expect(railLaneFloorPx(4)).toBe(0)
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
