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
import { contentHash } from "@/lib/content-hash"
import { pairDeployments, type PairedDeployment } from "@/lib/system-boundary-deployment-context"

/** The ``system_boundary_setup`` release contract this client speaks and reads (lib/release-contract.json requires and
 *  accepts it; backend unified/system_boundary_setup.SETUP_CONTRACT_LEVEL). Level 2 (onboarding G3-A): every success answer
 *  carries exactly ``contract: system_boundary_setup/v2`` and a finished setup's status lists its OWNER REQUESTS. An answer
 *  without that exact tag -- an untagged level-1 answer, or any other level -- is not one this frontend reads: never parsed
 *  as level 2. The bundle builder refuses such a pair; this is the same rule at runtime. Level 3: ``required_facts`` is typed
 *  from the backend's versioned requirement profile (``RequiredFacts``) and every view serves that profile once
 *  (``requirement_profile``); a v2-tagged answer is now another level, refused like a v1 one. Level 4 (S1a): the draft preview
 *  (lib/system-boundary-setup-preview.ts) and a Finish that names the preview the person reviewed (``preview_digest``), whose
 *  receipt pins it (``receipt.preview``); a v3-tagged answer is now another level. */
export const SETUP_CONTRACT_REQUIRED = 4
/** (S1b) Level 5: the PLURAL setup -- an intent whose declaration carries ``deployments``, dispositions scoped to a Deployment
 *  (``scope.deployment``), a receipt pinning every Deployment and ``result_scope`` v2. This client reads level 4 AND level 5
 *  answers (lib/release-contract.json requires 4, accepts 5); a plural shape in a level-4 answer is no answer at all. */
export const SETUP_CONTRACT_LEVEL = 5
export const SETUP_CONTRACT = `system_boundary_setup/v${SETUP_CONTRACT_LEVEL}`
const SETUP_LEVELS: ReadonlyMap<unknown, number> = new Map([
  [`system_boundary_setup/v${SETUP_CONTRACT_REQUIRED}`, SETUP_CONTRACT_REQUIRED], [SETUP_CONTRACT, SETUP_CONTRACT_LEVEL],
])
/** The setup level an answer is tagged with, when it is one this client reads; else null. */
export function setupLevelOf(json: unknown): number | null {
  return isRecord(json) ? (SETUP_LEVELS.get(json.contract) ?? null) : null
}
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
  /** (S1b, level 5) ``deployment``: the ``deployment_key`` a code / iac disposition of a plural intent belongs to. */
  scope: { account_id: string; region?: string; deployment?: string }
  choice: Choice
  reason_code: string
  reason_text?: string
  ref?: { kind: RefKind; key: string }
}

/** The server's reading of one disposition, under the CURRENT person and registration. */
export interface DerivedDisposition {
  subject: string
  scope: { account_id: string; region?: string; deployment?: string }
  choice: Choice
  resolution: { state: "resolved" | "assessed" | "held" | "unavailable" | "none"; reason?: string | null; registration_id?: string;
                proof?: Record<string, unknown> }
  status_axes: Record<"assessment" | "configuration" | "readability" | "acquisition" | "serving", string>
  required_facts: RequiredFacts
  consequence: string[]
}

/** (Level 3) What the versioned requirement profile says of one disposition's subject at its scope: SUPPORTED (its needs
 *  are the served profile's entry for the subject) or UNSUPPORTED with the backend's named reason. The profile is named once,
 *  beside the dispositions (``requirement_profile``). Never a grant, never a claim that anything is connected. */
export interface RequiredFacts {
  support: "SUPPORTED" | "UNSUPPORTED"
  reason: string | null
}

/** One subject of the requirement profile document (backend unified/requirement_profile.py, by reference only). */
export interface ProfileSubject {
  subject: string
  support: "SUPPORTED" | "UNSUPPORTED"
  reason: string | null
  scope: string[]
  evidence: { source: string; scope: string[] } | null
  permission: { template: string; role: string; policies: string[]; condition: string | null; owner_parameters: string[] } | null
}

