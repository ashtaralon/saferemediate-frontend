/**
 * Whether a save is applied (A7 rev 4 C-C): a strict reader of the backend's `declarations_applied/v1` answer
 * (GET /api/system-boundary/declarations/applied?account_id=, through the authoring proxy).
 *
 * Per account: the tenant's completed revision now (`saved_revision`) and the completed revision the SERVED membership of
 * that account was built from (`applied_revision`, from the serving cohort's pin -- never merely the newest generation).
 * A save is applied in an account iff `applied_revision >= ` the save's revision; the wizard asks every account the save's
 * receipt names. Validation mirrors backend unified/system_boundary_applied.py. Anything else is "unavailable"; nothing
 * here throws.
 */

export const APPLIED_CONTRACT = "declarations_applied/v1"
export const APPLIED_STATES = ["applied_known", "not_applied_yet", "not_initialized", "unavailable"] as const
export type AppliedState = (typeof APPLIED_STATES)[number]

export const RESPONSE_MALFORMED = "RESPONSE_MALFORMED"
export const RESPONSE_NOT_CONTRACT = "RESPONSE_NOT_CONTRACT"

const ACCOUNT_ID = /^[0-9]{12}$/
const REVISION_MAX = 9_999_999_999

export interface AppliedAnswer {
  kind: "applied" | "not_applied" | "not_initialized"
  status: number
  state: Exclude<AppliedState, "unavailable">
  reasonCode: string | null
  accountId: string
  savedRevision: number | null
  appliedRevision: number | null
  generation: number | null
  publishedAt: string | null
}

export interface AppliedUnavailable {
  kind: "unavailable" | "refused"
  status: number
  reasonCode: string | null
}

export type ParsedApplied = AppliedAnswer | AppliedUnavailable

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function revision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= REVISION_MAX
}

function unavailable(status: number, reasonCode: string | null): AppliedUnavailable {
  return { kind: "unavailable", status, reasonCode }
}

/** The ONE strict reading of an applied answer. A known state must be 200; unavailable 503; a refusal any other 4xx body. */
export function parseAppliedResponse(status: number, body: unknown): ParsedApplied {
  if (!isObject(body)) return unavailable(status, RESPONSE_NOT_CONTRACT)
  if (body.contract !== APPLIED_CONTRACT) {
    // The route's refusals (person, account, protocol switch) are FastAPI detail bodies, not this contract.
    if (status >= 400 && status < 500) {
      const detail = isObject(body.detail) && typeof body.detail.code === "string" ? body.detail.code : null
      return { kind: "refused", status, reasonCode: detail }
    }
    return unavailable(status, RESPONSE_NOT_CONTRACT)
  }
  const state = body.state
  if (!(APPLIED_STATES as readonly unknown[]).includes(state)) return unavailable(status, RESPONSE_MALFORMED)
  if (typeof body.account_id !== "string" || !ACCOUNT_ID.test(body.account_id)) return unavailable(status, RESPONSE_MALFORMED)
  if (!(body.reason_code === null || typeof body.reason_code === "string")) return unavailable(status, RESPONSE_MALFORMED)
  const reasonCode = (body.reason_code as string | null) ?? null
  const saved = body.saved_revision
  const appliedRevision = body.applied_revision
  const generation = body.generation
  const publishedAt = body.published_at
  if (!(saved === null || revision(saved)) || !(appliedRevision === null || revision(appliedRevision))) {
    return unavailable(status, RESPONSE_MALFORMED)
  }
  if (!(generation === null || (typeof generation === "number" && Number.isSafeInteger(generation) && generation >= 1))) {
    return unavailable(status, RESPONSE_MALFORMED)
  }
  if (!(publishedAt === null || (typeof publishedAt === "string" && !Number.isNaN(Date.parse(publishedAt))))) {
    return unavailable(status, RESPONSE_MALFORMED)
  }
  if (state === "unavailable") {
    if (status !== 503 || appliedRevision !== null) return unavailable(status, RESPONSE_MALFORMED)
    return unavailable(status, reasonCode)
  }
  if (status !== 200) return unavailable(status, RESPONSE_MALFORMED)
  const base = { status, reasonCode, accountId: body.account_id, savedRevision: saved as number | null,
    appliedRevision: appliedRevision as number | null, generation: generation as number | null,
    publishedAt: publishedAt as string | null }
  if (state === "not_initialized") {
    if (saved !== null || appliedRevision !== null) return unavailable(status, RESPONSE_MALFORMED)
    return { kind: "not_initialized", state, ...base }
  }
  if (saved === null) return unavailable(status, RESPONSE_MALFORMED)
  if (state === "applied_known") {
    // An applied revision above the saved one cannot be: the served membership read a revision that was never completed.
    if (appliedRevision === null || generation === null || publishedAt === null || reasonCode !== null
      || appliedRevision > (saved as number)) {
      return unavailable(status, RESPONSE_MALFORMED)
    }
    return { kind: "applied", state, ...base }
  }
  if (appliedRevision !== null || reasonCode === null) return unavailable(status, RESPONSE_MALFORMED)
  return { kind: "not_applied", state: "not_applied_yet", ...base }
}

/** Whether a save of `revision` is applied in this account, by the numbers. */
export function isApplied(answer: ParsedApplied, revision: number): boolean {
  return answer.kind === "applied" && answer.appliedRevision !== null && answer.appliedRevision >= revision
}

export function appliedSentence(answer: ParsedApplied, revision: number | null): string {
  if (answer.kind === "refused") {
    if (answer.status === 401) return "Sign in again to read whether the save is applied."
    if (answer.status === 403) return "You are not authorized to read this account's membership status."
    return `The request was refused (${answer.reasonCode ?? "refused"}).`
  }
  if (answer.kind === "unavailable") return `Whether the save is applied could not be read (${answer.reasonCode ?? "unavailable"}).`
  if (answer.kind === "not_initialized") return "Saving is not initialized on this install."
  if (answer.kind === "not_applied") {
    if (answer.reasonCode === "NO_SERVED_COHORT") return "No membership is served for this account yet."
    return "Saved. Cyntro has not yet published the membership built from it."
  }
  if (revision !== null && answer.appliedRevision !== null && answer.appliedRevision >= revision) {
    return `Applied: the membership shown (published ${answer.publishedAt}) includes this save.`
  }
  return "Saved. The membership shown was built before this save; it is applied on the next publication."
}

export function appliedPath(accountId: string): string {
  return `/api/proxy/system-boundary/declarations/applied?${new URLSearchParams({ account_id: accountId }).toString()}`
}

export async function fetchApplied(accountId: string, signal?: AbortSignal): Promise<{ status: number; body: unknown }> {
  try {
    const response = await fetch(appliedPath(accountId), { cache: "no-store", signal })
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
