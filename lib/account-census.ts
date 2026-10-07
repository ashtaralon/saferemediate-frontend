/**
 * The account census client (A7 S1c): a strict reader of the backend's `account_census_read/v1` answer
 * (GET /api/accounts/{account_id}/census, through /api/proxy/accounts/{accountId}/census) and the plain-language
 * sentences the page shows for it.
 *
 * The census is everything the account's AWS APIs can NAME (AWS Config, the Resource Groups Tagging API, CloudFormation,
 * Resource Explorer), joined to the account's published inventory: a row is `collected` (Cyntro collects its type in
 * depth and the inventory serves it), `listed_only` (only the census names it) or `inventory_pending` (its type is
 * collected in depth, but the account's inventory is not served yet). The coverage block says, per Region and source,
 * what each source answered -- a number is never shown without the state of the source it came from, and a missing
 * observation is never a missing resource (agent-coordinator/claude-a7-s1c-page-semantics-2026-10-06.txt, R-a..R-g).
 *
 * Validation mirrors the producer (backend cyntro_data/semantic/account_census_collection.py and account_census_view.py,
 * api/account_census.py). Anything malformed, foreign or inconsistent with its HTTP status is "unavailable /
 * RESPONSE_MALFORMED" and shows no rows. Proven against the REAL route's answers (__tests__/fixtures/account-census-captures).
 */

export const CENSUS_CONTRACT = "account_census_read/v1"

export const CENSUS_DATA_STATES = ["populated", "complete_empty", "filter_empty"] as const
export const CENSUS_EVIDENCE_STATES = ["not_published", "held", "stale", "invalid"] as const
export type CensusDataState = (typeof CENSUS_DATA_STATES)[number]
export type CensusEvidenceState = (typeof CENSUS_EVIDENCE_STATES)[number]

export const DEPTH_COLLECTED = "collected"
export const DEPTH_LISTED_ONLY = "listed_only"
export const DEPTH_INVENTORY_PENDING = "inventory_pending"
export const DEPTHS = [DEPTH_COLLECTED, DEPTH_LISTED_ONLY, DEPTH_INVENTORY_PENDING] as const
export type Depth = (typeof DEPTHS)[number]

export const CENSUS_SOURCES = ["config", "tagging", "cloudformation", "resource_explorer"] as const
export type CensusSource = (typeof CENSUS_SOURCES)[number]

export const RESPONSE_MALFORMED = "RESPONSE_MALFORMED"
export const RESPONSE_NOT_CONTRACT = "RESPONSE_NOT_CONTRACT"
export const CURSOR_RESTART_REQUIRED = "CURSOR_RESTART_REQUIRED"
/** The proxy's own sanitized answers ({"error": code}). */
export const CENSUS_PROXY_CODES = [
  "PROXY_ACCOUNT_ID_INVALID",
  "PROXY_QUERY_INVALID",
  "PROXY_BACKEND_UNCONFIGURED",
  "PROXY_BACKEND_UNREACHABLE",
  "PROXY_BACKEND_REDIRECT",
  "PROXY_RESPONSE_NOT_JSON",
] as const

const ACCOUNT_ID = /^[0-9]{12}$/
const HEX32 = /^[0-9a-f]{32}$/
const DIGEST = /^v1:[0-9a-f]{64}$/
const PAGE_LIMIT_MAX = 200
const CURSOR_MAX = 4096
const TEXT_MAX = 4096

export interface CensusRow {
  row_key: string
  resource_type: string
  region: string
  native_id: string | null
  arn: string | null
  name: string | null
  depth: Depth
  eligibility: { selectable: boolean; reason: string | null }
  sources: CensusSource[]
  cfn: { stack_id: string; logical_id: string; stack_status: string } | null
  deleted: boolean
  tags?: Record<string, string>
}

export interface CensusScope {
  region: string
  source: CensusSource
  state: string
  manifest_coverage: string
  action: string
  detail_code: string | null
  error_category: string | null
  count: number
  deleted_count: number
  stacks_listed: number
  stacks_in_progress: number
  stacks_deleted: number
  pagination_complete: boolean
  collected_at: string
  view_filter: string | null
  includes_global: boolean
}

export interface CensusCoverage {
  accountState: "COMPLETE" | "PARTIAL"
  gaps: string[]
  notRecorded: string[]
  notObservable: boolean
  notObservableRegions: string[]
  scopes: CensusScope[]
}

