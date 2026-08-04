import React from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/dynamic", () => ({
  default: () =>
    function TrafficFlowMapStub() {
      return <div data-testid="traffic-flow-map-stub">interactive flow map</div>
    },
}))

import { AtlasLateralFlowMap } from "@/components/attack-paths-v2/atlas-lateral-flow-map"
import type {
  AtlasFootholdCandidate,
  AtlasLateralResponse,
} from "@/components/attack-paths-v2/use-atlas-lateral"

const foothold: AtlasFootholdCandidate = {
  workload_id: "i-123",
  workload_name: "payments-api",
  workload_type: "EC2Instance",
  role_arn: "arn:aws:iam::1:role/App",
  role_name: "App",
  foothold_likelihood: "ASSUMED_COMPROMISE",
  foothold_reasons: ["test foothold"],
  observed_access_to_jewel: false,
  access_last_seen: null,
  security_group_ids: [],
}

const response: AtlasLateralResponse = {
  chains: [
    {
      chain_id: "chain-1",
      steps: [
        {
          step_index: 0,
          primitive_id: "HAS_INSTANCE_PROFILE_CAPTURE",
          state_delta: {
            added_compromised_workloads: [],
            added_captured_identities: ["arn:aws:iam::1:role/App"],
            added_accessible_resources: [],
            added_synthetic_edges: [],
            added_synthetic_nodes: [],
          },
          edge_evidence_ids: ["edge-role"],
        },
        {
          step_index: 1,
          primitive_id: "S3_GETOBJECT_DATA_ACCESS",
          state_delta: {
            added_compromised_workloads: [],
            added_captured_identities: [],
            added_accessible_resources: ["prod-data"],
            added_synthetic_edges: [],
            added_synthetic_nodes: [],
          },
          edge_evidence_ids: ["edge-data"],
        },
      ],
      total_cost: 2,
      feasibility_score: 1,
      primitives_used: ["HAS_INSTANCE_PROFILE_CAPTURE", "S3_GETOBJECT_DATA_ACCESS"],
      blocking_controls: [],
      assumptions_consumed: ["initial_foothold_compromised"],
      reachable_damage: {
        target_id: "prod-data",
        target_name: "prod-data",
        target_type: "S3Bucket",
        reachability: {
          verdict: "UNKNOWN",
          basis: "MODELED",
          scope: "prod-data",
          as_of: null,
          evidence_ids: ["edge-data"],
          assumptions: ["initial_foothold_compromised"],
          missing_evidence: ["scp_not_evaluated"],
        },
        operations: [
          {
            action: "s3:DeleteObject",
            damage_type: "delete",
            effect: "Delete scoped objects.",
            resource_scope: "prod-data",
            claim: {
              verdict: "UNKNOWN",
              basis: "MODELED",
              scope: "prod-data",
              as_of: null,
              evidence_ids: ["edge-data"],
              assumptions: [],
              missing_evidence: ["scp_not_evaluated"],
            },
          },
        ],
        damage_types: ["delete"],
        priority_score: 58,
        severity: "HIGH",
        scoring_model: "materialized_path_v1",
        deterministic_summary: "A modeled candidate could delete scoped objects.",
        choke_point: {
          step_index: 1,
          primitive_id: "S3_GETOBJECT_DATA_ACCESS",
          action: "s3:DeleteObject",
          identity_id: "arn:aws:iam::1:role/App",
          intent: "Scope s3:DeleteObject on the App role away from prod-data.",
          expected_effect: "Break the projected operation.",
        },
        narration: {
          executive: "A modeled candidate could delete scoped objects.",
          operator: "Authorization remains incomplete.",
          remediation_intent: "Scope the App role.",
          source: "deterministic_floor",
          verified: true,
          verification_reason: "supported",
        },
      },
    },
  ],
  dead_ends: [],
  coverage_warnings: [],
  engine_version: "test",
  catalog_version: "test",
  assumption_set_version: "test",
  graph_snapshot_id: "snapshot",
  elapsed_ms: 5,
}

describe("ATLAS reachable-damage UI", () => {
  it("renders exact impact, uncertainty, remediation and the canonical map", () => {
    render(
      <AtlasLateralFlowMap
        selectedFoothold={foothold}
        response={response}
        jewelName="prod-data"
        jewelId="prod-data"
        jewelType="S3Bucket"
        systemName="prod"
      />,
    )

    expect(screen.getByTestId("atlas-reachable-damage")).toHaveTextContent("58/100 · HIGH")
    expect(screen.getByTestId("atlas-reachable-damage")).toHaveTextContent("UNKNOWN · MODELED")
    expect(screen.getByTestId("atlas-reachable-damage")).toHaveTextContent("s3:DeleteObject · delete")
    expect(screen.getByTestId("atlas-reachable-damage")).toHaveTextContent("scp_not_evaluated")
    expect(screen.getByTestId("atlas-reachable-damage")).toHaveTextContent("Scope s3:DeleteObject")
    expect(screen.getByTestId("traffic-flow-map-stub")).toBeInTheDocument()
  })
})
