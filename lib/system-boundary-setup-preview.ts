/**
 * The draft preview of a saved setup (S1a, setup contract level 4): a strict reader of the backend's
 * ``system_boundary_setup_preview/v1`` answer (GET /api/system-boundary/setup/{id}/preview?state_version=N, through the authoring
 * proxy; producer captures in __tests__/fixtures/system-boundary-setup-preview-captures/).
 *
 * (S1b, setup level 5) A PLURAL draft previews as ``system_boundary_setup_preview/v2`` -- v1 plus every draft Deployment
 * (``draft_targets.deployment_ids``) and, per account, the Deployment context publication v2 serves
 * (``deployment_context_state``; each member's ``deployment_context``), read exactly by lib/system-boundary-deployment-context.ts
 * and naming ONLY this draft's Deployments. The preview's OUTER state alone authorizes a Finish (``previewAuthorizesFinish``):
 * a held account may still carry a context computed before it was held, and that nested SERVED decoration is a DIAGNOSTIC,
 * never permission (producer captures in __tests__/fixtures/system-boundary-setup-preview-captures-v5/).
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
import { PREVIEW_DIGEST, SETUP_CONTRACT_LEVEL, SETUP_CONTRACT_UNKNOWN, setupLevelOf } from "@/lib/system-boundary-setup"
import { boundarySummary, readNotMemberReasons, type NotMemberReasons } from "@/lib/system-boundary-boundary-words"
import { decoratedMembersAreWhole, decoration, deploymentContext, type Decoration } from "@/lib/system-boundary-deployment-context"

export const PREVIEW_CONTRACT = "system_boundary_setup_preview/v1"
/** (S1b) A plural draft's preview; read only from a setup-level-5 answer. */
export const PREVIEW_CONTRACT_V2 = "system_boundary_setup_preview/v2"
/** (S2 C4a-2) A draft with an ``iac`` row using an uploaded Terraform state: the v1 (single) or v2 (plural) answer plus
 *  ``terraform`` -- each such row as the server judged it now and, assessed, its identities joined against the Inventory
 *  generation the account's assembly bound. DESCRIPTIVE: it changes no member, count, state or Finish permission. Read only
 *  from a setup-level-5 answer; single or plural is told by ``draft_targets`` exactly as v1 / v2 are. */
export const PREVIEW_CONTRACT_V3 = "system_boundary_setup_preview/v3"
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
  /** (PC1 S0-F) This account's exact not-member classes; null when the answer does not report them. */
  notMemberReasons: NotMemberReasons | null
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
  /** (S1b, v2) The account's Deployment decoration: null when it carries none (v1, or an account held before its rows). */
  deploymentContext: Decoration | null
}

/** (S2 C4a-2) One Terraform row of the draft, as the preview's ``terraform`` section answers it. */
export interface TerraformPreviewBinding {
  row: { accountId: string; region: string | null; deployment: string | null }
  bindingId: string
  state: "JOINED" | "HELD"
  /** Why it is held (the resolver's own code, BINDING_CHANGED, ACCOUNT_NOT_JOINED:<state>, INVENTORY_READ_DIFFERS); null joined. */
  reason: string | null
  bindingRevision: number | null
  inventoryGeneration: number | null
  /** FULL counts (joined only); ``rows`` are the first ones by address and ``omitted`` the rest. */
  counts: { identities: number; matched: number; notInInventory: number; ambiguous: number; notJoinable: number } | null
  rows: { address: string; inventoryUid: string | null; outcome: string }[]
  omitted: number
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
  /** The single draft's Deployment (v1); null for a plural draft, whose Deployments are ``deploymentIds``. */
  deploymentId: string | null
  /** (S1b) The contract read, and every draft Deployment's id (v1: the one). */
  contract: string
  deploymentIds: string[]
  rules: Record<string, unknown>
  counts: PreviewCounts
  accounts: PreviewAccount[]
  page: PreviewPage | null
  /** (S2 C4a-2, v3) Every Terraform row of the draft; null for a v1 / v2 preview (the draft has none). */
  terraform: TerraformPreviewBinding[] | null
  /** (PC1 S0-F) The draft System's exact not-member classes across accounts; null when the answer does not report them. */
  notMemberReasons: NotMemberReasons | null
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
const DEPLOYMENT_ID = /^authored_deployment:[0-9a-f]{64}$/

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
  const notMemberReasons = readNotMemberReasons(value.not_member_reasons, accountCounts.not_members)
  if (notMemberReasons === undefined) return undefined
  return { systemName: value.system_name as string | null, lists, omitted: value.omitted as Partial<Record<ResultList, number>>,
           notMemberReasons }
}

