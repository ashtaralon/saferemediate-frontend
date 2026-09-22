import { Provenance, isTrustEnvelope } from "./trust-envelope-badge"

export interface UnwrappedResponse<T> {
  result: T
  provenance: Provenance | null
}

/**
 * Single shared contract for consuming envelope-aware endpoints.
 *
 * Rules:
 *  - always request `envelope=true`
 *  - if response has envelope shape, return { result, provenance }
 *  - if not (endpoint not yet wrapped, or 4xx/5xx body), return { result: raw, provenance: null }
 *  - NEVER fabricate a provenance object; missing = null, not a fake default
 *
 * Views should render the badge only when `provenance` is non-null. That
 * surfaces the gap honestly rather than inventing a fake "high/fresh" state.
 */
/**
 * A non-2xx from an envelope-aware endpoint, carrying what the proxy said.
 *
 * The thrown `Error` used to be the whole story: `Request failed (502) for
 * <url>`, with the response body dropped on the floor. The proxy had already
 * put the backend's typed refusal in that body -- `{detail: {code:
 * REVIEW_RUNTIME_UNAVAILABLE}}` for a deliberately disabled seam -- and every
 * consumer rendered the status number instead, so "this capability is switched
 * off in this deployment" and "the gateway is broken" looked identical and
 * both offered a Retry that could never help.
 *
 * `message` stays byte-identical so existing catch blocks that render it are
 * unchanged; the typed fields are additive.
 */
export class EnvelopeFetchError extends Error {
  readonly status: number
  /** The backend's status before any proxy collapse, when the proxy said so. */
  readonly backendStatus: number | null
  /** The refusal code, when the body carried one. */
  readonly code: string | null
  /** The refusal's own operator-facing message, when it carried one. */
  readonly detailMessage: string | null
  readonly body: unknown

  constructor(url: string, res: Response, body: unknown) {
    super(`Request failed (${res.status}) for ${url}`)
    this.name = "EnvelopeFetchError"
    this.status = res.status
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null
    const rawBackend = record?.backendStatus
    this.backendStatus = typeof rawBackend === "number" ? rawBackend : null
    // The refusal sits at `detail` (this proxy) or `detail.detail` (FastAPI's
    // own envelope forwarded whole). Read both; invent neither.
    const outer = record?.detail
    const outerRecord = outer && typeof outer === "object" ? (outer as Record<string, unknown>) : null
    const inner = outerRecord?.detail
    const innerRecord = inner && typeof inner === "object" ? (inner as Record<string, unknown>) : null
    const source = innerRecord ?? outerRecord
    this.code = typeof source?.code === "string" ? source.code : null
    this.detailMessage = typeof source?.message === "string" ? source.message : null
    this.body = body
  }
}

export async function fetchWithEnvelope<T>(
  url: string,
  init?: RequestInit
): Promise<UnwrappedResponse<T>> {
  const withEnvelope = appendQuery(url, "envelope", "true")
  const res = await fetch(withEnvelope, init)
  if (!res.ok) {
    // Read the body before throwing. It is the only place the refusal's code
    // exists, and a failed parse must not mask the real status.
    const body = await res.json().catch(() => null)
    throw new EnvelopeFetchError(url, res, body)
  }
  const raw = await res.json()
  if (isTrustEnvelope(raw)) {
    return {
      result: raw.result as T,
      provenance: raw.provenance,
    }
  }
  return { result: raw as T, provenance: null }
}

function appendQuery(url: string, key: string, value: string): string {
  const separator = url.includes("?") ? "&" : "?"
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`
}
