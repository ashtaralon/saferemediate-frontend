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
  checkpointFromAttackPathGate,
  composePathVerdict,
  deriveActivityDetail,
  deriveActivityState,
  extractRouteVerdictToken,
  isStructuralOpenRoute,
  routeVerdictHasWinningGateway,
  type PathVerdictInput,
} from "@/lib/attack-paths/path-feasibility-verdict"

/** Fully server-composed: every checkpoint an explicit pass. */
const ALL_PASS: PathVerdictInput = {
  routeVerdict: "ROUTE_BOUND",
  authorizationComposed: "PASS",
  dataAccessComposed: "PASS",
  coverageState: "READY",
}

/** Unbound DTO — Lambda / orphan; no winning gateway. */
const UNBOUND_DTO: PathVerdictInput = {
  routeGate: "OPEN_CONFIG",
  routeVerdict: "EXECUTION_LOCATION_UNBOUND",
  routeVerdictEnvelope: {
    verdict: "EXECUTION_LOCATION_UNBOUND",
    winning_gateway: null,
    winning_route_key: null,
    target_id: null,
    coverage: "UNKNOWN",
  },
  coverageState: "PARTIAL",
  observedTrafficBound: false,
  identityGate: "OPEN_OBSERVED",
  estateIdentityObserved: true,
}

/** VPC-bound configured open route with a winning gateway. */
const STRUCTURAL_OPEN: PathVerdictInput = {
  routeGate: "OPEN_CONFIG",
  routeVerdict: "OPEN_CONFIG",
  routeVerdictEnvelope: {
    verdict: "OPEN_CONFIG",
    winning_gateway: "igw-abc",
    winning_route_key: "rtb-1|0.0.0.0/0|igw-abc",
    target_id: "igw-abc",
    coverage: "COLLECTED",
    evidence: "configured",
  },
  coverageState: "READY",
  observedTrafficBound: false,
  identityGate: "OPEN_OBSERVED",
  estateIdentityObserved: true,
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
          ...UNBOUND_DTO,
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

  it("graph gates make credentials/data OPEN — path still not REACHABLE", () => {
    // AttackPath gates are real graph data. OPEN ≠ PASS; overall stays
    // UNVERIFIED until every checkpoint is an explicit PASS.
    const v = composePathVerdict({
      routeVerdict: "ROUTE_BOUND",
      coverageState: "READY",
      identityGate: "OPEN_OBSERVED",
      dataPlaneGate: "OPEN_CONFIG",
      authzDecision: "ALLOWED",
    })
    expect(v.pathState).toBe("UNVERIFIED")
    expect(v.checkpoints.find((c) => c.key === "authorization")!.state).toBe(
      "OPEN",
    )
    expect(v.checkpoints.find((c) => c.key === "data_access")!.state).toBe(
      "OPEN",
    )
  })

  it("structural-open network does not make the path REACHABLE", () => {
    const v = composePathVerdict(STRUCTURAL_OPEN)
    expect(v.pathState).toBe("UNVERIFIED")
    expect(v.checkpoints.find((c) => c.key === "execution_network")!.state).toBe(
      "OPEN",
    )
  })
})

describe("checkpointFromAttackPathGate — graph only, no invented UNVERIFIED", () => {
  it("OPEN_CONFIG / OPEN_OBSERVED / ALLOWED read OPEN from AttackPath", () => {
    expect(
      checkpointFromAttackPathGate({
        gate: "OPEN_CONFIG",
        plane: "authorization",
      }).state,
    ).toBe("OPEN")
    expect(
      checkpointFromAttackPathGate({
        gate: "OPEN_OBSERVED",
        plane: "authorization",
      }).detail,
    ).toContain("AttackPath")
    expect(
      checkpointFromAttackPathGate({
        authzDecision: "ALLOWED",
        plane: "data_access",
      }).state,
    ).toBe("OPEN")
  })

  it("EXPLICIT_DENY blocks from A1", () => {
    expect(
      checkpointFromAttackPathGate({
        gate: "OPEN_CONFIG",
        authzDecision: "EXPLICIT_DENY",
        plane: "authorization",
      }).state,
    ).toBe("BLOCKED")
  })
})

