export type LPReviewSurface =
  | "iam"
  | "security-group"
  | "s3"
  | "read-only"

/**
 * Select the review experience independently from mutation authority.
 *
 * IAM, Security Groups, and S3/data access each have a typed workflow that can
 * safely present held evidence in read-only mode. Falling back to the generic
 * drawer when the estate is held hides those workflows and reintroduces legacy
 * actions. Mutation authority is passed into the selected workflow separately.
 */
export function resolveLPReviewSurface(resourceType: string): LPReviewSurface {
  if (resourceType === "IAMRole") return "iam"
  if (resourceType === "SecurityGroup") return "security-group"
  if (resourceType === "S3Bucket") return "s3"
  return "read-only"
}
