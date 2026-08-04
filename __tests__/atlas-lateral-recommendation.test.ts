import { describe, expect, it } from "vitest"

import {
  selectRecommendedFootholdId,
  type AtlasFootholdCandidate,
  type FootholdPayload,
} from "@/components/attack-paths-v2/use-atlas-lateral"
import { partitionAtlasFootholds } from "@/components/attack-paths-v2/atlas-lateral-lens"

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

function evaluatedCandidate(
  id: string,
  state: "REACHABLE" | "DEAD_END",
): AtlasFootholdCandidate {
  return {
    ...candidate(id),
    atlas_evaluation: {
      state,
      chain_count: state === "REACHABLE" ? 2 : 0,
      dead_end_count: state === "DEAD_END" ? 1 : 0,
    },
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

  it("prefers a reachable candidate when an older backend omits its recommendation", () => {
    const candidates = [evaluatedCandidate("dead-end", "DEAD_END"), evaluatedCandidate("reachable", "REACHABLE")]
    expect(selectRecommendedFootholdId(payload({ candidates, candidate_count: 2 }))).toBe("reachable")
  })

  it("separates reachable footholds from evaluated dead ends", () => {
    const partition = partitionAtlasFootholds([
      evaluatedCandidate("reachable-1", "REACHABLE"),
      evaluatedCandidate("dead-1", "DEAD_END"),
      evaluatedCandidate("reachable-2", "REACHABLE"),
    ])
    expect(partition.reachable.map((item) => item.workload_id)).toEqual(["reachable-1", "reachable-2"])
    expect(partition.noPath.map((item) => item.workload_id)).toEqual(["dead-1"])
  })

  it("returns null when no compute footholds are eligible", () => {
    expect(selectRecommendedFootholdId(payload({}))).toBeNull()
  })
})
