/// <reference types="vitest/globals" />

import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { EstateSystemView } from "@/components/topology-v0-2/estate-system-view"
import {
  buildEstateCommandModel,
  estatePlaneForNode,
} from "@/components/topology-v0-2/estate-operations-model"
import type {
  NodeScore,
  TopologyNode,
  TopologyRiskResponse,
} from "@/components/topology-v0-2/types"

afterEach(() => cleanup())

function score(value: number, tier: NodeScore["tier"], exposed = false): NodeScore {
  return {
    value,
    tier,
    rank: 1,
    confidence: { value: 100, tier: "FULL", reasons: [] },
    contributors: [
      {
        signal: "network_exposure",
        weight: 0.3,
        value: exposed ? 1 : 0,
        evidence: {},
        freshness: { source: "flow_logs", as_of: "2026-08-05T00:00:00Z", is_fresh: true },
      },
    ],
  }
}

function node(input: Partial<TopologyNode> & Pick<TopologyNode, "id" | "name" | "type">): TopologyNode {
  return {
    subnet_id: null,
    score: score(20, "QUIET"),
    stale: null,
    is_jewel: false,
    account_id: "745783559495",
    region: "eu-west-1",
    vpc_id: "vpc-prod",
    ...input,
  }
}

const fixture: TopologyRiskResponse = {
  system: "payments-prod",
  scored_at: "2026-08-05T00:00:00Z",
  scoring_window_days: 90,
  vpc_id: "vpc-prod",
  selected_vpc_id: "vpc-prod",
  account_id: "745783559495",
  selected_account_id: "745783559495",
  region: "eu-west-1",
  selected_region_id: "eu-west-1",
  system_kpis: {
    workloads_total: 5,
    workloads_by_type: { LoadBalancer: 1, EC2: 1, RDS: 1, S3: 1, Lambda: 1 },
    flagged_count: 2,
    stale_workloads_count: 1,
    posture_coverage: { scored: 4, total: 5, by_type: {} },
    posture_freshness: {
      most_recent_run: "2026-08-05T00:00:00Z",
      age_days: 0,
      threshold_days: 2,
      is_fresh: true,
      auto_resolves_when: "the next posture run completes",
    },
  },
  nodes: [
    node({ id: "alb", name: "public-api", type: "LoadBalancer", subnet_id: "subnet-web-a", score: score(88, "HIGH", true) }),
    node({ id: "api", name: "payments-api", type: "EC2", subnet_id: "subnet-app-a", subnet_ids: ["subnet-app-a", "subnet-app-b"] }),
    node({ id: "db", name: "payments-db", type: "RDS", subnet_id: "subnet-data-a", is_jewel: true, score: score(62, "ELEVATED") }),
    node({ id: "bucket", name: "payments-archive", type: "S3", owner_systems: ["analytics-prod"], foreign_consumer_system_count: 1 }),
    node({ id: "worker", name: "legacy-worker", type: "Lambda", stale: { since: "2026-07-01", reason: "not seen in AWS" } }),
  ],
  vpc_topology: {
    region: "eu-west-1",
    account_id: "745783559495",
    vpc_id: "vpc-prod",
    azs: ["eu-west-1a", "eu-west-1b"],
    subnets: [
      { id: "subnet-web-a", name: "web-a", az: "eu-west-1a", cidr: "10.0.1.0/24", tier: "web", tier_source: "property", vpc_id: "vpc-prod" },
      { id: "subnet-app-a", name: "app-a", az: "eu-west-1a", cidr: "10.0.2.0/24", tier: "app", tier_source: "property", vpc_id: "vpc-prod" },
      { id: "subnet-app-b", name: "app-b", az: "eu-west-1b", cidr: "10.0.3.0/24", tier: "app", tier_source: "property", vpc_id: "vpc-prod" },
      { id: "subnet-data-a", name: "data-a", az: "eu-west-1a", cidr: "10.0.4.0/24", tier: "data", tier_source: "property", vpc_id: "vpc-prod" },
    ],
    edges: { igws: [], nat_gws: [], vpces: [] },
    unknown_subnet_count: 0,
    iam_roles: [
      {
        name: "payments-api-role",
        role_arn: "arn:aws:iam::745783559495:role/payments-api-role",
        allowed_actions: 20,
        used_actions: 4,
        unused_actions: 16,
        gap_percentage: 80,
        correlation_state: "correlated",
        last_remediated_at: null,
      },
    ],
  },
  traffic_edges: [
    { source_id: "alb", target_id: "api", port: 443, protocol: "tcp", last_seen: "2026-08-05T00:00:00Z" },
    { source_id: "api", target_id: "db", port: 5432, protocol: "tcp", last_seen: "2026-08-05T00:00:00Z" },
    { source_id: "api", target_id: "bucket", port: 443, protocol: "ACTUAL_S3_ACCESS", last_seen: "2026-08-05T00:00:00Z" },
  ],
  foreign_shared_access: [
    {
      foreign_system: "analytics-prod",
      consumer_id: "analytics-worker",
      consumer_name: "analytics-worker",
      consumer_kind: "Lambda",
      shared_resource_id: "bucket",
      shared_resource_name: "payments-archive",
      resource_kind: "S3",
      rel_type: "READS_FROM",
      evidence_tier: "observed",
      last_seen: "2026-08-05T00:00:00Z",
    },
  ],
}

