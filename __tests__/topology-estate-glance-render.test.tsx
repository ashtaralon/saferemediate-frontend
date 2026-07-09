/// <reference types="vitest/globals" />
/**
 * Glance render — AwsFrame shows role hierarchy + cell collapse from real nodes only.
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

const VPC = "vpc-aaaaaaaaaaaaaaaaa"

function sn(p: Partial<SubnetMeta> & Pick<SubnetMeta, "id">): SubnetMeta {
  return {
    name: p.id,
    az: "eu-west-1a",
    cidr: "10.0.1.0/24",
    tier: "web",
    tier_source: "property",
    vpc_id: VPC,
    ...p,
  }
}

function nd(p: Partial<TopologyNode> & Pick<TopologyNode, "id">): TopologyNode {
  return {
    name: p.name ?? p.id,
    type: "EC2",
    subnet_id: "sn-web",
    vpc_id: VPC,
    score: null,
    stale: null,
    is_jewel: false,
    ...p,
  }
}

const topology: VpcTopology = {
  region: "eu-west-1",
  account_id: "111122223333",
  vpc_id: VPC,
  azs: ["eu-west-1a"],
  subnets: [
    sn({ id: "sn-web", tier: "web" }),
    sn({ id: "sn-app", tier: "app", cidr: "10.0.10.0/24" }),
    sn({ id: "sn-data", tier: "data", cidr: "10.0.20.0/24" }),
  ],
  security_groups: [],
  iam_roles: [],
  edges: {
    igws: [{ id: "igw-1", name: "igw-main" }],
    nat_gws: [{ id: "nat-1", name: "nat-a", subnet_id: null }],
    vpces: [],
  },
  unknown_subnet_count: 0,
}

describe("AwsFrame Glance density (generic)", () => {
  it("collapses excess EC2 in a cell to +N stack tiles from real nodes", () => {
    const nodes: TopologyNode[] = [
      nd({ id: "ec2-1", name: "web-1" }),
      nd({ id: "ec2-2", name: "web-2" }),
      nd({ id: "ec2-3", name: "web-3" }),
      nd({ id: "ec2-4", name: "web-4" }),
      nd({ id: "ec2-5", name: "web-5" }),
      nd({ id: "alb-1", name: "entry-alb", type: "LoadBalancer", subnet_id: null }),
      nd({ id: "rds-1", name: "app-db", type: "RDS", subnet_id: "sn-data", is_jewel: true }),
      nd({ id: "lam-1", name: "fn-a", type: "Lambda", subnet_id: null, vpc_id: null }),
      nd({ id: "lam-2", name: "fn-b", type: "Lambda", subnet_id: null, vpc_id: null }),
      nd({ id: "s3-1", name: "bucket-a", type: "S3", subnet_id: null, vpc_id: null }),
      nd({ id: "s3-2", name: "bucket-b", type: "S3", subnet_id: null, vpc_id: null }),
    ]

    render(
      <AwsFrame
        vpcTopology={topology}
        nodes={nodes}
        serverlessSourceNodes={nodes}
        regionalDataSourceNodes={nodes}
        selectedNodeId={null}
        onSelect={() => {}}
        viewDensity="glance"
      />,
    )

    const glanceCells = screen.getAllByTestId("topology-cell-glance")
    expect(glanceCells.length).toBeGreaterThan(0)
    // Web cell: 5 real EC2 → ONE service stack with depth (not 5 chips)
    const serviceStacks = screen.getAllByTestId("topology-service-stack")
    expect(serviceStacks.length).toBeGreaterThan(0)
    const ec2Stack = serviceStacks.find(el => el.getAttribute("data-stack-type") === "EC2")
    expect(ec2Stack).toBeTruthy()
    expect(ec2Stack!.getAttribute("data-stack-count")).toBe("5")
    // Regional / serverless rails still use density stack tiles
    const railStacks = screen.getAllByTestId("topology-density-stack-tile")
    expect(railStacks.length).toBeGreaterThan(0)
    // Gateway ALB from real node
    expect(screen.getByTestId("topology-alb-band")).toBeTruthy()
    expect(screen.getByText("entry-alb")).toBeTruthy()
    // NAT from real edge metadata
    expect(screen.getByTestId("topology-nat-gateway-chip")).toBeTruthy()
    // Jewel RDS named
    expect(screen.getByText("app-db")).toBeTruthy()
    // Regional / serverless grouped (real counts)
    expect(screen.getByTestId("topology-serverless-tier")).toBeTruthy()
    expect(screen.getByTestId("topology-regional-data-tier")).toBeTruthy()
  })

  it("single-VPC Glance uses AWS AZ-column grammar", () => {
    const nodes: TopologyNode[] = [
      nd({ id: "ec2-1", name: "web-1" }),
      nd({ id: "rds-1", name: "app-db", type: "RDS", subnet_id: "sn-data", is_jewel: true }),
    ]
    render(
      <AwsFrame
        vpcTopology={topology}
        nodes={nodes}
        selectedNodeId={null}
        onSelect={() => {}}
        viewDensity="glance"
      />,
    )
    expect(screen.getByTestId("topology-aws-az-columns")).toBeTruthy()
    expect(screen.getByTestId("topology-az-column-eu-west-1a")).toBeTruthy()
  })

  it("inventory mode shows one small icon per real node (no ×N collapse)", () => {
    const nodes: TopologyNode[] = [
      nd({ id: "ec2-1", name: "web-1" }),
      nd({ id: "ec2-2", name: "web-2" }),
      nd({ id: "ec2-3", name: "web-3" }),
    ]
    render(
      <AwsFrame
        vpcTopology={topology}
        nodes={nodes}
        selectedNodeId={null}
        onSelect={() => {}}
        viewDensity="inventory"
      />,
    )
    expect(screen.queryByTestId("topology-cell-glance")).toBeNull()
    expect(screen.getByTestId("topology-cell-inventory")).toBeTruthy()
    const icons = screen.getAllByTestId("topology-service-node-icon")
    expect(icons.length).toBe(3)
    expect(screen.getByText("web-1")).toBeTruthy()
    expect(screen.getByText("web-2")).toBeTruthy()
    expect(screen.getByText("web-3")).toBeTruthy()
    // No Glance stack collapse in Inventory
    expect(screen.queryByTestId("topology-service-stack")).toBeNull()
  })
})
