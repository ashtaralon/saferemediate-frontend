"use client"

import { useMemo, useState } from "react"
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react"
import type {
  CrownJewelSummary,
  IdentityAttackPath,
} from "@/components/identity-attack-paths/types"
import { ConvergenceMap } from "@/components/attack-paths-v2/convergence-map"
import { useCrownJewelConvergence } from "@/components/attack-paths-v2/use-crown-jewel-convergence"
import {
  iapPathsToConvergence,
  matchConvergencePathId,
} from "@/lib/attack-paths/iap-to-convergence"

export function ConvergenceMapLoader({
  systemName,
  cjArn,
  cjName,
  initialSelectedPathId = null,
  fallbackJewel = null,
  fallbackPaths = [],
}: {
  systemName: string
  cjArn: string | null
  cjName: string | null
  initialSelectedPathId?: string | null
  /** IAP paths for this jewel — used when the convergence API is unavailable. */
  fallbackJewel?: CrownJewelSummary | null
  fallbackPaths?: IdentityAttackPath[]
}) {
  const { data, loading, error, retry } = useCrownJewelConvergence(
    systemName,
    cjArn,
    cjName,
    true,
  )
  const [selectedPathId, setSelectedPathId] = useState<string | null>(
    initialSelectedPathId,
  )

  const iapFallback = useMemo(() => {
    if (!fallbackJewel || fallbackPaths.length === 0) return null
    return iapPathsToConvergence(systemName, fallbackJewel, fallbackPaths)
  }, [systemName, fallbackJewel, fallbackPaths])

  const effective = useMemo(() => {
    if (data?.paths?.length) {
      return { data, source: "live" as const }
    }
    if (iapFallback?.paths?.length) {
      return { data: iapFallback, source: "fallback" as const }
    }
    return { data: data ?? null, source: "live" as const }
  }, [data, iapFallback])

  const resolvedPathId = useMemo(() => {
    if (!effective.data?.paths.length) return null
    const matched = matchConvergencePathId(
      effective.data.paths,
      selectedPathId ?? initialSelectedPathId,
      fallbackPaths,
    )
    if (matched) return matched
    if (
      selectedPathId &&
      effective.data.paths.some((p) => p.path_id === selectedPathId)
    ) {
      return selectedPathId
    }
    return null
  }, [
    effective.data,
    selectedPathId,
    initialSelectedPathId,
    fallbackPaths,
  ])

  if (loading && !effective.data?.paths?.length) {
    return (
      <div className="flex min-h-[400px] items-center justify-center gap-2 text-[12px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading attack paths to this jewel…
      </div>
    )
  }

  if (error && !effective.data?.paths?.length) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 text-[12px] text-muted-foreground">
        <AlertTriangle className="h-5 w-5 text-amber-500" />
        <span>Couldn&apos;t load convergence map: {error}</span>
        <button
          type="button"
          onClick={retry}
          className="flex items-center gap-1.5 text-foreground hover:underline"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    )
  }

  if (!effective.data || effective.data.paths.length === 0) {
    return (
      <div className="flex min-h-[400px] items-center justify-center text-[12px] text-muted-foreground">
        No attack paths to this crown jewel today.
      </div>
    )
  }

  return (
    <ConvergenceMap
      data={effective.data}
      selectedPathId={resolvedPathId}
      onSelectPath={(id) => setSelectedPathId(id)}
      source={effective.source}
    />
  )
}
