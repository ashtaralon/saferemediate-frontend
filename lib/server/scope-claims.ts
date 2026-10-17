/**
 * (AP201 / CP-C-1, R11) The tenant / account CLAIMS a page read carries to the backend.
 *
 * The backend admits every read for the server-owned scope and checks a claim against it: on a control plane with
 * several registered workload accounts a read must NAME the account (`account_id`) or it is refused by name
 * (422 ACCOUNT_SCOPE_REQUIRED), and a claim outside the server scope is 403. The claims never select the tenant.
 *
 * Since the A7 B5 merge the page's `system_key` (which names ONE system) travels the same way. A proxy copies them
 * verbatim onto the upstream query and keys its cache by them: a cached answer for one account
 * must never be served for another (the blast-radius proxy's rule, shared here).
 */
export const SCOPE_CLAIM_KEYS = ["customer_id", "account_id", "system_key"] as const   // + A7 B5 system key (release/resident)

/** Copy the claims present on `from` onto `to`; return the canonical fragment for a cache key ("" when none). */
export function forwardScopeClaims(from: URLSearchParams, to: URLSearchParams): string {
  const claims = new URLSearchParams()
  for (const key of SCOPE_CLAIM_KEYS) {
    const value = from.get(key)
    if (value) {
      to.set(key, value)
      claims.set(key, value)
    }
  }
  return claims.toString()
}
