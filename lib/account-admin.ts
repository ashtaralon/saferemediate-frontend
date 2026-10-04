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

export const MEMBER_ACCOUNTS_MODE = "MEMBER_ACCOUNTS"

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

/** Why a member account has no AWS name yet, in words; null when it has one (backend connector._read_account_name). */
export function accountNameNote(account: Pick<ManagedAccount, "aws_account_name" | "aws_account_name_error" | "onboarding_status">): string | null {
  if (account.aws_account_name) return null
  const error = account.aws_account_name_error || ""
  if (error === "NOT_PERMITTED") {
    return "Name not readable from AWS: AWS denied permission to read it. A connection stack deployed before this release may need updating (account:GetAccountInformation)."
  }
  if (error.startsWith("UNREACHABLE")) return "Name not readable from AWS: Cyntro could not reach the AWS account API."
  if (error === "NO_NAME") return "Name not readable from AWS: AWS did not return a name."
  if (error) return `Name not readable from AWS (${error}).`
  return account.onboarding_status === "CONNECTED" || account.onboarding_status === "READY"
    ? "Name not read from AWS yet."
    : "Its name is read from AWS once it connects."
}

export interface FailedAccountRequest {
  account_id: string
  action: string
  detail?: string | null
  finished_at?: string | null
}

export interface MemberTrust {
  platform_account_id?: string | null
  organization_id?: string | null
  ready: boolean
}

export interface AccountListResponse {
  mode?: string
  accounts: ManagedAccount[]
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

export interface RegistrationProgress {
  registration_id: string
  registration_version: number
  registration_path?: "LISTED" | "PENDING" | string | null
  checking: boolean
  access_check?: RegistrationAccessCheck | null
  activation?: RegistrationActivation | null
  activating: boolean
  activation_last?: RegistrationActivationLast | null
  owner?: RegistrationOwner | null
  first_inventory_dispatch?: FirstInventoryDispatch | null
}

/** The backend's ACTIVATION_CHECK_MAX_AGE: a confirmation consumes a check whose identity was observed STRICTLY less than
 *  15 minutes before the connector admits it. The page judges it by the wall clock; the connector decides. */
export const ACTIVATION_CHECK_MAX_AGE_MS = 15 * 60 * 1000

export type RegistrationAction = "access_check" | "activate" | "release"

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
 * - FIRST_CHECK / CHECKING / ACTIVATING: the connector is working; nothing to ask.
 */
export type RegistrationStep =
  | { kind: "HELD"; owner: RegistrationOwner }
  | { kind: "FIRST_CHECK" }
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
    case "LISTED_ADMITTED": return { kind: "FIRST_CHECK" }
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

const STEP_LABEL: Record<string, string> = { register: "registration", access_check: "access check", activate: "activation" }

/** "the access check" -- the step a held request belongs to, in words. */
export function registrationStepLabel(action: string): string {
  return STEP_LABEL[action] ?? action
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
export function accessRefusalText(refusal: string | null | undefined, customerId: string): string {
  const code = refusal || ""
  const role = memberReadRoleName(customerId)
  if (code.startsWith("ROLE_NOT_ASSUMABLE")) {
    const why = code.split(":")[1]
    return `Cyntro could not use ${role} in that account${why ? ` (${why})` : ""}. Deploy the connection stack there, then check access again.`
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
export function organizationDependencyText(reason?: string | null): string {
  const needs = "Without your organization's account list, an account can be added only as unverified: Cyntro reads nothing in it until you check access and confirm."
  if (reason === "NOT_CONFIGURED") {
    return `${needs} Listing it needs a read-only role in your AWS organization, which your installation administrator sets up.`
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
