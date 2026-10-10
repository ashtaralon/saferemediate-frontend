/**
 * Settings > Accounts: the backend's account-registry contract
 * (`/api/admin/accounts`, reached through `/api/proxy/admin/accounts`) and the
 * pure helpers the page renders it with.
 *
 * Two shapes share one list route:
 *  - MEMBER-ACCOUNT mode (`mode: "MEMBER_ACCOUNTS"`): a customer-resident install.
 *    The web records the operator's intent (register / check connection) and the
 *    account connector performs it within seconds; rows, their status and what was
 *    discovered in each account are the connector's (saferemediate-backend
 *    api/account_registry.py, cyntro_data/accounts/connector.py).
 *  - legacy (no `mode`): the hosted plane's registry.
 */

import releaseContract from "./release-contract.json"
import { LIFECYCLE_NOW } from "./inventory-copy"

export const MEMBER_ACCOUNTS_MODE = "MEMBER_ACCOUNTS"

/**
 * The account-registration contract this frontend requires of the backend that serves it (lib/release-contract.json).
 * Level 1 = the option-C registration: the unverified path's acknowledgement, the access check, the confirmation and the
 * S3b recovery this page offers; level 2 adds the installation gate and the first inventory from its runs; level 3 adds
 * removing a registration that was never activated (/withdraw) and the runs' measured counts; level 4 adds an account by
 * its read role ARN (checked against the account), the connection stack's instructions before any account
 * (/connect/instructions), and the organization listing role set up from Settings (/organization/discover {role_arn},
 * /organization/template, setup.role); level 5 adds removing an ACTIVATED account (/offboard with the account id typed) and
 * the listing's removed audit. The release bundle refuses to
 * pair this frontend with a backend whose connector provides less, and the connector's installer never goes below it (saferemediate-backend deploy/customer_pilot/bin/release_bundle.py,
 * install_floor.py). Against an older connector the unverified path would promise "no AWS call" while it calls AWS.
 */
export const REQUIRED_ACCOUNT_REGISTRATION_CONTRACT: number = releaseContract.requires.account_registration

export interface PendingAccountRequest {
  action: string
  status: string
  requested_at?: string | null
}

export interface DiscoveredTrail {
  name?: string | null
  arn?: string | null
  home_region?: string | null
  bucket?: string | null
  prefix?: string | null
  is_organization_trail?: boolean
  is_multi_region?: boolean
  kms_key_id?: string | null
}

export interface DiscoveredFlowLogGroup {
  name?: string | null
  arn?: string | null
  region?: string | null
  vpc_ids?: string[]
  log_format?: string | null
  certified_format?: boolean
}

export interface DiscoveredEksCluster {
  name?: string | null
  region?: string | null
  endpoint_public_access?: boolean
  endpoint_private_access?: boolean
  public_access_cidrs?: string[]
  authentication_mode?: string | null
}

/** What the account connector found in a member account (`{}` until it has read the account). */
export interface AccountSources {
  regions?: string[]
  trails?: DiscoveredTrail[]
  flow_log_groups?: DiscoveredFlowLogGroup[]
  eks_clusters?: DiscoveredEksCluster[]
  evidence_role?: boolean
  discovery_errors?: string[]
}

/** A list row's per-feature coverage across the account's registered regions (absent until discovered). */
export type AccountFeatureCoverageStatus = "COVERED" | "PARTIAL" | "LACKING"

export interface AccountFeatureCoverage {
  feature: string
  label: string
  /** PARTIAL = covered in some registered regions, lacking in others. */
  status: AccountFeatureCoverageStatus | string
  regions_lacking?: string[] | null
}

export interface ManagedAccount {
  customer_id: string
  account_id: string
  display_name: string
  environment: string
  regions: string[]
  onboarding_status: string
  collection_mode: string
  read_enabled: boolean
  verification_enabled: boolean
  mutation_enabled: boolean
  validation_message?: string | null
  last_validated_at?: string | null
  // Legacy (hosted plane) only.
  install_method?: string
  evidence_source_count?: number
  last_evidence_at?: string | null
  // Member-account mode only.
  sources?: AccountSources | null
  pending_request?: PendingAccountRequest | null
  is_platform_account?: boolean
  /** Platform row only: whether this install also collects its own account. false = control plane only (it runs
   *  Cyntro and is never collected or served). Absent: not reported -- claim neither. */
  data_account?: boolean
  coverage?: AccountFeatureCoverage[] | null
  /** Registered Regions this install does not serve (the serving path's own rule). Absent: not reported. */
  regions_not_served?: string[] | null
  /** Member accounts: the name AWS holds for the account, read by the connector once it connects (read-only).
   *  Until then display_name is the account ID; _error says why the last read failed. */
  aws_account_name?: string | null
  aws_account_name_read_at?: string | null
  aws_account_name_error?: string | null
  /** Member accounts registered under option C: the registration's progress (backend api/account_registry.py
   *  _registration_progress). Absent or null for rows registered before it. Provisional, not a frozen contract. */
  registration?: RegistrationProgress | null
  /** Member accounts: where this account's DATA stands on its way to being shown (its stage, census and inventory) and
   *  the legacy "show its data" request. null for the platform account; absent from a backend without it. */
  data_activation?: DataActivation | null
}

// ── Data activation: from a member account's first inventory to its data being shown ─────────────────────────────
// Automatic onboarding (Alon, 2026-10-10): the person's ONE informed confirmation ("Confirm and start collecting", the
// connector's /activate with ACTIVATION_CONSENT) covers collecting, checking and showing the account's data; Cyntro then
// moves it through its stages on its own. Only an account connected before that consent existed (consent collect_only or
// none) still needs a separate request to show its data (POST /{account_id}/activate-data). Every value below is the
// backend's (the listing's `data_activation`); this page only says it, and never says a stage it was not told.

/** What the informed confirmation consents to, sent with the confirm's POST /{account_id}/activate. */
export const ACTIVATION_CONSENT = { consent: "collect_and_show", consent_version: "v2" } as const

export type DataActivationRequestStatus = "queued" | "running" | "completed" | "refused"

/** The latest "show its data" request for one account, as the listing reports it. */
export interface DataActivationRequest {
  request_id: string | null
  status: DataActivationRequestStatus | string | null
  requested_by?: { display?: string | null } | null
  requested_at?: string | null
  completed_at?: string | null
  /** What the request decided; `permit_granted` = its checks passed and the data is being turned on. */
  outcome?: string | null
  /** A refused request's codes, verbatim (dataActivationCodeText words the known ones). */
  refusals?: string[] | null
}

export type DataActivationStage =
  | "collecting" | "staging" | "checking" | "activating" | "publishing" | "active" | "held" | "awaiting_consent" | "offboarded"

/** Whether the account's inventory or census is shown yet, and why not. */
export interface DataPublicationState {
  state: "ready" | "pending" | "held" | string
  detail?: string | string[] | null
}

export interface DataActivation {
  /** The account's data lifecycle state (SHADOW, READY, ACTIVE, ...), verbatim; null when it cannot be read. */
  state: string | null
  policy: "STAGE_ONLY" | "AUTO_ACTIVATE_WHEN_READY" | string | null
  /** The account's data is turned on; null when it cannot be read. */
  active: boolean | null
  /** Whether a "show its data" request may be asked for now; when false, `blocked_by` names why. */
  can_request: boolean
  blocked_by: string[]
  request: DataActivationRequest | null
  /** What the account was connected with: collect_and_show (the informed confirmation), collect_only or null (before it). */
  consent?: "collect_and_show" | "collect_only" | string | null
  stage?: DataActivationStage | string | null
  /** Held: the hold's named codes, verbatim. */
  stage_detail?: string[] | null
  /** When the account entered its stage (the polling bound counts from it). */
  stage_since?: string | null
  census?: DataPublicationState | null
  inventory?: DataPublicationState | null
  /** PROVISIONAL NAME (no backend capture yet; replace with the captures' spelling): the registration this progress belongs
   *  to. Read only through dataActivationOtherRegistration. */
  registration_id?: string | null
  /** PROVISIONAL NAME (mirrors the backend record's activation_permit_revoked_at; replace with the captures' spelling): when
   *  the permit to show this account's data was revoked. Read only through dataActivationRevoked. */
  permit_revoked_at?: string | null
}

/** The proxied route of the separate "show its data" request (legacy and revoked accounts only). */
export function dataActivationPath(accountId: string, customerId: string): string {
  return `/api/proxy/admin/accounts/${encodeURIComponent(accountId)}/activate-data?customer_id=${encodeURIComponent(customerId)}`
}

/** Refusal, blocker and hold codes this page can put in words, by the code's head (before any ":<detail>"). The codes come
 *  from the backend's data-activation module (blocked_by, outcomes) and its activation-permit refusals. */
const DATA_ACTIVATION_CODES: Record<string, string> = {
  requester_not_verified: "Cyntro could not verify the person who asked.",
  platform_not_ready:
    "This installation's own account is not operational yet; an account's data can be turned on only once it is.",
  acceptance_not_current: "This account has no current passing acceptance run: none is recorded, or the last one has expired.",
  tenant_not_ready: "This account's data is not checked and ready yet, so it cannot be turned on.",
  lifecycle_unreadable: "Cyntro could not read where this account's data stands.",
  acceptance_run_not_named: "The acceptance pass on record does not name the run it came from.",
  acceptance_not_installed_readonly: "The acceptance pass on record is not from the installed read-only acceptance suite.",
  projection_write_not_configured: "This installation is not configured to write the record that turns data on.",
  tenant_claims_more_than_its_record_supports: "This account's recorded stage claims more than its record supports.",
  already_active: "This account's data is already active.",
  account_offboarded: "This account was removed from Cyntro.",
  first_inventory_not_collected: "This account's first inventory has not been collected yet.",
}

/**
 * A short line for a known code, or null for a code this page does not know (the code itself is always shown verbatim
 * beside it). tenant_not_ready:<STATE> also says where the data stands now.
 */
export function dataActivationCodeText(code: string): string | null {
  const [head, ...rest] = code.split(":")
  if (!Object.prototype.hasOwnProperty.call(DATA_ACTIVATION_CODES, head)) return null
  const now = head === "tenant_not_ready" ? LIFECYCLE_NOW[rest.join(":")] : undefined
  return now ? `${DATA_ACTIVATION_CODES[head]} Now: ${now}.` : DATA_ACTIVATION_CODES[head]
}

/** Who asked, as people read it: the backend's display, or "an operator (<subject>)" for a bare token identity. */
function requesterLabel(request: DataActivationRequest): string | null {
  const who = removedByLabel({ by_display: request.requested_by?.display ?? null })
  return who?.startsWith("An operator (") ? `a${who.slice(1)}` : who
}

const REQUEST_OPEN = new Set(["queued", "running"])

/** The stages in which Cyntro is still moving the account's data on its own. */
const STAGES_MOVING = new Set(["collecting", "staging", "checking", "activating", "publishing", "active"])

/**
 * A legacy account: connected before the informed confirmation existed (consent collect_only or none recorded), its data
 * staged and waiting for someone to ask that it be shown. Never an option-C registration that has not been confirmed yet --
 * its Confirm IS the consent.
 */
export function dataActivationLegacy(
  account: Pick<ManagedAccount, "data_activation" | "registration" | "is_platform_account">,
): boolean {
  const activation = account.data_activation
  return Boolean(activation) && activation?.stage === "awaiting_consent" && activation?.consent !== "collect_and_show"
    && !collectionNotStarted(account)
}

/**
 * Progress belongs to the CURRENT registration only: the listing's data_activation names an earlier registration of this
 * account than the one it shows. Its stage, census and inventory are then that registration's -- never said as this one's.
 */
export function dataActivationOtherRegistration(account: Pick<ManagedAccount, "data_activation" | "registration">): boolean {
  const current = account.registration?.registration_id
  const named = account.data_activation?.registration_id
  return Boolean(current && named && named !== current)
}

/** The first inventory, only when it is the CURRENT registration's; `other` when it names an earlier one (never shown). */
export function currentFirstInventory(
  account: Pick<ManagedAccount, "registration">,
): { outcome: FirstInventoryOutcome | null; other: boolean } {
  const outcome = account.registration?.first_inventory ?? null
  const current = account.registration?.registration_id
  if (outcome && current && outcome.registration_id && outcome.registration_id !== current) return { outcome: null, other: true }
  return { outcome, other: false }
}

