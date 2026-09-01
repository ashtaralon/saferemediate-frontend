/**
 * Dependency coverage maturity — All Services Dependencies (workplan v1.3 §6.5).
 *
 * §6.5 requires a compact maturity indicator "derived from source-specific
 * coverage, not a manually set badge", which "must link to the exact source
 * gaps and never hide row-level uncertainty". This module is that derivation:
 * pure, deterministic, and testable, with the inputs it used reported back so
 * the UI can show why it landed where it did.
 */

export type CoverageState = "FULL" | "PARTIAL" | "NONE" | "UNKNOWN"

export interface DependencyCoverageInput {
  state: CoverageState
  required_sources: string[]
  present_sources: string[]
  missing_sources: string[]
  sufficient_for: string[]
  insufficient_for: string[]
}

/**
 * The five §6.5 states, plus UNVERIFIED.
 *
 * UNVERIFIED is a deliberate local extension, not a spec value. When the
 * dossier reports coverage UNKNOWN with no required_sources, we cannot claim
 * READY (nothing proved the sources fresh) and we cannot claim PARTIAL either
 * (§6.5 defines PARTIAL as a *known* missing source, and none is known).
 * Retire it once DE-205 ships coverage and freshness manifests.
 */
export type DependencyMaturity =
  | "READY" | "LEARNING" | "PARTIAL" | "STALE" | "BLOCKED" | "UNVERIFIED"

export interface MaturityVerdict {
  maturity: DependencyMaturity
  label: string
  /** Plain-language reason, shown next to the indicator. */
  reason: string
  /** Exact source gaps §6.5 requires the indicator to link to. */
  missingSources: string[]
  /** Conclusions the current coverage cannot support. */
  insufficientFor: string[]
}

export const MATURITY_LABELS: Record<DependencyMaturity, string> = {
  READY: "Ready",
  LEARNING: "Learning",
  PARTIAL: "Partial",
  STALE: "Stale",
  BLOCKED: "Blocked",
  UNVERIFIED: "Coverage unverified",
}

export interface MaturityRow {
  freshness: string
  basisClass: string
}

export function deriveDependencyMaturity(
  serveState: string | null | undefined,
  coverage: DependencyCoverageInput | null | undefined,
  rows: MaturityRow[],
): MaturityVerdict {
  const missingSources = coverage?.missing_sources ?? []
  const insufficientFor = coverage?.insufficient_for ?? []
  const base = { missingSources, insufficientFor }
  const state = coverage?.state ?? "UNKNOWN"
  // Defensive: a server that ever reports a state outside the contract must
  // not be silently upgraded into one of the good ones.
  const rawState = String(coverage?.state ?? "UNKNOWN").toUpperCase()
  const serve = String(serveState ?? "").toUpperCase()

  if (serve === "INTEGRITY_HELD" || rawState === "BLOCKED") {
    return {
      maturity: "BLOCKED", label: MATURITY_LABELS.BLOCKED,
      reason: "Identity, account targeting, generation integrity, or a source conflict prevents safe rendering.",
      ...base,
    }
  }

  const dated = rows.filter(row => row.freshness === "CURRENT" || row.freshness === "STALE")
  if (dated.length > 0 && dated.every(row => row.freshness === "STALE")) {
    return {
      maturity: "STALE", label: MATURITY_LABELS.STALE,
      reason: `All ${dated.length} dated relationship${dated.length === 1 ? "" : "s"} on this resource are marked stale by their collector.`,
      ...base,
    }
  }

  if (state === "PARTIAL" || state === "NONE" || missingSources.length > 0) {
    return {
      maturity: "PARTIAL", label: MATURITY_LABELS.PARTIAL,
      reason: missingSources.length
        ? `Required source${missingSources.length === 1 ? "" : "s"} not present: ${missingSources.join(", ")}.`
        : "A required source, account, region, or workload attribution is missing.",
      ...base,
    }
  }

  if (state === "FULL" && (serve === "ACTIVE" || serve === "")) {
    return {
      maturity: "READY", label: MATURITY_LABELS.READY,
      reason: "Mandatory configured sources are fresh for the displayed facts.",
      ...base,
    }
  }

  const hasConfigured = rows.some(row => row.basisClass === "CONFIGURED" || row.basisClass === "STRUCTURAL")
  const hasObserved = rows.some(row => row.basisClass === "OBSERVED")
  if (hasConfigured && !hasObserved) {
    return {
      maturity: "LEARNING", label: MATURITY_LABELS.LEARNING,
      reason: "Configured facts are available while runtime observation windows are still accumulating.",
      ...base,
    }
  }

  return {
    maturity: "UNVERIFIED", label: MATURITY_LABELS.UNVERIFIED,
    reason: "The dossier did not report which sources are required for this resource, so freshness cannot be proven either way.",
    ...base,
  }
}