export interface CensusTotals {
  rowsTotal: number
  present: number
  deleted: number
  byDepth: Record<Depth, number>
  bySource: Record<string, number>
  byRegion: Record<string, number>
  byType: Record<string, number>
}

export interface CensusPublication {
  attempt: string
  generation: number
  publishedAtEpoch: number
  inventory: { status: string; reason: string }
  marker: { dispatchedAt: string; schedule: string; regions: string[] }
}

export interface CensusData {
  kind: "data"
  status: number
  state: CensusDataState
  accountId: string
  registrationId: string | null
  installAccount: boolean
  publication: CensusPublication
  coverage: CensusCoverage
  totals: CensusTotals
  rows: CensusRow[]
  nextCursor: string | null
  hasMore: boolean
}

export interface CensusOutcome {
  kind: "evidence" | "refused" | "unavailable"
  status: number
  state: CensusEvidenceState | "refused" | "unavailable"
  reasonCode: string | null
  /** The producer's own outcome detail for a not-published answer (e.g. "last dispatched <iso>"). */
  detail: string | null
}

export type ParsedCensus = CensusData | CensusOutcome

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function text(value: unknown, { optional = false } = {}): boolean {
  if (value === null) return optional
  return typeof value === "string" && value.length > 0 && value.length <= TEXT_MAX
}

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

function counts(value: unknown): value is Record<string, number> {
  return isObject(value) && Object.entries(value).every(([key, n]) => key.length > 0 && count(n))
}

function malformed(status: number): CensusOutcome {
  return { kind: "unavailable", status, state: "unavailable", reasonCode: RESPONSE_MALFORMED, detail: null }
}

function validRow(row: unknown): row is CensusRow {
  if (!isObject(row)) return false
  if (!text(row.row_key) || !text(row.resource_type) || !text(row.region)) return false
  if (!(row.native_id === null || text(row.native_id))) return false
  if (!(row.arn === null || row.arn === undefined || text(row.arn))) return false
  if (!(row.name === null || row.name === undefined || text(row.name))) return false
  if (!(DEPTHS as readonly unknown[]).includes(row.depth)) return false
  const eligibility = row.eligibility
  if (!isObject(eligibility) || typeof eligibility.selectable !== "boolean"
    || !(eligibility.reason === null || typeof eligibility.reason === "string")) {
    return false
  }
  if (!Array.isArray(row.sources) || !row.sources.every((s) => (CENSUS_SOURCES as readonly unknown[]).includes(s))) return false
  if (row.cfn !== null && row.cfn !== undefined) {
    const cfn = row.cfn
    if (!isObject(cfn) || !text(cfn.stack_id) || !text(cfn.logical_id) || !text(cfn.stack_status)) return false
  }
  if (typeof row.deleted !== "boolean") return false
  if (row.deleted && (row.cfn === null || row.cfn === undefined)) return false        // only CloudFormation lists a deleted row
  if (row.depth !== DEPTH_COLLECTED && eligibility.selectable) return false            // never selectable unless collected
  if ("tags" in row && row.tags !== undefined) {
    if (!isObject(row.tags) || !Object.values(row.tags).every((v) => typeof v === "string")) return false
  }
  return true
}

function validScope(scope: unknown): scope is CensusScope {
  if (!isObject(scope)) return false
  if (!text(scope.region) || !(CENSUS_SOURCES as readonly unknown[]).includes(scope.source)) return false
  if (!text(scope.state) || !text(scope.manifest_coverage) || !text(scope.action)) return false
  if (!(scope.detail_code === null || text(scope.detail_code))) return false
  if (!(scope.error_category === null || text(scope.error_category))) return false
  for (const field of ["count", "deleted_count", "stacks_listed", "stacks_in_progress", "stacks_deleted"] as const) {
    if (!count(scope[field])) return false
  }
  if (typeof scope.pagination_complete !== "boolean" || typeof scope.includes_global !== "boolean") return false
  if (!text(scope.collected_at)) return false
  if (!(scope.view_filter === null || text(scope.view_filter))) return false
  return true
}

