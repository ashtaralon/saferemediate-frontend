import { Provenance, isTrustEnvelope } from "./trust-envelope-badge"

export interface UnwrappedResponse<T> {
  result: T
  provenance: Provenance | null
}

/**
 * A non-2xx response. The message is unchanged from the plain Error this
 * replaced; `status` and the parsed `body` let a caller show the backend's
 * structured refusal instead of a URL.
 */
export class EnvelopeRequestError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, body: unknown, url: string) {
    super(`Request failed (${status}) for ${url}`)
    this.name = "EnvelopeRequestError"
    this.status = status
    this.body = body
  }
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
export async function fetchWithEnvelope<T>(
  url: string,
  init?: RequestInit
): Promise<UnwrappedResponse<T>> {
  const withEnvelope = appendQuery(url, "envelope", "true")
  const res = await fetch(withEnvelope, init)
  if (!res.ok) {
    const body = await Promise.resolve()
      .then(() => res.json())
      .catch(() => null)
    throw new EnvelopeRequestError(res.status, body, url)
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
