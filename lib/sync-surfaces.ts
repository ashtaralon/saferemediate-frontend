/**
 * What each screen's refresh button actually refreshes.
 *
 * "Sync from AWS" on seven surfaces used to trigger one Inspector-only
 * operation, then paint a green "Synced" with the BROWSER's clock — so
 * Identities, Inventory, LP and Dependency Map all claimed freshness for data
 * the backend never touched. That is false freshness, and it is the exact
 * failure the no-fabricated-values rule exists to prevent.
 *
 * The backend already tells the truth: POST /api/v2/sync/start returns the
 * lanes it dispatched in `sources`, and every lane it did NOT refresh in
 * `deferred_sources` with a state of NOT_CONNECTED or NOT_REQUESTED. This
 * module binds each screen to the lane its data actually comes from, so the
 * label, the enabled state and the freshness stamp are all derived from the
 * backend receipt instead of decided per-component.
 *
 * Adding a screen means adding a row here — not inventing new copy.
 */

/** Lane ids exactly as the backend emits them. Do not invent values. */
export type SyncLane =
  | "vulnerability_findings"
  | "inventory_reconcile"
  | "api_activity"
  | "network_flow"

/** Per-lane outcome of one sync round, read from the backend response. */
export type LaneState =
  | "REFRESHED"      // backend dispatched this lane in this round
  | "NOT_CONNECTED"  // lane has no collection path deployed for this tenant
  | "NOT_REQUESTED"  // lane exists but this round did not ask for it
  | "UNKNOWN"        // no round has run, or the backend said nothing about it

export interface SyncSurface {
  /** The backend lane this screen's data comes from. */
  lane: SyncLane
  /** Button label. Names the evidence, never the whole cloud. */
  action: string
  /** What this screen is showing, for the "not refreshed" explanation. */
  evidence: string
}

export const SYNC_SURFACES = {
  cve: {
    lane: "vulnerability_findings",
    action: "Refresh Inspector findings",
    evidence: "Amazon Inspector vulnerability findings",
  },
  inventory: {
    lane: "inventory_reconcile",
    action: "Refresh inventory",
    evidence: "AWS resource inventory and configuration",
  },
  iam: {
    lane: "api_activity",
    action: "Refresh IAM evidence",
    evidence: "IAM and CloudTrail activity evidence",
  },
  network: {
    lane: "network_flow",
    action: "Refresh network evidence",
    evidence: "VPC flow log evidence",
  },
} as const satisfies Record<string, SyncSurface>

export type SyncSurfaceKey = keyof typeof SYNC_SURFACES

interface DeferredEntry {
  source?: string
  label?: string
  state?: string
}

/**
 * Resolve one lane's outcome from a sync response.
 *
 * `results` is the completed-status payload; `startPayload` the start response.
 * Both carry `deferred_sources`; only the completed one carries
 * `refreshed_sources`. Absence of information is UNKNOWN — never REFRESHED.
 */
export function laneState(
  lane: SyncLane,
  payload: Record<string, unknown> | null | undefined,
): LaneState {
  if (!payload) return "UNKNOWN"

  const refreshed = payload.refreshed_sources ?? payload.sources
  if (Array.isArray(refreshed) && refreshed.includes(lane)) return "REFRESHED"

  const deferred = payload.deferred_sources
  if (Array.isArray(deferred)) {
    const hit = (deferred as DeferredEntry[]).find((d) => d?.source === lane)
    if (hit) {
      return hit.state === "NOT_CONNECTED" ? "NOT_CONNECTED" : "NOT_REQUESTED"
    }
  }
  return "UNKNOWN"
}

/**
 * The freshness timestamp for a lane — ONLY from a backend receipt.
 *
 * Returns null unless the backend both refreshed this lane and stamped when.
 * Never falls back to the browser clock: a local `new Date()` is a claim about
 * AWS that the client is in no position to make.
 */
export function laneRefreshedAt(
  lane: SyncLane,
  payload: Record<string, unknown> | null | undefined,
): string | null {
  if (laneState(lane, payload) !== "REFRESHED") return null
  const stamp = payload?.completed_at ?? payload?.activated_at
  return typeof stamp === "string" && stamp.trim() ? stamp : null
}

/** Human sentence for a lane the round did not refresh. */
export function notRefreshedReason(surface: SyncSurface, state: LaneState): string | null {
  switch (state) {
    case "NOT_CONNECTED":
      return `${surface.evidence} is not connected to on-demand refresh yet — this button cannot refresh it.`
    case "NOT_REQUESTED":
      return `${surface.evidence} was not part of this refresh.`
    case "UNKNOWN":
    case "REFRESHED":
    default:
      return null
  }
}
