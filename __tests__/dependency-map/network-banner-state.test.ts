/**
 * The banner must never claim more than the data supports.
 *
 * Three overclaims, each fix leaving a weaker version of the same error:
 *   #465  "NO NETWORK CONTROLS · Network defenses do not apply" from 4 empty arrays
 *   #467  scoped to the path but still "so IAM is the only gate on it"
 *   here   a settled projection is an observation ABOUT THE PROJECTION, and
 *          authorization is not only IAM
 */
import { describe, expect, it } from "vitest"
import {
  NETWORK_CLAIM_BACKEND_GAPS,
  isVerifiedNonVpc,
  resolveNetworkBannerState,
  type WorkloadNetworkPayload,
} from "@/lib/attack-paths/network-banner-state"

/** Full server verdict — collector SSOT + path route_verdict token. */
const fullyVerified: WorkloadNetworkPayload = {
  is_vpc_attached: false,
  // The explicit verdict is now required for the strong claim. Without it the
  // boolean alone cannot distinguish "checked, not attached" from "unchecked".
  vpc_attachment_state: "NOT_VPC_ATTACHED",
  evidence: "Lambda VpcConfig empty (no VpcId), verified at 2026-07-30T07:00:00Z",
  workload_count_queried: 3,
  workload_count_in_sample: 3,
  verified_at: "2026-07-30T07:00:00Z",
  route_verdict: "EXECUTION_LOCATION_UNBOUND",
}

const READY = { settled: true, reason: "hops_ready" }
const PENDING = { settled: false, reason: "hops_pending" }

describe("a settled projection is only an observation", () => {
  it("does NOT claim non-VPC just because hops settled with no checkpoint", () => {
    const s = resolveNetworkBannerState(null, READY)
    expect(s.kind).toBe("no-checkpoints-represented")
    // The regression that shipped in #467: this was styled as a finding.
    expect(s.isFinding).toBe(false)
  })

  it("keeps the reason so the state is debuggable from the DOM", () => {
    expect(resolveNetworkBannerState(null, READY).reason).toBe("hops_ready")
  })

  it("is unverified — not an observation — when nothing settled", () => {
    const s = resolveNetworkBannerState(null, PENDING)
    expect(s.kind).toBe("unverified")
    expect(s.isFinding).toBe(false)
    expect(s.reason).toBe("hops_pending")
  })

  it("no posture at all still never becomes a finding", () => {
    // Estate map with nothing selected. Absence must not promote.
    const s = resolveNetworkBannerState(null, null)
    expect(s.kind).toBe("no-checkpoints-represented")
    expect(s.isFinding).toBe(false)
    expect(s.reason).toBe("posture_absent")
  })
})

describe("the strong claim requires an explicit server verdict", () => {
  it("is reached only when every condition is met", () => {
    const s = resolveNetworkBannerState(fullyVerified, READY)
    expect(s.kind).toBe("verified-non-vpc")
    expect(s.isFinding).toBe(true)
  })

  // Each field removed individually must DEMOTE, never promote.
  const demotions: Array<[string, Partial<WorkloadNetworkPayload>, string]> = [
    ["evidence missing", { evidence: null }, "workload_network_evidence_missing"],
    ["evidence blank", { evidence: "   " }, "workload_network_evidence_missing"],
    ["coverage incomplete", { workload_count_queried: 1, workload_count_in_sample: 5 }, "workload_network_coverage_incomplete"],
    ["timestamp missing", { verified_at: null }, "workload_network_timestamp_missing"],
    ["route verdict missing", { route_verdict: null }, "route_verdict_missing"],
  ]
  for (const [label, patch, reason] of demotions) {
    it(`demotes to an observation when ${label}`, () => {
      const s = resolveNetworkBannerState({ ...fullyVerified, ...patch }, READY)
      expect(s.kind).toBe("no-checkpoints-represented")
      expect(s.isFinding).toBe(false)
      expect(s.reason).toBe(reason)
    })
  }

  it("a VPC-attached workload makes no claim at all", () => {
    const s = resolveNetworkBannerState(
      { ...fullyVerified, is_vpc_attached: true },
      READY,
    )
    expect(s.kind).toBe("no-checkpoints-represented")
    expect(s.reason).toBe("workload_is_vpc_attached")
  })

  it("a sampled answer cannot speak for unqueried workloads", () => {
    // 2 of 7 queried is not a verdict about the workload.
    const s = resolveNetworkBannerState(
      { ...fullyVerified, workload_count_queried: 2, workload_count_in_sample: 7 },
      READY,
    )
    expect(s.isFinding).toBe(false)
  })

  it("a partial payload (pre-SSOT shape) still cannot reach the strong claim", () => {
    // Missing verified_at / route_verdict must keep failing closed even after
    // the collector lands — only a complete verdict promotes.
    const partial: WorkloadNetworkPayload = {
      is_vpc_attached: false,
      evidence: "lambda VpcConfig empty",
      workload_count_queried: 3,
      workload_count_in_sample: 3,
    }
    const s = resolveNetworkBannerState(partial, READY)
    expect(s.kind).toBe("no-checkpoints-represented")
    expect(NETWORK_CLAIM_BACKEND_GAPS).toEqual([])
  })

  it("an un-hydrated posture cannot be rescued by a server verdict path", () => {
    // Sanity: a full verdict is about the WORKLOAD, and is legitimately
    // independent of our hop hydration. It should still verify.
    expect(resolveNetworkBannerState(fullyVerified, PENDING).kind).toBe(
      "verified-non-vpc",
    )
  })
})

