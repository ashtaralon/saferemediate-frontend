/// <reference types="vitest/globals" />
/**
 * Fullscreen right-rail clip — structural regression.
 *
 * In fullscreen the region grid pins the off-VPC rail column to a
 * minmax(0,1fr) track and clips overflow, and computeFit pins the content
 * box to the viewport height, so a rail taller than the viewport was cut
 * off and nothing could reach the hidden Regional chips (2026-09-02). The
 * fix makes the rail column the ONE scroll owner in presentation mode and
 * removes the nested Lambda-tier cap. happy-dom has no layout, so the
 * geometry itself is covered by tests/integration/
 * topology-fullscreen-rail-fixture.spec.ts; this pins the structure.
 */
import React from "react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"

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

describe("fullscreen off-VPC rail owns one bounded scroll", () => {
  it("presentation mode: the rail column scrolls and nothing inside it does", () => {
    renderFrame(true)
    const rail = screen.getByTestId("topology-edge-services-rail")
    expect(rail.className).toMatch(/\boverflow-y-auto\b/)
    expect(rail.className).toMatch(/\bmin-h-0\b/)
    expect(rail).toHaveAttribute("data-scroll-region", "edge-services-rail")
    // Both tiers are inside the scroll owner …
    expect(within(rail).getByTestId("topology-serverless-tier")).toBeInTheDocument()
    expect(within(rail).getByTestId("topology-regional-data-tier")).toBeInTheDocument()
    // … and no nested scroll box / height cap survives (the old
    // max-h-[190px] overflow-y-auto on the Lambda chip wrapper).
    const nested = rail.querySelectorAll("[class*='overflow-y-auto'], [class*='max-h-[']")
    expect(Array.from(nested).map(el => el.className)).toEqual([])
  })

  it("embedded mode is unchanged: the rail grows with the page", () => {
    renderFrame(false)
    const rail = screen.getByTestId("topology-edge-services-rail")
    expect(rail.className).not.toMatch(/\boverflow-y-auto\b/)
    expect(rail.className).toMatch(/\bshrink-0\b/)
  })
})
