"use client"

// Killer containment map — per cyntro_containment-map_binding-spec.md.
// Renders the attack path on the customer's REAL AWS architecture using the
// SAME SystemArchitecture object TrafficFlowMap consumes (buildAttackerArchitecture
// over graph-view). topology-aws is supplementary ONLY for "Full environment"
// sibling workloads (§3 option b).

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
import {
  CAT_COLOR,
  type CMCard,
  type CMEdge,
  type ContainmentModel,
  type TopologyResponse,
} from "./containment-model"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type MapDisplaySize = "inline" | "expanded"

const INK = "#16202e"
const MUTED = "#54657a"
const FAINT = "#8597a9"
const RULE = "#dce3ec"

const CAT_LABEL: Record<CMCard["cat"], string> = {
  compute: "EC2",
  network: "NETWORK",
  storage: "STORAGE",
  security: "IAM",
  user: "ENTRY",
}

function cardCategoryLabel(card: CMCard): string {
  if (card.badge === "FOOTHOLD") return `${CAT_LABEL[card.cat] ?? "COMPUTE"} · FOOTHOLD`
  if (card.badge === "CROWN JEWEL") return card.sub?.includes("S3") ? "S3 BUCKET · CROWN JEWEL" : "CROWN JEWEL"
  if (card.badge === "ENCRYPTS") return "KMS KEY"
  if (card.cat === "network" && /gateway|igw/i.test(card.title)) return "INTERNET GATEWAY"
  if (card.cat === "user") return "USER / INTERNET"
  if (card.cat === "security" && card.title) return "IAM ROLE"
  return (CAT_LABEL[card.cat] ?? "RESOURCE").toUpperCase()
}

