import { describe, expect, it } from "vitest"
import { assessLpExecution } from "@/components/attack-paths-v2/lp-execution-gate"

describe("assessLpExecution", () => {
  it("returns REVIEW when lp object is missing entirely", () => {
    const r = assessLpExecution(undefined, null)
    expect(r.gate).toBe("REVIEW")
    expect(r.label).toBe("REVIEW")
    expect(r.reason).toContain("LP confidence unavailable")
  })

  it("returns REVIEW when lp confidence level is null", () => {
    const r = assessLpExecution(
      { score: 0, level: null as unknown as string, vetos: [], evidence_gaps: [], consumer_count: 1 },
      null,
    )
    expect(r.gate).toBe("REVIEW")
    expect(r.label).toBe("REVIEW")
  })

  it("returns REVIEW when role is shared across workloads", () => {
    const r = assessLpExecution(
      { score: 0.9, level: "HIGH", vetos: [], evidence_gaps: [], consumer_count: 3 },
      null,
    )
    expect(r.gate).toBe("REVIEW")
    expect(r.label).toBe("REVIEW")
    expect(r.consumerCount).toBe(3)
  })

  it("returns AUTO for HIGH confidence with no vetos and single consumer", () => {
    const r = assessLpExecution(
      { score: 0.9, level: "HIGH", vetos: [], evidence_gaps: [], consumer_count: 1 },
      null,
    )
    expect(r.gate).toBe("AUTO")
    expect(r.label).toBe("AUTO")
  })

  it("returns REVIEW for LOW confidence", () => {
    const r = assessLpExecution(
      { score: 0.2, level: "LOW", vetos: [], evidence_gaps: ["No CloudTrail in 90d"] },
      null,
    )
    expect(r.gate).toBe("REVIEW")
    expect(r.evidenceGaps).toContain("No CloudTrail in 90d")
  })

  it("returns REVIEW for MEDIUM confidence", () => {
    const r = assessLpExecution(
      { score: 0.5, level: "MEDIUM", vetos: [], evidence_gaps: [] },
      null,
    )
    expect(r.gate).toBe("REVIEW")
    expect(r.label).toBe("REVIEW")
  })
})
