/**
 * The backend's typed "I cannot answer this read" shapes — shared by the
 * browser fetch hook (lib/use-cached-fetch.ts), the proxy cache hygiene and
 * the attack-path views. Server-owned vocabulary; never extended here.
 *
 * Producers (backend `cyntro_data/semantic`):
 *   - estate_read.finish_estate_read → 200 `semantic_status: "unavailable"` (C1,
 *     guard off) or 503 `detail.code: SEMANTIC_READ_UNAVAILABLE` (install);
 *   - the consumer-readiness hold → 200 `semantic_status: "not_recorded"`;
 *   - serving_read_guard → 503 `detail.code: SERVING_READ_REFUSED`;
 *   - estate_read.held_route_refusal → 503 `detail.code: SERVING_ROUTE_HELD`.
 *
 * Two classes, handled differently by every consumer:
 *   - a REFUSAL (SERVING_READ_REFUSED, SERVING_ROUTE_HELD) and a 200 HOLD
 *     (not_recorded / unavailable) are the server answering, on purpose, that
 *     this read is not served right now. Nothing cached may stand in for them.
 *   - SEMANTIC_READ_UNAVAILABLE is a reader FAILURE; last-good data may still be
 *     shown, labelled stale (the proxy's documented choice).
 */

export type SemanticHoldKind = "not_recorded" | "unavailable" | "refused" | "route_held" | "error"

export interface SemanticHold {
  kind: SemanticHoldKind
  /** The server's own words (hold_reason / error / `CODE: reason`), verbatim. */
  reason: string | null
}

const HOLD_SEMANTIC_STATUS: ReadonlySet<string> = new Set(["not_recorded", "unavailable"])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function statusHoldOf(body: Record<string, unknown>): SemanticHold | null {
  const status = nonEmpty(body.semantic_status)
  if (!status || !HOLD_SEMANTIC_STATUS.has(status)) return null
  return {
    kind: status as SemanticHoldKind,
    reason: nonEmpty(body.hold_reason) ?? nonEmpty(body.error),
  }
}

/**
 * A 200 body that says it is a hold, not an answer:
 * `semantic_status` `not_recorded` | `unavailable` (bare, or a trust envelope's `result`).
 */
export function semanticStatusHold(body: unknown): SemanticHold | null {
  const outer = asRecord(body)
  if (!outer) return null
  return statusHoldOf(outer) ?? (asRecord(outer.result) ? statusHoldOf(asRecord(outer.result)!) : null)
}

function detailOf(body: unknown): { code: string; reason: string | null } | null {
  const detail = asRecord(asRecord(body)?.detail)
  const code = nonEmpty(detail?.code)
  return code ? { code, reason: nonEmpty(detail?.reason) } : null
}

function coded(code: string, reason: string | null): string {
  return reason ? `${code}: ${reason}` : code
}

/**
 * A typed REFUSAL body (HTTP 503): `SERVING_READ_REFUSED` or `SERVING_ROUTE_HELD`.
 * An authority answer about this read — never masked by cached data.
 */
export function typedServingRefusal(body: unknown): SemanticHold | null {
  const detail = detailOf(body)
  if (!detail) return null
  if (detail.code === "SERVING_READ_REFUSED") {
    return { kind: "refused", reason: coded(detail.code, detail.reason) }
  }
  if (detail.code === "SERVING_ROUTE_HELD") {
    return { kind: "route_held", reason: coded(detail.code, detail.reason) }
  }
  return null
}

/** A typed READER FAILURE body (HTTP 503): `SEMANTIC_READ_UNAVAILABLE`. */
export function typedReaderUnavailable(body: unknown): SemanticHold | null {
  const detail = detailOf(body)
  return detail?.code === "SEMANTIC_READ_UNAVAILABLE"
    ? { kind: "unavailable", reason: coded(detail.code, detail.reason) }
    : null
}

/** One operator-facing line for a hold, used as the fetch hook's `error`. */
export function semanticHoldMessage(hold: SemanticHold): string {
  const head =
    hold.kind === "not_recorded"
      ? "Not recorded yet"
      : hold.kind === "refused"
        ? "Read refused by the server"
        : hold.kind === "route_held"
          ? "Route held by the server"
          : hold.kind === "unavailable"
            ? "Unavailable"
            : "Read failed"
  return hold.reason ? `${head} — ${hold.reason}` : head
}
