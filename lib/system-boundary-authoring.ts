/**
 * Typed client for System Boundary authoring (Phase 2 F1; roots N2) -- the contract of saferemediate-backend
 * 9af2ca3a (api/system_boundary.py, unified/system_boundary_save.py, unified/system_boundary_admission.py),
 * reached only through this console's named proxy (lib/server/authoring-proxy.ts). No React here.
 *
 * A save is answered in exactly one of three ways, and nothing in between is invented:
 *  - SAVED: a success response that names THIS request (request id, kind, outcome) -- a commit or its replay;
 *  - REFUSED: a named refusal; REQUEST_ID_REUSED / REQUEST_ID_CONFLICT are refusals, never "already saved";
 *  - RESEND_SAME: nothing proves what happened (the network, an unreadable or malformed response, the backend's
 *    OUTCOME_UNKNOWN) or the backend asked for the same request again. Resend the SAME envelope, unchanged, or
 *    find it in the request history -- never read it as saved or as not saved, never mint a new request id for it.
 * Keeping the envelope until its outcome is known is the caller's job; durable pre-send persistence is F2's.
 *
 * A root a save attaches (a create's roots, a correction's adds) is its identity {account_id, region, resource_uid}
 * plus the SELECTION the person saw in the account inventory (``rootFromInventory``): the row's type and observed
 * incarnation and the publication it was read from. A selection is expected values only, never authority: the
 * backend's current-root resolver judges every such root against the CURRENT registration and publication before the
 * save, and refuses the whole save as ROOT_NOT_ADMITTED naming each root it did not admit (``refusedRoots``).
 * The own-grant read is not the person's whole authority either; the backend decides each request.
 */

export const AUTHORING_BASE = "/api/proxy/system-boundary"

export interface AuthoringLimits {
  max_roots: number
  max_new_cells: number
  max_write_accounts: number
  max_move_targets: number
  max_display_name: number
  max_environment_raw: number
  max_resource_uid: number
  /** The allowed values, served by the backend: never hardcoded here. */
  criticalities: string[]
  environments: string[]
}

export interface BoundaryRecord {
  key: string
  kind: string
  version: number
  body: Record<string, unknown>
  actor: string
  written_at: string
  tombstoned: boolean
}

export interface DeclarationsView {
  /** The completed revision a save names as its base; null before the protocol is initialized. */
  completed_revision: number | null
  source: "LEGACY_HEADS" | "SNAPSHOT"
  protocol_phase: string | null
  systems: BoundaryRecord[]
  deployments: BoundaryRecord[]
  roots: BoundaryRecord[]
  limits: AuthoringLimits
}

export interface DeclarationsHead {
  revision: number
  phase: string
  accepting_saves: boolean
  serving?: string
  limits: AuthoringLimits
}

/** A root's identity: what a removal or a move names. */
export interface SeedIdentity {
  account_id: string
  region: string
  resource_uid: string
}

/** The observed incarnation exactly as the inventory row states it: a verified proof, or explicitly none. */
export type ObservedIncarnation = { status: "not_provided" } | { status: "provided"; source: string; value: string }

/** What the person SAW when they picked a root (see the module note): expected values, never authority. */
export interface RootSelection {
  resource_type: string
  publication: { attempt: string; generation: number; source_identity: string; authority_digest: string }
  observed_incarnation: ObservedIncarnation
}

/** A root a save attaches: its identity and the selection it was picked under. */
export type DeclaredRoot = SeedIdentity & { selection: RootSelection }

/** What the backend stored of a root's admission on its seed (N2): what the resolver judged it against and found. */
export interface RootProvenance {
  resolver_contract: string
  registration_id: string
  authority_digest: string
  publication: { attempt: string; generation: number; source_identity: string }
  resource_type: string
  incarnation: ObservedIncarnation
}

/** One root a ROOT_NOT_ADMITTED refusal names, with the current-root resolver's own status and reason. */
export type RefusedRoot = SeedIdentity & { status: string; reason_code: string | null }

export type NewSystem = { mode: "new"; display_name: string; criticality?: string | null }
export type SystemRef = { mode: "ref"; system_id: string; expected_version: number }
export type NewDeployment = {
  mode: "new"
  deployment_key: string
  environment: string
  environment_raw?: string | null
  scopes: { account_id: string; region: string }[]
}
export type DeploymentRef = { mode: "ref"; deployment_id: string; expected_version: number }

export interface CreateDeclaration {
  system: NewSystem | SystemRef
  deployment: NewDeployment | DeploymentRef
  roots: DeclaredRoot[]
}

export type RootAtVersion = SeedIdentity & { expected_version: number }
export type RootMove = RootAtVersion & {
  to_deployment_id: string
  to_deployment_expected_version: number
  to_system_id: string
  to_system_expected_version: number
}

/** Omitted keeps; an explicit null clears (criticality, environment_raw). */
export interface Correction {
  system: { system_id: string; expected_version: number; set?: { criticality: string | null } }
  deployment?: {
    deployment_id: string
    expected_version: number
    set?: { environment?: string; environment_raw?: string | null }
  }
  roots?: { add?: DeclaredRoot[]; remove?: RootAtVersion[]; move?: RootMove[] }
}