/** (S1b) The same JSON value, canonically -- false (never a throw) for a value canonical JSON cannot state. */
function sameJson(a: unknown, b: unknown): boolean {
  try {
    return contentHash(a) === contentHash(b)
  } catch {
    return false
  }
}

/** (S1b) Whether every context in ``members`` names only ``ours`` (this draft's Deployment keys). */
const onlyOurs = (members: readonly Record<string, unknown>[], ours: ReadonlySet<string>): boolean =>
  members.every((m) => !("deployment_context" in m)
    || (deploymentContext(m.deployment_context)?.deployments.every((ref) => ours.has(ref.key)) ?? false))

function account(value: unknown, v2: boolean, ours: ReadonlySet<string>): PreviewAccount | null {
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
  // (S1b) The decoration: none at v1; at v2 every account whose rows were assembled carries one -- every COMPUTED account,
  // and a HELD one held after its rows were assembled (a diagnostic); an account held before carries no rows and none.
  // Whole, naming only this draft's Deployments, and -- when the account lists the System -- the very decoration its
  // display carries.
  let decorated: Decoration | null = null
  const members = shown ? shown.lists.members : []
  const displayed = isRecord(value.display) ? value.display : null
  if (!v2 || !("deployment_context_state" in value)) {
    if ((v2 && (value.state === "COMPUTED" || shown !== null)) || "deployment_context_state" in value
        || members.some((m) => "deployment_context" in m)
        || (displayed !== null && "deployment_context_state" in displayed)) return null
  } else {
    decorated = decoration(value.deployment_context_state)
    if (decorated === null || !onlyOurs(members, ours)) return null
    if (shown !== null && accountCounts !== null) {
      if (displayed === null || !("deployment_context_state" in displayed)
          || !sameJson(displayed.deployment_context_state, value.deployment_context_state)
          || !decoratedMembersAreWhole(decorated, members, accountCounts.members, shown.omitted.members ?? 0)) return null
    } else if (decorated.state === "SERVED" && decorated.members !== 0) {
      return null                                       // no row of the System here: nothing listed to carry a context
    }
  }
  return {
    accountId: value.account_id, state: value.state, reason: (value.reason as string | null | undefined) ?? null,
    inventory: { generation: (inventory.generation as number | undefined) ?? null,
                 projectedThrough: (inventory.projected_through as string | undefined) ?? null },
    coverage: isRecord(value.coverage) ? value.coverage : null,
    counts: accountCounts as PreviewAccount["counts"], display: shown, deploymentContext: decorated,
  }
}

function page(value: unknown, previewDigest: string, contract: string): PreviewPage | null {
  if (!isRecord(value) || value.contract !== contract || value.preview_digest !== previewDigest
      || typeof value.account_id !== "string" || !ACCOUNT_ID.test(value.account_id)
      || !(PREVIEW_LISTS as readonly unknown[]).includes(value.bucket) || !(value.next === null || isText(value.next))) return null
  const entries = rows(value.entries)
  return entries === null ? null : { accountId: value.account_id, bucket: value.bucket as ResultList, entries,
                                     next: value.next as string | null }
}

const REGION = /^[a-z0-9-]{1,32}$/
/** (S2 C4a-2) The backend's SHOWN_ROWS: a JOINED row shows exactly its first min(identities, 200) rows. */
export const TERRAFORM_SHOWN_ROWS = 200
/** Why an identity is not joinable: the backend's ``aws_physical_identity.REASONS``, exactly. */
const NOT_JOINABLE = ["deposed_not_joined", "data_reference_not_joined", "unsupported_provider", "unsupported_type", "no_arn",
                      "arn_invalid", "arn_not_canonical", "arn_kind_mismatch", "identity_inconsistent", "account_unresolved",
                      "account_mismatch", "region_unresolved", "identity_unmapped"]
const OUTCOMES = new Set(["matched", "not_in_inventory", "ambiguous", ...NOT_JOINABLE.map((r) => `not_joinable:${r}`)])
/** A HELD row's reason (contract §4): the resolver's own holds, and the preview's -- ``ACCOUNT_NOT_JOINED:<state>`` is
 *  checked against the row's account apart. */
