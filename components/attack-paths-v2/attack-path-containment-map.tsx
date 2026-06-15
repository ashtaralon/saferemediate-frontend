"use client"

// Cloud Graph — React Flow + ELK layout over live AttackPathReport / SystemArchitecture.
// Presentation rewrite per cyntro_attack-map_redesign-prompt.md; data binding unchanged.

import { useMemo, useState } from "react"
import { Maximize2 } from "lucide-react"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { SystemArchitecture } from "@/components/dependency-map/traffic-flow-map"
import type { AttackPathReport } from "./attack-path-report-types"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import {
  buildContainmentFromArchitecture,
  type ContainmentViewMode,
} from "./build-containment-from-architecture"
import { CAT_COLOR, type TopologyResponse } from "./containment-model"
import { CloudGraphFlowCanvas } from "./cloud-graph-flow-canvas"
import { CG } from "./cloud-graph-tokens"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const RULE = CG.border
const MUTED = CG.muted
const FAINT = CG.faint
const INK = CG.ink

export function AttackPathContainmentMap({
  path,
  report,
  architecture,
  systemName,
  slot = "flow",
}: {
  path: IdentityAttackPath
  report: AttackPathReport
  architecture?: SystemArchitecture | null
  systemName?: string | null
  slot?: "flow" | "hero"
}) {
  const [viewMode, setViewMode] = useState<ContainmentViewMode>(slot === "flow" ? "path" : "full")
  const [enlargedOpen, setEnlargedOpen] = useState(false)

  const fetchUrl = systemName
    ? `/api/proxy/topology-aws/${encodeURIComponent(systemName)}`
    : null
  const { data: fullTopology } = useCachedFetch<TopologyResponse>(fetchUrl, {
    cacheKey: `topology-aws:${systemName}`,
  })

  const model = useMemo(() => {
    if (!architecture) return null
    return buildContainmentFromArchitecture(
      architecture,
      path,
      report,
      viewMode,
      fullTopology,
    )
  }, [architecture, path, report, viewMode, fullTopology])

  if (!model) {
    return (
      <div
        className="rounded-[14px] border px-2 py-3"
        style={{ borderColor: RULE, background: CG.surface, boxShadow: CG.shadow }}
      >
        {!architecture ? (
          <p className="text-[11px] px-2 py-8 text-center" style={{ color: FAINT }}>
            Loading attack architecture…
          </p>
        ) : (
          <p className="text-[11px] px-2 py-8 text-center" style={{ color: FAINT }}>
            Could not lay out the containment map for this path (missing foothold in architecture).
          </p>
        )}
      </div>
    )
  }

  const headerTitle = slot === "flow" ? "Cloud Graph" : "The attack map"
  const headerHint = `${model.meta.region} · ${model.meta.vpcId}`

  const panelProps = {
    model,
    path,
    viewMode,
    onViewModeChange: setViewMode,
    slot,
    headerTitle,
    headerHint,
  }

  return (
    <>
      {!enlargedOpen && (
        <ContainmentMapPanel
          {...panelProps}
          displaySize="inline"
          onEnlarge={slot === "flow" ? () => setEnlargedOpen(true) : undefined}
        />
      )}

      <Dialog open={enlargedOpen} onOpenChange={setEnlargedOpen}>
        <DialogContent
          className="flex flex-col gap-2 overflow-hidden p-3 sm:max-w-[min(1280px,96vw)] w-[96vw] max-h-[92vh]"
          data-testid="attack-path-containment-map-enlarged"
        >
          {enlargedOpen && (
            <>
              <DialogHeader className="shrink-0 gap-0.5 pb-0">
                <DialogTitle className="text-base">{headerTitle}</DialogTitle>
                <DialogDescription>{headerHint}</DialogDescription>
              </DialogHeader>
              <ContainmentMapPanel {...panelProps} displaySize="expanded" />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function ContainmentMapPanel({
  model,
  path,
  viewMode,
  onViewModeChange,
  slot,
  headerTitle,
  headerHint,
  displaySize,
  onEnlarge,
}: {
  model: NonNullable<ReturnType<typeof buildContainmentFromArchitecture>>
  path: IdentityAttackPath
  viewMode: ContainmentViewMode
  onViewModeChange: (m: ContainmentViewMode) => void
  slot: "flow" | "hero"
  headerTitle: string
  headerHint: string
  displaySize: "inline" | "expanded"
  onEnlarge?: () => void
}) {
  const expanded = displaySize === "expanded"

  return (
    <div data-slot={slot} data-display-size={displaySize}>
      {slot !== "flow" && !expanded && (
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: MUTED }}>
            {headerTitle}
            <span className="ml-2 font-normal normal-case" style={{ color: FAINT }}>
              {headerHint}
            </span>
          </div>
          <MapHeaderControls viewMode={viewMode} onViewModeChange={onViewModeChange} onEnlarge={onEnlarge} />
        </div>
      )}

      <div
        className="rounded-[14px] border overflow-hidden"
        style={{
          borderColor: RULE,
          background: CG.canvas,
          boxShadow: expanded ? "none" : CG.shadow,
        }}
      >
        {(slot === "flow" || expanded) && (
          <div
            className={`flex items-center justify-between gap-2 flex-wrap px-2 pt-2 pb-1 ${expanded ? "" : "border-b"}`}
            style={expanded ? undefined : { borderColor: RULE }}
          >
            {!expanded && (
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: MUTED }}>
                {headerTitle}
                <span className="font-normal normal-case ml-1.5" style={{ color: FAINT }}>
                  {headerHint}
                </span>
              </p>
            )}
            <MapHeaderControls
              viewMode={viewMode}
              onViewModeChange={onViewModeChange}
              onEnlarge={onEnlarge}
              compact
              expanded={expanded}
            />
          </div>
        )}

        <CloudGraphFlowCanvas
          model={model}
          path={path}
          viewMode={viewMode}
          displaySize={displaySize}
        />

        <Legend compact />
      </div>
    </div>
  )
}

