/**
 * Compose a path's feasibility from its checkpoints — never assert reach.
 *
 * The problem this fixes (Alon, 2026-07-30, from the live DTO): the map drew a
 * three-node chain that LOOKS like a completed attack path, while the same DTO
 * said coverage PARTIAL, route_verdict EXECUTION_LOCATION_UNBOUND, route
 * coverage UNKNOWN, no path-bound network observation, live_traffic_promoted
 * false, and a data edge that is configured rather than observed.
 *
 * It also contained a direct contradiction:
 *
 *     route_gate    = OPEN_CONFIG                  (coarse)
 *     route_verdict = EXECUTION_LOCATION_UNBOUND   (specific)
 *
 * THE SPECIFIC VERDICT WINS. A coarse "config is open" must never override a
 * detailed verdict saying execution location is unbound — that is the same
 * fail-open shape as reading an empty array as "no network controls": a weaker
 * signal promoting a stronger one.
 *
 * And "OPEN_CONFIG" on its own is not reachability. Configured-open means the
 * configuration does not forbid it; it does not establish that anything can
 * execute there. So config alone yields CONFIGURED, never VERIFIED.
 *
 * Vocabulary: REACHABLE_NOW is earned only when every required checkpoint
 * composes. Until then this is a CANDIDATE path — a configured access chain.
 */

export type CheckpointState =
  /** Positively established from observation or an authoritative verdict. */
  | "VERIFIED"
  /** Configuration permits it; nothing proves it happens or can happen. */
  | "CONFIGURED"
  /** We do not know. Never rendered as a finding. */
  | "UNVERIFIED"
  /** Positively established as prevented. */
  | "BLOCKED"

export type PathFeasibility =
  /** Every checkpoint composed. The only state entitled to assert reach. */
  | "REACHABLE_NOW"
  /** A configured access chain whose execution/observation is unproven. */
  | "CANDIDATE"
  /** Some checkpoint positively prevents it. */
  | "BLOCKED"

export interface PathCheckpoint {
  key: "execution_network" | "credentials_authorization" | "data_access"
  label: string
  state: CheckpointState
  detail: string
}

export interface PathVerdict {
  feasibility: PathFeasibility
  /** Dominant line for the operator, e.g. "UNVERIFIED · EXECUTION LOCATION UNBOUND". */
  headline: string
  reason: string
  observedTrafficBound: boolean
  checkpoints: PathCheckpoint[]
  /** Amber-finding styling. Only a composed REACHABLE_NOW earns it. */
  isFinding: boolean
}

/** route_verdict tokens that mean "we could not bind execution/route". */
const UNBOUND_VERDICTS = new Set([
  "EXECUTION_LOCATION_UNBOUND",
  "UNKNOWN",
  "NOT_READY",
  "UNRESOLVED",
  "NO_WINNING_ROUTE",
])

/** route_verdict tokens that positively establish a winning route. */
const BOUND_VERDICTS = new Set([
  "ROUTE_BOUND",
  "WINNING_ROUTE",
  "REACHABLE",
  "NO_ROUTE_REQUIRED",
])

/** route_verdict tokens that positively establish prevention. */
const BLOCKED_VERDICTS = new Set(["BLOCKED", "NO_ROUTE", "UNREACHABLE"])

export interface PathVerdictInput {
  /** Coarse gate. Deliberately LOWER precedence than routeVerdict. */
  routeGate?: string | null
  /** Specific verdict token — wins over routeGate. */
  routeVerdict?: string | null
  /** Coverage envelope, e.g. PARTIAL / READY. */
  coverageState?: string | null
  /** True only when a network observation is bound to THIS path. */
  observedTrafficBound?: boolean
  /** True when role assumption was actually observed, not just configured. */
  roleAssumptionObserved?: boolean
  /** True when the data-plane access was observed on this path. */
  dataAccessObserved?: boolean
}

function normalize(v: string | null | undefined): string {
  return (v || "").trim().toUpperCase()
}

/** Pull a verdict token out of either the flat field or the envelope object. */
export function extractRouteVerdictToken(
  envelope: Record<string, unknown> | string | null | undefined,
): string | null {
  if (!envelope) return null
  if (typeof envelope === "string") return normalize(envelope) || null
  for (const key of ["verdict", "route_verdict", "state", "status"]) {
    const raw = envelope[key]
    if (typeof raw === "string" && raw.trim()) return normalize(raw)
  }
  return null
}

