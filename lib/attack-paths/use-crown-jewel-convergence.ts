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

function summaryToConvergence(
  summary: CrownJewelConvergenceSummary,
  detailPath: ConvergencePath | null,
  selectedPathId: string | null,
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
    if (detailPath && p.path_id === selectedPathId) {
      return {
        ...base,
        routes_via: detailPath.routes_via ?? [],
        role_assumption_observed: detailPath.role_assumption_observed ?? false,
        cj_target_id: detailPath.cj_target_id ?? base.cj_target_id,
        hops: detailPath.hops ?? [],
        initial_access: detailPath.initial_access ?? [],
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

/** Summary + lazy detail for Topology Spotlight and convergence map. */
export function useCrownJewelConvergence(
  systemName: string | null,
  jewel: CrownJewelSummary | null,
  selectedPathId: string | null = null,
): UseCrownJewelConvergenceResult {
  const [summary, setSummary] = useState<CrownJewelConvergenceSummary | null>(null)
  const [detailPath, setDetailPath] = useState<ConvergencePath | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const retry = useCallback(() => setNonce((n) => n + 1), [])

  // Phase 1: summary only — fast path for Spotlight strip (path list + scores).
  useEffect(() => {
    if (!systemName || !jewel) {
      setSummary(null)
      setDetailPath(null)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setDetailPath(null)

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

  // Phase 2: hop detail only when operator selects a path (not on every CJ click).
  useEffect(() => {
    if (!systemName || !jewel || !selectedPathId || !summary) {
      setDetailPath(null)
      return
    }

    let cancelled = false
    const detailUrl = buildConvergenceDetailUrl(systemName, jewel, selectedPathId)
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
          setDetailPath(detailBody.path)
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
  }, [systemName, jewel?.id, jewel?.canonical_id, jewel?.name, selectedPathId, summary, nonce])

  const data =
    summary != null
      ? summaryToConvergence(summary, detailPath, selectedPathId)
      : null

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
