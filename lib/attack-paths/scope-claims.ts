/**
 * (AP201 / CP-C-1, R11) The claims the Attack Paths page puts on its per-jewel reads.
 *
 * On a control plane with several registered workload accounts the backend refuses an unnamed read by name
 * (422 ACCOUNT_SCOPE_REQUIRED); the page's selected account is the name. account_id is sent when a system key names an
 * account (the key's account wins) or when the page has a selected 12-digit account; neither, nothing is sent. The rule for what counts as a selected
 * account is the one blast-radius already applies to `useAccountScope` ("all" and anything that is not a 12-digit
 * account id mean no account) — `normalizeBlastRadiusScope`, not a second reading of the same scope.
 */
import { normalizeBlastRadiusScope } from "@/components/attack-paths-v2/blast-radius-scope"

export interface ScopeClaims {
  customerId: string | null
  accountId: string | null
  /** A7 B5 (release/resident): the page's system KEY when it was opened by key -- names ONE system. */
  systemKey?: string | null
  /** A7 B5: the account a tag / source system key belongs to (sent only with a key, as `systemScopeQuery` does). */
  systemAccountId?: string | null
}

export const NO_SCOPE_CLAIMS: ScopeClaims = { customerId: null, accountId: null }

/** The claims for a scope as `useAccountScope` / `useOptionalAccountScope` hold it (null = no provider). */
export function scopeClaimsFrom(
  scope: { customerId?: string | null; accountId?: string | null } | null | undefined,
): ScopeClaims {
  if (!scope) return NO_SCOPE_CLAIMS
  const normalized = normalizeBlastRadiusScope(scope)
  // Merged rule (Alon, 2026-10-17, R11 over A7 B5): the claims ride only when the page has a SELECTED 12-digit account.
  // With none ("all", no provider, malformed) no claim is sent at all, so a by-name read stays byte-identical; a system
  // key's own account still names the read (appendScopeClaims).
  const accountId = normalized.accountId ?? null
  if (!accountId) return NO_SCOPE_CLAIMS
  const customerId = normalized.customerId && normalized.customerId !== "all" ? normalized.customerId : null
  return { customerId, accountId }
}

/** Put the claims on a query (nothing when a claim is absent). With a system key (A7 B5) the key goes on, and the key's
 *  own account -- the account that system lives in -- replaces the selected-account claim: one `account_id`, never two. */
export function appendScopeClaims(qs: URLSearchParams, claims: ScopeClaims | null | undefined): URLSearchParams {
  if (claims?.customerId) qs.set("customer_id", claims.customerId)
  if (claims?.accountId) qs.set("account_id", claims.accountId)
  if (claims?.systemKey) {
    qs.set("system_key", claims.systemKey)
    if (claims.systemAccountId) qs.set("account_id", claims.systemAccountId)
  }
  return qs
}

/** A stable fragment for client cache keys: a cached reading for one account is never painted for another. */
export function scopeClaimsKey(claims: ScopeClaims | null | undefined): string {
  return appendScopeClaims(new URLSearchParams(), claims).toString()
}