export function composePathVerdict(input: PathVerdictInput): PathVerdict {
  const gate = normalize(input.routeGate)
  const verdict = normalize(input.routeVerdict)
  const coverage = normalize(input.coverageState)
  const trafficBound = Boolean(input.observedTrafficBound)

  // ── execution / network ────────────────────────────────────────────────
  // Precedence: the specific verdict decides. routeGate is consulted ONLY
  // when there is no verdict, and even then can never reach VERIFIED.
  let network: CheckpointState
  let networkDetail: string
  if (verdict && BLOCKED_VERDICTS.has(verdict)) {
    network = "BLOCKED"
    networkDetail = `route verdict ${verdict}`
  } else if (verdict && UNBOUND_VERDICTS.has(verdict)) {
    network = "UNVERIFIED"
    networkDetail =
      gate && gate !== verdict
        ? `route verdict ${verdict} (overrides coarse gate ${gate})`
        : `route verdict ${verdict}`
  } else if (verdict && BOUND_VERDICTS.has(verdict)) {
    // An authoritative winning route. Still requires a bound observation to
    // become VERIFIED — a route that could carry traffic is not traffic.
    network = trafficBound ? "VERIFIED" : "CONFIGURED"
    networkDetail = trafficBound
      ? `route verdict ${verdict} with path-bound observation`
      : `route verdict ${verdict}, no observation bound to this path`
  } else if (verdict) {
    // Unrecognised token: fail closed rather than guess which set it is in.
    network = "UNVERIFIED"
    networkDetail = `unrecognised route verdict ${verdict}`
  } else if (gate) {
    // No verdict at all. Configured-open is not reachability.
    network = "UNVERIFIED"
    networkDetail = `no route verdict; coarse gate ${gate} does not establish execution location`
  } else {
    network = "UNVERIFIED"
    networkDetail = "no route verdict and no gate"
  }

  // ── credentials / authorization ────────────────────────────────────────
  const credentials: CheckpointState = input.roleAssumptionObserved
    ? "VERIFIED"
    : "CONFIGURED"

  // ── data access ────────────────────────────────────────────────────────
  const dataAccess: CheckpointState = input.dataAccessObserved
    ? "VERIFIED"
    : "CONFIGURED"

  const checkpoints: PathCheckpoint[] = [
    {
      key: "execution_network",
      label: "Execution / network",
      state: network,
      detail: networkDetail,
    },
    {
      key: "credentials_authorization",
      label: "Credentials and authorization",
      state: credentials,
      detail: input.roleAssumptionObserved
        ? "role assumption observed"
        : "configured execution role; assumption not observed",
    },
    {
      key: "data_access",
      label: "Data access",
      state: dataAccess,
      detail: input.dataAccessObserved
        ? "data-plane access observed on this path"
        : "configured authorization; not observed on this path",
    },
  ]

  // ── compose ────────────────────────────────────────────────────────────
  if (checkpoints.some((c) => c.state === "BLOCKED")) {
    return {
      feasibility: "BLOCKED",
      headline: "BLOCKED",
      reason:
        checkpoints.find((c) => c.state === "BLOCKED")?.detail ??
        "a checkpoint prevents this path",
      observedTrafficBound: trafficBound,
      checkpoints,
      isFinding: false,
    }
  }

  const allVerified = checkpoints.every((c) => c.state === "VERIFIED")
  if (allVerified && coverage !== "PARTIAL" && coverage !== "NOT_READY") {
    return {
      feasibility: "REACHABLE_NOW",
      headline: "REACHABLE NOW",
      reason: "every checkpoint composed from observed evidence",
      observedTrafficBound: trafficBound,
      checkpoints,
      isFinding: true,
    }
  }

  // CANDIDATE. Lead with the weakest checkpoint — that is what the operator
  // has to resolve before this becomes a real reachability claim.
  const weakest =
    checkpoints.find((c) => c.state === "UNVERIFIED") ??
    checkpoints.find((c) => c.state === "CONFIGURED")
  const headline =
    network === "UNVERIFIED" && verdict && UNBOUND_VERDICTS.has(verdict)
      ? `UNVERIFIED · ${verdict.replace(/_/g, " ")}`
      : network === "UNVERIFIED"
        ? "UNVERIFIED · EXECUTION LOCATION UNBOUND"
        : "CANDIDATE · CONFIGURED ACCESS CHAIN"

  return {
    feasibility: "CANDIDATE",
    headline,
    reason:
      coverage === "PARTIAL"
        ? `coverage PARTIAL — ${weakest?.detail ?? "checkpoints incomplete"}`
        : (weakest?.detail ?? "checkpoints incomplete"),
    observedTrafficBound: trafficBound,
    checkpoints,
    isFinding: false,
  }
}
