/**
 * TEMPORARY frontend composer. DELETE when the backend returns a composed
 * verdict — do not keep it as a fallback.
 *
 * A fallback that composes judgment locally is exactly how the renderer stops
 * being literal. When the server ships `path_state` / `activity_state` /
 * `reason_codes` plus per-checkpoint evidence, coverage, timestamp and
 * generation identity, this module goes away; it does not become a default.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Why it was rewritten (Alon, 2026-07-30)
 *
 * The first version made observed traffic a PRECONDITION for reachability: the
 * network checkpoint only reached VERIFIED with a path-bound observation, and
 * REACHABLE_NOW required every checkpoint VERIFIED. So a configured, provably
 * usable path could not be called reachable until traffic happened to be seen.
 *
 * That inverts the security question. An attacker does not need us to have
 * watched them. "We observed it happen" and "an attacker can do it" are
 * different claims on ORTHOGONAL axes, and collapsing them into one meant the
 * single most important state — reachable but never exercised, which is the gap
 * this product exists to find — could not be expressed at all.
 *
 *     path_state      REACHABLE | BLOCKED | UNVERIFIED | OUT_OF_SCOPE
 *     activity_state  OBSERVED  | NOT_OBSERVED | UNKNOWN
 *
 * Rules this module must keep:
 *   - Observation NEVER upgrades feasibility. Traffic evidence controls
 *     activity_state only, and is not an input to path_state.
 *   - REACHABLE requires an explicit server-backed PASS on every required
 *     checkpoint. Configured-but-not-composed is UNVERIFIED, not a pass.
 *   - BLOCKED requires an explicit server-backed blocker.
 *   - Findings / amber styling stay SERVER-OWNED. This module never derives
 *     them.
 *   - No "REACHABLE_NOW": "now" implies freshness guarantees the frontend does
 *     not own.
 *
 * Consequence, and it is the correct one: with no composed authorization
 * evaluator today (identity ∩ boundary ∩ SCP ∩ session ∩ resource ∩ KMS ∩
 * conditions), the authorization checkpoint can never be a server-backed pass,
 * so most paths honestly remain UNVERIFIED even where a configured route exists.
 */

export type PathState =
  /** Every required checkpoint returned an explicit server-backed pass. */
  | "REACHABLE"
  /** A server-backed control positively stops this path. */
  | "BLOCKED"
  /** Something required was not evaluated, not covered, or not composed. */
  | "UNVERIFIED"
  /** Explicitly outside the assessed scope (platform / service-linked). */
  | "OUT_OF_SCOPE"

export type ActivityState =
  /** Traffic bound to THIS path was observed. */
  | "OBSERVED"
  /** Observation coverage exists for this path and saw nothing. */
  | "NOT_OBSERVED"
  /** No observation coverage — absence proves nothing. */
  | "UNKNOWN"

/**
 * Per-checkpoint feasibility contribution. There is deliberately no
 * "CONFIGURED" state: configured-without-composition cannot contribute to
 * REACHABLE, so it is UNVERIFIED, and the nuance lives in `detail`.
 */
export type CheckpointState = "PASS" | "BLOCKED" | "UNVERIFIED"

export interface PathCheckpoint {
  key: "execution_network" | "authorization" | "data_access"
  label: string
  state: CheckpointState
  detail: string
}

export interface PathVerdict {
  pathState: PathState
  activityState: ActivityState
  /** Dominant line, e.g. "UNVERIFIED · EXECUTION LOCATION UNBOUND". */
  headline: string
  reason: string
  checkpoints: PathCheckpoint[]
  /**
   * Amber-finding styling. SERVER-OWNED — mirrored from input, never derived
   * here. The frontend does not decide what is a finding.
   */
  isFinding: boolean
}

/** route_verdict tokens that positively establish a winning route. */
const ROUTE_PASS = new Set([
  "ROUTE_BOUND",
  "WINNING_ROUTE",
  "REACHABLE",
  "NO_ROUTE_REQUIRED",
])

/** route_verdict tokens that positively establish prevention. */
const ROUTE_BLOCKED = new Set(["BLOCKED", "NO_ROUTE", "UNREACHABLE"])

export interface PathVerdictInput {
  /** Coarse gate. Deliberately LOWER precedence than routeVerdict, and can
   *  never on its own produce a PASS. */
  routeGate?: string | null
  /** Specific verdict token — wins over routeGate. */
  routeVerdict?: string | null
  /** Coverage envelope. PARTIAL / NOT_READY forces UNVERIFIED. */
  coverageState?: string | null
  /** Server-composed authorization result. Absent today; until the evaluator
   *  exists this stays undefined and authorization is UNVERIFIED. */
  authorizationComposed?: "PASS" | "BLOCKED" | null
  /** Server-composed data-plane authorization result. Same. */
  dataAccessComposed?: "PASS" | "BLOCKED" | null
  /** Explicitly out of assessed scope. */
  outOfScope?: boolean

