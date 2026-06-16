"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react"
import { AttackMapCanvas } from "./attack-map-canvas"
import { useCyntroAttackMap } from "@/lib/attack-map/use-cyntro-attack-map"
import { resolveClosurePathId } from "@/components/attack-paths-v2/derive-attack-path-id"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"

interface CyntroAttackMapProps {
  systemName: string
  path: IdentityAttackPath
  enabled?: boolean
}

export function CyntroAttackMap({ systemName, path, enabled = true }: CyntroAttackMapProps) {
  const [pathId, setPathId] = useState<string | null>(null)
  const [pathIdError, setPathIdError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setPathIdError(null)
    resolveClosurePathId(path)
      .then((id) => {
        if (!cancelled) setPathId(id)
      })
      .catch(() => {
        if (!cancelled) {
          setPathId(path.attack_path_id ?? path.id)
          setPathIdError("Could not derive materialized path id — using list id")
        }
      })
    return () => {
      cancelled = true
    }
  }, [path])

  const { data, loading, error, retry } = useCyntroAttackMap(
    systemName,
    pathId,
    enabled && Boolean(pathId),
  )

  if (!pathId || (loading && !data)) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-[12px]">Compiling attack map…</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-sm text-muted-foreground">
        <AlertTriangle className="h-5 w-5 text-amber-500" />
        <p className="text-center text-[12px] max-w-md">
          {error ?? "Attack map unavailable"}
          {pathIdError ? ` (${pathIdError})` : ""}
        </p>
        <button
          type="button"
          onClick={retry}
          className="inline-flex items-center gap-2 rounded border border-border px-3 py-1.5 text-[12px] hover:bg-accent"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2" data-testid="cyntro-attack-map">
      <div className="flex items-center justify-between px-2 pt-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-violet-400">
          Cyntro Attack Map
          <span className="ml-2 font-normal normal-case text-muted-foreground">
            compiler {data.payload.path_id.slice(0, 8)}… · score {data.payload.score}
          </span>
        </p>
        <span className="text-[10px] text-muted-foreground">?map=legacy for old view</span>
      </div>
      <AttackMapCanvas
        payload={data.payload}
        topology={data.topology}
        positions={data.positions}
      />
    </div>
  )
}
