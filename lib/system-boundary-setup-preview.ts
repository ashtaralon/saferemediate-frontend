/**
 * The draft preview of a saved setup (S1a, setup contract level 4): a strict reader of the backend's
 * ``system_boundary_setup_preview/v1`` answer (GET /api/system-boundary/setup/{id}/preview?state_version=N, through the authoring
 * proxy; producer captures in __tests__/fixtures/system-boundary-setup-preview-captures/).
 *
 * A preview is what finishing the SAVED revision at that state version would make the system -- computed by the same planner
 * publication runs, over the inventory and census the save would admit, and written nowhere. It is never applied membership
 * and has no generation: its identity is ``preview_digest`` (= the content hash of {basis_digest, result_digest}, checked here).
 * HELD names, per account, why it is not a whole answer, and a held preview authorizes no Finish. Counts are the backend's
 * FULL counts; each account's lists are a display summary (``omitted`` says what they leave out) and pages are views of the
 * same preview identity. Nothing here computes membership; anything malformed is "unavailable", never a guessed value.
 */
import { AUTHORING_BASE } from "@/lib/system-boundary-authoring"
import { contentHash } from "@/lib/content-hash"
import { rows, type ResultList, type ResultRow } from "@/lib/system-boundary-result"
import { PREVIEW_DIGEST, SETUP_CONTRACT, SETUP_CONTRACT_UNKNOWN } from "@/lib/system-boundary-setup"

export const PREVIEW_CONTRACT = "system_boundary_setup_preview/v1"
export const PREVIEW_CONTRACT_UNKNOWN = "PREVIEW_CONTRACT_UNKNOWN"
export const PREVIEW_STATES = ["COMPUTED", "HELD"] as const
export type PreviewState = (typeof PREVIEW_STATES)[number]
export const PREVIEW_LISTS = ["members", "dependencies", "held", "not_members"] as const

export interface PreviewCounts {
  members: number
  dependencies: number
  held: number
  not_members: number
  stale_members: number
  unlisted: number
}

export interface PreviewDisplay {
  systemName: string | null
  lists: Record<ResultList, ResultRow[]>
  omitted: Partial<Record<ResultList, number>>
}

export interface PreviewAccount {
  accountId: string
  state: string
  /** Why the account is held (or, computed, null). */
  reason: string | null
  /** The inventory generation the account was computed on and the time its evidence was projected through, when read. */
  inventory: { generation: number | null; projectedThrough: string | null }
  coverage: Record<string, unknown> | null
  counts: Omit<PreviewCounts, "unlisted"> | null
  display: PreviewDisplay | null
}

export interface PreviewPage {
  accountId: string
  bucket: ResultList
  entries: ResultRow[]
  next: string | null
}

export interface Preview {
  state: PreviewState
  previewDigest: string
  basisDigest: string
  resultDigest: string
  setup: { setupId: string; intentRevision: number; stateVersion: number }
  systemId: string
  deploymentId: string
  rules: Record<string, unknown>
  counts: PreviewCounts
  accounts: PreviewAccount[]
  page: PreviewPage | null
}

