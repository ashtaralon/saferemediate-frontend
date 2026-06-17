"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react"
import { AttackMapExperience } from "./attack-map-experience"
import { MapViewToggle } from "./map-view-toggle"
import { TargetAttackMap } from "./target-attack-map"
import { toTargetTopology } from "@/lib/attack-map/to-target-topology"
import { useCyntroAttackMap } from "@/lib/attack-map/use-cyntro-attack-map"
import { useMapViewVariant } from "@/lib/attack-map/use-map-view-variant"
import { resolveClosurePathId } from "@/components/attack-paths-v2/derive-attack-path-id"
import { AttackPathContainmentMap } from "@/components/attack-paths-v2/attack-path-containment-map"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { AttackPathReport } from "@/components/attack-paths-v2/attack-path-report-types"
import type { SystemArchitecture } from "@/components/dependency-map/traffic-flow-map"

interface CyntroAttackMapProps {
  systemName: string
  path: IdentityAttackPath
  enabled?: boolean
  /** Live report + synthesized architecture for the AWS Architecture view. */
  report?: AttackPathReport | null
  architecture?: SystemArchitecture | null
}

export function CyntroAttackMap({
  systemName,
  path,
  enabled = true,
  report,
  architecture,
}: CyntroAttackMapProps) {
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

  const { variant, setVariant } = useMapViewVariant()

  const { data, loading, error, retry } = useCyntroAttackMap(
    systemName,
    pathId,
    enabled && Boolean(pathId),
  )

  // AWS Architecture view — independent of the Cyntro-map payload above; it
  // renders the live ContainmentModel from report + synthesized architecture.
  if (variant === "aws") {
    return (
      <div data-testid="cyntro-attack-map" className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-[11px] text-muted-foreground">
            Full account topology with path overlay
          </p>
          <MapViewToggle variant={variant} onChange={setVariant} />
        </div>
        {report && architecture ? (
          <AttackPathContainmentMap
            path={path}
            report={report}
            architecture={architecture}
            systemName={systemName}
          />
        ) : (
          <p className="px-2 py-12 text-center text-[12px] text-muted-foreground">
            AWS architecture view needs the live report &amp; topology for this path — switch to Classic or Grid, or retry once it loads.
          </p>
        )}
      </div>
    )
  }

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
    <div data-testid="cyntro-attack-map" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-[11px] text-muted-foreground">
          {variant === "target" ? "Subnet grid · reachability / lateral / exfil lenses" : "Path-only spine · constraint bands"}
        </p>
        <MapViewToggle variant={variant} onChange={setVariant} />
      </div>
      {variant === "target" ? (
        <TargetAttackMap topo={toTargetTopology(data.payload, data.topology)} />
      ) : (
        <AttackMapExperience
          payload={data.payload}
          topology={data.topology}
          positions={data.positions}
          density={data.density}
        />
      )}
    </div>
  )
}
