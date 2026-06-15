"use client"

import { memo, useCallback } from "react"
import { Handle, Position, type NodeProps } from "reactflow"
import { CG, typeColorForCategory } from "./cloud-graph-tokens"

export type ContainerKind = "cloud" | "region" | "vpc" | "az" | "subnet"

export interface ContainerNodeData {
  label: string
  sub?: string
  kind: ContainerKind
  dimmed?: boolean
}

export interface ResourceNodeData {
  title: string
  sub?: string
  typeLabel: string
  cat: string
  badge?: string
  onPath: boolean
  variant: "protagonist" | "standard" | "chip"
  dimmed?: boolean
  focused?: boolean
  step?: number
  copyValue?: string
}

export interface LaneNodeData {
  label: string
}

function truncate(s: string, max: number): string {
  if (!s || s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

export const LaneBackdropNode = memo(function LaneBackdropNode({ data }: NodeProps<LaneNodeData>) {
  return (
    <div
      className="h-full w-full rounded-xl pointer-events-none"
      style={{
        background: "rgba(228,233,240,0.35)",
        border: `1px dashed ${CG.border}`,
      }}
    >
      <div
        className="text-center pt-2.5 text-[10px] font-bold uppercase tracking-[0.14em]"
        style={{ color: CG.faint }}
      >
        {data.label}
      </div>
    </div>
  )
})

export const ContainerNode = memo(function ContainerNode({ data }: NodeProps<ContainerNodeData>) {
  const stroke =
    data.kind === "cloud"
      ? "#3a4757"
      : data.kind === "region"
        ? "#2e73e8"
        : data.kind === "vpc"
          ? "#3fa037"
          : data.kind === "subnet"
            ? "#9cd49b"
            : "#9aa8b8"
  const fill = CG.container[data.kind]
  const dash = data.kind === "region" || data.kind === "az" ? "6 4" : undefined
  return (
    <div
      className="relative h-full w-full rounded-xl transition-opacity duration-200"
      style={{
        background: fill,
        border: `1px solid ${stroke}`,
        borderStyle: dash ? "dashed" : "solid",
        opacity: data.dimmed ? 0.22 : 1,
        boxShadow: data.dimmed ? "none" : CG.shadow,
      }}
    >
      <div
        className="absolute left-3 top-2.5 text-[11px] font-bold uppercase tracking-[0.06em] pointer-events-none select-none"
        style={{ color: data.kind === "subnet" ? "#2f7a2a" : stroke }}
        title={data.label}
      >
        {truncate(data.label, 52)}
      </div>
      {data.sub ? (
        <div className="absolute left-3 top-[22px] text-[10px] pointer-events-none" style={{ color: CG.faint }}>
          {truncate(data.sub, 48)}
        </div>
      ) : null}
    </div>
  )
})

export const ResourceNode = memo(function ResourceNode({ data }: NodeProps<ResourceNodeData>) {
  const color = typeColorForCategory(data.cat)
  const h = data.variant === "chip" ? 44 : data.variant === "protagonist" ? 76 : 68
  const badgeW = data.badge ? data.badge.length * 5.5 + 16 : 0
  const titleMax = data.variant === "chip" ? 22 : 28

  const onCopy = useCallback(() => {
    const v = data.copyValue ?? data.title
    if (v && typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(v)
    }
  }, [data.copyValue, data.title])

  const opacity = data.dimmed ? 0.22 : data.focused === false ? 0.25 : 1
  const stroke = data.onPath ? CG.attack : CG.border
  const sw = data.onPath ? 2 : 1

  return (
    <div
      className="relative rounded-lg bg-white transition-all duration-200 cursor-default"
      style={{
        width: "100%",
        minHeight: h,
        opacity,
        border: `${sw}px solid ${stroke}`,
        boxShadow: data.onPath ? CG.shadow : "0 1px 2px rgba(16,24,40,.03)",
        paddingRight: badgeW > 0 ? badgeW + 8 : 8,
      }}
      title={[data.title, data.sub].filter(Boolean).join(" · ")}
      onDoubleClick={onCopy}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 1, height: 1 }} />

      <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg" style={{ background: color }} />

      <div className="flex items-start gap-2 pl-3 pr-2 pt-2">
        <div
          className="flex shrink-0 items-center justify-center rounded-md border text-[11px] font-bold"
          style={{ width: 24, height: 24, borderColor: color, color }}
        >
          {data.cat === "compute" ? "EC" : data.cat === "network" ? "NW" : data.cat === "storage" ? "S3" : data.cat === "security" ? "ID" : "→"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-extrabold uppercase tracking-[0.04em]" style={{ color }}>
            {data.typeLabel}
          </div>
          <div
            className="text-[13px] font-medium leading-tight"
            style={{ color: CG.ink, fontFamily: data.sub?.startsWith("i-") ? "ui-monospace, monospace" : undefined }}
            title={data.title}
          >
            {truncate(data.title, titleMax)}
          </div>
          {data.sub ? (
            <div className="text-[11px] mt-0.5 font-mono truncate" style={{ color: CG.faint }} title={data.sub}>
              {truncate(data.sub, 28)}
            </div>
          ) : null}
        </div>
      </div>

      {data.badge ? (
        <div
          className="absolute right-2 top-2 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase"
          style={{
            background: data.onPath ? "#fbe3e5" : "#eef2f7",
            color: data.onPath ? CG.attack : CG.muted,
          }}
        >
          {data.badge}
        </div>
      ) : null}
      {data.step != null ? (
        <div
          className="absolute -left-2 -top-2 flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-extrabold text-white"
          style={{ background: CG.attack, border: "2px solid #fff" }}
        >
          {data.step}
        </div>
      ) : null}
    </div>
  )
})

export const cloudGraphNodeTypes = {
  lane: LaneBackdropNode,
  container: ContainerNode,
  resource: ResourceNode,
}
