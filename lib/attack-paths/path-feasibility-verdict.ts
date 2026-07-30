/**
 * Enterprise path feasibility.
 *
 * Authority: SERVE `feasibility` on ConvergencePath. Zoom0 renders via
 * `pathVerdictFromServerFeasibility` — no client re-judgment when present.
 *
 * `composePathVerdict` is DEPLOY-SKEW ONLY (older BE without feasibility).
 * DELETE the call site in zoom0-fan-in-panel when every SERVE path ships
 * feasibility; do not expand local composition as a product default.
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
 *   - Estate-grain identity observation (identity_gate OPEN_OBSERVED) must
 *     NEVER promote activity_state to OBSERVED. Shared roles mean the role
 *     was used somewhere in the estate, not from this execution location.
 *   - OPEN_CONFIG + winning gateway is structural-open on the network
 *     checkpoint (basis structural) — not PASS (which reads as proven-
 *     traversed) and not UNKNOWN (which under-claims a resolved open route).
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
  /** No path-bound observation — absence on this path proves nothing. */
  | "UNKNOWN"

/**
 * Per-checkpoint feasibility contribution.
 *
 * OPEN is structural capability (configured open route with a winning
 * gateway). It is deliberately not PASS: PASS reads as proven-traversed.
 * OPEN also cannot contribute to REACHABLE — authz composition is still
 * required — so path_state stays UNVERIFIED while the network door is named.
 */
export type CheckpointState = "PASS" | "OPEN" | "BLOCKED" | "UNVERIFIED"

export interface PathCheckpoint {
  key: "execution_network" | "authorization" | "data_access"
  label: string
  state: CheckpointState
  detail: string
}

export interface PathVerdict {
  pathState: PathState
  activityState: ActivityState
  /** Why activity_state is what it is. Estate-grain signals go here, labeled. */
  activityDetail: string
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

/** Specific verdicts that forbid treating the route as structurally open. */
const ROUTE_NOT_STRUCTURAL = new Set([
  "EXECUTION_LOCATION_UNBOUND",
  ...ROUTE_BLOCKED,
])

export interface PathVerdictInput {
  /** Coarse gate. Deliberately LOWER precedence than routeVerdict, and can
   *  never on its own produce a PASS. */
  routeGate?: string | null
  /** Specific verdict token — wins over routeGate. */
  routeVerdict?: string | null
  /**
   * Full route_verdict envelope when available. Used only to detect a
   * resolved winning gateway for structural-open — never to invent hops.
   */
  routeVerdictEnvelope?: Record<string, unknown> | string | null
  /** Coverage envelope. PARTIAL / NOT_READY forces UNVERIFIED. */
  coverageState?: string | null
  /**
   * Optional full-stack composed result when the server ships one.
   * Prefer AttackPath gates / A1 below — never invent UNVERIFIED by
   * omitting graph fields the SERVE already returned.
   */
  authorizationComposed?: "PASS" | "BLOCKED" | "OPEN" | null
  dataAccessComposed?: "PASS" | "BLOCKED" | "OPEN" | null
  /** Explicitly out of assessed scope. */
  outOfScope?: boolean

