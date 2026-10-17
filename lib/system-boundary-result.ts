/**
 * The wizard's RESULT (A7 rev 4 C-D, screen 6): a strict reader of the backend's `system_boundary_result_read` answer at
 * level 1 or 2 (GET /api/system-boundary/result?account_id=&system_key=, through the authoring proxy). (S1b) Level 2 is level
 * 1 plus `deployment_context_state` -- a SERVED answer's Deployment decoration, read exactly by
 * lib/system-boundary-deployment-context.ts (SERVED: a context on every listed member; UNAVAILABLE by name: none) and null for
 * every other state. A level-1 answer carries none, and is read exactly as before.
 *
 * What the SERVED membership says about one system in one account -- members (each with its proof), dependencies, held and
 * not-a-member rows -- from the publication the active membership cohort names. No percentage, and nothing is computed
 * here: counts are the backend's exact counts, and a list the backend capped says how many rows it left out (`omitted`).
 * Served only where membership v2 serves: elsewhere the answer is `held` MEMBERSHIP_V2_NOT_SERVED. Validation mirrors
 * backend cyntro_data/semantic/system_boundary_result.py. Anything else is "unavailable"; nothing here throws.
 */
import { readShared, type SharedRead } from "@/lib/system-boundary-boundary-words"
import { decoratedMembersAreWhole, decoration, type Decoration } from "@/lib/system-boundary-deployment-context"

/** The level this frontend REQUIRES (lib/release-contract.json requires 1) -- and the levels it reads (requires up to accepts). */
export const RESULT_CONTRACT = "system_boundary_result_read/v1"
export const RESULT_CONTRACT_V2 = "system_boundary_result_read/v2"
export const RESULT_CONTRACTS: readonly string[] = [RESULT_CONTRACT, RESULT_CONTRACT_V2]
export const RESULT_STATES = ["served", "held", "not_recorded", "unavailable", "invalid"] as const
export type ResultState = (typeof RESULT_STATES)[number]
export const MEMBERSHIP_V2_NOT_SERVED = "MEMBERSHIP_V2_NOT_SERVED"
export const SYSTEM_NOT_IN_RESULT = "SYSTEM_NOT_IN_RESULT"
export const RESPONSE_MALFORMED = "RESPONSE_MALFORMED"
export const RESPONSE_NOT_CONTRACT = "RESPONSE_NOT_CONTRACT"
const LISTS = ["members", "dependencies", "held", "not_members"] as const
export type ResultList = (typeof LISTS)[number]

const ACCOUNT_ID = /^[0-9]{12}$/

export interface ResultRow {
  resource_uid: string
  resource_type?: string | null
  state: string
  kind?: string
  reason?: string | null
  proof?: Record<string, unknown>
  stale_reason?: string | null
  [field: string]: unknown
}

export interface ResultCounts {
  members: number
  stale_members: number
  dependencies: number
  held: number
  not_members: number
}

export interface ResultServed {
  kind: "served"
  status: number
  accountId: string
  systemKey: string
  systemName: string | null
  generation: number
  publishedAt: string
  lists: Record<ResultList, ResultRow[]>
  counts: ResultCounts
  omitted: Partial<Record<ResultList, number>>
  /** (S1b) The contract the answer was read at, and its Deployment decoration: null at level 1 (none is served). */
  contract: string
  deploymentContext: Decoration | null
  /** (PC1 S0-F / F2) What this answer says about its not-member classes (shared among them): reported, not reported, or
   *  inconsistent -- never a reason to refuse the rest of the answer. */
  shared: SharedRead
}

export interface ResultHeld {
  kind: "held" | "not_recorded"
  status: number
  accountId: string
  systemKey: string
  reasonCode: string
}

export interface ResultUnavailable {
  kind: "unavailable" | "refused"
  status: number
  reasonCode: string | null
}

export type ParsedResult = ResultServed | ResultHeld | ResultUnavailable

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

function unavailable(status: number, reasonCode: string | null): ResultUnavailable {
  return { kind: "unavailable", status, reasonCode }
}

/** A list of result rows (each names a resource and a state), or null -- the one row check; the setup preview's display
 *  lists and pages are these same rows (lib/system-boundary-setup-preview.ts). */
export function rows(value: unknown): ResultRow[] | null {
  if (!Array.isArray(value)) return null
  for (const row of value) {
    if (!isObject(row) || typeof row.resource_uid !== "string" || row.resource_uid === "" || typeof row.state !== "string") {
      return null
    }
  }
  return value as ResultRow[]
}

