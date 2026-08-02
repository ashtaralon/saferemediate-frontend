/**
 * Fail-closed integrity for `/api/proxy/systems/with-families`.
 *
 * Fifth and last of the executive feeds — summary / paths / candidates /
 * evidence / systems. Same defect, same shape, one feed later.
 *
 * That route fans out per system and deliberately preserves `errors[]`
 * from the calls that failed, returning HTTP 200 with the systems it did
 * get. The cockpit's local `SystemsResponse` did not even declare the
 * field, so a partial estate:
 *
 *   * under-counted "of N discovered business systems",
 *   * reported Business systems READY,
 *   * let the report claim "5 of 5 feeds ready",
 *   * and was cached as a complete reading.
 *
 * A system whose fan-out call failed is a system we could not measure, not
 * a system that is fine. "5 of 8" presented as "5" is the same
 * under-report that made /all say 18 jewels when there were 36.
 */

export type SystemsServeState = "READY" | "PARTIAL" | "UNAVAILABLE"

export interface SystemsIntegrityFields {
  systems?: unknown[]
  errors?: string[]
  error?: string
}

export interface SystemsIntegrity {
  state: SystemsServeState
  reason: string | null
  /** Systems whose fan-out call failed. Absent, not healthy. */
  failedSystems: number
  /** The count is a floor, not a total, whenever this is true. */
  countIsPartial: boolean
}

export function deriveSystemsIntegrity(raw: unknown): SystemsIntegrity {
  const p = (raw ?? null) as SystemsIntegrityFields | null
  if (!p || typeof p !== "object") {
    return {
      state: "UNAVAILABLE",
      reason: "no payload",
      failedSystems: 0,
      countIsPartial: true,
    }
  }

  // The 502 branch sets `error: "all_systems_endpoint_unavailable"`.
  if (p.error) {
    return {
      state: "UNAVAILABLE",
      reason: p.error,
      failedSystems: 0,
      countIsPartial: true,
    }
  }

  if (!Array.isArray(p.systems)) {
    return {
      state: "UNAVAILABLE",
      reason: "no systems array — cannot vouch for the estate",
      failedSystems: 0,
      countIsPartial: true,
    }
  }

  const errors = Array.isArray(p.errors) ? p.errors : []
  if (errors.length > 0) {
    return {
      state: "PARTIAL",
      reason: `${errors.length} system fan-out call${errors.length === 1 ? "" : "s"} failed`,
      failedSystems: errors.length,
      countIsPartial: true,
    }
  }

  return { state: "READY", reason: null, failedSystems: 0, countIsPartial: false }
}

/** Only a complete estate may be cached as a reading. */
export function isCacheableSystems(raw: unknown): boolean {
  return deriveSystemsIntegrity(raw).state === "READY"
}
