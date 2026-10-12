/**
 * Typed client for the resumable System setup (onboarding G2) -- the contract of saferemediate-backend
 * claude/onboarding-g2-setup (unified/system_boundary_setup.py, api/system_boundary.py /setup routes; the answers are the
 * producer captures in __tests__/fixtures/system-boundary-setup-captures/). Reached only through this console's named proxy
 * (lib/server/authoring-proxy.ts). No React here.
 *
 * A setup records what a person INTENDS; nothing here is a source connection, a coverage claim or an applied System:
 *  - the browser sends choices and references (kind + key) only. Resolution, status axes, required facts and consequences
 *    are the server's (``dispositions_derived``); sending any of them is refused FIELD_NOT_AUTHORED;
 *  - Finish commits through the existing guarded save in ONE transaction with the setup's receipt; nothing is dispatched.
 * Writes are answered SAVED (this request, or its replay), REFUSED (by name), or RESEND_SAME when nothing proves what
 * happened -- resend the SAME request id and body, never a new one.
 */
import { AUTHORING_BASE } from "@/lib/system-boundary-authoring"

/** The ``system_boundary_setup`` release contract this client speaks and reads (lib/release-contract.json requires and
 *  accepts it; backend unified/system_boundary_setup.SETUP_CONTRACT_LEVEL). Level 2 (onboarding G3-A): every success answer
 *  carries exactly ``contract: system_boundary_setup/v2`` and a finished setup's status lists its OWNER REQUESTS. An answer
 *  without that exact tag -- an untagged level-1 answer, or any other level -- is not one this frontend reads: never parsed
 *  as level 2. The bundle builder refuses such a pair; this is the same rule at runtime. */
export const SETUP_CONTRACT_LEVEL = 2
export const SETUP_CONTRACT = `system_boundary_setup/v${SETUP_CONTRACT_LEVEL}`
export const SETUP_CONTRACT_UNKNOWN = "SETUP_CONTRACT_UNKNOWN"

/** Rev 7 section 6.2 -- the eight steps, in order (Inventory is context, not a step). Same spelling as the backend. */
export const SETUP_STEPS = [
  "system_details",
  "deployments",
  "code_and_infrastructure",
  "resource_boundaries",
  "required_data",
  "historical_data",
  "review_and_start",
  "progress_and_results",
] as const
export type SetupStep = (typeof SETUP_STEPS)[number]

export const STEP_TITLES: Record<SetupStep, string> = {
  system_details: "System details",
  deployments: "Deployments",
  code_and_infrastructure: "Code and infrastructure",
  resource_boundaries: "Resource boundaries",
  required_data: "Required data",
  historical_data: "Historical data",
  review_and_start: "Review and start",
  progress_and_results: "Progress and results",
}

export const CHOICES = ["use_existing", "requested", "deferred", "not_used", "no_history", "connect_later"] as const
export type Choice = (typeof CHOICES)[number]
export const REF_KINDS = ["stack_binding", "account_source", "archive", "repository", "terraform_state"] as const
export type RefKind = (typeof REF_KINDS)[number]

/** What the person authors for one subject: NEVER a status, a fact or a consequence. */
export interface AuthoredDisposition {
  subject: string
  scope: { account_id: string; region?: string }
  choice: Choice
  reason_code: string
  reason_text?: string
  ref?: { kind: RefKind; key: string }
}

/** The server's reading of one disposition, under the CURRENT person and registration. */
export interface DerivedDisposition {
  subject: string
  scope: { account_id: string; region?: string }
  choice: Choice
  resolution: { state: "resolved" | "assessed" | "held" | "unavailable" | "none"; reason?: string | null; registration_id?: string;
                proof?: Record<string, unknown> }
  status_axes: Record<"assessment" | "configuration" | "readability" | "acquisition" | "serving", string>
  required_facts: string
  consequence: string[]
}

export interface SetupIntent {
  declaration?: Record<string, unknown>
  correction?: Record<string, unknown>
  dispositions: AuthoredDisposition[]
  resume_step: SetupStep
}

