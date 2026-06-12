"use client"

// Resolves the AttackPathReport for a path from the BACKEND compiler:
//   GET /api/proxy/attack-paths/path/<id>/report  (canonical, evidence-graded)
//
// Reliability contract (2026-06-10, ratified review):
//   The backend report is the single source of truth. On transient failure
//   (Render/Aura cold start, 55s proxy timeout) we RETRY ONCE, then surface an
//   honest "temporarily unavailable" error — we do NOT silently fall back to a
//   client bridge whose gate derivation contradicts the backend. A contradicting
//   fallback is worse than an honest gap. The bridge compiler remains for local
//   dev / pre-backend environments behind ?reportBridge=1 only.
// NO MOCK — the report restructures live graph data only.

import { useCallback, useEffect, useState } from "react"
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
  /** "backend" = canonical compiler; "bridge" = explicit dev opt-in only. */
  source: "backend" | "bridge" | null
  loading: boolean
  /** Honest error string when the backend report is unavailable. */
  error: string | null
  /** Manual retry — wired to the "Retry" affordance in the unavailable card. */
  retry: () => void
}

const bridgeOptIn = (): boolean =>
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("reportBridge") === "1"

export function useAttackPathReport(
  path: IdentityAttackPath | null | undefined,
  jewel?: CrownJewelSummary | null,
  closure?: ClosurePreview | null,
): UseAttackPathReport {
  const [report, setReport] = useState<AttackPathReport | null>(null)
  const [source, setSource] = useState<"backend" | "bridge" | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const retry = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!path?.id) {
      setReport(null)
      setSource(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    const fetchReport = async (pathId: string): Promise<AttackPathReport> => {
      const r = await fetch(
        `/api/proxy/attack-paths/path/${encodeURIComponent(pathId)}/report`,
        { cache: "no-store" },
      )
      const body = await r.json().catch(() => null)
      if (r.ok && body && !body.error && Array.isArray(body.claims)) {
        return body as AttackPathReport
      }
      throw new Error(body?.error ?? `http_${r.status}`)
    }

    ;(async () => {
      let pathId: string
      try {
        pathId = await resolveClosurePathId(path)
      } catch (e) {
        if (!cancelled) {
          setError(String(e))
          setLoading(false)
        }
        return
      }

      // Backend-first with a single retry (covers cold-start / timeout).
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const rep = await fetchReport(pathId)
          if (cancelled) return
          setReport(rep)
          setSource("backend")
          setError(null)
          setLoading(false)
          return
        } catch (e) {
          if (cancelled) return
          if (attempt === 0) {
            await new Promise((res) => setTimeout(res, 1200))
            continue
          }
          // Final failure. Honest unavailable state — NOT a contradicting
          // bridge. Bridge only when explicitly opted in for dev.
          if (bridgeOptIn()) {
            setReport(compileAttackPathReport(path, jewel, closure))
            setSource("bridge")
            setError(null)
          } else {
            setReport(null)
            setSource(null)
            setError(String((e as Error).message ?? e))
          }
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [path?.id, path?.attack_path_id, path?.crown_jewel_id, jewel?.id, closure, nonce])

  return { report, source, loading, error, retry }
}