/**
 * The permit to show this account's data was revoked, and nothing has turned it back on: not active, not moving again on its
 * own. It is never retried on its own -- a person confirms again (dataActivationUpgradeOffered).
 */
export function dataActivationRevoked(account: Pick<ManagedAccount, "data_activation">): boolean {
  const activation = account.data_activation
  const at = activation?.permit_revoked_at
  return typeof at === "string" && at.trim() !== "" && activation?.active !== true && !STAGES_MOVING.has(activation?.stage ?? "")
}

/** "18/31": the first inventory's collected work items of all its items, from its own runs; null when not reported. */
function collectedOfTotal(outcome: FirstInventoryOutcome | null | undefined): { done: number; total: number } | null {
  if (!outcome || !Array.isArray(outcome.items) || outcome.items.length === 0) return null
  const done = (outcome.counts?.collected ?? 0) + (outcome.counts?.completed ?? 0)
  return { done, total: outcome.items.length }
}

/** The held codes said in words: each known code's line; the codes themselves are shown verbatim beside it. */
function heldText(codes: string[]): string {
  const known = codes.map(dataActivationCodeText).filter((text): text is string => Boolean(text))
  if (known.length) return known.join(" ")
  return codes.length ? "for a reason named below." : "no reason was recorded."
}

export type DataActivationLineKind =
  | "COLLECTING" | "STAGING" | "CHECKING" | "ACTIVATING" | "PUBLISHING" | "ACTIVE" | "HELD" | "LEGACY" | "AWAITING_CONSENT"
  | "OFFBOARDED" | "UNKNOWN_STAGE" | "QUEUED" | "RUNNING" | "APPROVED" | "FINISHED" | "REFUSED" | "UNKNOWN_REQUEST"
  | "REVOKED" | "OTHER_REGISTRATION"

export interface DataActivationLine {
  kind: DataActivationLineKind
  text: string
  /** Codes shown verbatim under the line (a hold's stage_detail, a refused request's outcome and refusals). */
  codes: string[]
}

function requestLine(request: DataActivationRequest): DataActivationLine {
  switch (request.status) {
    case "queued": {
      const by = requesterLabel(request)
      return { kind: "QUEUED", codes: [], text: `Activation requested${by ? ` by ${by}` : ""} — waiting to be processed` }
    }
    case "running": return { kind: "RUNNING", codes: [], text: "Checking acceptance…" }
    case "completed":
      return request.outcome === "permit_granted"
        ? { kind: "APPROVED", codes: [], text: "Approved — data is being activated" }
        : { kind: "FINISHED", codes: [],
            text: request.outcome ? `Activation request completed: ${request.outcome}` : "Activation request completed with no outcome recorded" }
    case "refused": {
      const refusals = Array.isArray(request.refusals) ? request.refusals : []
      const outcome = request.outcome && !refusals.includes(request.outcome) ? [request.outcome] : []
      return { kind: "REFUSED", text: "Activation refused", codes: [...outcome, ...refusals] }
    }
    default:
      return { kind: "UNKNOWN_REQUEST", codes: [], text: `Activation request in a state Cyntro does not know (${request.status ?? "none"})` }
  }
}

/**
 * The ONE line that says where this account's data stands, from the listing only. With a stage (automatic onboarding) the
 * stage speaks -- except that a "show its data" request still queued or being checked, or refused while the account awaits
 * it, is said by the request. Without a stage (a backend before automatic onboarding): active, else the request's status.
 * Null when there is nothing to say (no data activation, or not active and nothing asked).
 */
const WAITING_FOR_THIS_REGISTRATION: DataActivationLine =
  { kind: "OTHER_REGISTRATION", codes: [], text: "Waiting for this registration's data" }

export function dataActivationLine(
  account: Pick<ManagedAccount, "data_activation" | "registration" | "is_platform_account">,
): DataActivationLine | null {
  const activation = account.data_activation
  if (!activation) return null
  if (dataActivationOtherRegistration(account)) return WAITING_FOR_THIS_REGISTRATION
  const request = activation.request
  const stage = activation.stage
  if (request && REQUEST_OPEN.has(request.status ?? "")) return requestLine(request)
  if (dataActivationRevoked(account)) {
    // A person confirmed again and it was refused after the revocation: the refusal is the newer fact.
    const refusedAfter = request?.status === "refused" && Date.parse(request.completed_at ?? "") >= Date.parse(activation.permit_revoked_at ?? "")
    return refusedAfter && request ? requestLine(request)
      : { kind: "REVOKED", codes: [], text: "Data access was revoked — confirm again to show this account's data" }
  }
  if (!stage) {
    if (activation.active === true) return { kind: "ACTIVE", text: "Data active", codes: [] }
    return request ? requestLine(request) : null
  }
  switch (stage) {
    case "collecting": {
      const first = currentFirstInventory(account)
      if (first.other) return WAITING_FOR_THIS_REGISTRATION
      const counted = collectedOfTotal(first.outcome)
      return { kind: "COLLECTING", codes: [], text: counted ? `Collecting (${counted.done}/${counted.total})` : "Collecting" }
    }
    case "staging": return { kind: "STAGING", codes: [], text: "Staging the collected data" }
    case "checking": return { kind: "CHECKING", codes: [], text: "Checking the data" }
    case "activating": return { kind: "ACTIVATING", codes: [], text: "Turning the data on" }
    case "publishing": return { kind: "PUBLISHING", codes: [], text: "Publishing inventory and census" }
    case "active": return { kind: "ACTIVE", codes: [], text: "Data active" }
    case "held": {
      const codes = Array.isArray(activation.stage_detail) ? activation.stage_detail : []
      return { kind: "HELD", codes, text: `Held: ${heldText(codes)}` }
    }
    case "awaiting_consent":
      if (request?.status === "refused") return requestLine(request)
      return dataActivationLegacy(account)
        ? { kind: "LEGACY", codes: [], text: "This account was connected for collection only. Show its data?" }
        : { kind: "AWAITING_CONSENT", codes: [], text: "Waiting for consent to show its data" }
    case "offboarded": return { kind: "OFFBOARDED", codes: [], text: "Removed from Cyntro: its data is not shown" }
    default: return { kind: "UNKNOWN_STAGE", codes: [], text: `Data in a stage Cyntro does not know (${stage})` }
  }
}

/** Data on AND its inventory ready: the only success that ends the page's refresh (an older backend reports no inventory). */
function dataActivationSucceeded(activation: DataActivation): boolean {
  return activation.active === true && (activation.inventory ? activation.inventory.state === "ready" : true)
}

/**
 * A stage in which the page keeps re-reading the list, bounded by DATA_ACTIVATION_STAGE_BOUND_MS: Cyntro is still moving the
 * data (collecting through publishing, or active with its inventory not ready yet), a request is queued or being checked, or
 * (an older backend) a request was approved and the data is not active yet. A hold, a refusal, an account awaiting consent,
 * a removal and an unknown stage are settled: nothing more happens on its own.
 */
function dataActivationMoving(activation: DataActivation): boolean {
  if (activation.request && REQUEST_OPEN.has(activation.request.status ?? "")) return true
  if (dataActivationRevoked({ data_activation: activation })) return false
  if (dataActivationSucceeded(activation)) return false
  if (activation.stage) return STAGES_MOVING.has(activation.stage)
  return activation.request?.status === "completed" && activation.request.outcome === "permit_granted"
}

/** The instant the bound counts from: the open request's, the stage's own (stage_since), or (an older backend) the
 *  approval's. Null when the backend sent none that parses: then the page does not refresh on its own. */
