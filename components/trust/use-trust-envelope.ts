import { Provenance, isTrustEnvelope } from "./trust-envelope-badge"

export interface UnwrappedResponse<T> {
  result: T
  provenance: Provenance | null
}

// Registered reason codes are upper-case identifiers; any other value is not a code.
const TYPED_CODE = /^[A-Z][A-Z0-9_]{2,127}$/

/**
 * A non-2xx envelope request. The message is exactly what callers have always shown;
 * `reasonCode` carries the registered refusal code when the body names one, so a
 * refusal is not reduced to "Request failed".
 */
export class EnvelopeRequestError extends Error {
  readonly status: number
  readonly reasonCode: string | null

  constructor(message: string, status: number, reasonCode: string | null) {
    super(message)
    this.name = "EnvelopeRequestError"
    this.status = status
    this.reasonCode = reasonCode
  }
}

async function typedReasonCode(res: Response): Promise<string | null> {
  try {
    const body = await res.json()
    const detail = body?.detail !== null && typeof body?.detail === "object" ? body.detail : null
    const candidate = body?.reason_code ?? body?.error_code ?? detail?.reason_code ?? detail?.error_code
    return typeof candidate === "string" && TYPED_CODE.test(candidate) ? candidate : null
  } catch {
    return null
  }
}

/**
 * Single shared contract for consuming envelope-aware endpoints.
 *
 * Rules:
 *  - always request `envelope=true`
 *  - if response has envelope shape, return { result, provenance }
 *  - if not (endpoint not yet wrapped), return { result: raw, provenance: null }
 *  - a 4xx/5xx throws EnvelopeRequestError with the unchanged message, carrying the
 *    registered reason code when the body names one
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
    throw new EnvelopeRequestError(`Request failed (${res.status}) for ${url}`, res.status, await typedReasonCode(res))
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
