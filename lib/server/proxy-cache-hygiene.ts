/** Proxy-cache hygiene — never persist Wave D computing / empty poison envelopes.

When BE returns ``status: "computing"`` (peer_computing), the FE proxy used to
``setCached`` that empty payload for TTL_SLOW (5m). Every subsequent visit then
HIT the empty envelope → Estate Map / Attack Paths look blank even after BE
locks are cleared.

Rule: only cache payloads that carry real graph content.
*/
import { isComputingEnvelope, isSnapshotComputeEnvelope } from "@/lib/types/snapshot"

export function isPoisonousProxyPayload(data: unknown): boolean {
  if (data == null || typeof data !== "object") return false
  const d = data as Record<string, unknown>

  // Wave B/D computing / failed envelopes — null KPIs / empty paths.
  if (isSnapshotComputeEnvelope(data) || isComputingEnvelope(data)) return true
  if (d.status === "computing") return true

  // Topology-risk shape: computing with no system_kpis.
  if (d.system_kpis == null && Array.isArray(d.nodes) && d.nodes.length === 0) {
    if (d.staleReason === "peer_computing" || d.status === "computing") return true
  }

  // IAP shape: empty paths + jewels while claiming compute-in-progress.
  if (
    Array.isArray(d.paths) &&
    d.paths.length === 0 &&
    Array.isArray(d.crown_jewels) &&
    d.crown_jewels.length === 0 &&
    (d.staleReason === "peer_computing" || d.status === "computing")
  ) {
    return true
  }

  return false
}
