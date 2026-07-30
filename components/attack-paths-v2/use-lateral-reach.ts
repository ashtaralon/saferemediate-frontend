"use client"

// Fetches the reachable-but-never-used bands for a crown jewel from the live
// backend (which computes them from :PermissionStatement grants minus observed
// ACCESSES_RESOURCE). NO MOCK — returns null + an honest error when
// unavailable, with one retry for Render cold-start.

import { useCallback, useEffect, useState } from "react"

export type LateralBand = "USED" | "CUTTABLE" | "UNKNOWN"

export interface LateralReachRole {
  role_arn: string
  role_name: string | null
  /** WILDCARD = Resource:"*" grant (reaches every jewel of this service). */
  reach_kind: "WILDCARD" | "SCOPED" | null
  /** Observations against OTHER resources of the same service — the coverage proof. */
  observed_on_service: number
  observed_on_this_jewel: number
  /** Populated for UNKNOWN: why we refuse to judge. */
  reason: string | null
  statement_count: number
}

export interface LateralReachPayload {
  jewel_ref: string
  jewel_label: string
  system_name?: string
  supported: boolean
  reason?: string
  service_prefix?: string
  bands: Record<LateralBand, LateralReachRole[]>
  counts: {
    reachable_total: number
    USED: number
    CUTTABLE: number
    UNKNOWN: number
  }
  /**
   * Roles that can reach this jewel but which we cannot judge. Surfaced by the
   * backend at the top level on purpose — rendering only CUTTABLE would show a
   * short, reassuring list while hiding these.
   */
  unjudgeable: number
}

export interface LateralReachTarget {
  systemName: string
  jewelRef: string
  jewelType: string
}

/**
 * Map a crown-jewel type onto the three labels the backend engine supports.
 *
 * Returns null for anything unmapped, and callers MUST then skip the fetch and
 * render "not evaluated" rather than guessing a type. Guessing would produce a
 * confident, wrong band set for the wrong service — and an empty cut list reads
 * as "nothing can reach this", which is the most dangerous thing this panel
 * could imply. `type` is a loosely-typed string across the jewel payloads, so
 * accept the spellings that actually occur instead of assuming one.
 */
export function normalizeJewelType(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim().toLowerCase()
  if (!t) return null
  if (t === "s3bucket" || t === "s3" || t === "bucket") return "S3Bucket"
  if (t === "dynamodbtable" || t === "dynamodb" || t === "ddb" || t === "table") {
    return "DynamoDBTable"
  }
  if (t === "kmskey" || t === "kms" || t === "key") return "KMSKey"
  return null
}

interface UseLateralReach {
  data: LateralReachPayload | null
  loading: boolean
  error: string | null
  retry: () => void
}

export function useLateralReach(
  target: LateralReachTarget | null,
): UseLateralReach {
  const [data, setData] = useState<LateralReachPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const retry = useCallback(() => setNonce((n) => n + 1), [])

  const systemName = target?.systemName ?? null
  const jewelRef = target?.jewelRef ?? null
  const jewelType = target?.jewelType ?? null

  useEffect(() => {
    if (!systemName || !jewelRef || !jewelType) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    const fetchOnce = async (): Promise<LateralReachPayload> => {
      const url =
        `/api/proxy/attack-paths/${encodeURIComponent(systemName)}/jewel-lateral-reach` +
        `?jewel_ref=${encodeURIComponent(jewelRef)}&jewel_type=${encodeURIComponent(jewelType)}`
      const r = await fetch(url, { cache: "no-store" })
      const body = await r.json().catch(() => null)
      if (!r.ok || !body || body.error) {
        throw new Error(body?.error ?? `http_${r.status}`)
      }
      return body as LateralReachPayload
    }

    ;(async () => {
      try {
        let payload: LateralReachPayload
        try {
          payload = await fetchOnce()
        } catch {
          // One retry — Render cold-starts routinely lose the first request.
          payload = await fetchOnce()
        }
        if (!cancelled) setData(payload)
      } catch (e) {
        if (!cancelled) {
          setData(null)
          setError(e instanceof Error ? e.message : "lateral_reach_failed")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [systemName, jewelRef, jewelType, nonce])

  return { data, loading, error, retry }
}
