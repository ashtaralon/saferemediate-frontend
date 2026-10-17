"use client"

// Resolves the AttackPathReport for a path from the BACKEND compiler:
//   GET /api/proxy/attack-paths/path/<id>/report  (canonical, evidence-graded)
//
// Reliability contract (2026-06-10, ratified; bridge removed by PR 3 / #35):
//   The backend report is the single source of truth. On transient failure
//   (Render/Aura cold start, 55s proxy timeout) we retry up to twice, then
//   surface an honest "temporarily unavailable" error. There is NO client
//   fallback — a contradicting fallback is worse than an honest gap, and
//   the ?reportBridge=1 escape hatch outlived its purpose now that the
//   backend compiler is live everywhere.
// NO MOCK — the report restructures live graph data only.

import { useCallback, useEffect, useState } from "react"
import type {
  IdentityAttackPath,
  CrownJewelSummary,
} from "@/components/identity-attack-paths/types"
import { coerceProxyErrorMessage } from "@/lib/proxy-error-message"
import { useAttackPathReadClaims } from "@/lib/attack-paths/read-scope-context"
import { scopeClaimsKey } from "@/lib/attack-paths/scope-claims"
import { heldRouteAccountSelection, heldRouteMessage } from "@/lib/attack-paths/held-route-message"
import { semanticHoldMessage, semanticStatusHold, typedReaderUnavailable, typedServingRefusal } from "@/lib/semantic-hold"
import { resolveClosurePathId } from "./derive-attack-path-id"
import type { ClosurePreview } from "./closure-outcome-types"
import type { AttackPathReport } from "./attack-path-report-types"

interface UseAttackPathReport {
  report: AttackPathReport | null
  /** Provenance — always "backend" when populated. Kept for callers
   *  that branch on it; the legacy "bridge" variant was deleted in
   *  PR 3 along with the FE compile fallback. */
  source: "backend" | null
  loading: boolean
  /** Honest error string when the backend report is unavailable. */
  error: string | null
  /** The server served the report marked stale (its publication was invalidated since): show it as such. */
  stale: boolean
  /** Manual retry — wired to the "Retry" affordance in the unavailable card. */
  retry: () => void
}

/** A typed server answer: said once, never retried as if the backend were cold. */
class SettledReportAnswer extends Error {}

export function useAttackPathReport(
  path: IdentityAttackPath | null | undefined,
  _jewel?: CrownJewelSummary | null,
  _closure?: ClosurePreview | null,
): UseAttackPathReport {
  const [report, setReport] = useState<AttackPathReport | null>(null)
  const [source, setSource] = useState<"backend" | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const [stale, setStale] = useState(false)
  const retry = useCallback(() => setNonce((n) => n + 1), [])
  // AP201 Rev 6 Day 4.3 + review B1: the report read carries THE page's claims (useAttackPathReadClaims): the selected
  // account, and -- when the page was opened by system key -- the key, whose own account replaces the selection, so the
  // read names the account the "Reads scoped to account ..." banner says.
  const claims = useAttackPathReadClaims()
  const claimsQuery = scopeClaimsKey(claims)

  useEffect(() => {
    if (!path?.id) {
      setReport(null)
      setSource(null)
      setError(null)
      return
    }
    let cancelled = false
    // AP201 (M1): the previous path's report must not stand under the new pin while this one loads (UI-24).
    setReport(null)
    setSource(null)
    setStale(false)
    setLoading(true)
    setError(null)
    const qs = claimsQuery

    // Bounded per-attempt timeout so the card's skeleton never becomes an
    // open-ended 30–60s spinner waiting on the 55s proxy abort. A warm backend
    // returns in ~0.3s; 25s comfortably covers a cold Aura/Render wake, and the
    // retries below give the now-warm backend a fast second chance.
    const ATTEMPT_TIMEOUT_MS = 25_000
    const fetchReport = async (pathId: string): Promise<AttackPathReport> => {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), ATTEMPT_TIMEOUT_MS)
      try {
        const r = await fetch(
          `/api/proxy/attack-paths/path/${encodeURIComponent(pathId)}/report${qs ? `?${qs}` : ""}`,
          { cache: "no-store", signal: ctrl.signal },
        )
        const body = await r.json().catch(() => null)
        const hold = r.ok ? semanticStatusHold(body) : null
        if (hold) throw new SettledReportAnswer(`Attack-path report: ${semanticHoldMessage(hold)}`)
        if (!r.ok && (typedServingRefusal(body) || typedReaderUnavailable(body)
          || (r.status < 500 && typeof (body as { detail?: { code?: unknown } } | null)?.detail?.code === "string"))) {
          throw new SettledReportAnswer(heldRouteMessage(body, r.status, "Attack-path report", heldRouteAccountSelection(claims)))
        }
        if (r.ok && body && !body.error && Array.isArray(body.claims)) {
          return body as AttackPathReport
        }
        const msg = coerceProxyErrorMessage(
          body,
          (body as { error?: string } | null)?.error ?? `http_${r.status}`,
        )
        throw new Error(msg)
      } finally {
        clearTimeout(timer)
      }
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

      // Backend-first with retries (cold Render/Aura wake).
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const rep = await fetchReport(pathId)
          if (cancelled) return
          setStale((rep as { fromStaleCache?: unknown }).fromStaleCache === true)
          setReport(rep)
          setSource("backend")
          setError(null)
          setLoading(false)
          return
        } catch (e) {
          if (cancelled) return
          if (attempt < 2 && !(e instanceof SettledReportAnswer)) {
            await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)))
            continue
          }
          // Final failure. Honest unavailable state — no FE fallback.
          setReport(null)
          setSource(null)
          setError(String((e as Error).message ?? e))
          setLoading(false)
          return
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [path?.id, path?.attack_path_id, nonce, claimsQuery])

  return { report, source, loading, error, stale, retry }
}
