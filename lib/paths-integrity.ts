/**
 * Fail-closed integrity for `/api/proxy/identity-attack-paths/all`.
 *
 * Sibling of lib/summary-integrity.ts, same one rule, different producer.
 *
 * The backend fan-out (api/identity_attack_paths.py) scans N systems
 * concurrently against 2 compute threads with a 45s per-system awaiter. Most
 * sub-calls used to time out and return a `computing` envelope carrying no
 * `crown_jewels` key — which the aggregator counted as a successful scan. Live,
 * that produced:
 *
 *     total_jewels=0  total_paths=0  systems_scanned=8  errors=[]
 *
 * on two of three consecutive calls, while the true answer was 30 jewels and
 * 236 paths. "No, and I checked all eight systems" — on the endpoint that
 * answers whether an attacker can reach the crown jewels.
 *
 * The backend now emits `serve_state` / `analysis_complete` and NULLS the
 * `total_*` counts unless every discovered system actually scanned. This module
 * is the consumer half: nothing may render "none found" without an explicit
 * READY + analysis_complete, and a non-READY payload must never reach the
 * cache, or a cold-start zero outlives the outage that produced it.
 */

export type PathsServeState = "READY" | "PARTIAL" | "NOT_READY"

export interface PathsIntegrityFields {
  serve_state?: string
  analysis_complete?: boolean
  not_ready_reason?: string | null
  crown_jewels_partial?: boolean
  systems_discovered?: number | null
  systems_scanned?: number | null
  systems_uncomputed?: number | null
  uncomputed?: string[]
  errors?: string[]
  error?: string
  total_jewels?: number | null
}

export interface PathsIntegrity {
  state: PathsServeState
  /**
   * The ONLY condition under which "no crown jewel has an inbound path" may
   * be rendered. An empty list from a partial scan is not that sentence.
   */
  canRenderNoneFound: boolean
  /** The jewels shown are real but incomplete — label them. */
  listIsPartial: boolean
  systemsDiscovered: number | null
  systemsScanned: number | null
  systemsUncomputed: number | null
  /** Per-system "name: reason" strings for the systems that never ran. */
  uncomputed: string[]
  errors: string[]
  reason: string | null
}

function finite(v: unknown): number | null {
  return Number.isFinite(v as number) ? (v as number) : null
}

/**
 * Absence is NOT_READY. A payload carrying no provenance fields is one whose
 * producer we cannot identify — an old deploy, a proxy stub, a stale cache
 * entry written before this contract existed. Treating that silence as a
 * completed scan is the exact defect being removed, so it must fail closed
 * even though it costs us a legitimate-looking render on rollback.
 */
export function derivePathsIntegrity(raw: unknown): PathsIntegrity {
  const p = (raw ?? {}) as PathsIntegrityFields
  const declared = typeof p.serve_state === "string" ? p.serve_state : null
  const complete = p.analysis_complete === true

  const state: PathsServeState =
    declared === "READY" && complete
      ? "READY"
      : declared === "PARTIAL"
        ? "PARTIAL"
        : "NOT_READY"

  const errors = Array.isArray(p.errors) ? p.errors : []
  const uncomputed = Array.isArray(p.uncomputed) ? p.uncomputed : []

  return {
    state,
    // Requires BOTH the declared state and the completeness flag. Either one
    // alone has been wrong before: a producer can say READY and still be
    // mid-sweep, and analysis_complete can be carried on a payload whose
    // serve_state was never set.
    canRenderNoneFound: state === "READY" && complete && errors.length === 0,
    listIsPartial: p.crown_jewels_partial === true || state !== "READY",
    systemsDiscovered: finite(p.systems_discovered),
    systemsScanned: finite(p.systems_scanned),
    systemsUncomputed: finite(p.systems_uncomputed),
    uncomputed,
    errors,
    reason:
      p.not_ready_reason ??
      p.error ??
      (state === "READY" ? null : "no provenance on this payload"),
  }
}

/**
 * localStorage gate for useCachedFetch. Blocks the write AND evicts on read,
 * so a zero cached during an outage cannot outlive it.
 */
export function isCacheablePaths(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false
  return derivePathsIntegrity(raw).state === "READY"
}