function dataActivationSince(activation: DataActivation): number | null {
  const request = activation.request
  const at = request && REQUEST_OPEN.has(request.status ?? "") ? request.requested_at
    : activation.stage ? activation.stage_since
    : request?.completed_at
  const parsed = typeof at === "string" && ISO_INSTANT.test(at) ? Date.parse(at) : Number.NaN
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * How long one stage may stay unchanged while the page keeps refreshing it. The backend reports no measured cadence for its
 * processing passes, and the confirmation promises only "usually within minutes": a stage still unchanged after 30 minutes
 * is past that by any reading, so the page stops refreshing and says so ("taking longer than expected") rather than spinning
 * on a request nobody is processing. Counted from the backend's own stage_since, so a reload does not restart it.
 */
export const DATA_ACTIVATION_STAGE_BOUND_MS = 30 * 60 * 1000

export type DataActivationRefresh =
  | { state: "MOVING"; until: number }
  | { state: "OVERDUE"; since: string }
  | { state: "SETTLED" }

export function dataActivationRefresh(
  activation: DataActivation | null | undefined,
  now: number,
  registration?: Pick<RegistrationProgress, "registration_id"> | null,
): DataActivationRefresh {
  if (!activation || !dataActivationMoving(activation)) return { state: "SETTLED" }
  // An earlier registration's progress is never refreshed as this one's: its stage instant is not this registration's.
  const current = registration?.registration_id
  if (current && activation.registration_id && activation.registration_id !== current) return { state: "SETTLED" }
  const since = dataActivationSince(activation)
  if (since === null) return { state: "SETTLED" }
  const until = since + DATA_ACTIVATION_STAGE_BOUND_MS
  return now < until ? { state: "MOVING", until } : { state: "OVERDUE", since: new Date(since).toISOString() }
}

/** The "show its data" request is offered -- a fresh, explicit confirmation, never an automatic retry: a legacy account or one
 *  whose permit was revoked, of THIS registration, the backend says it can be asked for, and none is open. */
export function dataActivationUpgradeOffered(
  account: Pick<ManagedAccount, "data_activation" | "registration" | "is_platform_account">,
): boolean {
  const activation = account.data_activation
  return (dataActivationLegacy(account) || dataActivationRevoked(account)) && !dataActivationOtherRegistration(account)
    && !collectionNotStarted(account) && activation?.can_request === true && !REQUEST_OPEN.has(activation?.request?.status ?? "")
}

/** What "Now:" says on the account's Overview and Inventory pages for its stage (lowercase, inside a sentence). */
export function dataActivationNowPhrase(
  account: Pick<ManagedAccount, "data_activation" | "registration" | "is_platform_account">,
): string | null {
  const activation = account.data_activation
  const stage = activation?.stage
  if (!activation || !stage) return null
  if (dataActivationOtherRegistration(account)) return "waiting for this registration's data"
  if (dataActivationRevoked(account)) return "data access was revoked; it is shown again once someone confirms in Settings › Accounts"
  switch (stage) {
    case "collecting": {
      const first = currentFirstInventory(account)
      if (first.other) return "waiting for this registration's data"
      const counted = collectedOfTotal(first.outcome)
      return counted ? `collecting its first inventory (${counted.done} of ${counted.total} work items collected)` : "collecting its first inventory"
    }
    case "staging": return "staging its collected data"
    case "checking": return "checking its data"
    case "activating": return "turning its data on"
    case "publishing": return "publishing its inventory and census"
    case "active": return "its data is on"
    case "held": {
      const codes = Array.isArray(activation.stage_detail) ? activation.stage_detail : []
      return codes.length ? `held (${codes.join(", ")})` : "held, with no reason recorded"
    }
    case "awaiting_consent":
      return dataActivationLegacy(account)
        ? "it was connected for collection only; its data is shown once someone asks for it in Settings › Accounts"
        : "waiting for consent to show its data"
    case "offboarded": return "removed from Cyntro"
    default: return `in a stage Cyntro does not know (${stage})`
  }
}

function detailText(detail: DataPublicationState["detail"]): string {
  const text = Array.isArray(detail) ? detail.join(", ") : typeof detail === "string" ? detail.trim() : ""
  return text ? ` (${text})` : ""
}

/**
 * The account's inventory, said from its data stage when the inventory is not shown yet; null when the listing has no stage
 * or says the inventory is ready (the inventory route's own answer then stands).
 */
export function inventoryStageText(account: Pick<ManagedAccount, "data_activation" | "registration" | "is_platform_account">): string | null {
  const activation = account.data_activation
  const inventory = activation?.inventory
  if (!activation?.stage || !inventory) return null
  // Another registration's inventory state is not this registration's: say only that this one's is awaited.
  if (dataActivationOtherRegistration(account)) return `Inventory appears once this account's data is active. Now: ${dataActivationNowPhrase(account)}.`
  if (inventory.state === "ready") return null
  if (inventory.state === "held") return `Inventory is held${detailText(inventory.detail)}.`
  if (activation.active === true) return "This account's data is on; its inventory is being published."
  return `Inventory appears once this account's data is active. Now: ${dataActivationNowPhrase(account)}.`
}

/** The account's census, said from census.state and the data stage; null when the listing says nothing or it is ready. */
export function censusStageText(account: Pick<ManagedAccount, "data_activation" | "registration" | "is_platform_account">): string | null {
  const activation = account.data_activation
  const census = activation?.census
  if (!activation?.stage || !census) return null
  // census.state is the CURRENT registration's only: another registration's is never said as this one's.
  if (dataActivationOtherRegistration(account)) return `The census appears once this account's data is active. Now: ${dataActivationNowPhrase(account)}.`
  if (census.state === "ready") return null
  if (census.state === "held") return `The census is held${detailText(census.detail)}.`
  if (activation.active === true) return "This account's data is on; its census is being published."
  return `The census appears once this account's data is active. Now: ${dataActivationNowPhrase(account)}.`
}

function refusalDetail(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  return record.detail && typeof record.detail === "object" ? (record.detail as Record<string, unknown>) : record
}

/** 409 ACTIVATION_NOT_REQUESTABLE's blockers (in `detail`, or at the top level), or null for any other answer. */
export function dataActivationNotRequestable(payload: unknown): string[] | null {
  const detail = refusalDetail(payload)
  if (detail?.code !== "ACTIVATION_NOT_REQUESTABLE") return null
  return Array.isArray(detail.blocked_by) ? detail.blocked_by.filter((code): code is string => typeof code === "string") : []
}

/** 409 ACTIVATION_ALREADY_REQUESTED (backend api/account_registry.py: {code, request_id, status}): the open request's
 *  status, or null for any other answer. */
export function dataActivationAlreadyRequested(payload: unknown): { status: string | null } | null {
  const detail = refusalDetail(payload)
  if (detail?.code !== "ACTIVATION_ALREADY_REQUESTED") return null
  return { status: typeof detail.status === "string" && detail.status ? detail.status : null }
}

/** The backend's collection mode for an account connected through its own read role (member_registry.COLLECTION_MODE_MEMBER). */
export const MEMBER_COLLECTION_MODE = "MEMBER_READ_ROLE"

/**
 * The name an account is shown by, everywhere it is named (rows, the group picker and chips, Connect / Check connection
 * labels). A member account: the name AWS holds for it, else its ID -- never a typed label, which an account registered
 * before names were read from AWS may still carry in display_name. Every other account (the platform account, hosted
 * rows) keeps its own name.
 */
export function accountLabel(account: Pick<ManagedAccount, "account_id" | "display_name" | "aws_account_name" | "collection_mode">): string {
  if (account.collection_mode === MEMBER_COLLECTION_MODE) return account.aws_account_name || account.account_id
  return account.display_name || account.account_id
}

/**
 * An option-C registration that has not been activated: the current registration carries no activation marker (the connector
 * writes it when activation starts). Cyntro has read nothing in the account and has not started collecting it, so there is no
 * inventory or census to read yet -- the page says so from this row instead of asking for one (r41, Alon 2026-10-08).
 * A legacy row (no registration) and the platform account are never this.
 */
export function collectionNotStarted(account: Pick<ManagedAccount, "registration" | "is_platform_account">): boolean {
  if (account.is_platform_account) return false
  const registration = account.registration
  return Boolean(registration?.registration_id) && !registration?.activation
}

/** Before activation: what the CURRENT registration's access check knows of the AWS name. The name a check returns is that
 *  check's evidence only -- a label set in AWS, never the account's durable name (accountLabel does not read it). */
function preActivationNameNote(registration: RegistrationProgress): string {
  const check = registration.access_check
  if (check?.outcome === "REACHED") {
    if (check.name_in_aws) {
      return `AWS name returned by the access check: ${check.name_in_aws}. It is a label set in AWS, not proof of who owns the account. Collection has not started.`
    }
    return `The access check reached the account but did not read its AWS name: ${nameUnreadableText(check.name_unreadable)}. Collection has not started.`
  }
  if (check?.outcome) return "AWS name not read: the access check did not reach the account."
  return "AWS name not read yet: Cyntro tries to read it during the access check."
}

/** Why a member account has no AWS name yet, in words; null when it has one (backend connector._read_account_name). */
export function accountNameNote(
  account: Pick<ManagedAccount, "aws_account_name" | "aws_account_name_error" | "registration" | "is_platform_account">,
): string | null {
  if (account.aws_account_name) return null
  if (collectionNotStarted(account) && account.registration) return preActivationNameNote(account.registration)
  const error = account.aws_account_name_error || ""
  if (error === "NOT_PERMITTED") {
    return "Name not readable from AWS: AWS denied permission to read it. A connection stack deployed before this release may need updating (account:GetAccountInformation)."
  }
  if (error.startsWith("UNREACHABLE")) return "Name not readable from AWS: Cyntro could not reach the AWS account API."
  if (error === "NO_NAME") return "Name not readable from AWS: AWS did not return a name."
  if (error) return `Name not readable from AWS (${error}).`
  return "Name not read from AWS yet."
}

export interface FailedAccountRequest {
  account_id: string
  action: string
  /** The connector's stable refusal code (requestOutcomeText); absent from an older backend. */
  outcome?: string | null
  detail?: string | null
  finished_at?: string | null
}

export interface MemberTrust {
  platform_account_id?: string | null
  organization_id?: string | null
  ready: boolean
}

/** A closed registration as the listing's audit reports it (backend api/account_registry._removed_view): never an account to
 *  act on. OFFBOARDED = removed after activation; WITHDRAWN = removed before it. */
export interface RemovedAccount {
  account_id: string
  display_name: string
  status: "OFFBOARDED" | "WITHDRAWN" | string
  by?: string | null
  /** How the remover reads for people (their verified token's name, else email; QA-01). `by` stays the actor. */
  by_display?: string | null
  at?: string | null
  from_status?: string | null
  removal_id?: string | null
}

export interface AccountListResponse {
  mode?: string
  accounts: ManagedAccount[]
  /** The audit of closed registrations, newest first (level 5). An older backend sends none. */
  removed?: RemovedAccount[]
  total: number
  registry_available: boolean
  member_trust?: MemberTrust
  failed_requests?: FailedAccountRequest[]
  summary: {
    connected: number
    needs_attention: number
    discovered: number
    mutation_enabled: number
  }
}

// ── per-region source discovery (`notes.regions` on GET /{account_id}/connect) ──

export type FeatureCoverageStatus = "COVERED" | "LACKING"

/** One source a feature needs but this region lacks, and the connector's reason. */
export interface FeatureLack {
  source: string
  reason: string
}

/** One product feature in one region: covered, or lacking with every missing source named. */
export interface FeatureCoverage {
  feature: string
  label: string
  status: FeatureCoverageStatus | string
  lacking?: FeatureLack[] | null
}

/** Fields every per-region source status carries; `detail` is the backend's sentence. */
export interface SourceStatus {
  status: string
  detail?: string | null
}

export interface VpcFlowSourceStatus extends SourceStatus {
  status: "PRESENT" | "PARTIAL" | "ABSENT" | "UNREADABLE" | string
  usable_groups?: string[] | null
  vpcs_without?: string[] | null
}

export interface CloudTrailSourceStatus extends SourceStatus {
  status: "PRESENT" | "ABSENT" | "NOT_LOGGING" | "UNREADABLE" | string
  trail?: string | null
  /** The ENI history read (cloudtrail:LookupEvents). */
  lookup_events?: "READABLE" | "DENIED" | "UNREADABLE" | string | null
}

export interface ConfigEniBaseline {
  interfaces: number
  recorded: number
  complete: boolean
}

export interface ConfigEniSourceStatus extends SourceStatus {
  status: "RECORDING" | "RECORDING_DAILY" | "NOT_RECORDED" | "NO_RECORDER" | "STOPPED" | "FAILING" | "UNREADABLE" | string
  recorder?: string | null
  managed_by?: "CUSTOMER" | "CONTROL_TOWER" | "CYNTRO" | string | null
  /** Set by the backend ONLY when recording is proven (RECORDING + complete baseline); never inferred here. */
  proven_coverage_start?: string | null
  baseline?: ConfigEniBaseline | null
}

export interface RegionSourceStatuses {
  vpc_flow?: VpcFlowSourceStatus | null
  cloudtrail?: CloudTrailSourceStatus | null
  config_eni?: ConfigEniSourceStatus | null
}

/** The fixed source keys, in display order. */
export const REGION_SOURCE_KEYS = ["vpc_flow", "cloudtrail", "config_eni"] as const
export type RegionSourceKey = (typeof REGION_SOURCE_KEYS)[number]

/** UI names for the backend's source keys; an unlisted key is shown as the backend sent it. */
export const REGION_SOURCE_LABELS: Record<RegionSourceKey, string> = {
  vpc_flow: "VPC Flow Logs",
  cloudtrail: "CloudTrail",
  config_eni: "AWS Config (network interfaces)",
}

export function regionSourceLabel(source: string): string {
  return (REGION_SOURCE_LABELS as Record<string, string>)[source] ?? source
}

export interface ConfigPrice {
  usd_per_item: string
  unit: string
  usage_type?: string | null
  effective?: string | null
  source?: string | null
}

/** The backend's cost estimate for a scoped Config recorder; every number is the backend's. */
export interface ConfigCost {
  /** null when no price could be read; `price_unavailable` then says why and no dollar amount is shown. */
  price?: ConfigPrice | null
  price_unavailable?: string | null
  baseline_items?: number | null
  baseline_usd?: string | null
  changes_last_7_days?: number | null
  /** false => the 7-day count is a lower bound ("at least"). */
  changes_complete?: boolean | null
  monthly_items_estimate?: number | null
  monthly_usd_estimate?: string | null
  basis?: string | null
}

export type ConfigEnablementOffer =
  | "CYNTRO_STACK"
  | "ADJUST_EXISTING_RECORDER"
  | "CONTROL_TOWER_MANAGED"
  | "NONE_NEEDED"
  | "UNREADABLE"

export interface ConfigEnablement {
  offer: ConfigEnablementOffer | string
  detail?: string | null
  /** For ADJUST_EXISTING_RECORDER / CONTROL_TOWER_MANAGED / UNREADABLE. */
  instructions?: string[] | null
  features_affected?: string[] | null
  scope_statement?: string | null
  extracted_fields?: string[] | null
  // Only for offer === "CYNTRO_STACK":
  stack_name?: string | null
  template_path?: string | null
  console_url?: string | null
  parameters?: Record<string, string> | null
  cli?: string | null
  cost?: ConfigCost | null
}

/** One registered region of a member account, as the connector read it. */
export interface RegionDiscovery {
  region: string
  discovered_at?: string | null
  features?: FeatureCoverage[] | null
  sources?: RegionSourceStatuses | null
  config_enablement?: ConfigEnablement | null
}

export interface ConnectionNotes {
  flow_log_groups_found?: number
  flow_log_groups_usable?: number
  flow_log_groups_without_required_fields?: (string | null)[]
  eks_clusters?: (string | null)[]
  discovered?: boolean
  /** One entry per registered region; empty (or absent, on an older backend) until discovered. */
  regions?: RegionDiscovery[] | null
}

/** `GET /{account_id}/connect`: the connection stack to deploy in the member account, every value filled in. */
export interface ConnectionInstructions {
  customer_id?: string
  account_id: string
  stack_name: string
  region: string
  template_path?: string
  console_url?: string
  parameters: Record<string, string>
  cli?: string
  notes?: ConnectionNotes
}

/** The connection-stack parameters the operator may leave blank (the stack's own defaults are ""). */
export const OPTIONAL_CONNECTION_PARAMETERS = ["ExistingFlowLogGroupArns", "FlowLogVpcId", "EksClusterName"] as const

/**
 * The proxied path for a backend account-admin path (`/api/admin/accounts/...`), or null when the
 * backend sent no such path. No fallback: a template the backend did not name is not offered.
 */
export function proxiedAccountAdminPath(backendPath?: string | null): string | null {
  const backendPrefix = "/api/admin/accounts/"
  if (typeof backendPath === "string" && backendPath.startsWith(backendPrefix) && backendPath.length > backendPrefix.length) {
    return `/api/proxy/admin/accounts/${backendPath.slice(backendPrefix.length)}`
  }
  return null
}

/** The proxied download for the backend's `template_path` (`/api/admin/accounts/connect/template`). */
export function proxiedTemplatePath(templatePath?: string | null): string {
  return proxiedAccountAdminPath(templatePath) ?? "/api/proxy/admin/accounts/connect/template"
}

/**
 * Only an https link from the backend is offered as a console button, exactly as the backend
 * wrote it; anything else is not a link. The frontend names no console host of its own.
 */
export function safeExternalUrl(value?: string | null): string | null {
  if (typeof value !== "string") return null
  try {
    return new URL(value).protocol === "https:" ? value : null
  } catch {
    return null
  }
}

// ── option C: the first account's journey (backend S1b-S3b; api/account_registry.py _registration_progress) ─────────
// add (listed, or unverified with an acknowledgement) -> check access -> confirm -> collection starts. Every value below is
// the backend's; this file only names what each one means and which ONE next step the operator may ask for.

/** The last access check on a pending registration (cyntro_data/accounts/access_check.py). A name is a label AWS holds,
 *  never proof; REACHED proves configured access through the read role, not ownership. */
export interface RegistrationAccessCheck {
  check_id?: string | null
  outcome?: "REACHED" | "REFUSED" | string | null
  refusal?: string | null
  answered_account?: string | null
  name_in_aws?: string | null
  name_unreadable?: string | null
  identity_observed_at?: string | null
  completed_at?: string | null
  requested_by?: string | null
}

/** The write-once activation marker: who turned reads on for this registration, on which check. */
export interface RegistrationActivation {
  decided_by?: string | null
  at?: string | null
  check_id?: string | null
}

export interface RegistrationActivationLast {
  outcome?: string | null
  step?: string | null
  at?: string | null
}

/** The request that holds the row in its current step; HELD when that step could not record its own result or exit. */
export interface RegistrationOwner {
  action: string
  request_status?: string | null
  outcome?: string | null
  held: boolean
  held_at?: string | null
  held_outcome?: string | null
}

/** Where the activated account's FIRST inventory dispatch stands. Dispatch is the queue accepting work items -- not
 *  collection: ALL_QUEUED never means collected. */
export interface FirstInventoryDispatch {
  state: "NOT_STARTED" | "PARTIALLY_QUEUED" | "BLOCKED" | "HELD" | "ALL_QUEUED" | string
  intended: number
  queued: number
  blocker?: string | null
  hold?: string | null
  checked_at?: string | null
  completed_at?: string | null
}

/** Stage1B G9: the organization evidence a listed registration was admitted on -- shown, never treated as a check. */
export interface ListedEvidence {
  kind?: string | null
  at?: string | null
  basis?: string | null
}

/** One work item of the first inventory, judged from its own run record (Stage1B K2). The counts are present only when
 *  that run MEASURED them (what it read from AWS and the resource records it normalized); absent, nothing was measured. */
export interface FirstInventoryItem {
  work_item_id: string
  source_type: string
  region?: string | null
  state: string
  reason?: string | null
  run_status?: string | null
  error_class?: string | null
  started_at?: string | null
  completed_at?: string | null
  records_read?: number
  facts_emitted?: number
}

/** Stage1B K2: where the inventory bootstrap THIS registration's confirmation dispatched stands, from the exact runs of
 *  that work. The inventory only: CloudTrail and flow logs are not part of it. */
export interface FirstInventoryOutcome {
  scope: "INVENTORY_BOOTSTRAP" | string
  registration_id: string
  state: string
  reason?: string | null
  observed_at?: string | null
  counts: Record<string, number>
  /** The resource records every item emitted, summed -- null unless EVERY item measured its own (a partial sum would read
   *  as the whole). */
  facts_emitted_total?: number | null
  items: FirstInventoryItem[]
}

export interface RegistrationProgress {
  registration_id: string
  registration_version: number
  registration_path?: "LISTED" | "PENDING" | string | null
  listed_evidence?: ListedEvidence | null
  checking: boolean
  access_check?: RegistrationAccessCheck | null
  activation?: RegistrationActivation | null
  activating: boolean
  activation_last?: RegistrationActivationLast | null
  owner?: RegistrationOwner | null
  first_inventory_dispatch?: FirstInventoryDispatch | null
  first_inventory?: FirstInventoryOutcome | null
}

/** The backend's ACTIVATION_CHECK_MAX_AGE: a confirmation consumes a check whose identity was observed STRICTLY less than
 *  15 minutes before the connector admits it. The page judges it by the wall clock; the connector decides. */
export const ACTIVATION_CHECK_MAX_AGE_MS = 15 * 60 * 1000

export type RegistrationAction = "access_check" | "activate" | "release" | "withdraw" | "offboard"

/** The proxied route for one journey request. */
export function registrationActionPath(action: RegistrationAction, accountId: string, customerId: string): string {
  const route = action === "access_check" ? "access-check" : action
  return `/api/proxy/admin/accounts/${encodeURIComponent(accountId)}/${route}?customer_id=${encodeURIComponent(customerId)}`
}

/** What a journey request names: exactly the registration and version the operator is looking at (and, to confirm, the
 *  check they confirm). The connector refuses a request for anything else. */
export function registrationRequestBody(
  registration: Pick<RegistrationProgress, "registration_id" | "registration_version">,
  checkId?: string,
): Record<string, string | number> {
  const body: Record<string, string | number> = {
    registration_id: registration.registration_id,
    registration_version: registration.registration_version,
  }
  if (checkId !== undefined) body.check_id = checkId
  return body
}

/** The connection states an ACTIVATED account lives in, from which it can be removed (backend
 *  registration_states.OFFBOARDABLE). */
const OFFBOARDABLE = new Set(["AWAITING_CONNECTION", "CONNECTION_FAILED", "CONNECTED", "ACTIVATION_FAILED"])

/**
 * Whether Remove is offered for an ACTIVATED account (offboard; level 5): a workload account whose registration carries its
 * activation, in a state an activated account lives in, with nothing in flight. A never-activated registration is removed by
 * withdraw instead. The connector decides again and refuses by name if the account moved on meanwhile.
 */
export function accountOffboardable(
  account: Pick<ManagedAccount, "onboarding_status" | "pending_request" | "registration" | "is_platform_account">,
): boolean {
  if (account.is_platform_account || account.pending_request) return false
  const registration = account.registration
  if (!registration?.activation || registration.activating) return false
  return OFFBOARDABLE.has(account.onboarding_status)
}

/** A removal of an activated account names the registration and version shown AND the account id the operator typed. */
export function offboardRequestBody(
  registration: Pick<RegistrationProgress, "registration_id" | "registration_version">,
  typedAccountId: string,
): Record<string, string | number> {
  return { ...registrationRequestBody(registration), confirm_account_id: typedAccountId.trim() }
}

const HEX32 = /^[0-9a-f]{32}$/

/** The instant an access check observed the account's identity, or NaN when it is missing or not an exact zoned instant. */
function observedAt(check: RegistrationAccessCheck | null | undefined): number {
  const at = typeof check?.identity_observed_at === "string" ? check.identity_observed_at : ""
  return ISO_INSTANT.test(at) ? Date.parse(at) : Number.NaN
}

/**
 * The ONE thing the operator can do next for an option-C registration, from the backend's row only (null for rows without
 * a registration, and for the connected lifecycle, which keeps Connect / Check connection):
 * - HELD: the step's request is kept as the proof of the row's state; only a release moves it on.
 * - CHECK_ACCESS (PENDING_UNVERIFIED): no access has been proven yet; `refused` is the last check, if it was refused.
 * - CONFIRM (ACCESS_CONFIRMABLE, its check REACHED and younger than the bound by the wall clock): confirm that check.
 * - CHECK_EXPIRED: confirmable no longer (older than the bound, or its time is not provable): check access again.
 * - ACTIVATION_FAILED: the step it stopped at; a retry continues the SAME confirmed check (the marker's).
 * - RECORDING_LISTED / CHECKING / ACTIVATING: the connector is working; nothing to ask. RECORDING_LISTED (LISTED_ADMITTED) is a
 *   listed account being recorded as pending: it reads nothing and is checked and confirmed like any other (Stage1B G9).
 */
export type RegistrationStep =
  | { kind: "HELD"; owner: RegistrationOwner }
  | { kind: "RECORDING_LISTED" }
  | { kind: "CHECK_ACCESS"; refused: RegistrationAccessCheck | null }
  | { kind: "CHECKING" }
  | { kind: "CONFIRM"; check: RegistrationAccessCheck; checkId: string; confirmableUntil: number }
  | { kind: "CHECK_EXPIRED"; check: RegistrationAccessCheck | null }
  | { kind: "ACTIVATING" }
  | { kind: "ACTIVATION_FAILED"; step: string | null; checkId: string | null }

export function registrationStep(
  account: Pick<ManagedAccount, "onboarding_status" | "registration">,
  now: number,
): RegistrationStep | null {
  const registration = account.registration
  if (!registration) return null
  if (registration.owner?.held === true) return { kind: "HELD", owner: registration.owner }
  const check = registration.access_check ?? null
  switch (account.onboarding_status) {
    case "LISTED_ADMITTED": return { kind: "RECORDING_LISTED" }
    case "PENDING_UNVERIFIED": return { kind: "CHECK_ACCESS", refused: check && check.outcome === "REFUSED" ? check : null }
    case "CHECKING": return { kind: "CHECKING" }
    case "ACTIVATING": return { kind: "ACTIVATING" }
    case "ACTIVATION_FAILED": {
      const marker = registration.activation?.check_id
      return { kind: "ACTIVATION_FAILED", step: registration.activation_last?.step ?? null,
               checkId: typeof marker === "string" && HEX32.test(marker) ? marker : null }
    }
    case "ACCESS_CONFIRMABLE": {
      const at = observedAt(check)
      const checkId = check?.check_id
      if (check?.outcome === "REACHED" && typeof checkId === "string" && HEX32.test(checkId) && !Number.isNaN(at)
          && at <= now && now - at < ACTIVATION_CHECK_MAX_AGE_MS) {
        return { kind: "CONFIRM", check, checkId, confirmableUntil: at + ACTIVATION_CHECK_MAX_AGE_MS }
      }
      return { kind: "CHECK_EXPIRED", check }
    }
    default: return null
  }
}

/**
 * The next instant the step changes by the clock alone, so an open page changes on its own; null when it never will:
 * a CONFIRM step stops being confirmable; a REACHED check observed ahead of this browser's clock (the server's clock leads)
 * becomes confirmable when the browser reaches its observation.
 */
export function registrationStepBoundary(step: RegistrationStep | null, now: number): number | null {
  if (step?.kind === "CONFIRM") return step.confirmableUntil > now ? step.confirmableUntil : null
  if (step?.kind === "CHECK_EXPIRED" && step.check?.outcome === "REACHED") {
    const at = observedAt(step.check)
    return !Number.isNaN(at) && at > now && at - now < ACTIVATION_CHECK_MAX_AGE_MS ? at : null
  }
  return null
}

/** Rows the connector is still moving on its own: a registration, a listed account being recorded, an access check, an
 *  activation. */
const CONNECTOR_WORKING = new Set(["REGISTERING", "LISTED_ADMITTED", "CHECKING", "ACTIVATING"])

/** First-inventory states whose runs are still moving (Stage1B K2); every other state stays put until something new
 *  happens (collected, failed, blocked by configuration, held, unavailable). */
const FIRST_INVENTORY_MOVING = new Set(["INTENDED", "QUEUED", "STARTING", "COLLECTING"])

/** Whether the page must keep re-reading the list for this row: the connector is still moving it, a request for it is
 *  open (a removal the connector has not recorded yet included), its first inventory is still being collected, or its data
 *  is still on its way to being shown (dataActivationRefresh: bounded by the stage's age, judged at `now`). */
export function accountNeedsPolling(
  account: Pick<ManagedAccount, "onboarding_status" | "pending_request" | "registration" | "data_activation">,
  now: number = Date.now(),
): boolean {
  return CONNECTOR_WORKING.has(account.onboarding_status) || Boolean(account.pending_request)
    || FIRST_INVENTORY_MOVING.has(account.registration?.first_inventory?.state ?? "")
    || dataActivationRefresh(account.data_activation, now, account.registration).state === "MOVING"
}

const STEP_LABEL: Record<string, string> = { register: "registration", access_check: "access check", activate: "activation" }

/** "the access check" -- the step a held request belongs to, in words. */
export function registrationStepLabel(action: string): string {
  return STEP_LABEL[action] ?? action
}

/** GET /api/admin/accounts/connect/instructions: the connection stack for an account not added yet -- this installation's
 *  parameters (the same for every account), its collection Region, and the stack output that names the read role. */
export interface InstallationStackInstructions {
  customer_id?: string
  stack_name: string
  region: string
  template_path?: string
  console_url?: string
  parameters: Record<string, string>
  cli?: string
  read_role_name: string
  read_role_output: string
}

const READ_ROLE_ARN = /^arn:(aws|aws-us-gov|aws-cn):iam::([0-9]{12}):role\/(.+)$/

export type ReadRoleArnCheck =
  | { state: "EMPTY" }
  | { state: "INVALID"; problem: string }
  | { state: "VALID"; arn: string; accountId: string }

/**
 * The account a pasted read role ARN names -- the ReadRoleArn output of this installation's connection stack, deployed in
 * the account being added -- exactly as the backend decides it (member_registry.member_read_role_account): an IAM role ARN
 * whose role is this installation's read role, no other name and no path. The account ID comes from AWS's own output.
 */
export function checkReadRoleArn(raw: string, customerId: string): ReadRoleArnCheck {
  const arn = raw.trim()
  if (!arn) return { state: "EMPTY" }
  const role = memberReadRoleName(customerId)
  const match = READ_ROLE_ARN.exec(arn)
  if (!match) {
    return { state: "INVALID", problem: `Not an IAM role ARN. Copy ReadRoleArn from the connection stack's Outputs tab (arn:aws:iam::<account>:role/${role}).` }
  }
  if (match[3] !== role) {
    return { state: "INVALID", problem: `This is role ${match[3]}, not this installation's read role ${role}. Deploy this installation's connection stack in the account and copy its ReadRoleArn output.` }
  }
  return { state: "VALID", arn, accountId: match[2] }
}

/** The read role an access check assumes in a member account (cyntro_data/accounts/member_registry.py member_role_name). */
export function memberReadRoleName(customerId: string): string {
  return `CyntroRead-${customerId}`
}

/** Why the AWS name of an account was not read by its access check, in words. */
export function nameUnreadableText(reason?: string | null): string {
  const why = reason || ""
  if (why === "NOT_PERMITTED") return "AWS denied permission to read it"
  if (why === "NO_NAME") return "AWS returned no name"
  if (why === "DEFERRED") return "the check left too little time to read it"
  if (why.startsWith("UNREACHABLE")) return "Cyntro could not reach the AWS account API"
  return why ? `not read (${why})` : "not read"
}

/** "Name in AWS: prod-payments" or "Name in AWS: not readable (...)": a label AWS holds, read by THIS check -- never a
 *  typed name, a list's name or an earlier check's. */
export function nameInAwsText(check: RegistrationAccessCheck | null | undefined): string {
  if (check?.name_in_aws) return `Name in AWS: ${check.name_in_aws}`
  return `Name in AWS: not readable (${nameUnreadableText(check?.name_unreadable)})`
}

/** Why an access check did not reach the account, in words (the connector's refusal codes). */
export function accessRefusalText(refusal: string | null | undefined, customerId: string, accountId?: string): string {
  const code = refusal || ""
  const role = memberReadRoleName(customerId)
  if (code.startsWith("ROLE_NOT_ASSUMABLE")) {
    const why = code.split(":")[1]
    // Alon, joint test 2026-10-05: the stack had been deployed -- in another account. Say where it has to be.
    return accountId
      ? `Cyntro could not use ${role} in account ${accountId}${why ? ` (${why})` : ""}. The connection stack must be deployed in ${accountId} itself: sign in, check the account ID at the top right of the AWS console, and create the stack there if it is not. A stack in any other account does not count. Then check access again.`
      : `Cyntro could not use ${role} in that account${why ? ` (${why})` : ""}. Deploy the connection stack there, then check access again.`
  }
  if (code === "IDENTITY_MISMATCH") return `${role} answered as a different account. Check the account ID and the stack that was deployed.`
  if (code.startsWith("UNREACHABLE")) return `Cyntro could not reach AWS to check access${code.includes(":") ? ` (${code.split(":")[1]})` : ""}. Check access again.`
  if (code === "REGIONS_INVALID") return "The account has no valid Region recorded, so nothing was called."
  if (code === "MEMBER_TRUST_MISSING") return "This installation's member trust is not established, so nothing was called."
  return code ? `The access check did not reach the account (${code}).` : "The access check did not reach the account."
}

/** Where an activation stopped, in words (activation_last.step). */
export function activationStepText(step: string | null | undefined): string {
  const code = step || ""
  if (code.startsWith("READ_ROLE:")) return `Cyntro could not use its read role in the account (${code.slice("READ_ROLE:".length)}).`
  if (code === "MEMBER_TRUST_MISSING") return "This installation's member trust is not established."
  if (code === "REGIONS_INVALID") return "The account has no valid Region recorded."
  if (code === "RESULT_WRITE_REJECTED") return "Cyntro could not record the activation's result."
  if (code === "ACQUISITION_BOUND_REACHED") return "The activation was attempted the maximum number of times without recording a result."
  if (code === "ACQUISITION_COUNT_UNPROVEN") return "Cyntro could not prove how many times the activation had been attempted, so it stopped."
  if (code === "REGISTRATION_STATE_CHANGED") return "The account changed while it was being activated."
  return code ? `The activation stopped (${code}).` : "The activation stopped."
}

const DISPATCH_BLOCKERS: Record<string, string> = {
  QUEUE_NOT_CONFIGURED: "this installation has no inventory queue configured; an installation administrator must configure one",
  DEFERRED_LOW_BUDGET: "deferred because too little time was left; Cyntro retries on a later pass",
  MALFORMED_RESPONSE: "the queue's answer could not be read; Cyntro retries on a later pass",
  MISSING_FROM_RESPONSE: "the queue's answer did not cover every item; Cyntro retries on a later pass",
  SCOPE_REVISION_UNKNOWN: "the account's scope revision could not be read",
  ACTIVATION_MARKER_MISSING: "the account has no activation record",
  REGISTRATION_IDENTITY_MALFORMED: "the account's registration identity is malformed",
}

/**
 * The first collection's state, in words -- what the queue has accepted, never what has been collected. Null before
 * activation, where there is no first inventory to speak of.
 */
export function firstInventoryText(dispatch: FirstInventoryDispatch | null | undefined): { tone: "pending" | "blocked" | "queued"; text: string } | null {
  if (!dispatch) return null
  const counted = `${dispatch.queued} of ${dispatch.intended} inventory work items queued`
  switch (dispatch.state) {
    case "NOT_STARTED": return { tone: "pending", text: "First collection not started: no inventory work is queued yet." }
    case "PARTIALLY_QUEUED": return { tone: "pending", text: `First collection being queued: ${counted}.` }
    case "BLOCKED": {
      const code = dispatch.blocker || ""
      const why = DISPATCH_BLOCKERS[code] ?? (code ? `the queue refused the work (${code})` : "no reason was recorded")
      return { tone: "blocked", text: `First collection blocked: ${counted}; ${why}.` }
    }
    case "HELD": return { tone: "blocked", text: `First collection held (${dispatch.hold || "no reason recorded"}): its plan changed after work was queued.` }
    case "ALL_QUEUED": {
      const at = dispatch.completed_at ? ` on ${formatUtcInstantExact(dispatch.completed_at)}` : ""
      return { tone: "queued", text: `First collection queued: the queue accepted all ${dispatch.intended} inventory work items${at}. Queued is not collected yet.` }
    }
    default: return { tone: "blocked", text: `First collection in a state Cyntro does not know (${dispatch.state}).` }
  }
}

const UNAVAILABLE_REASONS: Record<string, string> = {
  // AccountOnboarding Phase1 step 3 (f288960c): K2 binds only the stamp admission admits now.
  PLAN_SCOPE_SUPERSEDED: "the recorded plan predates this account's scope change; its work is not this scope's progress",
  SCOPE_REVISION_UNKNOWN: "this account's scope revision cannot be read",
  PLAN_NOT_BOUND: "the recorded plan is not this registration's",
  RUN_STORE_NOT_CONFIGURED: "this installation's console cannot read collection runs",
  RUN_MISMATCH: "a run record does not match its work item",
  RUN_MALFORMED: "a run record could not be read",
}

function unavailableReason(reason?: string | null): string {
  const code = reason || ""
  if (code.startsWith("RUN_UNREADABLE")) return `the run records could not be read${code.includes(":") ? ` (${code.split(":").slice(1).join(":")})` : ""}`
  return UNAVAILABLE_REASONS[code] ?? (code || "no reason was recorded")
}

/** Why a held item committed nothing, when its run predates the class a held source is recorded by: what that run proves. */
const HELD_REASONS: Record<string, string> = {
  NO_SCOPE_COMMITTED: "its run committed no cluster; it was recorded before Cyntro recorded why",
}

/** The held work items by name, each with its run's own class verbatim -- or, for an earlier run, what that run proves. */
function heldItems(outcome: FirstInventoryOutcome): string {
  return outcome.items
    .filter((i) => i.state === "SOURCE_HELD")
    .map((i) => `${sourceTypeLabel(i.source_type)} (${i.error_class || HELD_REASONS[i.reason || ""] || i.reason || "no reason recorded"})`)
    .join(", ")
}

/** "; 1 work item could not read its source and committed nothing: Kubernetes objects (...)" -- or nothing. */
function heldClause(outcome: FirstInventoryOutcome, count: number): string {
  if (!count) return ""
  const unit = `${count} ${plural(count, "work item", "work items")}`
  return `; ${unit} could not read ${count === 1 ? "its" : "their"} source and committed nothing: ${heldItems(outcome)}`
}

/** The distinct error classes of the items in `state`, verbatim (never a role name inferred from them). */
function errorClasses(outcome: FirstInventoryOutcome, state: string): string {
  const classes = [...new Set(outcome.items.filter((i) => i.state === state).map((i) => i.error_class || "no class recorded"))]
  return classes.join(", ")
}

/** "10 resource records" when every item measured its own, else nothing (a partial sum would read as the whole). */
function recordedTotal(outcome: FirstInventoryOutcome): string {
  const total = outcome.facts_emitted_total
  return typeof total === "number" && Number.isFinite(total) ? `, ${total} ${plural(total, "resource record", "resource records")}` : ""
}

/**
 * Stage1B K2, in words: where THIS registration's first inventory stands, from the exact runs of its work. The inventory
 * only -- never CloudTrail or flow logs. "Collected" means the evidence is committed; it never claims the map or a retry.
 * A count is said only when every run measured its own, and zero records is what those reads returned -- never a claim that
 * the account holds nothing. Unavailable is never success. Null before activation.
 */
export function firstInventoryOutcomeText(
  outcome: FirstInventoryOutcome | null | undefined,
): { tone: "pending" | "blocked" | "queued" | "done"; text: string } | null {
  if (!outcome || outcome.state === "NOT_ACTIVATED") return null
  const n = (key: string) => outcome.counts?.[key] ?? 0
  const total = outcome.items.length
  const asOf = outcome.observed_at ? ` (as of ${formatUtcInstantExact(outcome.observed_at)})` : ""
  const items = (count: number) => `${count} ${plural(count, "work item", "work items")}`
  switch (outcome.state) {
    case "NOT_STARTED": return { tone: "pending", text: "First inventory not started: no work is queued yet." }
    case "HELD": return { tone: "blocked", text: `First inventory held (${outcome.reason || "no reason recorded"}): its plan changed after work was queued.` }
    case "BLOCKED": {
      // Work the queue has not accepted, with the dispatch's own reason; what WAS queued is counted beside it.
      const code = outcome.reason || ""
      const why = DISPATCH_BLOCKERS[code] ?? (code ? `the queue refused the work (${code})` : "no reason was recorded")
      return { tone: "blocked", text: `First inventory blocked: ${n("intended")} of ${items(total)} could not be queued; ${why}.` }
    }
    case "INTENDED": return { tone: "pending", text: `First inventory being queued: ${total - n("intended")} of ${items(total)} queued${asOf}.` }
    case "QUEUED": return { tone: "pending", text: `First inventory queued: ${items(n("queued"))} waiting to start, ${n("collected")} collected${asOf}. Queued is not collected.` }
    case "STARTING":
    case "COLLECTING":
      return { tone: "pending", text: `First inventory collecting: ${n("collected")} of ${items(total)} collected, ${n("collecting") + n("starting")} in progress, ${n("queued") + n("intended")} waiting${asOf}.` }
    case "COLLECTED":
      return { tone: "done", text: `First inventory collected: the evidence of all ${items(total)} is committed${recordedTotal(outcome)}${asOf}. Whether it appears in the map yet is not part of this status.` }
    case "COLLECTED_ZERO_FACTS":
      return { tone: "done", text: `First inventory collected: all ${items(total)} committed their evidence and recorded no resources${asOf}. That is what these inventory reads returned in the account's Regions, not a claim that the account holds nothing.` }
    case "COMPLETED": return { tone: "done", text: `First inventory completed: all ${items(total)} finished${recordedTotal(outcome)}${asOf}.` }
    case "FAILED_RETRYABLE":
      return { tone: "blocked", text: `First inventory: ${items(n("failed_retryable"))} failed with a retryable error (${errorClasses(outcome, "FAILED_RETRYABLE")})${asOf}.` }
    case "FAILED":
      return { tone: "blocked", text: `First inventory failed for ${items(n("failed"))} (${errorClasses(outcome, "FAILED")}); your installer or Cyntro support can act on it${asOf}.` }
    case "PARTIAL":
      return { tone: "blocked", text: `First inventory partly collected: ${items(n("partial"))} ended partial (${errorClasses(outcome, "PARTIAL")})${asOf}.` }
    case "SOURCE_HELD": {
      // A source the collector could not read committed nothing: the inventory is incomplete, never "all committed".
      const moving = n("queued") + n("intended") + n("collecting") + n("starting")
      return { tone: "blocked", text: `First inventory incomplete: ${n("collected") + n("completed")} of ${items(total)} collected${heldClause(outcome, n("source_held"))}${moving ? `; ${moving} still in progress` : ""}${asOf}.` }
    }
    case "ENDED":
      return { tone: "blocked", text: `First inventory: ${items(n("ended"))} ended without collecting (${errorClasses(outcome, "ENDED")})${asOf}.` }
    case "UNAVAILABLE":
      return { tone: "blocked", text: `First inventory status cannot be read now: ${unavailableReason(outcome.reason)}. This is not a result.` }
    default: return { tone: "blocked", text: `First inventory in a state Cyntro does not know (${outcome.state}).` }
  }
}

/** The inventory families' names as the account page shows them; an unlisted family is shown as the backend sent it. */
const SOURCE_TYPE_LABELS: Record<string, string> = {
  account_regions: "Regions", ec2_inventory: "EC2 instances", vpcs: "VPCs", subnets: "Subnets", route_tables: "Route tables",
  internet_gateways: "Internet gateways", nat_gateways: "NAT gateways", network_acls: "Network ACLs",
  network_interfaces: "Network interfaces", security_groups: "Security groups", vpc_endpoints: "VPC endpoints",
  load_balancers: "Load balancers", load_balancer_listeners: "Load balancer listeners", target_groups: "Target groups",
  lambda_functions: "Lambda functions", rds_instances: "RDS instances", rds_clusters: "RDS clusters",
  s3_buckets: "S3 buckets", iam_roles: "IAM roles", iam_policies: "IAM policies", eks_clusters: "EKS clusters",
  k8s_objects: "Kubernetes objects", organization_policy_context: "Organization policy context",
  s3_authorization_controls: "S3 bucket policies", kms_authorization_controls: "KMS key policies",
  lambda_authorization_controls: "Lambda resource policies", sqs_authorization_controls: "SQS queue policies",
  sns_authorization_controls: "SNS topic policies", secretsmanager_authorization_controls: "Secrets Manager policies",
  eventbridge_authorization_controls: "EventBridge policies",
  vpc_endpoint_authorization_controls: "VPC endpoint policies",
}

export function sourceTypeLabel(sourceType: string): string {
  return SOURCE_TYPE_LABELS[sourceType] ?? sourceType
}

/** One row of the first inventory by resource type: what its run reports, and a count only when that run measured it. */
export interface FirstInventoryTypeRow {
  sourceType: string
  label: string
  region: string | null
  state: string
  /** The resource records the run emitted; null when the run did not measure it (never shown as zero). */
  records: number | null
}

/** The first inventory, one row per work item (each is one resource type in one Region), largest measured count first. */
export function firstInventoryByType(outcome: FirstInventoryOutcome | null | undefined): FirstInventoryTypeRow[] {
  if (!outcome) return []
  const rows = outcome.items.map((item) => ({
    sourceType: item.source_type,
    label: sourceTypeLabel(item.source_type),
    region: item.region ?? null,
    state: item.state,
    records: typeof item.facts_emitted === "number" && Number.isFinite(item.facts_emitted) ? item.facts_emitted : null,
  }))
  return rows.sort((a, b) => (b.records ?? -1) - (a.records ?? -1) || a.label.localeCompare(b.label))
}

/** "Found in your organization's list on <date>": a listed registration's evidence, said as evidence, never as a check. */
export function listedEvidenceText(evidence: ListedEvidence | null | undefined): string | null {
  if (!evidence) return null
  const at = evidence.at && ISO_INSTANT.test(evidence.at) ? ` on ${formatUtcInstantExact(evidence.at)}` : ""
  return `Found in your organization's list${at}.`
}

/**
 * A request the connector refused, by its stable code: what happened, who acts, what to do (Stage1B contract section 3).
 * Null for a code with no entry here: the connector's own detail is then shown as it is.
 */
const REQUEST_OUTCOMES: Record<string, string> = {
  INSTALLATION_GATE_CLOSED:
    "This installation is not verified for new accounts. Your Cyntro installer finishes or re-runs the install; then try again. Nothing was changed.",
  INSTALLATION_GATE_UNKNOWN:
    "This Cyntro build does not know its installation identity. Your Cyntro installer re-runs the install; then try again. Nothing was changed.",
  ACCOUNT_HISTORY_PRESENT:
    "This account already has collection history in this installation, so it cannot be connected here as a new account. Do not register it again; contact Cyntro support. Nothing was changed.",
  ACCOUNT_HISTORY_UNKNOWN:
    "Cyntro could not read whether this account already has collection history here. Try again; nothing was changed.",
  OWNER_HELD:
    "A previous step could not record its result and is kept as the proof of where the account stands. Release the account, or wait.",
}

export function requestOutcomeText(outcome: string | null | undefined): string | null {
  return outcome && Object.prototype.hasOwnProperty.call(REQUEST_OUTCOMES, outcome) ? REQUEST_OUTCOMES[outcome] : null
}

/** The last recorded connection check -- dated, and never a claim about access now. */
export function lastConnectionCheckText(account: Pick<ManagedAccount, "last_validated_at" | "onboarding_status">): string | null {
  if (!account.last_validated_at) return null
  const at = formatUtcInstantExact(account.last_validated_at)
  return account.onboarding_status === "CONNECTED"
    ? `Last connection check ${at} reached the account. That is when access was last proven, not a live check.`
    : `Last connection check ${at}.`
}

/** The connector's region rule (cyntro_data/accounts/connector.py REGION_RE). */
export const AWS_REGION_PATTERN = /^[a-z]{2}(-gov)?-[a-z]+-\d$/

export function parseRegions(value: string): string[] {
  return value.split(",").map((region) => region.trim()).filter(Boolean)
}

function describeDetail(detail: unknown): string | null {
  if (typeof detail === "string") return detail.trim() || null
  if (Array.isArray(detail)) {
    // FastAPI / pydantic validation errors: [{loc: ["body", "account_id"], msg: "..."}]
    const parts = detail.map((item) => {
      if (item && typeof item === "object") {
        const entry = item as { loc?: unknown; msg?: unknown }
        const field = Array.isArray(entry.loc)
          ? entry.loc.filter((part) => part !== "body" && part !== "query").join(".")
          : ""
        const message = typeof entry.msg === "string" ? entry.msg : JSON.stringify(item)
        return field ? `${field}: ${message}` : message
      }
      return String(item)
    })
    return parts.join("; ") || null
  }
  if (detail && typeof detail === "object") {
    const record = detail as Record<string, unknown>
    const parts = [record.message, record.reason, record.what_to_do]
      .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    if (parts.length) return parts.join(" ")
    if (typeof record.error === "string" && record.error) return record.error
    return JSON.stringify(detail)
  }
  return null
}

/** The backend's own words for a failure: `detail` as a string, an object's message, or pydantic's list. */
export function backendDetailMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  return (
    describeDetail(record.detail) ??
    (typeof record.message === "string" && record.message ? record.message : null) ??
    (typeof record.error === "string" && record.error ? record.error : null)
  )
}