/** The profile a view's required facts were decided under: its content hash and its document. */
export interface RequirementProfile {
  hash: string
  document: { schema: "cyntro-requirement-profile/v1"; subjects: ProfileSubject[] }
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

/** (Level 4) A preview digest: the backend's canonical content hash. */
export const PREVIEW_DIGEST = /^v1:[0-9a-f]{64}$/

/** (Level 4) What a Finish that rested on a preview pinned in its receipt: the preview's identity and FULL counts as reviewed
 *  -- historical ("proposed at Finish"), never the applied membership. A receipt without it was not previewed. */
export interface PreviewPin {
  preview_digest: string
  basis_digest: string
  result_digest: string
  authored_revision: number
  counts: { members: number; dependencies: number; held: number; not_members: number; stale_members: number; unlisted: number }
  admission: Record<string, unknown>
}

/** (S1a R7) The accounts a finished setup's result is read in: the committed Deployment at the version its receipt pinned
 *  (``from``), or why they cannot be named. A decoration beside the receipt; null before a receipt exists. */
export type ResultScope =
  | { v: 1; state: "SERVED"; accounts: string[]; from: { key: string; version: number } }
  | { v: 1; state: "UNAVAILABLE"; reason: string; from?: { key: string; version: number } }
  /** (S1b, level 5) Version 2, for a PLURAL receipt: every pinned Deployment, in the association's order; withheld WHOLE when
   *  any one cannot be read, naming the first that failed. */
  | { v: 2; state: "SERVED"; accounts: string[]; from: { key: string; version: number }[] }
  | { v: 2; state: "UNAVAILABLE"; reason: string; from: { key: string; version: number }[]; failed?: { key: string; version: number } }

export interface SetupView extends SetupSummary {
  intent: SetupIntent
  dispositions_derived: DerivedDisposition[]
  requirement_profile: RequirementProfile
  attempt: Record<string, unknown> | null
  outcome: { outcome: string; code: string; reconciled_by: string } | null
  receipt: (Record<string, unknown> & { association: Association; attempt: number; preview?: PreviewPin }) | null
  result_scope: ResultScope | null
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
  observation?: Observation
}

/** (G3-C.5) One pinned fact of committed collection evidence, exactly as the published coverage row spells it. */
export interface EvidenceFact {
  source: string
  region: string
  source_scope: string
  earliest_verified_at: string
  earliest_verified_basis: string
  first_verified_collection_at: string | null
  verified_through: string
  committed_generation: number
  head_manifest_hash: string
}
export interface EvidenceScope { region: string; source_scope: string; reason: string | null }
export interface UnresolvedScope extends EvidenceScope { status: string }
export interface EvidencePublication { read_model_generation: string | null; published_at_epoch: number | null }

/** (G3-C.5) What committed collection evidence shows for a made request's source -- the backend's own answer, read
 *  exactly. OBSERVED supports only the pinned facts it lists; NOT_OBSERVED is "nothing committed in that exact scope as
 *  of"; UNKNOWN names why nothing can be said. None of them is fulfilment, use, non-use, ownership or dispatch. */
export type Observation =
  | { state: "OBSERVED"; as_of: string; registration_id: string; facts: EvidenceFact[]; not_started: EvidenceScope[];
      publication?: EvidencePublication }
  | { state: "NOT_OBSERVED"; as_of: string; scope: { account_id: string; region: string; source: string; source_scopes: string[] };
      publication?: EvidencePublication }
  | { state: "UNKNOWN"; limitation: string; as_of?: string; facts?: EvidenceFact[]; unresolved?: UnresolvedScope[];
      not_started?: EvidenceScope[]; code?: string; hold_reason?: string; publication?: EvidencePublication }

/** The limitation a not-current request carries (the backend reads no evidence for it). */
export const OBSERVATION_REQUEST_NOT_CURRENT = "REQUEST_NOT_CURRENT"
/** The only subjects collected evidence can speak for, each with the ONE published source that is its evidence -- the
 *  backend's own mapping (unified/owner_request_resolution.SUBJECT_SOURCES). Any other subject's answer is UNKNOWN. */
export const SUBJECT_SOURCES: Readonly<Record<string, string>> = { "history:cloudtrail": "cloudtrail_iam_usage",
                                                                   "history:vpc_flow": "vpc_flow" }

export interface SetupStatus {
  setup: Pick<SetupSummary, "setup_id" | "status" | "mode" | "state_version" | "intent_revision" | "current_attempt" | "predecessor" | "successor">
  saved: { completed_revision: number; written_at: string } | null
  association: { state: "CURRENT" | "STALE" | "WITHDRAWN"; completed_revision: number;
                 heads: { role: string; key: string; pinned_version: number; current_version: number | null; state: string }[] } | null
  dispositions: DerivedDisposition[]
  requirement_profile: RequirementProfile
  operations: OwnerRequest[]
  result_scope: ResultScope | null
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

const PROFILE_HASH = /^v1:[0-9a-f]{64}$/
const SUPPORT = ["SUPPORTED", "UNSUPPORTED"] as const
const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === "string" && v.length > 0)
const exactly = (value: Record<string, unknown>, keys: string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((k) => k in value)

function isProfileSubject(value: unknown): value is ProfileSubject {
  if (!isRecord(value) || !exactly(value, ["subject", "support", "reason", "scope", "evidence", "permission"])
      || typeof value.subject !== "string" || !(SUPPORT as readonly unknown[]).includes(value.support) || !isStrings(value.scope)) return false
  if (value.support === "UNSUPPORTED") {
    return typeof value.reason === "string" && value.reason.length > 0 && value.scope.length === 0
      && value.evidence === null && value.permission === null
  }
  const { evidence, permission } = value
  return value.reason === null && isRecord(evidence) && exactly(evidence, ["source", "scope"]) && typeof evidence.source === "string"
    && evidence.source.length > 0 && isStrings(evidence.scope)
    && isRecord(permission) && exactly(permission, ["template", "role", "policies", "condition", "owner_parameters"])
    && typeof permission.template === "string" && typeof permission.role === "string" && isStrings(permission.policies)
    && permission.policies.length > 0 && (permission.condition === null || typeof permission.condition === "string")
    && isStrings(permission.owner_parameters) && (permission.condition === null) === (permission.owner_parameters.length === 0)
}

function isRequirementProfile(value: unknown): value is RequirementProfile {
  if (!isRecord(value) || !exactly(value, ["hash", "document"]) || typeof value.hash !== "string" || !PROFILE_HASH.test(value.hash)
      || !isRecord(value.document) || !exactly(value.document, ["schema", "subjects"])
      || value.document.schema !== "cyntro-requirement-profile/v1"
      || !Array.isArray(value.document.subjects) || !value.document.subjects.every(isProfileSubject)) return false
  const subjects = value.document.subjects.map((s) => s.subject)
  if (new Set(subjects).size !== subjects.length) return false
  // (F28) the document IS the one the hash names -- canonical JSON, the backend's own content hash. The exact shape above
  // admits only strings, string lists, nulls and records, all of which canonical JSON states exactly: it cannot throw here.
  return contentHash(value.document) === value.hash
}

function isDerived(value: unknown): value is DerivedDisposition {
  return isRecord(value) && typeof value.subject === "string" && isRecord(value.scope) && typeof value.choice === "string"
    && isRecord(value.resolution) && typeof value.resolution.state === "string" && isRecord(value.status_axes)
    && Array.isArray(value.consequence)
}

/** (F29) What THE served profile says of ``subject`` at ``scope`` -- the backend's rule (unified/requirement_profile.py
 *  ``requirement``): its entry; a SUPPORTED entry asked without a scope key it needs is SCOPE_INCOMPLETE:<keys>; a subject
 *  the profile does not list is LIVE_SOURCE_NOT_PROFILED (a live source) or SUBJECT_NOT_PROFILED. */
export function expectedFacts(subject: string, scope: Record<string, unknown>, profile: RequirementProfile): RequiredFacts {
  const entry = profile.document.subjects.find((s) => s.subject === subject)
  if (!entry) return { support: "UNSUPPORTED", reason: subject.startsWith("live_source:") ? "LIVE_SOURCE_NOT_PROFILED" : "SUBJECT_NOT_PROFILED" }
  if (entry.support === "UNSUPPORTED") return { support: "UNSUPPORTED", reason: entry.reason }
  const missing = entry.scope.filter((key) => !(typeof scope[key] === "string" && (scope[key] as string).length > 0))
  return missing.length ? { support: "UNSUPPORTED", reason: `SCOPE_INCOMPLETE:${missing.join(",")}` } : { support: "SUPPORTED", reason: null }
}

/** Every derived disposition's ``required_facts`` is EXACTLY ``{support, reason}`` and says exactly what the served
 *  (hash-bound) profile says of its subject at its scope -- the one check of that field: a level-2 string, a per-disposition
 *  hash or any other shape is not level 3. */
function coherentFacts(derived: DerivedDisposition[], profile: RequirementProfile): boolean {
  return derived.every((d) => {
    const facts: unknown = d.required_facts
    const expected = expectedFacts(d.subject, d.scope as Record<string, unknown>, profile)
    return isRecord(facts) && exactly(facts, ["support", "reason"])
      && facts.support === expected.support && facts.reason === expected.reason
  })
}

const PIN_COUNTS = ["members", "dependencies", "held", "not_members", "stale_members", "unlisted"]

/** (Level 4) A receipt's preview pin, read exactly: three digests, the authored revision it rested on, its full counts. */
export function isPreviewPin(value: unknown): value is PreviewPin {
  return isRecord(value) && exactly(value, ["preview_digest", "basis_digest", "result_digest", "authored_revision", "counts", "admission"])
    && [value.preview_digest, value.basis_digest, value.result_digest].every((d) => typeof d === "string" && PREVIEW_DIGEST.test(d))
    && isInt(value.authored_revision) && value.authored_revision >= 0 && isRecord(value.admission)
    && isRecord(value.counts) && exactly(value.counts, PIN_COUNTS)
    && PIN_COUNTS.every((k) => isInt((value.counts as Record<string, unknown>)[k]) && ((value.counts as Record<string, number>)[k] >= 0))
}

const isSource = (value: unknown): boolean =>
  isRecord(value) && exactly(value, ["key", "version"]) && typeof value.key === "string" && value.key.startsWith("DEPLOYMENT#")
  && isInt(value.version) && value.version >= 1

/** (S1a R7) A result scope read exactly: SERVED names 12-digit accounts (sorted, distinct) and the pinned Deployment; else
 *  UNAVAILABLE with its reason. Present on every level-4 view and status (null before a receipt). */
export function isResultScope(value: unknown): value is ResultScope {
  if (isRecord(value) && value.v === 2) return isResultScopeV2(value)
  if (!isRecord(value) || value.v !== 1) return false
  if (value.state === "SERVED") {
    const accounts = value.accounts
    return exactly(value, ["v", "state", "accounts", "from"]) && Array.isArray(accounts) && accounts.length > 0
      && accounts.every((a) => typeof a === "string" && /^[0-9]{12}$/.test(a))
      && accounts.every((a, i) => i === 0 || (accounts[i - 1] as string) < a) && isSource(value.from)
  }
  return value.state === "UNAVAILABLE" && typeof value.reason === "string" && value.reason.length > 0
    && (exactly(value, ["v", "state", "reason"]) || (exactly(value, ["v", "state", "reason", "from"]) && isSource(value.from)))
}

const isAccounts = (accounts: unknown): accounts is string[] =>
  Array.isArray(accounts) && accounts.length > 0 && accounts.every((a) => typeof a === "string" && /^[0-9]{12}$/.test(a))
  && accounts.every((a, i) => i === 0 || (accounts[i - 1] as string) < a)

/** (S1b) Version 2 read exactly: SERVED names sorted, distinct accounts and EVERY pinned Deployment (a non-empty list of
 *  distinct sources); UNAVAILABLE names its reason, the same list and, when one failed, which (one of them). */
function isResultScopeV2(value: Record<string, unknown>): boolean {
  const from = value.from
  if (!Array.isArray(from) || !from.every(isSource) || new Set(from.map((s) => (s as { key: string }).key)).size !== from.length) {
    return false
  }
  if (value.state === "SERVED") return exactly(value, ["v", "state", "accounts", "from"]) && from.length > 0 && isAccounts(value.accounts)
  if (value.state !== "UNAVAILABLE" || typeof value.reason !== "string" || value.reason.length === 0) return false
  if (exactly(value, ["v", "state", "reason", "from"])) return true
  const failed = value.failed as { key?: unknown; version?: unknown } | undefined
  return exactly(value, ["v", "state", "reason", "from", "failed"]) && isSource(failed)
    && from.some((s) => (s as { key: string; version: number }).key === failed?.key
                        && (s as { key: string; version: number }).version === failed?.version)
}

const sameSources = (a: readonly { key: string; version: number }[], b: readonly { key: unknown; version: unknown }[]): boolean =>
  a.length === b.length && a.every((s, i) => s.key === b[i].key && s.version === b[i].version)

/** (S1A-R7-CONTRACT-01) A result scope BOUND to its setup: none without a receipt; with one, its source (when named) is EXACTLY
 *  the receipt's sole pinned Deployment, and a SERVED scope's accounts are the setup's own (``accounts_seen``) -- never a
 *  shape-valid scope of another record or account. UNAVAILABLE without a source (e.g. not exactly one Deployment) stays
 *  readable. */
function boundScope(scope: unknown, receipt: unknown, seen: unknown): boolean {
  if (receipt === null) return scope === null
  if (!isResultScope(scope) || !isRecord(receipt) || !isAssociation(receipt.association)) return false
  const deployments = receipt.association.deployments
  if (scope.v === 2) {          // (S1b) EXACTLY the receipt's pinned Deployments, in its order; SERVED: the setup's own accounts
    return sameSources(scope.from, deployments)
      && (scope.state !== "SERVED" || (Array.isArray(seen) && scope.accounts.every((a) => seen.includes(a))))
  }
  const from = scope.from
  if (from !== undefined && !(deployments.length === 1 && from.key === deployments[0].key && from.version === deployments[0].version)) {
    return false
  }
  return scope.state !== "SERVED" || (Array.isArray(seen) && scope.accounts.every((a) => seen.includes(a)))
}

/** (S1b) Whether an answer carries any PLURAL shape -- a ``deployments`` intent, a Deployment-scoped disposition, a version-2
 *  result scope: only a level-5 answer may. */
function hasPluralShape(intent: Record<string, unknown>, derived: unknown[], scope: unknown): boolean {
  const authored = Array.isArray(intent.dispositions) ? intent.dispositions : []
  return isPluralIntent(intent) || [...authored, ...derived].some((d) => isRecord(d) && isRecord(d.scope) && "deployment" in d.scope)
    || (isRecord(scope) && scope.v === 2)
}

export function isView(value: unknown): value is SetupView {
  if (!isSummary(value)) return false
  const view = value as unknown as Record<string, unknown>
  const intent = view.intent
  if (isRecord(intent) && Array.isArray(view.dispositions_derived) && setupLevelOf(value) !== SETUP_CONTRACT_LEVEL
      && hasPluralShape(intent, view.dispositions_derived, view.result_scope)) return false
  return isRecord(intent) && Array.isArray(intent.dispositions) && typeof intent.resume_step === "string"
    && (SETUP_STEPS as readonly string[]).includes(intent.resume_step)
    && Array.isArray(view.dispositions_derived) && view.dispositions_derived.every(isDerived)
    && isRequirementProfile(view.requirement_profile) && coherentFacts(view.dispositions_derived, view.requirement_profile)
    && (view.receipt === null || (isRecord(view.receipt) && isAssociation(view.receipt.association)
      && (view.receipt.preview === undefined || isPreviewPin(view.receipt.preview))))
    && "result_scope" in view && boundScope(view.result_scope, view.receipt, view.accounts_seen)
}

const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0
const isOptionalText = (value: unknown): boolean => value === undefined || isText(value)

function isFact(value: unknown): value is EvidenceFact {
  return isRecord(value) && isText(value.source) && isText(value.region) && isText(value.source_scope)
    && isText(value.earliest_verified_at) && isText(value.earliest_verified_basis) && isText(value.verified_through)
    && (value.first_verified_collection_at === null || isText(value.first_verified_collection_at))
    && isInt(value.committed_generation) && value.committed_generation >= 1 && isText(value.head_manifest_hash)
}

const isScope = (value: unknown): value is EvidenceScope =>
  isRecord(value) && isText(value.region) && isText(value.source_scope) && (value.reason === null || isText(value.reason))

/** The last second a JavaScript Date can hold (8.64e15 ms): a later or negative epoch cannot be rendered as a time. */
export const MAX_RENDERABLE_EPOCH_SECONDS = 8_640_000_000_000

function isPublication(value: unknown): boolean {
  // (F26) A publication time is read only when it can be shown: a non-negative whole second a Date can hold. Anything else
  // is a malformed answer (the status is refused), never a render that throws.
  return value === undefined || (isRecord(value)
    && (value.read_model_generation === null || isText(value.read_model_generation))
    && (value.published_at_epoch === null || (isInt(value.published_at_epoch) && value.published_at_epoch >= 0
                                              && value.published_at_epoch <= MAX_RENDERABLE_EPOCH_SECONDS)))
}

/** (G3-C.5, F25) An observation read exactly, and coherent with ITS request: evidence is shown only for a current (PENDING)
 *  request, and only of the ONE source its subject maps to (SUBJECT_SOURCES); every fact, absence, not-started and
 *  unresolved scope lies in the request's own account and Region; a not-current request carries exactly its limitation
 *  -- no facts, scopes, publication or time. A subject with no evidence source is only ever UNKNOWN. */
export function isObservation(value: unknown, op: { state: string; subject: string; scope: { account_id: string; region?: string } }): value is Observation {
  if (!isRecord(value)) return false
  const source = SUBJECT_SOURCES[op.subject]
  const region = op.scope.region
  const inRegion = (r: string) => region === undefined || r === region
  const ours = (f: unknown) => isFact(f) && source !== undefined && f.source === source && inRegion(f.region)
  const scoped = (s: unknown) => isScope(s) && inRegion(s.region)
  if (value.state === "UNKNOWN" && value.limitation === OBSERVATION_REQUEST_NOT_CURRENT) {
    return op.state !== "PENDING" && Object.keys(value).length === 2                 // {state, limitation}: nothing was read
  }
  if (op.state !== "PENDING" || !isPublication(value.publication)) return false     // anything else answers a CURRENT request
  if (value.state === "OBSERVED") {
    return isText(value.as_of) && typeof value.registration_id === "string" && /^[0-9a-f]{32}$/.test(value.registration_id)
      && Array.isArray(value.facts) && value.facts.length > 0 && value.facts.every(ours)
      && Array.isArray(value.not_started) && value.not_started.every(scoped)
  }
  if (value.state === "NOT_OBSERVED") {
    const scope = value.scope
    return source !== undefined && region !== undefined && isText(value.as_of) && isRecord(scope)
      && scope.account_id === op.scope.account_id && scope.region === region && scope.source === source
      && Array.isArray(scope.source_scopes) && scope.source_scopes.length > 0 && scope.source_scopes.every(isText)
  }
  if (value.state !== "UNKNOWN" || !isText(value.limitation)) return false
  return isOptionalText(value.as_of) && isOptionalText(value.code) && isOptionalText(value.hold_reason)
    && (value.facts === undefined || (Array.isArray(value.facts) && value.facts.every(ours)))
    && (value.unresolved === undefined || (Array.isArray(value.unresolved)
      && value.unresolved.every((u) => isRecord(u) && scoped(u) && isText(u.status))))
    && (value.not_started === undefined || (Array.isArray(value.not_started) && value.not_started.every(scoped)))
}

export function isOperation(value: unknown): value is OwnerRequest {
  if (!isRecord(value) || typeof value.op_id !== "string" || !/^[0-9a-f]{64}$/.test(value.op_id) || value.kind !== "owner_request"
      || typeof value.subject !== "string" || !isRecord(value.scope) || typeof value.scope.account_id !== "string"
      || !/^[0-9]{12}$/.test(value.scope.account_id) || (value.scope.region !== undefined && typeof value.scope.region !== "string")
      || typeof value.required_authority !== "string" || typeof value.state !== "string"
      || !(REQUEST_STATES as readonly string[]).includes(value.state) || (value.reason !== null && typeof value.reason !== "string")) {
    return false
  }
  if (value.state === "PLANNED") return value.requested_by === undefined && value.demand === undefined && value.observation === undefined
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
    && isObservation(value.observation, value as { state: string; subject: string; scope: { account_id: string; region?: string } })
}

export function isStatus(value: unknown): value is SetupStatus {
  if (isRecord(value) && setupLevelOf(value) !== SETUP_CONTRACT_LEVEL && ((isRecord(value.result_scope) && value.result_scope.v === 2)
      || (Array.isArray(value.dispositions) && value.dispositions.some((d) => isRecord(d) && isRecord(d.scope) && "deployment" in d.scope)))) {
    return false                                              // (S1b) a plural shape is read only from a level-5 answer
  }
  return isRecord(value) && isRecord(value.setup) && typeof value.setup.setup_id === "string"
    && (value.saved === null || (isRecord(value.saved) && isInt(value.saved.completed_revision)))
    && (value.association === null || (isRecord(value.association) && typeof value.association.state === "string"))
    && Array.isArray(value.dispositions) && value.dispositions.every(isDerived)
    && isRequirementProfile(value.requirement_profile) && coherentFacts(value.dispositions, value.requirement_profile)
    && Array.isArray(value.operations) && value.operations.every(isOperation)
    && "result_scope" in value && boundStatusScope(value.result_scope, value.association)
}

/** (S1A-R7-CONTRACT-01) The status's scope bound to ITS association: none without one; a named source is exactly the sole
 *  pinned deployment head (key and pinned version). */
function boundStatusScope(scope: unknown, association: unknown): boolean {
  if (association === null) return scope === null
  if (!isResultScope(scope) || !isRecord(association) || !Array.isArray(association.heads)) return false
  const heads = association.heads.filter((h) => isRecord(h) && h.role === "deployment") as { key?: unknown; pinned_version?: unknown }[]
  if (scope.v === 2) return sameSources(scope.from, heads.map((h) => ({ key: h.key, version: h.pinned_version })))  // (S1b) every head
  return scope.from === undefined
    || (heads.length === 1 && heads[0].key === scope.from.key && heads[0].pinned_version === scope.from.version)
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

/** A 200/201 answer that is not tagged with a setup contract this frontend reads (level 4 or 5): not one it reads. */
const foreign = (json: unknown): boolean => setupLevelOf(json) === null

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
  // (S1A-UI-LIFECYCLE-01) A refusal of a WRITTEN attempt that the backend did not record (``detail.setup.recorded`` not
  // true: the person may no longer author its save, or the record lost a race) leaves the attempt FINISHING for an
  // authorized author to reconcile -- its outcome is not known yet, so the request is kept and resent exactly, never settled.
  // Recorded refusals and refusals made before any attempt (no ``setup`` block) stay definitive.
  if (isUnrecordedRefusal(named.detail)) return { kind: "RESEND_SAME", status: raw.status, ...named }
  return { kind: "REFUSED", status: raw.status, ...named }
}

/** Whether a refusal's detail names a written attempt whose refusal the backend did NOT record. */
export function isUnrecordedRefusal(detail: Record<string, unknown>): boolean {
  return isRecord(detail.setup) && detail.setup.recorded !== true
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

/** Finish the saved revision at ``baseStateVersion``. (Level 4) ``previewDigest``: the preview the person reviewed -- sent only
 *  when given, so a Finish without one is byte-for-byte the request it always was (its replay identity unchanged). */
export async function finishSetup(setupId: string, requestId: string, baseStateVersion: number,
                                  previewDigest?: string): Promise<SetupWrite> {
  return writeAnswer(await call(path(setupId, "/finish"), json("POST", {
    request_id: requestId, base_state_version: baseStateVersion, ...(previewDigest === undefined ? {} : { preview_digest: previewDigest }),
  })))
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

/** (S1b) Whether an intent is PLURAL: its declaration carries ``deployments`` (the explicit stored shape, never the level). */
export function isPluralIntent(intent: unknown): boolean {
  return isRecord(intent) && isRecord(intent.declaration) && Array.isArray(intent.declaration.deployments)
}

/** (S1b) The ``deployment_key`` of every Deployment an intent declares: a plural intent's, or a single one's. */
export function intentDeploymentKeys(intent: unknown): string[] {
  if (!isRecord(intent) || !isRecord(intent.declaration)) return []
  const declaration = intent.declaration
  const entries = Array.isArray(declaration.deployments) ? declaration.deployments
    : isRecord(declaration.deployment) ? [declaration.deployment] : []
  return entries.map((d) => (isRecord(d) ? d.deployment_key : undefined)).filter((k): k is string => typeof k === "string" && k !== "")
}

/** (S1b) A finished setup's Deployments: each ``deployment_key`` of its intent paired with what its RECEIPT pinned for it (agreed
 *  A3: canonical key order), or null when they do not pair exactly -- never a guess. */
export function pinnedDeployments(view: SetupView): PairedDeployment[] | null {
  if (view.receipt === null) return null
  return pairDeployments(intentDeploymentKeys(view.intent), view.receipt.association.deployments)
}

/** The system id the result view takes, from a finished setup's association (``SYSTEM#<id>``), or null. */
export function associatedSystemId(association: Association | null): string | null {
  const key = association?.system.key ?? ""
  return key.startsWith("SYSTEM#") && key.length > "SYSTEM#".length ? key.slice("SYSTEM#".length) : null
}

/** (S2 intake I2c) The Terraform workspace binding's own reasons (backend system_boundary_terraform_binding.resolve), in words
 *  beside the code -- what the server found about the uploaded state, never a claim the browser makes. */
const BINDING_REASON_WORDS: Record<string, string> = {
  SNAPSHOT_UPLOADED: "an uploaded Terraform state: assessed as a snapshot, never acquired or kept current",
  PROFILE_NOT_CERTIFIED: "this Terraform state profile is not certified",
  BINDING_NOT_FOUND: "no Terraform state binding you can see has this id",
  BINDING_REVOKED: "this Terraform state binding was revoked",
  BINDING_ACCOUNT_MISMATCH: "this Terraform state was uploaded for another account",
  BINDING_RECORD_INVALID: "the stored Terraform state binding does not verify",
  BINDING_AUTHOR_REVOKED: "whoever uploaded this state no longer has access to the account",
  STATE_EMPTY: "the uploaded state has no resources",
  NO_RESOLVED_IDENTITY: "no resource of the uploaded state has an identity Cyntro can place",
  WORKSPACE_REGION_MISMATCH: "no resource of the uploaded state is in this Region",
}

/** (S2 C4a-2) A Terraform binding's code in words -- the resolver's own, and the preview's (contract
 *  S2-C4A2-PREVIEW-TERRAFORM-JOIN-CONTRACT-2026-10-16 §4) -- or null for a code without words here (said by its code alone). */
export function bindingReasonWords(code: string): string | null {
  if (BINDING_REASON_WORDS[code]) return BINDING_REASON_WORDS[code]
  if (code === "BINDING_CHANGED") return "the binding changed while the preview read it; preview again"
  if (code === "INVENTORY_READ_DIFFERS") return "the account's Inventory read differently from the preview's own read; preview again"
  if (code.startsWith("ACCOUNT_NOT_JOINED:")) return "the preview did not compute this account, so nothing was joined"
  return null
}

/** Words for one derived disposition: what the server found, never a claim the browser makes. */
export function derivedSentence(derived: DerivedDisposition): string {
  const code = derived.resolution.reason
  const words = code && BINDING_REASON_WORDS[code] ? `: ${BINDING_REASON_WORDS[code]}` : ""
  const reason = code ? ` (${code}${words})` : ""
  const limit = derived.consequence.length ? ` -- ${derived.consequence.join(", ")}` : ""
  switch (derived.resolution.state) {
    case "resolved": return `Found${limit}`
    case "assessed": return `Assessed only, not connected${reason}${limit}`
    case "held": return `Held${reason}${limit}`
    case "unavailable": return `Not available in this release${reason}${limit}`
    default: return `No source chosen${reason}${limit}`
  }
}

const UNSUPPORTED_WORDS: Record<string, string> = {
  IAC_ACQUISITION_NOT_AVAILABLE: "Cyntro cannot acquire infrastructure as code in this version",
  CODE_ACQUISITION_NOT_AVAILABLE: "Cyntro cannot acquire source code in this version",
  LIVE_SOURCE_NOT_PROFILED: "this version has no requirement profile for a live source",
  SUBJECT_NOT_PROFILED: "this version has no requirement profile for it",
}

/** (Level 3) What this disposition's subject requires, from the served profile -- a requirement, never a statement that it
 *  is met, connected or granted. */
export function requiredFactsSentence(derived: DerivedDisposition, profile: RequirementProfile | undefined): string {
  const facts = derived.required_facts as RequiredFacts | string | undefined
  if (!facts || typeof facts !== "object") return "What it requires is not shown here"    // never thrown at the person (F26)
  if (facts.support === "UNSUPPORTED") {
    const reason = facts.reason ?? ""
    if (reason.startsWith("SCOPE_INCOMPLETE:")) {
      return `Not supported as chosen -- it needs a ${reason.slice("SCOPE_INCOMPLETE:".length).split(",").join(" and ")} (${reason})`
    }
    return `Not supported -- ${UNSUPPORTED_WORDS[reason] ?? "not in this version's requirement profile"} (${reason})`
  }
  const entry = profile?.document?.subjects?.find((s) => s.subject === derived.subject)
  if (!entry?.evidence || !entry.permission) return "Requires facts this view cannot show"
  const where = [derived.scope.account_id, derived.scope.region].filter(Boolean).join(" / ")
  const owner = entry.permission.owner_parameters.length
    ? `; that permission exists only when the account's stack sets ${entry.permission.owner_parameters.join(" or ")}` : ""
  return `Requires committed ${entry.evidence.source} evidence for ${where}, read through the member stack's `
    + `${entry.permission.role} (${entry.permission.policies.join(", ")})${owner}`
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

const UNKNOWN_WORDS: Record<string, string> = {
  REQUEST_NOT_CURRENT: "Not checked -- this request is not current",
  NO_EVIDENCE_FOR_SUBJECT: "Cyntro collects no evidence for this source",
  REGISTRATION_NOT_BOUND: "Collected evidence cannot be tied to the account's current registration",
  REGISTRATION_CHANGED: "Collected evidence belongs to another registration of the account",
  PUBLICATION_NOT_RECORDED: "Collected evidence is not published yet",
  PUBLICATION_STALE: "The collected-evidence record is out of date",
  COVERAGE_NOT_ADMITTED: "Collected evidence cannot be read for this account now",
  SOURCE_PARTIAL: "Collected evidence for this source has gaps",
  SOURCE_UNREADABLE: "Collected evidence for this source could not be read",
  SOURCE_UNVERIFIED: "Collected evidence for this source is not verified yet",
}

/** (G3-C.5) What collected evidence shows for a made request, in words -- the backend's answer only. It never says the
 *  request is fulfilled, that the source is used or unused, who owns it, or that anything was sent. */
export function observationSentence(op: OwnerRequest): string | null {
  const obs = op.observation
  if (!obs) return null
  if (obs.state === "OBSERVED") {
    const ranges = obs.facts.map((f) => `${f.region} ${f.earliest_verified_at} to ${f.verified_through}`).join("; ")
    const idle = obs.not_started.length ? ` · nothing committed yet for ${obs.not_started.length} more scope(s)` : ""
    return `Collected evidence: ${obs.facts[0].source} verified ${ranges} (as of ${obs.as_of})${idle} -- what Cyntro has collected, not a fulfilment of this request`
  }
  if (obs.state === "NOT_OBSERVED") {
    return `No collected ${obs.scope.source} evidence in ${obs.scope.region} as of ${obs.as_of} -- nothing committed yet; this does not say the source is unused`
  }
  const words = UNKNOWN_WORDS[obs.limitation] ?? "What collected evidence shows is not known now"
  const shown = obs.facts && obs.facts.length ? ` · ${obs.facts.length} verified scope(s), ${obs.unresolved?.length ?? 0} not` : ""
  return `${words}${shown} (${obs.limitation}${obs.code ? ` ${obs.code}` : ""})`
}

/** (G3-D.4) Every detail an observation carries, one line each, so the summary never stands alone: each pinned fact
 *  (Region, scope, verified range and its basis, committed generation, manifest hash), each named unresolved and
 *  not-started scope, an absence's scopes, and the publication it was read from. Nothing is added or inferred. */
export function evidenceRows(op: OwnerRequest): string[] {
  const obs = op.observation
  if (!obs) return []
  const rows: string[] = []
  const facts = obs.state === "NOT_OBSERVED" ? [] : (obs.facts ?? [])
  for (const f of facts) {
    rows.push(`${f.region} · ${f.source_scope}: verified ${f.earliest_verified_at} (${f.earliest_verified_basis}) to `
      + `${f.verified_through} · generation ${f.committed_generation} · ${f.head_manifest_hash}`)
  }
  if (obs.state === "UNKNOWN") {
    for (const u of obs.unresolved ?? []) rows.push(`${u.region} · ${u.source_scope}: ${u.status}${u.reason ? ` (${u.reason})` : ""}`)
  }
  if (obs.state === "NOT_OBSERVED") {
    for (const s of obs.scope.source_scopes) rows.push(`${obs.scope.region} · ${s}: nothing committed`)
  } else {
    for (const s of obs.not_started ?? []) rows.push(`${s.region} · ${s.source_scope}: nothing committed${s.reason ? ` (${s.reason})` : ""}`)
  }
  if (obs.state === "UNKNOWN" && obs.hold_reason) rows.push(`held: ${obs.hold_reason}`)
  if (obs.state === "OBSERVED") rows.push(`registration ${obs.registration_id}`)
  if (obs.publication?.read_model_generation) {
    rows.push(`read from ${obs.publication.read_model_generation}${obs.publication.published_at_epoch !== null
      ? ` (published ${new Date(obs.publication.published_at_epoch * 1000).toISOString()})` : ""}`)
  }
  return rows
}

/** The setup refusal codes the steps explain in words. */
export const SETUP_CODES = {
  incomplete: "SETUP_INCOMPLETE",
  notOwner: "SETUP_NOT_OWNER",
  finishing: "SETUP_FINISHING",
  versionConflict: "VERSION_CONFLICT",
  forged: "FIELD_NOT_AUTHORED",
} as const
