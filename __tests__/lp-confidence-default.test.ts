import { describe, expect, it } from "vitest"
import { assessLpExecution } from "@/components/attack-paths-v2/lp-execution-gate"

describe("lp-execution-gate default branch", () => {
  it("returns REVIEW (not AUTO) for null lp", () => {
    expect(assessLpExecution(null).gate).toBe("REVIEW")
  })

  it("returns REVIEW (not AUTO) for undefined lp", () => {
    expect(assessLpExecution(undefined).gate).toBe("REVIEW")
  })

  it("returns REVIEW when level is empty string", () => {
    expect(
      assessLpExecution({
        score: 0.9,
        level: "",
        vetos: [],
        evidence_gaps: [],
        consumer_count: 1,
      }).gate,
    ).toBe("REVIEW")
  })

  it("returns AUTO only for HIGH + single consumer", () => {
    expect(
      assessLpExecution({
        score: 0.9,
        level: "HIGH",
        vetos: [],
        evidence_gaps: [],
        consumer_count: 1,
      }).gate,
    ).toBe("AUTO")
  })
})
