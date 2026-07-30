/**
 * path_state and activity_state are ORTHOGONAL.
 *
 * The first version of this composer made observed traffic a precondition for
 * reachability, so a configured, provably usable path could not be called
 * reachable until traffic happened to be seen. That confuses "we observed it
 * happen" with "an attacker can do it", and made the single most important
 * state — REACHABLE + NOT_OBSERVED, the gap this product exists to find —
 * inexpressible.
 */
import { describe, expect, it } from "vitest"
import {
  composePathVerdict,
  deriveActivityState,
  extractRouteVerdictToken,
  type PathVerdictInput,
} from "@/lib/attack-paths/path-feasibility-verdict"

/** Fully server-composed: every checkpoint an explicit pass. */
const ALL_PASS: PathVerdictInput = {
  routeVerdict: "ROUTE_BOUND",
  authorizationComposed: "PASS",
  dataAccessComposed: "PASS",
  coverageState: "READY",
}

/** The live DTO from the screenshot. */
const LIVE_DTO: PathVerdictInput = {
  routeGate: "OPEN_CONFIG",
  routeVerdict: "EXECUTION_LOCATION_UNBOUND",
  coverageState: "PARTIAL",
  observedTrafficBound: false,
}

describe("observation never upgrades feasibility", () => {
  it("THE fixture: REACHABLE + NOT_OBSERVED", () => {
    // Configured and proven usable, never exercised. Must be reachable.
    const v = composePathVerdict({
      ...ALL_PASS,
      observedTrafficBound: false,
      observationCoverage: "COLLECTED",
    })
    expect(v.pathState).toBe("REACHABLE")
    expect(v.activityState).toBe("NOT_OBSERVED")
  })

  it("adding an observation does not change path_state", () => {
    const without = composePathVerdict({ ...ALL_PASS, observedTrafficBound: false })
    const withObs = composePathVerdict({ ...ALL_PASS, observedTrafficBound: true })
    expect(withObs.pathState).toBe(without.pathState)
    expect(withObs.activityState).toBe("OBSERVED")
    expect(without.activityState).not.toBe("OBSERVED")
  })

  it("an observation cannot rescue an unverified path", () => {
    // Seeing traffic on a path whose authorization was never composed does not
    // make it reachable — we still cannot say the attacker can do it.
    const v = composePathVerdict({
      routeVerdict: "ROUTE_BOUND",
      observedTrafficBound: true,
      observationCoverage: "COLLECTED",
    })
    expect(v.pathState).toBe("UNVERIFIED")
    expect(v.activityState).toBe("OBSERVED")
  })

  it("path_state is identical across every activity input", () => {
    for (const bound of [true, false, undefined]) {
      for (const cov of ["COLLECTED", "NOT_COLLECTED", "UNKNOWN", null] as const) {
        const v = composePathVerdict({
          ...LIVE_DTO,
          observedTrafficBound: bound,
          observationCoverage: cov,
        })
        expect(v.pathState).toBe("UNVERIFIED")
      }
    }
  })
})

describe("REACHABLE requires explicit server-backed passes", () => {
  it("is reached when every checkpoint passes", () => {
    expect(composePathVerdict(ALL_PASS).pathState).toBe("REACHABLE")
  })

  const demotions: Array<[string, Partial<PathVerdictInput>]> = [
    ["authorization not composed", { authorizationComposed: null }],
    ["data access not composed", { dataAccessComposed: null }],
    ["no route verdict", { routeVerdict: null }],
    ["coverage PARTIAL", { coverageState: "PARTIAL" }],
    ["coverage NOT_READY", { coverageState: "NOT_READY" }],
  ]
  for (const [label, patch] of demotions) {
    it(`is UNVERIFIED when ${label}`, () => {
      expect(composePathVerdict({ ...ALL_PASS, ...patch }).pathState).toBe(
        "UNVERIFIED",
      )
    })
  }

  it("today's real shape stays UNVERIFIED even with a configured route", () => {
    // No composed authorization evaluator exists, so a configured route is not
    // enough. Honestly unverified beats locally manufactured reachability.
    const v = composePathVerdict({ routeVerdict: "ROUTE_BOUND", coverageState: "READY" })
    expect(v.pathState).toBe("UNVERIFIED")
    expect(
      v.checkpoints.find((c) => c.key === "authorization")!.detail,
    ).toContain("not composed")
  })
})

