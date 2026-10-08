/**
 * The wizard's stack list (A7 rev 4 C-A): a strict reader of the backend's `account_census_stacks_read/v1` answer
 * (GET /api/accounts/{account_id}/census/stacks, through /api/proxy/accounts/{accountId}/census/stacks).
 *
 * One account's CloudFormation stacks, grouped from its census publication: each stack with its status, whether it is
 * settled (only then does Cyntro add anything from it), its parent stack, how completely its listing was read, what is
 * in it by type and depth, the System names its resources are tagged with, and the binding it already has (if any).
 * Row-less answers keep the census route's states (not_published / held / stale / invalid / refused / unavailable).
 *
 * Validation mirrors the producer (backend cyntro_data/semantic/account_census_stacks.py, api/account_census_stacks.py).
 * Anything malformed, foreign, of another contract version, or inconsistent with its HTTP status is "unavailable" and shows
 * no stack. Nothing here throws.
 */

export const STACKS_CONTRACT = "account_census_stacks_read/v1"

export const STACKS_DATA_STATES = ["populated", "complete_empty"] as const
export const STACKS_EVIDENCE_STATES = ["not_published", "held", "stale", "invalid"] as const
export type StacksDataState = (typeof STACKS_DATA_STATES)[number]
export type StacksEvidenceState = (typeof STACKS_EVIDENCE_STATES)[number]

/** The binding kinds a stack can be bound with (the save's `bindings[].kind`). */
export const BINDING_KINDS = ["exclusive", "several_systems", "shared_foundation"] as const
export type BindingKind = (typeof BINDING_KINDS)[number]

export const RESPONSE_MALFORMED = "RESPONSE_MALFORMED"
export const RESPONSE_NOT_CONTRACT = "RESPONSE_NOT_CONTRACT"
/** The proxy's own sanitized answers ({"error": code}): the account proxy's codes. */
export const STACKS_PROXY_CODES = [
  "PROXY_ACCOUNT_ID_INVALID",
  "PROXY_QUERY_INVALID",
  "PROXY_BACKEND_UNCONFIGURED",
  "PROXY_BACKEND_UNREACHABLE",
  "PROXY_BACKEND_REDIRECT",
  "PROXY_RESPONSE_NOT_JSON",
] as const

const ACCOUNT_ID = /^[0-9]{12}$/
const HEX32 = /^[0-9a-f]{32}$/
const STACK_ARN = /^arn:(aws|aws-us-gov|aws-cn):cloudformation:([a-z0-9-]{1,32}):([0-9]{12}):stack\/([A-Za-z][A-Za-z0-9-]{0,127})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const TEXT_MAX = 4096
const STACKS_MAX = 5000

export interface StackResources {
  total: number
  byType: Record<string, number>
  collected: number
  listedOnly: number
  inventoryPending: number
  deleted: number
  /** Parts CloudFormation creates that are not AWS resources: not counted by census v1 (null), never shown as 0. */
  notAResource: number | null
}

export interface StackBound {
  systemName: string | null
  deploymentKey: string | null
  kind: BindingKind
  /** The binding head's version: a correction that removes it names this. */
  version: number
}

export interface Stack {
  stackId: string
  stackName: string
  region: string
  /** null: the stack's resources disagree on its status, so none is shown. */
  stackStatus: string | null
  settled: boolean
  parentStackId: string | null
  /** "COMPLETE" or "INCOMPLETE:<reason>": an incomplete read adds nothing and ends nothing (R3). */
  readOutcome: string
  resources: StackResources
  taggedForSystems: Array<{ systemName: string; count: number }>
  bound: StackBound | null
}

export interface StacksPublication {
  attempt: string
  generation: number
  sourceIdentity: string
  authorityDigest: string
  publishedAtEpoch: number
}

export interface StacksData {
  kind: "data"
  status: number
  state: StacksDataState
  accountId: string
  registrationId: string | null
  installAccount: boolean
  publication: StacksPublication
  stacks: Stack[]
  /** "read", "not_configured", or "unavailable:<code>": whether `bound` could be read at all. */
  bindingsState: string
}

export interface StacksOutcome {
  kind: "evidence" | "refused" | "unavailable"
  status: number
  state: StacksEvidenceState | "refused" | "unavailable"
  reasonCode: string | null
}

export type ParsedStacks = StacksData | StacksOutcome

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= TEXT_MAX
}

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

function malformed(status: number): StacksOutcome {
  return { kind: "unavailable", status, state: "unavailable", reasonCode: RESPONSE_MALFORMED }
}

/** The account and Region a stack ARN names, or null for anything that is not one. */
export function parseStackArn(value: unknown): { region: string; accountId: string; stackName: string } | null {
  if (typeof value !== "string") return null
  const match = STACK_ARN.exec(value)
  return match ? { region: match[2], accountId: match[3], stackName: match[4] } : null
}

