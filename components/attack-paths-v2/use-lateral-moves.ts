"use client"

import { useCallback, useEffect, useState } from "react"
import { useAttackPathReadClaims } from "@/lib/attack-paths/read-scope-context"
import { heldRouteMessage } from "@/lib/attack-paths/held-route-message"
import { appendScopeClaims } from "@/lib/attack-paths/scope-claims"

export type LateralMoveEvidence = "OBSERVED" | "CONFIGURED" | "BLOCKED" | "UNKNOWN"
export type LateralMoveRisk = "REAL_DAMAGE" | "CAPABILITY" | "PIVOT" | "CONTAINED" | "UNKNOWN"
export type LateralMoveType =
  | "shared_role"
  | "additional_jewel"
  | "assume_role"
  | "pass_role"
  | "ssm_execution"
  | "network_lateral"

export interface LateralMove {
  type: LateralMoveType
  target: string
  evidence: LateralMoveEvidence
  risk: LateralMoveRisk
  cj_type?: string | null
  detail?: Record<string, unknown>
}

export interface LateralMovesPayload {
  system_name: string
  identity_id: string
  excluded_jewel_id: string | null
  moves: LateralMove[]
  /** Server-ranked top blast + mitigation hint (PRD Lateral lens). */
  highest_blast?: {
    type?: string
    target?: string
    evidence?: string
    risk?: string
    mitigation_hint?: string
  } | null
  /** Best-effort sections that timed out / failed (network, IAM). */
  degraded?: string[]
  total_moves: number
  timestamp: string
  error?: string
}

export type LateralMovesFetchTarget = {
  systemName: string
  identityId: string
  jewelId?: string | null
}

export function useLateralMoves(
  target: LateralMovesFetchTarget | null,
  opts?: { limit?: number },
) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<LateralMovesPayload | null>(null)
  // AP201 review S1: a held reader carries THE page's claims too (selected account; a system key's own account wins),
  // so the day its route is admitted it names the account the page names. 
  const claims = useAttackPathReadClaims()
  const limit = opts?.limit ?? 5

  const fetchMoves = useCallback(
    async (t: LateralMovesFetchTarget) => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ limit: String(limit) })
        appendScopeClaims(params, claims)
        if (t.jewelId) params.set("jewel_id", t.jewelId)
        const url = `/api/proxy/identity-attack-paths/${encodeURIComponent(t.systemName)}/identity/${encodeURIComponent(t.identityId)}/lateral-moves?${params.toString()}`
        const res = await fetch(url, { cache: "no-store" })
        const body = (await res.json().catch(() => ({}))) as Partial<LateralMovesPayload> & {
          error?: string
          detail?: string
        }
        if (!res.ok) {
          // Review S11: a typed hold's detail is an OBJECT ({code, reason}); `body.detail || ...` made it
          // "[object Object]". The shared message says a held route is held, and a plain detail as it is.
          throw new Error(heldRouteMessage(body, res.status, "Lateral moves"))
        }
        // Soft failures (overall_timeout, degraded sections) arrive as 200
        // with error/degraded set — keep the payload so the UI can show a
        // typed empty instead of inventing "no pivots = safe".
        setData(body as LateralMovesPayload)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load lateral moves")
        setData(null)
      } finally {
        setLoading(false)
      }
    },
    [limit, claims],
  )

  useEffect(() => {
    if (!target?.identityId || !target.systemName) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }
    fetchMoves(target)
  }, [
    target?.systemName,
    target?.identityId,
    target?.jewelId,
    fetchMoves,
  ])

  return { data, loading, error }
}