const HELD_REASONS = new Set([
  "BINDING_NOT_FOUND", "BINDING_RECORD_INVALID", "BINDING_REVOKED", "BINDING_ACCOUNT_MISMATCH", "ACCOUNT_NOT_REGISTERED",
  "ACCOUNT_REMOVED", "REGISTRATION_CHANGED", "DERIVATION_UNAVAILABLE", "BINDING_AUTHOR_REVOKED", "STATE_EMPTY",
  "NO_RESOLVED_IDENTITY", "WORKSPACE_REGION_MISMATCH", "RESOLUTION_INVALID", "BINDING_CHANGED", "INVENTORY_READ_DIFFERS",
])
/** A shown row's category, as the counts name it. */
const category = (outcome: string) => (outcome.startsWith("not_joinable:") ? "not_joinable" : outcome)
const exactly = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((k) => k in value)
const TF_KEYS = ["row", "binding_id", "state", "reason", "assessment", "acquisition", "binding_revision", "inventory_generation",
                 "counts", "rows", "omitted"] as const

/** (S2 C4a-2) The ``terraform`` section, read exactly: a HELD row shows nothing of its binding and names a reason the contract
 *  has; a JOINED one is assessed only, its counts whole and adding up, its rows exactly the first min(identities, 200) with
 *  known outcomes and per-category counts within (omitted 0: equal to) the totals, joined on EXACTLY the generation its
 *  computed account names. (SW117) */