describe("the specific route verdict still beats the coarse gate", () => {
  it("OPEN_CONFIG does not override EXECUTION_LOCATION_UNBOUND", () => {
    const net = composePathVerdict(LIVE_DTO).checkpoints.find(
      (c) => c.key === "execution_network",
    )!
    expect(net.state).toBe("UNVERIFIED")
    expect(net.detail).toContain("overrides coarse gate OPEN_CONFIG")
  })

  it("a coarse gate alone can never produce a PASS", () => {
    const net = composePathVerdict({ routeGate: "OPEN_CONFIG" }).checkpoints.find(
      (c) => c.key === "execution_network",
    )!
    expect(net.state).toBe("UNVERIFIED")
  })

  it("the live path headline names the unbound verdict", () => {
    expect(composePathVerdict(LIVE_DTO).headline).toBe(
      "UNVERIFIED · EXECUTION LOCATION UNBOUND",
    )
  })
})

describe("BLOCKED and OUT_OF_SCOPE", () => {
  it("a server-backed route blocker wins over passes and observation", () => {
    const v = composePathVerdict({
      ...ALL_PASS,
      routeVerdict: "BLOCKED",
      observedTrafficBound: true,
    })
    expect(v.pathState).toBe("BLOCKED")
  })

  it("a composed authorization block is a blocker too", () => {
    expect(
      composePathVerdict({ ...ALL_PASS, authorizationComposed: "BLOCKED" }).pathState,
    ).toBe("BLOCKED")
  })

  it("out of scope short-circuits everything", () => {
    expect(composePathVerdict({ ...ALL_PASS, outOfScope: true }).pathState).toBe(
      "OUT_OF_SCOPE",
    )
  })
})

describe("activity_state comes from traffic evidence alone", () => {
  it("OBSERVED when bound traffic exists", () => {
    expect(deriveActivityState({ observedTrafficBound: true })).toBe("OBSERVED")
  })

  it("NOT_OBSERVED only when coverage was collected", () => {
    expect(
      deriveActivityState({
        observedTrafficBound: false,
        observationCoverage: "COLLECTED",
      }),
    ).toBe("NOT_OBSERVED")
  })

  it("UNKNOWN when there is no coverage — absence proves nothing", () => {
    for (const cov of ["NOT_COLLECTED", "UNKNOWN", null, undefined] as const) {
      expect(
        deriveActivityState({ observedTrafficBound: false, observationCoverage: cov }),
      ).toBe("UNKNOWN")
    }
  })
})

describe("findings stay server-owned", () => {
  it("is never derived, even for a fully reachable observed path", () => {
    const v = composePathVerdict({ ...ALL_PASS, observedTrafficBound: true })
    expect(v.pathState).toBe("REACHABLE")
    expect(v.isFinding).toBe(false)
  })

  it("mirrors the server flag when present", () => {
    expect(composePathVerdict({ ...ALL_PASS, serverFinding: true }).isFinding).toBe(
      true,
    )
    expect(composePathVerdict({ ...LIVE_DTO, serverFinding: true }).isFinding).toBe(
      true,
    )
  })
})

describe("REACHABLE_NOW is gone", () => {
  it('no state claims "now" — freshness is not ours to assert', () => {
    const inputs: PathVerdictInput[] = [
      ALL_PASS,
      LIVE_DTO,
      { outOfScope: true },
      { routeVerdict: "BLOCKED" },
    ]
    for (const i of inputs) {
      expect(composePathVerdict(i).pathState).not.toContain("NOW")
      expect(composePathVerdict(i).headline).not.toContain("NOW")
    }
  })
})

describe("shape invariants", () => {
  it("always returns three checkpoints with non-empty detail", () => {
    const v = composePathVerdict({})
    expect(v.checkpoints.map((c) => c.key)).toEqual([
      "execution_network",
      "authorization",
      "data_access",
    ])
    for (const c of v.checkpoints) expect(c.detail).toBeTruthy()
    expect(v.headline).toBeTruthy()
    expect(v.reason).toBeTruthy()
    expect(v.pathState).toBe("UNVERIFIED")
    expect(v.activityState).toBe("UNKNOWN")
  })
})

describe("extractRouteVerdictToken", () => {
  it("reads flat and envelope forms", () => {
    expect(extractRouteVerdictToken("execution_location_unbound")).toBe(
      "EXECUTION_LOCATION_UNBOUND",
    )
    expect(extractRouteVerdictToken({ verdict: "ROUTE_BOUND" })).toBe("ROUTE_BOUND")
    expect(extractRouteVerdictToken({ state: "UNKNOWN" })).toBe("UNKNOWN")
  })

  it("returns null rather than guessing", () => {
    expect(extractRouteVerdictToken(null)).toBeNull()
    expect(extractRouteVerdictToken({})).toBeNull()
    expect(extractRouteVerdictToken("  ")).toBeNull()
  })
})
