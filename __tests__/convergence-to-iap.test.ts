import { describe, expect, it } from "vitest"
import { convergencePathsToIdentityAttackPaths } from "@/lib/attack-paths/convergence-to-iap"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import type { ConvergencePath } from "@/lib/attack-paths/convergence-types"
import { compileZoom0Projection } from "@/components/attack-paths-v2/reachable-damage-priority"

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

  it("preserves SERVE gates and damage so Zoom0 does not label VPC paths IAM-only", () => {
    const paths: ConvergencePath[] = [
      {
        path_id: "ap-ec2",
        source: "SafeRemediate-Test-App-2",
        source_kind: "EC2Instance",
        identity: "arn:aws:iam::1:role/r1",
        identity_name: "r1",
        damage: ["delete", "read", "write"],
        score: 75,
        severity_label: "CRITICAL",
        confidence: "configured",
        identity_gate: "OPEN_OBSERVED",
        route_gate: "OPEN_CONFIG",
        data_plane_gate: "OPEN_CONFIG",
        path_status: "POTENTIAL_EXCESS",
        hop_count: 5,
      },
    ]
    const out = convergencePathsToIdentityAttackPaths(jewel, paths)
    expect(out[0].damage_types).toEqual(["delete", "read", "write"])
    expect(out[0].materialized_path).toMatchObject({
      identity_gate: "OPEN_OBSERVED",
      route_gate: "OPEN_CONFIG",
      data_plane_gate: "OPEN_CONFIG",
      damage_types: ["delete", "read", "write"],
      workload_name: "SafeRemediate-Test-App-2",
      role_name: "r1",
    })
    expect(out[0].damage_capability?.materialized_damage_types).toEqual([
      "delete",
      "read",
      "write",
    ])
    const proj = compileZoom0Projection(out[0], jewel)
    expect(proj.layers.network).toBe("config-open")
    // identity_gate OPEN_OBSERVED → observed axis; not standing IAM-only.
    expect(proj.reachable_damage_bucket).toBe("observed_destructive")
    expect(proj.attacker_headline).toMatch(/^Observed destructive path to bucket/)
    expect(proj.attacker_headline).not.toMatch(/IAM-only/)
  })
})
