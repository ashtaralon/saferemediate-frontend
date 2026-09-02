/// <reference types="vitest/globals" />
/**
 * NAT gateways render inside the public subnet cell that owns them —
 * structural regression (geometry track step 3, 2026-09-02).
 *
 * Before: every NAT of a VPC sat on a VPC-level "NAT gateways" band above
 * the AZ grid, below the load balancers' band, detached from the subnet AWS
 * places it in. Now `placeNatGateways` pins each NAT to the AZ x tier cell
 * whose subnet is `nat.subnet_id`; a NAT the grid cannot place (no subnet_id,
 * or a subnet outside the grid) stays on a labelled fallback strip rather
 * than disappearing; and the ALB band is the first row above the grid.
 * happy-dom has no layout, so this pins structure and document order only.
 */
import React from "react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"

import { AwsFrame, placeNatGateways } from "@/components/topology-v0-2/aws-frame"
import type { EdgeNatGw, SubnetMeta, TopologyNode, VpcTopology } from "@/components/topology-v0-2/types"

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

const subnets: SubnetMeta[] = [
  sn({ id: "subnet-web-1a", tier: "web", cidr: "10.42.0.0/24" }),
  sn({ id: "subnet-app-1a", tier: "app", cidr: "10.42.10.0/24" }),
]

function topology(natGws: EdgeNatGw[]): VpcTopology {
  return {
    region: "eu-west-1",
    account_id: "416651950952",
    vpc_id: VPC,
    azs: ["eu-west-1a"],
    subnets,
    edges: { igws: [], nat_gws: natGws, vpces: [] },
    unknown_subnet_count: 0,
    security_groups: [],
    iam_roles: [],
  }
}

const placedNat: EdgeNatGw = { id: "nat-0a1b2c3d4e5f6a7b8", name: "cyntro-tb-nat-1a", subnet_id: "subnet-web-1a", vpc_id: VPC }
const strayNat: EdgeNatGw = { id: "nat-0ffffffffffffffff", name: "cyntro-tb-nat-stray", subnet_id: "subnet-not-in-grid", vpc_id: VPC }

const nodes: TopologyNode[] = [
  nd({ id: "i-web", type: "EC2", vpc_id: VPC, subnet_id: "subnet-web-1a" }),
  nd({ id: "i-app", type: "EC2", vpc_id: VPC, subnet_id: "subnet-app-1a" }),
  nd({
    id: "arn:aws:elasticloadbalancing:eu-west-1:416651950952:loadbalancer/app/cyntro-tb-alb/0123456789abcdef",
    name: "cyntro-tb-alb",
    type: "LoadBalancer",
    vpc_id: VPC,
    subnet_id: "subnet-web-1a",
  }),
]

function renderFrame(natGws: EdgeNatGw[], presentationMode: boolean, viewDensity: "glance" | "inventory") {
  return render(
    <AwsFrame
      vpcTopology={topology(natGws)}
      nodes={nodes}
      mergedVpcView={false}
      presentationMode={presentationMode}
      viewDensity={viewDensity}
      selectedNodeId={null}
      onSelect={() => {}}
    />,
  )
}

const FOLLOWING = 4 // Node.DOCUMENT_POSITION_FOLLOWING
function precedes(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & FOLLOWING) === FOLLOWING
}

describe("placeNatGateways", () => {
  const subnetsByCell = new Map<string, SubnetMeta[]>([
    ["eu-west-1a::web", [subnets[0]]],
    ["eu-west-1a::app", [subnets[1]]],
  ])

  it("pins a NAT to the cell that owns its subnet", () => {
    const placed = placeNatGateways([placedNat], subnetsByCell)
    expect(placed.byCell.get("eu-west-1a::web")).toEqual([placedNat])
    expect(placed.unplaced).toEqual([])
  })

  it("keeps a NAT with an unknown or missing subnet as unplaced instead of dropping it", () => {
    const noSubnet: EdgeNatGw = { ...strayNat, id: "nat-0nosubnet", subnet_id: null }
    const placed = placeNatGateways([placedNat, strayNat, noSubnet], subnetsByCell)
    expect(placed.byCell.get("eu-west-1a::web")).toEqual([placedNat])
    expect(placed.unplaced).toEqual([strayNat, noSubnet])
  })
})

describe("NAT gateway placement on the estate map", () => {
  it.each([
    ["fullscreen · inventory", true, "inventory"],
    ["embedded · glance", false, "glance"],
  ] as const)("%s: the NAT chip sits inside its public subnet cell and no VPC-level band renders", (_label, presentationMode, viewDensity) => {
    renderFrame([placedNat], presentationMode, viewDensity)
    const chips = screen.getAllByTestId("topology-nat-gateway-chip")
    expect(chips).toHaveLength(1)
    expect(chips[0]).toHaveAttribute("data-nat-placement", "subnet")
    expect(chips[0]).toHaveTextContent("NAT GW · cyntro-tb-nat-1a")
    const webCell = document.querySelector('[data-testid^="topology-subnet-cell"][title*="subnet-web-1a"]')
    expect(webCell).not.toBeNull()
    expect(within(webCell as HTMLElement).getByTestId("topology-subnet-cell-nat")).toContainElement(chips[0])
    expect(screen.queryByTestId("topology-nat-gateway-fallback")).toBeNull()
  })

  it("a NAT whose subnet is not in the grid stays visible on a labelled fallback strip", () => {
    renderFrame([strayNat], true, "inventory")
    const fallback = screen.getByTestId("topology-nat-gateway-fallback")
    expect(fallback).toHaveTextContent("NAT gateways · subnet not in this grid (1)")
    const chip = within(fallback).getByTestId("topology-nat-gateway-chip")
    expect(chip).toHaveAttribute("data-nat-placement", "unplaced")
    expect(screen.queryByTestId("topology-subnet-cell-nat")).toBeNull()
  })

  it("the load balancer band is the first row above the grid, ahead of the NAT fallback and the AZ headers", () => {
    renderFrame([strayNat], true, "inventory")
    const alb = screen.getByTestId("topology-alb-band")
    const fallback = screen.getByTestId("topology-nat-gateway-fallback")
    const azHeaders = document.querySelector('[data-flow-obstacle="az-header-row"]')
    expect(azHeaders).not.toBeNull()
    expect(precedes(alb, fallback)).toBe(true)
    expect(precedes(fallback, azHeaders as Element)).toBe(true)
  })
})
