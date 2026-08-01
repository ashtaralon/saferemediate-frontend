/**
 * No held or unknown summary state may render 0, 100, "healthy", or "all clear".
 *
 * The backend now returns NULL counts — not zeros — for anything it cannot
 * vouch for. That only helps if consumers stop coercing. The defect:
 *
 *     const total = data.total ?? 0        // severity-donut-card.tsx
 *
 * An analyzer crash, a Neo4j outage and a proxy timeout all arrive as null, and
 * `?? 0` turned every one into a clean bill of health on the first card a
 * customer reads.
 *
 * Eight states, one rule: only an EXPLICIT READY + analysis_complete + numeric
 * zero may render all-clear.
 */

import { describe, expect, it } from "vitest"
import {
  deriveSummaryIntegrity,
  isCacheableSummary,
} from "@/lib/summary-integrity"

const READY_WITH_FINDINGS = {
  success: true, serve_state: "READY", analysis_complete: true,
  total: 17, critical: 2, high: 5, medium: 7, low: 3, avg_health_score: 71,
}
const READY_EXPLICIT_ZERO = {
  success: true, serve_state: "READY", analysis_complete: true,
  total: 0, critical: 0, high: 0, medium: 0, low: 0, avg_health_score: 100,
}
const INTEGRITY_HELD = {
  success: true, serve_state: "INTEGRITY_HELD", analysis_complete: false,
  counts_are_partial: true, failed_analyzers: ["iam_role"],
  total: null, critical: 1, high: 0, medium: 0, low: 0, avg_health_score: null,
}
const NOT_READY = {
  success: true, serve_state: "NOT_READY", analysis_complete: false,
  total: null, avg_health_score: null,
  integrityReason: "No graph connection — no analyzer ran.",
}
const MISSING_INTEGRITY = { total: 0, critical: 0, high: 0, medium: 0, low: 0 }
const SUCCESS_FALSE = {
  success: false, error: "neo4j down",
  total: null, critical: null, high: null, medium: null, low: null,
}
const STALE_CACHE = {
  success: true, serve_state: "NOT_READY", analysis_complete: false,
  fromStaleCache: true, staleReason: "timeout", total: 17, critical: 2,
}

describe("1 — READY with findings", () => {
  it("is authoritative and renders numbers", () => {
    const i = deriveSummaryIntegrity(READY_WITH_FINDINGS)
    expect(i.state).toBe("READY")
    expect(i.canRenderAllClear).toBe(false)
    expect(i.canRenderScores).toBe(true)
    expect(i.mutationBlocked).toBe(false)
    expect(i.countsArePartial).toBe(false)
  })
})

describe("2 — READY with explicit zero", () => {
  it("is the ONLY state permitted to say all clear", () => {
    const i = deriveSummaryIntegrity(READY_EXPLICIT_ZERO)
    expect(i.state).toBe("READY")
    expect(i.canRenderAllClear).toBe(true)
  })
})

describe("3 — INTEGRITY_HELD with partial counts", () => {
  it("shows counts as partial, never as all clear", () => {
    const i = deriveSummaryIntegrity(INTEGRITY_HELD)
    expect(i.state).toBe("INTEGRITY_HELD")
    expect(i.canRenderAllClear).toBe(false)
    expect(i.countsArePartial).toBe(true)
    expect(i.canRenderScores).toBe(false) // suppress health / BRSS
    expect(i.mutationBlocked).toBe(true)
  })
})

describe("4 — NOT_READY", () => {
  it("suppresses everything and carries the reason", () => {
    const i = deriveSummaryIntegrity(NOT_READY)
    expect(i.state).toBe("NOT_READY")
    expect(i.canRenderAllClear).toBe(false)
    expect(i.canRenderScores).toBe(false)
    expect(i.reason).toContain("no analyzer ran")
  })
})

describe("5 — missing integrity fields", () => {
  it("fails CLOSED — silence is not health", () => {
    const i = deriveSummaryIntegrity(MISSING_INTEGRITY)
    expect(i.state).toBe("NOT_READY")
    expect(i.canRenderAllClear).toBe(false)
  })

  it("also covers null/undefined payloads", () => {
    expect(deriveSummaryIntegrity(null).state).toBe("NOT_READY")
    expect(deriveSummaryIntegrity(undefined).canRenderAllClear).toBe(false)
  })

  it("READY without analysis_complete is still not ready", () => {
    const i = deriveSummaryIntegrity({ serve_state: "READY", total: 0 })
    expect(i.state).toBe("NOT_READY")
    expect(i.canRenderAllClear).toBe(false)
  })
})

describe("6 — success:false", () => {
  it("is never healthy regardless of serve_state", () => {
    expect(deriveSummaryIntegrity(SUCCESS_FALSE).state).toBe("NOT_READY")
    expect(
      deriveSummaryIntegrity({ ...SUCCESS_FALSE, serve_state: "READY", analysis_complete: true }).state,
    ).toBe("NOT_READY")
  })
})

describe("7 — timeout / stale cache", () => {
  it("may show rows, but never with its prior READY authority", () => {
    const i = deriveSummaryIntegrity(STALE_CACHE)
    expect(i.state).toBe("NOT_READY")
    expect(i.canRenderScores).toBe(false)
    expect(i.countsArePartial).toBe(true)
  })

  it("a stale payload still claiming READY is demoted", () => {
    const i = deriveSummaryIntegrity({
      ...STALE_CACHE, serve_state: "READY", analysis_complete: true,
    })
    expect(i.state).toBe("NOT_READY")
  })
})

describe("8 — no held/unknown state may display zero, 100, healthy or all-clear", () => {
  const notHealthy = [
    ["INTEGRITY_HELD", INTEGRITY_HELD],
    ["NOT_READY", NOT_READY],
    ["missing integrity", MISSING_INTEGRITY],
    ["success:false", SUCCESS_FALSE],
    ["stale cache", STALE_CACHE],
  ] as const

  it.each(notHealthy)("%s cannot render all-clear or scores", (_label, payload) => {
    const i = deriveSummaryIntegrity(payload)
    expect(i.canRenderAllClear).toBe(false)
    expect(i.canRenderScores).toBe(false)
    expect(i.mutationBlocked).toBe(true)
  })

  it("a null total never becomes zero", () => {
    // The literal defect: `total ?? 0` would make this indistinguishable from
    // READY_EXPLICIT_ZERO.
    const held = deriveSummaryIntegrity({ ...INTEGRITY_HELD, total: null })
    const zero = deriveSummaryIntegrity(READY_EXPLICIT_ZERO)
    expect(held.canRenderAllClear).not.toBe(zero.canRenderAllClear)
  })
})

describe("cache gate", () => {
  it("caches only an authoritative response", () => {
    expect(isCacheableSummary(READY_WITH_FINDINGS)).toBe(true)
    expect(isCacheableSummary(READY_EXPLICIT_ZERO)).toBe(true)
  })

  it.each([
    ["INTEGRITY_HELD", INTEGRITY_HELD],
    ["NOT_READY", NOT_READY],
    ["missing integrity", MISSING_INTEGRITY],
    ["success:false", SUCCESS_FALSE],
    ["null", null],
  ] as const)("never caches %s", (_label, payload) => {
    expect(isCacheableSummary(payload)).toBe(false)
  })

  it("never caches READY without analysis_complete", () => {
    expect(isCacheableSummary({ success: true, serve_state: "READY", total: 0 })).toBe(false)
  })
})
