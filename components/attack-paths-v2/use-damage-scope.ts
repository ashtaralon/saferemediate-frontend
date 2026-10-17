"use client"

import { useCallback, useEffect, useState } from "react"
import type { DamageScopePayload } from "./damage-scope-drawer"
import { heldRouteMessage } from "@/lib/attack-paths/held-route-message"
import { useAttackPathReadClaims } from "@/lib/attack-paths/read-scope-context"
import { scopeClaimsKey } from "@/lib/attack-paths/scope-claims"

export type DamageScopeFetchTarget = {
  systemName: string
  pathId: string
  nodeId: string
}

export function useDamageScope(target: DamageScopeFetchTarget | null) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DamageScopePayload | null>(null)
  // AP201 review S1: a held reader carries THE page's claims too (selected account; a system key's own account wins),
  // so the day its route is admitted it names the account the page names. Today the route answers its typed hold.
  const claims = useAttackPathReadClaims()
  const claimsQuery = scopeClaimsKey(claims)

  const fetchScope = useCallback(async (t: DamageScopeFetchTarget) => {
    setLoading(true)
    setError(null)
    try {
      const url = `/api/proxy/attack-paths/${encodeURIComponent(t.systemName)}/path/${encodeURIComponent(t.pathId)}/node/${encodeURIComponent(t.nodeId)}/damage-scope${claimsQuery ? `?${claimsQuery}` : ""}`
      const res = await fetch(url, { cache: "no-store" })
      if (!res.ok) {
        const errBody = await res.json().catch(() => null)
        throw new Error(heldRouteMessage(errBody, res.status, "Damage scope"))
      }
      setData((await res.json()) as DamageScopePayload)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load damage scope")
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [claimsQuery])

  useEffect(() => {
    if (!target?.nodeId || !target.pathId || !target.systemName) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }
    fetchScope(target)
  }, [target?.systemName, target?.pathId, target?.nodeId, fetchScope])

  return { data, loading, error, refetch: () => target && fetchScope(target) }
}
