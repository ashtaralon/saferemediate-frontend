"use client"

import { useCallback, useEffect, useState } from "react"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import { buildConvergenceFetchUrl } from "./convergence-fetch-url"
import type { CrownJewelConvergence } from "./convergence-types"

interface UseCrownJewelConvergenceResult {
  data: CrownJewelConvergence | null
  loading: boolean
  error: string | null
  retry: () => void
}

/** Fetches GET /api/proxy/attack-paths/<system>/by-crown-jewel for the
 *  given jewel. Pure data hook — no derivation, no presentation. */
export function useCrownJewelConvergence(
  systemName: string | null,
  jewel: CrownJewelSummary | null,
): UseCrownJewelConvergenceResult {
  const [data, setData] = useState<CrownJewelConvergence | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const retry = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!systemName || !jewel) {
      setData(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    const url = buildConvergenceFetchUrl(systemName, jewel)
    const ctrl = new AbortController()
    // Proxy route maxDuration is 60s and the backend fetch budget is 55s;
    // mirror that here so the client doesn't give up before the proxy does.
    // (Vercel function timeouts surfaced as opaque "signal is aborted" before.)
    const timer = setTimeout(
      () => ctrl.abort(new DOMException("Backend slow — no response in 55s", "TimeoutError")),
      55_000,
    )

    fetch(url, { cache: "no-store", signal: ctrl.signal })
      .then(async (r) => {
        const body = await r.json().catch(() => null)
        if (cancelled) return
        if (r.ok && body && !body.error) {
          setData(body as CrownJewelConvergence)
          setError(null)
        } else {
          setData(null)
          setError(body?.error ?? `http_${r.status}`)
        }
      })
      .catch((e) => {
        if (cancelled) return
        setData(null)
        const m = (e as Error).message ?? String(e)
        setError(m.includes("aborted without reason") ? "Backend slow — no response in 55s" : m)
      })
      .finally(() => {
        clearTimeout(timer)
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [systemName, jewel?.id, jewel?.canonical_id, jewel?.name, nonce])

  return { data, loading, error, retry }
}
