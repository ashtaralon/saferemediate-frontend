/// <reference types="vitest/globals" />
/**
 * Layout B — All VPCs · Compare: shared Web/App/Data bands with VPC columns.
 * Layout C — >3 VPCs falls back to primary + peer strip.
 */
import React from "react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import {
  AwsFrame,
  COMPARE_BANDS_MAX_VPCS,
  COMPARE_TIER_MIN_PX,
  buildCompareArchitectureStory,
  buildVpcFrames,
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

const OWN = "vpc-0329e985173bed24f"
const SHARED = "vpc-086bcc2186fa42c96"
const PEER3 = "vpc-0aaa111122223333"
const PEER4 = "vpc-0bbb222233334444"

function sn(p: Partial<SubnetMeta> & Pick<SubnetMeta, "id">): SubnetMeta {
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

const twoVpcTopology: VpcTopology = {
  region: "eu-west-1",
  account_id: "745783559495",
  vpc_id: OWN,
  azs: ["eu-west-1a", "eu-west-1b"],
  subnets: [
    sn({ id: "sn-web", tier: "web", cidr: "10.0.1.0/24", vpc_id: OWN }),
    sn({ id: "sn-app", tier: "app", cidr: "10.0.10.0/24", vpc_id: OWN }),
    // OWN has no data subnet — Data band must still reserve height + empty state
    sn({
      id: "sn-086-a",
      tier: "web",
      cidr: "172.31.16.0/20",
      vpc_id: SHARED,
      owner_system_name: "payment-production",
      is_foreign: true,
    }),
    sn({
      id: "sn-086-b",
      az: "eu-west-1b",
      tier: "web",
      cidr: "172.31.32.0/20",
      vpc_id: SHARED,
      owner_system_name: "payment-production",
      is_foreign: true,
    }),
  ],
  edges: { igws: [], nat_gws: [], vpces: [] },
  unknown_subnet_count: 0,
  security_groups: [],
  iam_roles: [],
}

const twoVpcNodes = [
  nd({ id: "i-own", type: "EC2", vpc_id: OWN, subnet_id: "sn-app" }),
  nd({ id: "i-086", type: "EC2", vpc_id: SHARED, subnet_id: "sn-086-a" }),
]

describe("COMPARE_TIER_MIN_PX lock contract", () => {
  it("reserves Web / App / Data / IAM minimum heights", () => {
    expect(COMPARE_TIER_MIN_PX.web).toBeGreaterThanOrEqual(96)
    expect(COMPARE_TIER_MIN_PX.app).toBeGreaterThanOrEqual(80)
    expect(COMPARE_TIER_MIN_PX.data).toBeGreaterThanOrEqual(80)
    expect(COMPARE_TIER_MIN_PX.iam).toBeGreaterThanOrEqual(48)
  })

  it("caps Compare bands at 3 VPCs before Layout C fallback", () => {
    expect(COMPARE_BANDS_MAX_VPCS).toBe(3)
  })
})

describe("AwsFrame All VPCs · Compare (Layout B)", () => {
  it("renders shared tier bands with VPC column chrome for 2 VPCs", () => {
    render(
      <AwsFrame
        vpcTopology={twoVpcTopology}
        nodes={twoVpcNodes}
        mergedVpcView
        systemLabel="alon-prod"
        selectedNodeId={null}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByTestId("topology-vpc-compare-bands")).toBeInTheDocument()
    expect(screen.getByTestId("topology-system-architecture-path")).toBeInTheDocument()
    expect(screen.getByText(/architecture · not an attack path/)).toBeInTheDocument()
    expect(screen.getAllByTestId("topology-vpc-column-chrome").length).toBe(2)
    expect(screen.getAllByTestId("topology-vpc-az-headers").length).toBe(2)
    expect(screen.getByText(/primary/)).toBeInTheDocument()
    expect(screen.getByTestId("topology-tier-stack")).toBeInTheDocument()
    expect(screen.getByTestId("topology-tier-band-app")).toBeInTheDocument()
    expect(screen.getByTestId("topology-tier-band-data")).toBeInTheDocument()
    // Data empty state for VPCs without a data subnet
    expect(screen.getAllByTestId("topology-data-tier-empty").length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/shared · payment-production/)).toBeInTheDocument()
    // Old side-by-side merged grid must not appear
    expect(screen.queryByTestId("topology-merged-vpc-grid")).not.toBeInTheDocument()
  })

  it("places ALB in the Compare ingress row (Internet → Web path), not VPC chrome", () => {
    const withAlb = [
      ...twoVpcNodes,
      nd({
        id: "alb-1",
        type: "LoadBalancer",
        name: "alon-prod-3tier-alb",
        vpc_id: SHARED,
      }),
    ]
    render(
      <AwsFrame
        vpcTopology={twoVpcTopology}
        nodes={withAlb}
        mergedVpcView
        selectedNodeId={null}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByTestId("topology-compare-ingress-row")).toBeInTheDocument()
    expect(screen.getByText(/Application Load Balancer/)).toBeInTheDocument()
    expect(screen.getAllByText(/alon-prod-3tier-alb/).length).toBeGreaterThanOrEqual(1)
  })

  it("buildCompareArchitectureStory delegates to system architecture path model", () => {
    const { frames } = buildVpcFrames(
      twoVpcTopology.subnets,
      twoVpcNodes,
      OWN,
      [],
      [],
      true,
    )
    const story = buildCompareArchitectureStory(frames, "demo-system")
    expect(story).toMatch(/demo-system/)
    expect(story).toMatch(/Web Tier|Internet/)
    expect(story).toMatch(/shared/)
  })

  it("falls back to primary + peer strip when VPC count > 3", () => {
    const fourVpcTopology: VpcTopology = {
      ...twoVpcTopology,
      subnets: [
        ...twoVpcTopology.subnets,
        sn({ id: "sn-3", tier: "web", cidr: "10.2.0.0/24", vpc_id: PEER3 }),
        sn({ id: "sn-4", tier: "web", cidr: "10.3.0.0/24", vpc_id: PEER4 }),
      ],
    }
    const fourNodes = [
      ...twoVpcNodes,
      nd({ id: "i-3", type: "EC2", vpc_id: PEER3, subnet_id: "sn-3" }),
      nd({ id: "i-4", type: "EC2", vpc_id: PEER4, subnet_id: "sn-4" }),
    ]
    render(
      <AwsFrame
        vpcTopology={fourVpcTopology}
        nodes={fourNodes}
        mergedVpcView
        selectedNodeId={null}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByTestId("topology-primary-peer-strip")).toBeInTheDocument()
    expect(screen.getByTestId("topology-peer-vpc-cards")).toBeInTheDocument()
    expect(screen.queryByTestId("topology-vpc-compare-bands")).not.toBeInTheDocument()
  })
})
