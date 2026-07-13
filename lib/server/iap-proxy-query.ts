/**
 * Shared IAP proxy query limits — must match across Next.js proxy routes so
 * backend Redis cache keys align (system:max_jewels:max_paths_per_jewel:…).
 *
 * Attack Paths v2 must share this shape with the attack-path facade or
 * every path click is a guaranteed cache miss (#89).
 *
 * Use the API defaults (12×8): that key is what successful computes and
 * /health-warm paths actually land in. The 5×5 reduction (2026-07) left
 * FE on a cold key that Wave C fair-caps then starved into endless
 * `peer_computing` while 12×8 still served.
 */
export const IAP_PROXY_DEFAULT_MAX_JEWELS = 12
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