export class AccountAdminError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(message: string, status: number, detail: unknown) {
    super(message)
    this.name = "AccountAdminError"
    this.status = status
    this.detail = detail
  }
}

/**
 * Account administration's typed refusals (H5), in words. Registering or checking a workload account needs a
 * verified operator: the backend checks both proofs of the signed-in person and the console refuses a write that
 * did not come from itself. Every one of these refuses before anything is queued.
 */
const ACCOUNT_ADMIN_REFUSALS: Record<string, string> = {
  PERSON_TOKEN_REQUIRED: "Your sign-in did not reach Cyntro. Sign in again.",
  PERSON_TOKEN_INVALID: "Your sign-in could not be verified; it may have expired. Sign in again.",
  ALB_IDENTITY_REQUIRED: "This console's signed sign-in was missing from the request. Sign in again.",
  ALB_IDENTITY_INVALID: "This console's signed sign-in could not be verified. Sign in again.",
  PERSON_ISSUER_MISMATCH: "The two proofs of your sign-in do not name the same person. Sign in again.",
  PERSON_CLIENT_MISMATCH: "The two proofs of your sign-in do not name the same person. Sign in again.",
  PERSON_SUBJECT_MISMATCH: "The two proofs of your sign-in do not name the same person. Sign in again.",
  PERSON_NOT_AUTHORIZED:
    "Your sign-in is not permitted to administer this account. Your identity provider's administrator grants the Cyntro operator role.",
  ALB_KEY_UNAVAILABLE: "The sign-in signing key could not be fetched. Retry shortly.",
  PERSON_KEYS_UNAVAILABLE:
    "Cyntro could not load your identity provider's signing keys, so your sign-in could not be checked. If this continues, ask your installation administrator to check the identity provider's key address and this installation's connection settings.",
  PERSON_KEYS_INVALID:
    "This installation's sign-in keys for account administration are not usable as configured, so your sign-in could not be checked. Ask your installation administrator to install them again.",
  PERSON_KEYS_EXPIRED:
    "This installation's sign-in keys for account administration have expired, so your sign-in could not be checked. Ask your installation administrator to install current keys.",
  PERSON_KEYS_NO_MATCH:
    "Your sign-in uses a key this installation has not installed, so it could not be checked. Ask your installation administrator to install your identity provider's current keys.",
  ALB_TRUST_REQUIRED:
    "This installation's sign-in trust is not configured, so account administration is refused. This is an installation prerequisite.",
  ALB_TRUST_MISCONFIGURED:
    "This installation's sign-in trust is misconfigured, so account administration is refused. This is an installation prerequisite.",
  PERSON_IDENTITY_NOT_ENFORCED:
    "This installation does not require a verified personal sign-in, so account administration is refused.",
  ACCOUNT_ADMIN_ORIGIN_REFUSED: "The request did not come from this console. Reload the page and try again.",
}