/** The ONE strict reading of a result answer for `accountId`. Served / held / not_recorded must be 200; unavailable 503;
 * invalid 500; a refusal any other 4xx detail body. */
export function parseResultResponse(status: number, body: unknown, accountId: string): ParsedResult {
  if (!isObject(body)) return unavailable(status, RESPONSE_NOT_CONTRACT)
  if (typeof body.contract !== "string" || !RESULT_CONTRACTS.includes(body.contract)) {
    if (status >= 400 && status < 500) {
      const detail = isObject(body.detail) && typeof body.detail.code === "string" ? body.detail.code : null
      return { kind: "refused", status, reasonCode: detail }
    }
    return unavailable(status, RESPONSE_NOT_CONTRACT)
  }
  const state = body.state
  if (!(RESULT_STATES as readonly unknown[]).includes(state)) return unavailable(status, RESPONSE_MALFORMED)
  if (typeof body.account_id !== "string" || !ACCOUNT_ID.test(body.account_id) || body.account_id !== accountId) {
    return unavailable(status, RESPONSE_MALFORMED)          // an answer for another account is never shown as this one's
  }
  if (!(body.reason_code === null || typeof body.reason_code === "string")) return unavailable(status, RESPONSE_MALFORMED)
  if (typeof body.system_key !== "string" || body.system_key === "") return unavailable(status, RESPONSE_MALFORMED)
  const reasonCode = body.reason_code as string | null
  // (S1b) Level 2 carries the decoration field on EVERY answer (null unless served); level 1 carries none.
  const v2 = body.contract === RESULT_CONTRACT_V2
  if (v2 !== ("deployment_context_state" in body)) return unavailable(status, RESPONSE_MALFORMED)
  if (v2 && state !== "served" && body.deployment_context_state !== null) return unavailable(status, RESPONSE_MALFORMED)
  if (state === "unavailable" || state === "invalid") {
    if (status !== (state === "unavailable" ? 503 : 500)) return unavailable(status, RESPONSE_MALFORMED)
    return unavailable(status, reasonCode)
  }
  if (status !== 200) return unavailable(status, RESPONSE_MALFORMED)
  if (state === "held" || state === "not_recorded") {
    if (reasonCode === null) return unavailable(status, RESPONSE_MALFORMED)
    return { kind: state, status, accountId, systemKey: body.system_key, reasonCode }
  }
  // served: a published generation, its time, every list, exact counts that cover the lists shown.
  const generation = body.generation
  const publishedAt = body.published_at
  if (reasonCode !== null || !(typeof generation === "number" && Number.isSafeInteger(generation) && generation >= 1)
    || typeof publishedAt !== "string" || Number.isNaN(Date.parse(publishedAt))) {
    return unavailable(status, RESPONSE_MALFORMED)
  }
  if (!(body.system_name === null || typeof body.system_name === "string")) return unavailable(status, RESPONSE_MALFORMED)
  const counts = body.counts
  const omitted = isObject(body.omitted) ? body.omitted : null
  if (!isObject(counts) || omitted === null) return unavailable(status, RESPONSE_MALFORMED)
  const lists = {} as Record<ResultList, ResultRow[]>
  for (const name of LISTS) {
    const listed = rows(body[name])
    const total = counts[name]
    const left = omitted[name] === undefined ? 0 : omitted[name]
    if (listed === null || !count(total) || !count(left) || listed.length + (left as number) !== total) {
      return unavailable(status, RESPONSE_MALFORMED)       // a list and its count that disagree are never shown
    }
    lists[name] = listed
  }
  if (!count(counts.stale_members) || (counts.stale_members as number) > (counts.members as number)) {
    return unavailable(status, RESPONSE_MALFORMED)
  }
  // (PC1 S0-F2) the shared count is the server's: absent = not reported; present but not the closed set, or not adding up to
  // the not-member count, = inconsistent -- no shared number is shown, and the lists still are.
  const shared = readShared(body.not_member_reasons, counts.not_members as number)
  // (S1b) A level-2 served answer's decoration, whole: never a context on some members, never one at level 1.
  let deploymentContext: Decoration | null = null
  if (v2) {
    deploymentContext = decoration(body.deployment_context_state)
    if (deploymentContext === null || !decoratedMembersAreWhole(deploymentContext, lists.members, counts.members as number,
                                                                 (omitted.members ?? 0) as number)) {
      return unavailable(status, RESPONSE_MALFORMED)
    }
  } else if (lists.members.some((m) => "deployment_context" in m)) {
    return unavailable(status, RESPONSE_MALFORMED)
  }
  return {
    kind: "served", status, accountId, systemKey: body.system_key, systemName: body.system_name as string | null,
    generation, publishedAt, lists, counts: counts as unknown as ResultCounts,
    omitted: omitted as Partial<Record<ResultList, number>>, contract: body.contract as string, deploymentContext,
    shared,
  }
}

