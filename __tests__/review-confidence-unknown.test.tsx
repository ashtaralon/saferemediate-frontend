import { readFileSync } from "node:fs"
import path from "node:path"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AdvancedDrawer } from "@/components/iam-lp/AdvancedDrawer"
import { mapGapDataToIAMLp } from "@/components/iam-permission-analysis-modal"
import { normalizeReviewConfidence } from "@/lib/lp-normalize"

/**
 * Review body keys and value shapes as `unified/decision/role_review_reader.py` returns them
 * (backend main 4d537bcf8, the dict at lines 1155-1240). `confidence` is the evidence grade
 * ('HIGH' | 'MEDIUM' | 'LOW'); the withheld variant carries exactly the three holder fields
 * `unified/lp/capabilities.py::_withhold_unverified_iam_evidence` writes (merged #2252). On backend
 * main that withhold is applied to LP list rows; the Review extraction honours the same holder
 * contract so a withheld grade can never be read as a level.
 */
function reviewBody(confidenceFields: Record<string, unknown>) {
  return {
    role_name: "web-role",
    role_arn: "arn:aws:iam::123456789012:role/web-role",
    observation_days: 90,
    decision_evidence_ready: false,
    data_source: "real",
    confidence_mode: "observed",
    summary: {
      total_permissions: 4,
      used_count: 3,
      unused_count: 1,
      lp_score: null,
      overall_risk: "LOW",
      data_confidence: "PARTIAL",
      cloudtrail_events: null,
      event_count_basis: null,
      high_risk_unused_count: 0,
      api_relationships: 0,
      traffic_relationships: 0,
      total_evidence: 0,
    },
    permissions_analysis: [],
    used_permissions: [],
    unused_permissions: [],
    high_risk_unused: [],
    ...confidenceFields,
    confidence_groups: null,
    safety_vector: null,
    evidence_breakdown: {},
    remediated_at: null,
    reason: null,
    is_remediable: false,
    remediable_reason: "Effective observation 90/90 days; collect more evidence before remediation",
    dependency_context: { status: "not_computed", system: null, dependencies: [], has_critical_dependencies: false },
    service_role_analysis: null,
    authority: "LEGACY_DIAGNOSTIC",
  }
}

const WITHHELD = {
  confidence: null,
  confidence_basis: null,
  confidence_withheld_reason: "IAM_USAGE_GENERATION_UNVERIFIED",
}

/** The modal's own Review -> gapData -> IamGapAnalysis path for the confidence field, then the drawer. */
function renderDrawerFor(body: ReturnType<typeof reviewBody>) {
  const rc = normalizeReviewConfidence(body)
  const gapData = {
    ...body,
    confidence: rc.level,
    confidence_withheld_reason: rc.withheld_reason,
    confidence_groups: undefined,
  }
  const gap = mapGapDataToIAMLp(gapData as unknown as Parameters<typeof mapGapDataToIAMLp>[0])
  render(<AdvancedDrawer gap={gap} defaultOpen />)
  return { gap, tile: screen.getByTestId("review-confidence") }
}

describe("Review confidence is never defaulted", () => {
  it("keeps an absent confidence unknown", () => {
    const body = reviewBody({})
    expect("confidence" in body).toBe(false)
    expect(normalizeReviewConfidence(body)).toEqual({ level: null, withheld_reason: null })
  })

  it("keeps a withheld confidence unknown and carries the backend's reason", () => {
    expect(normalizeReviewConfidence(reviewBody(WITHHELD))).toEqual({
      level: null,
      withheld_reason: "IAM_USAGE_GENERATION_UNVERIFIED",
    })
  })

  it("never passes an object through, and accepts only HIGH / MEDIUM / LOW", () => {
    expect(normalizeReviewConfidence(reviewBody({ confidence: { level: "" } })).level).toBeNull()
    expect(normalizeReviewConfidence(reviewBody({ confidence: { confidence: 72 } })).level).toBeNull()
    expect(normalizeReviewConfidence(reviewBody({ confidence: "OBSERVED" })).level).toBeNull()
    expect(normalizeReviewConfidence(reviewBody({ confidence: { level: "LOW" } })).level).toBe("LOW")
  })

  it("positive control: a real level is unchanged", () => {
    for (const level of ["HIGH", "MEDIUM", "LOW"] as const) {
      expect(normalizeReviewConfidence(reviewBody({ confidence: level }))).toEqual({ level, withheld_reason: null })
    }
  })
})

describe("Review confidence render site (AdvancedDrawer via mapGapDataToIAMLp)", () => {
  it("renders a withheld confidence as Unknown with the withheld reason, and no HIGH", () => {
    const { gap, tile } = renderDrawerFor(reviewBody(WITHHELD))
    expect(gap?.confidence).toEqual({ level: null })
    expect(gap?.confidence_withheld_reason).toBe("IAM_USAGE_GENERATION_UNVERIFIED")
    expect(tile.textContent).toContain("Unknown")
    expect(tile.textContent).toContain("Confidence withheld: IAM usage generation not verified")
    expect(tile.textContent).not.toMatch(/HIGH|MEDIUM|LOW/)
    expect(document.body.textContent).not.toMatch(/"level": "HIGH"/)
  })

  it("renders an absent confidence as Unknown without claiming it was withheld", () => {
    const { tile } = renderDrawerFor(reviewBody({}))
    expect(tile.textContent).toBe("Review confidenceUnknown")
  })

  it("positive control: renders the backend's MEDIUM unchanged", () => {
    const { gap, tile } = renderDrawerFor(reviewBody({ confidence: "MEDIUM" }))
    expect(gap?.confidence).toEqual({ level: "MEDIUM" })
    expect(tile.textContent).toBe("Review confidenceMEDIUM")
  })
})

describe("the modal reads the Review confidence only through the typed extraction", () => {
  const modal = readFileSync(path.join(process.cwd(), "components/iam-permission-analysis-modal.tsx"), "utf8")

  it("maps the Review body through normalizeReviewConfidence, with no HIGH/MEDIUM/LOW default", () => {
    expect(modal).toContain("const reviewConfidence = normalizeReviewConfidence(rawData)")
    expect(modal).toContain("confidence: reviewConfidence.level,")
    expect(modal).toContain("confidence_withheld_reason: reviewConfidence.withheld_reason,")
    expect(modal).not.toMatch(/rawData\??\.confidence(?![_A-Za-z])/)
    expect(modal).not.toMatch(/confidence\s*:[^\n]*(\|\||\?\?)\s*['"](HIGH|MEDIUM|LOW)['"]/)
  })
})
