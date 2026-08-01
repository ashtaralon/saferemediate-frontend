import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { iapPathsToConvergence } from "@/lib/attack-paths/iap-to-convergence"
import type { CrownJewelSummary, IdentityAttackPath } from "@/components/identity-attack-paths/types"

const ROOT = join(__dirname, "..", "..")

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
    },
    {
      id: jewel.id,
      name: jewel.name,
      type: "S3Bucket",
      tier: "crown_jewel",
      is_internet_exposed: false,
      lp_score: null,
      gap_count: 0,
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

describe("iapPathsToConvergence — helper may exist, must not paint maps", () => {
  it("still builds a convergence-shaped object for id matching (non-map)", () => {
    const conv = iapPathsToConvergence("alon-prod", jewel, [path])
    expect(conv.paths_total).toBe(1)
    expect(conv.paths[0]?.hops_load_state).toBe("fallback")
  })

  it("MUTATION: Attack Paths v2 must not assign iapPathsToConvergence into drawable data", () => {
    const src = readFileSync(
      join(ROOT, "components/attack-paths-v2/attack-paths-v2.tsx"),
      "utf8",
    )
    expect(src).not.toContain("iapPathsToConvergence")
    expect(src).toContain("Never paint IAP-synthesized topology")
  })

  it("MUTATION: convergence view refuse-draws on fallback (same Zoom0 contract)", () => {
    const src = readFileSync(
      join(ROOT, "components/attack-paths-v2/crown-jewel-convergence-view.tsx"),
      "utf8",
    )
    expect(src).toContain("convergence-fallback-map-blocked")
    expect(src).toContain("refusing to draw a synthetic map")
  })

  it("MUTATION: convergence-map-loader must block fallback paint", () => {
    const src = readFileSync(
      join(ROOT, "components/attack-paths-v2/convergence-map-loader.tsx"),
      "utf8",
    )
    expect(src).toContain("convergence-fallback-map-blocked")
    expect(src).not.toMatch(/return iapPathsToConvergence/)
    expect(src).not.toMatch(/source: "fallback" as const\}\s*\n\s*if \(iapFallback/)
  })
})
