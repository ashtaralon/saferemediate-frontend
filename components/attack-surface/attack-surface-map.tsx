"use client"

import { useMemo } from "react"
import { Maximize2 } from "lucide-react"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { SystemArchitecture } from "@/components/dependency-map/traffic-flow-map"
import type { AttackPathReport } from "@/components/attack-paths-v2/attack-path-report-types"
import { buildAttackSurfaceFlow } from "@/lib/attack-surface/build-attack-surface-flow"
import { SURFACE_EDGE_COLORS } from "@/lib/attack-surface/edge-classification"
import { AttackSurfaceCanvas } from "./attack-surface-canvas"
import { AS } from "./attack-surface-tokens"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useState } from "react"

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

  const preview = useMemo(
    () => buildAttackSurfaceFlow({ architecture, path }),
    [architecture, path],
  )

  if (preview.nodes.filter((n) => n.type === "surfaceResource").length === 0) {
    return (
      <div
        className="rounded-[14px] border px-2 py-3"
        style={{ borderColor: AS.laneBorder, background: AS.surface }}
        data-testid="attack-surface-map"
      >
        <p className="text-[11px] px-2 py-8 text-center" style={{ color: AS.faint }}>
          No attack-surface nodes for this path — check graph-view synthesis.
        </p>
      </div>
    )
  }

  const headerHint = [
    preview.meta.region,
    preview.meta.vpcId,
    systemName,
    report.current_state?.target_label,
  ]
    .filter(Boolean)
    .join(" · ")

  const legend = (
    <div className="flex flex-wrap items-center gap-3 text-[9px] uppercase tracking-wide" style={{ color: AS.muted }}>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-0.5 w-4 rounded" style={{ background: SURFACE_EDGE_COLORS.network }} />
        Network flow
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          className="inline-block h-0.5 w-4 rounded border-t border-dashed"
          style={{ borderColor: SURFACE_EDGE_COLORS.identity }}
        />
        Identity / priv esc
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-1 w-4 rounded" style={{ background: SURFACE_EDGE_COLORS.exfil }} />
        Exfiltration
      </span>
    </div>
  )

  const canvasHeight = slot === "hero" ? 640 : 520

  const panel = (expanded: boolean) => (
    <div
      className="rounded-[14px] border overflow-hidden"
      style={{
        borderColor: AS.laneBorder,
        background: AS.canvas,
        boxShadow: expanded ? "none" : "0 8px 32px rgba(0,0,0,0.35)",
      }}
      data-testid="attack-surface-map"
    >
      <div
        className="flex items-center justify-between gap-2 flex-wrap px-3 pt-2.5 pb-2 border-b"
        style={{ borderColor: AS.laneBorder }}
      >
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: AS.muted }}>
            Attack Surface Map
          </p>
          {headerHint ? (
            <p className="text-[10px] mt-0.5 font-mono truncate max-w-[min(520px,70vw)]" style={{ color: AS.faint }}>
              {headerHint}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {legend}
          {!expanded && slot === "flow" ? (
            <button
              type="button"
              onClick={() => setEnlargedOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors hover:bg-white/5"
              style={{ borderColor: AS.laneBorder, color: AS.muted }}
              aria-label="Enlarge attack surface map"
            >
              <Maximize2 className="h-3 w-3" />
              Expand
            </button>
          ) : null}
        </div>
      </div>
      <AttackSurfaceCanvas architecture={architecture} path={path} height={expanded ? "min(72vh, 720px)" : canvasHeight} />
    </div>
  )

  return (
    <>
      {!enlargedOpen && panel(false)}
      <Dialog open={enlargedOpen} onOpenChange={setEnlargedOpen}>
        <DialogContent
          className="flex flex-col gap-2 overflow-hidden p-3 sm:max-w-[min(1400px,98vw)] w-[98vw] max-h-[94vh]"
          data-testid="attack-surface-map-enlarged"
          style={{ background: AS.canvas, borderColor: AS.laneBorder }}
        >
          {enlargedOpen && (
            <>
              <DialogHeader className="shrink-0 gap-0.5 pb-0">
                <DialogTitle className="text-base" style={{ color: AS.ink }}>
                  Attack Surface Map
                </DialogTitle>
                <DialogDescription style={{ color: AS.faint }}>{headerHint}</DialogDescription>
              </DialogHeader>
              {panel(true)}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
