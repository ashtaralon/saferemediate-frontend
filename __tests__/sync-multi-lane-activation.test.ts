/**
 * The combined parent-round activation receipt, as the v2 backend emits it.
 *
 * WHAT THIS GUARDS. A round can refresh several lanes, and each carries its
 * own serving receipt off its own graph pointer. The backend therefore leaves
 * the scalar `projection_receipt_hash` null on a multi-lane round and puts the
 * set in `projection_receipt_hashes`, because electing one lane's hash to
 * stand for the round would be a claim about the others.
 *
 * `isActivated` used to read only the scalar. Against a multi-lane round that
 * returns false for a fully served estate -- a FALSE NEGATIVE, which is worse
 * than a refusal: the customer re-runs work that already succeeded, and the
 * screen shows a failure where there was none.
 *
 * The success copy had the mirror-image problem: it said "Vulnerability
 * findings generation N is active" whatever lane ran, so the IAM,
 * least-privilege, behavioral, dependency and inventory controls all claimed
 * a vulnerability refresh they had not performed.
 */
import { describe, expect, it } from "vitest"

import {
  activatedLanes,
  formatSyncSuccessMessage,
  isActivated,
  laneSubject,
  MANAGED_SYNC_LANE,
  unservedLanes,
  type SyncJobStatus,
} from "@/lib/sync-from-aws"

function round(over: Partial<SyncJobStatus> = {}): SyncJobStatus {
  return {
    job_id: "round-1",
    status: "completed",
    message: "",
    ...over,
  } as SyncJobStatus
}

const INV = "sha256:inventory-receipt"
const FLOW = "sha256:flow-receipt"

function servingLane(generation: number, hash: string) {
  return {
    state: "SERVING_ACTIVE_GENERATION",
    lifecycle_stage: "SERVING_ACTIVE_GENERATION",
    is_terminal: true,
    activation: {
      active_generation: generation,
      projection_receipt_hash: hash,
      asserts_serving: true,
    },
  }
}

describe("isActivated across lane counts", () => {
  it("accepts a single-lane round by its scalar hash", () => {
    expect(
      isActivated(
        round({
          activation: {
            activated: true,
            lanes: ["inventory_reconcile"],
            projection_receipt_hash: INV,
            projection_receipt_hashes: [INV],
          },
        }),
      ),
    ).toBe(true)
  })

  it("accepts a MULTI-lane round whose scalar hash is null by design", () => {
    expect(
      isActivated(
        round({
          activation: {
            activated: true,
            lanes: ["inventory_reconcile", "network_flow"],
            projection_receipt_hash: null,
            projection_receipt_hashes: [FLOW, INV],
          },
        }),
      ),
    ).toBe(true)
  })

  it("rejects a round whose hash set is empty", () => {
    expect(
      isActivated(
        round({
          activation: {
            activated: true,
            lanes: [],
            projection_receipt_hash: null,
            projection_receipt_hashes: [],
          },
        }),
      ),
    ).toBe(false)
  })

  it.each([[""], ["   "]])(
    "rejects a round where one lane carries a blank hash (%j)", (blank) => {
      expect(
        isActivated(
          round({
            activation: {
              activated: true,
              lanes: ["inventory_reconcile", "network_flow"],
              projection_receipt_hash: null,
              projection_receipt_hashes: [INV, blank],
            },
          }),
        ),
      ).toBe(false)
    },
  )

  it("rejects a round that is not completed however many hashes it carries", () => {
    expect(
      isActivated(
        round({
          status: "running",
          activation: { projection_receipt_hashes: [INV, FLOW] },
        }),
      ),
    ).toBe(false)
  })

  it("rejects a completed round with no activation block at all", () => {
    expect(isActivated(round())).toBe(false)
  })

  it("rejects an activation block that only claims activated:true", () => {
    expect(isActivated(round({ activation: { activated: true } }))).toBe(false)
  })
})

describe("which lanes a round actually served", () => {
  it("names the lanes from the activation block", () => {
    expect(
      activatedLanes(
        round({
          activation: {
            lanes: ["network_flow", "inventory_reconcile"],
            projection_receipt_hashes: [INV, FLOW],
          },
        }),
      ),
    ).toEqual(["inventory_reconcile", "network_flow"])
  })

  it("falls back to the per-lane map, counting only serving lanes", () => {
    expect(
      activatedLanes(
        round({
          activation: { projection_receipt_hashes: [INV] },
          lanes: {
            inventory_reconcile: servingLane(12, INV),
            network_flow: { state: "EVIDENCE_COMMITTED", reason: "NO_ACTIVE_GENERATION" },
          },
        }),
      ),
    ).toEqual(["inventory_reconcile"])
  })

  it("returns nothing for a round that is not activated", () => {
    expect(activatedLanes(round({ status: "running" }))).toEqual([])
  })

  it("reports unserved lanes with their typed reason", () => {
    expect(
      unservedLanes(
        round({
          lanes: {
            inventory_reconcile: servingLane(12, INV),
            api_activity: {
              state: "NOT_CONNECTED",
              reason: "no_completion_receipt",
              detail: "no producer commits anything",
            },
          },
        }),
      ),
    ).toEqual([
      {
        lane: "api_activity",
        state: "NOT_CONNECTED",
        reason: "no_completion_receipt",
        detail: "no producer commits anything",
      },
    ])
  })

  it("an EVIDENCE_COMMITTED lane is UNSERVED, not a near-miss of success", () => {
    const rows = unservedLanes(
      round({
        lanes: {
          inventory_reconcile: {
            state: "EVIDENCE_COMMITTED",
            lifecycle_stage: "EVIDENCE_COMMITTED",
            is_terminal: false,
            reason: "NO_ACTIVE_GENERATION",
          },
        },
      }),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].state).toBe("EVIDENCE_COMMITTED")
  })
})

