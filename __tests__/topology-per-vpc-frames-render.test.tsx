/// <reference types="vitest/globals" />
/**
 * AwsFrame render smoke test for the merged per-VPC frames (FE #299/#301
 * follow-up). Payload shape mirrors the live alon-prod merged topology-risk
 * response: vpc-0329 (10.0.x, own subnets) + vpc-086 (172.31.x, co-tenant
 * `payment-production` subnets that alon-prod's workloads occupy). The merged
 * canvas must render TWO VPC frames, each with its real subnet skeleton.
 */
import React from "react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { AwsFrame } from "@/components/topology-v0-2/aws-frame"
import type { SubnetMeta, TopologyNode, VpcTopology } from "@/components/topology-v0-2/types"

beforeAll(() => {
  // FlowOverlay observes the container; happy-dom lacks ResizeObserver.
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

function sn(p: Partial<SubnetMeta> & Pick<SubnetMeta, "id">): SubnetMeta {
  return { name: p.id, az: "eu-west-1a", cidr: "10.0.0.0/24", tier: "web", tier_source: "property", vpc_id: OWN, ...p }
}
function nd(p: Partial<TopologyNode> & Pick<TopologyNode, "id">): TopologyNode {
  return { name: p.id, type: "EC2", subnet_id: null, score: null, stale: null, is_jewel: false, ...p }
}

const vpcTopology: VpcTopology = {
  region: "eu-west-1",
  account_id: "745783559495",
  vpc_id: OWN,
  azs: ["eu-west-1a", "eu-west-1b"],
  subnets: [
    sn({ id: "sn-web", tier: "web", cidr: "10.0.1.0/24", vpc_id: OWN, owner_system_name: "alon-prod", is_foreign: false }),
    sn({ id: "sn-app", tier: "app", cidr: "10.0.10.0/24", vpc_id: OWN, owner_system_name: "alon-prod", is_foreign: false }),
    sn({ id: "sn-086-a", tier: "web", cidr: "172.31.16.0/20", vpc_id: SHARED, owner_system_name: "payment-production", is_foreign: true }),
    sn({ id: "sn-086-b", az: "eu-west-1b", tier: "web", cidr: "172.31.32.0/20", vpc_id: SHARED, owner_system_name: "payment-production", is_foreign: true }),
  ],
  edges: { igws: [], nat_gws: [], vpces: [] },
  unknown_subnet_count: 0,
  security_groups: [],
  iam_roles: [],
}

const nodes = [
  nd({ id: "i-own", type: "EC2", vpc_id: OWN, subnet_id: "sn-app" }),
  nd({ id: "i-086", type: "EC2", vpc_id: SHARED, subnet_id: "sn-086-a" }),
]

describe("AwsFrame All VPCs · Compare renders both VPCs", () => {
  it("draws both VPC column headers and the foreign badge", () => {
    render(
      <AwsFrame
        vpcTopology={vpcTopology}
        nodes={nodes}
        mergedVpcView
        selectedNodeId={null}
        onSelect={() => {}}
      />,
    )
    // Layout B compare bands — not a single merged masquerade frame.
    expect(screen.getByTestId("topology-vpc-compare-bands")).toBeInTheDocument()
    // Full VPC ids are visible in the column chrome (not truncated away).
    expect(screen.getByText(OWN)).toBeInTheDocument()
    expect(screen.getByText(SHARED)).toBeInTheDocument()
    // The co-tenant VPC is badged + titled by owner system. The owner name
    // renders in >1 place (the shared-VPC badge AND the "System path" story
    // "1 shared (payment-production)"), so assert presence, not uniqueness —
    // getByText throws on multiple matches.
    expect(screen.getByText(/^shared$/i)).toBeInTheDocument()
    expect(screen.getAllByText("payment-production").length).toBeGreaterThan(0)
  })

  it("scoped view renders a single VPC frame", () => {
    render(
      <AwsFrame
        vpcTopology={vpcTopology}
        nodes={nodes}
        mergedVpcView={false}
        selectedNodeId={null}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByText(new RegExp(OWN))).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(SHARED))).not.toBeInTheDocument()
  })

  it("fullscreen presentation uses region fill grid so VPC takes leftover width", () => {
    render(
      <AwsFrame
        vpcTopology={vpcTopology}
        nodes={nodes}
        mergedVpcView={false}
        presentationMode
        selectedNodeId={null}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByTestId("topology-region-fill-grid")).toBeInTheDocument()
    expect(screen.getByTestId("topology-single-vpc-grid")).toBeInTheDocument()
  })
})
