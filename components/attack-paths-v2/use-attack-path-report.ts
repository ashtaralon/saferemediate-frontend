"use client"

// Resolves the AttackPathReport for a path. Backend-first:
//   1. GET /api/proxy/attack-paths/path/<id>/report  (canonical compiler)
//   2. Fallback: client-side BRIDGE compiler over the same real fields —
//      marked via report.compiler_version ("bridge-…") so the UI can show
//      the operator which compiler authored the claims.
// NO MOCK — both sources restructure live graph data only.

import { useEffect, useState } from "react"
import type {
  IdentityAttackPath,
  CrownJewelSummary,
} from "@/components/identity-attack-paths/types"
import { resolveClosurePathId } from "./derive-attack-path-id"
import type { ClosurePreview } from "./closure-outcome-types"
import type { AttackPathReport } from "./attack-path-report-types"
import { compileAttackPathReport } from "./compile-attack-path-report"

interface UseAttackPathReport {
  report: AttackPathReport | null
  /** "backend" = canonical compiler; "bridge" = interim client compile. */
  source: "backend" | "bridge" | null
  loading: boolean
}

export function useAttackPathReport(
  path: IdentityAttackPath | null | undefined,
  jewel?: CrownJewelSummary | null,
  closure?: ClosurePreview | null,
): UseAttackPathReport {
  const [report, setReport] = useState<AttackPathReport | null>(null)
  const [source, setSource] = useState<"backend" | "bridge" | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!path?.id) {
      setReport(null)
      setSource(null)
      return
    }
    let cancelled = false
    setLoading(true)

    const fallback = () => {
      if (cancelled) return
      setReport(compileAttackPathReport(path, jewel, closure))
      setSource("bridge")
    }

    resolveClosurePathId(path)
      .then((pathId) =>
        fetch(`/api/proxy/attack-paths/path/${encodeURIComponent(pathId)}/report`, {
          cache: "no-store",
        }),
      )
      .then(async (r) => {
        const body = await r.json().catch(() => null)
        if (cancelled) return
        if (r.ok && body && !body.error && Array.isArray(body.claims)) {
          setReport(body as AttackPathReport)
          setSource("backend")
        } else {
          fallback()
        }
      })
      .catch(fallback)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [path, jewel, closure])

  return { report, source, loading }
}
