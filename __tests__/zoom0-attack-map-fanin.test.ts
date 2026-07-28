import { describe, expect, it } from "vitest"
import {
  resolveZoom0Effective,
  resolveZoom0PinPathId,
  zoom0CardinalityLine,
  zoom0EmptyCanvasMessage,
  zoom0NofMLine,
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

  it("investigation pin spotlights one path only", () => {
    const out = zoom0SpotlightPaths(
      data([
        path({ path_id: "p1" }),
        path({ path_id: "p2" }),
      ]),
      null,
      "p2",
    )
    expect(out.map((p) => p.path_id)).toEqual(["p2"])
  })
})

describe("zoom0CardinalityLine", () => {
  it("formats SERVE cardinality with drawn count and truncated flag", () => {
    expect(
      zoom0CardinalityLine(
        {
          generation_total: 42,
          eligible_total: 10,
          returned_count: 8,
          truncated: true,
        },
        6,
      ),
    ).toBe("8 of 10 eligible · 42 in generation · 6 drawn · truncated")
  })

  it("zoom0NofMLine is server eligible envelope", () => {
    expect(
      zoom0NofMLine({
        generation_total: 42,
        eligible_total: 10,
        returned_count: 8,
      }),
    ).toBe("8 of 10 eligible")
  })
})

describe("resolveZoom0PinPathId", () => {
  it("maps IAP row id to convergence path_id", () => {
    const pin = resolveZoom0PinPathId(
      data([path({ path_id: "conv-1" })]),
      "iap-row-1",
      [
        {
          id: "iap-row-1",
          attack_path_id: "conv-1",
        } as never,
      ],
    )
    expect(pin).toBe("conv-1")
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

describe("resolveZoom0Effective", () => {
  const fallback = data([path({ path_id: "iap-1" })])

  it("never replaces NOT_READY with IAP fallback", () => {
    const authoritative: CrownJewelConvergence = {
      ...data([]),
      serve_state: "NOT_READY",
      coverage_state: "NOT_READY",
      risk_summary: {
        evidence: "configured",
        damage_types: [],
        observed_paths: 0,
        configured_paths: 0,
        serve_state: "NOT_READY",
        coverage_state: "NOT_READY",
      },
    }
    const out = resolveZoom0Effective(authoritative, fallback, null)
    expect(out.source).toBe("live")
    expect(out.data?.serve_state).toBe("NOT_READY")
    expect(out.data?.paths).toEqual([])
  })

  it("never replaces PARTIAL/ERROR with IAP fallback", () => {
    for (const coverage_state of ["PARTIAL", "ERROR"] as const) {
      const authoritative: CrownJewelConvergence = {
        ...data([]),
        coverage_state,
        serve_state: "ACTIVE",
      }
      const out = resolveZoom0Effective(authoritative, fallback, null)
      expect(out.source).toBe("live")
      expect(out.data?.coverage_state).toBe(coverage_state)
    }
  })

  it("allows IAP fallback only when endpoint unreachable", () => {
    const out = resolveZoom0Effective(null, fallback, "Backend busy")
    expect(out.source).toBe("fallback")
    expect(out.data?.paths[0]?.path_id).toBe("iap-1")
  })

  it("does not fallback while loading (no error, no data)", () => {
    const out = resolveZoom0Effective(null, fallback, null)
    expect(out.source).toBe("live")
    expect(out.data).toBeNull()
  })
})

describe("zoom0EmptyCanvasMessage", () => {
  it("distinguishes NOT_READY from zero paths", () => {
    const notReady = zoom0EmptyCanvasMessage({
      ...data([]),
      serve_state: "NOT_READY",
      coverage_state: "NOT_READY",
    })
    expect(notReady.state).toBe("NOT_READY")
    expect(notReady.message).toMatch(/unknown/i)

    const zero = zoom0EmptyCanvasMessage({
      ...data([]),
      coverage_state: "READY_ZERO",
    })
    expect(zero.state).toBe("READY_ZERO")
    expect(zero.message).toMatch(/active projection/i)
  })
})
