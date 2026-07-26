import { describe, expect, it } from "vitest"
import {
  zoom0RiskSummary,
  zoom0SpotlightPaths,
} from "@/components/attack-paths-v2/zoom0-fan-in-panel"
import type {
  ConvergencePath,
  CrownJewelConvergence,
} from "@/lib/attack-paths/convergence-types"

function path(partial: Partial<ConvergencePath> & { path_id: string }): ConvergencePath {
  return {
    path_id: partial.path_id,
    hops: partial.hops ?? [],
    confidence: partial.confidence ?? "observed",
    severity: partial.severity ?? "HIGH",
    hop_count: partial.hop_count ?? 3,
    source: partial.source ?? "ec2",
    workload_arn: partial.workload_arn ?? `arn:aws:ec2:us-east-1:1:instance/${partial.path_id}`,
    identity: partial.identity ?? "role-a",
    identity_name: partial.identity_name ?? "role-a",
    ...partial,
  } as ConvergencePath
}

function data(paths: ConvergencePath[]): CrownJewelConvergence {
  return {
    system_name: "alon-prod",
    cj_arn: "arn:aws:s3:::bucket",
    cj_name: "bucket",
    cj_type: "S3Bucket",
    paths,
    paths_total: paths.length,
    observed_paths: paths.filter((p) => p.confidence === "observed").length,
    choke_points: {},
  } as CrownJewelConvergence
}

describe("zoom0SpotlightPaths", () => {
  it("unions workload paths for Attack Map spotlight (no path pin)", () => {
    const out = zoom0SpotlightPaths(
      data([
        path({ path_id: "p1", workload_arn: "arn:aws:ec2:...:instance/i-1" }),
        path({ path_id: "p2", workload_arn: "arn:aws:ec2:...:instance/i-2" }),
        path({ path_id: "orphan", workload_arn: "" }),
      ]),
      null,
    )
    expect(out.map((p) => p.path_id).sort()).toEqual(["p1", "p2"])
  })

  it("applies choke tile filter before spotlight select", () => {
    const out = zoom0SpotlightPaths(
      data([
        path({ path_id: "p1" }),
        path({ path_id: "p2" }),
        path({ path_id: "p3" }),
      ]),
      ["p2", "p3"],
    )
    expect(out.map((p) => p.path_id).sort()).toEqual(["p2", "p3"])
  })
})

describe("zoom0RiskSummary", () => {
  it("returns server risk_summary when present", () => {
    const base = data([path({ path_id: "p1", impact_headline: "FROM PATH" })])
    const out = zoom0RiskSummary({
      ...base,
      risk_summary: {
        path_id: "server-top",
        evidence: "observed",
        impact_headline: "FROM SERVER",
        damage_types: ["s3:GetObject"],
        observed_paths: 1,
        configured_paths: 0,
        mitigation_hint: "Remove 3 unused actions from app-role",
        serve_state: "ACTIVE",
        coverage_state: "READY",
        generation: "3",
        as_of: "2026-07-09T12:00:00Z",
      },
    })
    expect(out?.path_id).toBe("server-top")
    expect(out?.impact_headline).toBe("FROM SERVER")
    expect(out?.generation).toBe("3")
  })

  it("does not synthesize from paths when risk_summary absent", () => {
    const out = zoom0RiskSummary(
      data([
        path({
          path_id: "top",
          confidence: "observed",
          impact_headline: "DATA RISK",
          identity_name: "app-role",
          damage: ["s3:GetObject"],
          closure_recommendation: { remove_actions: ["s3:*"] },
        }),
        path({ path_id: "lower", confidence: "configured" }),
      ]),
    )
    expect(out).toBeNull()
  })
})
