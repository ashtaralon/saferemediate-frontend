import { describe, expect, it } from "vitest"

import { resolveIamRemediationAuthority } from "@/lib/iam-remediation-authority"

describe("IAM remediation authority", () => {
  it("lets a signed REQUIRE_APPROVAL plan supersede a stale legacy window hold", () => {
    const result = resolveIamRemediationAuthority({
      legacyIsRemediable: false,
      legacyReason: "Effective observation 6/90 days; collect more evidence before remediation",
      canonicalDecision: "REQUIRE_APPROVAL",
      planToken: "signed-plan",
      planPermissions: ["s3:ListBucket"],
    })

    expect(result).toEqual({
      evidenceUnavailable: false,
      canonicalPlanReady: true,
      hardBlocked: false,
      effectiveIsRemediable: true,
      effectiveReason: "Canonical safety decision issued a signed change plan",
    })
  })

  it("preserves a genuine missing-evidence hold without a signed plan", () => {
    const result = resolveIamRemediationAuthority({
      legacyIsRemediable: false,
      legacyReason: "Usage not computed — sync behavioral usage",
      canonicalDecision: "REQUIRE_APPROVAL",
    })

    expect(result.evidenceUnavailable).toBe(true)
    expect(result.effectiveIsRemediable).toBe(false)
    expect(result.effectiveReason).toContain("Usage not computed")
  })

  it("never lets a plan-like payload override canonical BLOCK", () => {
    const result = resolveIamRemediationAuthority({
      legacyIsRemediable: false,
      legacyReason: "Effective observation 6/90 days; collect more evidence before remediation",
      canonicalDecision: "BLOCK",
      canonicalReason: "Observation window 6d is below the 7d mutation floor",
      planToken: "must-not-authorize",
      planPermissions: ["s3:ListBucket"],
    })

    expect(result.canonicalPlanReady).toBe(false)
    expect(result.hardBlocked).toBe(true)
    expect(result.evidenceUnavailable).toBe(false)
    expect(result.effectiveIsRemediable).toBe(false)
    expect(result.effectiveReason).toBe("Observation window 6d is below the 7d mutation floor")
    expect(result.effectiveReason).not.toContain("6/90")
  })

  it("keeps legacy readiness for backends without canonical plans", () => {
    const result = resolveIamRemediationAuthority({
      legacyIsRemediable: true,
      legacyReason: "Ready for least-privilege remediation",
    })

    expect(result.effectiveIsRemediable).toBe(true)
    expect(result.canonicalPlanReady).toBe(false)
  })
})