export type PreviewRead =
  | { kind: "OK"; value: Preview }
  | { kind: "REFUSED"; status: number; code: string; detail: Record<string, unknown> }
  | { kind: "UNAVAILABLE"; status: number | null; code: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const isInt = (value: unknown): value is number => Number.isSafeInteger(value)
const isCount = (value: unknown): value is number => isInt(value) && value >= 0
const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0
const ACCOUNT_ID = /^[0-9]{12}$/

function counts(value: unknown, keys: readonly string[]): Record<string, number> | null {
  if (!isRecord(value) || Object.keys(value).length !== keys.length || !keys.every((k) => isCount(value[k]))) return null
  return value as Record<string, number>
}

function display(value: unknown, accountCounts: Record<string, number>): PreviewDisplay | null | undefined {
  if (value === null || value === undefined) return null
  if (!isRecord(value) || !isRecord(value.omitted) || !(value.system_name === null || typeof value.system_name === "string")) {
    return undefined
  }
  const lists = {} as Record<ResultList, ResultRow[]>
  for (const name of PREVIEW_LISTS) {
    const listed = rows(value[name])
    const left = value.omitted[name] === undefined ? 0 : value.omitted[name]
    if (listed === null || !isCount(left) || listed.length + left !== accountCounts[name]) return undefined
    lists[name] = listed
  }
  return { systemName: value.system_name as string | null, lists, omitted: value.omitted as Partial<Record<ResultList, number>> }
}

function account(value: unknown): PreviewAccount | null {
  if (!isRecord(value) || typeof value.account_id !== "string" || !ACCOUNT_ID.test(value.account_id)
      || !isText(value.state) || !(value.reason === null || value.reason === undefined || typeof value.reason === "string")
      || !isRecord(value.inventory)) return null
  const inventory = value.inventory
  if ((inventory.generation !== undefined && !isCount(inventory.generation))
      || (inventory.projected_through !== undefined && !(isText(inventory.projected_through)
        && !Number.isNaN(Date.parse(inventory.projected_through))))) return null
  const accountCounts = value.counts === undefined || value.counts === null ? null
    : counts(value.counts, ["members", "stale_members", "dependencies", "held", "not_members"])
  if (accountCounts === null && value.counts !== undefined && value.counts !== null) return null
  const shown = accountCounts === null ? (value.display === undefined || value.display === null ? null : undefined)
    : display(value.display, accountCounts)
  if (shown === undefined) return null
  if (value.state === "COMPUTED" && (accountCounts === null || shown === null || !isRecord(value.coverage))) return null
  return {
    accountId: value.account_id, state: value.state, reason: (value.reason as string | null | undefined) ?? null,
    inventory: { generation: (inventory.generation as number | undefined) ?? null,
                 projectedThrough: (inventory.projected_through as string | undefined) ?? null },
    coverage: isRecord(value.coverage) ? value.coverage : null,
    counts: accountCounts as PreviewAccount["counts"], display: shown,
  }
}

function page(value: unknown, previewDigest: string): PreviewPage | null {
  if (!isRecord(value) || value.contract !== PREVIEW_CONTRACT || value.preview_digest !== previewDigest
      || typeof value.account_id !== "string" || !ACCOUNT_ID.test(value.account_id)
      || !(PREVIEW_LISTS as readonly unknown[]).includes(value.bucket) || !(value.next === null || isText(value.next))) return null
  const entries = rows(value.entries)
  return entries === null ? null : { accountId: value.account_id, bucket: value.bucket as ResultList, entries,
                                     next: value.next as string | null }
}

/** One preview answer as THIS frontend reads it: a 200 tagged with exactly this preview contract AND this setup contract, whose
 *  digests are what they claim (``preview_digest`` binds the other two), every account and page read exactly -- or by name. */
export function parsePreview(status: number | null, json: unknown): PreviewRead {
  if (status === null) return { kind: "UNAVAILABLE", status: null, code: "NETWORK_ERROR" }
  if (status !== 200) {
    const detail = isRecord(json) && isRecord(json.detail) && typeof json.detail.code === "string" ? json.detail : null
    if (!detail) return { kind: "UNAVAILABLE", status, code: "MALFORMED_RESPONSE" }
    const { code, ...rest } = detail as Record<string, unknown> & { code: string }
    if (code === "AUTHORING_BACKEND_UNAVAILABLE") return { kind: "UNAVAILABLE", status, code }
    return { kind: "REFUSED", status, code, detail: rest }
  }
  if (!isRecord(json)) return { kind: "UNAVAILABLE", status, code: "MALFORMED_RESPONSE" }
  if (json.setup_contract !== SETUP_CONTRACT) return { kind: "UNAVAILABLE", status, code: SETUP_CONTRACT_UNKNOWN }
  if (json.contract !== PREVIEW_CONTRACT) return { kind: "UNAVAILABLE", status, code: PREVIEW_CONTRACT_UNKNOWN }
  const malformed: PreviewRead = { kind: "UNAVAILABLE", status, code: "MALFORMED_RESPONSE" }
  const digests = [json.preview_digest, json.basis_digest, json.result_digest]
  if (!digests.every((d) => typeof d === "string" && PREVIEW_DIGEST.test(d))) return malformed
  const [previewDigest, basisDigest, resultDigest] = digests as string[]
  if (contentHash({ basis_digest: basisDigest, result_digest: resultDigest }) !== previewDigest) return malformed
  if (!(PREVIEW_STATES as readonly unknown[]).includes(json.state)) return malformed
  const setup = json.setup
  const targets = json.draft_targets
  if (!isRecord(setup) || !isText(setup.setup_id) || !isCount(setup.intent_revision) || !isCount(setup.state_version)
      || !isRecord(targets) || !isText(targets.system_id) || !isText(targets.deployment_id) || !isRecord(json.rules)) return malformed
  const total = counts(json.counts, ["members", "dependencies", "held", "not_members", "stale_members", "unlisted"])
  if (total === null || !Array.isArray(json.accounts)) return malformed
  const accounts = json.accounts.map(account)
  if (accounts.some((a) => a === null)) return malformed
  const read = accounts as PreviewAccount[]
  if (new Set(read.map((a) => a.accountId)).size !== read.length) return malformed
  // COMPUTED: every account computed (the backend's own rule); a held account makes the whole preview HELD.
  if ((json.state === "COMPUTED") !== read.every((a) => a.state === "COMPUTED")) return malformed
  const shown = json.page === undefined ? null : page(json.page, previewDigest)
  if (json.page !== undefined && shown === null) return malformed
  return { kind: "OK", value: {
    state: json.state as PreviewState, previewDigest, basisDigest, resultDigest,
    setup: { setupId: setup.setup_id, intentRevision: setup.intent_revision, stateVersion: setup.state_version },
    systemId: targets.system_id, deploymentId: targets.deployment_id, rules: json.rules,
    counts: total as unknown as PreviewCounts, accounts: read, page: shown,
  } }
}

/** The preview path: ONE saved state version, optionally one page of one list of one account. */
export function previewPath(setupId: string, stateVersion: number,
                            pageOf?: { accountId: string; bucket: ResultList; cursor?: string | null }): string {
  const query = new URLSearchParams({ state_version: String(stateVersion) })
  if (pageOf) {
    query.set("account_id", pageOf.accountId)
    query.set("bucket", pageOf.bucket)
    if (pageOf.cursor) query.set("cursor", pageOf.cursor)
  }
  return `${AUTHORING_BASE}/setup/${encodeURIComponent(setupId)}/preview?${query.toString()}`
}

export type PreviewFetcher = (setupId: string, stateVersion: number,
                              pageOf?: { accountId: string; bucket: ResultList; cursor?: string | null }) => Promise<PreviewRead>

export const readPreview: PreviewFetcher = async (setupId, stateVersion, pageOf) => {
  let response: Response
  try {
    response = await fetch(previewPath(setupId, stateVersion, pageOf),
                           { cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" } })
  } catch {
    return parsePreview(null, undefined)
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  return parsePreview(response.status, body)
}

/** Why an account is held, in words; the backend's reason stays visible. */
export function heldSentence(reason: string | null): string {
  const code = reason ?? "HELD"
  const [head] = code.split(":", 1)
  const words: Record<string, string> = {
    CENSUS_NOT_SERVED: "the account's CloudFormation census could not be read whole for this preview",
    INVENTORY_MOVED_SINCE_ADMISSION: "the account's inventory was republished while this preview was computed; preview again",
    PERSON_NOT_AUTHORIZED: "you are not authorized to read this account",
    READ_NOT_ADMITTED: "this account's inventory cannot be read now",
    READ_HELD: "this account's inventory is not ready to be read now",
  }
  return `${words[head] ?? "this account could not be computed"} (${code})`
}

/** Plain words for the refusals a preview read or a preview-bearing Finish may name; the code itself is always shown too. */
const PREVIEW_REFUSALS: Record<string, string> = {
  PREVIEW_REQUIRED: "Finishing a setup that binds a stack needs the preview you reviewed. Review the preview, then Finish.",
  PREVIEW_CHANGED: "What finishing would make this system changed since you reviewed it. Nothing was saved; review the new preview, then Finish again.",
  PREVIEW_NOT_COMPUTED: "The preview is held, so it cannot be finished. Nothing was saved; preview again when it is computed.",
  PREVIEW_UNAVAILABLE: "The preview cannot be computed on this installation right now. Nothing was saved.",
  PREVIEW_INPUT_CHANGED: "The account's census changed while the setup was being saved. Nothing was saved and the setup is a draft again; review the new preview, then Finish.",
  PREVIEW_SNAPSHOT_MOVED: "Declarations or the census changed while the preview was computed. Preview again.",
  PREVIEW_MODE_UNSUPPORTED: "This setup corrects existing declarations; a preview is computed only for a new system.",
  PREVIEW_CURSOR_INVALID: "That page of the preview could not be read. Preview again.",
  SETUP_STATE_CHANGED: "The setup changed since this screen read it. It is read again.",
  SETUP_WITHHELD: "This setup includes an account you cannot read now, so it is not shown.",
  BASE_REVISION_CONFLICT: "Declarations changed since this setup was saved. Nothing was saved; save the setup again and review the new preview.",
}

export function previewRefusalSentence(code: string): string | null {
  return PREVIEW_REFUSALS[code] ?? null
}

/** A preview read in words (never a claim the browser makes). */
export function previewSentence(read: PreviewRead): string {
  if (read.kind === "REFUSED") return `${previewRefusalSentence(read.code) ?? "The preview was refused."} (${read.code})`
  if (read.kind === "UNAVAILABLE") return `The preview could not be read (${read.code}).`
  const p = read.value
  const c = p.counts
  const whole = `${c.members} member${c.members === 1 ? "" : "s"} (${c.stale_members} last seen), ${c.dependencies} `
    + `dependenc${c.dependencies === 1 ? "y" : "ies"}, ${c.held} held, ${c.not_members} not a member`
  return p.state === "COMPUTED"
    ? `If you finish saved revision ${p.setup.intentRevision}, this system would have ${whole}. Nothing is applied yet.`
    : `The preview is held: ${p.accounts.filter((a) => a.state !== "COMPUTED").length} account(s) could not be computed, so these `
      + `counts (${whole}) are not a whole answer and cannot be finished.`
}
