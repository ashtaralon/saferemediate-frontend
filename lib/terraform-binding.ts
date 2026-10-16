/**
 * S2 intake I2b: the browser client of a Terraform workspace binding -- create (from the browser-REDUCED envelope built by
 * lib/terraform-state-reducer.ts), read and revoke, through the authoring proxy. Contract: agent-coordinator
 * S2-INTAKE-CONTRACT-2026-10-16 sections 1-2; the answers are the backend's producer captures
 * (__tests__/fixtures/terraform-binding-captures).
 *
 * Four outcomes, never a guess:
 *  - OK: a 200 / 201 that is a whole answer of ``terraform_workspace_binding_read/v1``;
 *  - SIGN_IN_AGAIN: the session ended -- the load balancer redirected to the IdP (an opaque redirect, never followed), an
 *    HTML page answered, or the backend refused the person (401). Nothing is resent: the person signs in again and, after the
 *    page reloads, chooses the file again (contract section 4);
 *  - REFUSED: a named, value-free refusal (``code`` and the backend's fixed ``reason``); definitive for this request;
 *  - UNKNOWN: no answer this client reads (network, 5xx, the proxy's AUTHORING_BACKEND_UNAVAILABLE, a malformed or foreign
 *    answer). Whether the write happened is not known: the person may resend the SAME body -- its request id makes the
 *    backend answer a replay, never a second binding -- and nothing here resends it on its own.
 * The envelope is sent exactly as built (its UTF-8 bytes were measured there); nothing of the document or a refusal is logged.
 */
import { AUTHORING_BASE } from "@/lib/system-boundary-authoring"

export const BINDING_CONTRACT = "terraform_workspace_binding_read/v1"
/** Exactly what a reduced upload keeps (backend ``INTAKE_RETAINED_FIELDS``, contract section 3): the consent names this list,
 *  and a stored binding's intake must carry exactly it. */
export const RETAINED_FIELDS: readonly string[] = [
  "state.lineage", "state.serial", "state.terraform_version", "state.format_version", "resource.module_path", "resource.mode",
  "resource.type", "resource.name", "resource.index_key", "resource.provider_source", "resource.status", "resource.deposed_key",
  "resource.schema_version", "resource.id", "resource.arn", "resource.sensitivity_marks", "workspace_identity",
  "claimed_source_digest", "consent.confirmed_by", "consent.confirmed_at",
]
const CHANNEL = "browser_reduced_upload"
const REDUCTION = "client_supported_types/v1"
const CONSENT_VERSION = "terraform_reduced_upload_consent/v1"
/** ``aws_physical_identity.RESOLVED`` and its ``REASONS``: what one identity row's resolution may be. */
const RESOLUTIONS: readonly string[] = [
  "resolved", "deposed_not_joined", "data_reference_not_joined", "unsupported_provider", "unsupported_type", "no_arn",
  "arn_invalid", "arn_not_canonical", "arn_kind_mismatch", "identity_inconsistent", "account_unresolved", "account_mismatch",
  "region_unresolved", "identity_unmapped",
]
const ROW_FIELDS = ["address", "deposed_key", "resolution", "inventory_type", "account_id", "account_basis", "region", "native_id",
                    "arn", "inventory_uid"] as const
const VIEW_FIELDS = ["binding_id", "revision", "status", "account_id", "registration_id", "accounts_seen", "workspace_identity",
                     "snapshot", "counts", "identities_digest", "identities", "created_by", "created_at", "intake"]
const SNAPSHOT_FIELDS = ["profile_id", "profile_version", "format", "content_digest", "provenance_class", "terraform_version",
                         "lineage", "serial"]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const ACCOUNT = /^[0-9]{12}$/
const SHA256 = /^sha256:[0-9a-f]{64}$/
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}\+00:00$/          // the setup's own spelling (microseconds, UTC)
const MAX_WORKSPACE_IDENTITY = 256