export interface Association {
  completed_revision: number
  system: { key: string; version: number }
  deployments: { key: string; version: number }[]
}

export interface SetupSummary {
  setup_id: string
  status: "DRAFT" | "FINISHING" | "FINISHED" | "CANCELLED" | "SUPERSEDED"
  mode: "create" | "correct"
  owner: string
  state_version: number
  intent_revision: number
  current_attempt: number
  accounts_seen: string[]
  created_at: string
  updated_at: string
  predecessor: { setup_id: string; attempt: number; state_version: number } | null
  successor: string | null
  association: Association | null
}

export interface SetupView extends SetupSummary {
  intent: SetupIntent
  dispositions_derived: DerivedDisposition[]
  attempt: Record<string, unknown> | null
  outcome: { outcome: string; code: string; reconciled_by: string } | null
  receipt: (Record<string, unknown> & { association: Association; attempt: number }) | null
  reconciliation: { state: string; attempt: number; recover_after: string; reason?: string } | null
  replayed?: boolean
}

/** (Level 2, G3-A) What a request is NOW, as the backend derives it from the current registry and grants. */
export const REQUEST_STATES = ["PLANNED", "PENDING", "HELD", "WITHDRAWN", "SUPERSEDED"] as const
export type RequestState = (typeof REQUEST_STATES)[number]

/** One owner request: a "requested" source an account administrator -- not this setup -- may establish. PLANNED: what
 *  finishing the saved intent will request (nothing has been asked yet). Otherwise made at Finish, with its current state,
 *  the demand it belongs to (the same source in the same account, across Systems) and its fulfilment (not available yet). */
export interface OwnerRequest {
  op_id: string
  kind: "owner_request"
  subject: string
  scope: { account_id: string; region?: string }
  required_authority: string
  state: RequestState
  reason: string | null
  requested_by?: string
  requested_at?: string
  superseded?: { by: string; at: string } | null
  demand?: { state: "PENDING" | "NO_CURRENT_REQUEST"; current_requests: number }
  fulfilment?: { state: string; reason: string }
}

export interface SetupStatus {
  setup: Pick<SetupSummary, "setup_id" | "status" | "mode" | "state_version" | "intent_revision" | "current_attempt" | "predecessor" | "successor">
  saved: { completed_revision: number; written_at: string } | null
  association: { state: "CURRENT" | "STALE" | "WITHDRAWN"; completed_revision: number;
                 heads: { role: string; key: string; pinned_version: number; current_version: number | null; state: string }[] } | null
  dispositions: DerivedDisposition[]
  operations: OwnerRequest[]
}

export type SetupRead<T> =
  | { kind: "OK"; value: T }
  | { kind: "REFUSED"; status: number; code: string; detail: Record<string, unknown> }
  | { kind: "UNAVAILABLE"; status: number | null; code: string }

