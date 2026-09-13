/** Proxy-cache hygiene — never persist a PENDING envelope as a completed graph.

When BE returns ``status: "computing"`` (peer_computing), the FE proxy used to
``setCached`` that empty payload for TTL_SLOW (5m). Every subsequent visit then
HIT the empty envelope → Estate Map / Attack Paths look blank even after BE
locks are cleared.

``waiting`` is the same class and was missed (2026-09-13). It was added as a
distinct envelope precisely BECAUSE ``computing`` overstated what was known:
ComputingEnvelope carries ``computing_started_at`` and ``compute_deadline_at``
— a start and a deadline for work that may never have begun — while
WaitingEnvelope carries only ``refresh_requested_at``, which is all a serving
process can actually observe after an enqueue. Having drawn that distinction in
the types, the hygiene rule never learned it: ``isWaitingEnvelope`` existed and
nothing here called it, so a valid ``waiting`` answer was cached as ordinary
successful map data and re-served as a completed graph for the whole TTL.

Rule: only cache payloads that carry real graph content. A payload that says
work is PENDING is a status report, not a map — whichever word it uses.

Note what is deliberately NOT poisonous: a stale serve carrying REAL nodes
alongside ``staleReason: "refresh_queued"``. That is last-good data, correctly
labelled, and caching it is the point of having a cache. Only an EMPTY payload
claiming to be pending is poison.
*/
import {
  isComputingEnvelope,
  isSnapshotComputeEnvelope,
  isWaitingEnvelope,
} from "@/lib/types/snapshot"

/** Statuses that mean "no graph here yet", whatever produced them. */
const PENDING_STATUS = new Set(["computing", "waiting"])

/** Stale reasons that accompany a pending recompute rather than a served map. */
const PENDING_STALE_REASON = new Set([
  "peer_computing",
  "snapshot_recomputing",
  "refresh_queued",
])

function claimsPending(d: Record<string, unknown>): boolean {
  return (
    PENDING_STATUS.has(String(d.status ?? "")) ||
    PENDING_STALE_REASON.has(String(d.staleReason ?? ""))
  )
}

export function isPoisonousProxyPayload(data: unknown): boolean {
  if (data == null || typeof data !== "object") return false
  const d = data as Record<string, unknown>

  // Wave B/D compute envelopes, and the waiting envelope that joined them.
  if (
    isSnapshotComputeEnvelope(data) ||
    isComputingEnvelope(data) ||
    isWaitingEnvelope(data)
  ) {
    return true
  }
  if (PENDING_STATUS.has(String(d.status ?? ""))) return true

  // Topology-risk shape: pending with no system_kpis and no nodes.
  if (d.system_kpis == null && Array.isArray(d.nodes) && d.nodes.length === 0) {
    if (claimsPending(d)) return true
  }

  // IAP shape: empty paths + jewels while claiming compute-in-progress.
  if (
    Array.isArray(d.paths) &&
    d.paths.length === 0 &&
    Array.isArray(d.crown_jewels) &&
    d.crown_jewels.length === 0 &&
    claimsPending(d)
  ) {
    return true
  }

  return false
}
