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
  const normalized = normalizeResourceType(resourceType)

  if (normalized === "iamrole") return "iam"
  if (normalized === "securitygroup") return "security-group"
  if (normalized === "s3bucket") return "s3"
  return "read-only"
}

function normalizeResourceType(resourceType: string): string {
  return String(resourceType || "")
    .trim()
    .replace(/[\s_-]+/g, "")
    .toLowerCase()
}

/** The preview a resource type's row may request from the generic Resource Risk drawer. */
export type LPDrawerPreview = "iam-simulate-fix" | "sg-remediation-simulate"

/**
 * The ONE table of drawer Preview support, keyed by the row's real resource type (normalized as
 * resolveLPReviewSurface normalizes it). A type absent from this table has no Preview on the drawer
 * and must be refused by name, never sent to another type's endpoint: the drawer used to post every
 * non-Security-Group row (RDSInstance, LambdaFunction, S3Bucket, ...) to the IAM simulate-fix as
 * `resource_type: "IAMRole"`.
 *
 * The backend's own statement of support is `capabilities[].preview_supported`
 * (unified/lp/capabilities.py). It can only NARROW this table: S3Bucket is preview_supported there
 * through the S3 review workflow, but the drawer has no S3 preview, so it stays out of this table.
 */
export const LP_DRAWER_PREVIEW_SUPPORT: Readonly<Record<string, LPDrawerPreview>> = Object.freeze({
  iamrole: "iam-simulate-fix",
  securitygroup: "sg-remediation-simulate",
})

export type LPDrawerPreviewDispatch =
  | { supported: true; preview: LPDrawerPreview; resourceType: string }
  | {
      supported: false
      resourceType: string
      /** NO_DRAWER_PREVIEW: not in LP_DRAWER_PREVIEW_SUPPORT. BACKEND_PREVIEW_UNSUPPORTED: capabilities say no. */
      reason: "NO_DRAWER_PREVIEW" | "BACKEND_PREVIEW_UNSUPPORTED"
    }

export type LPPreviewCapability = { resource_type: string; preview_supported: boolean }

export function resolveLPDrawerPreview(
  resourceType: string,
  capabilities?: ReadonlyArray<LPPreviewCapability> | null,
): LPDrawerPreviewDispatch {
  const key = normalizeResourceType(resourceType)
  const label = String(resourceType || "").trim() || "this resource type"
  const preview = Object.prototype.hasOwnProperty.call(LP_DRAWER_PREVIEW_SUPPORT, key)
    ? LP_DRAWER_PREVIEW_SUPPORT[key]
    : undefined
  if (!preview) return { supported: false, resourceType: label, reason: "NO_DRAWER_PREVIEW" }
  const declared = (capabilities ?? []).find(
    (capability) => normalizeResourceType(capability?.resource_type) === key,
  )
  if (declared && declared.preview_supported !== true) {
    return { supported: false, resourceType: label, reason: "BACKEND_PREVIEW_UNSUPPORTED" }
  }
  return { supported: true, preview, resourceType: label }
}
