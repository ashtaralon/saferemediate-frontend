import { describe, it, expect } from "vitest"
import {
  llmVerifiedExecutive,
  resolveRiskLede,
  usesLlmRiskLede,
} from "@/components/attack-paths-v2/resolve-risk-lede"
import type { AttackPathReport } from "@/components/attack-paths-v2/attack-path-report-types"

const base = {
  narration_source: "llm",
  narration_l3_ok: true,
  narration_json: { executive: "  LLM verified risk summary.  " },
} as Pick<AttackPathReport, "narration_source" | "narration_l3_ok" | "narration_json">

describe("resolveRiskLede", () => {
  it("uses L3-verified LLM executive", () => {
    expect(resolveRiskLede(base as AttackPathReport, "Compiler lede.")).toBe(
      "LLM verified risk summary.",
    )
    expect(usesLlmRiskLede(base as AttackPathReport)).toBe(true)
  })

  it("falls back to compiler lede when source is not llm", () => {
    const report = { ...base, narration_source: "template" } as AttackPathReport
    expect(resolveRiskLede(report, "Compiler lede.")).toBe("Compiler lede.")
    expect(usesLlmRiskLede(report)).toBe(false)
  })

  it("falls back when l3_ok is false", () => {
    const report = { ...base, narration_l3_ok: false } as AttackPathReport
    expect(llmVerifiedExecutive(report)).toBeNull()
    expect(resolveRiskLede(report, "Compiler lede.")).toBe("Compiler lede.")
  })

  it("falls back when executive is missing or blank", () => {
    expect(
      resolveRiskLede(
        { ...base, narration_json: { executive: "   " } } as AttackPathReport,
        "Compiler lede.",
      ),
    ).toBe("Compiler lede.")
  })

  it("falls back for safety floor even when json is present", () => {
    const report = {
      narration_source: "business_sentence_floor",
      narration_l3_ok: false,
      narration_json: { executive: "Floor text." },
    } as AttackPathReport
    expect(resolveRiskLede(report, "Compiler lede.")).toBe("Compiler lede.")
  })
})