describe("success copy names what actually ran", () => {
  it("does not claim vulnerabilities for an inventory round", () => {
    const text = formatSyncSuccessMessage(
      round({
        activation: {
          lanes: ["inventory_reconcile"],
          projection_receipt_hashes: [INV],
          active_generations: { inventory_reconcile: 12 },
        },
      }),
    )
    expect(text).toContain("AWS inventory generation 12")
    expect(text).not.toContain("Vulnerability")
  })

  it("still names vulnerabilities for a vulnerability round", () => {
    const text = formatSyncSuccessMessage(
      round({
        activation: {
          lanes: ["vulnerability_findings"],
          projection_receipt_hashes: [INV],
          active_generations: { vulnerability_findings: 9 },
        },
      }),
    )
    expect(text).toContain("Vulnerability findings generation 9")
  })

  it("names every lane and its own generation on a multi-lane round", () => {
    const text = formatSyncSuccessMessage(
      round({
        activation: {
          lanes: ["inventory_reconcile", "network_flow"],
          projection_receipt_hash: null,
          projection_receipt_hashes: [INV, FLOW],
          active_generations: { inventory_reconcile: 12, network_flow: 4 },
        },
      }),
    )
    expect(text).toContain("inventory_reconcile generation 12")
    expect(text).toContain("network_flow generation 4")
    // Lanes do not share a counter, so there is no single round generation.
    expect(text).not.toMatch(/generation 12 (is|and) active in Neptune\.$/)
  })

  it("says which requested lanes are NOT being served", () => {
    const text = formatSyncSuccessMessage(
      round({
        activation: {
          lanes: ["inventory_reconcile"],
          projection_receipt_hashes: [INV],
          active_generations: { inventory_reconcile: 12 },
        },
        lanes: {
          inventory_reconcile: servingLane(12, INV),
          api_activity: { state: "NOT_CONNECTED", reason: "no_completion_receipt" },
        },
      }),
    )
    expect(text).toContain("not being served yet")
    expect(text).toContain("api_activity")
    expect(text).toContain("no_completion_receipt")
  })

  it("never invents counts that were not measured", () => {
    const text = formatSyncSuccessMessage(
      round({
        activation: {
          lanes: ["inventory_reconcile"],
          projection_receipt_hashes: [INV],
          active_generations: { inventory_reconcile: 12 },
        },
      }),
    )
    expect(text).not.toContain(" 0 active findings")
    expect(text).not.toContain("NaN")
    expect(text).not.toContain("undefined")
  })

  it("keeps counts when the producer really sent them", () => {
    const text = formatSyncSuccessMessage(
      round({
        activation: {
          lanes: ["vulnerability_findings"],
          projection_receipt_hashes: [INV],
          active_generations: { vulnerability_findings: 9 },
        },
        results: {
          vulnerability_findings: { active_findings: 7, active_coverage: 3 },
        },
      } as Partial<SyncJobStatus>),
    )
    expect(text).toContain("7 active findings across 3 covered resources")
  })
})

describe("the managed Inspector payload keeps its lane", () => {
  /**
   * REGRESSION. Generalising the success copy to multi-lane rounds broke the
   * single-lane managed payload: it carries a scalar
   * `activation.projection_generation` and NO `lanes` array, so the lane
   * resolved to nothing and the copy degraded from "Vulnerability findings
   * generation 9" to an anonymous "This refresh generation 9". Losing a
   * correct, specific subject is a regression even though the replacement is
   * not a false claim.
   */
  const managed = round({
    activation: {
      activated: true,
      projection_generation: 9,
      projection_receipt_hash: "v1:x",
    },
  })

  it("is still recognised as activated by its scalar hash", () => {
    expect(isActivated(managed)).toBe(true)
  })

  it("resolves to the lane the managed plane actually serves", () => {
    expect(activatedLanes(managed)).toEqual(["vulnerability_findings"])
  })

  it("names vulnerability findings, not an anonymous refresh", () => {
    const text = formatSyncSuccessMessage(managed)
    expect(text).toContain("Vulnerability findings generation 9")
    expect(text).not.toContain("This refresh")
  })

  it("does not invent a managed lane for a round with no generation at all", () => {
    expect(
      activatedLanes(
        round({ activation: { activated: true, projection_receipt_hash: "v1:x" } }),
      ),
    ).toEqual([])
  })

  it("prefers a real lane map over the managed assumption", () => {
    expect(
      activatedLanes(
        round({
          activation: { projection_generation: 9, projection_receipt_hash: "v1:x" },
          lanes: { inventory_reconcile: servingLane(12, INV) },
        }),
      ),
    ).toEqual(["inventory_reconcile"])
  })
})

describe("lane subjects", () => {
  it("names each known lane distinctly", () => {
    const subjects = [
      "vulnerability_findings",
      "inventory_reconcile",
      "network_flow",
      "api_activity",
    ].map(laneSubject)
    expect(new Set(subjects).size).toBe(subjects.length)
  })

  it("returns an unknown lane's own identifier rather than a wrong noun", () => {
    expect(laneSubject("some_new_lane")).toBe("some_new_lane")
    expect(laneSubject("some_new_lane")).not.toContain("Vulnerability")
  })
})


describe("the managed lane constant mirrors the backend", () => {
  it("is the lane api/v2_sync.py's NEPTUNE_MANAGED_SOURCE names", () => {
    // If the backend constant changes, this assumption stops being reading
    // the producer and becomes a guess.
    expect(MANAGED_SYNC_LANE).toBe("vulnerability_findings")
  })

  it("has a distinct subject, so the assumption is visible in the copy", () => {
    expect(laneSubject(MANAGED_SYNC_LANE)).toBe("Vulnerability findings")
  })
})
