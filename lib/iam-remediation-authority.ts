import type { DecisionOutcomeCanonical } from "@/lib/types"

export interface IamRemediationAuthorityInput {
  legacyIsRemediable?: boolean
  legacyReason?: string | null
  canonicalDecision?: DecisionOutcomeCanonical | null
  planToken?: string | null
  planPermissions?: string[] | null
}

export interface IamRemediationAuthority {
  /** True only when the legacy gap response remains an effective evidence hold. */
  evidenceUnavailable: boolean
  /** A signed, non-blocked canonical plan is authoritative for staging. */
  canonicalPlanReady: boolean
  effectiveIsRemediable: boolean
  effectiveReason: string
}

/**
 * Resolve conflicting readiness claims from gap-analysis and simulate-fix.
 *
 * Gap-analysis may use a long historical search window. It still fails closed
 * when usage was never measured, but it cannot veto a newer canonical decision
 * that issued an exact-change signed plan. BLOCK and EXCLUDE never authorize.
 */
export function resolveIamRemediationAuthority({
  legacyIsRemediable,
  legacyReason,
  canonicalDecision,
  planToken,
  planPermissions,
}: IamRemediationAuthorityInput): IamRemediationAuthority {
  const canonicalPlanReady = Boolean(
    canonicalDecision &&
      canonicalDecision !== "BLOCK" &&
      canonicalDecision !== "EXCLUDE" &&
      planToken &&
      Array.isArray(planPermissions) &&
      planPermissions.length > 0,
  )
  const evidenceUnavailable = legacyIsRemediable === false && !canonicalPlanReady

  return {
    evidenceUnavailable,
    canonicalPlanReady,
    effectiveIsRemediable: !evidenceUnavailable,
    effectiveReason: canonicalPlanReady
      ? "Canonical safety decision issued a signed change plan"
      : legacyReason || "Usage evidence is unavailable",
  }
}
