"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react"
import { AttackMapExperience } from "./attack-map-experience"
import { MapViewToggle } from "./map-view-toggle"
import { TargetAttackMap } from "./target-attack-map"
import { TopologyAttackGraph } from "./topology-attack-graph"
import { toTargetTopology } from "@/lib/attack-map/to-target-topology"
import { useCyntroAttackMap } from "@/lib/attack-map/use-cyntro-attack-map"
import { useMapViewVariant } from "@/lib/attack-map/use-map-view-variant"
import type { CrownJewelSummary } from "@/components/identity-attack-paths/types"
import { resolveClosurePathId } from "@/components/attack-paths-v2/derive-attack-path-id"
import { AttackSurfaceMap } from "@/components/attack-surface/attack-surface-map"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { AttackPathReport } from "@/components/attack-paths-v2/attack-path-report-types"
import type { SystemArchitecture } from "@/components/dependency-map/traffic-flow-map"

interface CyntroAttackMapProps {
  systemName: string
  path: IdentityAttackPath
  enabled?: boolean
  /** Live report + synthesized architecture for the Surface map. */
  report?: AttackPathReport | null
  architecture?: SystemArchitecture | null
}

const VARIANT_HINT: Record<string, string> = {
  surface: "VPC attack surface · nested subnet + SG shield · live Neo4j path",
  target: "Subnet grid · reachability / lateral / exfil lenses",
  classic: "Path-only spine · constraint bands",
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

  const needsCompiler = variant === "classic" || variant === "target"

  // Synthesize a CrownJewelSummary for the topology variant from the path +
  // (optional) report. v1 only renders the current jewel in the left rail;
  // v2 will accept a jewels[] prop from the parent so the rail lists all
  // jewels reachable in the system.
  const topologyJewel: CrownJewelSummary | null = useMemo(() => {
    const cjId = path.crown_jewel_id || ""
    if (!cjId) return null
    const cjNode =
      (path.nodes ?? []).find((n) => n.id === cjId || n.canonical_id === cjId) ?? null
    const targetLabel = report?.current_state?.target_label || cjNode?.name || cjId
    const cjType = cjNode?.type || "S3Bucket"
    return {
      id: cjId,
      canonical_id: cjId.startsWith("arn:") ? cjId : (cjNode?.canonical_id ?? null),
      name: targetLabel,
      type: cjType,
      severity: (report?.current_state?.severity?.toUpperCase() as CrownJewelSummary["severity"]) || "HIGH",
      path_count: 1,
      highest_risk_score: report?.current_state?.exposure_score ?? 0,
      is_internet_exposed: false,
      data_classification: null,
      priority_score: 0,
    }
  }, [path, report])

  const { data, loading, error, retry } = useCyntroAttackMap(
    systemName,
    pathId,
    enabled && Boolean(pathId) && needsCompiler,
  )

  const header = (
    <div className="flex items-center justify-between gap-3 px-1">
      <p className="text-[11px] text-muted-foreground">{VARIANT_HINT[variant]}</p>
      <MapViewToggle variant={variant} onChange={setVariant} />
    </div>
  )

  if (variant === "topology") {
    return (
      <div data-testid="cyntro-attack-map" className="flex flex-col gap-2">
        {header}
        {topologyJewel ? (
          <TopologyAttackGraph
            systemName={systemName}
            initialJewel={topologyJewel}
            jewels={[topologyJewel]}
          />
        ) : (
          <p className="px-2 py-12 text-center text-[12px] text-muted-foreground">
            Attack Graph needs a crown jewel on this path. Try another path or switch to a different map.
          </p>
        )}
      </div>
    )
  }

  if (variant === "surface") {
    return (
      <div data-testid="cyntro-attack-map" className="flex flex-col gap-2">
        {header}
        {report && architecture ? (
          <AttackSurfaceMap
            path={path}
            report={report}
            architecture={architecture}
            systemName={systemName}
          />
        ) : (
          <p className="px-2 py-12 text-center text-[12px] text-muted-foreground">
            Surface map needs the live report &amp; topology for this path — switch to Classic or Grid, or retry once it loads.
          </p>
        )}
      </div>
    )
  }

  if (!pathId || (loading && !data)) {
    return (
      <div data-testid="cyntro-attack-map" className="flex flex-col gap-2">
        {header}
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-[12px]">Compiling attack map…</span>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div data-testid="cyntro-attack-map" className="flex flex-col gap-2">
        {header}
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
      </div>
    )
  }

  return (
    <div data-testid="cyntro-attack-map" className="flex flex-col gap-2">
      {header}
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