function coverageOf(value: unknown): CensusCoverage | null {
  if (!isObject(value)) return null
  if (value.account_state !== "COMPLETE" && value.account_state !== "PARTIAL") return null
  const stringList = (v: unknown) => Array.isArray(v) && v.every((s) => text(s))
  if (!stringList(value.gaps) || !stringList(value.not_recorded) || typeof value.not_observable !== "boolean") return null
  const regions = value.not_observable_regions ?? []
  if (!stringList(regions)) return null
  if (!Array.isArray(value.scopes) || !value.scopes.every(validScope)) return null
  // The account is COMPLETE only when no gap is named (account_coverage); a contradiction is malformed, never shown.
  if ((value.account_state === "COMPLETE") !== ((value.gaps as unknown[]).length === 0)) return null
  if (value.not_observable !== ((regions as unknown[]).length > 0)) return null
  return {
    accountState: value.account_state,
    gaps: value.gaps as string[],
    notRecorded: value.not_recorded as string[],
    notObservable: value.not_observable,
    notObservableRegions: regions as string[],
    scopes: value.scopes as CensusScope[],
  }
}

function totalsOf(value: unknown): CensusTotals | null {
  if (!isObject(value)) return null
  if (!count(value.rows_total) || !count(value.present) || !count(value.deleted)) return null
  if (value.present + value.deleted !== value.rows_total) return null
  const byDepth = value.by_depth
  if (!isObject(byDepth) || !DEPTHS.every((d) => count(byDepth[d]))) return null
  if (!counts(value.by_source) || !counts(value.by_region) || !counts(value.by_type)) return null
  return {
    rowsTotal: value.rows_total,
    present: value.present,
    deleted: value.deleted,
    byDepth: byDepth as Record<Depth, number>,
    bySource: value.by_source,
    byRegion: value.by_region,
    byType: value.by_type,
  }
}

function publicationOf(value: unknown): CensusPublication | null {
  if (!isObject(value)) return null
  if (typeof value.attempt !== "string" || !HEX32.test(value.attempt)) return null
  if (!count(value.generation) || value.generation < 1 || !count(value.published_at_epoch)) return null
  if (typeof value.source_identity !== "string" || !DIGEST.test(value.source_identity)) return null
  const inventory = value.inventory
  const marker = value.marker
  if (!isObject(inventory) || !text(inventory.status) || typeof inventory.reason !== "string") return null
  if (!isObject(marker) || !text(marker.dispatched_at) || !text(marker.schedule)
    || !Array.isArray(marker.regions) || !marker.regions.every((r) => text(r))) {
    return null
  }
  return {
    attempt: value.attempt,
    generation: value.generation,
    publishedAtEpoch: value.published_at_epoch,
    inventory: { status: inventory.status as string, reason: inventory.reason },
    marker: { dispatchedAt: marker.dispatched_at as string, schedule: marker.schedule as string,
      regions: marker.regions as string[] },
  }
}

/**
 * The ONE strict reading of an answer for the account the page asked about. A data or evidence answer must be 200,
 * a refusal 4xx and an unavailable answer 5xx, so an error can never carry accepted data. `depth`, when the request
 * carried that filter, must hold for every row.
 */
