"use client"

import { useCallback, useEffect, useState } from "react"
import type { DamageScopePayload } from "./damage-scope-drawer"

export type DamageScopeFetchTarget = {
  systemName: string
  pathId: string
  nodeId: string
}

export function useDamageScope(target: DamageScopeFetchTarget | null) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DamageScopePayload | null>(null)

  const fetchScope = useCallback(async (t: DamageScopeFetchTarget) => {
    setLoading(true)
    setError(null)
    try {
      const url = `/api/proxy/attack-paths/${encodeURIComponent(t.systemName)}/path/${encodeURIComponent(t.pathId)}/node/${encodeURIComponent(t.nodeId)}/damage-scope`
      const res = await fetch(url, { cache: "no-store" })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(
          (errBody as { detail?: string }).detail ||
            (errBody as { error?: string }).error ||
            `HTTP ${res.status}`,
        )
      }
      setData((await res.json()) as DamageScopePayload)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load damage scope")
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

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
