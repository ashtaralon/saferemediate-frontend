import { describe, expect, it } from "vitest"

import {
  selectRecommendedFootholdId,
  type AtlasFootholdCandidate,
  type FootholdPayload,
} from "@/components/attack-paths-v2/use-atlas-lateral"

function candidate(id: string): AtlasFootholdCandidate {
  return {
    workload_id: id,
    workload_name: id,
    workload_type: "EC2Instance",
    role_arn: null,
    role_name: null,
    foothold_likelihood: "ASSUMED_COMPROMISE",
    foothold_reasons: [],
    observed_access_to_jewel: false,
    access_last_seen: null,
    security_group_ids: [],
  }
}

function payload(overrides: Partial<FootholdPayload>): FootholdPayload {
  return {
    candidates: [],
    candidate_count: 0,
    ...overrides,
  }
}

describe("ATLAS lateral recommendation", () => {
  it("uses the server-authored reachable recommendation instead of the first inventory item", () => {
    const body = payload({
      candidates: [candidate("dead-end"), candidate("reachable")],
      candidate_count: 2,
      recommended_candidate_id: "reachable",
    })

    expect(selectRecommendedFootholdId(body)).toBe("reachable")
  })

  it("falls back safely when an older backend omits or returns a stale recommendation", () => {
    const candidates = [candidate("first"), candidate("second")]
    expect(selectRecommendedFootholdId(payload({ candidates, candidate_count: 2 }))).toBe("first")
    expect(
      selectRecommendedFootholdId(
        payload({ candidates, candidate_count: 2, recommended_candidate_id: "missing" }),
      ),
    ).toBe("first")
  })

  it("returns null when no compute footholds are eligible", () => {
    expect(selectRecommendedFootholdId(payload({}))).toBeNull()
  })
})