  // ── activity axis ONLY. Never consulted for pathState. ─────────────────
  /** Traffic bound to this path was observed. */
  observedTrafficBound?: boolean
  /** Whether path-bound observation coverage exists. Without it, "not
   *  observed" is indistinguishable from "never looked", so activity is
   *  UNKNOWN. Estate-grain signals are NOT coverage. */
  observationCoverage?: "COLLECTED" | "NOT_COLLECTED" | "UNKNOWN" | null
  /**
   * Identity plane saw estate-grain observation (identity_gate OPEN_OBSERVED).
   * Grain-blind: the role was used somewhere. Must not promote activity to
   * OBSERVED — only changes the UNKNOWN reason so we stop claiming "no
   * coverage".
   */
  estateIdentityObserved?: boolean
  /** Raw identity_gate from (:AttackPath) — graph SSOT for credentials. */
  identityGate?: string | null
  /** Raw data_plane_gate from (:AttackPath) — graph SSOT for data access. */
  dataPlaneGate?: string | null
  /** A1 authz_decision from (:AttackPath). */
  authzDecision?: string | null

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

/**
 * True when the route_verdict envelope names a resolved winning gateway /
 * route. EXECUTION_LOCATION_UNBOUND envelopes ship nulls here by contract.
 */
export function routeVerdictHasWinningGateway(
  envelope: Record<string, unknown> | string | null | undefined,
): boolean {
  if (!envelope || typeof envelope === "string") return false
  for (const key of ["winning_gateway", "winning_route_key", "target_id"]) {
    const raw = envelope[key]
    if (typeof raw === "string" && raw.trim()) return true
  }
  return false
}

function estateIdentityIsObserved(input: PathVerdictInput): boolean {
  if (input.estateIdentityObserved) return true
  return normalize(input.identityGate) === "OPEN_OBSERVED"
}

/**
 * Configured open route with a resolved winning gateway — attack-path risk
 * is real; least-privilege removal still needs path-bound observation.
 */
export function isStructuralOpenRoute(input: PathVerdictInput): boolean {
  const verdict = normalize(input.routeVerdict)
  const gate = normalize(input.routeGate)
  if (verdict && ROUTE_NOT_STRUCTURAL.has(verdict)) return false
  if (!routeVerdictHasWinningGateway(input.routeVerdictEnvelope)) return false
  if (verdict === "OPEN_CONFIG") return true
  // Coarse gate only when no specific verdict contradicts.
  if (!verdict && gate === "OPEN_CONFIG") return true
  return false
}

const GATE_BLOCKED = new Set(["CLOSED", "BLOCKED"])
const AUTHZ_BLOCKED = new Set([
  "EXPLICIT_DENY",
  "IMPLICIT_DENY",
  "DENIED",
  "DENY",
])

/**
 * Map an AttackPath gate (+ optional A1 decision) to a checkpoint.
 * Graph fields only — never default to UNVERIFIED when the gate is present.
 */
export function checkpointFromAttackPathGate(params: {
  gate?: string | null
  authzDecision?: string | null
  composed?: "PASS" | "BLOCKED" | "OPEN" | null
  plane: "authorization" | "data_access"
}): { state: CheckpointState; detail: string } {
  const composed = params.composed
  if (composed === "PASS" || composed === "BLOCKED" || composed === "OPEN") {
    return {
      state: composed,
      detail: `server-composed ${params.plane} ${composed}`,
    }
  }
  const decision = normalize(params.authzDecision)
  if (decision && AUTHZ_BLOCKED.has(decision)) {
    return {
      state: "BLOCKED",
      detail: `authz_decision ${decision} (AttackPath A1)`,
    }
  }
  if (decision === "ALLOWED") {
    return {
      state: "OPEN",
      detail: "authz_decision ALLOWED (AttackPath A1 certified)",
    }
  }
  const gate = normalize(params.gate)
  const gateLabel =
    params.plane === "authorization" ? "identity_gate" : "data_plane_gate"
  if (gate && GATE_BLOCKED.has(gate)) {
    return { state: "BLOCKED", detail: `${gateLabel} ${gate} (AttackPath)` }
  }
  if (gate === "OPEN_OBSERVED") {
    return {
      state: "OPEN",
      detail: `${gateLabel} OPEN_OBSERVED (AttackPath; estate-grain on path node)`,
    }
  }
  if (gate === "OPEN_CONFIG") {
    return {
      state: "OPEN",
      detail: `${gateLabel} OPEN_CONFIG (AttackPath; configured)`,
    }
  }
  if (gate === "UNKNOWN") {
    return {
      state: "UNVERIFIED",
      detail: `${gateLabel} UNKNOWN (AttackPath)`,
    }
  }
  if (!gate && !decision) {
    return {
      state: "UNVERIFIED",
      detail: `${gateLabel} and authz_decision absent on AttackPath`,
    }
  }
  if (gate) {
    return {
      state: "UNVERIFIED",
      detail: `${gateLabel} ${gate} (AttackPath)`,
    }
  }
  return {
    state: "UNVERIFIED",
    detail: `authz_decision ${decision} (AttackPath A1)`,
  }
}

/** Activity is derived from path-bound traffic evidence ALONE. */
export function deriveActivityState(input: PathVerdictInput): ActivityState {
  if (input.observedTrafficBound) return "OBSERVED"
  // Absence is only meaningful when we know path-bound coverage existed.
  if (input.observationCoverage === "COLLECTED") return "NOT_OBSERVED"
  return "UNKNOWN"
}

/**
 * Reason under the Activity label. Estate-grain OPEN_OBSERVED must not claim
 * "no observation coverage" — coverage exists; it is unbound to this path.
 */
export function deriveActivityDetail(input: PathVerdictInput): string {
  if (input.observedTrafficBound) return "traffic bound to this path"
  if (input.observationCoverage === "COLLECTED") {
    return "covered, nothing seen on this path"
  }
  if (estateIdentityIsObserved(input)) {
    return "identity observed in estate; not bound to this execution location"
  }
  return "no path-bound observation for this execution location"
}

export function composePathVerdict(input: PathVerdictInput): PathVerdict {
  const gate = normalize(input.routeGate)
  const verdict = normalize(input.routeVerdict)
  const coverage = normalize(input.coverageState)
  const structuralOpen = isStructuralOpenRoute(input)

  // ── execution / network ────────────────────────────────────────────────
  // Precedence: the specific verdict decides. routeGate is consulted only when
  // there is no verdict, and can never produce a PASS — configured-open means
  // the configuration does not forbid it, not that anything executes there.
  // Structural-open (OPEN_CONFIG + winning gateway) is OPEN, not PASS.
  let network: CheckpointState
  let networkDetail: string
  if (verdict && ROUTE_BLOCKED.has(verdict)) {
    network = "BLOCKED"
    networkDetail = `route verdict ${verdict}`
  } else if (verdict && ROUTE_PASS.has(verdict)) {
    network = "PASS"
    networkDetail = `route verdict ${verdict}`
  } else if (structuralOpen) {
    network = "OPEN"
    networkDetail = "route open · configured (basis structural)"
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

  // ── authorization / data access — AttackPath graph fields only ─────────
  // Never hardcode UNVERIFIED when identity_gate / data_plane_gate / A1
  // authz_decision are on the path. OPEN = structural/certified from graph;
  // full REACHABLE still requires every checkpoint PASS (SCP∩KMS∩… later).
  const authzCp = checkpointFromAttackPathGate({
    gate: input.identityGate,
    authzDecision: input.authzDecision,
    composed: input.authorizationComposed,
    plane: "authorization",
  })
  const dataCp = checkpointFromAttackPathGate({
    gate: input.dataPlaneGate,
    authzDecision: input.authzDecision,
    composed: input.dataAccessComposed,
    plane: "data_access",
  })
  const authorization = authzCp.state
  const dataAccess = dataCp.state

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
      detail: authzCp.detail,
    },
    {
      key: "data_access",
      label: "Data access",
      state: dataAccess,
      detail: dataCp.detail,
    },
  ]