/** How a claim's origin reads (the engine's ORIGIN_* names; an unknown one is shown as itself, never dropped). */
const ORIGIN_WORDS: Record<string, string> = {
  aws_tag: "AWS tag",
  stack: "stack listing",
  held: "claim held for review",
  authored: "person's declaration",
  decision: "person's decision",
}

function originWords(origin: unknown): string {
  return typeof origin === "string" ? (ORIGIN_WORDS[origin] ?? origin) : "claim"
}

function systemWords(claim: Record<string, unknown>): string {
  const name = typeof claim.system_name === "string" && claim.system_name !== "" ? claim.system_name : null
  return name ?? String(claim.system_key ?? "another system")
}

/** The claims a member's root outranked (R9 display: kept and shown, never hidden): `overridden_claims` (system + origin),
 * else the older `declared_by` (systems only). Empty when none. */
export function overriddenSentence(proof: Record<string, unknown>): string {
  const claims = Array.isArray(proof.overridden_claims) ? proof.overridden_claims.filter(isObject) : []
  if (claims.length > 0) {
    return `also claimed by ${claims.map((c) => `${systemWords(c)} (${originWords(c.origin)})`).join(", ")} -- `
      + "kept and shown, not applied"
  }
  const systems = Array.isArray(proof.declared_by) ? proof.declared_by.filter((k) => typeof k === "string") : []
  return systems.length > 0 ? `also claimed by ${systems.join(", ")} -- kept and shown, not applied` : ""
}

/** The proof a person reads for one member row: why it is a member, how its CURRENT identity is known (R4 / R5), whether
 * its lifetime is proven (apart from identity), and the claims it outranked (R9). */
export function proofSentence(row: ResultRow): string {
  const proof = isObject(row.proof) ? row.proof : {}
  let why: string
  if (proof.source === "stack") {
    const how = proof.proof === "stack_tag" ? "its stack-id tag names" : "is listed by"
    why = `${how} stack ${String(proof.stack_id ?? "?")} as ${String(proof.logical_id ?? "?")}`
  } else if (proof.source === "decision") {
    why = "included by a person's decision"
  } else {
    why = `found by Cyntro's rules (${String(proof.origin ?? "unknown")})`
  }
  const parts = [why]
  if (proof.identity === "stack_tag") parts.push("identity confirmed by this stack's own tag on the resource now")
  else if (proof.identity === "marker") parts.push("identity confirmed by its creation marker")
  else if (proof.identity_unconfirmed === true) parts.push("identity not independently confirmed (named by the stack only)")
  if (proof.lineage_unproven === true) parts.push("continuity since it joined is not proven by a creation marker")
  const overridden = overriddenSentence(proof)
  if (overridden !== "") parts.push(overridden)
  return parts.join("; ")
}

/** Why a not-a-member row is not a member, as a person reads it (R9 exclusion, R6 shared cluster, R1 shared foundation,
 * retirements, listed-only and the other named outcomes). The backend's reason code stays visible. */
/** A basic-discovery root's not-member reason (backend system_membership_project BASIC_*), in words; null for any other. */
export function basicRootSentence(reason: string): string | null {
  const [code, detail] = reason.split(":", 2)
  if (code === "BASIC_REGISTRATION_UNPROVEN") {
    return "chosen from basic discovery; not a member yet: Cyntro's deep evidence for this account has not been proven to come "
      + `from its current connection${detail ? ` (${detail})` : ""} [${code}]`
  }
  if (code === "BASIC_REGISTRATION_MISMATCH") {
    return `chosen from basic discovery under an earlier connection of this account; it is not carried over [${code}]`
  }
  if (code === "BASIC_INCARNATION_UNPROVEN") {
    return `chosen from basic discovery; not a member yet: the deep evidence does not prove this resource's identity [${code}]`
  }
  if (code === "BASIC_INCARNATION_MISMATCH") {
    return `chosen from basic discovery; the resource now found under this identifier is a different one (recreated) [${code}]`
  }
  return null
}

