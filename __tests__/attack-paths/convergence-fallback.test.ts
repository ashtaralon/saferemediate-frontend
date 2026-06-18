import { describe, expect, it } from "vitest"
import { convergenceToTargetTopology } from "@/lib/attack-paths/convergence-to-target-topology"
import { iapPathsToConvergence } from "@/lib/attack-paths/iap-to-convergence"
import type { CrownJewelSummary, IdentityAttackPath } from "@/components/identity-attack-paths/types"

const jewel: CrownJewelSummary = {
  id: "arn:aws:s3:::demo-bucket",
  name: "demo-bucket",
  type: "S3Bucket",
  severity: "HIGH",
  path_count: 2,
  highest_risk_score: 70,
  is_internet_exposed: false,
  data_classification: null,
  priority_score: 50,
}

const path: IdentityAttackPath = {
  id: "iap-path-1",
  attack_path_id: "mat-path-abc",
  crown_jewel_id: jewel.id,
  nodes: [
    {
      id: "i-123",
      name: "web-server",
      type: "EC2Instance",
      tier: "entry",
      lane: "compute",
      is_internet_exposed: true,
      lp_score: null,
      gap_count: 0,
      remediation: null,
      internet_exposure_alert: null,
      subnet_is_public: true,
    },
    {
      id: "arn:aws:iam::1:role/AppRole",
      name: "AppRole",
      type: "IAMRole",
      tier: "identity",
      is_internet_exposed: false,
      lp_score: null,
      gap_count: 0,
      remediation: null,
      internet_exposure_alert: null,
    },
    {
      id: jewel.id,
      name: jewel.name,
      type: "S3Bucket",
      tier: "crown_jewel",
      is_internet_exposed: false,
      lp_score: null,
      gap_count: 0,
      remediation: null,
      internet_exposure_alert: null,
    },
  ],
  edges: [],
  severity: {
    overall_score: 65,
    severity: "HIGH",
    impact: 0,
    internet_exposure: 0,
    permission_breadth: 0,
    data_sensitivity: 0,
    identity_chain: 0,
    network_controls: 0,
    weights: {
      impact: 0,
      internet_exposure: 0,
      permission_breadth: 0,
      data_sensitivity: 0,
      identity_chain: 0,
      network_controls: 0,
    },
  },
  path_kind: "behavioral",
  evidence_type: "observed",
  hop_count: 3,
}

describe("iapPathsToConvergence", () => {
  it("builds hops and renders a non-empty topology", () => {
    const conv = iapPathsToConvergence("alon-prod", jewel, [path])
    expect(conv.paths_total).toBe(1)
    const topo = convergenceToTargetTopology(conv, null)
    expect(topo.nodes.length).toBeGreaterThanOrEqual(3)
    expect(topo.edges.length).toBeGreaterThanOrEqual(2)
  })

  it("falls back to all paths when selected id is an IAP id", () => {
    const conv = iapPathsToConvergence("alon-prod", jewel, [path])
    const topo = convergenceToTargetTopology(conv, "iap-path-1")
    expect(topo.nodes.length).toBeGreaterThan(0)
  })
})
