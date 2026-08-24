/**
 * What each screen's refresh control can actually refresh, and whether it did.
 *
 * Two rules this module exists to enforce, both learned from real bugs:
 *
 * 1. A screen may not claim freshness the backend did not grant. Identities
 *    used to call setLastSync(new Date()) — the BROWSER's clock — whenever a
 *    round completed, painting a green "Synced" for IAM evidence an
 *    Inspector-only round never collected.
 *
 * 2. `sources` is NOT freshness. The start response lists the lanes it QUEUED;
 *    only a completed round's `refreshed_sources`, together with a backend
 *    activation receipt, means data actually changed. Reading `sources` as
 *    refreshed reintroduces bug 1 through the back door — it just moves the
 *    lie from the clock to the payload.
 *
 * A screen also rarely depends on ONE lane. Identities/LP need IAM
 * configuration AND observed use; Behavioral needs API activity AND network
 * flow; Dependency Map needs inventory AND network. So a surface declares
 * `requiredLanes`, and is only as fresh as its LEAST fresh lane.
 */

/** Lane ids exactly as the backend emits them. Do not invent values. */
export type SyncLane =
  | "vulnerability_findings"
  | "inventory_reconcile"
  | "api_activity"
  | "network_flow"

/** Whether this deployment can refresh a lane at all — from /capabilities. */
export type LaneCapability = "CONNECTED" | "NOT_CONNECTED" | "UNKNOWN"

/** What one completed round did to a lane. */
export type LaneState =
  | "REFRESHED"      // completed round listed it in refreshed_sources
  | "QUEUED"         // start listed it in sources; NOT yet freshness
  | "NOT_CONNECTED"  // no collection path deployed for this lane
  | "NOT_REQUESTED"  // lane exists but this round did not ask for it
  | "UNKNOWN"        // nothing has told us

export interface SyncSurface {
  /** Every lane whose evidence this screen displays. Freshness is the MIN. */
  requiredLanes: readonly SyncLane[]
  /** Button label. Names the evidence, never the whole cloud. */
  action: string
  /** What this screen shows, for the "not refreshed" explanation. */
  evidence: string
}

export const SYNC_SURFACES = {
  cve: {
    requiredLanes: ["vulnerability_findings"],
    action: "Refresh Inspector findings",
    evidence: "Amazon Inspector vulnerability findings",
  },
  inventory: {
    requiredLanes: ["inventory_reconcile"],
    action: "Refresh inventory",
    evidence: "AWS resource inventory and configuration",
  },
  // IAM evidence is configuration AND observed use — policy/boundary/trust
  // come from inventory collection, actual calls from CloudTrail. Refreshing
  // one and not the other leaves the screen half-stale, so both are required.
  iam: {
    requiredLanes: ["inventory_reconcile", "api_activity"],
    action: "Refresh IAM evidence",
    evidence: "IAM configuration and observed-use evidence",
  },
  // Least privilege compares granted against used: same two lanes, and a
  // verdict computed from a stale half is worse than no verdict.
  leastPrivilege: {
    requiredLanes: ["inventory_reconcile", "api_activity"],
    action: "Refresh least-privilege evidence",
    evidence: "IAM configuration and observed-use evidence",
  },
  // Behavioral intelligence joins API activity to network flow.
  behavioral: {
    requiredLanes: ["api_activity", "network_flow"],
    action: "Refresh behavioral evidence",
    evidence: "API activity and network flow evidence",
  },
  // Dependency map needs the topology (inventory) and the observed edges.
  dependencyMap: {
    requiredLanes: ["inventory_reconcile", "network_flow"],
    action: "Refresh dependency evidence",
    evidence: "resource inventory and network flow evidence",
  },
  network: {
    requiredLanes: ["network_flow"],
    action: "Refresh network evidence",
    evidence: "VPC flow log evidence",
  },
} as const satisfies Record<string, SyncSurface>

export type SyncSurfaceKey = keyof typeof SYNC_SURFACES

interface LaneEntry {
  lane?: string
  source?: string
  label?: string
  state?: string
  missing_env?: string[]
}

function entries(value: unknown): LaneEntry[] {
  return Array.isArray(value) ? (value as LaneEntry[]) : []
}

/**
 * Capability for one lane, from GET /api/v2/sync/capabilities.
 *
 * UNKNOWN until capabilities load, and UNKNOWN keeps a control disabled: a
 * control must never be ENABLED on an assumption. The reverse asymmetry is
 * deliberate — being wrongly disabled costs a retry, being wrongly enabled
 * spends a real AWS collection round and invites a false freshness claim.
 *
 * Anything the backend does not call CONNECTED is NOT_CONNECTED. The backend
 * requires both halves for that word: a configured dispatch path AND a receipt
 * store that can prove the round finished.
 */
export function laneCapability(
  lane: SyncLane,
  capabilities: Record<string, unknown> | null | undefined,
): LaneCapability {
  const hit = entries(capabilities?.lanes).find((l) => l.lane === lane)
  if (!hit) return "UNKNOWN"
  return hit.state === "CONNECTED" ? "CONNECTED" : "NOT_CONNECTED"
}

