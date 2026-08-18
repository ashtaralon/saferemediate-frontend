/**
 * Version of the Identity Attack Paths behavioral edge contract.
 *
 * This value is part of both the browser URL and server cache key. Changing
 * it invalidates browser, Vercel CDN, function-memory, and backend snapshot
 * caches together when the path DTO meaning changes.
 */
export const IAP_BEHAVIORAL_CONTRACT = "behavioral-access-rollup-v2"
export const IAP_BEHAVIORAL_CONTRACT_QUERY =
  `contract=${IAP_BEHAVIORAL_CONTRACT}`