describe("the specific route verdict still beats the coarse gate", () => {
  it("OPEN_CONFIG does not override EXECUTION_LOCATION_UNBOUND", () => {
    const net = composePathVerdict(UNBOUND_DTO).checkpoints.find(
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
    expect(net.state).not.toBe("PASS")
  })

  it("the unbound path headline names the unbound verdict", () => {
    expect(composePathVerdict(UNBOUND_DTO).headline).toBe(
      "UNVERIFIED · EXECUTION LOCATION UNBOUND",
    )
  })
})

describe("structural-open network (OPEN_CONFIG + winning gateway)", () => {
  it("reads OPEN with basis structural — never PASS", () => {
    const net = composePathVerdict(STRUCTURAL_OPEN).checkpoints.find(
      (c) => c.key === "execution_network",
    )!
    expect(net.state).toBe("OPEN")
    expect(net.state).not.toBe("PASS")
    expect(net.detail).toContain("route open · configured")
    expect(net.detail).toContain("structural")
  })

  it("does not touch activity_state", () => {
    const v = composePathVerdict(STRUCTURAL_OPEN)
    expect(v.activityState).toBe("UNKNOWN")
    expect(v.activityDetail).toContain("estate")
  })

  it("OPEN_CONFIG without a winning gateway stays UNVERIFIED", () => {
    const input: PathVerdictInput = {
      routeVerdict: "OPEN_CONFIG",
      routeVerdictEnvelope: {
        verdict: "OPEN_CONFIG",
        winning_gateway: null,
        winning_route_key: null,
        target_id: null,
      },
    }
    const v = composePathVerdict(input)
    expect(v.checkpoints.find((c) => c.key === "execution_network")!.state).toBe(
      "UNVERIFIED",
    )
    expect(isStructuralOpenRoute(input)).toBe(false)
  })

  it("unbound envelope never counts as structural-open even with OPEN_CONFIG gate", () => {
    expect(isStructuralOpenRoute(UNBOUND_DTO)).toBe(false)
    expect(
      routeVerdictHasWinningGateway(UNBOUND_DTO.routeVerdictEnvelope),
    ).toBe(false)
  })

  it("detects winning_gateway / winning_route_key / target_id", () => {
    expect(routeVerdictHasWinningGateway({ winning_gateway: "igw-1" })).toBe(true)
    expect(
      routeVerdictHasWinningGateway({ winning_route_key: "rtb|pl|vpce" }),
    ).toBe(true)
    expect(routeVerdictHasWinningGateway({ target_id: "vpce-1" })).toBe(true)
    expect(routeVerdictHasWinningGateway({})).toBe(false)
    expect(routeVerdictHasWinningGateway("OPEN_CONFIG")).toBe(false)
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

describe("activity_state comes from path-bound traffic alone", () => {
  it("OBSERVED when bound traffic exists", () => {
    expect(deriveActivityState({ observedTrafficBound: true })).toBe("OBSERVED")
  })

  it("NOT_OBSERVED only when path-bound coverage was collected", () => {
    expect(
      deriveActivityState({
        observedTrafficBound: false,
        observationCoverage: "COLLECTED",
      }),
    ).toBe("NOT_OBSERVED")
  })

  it("UNKNOWN when there is no path-bound coverage — absence proves nothing", () => {
    for (const cov of ["NOT_COLLECTED", "UNKNOWN", null, undefined] as const) {
      expect(
        deriveActivityState({ observedTrafficBound: false, observationCoverage: cov }),
      ).toBe("UNKNOWN")
    }
  })

  it("estate identity OPEN_OBSERVED never promotes activity to OBSERVED", () => {
    const v = composePathVerdict({
      ...UNBOUND_DTO,
      identityGate: "OPEN_OBSERVED",
      estateIdentityObserved: true,
      observedTrafficBound: false,
    })
    expect(v.activityState).toBe("UNKNOWN")
    expect(v.activityState).not.toBe("OBSERVED")
  })
})

describe("activity detail honesty (estate-grain vs no coverage)", () => {
  it("names estate-grain identity when OPEN_OBSERVED and not path-bound", () => {
    expect(
      deriveActivityDetail({
        identityGate: "OPEN_OBSERVED",
        estateIdentityObserved: true,
        observedTrafficBound: false,
      }),
    ).toBe("identity observed in estate; not bound to this execution location")
  })

  it("does not claim 'no observation coverage' when estate identity was seen", () => {
    const detail = deriveActivityDetail({
      identityGate: "OPEN_OBSERVED",
      estateIdentityObserved: true,
    })
    expect(detail.toLowerCase()).not.toContain("no observation coverage")
    expect(composePathVerdict(UNBOUND_DTO).activityDetail).toBe(detail)
  })

  it("when truly no estate signal, says no path-bound observation", () => {
    expect(deriveActivityDetail({ observedTrafficBound: false })).toBe(
      "no path-bound observation for this execution location",
    )
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
    expect(composePathVerdict({ ...UNBOUND_DTO, serverFinding: true }).isFinding).toBe(
      true,
    )
  })
})

describe("REACHABLE_NOW is gone", () => {
  it('no state claims "now" — freshness is not ours to assert', () => {
    const inputs: PathVerdictInput[] = [
      ALL_PASS,
      UNBOUND_DTO,
      STRUCTURAL_OPEN,
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
    expect(v.activityDetail).toBeTruthy()
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
