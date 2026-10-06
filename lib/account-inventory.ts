/**
 * The account inventory client (T11b): a strict reader of the backend's `account_inventory/v1` answer
 * (GET /api/accounts/{account_id}/inventory, through /api/proxy/accounts/{accountId}/inventory) and the
 * pure state machine that keeps paging bound to ONE account and ONE publication.
 *
 * Browse only. Each row's `eligibility`, `assignment` and `observed_incarnation` are kept as data for later
 * consumers and never rendered or used as selectable here: authoring roots and SystemRef are not this
 * contract (`account_inventory_roots/v2` is the server-side resolver's, never this one).
 *
 * The inventory is ACCOUNT-WIDE: the API has no Region filter, so every page is the whole account (all its
 * published Regions plus global resources), whatever Region the global scope names.
 *
 * Validation mirrors the producer's own validators (backend cyntro_data/projection/account_inventory_rows.py
 * and cyntro_data/semantic/account_inventory_collection.py). Anything malformed, foreign or inconsistent
 * with its HTTP status is "unavailable / RESPONSE_MALFORMED" and shows no rows.
 */

export const INVENTORY_CONTRACT = "account_inventory/v1"

export const DATA_STATES = ["populated", "complete_empty", "filter_empty"] as const
export const EVIDENCE_STATES = ["not_published", "held", "stale", "invalid"] as const
export type DataState = (typeof DATA_STATES)[number]
export type EvidenceState = (typeof EVIDENCE_STATES)[number]
export type InventoryState = DataState | EvidenceState | "refused" | "unavailable"

/** The proxy's own sanitized answers ({"error": code}); anything else that is not the contract is unrecognized. */
export const PROXY_CODES = [
  "PROXY_ACCOUNT_ID_INVALID",
  "PROXY_QUERY_INVALID",
  "PROXY_BACKEND_UNCONFIGURED",
  "PROXY_BACKEND_UNREACHABLE",
  "PROXY_BACKEND_REDIRECT",
  "PROXY_RESPONSE_NOT_JSON",
] as const
export const RESPONSE_MALFORMED = "RESPONSE_MALFORMED"
export const RESPONSE_NOT_CONTRACT = "RESPONSE_NOT_CONTRACT"
export const CURSOR_RESTART_REQUIRED = "CURSOR_RESTART_REQUIRED"
/** Pages of one publication that cannot be a real walk of it: a cursor that does not advance or repeats, a row seen
 * before, changed totals, or more (or, at the end, other) rows than the publication's own count. */
export const PAGE_PROGRESSION_INVALID = "PAGE_PROGRESSION_INVALID"

// Producer bounds (account_inventory_rows.py / account_inventory_collection.py).
const ROW_FIELD_MAX_BYTES = {
  resource_uid: 1024,
  resource_type: 128,
  region: 32,
  native_id: 1024,
  arn: 2048,
  name: 1024,
  configuration_hash: 128,
  last_verified_at: 40,
} as const
const ROW_STATES = new Set(["ACTIVE", "DELETED", "UNKNOWN"])
const GLOBAL_REGION = "global"
const PAGE_LIMIT_MAX = 200
const CURSOR_MAX_BYTES = 2048
const REASON_MAX_BYTES = 512
const ACCOUNT_ID = /^[0-9]{12}$/
const HEX32 = /^[0-9a-f]{32}$/
const DIGEST = /^v1:[0-9a-f]{64}$/

export interface InventoryRow {
  resource_uid: string
  resource_type: string
  scope_kind: "global" | "regional"
  region: string
  native_id: string
  arn: string | null
  name: string | null
  state: string
  observation: { configuration_hash: string | null; last_verified_at: string | null }
  /** Kept as data only; never rendered or used for selection here. */
  observed_incarnation: Record<string, unknown>
  /** Kept as data only (an unknown status is preserved); never rendered here. */
  assignment: Record<string, unknown>
  /** The authoring judgement, kept as data only; NEVER shown or used as selectable on this screen. */
  eligibility: Record<string, unknown>
  /** Row v3 (I1): the fact's tags, ONLY for a type whose collector reads tags ({} = read, none); absent otherwise. */
  tags?: Record<string, string>
  /** Row v3: tags too large (or not text) to serve -- how many, and why; never truncated. */
  tags_withheld?: { reason: string; count: number }
  /** Row v3: the type's allowed attributes the fact carries as display-safe scalars (lib/inventory-details.ts reads them). */
  details?: Record<string, string | number | boolean>
  /** Row v3: allowed attributes the fact carries but that could not be shown (their names). */
  details_withheld?: string[]
}

