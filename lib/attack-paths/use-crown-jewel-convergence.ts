"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CrownJewelSummary, IdentityAttackPath } from "@/components/identity-attack-paths/types"
import {
  buildConvergenceDetailUrl,
  buildConvergenceSummaryUrl,
} from "./convergence-fetch-url"
import { matchConvergencePathId } from "./iap-to-convergence"
import type {
  ConvergencePath,
  CrownJewelConvergence,
  CrownJewelConvergenceSummary,
} from "./convergence-types"

interface UseCrownJewelConvergenceResult {
  data: CrownJewelConvergence | null
  loading: boolean
  /** True while an automatic cold-start retry is scheduled / in flight. */
  retrying: boolean
  /** How many summary attempts have been made for this jewel (1-based). */
  attempts: number
  error: string | null
  retry: () => void
}

function firstWorkloadPathId(
  paths: CrownJewelConvergenceSummary["paths"],
): string | null {
  const real = paths.find((p) => (p.workload_arn ?? "").trim().length > 0)
  return real?.path_id ?? paths[0]?.path_id ?? null
}

function summaryToConvergence(
  summary: CrownJewelConvergenceSummary,
  detailsByPathId: Record<string, ConvergencePath>,
): CrownJewelConvergence {
  const paths: ConvergencePath[] = summary.paths.map((p) => {
    const base = {
      path_id: p.path_id,
      source: p.source,
      source_kind: p.source_kind,
      workload_arn: p.workload_arn,
      identity: p.identity,
      identity_name: p.identity_name,
      damage: p.damage,
      score: p.score,
      severity: p.severity,
      confidence: p.confidence,
      hop_count: p.hop_count,
      routes_via: [] as string[],
      role_assumption_observed: false,
      cj_target_id: summary.cj_arn ?? summary.cj_name ?? null,
      hops: [] as ConvergencePath["hops"],
      initial_access: [] as ConvergencePath["initial_access"],
    }
    const detail = detailsByPathId[p.path_id]
    if (detail) {
      return {
        ...base,
        routes_via: detail.routes_via ?? [],
        role_assumption_observed: detail.role_assumption_observed ?? false,
        cj_target_id: detail.cj_target_id ?? base.cj_target_id,
        hops: detail.hops ?? [],
        initial_access: detail.initial_access ?? [],
      }
    }
    return base
  })

  return {
    system: summary.system,
    cj_arn: summary.cj_arn,
    cj_name: summary.cj_name,
    cj_type: summary.cj_type,
    paths_total: summary.paths_total,
    observed_paths: summary.observed_paths,
    choke_points: summary.choke_points,
    paths,
  }
}

const MAX_AUTO_RETRIES = 4
const RETRY_DELAYS_MS = [3000, 6000, 10000, 15000]

/** Summary first (fast strip) + hop detail for canvas spine wiring.
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
    Record<string, ConvergencePath>
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

  // Phase 2: hop detail
  useEffect(() => {
    if (!systemName || !jewel || !summary) return

    const pathIdToFetch = resolvedSelectedPathId ?? firstWorkloadPathId(summary.paths)
    if (!pathIdToFetch) return

    let cancelled = false
    const detailUrl = buildConvergenceDetailUrl(systemName, jewel, pathIdToFetch)
    const ctrl = new AbortController()
    const timer = setTimeout(
      () => ctrl.abort(new DOMException("Backend slow — no response in 55s", "TimeoutError")),
      55_000,
    )

    const run = async () => {
      try {
        const detailRes = await fetch(detailUrl, {
          cache: "no-store",
          signal: ctrl.signal,
        })
        const detailBody = (await detailRes.json().catch(() => null)) as
          | { path?: ConvergencePath; error?: string }
          | null
        if (!cancelled && detailRes.ok && detailBody?.path) {
          setDetailsByPathId((prev) => ({
            ...prev,
            [pathIdToFetch]: detailBody.path!,
          }))
        }
      } catch {
        // Detail is optional — summary strip still renders.
      } finally {
        clearTimeout(timer)
      }
    }

    void run()

    return () => {
      cancelled = true
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [
    systemName,
    jewel?.id,
    jewel?.canonical_id,
    jewel?.name,
    resolvedSelectedPathId,
    summary,
    nonce,
  ])

  const data =
    summary != null ? summaryToConvergence(summary, detailsByPathId) : null

  return { data, loading, retrying, attempts, error, retry }
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