export function parseCensusResponse(status: number, body: unknown, accountId: string,
  depth: Depth | null = null): ParsedCensus {
  if (!ACCOUNT_ID.test(accountId)) return malformed(status)
  if (!isObject(body)) return { kind: "unavailable", status, state: "unavailable", reasonCode: RESPONSE_NOT_CONTRACT, detail: null }
  if (body.contract !== CENSUS_CONTRACT) {
    const proxy = typeof body.error === "string" && (CENSUS_PROXY_CODES as readonly string[]).includes(body.error)
    return { kind: "unavailable", status, state: "unavailable", reasonCode: proxy ? (body.error as string) : RESPONSE_NOT_CONTRACT,
      detail: null }
  }
  if (body.account_id !== accountId) return malformed(status)
  if (!(body.reason_code === null || text(body.reason_code))) return malformed(status)
  if (typeof body.has_more !== "boolean" || !Array.isArray(body.rows)) return malformed(status)
  const reasonCode = (body.reason_code as string | null) ?? null
  const state = body.state

  if ((CENSUS_DATA_STATES as readonly unknown[]).includes(state)) {
    if (status !== 200 || reasonCode !== null) return malformed(status)
    const authority = body.account_authority
    if (!isObject(authority) || typeof authority.install_account !== "boolean"
      || !(authority.registration_id === null || (typeof authority.registration_id === "string" && HEX32.test(authority.registration_id)))) {
      return malformed(status)
    }
    const publication = publicationOf(body.publication)
    const coverage = coverageOf(body.coverage)
    const totals = totalsOf(body.totals)
    if (publication === null || coverage === null || totals === null) return malformed(status)
    const rows = body.rows
    if (rows.length > PAGE_LIMIT_MAX || !rows.every(validRow)) return malformed(status)
    if (new Set((rows as CensusRow[]).map((r) => r.row_key)).size !== rows.length) return malformed(status)
    if (depth !== null && (rows as CensusRow[]).some((r) => r.depth !== depth)) return malformed(status)
    const cursorOk = body.has_more
      ? typeof body.next_cursor === "string" && body.next_cursor.length > 0 && body.next_cursor.length <= CURSOR_MAX
      : body.next_cursor === null
    if (!cursorOk) return malformed(status)
    // A filtered page of a populated census may be short or EMPTY, with or without a next cursor (the producer pages by
    // chunk); only a null next_cursor ends a listing (api/account_census.py). So a populated page's row count proves nothing.
    if (state === "populated" && totals.rowsTotal === 0) return malformed(status)
    if ((state === "complete_empty" || state === "filter_empty") && (rows.length !== 0 || body.has_more)) return malformed(status)
    if (state === "complete_empty" && totals.rowsTotal !== 0) return malformed(status)
    if (state === "filter_empty" && totals.rowsTotal === 0) return malformed(status)
    return {
      kind: "data",
      status,
      state: state as CensusDataState,
      accountId,
      registrationId: (authority.registration_id as string | null) ?? null,
      installAccount: authority.install_account,
      publication,
      coverage,
      totals,
      rows: rows as CensusRow[],
      nextCursor: (body.next_cursor as string | null) ?? null,
      hasMore: body.has_more,
    }
  }

  if (body.rows.length !== 0 || body.has_more || body.next_cursor !== null) return malformed(status)
  const outcome = body.outcome
  const detail = isObject(outcome) && typeof outcome.detail === "string" && outcome.detail ? outcome.detail : null
  if ((CENSUS_EVIDENCE_STATES as readonly unknown[]).includes(state)) {
    if (status !== 200) return malformed(status)
    return { kind: "evidence", status, state: state as CensusEvidenceState, reasonCode, detail }
  }
  if (state === "refused") {
    if (status < 400 || status >= 500) return malformed(status)
    return { kind: "refused", status, state: "refused", reasonCode, detail: null }
  }
  if (state === "unavailable") {
    if (status < 500) return malformed(status)
    return { kind: "unavailable", status, state: "unavailable", reasonCode, detail: null }
  }
  return malformed(status)
}

// ── what the page says ───────────────────────────────────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<CensusSource, string> = {
  config: "AWS Config",
  tagging: "Tagging API",
  cloudformation: "CloudFormation",
  resource_explorer: "Resource Explorer",
}

export function sourceLabel(source: CensusSource): string {
  return SOURCE_LABELS[source]
}

function resources(n: number): string {
  return `${n} ${n === 1 ? "resource" : "resources"}`
}

function stacks(n: number): string {
  return `${n} ${n === 1 ? "stack" : "stacks"}`
}

/**
 * One source's line on the coverage band: its state in words and, only when the source answered, its count -- the
 * number never stands without the state it came from (R-a). A denied action names the action and the remedy.
 */
export function scopeSentence(scope: CensusScope): string {
  const where = `${sourceLabel(scope.source)} ${scope.region}`
  const listed = scope.count
  switch (scope.state) {
    case "COMPLETE":
      if (scope.source === "cloudformation") {
        const deleted = scope.stacks_deleted
          ? ` (${scope.stacks_deleted} deleted ${scope.stacks_deleted === 1 ? "stack" : "stacks"} listed as deleted)`
          : ""
        return `${where}: complete, ${resources(listed)} in ${stacks(scope.stacks_listed)}${deleted}`
      }
      return `${where}: complete, ${resources(listed)}`
    case "PARTIAL_BY_DESIGN":
      return `${where}: partial by design (tagged or previously tagged resources only), ${resources(listed)}`
    case "IN_PROGRESS":
      return `${where}: ${resources(listed)} in ${stacks(scope.stacks_listed)}; ${scope.stacks_in_progress} changing during the listing, so counts may move`
    case "PARTIAL_VIEW_FILTERED":
      return `${where}: partial, the view is filtered (${scope.view_filter ?? "filter not shown"}), ${resources(listed)}`
    case "UNAVAILABLE_NO_RECORDER":
      return `${where}: unavailable, no configuration recorder`
    case "STALE_RECORDER_STOPPED":
      return `${where}: the recorder is stopped; its last listing is shown, ${resources(listed)}`
    case "UNAVAILABLE_NO_INDEX":
      return `${where}: unavailable, no Resource Explorer index`
    case "UNAVAILABLE_NO_VIEW":
      return `${where}: unavailable, no default view`
    case "DENIED":
      return `${where}: access denied (${scope.action}); update the connection stack`
    case "INCOMPLETE":
      return scope.error_category === "throttled"
        ? `${where}: throttled; the listing stopped after ${resources(listed)}`
        : `${where}: incomplete; the listing stopped after ${resources(listed)}`
    case "NOT_APPLICABLE":
      return `${where}: not applicable here`
    default:
      return `${where}: unknown, the source failed unexpectedly`
  }
}