function terraformSection(value: unknown, accounts: readonly PreviewAccount[]): TerraformPreviewBinding[] | null {
  if (!isRecord(value) || !exactly(value, ["effect", "bindings"]) || value.effect !== "none" || !Array.isArray(value.bindings)) return null
  const out: TerraformPreviewBinding[] = []
  for (const b of value.bindings) {
    if (!isRecord(b) || !exactly(b, TF_KEYS) || !isRecord(b.row) || !exactly(b.row, ["account_id", "region", "deployment"])) return null
    const { account_id: accountId, region, deployment } = b.row
    if (typeof accountId !== "string" || !ACCOUNT_ID.test(accountId) || !(region === null || (typeof region === "string" && REGION.test(region)))
        || !(deployment === null || isText(deployment)) || !isText(b.binding_id) || !Array.isArray(b.rows) || !isCount(b.omitted)) return null
    const row = { accountId, region: region as string | null, deployment: deployment as string | null }
    if (b.state === "HELD") {
      const of = accounts.find((a) => a.accountId === accountId)
      const reason = typeof b.reason === "string" ? b.reason : null
      const named = reason !== null && (HELD_REASONS.has(reason)
        || (of?.state !== "COMPUTED" && reason === `ACCOUNT_NOT_JOINED:${of?.state ?? "NOT_IN_PREVIEW"}`))
      if (!named || b.assessment !== null || b.acquisition !== null || b.binding_revision !== null
          || b.inventory_generation !== null || b.counts !== null || b.rows.length !== 0 || b.omitted !== 0) return null
      out.push({ row, bindingId: b.binding_id, state: "HELD", reason, bindingRevision: null, inventoryGeneration: null,
                 counts: null, rows: [], omitted: 0 })
      continue
    }
    if (b.state !== "JOINED" || b.reason !== null || b.assessment !== "assessed" || b.acquisition !== "unsupported"
        || !isInt(b.binding_revision) || (b.binding_revision as number) < 1 || !isCount(b.inventory_generation)) return null
    const c = counts(b.counts, ["identities", "matched", "not_in_inventory", "ambiguous", "not_joinable"])
    if (c === null || c.identities !== c.matched + c.not_in_inventory + c.ambiguous + c.not_joinable) return null
    const rows = b.rows.map((r) => (isRecord(r) && exactly(r, ["address", "inventory_uid", "outcome"]) && isText(r.address)
      && (r.inventory_uid === null || isText(r.inventory_uid)) && typeof r.outcome === "string" && OUTCOMES.has(r.outcome)
      ? { address: r.address, inventoryUid: r.inventory_uid as string | null, outcome: r.outcome } : null))
    if (rows.some((r) => r === null) || rows.length !== Math.min(c.identities, TERRAFORM_SHOWN_ROWS)
        || rows.length + (b.omitted as number) !== c.identities) return null
    // the rows shown are a prefix of the whole: never more of a category than its total. (With nothing omitted that IS
    // equality: the shown rows are all identities, and the totals add up to them.)
    const shownOf: Record<string, number> = {}
    for (const r of rows as { outcome: string }[]) shownOf[category(r.outcome)] = (shownOf[category(r.outcome)] ?? 0) + 1
    if (["matched", "not_in_inventory", "ambiguous", "not_joinable"].some((k) => (shownOf[k] ?? 0) > c[k])) return null
    // joined on the generation its OWN account was computed on -- never another account's, never a held one's
    const account = accounts.find((a) => a.accountId === accountId)
    if (!account || account.state !== "COMPUTED" || account.inventory.generation !== b.inventory_generation) return null
    out.push({ row, bindingId: b.binding_id, state: "JOINED", reason: null, bindingRevision: b.binding_revision as number,
               inventoryGeneration: b.inventory_generation as number,
               counts: { identities: c.identities, matched: c.matched, notInInventory: c.not_in_inventory, ambiguous: c.ambiguous,
                         notJoinable: c.not_joinable },
               rows: rows as TerraformPreviewBinding["rows"], omitted: b.omitted as number })
  }
  return out
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
  const level = setupLevelOf({ contract: json.setup_contract })
  if (level === null) return { kind: "UNAVAILABLE", status, code: SETUP_CONTRACT_UNKNOWN }
  // v1 under either setup level (a single draft); v2 only from a setup-level-5 answer (a plural draft); (S2 C4a-2) v3 only
  // from a setup-level-5 answer, single or plural as its draft_targets say
  const v3 = json.contract === PREVIEW_CONTRACT_V3 && level === SETUP_CONTRACT_LEVEL
  const v2 = (json.contract === PREVIEW_CONTRACT_V2 && level === SETUP_CONTRACT_LEVEL)
    || (v3 && isRecord(json.draft_targets) && "deployment_ids" in json.draft_targets)
  if (json.contract !== PREVIEW_CONTRACT && !v2 && !v3) return { kind: "UNAVAILABLE", status, code: PREVIEW_CONTRACT_UNKNOWN }
  const malformed: PreviewRead = { kind: "UNAVAILABLE", status, code: "MALFORMED_RESPONSE" }
  const digests = [json.preview_digest, json.basis_digest, json.result_digest]
  if (!digests.every((d) => typeof d === "string" && PREVIEW_DIGEST.test(d))) return malformed
  const [previewDigest, basisDigest, resultDigest] = digests as string[]
  if (contentHash({ basis_digest: basisDigest, result_digest: resultDigest }) !== previewDigest) return malformed
  if (!(PREVIEW_STATES as readonly unknown[]).includes(json.state)) return malformed
  const setup = json.setup
  const targets = json.draft_targets
  if (!isRecord(setup) || !isText(setup.setup_id) || !isCount(setup.intent_revision) || !isCount(setup.state_version)
      || !isRecord(targets) || !isText(targets.system_id) || !isRecord(json.rules)) return malformed
  // v1 names its one Deployment; v2 every draft Deployment (distinct authored ids), and nothing else
  const ids = v2 ? targets.deployment_ids : [targets.deployment_id]
  if (!(v2 ? Object.keys(targets).length === 2 && "deployment_ids" in targets : isText(targets.deployment_id))
      || !Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string" && DEPLOYMENT_ID.test(id))
      || new Set(ids).size !== ids.length) return malformed
  const deploymentIds = ids as string[]
  const ours = new Set(deploymentIds.map((id) => `DEPLOYMENT#${id}`))
  const total = counts(json.counts, ["members", "dependencies", "held", "not_members", "stale_members", "unlisted"])
  if (total === null || !Array.isArray(json.accounts)) return malformed
  // (PC1 S0-F) the draft-wide shared count, the server's: absent = not reported; malformed = the whole preview is not read
  const notMemberReasons = readNotMemberReasons(json.not_member_reasons, total.not_members)
  if (notMemberReasons === undefined) return malformed
  const accounts = json.accounts.map((a) => account(a, v2, ours))
  if (accounts.some((a) => a === null)) return malformed
  const read = accounts as PreviewAccount[]
  if (new Set(read.map((a) => a.accountId)).size !== read.length) return malformed
  // COMPUTED: every account computed (the backend's own rule); a held account makes the whole preview HELD.
  if ((json.state === "COMPUTED") !== read.every((a) => a.state === "COMPUTED")) return malformed
  const contract = json.contract as string
  // (S2 C4a-2) v3 carries exactly one ``terraform`` section; v1 / v2 carry none
  const terraform = v3 ? terraformSection(json.terraform, read) : null
  if ((v3 && terraform === null) || (!v3 && "terraform" in json)) return malformed
  const shown = json.page === undefined ? null : page(json.page, previewDigest, contract)
  if (json.page !== undefined && shown === null) return malformed
  // (S1A-UI-PREVIEW-02) a page of an account this preview does not have is no page of it
  if (shown !== null && !read.some((a) => a.accountId === shown.accountId)) return malformed
  // (S1b) a page's entries carry contexts exactly as its account's decoration says: every member, or none
  if (shown !== null) {
    const of = read.find((a) => a.accountId === shown.accountId)?.deploymentContext ?? null
    const contexts = shown.bucket === "members" && of?.state === "SERVED"
    if (!onlyOurs(shown.entries, ours)
        || !shown.entries.every((e) => (contexts ? deploymentContext(e.deployment_context) !== null : !("deployment_context" in e)))) {
      return malformed
    }
  }
  return { kind: "OK", value: {
    state: json.state as PreviewState, previewDigest, basisDigest, resultDigest,
    setup: { setupId: setup.setup_id, intentRevision: setup.intent_revision, stateVersion: setup.state_version },
    systemId: targets.system_id, deploymentId: v2 ? null : (targets.deployment_id as string), contract, deploymentIds,
    rules: json.rules,
    counts: total as unknown as PreviewCounts, accounts: read, page: shown, terraform, notMemberReasons,
  } }
}

