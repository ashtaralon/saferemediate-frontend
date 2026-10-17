/**
 * (AP201 / CP-C-1, R11) The claims the Attack Paths page puts on its per-jewel reads.
 *
 * On a control plane with several registered workload accounts the backend refuses an unnamed read by name
 * (422 ACCOUNT_SCOPE_REQUIRED); the page's selected account is the name. The rule for what counts as a selected
 * account is the one blast-radius already applies to `useAccountScope` ("all" and anything that is not a 12-digit
 * account id mean no account) — `normalizeBlastRadiusScope`, not a second reading of the same scope.
 */
import { normalizeBlastRadiusScope } from "@/components/attack-paths-v2/blast-radius-scope"

export interface ScopeClaims {
  customerId: string | null
  accountId: string | null
}

export const NO_SCOPE_CLAIMS: ScopeClaims = { customerId: null, accountId: null }

/** The claims for a scope as `useAccountScope` / `useOptionalAccountScope` hold it (null = no provider). */
export function scopeClaimsFrom(
  scope: { customerId?: string | null; accountId?: string | null } | null | undefined,
): ScopeClaims {
  if (!scope) return NO_SCOPE_CLAIMS
  const normalized = normalizeBlastRadiusScope(scope)
  const customerId = normalized.customerId && normalized.customerId !== "all" ? normalized.customerId : null
  return { customerId, accountId: normalized.accountId ?? null }
}

/** Put the claims on a query (nothing when a claim is absent). */
export function appendScopeClaims(qs: URLSearchParams, claims: ScopeClaims | null | undefined): URLSearchParams {
  if (claims?.customerId) qs.set("customer_id", claims.customerId)
  if (claims?.accountId) qs.set("account_id", claims.accountId)
  return qs
}

/** A stable fragment for client cache keys: a cached reading for one account is never painted for another. */
export function scopeClaimsKey(claims: ScopeClaims | null | undefined): string {
  return appendScopeClaims(new URLSearchParams(), claims).toString()
}
