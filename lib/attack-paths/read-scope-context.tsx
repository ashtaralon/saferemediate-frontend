"use client"

/**
 * (AP201 review B1 / S1) The page's system identity, provided once by the Attack Paths page and read by every component
 * that issues a read, so a deep component (the per-path report's callers, the surface card, the lateral reach) names the
 * same account the page names -- the key's own account when the page was opened by key -- without threading props.
 */
import { createContext, createElement, useContext, useMemo, type ReactNode } from "react"

import { useOptionalAccountScope } from "@/lib/account-scope-context"
import { attackPathReadClaims, type ScopeClaims, type SystemIdentity } from "@/lib/attack-paths/scope-claims"

const SystemIdentityContext = createContext<SystemIdentity>({ systemKey: null, systemAccountId: null })

export function AttackPathSystemIdentity({
  systemKey,
  systemAccountId,
  children,
}: SystemIdentity & { children: ReactNode }) {
  const value = useMemo(
    () => ({ systemKey: systemKey || null, systemAccountId: systemKey ? systemAccountId || null : null }),
    [systemKey, systemAccountId],
  )
  return createElement(SystemIdentityContext.Provider, { value }, children)
}

/** The claims for one read: the selected account and the system identity (an explicit `identity` wins over the
 *  page's). Stable across renders while its four values are unchanged, so it can sit in a dependency list. */
export function useAttackPathReadClaims(identity?: SystemIdentity | null): ScopeClaims {
  const scope = useOptionalAccountScope()
  const page = useContext(SystemIdentityContext)
  const chosen = identity?.systemKey ? identity : page
  const claims = attackPathReadClaims(scope, chosen)
  return useMemo(
    () => claims,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the four values ARE the claims
    [claims.customerId, claims.accountId, claims.systemKey, claims.systemAccountId],
  )
}
