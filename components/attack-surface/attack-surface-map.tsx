"use client"

import { useMemo, useState } from "react"
import { Maximize2 } from "lucide-react"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { SystemArchitecture } from "@/components/dependency-map/traffic-flow-map"
import type { AttackPathReport } from "@/components/attack-paths-v2/attack-path-report-types"
import { buildVpcCanvasModel } from "@/lib/attack-surface/build-vpc-canvas-model"
import { AwsVpcFlowCanvas } from "./aws-vpc-flow-canvas"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function AttackSurfaceMap({
  path,
  report,
  architecture,
  systemName,
  slot = "flow",
}: {
  path: IdentityAttackPath
  report: AttackPathReport
  architecture: SystemArchitecture
  systemName?: string | null
  slot?: "flow" | "hero"
}) {
  const [enlargedOpen, setEnlargedOpen] = useState(false)

  const model = useMemo(
    () => buildVpcCanvasModel(architecture, path),
    [architecture, path],
  )

  if (!model) {
    return (
      <div
        className="rounded-[14px] border border-border bg-card px-2 py-3"
        data-testid="attack-surface-map"
      >
        <p className="text-[11px] px-2 py-8 text-center text-muted-foreground">
          No attack-surface nodes for this path — check graph-view synthesis.
        </p>
      </div>
    )
  }

  const headerHint = [
    architecture.region,
    architecture.vpcGroups?.[0]?.vpcId ?? architecture.workloadNetwork?.vpc_id,
    systemName,
    report.current_state?.target_label,
  ]
    .filter(Boolean)
    .join(" · ")

  const canvasHeight = slot === "hero" ? 720 : 580

  const panel = (expanded: boolean) => (
    <div
      className="rounded-[14px] border border-border overflow-hidden bg-[#F5F5F5] shadow-sm"
      data-testid="attack-surface-map"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap px-3 pt-2.5 pb-2 border-b border-border bg-white">
        <div>
          <p className="text-[12px] font-bold tracking-wide text-foreground">
            ATTACK SURFACE RISK MAP
          </p>
          <p className="text-[10px] mt-0.5 text-muted-foreground">
            Live Neo4j control-plane path state
            {headerHint ? <span className="font-mono ml-1.5">· {headerHint}</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[9px] uppercase tracking-wide text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-[#D90429]" />
            Attack / exfil
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-[#00B4D8]" />
            Network
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 border-t border-dashed border-[#FF9F1C]" />
            Identity
          </span>
          {!expanded && slot === "flow" ? (
            <button
              type="button"
              onClick={() => setEnlargedOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-medium hover:bg-muted"
              aria-label="Enlarge attack surface map"
            >
              <Maximize2 className="h-3 w-3" />
              Expand
            </button>
          ) : null}
        </div>
      </div>
      <AwsVpcFlowCanvas
        architecture={architecture}
        path={path}
        report={report}
        systemName={systemName}
        height={expanded ? 720 : canvasHeight}
      />
    </div>
  )

  return (
    <>
      {!enlargedOpen && panel(false)}
      <Dialog open={enlargedOpen} onOpenChange={setEnlargedOpen}>
        <DialogContent
          className="flex flex-col gap-2 overflow-hidden p-3 sm:max-w-[min(1280px,98vw)] w-[98vw] max-h-[94vh]"
          data-testid="attack-surface-map-enlarged"
        >
          {enlargedOpen && (
            <>
              <DialogHeader className="shrink-0 gap-0.5 pb-0">
                <DialogTitle>Attack Surface Risk Map</DialogTitle>
                <DialogDescription>{headerHint}</DialogDescription>
              </DialogHeader>
              {panel(true)}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