export type SetupWrite =
  | { kind: "SAVED"; status: number; view: SetupView }
  | { kind: "REFUSED"; status: number; code: string; detail: Record<string, unknown> }
  | { kind: "RESEND_SAME"; status: number | null; code: string; detail: Record<string, unknown> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const STATUSES = ["DRAFT", "FINISHING", "FINISHED", "CANCELLED", "SUPERSEDED"]
const RESEND_CODES = new Set(["OUTCOME_UNKNOWN", "TRANSACTION_CONFLICT", "STORE_THROTTLED", "AUTHORING_BACKEND_UNAVAILABLE"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const isInt = (value: unknown): value is number => Number.isInteger(value)

function isAssociation(value: unknown): value is Association {
  return isRecord(value) && isInt(value.completed_revision) && isRecord(value.system) && typeof value.system.key === "string"
    && isInt(value.system.version) && Array.isArray(value.deployments)
    && value.deployments.every((d) => isRecord(d) && typeof d.key === "string" && isInt(d.version))
}

export function isSummary(value: unknown): value is SetupSummary {
  return isRecord(value) && typeof value.setup_id === "string" && UUID.test(value.setup_id)
    && typeof value.status === "string" && STATUSES.includes(value.status)
    && (value.mode === "create" || value.mode === "correct") && typeof value.owner === "string"
    && isInt(value.state_version) && isInt(value.intent_revision) && isInt(value.current_attempt)
    && Array.isArray(value.accounts_seen) && value.accounts_seen.every((a) => typeof a === "string")
    && (value.association === null || isAssociation(value.association))
    && (value.predecessor === null || isRecord(value.predecessor)) && (value.successor === null || typeof value.successor === "string")
}

function isDerived(value: unknown): value is DerivedDisposition {
  return isRecord(value) && typeof value.subject === "string" && isRecord(value.scope) && typeof value.choice === "string"
    && isRecord(value.resolution) && typeof value.resolution.state === "string" && isRecord(value.status_axes)
    && typeof value.required_facts === "string" && Array.isArray(value.consequence)
}

export function isView(value: unknown): value is SetupView {
  if (!isSummary(value)) return false
  const view = value as unknown as Record<string, unknown>
  const intent = view.intent
  return isRecord(intent) && Array.isArray(intent.dispositions) && typeof intent.resume_step === "string"
    && (SETUP_STEPS as readonly string[]).includes(intent.resume_step)
    && Array.isArray(view.dispositions_derived) && view.dispositions_derived.every(isDerived)
    && (view.receipt === null || (isRecord(view.receipt) && isAssociation(view.receipt.association)))
}

export function isOperation(value: unknown): value is OwnerRequest {
  if (!isRecord(value) || typeof value.op_id !== "string" || !/^[0-9a-f]{64}$/.test(value.op_id) || value.kind !== "owner_request"
      || typeof value.subject !== "string" || !isRecord(value.scope) || typeof value.scope.account_id !== "string"
      || !/^[0-9]{12}$/.test(value.scope.account_id) || (value.scope.region !== undefined && typeof value.scope.region !== "string")
      || typeof value.required_authority !== "string" || typeof value.state !== "string"
      || !(REQUEST_STATES as readonly string[]).includes(value.state) || (value.reason !== null && typeof value.reason !== "string")) {
    return false
  }
  if (value.state === "PLANNED") return value.requested_by === undefined && value.demand === undefined
  const demand = value.demand
  // The demand's facts must agree with each other and with this request: it stands (PENDING) exactly while some current
  // request counts, and a PENDING request is one of them. Only a SUPERSEDED request names what superseded it.
  return typeof value.requested_by === "string" && typeof value.requested_at === "string" && isRecord(demand)
    && (demand.state === "PENDING" || demand.state === "NO_CURRENT_REQUEST") && isInt(demand.current_requests)
    && demand.current_requests >= 0 && (demand.state === "PENDING") === (demand.current_requests > 0)
    && (value.state !== "PENDING" || demand.state === "PENDING")
    && isRecord(value.fulfilment) && typeof value.fulfilment.state === "string"
    && (value.state === "SUPERSEDED"
      ? isRecord(value.superseded) && typeof value.superseded.by === "string"
      : value.superseded === null)
}

export function isStatus(value: unknown): value is SetupStatus {
  return isRecord(value) && isRecord(value.setup) && typeof value.setup.setup_id === "string"
    && (value.saved === null || (isRecord(value.saved) && isInt(value.saved.completed_revision)))
    && (value.association === null || (isRecord(value.association) && typeof value.association.state === "string"))
    && Array.isArray(value.dispositions) && Array.isArray(value.operations) && value.operations.every(isOperation)
}

const isPage = (value: unknown): value is { setups: SetupSummary[]; next_cursor: string | null } =>
  isRecord(value) && Array.isArray(value.setups) && value.setups.every(isSummary)
  && (value.next_cursor === null || typeof value.next_cursor === "string")

type Raw = { status: number | null; json: unknown }

async function call(path: string, init: RequestInit = {}): Promise<Raw> {
  let response: Response
  try {
    response = await fetch(`${AUTHORING_BASE}/${path}`, { ...init, cache: "no-store", credentials: "same-origin" })
  } catch {
    return { status: null, json: undefined }
  }
  try {
    return { status: response.status, json: await response.json() }
  } catch {
    return { status: response.status, json: undefined }
  }
}

function refusal(json: unknown): { code: string; detail: Record<string, unknown> } | null {
  if (!isRecord(json) || !isRecord(json.detail) || typeof json.detail.code !== "string") return null
  const { code, ...detail } = json.detail
  return { code, detail }
}

/** A 200/201 answer that is not tagged exactly with this frontend's setup contract: not one it reads. */
const foreign = (json: unknown): boolean => !isRecord(json) || json.contract !== SETUP_CONTRACT

/** One read's answer, parsed by ``valid``; a malformed 200 is UNAVAILABLE, never a guessed value. */
export function readAnswer<T>(raw: Raw, valid: (json: unknown) => json is T): SetupRead<T> {
  if (raw.status === null) return { kind: "UNAVAILABLE", status: null, code: "NETWORK_ERROR" }
  if (raw.status === 200 && foreign(raw.json)) return { kind: "UNAVAILABLE", status: 200, code: SETUP_CONTRACT_UNKNOWN }
  if (raw.status === 200) {
    return valid(raw.json) ? { kind: "OK", value: raw.json } : { kind: "UNAVAILABLE", status: 200, code: "MALFORMED_RESPONSE" }
  }
  const named = refusal(raw.json)
  if (!named) return { kind: "UNAVAILABLE", status: raw.status, code: "MALFORMED_RESPONSE" }
  if (named.code === "AUTHORING_BACKEND_UNAVAILABLE") return { kind: "UNAVAILABLE", status: raw.status, code: named.code }
  return { kind: "REFUSED", status: raw.status, ...named }
}

/** One write's answer: SAVED only for a 200 / 201 that is a whole setup view; a 202 (an attempt whose save is unproven)
 *  is RESEND_SAME with the view, so the caller resends the same Finish. */
export function writeAnswer(raw: Raw): SetupWrite {
  if (raw.status === null) return { kind: "RESEND_SAME", status: null, code: "NETWORK_ERROR", detail: {} }
  if ((raw.status === 200 || raw.status === 201) && foreign(raw.json)) {
    // The write may have happened, but this answer is not one this frontend reads: never SAVED on a guess.
    return { kind: "RESEND_SAME", status: raw.status, code: SETUP_CONTRACT_UNKNOWN, detail: {} }
  }
  if (raw.status === 200 || raw.status === 201) {
    return isView(raw.json) ? { kind: "SAVED", status: raw.status, view: raw.json }
      : { kind: "RESEND_SAME", status: raw.status, code: "MALFORMED_RESPONSE", detail: {} }
  }
  if (raw.status === 202) {
    return { kind: "RESEND_SAME", status: 202, code: "OUTCOME_UNKNOWN", detail: isRecord(raw.json) ? raw.json : {} }
  }
  const named = refusal(raw.json)
  if (!named) return { kind: "RESEND_SAME", status: raw.status, code: "MALFORMED_RESPONSE", detail: {} }
  if (RESEND_CODES.has(named.code)) return { kind: "RESEND_SAME", status: raw.status, ...named }
  return { kind: "REFUSED", status: raw.status, ...named }
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) }
}

export function freshRequestId(): string {
  return globalThis.crypto.randomUUID()
}

const path = (setupId: string, suffix = "") => `setup/${encodeURIComponent(setupId)}${suffix}`

export async function createSetup(requestId: string): Promise<SetupWrite> {
  return writeAnswer(await call("setup", json("POST", { request_id: requestId })))
}

export async function updateSetup(setupId: string, requestId: string, baseStateVersion: number, steps: SetupIntent): Promise<SetupWrite> {
  return writeAnswer(await call(path(setupId), json("PUT", { request_id: requestId, base_state_version: baseStateVersion, steps })))
}

export async function finishSetup(setupId: string, requestId: string, baseStateVersion: number): Promise<SetupWrite> {
  return writeAnswer(await call(path(setupId, "/finish"), json("POST", { request_id: requestId, base_state_version: baseStateVersion })))
}

export async function cancelSetup(setupId: string, requestId: string, baseStateVersion: number): Promise<SetupWrite> {
  return writeAnswer(await call(path(setupId, "/cancel"), json("POST", { request_id: requestId, base_state_version: baseStateVersion })))
}

export async function amendSetup(setupId: string, requestId: string): Promise<SetupWrite> {
  return writeAnswer(await call(path(setupId, "/amend"), json("POST", { request_id: requestId })))
}

export async function readSetup(setupId: string): Promise<SetupRead<SetupView>> {
  return readAnswer(await call(path(setupId), { headers: { Accept: "application/json" } }), isView)
}

export async function readSetupStatus(setupId: string): Promise<SetupRead<SetupStatus>> {
  return readAnswer(await call(path(setupId, "/status"), { headers: { Accept: "application/json" } }), isStatus)
}

export async function listSetups(cursor: string | null = null): Promise<SetupRead<{ setups: SetupSummary[]; next_cursor: string | null }>> {
  const suffix = cursor ? `?${new URLSearchParams({ cursor }).toString()}` : ""
  return readAnswer(await call(`setup/list${suffix}`, { headers: { Accept: "application/json" } }), isPage)
}

/** The system id the result view takes, from a finished setup's association (``SYSTEM#<id>``), or null. */
export function associatedSystemId(association: Association | null): string | null {
  const key = association?.system.key ?? ""
  return key.startsWith("SYSTEM#") && key.length > "SYSTEM#".length ? key.slice("SYSTEM#".length) : null
}

/** Words for one derived disposition: what the server found, never a claim the browser makes. */
export function derivedSentence(derived: DerivedDisposition): string {
  const reason = derived.resolution.reason ? ` (${derived.resolution.reason})` : ""
  const limit = derived.consequence.length ? ` -- ${derived.consequence.join(", ")}` : ""
  switch (derived.resolution.state) {
    case "resolved": return `Found${limit}`
    case "assessed": return `Assessed only, not connected${reason}${limit}`
    case "held": return `Held${reason}${limit}`
    case "unavailable": return `Not available in this release${reason}${limit}`
    default: return `No source chosen${reason}${limit}`
  }
}

/** One owner request in words: who is asked, and what it is NOW (the backend's state and reason, never inferred here). */
export function requestSentence(op: OwnerRequest): string {
  const reason = op.reason ? ` (${op.reason})` : ""
  const others = op.demand && op.demand.current_requests > 1 ? ` · ${op.demand.current_requests} current requests for it in all` : ""
  switch (op.state) {
    case "PLANNED": return "Will be requested from an account administrator when you finish -- nothing is asked before"
    case "PENDING":
      return `Requested from an account administrator -- waiting; this setup has not connected or changed the source, and other changes in the account are not known here${others}`
    case "HELD":
      if (op.reason === "REGISTRATION_CHANGED") return `On hold -- the account was registered again since it was requested; amend this setup to ask again${reason}`
      if (op.reason === "REQUESTER_AUTHORITY_REVOKED") return `On hold -- the person who requested it may no longer author for this account${reason}`
      return `On hold -- its account cannot be checked now${reason}`
    case "WITHDRAWN":
      return op.reason === "ACCOUNT_REMOVED" ? `Withdrawn -- the account was removed from Cyntro${reason}`
        : `Withdrawn -- the account is not registered${reason}`
    default: return `Superseded by a later version of this setup${op.demand?.state === "PENDING" ? " -- still requested elsewhere" : ""}`
  }
}

/** The setup refusal codes the steps explain in words. */
export const SETUP_CODES = {
  incomplete: "SETUP_INCOMPLETE",
  notOwner: "SETUP_NOT_OWNER",
  finishing: "SETUP_FINISHING",
  versionConflict: "VERSION_CONFLICT",
  forged: "FIELD_NOT_AUTHORED",
} as const
