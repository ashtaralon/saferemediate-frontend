/**
 * Scope and typed failures for the Fixes → Permissions → Review requests.
 *
 * The backend resolves every Review read inside the deployment's own
 * tenant/account. What the browser sends are CLAIMS: they let the server
 * refuse a session that is looking at a different organization or account
 * (403) instead of silently answering for the deployment's account. They
 * never widen scope, and nothing here invents a value for a missing one.
 *
 * Failures are typed so the modal can say what actually happened — a role
 * that is not in this account, two role lifetimes for one ARN, a budget that
 * ran out — rather than one generic "could not verify" sentence.
 */

export interface IamReviewScope {
  customerId?: string | null
  accountId?: string | null
  region?: string | null
}

const ACCOUNT_RE = /^\d{12}$/
const REGION_RE = /^[a-z]{2}(?:-[a-z]+)+-\d{1,2}$/

/** Keep only well-formed, specific claims. "all" is not a claim. */
export function normalizeReviewScope(scope: IamReviewScope | null | undefined): {
  customer_id?: string
  account_id?: string
  region?: string
} {
  const out: { customer_id?: string; account_id?: string; region?: string } = {}
  const customer = scope?.customerId?.trim()
  if (customer) out.customer_id = customer
  const account = scope?.accountId?.trim()
  if (account && ACCOUNT_RE.test(account)) out.account_id = account
  const region = scope?.region?.trim()
  if (region && REGION_RE.test(region)) out.region = region
  return out
}

function appendScope(params: URLSearchParams, scope: IamReviewScope | null | undefined): void {
  for (const [key, value] of Object.entries(normalizeReviewScope(scope))) {
    if (value) params.set(key, value)
  }
}

export function buildGapAnalysisUrl(
  roleName: string,
  scope: IamReviewScope | null | undefined,
  days = 365,
): string {
  const params = new URLSearchParams({ days: String(days), envelope: "true" })
  appendScope(params, scope)
  return `/api/proxy/iam-roles/${encodeURIComponent(roleName)}/gap-analysis?${params.toString()}`
}

export function buildSimulateFixBody(input: {
  roleName: string
  systemName: string
  findingId?: string | null
  scope?: IamReviewScope | null
}): Record<string, string> {
  const body: Record<string, string> = {
    resource_type: "IAMRole",
    resource_id: input.roleName,
    system_name: input.systemName,
    ...normalizeReviewScope(input.scope),
  }
  if (input.findingId) body.finding_id = input.findingId
  return body
}

export function buildApprovalListUrl(input: {
  roleName: string
  systemName?: string | null
  scope?: IamReviewScope | null
  limit?: number
}): string {
  const params = new URLSearchParams({ role_name: input.roleName, limit: String(input.limit ?? 10) })
  if (input.systemName) params.set("system_name", input.systemName)
  appendScope(params, input.scope)
  return `/api/proxy/iam-roles/approval-requests?${params.toString()}`
}

