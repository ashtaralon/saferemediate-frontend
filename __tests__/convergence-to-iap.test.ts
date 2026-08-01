import { describe, expect, it } from "vitest"
import {
  convergencePathsToIdentityAttackPaths,
  edgeTypeFromHop,
  normalizePathStatus,
  severityPassthrough,
} from "@/lib/attack-paths/convergence-to-iap"
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
        hops: [
          {
            node_id: "i-abc",
            name: "SafeRemediate-Test-App-2",
            node_type: "EC2Instance",
            plane: "network",
            security_groups: [],
            is_crown_jewel: false,
          },
          {
            node_id: "arn:aws:iam::1:role/r1",
            name: "r1",
            node_type: "IAMRole",
            plane: "identity",
            security_groups: [],
            is_crown_jewel: false,
            edge_type_from_prev: "USES_ROLE",
          },
          {
            node_id: jewel.canonical_id!,
            name: jewel.name,
            node_type: "S3Bucket",
            plane: "data",
            security_groups: [],
            is_crown_jewel: true,
            edge_type_from_prev: "ACCESSES_RESOURCE",
          },
        ],
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
    expect(out[0].nodes).toHaveLength(3)
    expect(out[0].edges.map((e) => e.type)).toEqual([
      "USES_ROLE",
      "ACCESSES_RESOURCE",
    ])
    const proj = compileZoom0Projection(out[0], jewel)
    expect(proj.layers.network).toBe("config-open")
    expect(proj.reachable_damage_bucket).toBe("observed_destructive")
    expect(proj.attacker_headline).toMatch(/^Observed destructive path to bucket/)
    expect(proj.attacker_headline).not.toMatch(/IAM-only/)
  })

  it("MUTATION: empty hops must not synthesize entry/role/CJ spine", () => {
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
        // hops omitted — old invent site fabricated 2–3 nodes here
      },
    ]
    const out = convergencePathsToIdentityAttackPaths(jewel, paths)
    expect(out).toHaveLength(1)
    expect(out[0].nodes).toEqual([])
    expect(out[0].edges).toEqual([])
    expect(out[0].nodes.some((n) => n.tier === "crown_jewel")).toBe(false)
  })

  it("MUTATION: missing edge_type_from_prev must not invent REACHES", () => {
    expect(
      edgeTypeFromHop({
        node_id: "a",
        node_type: "EC2Instance",
        plane: "network",
        security_groups: [],
        is_crown_jewel: false,
      }),
    ).toBe("")
    expect(edgeTypeFromHop(undefined)).toBe("")

    const paths: ConvergencePath[] = [
      {
        path_id: "ap-reaches",
        source: "i-1",
        damage: [],
        score: 0,
        confidence: "configured",
        hop_count: 1,
        hops: [
          {
            node_id: "a",
            name: "a",
            node_type: "EC2Instance",
            plane: "network",
            security_groups: [],
            is_crown_jewel: false,
          },
          {
            node_id: "b",
            name: "b",
            node_type: "IAMRole",
            plane: "identity",
            security_groups: [],
            is_crown_jewel: false,
            // edge_type_from_prev intentionally absent
          },
        ],
      },
    ]
    const out = convergencePathsToIdentityAttackPaths(jewel, paths)
    expect(out[0].edges).toHaveLength(1)
    expect(out[0].edges[0].type).toBe("")
    expect(out[0].edges[0].type).not.toBe("REACHES")
  })

  it("MUTATION: score alone must not invent a severity band", () => {
    expect(severityPassthrough(95, null).severity).toBe("UNKNOWN")
    expect(severityPassthrough(95, null).severity).not.toBe("CRITICAL")
    expect(severityPassthrough(10, "HIGH").severity).toBe("HIGH")
    expect(severityPassthrough(null, "CRITICAL").severity).toBe("CRITICAL")
    expect(Number.isFinite(severityPassthrough(null, "HIGH").overall_score)).toBe(
      false,
    )
  })

  it("MUTATION: unknown path_status must not invent OBSERVED/POTENTIAL_EXCESS", () => {
    expect(normalizePathStatus(undefined)).toBe("UNVERIFIED")
    expect(normalizePathStatus("")).toBe("UNVERIFIED")
    expect(normalizePathStatus("POTENTIAL_EXCESS")).toBe("POTENTIAL_EXCESS")
  })
})
