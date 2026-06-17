"use client"

import { memo, useCallback } from "react"
import { Handle, Position, type NodeProps } from "reactflow"
import { AS } from "./attack-surface-tokens"
import type { SurfaceColumnId } from "@/lib/attack-surface/column-schema"

export interface AttackSurfaceNodeData {
  title: string
  sub?: string
  typeLabel: string
  cat: string
  onPath: boolean
  isCrownJewel?: boolean
  metric?: string
  badge?: string
  step?: number
  copyValue?: string
  dimmed?: boolean
}

export interface SurfaceLaneData {
  label: string
  columnId?: SurfaceColumnId
  isJewelZone?: boolean
}

function truncate(s: string, max: number): string {
  if (!s || s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

export const SurfaceLaneNode = memo(function SurfaceLaneNode({ data }: NodeProps<SurfaceLaneData>) {
  return (
    <div
      className="h-full w-full rounded-xl pointer-events-none"
      style={{
        background: AS.lane,
        border: `1px dashed ${AS.laneBorder}`,
      }}
    >
      <div
        className="text-center pt-2.5 text-[9px] font-bold uppercase tracking-[0.16em] font-mono"
        style={{ color: AS.laneLabel }}
      >
        {data.label}
      </div>
    </div>
  )
})

export const SurfaceJewelZoneNode = memo(function SurfaceJewelZoneNode() {
  return (
    <div
      className="h-full w-full rounded-2xl pointer-events-none"
      style={{
        background: AS.jewelGlow,
        border: `2px solid ${AS.jewelBorder}`,
        boxShadow: "0 0 15px rgba(255, 159, 28, 0.4)",
      }}
    />
  )
})

export const AttackSurfaceResourceNode = memo(function AttackSurfaceResourceNode({
  data,
}: NodeProps<AttackSurfaceNodeData>) {
  const isJewel = Boolean(data.isCrownJewel)
  const idText = data.metric ?? data.sub

  const onCopy = useCallback(() => {
    const v = data.copyValue ?? data.sub ?? data.title
    if (v && typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(v)
    }
  }, [data.copyValue, data.sub, data.title])

  const opacity = data.dimmed ? 0.28 : data.onPath ? 1 : 0.78

  return (
    <div
      className="relative transition-all duration-200 cursor-default h-full box-border font-mono"
      style={{
        width: "100%",
        minWidth: 220,
        opacity,
        background: AS.card,
        color: AS.ink,
        border: isJewel ? `2px solid ${AS.jewelBorder}` : `1px solid ${AS.cardBorder}`,
        boxShadow: isJewel ? "0 0 15px rgba(255, 159, 28, 0.4)" : "none",
        padding: "12px 16px",
        borderRadius: 8,
        fontSize: 12,
      }}
      title={[data.title, idText].filter(Boolean).join(" · ")}
      data-testid="attack-surface-node"
      onDoubleClick={onCopy}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 1, height: 1 }} />

      <div className="flex justify-between items-start mb-1.5 gap-2">
        <span
          className="inline-block rounded font-bold uppercase shrink-0"
          style={{
            background: isJewel ? AS.jewelBorder : AS.typeBadge,
            color: AS.typeBadgeInk,
            padding: "2px 6px",
            fontSize: 10,
          }}
        >
          {data.typeLabel}
        </span>
        {data.badge ? (
          <span style={{ color: AS.badgeAccent, fontSize: 10 }}>{data.badge}</span>
        ) : null}
      </div>

      <div
        className="font-bold overflow-hidden text-ellipsis whitespace-nowrap"
        style={{ fontSize: 12 }}
        title={data.title}
      >
        {truncate(data.title, 40)}
      </div>

      {idText ? (
        <div
          className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ color: AS.faint, fontSize: 10 }}
          title={idText}
        >
          {truncate(idText, 48)}
        </div>
      ) : null}

      {data.step != null ? (
        <div
          className="absolute -left-2 -top-2 flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-extrabold"
          style={{ background: AS.exfil, color: "#fff", border: `2px solid ${AS.canvas}` }}
        >
          {data.step}
        </div>
      ) : null}
    </div>
  )
})

export const attackSurfaceNodeTypes = {
  surfaceLane: SurfaceLaneNode,
  surfaceJewelZone: SurfaceJewelZoneNode,
  surfaceResource: AttackSurfaceResourceNode,
}
