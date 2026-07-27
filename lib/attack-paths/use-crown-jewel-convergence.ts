"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CrownJewelSummary, IdentityAttackPath } from "@/components/identity-attack-paths/types"
import {
  buildConvergenceDetailUrl,
  buildConvergenceSummaryUrl,
} from "./convergence-fetch-url"
import {
  detailsLoadingFor,
  detailsReadyFor,
  mapPool,
  mergeSummaryWithPathDetails,
  pathIdsNeedingDetail,
  type PathDetailRecord,
} from "./convergence-path-details"
import { matchConvergencePathId } from "./iap-to-convergence"
import type {
  ConvergencePath,
  CrownJewelConvergence,
  CrownJewelConvergenceSummary,
} from "./convergence-types"

interface UseCrownJewelConvergenceResult {
  data: CrownJewelConvergence | null
  loading: boolean
  /** True while summary auto-retry is scheduled / in flight. */
  retrying: boolean
  /** True while one or more required path /detail fetches are unsettled. */
  detailsLoading: boolean
  /** True when every required path detail has settled (ready or error). */
  detailsReady: boolean
  /** How many summary attempts have been made for this jewel (1-based). */
  attempts: number
  error: string | null
  retry: () => void
}

const MAX_AUTO_RETRIES = 4
const RETRY_DELAYS_MS = [3000, 6000, 10000, 15000]
/** Parallel /detail fetches — keep modest to avoid proxy saturation. */
const DETAIL_FETCH_CONCURRENCY = 4

/** Summary first (fast strip) + hop detail for every path in the model.
 *
 * Fan-in (no path pin) detail-fetches ALL summary path_ids so the
 * path-authority canvas never paints a Lambda-only spine over an EC2
 * sibling that still has subnet/SG/NACL hops in Neo4j.
 *
 * Cold Render workers often return nothing for 55s+ on first hit. We auto-
 * retry the summary a few times instead of surfacing a hard HTTP 502 after
 * one abort — operators were getting bricked by a single cold miss.
 */
