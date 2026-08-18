import { describe, expect, it } from "vitest"
import { trafficMotionKind } from "@/components/topology-v0-2/aws-frame"

describe("estate topology traffic motion", () => {
  it("uses strong motion for authoritative observed segments", () => {
    expect(trafficMotionKind({
      evidence_type: "observed",
      authority_state: "authoritative",
      path_basis: "observed_segment",
      last_seen: "2026-08-18T09:26:44Z",
    })).toBe("authoritative")
  })

  it("uses slower historical direction motion for timestamped legacy evidence", () => {
    expect(trafficMotionKind({
      evidence_type: "inferred",
      authority_state: "legacy_unverified",
      path_basis: "inferred_correlation",
      last_seen: "2026-08-11T16:17:01Z",
    })).toBe("historical")
  })

  it("keeps configured and untimestamped inferred paths static", () => {
    expect(trafficMotionKind({
      evidence_type: "configured",
      authority_state: "configured",
      path_basis: "configured_route",
      last_seen: null,
    })).toBe("none")
    expect(trafficMotionKind({
      evidence_type: "inferred",
      authority_state: "legacy_unverified",
      path_basis: "inferred_correlation",
      last_seen: null,
    })).toBe("none")
  })
})
