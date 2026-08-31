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
  // Resource-risk readers have historically emitted both graph labels
  // (`IAMRole`) and display-shaped labels (`IAM Role`).  Review routing is a
  // safety boundary: an innocuous representation difference must not send a
  // supported resource to the legacy generic drawer, where the signed-plan
  // controls are absent.  Normalize only separators/case; unknown types still
  // fail closed to the read-only surface.
  const normalized = String(resourceType || "")
    .trim()
    .replace(/[\s_-]+/g, "")
    .toLowerCase()

  if (normalized === "iamrole") return "iam"
  if (normalized === "securitygroup") return "security-group"
  if (normalized === "s3bucket") return "s3"
  return "read-only"
}
