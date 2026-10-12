/**
 * Operator copy for the IAM usage lane's readiness blockers.
 *
 * `readiness_by_lane.cloudtrail_iam_usage.generation.blockers` says WHY the
 * usage generation is not verified; lib/lp-normalize carries it as
 * `usageGenerationBlockers`. Every LP surface that says "Usage unknown" names
 * the FIRST blocker and its meaning, so the operator reads the cause instead
 * of a bare hold. A code this map does not know is printed as itself — never
 * translated into a guess — and no blockers keeps the surface's own sentence.
 */
export const IAM_USAGE_BLOCKER_MEANINGS: Readonly<Record<string, string>> = {
  ACTIVE_GENERATION_UNKNOWN: 'no active IAM usage generation',
  TRAFFIC_INGEST_NOT_INCREMENTAL: 'this tenant is on the legacy engine; usage cannot be verified',
  NEGATIVE_AUTHORITY_NOT_PERMITTED: 'the generation does not permit removal decisions',
  DECISION_READINESS_NOT_READY: 'decision readiness is not ready',
}

/** The sentence every surface used before blockers were carried; no trailing period so callers can append. */
export const IAM_USAGE_UNKNOWN_FALLBACK = 'Usage unknown — the IAM usage generation is not verified'

export function iamUsageUnknownCopy(
  blockers: ReadonlyArray<string> | null | undefined,
  fallback: string = IAM_USAGE_UNKNOWN_FALLBACK,
): string {
  const code = blockers?.[0]
  if (typeof code !== 'string' || code.length === 0) return fallback
  const meaning = Object.prototype.hasOwnProperty.call(IAM_USAGE_BLOCKER_MEANINGS, code)
    ? IAM_USAGE_BLOCKER_MEANINGS[code]
    : null
  return meaning ? `Usage unknown — ${code}: ${meaning}` : `Usage unknown — ${code}`
}

/** Reason code the backend sends when it withholds confidence on an unverified IAM usage generation. */
export const IAM_USAGE_GENERATION_UNVERIFIED = 'IAM_USAGE_GENERATION_UNVERIFIED'

/** Tooltip for a confidence that is withheld rather than reported. */
export function lpConfidenceWithheldCopy(reason: string | null | undefined): string {
  if (!reason || reason === IAM_USAGE_GENERATION_UNVERIFIED) {
    return 'Confidence withheld: IAM usage generation not verified'
  }
  return `Confidence withheld: ${reason}`
}

/**
 * Sentence for a usage-derived value the backend withheld (`*_withheld_reason`).
 * The unverified-generation code reads as the fallback sentence; any other code
 * is printed as itself, never translated into a guess.
 */
export function iamUsageWithheldCopy(reason: string | null | undefined): string {
  if (!reason || reason === IAM_USAGE_GENERATION_UNVERIFIED) return IAM_USAGE_UNKNOWN_FALLBACK
  return iamUsageUnknownCopy([reason])
}
