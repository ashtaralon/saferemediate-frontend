"use client"

import { useCallback, useMemo, useState } from "react"
import type { CrownJewelSummary, IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { TopologyResponse } from "@/components/attack-paths-v2/containment-model"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import { filterActivePaths } from "@/lib/active-filters"
import { isTrustEnvelope } from "@/components/trust/trust-envelope-badge"
import type { IdentityAttackPathsResponse } from "@/components/identity-attack-paths/types"
import { shapeSystemAttackGraph } from "./shape-system-attack-graph"
import type { AttackGraphSelection, SystemAttackGraph } from "./system-attack-graph-types"

export interface UseSystemAttackGraphOptions {
  /** When provided (e.g. attack-paths-v2 page), skip the IAP fetch. */
  jewels?: CrownJewelSummary[]
  paths?: IdentityAttackPath[]
}

export interface UseSystemAttackGraphResult {
  graph: SystemAttackGraph | null
  topology: TopologyResponse | null
  loading: boolean
  error: string | null
  retry: () => void
  selection: AttackGraphSelection
  setSelection: (s: AttackGraphSelection) => void
  focusPathId: string | null
  setFocusPathId: (id: string | null) => void
}

export function useSystemAttackGraph(
  systemName: string | null | undefined,
  options: UseSystemAttackGraphOptions = {},
): UseSystemAttackGraphResult {
  const [selection, setSelection] = useState<AttackGraphSelection>(null)
  const [focusPathId, setFocusPathId] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const hasPreloaded = Boolean(options.jewels && options.paths)
  const iapUrl =
    !hasPreloaded && systemName
      ? `/api/proxy/identity-attack-paths/${encodeURIComponent(systemName)}?envelope=true`
      : null
  const topoUrl = systemName
    ? `/api/proxy/topology-aws/${encodeURIComponent(systemName)}`
    : null

  const {
    data: rawIap,
    loading: iapLoading,
    error: iapError,
    retry: retryIap,
  } = useCachedFetch<any>(iapUrl, {
    cacheKey: `system-graph-iap:${systemName ?? "none"}:${nonce}`,
  })

  const {
    data: topology,
    loading: topoLoading,
    error: topoError,
    retry: retryTopo,
  } = useCachedFetch<TopologyResponse>(topoUrl, {
    cacheKey: `system-graph-topo:${systemName ?? "none"}:${nonce}`,
  })

  const iapData: IdentityAttackPathsResponse | null = useMemo(() => {
    if (hasPreloaded) return null
    if (!rawIap) return null
    return isTrustEnvelope(rawIap) ? rawIap.result : rawIap
  }, [hasPreloaded, rawIap])

  const jewels = options.jewels ?? iapData?.crown_jewels ?? []
  const paths = useMemo(
    () => (options.paths ? filterActivePaths(options.paths) : filterActivePaths(iapData?.paths ?? [])),
    [options.paths, iapData?.paths],
  )

  const graph = useMemo(() => {
    if (!systemName || paths.length === 0) return null
    return shapeSystemAttackGraph(systemName, jewels, paths, topology ?? null)
  }, [systemName, jewels, paths, topology])

  const loading = (!hasPreloaded && iapLoading) || topoLoading
  const error = iapError || topoError || null

  const retry = useCallback(() => {
    setNonce((n) => n + 1)
    if (!hasPreloaded) retryIap()
    retryTopo()
  }, [hasPreloaded, retryIap, retryTopo])

  return {
    graph,
    topology: topology ?? null,
    loading,
    error,
    retry,
    selection,
    setSelection,
    focusPathId,
    setFocusPathId,
  }
}