describe("estate command model", () => {
  it("groups the estate into operational planes and derives only evidence-backed posture", () => {
    const model = buildEstateCommandModel(fixture)

    expect(model.planes.map(plane => [plane.id, plane.nodes.map(item => item.id)])).toEqual([
      ["edge", ["alb"]],
      ["runtime", ["api", "worker"]],
      ["data", ["db", "bucket"]],
      ["control", []],
    ])
    expect(model.posture).toMatchObject({
      activeResources: 4,
      relationships: 3,
      accounts: 1,
      regions: 1,
      vpcs: 1,
      availabilityZones: 2,
      exposedResources: 1,
      crownJewels: 1,
      multiAzResources: 1,
      singleAzStateful: 1,
      staleResources: 1,
      riskyRoles: 1,
      evidenceCoveragePct: 80,
    })
    expect(model.priorities.map(item => item.id)).toEqual(expect.arrayContaining([
      "risk:alb",
      "public-exposure",
      "single-az:db",
      "role:payments-api-role",
      "evidence-quality",
      "shared-boundary",
    ]))
  })

  it("classifies unknown managed services into the control plane without guessing placement", () => {
    expect(estatePlaneForNode(node({ id: "trail", name: "audit-trail", type: "CloudTrail" }))).toBe("control")
  })
})

describe("EstateSystemView", () => {
  it("presents one command map and keeps resource, role, traffic, and network drill-downs actionable", () => {
    const onSelectNode = vi.fn()
    const onSelectRole = vi.fn()
    const onShowNetwork = vi.fn()
    const onOpenTrafficMap = vi.fn()
    render(
      <EstateSystemView
        data={fixture}
        selectedNodeId={null}
        onSelectNode={onSelectNode}
        onSelectRole={onSelectRole}
        onShowNetwork={onShowNetwork}
        onOpenTrafficMap={onOpenTrafficMap}
      />,
    )

    expect(screen.getByText("Understand what runs, what it depends on, and where to act.")).toBeInTheDocument()
    expect(screen.getByTestId("estate-command-architecture-flow")).toBeInTheDocument()
    expect(screen.getByText("Edge & ingress")).toBeInTheDocument()
    expect(screen.getByText("Identity control plane")).toBeInTheDocument()

    fireEvent.click(screen.getByTestId("estate-command-resource-db"))
    expect(onSelectNode).toHaveBeenCalledWith("db")

    fireEvent.click(screen.getByTestId("estate-command-role-payments-api-role"))
    expect(onSelectRole).toHaveBeenCalledWith("payments-api-role")

    fireEvent.click(screen.getByRole("button", { name: /live traffic/i }))
    fireEvent.click(screen.getByRole("button", { name: /network placement/i }))
    expect(onOpenTrafficMap).toHaveBeenCalledTimes(1)
    expect(onShowNetwork).toHaveBeenCalledTimes(1)
  })

  it("changes the resource explanation when the operator changes lens", () => {
    render(
      <EstateSystemView
        data={fixture}
        selectedNodeId={null}
        onSelectNode={() => {}}
        onShowNetwork={() => {}}
      />,
    )

    fireEvent.click(screen.getByTestId("estate-command-lens-reliability"))
    expect(screen.getByText("2 AZs · 3 relationships")).toBeInTheDocument()

    fireEvent.click(screen.getByTestId("estate-command-lens-security"))
    expect(screen.getByText("internet path · risk 88")).toBeInTheDocument()
  })
})
