export interface BlastRadiusScope {
  customerId?: string | null
  accountId?: string | null
  region?: string | null
}

export function buildBlastRadiusUrl(systemName: string, scope: BlastRadiusScope): string | null {
  if (!systemName) return null
  const params = new URLSearchParams()
  if (scope.customerId) params.set("customer_id", scope.customerId)
  if (scope.accountId) params.set("account_id", scope.accountId)
  if (scope.region) params.set("region", scope.region)
  const query = params.toString()
  const base = `/api/proxy/business-system/${encodeURIComponent(systemName)}/blast-radius`
  return query ? `${base}?${query}` : base
}
