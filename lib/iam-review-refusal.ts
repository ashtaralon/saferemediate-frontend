/**
 * One bounded contract for a refused IAM Review read.
 *
 * The modal, the Permissions tab and its Rules panel all read
 * `/api/proxy/iam-roles/{role}/gap-analysis`, and all three used to lose the
 * backend's answer in a different way: the modal printed "Request failed
 * (502)", the tab returned null and rendered nothing, the Rules panel printed
 * "Failed to load IAM data: 503". Three surfaces, three ways to discard the
 * same truthful refusal.
 *
 * So the parse lives here, once, and it is an ALLOWLIST like the proxy's own:
 * `code`, `upstream_code` and `message`, each clipped. Nothing else from the
 * body is read, so a consumer cannot start depending on a field the producer
 * never promised, and an oversized or hostile body cannot reach a render.
 */

/** Longest string any preserved field may carry into a render. */
export const MAX_REFUSAL_FIELD_CHARS = 512

export const REVIEW_REFUSALS: Record<string, { title: string; guidance: string; retryable: boolean }> = {
  REVIEW_RUNTIME_UNAVAILABLE: {
    title: "Permission detail is not enabled in this deployment",
    guidance:
      "The Decision runtime that serves per-role permission detail is switched off here, so there is nothing to retry. The role list and its counts are unaffected.",
    retryable: false,
  },
  DECISION_DEPLOYMENT_PRINCIPAL_UNAVAILABLE: {
    title: "This deployment has no server credential installed",
    guidance:
      "The server-to-server credential this environment uses to reach the backend is not installed, so the request was refused before it was sent. This is a deployment setting, not your session.",
    retryable: false,
  },
  ANALYST_AUTHENTICATED_PRINCIPAL_UNAVAILABLE: {
    title: "No verified operator identity on this request",
    guidance:
      "The load balancer attached no signed identity, so the backend cannot tell who is asking. Signing in again through the normal entry point attaches one.",
    retryable: false,
  },
  REVIEW_SCOPE_MISMATCH: {
    title: "This role is outside the scope you are signed in to",
    guidance:
      "The backend resolved the role to a different account or tenant than this session is scoped to, and refused rather than answer across that boundary.",
    retryable: false,
  },
  REVIEW_TENANT_NOT_SERVING: {
    title: "This tenant is not serving review answers right now",
    guidance:
      "The tenant is mid-lifecycle: its serving authority is not currently answering. This usually clears on its own.",
    retryable: true,
  },
  REVIEW_SCOPE_UNAVAILABLE: {
    title: "The account scope for this review could not be resolved",
    guidance:
      "The backend could not resolve exactly one account for this request, so it refused rather than pick one.",
    retryable: false,
  },
  ROLE_NOT_FOUND_IN_SCOPE: {
    title: "That role is not in this account",
    guidance:
      "The backend found no such role inside the account this session is scoped to. It may belong to another account, or have been deleted.",
    retryable: false,
  },
  ROLE_REFERENCE_REQUIRED: {
    title: "The request did not identify a role",
    guidance: "No usable role name or ARN reached the backend.",
    retryable: false,
  },
}

export type ReviewRefusal = {
  /** The HTTP status the backend actually answered with, never a collapse. */
  status: number
  code: string
  upstream_code?: string
  /** The producer's own sentence, when it sent one. */
  message?: string
  /** False for a refusal that asking again cannot change. */
  retryable: boolean
  title: string
  guidance: string
}

function clip(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined
  return value.length > MAX_REFUSAL_FIELD_CHARS ? value.slice(0, MAX_REFUSAL_FIELD_CHARS) : value
}

/**
 * The typed refusal inside one non-OK Review response, or null when the body
 * carries none. Null means "not a typed refusal" -- it never means "no
 * problem", and it is never manufactured from whatever else was in the body.
 */
export async function readReviewRefusal(res: Response): Promise<ReviewRefusal | null> {
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    return null // not JSON: there is no typed refusal to read
  }
  if (!body || typeof body !== "object") return null
  const detail = (body as Record<string, unknown>).detail
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null
  const source = detail as Record<string, unknown>

  const code = clip(source.code)
  if (!code) return null

  const known = REVIEW_REFUSALS[code]
  return {
    status: res.status,
    code,
    ...(clip(source.upstream_code) ? { upstream_code: clip(source.upstream_code) } : {}),
    ...(clip(source.message) ? { message: clip(source.message) } : {}),
    // An unrecognised code is not dressed up as understood: it keeps the
    // producer's own words and stays retryable, as the modal already does.
    retryable: known ? known.retryable : true,
    title: known ? known.title : "The backend refused this request",
    guidance: known ? known.guidance : (clip(source.message) ?? "The backend refused without explaining why."),
  }
}

/**
 * One line for the surfaces that can only render a string. Carries the same
 * facts the modal's panel shows: what happened, whether retrying can help,
 * and the identifiers an operator quotes in a support conversation.
 */
export function reviewRefusalLine(refusal: ReviewRefusal): string {
  const ids = refusal.upstream_code
    ? `${refusal.code} / ${refusal.upstream_code} · HTTP ${refusal.status}`
    : `${refusal.code} · HTTP ${refusal.status}`
  const retry = refusal.retryable ? " You can try again." : " Retrying will not change this."
  return `${refusal.title}. ${refusal.guidance}${retry} (${ids})`
}

/** A refused Review read, raised so callers cannot mistake it for absent data. */
export class ReviewRefusalError extends Error {
  readonly refusal: ReviewRefusal | null
  readonly status: number
  constructor(status: number, refusal: ReviewRefusal | null) {
    super(refusal ? reviewRefusalLine(refusal) : `IAM Review read failed (HTTP ${status})`)
    this.name = "ReviewRefusalError"
    this.status = status
    this.refusal = refusal
  }
}
