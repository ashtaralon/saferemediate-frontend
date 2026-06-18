"use client"

import { useState } from "react"
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react"
import { ConvergenceMap } from "@/components/attack-paths-v2/convergence-map"
import { useCrownJewelConvergence } from "@/components/attack-paths-v2/use-crown-jewel-convergence"

export function ConvergenceMapLoader({
  systemName,
  cjArn,
  cjName,
  initialSelectedPathId = null,
}: {
  systemName: string
  cjArn: string | null
  cjName: string | null
  initialSelectedPathId?: string | null
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

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center gap-2 text-[12px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading attack paths to this jewel…
      </div>
    )
  }

  if (error) {
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

  if (!data || data.paths.length === 0) {
    return (
      <div className="flex min-h-[400px] items-center justify-center text-[12px] text-muted-foreground">
        No attack paths to this crown jewel today.
      </div>
    )
  }

  const resolvedPathId =
    selectedPathId && data.paths.some((p) => p.path_id === selectedPathId)
      ? selectedPathId
      : null

  return (
    <ConvergenceMap
      data={data}
      selectedPathId={resolvedPathId}
      onSelectPath={(id) => setSelectedPathId(id)}
    />
  )
}