type DeepReadonly<T> = T extends (infer U)[] ? ReadonlyArray<DeepReadonly<U>> : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T

export type CreateEnvelope = DeepReadonly<{ request_id: string; base_revision: number; declaration: CreateDeclaration }>
export type CorrectionEnvelope = DeepReadonly<{ request_id: string; base_revision: number; correction: Correction }>

export interface WrittenRef {
  key: string
  version: number
}

export interface Saved {
  outcome: "SAVED"
  replayed: boolean
  request_kind: "CREATE" | "CORRECT"
  request_id: string
  revision: number
  written: WrittenRef[]
  references: WrittenRef[]
}

export type SaveResult =
  | { kind: "SAVED"; status: number; saved: Saved }
  | { kind: "REFUSED"; status: number; code: string; detail: Record<string, unknown> }
  | { kind: "RESEND_SAME"; status: number | null; code: string; detail: Record<string, unknown> }

export interface RequestSummary {
  request_id: string
  revision: number
  written_at: string
  kind: "CREATE" | "CORRECT"
  intent_hash: string
}

export interface RequestPage {
  requests: RequestSummary[]
  next_cursor: string | null
}

export interface RequestReceipt extends Omit<Saved, "replayed"> {
  written_at: string
  historical: true
}

export interface OwnGrant {
  subject: string
  grant: BoundaryRecord | null
}

export type ReadResult<T> =
  | { kind: "OK"; value: T }
  | { kind: "REFUSED"; status: number; code: string; detail: Record<string, unknown> }
  | { kind: "UNAVAILABLE"; status: number | null; code: string }

/** The backend codes that ask for the same request again (each carries "resend the same request_id and body"). */
const RESEND_CODES = new Set(["OUTCOME_UNKNOWN", "TRANSACTION_CONFLICT", "STORE_THROTTLED", "AUTHORING_BACKEND_UNAVAILABLE"])

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  }
  return value
}

function freshRequestId(): string {
  return globalThis.crypto.randomUUID()
}

/** A root picked from ONE page of the account inventory: the row's identity and type, its observed incarnation, and the
 * publication that page was read from -- copied, so a later page or edit never changes it. */
export function rootFromInventory(
  accountId: string,
  row: { resource_uid: string; resource_type: string; region: string; observed_incarnation: Record<string, unknown> },
  publication: { attempt: string; generation: number; source_identity: string; authority_digest: string },
): DeclaredRoot {
  return {
    account_id: accountId,
    region: row.region,
    resource_uid: row.resource_uid,
    selection: {
      resource_type: row.resource_type,
      publication: { attempt: publication.attempt, generation: publication.generation, source_identity: publication.source_identity,
                     authority_digest: publication.authority_digest },
      observed_incarnation: structuredClone(row.observed_incarnation) as ObservedIncarnation,
    },
  }
}

/** The roots a ROOT_NOT_ADMITTED refusal names, or [] for any other result. Anything malformed names nothing. */
export function refusedRoots(result: SaveResult): RefusedRoot[] {
  if (result.kind !== "REFUSED" || result.code !== "ROOT_NOT_ADMITTED" || !Array.isArray(result.detail.roots)) return []
  const roots = result.detail.roots as unknown[]
  const valid = roots.every((r) => isRecord(r) && typeof r.account_id === "string" && typeof r.region === "string"
    && typeof r.resource_uid === "string" && typeof r.status === "string" && (r.reason_code === null || typeof r.reason_code === "string"))
  return valid ? (roots as RefusedRoot[]).map((r) => ({ account_id: r.account_id, region: r.region, resource_uid: r.resource_uid,
                                                          status: r.status, reason_code: r.reason_code })) : []
}

/** A NEW envelope with a NEW request id over a frozen copy of the declaration: later edits to the draft, or a
 * later envelope, never change this one. Resend this exact object until its outcome is known. */
export function newCreateEnvelope(baseRevision: number, declaration: CreateDeclaration): CreateEnvelope {
  return deepFreeze({ request_id: freshRequestId(), base_revision: baseRevision, declaration: structuredClone(declaration) })
}