/** The words for a typed account-administration refusal, or null when the detail carries no known code. */
export function accountAdminRefusal(detail: unknown): string | null {
  if (!detail || typeof detail !== "object") return null
  const code = (detail as Record<string, unknown>).code
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(ACCOUNT_ADMIN_REFUSALS, code) ? ACCOUNT_ADMIN_REFUSALS[code] : null
}

/** Turn a non-2xx answer into an error that carries the backend's detail, not only its status code. */
export async function accountAdminFailure(response: Response, what: string): Promise<AccountAdminError> {
  const text = await response.text().catch(() => "")
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }
  const detail = payload && typeof payload === "object" ? (payload as Record<string, unknown>).detail : undefined
  const refusal = accountAdminRefusal(detail)
  if (refusal) {
    return new AccountAdminError(`${what} refused (HTTP ${response.status}): ${refusal} Nothing was changed.`, response.status, detail)
  }
  const message = backendDetailMessage(payload)
  return new AccountAdminError(
    message ? `${what} failed (HTTP ${response.status}): ${message}` : `${what} returned HTTP ${response.status}`,
    response.status,
    detail,
  )
}

function detailError(detail: unknown): string | null {
  return detail && typeof detail === "object" && typeof (detail as Record<string, unknown>).error === "string"
    ? ((detail as Record<string, unknown>).error as string)
    : null
}

