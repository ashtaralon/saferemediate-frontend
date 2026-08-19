/// <reference types="vitest/globals" />
/**
 * Glance render — AwsFrame shows role hierarchy + cell collapse from real nodes only.
 */
import React from "react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { AwsFrame } from "@/components/topology-v0-2/aws-frame"
import type { SubnetMeta, TopologyNode, VpcTopology } from "@/components/topology-v0-2/types"
import type { TrafficEdge } from "@/lib/api-client"

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
        flowMode="architecture"
        onFlowModeChange={() => {}}
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
    // IGW + VPCEs share the network rail right of the VPC
    expect(screen.getByTestId("topology-network-rail")).toBeTruthy()
    expect(screen.getByTestId("topology-igw-rail-chip")).toBeTruthy()
    expect(screen.getByTestId("topology-users-internet-strip")).toBeTruthy()
    expect(screen.getByText("Users")).toBeTruthy()
    expect(screen.getByText("Internet")).toBeTruthy()
    expect(screen.queryByTestId("topology-configured-ingress")).toBeNull()
    expect(screen.getByText("Platform map")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Architecture" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Dependencies" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Attack paths" })).toBeTruthy()
    expect(screen.getAllByTestId("topology-resource-signal").length).toBeGreaterThan(0)
    // Jewel RDS named
    expect(screen.getByText("app-db")).toBeTruthy()
    // Regional / serverless grouped (real counts)
    expect(screen.getByTestId("topology-serverless-tier")).toBeTruthy()
    expect(screen.getByTestId("topology-regional-data-tier")).toBeTruthy()
  })

  it("renders configured DNS to edge to WAF to origin direction", () => {
    const ingressTopology: VpcTopology = {
      ...topology,
      edge_ingress_paths: [{
        id: "dns|edge|waf|ec2-1",
        dns: { id: "record-1", name: "www.example.com", type: "A" },
        edge: { id: "D111", name: "public-edge", type: "CloudFrontDistribution" },
        waf: { id: "waf-1", name: "edge-waf", type: "WAFWebACL" },
        origin: { id: "ec2-1", name: "web-1", type: "EC2" },
        authority_state: "configured",
        evidence_source: "aws_api",
      }],
    }
    render(
      <AwsFrame
        vpcTopology={ingressTopology}
        nodes={[nd({ id: "ec2-1", name: "web-1" })]}
        selectedNodeId={null}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByTestId("topology-configured-ingress")).toBeTruthy()
    expect(screen.getByText("Configured ingress")).toBeTruthy()
    expect(screen.getByText("www.example.com")).toBeTruthy()
    expect(screen.getByText("public-edge")).toBeTruthy()
    expect(screen.getByText("edge-waf")).toBeTruthy()
    expect(screen.getAllByLabelText("configured direction")).toHaveLength(3)
  })

  it("shows load-balancer listener routing and observed target health", () => {
    const alb = nd({
      id: "alb-1",
      name: "public-alb",
      type: "LoadBalancer",
      subnet_id: null,
      load_balancer: {
        id: "alb-1",
        name: "public-alb",
        dns_name: "public-alb.elb.amazonaws.com",
        scheme: "internet-facing",
        state: "active",
        listeners: [{
          id: "listener-443", protocol: "HTTPS", port: 443,
          target_group_ids: ["tg-1"], authority_state: "configured",
          evidence_source: "aws_elbv2_describe_listeners", last_seen: "2026-08-19T12:00:00Z",
        }],
        target_groups: [{
          id: "tg-1", name: "web-tg", protocol: "HTTP", port: 80,
          target_type: "instance", target_count: 2, healthy_target_count: 1,
          unhealthy_target_count: 1, initial_target_count: 0,
          draining_target_count: 0, unavailable_target_count: 0,
          authority_state: "observed", evidence_source: "aws_elbv2_describe_target_health",
          last_seen: "2026-08-19T12:00:00Z",
        }],
        authority_state: "configured",
        evidence_source: "aws_elbv2_describe_load_balancers",
        last_seen: "2026-08-19T12:00:00Z",
      },
    })
    render(
      <AwsFrame
        vpcTopology={{ ...topology, load_balancers: [alb.load_balancer!] }}
        nodes={[alb]}
        selectedNodeId={null}
        onSelect={() => {}}
      />,
    )
    const status = screen.getByTestId("topology-lb-operational-status")
    expect(status.textContent).toBe("HTTPS:443 · 1/2 healthy")
    expect(status.closest("button")?.getAttribute("title")).toContain("1 unhealthy")
  })

  it("toggles a provider-independent operational health overlay", () => {
    const healthy = nd({
      id: "ec2-healthy", name: "web-healthy",
      operational_health: {
        status: "healthy", summary: "Provider reports ready/available",
        raw_status: "running", source: "instance_state",
        authority_state: "observed", observed_at: "2026-08-19T12:00:00Z",
      },
    })
    const degraded = nd({
      id: "ec2-degraded", name: "web-degraded",
      operational_health: {
        status: "degraded", summary: "Provider reports a transitional state",
        raw_status: "pending", source: "instance_state",
        authority_state: "observed", observed_at: "2026-08-19T12:00:00Z",
      },
    })
    render(
      <AwsFrame
        vpcTopology={topology}
        nodes={[healthy, degraded]}
        flowMode="architecture"
        onFlowModeChange={() => {}}
        selectedNodeId={null}
        onSelect={() => {}}
        viewDensity="inventory"
      />,
    )
    expect(screen.queryByTestId("topology-operational-health-legend")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Health" }))
    expect(screen.getByTestId("topology-operational-health-legend").textContent).toContain("healthy · 1")
    expect(screen.getByTestId("topology-operational-health-legend").textContent).toContain("degraded · 1")
    const dots = screen.getAllByTestId("topology-operational-health-dot")
    expect(dots.map(dot => dot.getAttribute("data-health-status")).sort()).toEqual(["degraded", "healthy"])
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

  it("shows configured route direction and effective next hop in subnet chrome", () => {
    const routedTopology: VpcTopology = {
      ...topology,
      subnets: topology.subnets.map(subnet => subnet.id === "sn-web" ? {
        ...subnet,
        route_table_id: "rtb-main",
        effective_routes: [{
          route_key: "sn-web|ipv4|0.0.0.0/0|igw-1",
          subnet_id: "sn-web",
          route_table_id: "rtb-main",
          destination_type: "ipv4_cidr",
          destination: "0.0.0.0/0",
          target_type: "igw",
          target_id: "igw-1",
          target_name: "igw-main",
          route_state: "active",
          route_origin: "CreateRoute",
          authority_state: "configured",
          evidence_source: "aws_ec2_describe_route_tables",
          last_seen: "2026-08-19T12:00:00Z",
        }],
      } : subnet),
    }
    render(
      <AwsFrame
        vpcTopology={routedTopology}
        nodes={[nd({ id: "ec2-1", name: "web-1" })]}
        selectedNodeId={null}
        onSelect={() => {}}
        viewDensity="glance"
      />,
    )

    const routeChip = screen.getByTestId("topology-effective-route-chip")
    expect(routeChip.textContent).toContain("RT → igw-main")
    expect(routeChip.getAttribute("title")).toContain("rtb-main → igw-main")
  })

  it("shows effective NACL, security-group, and ENI controls per subnet", () => {
    const controlsTopology: VpcTopology = {
      ...topology,
      security_groups: [{
        id: "sg-public",
        name: "web-public",
        description: "public web ingress",
        has_public_ingress: true,
        high_risk_rule_count: 1,
        eni_count: 2,
      }],
      subnets: topology.subnets.map(subnet => subnet.id === "sn-web" ? {
        ...subnet,
        nacl: {
          id: "acl-web",
          name: "web-acl",
          vpc_id: VPC,
          is_default: false,
          total_rules: 8,
          inbound_deny_count: 1,
          outbound_deny_count: 1,
          has_public_inbound_allow: true,
          high_risk_rule_count: 0,
          associated_subnet_ids: ["sn-web"],
          authority_state: "configured",
          evidence_source: "aws_ec2_describe_network_acls",
          last_seen: "2026-08-19T12:00:00Z",
        },
        network_interface_count: 2,
        public_network_interface_count: 1,
        network_interface_ids: ["eni-1", "eni-2"],
        security_group_ids: ["sg-public"],
      } : subnet),
    }

    render(
      <AwsFrame
        vpcTopology={controlsTopology}
        nodes={[nd({ id: "ec2-1", name: "web-1", security_group_ids: ["sg-public"] })]}
        selectedNodeId={null}
        onSelect={() => {}}
        viewDensity="glance"
      />,
    )

    const controls = screen.getByTestId("topology-subnet-network-controls")
    expect(controls.textContent).toContain("NACL · web-acl")
    expect(controls.textContent).toContain("SG · 1 · 1 public")
    expect(controls.textContent).toContain("ENI · 2 · 1 public")
    expect(screen.getByText("NACL · web-acl").getAttribute("title")).toContain("8 ordered rules · 2 deny")
  })

  it("keeps observed traffic evidence visible when Architecture hides overlays", () => {
    const nodes: TopologyNode[] = [
      nd({ id: "ec2-source", name: "web-source" }),
      nd({ id: "ec2-target", name: "app-target" }),
    ]
    const trafficEdges: TrafficEdge[] = [{
      source_id: "ec2-source",
      target_id: "ec2-target",
      port: 443,
      protocol: "tcp",
      last_seen: "2026-08-19T01:00:00Z",
      edge_class: "internal",
    }]

    render(
      <AwsFrame
        vpcTopology={topology}
        nodes={nodes}
        trafficEdges={trafficEdges}
        overlayEdges={[]}
        flowMode="architecture"
        selectedNodeId={null}
        onSelect={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /Diagnostics.*1 flows/i }))
    const trafficHeading = screen.getByText("Observed traffic evidence")
    expect(trafficHeading.parentElement?.textContent).toContain("1 flow · 1 internal")
    expect(screen.getByText("web-source")).toBeTruthy()
    expect(screen.getByText("app-target")).toBeTruthy()
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