export type BindingCounts = { admission: Record<string, number>; resolution: Record<string, number> }
export type BindingCreated = { binding_id: string; revision: 1; counts: BindingCounts; replayed: boolean }
export type BindingRevoked = { binding_id: string; revision: number; status: "REVOKED"; replayed: boolean }
export type BindingIdentity = { [K in (typeof ROW_FIELDS)[number]]: K extends "address" | "resolution" ? string : string | null }
export type BindingView = {
  binding_id: string
  revision: number
  status: "ACTIVE" | "REVOKED"
  account_id: string
  registration_id: string
  accounts_seen: string[]
  workspace_identity: { basis: "authored" | "connection"; value: string }
  snapshot: {
    profile_id: string; profile_version: number; format: "raw_state_v4" | "show_state_json"; content_digest: string
    provenance_class: "uploaded" | "acquired"; terraform_version: string | null; lineage: string | null; serial: number | null
  }
  counts: BindingCounts
  identities_digest: string
  identities: BindingIdentity[]
  created_by: string
  created_at: string
  /** Set exactly when REVOKED. */
  revoked_at: string | null
  intake: {
    channel: typeof CHANNEL; reduction: typeof REDUCTION; retained_fields: string[]; claimed_source_digest: string | null
    consent: { text_version: typeof CONSENT_VERSION; confirmed_by: string; confirmed_at: string }
  }
}

export type BindingAnswer<T> =
  | { kind: "OK"; status: number; value: T }
  | { kind: "SIGN_IN_AGAIN"; status: number | null }
  | { kind: "REFUSED"; status: number; code: string; reason: string | null }
  | { kind: "UNKNOWN"; status: number | null; code: string }

// ── (SW113 I2b-R1) every consumed field is validated and PROJECTED into a fresh object: nothing is cast through ─────────────

type J = Record<string, unknown>
const isRecord = (v: unknown): v is J => typeof v === "object" && v !== null && !Array.isArray(v)
/** Exactly ``required`` members, plus any of ``optional``: another member is not this contract. */
const exactly = (v: J, required: readonly string[], optional: readonly string[] = []): boolean =>
  required.every((k) => k in v) && Object.keys(v).every((k) => required.includes(k) || optional.includes(k))
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0
const textOrNull = (v: unknown): v is string | null => v === null || typeof v === "string"
const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0
const revision = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 1
const printable = (v: string): boolean => /^[\x20-\x7e]*$/.test(v)
const actor = (v: unknown): v is string => text(v) && v.length <= 512 && /^[\x21-\x7e]+$/.test(v)
const stamp = (v: unknown): v is string => typeof v === "string" && STAMP.test(v)

function counts(v: unknown): BindingCounts | null {
  if (!isRecord(v) || !exactly(v, ["admission", "resolution"])) return null
  const part = (p: unknown): Record<string, number> | null => {
    if (!isRecord(p) || !Object.values(p).every(count)) return null
    return Object.fromEntries(Object.entries(p).map(([k, n]) => [k, n as number]))
  }
  const admission = part(v.admission), resolution = part(v.resolution)
  return admission && resolution ? { admission, resolution } : null
}
function identity(v: unknown): BindingIdentity | null {
  if (!isRecord(v) || !exactly(v, ROW_FIELDS) || !ROW_FIELDS.every((k) => textOrNull(v[k]))) return null
  if (!text(v.address) || typeof v.resolution !== "string" || !RESOLUTIONS.includes(v.resolution)) return null
  return Object.fromEntries(ROW_FIELDS.map((k) => [k, v[k]])) as BindingIdentity
}
function snapshot(v: unknown): BindingView["snapshot"] | null {
  if (!isRecord(v) || !exactly(v, SNAPSHOT_FIELDS)) return null
  const { profile_id, profile_version, format, content_digest, provenance_class, terraform_version, lineage, serial } = v
  if (!text(profile_id) || !count(profile_version) || (format !== "raw_state_v4" && format !== "show_state_json")) return null
  if (typeof content_digest !== "string" || !SHA256.test(content_digest)) return null
  if (provenance_class !== "uploaded" && provenance_class !== "acquired") return null
  if (!textOrNull(terraform_version) || !textOrNull(lineage) || !(serial === null || count(serial))) return null
  return { profile_id, profile_version, format, content_digest, provenance_class, terraform_version, lineage, serial }
}
function intake(v: unknown, createdBy: string, createdAt: string): BindingView["intake"] | null {
  if (!isRecord(v) || !exactly(v, ["channel", "reduction", "retained_fields", "consent", "claimed_source_digest"])) return null
  const { consent, claimed_source_digest: claimed, retained_fields: retained } = v
  if (v.channel !== CHANNEL || v.reduction !== REDUCTION) return null
  if (!Array.isArray(retained) || retained.length !== RETAINED_FIELDS.length || !retained.every((f, i) => f === RETAINED_FIELDS[i])) return null
  if (!(claimed === null || (typeof claimed === "string" && SHA256.test(claimed)))) return null
  // The consent is the record author's, at the record's own time (backend ``_intake_ok``).
  if (!isRecord(consent) || !exactly(consent, ["text_version", "confirmed_by", "confirmed_at"])) return null
  if (consent.text_version !== CONSENT_VERSION || consent.confirmed_by !== createdBy || consent.confirmed_at !== createdAt) return null
  return { channel: CHANNEL, reduction: REDUCTION, retained_fields: [...RETAINED_FIELDS], claimed_source_digest: claimed,
           consent: { text_version: CONSENT_VERSION, confirmed_by: createdBy, confirmed_at: createdAt } }
}