/** The registry itself is unavailable: the LIST call answered 503 and its detail says so. Nothing else. */
export function registryUnavailableDetail(error: unknown): { message: string; reason: string | null } | null {
  if (!(error instanceof AccountAdminError) || error.status !== 503) return null
  const detail = error.detail
  if (detailError(detail) === "account_registry_unavailable") {
    const record = detail as Record<string, unknown>
    return {
      message: typeof record.message === "string" && record.message ? record.message : "Account registry unavailable.",
      reason: typeof record.reason === "string" && record.reason ? record.reason : null,
    }
  }
  if (typeof detail === "string" && /registry/i.test(detail) && /unavailable/i.test(detail)) {
    return { message: detail, reason: null }
  }
  return null
}

/** 409 `member_trust_not_ready` from `/connect`: the backend's message, or null for any other failure. */
export function memberTrustNotReadyMessage(error: unknown): string | null {
  if (!(error instanceof AccountAdminError) || error.status !== 409) return null
  if (detailError(error.detail) !== "member_trust_not_ready") return null
  const message = (error.detail as Record<string, unknown>).message
  return typeof message === "string" && message ? message : "This install's member trust is not established yet."
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}

/**
 * "2 trails · 1 of 2 flow-log groups usable · 1 EKS cluster". Only what the connector
 * recorded: a missing list is left out rather than reported as zero.
 */