function resourcesOf(value: unknown): StackResources | null {
  if (!isObject(value)) return null
  for (const field of ["total", "collected", "listed_only", "inventory_pending", "deleted"] as const) {
    if (!count(value[field])) return null
  }
  const byType = value.by_type
  if (!isObject(byType) || !Object.entries(byType).every(([k, n]) => k.length > 0 && count(n))) return null
  const total = value.total as number
  if (Object.values(byType as Record<string, number>).reduce((a, b) => a + b, 0) !== total) return null
  if ((value.collected as number) + (value.listed_only as number) + (value.inventory_pending as number) > total) return null
  if (!(value.not_a_resource === null || count(value.not_a_resource))) return null
  return {
    total,
    byType: byType as Record<string, number>,
    collected: value.collected as number,
    listedOnly: value.listed_only as number,
    inventoryPending: value.inventory_pending as number,
    deleted: value.deleted as number,
    notAResource: (value.not_a_resource as number | null) ?? null,
  }
}

function boundOf(value: unknown): StackBound | null | undefined {
  if (value === null) return null
  if (!isObject(value)) return undefined
  if (!(BINDING_KINDS as readonly unknown[]).includes(value.kind)) return undefined
  if (!(value.system_name === null || text(value.system_name))) return undefined
  if (!(value.deployment_key === null || text(value.deployment_key))) return undefined
  if (!count(value.version) || value.version < 1) return undefined
  return { systemName: (value.system_name as string | null) ?? null, deploymentKey: (value.deployment_key as string | null) ?? null,
    kind: value.kind as BindingKind, version: value.version }
}

function stackOf(value: unknown, accountId: string): Stack | null {
  if (!isObject(value)) return null
  const parsed = parseStackArn(value.stack_id)
  if (parsed === null || parsed.accountId !== accountId) return null
  if (value.stack_name !== parsed.stackName || value.region !== parsed.region) return null
  if (!(value.stack_status === null || text(value.stack_status)) || typeof value.settled !== "boolean") return null
  if (value.settled && value.stack_status === null) return null
  if (!(value.parent_stack_id === null || parseStackArn(value.parent_stack_id)?.accountId === accountId)) return null
  if (!text(value.read_outcome) || !(value.read_outcome === "COMPLETE" || value.read_outcome.startsWith("INCOMPLETE:"))) return null
  const resources = resourcesOf(value.resources)
  if (resources === null) return null
  const tagged = value.tagged_for_other_systems
  if (!Array.isArray(tagged) || !tagged.every((t) => isObject(t) && text(t.system_name) && count(t.count) && t.count > 0)) {
    return null
  }
  const bound = boundOf(value.bound)
  if (bound === undefined) return null
  return {
    stackId: value.stack_id as string,
    stackName: parsed.stackName,
    region: parsed.region,
    stackStatus: (value.stack_status as string | null) ?? null,
    settled: value.settled,
    parentStackId: (value.parent_stack_id as string | null) ?? null,
    readOutcome: value.read_outcome,
    resources,
    taggedForSystems: (tagged as Array<Record<string, unknown>>).map((t) => ({ systemName: t.system_name as string,
      count: t.count as number })),
    bound,
  }
}

function publicationOf(value: unknown): StacksPublication | null {
  if (!isObject(value)) return null
  if (typeof value.attempt !== "string" || !HEX32.test(value.attempt)) return null
  if (!count(value.generation) || value.generation < 1 || !count(value.published_at_epoch)) return null
  if (!text(value.source_identity) || !text(value.authority_digest)) return null
  return { attempt: value.attempt, generation: value.generation, sourceIdentity: value.source_identity,
    authorityDigest: value.authority_digest, publishedAtEpoch: value.published_at_epoch }
}

/**
 * The ONE strict reading of a stack-list answer for the account the wizard asked about. A data or evidence answer must
 * be 200, a refusal 4xx and an unavailable answer 5xx, so an error can never carry accepted data.
 */
