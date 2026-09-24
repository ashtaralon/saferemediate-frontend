/**
 * Preview refusal copy for the LP Preview journey (LeastPrivilegeTab and the
 * IAM Permissions modal).
 *
 * Codes are the ones the backend Review routes return (`api/iam_gap_analysis.py`
 * `_REVIEW_REFUSALS` / `_proof_refusal`, `unified/decision/request_proof.py`,
 * `api/least_privilege.py` simulate-fix) plus the proxy's own local refusal.
 * A deployment-configuration refusal must never read as a fact about the user
 * or the role, so each one says what was refused and that nothing was read.
 *
 * An entry without a `body` shows the backend's own message: those refusals
 * carry a specific reason (which account, which region) that fixed copy would lose.
 */

type Copy = { title: string; body?: string }

const DEPLOYMENT_PREREQUISITE = "This is a deployment prerequisite, not a fact about this role."

const COPY: Record<string, Copy> = {
  DEPLOYMENT_SERVICE_TOKEN_NOT_CONFIGURED: {
    title: "The frontend has no service proof for the backend",
    body: "The proxy refused before contacting the backend because no deployment service token (or ALB identity) is configured on the frontend — a release prerequisite (IF-D3 §2), not a fact about this role.",
  },
  SERVICE_AUTHENTICATION_REQUIRED: {
    title: "The backend did not accept this deployment's service token",
    body: `The backend's auth boundary refused the request before any read: the frontend and backend service tokens are missing or not paired. ${DEPLOYMENT_PREREQUISITE}`,
  },
  DECISION_DEPLOYMENT_PRINCIPAL_UNAVAILABLE: {
    title: "The deployment's service identity was not accepted",
    body: "A service token was sent but the backend's auth boundary is not enforcing, or the token is invalid.",
  },
  ANALYST_RUNTIME_UNAVAILABLE: {
    title: "This deployment cannot verify requests yet",
    body: `The backend's identity verifier is not configured or not enforcing for this deployment, so it refused before reading anything. ${DEPLOYMENT_PREREQUISITE}`,
  },
  ANALYST_IDENTITY_UNAVAILABLE: {
    title: "Identity verification is unavailable right now",
    body: "The backend could not reach its identity verifier, so nothing was read. Retry shortly.",
  },
  ANALYST_IDENTITY_INVALID: {
    title: "Your identity could not be verified",
    body: "The identity presented with this request was rejected, so nothing was read.",
  },
  ANALYST_TENANT_SCOPE_UNAVAILABLE: {
    title: "This deployment has no organization scope configured",
    body: `The backend refused an unscoped read because no organization is pinned for this deployment. ${DEPLOYMENT_PREREQUISITE}`,
  },
  REVIEW_RUNTIME_UNAVAILABLE: {
    title: "Permission review is not served by this deployment yet",
    body: `The backend's Decision runtime is not installed for this deployment, so no permission analysis was read. ${DEPLOYMENT_PREREQUISITE}`,
  },
  REVIEW_SCOPE_UNAVAILABLE: {
    title: "Review scope is not configured for this deployment",
    body: `The backend refused an unscoped read because this deployment has no review scope configured. ${DEPLOYMENT_PREREQUISITE}`,
  },
  REVIEW_SCOPE_MISMATCH: { title: "This role is outside the scope this deployment may review" },
  REVIEW_TENANT_NOT_SERVING: { title: "This organization is not serving permission reviews right now" },
  ROLE_NOT_FOUND_IN_SCOPE: { title: "This role was not found in the reviewed scope" },
  ROLE_IDENTITY_AMBIGUOUS: { title: "This role reference matches more than one role" },
  ROLE_IDENTITY_CONFLICT: { title: "This role's identity changed during the review" },
  ROLE_REFERENCE_REQUIRED: { title: "A valid role name or ARN is required" },
}

/** The auth boundary's pre-routing 401 carries only this string, no code. */
const AUTH_BOUNDARY_401_DETAIL = "service authentication required"

export type PreviewRefusal = {
  code: string
  status: number
  message: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function refusalFromPreviewBody(status: number, payload: unknown): PreviewRefusal {
  const body = asRecord(payload)
  const detail = body?.detail
  const detailRecord = asRecord(detail)
  const boundary401 = status === 401 && detail === AUTH_BOUNDARY_401_DETAIL
  const code =
    (typeof detailRecord?.code === "string" && detailRecord.code) ||
    (typeof body?.error_code === "string" && body.error_code) ||
    (typeof body?.code === "string" && body.code) ||
    (boundary401 ? "SERVICE_AUTHENTICATION_REQUIRED" : `HTTP_${status}`)
  const message =
    (typeof detailRecord?.message === "string" && detailRecord.message) ||
    (typeof detail === "string" ? detail : null) ||
    (typeof body?.error === "string" && body.error) ||
    `Request failed with HTTP ${status}`
  return { code, status, message }
}

export function reviewRefusalCopy(refusal: PreviewRefusal): { title: string; body: string } {
  const known = COPY[refusal.code]
  if (known) return { title: known.title, body: known.body ?? refusal.message }
  if (refusal.status === 401) {
    return { title: "Your identity could not be verified", body: refusal.message }
  }
  return { title: "Review request failed", body: refusal.message }
}