export function notMemberSentence(row: ResultRow): string {
  const reason = String(row.reason ?? row.state)
  const suppressed = Array.isArray(row.suppressed) ? row.suppressed.map(originWords) : []
  const setAside = suppressed.length > 0 ? `; this system's ${suppressed.join(" and ")} claim was set aside` : ""
  if (reason === "SHARED_CLUSTER") {
    // Scoped to THIS system and its claims: a person's explicit decision may still have assigned the cluster to another
    // system (that system's result shows it as a member), so this row never says "a member of no system".
    const users = Array.isArray(row.consumer_systems) ? row.consumer_systems.map(String) : []
    const held = typeof row.hold_reason === "string" ? ` (it had been held: ${row.hold_reason})` : ""
    return `not this system's member: a shared cluster other systems' workloads run on`
      + `${users.length ? ` (${users.join(", ")})` : ""}${setAside}${held}; a shared cluster belongs to a system only by `
      + `a person's explicit decision [${reason}]`
  }
  if (reason === "EXCLUDED_BY_DECISION") {
    const stopped = row.propagation_stopped === true ? "; it also stopped this system's propagation there" : ""
    return `excluded by a person's decision${setAside}${stopped} [${reason}]`
  }
  if (reason === "SHARED_FOUNDATION") return `shared foundation: a member of no business system [${reason}]`
  // (Wizard on discovery) a root chosen from basic discovery, not yet proven in this membership generation: say what is
  // missing -- never a member on basic discovery alone.
  const basic = basicRootSentence(reason)
  if (basic) return basic
  if (row.kind === "RETIRED") {
    const sinceWhen = typeof row.valid_to === "string" ? ` on ${row.valid_to}` : ""
    return `no longer a member${sinceWhen} [${reason}]`
  }
  return reason
}

export function resultSentence(answer: ParsedResult): string {
  if (answer.kind === "refused") {
    if (answer.status === 401) return "Sign in again to read the result."
    if (answer.status === 403) return "You are not authorized to read this account's membership."
    return `The request was refused (${answer.reasonCode ?? "refused"}).`
  }
  if (answer.kind === "unavailable") return `The result could not be read (${answer.reasonCode ?? "unavailable"}).`
  if (answer.kind === "held") {
    if (answer.reasonCode === MEMBERSHIP_V2_NOT_SERVED) return "Results are not served on this install yet."
    if (answer.reasonCode === "COHORT_NOT_BUILT") return "No membership has been published for this account yet."
    return `The result is held (${answer.reasonCode}).`
  }
  // Only "not_recorded" and "served" are left here. Testing against "served" lets TypeScript narrow what follows to
  // ResultServed: the earlier checks never remove ResultHeld / ResultUnavailable, whose kinds are unions.
  if (answer.kind !== "served") {
    if (answer.reasonCode === SYSTEM_NOT_IN_RESULT) return "The published membership does not name this system in this account."
    return `No result is recorded (${answer.reasonCode}).`
  }
  const c = answer.counts
  return `${c.members} member${c.members === 1 ? "" : "s"} (${c.stale_members} last seen), ${c.dependencies} `
    + `dependenc${c.dependencies === 1 ? "y" : "ies"}, ${c.held} held, ${c.not_members} not a member -- `
    + `membership generation ${answer.generation}, published ${answer.publishedAt}.`
}

/** The system id a SAVED receipt wrote or referenced (`SYSTEM#<system_id>`): an authored system's membership key. */
export function savedSystemKey(saved: { written: readonly { key: string }[]; references: readonly { key: string }[] }): string | null {
  const keys = [...saved.written, ...saved.references].map((ref) => ref.key).filter((key) => key.startsWith("SYSTEM#"))
  const ids = Array.from(new Set(keys.map((key) => key.slice("SYSTEM#".length)))).filter((id) => id !== "")
  return ids.length === 1 ? ids[0] : null                    // none, or several: never one picked
}

export function resultPath(accountId: string, systemKey: string): string {
  return `/api/proxy/system-boundary/result?${new URLSearchParams({ account_id: accountId, system_key: systemKey }).toString()}`
}

export async function fetchResult(accountId: string, systemKey: string, signal?: AbortSignal): Promise<{ status: number; body: unknown }> {
  try {
    const response = await fetch(resultPath(accountId, systemKey), { cache: "no-store", signal })
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
