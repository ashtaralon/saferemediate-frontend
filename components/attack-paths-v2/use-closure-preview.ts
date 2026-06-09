"use client"

// Fetches the real closure preview for a path from the live backend (which
// reads the Neo4j AttackPath node). NO MOCK — returns null + an honest error
// string when unavailable, so the panel can render an empty/loading state.

import { useEffect, useState } from "react"
import type { ClosurePreview } from "./closure-outcome-types"

interface UseClosurePreview {
  closure: ClosurePreview | null
  loading: boolean
  error: string | null
}

export function useClosurePreview(pathId: string | null | undefined): UseClosurePreview {
  const [closure, setClosure] = useState<ClosurePreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!pathId) {
      setClosure(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/proxy/attack-paths/path/${encodeURIComponent(pathId)}/closure-preview`, { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json().catch(() => null)
        if (cancelled) return
        if (!r.ok || !body || body.error) {
          setError(body?.error ?? `http_${r.status}`)
          setClosure(null)
        } else {
          setClosure(body as ClosurePreview)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(String(e))
          setClosure(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [pathId])

  return { closure, loading, error }
}