/** The create answer: the server MINTS the id (any UUID), at revision 1. */
function created(json: J): BindingCreated | null {
  if (!exactly(json, ["binding_id", "revision", "counts", "contract"], ["replayed"])) return null
  const c = counts(json.counts)
  if (typeof json.binding_id !== "string" || !UUID.test(json.binding_id) || json.revision !== 1 || c === null) return null
  if (json.replayed !== undefined && json.replayed !== true) return null
  return { binding_id: json.binding_id, revision: 1, counts: c, replayed: json.replayed === true }
}
/** (SW113 I2b-R2) The revoke answer for THE binding asked about, at the revision it was asked at (a revoke does not move it). */
const revokedFor = (bindingId: string, baseRevision: number) => (json: J): BindingRevoked | null => {
  if (!exactly(json, ["binding_id", "revision", "status", "contract"], ["replayed"])) return null
  if (json.binding_id !== bindingId || json.revision !== baseRevision || json.status !== "REVOKED") return null
  if (json.replayed !== undefined && json.replayed !== true) return null
  return { binding_id: bindingId, revision: baseRevision, status: "REVOKED", replayed: json.replayed === true }
}
/** (SW113 I2b-R1 / R2) The read answer: THE binding asked about, every field of the retained view validated and projected. */
const viewFor = (bindingId: string) => (json: J): BindingView | null => {
  const b = json.binding
  if (!exactly(json, ["binding", "contract"]) || !isRecord(b)) return null
  if (!exactly(b, b.status === "REVOKED" ? [...VIEW_FIELDS, "revoked_at"] : VIEW_FIELDS)) return null   // revoked_at iff REVOKED
  if (b.binding_id !== bindingId || !revision(b.revision) || (b.status !== "ACTIVE" && b.status !== "REVOKED")) return null
  const revokedAt = b.status === "REVOKED" ? b.revoked_at : null
  if (b.status === "REVOKED" && !stamp(revokedAt)) return null
  if (typeof b.account_id !== "string" || !ACCOUNT.test(b.account_id) || !text(b.registration_id)) return null
  const seen = b.accounts_seen
  if (!Array.isArray(seen) || !seen.every((a) => typeof a === "string" && ACCOUNT.test(a)) || !seen.includes(b.account_id)) return null
  const ws = b.workspace_identity
  if (!isRecord(ws) || !exactly(ws, ["value", "basis"]) || (ws.basis !== "authored" && ws.basis !== "connection")) return null
  if (!text(ws.value) || ws.value.length > MAX_WORKSPACE_IDENTITY || !printable(ws.value) || ws.value !== ws.value.trim()) return null
  if (typeof b.identities_digest !== "string" || !SHA256.test(b.identities_digest) || !actor(b.created_by) || !stamp(b.created_at)) return null
  const snap = snapshot(b.snapshot), c = counts(b.counts), take = intake(b.intake, b.created_by, b.created_at)
  const rows = Array.isArray(b.identities) ? b.identities.map(identity) : null
  if (snap === null || c === null || take === null || rows === null || rows.some((r) => r === null)) return null
  return {
    binding_id: bindingId, revision: b.revision, status: b.status, account_id: b.account_id, registration_id: b.registration_id,
    accounts_seen: [...(seen as string[])], workspace_identity: { basis: ws.basis, value: ws.value }, snapshot: snap, counts: c,
    identities_digest: b.identities_digest, identities: rows as BindingIdentity[], created_by: b.created_by, created_at: b.created_at,
    revoked_at: (revokedAt as string | null), intake: take,
  }
}