function truncate(s: string, n: number): string {
  if (!s) return ""
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

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
  /** "flow" = bottom supporting-evidence slot (default); "hero" kept for tests. */
  slot?: "flow" | "hero"
}) {
  // Default: "Just this path" (spec §3). Full environment merges topology-aws siblings.
  const [viewMode, setViewMode] = useState<ContainmentViewMode>(slot === "flow" ? "path" : "full")
  const [enlargedOpen, setEnlargedOpen] = useState(false)

  // Fetch topology-aws for metadata fallbacks (region, VPC CIDR) even in path mode;
  // sibling workloads are only merged when viewMode === "full".
  const fetchUrl = systemName
    ? `/api/proxy/topology-aws/${encodeURIComponent(systemName)}`
    : null
  const { data: fullTopology } = useCachedFetch<TopologyResponse>(fetchUrl, {
    cacheKey: `topology-aws:${systemName}`,
  })

  const model = useMemo<ContainmentModel | null>(() => {
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
        style={{ borderColor: RULE, background: "#fff", boxShadow: "0 1px 2px rgba(20,35,55,.04), 0 6px 18px rgba(20,35,55,.07)" }}
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

  const isolated = viewMode === "path"
  const compact = viewMode === "path"
  const headerTitle = slot === "flow" ? "Cloud Graph" : "The attack map"
  const headerHint =
    slot === "flow"
      ? `${model.meta.region} · ${model.meta.vpcId}`
      : `${model.meta.vpcId} · ${model.meta.region}`

  const panelProps = {
    model,
    report,
    viewMode,
    onViewModeChange: setViewMode,
    slot,
    headerTitle,
    headerHint,
    isolated,
    compact,
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
  report,
  viewMode,
  onViewModeChange,
  slot,
  headerTitle,
  headerHint,
  isolated,
  compact,
  displaySize,
  onEnlarge,
}: {
  model: ContainmentModel
  report: AttackPathReport
  viewMode: ContainmentViewMode
  onViewModeChange: (mode: ContainmentViewMode) => void
  slot: "flow" | "hero"
  headerTitle: string
  headerHint: string
  isolated: boolean
  compact: boolean
  displaySize: MapDisplaySize
  onEnlarge?: () => void
}) {
  const expanded = displaySize === "expanded"
  const svgId = expanded ? "apc-exp" : "apc"

  return (
    <div className={compact && !expanded ? "apc-compact" : undefined} data-slot={slot} data-display-size={displaySize}>
      {slot !== "flow" && !expanded && (
        <div className={`flex items-center justify-between gap-3 flex-wrap ${compact ? "mb-1.5" : "mb-2"}`}>
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
        className={`rounded-[14px] border ${expanded ? "border-0 shadow-none" : "overflow-hidden"}`}
        style={
          expanded
            ? { background: "#fff" }
            : {
                borderColor: RULE,
                background: "#fff",
                boxShadow: "0 1px 2px rgba(20,35,55,.04), 0 6px 18px rgba(20,35,55,.07)",
              }
        }
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

        <div className={expanded ? "overflow-auto min-h-0 flex-1 max-h-[calc(92vh-7rem)]" : undefined}>
        <svg
          viewBox={`0 0 ${model.width} ${model.height}`}
          role="img"
          aria-label={`Attack path on AWS architecture: ${report.current_state.source_label} to ${report.current_state.target_label}`}
          preserveAspectRatio={expanded ? "xMidYMid meet" : "xMidYMin meet"}
          style={{
            display: "block",
            width: "100%",
            maxWidth: "100%",
            height: "auto",
            minHeight: expanded ? "62vh" : undefined,
            maxHeight: expanded ? undefined : slot === "flow" ? 420 : 520,
            fontFamily: "system-ui, sans-serif",
          }}
          data-testid={expanded ? "attack-path-containment-map-svg-expanded" : "attack-path-containment-map"}
          className={isolated ? "apc-iso" : undefined}
        >
        <style>{`
          .apc-ctx { transition: opacity .25s ease; }
          .apc-iso .apc-ctx { opacity: .22; }
          .apc-flow {
            stroke-dasharray: 5 7;
            animation: apc-dash 1s linear infinite;
          }
          @keyframes apc-dash { to { stroke-dashoffset: -12; } }
          .apc-dot { opacity: 0.9; }
          @media (prefers-reduced-motion: reduce) {
            .apc-flow { animation: none; }
            .apc-dot { display: none; }
          }
          .apc-compact .apc-legend { margin-top: 0.5rem; padding: 0.35rem 0.65rem; }
        `}</style>
        <defs>
          <pattern id={`${svgId}-grid`} width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#e8edf3" strokeWidth="1" />
          </pattern>
          {markerColors(model).map((c) => (
            <marker
              key={c}
              id={`${svgId}-arrow-${markerId(c)}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill={c} />
            </marker>
          ))}
        </defs>
        <rect x="0" y="0" width={model.width} height={model.height} fill={`url(#${svgId}-grid)`} opacity="0.45" />

        {model.frames.filter((f) => f.layer === "frame").map((f) => (
          <Frame key={f.id} frame={f} />
        ))}

        <g className="apc-ctx">
          {model.frames.filter((f) => f.layer === "ctx").map((f) => (
            <Frame key={f.id} frame={f} />
          ))}
          {model.notes.map((n) => (
            <text
              key={n.id}
              x={n.x}
              y={n.y}
              fontSize={n.text.startsWith("REGIONAL") ? 10.5 : 11}
              fontWeight={n.text.startsWith("REGIONAL") ? 700 : 400}
              fontStyle={n.text.includes("observed") ? "italic" : "normal"}
              letterSpacing={n.text.startsWith("REGIONAL") ? "0.06em" : undefined}
              fill={n.text.startsWith("REGIONAL") ? FAINT : "#9fb4a0"}
              textAnchor={n.anchor ?? "start"}
            >
              {n.text}
            </text>
          ))}
          {model.edges.filter((e) => e.layer === "ctx").map((e) => (
            <Edge key={e.id} edge={e} markerPrefix={svgId} />
          ))}
          {model.cards.filter((c) => c.layer === "ctx").map((c) => (
            <Card key={c.id} card={c} />
          ))}
        </g>

        {model.edges.filter((e) => e.layer === "path").map((e, i) => (
          <Edge key={e.id} edge={e} pulseDelay={i * 0.35} step={i + 1} markerPrefix={svgId} />
        ))}
        {model.cards.filter((c) => c.layer === "path").map((c) => (
          <Card key={c.id} card={c} />
        ))}
      </svg>
        </div>

      <Legend compact={compact && !expanded} />
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
          style={{ borderColor: RULE, background: "#fff", color: MUTED }}
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
      style={{ border: `1px solid ${RULE}`, background: "#fff" }}
    >
      <button
        type="button"
        onClick={() => onChange("path")}
        className="transition-colors"
        style={{
          padding: compact ? "5px 12px" : "7px 14px",
          background: viewMode === "path" ? INK : "#fff",
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
          background: viewMode === "full" ? INK : "#fff",
          color: viewMode === "full" ? "#fff" : MUTED,
        }}
      >
        Full environment
      </button>
    </div>
  )
}

function Frame({ frame }: { frame: ContainmentModel["frames"][number] }) {
  const stroke =
    frame.kind === "cloud"
      ? "#3a4757"
      : frame.kind === "region"
        ? "#2e73e8"
        : frame.kind === "vpc"
          ? "#3fa037"
          : frame.kind === "subnet"
            ? "#9cd49b"
            : "#9aa8b8"
  const dash = frame.kind === "region" || frame.kind === "az" ? "5 4" : undefined
  const fill = frame.kind === "subnet" ? "#eef7ec" : "none"
  return (
    <g>
      <rect
        x={frame.x}
        y={frame.y}
        width={frame.w}
        height={frame.h}
        rx={frame.rx}
        fill={fill}
        stroke={stroke}
        strokeWidth={frame.kind === "vpc" || frame.kind === "cloud" ? 1.6 : 1.3}
        strokeDasharray={dash}
      />
      <text
        x={frame.x + 12}
        y={frame.y + 16}
        fontSize={frame.kind === "subnet" ? 11 : 12}
        fontWeight={700}
        fill={frame.kind === "subnet" ? "#2f7a2a" : stroke}
      >
        {truncate(frame.label, 60)}
      </text>
    </g>
  )
}

function Card({ card }: { card: CMCard }) {
  const cc = CAT_COLOR[card.cat]
  const stroke = card.onPath ? "#c0392b" : cc.c
  const sw = card.onPath ? 2.2 : 1.3
  const title = card.title
  const catLabel = cardCategoryLabel(card)
  const compact = card.h <= 36
  const iconSize = compact ? 22 : 28
  const iconX = card.x + (compact ? 9 : 11)
  const iconY = card.y + (card.h - iconSize) / 2
  const textX = card.x + (compact ? 38 : 48)
  const titleSize = compact ? 10 : 11.5
  const catSize = compact ? 7 : 8
  const rx = compact ? 8 : 11
  return (
    <g>
      <rect x={card.x} y={card.y} width={card.w} height={card.h} rx={rx} fill="#fff" stroke={stroke} strokeWidth={sw} />
      <rect x={card.x} y={card.y} width={4} height={card.h} rx={2} fill={cc.c} />
      <rect
        x={iconX}
        y={iconY}
        width={iconSize}
        height={iconSize}
        rx={compact ? 5 : 7}
        fill="#fff"
        stroke={cc.c}
        strokeWidth={1}
      />
      <text x={iconX + iconSize / 2} y={iconY + iconSize * 0.72} textAnchor="middle" fontSize={compact ? 11 : 14} fill={cc.c}>
        {card.icon}
      </text>
      <text x={textX} y={card.y + (compact ? 14 : 20)} fontSize={catSize} fontWeight={800} fill={cc.c} letterSpacing="0.02em">
        {catLabel}
      </text>
      <text x={textX} y={card.y + (compact ? 26 : 35)} fontSize={titleSize} fontWeight={700} fill={INK}>
        {truncate(title, Math.floor((card.w - (compact ? 48 : 60)) / (compact ? 6.5 : 7)))}
      </text>
      {card.sub ? (
        <text
          x={textX}
          y={card.y + card.h - (compact ? 5 : 8)}
          fontSize={compact ? 7.5 : 8.5}
          fill={FAINT}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          {truncate(card.sub, Math.floor((card.w - (compact ? 48 : 60)) / 6))}
        </text>
      ) : null}
      {card.badge ? <Badge x={card.x + card.w - 6} y={card.y + 5} text={card.badge} onPath={card.onPath} compact={compact} /> : null}
    </g>
  )
}

function Badge({ x, y, text, onPath, compact }: { x: number; y: number; text: string; onPath: boolean; compact?: boolean }) {
  const w = text.length * (compact ? 5.2 : 5.7) + (compact ? 10 : 14)
  const h = compact ? 14 : 16
  return (
    <g>
      <rect x={x - w} y={y} width={w} height={h} rx={4} fill={onPath ? "#fbe3e5" : "#eef2f7"} />
      <text x={x - w / 2} y={y + (compact ? 10 : 11.5)} textAnchor="middle" fontSize={compact ? 8 : 9} fontWeight={700} fill={onPath ? "#c0392b" : "#7c8a9c"}>
        {text}
      </text>
    </g>
  )
}

function Edge({
  edge,
  flow,
  pulseDelay = 0,
  step,
  markerPrefix = "apc",
}: {
  edge: CMEdge
  flow?: boolean
  pulseDelay?: number
  step?: number
  markerPrefix?: string
}) {
  const dash = edge.style === "priv" ? "2 5" : edge.style === "enc" ? "5 4" : undefined
  const animate = flow ?? edge.layer === "path"
  return (
    <g>
      <path
        d={edge.d}
        fill="none"
        stroke={edge.color}
        strokeWidth={edge.style === "path" ? 2.4 : 1.8}
        strokeDasharray={dash}
        strokeLinecap="round"
        markerEnd={`url(#${markerPrefix}-arrow-${markerId(edge.color)})`}
      />
      {animate ? (
        <>
          <path className="apc-flow" d={edge.d} fill="none" stroke={edge.color} strokeWidth={2.4} strokeLinecap="round" opacity={0.85} />
          <circle className="apc-dot" r={3.2} fill={edge.color}>
            <animateMotion dur="1.9s" repeatCount="indefinite" begin={`${pulseDelay}s`} path={edge.d} rotate="auto" />
          </circle>
        </>
      ) : null}
      {step != null && edge.labelX != null && edge.labelY != null ? (
        <StepBadge x={edge.labelX} y={edge.labelY - 14} step={step} />
      ) : null}
      {edge.label && edge.labelX != null && edge.labelY != null ? (
        <EdgeLabel x={edge.labelX} y={edge.labelY} text={edge.label} color={edge.color} />
      ) : null}
    </g>
  )
}

function EdgeLabel({ x, y, text, color }: { x: number; y: number; text: string; color: string }) {
  const w = text.length * 5.7 + 12
  return (
    <g>
      <rect x={x - w / 2} y={y - 12} width={w} height={16} rx={5} fill="#fff" stroke={color} strokeOpacity={0.35} />
      <text x={x} y={y} textAnchor="middle" fontSize={10} fontWeight={600} fill={color}>
        {text}
      </text>
    </g>
  )
}

function StepBadge({ x, y, step }: { x: number; y: number; step: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={9} fill="#c0392b" stroke="#fff" strokeWidth={1.5} />
      <text x={x} y={y + 3.5} textAnchor="middle" fontSize={9} fontWeight={800} fill="#fff">
        {step}
      </text>
    </g>
  )
}

function Legend({ compact }: { compact?: boolean }) {
  const items: { sw?: string; ln?: string; dash?: boolean; label: string }[] = [
    { sw: CAT_COLOR.compute.c, label: "Compute · EC2" },
    { sw: CAT_COLOR.network.c, label: "Networking · IGW / VPCE" },
    { sw: CAT_COLOR.storage.c, label: "Storage · S3" },
    { sw: CAT_COLOR.security.c, label: "Security · IAM / KMS" },
    { ln: "#c0392b", label: "Attack path" },
    { ln: "#0a9d87", dash: true, label: "Encrypts" },
    { ln: "#3fa037", dash: true, label: "Private · unused" },
  ]
  return (
    <div
      className={`flex flex-wrap items-center gap-x-5 gap-y-2 apc-legend ${compact ? "mt-1.5 px-3 py-1.5" : "mt-3 px-4 py-2.5"} rounded-xl`}
      style={{ border: `1px solid ${RULE}`, background: "#fff" }}
    >
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: MUTED }}>
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

function markerId(color: string): string {
  return color.replace("#", "")
}
function markerColors(model: ContainmentModel): string[] {
  return Array.from(new Set(model.edges.map((e) => e.color)))
}
