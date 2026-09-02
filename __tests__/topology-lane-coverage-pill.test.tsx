/// <reference types="vitest/globals" />
/**
 * Flow-log coverage pill (traffic_authority.lane_coverage, BE >= topology-risk/v8).
 *
 * The pill shows the backend's honest denominator — eligible / authoritative /
 * unknown / not applicable per lane — and its lane warnings verbatim. It must
 * render nothing when the backend predates the contract: an absent number is
 * honest, an invented one is not. Inputs here are test doubles for the
 * contract shape, not product data.
 */
import React from "react"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"

import { AwsFrame } from "@/components/topology-v0-2/aws-frame"
import type {
  LaneCoverage,
  SubnetMeta,
  TopologyNode,
  TopologyRiskResponse,
  VpcTopology,
} from "@/components/topology-v0-2/types"

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
  subnets: [sn({ id: "subnet-web-1a", tier: "web" })],
  edges: { igws: [], nat_gws: [], vpces: [] },
  unknown_subnet_count: 0,
  security_groups: [],
  iam_roles: [],
}
const nodes: TopologyNode[] = [
  nd({ id: "i-web", type: "EC2", vpc_id: VPC, subnet_id: "subnet-web-1a" }),
  nd({ id: "fn-a", name: "cyntro-tb-prod-consumer-a", type: "Lambda" }),
  nd({ id: "arn:aws:s3:::cyntro-tb-prod-appdata", name: "cyntro-tb-prod-appdata", type: "S3" }),
]

const coverage: LaneCoverage = {
  basis: "vpc_flow_logs",
  mode: "incremental",
  active_generation: 7,
  state: "partial",
  eligible: 3,
  authoritative: 2,
  unknown: 1,
  not_applicable: 3,
  by_lane: {
    vpc: { eligible: 2, authoritative: 1, unknown: 0, not_applicable: 0, state: "partial" },
    serverless: { eligible: 0, authoritative: 0, unknown: 1, not_applicable: 1, state: "unknown" },
    database: { eligible: 1, authoritative: 1, unknown: 0, not_applicable: 0, state: "authoritative" },
    regional: { eligible: 0, authoritative: 0, unknown: 0, not_applicable: 2, state: "not_applicable" },
  },
  projection: {
    unclassified_external_targets: 3,
    unclassified_external_sources: 0,
    igw_to_database_rejected: 0,
    unresolved_pairs: 0,
  },
  rejected_edges: { non_vpc_lambda_edges: 1 },
  warnings: [
    {
      code: "lambda_to_database_not_collected",
      lane: "serverless",
      count: 1,
      message: "Lambda → database: not collected. 1 function(s) run outside the VPC, so no flow log or CloudTrail data event observes their connections to the 1 database(s) in scope.",
    },
    {
      code: "egress_destinations_unclassified",
      lane: "vpc",
      count: 3,
      message: "3 observed segment(s) leave the VPC toward endpoints the classifier has not labelled; they are not drawn. A missing arrow here is not evidence of no traffic.",
    },
  ],
}

function authority(laneCoverage?: LaneCoverage): NonNullable<TopologyRiskResponse["traffic_authority"]> {
  return {
    state: "authoritative_positive_only",
    mode: "incremental",
    active_generation: 7,
    window_days: 90,
    authoritative_endpoint_count: 3,
    endpoint_count: 3,
    limitation: "Confirmed TCP segments are authoritative; a missing segment is not evidence of no traffic.",
    ...(laneCoverage ? { lane_coverage: laneCoverage } : {}),
  }
}

function renderFrame(props: { flowMode: "all_access" | "architecture"; laneCoverage?: LaneCoverage }) {
  return render(
    <AwsFrame
      vpcTopology={vpcTopology}
      nodes={nodes}
      mergedVpcView={false}
      presentationMode={false}
      viewDensity="inventory"
      selectedNodeId={null}
      onSelect={() => {}}
      flowMode={props.flowMode}
      onFlowModeChange={() => {}}
      trafficAuthority={authority(props.laneCoverage)}
    />,
  )
}

describe("flow-log coverage pill", () => {
  it("shows the backend's honest denominator, every lane, and the warnings verbatim", () => {
    renderFrame({ flowMode: "all_access", laneCoverage: coverage })
    const pill = screen.getByTestId("topology-lane-coverage")
    expect(pill).toHaveAttribute("data-coverage-state", "partial")
    expect(within(pill).getByTestId("topology-lane-coverage-state")).toHaveTextContent("Partly covered")
    expect(within(pill).getByTestId("topology-lane-coverage-totals")).toHaveTextContent(
      "2 of 3 eligible endpoints covered · 1 unknown · 3 not applicable · generation 7",
    )
    expect(within(pill).getByTestId("topology-lane-coverage-vpc")).toHaveTextContent("In-VPC 1/2")
    expect(within(pill).getByTestId("topology-lane-coverage-database")).toHaveTextContent("Database 1/1")
    expect(within(pill).getByTestId("topology-lane-coverage-serverless")).toHaveTextContent("Lambda 1 unknown")
    expect(within(pill).getByTestId("topology-lane-coverage-regional")).toHaveTextContent("Regional 2 n/a")
    const warnings = within(pill).getAllByTestId("topology-lane-coverage-warning")
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toHaveAttribute("data-warning-code", "lambda_to_database_not_collected")
    expect(warnings[0]).toHaveTextContent("Lambda: Lambda → database: not collected.")
    expect(warnings[1]).toHaveTextContent("not evidence of no traffic")
  })

  it("renders nothing when the backend predates the contract", () => {
    renderFrame({ flowMode: "all_access" })
    expect(screen.queryByTestId("topology-lane-coverage")).toBeNull()
  })

  it("is a Dependencies-lens element only", () => {
    renderFrame({ flowMode: "architecture", laneCoverage: coverage })
    expect(screen.queryByTestId("topology-lane-coverage")).toBeNull()
  })
})
