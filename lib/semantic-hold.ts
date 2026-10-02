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
 *   - estate_read.held_route_refusal → 503 `detail.code: SERVING_ROUTE_HELD`;
 *   - estate_read._refuse_http (the server scope) → 503 `INVENTORY_SCOPE_UNAVAILABLE` (+ reason,
 *     e.g. NO_DATA_ACCOUNTS), 422 `ACCOUNT_SCOPE_REQUIRED` (several workload accounts, none named),
 *     403 `INVENTORY_SCOPE_MISMATCH` (a claim outside the server's scope); and the LP review scope's
 *     403 `REVIEW_SCOPE_MISMATCH`.
 *
 * Two classes, handled differently by every consumer:
 *   - a REFUSAL (SERVING_READ_REFUSED, SERVING_ROUTE_HELD) and a 200 HOLD
 *     (not_recorded / unavailable) are the server answering, on purpose, that
 *     this read is not served right now. Nothing cached may stand in for them.
 *   - SEMANTIC_READ_UNAVAILABLE is a reader FAILURE; last-good data may still be
 *     shown, labelled stale (the proxy's documented choice).
 */

export type SemanticHoldKind =
  | "not_recorded"
  | "unavailable"
  | "refused"
  | "route_held"
  | "scope_unavailable"
  | "scope_required"
  | "scope_denied"
  | "error"

export interface SemanticHold {
  kind: SemanticHoldKind
  /** The server's own words (hold_reason / error / `CODE: reason`), verbatim. */
  reason: string | null
  /** The bare server reason (e.g. NO_DATA_ACCOUNTS), used to word a defined install STATE. */
  state?: string | null
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
  const reason = nonEmpty(body.hold_reason) ?? nonEmpty(body.error)
  return { kind: status as SemanticHoldKind, reason, state: nonEmpty(body.hold_reason) }
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
  if (detail.code === "INVENTORY_SCOPE_UNAVAILABLE") {
    return { kind: "scope_unavailable", reason: coded(detail.code, detail.reason), state: detail.reason }
  }
  if (detail.code === "ACCOUNT_SCOPE_REQUIRED") {
    return { kind: "scope_required", reason: detail.code, state: detail.code }
  }
  if (detail.code === "INVENTORY_SCOPE_MISMATCH" || detail.code === "REVIEW_SCOPE_MISMATCH") {
    return { kind: "scope_denied", reason: coded(detail.code, detail.reason), state: detail.code }
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

/**
 * Server hold reasons that are a defined STATE of the install, not a fault, with their plain words.
 * NO_DATA_ACCOUNTS (backend estate_read): a control-plane install with no workload account connected.
 */
const STATE_HOLDS: Readonly<Record<string, string>> = {
  NO_DATA_ACCOUNTS: "No workload account is connected yet — connect one in Settings › Accounts",
  // The default: this view does not send a selected account, so the scope bar would not help it.
  ACCOUNT_SCOPE_REQUIRED:
    "Several workload accounts are connected — this view does not read one selected account, so it cannot show this",
  INVENTORY_SCOPE_MISMATCH: "The selected account is not in this install's scope",
  REVIEW_SCOPE_MISMATCH: "The selected account is not in this review's scope",
}

/**
 * What a view that DOES send the selected account (withAccountScope) can say about ACCOUNT_SCOPE_REQUIRED.
 * The caller declares it -- it is never inferred from a URL:
 *   "offer"    -- no account is selected: the scope bar is the way forward;
 *   "diagnose" -- an account IS selected and the server still asked for one: the selection did not
 *                 reach this read, which is a fault to look at, not a choice to make.
 */
export type AccountSelection = "offer" | "diagnose"

const ACCOUNT_SELECTION_WORDS: Readonly<Record<AccountSelection, string>> = {
  offer: "Several workload accounts are connected — choose one account in the scope bar to see this",
  diagnose:
    "An account is selected, but the server still asked for one (ACCOUNT_SCOPE_REQUIRED) — the selection did not reach this read",
}

/** A refusal of the CALLER itself, in the person's words: 401 (the session) or 403 (the permission). */
export function callerRefusalMessage(status: 401 | 403): string {
  return status === 401 ? "Your session is no longer valid — sign in again" : "Not permitted for this account or scope"
}

/** One operator-facing line for a hold, used as the fetch hook's `error`. */
export function semanticHoldMessage(hold: SemanticHold, opts?: { accountSelection?: AccountSelection }): string {
  const state = hold.state ?? (hold.kind === "not_recorded" ? hold.reason : null)
  if (state === "ACCOUNT_SCOPE_REQUIRED" && opts?.accountSelection) return ACCOUNT_SELECTION_WORDS[opts.accountSelection]
  if (state && STATE_HOLDS[state]) return STATE_HOLDS[state]
  if (state && state.startsWith("REGION_NOT_SERVED")) {
    const region = state.split(":")[1]
    return `${region ? `Region ${region} is` : "This Region is"} not served by this install yet`
  }
  const head =
    hold.kind === "not_recorded"
      ? "Not recorded yet"
      : hold.kind === "refused"
        ? "Read refused by the server"
        : hold.kind === "route_held"
          ? "Route held by the server"
          : hold.kind === "scope_unavailable"
            ? "Not available for this scope"
          : hold.kind === "unavailable"
            ? "Unavailable"
            : "Read failed"
  return hold.reason ? `${head} — ${hold.reason}` : head
}