/**
 * What a round did to one lane.
 *
 * `refreshed_sources` is the ONLY evidence of refresh. `sources` means queued
 * and maps to QUEUED, never REFRESHED — a queued lane has changed nothing yet.
 */
export function laneState(
  lane: SyncLane,
  payload: Record<string, unknown> | null | undefined,
): LaneState {
  if (!payload) return "UNKNOWN"

  const refreshed = payload.refreshed_sources
  if (Array.isArray(refreshed) && refreshed.includes(lane)) return "REFRESHED"

  const deferred = entries(payload.deferred_sources).find((d) => d.source === lane)
  if (deferred) {
    return deferred.state === "NOT_CONNECTED" ? "NOT_CONNECTED" : "NOT_REQUESTED"
  }

  const queued = payload.sources
  if (Array.isArray(queued) && queued.includes(lane)) return "QUEUED"

  return "UNKNOWN"
}

/**
 * Freshness for a lane — ONLY a completed backend receipt.
 *
 * Requires BOTH that the lane appears in `refreshed_sources` and that the
 * backend stamped when activation happened. A queued lane, a successful round
 * that skipped this lane, or a refresh with no receipt all return null. The
 * browser clock is never a fallback: a local `new Date()` is a claim about AWS
 * the client is in no position to make.
 */
export function laneRefreshedAt(
  lane: SyncLane,
  payload: Record<string, unknown> | null | undefined,
): string | null {
  if (laneState(lane, payload) !== "REFRESHED") return null
  const stamp = payload?.completed_at ?? payload?.activated_at
  return typeof stamp === "string" && stamp.trim() ? stamp : null
}

/** A surface is only as capable as its least-capable required lane. */
export function surfaceCapability(
  surface: SyncSurface,
  capabilities: Record<string, unknown> | null | undefined,
): LaneCapability {
  const states = surface.requiredLanes.map((l) => laneCapability(l, capabilities))
  if (states.includes("NOT_CONNECTED")) return "NOT_CONNECTED"
  if (states.includes("UNKNOWN")) return "UNKNOWN"
  return "CONNECTED"
}

/** Lanes this surface needs that the deployment cannot refresh. */
export function unsupportedLanes(
  surface: SyncSurface,
  capabilities: Record<string, unknown> | null | undefined,
): SyncLane[] {
  return surface.requiredLanes.filter((l) => laneCapability(l, capabilities) === "NOT_CONNECTED")
}

/**
 * A surface is fresh only when EVERY required lane refreshed, and its
 * timestamp is the oldest of them — the screen is as stale as its worst part.
 */
export function surfaceRefreshedAt(
  surface: SyncSurface,
  payload: Record<string, unknown> | null | undefined,
): string | null {
  const stamps = surface.requiredLanes.map((l) => laneRefreshedAt(l, payload))
  if (stamps.some((s) => s === null)) return null
  return stamps.slice().sort()[0] as string
}

/** Why this surface was not refreshed, or null when it was. */
export function notRefreshedReason(
  surface: SyncSurface,
  capabilities: Record<string, unknown> | null | undefined,
  payload?: Record<string, unknown> | null,
): string | null {
  const missing = unsupportedLanes(surface, capabilities)
  if (missing.length > 0) {
    return `${surface.evidence} is not connected to on-demand refresh yet — this action cannot refresh it.`
  }
  // UNKNOWN now DISABLES the control, so it must also explain itself. Silence
  // plus a greyed-out button reads as a broken screen; this says which of the
  // two it is and that a retry is the remedy.
  if (surfaceCapability(surface, capabilities) === "UNKNOWN") {
    return `Cannot tell whether ${surface.evidence} can be refreshed right now — this action stays disabled rather than starting a round it cannot account for.`
  }
  if (!payload) return null
  if (surfaceRefreshedAt(surface, payload) === null) {
    return `${surface.evidence} was not refreshed by this run.`
  }
  return null
}

/**
 * Surfaces whose lanes cannot be requested in ONE backend round.
 *
 * The backend refuses to mix `vulnerability_findings` with generic collection
 * work (`mixed_sync_round_not_supported`, HTTP 400): the Inspector lane has a
 * durable Neptune activation receipt while generic work has a separate run
 * store, so one round cannot report both. A surface that declared both would
 * therefore render an enabled button that 400s on every click. Empty is the
 * only correct answer; a test asserts it.
 */
export function surfacesWithUndispatchableLaneSets(): SyncSurfaceKey[] {
  return (Object.keys(SYNC_SURFACES) as SyncSurfaceKey[]).filter((key) => {
    // Widened deliberately: indexing the `as const` map with a union key
    // gives a union of literal tuples, and `.includes` then narrows its own
    // parameter to `never` for the surfaces that lack the lane.
    const lanes: readonly SyncLane[] = SYNC_SURFACES[key].requiredLanes
    return lanes.includes("vulnerability_findings") && lanes.length > 1
  })
}
