"use client"

import { memo, useCallback, useMemo } from "react"
import { Handle, Position, type NodeProps } from "reactflow"
import { AS } from "./attack-surface-tokens"
import type { AwsNodeType } from "@/lib/attack-surface/blueprint-layout"

export interface AttackSurfaceNodeData {
  title: string
  sub?: string
  typeLabel: string
  displayType: string
  awsType: AwsNodeType
  cat: string
  onPath: boolean
  isCrownJewel?: boolean
  metric?: string
  badge?: string
  alertText?: string
  step?: number
  copyValue?: string
  dimmed?: boolean
}

function truncate(s: string, max: number): string {
  if (!s || s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

function shapeStyles(data: AttackSurfaceNodeData): React.CSSProperties {
  const base: React.CSSProperties = {
    background: "#0B132B",
    color: "#FFFFFF",
    padding: "14px 18px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 11,
    minWidth: 240,
    boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
  }

  switch (data.awsType) {
    case "COMPUTE":
      return { ...base, borderRadius: 6, border: "2px solid #00B4D8" }
    case "SECURITY_GROUP":
      return {
        ...base,
        borderRadius: 4,
        border: "2px dashed #FF9F1C",
        boxShadow: "0 0 10px rgba(255, 159, 28, 0.2)",
        clipPath: "polygon(50% 0%, 100% 18%, 100% 82%, 50% 100%, 0% 82%, 0% 18%)",
        padding: "18px 20px",
      }
    case "NACL":
    case "ROUTE_TABLE":
      return { ...base, borderRadius: 0, border: "1px solid #4CC9F0" }
    case "IAM_ROLE":
    case "INSTANCE_PROFILE":
    case "IAM_POLICY":
      return {
        ...base,
        borderRadius: 20,
        border: "2px solid #48CAE4",
        background: "#1A1A3A",
      }
    case "STORAGE":
      return {
        ...base,
        borderRadius: "50%",
        border: "3px double #FF9F1C",
        background: "#250510",
        boxShadow: "0 0 20px rgba(255, 159, 28, 0.5)",
        minWidth: 180,
        minHeight: 180,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        textAlign: "center",
        padding: "16px",
      }
    case "GATEWAY":
    case "SUBNET":
    case "VPCE":
      return { ...base, borderRadius: 6, border: "1px solid #4CC9F0" }
    case "EXTERNAL":
      return { ...base, borderRadius: 6, border: "2px solid #D90429", boxShadow: "0 0 12px rgba(217,4,41,0.25)" }
    default:
      return { ...base, borderRadius: 8, border: `1px solid ${AS.cardBorder}` }
  }
}

export const AttackSurfaceResourceNode = memo(function AttackSurfaceResourceNode({
  data,
}: NodeProps<AttackSurfaceNodeData>) {
  const idText = data.sub
  const styles = useMemo(() => shapeStyles(data), [data])
  const isJewel = Boolean(data.isCrownJewel)

  const onCopy = useCallback(() => {
    const v = data.copyValue ?? data.sub ?? data.title
    if (v && typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(v)
    }
  }, [data.copyValue, data.sub, data.title])

  const opacity = data.dimmed ? 0.28 : data.onPath ? 1 : 0.78

  return (
    <div
      className="relative transition-all duration-200 cursor-default"
      style={{ ...styles, opacity }}
      title={[data.title, idText, data.alertText].filter(Boolean).join(" · ")}
      data-testid="attack-surface-node"
      data-aws-type={data.awsType}
      onDoubleClick={onCopy}
    >
      <Handle type="target" position={Position.Top} id="top" style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="target" position={Position.Left} id="left" style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="source" position={Position.Right} id="right" style={{ opacity: 0, width: 1, height: 1 }} />

      <div className="flex justify-between items-start mb-1 gap-2">
        <span
          className="inline-block rounded font-bold uppercase shrink-0"
          style={{
            background: isJewel ? "#FF9F1C" : "#1C2541",
            color: isJewel ? "#000" : "#4CC9F0",
            padding: "2px 6px",
            fontSize: 9,
          }}
        >
          {data.displayType}
        </span>
        {data.badge ? <span style={{ fontSize: 12 }}>{data.badge}</span> : null}
      </div>

      <div
        className="font-bold overflow-hidden text-ellipsis whitespace-nowrap"
        style={{ fontSize: 12 }}
        title={data.title}
      >
        {truncate(data.title, 42)}
      </div>

      {idText ? (
        <div className="mt-1 overflow-hidden text-ellipsis whitespace-nowrap" style={{ color: "#A0AEC0", fontSize: 9 }}>
          {truncate(idText, 52)}
        </div>
      ) : null}

      {data.alertText ? (
        <div style={{ color: "#FF4D6D", fontSize: 9, marginTop: 6, fontWeight: "bold" }}>
          ⚠️ {data.alertText}
        </div>
      ) : null}

      {data.step != null ? (
        <div
          className="absolute -left-2 -top-2 flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-extrabold"
          style={{ background: "#D90429", color: "#fff", border: `2px solid ${AS.canvas}` }}
        >
          {data.step}
        </div>
      ) : null}
    </div>
  )
})

export const SurfaceJewelZoneNode = memo(function SurfaceJewelZoneNode() {
  return (
    <div
      className="h-full w-full rounded-full pointer-events-none"
      style={{
        border: "2px dashed rgba(255, 159, 28, 0.35)",
        boxShadow: "0 0 28px rgba(255, 159, 28, 0.15)",
      }}
    />
  )
})

export const attackSurfaceNodeTypes = {
  surfaceJewelZone: SurfaceJewelZoneNode,
  surfaceResource: AttackSurfaceResourceNode,
}
