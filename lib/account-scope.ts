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
