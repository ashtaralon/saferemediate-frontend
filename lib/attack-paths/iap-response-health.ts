// Is an empty Identity-Attack-Paths response TRUSTWORTHY, or did the compute
// fail?  The backend returns HTTP 200 even when the routing compute errors or
// runs cold — an error envelope shaped like a real one but carrying
// `result.error` and `crown_jewels: []`, with provenance flagging the graph
// source as unavailable.  Rendering that as "No crown jewels defined for this
// system yet" is a FABRICATED conclusion (CLAUDE.md rule #1): it tells the
// operator the system is clean when the truth is "we couldn't read the graph."
//
// Crown jewels are derived from the serving graph (Amazon Neptune), so an
// empty jewel list is only meaningful when that source was actually read and
// fresh.
// This pure classifier is the single place that distinguishes the two — the
// UI gates its honest-empty state on it. Works for ANY system: no hardcoded
// ids, no per-system logic; it reads the response's own provenance.
import type { Provenance } from "@/components/trust/trust-envelope-badge"
import { isTrustEnvelope } from "@/components/trust/trust-envelope-badge"

// The graph source that crown-jewel + attack-path derivation reads from.
// The backend renamed this key from `neo4j_graph` to `serving_graph`: the old
// name was the Bolt DRIVER package's, never the database, and the engine is
// Amazon Neptune. The backend emits BOTH keys during the transition, and the
// two repos deploy independently, so read the canonical one and fall back —
// this file must be correct against a backend of either vintage.
const JEWEL_SOURCE = "serving_graph"
const JEWEL_SOURCE_LEGACY = "neo4j_graph"

/** The graph freshness entry, whichever key this backend emits. */
export function jewelSourceEntry(
  freshness: Record<string, unknown> | null | undefined,
): unknown {
  if (!freshness) return undefined
  return freshness[JEWEL_SOURCE] ?? freshness[JEWEL_SOURCE_LEGACY]
}

export interface IapResponseHealth {
  /** True when the response is an error / cold-compute envelope that must NOT
   *  be read as a factual "0 crown jewels". */
  failed: boolean
  /** Operator-facing reason, null when healthy. */
  reason: string | null
  /** The graph source was missing / stale / unknown — jewel emptiness is
   *  meaningless. */
  graphUnavailable: boolean
}

const HEALTHY: IapResponseHealth = {
  failed: false,
  reason: null,
  graphUnavailable: false,
}

/**
 * Classify the raw IAP response (the trust envelope OR a bare result).
 * @param rawData  the value returned by the fetch hook (envelope or result)
 * @param result   the unwrapped result (rawData.result when enveloped)
 */
export function classifyIapResponse(
  rawData: unknown,
  result: { error?: string | null; status?: string | null } | null | undefined,
): IapResponseHealth {
  if (rawData == null && result == null) return HEALTHY

  // 0. Wave D computing envelope (proxy 5s abort / peer_computing) —
  // HTTP 200 with empty jewels is NOT a trustworthy empty.
  const rawStatus =
    rawData && typeof rawData === "object"
      ? (rawData as { status?: unknown }).status
      : undefined
  const resultStatus = result?.status
  if (rawStatus === "computing" || resultStatus === "computing") {
    const staleReason =
      rawData && typeof rawData === "object"
        ? (rawData as { staleReason?: unknown }).staleReason
        : undefined
    return {
      failed: true,
      reason:
        typeof staleReason === "string" && staleReason
          ? `Attack paths still computing (${staleReason}).`
          : "Attack paths still computing.",
      graphUnavailable: true,
    }
  }

  // 1. Result-level error — the backend told us the compute failed.
  const resultError = result?.error
  if (resultError) {
    return {
      failed: true,
      reason: String(resultError),
      graphUnavailable: true,
    }
  }

  // 2. Provenance says the graph source wasn't read (missing / stale / unknown).
  const provenance: Provenance | null = isTrustEnvelope(rawData)
    ? (rawData.provenance as Provenance)
    : null
  if (provenance) {
    const missing = provenance.completeness?.missing_sources ?? []
    // Accept either spelling: an older backend reports only `neo4j_graph`,
    // a newer one reports `serving_graph` (and echoes the legacy key). Keying
    // on one alone would read a perfectly healthy response as "graph
    // unavailable" and hide real crown jewels behind a false failure state.
    const graphMissing =
      missing.includes(JEWEL_SOURCE) || missing.includes(JEWEL_SOURCE_LEGACY)
    const graphStatus = (
      provenance.freshness?.[JEWEL_SOURCE] ??
      provenance.freshness?.[JEWEL_SOURCE_LEGACY]
    )?.status
    const graphUnavailable =
      graphMissing || graphStatus === "unknown" || graphStatus === "stale"
    if (graphUnavailable) {
      return {
        failed: true,
        reason: graphMissing
          ? "The graph snapshot wasn't available for this compute."
          : `Graph snapshot is ${graphStatus}.`,
        graphUnavailable: true,
      }
    }
  }

  return HEALTHY
}
