/// <reference types="vitest/globals" />
/**
 * The frame nesting grammar: AWS Cloud > Region > VPC.
 *
 * This exists because the styling kept "not being applied" — the region frame
 * was slate, which reads as page chrome rather than as one of the nested
 * boundaries, and nothing failed when it drifted. The assertions below are the
 * two claims the map makes structurally:
 *
 *   1. Containment. A VPC drawn outside its region is a different statement
 *      about the network, so this asserts real DOM ancestry rather than just
 *      that three frames exist somewhere on the page.
 *   2. Stroke style carries meaning. AWS's diagrams separate a region (dashed:
 *      an administrative boundary you reach across) from a VPC (solid: a
 *      network edge). Region and VPC share the brand teal on purpose — the
 *      dash is the discriminator, so asserting the hue alone would pass on a
 *      map that had lost the distinction, and asserting the dash alone would
 *      pass on the slate frame this replaced.
 *
 * Scope note: the AZ level is asserted through `topology-az-column-headers`,
 * which is what this payload renders in both presentation modes. There is a
 * second per-AZ column layout in `VpcCanvasFrame` (`topology-az-column-{az}`,
 * indigo dashed) that this prop shape does not reach in either mode, with one
 * AZ or two; it is not on the path this restyle touches and is left alone.
 */
import React from "react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { AwsFrame } from "@/components/topology-v0-2/aws-frame"
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
const AZ = "eu-west-1a"

const vpcTopology: VpcTopology = {
  region: "eu-west-1",
  account_id: "416651950952",
  vpc_id: VPC,
  azs: [AZ],
  subnets: [
    {
      id: "subnet-web-1a",
      name: "subnet-web-1a",
      az: AZ,
      cidr: "10.42.0.0/24",
      tier: "web",
      tier_source: "property",
      vpc_id: VPC,
    } satisfies SubnetMeta,
  ],
  edges: { igws: [], nat_gws: [], vpces: [] },
  unknown_subnet_count: 0,
  security_groups: [],
  iam_roles: [],
}

const nodes: TopologyNode[] = [
  {
    id: "i-0abc",
    name: "web-1",
    type: "EC2",
    vpc_id: VPC,
    subnet_id: "subnet-web-1a",
    score: null,
    stale: null,
    is_jewel: false,
  },
]

/**
 * `#00C2A8` and `rgb(0, 194, 168)` are the same colour; which one the CSSOM
 * hands back depends on the DOM implementation, so compare through one form.
 */
function rgbOf(color: string): string {
  const hex = color.trim().match(/^#([0-9a-f]{6})$/i)
  if (!hex) return color.trim().toLowerCase().replace(/\s+/g, "")
  const n = parseInt(hex[1], 16)
  return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`
}

function frameStroke(el: HTMLElement): { style: string; color: string } {
  const s = el.style
  // Prefer the longhands the shorthand expands into; fall back to parsing the
  // shorthand itself if this DOM does not expand it.
  if (s.borderStyle && s.borderColor) {
    return { style: s.borderStyle, color: rgbOf(s.borderColor) }
  }
  const m = s.border.match(/^[\d.]+px\s+(\w+)\s+(.+)$/)
  expect(m, `could not parse border: ${s.border}`).not.toBeNull()
  return { style: m![1], color: rgbOf(m![2]) }
}

function renderMap(presentationMode: boolean) {
  render(
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
  return {
    cloud: screen.getByTestId("topology-cloud-frame"),
    region: screen.getByTestId("topology-region-frame"),
    vpc: screen.getByTestId("topology-vpc-frame"),
  }
}

describe.each([false, true])("AWS frame nesting grammar (presentationMode=%s)", (pm) => {
  it("nests cloud > region > vpc as real DOM ancestry", () => {
    const { cloud, region, vpc } = renderMap(pm)
    expect(cloud).toContainElement(region)
    expect(region).toContainElement(vpc)
  })

  it("labels each level with the AWS name for it", () => {
    renderMap(pm)
    expect(screen.getByText(/AWS Cloud/)).toBeInTheDocument()
    expect(screen.getByText(/^Region · eu-west-1$/)).toBeInTheDocument()
    expect(screen.getByTestId("topology-az-column-headers")).toBeInTheDocument()
  })

  it("draws the region dashed and the VPC solid", () => {
    // The point of the region restyle: it must be a visible frame in the same
    // family as the VPC, distinguished by the dash rather than fading to slate.
    const { cloud, region, vpc } = renderMap(pm)
    expect(frameStroke(region).style).toBe("dashed")
    expect(frameStroke(vpc).style).toBe("solid")
    expect(frameStroke(cloud).style).toBe("solid")
  })

  it("puts region and VPC in the brand teal, and the cloud frame in AWS navy", () => {
    const { cloud, region, vpc } = renderMap(pm)
    expect(frameStroke(region).color).toBe(rgbOf("#00C2A8"))
    expect(frameStroke(vpc).color).toBe(rgbOf("#00C2A8"))
    expect(frameStroke(cloud).color).toBe(rgbOf("#232F3E"))
    // The regression this was written for: a slate region frame is still
    // dashed, so the dash assertion above would not catch it coming back.
    expect(frameStroke(region).color).not.toBe(rgbOf("#5A6B7A"))
  })
})
