/**
 * A configured permission chain is not a verified attack path.
 *
 * From the live DTO (Alon, 2026-07-30): the map drew a clean three-node chain
 * while the same payload said coverage PARTIAL, route_verdict
 * EXECUTION_LOCATION_UNBOUND, route coverage UNKNOWN, no path-bound network
 * observation, live_traffic_promoted false, and a configured-not-observed data
 * edge. It also contradicted itself: route_gate=OPEN_CONFIG vs
 * route_verdict=EXECUTION_LOCATION_UNBOUND.
 */
import { describe, expect, it } from "vitest"
import {
  composePathVerdict,
  extractRouteVerdictToken,
} from "@/lib/attack-paths/path-feasibility-verdict"

/** The exact shape of the path from the screenshot. */
const LIVE_DTO = {
  routeGate: "OPEN_CONFIG",
  routeVerdict: "EXECUTION_LOCATION_UNBOUND",
  coverageState: "PARTIAL",
  observedTrafficBound: false,
  roleAssumptionObserved: false,
  dataAccessObserved: false,
}

describe("the specific verdict beats the coarse gate", () => {
  it("OPEN_CONFIG does not override EXECUTION_LOCATION_UNBOUND", () => {
    const v = composePathVerdict(LIVE_DTO)
    const net = v.checkpoints.find((c) => c.key === "execution_network")!
    expect(net.state).toBe("UNVERIFIED")
    expect(net.detail).toContain("overrides coarse gate OPEN_CONFIG")
  })

  it("the live path is a CANDIDATE, not reachable", () => {
    const v = composePathVerdict(LIVE_DTO)
    expect(v.feasibility).toBe("CANDIDATE")
    expect(v.headline).toBe("UNVERIFIED · EXECUTION LOCATION UNBOUND")
    expect(v.isFinding).toBe(false)
  })

  it("names PARTIAL coverage in the reason", () => {
    expect(composePathVerdict(LIVE_DTO).reason).toContain("coverage PARTIAL")
  })

  it("OPEN_CONFIG alone is still not reachability", () => {
    // Configured-open means config does not forbid it — not that anything can
    // execute there. Config must never reach VERIFIED.
    const v = composePathVerdict({ routeGate: "OPEN_CONFIG" })
    const net = v.checkpoints.find((c) => c.key === "execution_network")!
    expect(net.state).toBe("UNVERIFIED")
    expect(v.feasibility).toBe("CANDIDATE")
  })

  it("an unrecognised verdict token fails closed", () => {
    const v = composePathVerdict({ routeVerdict: "SOMETHING_NEW" })
    expect(
      v.checkpoints.find((c) => c.key === "execution_network")!.state,
    ).toBe("UNVERIFIED")
  })
})

describe("REACHABLE_NOW must be earned", () => {
  const fullyComposed = {
    routeVerdict: "ROUTE_BOUND",
    coverageState: "READY",
    observedTrafficBound: true,
    roleAssumptionObserved: true,
    dataAccessObserved: true,
  }

  it("composes when every checkpoint is verified", () => {
    const v = composePathVerdict(fullyComposed)
    expect(v.feasibility).toBe("REACHABLE_NOW")
    expect(v.isFinding).toBe(true)
  })

  // Each signal removed individually must DEMOTE.
  const demotions: Array<[string, Partial<typeof fullyComposed>]> = [
    ["no path-bound observation", { observedTrafficBound: false }],
    ["role assumption not observed", { roleAssumptionObserved: false }],
    ["data access not observed", { dataAccessObserved: false }],
    ["coverage PARTIAL", { coverageState: "PARTIAL" }],
    ["coverage NOT_READY", { coverageState: "NOT_READY" }],
  ]
  for (const [label, patch] of demotions) {
    it(`demotes to CANDIDATE when ${label}`, () => {
      const v = composePathVerdict({ ...fullyComposed, ...patch })
      expect(v.feasibility).toBe("CANDIDATE")
      expect(v.isFinding).toBe(false)
    })
  }

  it("a winning route without observation is CONFIGURED, not VERIFIED", () => {
    // A route that could carry traffic is not traffic.
    const v = composePathVerdict({
      routeVerdict: "ROUTE_BOUND",
      observedTrafficBound: false,
    })
    expect(
      v.checkpoints.find((c) => c.key === "execution_network")!.state,
    ).toBe("CONFIGURED")
    expect(v.feasibility).toBe("CANDIDATE")
  })
})

describe("BLOCKED is a positive finding too", () => {
  it("a blocking verdict wins over everything", () => {
    const v = composePathVerdict({
      routeGate: "OPEN_CONFIG",
      routeVerdict: "BLOCKED",
      observedTrafficBound: true,
      roleAssumptionObserved: true,
      dataAccessObserved: true,
    })
    expect(v.feasibility).toBe("BLOCKED")
    expect(v.isFinding).toBe(false)
  })
})

describe("the three checkpoints are always present and never null", () => {
  it("holds for empty input", () => {
    const v = composePathVerdict({})
    expect(v.checkpoints.map((c) => c.key)).toEqual([
      "execution_network",
      "credentials_authorization",
      "data_access",
    ])
    for (const c of v.checkpoints) {
      expect(c.state).toBeTruthy()
      expect(c.detail).toBeTruthy()
    }
    expect(v.headline).toBeTruthy()
    expect(v.isFinding).toBe(false)
  })

  it("isFinding is true only for REACHABLE_NOW, across many inputs", () => {
    const verdicts = [
      "EXECUTION_LOCATION_UNBOUND", "UNKNOWN", "ROUTE_BOUND", "BLOCKED",
      "NO_ROUTE_REQUIRED", "WEIRD", null,
    ]
    for (const rv of verdicts) {
      for (const bound of [true, false]) {
        for (const cov of ["READY", "PARTIAL", null]) {
          const v = composePathVerdict({
            routeVerdict: rv,
            observedTrafficBound: bound,
            roleAssumptionObserved: bound,
            dataAccessObserved: bound,
            coverageState: cov,
          })
          expect(v.isFinding).toBe(v.feasibility === "REACHABLE_NOW")
        }
      }
    }
  })
})

describe("extractRouteVerdictToken", () => {
  it("reads the flat string form", () => {
    expect(extractRouteVerdictToken("execution_location_unbound")).toBe(
      "EXECUTION_LOCATION_UNBOUND",
    )
  })

  it("reads the envelope object the materializer sends", () => {
    expect(
      extractRouteVerdictToken({ verdict: "ROUTE_BOUND", coverage: "READY" }),
    ).toBe("ROUTE_BOUND")
  })

  it("tries the alternate envelope keys", () => {
    expect(extractRouteVerdictToken({ state: "UNKNOWN" })).toBe("UNKNOWN")
    expect(extractRouteVerdictToken({ status: "BLOCKED" })).toBe("BLOCKED")
  })

  it("returns null rather than guessing", () => {
    expect(extractRouteVerdictToken(null)).toBeNull()
    expect(extractRouteVerdictToken({})).toBeNull()
    expect(extractRouteVerdictToken({ coverage: "READY" })).toBeNull()
    expect(extractRouteVerdictToken("   ")).toBeNull()
  })
})
