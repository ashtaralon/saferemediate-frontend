/**
 * Read the server-composed path verdict. NO judgment here.
 *
 * The backend owns feasibility as of #642 (`SERVE server-owned path feasibility
 * verdict`). This module only PARSES what SERVE sends and validates its
 * vocabulary; it never derives, defaults, or composes.
 *
 * It exists because the frontend composer it was extracted from was DELETED —
 * see fix/delete-fe-verdict-composer. Keeping that composer as a fallback was
 * the transitional hedge, and past #642 it is how Zoom0 quietly re-owns
 * judgment: a fallback looks like resilience, but it means two authorities can
 * disagree with no way for an operator to tell which one they are reading.
 *
 * Unrecognised vocabulary returns null rather than guessing. Null means the
 * caller renders an explicit "unavailable" — never a locally assembled second
 * opinion.
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

function normalize(v: string | null | undefined): string {
  return (v || "").trim().toUpperCase()
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