export function discoverySummary(sources?: AccountSources | null): string | null {
  if (!sources || typeof sources !== "object" || Object.keys(sources).length === 0) return null
  const parts: string[] = []
  if (Array.isArray(sources.trails)) {
    const count = sources.trails.length
    parts.push(count ? `${count} ${plural(count, "trail", "trails")}` : "no trails")
  }
  if (Array.isArray(sources.flow_log_groups)) {
    const total = sources.flow_log_groups.length
    const usable = sources.flow_log_groups.filter((group) => group.certified_format === true).length
    parts.push(total ? `${usable} of ${total} ${plural(total, "flow-log group", "flow-log groups")} usable` : "no flow-log groups")
  }
  if (Array.isArray(sources.eks_clusters)) {
    const count = sources.eks_clusters.length
    parts.push(count ? `${count} EKS ${plural(count, "cluster", "clusters")}` : "no EKS clusters")
  }
  return parts.length ? parts.join(" · ") : null
}

/** Discovery caveats worth surfacing next to the summary (evidence role unusable, per-region read errors). */
export function discoveryCaveats(sources?: AccountSources | null): string[] {
  if (!sources || typeof sources !== "object") return []
  const caveats: string[] = []
  if (sources.evidence_role === false) caveats.push("Evidence role not usable")
  const errors = Array.isArray(sources.discovery_errors) ? sources.discovery_errors : []
  if (errors.length) caveats.push(`${errors.length} discovery ${plural(errors.length, "error", "errors")}: ${errors.join(", ")}`)
  return caveats
}

function atOrAfter(value: string | null | undefined, since: string): boolean {
  if (!value) return false
  const at = Date.parse(value)
  const from = Date.parse(since)
  return Number.isFinite(at) && Number.isFinite(from) && at >= from
}

export type ConnectionCheckOutcome =
  | { state: "PENDING" }
  | { state: "FINISHED"; status: string; message: string | null }
  | { state: "FAILED"; detail: string | null }

/**
 * Has the connection check requested at `requestedAt` (the backend's `requested_at`) finished?
 * Finished = the account has no open request and the connector stamped `last_validated_at`
 * at or after the request; failed = the connector closed that request as failed.
 */
export function connectionCheckOutcome(
  accountId: string,
  account: ManagedAccount | null | undefined,
  failedRequests: FailedAccountRequest[] | null | undefined,
  requestedAt: string,
): ConnectionCheckOutcome {
  const failure = (failedRequests || []).find(
    (request) =>
      request.account_id === accountId && request.action === "validate" && atOrAfter(request.finished_at, requestedAt),
  )
  if (failure && !account?.pending_request) return { state: "FAILED", detail: failure.detail || null }
  if (account && !account.pending_request && atOrAfter(account.last_validated_at, requestedAt)) {
    return { state: "FINISHED", status: account.onboarding_status, message: account.validation_message || null }
  }
  return { state: "PENDING" }
}

/** Did a registration requested at `requestedAt` fail (the connector closed it as failed)? */
export function registrationFailed(
  failedRequests: FailedAccountRequest[] | null | undefined,
  accountId: string,
  requestedAt: string,
): boolean {
  return (failedRequests || []).some(
    (request) => request.account_id === accountId && request.action === "register" && atOrAfter(request.finished_at, requestedAt),
  )
}

/** The regions to render from `notes.regions`; an older backend sends none, which renders nothing. */
export function regionDiscoveries(notes?: ConnectionNotes | null): RegionDiscovery[] {
  const regions = notes?.regions
  if (!Array.isArray(regions)) return []
  return regions.filter(
    (entry): entry is RegionDiscovery =>
      Boolean(entry) && typeof entry === "object" && typeof entry.region === "string" && entry.region !== "",
  )
}

/** A count the backend sent (a finite number), or null so the line is left out. */
export function backendCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/**
 * A value read from, or derived from, the 7-day change count: exact only when the backend says that
 * count is complete (`changes_complete: true`); otherwise it is a floor, "at least <value>".
 */
export function floorUnlessComplete(value: string, complete?: boolean | null): string {
  return complete === true ? value : `at least ${value}`
}

/** The 7-day network-interface change count as worded ("40", or "at least 40"). */
export function changeCountText(count: number, complete?: boolean | null): string {
  return floorUnlessComplete(String(count), complete)
}

/** "$0.51" from the backend's decimal string; null when it sent none. Never computed here. */
export function usdText(value?: string | null): string | null {
  return typeof value === "string" && value.trim() !== "" ? `$${value.trim()}` : null
}

/**
 * "2026-10-01 20:31:12 UTC" (milliseconds kept when present). For a proven coverage start the
 * instant is shown at the precision the backend sent, never rounded down to an earlier minute.
 */
export function formatUtcInstantExact(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  const iso = parsed.toISOString()
  const millis = iso.slice(19, 23)
  return `${iso.slice(0, 19).replace("T", " ")}${millis === ".000" ? "" : millis} UTC`
}

/** A verified token identity as the backend records an actor: "<issuer URL>#<subject>" (the token's iss and sub). */
const ISSUER_SUBJECT = /^https?:\/\/[^\s#]+#([^\s#]+)$/

/**
 * Who removed an account, as people read it (D13), for the start of a sentence: the name or email the backend resolved
 * (``by_display``), else the recorded actor when it is itself readable (an email, a name). A bare "<issuer>#<subject>"
 * token identity is "An operator (<subject>)", the subject cut to 8 characters past 12 -- never the raw issuer URL.
 * null when nothing was recorded.
 */
export function removedByLabel(item: Pick<RemovedAccount, "by" | "by_display">): string | null {
  const values = [item.by_display, item.by].map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean)
  const readable = values.find((value) => !ISSUER_SUBJECT.test(value))
  if (readable) return readable
  const subject = values.map((value) => ISSUER_SUBJECT.exec(value)?.[1]).find(Boolean)
  if (!subject) return null
  return `An operator (${subject.length > 12 ? `${subject.slice(0, 8)}…` : subject})`
}

/**
 * One closed registration from the listing's removed audit (level 5), in words: who removed it, when, at which stage
 * (WITHDRAWN: before its registration was confirmed; OFFBOARDED: after it was connected), and what removing kept.
 * Settings' removed list, the Add-account review and the account page say it the same way.
 */
export function removedAccountSentence(item: Pick<RemovedAccount, "status" | "by" | "by_display" | "at">): string {
  const offboarded = item.status === "OFFBOARDED"
  const actor = removedByLabel(item)
  const when = item.at ? ` on ${formatUtcInstantExact(item.at)}` : ""
  return (
    (actor ? `${actor} removed it${when}` : `It was removed${when}`) +
    (offboarded
      ? ", after it was connected. Its collected evidence is kept; its connection stack may still be in the account."
      : ", before it was confirmed.")
  )
}

// ── optional organization discovery (backend cyntro_data/accounts/org_discovery.py) ───────────────────────────
// GET /api/admin/accounts/organization: read_state() plus setup_parameters(). Listing registers nothing; a chosen
// account only fills the Add form.

export interface OrganizationAccount {
  account_id: string
  name: string
  state: string
  selectable: boolean
  why_not?: string
}

export interface OrganizationDiscoverySetup {
  template: string
  parameters: Record<string, string>
  /** The role the template creates (its exact name) and the stack output to paste into Settings; ``set_by`` is
   *  "installation" when the installer names the role, which Settings then cannot replace (backend setup_parameters). */
  role?: { name: string; output: string; set_by?: string }
}

/** POST /api/admin/accounts/organization/discover (202): the request that will run, and the role IT carries -- an
 *  already-open request keeps its own, so this can differ from the role just pasted. */
export interface OrganizationDiscoverRequest {
  customer_id: string
  request_status: string
  requested_at: string
  already_open: boolean
  role_arn: string | null
}

/** The customer's discovery role template, as shipped in this release (backend GET /organization/template). */
export const ORGANIZATION_DISCOVERY_TEMPLATE_PATH = "/api/proxy/admin/accounts/organization/template"

export type DiscoveryRoleArnCheck =
  | { state: "EMPTY" }
  | { state: "INVALID"; problem: string }
  | { state: "VALID"; arn: string; accountId: string }

/**
 * A pasted organization discovery role ARN -- the OrgDiscoveryRoleArn output of the customer's discovery role stack -- as the
 * backend decides it (org_discovery.check_discovery_role_arn): an IAM role ARN whose role is exactly ``roleName`` (the name
 * the backend's setup answer gives), no other name and no path. Which account it is in is the customer's choice (the
 * management account, or one delegated Organizations read); the connector proves it answers for this installation's
 * organization before using it.
 */
export function checkDiscoveryRoleArn(raw: string, roleName: string): DiscoveryRoleArnCheck {
  const arn = raw.trim()
  if (!arn) return { state: "EMPTY" }
  const match = READ_ROLE_ARN.exec(arn)
  if (!match) {
    return { state: "INVALID", problem: `Not an IAM role ARN. Copy OrgDiscoveryRoleArn from the stack's Outputs tab (arn:aws:iam::<account>:role/${roleName}).` }
  }
  if (match[3] !== roleName) {
    return { state: "INVALID", problem: `This is role ${match[3]}, not this installation's organization listing role ${roleName}. Create the stack from this installation's template with the values shown, and copy its OrgDiscoveryRoleArn output.` }
  }
  return { state: "VALID", arn, accountId: match[2] }
}

export interface OrganizationDiscovery {
  customer_id?: string
  state: "NOT_RUN" | "RUNNING" | "AVAILABLE" | "UNAVAILABLE" | "EXPIRED" | string
  reason?: string
  requested_at?: string | null
  discovered_at?: string | null
  organization_id?: string | null
  management_account_id?: string | null
  truncated?: boolean
  accounts?: OrganizationAccount[]
  setup?: OrganizationDiscoverySetup
  /** The discovery role the LAST discovery recorded, and that role's own account (backend org_discovery._source).
   *  History, not current configuration; never, by itself, the organization's management account. Absent before the
   *  first discovery. */
  source?: { role_arn: string; account_id: string } | null
}

const ORGANIZATION_UNAVAILABLE: Record<string, string> = {
  NOT_CONFIGURED: "Choosing from your organization is not set up for this installation.",
  INSTALL_ORGANIZATION_UNKNOWN:
    "Cyntro could not read which AWS Organization this installation belongs to, so it cannot confirm a list is your organization's.",
  ROLE_NOT_USABLE:
    "Cyntro could not use the organization discovery role. It may not be deployed yet, or may not trust this installation.",
  NOT_PERMITTED: "The organization discovery role is not allowed to list the organization's accounts.",
  OTHER_ORGANIZATION:
    "The organization discovery role answers for a different AWS Organization than this installation's, so its accounts are not offered.",
  DISCOVERY_FAILED: "Listing the organization's accounts failed.",
}

/** Why the organization's accounts cannot be listed, in words; an unknown reason is named, never guessed at. */
export function organizationUnavailableText(reason?: string | null): string {
  if (reason && Object.prototype.hasOwnProperty.call(ORGANIZATION_UNAVAILABLE, reason)) return ORGANIZATION_UNAVAILABLE[reason]
  return `The organization's accounts cannot be listed${reason ? ` (${reason})` : ""}.`
}

