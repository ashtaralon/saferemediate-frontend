/// <reference types="vitest/globals" />
/**
 * Neptune nodes draw a graph glyph, not the unknown-type "?" — structural
 * regression (C1 production QA, 2026-09-02: both cyntro-testbed-webshop-writer
 * chips in the Data tier rendered "?"). The unknown-type fallback itself stays
 * for a type the map has never seen.
 */
import React from "react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { AwsFrame } from "@/components/topology-v0-2/aws-frame"
import { awsServiceLabel } from "@/components/topology-v0-2/aws-architecture-icons"
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
  return { name: p.id, az: "eu-west-1a", cidr: "10.42.20.0/24", tier: "data", tier_source: "property", vpc_id: VPC, ...p }
}
function nd(p: Partial<TopologyNode> & Pick<TopologyNode, "id">): TopologyNode {
  return { name: p.id, type: "EC2", subnet_id: null, score: null, stale: null, is_jewel: false, ...p }
}

const vpcTopology: VpcTopology = {
  region: "eu-west-1",
  account_id: "416651950952",
  vpc_id: VPC,
  azs: ["eu-west-1a"],
  subnets: [sn({ id: "subnet-data-1a" })],
  edges: { igws: [], nat_gws: [], vpces: [] },
  unknown_subnet_count: 0,
  security_groups: [],
  iam_roles: [],
}

const nodes: TopologyNode[] = [
  nd({ id: "neptune-writer", name: "cyntro-testbed-webshop-writer", type: "Neptune", vpc_id: VPC, subnet_id: "subnet-data-1a" }),
  nd({ id: "unknown-thing", name: "something-new", type: "QuantumLedger", vpc_id: VPC, subnet_id: "subnet-data-1a" }),
]

function chipGlyphText(chip: HTMLElement): string[] {
  return Array.from(chip.querySelectorAll("span"))
    .filter(span => span.childElementCount === 0)
    .map(span => span.textContent?.trim() ?? "")
}

describe("Neptune glyph", () => {
  it("draws a graph glyph for a Neptune node and keeps the '?' fallback for an unknown type", () => {
    render(
      <AwsFrame
        vpcTopology={vpcTopology}
        nodes={nodes}
        mergedVpcView={false}
        presentationMode={false}
        viewDensity="inventory"
        selectedNodeId={null}
        onSelect={() => {}}
      />,
    )
    const chips = screen.getAllByTestId("topology-service-node-icon")
    const neptune = chips.find(chip => chip.getAttribute("title")?.includes("cyntro-testbed-webshop-writer"))
    const unknown = chips.find(chip => chip.getAttribute("title")?.includes("something-new"))
    expect(neptune).toBeDefined()
    expect(unknown).toBeDefined()
    expect(chipGlyphText(neptune as HTMLElement)).not.toContain("?")
    expect((neptune as HTMLElement).querySelector("svg")).not.toBeNull()
    expect(neptune).toHaveAttribute("title", expect.stringContaining("· Neptune"))
    expect(chipGlyphText(unknown as HTMLElement)).toContain("?")
  })

  it("labels a Neptune stack as Neptune", () => {
    expect(awsServiceLabel("Neptune")).toBe("Neptune")
    expect(awsServiceLabel("NeptuneCluster")).toBe("Neptune")
  })
})