export function newReviewRequestId(): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`
  return random.slice(0, 16).padEnd(16, "0")
}

export interface ReviewRequestError {
  status: number
  code: string
  /** The refusal's own reason under a Review code (``detail.upstream_code``), preserved for EVERY code. */
  upstreamCode: string | null
  message: string
  requestId: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Normalize every error shape the Review proxies return:
 *  - FastAPI `{detail: {code, message, request_id}}` passed through,
 *  - proxy-error `{error, detail: "<backend body text>"}`,
 *  - proxy `{success: false, error, detail}`,
 *  - plain text or nothing at all (then the HTTP status speaks).
 */
export function parseReviewError(status: number, payload: unknown): ReviewRequestError {
  const body = asRecord(payload)
  let detail: unknown = body?.detail
  if (typeof detail === "string") {
    // A proxy that forwards the backend body as text.
    const nested = asRecord(tryJson(detail))
    if (nested) detail = nested.detail ?? nested
  }
  {
    // A proxy that forwards it whole, so the typed refusal is one level deeper:
    // {error, detail: {detail: {code, ...}}}. Unwrap only when this level has
    // no code of its own, so a flat FastAPI detail keeps working.
    const outer = asRecord(detail)
    if (outer && typeof outer.code !== "string" && asRecord(outer.detail)) {
      detail = outer.detail
    }
  }
  const detailRecord = asRecord(detail)
  const code =
    (typeof detailRecord?.code === "string" && detailRecord.code) ||
    (typeof body?.code === "string" && body.code) ||
    (status === 504 ? "REVIEW_TIMEOUT" : status >= 500 ? "REVIEW_BACKEND_UNAVAILABLE" : `HTTP_${status}`)
  const message =
    (typeof detailRecord?.message === "string" && detailRecord.message) ||
    (typeof detail === "string" && detail) ||
    (typeof body?.error === "string" && body.error) ||
    (typeof body?.message === "string" && body.message) ||
    `Request failed with HTTP ${status}`
  const requestId =
    (typeof detailRecord?.request_id === "string" && detailRecord.request_id) ||
    (typeof body?.request_id === "string" && body.request_id) ||
    null
  const upstreamCode =
    (typeof detailRecord?.upstream_code === "string" && detailRecord.upstream_code.trim()) || null
  return { status, code, upstreamCode, message, requestId }
}

export async function readReviewError(response: Response): Promise<ReviewRequestError> {
  const text = await response.text().catch(() => "")
  return parseReviewError(response.status, tryJson(text) ?? (text ? { error: text } : null))
}

const COPY: Record<string, { title: string; body: string }> = {
  REVIEW_SCOPE_MISMATCH: {
    title: "This role is outside the selected scope",
    body: "The organization or account selected in Cyntro does not belong to this deployment. Nothing was read for another account.",
  },
  REVIEW_SCOPE_UNAVAILABLE: {
    title: "Review scope is not configured",
    body: "This deployment has no verified tenant/account binding, so Cyntro refused to read the role rather than guess.",
  },
  REVIEW_SCOPE_INVALID: {
    title: "The selected scope is invalid",
    body: "The account or region selection could not be validated.",
  },
  REVIEW_REGION_INVALID: {
    title: "The selected region is invalid",
    body: "Pick a region from the scope bar or All regions.",
  },
  ROLE_NOT_FOUND_IN_SCOPE: {
    title: "Role not found in this account",
    body: "No IAM role with this name or ARN exists in the deployment's account in the current graph.",
  },
  ROLE_NOT_IN_SYSTEM: {
    title: "Role is not part of this system",
    body: "The role exists in this account but is not attributed to the selected system.",
  },
  ROLE_IDENTITY_AMBIGUOUS: {
    title: "More than one role matches",
    body: "Several role ARNs match this name in the account. Cyntro will not choose one.",
  },
  ROLE_IDENTITY_CONFLICT: {
    title: "Conflicting role records",
    body: "The graph holds more than one role lifetime or generation for this ARN, so the evidence cannot be attributed. Safety evaluation is unavailable until the records are reconciled.",
  },
  GAP_ANALYSIS_BUDGET_EXHAUSTED: {
    title: "Permission detail took too long",
    body: "The detail read ran out of its time budget. No partial counts are shown.",
  },
  GAP_ANALYSIS_FAILED: {
    title: "Permission detail could not be computed",
    body: "The detail read failed on the server.",
  },
  GRAPH_UNAVAILABLE: {
    title: "The graph is unavailable",
    body: "Cyntro could not reach its graph for this read.",
  },
  REVIEW_TIMEOUT: {
    title: "The request timed out",
    body: "The server did not answer before the proxy limit. The server may still be working; retry shortly.",
  },
  REVIEW_BACKEND_UNAVAILABLE: {
    title: "The server could not answer",
    body: "The request failed on the server side.",
  },
  // The Decision runtime and tenant lifecycle (backend G9 C). The code is authoritative, not the HTTP status.
  REVIEW_RUNTIME_UNAVAILABLE: {
    title: "Review is not served by this deployment",
    body: "The Decision runtime that answers permission detail is not installed or not enabled here. Nothing was read.",
  },
  REVIEW_TENANT_NOT_SERVING: {
    title: "This tenant is not serving Review answers right now",
    body: "The tenant's lifecycle does not permit a Review answer at the moment. No role content is shown.",
  },
  // The request's proof, as the backend verified it.
  ANALYST_IDENTITY_INVALID: {
    title: "Your identity could not be verified",
    body: "Sign in again. Nothing was read.",
  },
  DECISION_DEPLOYMENT_PRINCIPAL_UNAVAILABLE: {
    title: "This deployment's service identity is unavailable",
    body: "The server-to-server credential is not installed or was refused. Nothing was read.",
  },
  ANALYST_IDENTITY_UNAVAILABLE: {
    title: "Identity verification is unavailable",
    body: "Cyntro could not verify the request's identity right now.",
  },
  ANALYST_RUNTIME_UNAVAILABLE: {
    title: "Identity verification is not configured",
    body: "This deployment does not pin a complete sign-in trust boundary. Nothing was read.",
  },
  // Refused by the proxy itself, before any backend call.
  SITE_SESSION_INVALID: {
    title: "Your session has expired",
    body: "Sign in again.",
  },
  ANALYST_AUTHENTICATED_PRINCIPAL_UNAVAILABLE: {
    title: "No authenticated operator on this request",
    body: "The private load balancer did not attach a verified operator identity.",
  },
}

/** REVIEW_SCOPE_MISMATCH names four different refusals; only the one without a reason is "outside the selected scope". */
const SCOPE_MISMATCH_COPY: Record<string, { title: string; body: string }> = {
  ANALYST_ACCOUNT_SCOPE_FORBIDDEN: {
    title: "No account-wide IAM role read grant",
    body: "This principal holds no account-wide IAM role read grant in this deployment.",
  },
  ANALYST_REGION_SCOPE_FORBIDDEN: {
    title: "The selected region is not the region this Review reads",
    body: "IAM is global; pick All regions or the deployment's region. Nothing was read.",
  },
}
const SCOPE_MISMATCH_PRINCIPAL_COPY = {
  title: "This principal may not review IAM roles here",
  body: "The verified principal holds no grant for this Review in this deployment. Nothing was read.",
}

export function reviewErrorCopy(error: ReviewRequestError): { title: string; body: string } {
  if (error.code === "REVIEW_SCOPE_MISMATCH" && error.upstreamCode) {
    return SCOPE_MISMATCH_COPY[error.upstreamCode] ?? SCOPE_MISMATCH_PRINCIPAL_COPY
  }
  const known = COPY[error.code]
  if (known) return known
  return {
    title: "Request failed",
    body: error.message || `HTTP ${error.status}`,
  }
}

/** The tenant states that can clear on their own; every other lifecycle refusal needs an operator. */
const TRANSIENT_TENANT_REASONS = [
  "ANALYST_SERVE_SCOPE_CHANGED",
  "ANALYST_SERVING_AUTHORITY_UNAVAILABLE",
  "TENANT_LIFECYCLE_UNREADABLE",
]

/** Scope-changing failures must not be retried as if they were transient. */
export function isRetryableReviewError(error: ReviewRequestError): boolean {
  if (error.code === "REVIEW_TENANT_NOT_SERVING") {
    return error.upstreamCode !== null && TRANSIENT_TENANT_REASONS.includes(error.upstreamCode)
  }
  // ANALYST_RUNTIME_UNAVAILABLE is a missing trust-boundary configuration, not a transient failure; the signing-key
  // outage is ANALYST_IDENTITY_UNAVAILABLE.
  return [
    "REVIEW_TIMEOUT",
    "REVIEW_BACKEND_UNAVAILABLE",
    "GAP_ANALYSIS_BUDGET_EXHAUSTED",
    "GAP_ANALYSIS_FAILED",
    "GRAPH_UNAVAILABLE",
    "ANALYST_IDENTITY_UNAVAILABLE",
  ].includes(error.code)
}

/** The system a Review row belongs to, from the row itself.
 *
 * Fixes > Permissions can be opened estate-wide, where the page has no system
 * of its own. The row always carries one, and the safety read requires it: a
 * missing system turned into "Cyntro could not verify safety for this role
 * because system context is missing" -- a refusal manufactured by the caller,
 * not by the evidence.
 */
export function reviewSystemName(resource: Record<string, unknown> | null | undefined): string | null {
  if (!resource) return null
  for (const key of ["systemName", "system_name", "SystemName", "system"]) {
    const value = resource[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}