export interface PublicationIdentity {
  attempt: string
  generation: number
  source_identity: string
  authority_digest: string
  registration_id: string
}

export interface InventoryData {
  kind: "data"
  status: number
  state: DataState
  accountId: string
  publication: PublicationIdentity
  publishedAtEpoch: number
  inventoryComplete: boolean
  totals: { accountTotal: number; filterTotal: number }
  rows: InventoryRow[]
  nextCursor: string | null
  hasMore: boolean
}

export interface InventoryOutcome {
  kind: "evidence" | "refused" | "unavailable"
  status: number
  state: EvidenceState | "refused" | "unavailable"
  reasonCode: string | null
}

export type ParsedInventory = InventoryData | InventoryOutcome

function bytes(value: string): number {
  return new TextEncoder().encode(value).length
}

/** A row's identity in its publication: the producer orders and keys rows by (resource_type, resource_uid). */
export function rowKey(row: Pick<InventoryRow, "resource_type" | "resource_uid">): string {
  return JSON.stringify([row.resource_type, row.resource_uid])
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function boundedText(value: unknown, max: number, { optional = false } = {}): boolean {
  if (value === null || value === undefined) return optional && value === null
  return typeof value === "string" && value.length > 0 && bytes(value) <= max
}

function safeInt(value: unknown, min: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min
}

function malformed(status: number): InventoryOutcome {
  return { kind: "unavailable", status, state: "unavailable", reasonCode: RESPONSE_MALFORMED }
}

function validRow(row: unknown): row is InventoryRow {
  if (!isObject(row)) return false
  const required = ["resource_uid", "resource_type", "region", "native_id"] as const
  for (const field of required) {
    if (!boundedText(row[field], ROW_FIELD_MAX_BYTES[field])) return false
  }
  for (const field of ["arn", "name"] as const) {
    if (!boundedText(row[field], ROW_FIELD_MAX_BYTES[field], { optional: true })) return false
  }
  if (row.scope_kind !== "global" && row.scope_kind !== "regional") return false
  if ((row.region === GLOBAL_REGION) !== (row.scope_kind === "global")) return false
  if (typeof row.state !== "string" || !ROW_STATES.has(row.state)) return false
  const observation = row.observation
  if (!isObject(observation)) return false
  if (!boundedText(observation.configuration_hash, ROW_FIELD_MAX_BYTES.configuration_hash, { optional: true })) return false
  if (!boundedText(observation.last_verified_at, ROW_FIELD_MAX_BYTES.last_verified_at, { optional: true })) return false
  // Kept as data: each must be an object; incarnation and assignment carry a string status (any value is preserved).
  const incarnation = row.observed_incarnation
  const assignment = row.assignment
  if (!isObject(incarnation) || typeof incarnation.status !== "string") return false
  if (!isObject(assignment) || typeof assignment.status !== "string") return false
  if (!isObject(row.eligibility)) return false
  return validRowV3(row)
}

// Row v3 (account_inventory_rows.py _tags / _details): a tag is text -> text, the whole set bounded by the producer's
// budget (over it the row carries tags_withheld instead); a detail is a boolean, an integer or a text of at most
// DETAIL_TEXT_MAX characters (Python counts code points, so this does too).
const TAGS_WITHHELD_REASONS = new Set(["TAGS_OVER_CAP", "TAGS_NOT_TEXT"])
const DETAIL_TEXT_MAX = 512

/** Row v3's members, each strictly shaped WHEN present (a v2 row has none of them). */
function validRowV3(row: Record<string, unknown>): boolean {
  if ("tags" in row && "tags_withheld" in row) return false
  if ("tags" in row) {
    if (!isObject(row.tags) || !Object.values(row.tags).every((value) => typeof value === "string")) return false
  }
  if ("tags_withheld" in row) {
    const withheld = row.tags_withheld
    if (!isObject(withheld) || typeof withheld.reason !== "string" || !TAGS_WITHHELD_REASONS.has(withheld.reason)
      || !safeInt(withheld.count, 0)) {
      return false
    }
  }
  if ("details" in row) {
    if (!isObject(row.details)) return false
    for (const value of Object.values(row.details)) {
      const ok = typeof value === "boolean" || safeInt(value, Number.MIN_SAFE_INTEGER)
        || (typeof value === "string" && [...value].length <= DETAIL_TEXT_MAX)
      if (!ok) return false
    }
  }
  if ("details_withheld" in row) {
    const names = row.details_withheld
    if (!Array.isArray(names) || !names.every((name) => typeof name === "string" && name.length > 0)) return false
    const shown = "details" in row ? (row.details as object) : {}
    if (names.some((name) => Object.prototype.hasOwnProperty.call(shown, name))) return false
  }
  return true
}

/**
 * The ONE strict reading of an answer, for the account the page asked for. `status` is the HTTP status: a data
 * or evidence answer must be 200, a refusal 4xx and an unavailable answer 5xx, so an error can never carry
 * accepted data.
 */
export function parseInventoryResponse(status: number, body: unknown, accountId: string): ParsedInventory {
  if (!ACCOUNT_ID.test(accountId)) return malformed(status)
  if (!isObject(body)) return { kind: "unavailable", status, state: "unavailable", reasonCode: RESPONSE_NOT_CONTRACT }
  if (body.contract !== INVENTORY_CONTRACT) {
    const proxy = typeof body.error === "string" && (PROXY_CODES as readonly string[]).includes(body.error)
    return { kind: "unavailable", status, state: "unavailable", reasonCode: proxy ? (body.error as string) : RESPONSE_NOT_CONTRACT }
  }
  if (body.account_id !== accountId) return malformed(status)
  const state = body.state
  if (body.reason_code !== null && !boundedText(body.reason_code, REASON_MAX_BYTES)) return malformed(status)
  const reasonCode = (body.reason_code as string | null) ?? null
  if (typeof body.has_more !== "boolean" || !Array.isArray(body.rows)) return malformed(status)

  if ((DATA_STATES as readonly unknown[]).includes(state)) {
    if (status !== 200 || reasonCode !== null) return malformed(status)
    const authority = body.account_authority
    const publication = body.publication
    const totals = body.totals
    if (!isObject(authority) || typeof authority.registration_id !== "string" || !HEX32.test(authority.registration_id)) {
      return malformed(status)
    }
    if (!isObject(publication) || typeof publication.attempt !== "string" || !HEX32.test(publication.attempt)
      || !safeInt(publication.generation, 1)
      || typeof publication.source_identity !== "string" || !DIGEST.test(publication.source_identity)
      || typeof publication.authority_digest !== "string" || !DIGEST.test(publication.authority_digest)
      || !safeInt(publication.published_at_epoch, 0) || typeof publication.inventory_complete !== "boolean") {
      return malformed(status)
    }
    if (!isObject(totals) || !safeInt(totals.account_total, 0) || !safeInt(totals.filter_total, 0)
      || totals.filter_total > totals.account_total) {
      return malformed(status)
    }
    const rows = body.rows
    if (rows.length > PAGE_LIMIT_MAX || !rows.every(validRow)) return malformed(status)
    if (new Set((rows as InventoryRow[]).map(rowKey)).size !== rows.length) return malformed(status)
    const cursorOk = body.has_more
      ? boundedText(body.next_cursor, CURSOR_MAX_BYTES)
      : body.next_cursor === null
    if (!cursorOk) return malformed(status)
    const accountTotal = totals.account_total as number
    const filterTotal = totals.filter_total as number
    if (rows.length > filterTotal) return malformed(status)
    if (state === "populated" && (rows.length < 1 || filterTotal < 1)) return malformed(status)
    if (state === "complete_empty" && (rows.length !== 0 || accountTotal !== 0 || body.has_more)) return malformed(status)
    if (state === "filter_empty" && (rows.length !== 0 || filterTotal !== 0 || accountTotal < 1 || body.has_more)) {
      return malformed(status)
    }
    return {
      kind: "data",
      status,
      state: state as DataState,
      accountId,
      publication: {
        attempt: publication.attempt,
        generation: publication.generation as number,
        source_identity: publication.source_identity,
        authority_digest: publication.authority_digest,
        registration_id: authority.registration_id,
      },
      publishedAtEpoch: publication.published_at_epoch as number,
      inventoryComplete: publication.inventory_complete,
      totals: { accountTotal, filterTotal },
      rows: rows as InventoryRow[],
      nextCursor: (body.next_cursor as string | null) ?? null,
      hasMore: body.has_more,
    }
  }

  // Every other answer carries no data at all.
  if (body.publication !== null || body.totals !== null || body.rows.length !== 0 || body.has_more
    || body.next_cursor !== null) {
    return malformed(status)
  }
  if (body.account_authority !== null && !(isObject(body.account_authority)
    && typeof body.account_authority.registration_id === "string" && HEX32.test(body.account_authority.registration_id))) {
    return malformed(status)
  }
  if ((EVIDENCE_STATES as readonly unknown[]).includes(state)) {
    if (status !== 200) return malformed(status)
    return { kind: "evidence", status, state: state as EvidenceState, reasonCode }
  }
  if (state === "refused") {
    if (status < 400 || status > 499) return malformed(status)
    return { kind: "refused", status, state: "refused", reasonCode }
  }
  if (state === "unavailable") {
    if (status < 500 || status > 599) return malformed(status)
    return { kind: "unavailable", status, state: "unavailable", reasonCode }
  }
  return malformed(status)
}

export function isCursorRestart(parsed: ParsedInventory): boolean {
  return parsed.kind === "refused" && parsed.status === 409
    && typeof parsed.reasonCode === "string" && parsed.reasonCode.startsWith(`${CURSOR_RESTART_REQUIRED}:`)
}

// ── the state machine ──────────────────────────────────────────────────────────────────────────────────────────────

/** What one page request was issued for: captured immutably at issue, compared again at completion. */
export interface InventoryKey {
  customerId: string | null
  accountId: string
  resourceType: string | null
}

export interface InventoryRequest {
  epoch: number
  key: InventoryKey
  /** null: the first page. */
  cursor: string | null
  /** The publication page 1 fixed; null for the first page. */
  expectedPublication: PublicationIdentity | null
}

export type InventoryModel =
  | { kind: "loading"; epoch: number; key: InventoryKey; restarts: number }
  | ({ epoch: number; key: InventoryKey; restarts: number; loadingMore: boolean; seenCursors: string[] } & InventoryData)
  | ({ epoch: number; key: InventoryKey; restarts: number } & InventoryOutcome)
  | { kind: "republishing"; epoch: number; key: InventoryKey; restarts: number }

export function keysEqual(a: InventoryKey, b: InventoryKey): boolean {
  return a.customerId === b.customerId && a.accountId === b.accountId && a.resourceType === b.resourceType
}

export function publicationsEqual(a: PublicationIdentity, b: PublicationIdentity): boolean {
  return a.attempt === b.attempt && a.generation === b.generation && a.source_identity === b.source_identity
    && a.authority_digest === b.authority_digest && a.registration_id === b.registration_id
}

/** A fresh read under a NEW epoch: nothing of the previous read survives. */
export function startRead(epoch: number, key: InventoryKey, restarts = 0): InventoryModel {
  return { kind: "loading", epoch, key, restarts }
}

/** The request for the first page of the current read. */
export function firstPageRequest(model: InventoryModel): InventoryRequest {
  return { epoch: model.epoch, key: model.key, cursor: null, expectedPublication: null }
}

/** The request for the next page, or null when there is none to load (or one is already loading). */
export function nextPageRequest(model: InventoryModel): InventoryRequest | null {
  if (model.kind !== "data" || !model.hasMore || model.nextCursor === null || model.loadingMore) return null
  return { epoch: model.epoch, key: model.key, cursor: model.nextCursor, expectedPublication: model.publication }
}

export type InventoryEffect = "none" | "restart"

/**
 * Apply one response to the CURRENT model. A response for another epoch or key is dropped. An appended page must
 * continue exactly the cursor it was issued for and the publication page 1 fixed; otherwise (or on a 409 cursor
 * restart) the read restarts from page 1 once, and a second move in that chain is "republishing". Every non-data
 * outcome replaces the model, so no earlier row stays visible as current.
 */
export function applyInventoryResponse(
  model: InventoryModel,
  request: InventoryRequest,
  parsed: ParsedInventory,
): { model: InventoryModel; effect: InventoryEffect } {
  if (request.epoch !== model.epoch || !keysEqual(request.key, model.key)) return { model, effect: "none" }
  const base = { epoch: model.epoch, key: model.key, restarts: model.restarts }
  const restart = (): { model: InventoryModel; effect: InventoryEffect } =>
    model.restarts >= 1
      ? { model: { kind: "republishing", ...base }, effect: "none" }
      : { model, effect: "restart" }

  const invalid = (status: number): { model: InventoryModel; effect: InventoryEffect } => ({
    model: { ...base, kind: "unavailable", status, state: "unavailable", reasonCode: PAGE_PROGRESSION_INVALID },
    effect: "none",
  })

  if (request.cursor === null) {
    if (parsed.kind !== "data") return { model: { ...base, ...parsed }, effect: "none" }
    // A first page that is also the last must hold exactly the publication's own count.
    if (!parsed.hasMore && parsed.rows.length !== parsed.totals.filterTotal) return invalid(parsed.status)
    const seenCursors = parsed.nextCursor === null ? [] : [parsed.nextCursor]
    return { model: { ...base, ...parsed, loadingMore: false, seenCursors }, effect: "none" }
  }
  // An appended page.
  if (model.kind !== "data" || model.nextCursor !== request.cursor || request.expectedPublication === null
    || !publicationsEqual(model.publication, request.expectedPublication)) {
    return { model, effect: "none" }
  }
  if (isCursorRestart(parsed)) return restart()
  if (parsed.kind !== "data") return { model: { ...base, ...parsed }, effect: "none" }
  if (!publicationsEqual(parsed.publication, request.expectedPublication) || parsed.state !== model.state) {
    return restart()
  }
  // The same publication must walk forward: the same totals, a cursor never seen in this read, no row seen before, and
  // never more rows than its count -- exactly its count at the end. A short page is legitimate: has_more decides.
  if (parsed.totals.accountTotal !== model.totals.accountTotal || parsed.totals.filterTotal !== model.totals.filterTotal) {
    return invalid(parsed.status)
  }
  if (parsed.nextCursor !== null && (parsed.nextCursor === request.cursor || model.seenCursors.includes(parsed.nextCursor))) {
    return invalid(parsed.status)
  }
  const seen = new Set(model.rows.map(rowKey))
  if (parsed.rows.some((row) => seen.has(rowKey(row)))) return invalid(parsed.status)
  const accumulated = model.rows.length + parsed.rows.length
  if (accumulated > model.totals.filterTotal || (!parsed.hasMore && accumulated !== model.totals.filterTotal)) {
    return invalid(parsed.status)
  }
  return {
    model: {
      ...model,
      rows: model.rows.concat(parsed.rows),
      nextCursor: parsed.nextCursor,
      hasMore: parsed.hasMore,
      inventoryComplete: parsed.inventoryComplete,
      loadingMore: false,
      seenCursors: parsed.nextCursor === null ? model.seenCursors : model.seenCursors.concat(parsed.nextCursor),
    },
    effect: "none",
  }
}

// ── transport ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface InventoryFetchResult {
  status: number
  body: unknown
}

export type InventoryFetcher = (
  accountId: string,
  params: { resourceType: string | null; cursor: string | null },
  signal: AbortSignal,
) => Promise<InventoryFetchResult>

/** One page through this console's own proxy. A network or parse failure is reported, never thrown as data. */
export const fetchInventoryPage: InventoryFetcher = async (accountId, { resourceType, cursor }, signal) => {
  const query = new URLSearchParams()
  if (resourceType !== null) query.set("resource_type", resourceType)
  if (cursor !== null) query.set("cursor", cursor)
  const suffix = query.toString() ? `?${query}` : ""
  try {
    const response = await fetch(`/api/proxy/accounts/${encodeURIComponent(accountId)}/inventory${suffix}`, {
      cache: "no-store",
      signal,
    })
    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      body = null
    }
    return { status: response.status, body }
  } catch {
    return { status: 0, body: null }
  }
}
