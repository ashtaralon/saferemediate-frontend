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
export async function fetchWithEnvelope<T>(
  url: string,
  init?: RequestInit
): Promise<UnwrappedResponse<T>> {
  const withEnvelope = appendQuery(url, "envelope", "true")
  const res = await fetch(withEnvelope, init)
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}) for ${url}`)
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