export function newCorrectionEnvelope(baseRevision: number, correction: Correction): CorrectionEnvelope {
  return deepFreeze({ request_id: freshRequestId(), base_revision: baseRevision, correction: structuredClone(correction) })
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** {detail: {code, ...}}, the shape of every backend and proxy refusal, or null. */
function refusal(json: unknown): { code: string; detail: Record<string, unknown> } | null {
  if (!isRecord(json) || !isRecord(json.detail) || typeof json.detail.code !== "string") return null
  const { code, ...detail } = json.detail
  return { code, detail }
}

function isRef(value: unknown): value is WrittenRef {
  return isRecord(value) && typeof value.key === "string" && Number.isInteger(value.version)
}

/** The minimum that makes a success THIS request's: its id and kind, SAVED, a revision and what it wrote. */
function savedFor(json: unknown, status: number, requestId: string, kind: Saved["request_kind"]): Saved | null {
  if (!isRecord(json)) return null
  const ok = json.outcome === "SAVED" && json.request_id === requestId && json.request_kind === kind
    && json.replayed === (status === 200) && Number.isInteger(json.revision) && (json.revision as number) >= 2
    && Array.isArray(json.written) && json.written.length > 0 && json.written.every(isRef)
    && Array.isArray(json.references) && json.references.every(isRef)
  return ok ? (json as unknown as Saved) : null
}

async function save(path: string, envelope: CreateEnvelope | CorrectionEnvelope, kind: Saved["request_kind"]): Promise<SaveResult> {
  const raw = await call(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(envelope),
  })
  if (raw.status === null) return { kind: "RESEND_SAME", status: null, code: "NETWORK_ERROR", detail: {} }
  if (raw.status === 200 || raw.status === 201) {
    const saved = savedFor(raw.json, raw.status, envelope.request_id, kind)
    return saved ? { kind: "SAVED", status: raw.status, saved } : { kind: "RESEND_SAME", status: raw.status, code: "MALFORMED_RESPONSE", detail: {} }
  }
  const named = refusal(raw.json)
  if (!named) return { kind: "RESEND_SAME", status: raw.status, code: "MALFORMED_RESPONSE", detail: {} }
  if (RESEND_CODES.has(named.code)) return { kind: "RESEND_SAME", status: raw.status, ...named }
  return { kind: "REFUSED", status: raw.status, ...named }
}

/** One create, or its replay. Resend the SAME envelope on RESEND_SAME. */
export function saveDeclaration(envelope: CreateEnvelope): Promise<SaveResult> {
  return save("declarations", envelope, "CREATE")
}

/** One correction, or its replay. Resend the SAME envelope on RESEND_SAME. */
export function saveCorrection(envelope: CorrectionEnvelope): Promise<SaveResult> {
  return save("declarations/corrections", envelope, "CORRECT")
}

async function read<T>(path: string, valid: (json: unknown) => json is T): Promise<ReadResult<T>> {
  const raw = await call(path, { headers: { Accept: "application/json" } })
  if (raw.status === null) return { kind: "UNAVAILABLE", status: null, code: "NETWORK_ERROR" }
  if (raw.status === 200) {
    return valid(raw.json) ? { kind: "OK", value: raw.json } : { kind: "UNAVAILABLE", status: 200, code: "MALFORMED_RESPONSE" }
  }
  const named = refusal(raw.json)
  if (!named) return { kind: "UNAVAILABLE", status: raw.status, code: "MALFORMED_RESPONSE" }
  if (named.code === "AUTHORING_BACKEND_UNAVAILABLE") return { kind: "UNAVAILABLE", status: raw.status, code: named.code }
  return { kind: "REFUSED", status: raw.status, ...named }
}

const isView = (json: unknown): json is DeclarationsView =>
  isRecord(json) && (json.completed_revision === null || Number.isInteger(json.completed_revision))
  && Array.isArray(json.systems) && Array.isArray(json.deployments) && Array.isArray(json.roots) && isRecord(json.limits)

const isHead = (json: unknown): json is DeclarationsHead =>
  isRecord(json) && Number.isInteger(json.revision) && typeof json.accepting_saves === "boolean" && isRecord(json.limits)

const isPage = (json: unknown): json is RequestPage =>
  isRecord(json) && Array.isArray(json.requests) && (json.next_cursor === null || typeof json.next_cursor === "string")

const isGrant = (json: unknown): json is OwnGrant =>
  isRecord(json) && typeof json.subject === "string" && (json.grant === null || isRecord(json.grant))

export function readView(): Promise<ReadResult<DeclarationsView>> {
  return read("declarations/view", isView)
}

export function readHead(): Promise<ReadResult<DeclarationsHead>> {
  return read("declarations/head", isHead)
}

/** The person's own committed requests, newest first. A request missing from a page never proves it did not commit. */
export function listRequests({ cursor, limit }: { cursor?: string | null; limit?: number } = {}): Promise<ReadResult<RequestPage>> {
  const query = new URLSearchParams()
  if (limit !== undefined) query.set("limit", String(limit))
  if (cursor) query.set("cursor", cursor)
  const suffix = query.toString()
  return read(`declarations/requests${suffix ? `?${suffix}` : ""}`, isPage)
}

/** One of the person's own requests, historical: shown whole, or refused (RECEIPT_WITHHELD, REQUEST_NOT_FOUND). */
export function readRequest(requestId: string): Promise<ReadResult<RequestReceipt>> {
  const isReceipt = (json: unknown): json is RequestReceipt =>
    isRecord(json) && json.outcome === "SAVED" && json.request_id === requestId && json.historical === true
    && (json.request_kind === "CREATE" || json.request_kind === "CORRECT") && Number.isInteger(json.revision)
  return read(`declarations/requests/${encodeURIComponent(requestId)}`, isReceipt)
}

/** The person's own authoring grant record (or none). Not their whole authority: the backend decides each request. */
export function readOwnGrant(): Promise<ReadResult<OwnGrant>> {
  return read("authoring-grants/self", isGrant)
}
