/// <reference types="vitest/globals" />

import { describe, expect, it } from "vitest"

import { deriveDependencyMaturity, type DependencyCoverageInput } from "@/lib/dependency-coverage"

const coverage = (overrides: Partial<DependencyCoverageInput> = {}): DependencyCoverageInput => ({
  state: "UNKNOWN",
  required_sources: [],
  present_sources: [],
  missing_sources: [],
  sufficient_for: [],
  insufficient_for: [],
  ...overrides,
})

describe("dependency coverage maturity (§6.5)", () => {
  it("blocks on held integrity before looking at anything else", () => {
    const verdict = deriveDependencyMaturity(
      "INTEGRITY_HELD",
      coverage({ state: "FULL" }),
      [{ freshness: "CURRENT", basisClass: "CONFIGURED" }],
    )
    expect(verdict.maturity).toBe("BLOCKED")
  })

  it("reports Stale only when every dated relationship is stale", () => {
    const allStale = deriveDependencyMaturity("ACTIVE", coverage({ state: "FULL" }), [
      { freshness: "STALE", basisClass: "OBSERVED" },
      { freshness: "STALE", basisClass: "CONFIGURED" },
    ])
    expect(allStale.maturity).toBe("STALE")

    const mixed = deriveDependencyMaturity("ACTIVE", coverage({ state: "FULL" }), [
      { freshness: "STALE", basisClass: "OBSERVED" },
      { freshness: "CURRENT", basisClass: "CONFIGURED" },
    ])
    expect(mixed.maturity).toBe("READY")
  })

  it("ignores undated rows when judging staleness", () => {
    const verdict = deriveDependencyMaturity("ACTIVE", coverage({ state: "FULL" }), [
      { freshness: "UNKNOWN", basisClass: "CONFIGURED" },
    ])
    expect(verdict.maturity).toBe("READY")
  })

  it("names the exact missing sources §6.5 requires it to link to", () => {
    const verdict = deriveDependencyMaturity("PARTIAL", coverage({
      state: "NONE",
      missing_sources: ["s3_access_logs", "cloudtrail_data_events"],
      insufficient_for: ["prove absence of consumers"],
    }), [])
    expect(verdict.maturity).toBe("PARTIAL")
    expect(verdict.reason).toContain("s3_access_logs")
    expect(verdict.missingSources).toEqual(["s3_access_logs", "cloudtrail_data_events"])
    expect(verdict.insufficientFor).toEqual(["prove absence of consumers"])
  })

  it("calls configured-without-runtime Learning, not Ready", () => {
    const verdict = deriveDependencyMaturity("ACTIVE", coverage({ state: "UNKNOWN" }), [
      { freshness: "UNKNOWN", basisClass: "CONFIGURED" },
      { freshness: "UNKNOWN", basisClass: "STRUCTURAL" },
    ])
    expect(verdict.maturity).toBe("LEARNING")
  })

  it("never claims Ready when the dossier reported no coverage at all", () => {
    // The live C1 shape: coverage UNKNOWN with no required_sources declared.
    // Neither READY (nothing proved freshness) nor PARTIAL (no known gap).
    const verdict = deriveDependencyMaturity("NOT_READY", coverage(), [])
    expect(verdict.maturity).toBe("UNVERIFIED")
    expect(verdict.maturity).not.toBe("READY")
  })

  it("does not upgrade an out-of-contract coverage state into a good one", () => {
    const verdict = deriveDependencyMaturity(
      "ACTIVE",
      coverage({ state: "BLOCKED" as unknown as DependencyCoverageInput["state"] }),
      [],
    )
    expect(verdict.maturity).toBe("BLOCKED")
  })

  it("treats a missing coverage object as unverified rather than complete", () => {
    expect(deriveDependencyMaturity("ACTIVE", null, []).maturity).toBe("UNVERIFIED")
  })
})
