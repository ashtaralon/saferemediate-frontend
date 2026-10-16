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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export type BindingCounts = { admission: Record<string, number>; resolution: Record<string, number> }
export type BindingCreated = { binding_id: string; revision: number; counts: BindingCounts; replayed: boolean }
export type BindingRevoked = { binding_id: string; revision: number; status: "REVOKED"; replayed: boolean }
export type BindingIdentity = {
  address: string
  resolution: string
  account_id: string | null
  inventory_type: string | null
  native_id: string | null
  arn: string | null
}
export type BindingView = {
  binding_id: string
  revision: number
  status: "ACTIVE" | "REVOKED"
  account_id: string
  accounts_seen: string[]
  workspace_identity: { basis: string; value: string }
  snapshot: { format: string; provenance_class: string; terraform_version: string | null; serial: number | null }
  counts: BindingCounts
  identities: BindingIdentity[]
  created_by: string
  created_at: string
  revoked_at?: string
  intake: { channel: string; reduction: string; retained_fields: string[]; claimed_source_digest: string | null;
            consent: { text_version: string; confirmed_by: string; confirmed_at: string } } | null
}

export type BindingAnswer<T> =
  | { kind: "OK"; status: number; value: T }
  | { kind: "SIGN_IN_AGAIN"; status: number | null }
  | { kind: "REFUSED"; status: number; code: string; reason: string | null }
  | { kind: "UNKNOWN"; status: number | null; code: string }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const isCount = (v: unknown): boolean => isRecord(v) && Object.values(v).every((n) => Number.isInteger(n) && (n as number) >= 0)
const isCounts = (v: unknown): v is BindingCounts =>
  isRecord(v) && Object.keys(v).sort().join() === "admission,resolution" && isCount(v.admission) && isCount(v.resolution)
const isRevision = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1
const strOrNull = (v: unknown): boolean => v === null || typeof v === "string"

function created(json: Record<string, unknown>): BindingCreated | null {
  if (typeof json.binding_id !== "string" || !UUID.test(json.binding_id) || !isRevision(json.revision) || !isCounts(json.counts)) return null
  if (json.replayed !== undefined && json.replayed !== true) return null
  return { binding_id: json.binding_id, revision: json.revision, counts: json.counts, replayed: json.replayed === true }
}
function revoked(json: Record<string, unknown>): BindingRevoked | null {
  if (typeof json.binding_id !== "string" || !UUID.test(json.binding_id) || !isRevision(json.revision) || json.status !== "REVOKED") return null
  if (json.replayed !== undefined && json.replayed !== true) return null
  return { binding_id: json.binding_id, revision: json.revision, status: "REVOKED", replayed: json.replayed === true }
}
function isIdentity(v: unknown): v is BindingIdentity {
  return isRecord(v) && typeof v.address === "string" && typeof v.resolution === "string" && strOrNull(v.account_id)
    && strOrNull(v.inventory_type ?? null) && strOrNull(v.native_id ?? null) && strOrNull(v.arn ?? null)
}
function view(json: Record<string, unknown>): BindingView | null {
  const b = json.binding
  if (!isRecord(b) || typeof b.binding_id !== "string" || !UUID.test(b.binding_id) || !isRevision(b.revision)) return null
  if ((b.status !== "ACTIVE" && b.status !== "REVOKED") || typeof b.account_id !== "string") return null
  if (!Array.isArray(b.accounts_seen) || !b.accounts_seen.every((a) => typeof a === "string")) return null
  const ws = b.workspace_identity, snap = b.snapshot, intake = b.intake
  if (!isRecord(ws) || typeof ws.basis !== "string" || typeof ws.value !== "string") return null
  if (!isRecord(snap) || typeof snap.format !== "string" || typeof snap.provenance_class !== "string") return null
  if (!isCounts(b.counts) || !Array.isArray(b.identities) || !b.identities.every(isIdentity)) return null
  if (typeof b.created_by !== "string" || typeof b.created_at !== "string") return null
  if (b.status === "REVOKED" ? typeof b.revoked_at !== "string" : b.revoked_at !== undefined) return null
  if (intake !== null && !(isRecord(intake) && typeof intake.channel === "string" && isRecord(intake.consent))) return null
  return b as unknown as BindingView
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

function answer<T>(raw: Raw, ok: readonly number[], parse: (json: Record<string, unknown>) => T | null): BindingAnswer<T> {
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
  if (status >= 500 || detail.code === "AUTHORING_BACKEND_UNAVAILABLE") return { kind: "UNKNOWN", status, code: detail.code }
  return { kind: "REFUSED", status, code: detail.code, reason: typeof detail.reason === "string" ? detail.reason : null }
}

const JSON_HEADERS = { "Content-Type": "application/json", Accept: "application/json" }
const bindingPath = (bindingId: string, suffix = "") => `terraform-bindings/${encodeURIComponent(bindingId)}${suffix}`

/** Create one binding from ``body``: the EXACT envelope ``buildEnvelope`` built and measured -- sent as is, never re-encoded. */
export async function createTerraformBinding(body: string): Promise<BindingAnswer<BindingCreated>> {
  return answer(await call("terraform-bindings", { method: "POST", headers: JSON_HEADERS, body }), [200, 201], created)
}

/** One binding as RETAINED (never an admissibility judgement: the setup's Finish judges that, now). */
export async function readTerraformBinding(bindingId: string): Promise<BindingAnswer<BindingView>> {
  return answer(await call(bindingPath(bindingId), { method: "GET", headers: { Accept: "application/json" } }), [200], view)
}

/** Revoke one ACTIVE binding at ``baseRevision`` -- one-way. */
export async function revokeTerraformBinding(bindingId: string, requestId: string, baseRevision: number): Promise<BindingAnswer<BindingRevoked>> {
  const body = JSON.stringify({ request_id: requestId, base_revision: baseRevision })
  return answer(await call(bindingPath(bindingId, "/revoke"), { method: "POST", headers: JSON_HEADERS, body }), [200], revoked)
}