type Raw =
  | { kind: "answer"; status: number; json: unknown }
  | { kind: "session"; status: number | null }
  | { kind: "none"; status: number | null; code: string }

async function call(path: string, init: RequestInit): Promise<Raw> {
  let response: Response
  try {
    // ``manual``: an expired load-balancer session answers with a redirect to the IdP. Following it would send the person's
    // request elsewhere; it is read as "sign in again" instead.
    response = await fetch(`${AUTHORING_BASE}/${path}`, { ...init, cache: "no-store", credentials: "same-origin", redirect: "manual" })
  } catch {
    return { kind: "none", status: null, code: "NETWORK_ERROR" }
  }
  if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) return { kind: "session", status: response.status || null }
  const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase()
  if (type === "text/html") return { kind: "session", status: response.status }
  if (type !== "application/json") return { kind: "none", status: response.status, code: "MALFORMED_RESPONSE" }
  try {
    return { kind: "answer", status: response.status, json: await response.json() }
  } catch {
    return { kind: "none", status: response.status, code: "MALFORMED_RESPONSE" }
  }
}

function answer<T>(raw: Raw, ok: readonly number[], parse: (json: J) => T | null): BindingAnswer<T> {
  if (raw.kind === "session") return { kind: "SIGN_IN_AGAIN", status: raw.status }
  if (raw.kind === "none") return { kind: "UNKNOWN", status: raw.status, code: raw.code }
  const { status, json } = raw
  if (status === 401) return { kind: "SIGN_IN_AGAIN", status }
  if (ok.includes(status)) {
    if (!isRecord(json) || json.contract !== BINDING_CONTRACT) return { kind: "UNKNOWN", status, code: "CONTRACT_UNKNOWN" }
    const value = parse(json)
    return value === null ? { kind: "UNKNOWN", status, code: "MALFORMED_RESPONSE" } : { kind: "OK", status, value }
  }
  const detail = isRecord(json) && isRecord(json.detail) ? json.detail : null
  if (detail === null || typeof detail.code !== "string") return { kind: "UNKNOWN", status, code: "MALFORMED_RESPONSE" }
  if (status >= 500) return { kind: "UNKNOWN", status, code: detail.code }        // the proxy's 502 included
  return { kind: "REFUSED", status, code: detail.code, reason: typeof detail.reason === "string" ? detail.reason : null }
}

const JSON_HEADERS = { "Content-Type": "application/json", Accept: "application/json" }
const bindingPath = (bindingId: string, suffix = "") => `terraform-bindings/${encodeURIComponent(bindingId)}${suffix}`

/** Create one binding from ``body``: the EXACT envelope ``buildEnvelope`` built and measured -- sent as is, never re-encoded. */
export async function createTerraformBinding(body: string): Promise<BindingAnswer<BindingCreated>> {
  return answer(await call("terraform-bindings", { method: "POST", headers: JSON_HEADERS, body }), [200, 201], created)
}

/** One binding as RETAINED (never an admissibility judgement: the setup's Finish judges that, now). An answer naming another
 *  binding is not this one's: UNKNOWN, never OK. */
export async function readTerraformBinding(bindingId: string): Promise<BindingAnswer<BindingView>> {
  return answer(await call(bindingPath(bindingId), { method: "GET", headers: { Accept: "application/json" } }), [200], viewFor(bindingId))
}

/** Revoke one ACTIVE binding at ``baseRevision`` -- one-way. OK only for an answer naming THIS binding at THAT revision. */
export async function revokeTerraformBinding(bindingId: string, requestId: string, baseRevision: number): Promise<BindingAnswer<BindingRevoked>> {
  const body = JSON.stringify({ request_id: requestId, base_revision: baseRevision })
  return answer(await call(bindingPath(bindingId, "/revoke"), { method: "POST", headers: JSON_HEADERS, body }), [200],
                revokedFor(bindingId, baseRevision))
}