  // ── activity axis ONLY. Never consulted for pathState. ─────────────────
  /** Traffic bound to this path was observed. */
  observedTrafficBound?: boolean
  /** Whether observation coverage exists at all. Without it, "not observed"
   *  is indistinguishable from "never looked", so activity is UNKNOWN. */
  observationCoverage?: "COLLECTED" | "NOT_COLLECTED" | "UNKNOWN" | null

  /** Server-declared finding. Mirrored, never derived. */
  serverFinding?: boolean
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

/** Activity is derived from traffic evidence ALONE. */
export function deriveActivityState(input: PathVerdictInput): ActivityState {
  if (input.observedTrafficBound) return "OBSERVED"
  // Absence is only meaningful when we know coverage existed.
  if (input.observationCoverage === "COLLECTED") return "NOT_OBSERVED"
  return "UNKNOWN"
}

export function composePathVerdict(input: PathVerdictInput): PathVerdict {
  const gate = normalize(input.routeGate)
  const verdict = normalize(input.routeVerdict)
  const coverage = normalize(input.coverageState)

  // ── execution / network ────────────────────────────────────────────────
  // Precedence: the specific verdict decides. routeGate is consulted only when
  // there is no verdict, and can never produce a PASS — configured-open means
  // the configuration does not forbid it, not that anything executes there.
  let network: CheckpointState
  let networkDetail: string
  if (verdict && ROUTE_BLOCKED.has(verdict)) {
    network = "BLOCKED"
    networkDetail = `route verdict ${verdict}`
  } else if (verdict && ROUTE_PASS.has(verdict)) {
    network = "PASS"
    networkDetail = `route verdict ${verdict}`
  } else if (verdict) {
    network = "UNVERIFIED"
    networkDetail =
      gate && gate !== verdict
        ? `route verdict ${verdict} (overrides coarse gate ${gate})`
        : `route verdict ${verdict}`
  } else if (gate) {
    network = "UNVERIFIED"
    networkDetail = `no route verdict; coarse gate ${gate} does not establish execution location`
  } else {
    network = "UNVERIFIED"
    networkDetail = "no route verdict and no gate"
  }

  // ── authorization ──────────────────────────────────────────────────────
  // Requires the composed stack: identity ∩ boundary ∩ SCP ∩ session ∩
  // resource ∩ KMS ∩ conditions. No evaluator today, so this is UNVERIFIED.
  const authorization: CheckpointState =
    input.authorizationComposed === "PASS"
      ? "PASS"
      : input.authorizationComposed === "BLOCKED"
        ? "BLOCKED"
        : "UNVERIFIED"

  const dataAccess: CheckpointState =
    input.dataAccessComposed === "PASS"
      ? "PASS"
      : input.dataAccessComposed === "BLOCKED"
        ? "BLOCKED"
        : "UNVERIFIED"

  const checkpoints: PathCheckpoint[] = [
    {
      key: "execution_network",
      label: "Execution / network",
      state: network,
      detail: networkDetail,
    },
    {
      key: "authorization",
      label: "Credentials and authorization",
      state: authorization,
      detail:
        authorization === "UNVERIFIED"
          ? "configured grant present; identity ∩ boundary ∩ SCP ∩ session ∩ resource ∩ KMS ∩ conditions not composed"
          : `server-composed authorization ${authorization}`,
    },
    {
      key: "data_access",
      label: "Data access",
      state: dataAccess,
      detail:
        dataAccess === "UNVERIFIED"
          ? "configured authorization; data-plane decision not composed"
          : `server-composed data access ${dataAccess}`,
    },
  ]

  const activityState = deriveActivityState(input)

  // ── path state. Observation is NOT an input here. ──────────────────────
  let pathState: PathState
  let reason: string
  if (input.outOfScope) {
    pathState = "OUT_OF_SCOPE"
    reason = "explicitly outside the assessed scope"
  } else if (checkpoints.some((c) => c.state === "BLOCKED")) {
    pathState = "BLOCKED"
    reason =
      checkpoints.find((c) => c.state === "BLOCKED")?.detail ??
      "a server-backed control stops this path"
  } else if (coverage === "PARTIAL" || coverage === "NOT_READY") {
    pathState = "UNVERIFIED"
    reason = `coverage ${coverage}`
  } else if (checkpoints.every((c) => c.state === "PASS")) {
    pathState = "REACHABLE"
    reason = "every required checkpoint returned a server-backed pass"
  } else {
    pathState = "UNVERIFIED"
    reason =
      checkpoints.find((c) => c.state === "UNVERIFIED")?.detail ??
      "a required checkpoint was not evaluated"
  }

  const headline =
    pathState === "UNVERIFIED" && verdict && !ROUTE_PASS.has(verdict)
      ? `UNVERIFIED · ${verdict.replace(/_/g, " ")}`
      : pathState === "UNVERIFIED"
        ? "UNVERIFIED"
        : pathState

  return {
    pathState,
    activityState,
    headline,
    reason,
    checkpoints,
    // Mirrored from the server. Never derived — see the module docstring.
    isFinding: Boolean(input.serverFinding),
  }
}
