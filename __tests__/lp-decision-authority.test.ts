import { describe, expect, it } from "vitest"

import captured from "./fixtures/lp-decision-authority-chain.json"
import { decisionAuthorityView, previewDecisionGrade, reasonCopy } from "@/lib/lp-decision-authority"

// Every block below was captured from the backend's mounted Review/Preview routes (preview_chain.py
// --lp-decision-coverage: the real publisher and the real serving read); see `_source` in the fixture.

describe("decisionAuthorityView", () => {
  it("renders a populated generation with its receipt, and never turns coverage into a removal verdict", () => {
    const view = decisionAuthorityView(captured.populated)
    expect(view.kind).toBe("populated")
    expect(view.receipt?.projectionGeneration).toBe(7)
    expect(view.receipt?.projectionReceiptHash).toMatch(/\S/)
    // The coverage is complete (every configured action decided) ...
    expect(view.coverageComplete).toBe(true)
    // ... and nothing is cleared: the v1 layers are UNKNOWN, so the join clears no removal.
    expect(view.cleared).toEqual([])
    expect(view.indeterminate.length).toBeGreaterThan(0)
    expect(new Set(view.indeterminate.map((e) => e.reason))).toEqual(new Set(["LAYER_UNKNOWN"]))
  })

  it("renders a legitimately empty role as read and receipted, not as unavailable", () => {
    const view = decisionAuthorityView(captured.empty)
    expect(view.kind).toBe("empty")
    expect(view.receipt).not.toBeNull()
    expect(view.cleared).toEqual([])
  })

  it.each([
    ["role_not_published", "ROLE_NOT_PUBLISHED"],
    ["not_published", "NOT_PUBLISHED"],
    ["not_resident", "DEPLOYMENT_NOT_CUSTOMER_RESIDENT"],
  ] as const)("renders %s as unavailable by name, with no receipt and nothing cleared", (key, reason) => {
    const view = decisionAuthorityView(captured[key])
    expect(view.kind).toBe("unavailable")
    expect(view.reason).toBe(reason)
    expect(view.detail).toBe(reasonCopy(reason))
    expect(view.receipt).toBeNull()
    expect([...view.cleared, ...view.inUse]).toEqual([])
  })

  it("treats an absent or foreign-contract block as not reported, never as empty", () => {
    for (const raw of [undefined, null, {}, { state: "ACTIVE_POPULATED" }, { ...captured.populated, contract: "x" }]) {
      const view = decisionAuthorityView(raw)
      expect(view.kind).toBe("not_reported")
      expect(view.cleared).toEqual([])
    }
  })

  it("never shows an ACTIVE state whose receipt is missing as served", () => {
    const view = decisionAuthorityView({ ...captured.populated, receipt: null })
    expect(view.kind).toBe("unavailable")
    expect(view.reason).toBe("PUBLISHED_RECEIPT_UNVERIFIED")
    expect(view.cleared).toEqual([])
  })

  it("never shows an unknown state as served, even with a receipt", () => {
    const view = decisionAuthorityView({ ...captured.populated, state: "SOMETHING_NEW" })
    expect(view.kind).toBe("unavailable")
    expect(view.cleared).toEqual([])
  })

  it("names an unknown reason rather than dropping it", () => {
    expect(reasonCopy("A_NEW_REASON")).toContain("A_NEW_REASON")
  })
})

describe("previewDecisionGrade", () => {
  it("reports a populated Preview as not decision grade, with the join's reasons", () => {
    const grade = previewDecisionGrade(captured.preview_populated)
    expect(grade.kind).toBe("not_graded")
    expect(grade.reasons).toContain("LAYER_UNKNOWN")
    expect(grade.candidates).toBe(8)
    expect(grade.cleared).toEqual([])
  })

  it("reports an unavailable authority as not graded, with its reason", () => {
    const grade = previewDecisionGrade(captured.preview_not_published)
    expect(grade.kind).toBe("not_graded")
    expect(grade.reasons).toEqual(["NOT_PUBLISHED"])
  })

  it("is graded only on the backend's explicit true", () => {
    expect(previewDecisionGrade({ ...captured.preview_populated, decision_grade: true }).kind).toBe("graded")
    expect(previewDecisionGrade({ ...captured.preview_populated, decision_grade: "true" }).kind).toBe("not_reported")
    expect(previewDecisionGrade(undefined).kind).toBe("not_reported")
  })
})
