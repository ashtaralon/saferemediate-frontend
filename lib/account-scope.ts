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

export interface ProductScope {
  customerId: string | null
  groupId: string
  accountId: string
  region: string
}

export function scopeOptionsFromSystems(payload: unknown): AccountScopeOptions | null {
  const systems = Array.isArray((payload as { systems?: unknown[] } | null)?.systems)
    ? (payload as { systems: Array<Record<string, unknown>> }).systems
    : []
  if (!systems.length) return null

  const customerId = systems.find((row) => typeof row.name === "string")?.name
  if (typeof customerId !== "string" || !customerId) return null

  const accounts = new Map<string, AccountScopeOption>()
  for (const row of systems) {
    const accountId = row.account_id
    if (typeof accountId !== "string" || !/^\d{12}$/.test(accountId)) continue
    const region = typeof row.region === "string" && row.region ? row.region : null
    const existing = accounts.get(accountId)
    if (existing) {
      if (region && !existing.regions.includes(region)) existing.regions.push(region)
      continue
    }
    accounts.set(accountId, {
      account_id: accountId,
      display_name: typeof row.displayName === "string" ? row.displayName : customerId,
      regions: region ? [region] : [],
      group_ids: [],
      status: typeof row.status === "string" ? row.status : "active",
    })
  }
  if (!accounts.size) return null
  return { customer_id: customerId, accounts: [...accounts.values()], groups: [] }
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
