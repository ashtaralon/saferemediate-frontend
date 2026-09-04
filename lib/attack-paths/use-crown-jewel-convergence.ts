"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CrownJewelSummary, IdentityAttackPath } from "@/components/identity-attack-paths/types"
import {
  buildConvergenceDetailUrl,
  buildConvergenceSummaryUrl,
} from "./convergence-fetch-url"
import {
  detailFailuresFor,
  detailsLoadingFor,
  detailsReadyFor,
  fetchConvergencePathDetail,
  mapPool,
  mergeSummaryWithPathDetails,
  pathIdsNeedingDetail,
  type PathDetailRecord,
} from "./convergence-path-details"
import { matchConvergencePathId } from "./iap-to-convergence"
import type {
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
  /** Paths whose hop /detail fetch failed — never silent on the map. */
  detailFailures: Array<{ pathId: string; error?: string }>
  /** How many summary attempts have been made for this jewel (1-based). */
  attempts: number
  error: string | null
  retry: () => void
}

export type UseCrownJewelConvergenceOptions = {
  /**
   * Fan-in honesty: detail-fetch EVERY summary path even when a pin is
   * set. Pin only reorders (pin first) so the dossier settles before
   * siblings. Without this, a pin shrinks the set to one path_id.
   */
  fanInAllDetails?: boolean
}

/**
 * Retry budget (Attack Paths V3 plan §11): ONE auto-retry, 15s per attempt.
 * The old 4×55s ladder held the rail on a spinner for minutes against a cold
 * worker that was never going to answer; after two misses the honest state
 * is "warming up — Retry", not a fifth attempt.
 */
const MAX_AUTO_RETRIES = 1
/** Attempts the hook makes on its own (initial + auto-retries). Exported so
 *  the rail's hard-error gate reads the budget instead of pinning a number
 *  that silently goes stale when the budget changes. */
export const SUMMARY_MAX_ATTEMPTS = MAX_AUTO_RETRIES + 1
const RETRY_DELAYS_MS = [3000]
/** Client per-attempt abort for the summary fetch. */
export const SUMMARY_ATTEMPT_TIMEOUT_MS = 15_000
/**
 * Sibling /detail concurrency after the pin settles. Keep low so a cold
 * Render worker is not flooded (fan-in used to fire 4×55s aborts at once).
 */
const DETAIL_SIBLING_CONCURRENCY = 2

/** Summary first (fast strip) + hop detail for every path in the model.
 *
 * Fan-in (`fanInAllDetails`) detail-fetches ALL summary path_ids so the
 * path-authority canvas never paints a Lambda-only spine over an EC2
 * sibling that still has subnet/SG/NACL hops in Neo4j. The pin (when set)
 * is fetched first; siblings follow at low concurrency with cold retries.
 *
 * Cold Render workers often return nothing on first hit. We auto-retry the
 * summary ONCE (15s per attempt, §11 budget) instead of surfacing a hard HTTP
 * 502 after one abort — then stop and show the honest "warming up — Retry"
 * state rather than spinning for minutes. Detail uses the same idea with
 * short per-attempt aborts.
 */
export function useCrownJewelConvergence(
  systemName: string | null,
  jewel: CrownJewelSummary | null,
  selectedPathId: string | null = null,
  iapPaths: IdentityAttackPath[] = [],
  options: UseCrownJewelConvergenceOptions = {},
): UseCrownJewelConvergenceResult {
  const fanInAllDetails = Boolean(options.fanInAllDetails)
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
  /** Path ids whose /detail already settled ready — skip re-fetch on pin change. */
  const readyDetailIdsRef = useRef<Set<string>>(new Set())

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
      readyDetailIdsRef.current = new Set()
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
    readyDetailIdsRef.current = new Set()
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
        SUMMARY_ATTEMPT_TIMEOUT_MS,
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
          `Couldn’t reach path data after ${SUMMARY_MAX_ATTEMPTS} attempts — backend may be cold. Hit Retry.`,
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
    () =>
      pathIdsNeedingDetail(summary, resolvedSelectedPathId, {
        fetchAll: fanInAllDetails,
      }),
    [summary, resolvedSelectedPathId, fanInAllDetails],
  )

  // Phase 2: hop detail — pin first (when present), then siblings @2 with retries.
  useEffect(() => {
    if (!systemName || !jewel || !summary) return
    if (neededDetailIds.length === 0) return

    const ctrl = new AbortController()

    // Mark required ids pending; keep already-ready rows across pin changes.
    setDetailsByPathId((prev) => {
      const next: Record<string, PathDetailRecord> = { ...prev }
      for (const id of neededDetailIds) {
        const existing = prev[id]
        if (existing?.state === "ready" && existing.path) {
          next[id] = existing
          readyDetailIdsRef.current.add(id)
        } else {
          next[id] = { state: "pending" }
        }
      }
      return next
    })

    const applyResult = (
      pathId: string,
      result: Awaited<ReturnType<typeof fetchConvergencePathDetail>>,
    ) => {
      if (ctrl.signal.aborted) return
      if (result.ok) {
        readyDetailIdsRef.current.add(pathId)
        setDetailsByPathId((prev) => ({
          ...prev,
          [pathId]: { state: "ready", path: result.path },
        }))
      } else {
        setDetailsByPathId((prev) => ({
          ...prev,
          [pathId]: { state: "error", error: result.error },
        }))
      }
    }

    const fetchOne = async (pathId: string) => {
      if (ctrl.signal.aborted) return pathId
      if (readyDetailIdsRef.current.has(pathId)) return pathId

      const detailUrl = buildConvergenceDetailUrl(systemName, jewel, pathId)
      const result = await fetchConvergencePathDetail({
        url: detailUrl,
        signal: ctrl.signal,
      })
      applyResult(pathId, result)
      return pathId
    }

    const run = async () => {
      const [first, ...rest] = neededDetailIds
      // Pin-first (or first summary path): settle dossier before flooding.
      if (first) await fetchOne(first)
      if (ctrl.signal.aborted || rest.length === 0) return
      await mapPool(rest, DETAIL_SIBLING_CONCURRENCY, fetchOne)
    }

    void run()

    return () => {
      ctrl.abort()
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
    fanInAllDetails,
  ])

  const data =
    summary != null ? mergeSummaryWithPathDetails(summary, detailsByPathId) : null

  const detailsReady = detailsReadyFor(neededDetailIds, detailsByPathId)
  const detailsLoading = detailsLoadingFor(neededDetailIds, detailsByPathId)
  const detailFailures = useMemo(
    () => detailFailuresFor(neededDetailIds, detailsByPathId),
    [neededDetailIds, detailsByPathId],
  )

  return {
    data,
    loading,
    retrying,
    detailsLoading,
    detailsReady,
    detailFailures,
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