function MapHeaderControls({
  viewMode,
  onViewModeChange,
  onEnlarge,
  compact,
  expanded,
}: {
  viewMode: ContainmentViewMode
  onViewModeChange: (mode: ContainmentViewMode) => void
  onEnlarge?: () => void
  compact?: boolean
  expanded?: boolean
}) {
  return (
    <div className="flex items-center gap-2 ml-auto shrink-0">
      <ViewModeToggle viewMode={viewMode} onChange={onViewModeChange} compact={compact} />
      {onEnlarge && !expanded && (
        <button
          type="button"
          onClick={onEnlarge}
          title="Enlarge map"
          aria-label="Enlarge map"
          data-testid="attack-path-containment-map-enlarge"
          className="inline-flex items-center gap-1 rounded-[9px] border px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-accent"
          style={{ borderColor: RULE, background: CG.surface, color: MUTED }}
        >
          <Maximize2 className="h-3.5 w-3.5" />
          <span>Enlarge</span>
        </button>
      )}
    </div>
  )
}

function ViewModeToggle({
  viewMode,
  onChange,
  compact,
}: {
  viewMode: ContainmentViewMode
  onChange: (m: ContainmentViewMode) => void
  compact?: boolean
}) {
  return (
    <div
      className="inline-flex rounded-[9px] overflow-hidden text-[12px] font-semibold"
      style={{ border: `1px solid ${RULE}`, background: CG.surface }}
    >
      <button
        type="button"
        onClick={() => onChange("path")}
        className="transition-colors"
        style={{
          padding: compact ? "5px 12px" : "7px 14px",
          background: viewMode === "path" ? INK : CG.surface,
          color: viewMode === "path" ? "#fff" : MUTED,
        }}
      >
        Just this path
      </button>
      <button
        type="button"
        onClick={() => onChange("full")}
        className="transition-colors"
        style={{
          padding: compact ? "5px 12px" : "7px 14px",
          background: viewMode === "full" ? INK : CG.surface,
          color: viewMode === "full" ? "#fff" : MUTED,
        }}
      >
        Full environment
      </button>
    </div>
  )
}

function Legend({ compact }: { compact?: boolean }) {
  const items: { sw?: string; ln?: string; dash?: boolean; label: string }[] = [
    { sw: CAT_COLOR.compute.c, label: "Compute · EC2" },
    { sw: CAT_COLOR.network.c, label: "Networking · IGW / VPCE" },
    { sw: CAT_COLOR.storage.c, label: "Storage · S3" },
    { sw: CAT_COLOR.security.c, label: "Security · IAM / KMS" },
    { ln: CG.attack, label: "Attack path (animated pulse)" },
    { ln: CG.encrypt, dash: true, label: "Encrypts" },
    { ln: CG.priv, dash: true, label: "Private · unused" },
  ]
  return (
    <div
      className={`flex flex-wrap items-center gap-x-5 gap-y-2 ${compact ? "mt-1.5 px-3 py-1.5" : "mt-3 px-4 py-2.5"} border-t`}
      style={{ borderColor: RULE, background: CG.surface }}
    >
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: MUTED }}>
          {it.sw ? (
            <span style={{ width: 12, height: 12, borderRadius: 3, background: it.sw, display: "inline-block" }} />
          ) : (
            <span
              style={{
                width: 24,
                borderTopWidth: 3,
                borderTopStyle: it.dash ? "dashed" : "solid",
                borderTopColor: it.ln,
                display: "inline-block",
              }}
            />
          )}
          {it.label}
        </span>
      ))}
    </div>
  )
}
