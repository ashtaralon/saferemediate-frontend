"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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

/** Summary first (fast strip) + hop detail for canvas spine wiring.
 *
 * `selectedPathId` may arrive in the IAP (identity-attack-paths) id
 * namespace (e.g. "path-8e64e734b0f6", the URL's ?path= value) rather
 * than the live convergence namespace `/summary` actually returns
 * (real Neo4j AttackPath.id hashes). Fetching /detail?path_id=<raw IAP
 * id> against a namespace it was never in silently 404s (detail is
 * "optional" — see the catch below), detailsByPathId stays empty, and
 * summaryToConvergence keeps EVERY path's hops=[] — the map's "Paths
 * loaded but hop placement is empty" state, even though the real
 * AttackPath node has a fully populated hops_json. matchConvergencePathId
 * already exists to solve exactly this (used elsewhere for render-time
 * path selection) but wasn't being applied to the detail-fetch trigger.
 * `iapPaths` lets this resolve the id the same way before fetching. */
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

  // Resolved once summary lands — `iapPaths` is commonly a fresh array
  // reference per parent render, so this is memoized down to the
  // resulting primitive string/null before it reaches the fetch effect's
  // dependency array below (avoids re-triggering the detail fetch on
  // every unrelated parent render).
  const resolvedSelectedPathId = useMemo(
    () => (summary ? matchConvergencePathId(summary.paths, selectedPathId, iapPaths) : null),
    [summary, selectedPathId, iapPaths],
  )

  // Phase 2: hop detail — drives kill-chain strip + TFM spine lines.
  // Fetches the selected path, or the first real workload path by default
  // so the canvas wires EC2→Subnet→SG→NACL→Role→VPCE→S3 without blocking
  // the summary response (detail runs after summary lands).
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