export function useCrownJewelConvergence(
  systemName: string | null,
  jewel: CrownJewelSummary | null,
  selectedPathId: string | null = null,
  iapPaths: IdentityAttackPath[] = [],
): UseCrownJewelConvergenceResult {
  const [summary, setSummary] = useState<CrownJewelConvergenceSummary | null>(null)
  const [detailsByPathId, setDetailsByPathId] = useState<
    Record<string, PathDetailRecord>
  >({})
  const [loading, setLoading] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const attemptRef = useRef(0)

  const retry = useCallback(() => {
    attemptRef.current = 0
    setAttempts(0)
    setNonce((n) => n + 1)
  }, [])

  // Phase 1: summary with auto-retry on cold timeout / 5xx.
  useEffect(() => {
    if (!systemName || !jewel) {
      setSummary(null)
      setDetailsByPathId({})
      setError(null)
      setLoading(false)
      setRetrying(false)
      setAttempts(0)
      attemptRef.current = 0
      return
    }

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    attemptRef.current = 0
    setAttempts(0)
    setLoading(true)
    setRetrying(false)
    setError(null)
    setDetailsByPathId({})
    setSummary(null)

    const summaryUrl = buildConvergenceSummaryUrl(systemName, jewel)

    const runAttempt = async () => {
      if (cancelled) return
      attemptRef.current += 1
      const attempt = attemptRef.current
      setAttempts(attempt)
      setLoading(true)
      setRetrying(attempt > 1)
      setError(null)

      const ctrl = new AbortController()
      const timer = setTimeout(
        () =>
          ctrl.abort(
            new DOMException("Backend warming up — retrying…", "TimeoutError"),
          ),
        55_000,
      )

      try {
        const summaryRes = await fetch(summaryUrl, { signal: ctrl.signal })
        const summaryBody = (await summaryRes.json().catch(() => null)) as
          | CrownJewelConvergenceSummary
          | { error?: string }
          | null
        if (cancelled) return
        if (!summaryRes.ok || !summaryBody || "error" in summaryBody) {
          const msg =
            (summaryBody as { error?: string })?.error ??
            `Backend busy (${summaryRes.status})`
          throw new Error(msg)
        }
        setSummary(summaryBody as CrownJewelConvergenceSummary)
        setError(null)
        setRetrying(false)
        setLoading(false)
      } catch (e) {
        if (cancelled) return
        const m = (e as Error).message ?? String(e)
        const friendly =
          m.includes("aborted") || m.includes("Timeout")
            ? "Backend warming up — retrying…"
            : m.startsWith("HTTP") || m.startsWith("http_")
              ? "Backend busy — retrying…"
              : m
        if (attempt <= MAX_AUTO_RETRIES) {
          setError(friendly)
          setRetrying(true)
          setLoading(false)
          const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)]
          retryTimer = setTimeout(() => {
            void runAttempt()
          }, delay)
          return
        }
        setSummary(null)
        setError(
          "Couldn’t reach path data after several tries — backend may be cold. Hit Retry.",
        )
        setRetrying(false)
        setLoading(false)
      } finally {
        clearTimeout(timer)
      }
    }

    void runAttempt()

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [systemName, jewel?.id, jewel?.canonical_id, jewel?.name, nonce])

  const resolvedSelectedPathId = useMemo(
    () => (summary ? matchConvergencePathId(summary.paths, selectedPathId, iapPaths) : null),
    [summary, selectedPathId, iapPaths],
  )

  const neededDetailIds = useMemo(
    () => pathIdsNeedingDetail(summary, resolvedSelectedPathId),
    [summary, resolvedSelectedPathId],
  )

  // Phase 2: hop detail for every path the model needs (fan-in = all).
  useEffect(() => {
    if (!systemName || !jewel || !summary) return
    if (neededDetailIds.length === 0) return

    let cancelled = false

    // Mark required ids pending (preserve already-ready rows for the same pin).
    setDetailsByPathId((prev) => {
      const next: Record<string, PathDetailRecord> = {}
      for (const id of neededDetailIds) {
        const existing = prev[id]
        next[id] =
          existing?.state === "ready" && existing.path
            ? existing
            : { state: "pending" }
      }
      return next
    })

    const run = async () => {
      await mapPool(neededDetailIds, DETAIL_FETCH_CONCURRENCY, async (pathId) => {
        if (cancelled) return pathId
        const detailUrl = buildConvergenceDetailUrl(systemName, jewel, pathId)
        const ctrl = new AbortController()
        const timer = setTimeout(
          () =>
            ctrl.abort(
              new DOMException("Backend slow — no response in 55s", "TimeoutError"),
            ),
          55_000,
        )
        try {
          const detailRes = await fetch(detailUrl, {
            cache: "no-store",
            signal: ctrl.signal,
          })
          const detailBody = (await detailRes.json().catch(() => null)) as
            | { path?: ConvergencePath; error?: string }
            | null
          if (cancelled) return pathId
          if (detailRes.ok && detailBody?.path) {
            setDetailsByPathId((prev) => ({
              ...prev,
              [pathId]: { state: "ready", path: detailBody.path! },
            }))
          } else {
            setDetailsByPathId((prev) => ({
              ...prev,
              [pathId]: {
                state: "error",
                error:
                  detailBody?.error ??
                  `detail ${detailRes.status}`,
              },
            }))
          }
        } catch (e) {
          if (cancelled) return pathId
          setDetailsByPathId((prev) => ({
            ...prev,
            [pathId]: {
              state: "error",
              error: (e as Error).message ?? "detail fetch failed",
            },
          }))
        } finally {
          clearTimeout(timer)
        }
        return pathId
      })
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [
    systemName,
    jewel?.id,
    jewel?.canonical_id,
    jewel?.name,
    resolvedSelectedPathId,
    summary,
    neededDetailIds.join("|"),
    nonce,
  ])

  const data =
    summary != null ? mergeSummaryWithPathDetails(summary, detailsByPathId) : null

  const detailsReady = detailsReadyFor(neededDetailIds, detailsByPathId)
  const detailsLoading = detailsLoadingFor(neededDetailIds, detailsByPathId)

  return {
    data,
    loading,
    retrying,
    detailsLoading,
    detailsReady,
    attempts,
    error,
    retry,
  }
}

/** Minimal jewel for callers that only have arn/name (convergence-map-loader). */
export function crownJewelFromArnName(
  cjArn: string | null,
  cjName: string | null,
): CrownJewelSummary | null {
  if (!cjArn && !cjName) return null
  const id = cjArn || cjName || ""
  return {
    id,
    canonical_id: cjArn,
    name: cjName || cjArn || id,
    type: "Unknown",
    severity: "MEDIUM",
    path_count: 0,
    highest_risk_score: 0,
    is_internet_exposed: false,
    data_classification: null,
    priority_score: 0,
  }
}
