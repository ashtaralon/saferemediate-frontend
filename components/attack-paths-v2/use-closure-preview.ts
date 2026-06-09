"use client"

// Fetches the real closure preview for a path from the live backend (which
// reads the Neo4j AttackPath node). NO MOCK — returns null + an honest error
// string when unavailable, so the panel can render an empty/loading state.

import { useEffect, useState } from "react"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import { resolveClosurePathId } from "./derive-attack-path-id"
import type { ClosurePreview } from "./closure-outcome-types"

interface UseClosurePreview {
  closure: ClosurePreview | null
  loading: boolean
  error: string | null
}

type ClosurePathInput = Pick<
  IdentityAttackPath,
  "id" | "attack_path_id" | "nodes" | "crown_jewel_id"
> | null | undefined

export function useClosurePreview(path: ClosurePathInput): UseClosurePreview {
  const [closure, setClosure] = useState<ClosurePreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!path?.id) {
      setClosure(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    resolveClosurePathId(path)
      .then((pathId) =>
        fetch(`/api/proxy/attack-paths/path/${encodeURIComponent(pathId)}/closure-preview`, {
          cache: "no-store",
        }),
      )
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
  }, [path?.id, path?.attack_path_id, path?.crown_jewel_id, path?.nodes])

  return { closure, loading, error }
}
