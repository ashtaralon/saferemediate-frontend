/**
 * Preview refusal copy for LeastPrivilegeTab.
 *
 * `components/permissions/review-contract.ts` (`reviewRefusalCopy`) is not on
 * frontend main 63684bc8. These title and body strings match that function
 * for the codes this proxy can return. This file does not import the
 * unmerged permissions module.
 */

const COPY: Record<string, { title: string; body: string }> = {
  DEPLOYMENT_SERVICE_TOKEN_NOT_CONFIGURED: {
    title: "The frontend has no service proof for the backend",
    body: "The proxy refused before contacting the backend because no deployment service token (or ALB identity) is configured on the frontend — a release prerequisite (IF-D3 §2), not a fact about this role.",
  },
  ANALYST_RUNTIME_UNAVAILABLE: {
    title: "Your identity could not be verified",
    body: "The request carried no verifiable proof of identity, or the verifier is unavailable.",
  },
  DECISION_DEPLOYMENT_PRINCIPAL_UNAVAILABLE: {
    title: "The deployment's service identity was not accepted",
    body: "A service token was sent but the backend's auth boundary is not enforcing, or the token is invalid.",
  },
}

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
  const code =
    (typeof detailRecord?.code === "string" && detailRecord.code) ||
    (typeof body?.error_code === "string" && body.error_code) ||
    (typeof body?.code === "string" && body.code) ||
    `HTTP_${status}`
  const message =
    (typeof detailRecord?.message === "string" && detailRecord.message) ||
    (typeof detail === "string" ? detail : null) ||
    (typeof body?.error === "string" && body.error) ||
    `Request failed with HTTP ${status}`
  return { code, status, message }
}

export function reviewRefusalCopy(refusal: PreviewRefusal): { title: string; body: string } {
  const known = COPY[refusal.code]
  if (known) return known
  if (refusal.status === 401) {
    return { title: "Your identity could not be verified", body: refusal.message }
  }
  return { title: "Review request failed", body: refusal.message }
}
