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

export interface ConnectionNotes {
  flow_log_groups_found?: number
  flow_log_groups_usable?: number
  flow_log_groups_without_required_fields?: (string | null)[]
  eks_clusters?: (string | null)[]
  discovered?: boolean
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

/** The proxied download for the backend's `template_path` (`/api/admin/accounts/connect/template`). */
export function proxiedTemplatePath(templatePath?: string | null): string {
  const backendPrefix = "/api/admin/accounts/"
  if (templatePath && templatePath.startsWith(backendPrefix)) {
    return `/api/proxy/admin/accounts/${templatePath.slice(backendPrefix.length)}`
  }
  return "/api/proxy/admin/accounts/connect/template"
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
