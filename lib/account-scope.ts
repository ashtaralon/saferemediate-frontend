export interface AccountScopeOption {
  account_id: string
  display_name: string
  regions: string[]
  group_ids: string[]
  status: string
}

export interface AccountGroupOption {
  group_id: string
  name: string
  account_ids: string[]
  description?: string
  environment?: string | null
}

export interface AccountScopeOptions {
  customer_id: string
  accounts: AccountScopeOption[]
  groups: AccountGroupOption[]
}

export interface CustomerScopeOption {
  customer_id: string
  display_name: string
}

export function normalizeCustomerRoster(payload: unknown): CustomerScopeOption[] {
  if (!Array.isArray(payload)) return []
  return payload.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const customerId = (entry as Record<string, unknown>).customer_id
    if (typeof customerId !== "string" || !customerId.trim()) return []
    const displayName = (entry as Record<string, unknown>).display_name
    return [{
      customer_id: customerId,
      display_name: typeof displayName === "string" && displayName.trim() ? displayName : customerId,
    }]
  })
}

export function resolveCustomerId(
  requestedCustomerId: string | null,
  customers: CustomerScopeOption[],
): string | null {
  if (requestedCustomerId && customers.some((customer) => customer.customer_id === requestedCustomerId)) {
    return requestedCustomerId
  }
  return customers[0]?.customer_id ?? null
}

export interface ProductScope {
  customerId: string | null
  groupId: string
  accountId: string
  region: string
}

export interface ScopeHealResult extends Pick<ProductScope, "groupId" | "accountId" | "region"> {
  // Human-readable description of each value that was reset, empty when the
  // scope was already valid. Shown to the operator — a silent reset would be
  // as confusing as the silent mismatch it replaces.
  cleared: string[]
}

/**
 * Validate a (possibly persisted) narrowing scope against the organization's
 * live account/region options, resetting any value the options cannot satisfy.
 *
 * Why this exists (incident 2026-08-23): the narrowing scope is persisted in
 * localStorage and re-applied to every page. A region left behind by a
 * browser-automation session matched no account of the organization, so every
 * scoped read returned an EMPTY list with no error — the whole product looked
 * like data loss, survived reloads, and gave the operator nothing to act on.
 * The options payload is the authority on what can match; a narrowing that
 * the options cannot satisfy can never return data and must heal to "all"
 * instead of being applied.
 */
export function healScopeAgainstOptions(
  scope: Pick<ProductScope, "groupId" | "accountId" | "region">,
  options: AccountScopeOptions,
): ScopeHealResult {
  const cleared: string[] = []
  let groupId = scope.groupId || "all"
  let accountId = scope.accountId || "all"
  let region = scope.region || "all"

  if (groupId !== "all" && !options.groups.some((group) => group.group_id === groupId)) {
    cleared.push(`Account group "${groupId}" is not available for this organization — reset to All`)
    groupId = "all"
  }
  // Mirror the scope bar's dependent-option logic exactly: accounts are
  // filtered by the (healed) group, regions by the (healed) account.
  const accountsInGroup = groupId === "all"
    ? options.accounts
    : options.accounts.filter((account) => account.group_ids.includes(groupId))
  if (accountId !== "all" && !accountsInGroup.some((account) => account.account_id === accountId)) {
    cleared.push(`Account "${accountId}" is not available in the selected scope — reset to All`)
    accountId = "all"
  }
  const selectedAccount = accountId === "all"
    ? null
    : accountsInGroup.find((account) => account.account_id === accountId) ?? null
  const validRegions = selectedAccount
    ? selectedAccount.regions
    : accountsInGroup.flatMap((account) => account.regions)
  if (region !== "all" && !validRegions.includes(region)) {
    cleared.push(`Region "${region}" is not available in the selected scope — reset to All`)
    region = "all"
  }
  return { groupId, accountId, region, cleared }
}

export function resourceAccountId(resource: Record<string, unknown>): string | null {
  const direct = resource.account_id ?? resource.accountId ?? resource.aws_account_id
  if (typeof direct === "string" && /^\d{12}$/.test(direct)) return direct
  const arn = resource.arn ?? resource.resourceArn ?? resource.id
  if (typeof arn === "string") {
    const match = arn.match(/^arn:[^:]+:[^:]*:[^:]*:(\d{12}):/)
    if (match) return match[1]
  }
  return null
}

export function scopeMatchesResource(
  scope: Pick<ProductScope, "accountId" | "region">,
  resource: Record<string, unknown>,
): boolean {
  const accountId = resourceAccountId(resource)
  const region = resource.region
  if (scope.accountId !== "all" && accountId !== scope.accountId) return false
  if (scope.region !== "all" && region !== scope.region) return false
  return true
}

export function withAccountScope(
  url: string,
  scope: Pick<ProductScope, "customerId" | "groupId" | "accountId" | "region">,
): string {
  const parsed = new URL(url, "http://cyntro.local")
  if (scope.customerId) parsed.searchParams.set("customer_id", scope.customerId)
  if (scope.groupId !== "all") parsed.searchParams.set("account_group", scope.groupId)
  if (scope.accountId !== "all") parsed.searchParams.set("account_id", scope.accountId)
  if (scope.region !== "all") parsed.searchParams.set("region", scope.region)
  return `${parsed.pathname}${parsed.search}`
}