/** The sentence when neither AWS Config nor Resource Explorer answered in a Region (R-b: "not observable", never "absent"). */
export function notObservableSentence(regions: string[]): string {
  return `Resources that were never tagged, of types Cyntro does not yet collect in depth, cannot be observed in ${regions.join(", ")}: neither AWS Config nor Resource Explorer answered there.`
}

/** The page's sentence for every answer that carries no rows. */
export function outcomeSentence(outcome: CensusOutcome): string {
  const code = outcome.reasonCode ?? ""
  if (outcome.state === "not_published") {
    if (code === "CENSUS_DISABLED") return "Census is not enabled on this install."
    if (code === "CENSUS_NOT_RUN") return "Census has not run yet for this account's current registration."
    if (code === "CENSUS_STOPPED") {
      return outcome.detail ? `Census has stopped (${outcome.detail}).` : "Census has stopped."
    }
    return "The census has not been published for this account yet."
  }
  if (outcome.state === "held") {
    if (code === "AUTHORITY_CHANGED") {
      return "This account was registered again since the census was published; the next census pass replaces it."
    }
    if (code === "NOT_COLLECTABLE") return "This account is not readable right now; its registration does not allow collection."
    if (code.includes("CONSUMER_NOT_READY")) return "The census for this account is not ready to be shown yet."
    return `The census is held (${code || "no reason given"}).`
  }
  if (outcome.state === "stale") return `The census is older than it may be shown (${code || "stale"}).`
  if (outcome.state === "invalid") return `The census publication did not validate and is not shown (${code || "invalid"}).`
  if (outcome.state === "refused") {
    if (outcome.status === 401) return "Sign in again to read this account's census."
    if (outcome.status === 403) return "You are not authorized to read this account's census."
    return `The census request was refused (${code || "refused"}).`
  }
  return `The census could not be read (${code || "unavailable"}).`
}

/** A row's display name: AWS Config's name, else the Name tag, else the native id (D1). */
export function rowName(row: CensusRow): string {
  return row.name ?? row.tags?.Name ?? row.native_id ?? row.arn ?? row.row_key
}

/** The service a row belongs to: the resource type's prefix (``dynamodb:table`` -> ``dynamodb``). */
export function rowService(row: Pick<CensusRow, "resource_type">): string {
  const index = row.resource_type.indexOf(":")
  return index > 0 ? row.resource_type.slice(0, index) : row.resource_type
}

/** Rows grouped by service, services and rows in a stable order (present first, deleted last within a service). */
export function groupByService(rows: CensusRow[]): Array<{ service: string; rows: CensusRow[] }> {
  const groups = new Map<string, CensusRow[]>()
  for (const row of rows) {
    const service = rowService(row)
    groups.set(service, [...(groups.get(service) ?? []), row])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([service, members]) => ({
      service,
      rows: [...members].sort((a, b) => Number(a.deleted) - Number(b.deleted) || rowName(a).localeCompare(rowName(b))),
    }))
}

// ── transport ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface CensusFetchResult {
  status: number
  body: unknown
}

export type CensusFetcher = (accountId: string, params: { depth: Depth; cursor: string | null },
  signal?: AbortSignal) => Promise<CensusFetchResult>

/** The proxy path for one page of one depth (the identity travels in headers, as the inventory's does). */
export function censusPath(accountId: string, params: { depth: Depth; cursor: string | null },
  limit = PAGE_LIMIT_MAX): string {
  const query = new URLSearchParams()
  query.set("depth", params.depth)
  query.set("limit", String(limit))
  if (params.cursor) query.set("cursor", params.cursor)
  return `/api/proxy/accounts/${encodeURIComponent(accountId)}/census?${query.toString()}`
}

export const fetchCensusPage: CensusFetcher = async (accountId, params, signal) => {
  try {
    const response = await fetch(censusPath(accountId, params), { cache: "no-store", signal })
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
