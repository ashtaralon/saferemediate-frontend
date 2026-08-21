import type { DecisionOutcomeCanonical } from "@/lib/types"

export interface IamRemediationAuthorityInput {
  legacyIsRemediable?: boolean
  legacyReason?: string | null
  canonicalDecision?: DecisionOutcomeCanonical | null
  canonicalReason?: string | null
  planToken?: string | null
  planPermissions?: string[] | null
}

export interface IamRemediationAuthority {
  /** True only when the legacy gap response remains an effective evidence hold. */
  evidenceUnavailable: boolean
  /** A signed, non-blocked canonical plan is authoritative for staging. */
  canonicalPlanReady: boolean
  /** BLOCK and EXCLUDE are hard mutation boundaries and never allow override. */
  hardBlocked: boolean
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
  canonicalReason,
  planToken,
  planPermissions,
}: IamRemediationAuthorityInput): IamRemediationAuthority {
  const hardBlocked = canonicalDecision === "BLOCK" || canonicalDecision === "EXCLUDE"
  const canonicalPlanReady = Boolean(
    canonicalDecision &&
      !hardBlocked &&
      planToken &&
      Array.isArray(planPermissions) &&
      planPermissions.length > 0,
  )
  // A canonical hard block is a decision, not a generic evidence failure. Keep
  // those states separate so stale gap-analysis copy cannot mask the exact
  // mutation-boundary reason or accidentally expose an override path.
  const evidenceUnavailable = legacyIsRemediable === false && !canonicalPlanReady && !hardBlocked

  return {
    evidenceUnavailable,
    canonicalPlanReady,
    hardBlocked,
    effectiveIsRemediable: !hardBlocked && !evidenceUnavailable,
    effectiveReason: hardBlocked
      ? canonicalReason || "Blocked by the canonical safety decision"
      : canonicalPlanReady
        ? "Canonical safety decision issued a signed change plan"
        : legacyReason || "Usage evidence is unavailable",
  }
}