/** The listing problems only an installation administrator can fix (the role, its permissions, its organization). */
const ADMINISTRATOR_FIXES = new Set(["ROLE_NOT_USABLE", "NOT_PERMITTED", "OTHER_ORGANIZATION", "INSTALL_ORGANIZATION_UNKNOWN"])

/**
 * What an unavailable listing means for adding an account, and who can change it -- in the person's terms, never the
 * setup itself (templates, role ARNs, external IDs and install settings belong to the installation administrator).
 * Without the list an account can be added only on the guarded unverified path (option C), never as listed.
 */
export function organizationDependencyText(reason?: string | null, options: { canSetUp?: boolean } = {}): string {
  const needs = "Without your organization's account list, an account can be added only as unverified: Cyntro reads nothing in it until you check access and confirm."
  if (reason === "NOT_CONFIGURED") {
    return options.canSetUp
      ? `${needs} Listing it needs a read-only role in your AWS organization: set it up below.`
      : `${needs} Listing it needs a read-only role in your AWS organization, which your installation administrator sets up.`
  }
  if (reason === "ROLE_NOT_USABLE" && options.canSetUp) {
    return `${needs} Check that the role's stack was created with the values below, then verify its ARN again.`
  }
  if (reason && ADMINISTRATOR_FIXES.has(reason)) return `${needs} Your installation administrator needs to check this installation's organization listing role.`
  return `${needs} The list can be asked for again.`
}

const ORGANIZATION_WHY_NOT: Record<string, string> = {
  PLATFORM_ACCOUNT: "The account Cyntro runs in",
  MANAGEMENT_ACCOUNT: "The organization's management account",
  ALREADY_ADDED: "Already added",
}

/** Why a listed account cannot be chosen. */
export function organizationWhyNotText(account: Pick<OrganizationAccount, "why_not" | "state">): string {
  const why = account.why_not || ""
  if (Object.prototype.hasOwnProperty.call(ORGANIZATION_WHY_NOT, why)) return ORGANIZATION_WHY_NOT[why]
  if (why.startsWith("STATE_")) return `Not active (${why.slice("STATE_".length)})`
  return why ? `Not offered (${why})` : `Not offered (${account.state || "UNKNOWN"})`
}

/** Only an account the backend offers AND reports exactly ACTIVE can be chosen; anything else fails closed. */
export function organizationAccountSelectable(account: OrganizationAccount): boolean {
  return account.selectable === true && account.state === "ACTIVE" && /^\d{12}$/.test(account.account_id)
}

// ── the account ID in Add AWS account: one check for typed and organization-chosen IDs ─────────────────────────
// AWS: an account ID is "a 12-digit number ... that uniquely identifies an AWS account"
// (docs.aws.amazon.com/accounts/latest/reference/manage-acct-identifiers.html). The ID is taken exactly as typed: a wrong
// length, a letter, a hyphen or a space is said as such, never stripped or cut down into some other ID.
//
// Option C (Alon, 2026-10-04: "picker plus guarded pending manual path"). An ID this customer's organization list -- read
// here (GET only) within the last 24 hours -- holds as an ACTIVE account the backend offers is added as LISTED. A
// well-formed ID with NO current evidence (no usable list, or a list that does not hold it) can be added only as
// UNVERIFIED, with the operator's explicit acknowledgement: the connector then registers it without any AWS call, and
// nothing is read until the operator checks access and confirms. An ID explicitly ruled out stays refused -- it is never
// an unverified escape. The ID's shape proves nothing, and absence from a list never means an account does not exist. The
// connector re-decides the evidence itself (the server's stamp, not this page's).

/** The backend's own read-time expiry for a listing (cyntro_data/accounts/org_discovery.py RESULT_MAX_AGE). */
export const ORGANIZATION_LIST_MAX_AGE_MS = 24 * 60 * 60 * 1000
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

export type AccountIdFormat = { accountId: string } | { problem: string; incomplete: boolean } | null

/** The 12-digit ID exactly as typed, or what is wrong with it; null when nothing is typed. */
export function parseAccountId(raw: string): AccountIdFormat {
  if (raw === "") return null
  if (/^\d{12}$/.test(raw)) return { accountId: raw }
  if (/^\d+$/.test(raw)) {
    return raw.length < 12
      ? { problem: `An AWS account ID has 12 digits; ${raw.length} entered so far.`, incomplete: true }
      : { problem: `An AWS account ID has 12 digits; this has ${raw.length}.`, incomplete: false }
  }
  if (/^[\d\s-]+$/.test(raw)) return { problem: "Enter the 12 digits only, without spaces or hyphens.", incomplete: false }
  return { problem: "An AWS account ID is 12 digits; this contains letters or other characters.", incomplete: false }
}

/** What the Add dialog's organization reader holds for the current customer. */
export interface OrganizationReadState {
  /** The last answer read for this customer. */
  answer: OrganizationDiscovery | null
  /** A read is in flight: whatever was read before stops counting until it answers. */
  reading: boolean
  /** The latest read failed: whatever was read before no longer counts. */
  failed: boolean
}

function listedAtText(at: string): string {
  return formatUtcInstantExact(at)
}

/** The organization list an ID may be held to now, or why there is none -- never a claim about the ID itself. */
export function organizationListing(
  read: OrganizationReadState | null | undefined,
  now: number,
): { listing: OrganizationDiscovery; listedAt: string } | { cannotVerify: string } {
  if (!read || read.reading) return { cannotVerify: "Cyntro is reading your organization's account list." }
  if (read.failed) return { cannotVerify: "Cyntro could not read your organization's account list." }
  const answer = read.answer
  if (!answer) return { cannotVerify: "Cyntro has not read your organization's account list." }
  switch (answer.state) {
    case "NOT_RUN": return { cannotVerify: "Your organization's accounts have not been listed for this installation." }
    case "RUNNING": return { cannotVerify: "Your organization's accounts are still being listed." }
    case "EXPIRED": return { cannotVerify: "Your organization's last list is more than 24 hours old." }
    case "UNAVAILABLE": return { cannotVerify: organizationUnavailableText(answer.reason) }
    case "AVAILABLE": break
    default: return { cannotVerify: `Your organization's account list is in a state Cyntro does not know (${answer.state}).` }
  }
  const at = typeof answer.discovered_at === "string" ? answer.discovered_at : ""
  const listedAt = ISO_INSTANT.test(at) ? Date.parse(at) : Number.NaN
  if (Number.isNaN(listedAt)) return { cannotVerify: "Your organization's last list has no valid listing time." }
  if (listedAt > now) return { cannotVerify: `Your organization's last list has a listing time in the future (${listedAtText(at)}).` }
  if (now - listedAt >= ORGANIZATION_LIST_MAX_AGE_MS) {
    return { cannotVerify: `Your organization's last list (listed ${listedAtText(at)}) is more than 24 hours old.` }
  }
  return { listing: answer, listedAt: at }
}

/** The next instant at which the listing's usability changes (it comes into range, or expires); null when it never will. */
export function organizationListingBoundary(answer: OrganizationDiscovery | null | undefined, now: number): number | null {
  if (answer?.state !== "AVAILABLE") return null
  const at = typeof answer.discovered_at === "string" ? answer.discovered_at : ""
  const listedAt = ISO_INSTANT.test(at) ? Date.parse(at) : Number.NaN
  if (Number.isNaN(listedAt)) return null
  if (listedAt > now) return listedAt - now <= ORGANIZATION_LIST_MAX_AGE_MS ? listedAt : null
  const expires = listedAt + ORGANIZATION_LIST_MAX_AGE_MS
  return expires > now ? expires : null
}

export type AccountIdCheck =
  | { state: "EMPTY" }
  | { state: "MALFORMED"; problem: string; incomplete: boolean }
  /** Known not addable: the platform account, one added or being added, or a restriction in the organization's
   *  current list. `short` labels a dropdown entry; `reason` is said beside the field. */
  | { state: "INELIGIBLE"; accountId: string; short: string; reason: string }
  /** No current evidence for it: no usable list, or the list does not hold it. Never "does not exist". */
  | { state: "CANNOT_VERIFY"; accountId: string; short: string; reason: string }
  /** In the organization's current list and offered there -- found, not connected. */
  | { state: "LISTED"; accountId: string; name: string; listedAt: string }

export interface AccountIdContext {
  accounts: Pick<ManagedAccount, "account_id" | "is_platform_account" | "onboarding_status" | "pending_request" | "display_name" | "aws_account_name" | "collection_mode">[]
  platformAccountId?: string | null
  organization: OrganizationReadState | null
  /** The wall clock to judge the listing's age by. */
  now: number
}

const UNVERIFIED_ONLY =
  "It can still be added as unverified, with your acknowledgement: Cyntro then reads nothing in it until you check access and confirm."

/** One check for a typed and a chosen ID, recomputed for the current ID every time; there is no stored "verified". */
export function checkAccountId(raw: string, context: AccountIdContext): AccountIdCheck {
  const format = parseAccountId(raw)
  if (format === null) return { state: "EMPTY" }
  if ("problem" in format) return { state: "MALFORMED", problem: format.problem, incomplete: format.incomplete }
  const accountId = format.accountId
  const ineligible = (short: string, reason: string): AccountIdCheck => ({ state: "INELIGIBLE", accountId, short, reason })
  const cannotVerify = (why: string): AccountIdCheck =>
    ({ state: "CANNOT_VERIFY", accountId, short: "Cannot be verified", reason: `Cannot verify this account. ${why} ${UNVERIFIED_ONLY}` })

  if (context.platformAccountId === accountId || context.accounts.some((a) => a.is_platform_account && a.account_id === accountId)) {
    return ineligible("The account Cyntro runs in", "This is the account Cyntro runs in; it is part of this installation already and is not added.")
  }
  const row = context.accounts.find((a) => a.account_id === accountId)
  if (row) {
    if (row.onboarding_status === "REGISTERING" || row.pending_request?.action === "register") {
      return ineligible("Being added", "This account is being added already: Cyntro is still working on its registration.")
    }
    const label = accountLabel(row)
    return ineligible("Already added", `This account is added already${label !== accountId ? ` (${label})` : ""}.`)
  }

  const found = organizationListing(context.organization, context.now)
  if ("cannotVerify" in found) return cannotVerify(found.cannotVerify)
  const { listing, listedAt } = found
  const when = listedAtText(listedAt)
  const listed = (Array.isArray(listing.accounts) ? listing.accounts : []).find((a) => a.account_id === accountId)
  if (listed && !organizationAccountSelectable(listed)) {
    const why = organizationWhyNotText(listed)
    return ineligible(why, `${why}, according to your organization's list from ${when}; it cannot be added.`)
  }
  if (!listed && listing.management_account_id === accountId) {
    return ineligible("The organization's management account",
      `The organization's management account, as AWS Organizations reported it on ${when}; it cannot be added.`)
  }
  if (listed) return { state: "LISTED", accountId, name: listed.name || accountId, listedAt }
  return cannotVerify(listing.truncated === true
    ? `Your organization's last list (listed ${when}) was cut short and does not include it.`
    : `Not found in your organization's last list (listed ${when}).`)
}

/** An ID found in the current list: reviewed and added as LISTED, with no acknowledgement. */
export function accountIdReviewable(check: AccountIdCheck): check is Extract<AccountIdCheck, { state: "LISTED" }> {
  return check.state === "LISTED"
}

/** An ID with no current evidence: reviewed and added only as UNVERIFIED, and only with the operator's acknowledgement. */
export function accountIdUnverified(check: AccountIdCheck): check is Extract<AccountIdCheck, { state: "CANNOT_VERIFY" }> {
  return check.state === "CANNOT_VERIFY"
}

/** Review goes ahead for a listed ID, or for an unverified one on the guarded path; never for a refused or malformed ID. */
export function accountIdAddable(
  check: AccountIdCheck,
): check is Extract<AccountIdCheck, { state: "LISTED" }> | Extract<AccountIdCheck, { state: "CANNOT_VERIFY" }> {
  return accountIdReviewable(check) || accountIdUnverified(check)
}

/** What a found ID's evidence shows -- and what it does not. */
export function accountIdEvidenceText(check: Extract<AccountIdCheck, { state: "LISTED" }>): string {
  return `Found in your organization's account list from ${listedAtText(check.listedAt)}, named \u201c${check.name}\u201d. ` +
    "That shows it is in your organization, not that Cyntro can connect to it: the connection is checked after it is added."
}
