"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { CrownJewelConvergence } from "@/lib/attack-paths/convergence-types"

export function useCrownJewelConvergence(
  systemName: string,
  cjArn: string | null,
  cjName: string | null,
  enabled = true,
) {
  const url = useMemo(() => {
    if (!enabled || !systemName || (!cjArn && !cjName)) return null
    const qs = new URLSearchParams()
    if (cjArn) qs.set("cj_arn", cjArn)
    if (cjName) qs.set("cj_name", cjName)
    return `/api/proxy/attack-paths/${encodeURIComponent(systemName)}/by-crown-jewel?${qs.toString()}`
  }, [enabled, systemName, cjArn, cjName])

  const [data, setData] = useState<CrownJewelConvergence | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const retry = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!url) {
      setData(null)
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          const msg =
            (body as { detail?: string; error?: string }).detail ??
            (body as { error?: string }).error ??
            `HTTP ${res.status}`
          throw new Error(msg)
        }
        return body as CrownJewelConvergence
      })
      .then((json) => {
        if (!cancelled) setData(json)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setData(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [url, nonce])

  return { data, loading, error, retry }
}
