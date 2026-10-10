/**
 * Basic resource discovery's client (backend cyntro_data/resource_discovery, api/account_resources.py): strict readers of
 * `account_discovery/v1` (GET /api/accounts/{id}/discovery) and `account_resources/v1` (GET /api/accounts/{id}/resources),
 * through /api/proxy/accounts/{accountId}/..., and the adapter that shows a BASIC row in the existing inventory table and
 * drawer.
 *
 * A BASIC row is a native AWS listing, observed and saved: never certified, never verified, never selectable for a system
 * (its decision eligibility is always BASIC_ONLY). The listing is LIVE while discovery runs: counts are "found so far" until
 * the run is complete against its own plan, and a page refresh may show new rows -- it is not an immutable publication, so
 * it is never read by the publication reader (lib/account-inventory.ts), whose page-progression rules it would break.
 *
 * Anything malformed, foreign or inconsistent with its HTTP status is "unavailable / RESPONSE_MALFORMED" and shows nothing.
 */
import type { InventoryRow } from "@/lib/account-inventory"

export const DISCOVERY_CONTRACT = "account_discovery/v1"
export const RESOURCES_CONTRACT = "account_resources/v1"
export const RESPONSE_MALFORMED = "RESPONSE_MALFORMED"
export const CURSOR_RESTART_REQUIRED = "CURSOR_RESTART_REQUIRED"

export const COVERAGE_STATES = ["NOT_REQUESTED", "HELD", "STARTING", "DISCOVERING", "COMPLETE", "COMPLETE_WITH_GAPS"] as const
export type CoverageState = (typeof COVERAGE_STATES)[number]
/** Coverage that is still moving: the page refreshes while it lasts. */
export const LIVE_COVERAGE: ReadonlySet<CoverageState> = new Set(["STARTING", "DISCOVERING"])
/** The current registration's basic inventory is being shown (moving or finished; never HELD, never not requested). */
export const BASIC_INVENTORY_SHOWN: ReadonlySet<CoverageState> = new Set(["STARTING", "DISCOVERING", "COMPLETE", "COMPLETE_WITH_GAPS"])

const ACCOUNT_ID = /^[0-9]{12}$/
const RESOURCE_KEY = /^k1\.[A-Za-z0-9_-]{1,2800}$/

/** Per resource type, what its planned scopes prove (backend contract.type_states). */
export const TYPE_STATES = ["LISTED", "DISCOVERING", "PARTIAL", "ACCESS_NEEDED", "UNREADABLE", "UNSUPPORTED"] as const
export type TypeStateName = (typeof TYPE_STATES)[number]
export interface TypeState {
  state: TypeStateName
  found: number
  missing_actions: string[]
}

/** An empty page's state says what was PROVED: complete_empty only where the relevant listings succeeded. */
export const EMPTY_STATES = ["empty_so_far", "complete_empty", "empty_unproven", "type_unsupported", "type_unreadable"] as const
export type EmptyState = (typeof EMPTY_STATES)[number]

export interface DiscoveryGap {
  resource_type: string
  status: string
  regions: string[]
  missing_actions: string[]
}

export interface DiscoveryStatus {
  kind: "status"
  coverageState: CoverageState
  complete: boolean
  heldBy: string | null
  planState: string | null
  capabilitiesStatus: string | null
  runId: string | null
  registrationId: string | null
  observedTotal: number
  /** "found_so_far" until the run is complete against its plan; "found" after. */
  observedTotalLabel: "found" | "found_so_far"
  totalsByType: Record<string, number>
  /** Per planned type (empty before the plan is recorded). */
  types: Record<string, TypeState>
  gaps: DiscoveryGap[]
  /** The Regions the run enumerated, with the enumeration's own outcome; null before the run froze its plan. */
  plan: { regions: string[]; regionsStatus: string; scopeStates: Record<string, number> } | null
  /** The run's start message: SENT, or still PENDING with the blocker that held it (null without a run). */
  dispatch: { state: string; blocker: string | null } | null
  /** The current run's last Retry request and its answer (null: none for this run, or an older backend). */
  retry: { status: string; outcome: string | null; detail: string | null } | null
}

