"use client"

// Fetches the real closure preview for a path from the live backend (which
// reads the Neo4j AttackPath node). NO MOCK — returns null + an honest error
// string when unavailable, plus a single retry (cold-start safety) and a
// manual retry() for the "Retry" affordance in the timeout card.

import { useCallback, useEffect, useState } from "react"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import { resolveReportPathIds } from "./derive-attack-path-id"
import type { ClosurePreview } from "./closure-outcome-types"

interface UseClosurePreview {
  closure: ClosurePreview | null
  loading: boolean
  error: string | null
  /** Manual retry — wired to the "Retry" button in the timeout card. */
  retry: () => void
}

type ClosurePathInput = Pick<
  IdentityAttackPath,
  "id" | "attack_path_id" | "nodes" | "crown_jewel_id" | "materialized"
> & {
  materialized_path?: { id?: string | null } | null
} | null | undefined

function isNotFoundError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err).toLowerCase()
  return (
    msg.includes("not found") ||
    msg.includes("http_404") ||
    msg.includes("404")
  )
}

export function useClosurePreview(path: ClosurePathInput): UseClosurePreview {
  const [closure, setClosure] = useState<ClosurePreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const retry = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!path?.id) {
      setClosure(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    const fetchOnce = async (pathId: string): Promise<ClosurePreview> => {
      const r = await fetch(
        `/api/proxy/attack-paths/path/${encodeURIComponent(pathId)}/closure-preview`,
        { cache: "no-store" },
      )
      const body = await r.json().catch(() => null)
      if (!r.ok || !body || body.error) throw new Error(body?.error ?? `http_${r.status}`)
      return body as ClosurePreview
    }

    ;(async () => {
      let candidates: string[]
      try {
        candidates = await resolveReportPathIds(path)
      } catch (e) {
        if (!cancelled) {
          setError(String(e))
          setLoading(false)
        }
        return
      }

      let lastError: unknown = null
      for (let ci = 0; ci < candidates.length; ci++) {
        const pathId = candidates[ci]
        // One retry covers Render/Aura cold start before trying the next id.
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const data = await fetchOnce(pathId)
            if (cancelled) return
            setClosure(data)
            setError(null)
            setLoading(false)
            return
          } catch (e) {
            if (cancelled) return
            lastError = e
            if (isNotFoundError(e) && ci < candidates.length - 1) {
              break
            }
            if (attempt === 0) {
              await new Promise((res) => setTimeout(res, 1200))
              continue
            }
          }
        }
      }

      if (cancelled) return
      // Keep last-good closure on screen (stale) rather than blanking it.
      setError(String((lastError as Error)?.message ?? lastError ?? "closure_unavailable"))
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  // Stable scalars only — `path.nodes` is a new array ref every parent render
  // and was causing an infinite re-fetch / perpetual "Computing closure preview…".
  }, [path?.id, path?.attack_path_id, path?.crown_jewel_id, path?.materialized, nonce])

  return { closure, loading, error, retry }
}
