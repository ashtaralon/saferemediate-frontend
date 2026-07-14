import { describe, expect, it } from "vitest"
import { pickWorstSystemName } from "@/lib/pick-worst-system"

describe("pickWorstSystemName", () => {
  // Real /api/proxy/systems payload shape (captured live 2026-07-14):
  // alon-prod is the worst — most criticals (7), most highs (5), lowest health (45).
  const live = [
    { name: "payment-production", health_score: 95, critical_count: 1, high_count: 0, rankable: true },
    { name: "alon-prod", health_score: 45, critical_count: 7, high_count: 5, rankable: true },
    { name: "cyntroprod", health_score: 100, critical_count: 0, high_count: 0, rankable: true },
    { name: "saferemediate-test-db", health_score: 70, critical_count: 6, high_count: 0, rankable: true },
  ]

  it("picks the most-critical system (mirrors Systems Needing Attention ranking)", () => {
    expect(pickWorstSystemName(live)).toBe("alon-prod")
  })

  it("breaks critical ties by highs, then by lowest health", () => {
    const rows = [
      { name: "a", critical_count: 3, high_count: 1, health_score: 80 },
      { name: "b", critical_count: 3, high_count: 4, health_score: 80 }, // more highs -> worse than a
      { name: "c", critical_count: 3, high_count: 4, health_score: 50 }, // same highs, lower health -> worst
    ]
    expect(pickWorstSystemName(rows)).toBe("c")
  })

  it("reads camelCase spellings too (typed shape)", () => {
    const rows = [
      { name: "x", criticalIssues: 1, highIssues: 0, healthScore: 90 },
      { name: "y", criticalIssues: 9, highIssues: 0, healthScore: 90 },
    ]
    expect(pickWorstSystemName(rows)).toBe("y")
  })

  it("excludes rejected / non-rankable entries, but never returns nothing", () => {
    // A rejected system with huge criticals must NOT become the default.
    expect(
      pickWorstSystemName([
        { name: "rejected-boundary", critical_count: 99, rejected: true },
        { name: "real", critical_count: 2, rankable: true },
      ]),
    ).toBe("real")
    // If EVERY entry is excluded, fall back to the full list so we still resolve one.
    expect(pickWorstSystemName([{ name: "only", critical_count: 5, rankable: false }])).toBe("only")
  })

  it("returns null for empty / missing / nameless input", () => {
    expect(pickWorstSystemName([])).toBeNull()
    expect(pickWorstSystemName(null)).toBeNull()
    expect(pickWorstSystemName(undefined)).toBeNull()
    expect(pickWorstSystemName([{ critical_count: 5 }])).toBeNull()
  })
})