export interface BasicItem {
  resource_key: string
  resource_type: string
  identity_basis: string | null
  arn: string | null
  native_id: string
  name: string | null
  name_source: string | null
  scope_kind: "global" | "regional"
  region: string
  provider_state: string | null
  summary: Record<string, string | number | boolean>
  depth: string
  details_status: string
  source_api: string | null
  observed_at: string | null
  first_seen_at: string | null
}

export interface ResourcesPage {
  kind: "page"
  state: "populated" | EmptyState
  registrationId: string
  runId: string
  coverageState: CoverageState
  complete: boolean
  observedTotal: number
  observedTotalLabel: "found" | "found_so_far"
  totalsByType: Record<string, number>
  /** The filtered type's state (null without a filter, or before the plan). */
  typeState: TypeState | null
  items: BasicItem[]
  nextCursor: string | null
}

/** Not data: not requested (no run), held (the account's current authority refused, with its code), refused or unavailable. */
export interface ResourcesOutcome {
  kind: "outcome"
  status: number
  state: "not_requested" | "held" | "refused" | "unavailable"
  reasonCode: string | null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

function counts(value: unknown): Record<string, number> | null {
  if (!isObject(value)) return null
  const out: Record<string, number> = {}
  for (const [key, count] of Object.entries(value)) {
    if (!key || !isCount(count)) return null
    out[key] = count
  }
  return out
}

function strings(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? (value as string[]) : null
}

function typeState(value: unknown): TypeState | null {
  const missing = isObject(value) ? strings(value.missing_actions) : null
  if (!isObject(value) || !TYPE_STATES.includes(value.state as TypeStateName) || !isCount(value.found) || missing === null) {
    return null
  }
  return { state: value.state as TypeStateName, found: value.found, missing_actions: missing }
}

function malformed(status: number): ResourcesOutcome {
  return { kind: "outcome", status, state: "unavailable", reasonCode: RESPONSE_MALFORMED }
}

function outcome(status: number, body: Record<string, unknown>): ResourcesOutcome | null {
  const state = body.state
  const code = typeof body.reason_code === "string" ? body.reason_code : null
  if ((state === "not_requested" || state === "held") && status === 200) return { kind: "outcome", status, state, reasonCode: code }
  if (state === "refused" && status >= 400 && status < 500) return { kind: "outcome", status, state, reasonCode: code }
  if (state === "unavailable" && status >= 500) return { kind: "outcome", status, state, reasonCode: code }
  return null
}

/** The proxy's own sanitized answer ({"error": code}) or the backend's, as an outcome; anything else is malformed. */
function failure(status: number, body: unknown): ResourcesOutcome {
  if (isObject(body) && typeof body.error === "string" && Object.keys(body).length === 1) {
    return { kind: "outcome", status, state: status >= 500 ? "unavailable" : "refused", reasonCode: body.error }
  }
  if (isObject(body)) {
    const known = outcome(status, body)
    if (known) return known
  }
  return malformed(status)
}

export function parseDiscoveryResponse(status: number, body: unknown, accountId: string): DiscoveryStatus | ResourcesOutcome {
  if (status !== 200 || !isObject(body) || body.schema_version !== DISCOVERY_CONTRACT) return failure(status, body)
  if (body.account_id !== accountId || !ACCOUNT_ID.test(accountId)) return malformed(status)
  const coverage = body.coverage_state
  const totals = counts(body.totals_by_type)
  const gaps = Array.isArray(body.gaps) ? body.gaps : null
  if (!COVERAGE_STATES.includes(coverage as CoverageState) || totals === null || gaps === null || !isCount(body.observed_total)
    || typeof body.complete !== "boolean" || (body.observed_total_label !== "found" && body.observed_total_label !== "found_so_far")) {
    return malformed(status)
  }
  const parsedGaps: DiscoveryGap[] = []
  for (const gap of gaps) {
    const regions = isObject(gap) ? strings(gap.regions) : null
    const missing = isObject(gap) ? strings(gap.missing_actions) : null
    if (!isObject(gap) || typeof gap.resource_type !== "string" || typeof gap.status !== "string" || !regions || !missing) {
      return malformed(status)
    }
    parsedGaps.push({ resource_type: gap.resource_type, status: gap.status, regions, missing_actions: missing })
  }
  let plan: DiscoveryStatus["plan"] = null
  if (body.plan !== null && body.plan !== undefined) {
    const p = body.plan
    const regions = isObject(p) ? strings(p.regions) : null
    const states = isObject(p) ? counts(p.scope_states) : null
    if (!isObject(p) || !regions || !states || typeof p.regions_status !== "string") return malformed(status)
    plan = { regions, regionsStatus: p.regions_status, scopeStates: states }
  }
  // A complete run is one judged against its plan: COMPLETE without a plan is not this contract.
  if ((coverage === "COMPLETE" || coverage === "COMPLETE_WITH_GAPS") && (plan === null || body.complete !== true)) {
    return malformed(status)
  }
  const types: Record<string, TypeState> = {}
  if (!isObject(body.types)) return malformed(status)
  for (const [name, value] of Object.entries(body.types)) {
    const parsed = typeState(value)
    if (parsed === null) return malformed(status)
    types[name] = parsed
  }
  const text = (value: unknown) => (typeof value === "string" ? value : null)
  let dispatch: DiscoveryStatus["dispatch"] = null
  if (body.dispatch !== null && body.dispatch !== undefined) {
    if (!isObject(body.dispatch) || typeof body.dispatch.state !== "string"
      || (body.dispatch.blocker !== null && body.dispatch.blocker !== undefined && typeof body.dispatch.blocker !== "string")) {
      return malformed(status)
    }
    dispatch = { state: body.dispatch.state, blocker: text(body.dispatch.blocker) }
  }
  let retry: DiscoveryStatus["retry"] = null
  if (body.retry !== null && body.retry !== undefined) {
    if (!isObject(body.retry) || typeof body.retry.status !== "string") return malformed(status)
    retry = { status: body.retry.status, outcome: text(body.retry.outcome), detail: text(body.retry.detail) }
  }
  // A run being shown names its registration and run: the view is bound to them (and remounts when either moves).
  if (coverage !== "NOT_REQUESTED" && coverage !== "HELD" && (!text(body.run_id) || !text(body.registration_id))) {
    return malformed(status)
  }
  return {
    kind: "status", coverageState: coverage as CoverageState, complete: body.complete, heldBy: text(body.held_by), types,
    planState: text(body.plan_state), capabilitiesStatus: text(body.capabilities_status), runId: text(body.run_id),
    registrationId: text(body.registration_id), observedTotal: body.observed_total,
    observedTotalLabel: body.observed_total_label, totalsByType: totals, gaps: parsedGaps, plan, dispatch, retry,
  }
}

function validItem(item: unknown): item is BasicItem {
  if (!isObject(item)) return false
  if (typeof item.resource_key !== "string" || !RESOURCE_KEY.test(item.resource_key)) return false
  for (const field of ["resource_type", "native_id", "region", "depth", "details_status"] as const) {
    if (typeof item[field] !== "string" || !item[field]) return false
  }
  for (const field of ["identity_basis", "arn", "name", "name_source", "provider_state", "source_api", "observed_at",
    "first_seen_at"] as const) {
    if (item[field] !== null && typeof item[field] !== "string") return false
  }
  if (item.scope_kind !== "global" && item.scope_kind !== "regional") return false
  if ((item.region === "global") !== (item.scope_kind === "global")) return false
  if (!isObject(item.summary) || !Object.values(item.summary).every((v) => ["string", "number", "boolean"].includes(typeof v))) {
    return false
  }
  const eligibility = item.decision_eligibility
  return isObject(eligibility) && eligibility.eligible === false && eligibility.reason === "BASIC_ONLY"
}

export function parseResourcesResponse(status: number, body: unknown, accountId: string,
  resourceType: string | null): ResourcesPage | ResourcesOutcome {
  if (!isObject(body) || body.schema_version !== RESOURCES_CONTRACT) return failure(status, body)
  if (body.account_id !== accountId) return malformed(status)
  const known = outcome(status, body)
  if (known) return known
  const state = body.state
  const totals = counts(body.totals_by_type)
  const pageTypeState = body.type_state === null ? null : typeState(body.type_state)
  if (status !== 200 || (state !== "populated" && !EMPTY_STATES.includes(state as EmptyState))
    // A filtered page names its type's state once the plan is recorded (null before it); an unfiltered page never does.
    || (body.type_state !== null && pageTypeState === null) || (resourceType === null && body.type_state !== null)
    || !Array.isArray(body.items) || !body.items.every(validItem) || totals === null || !isCount(body.observed_total)
    || typeof body.registration_id !== "string" || typeof body.run_id !== "string" || typeof body.complete !== "boolean"
    || !COVERAGE_STATES.includes(body.coverage_state as CoverageState)
    || (body.next_cursor !== null && typeof body.next_cursor !== "string")
    || (body.observed_total_label !== "found" && body.observed_total_label !== "found_so_far")
    || !isObject(body.filter) || body.filter.resource_type !== resourceType) {
    return malformed(status)
  }
  const items = body.items as BasicItem[]
  if (resourceType !== null && items.some((item) => item.resource_type !== resourceType)) return malformed(status)
  return {
    kind: "page", state: state as ResourcesPage["state"], registrationId: body.registration_id, runId: body.run_id, coverageState: body.coverage_state as CoverageState,
    complete: body.complete, observedTotal: body.observed_total, observedTotalLabel: body.observed_total_label,
    totalsByType: totals, typeState: pageTypeState, items, nextCursor: body.next_cursor as string | null,
  }
}

/** A BASIC item in the inventory table's row shape: nothing invented -- no hash, no verification, no tags (not read). */
export function toInventoryRow(item: BasicItem): InventoryRow {
  const details: Record<string, string | number | boolean> = { ...item.summary }
  if (item.provider_state) details.provider_state = item.provider_state
  return {
    resource_uid: item.resource_key,
    resource_type: item.resource_type,
    scope_kind: item.scope_kind,
    region: item.region,
    native_id: item.native_id,
    arn: item.arn,
    name: item.name,
    state: "ACTIVE",                       // listed by AWS at observed_at; the Evidence section says it is basic
    observation: { configuration_hash: null, last_verified_at: null },
    observed_incarnation: { status: "BASIC" },
    assignment: { status: "NOT_EVALUATED" },
    eligibility: { selectable: false, reason: "BASIC_ONLY" },
    details,
  }
}

/** What the drawer says about a BASIC row's evidence and details. */
export interface BasicEvidence {
  observedAt: string | null
  sourceApi: string | null
  detailsStatus: string
}

export function basicEvidence(item: BasicItem): BasicEvidence {
  return { observedAt: item.observed_at, sourceApi: item.source_api, detailsStatus: item.details_status }
}

/** A type's state, in words. */
export function typeStateCopy(state: TypeStateName): string {
  return ({
    LISTED: "Listed",
    DISCOVERING: "Discovering",
    PARTIAL: "Partial",
    ACCESS_NEEDED: "Access needed",
    UNREADABLE: "Could not be read",
    UNSUPPORTED: "Not supported yet",
  } as Record<TypeStateName, string>)[state]
}

/** An empty page, in words: an absence is claimed only where it was proved. */
export function emptyPageCopy(state: EmptyState, typeState: TypeState | null): string {
  switch (state) {
    case "complete_empty":
      return "None: every place this was listed returned nothing."
    case "empty_so_far":
      return "None found so far. Discovering…"
    case "empty_unproven":
      return "Nothing could be shown: some resource types could not be read or are not supported yet (see coverage)."
    case "type_unsupported":
      return "This resource type is not supported yet: Cyntro does not list it."
    case "type_unreadable":
      return typeState && typeState.missing_actions.length
        ? `These resources could not be read: access needed (${typeState.missing_actions.join(", ")}).`
        : "These resources could not be read."
  }
}

/** A coverage gap, in words (never "0 resources"). */
export function gapStatusCopy(status: string): string {
  return ({
    ACCESS_DENIED: "Access needed",
    UNSUPPORTED: "Not supported yet",
    PARTIAL: "Partial",
    THROTTLED: "Throttled by AWS",
    FAILED: "Could not be listed",
  } as Record<string, string>)[status] ?? status
}

/** Gaps a retry can repair: a listing refused for access (the customer may have granted it since), throttled, or failed --
 *  the backend re-opens exactly those of its scopes that committed nothing. A partial listing (rows committed) is not. */
export const RETRYABLE_GAP_STATUSES: ReadonlySet<string> = new Set(["ACCESS_DENIED", "THROTTLED", "FAILED"])

/** Whether Retry is offered for a run: its start message is held by a named blocker, or it finished with a retryable gap. */
export function discoveryRetryable(status: DiscoveryStatus): boolean {
  if (!status.runId || !status.registrationId) return false
  if (status.dispatch !== null && status.dispatch.state !== "SENT" && status.dispatch.blocker) return true
  return status.coverageState === "COMPLETE_WITH_GAPS"
    && status.gaps.some((gap) => gap.resource_type !== "regions" && RETRYABLE_GAP_STATUSES.has(gap.status))
}

/** The proxied route of a discovery retry (backend POST /api/admin/accounts/{id}/discovery-retry). */
export function discoveryRetryPath(accountId: string, customerId: string): string {
  return `/api/proxy/admin/accounts/${encodeURIComponent(accountId)}/discovery-retry?customer_id=${encodeURIComponent(customerId)}`
}

/** The backend's code for an install whose web has no account registry: it serves no registration, so no discovery run. */
export const ACCOUNT_REGISTRY_UNCONFIGURED = "ACCOUNT_REGISTRY_UNCONFIGURED"

/**
 * A status answer that is not a run, and which reader it leaves the account with. No run (NOT_REQUESTED), a refusal, an
 * older backend without the route (its 404 is malformed here), an install without an account registry: the PUBLISHED
 * reader, exactly as before discovery. A network failure or any other 5xx: "unavailable", named, with a retry -- it proves
 * nothing about whether a run exists, so it neither falls back nor shows anything.
 */
export function statusFallback(outcome: ResourcesOutcome): "published" | "unavailable" {
  const failed = outcome.status === 0 || outcome.status >= 500
  return failed && outcome.reasonCode !== ACCOUNT_REGISTRY_UNCONFIGURED ? "unavailable" : "published"
}

export type ResourcesFetcher = (accountId: string, request: { resourceType: string | null; cursor: string | null; limit?: number },
  signal?: AbortSignal) => Promise<{ status: number; body: unknown }>
export type DiscoveryFetcher = (accountId: string, signal?: AbortSignal) => Promise<{ status: number; body: unknown }>

async function read(url: string, signal?: AbortSignal): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, { cache: "no-store", signal })
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  return { status: response.status, body }
}

export const fetchResourcesPage: ResourcesFetcher = (accountId, request, signal) => {
  const query = new URLSearchParams()
  if (request.resourceType !== null) query.set("resource_type", request.resourceType)
  if (request.cursor !== null) query.set("cursor", request.cursor)
  if (request.limit !== undefined) query.set("limit", String(request.limit))
  const suffix = query.toString()
  return read(`/api/proxy/accounts/${encodeURIComponent(accountId)}/resources${suffix ? `?${suffix}` : ""}`, signal)
}

export const fetchDiscovery: DiscoveryFetcher = (accountId, signal) =>
  read(`/api/proxy/accounts/${encodeURIComponent(accountId)}/discovery`, signal)
