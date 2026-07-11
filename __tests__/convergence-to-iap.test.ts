import { describe, expect, it } from "vitest"
import { convergencePathsToIdentityAttackPaths } from "@/lib/attack-paths/convergence-to-iap"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import type { ConvergencePath } from "@/lib/attack-paths/convergence-types"

const jewel: CrownJewelSummary = {
  id: "arn:aws:s3:::bucket",
  canonical_id: "arn:aws:s3:::bucket",
  name: "bucket",
  type: "S3Bucket",
  severity: "HIGH",
  path_count: 2,
  highest_risk_score: 70,
  is_internet_exposed: false,
  data_classification: null,
  priority_score: 70,
}

describe("convergencePathsToIdentityAttackPaths", () => {
  it("builds list-ready IAP stubs from summary paths", () => {
    const paths: ConvergencePath[] = [
      {
        path_id: "ap-1",
        source: "i-abc",
        source_kind: "EC2Instance",
        workload_arn: "arn:aws:ec2:us-east-1:1:instance/i-abc",
        identity: "arn:aws:iam::1:role/r1",
        identity_name: "r1",
        damage: ["s3:GetObject"],
        score: 70,
        severity: "HIGH",
        confidence: "observed",
        hop_count: 3,
      },
    ]
    const out = convergencePathsToIdentityAttackPaths(jewel, paths)
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe("ap-1")
    expect(out[0].crown_jewel_id).toBe(jewel.canonical_id)
    expect(out[0].evidence_type).toBe("observed")
    expect(out[0].nodes.length).toBeGreaterThanOrEqual(2)
    expect(out[0].nodes.some((n) => n.tier === "crown_jewel")).toBe(true)
  })
})