describe("no state is ever a finding except the verified one", () => {
  it("holds across every input combination", () => {
    const postures = [READY, PENDING, null]
    const payloads: Array<WorkloadNetworkPayload | null> = [
      null,
      { is_vpc_attached: true },
      { is_vpc_attached: false },
      { is_vpc_attached: false, evidence: "x" },
      { ...fullyVerified, verified_at: null },
      fullyVerified,
    ]
    for (const p of payloads) {
      for (const posture of postures) {
        const s = resolveNetworkBannerState(p, posture)
        expect(s.isFinding).toBe(s.kind === "verified-non-vpc")
        expect(s.reason).toBeTruthy() // never null — that was the #466 symptom
      }
    }
  })
})


describe("the boolean alone can never carry the strong claim", () => {
  /**
   * Only the Lambda collector writes an explicit attachment fact, so every EC2
   * instance reaches the UI as an unchecked `is_vpc_attached: false` —
   * byte-identical to a verified non-VPC Lambda. Promoting that to a finding
   * cites "network does not gate this path" against workloads whose posture was
   * never collected. Absence of the explicit verdict must degrade, not promote.
   */
  it("degrades a pre-contract payload to an observation", () => {
    const legacy = { ...fullyVerified, vpc_attachment_state: undefined }
    const s = resolveNetworkBannerState(legacy, READY)
    expect(s.kind).not.toBe("verified-non-vpc")
    expect(s.isFinding).toBe(false)
    expect(s.reason).toBe("workload_vpc_attachment_state_absent")
  })

  it("degrades an explicit UNKNOWN even when every other field is complete", () => {
    const s = resolveNetworkBannerState(
      { ...fullyVerified, vpc_attachment_state: "UNKNOWN" },
      READY,
    )
    expect(s.kind).not.toBe("verified-non-vpc")
    expect(s.isFinding).toBe(false)
    expect(s.reason).toBe("workload_vpc_attachment_unknown")
  })

  it("makes no claim for an explicitly VPC-attached workload", () => {
    const s = resolveNetworkBannerState(
      { ...fullyVerified, vpc_attachment_state: "VPC_ATTACHED" },
      READY,
    )
    expect(s.isFinding).toBe(false)
    expect(s.reason).toBe("workload_is_vpc_attached")
  })

  it("still requires evidence, coverage, timestamp and route verdict", () => {
    const weakened: Array<[string, Partial<WorkloadNetworkPayload>]> = [
      ["evidence", { evidence: "" }],
      ["verified_at", { verified_at: null }],
      ["route_verdict", { route_verdict: null }],
      ["coverage", { workload_count_queried: 1, workload_count_in_sample: 5 }],
    ]
    for (const [missing, patch] of weakened) {
      const s = resolveNetworkBannerState({ ...fullyVerified, ...patch }, READY)
      expect(s.isFinding, `${missing} must not be promotable`).toBe(false)
    }
  })
})

describe("isVerifiedNonVpc is the single implementation of the rule", () => {
  /**
   * The exfiltration view previously tested `is_vpc_attached === false` inline
   * and never saw the guards above — the resolver was correct and simply
   * bypassed. Any consumer asserting non-applicability must route through here.
   */
  it("is true only for a complete explicit verdict", () => {
    expect(isVerifiedNonVpc(fullyVerified, READY)).toBe(true)
  })

  it("is false for legacy, unknown, attached, and absent payloads", () => {
    expect(isVerifiedNonVpc({ ...fullyVerified, vpc_attachment_state: undefined })).toBe(false)
    expect(isVerifiedNonVpc({ ...fullyVerified, vpc_attachment_state: "UNKNOWN" })).toBe(false)
    expect(isVerifiedNonVpc({ ...fullyVerified, vpc_attachment_state: "VPC_ATTACHED" })).toBe(false)
    expect(isVerifiedNonVpc(null)).toBe(false)
    expect(isVerifiedNonVpc(undefined)).toBe(false)
  })
})
