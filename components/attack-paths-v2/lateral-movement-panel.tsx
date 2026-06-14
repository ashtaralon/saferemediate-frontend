"use client"

// LateralMovementPanel — fetches the per-path facade (same endpoint as the
// Attack Path tab) so the Lateral Movement view has the graph-view canvas with
// real per-role lateral fan-out, then resolves the "reachable neighbors" groups:
//
//   1. Fast path — if the path already carries computed reachable_neighbors
//      (backend populated them), use those verbatim.
//   2. Otherwise — derive them from canvas.laterals_by_node (the reliable
//      real-data source; the list's reachable_neighbors can be empty when the
//      dep-map projection lacks the behavioral edges the backend keys on).
//
// Pure data plumbing + real loading/error states; rendering lives in
// LateralMovementView.

import { useMemo } from "react"
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react"
import { useRetryFetch } from "@/lib/use-retry-fetch"
import { LateralMovementView } from "./lateral-movement-view"
import { deriveReachableNeighborsFromCanvas } from "./derive-reachable-neighbors"
import type { AttackPathPayload, AttackPathFacadeError } from "./attack-path-types"
import type { GraphViewResponse } from "./build-attacker-architecture"
import type {
  IdentityAttackPath,
  CrownJewelSummary,
  ReachableNeighborsByRole,
} from "@/components/identity-attack-paths/types"

function isFacadeError(p: unknown): p is AttackPathFacadeError {
  return !!p && typeof p === "object" && "error" in (p as Record<string, unknown>)
}

interface LateralMovementPanelProps {
  systemName: string
  jewelId: string
  pathId: string
  pathFromPage?: IdentityAttackPath | null
  jewelFromPage?: CrownJewelSummary | null
  siblingPathsFromPage?: IdentityAttackPath[]
}

export function LateralMovementPanel({
  systemName,
  jewelId,
  pathId,
  pathFromPage,
  jewelFromPage,
  siblingPathsFromPage,
}: LateralMovementPanelProps) {
  const fetchUrl = useMemo(() => {
    if (!systemName || !jewelId || !pathId) return null
    return `/api/proxy/attack-path/${encodeURIComponent(systemName)}/${encodeURIComponent(jewelId)}?path_id=${encodeURIComponent(pathId)}`
  }, [systemName, jewelId, pathId])

  // Mirror AttackPathPanel's POST body so the facade can skip the second
  // full-system IAP round-trip (skip_identity=1) when the page already has the
  // path. Same shape → shares the SWR/proxy cache entry with the Attack Path tab.
  const fetchInit = useMemo<RequestInit | undefined>(() => {
    if (!pathFromPage || pathFromPage.id !== pathId) return undefined
    const sibling_paths = (siblingPathsFromPage ?? []).map((p) => ({
      id: p.id,
      hop_count: p.hop_count ?? p.nodes?.length ?? 0,
      evidence_type: p.evidence_type ?? "configured",
      severity:
        typeof (p.severity as { overall_score?: number })?.overall_score === "number"
          ? (p.severity as { overall_score: number }).overall_score
          : null,
    }))
    return {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path_id: pathId,
        path: pathFromPage,
        jewel: jewelFromPage
          ? {
              id: jewelFromPage.id,
              name: jewelFromPage.name,
              type: jewelFromPage.type,
              path_count: jewelFromPage.path_count,
            }
          : undefined,
        sibling_paths,
      }),
    }
  }, [pathFromPage, pathId, siblingPathsFromPage, jewelFromPage])

  const {
    data: payload,
    loading,
    error,
    retry,
    retrying,
  } = useRetryFetch<AttackPathPayload | AttackPathFacadeError>(fetchUrl, {
    refetchKey: `lateral:${systemName}:${jewelId}:${pathId}:${pathFromPage ? "page" : "iap"}`,
    fetchInit,
    maxRetries: 2,
    initialDelayMs: 1000,
  })

  const groups = useMemo<ReachableNeighborsByRole[]>(() => {
    const precomputed = pathFromPage?.reachable_neighbors
    if (precomputed && precomputed.length > 0) return precomputed
    if (!payload || isFacadeError(payload)) return []
    const canvas = payload.canvas as unknown as GraphViewResponse
    const path =
      pathFromPage ??
      ({ id: pathId, nodes: payload.hops?.nodes ?? [] } as IdentityAttackPath)
    return deriveReachableNeighborsFromCanvas(path, canvas)
  }, [payload, pathFromPage, pathId])

  if (loading || retrying) {
    return (
      <div
        className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
        style={{ minHeight: 480 }}
      >
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading lateral reach…
      </div>
    )
  }

  if (error || (payload && isFacadeError(payload))) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
        style={{ minHeight: 480 }}
      >
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        <div>Couldn&apos;t load lateral reach for this path.</div>
        <button
          onClick={retry}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-border hover:bg-accent transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    )
  }

  return <LateralMovementView path={pathFromPage ?? null} groups={groups} />
}