/** (S1b) The OUTER state is what authorizes a Finish: a COMPUTED preview. A HELD preview authorizes none, whatever an account's
 *  nested decoration says (a context computed before the account was held is a diagnostic). */
export function previewAuthorizesFinish(preview: Preview): boolean {
  return preview.state === "COMPUTED"
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
  PREVIEW_OF_ANOTHER_VERSION: "That answer is of another saved version of this setup; nothing of it was added.",
  PAGE_OF_ANOTHER_LIST: "That page answered another account or list; nothing of it was added.",
  SETUP_WITHHELD: "This setup includes an account you cannot read now, so it is not shown.",
  BASE_REVISION_CONFLICT: "Declarations changed since this setup was saved. Nothing was saved; save the setup again and review the new preview.",
}

export function previewRefusalSentence(code: string): string | null {
  return PREVIEW_REFUSALS[code] ?? null
}

const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const named = (value: unknown): string => (typeof value === "string" ? value : JSON.stringify(value))

/** (S1A-UI-PREVIEW-03) What a COMPUTED account's coverage says the plan did not reach, in words -- exactly the limits the
 *  backend supplied (``complete``/``incomplete_reason``, ``partial``, ``withheld``, ``frontier_count``,
 *  ``conflicting_rows``); none when it names none. A held account is said apart (heldSentence), never as a limit. */
export function coverageLimits(account: PreviewAccount): string[] {
  const c = account.coverage
  if (!c) return []
  const limits: string[] = []
  if (c.complete === false) limits.push(`not completely planned${c.incomplete_reason ? ` (${named(c.incomplete_reason)})` : ""}`)
  const partial = listOf(c.partial)
  if (partial.length) limits.push(`partly planned: ${partial.map(named).join(", ")}`)
  const withheld = listOf(c.withheld)
  if (withheld.length) limits.push(`${withheld.length} withheld: ${withheld.slice(0, 5).map(named).join(", ")}${withheld.length > 5 ? ", ..." : ""}`)
  if (typeof c.frontier_count === "number" && c.frontier_count > 0) limits.push(`${c.frontier_count} resource(s) at the edge of the plan were not followed`)
  const conflicting = listOf(c.conflicting_rows)
  if (conflicting.length) limits.push(`${conflicting.length} conflicting row(s)`)
  return limits
}

/** A preview read in words (never a claim the browser makes). A computed preview whose coverage names limits, or with rows
 *  in no list, is said to be limited -- never a whole answer. */
export function previewSentence(read: PreviewRead): string {
  if (read.kind === "REFUSED") return `${previewRefusalSentence(read.code) ?? "The preview was refused."} (${read.code})`
  if (read.kind === "UNAVAILABLE") return `The preview could not be read (${read.code}).`
  const p = read.value
  const c = p.counts
  const whole = boundarySummary(c, p.notMemberReasons)                   // (PC1 S0-F) owned / used / unresolved / shared
  if (p.state !== "COMPUTED") {
    return `The preview is held: ${p.accounts.filter((a) => a.state !== "COMPUTED").length} account(s) could not be computed, so `
      + `these counts (${whole}) are not a whole answer and cannot be finished.`
  }
  const limited = p.accounts.filter((a) => coverageLimits(a).length).length
  if (!limited && !c.unlisted) return `If you finish saved revision ${p.setup.intentRevision}, this system would have ${whole}. Nothing is applied yet.`
  const why = [limited ? `${limited} account(s) not completely covered` : "", c.unlisted ? `${c.unlisted} row(s) in no list` : ""]
    .filter(Boolean).join(", ")
  return `If you finish saved revision ${p.setup.intentRevision}, this system would have ${whole} -- but this preview is limited `
    + `(${why}; shown below), so it is not a complete answer. Nothing is applied yet.`
}
