export type LPReviewSurface =
  | "iam"
  | "security-group"
  | "s3"
  | "read-only"

/**
 * Select the review experience independently from mutation authority.
 *
 * IAM has a canonical, signed-plan Change Case that can safely present held
 * evidence in read-only mode. Falling back to the generic drawer when the
 * estate is held hides that workflow and reintroduces legacy actions. SG and
 * S3 still use the generic read-only drawer while their typed mutation
 * surfaces are held.
 */
export function resolveLPReviewSurface(
  resourceType: string,
  mutationBlocked: boolean,
): LPReviewSurface {
  if (resourceType === "IAMRole") return "iam"
  if (mutationBlocked) return "read-only"
  if (resourceType === "SecurityGroup") return "security-group"
  if (resourceType === "S3Bucket") return "s3"
  return "read-only"
}