export function parseStacksResponse(status: number, body: unknown, accountId: string): ParsedStacks {
  if (!ACCOUNT_ID.test(accountId)) return malformed(status)
  if (!isObject(body)) return { kind: "unavailable", status, state: "unavailable", reasonCode: RESPONSE_NOT_CONTRACT }
  if (body.contract !== STACKS_CONTRACT) {
    const proxy = typeof body.error === "string" && (STACKS_PROXY_CODES as readonly string[]).includes(body.error)
    return { kind: "unavailable", status, state: "unavailable", reasonCode: proxy ? (body.error as string) : RESPONSE_NOT_CONTRACT }
  }
  if (body.account_id !== accountId) return malformed(status)
  if (!(body.reason_code === null || text(body.reason_code))) return malformed(status)
  if (!Array.isArray(body.stacks)) return malformed(status)
  const reasonCode = (body.reason_code as string | null) ?? null
  const state = body.state

  if ((STACKS_DATA_STATES as readonly unknown[]).includes(state)) {
    if (status !== 200 || reasonCode !== null) return malformed(status)
    const authority = body.account_authority
    if (!isObject(authority) || typeof authority.install_account !== "boolean"
      || !(authority.registration_id === null || (typeof authority.registration_id === "string" && HEX32.test(authority.registration_id)))) {
      return malformed(status)
    }
    const publication = publicationOf(body.publication)
    if (publication === null || body.stacks.length > STACKS_MAX) return malformed(status)
    const stacks = body.stacks.map((s) => stackOf(s, accountId))
    if (stacks.some((s) => s === null)) return malformed(status)
    if (new Set((stacks as Stack[]).map((s) => s.stackId)).size !== stacks.length) return malformed(status)
    if ((state === "populated") !== (stacks.length > 0)) return malformed(status)
    const bindingsState = body.bindings_state
    if (!(bindingsState === "read" || bindingsState === "not_configured"
      || (typeof bindingsState === "string" && bindingsState.startsWith("unavailable:")))) {
      return malformed(status)
    }
    // An unread binding is never shown as "not bound": with bindings unread, no stack may claim a binding either way.
    if (bindingsState !== "read" && (stacks as Stack[]).some((s) => s.bound !== null)) return malformed(status)
    return {
      kind: "data", status, state: state as StacksDataState, accountId,
      registrationId: (authority.registration_id as string | null) ?? null, installAccount: authority.install_account,
      publication, stacks: stacks as Stack[], bindingsState,
    }
  }

  if (body.stacks.length !== 0) return malformed(status)
  if ((STACKS_EVIDENCE_STATES as readonly unknown[]).includes(state)) {
    if (status !== 200) return malformed(status)
    return { kind: "evidence", status, state: state as StacksEvidenceState, reasonCode }
  }
  if (state === "refused") {
    if (status < 400 || status >= 500) return malformed(status)
    return { kind: "refused", status, state: "refused", reasonCode }
  }
  if (state === "unavailable") {
    if (status < 500) return malformed(status)
    return { kind: "unavailable", status, state: "unavailable", reasonCode }
  }
  return malformed(status)
}

// ── what the wizard says ─────────────────────────────────────────────────────────────────────────────────────────────

/** Why a stack cannot contribute members right now, or null when it can. */
export function stackCaveat(stack: Stack): string | null {
  if (stack.stackStatus === null) return "Its resources disagree on the stack's status; nothing is added from it until they agree."
  if (!stack.settled) {
    return `It is ${stack.stackStatus}; nothing is added from it until it settles (the binding is kept).`
  }
  if (stack.readOutcome !== "COMPLETE") {
    return `Its listing was not read completely (${stack.readOutcome.slice("INCOMPLETE:".length)}); nothing is added or removed from it until a complete read.`
  }
  return null
}

export function boundSentence(stack: Stack, bindingsState: string): string {
  if (bindingsState === "not_configured") return "Bindings are not configured on this install."
  if (bindingsState !== "read") return "Whether it is bound could not be read."
  if (stack.bound === null) return "Not bound to any system."
  const where = stack.bound.deploymentKey ? ` (${stack.bound.deploymentKey})` : ""
  return `Bound to ${stack.bound.systemName ?? "a system"}${where} as ${kindLabel(stack.bound.kind)}.`
}

export function kindLabel(kind: BindingKind): string {
  switch (kind) {
    case "exclusive":
      return "this system's own stack"
    case "several_systems":
      return "shared by several systems (decide per resource)"
    case "shared_foundation":
      return "shared foundation (members of no business system)"
  }
}

/** The sentence for every answer that carries no stacks. */
export function stacksOutcomeSentence(outcome: StacksOutcome): string {
  const code = outcome.reasonCode ?? ""
  if (outcome.state === "not_published") return "The account census has not been published yet, so its stacks are not known."
  if (outcome.state === "held") {
    if (code === "AUTHORITY_CHANGED") return "This account was registered again since the census was published; the next census replaces it."
    return `The account's stacks are held (${code || "no reason given"}).`
  }
  if (outcome.state === "stale") return `The census is older than it may be shown (${code || "stale"}).`
  if (outcome.state === "invalid") return `The census publication did not validate and is not shown (${code || "invalid"}).`
  if (outcome.state === "refused") {
    if (outcome.status === 401) return "Sign in again to read this account's stacks."
    if (outcome.status === 403) return "You are not authorized to read this account's stacks."
    return `The request was refused (${code || "refused"}).`
  }
  return `The account's stacks could not be read (${code || "unavailable"}).`
}

// ── transport ────────────────────────────────────────────────────────────────────────────────────────────────────────

export function stacksPath(accountId: string, region: string | null = null): string {
  const query = region ? `?${new URLSearchParams({ region }).toString()}` : ""
  return `/api/proxy/accounts/${encodeURIComponent(accountId)}/census/stacks${query}`
}

export async function fetchStacks(accountId: string, region: string | null = null,
  signal?: AbortSignal): Promise<{ status: number; body: unknown }> {
  try {
    const response = await fetch(stacksPath(accountId, region), { cache: "no-store", signal })
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
