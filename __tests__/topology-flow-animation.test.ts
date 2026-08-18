import { describe, expect, it } from "vitest"

import { shouldAnimateTrafficFlow } from "@/components/topology-v0-2/flow-visuals"

describe("shouldAnimateTrafficFlow", () => {
  it("animates authoritative observed segments", () => {
    expect(shouldAnimateTrafficFlow({
      evidence_type: "observed",
      authority_state: "authoritative",
      path_basis: "observed_segment",
      edge_class: "internal",
      protocol: "TCP",
      last_seen: "2026-08-18T18:00:00Z",
    })).toBe(true)
  })

  it("animates legacy ACTUAL_TRAFFIC in its source-to-target direction", () => {
    expect(shouldAnimateTrafficFlow({
      edge_class: "internal",
      protocol: "ACTUAL_TRAFFIC",
      last_seen: "2026-08-18T18:00:00Z",
    })).toBe(true)

    expect(shouldAnimateTrafficFlow({
      edge_class: "database",
      protocol: "TCP",
      last_seen: "2026-08-18T18:00:00Z",
    })).toBe(true)
  })

  it.each(["TARGETS", "TRIGGERS", "ENCRYPTED_BY", "ROUTES_TO", "QUERIES_DB"])(
    "keeps configured %s relations stationary",
    protocol => {
      expect(shouldAnimateTrafficFlow({
        edge_class: "internal",
        protocol,
        last_seen: "2026-08-18T18:00:00Z",
      })).toBe(false)
    },
  )

  it("does not override explicit inferred or legacy-unverified evidence", () => {
    expect(shouldAnimateTrafficFlow({
      evidence_type: "inferred",
      authority_state: "inferred",
      path_basis: "inferred_correlation",
      edge_class: "internal",
      protocol: "ACTUAL_TRAFFIC",
      last_seen: "2026-08-18T18:00:00Z",
    })).toBe(false)

    expect(shouldAnimateTrafficFlow({
      evidence_type: "observed",
      authority_state: "legacy_unverified",
      path_basis: "observed_segment",
      edge_class: "internal",
      protocol: "ACTUAL_TRAFFIC",
      last_seen: "2026-08-18T18:00:00Z",
    })).toBe(false)
  })
})
