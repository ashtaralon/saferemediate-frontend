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
import { resolveCoverageGaps, unnamedCounters } from "@/components/topology-v0-2/coverage-gaps"
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
    {
      code: "non_vpc_lambda_edges_rejected",
      lane: "serverless",
      count: 1,
      message: "1 observed segment(s) named a Lambda function that runs outside the VPC; the segment is not drawn.",
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
    ...(laneCoverage
      ? {
          lane_coverage: laneCoverage,
          coverage_gaps: laneCoverage.warnings,
        }
      : {}),
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
    const warnings = within(pill).getAllByTestId("topology-coverage-gap")
    expect(within(pill).getByTestId("topology-coverage-gaps")).toBeTruthy()
    expect(warnings).toHaveLength(3)
    expect(warnings[0]).toHaveAttribute("data-warning-code", "lambda_to_database_not_collected")
    expect(warnings[0]).toHaveTextContent("Lambda: Lambda → database: not collected.")
    expect(warnings[1]).toHaveTextContent("not evidence of no traffic")
    expect(warnings[2]).toHaveAttribute("data-warning-code", "non_vpc_lambda_edges_rejected")
    expect(warnings[2]).toHaveAttribute("data-warning-count", "1")
  })

  it("names every non-zero rejected or projection counter from coverage_gaps", () => {
    const gaps = resolveCoverageGaps(authority(coverage))
    expect(unnamedCounters(coverage, gaps)).toEqual([])
    expect(unnamedCounters(
      { ...coverage, rejected_edges: { non_vpc_lambda_edges: 4 } },
      gaps,
    )).toEqual(["non_vpc_lambda_edges"])
  })

  // C1 production, 2026-09-10: `testbed-webshop` served mode=legacy with no
  // active generation, and the pill rendered a red "NOT COVERED · 0 of 14
  // eligible endpoints covered · In-VPC 0/9 · Database 0/5". None of those
  // numbers was measured — the backend's `authoritative` counter is gated on the
  // projection being active, so its zero is a counter that never ran. Red plus a
  // fraction is a verdict; the honest render states the denominator and says the
  // measurement was not taken. BE >= topology-risk/v10 sends `not_computed`.
  describe("canonical projection inactive — not measured, not a zero verdict", () => {
    const dark: LaneCoverage = {
      basis: "vpc_flow_logs",
      mode: "legacy",
      active_generation: null,
      state: "not_computed",
      eligible: 14,
      authoritative: 0,
      unknown: 0,
      not_applicable: 16,
      by_lane: {
        vpc: { eligible: 9, authoritative: 0, unknown: 0, not_applicable: 0, state: "not_computed" },
        serverless: { eligible: 0, authoritative: 0, unknown: 0, not_applicable: 6, state: "not_applicable" },
        database: { eligible: 5, authoritative: 0, unknown: 0, not_applicable: 0, state: "not_computed" },
        regional: { eligible: 0, authoritative: 0, unknown: 0, not_applicable: 10, state: "not_applicable" },
      },
      warnings: [
        {
          code: "canonical_projection_inactive",
          lane: "vpc",
          count: 14,
          message:
            "The canonical flow-log projection is not active for this scope (mode legacy), so coverage of the 14 eligible endpoint(s) is not measured. This is not a finding of zero coverage: no endpoint was examined.",
        },
      ],
    }

    it("says not measured, never 'not covered', and shows no covered fraction", () => {
      renderFrame({ flowMode: "all_access", laneCoverage: dark })
      const pill = screen.getByTestId("topology-lane-coverage")
      expect(pill).toHaveAttribute("data-coverage-state", "not_computed")
      expect(within(pill).getByTestId("topology-lane-coverage-state")).toHaveTextContent("Not measured")
      const totals = within(pill).getByTestId("topology-lane-coverage-totals")
      expect(totals).toHaveTextContent("14 eligible endpoints, coverage not measured · 16 not applicable")
      // The exact strings the red pill showed on C1 must be gone.
      expect(totals.textContent).not.toContain("0 of 14")
      expect(totals.textContent).not.toContain("covered")
      expect(pill.textContent).not.toContain("Not covered")
      // A neutral chip, not the red "none" palette. (Assert the hex the
      // component actually sets — an rgb() form here passes vacuously.)
      expect(pill.getAttribute("style")).not.toContain("#FEF2F2")
      expect(pill.getAttribute("style")).toContain("#F1F5F9")
    })

    it("states each lane's eligible count instead of a 0/N fraction", () => {
      renderFrame({ flowMode: "all_access", laneCoverage: dark })
      const pill = screen.getByTestId("topology-lane-coverage")
      const vpc = within(pill).getByTestId("topology-lane-coverage-vpc")
      const db = within(pill).getByTestId("topology-lane-coverage-database")
      expect(vpc).toHaveAttribute("data-lane-state", "not_computed")
      expect(vpc).toHaveTextContent("In-VPC 9 not measured")
      expect(vpc.textContent).not.toContain("0/9")
      expect(vpc.getAttribute("title")).toContain("covered not measured (projection inactive)")
      expect(db).toHaveTextContent("Database 5 not measured")
      expect(db.textContent).not.toContain("0/5")
      // Lanes classified before the instrument is consulted are untouched.
      expect(within(pill).getByTestId("topology-lane-coverage-serverless")).toHaveTextContent("Lambda 6 n/a")
      expect(within(pill).getByTestId("topology-lane-coverage-regional")).toHaveTextContent("Regional 10 n/a")
    })

    it("still names the reason as a gap the operator can read", () => {
      renderFrame({ flowMode: "all_access", laneCoverage: dark })
      const pill = screen.getByTestId("topology-lane-coverage")
      const gaps = within(pill).getAllByTestId("topology-coverage-gap")
      expect(gaps).toHaveLength(1)
      expect(gaps[0]).toHaveAttribute("data-warning-code", "canonical_projection_inactive")
      expect(gaps[0]).toHaveTextContent("is not measured")
      expect(gaps[0]).toHaveTextContent("no endpoint was examined")
    })

    it("keeps the red 'Not covered' verdict for a projection that IS active", () => {
      // The discriminator. Generation pinned, endpoints examined, none covered —
      // that is a real finding and must stay visually distinct from the dark case.
      const measuredZero: LaneCoverage = {
        ...dark,
        mode: "incremental",
        active_generation: 7,
        state: "none",
        by_lane: {
          ...dark.by_lane,
          vpc: { eligible: 9, authoritative: 0, unknown: 0, not_applicable: 0, state: "none" },
          database: { eligible: 5, authoritative: 0, unknown: 0, not_applicable: 0, state: "none" },
        },
        warnings: [],
      }
      renderFrame({ flowMode: "all_access", laneCoverage: measuredZero })
      const pill = screen.getByTestId("topology-lane-coverage")
      expect(pill).toHaveAttribute("data-coverage-state", "none")
      expect(within(pill).getByTestId("topology-lane-coverage-state")).toHaveTextContent("Not covered")
      expect(within(pill).getByTestId("topology-lane-coverage-totals")).toHaveTextContent(
        "0 of 14 eligible endpoints covered",
      )
      expect(within(pill).getByTestId("topology-lane-coverage-vpc")).toHaveTextContent("In-VPC 0/9")
      // Red palette retained for the case that earned it.
      expect(pill.getAttribute("style")).toContain("#FEF2F2")
    })
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
