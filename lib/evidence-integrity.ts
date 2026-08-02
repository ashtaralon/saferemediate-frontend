/**
 * Fail-closed integrity for `/api/proxy/evidence/coverage`.
 *
 * Fourth sibling of summary- / paths- / candidates-integrity.
 *
 * The coverage response carries `errors[]`, and the card renders
 * "N account fetches failed" from it. Readiness, however, keyed on
 * `evidence.data` being truthy — so the management report could state
 * "5 of 5 feeds ready" while the panel beside it said an account had
 * failed. Partial coverage is not full coverage: an account we could not
 * read is an account whose evidence is missing from every downstream
 * number, and a board pack must not describe that as complete.
 */

export type EvidenceServeState = "READY" | "PARTIAL" | "UNAVAILABLE"

export interface EvidenceIntegrityFields {
  accounts?: unknown[]
  health?: { healthy?: number; degraded?: number; missing?: number; total?: number }
  errors?: string[]
  no_accounts?: boolean
  message?: string
}

export interface EvidenceIntegrity {
  state: EvidenceServeState
  reason: string | null
  /** Accounts we failed to read. Their evidence is absent, not empty. */
  failedAccounts: number
}

export function deriveEvidenceIntegrity(raw: unknown): EvidenceIntegrity {
  const p = (raw ?? null) as EvidenceIntegrityFields | null
  if (!p || typeof p !== "object") {
    return { state: "UNAVAILABLE", reason: "no payload", failedAccounts: 0 }
  }

  // "No accounts onboarded" is a complete, honest answer about an empty
  // estate — not a failed read.
  if (p.no_accounts === true) {
    return { state: "READY", reason: null, failedAccounts: 0 }
  }

  if (!Array.isArray(p.accounts)) {
    return {
      state: "UNAVAILABLE",
      reason: "no accounts array — cannot vouch for coverage",
      failedAccounts: 0,
    }
  }

  const errors = Array.isArray(p.errors) ? p.errors : []
  if (errors.length > 0) {
    return {
      state: "PARTIAL",
      reason: `${errors.length} account fetch${errors.length === 1 ? "" : "es"} failed`,
      failedAccounts: errors.length,
    }
  }

  return { state: "READY", reason: null, failedAccounts: 0 }
}

/** Only complete coverage may be cached as a reading. */
export function isCacheableEvidence(raw: unknown): boolean {
  return deriveEvidenceIntegrity(raw).state === "READY"
}
