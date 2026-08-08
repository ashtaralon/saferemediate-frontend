import { describe, it, expect } from "vitest"
import { classifyIapResponse } from "@/lib/attack-paths/iap-response-health"

// Envelope shapes captured VERBATIM from the live alon-prod backend
// (2026-07-03) — the exact pair that produced the "0 crown jewels" false
// empty on a cold backend.

// Cold/failed compute: HTTP 200, result.error set, graph source unavailable.
const ERROR_ENVELOPE = {
  result: {
    system_name: "alon-prod",
    crown_jewels: [],
    paths: [],
    total_jewels: 0,
    error: "500: Unable to retrieve routing information",
  },
  provenance: {
    freshness: {
      neo4j_graph: { last_sync: null, age_seconds: null, status: "unknown" },
      behavioral_map: { last_sync: null, age_seconds: null, status: "unknown" },
    },
    completeness: {
      status: "partial",
      missing_sources: ["neo4j_graph", "behavioral_map", "all_services"],
    },
  },
}

// Healthy compute: 13 jewels, no error, graph fresh (only all_services missing).
const HEALTHY_ENVELOPE = {
  result: {
    system_name: "alon-prod",
    crown_jewels: Array.from({ length: 13 }, (_, i) => ({ id: `j${i}` })),
    paths: Array.from({ length: 30 }, (_, i) => ({ id: `p${i}` })),
    total_jewels: 13,
    error: null,
  },
  provenance: {
    freshness: {
      neo4j_graph: { last_sync: "2026-07-03T00:00:00Z", age_seconds: 60, status: "fresh" },
      behavioral_map: { last_sync: "2026-07-03T00:00:00Z", age_seconds: 60, status: "fresh" },
    },
    completeness: { status: "partial", missing_sources: ["all_services"] },
  },
}

// Genuine empty: healthy graph, zero jewels — a real "no crown jewels".
const GENUINE_EMPTY_ENVELOPE = {
  result: { system_name: "cyntroprod", crown_jewels: [], paths: [], total_jewels: 0, error: null },
  provenance: {
    freshness: { neo4j_graph: { last_sync: "2026-07-03T00:00:00Z", age_seconds: 60, status: "fresh" } },
    completeness: { status: "complete", missing_sources: [] },
  },
}

describe("classifyIapResponse", () => {
  it("flags the error envelope as failed (must NOT render as '0 crown jewels')", () => {
    const h = classifyIapResponse(ERROR_ENVELOPE, ERROR_ENVELOPE.result)
    expect(h.failed).toBe(true)
    expect(h.graphUnavailable).toBe(true)
    expect(h.reason).toContain("Unable to retrieve routing information")
  })

  it("flags graph-unavailable even without a result.error (missing source)", () => {
    const noExplicitError = {
      ...ERROR_ENVELOPE,
      result: { ...ERROR_ENVELOPE.result, error: null },
    }
    const h = classifyIapResponse(noExplicitError, noExplicitError.result)
    expect(h.failed).toBe(true)
    expect(h.graphUnavailable).toBe(true)
  })

  it("flags a stale graph snapshot as failed", () => {
    const stale = {
      result: { crown_jewels: [], error: null },
      provenance: {
        freshness: { neo4j_graph: { status: "stale" } },
        completeness: { status: "partial", missing_sources: [] },
      },
    }
    expect(classifyIapResponse(stale, stale.result).failed).toBe(true)
  })

  it("treats the healthy 13-jewel envelope as healthy", () => {
    const h = classifyIapResponse(HEALTHY_ENVELOPE, HEALTHY_ENVELOPE.result)
    expect(h.failed).toBe(false)
    expect(h.graphUnavailable).toBe(false)
    expect(h.reason).toBeNull()
  })

  it("treats a genuine empty (fresh graph, 0 jewels) as healthy — real empty renders", () => {
    const h = classifyIapResponse(GENUINE_EMPTY_ENVELOPE, GENUINE_EMPTY_ENVELOPE.result)
    expect(h.failed).toBe(false)
  })

  it("all_services missing alone never trips failure (graph still fresh)", () => {
    // Regression guard: the healthy alon-prod response is completeness=partial
    // because all_services is unknown — that must NOT read as a failure.
    expect(classifyIapResponse(HEALTHY_ENVELOPE, HEALTHY_ENVELOPE.result).failed).toBe(false)
  })

  it("is null-safe", () => {
    expect(classifyIapResponse(null, null).failed).toBe(false)
    expect(classifyIapResponse(undefined, undefined).failed).toBe(false)
  })

  it("flags Wave D computing envelope as failed (not trustworthy empty)", () => {
    const computing = {
      status: "computing",
      staleReason: "peer_computing",
      crown_jewels: [],
      paths: [],
      total_jewels: 0,
    }
    const h = classifyIapResponse(computing, computing)
    expect(h.failed).toBe(true)
    expect(h.graphUnavailable).toBe(true)
    expect(h.reason).toContain("computing")
    expect(h.reason).toContain("peer_computing")
  })
})
