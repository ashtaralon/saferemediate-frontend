/**
 * Shared IAP proxy query limits — must match across Next.js proxy routes so
 * backend Redis cache keys align (system:max_jewels:max_paths_per_jewel:…).
 *
 * Attack Paths v2 page uses identity-attack-paths with 8×8 defaults.
 * The attack-path facade must use the same shape or every path click is a
 * guaranteed cache miss (#89).
 */
export const IAP_PROXY_DEFAULT_MAX_JEWELS = 8
export const IAP_PROXY_DEFAULT_MAX_PATHS_PER_JEWEL = 8
/** Attack-path facade graph-view lateral fan-out (backend caps at 100). */
export const IAP_PROXY_DEFAULT_LATERAL_CAP = 50

export type IapProxyQueryOptions = {
  maxJewels?: string | number
  maxPathsPerJewel?: string | number
  envelope?: boolean
  enriched?: boolean
  includeStale?: boolean
  includeDeleted?: boolean
}

export function buildIapIdentityAttackPathsQuery(
  opts: IapProxyQueryOptions = {},
): string {
  const maxJewels = opts.maxJewels ?? IAP_PROXY_DEFAULT_MAX_JEWELS
  const maxPathsPerJewel =
    opts.maxPathsPerJewel ?? IAP_PROXY_DEFAULT_MAX_PATHS_PER_JEWEL
  const parts = [
    `max_jewels=${maxJewels}`,
    `max_paths_per_jewel=${maxPathsPerJewel}`,
  ]
  if (opts.envelope) parts.push("envelope=true")
  if (opts.enriched) parts.push("enriched=true")
  if (opts.includeStale) parts.push("include_stale=true")
  if (opts.includeDeleted) parts.push("include_deleted=true")
  return `?${parts.join("&")}`
}
