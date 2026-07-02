"use client"

import { useCallback, useEffect, useState } from "react"

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
  total_moves: number
  timestamp: string
  error?: string
}

export type LateralMovesFetchTarget = {
  systemName: string
  identityId: string
  jewelId?: string | null
}

export function useLateralMoves(target: LateralMovesFetchTarget | null) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<LateralMovesPayload | null>(null)

  const fetchMoves = useCallback(async (t: LateralMovesFetchTarget) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: "5" })
      if (t.jewelId) params.set("jewel_id", t.jewelId)
      const url = `/api/proxy/identity-attack-paths/${encodeURIComponent(t.systemName)}/identity/${encodeURIComponent(t.identityId)}/lateral-moves?${params.toString()}`
      const res = await fetch(url, { cache: "no-store" })
      const body = (await res.json().catch(() => ({}))) as Partial<LateralMovesPayload> & {
        error?: string
        detail?: string
      }
      if (!res.ok || body.error) {
        throw new Error(body.detail || body.error || `HTTP ${res.status}`)
      }
      setData(body as LateralMovesPayload)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load lateral moves")
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!target?.identityId || !target.systemName) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }
    fetchMoves(target)
  }, [target?.systemName, target?.identityId, target?.jewelId, fetchMoves])

  return { data, loading, error }
}
