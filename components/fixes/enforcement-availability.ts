// Presentation contract for the enforcement surface while the backend's
// execution gates are off. The backend exposes its EFFECTIVE mutation
// availability (exactly as the gates compute it) via /healthz -> the public
// /api/proxy/meta diagnostic; this module turns that signal into UI policy.

export interface OperationalFeatureState {
  s3_private_path_mutations?: boolean
  s3_bucket_policy_enforcement?: boolean
}

export type EnforcementAvailability = "enabled" | "preview"

// Fail-closed: anything short of an explicit true — flag off, field missing,
// meta unreachable, old backend without the features field — presents as
// Preview (analyze/validate live, approval/apply disabled). A mutation
// surface never fails open on missing information.
export function enforcementAvailability(
  features: OperationalFeatureState | null | undefined,
): EnforcementAvailability {
  return features?.s3_bucket_policy_enforcement === true ? "enabled" : "preview"
}

// Recognize the mutation gates' 503 refusals so a race (flag flipped after
// the tab loaded) explains itself as the feature being disabled instead of a
// generic red failure. Matches both backend gate messages: the enforcement
// gate ("S3 bucket-policy enforcement is disabled...") and the transport gate
// ("S3 private-path AWS mutations are disabled...").
export function isMutationDisabledError(message: string | null | undefined): boolean {
  return /(enforcement is disabled|mutations are disabled)/i.test(message ?? "")
}

// Read the effective availability from the meta diagnostic. Fail-soft null →
// callers land in Preview via enforcementAvailability's fail-closed default.
export async function fetchOperationalFeatures(): Promise<OperationalFeatureState | null> {
  try {
    const response = await fetch("/api/proxy/meta", { cache: "no-store" })
    const body = (await response.json().catch(() => null)) as {
      backend?: { features?: OperationalFeatureState | null }
    } | null
    const features = body?.backend?.features
    return features && typeof features === "object" ? features : null
  } catch {
    return null
  }
}
