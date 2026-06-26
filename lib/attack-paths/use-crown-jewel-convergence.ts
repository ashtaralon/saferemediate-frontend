"use client"

import { useCallback, useEffect, useState } from "react"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import {
  buildConvergenceDetailUrl,
  buildConvergenceSummaryUrl,
} from "./convergence-fetch-url"
import type {
  ConvergencePath,
  CrownJewelConvergence,
  CrownJewelConvergenceSummary,
} from "./convergence-types"

interface UseCrownJewelConvergenceResult {
  data: CrownJewelConvergence | null
  loading: boolean
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

/** Summary first (fast strip) + hop detail for canvas spine wiring. */
export function useCrownJewelConvergence(
  systemName: string | null,
  jewel: CrownJewelSummary | null,
  selectedPathId: string | null = null,
): UseCrownJewelConvergenceResult {
  const [summary, setSummary] = useState<CrownJewelConvergenceSummary | null>(null)
  const [detailsByPathId, setDetailsByPathId] = useState<
    Record<string, ConvergencePath>
  >({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const retry = useCallback(() => setNonce((n) => n + 1), [])

  // Phase 1: summary only — must complete within 55s for the strip.
  useEffect(() => {
    if (!systemName || !jewel) {
      setSummary(null)
      setDetailsByPathId({})
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setDetailsByPathId({})

    const summaryUrl = buildConvergenceSummaryUrl(systemName, jewel)
    const ctrl = new AbortController()
    const timer = setTimeout(
      () => ctrl.abort(new DOMException("Backend slow — no response in 55s", "TimeoutError")),
      55_000,
    )

    const run = async () => {
      try {
        const summaryRes = await fetch(summaryUrl, { signal: ctrl.signal })
        const summaryBody = (await summaryRes.json().catch(() => null)) as
          | CrownJewelConvergenceSummary
          | { error?: string }
          | null
        if (cancelled) return
        if (!summaryRes.ok || !summaryBody || "error" in summaryBody) {
          setSummary(null)
          setError(
            (summaryBody as { error?: string })?.error ?? `http_${summaryRes.status}`,
          )
          return
        }
        setSummary(summaryBody as CrownJewelConvergenceSummary)
        setError(null)
      } catch (e) {
        if (cancelled) return
        setSummary(null)
        const m = (e as Error).message ?? String(e)
        setError(
          m.includes("aborted without reason") ? "Backend slow — no response in 55s" : m,
        )
      } finally {
        clearTimeout(timer)
        if (!cancelled) setLoading(false)
      }
    }

    void run()

    return () => {
      cancelled = true
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [systemName, jewel?.id, jewel?.canonical_id, jewel?.name, nonce])

  // Phase 2: hop detail — drives kill-chain strip + TFM spine lines.
  // Fetches the selected path, or the first real workload path by default
  // so the canvas wires EC2→Subnet→SG→NACL→Role→VPCE→S3 without blocking
  // the summary response (detail runs after summary lands).
  useEffect(() => {
    if (!systemName || !jewel || !summary) return

    const pathIdToFetch = selectedPathId ?? firstWorkloadPathId(summary.paths)
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
    selectedPathId,
    summary,
    nonce,
  ])

  const data =
    summary != null ? summaryToConvergence(summary, detailsByPathId) : null

  return { data, loading, error, retry }
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