  const activityState = deriveActivityState(input)
  const activityDetail = deriveActivityDetail(input)

  // ── path state. Observation is NOT an input here. ──────────────────────
  // OPEN (structural) does not count as PASS — attacker-capable configured
  // routes stay UNVERIFIED until authz is composed.
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
      checkpoints.find((c) => c.state === "OPEN")?.detail ??
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
    activityDetail,
    headline,
    reason,
    checkpoints,
    // Mirrored from the server. Never derived — see the module docstring.
    isFinding: Boolean(input.serverFinding),
  }
}

const CHECKPOINT_KEYS = [
  "execution_network",
  "authorization",
  "data_access",
] as const

const CHECKPOINT_LABELS: Record<(typeof CHECKPOINT_KEYS)[number], string> = {
  execution_network: "Execution / network",
  authorization: "Credentials and authorization",
  data_access: "Data access",
}

/**
 * Literal render of SERVE `feasibility`. Enterprise path: when the server
 * ships this object, the FE must not re-compose judgment.
 */
export function pathVerdictFromServerFeasibility(
  feasibility: Record<string, unknown> | null | undefined,
): PathVerdict | null {
  if (!feasibility || typeof feasibility !== "object") return null
  const pathState = normalize(String(feasibility.path_state || ""))
  const activityState = normalize(String(feasibility.activity_state || ""))
  if (
    !["REACHABLE", "BLOCKED", "UNVERIFIED", "OUT_OF_SCOPE"].includes(pathState)
  ) {
    return null
  }
  if (!["OBSERVED", "NOT_OBSERVED", "UNKNOWN"].includes(activityState)) {
    return null
  }
  const rawCheckpoints = Array.isArray(feasibility.checkpoints)
    ? feasibility.checkpoints
    : []
  const byKey = new Map<string, Record<string, unknown>>()
  for (const c of rawCheckpoints) {
    if (c && typeof c === "object" && typeof (c as { key?: string }).key === "string") {
      byKey.set((c as { key: string }).key, c as Record<string, unknown>)
    }
  }
  const checkpoints: PathCheckpoint[] = CHECKPOINT_KEYS.map((key) => {
    const c = byKey.get(key)
    const stateRaw = normalize(String(c?.state || "UNVERIFIED"))
    const state: CheckpointState = (
      ["PASS", "OPEN", "BLOCKED", "UNVERIFIED"].includes(stateRaw)
        ? stateRaw
        : "UNVERIFIED"
    ) as CheckpointState
    return {
      key,
      label:
        typeof c?.label === "string" && c.label.trim()
          ? c.label
          : CHECKPOINT_LABELS[key],
      state,
      detail:
        typeof c?.detail === "string" && c.detail.trim()
          ? c.detail
          : `server feasibility ${state}`,
    }
  })
  return {
    pathState: pathState as PathState,
    activityState: activityState as ActivityState,
    activityDetail:
      typeof feasibility.activity_detail === "string"
        ? feasibility.activity_detail
        : "",
    headline:
      typeof feasibility.headline === "string" && feasibility.headline.trim()
        ? feasibility.headline
        : pathState,
    reason:
      typeof feasibility.reason === "string" && feasibility.reason.trim()
        ? feasibility.reason
        : pathState,
    checkpoints,
    isFinding: Boolean(feasibility.is_finding),
  }
}
