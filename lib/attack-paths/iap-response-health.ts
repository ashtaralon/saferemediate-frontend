// Is an empty Identity-Attack-Paths response TRUSTWORTHY, or did the compute
// fail?  The backend returns HTTP 200 even when the routing compute errors or
// runs cold — an error envelope shaped like a real one but carrying
// `result.error` and `crown_jewels: []`, with provenance flagging the graph
// source as unavailable.  Rendering that as "No crown jewels defined for this
// system yet" is a FABRICATED conclusion (CLAUDE.md rule #1): it tells the
// operator the system is clean when the truth is "we couldn't read the graph."
//
// Crown jewels are derived from the Neo4j graph, so an empty jewel list is
// only meaningful when the `neo4j_graph` source was actually read and fresh.
// This pure classifier is the single place that distinguishes the two — the
// UI gates its honest-empty state on it. Works for ANY system: no hardcoded
// ids, no per-system logic; it reads the response's own provenance.
import type { Provenance } from "@/components/trust/trust-envelope-badge"
import { isTrustEnvelope } from "@/components/trust/trust-envelope-badge"

// The graph source that crown-jewel + attack-path derivation reads from.
const JEWEL_SOURCE = "neo4j_graph"

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
  result: { error?: string | null } | null | undefined,
): IapResponseHealth {
  if (rawData == null && result == null) return HEALTHY

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
    const graphMissing = missing.includes(JEWEL_SOURCE)
    const graphStatus = provenance.freshness?.[JEWEL_SOURCE]?.status
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
