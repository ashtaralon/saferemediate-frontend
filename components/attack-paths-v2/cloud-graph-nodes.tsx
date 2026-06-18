"use client"

import { memo, useCallback } from "react"
import { Handle, Position, type NodeProps } from "reactflow"
import { Server, Globe, Database, KeyRound, User, ArrowRight, Crown, ShieldAlert, type LucideIcon } from "lucide-react"
import { CG, typeColorForCategory } from "./cloud-graph-tokens"
import { classifyNodeSemantic, SEMANTIC_TOKENS } from "./cloud-graph-semantic"

// v3 design language — a real icon per category instead of a 2-letter square.
function iconForCat(cat: string): LucideIcon {
  switch (cat) {
    case "compute":
      return Server
    case "network":
      return Globe
    case "storage":
      return Database
    case "security":
      return KeyRound
    case "user":
      return User
    default:
      return ArrowRight
  }
}

export type ContainerKind = "cloud" | "region" | "vpc" | "az" | "subnet"

export interface ContainerNodeData {
  label: string
  sub?: string
  kind: ContainerKind
  dimmed?: boolean
  isPublicSubnet?: boolean
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
  /** Folded SG shown inline on the compute card it secures. */
  sgName?: string
  sgPublic?: boolean
}

export interface LaneNodeData {
  label: string
}

function truncate(s: string, max: number): string {
  if (!s || s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

export const NoteNode = memo(function NoteNode({ data }: NodeProps<{ text: string; anchor?: string }>) {
  return (
    <div
      className="pointer-events-none text-[10px] italic whitespace-nowrap"
      style={{
        color: CG.faint,
        textAlign: data.anchor === "middle" ? "center" : "left",
      }}
    >
      {data.text}
    </div>
  )
})

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
  const fill =
    data.kind === "subnet"
      ? data.isPublicSubnet
        ? "rgba(46,158,91,0.12)"
        : "rgba(46,115,232,0.08)"
      : CG.container[data.kind]
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
        className="absolute left-3 top-2.5 text-[12px] font-extrabold uppercase tracking-[0.08em] pointer-events-none select-none"
        style={{
          color:
            data.kind === "subnet"
              ? data.isPublicSubnet ? "#1f6024" : "#1b4cb2"
              : data.kind === "vpc" ? "#247a1f"
              : data.kind === "region" ? "#1b4cb2"
              : data.kind === "cloud" ? "#22303f"
              : stroke,
        }}
        title={data.label}
      >
        {truncate(data.label, 52)}
      </div>
      {data.sub ? (
        <div className="absolute left-3 top-[24px] text-[10px] font-mono pointer-events-none" style={{ color: CG.muted }}>
          {truncate(data.sub, 48)}
        </div>
      ) : null}
    </div>
  )
})

export const ResourceNode = memo(function ResourceNode({ data }: NodeProps<ResourceNodeData>) {
  const color = typeColorForCategory(data.cat)
  const Icon = iconForCat(data.cat)
  const badgeW = data.badge ? data.badge.length * 5.5 + 16 : 0

  const onCopy = useCallback(() => {
    const v = data.copyValue ?? data.title
    if (v && typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(v)
    }
  }, [data.copyValue, data.title])

  // Attack-path-priority rule — semantic class drives border/glow/opacity so
  // ENTRY / IDENTITY / NETWORK / JEWEL visually dominate, CONTROL / OFF_SPINE
  // recede. Title is needed to split cat="network" into NETWORK (conduit) vs
  // CONTROL (config metadata).
  const semantic = classifyNodeSemantic({
    cat: data.cat,
    badge: data.badge,
    title: data.title,
    onPath: data.onPath,
  })
  const token = SEMANTIC_TOKENS[semantic]
  const isJewel = semantic === "JEWEL"
  // data.dimmed (full-environment "isolate" toggle) and data.focused=false
  // are explicit user-driven overrides — they win over the semantic baseline.
  const opacity =
    data.dimmed ? 0.22 :
    data.focused === false ? 0.25 :
    token.opacity

  return (
    <div
      className="relative rounded-lg transition-all duration-200 cursor-default h-full box-border"
      style={{
        width: "100%",
        opacity,
        background: token.bg ?? "white",
        border: `${token.width}px solid ${token.border}`,
        boxShadow: token.glow,
        paddingRight: badgeW > 0 ? badgeW + 8 : 8,
      }}
      title={[data.title, data.sub].filter(Boolean).join(" · ")}
      data-semantic={semantic}
      onDoubleClick={onCopy}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 1, height: 1 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 1, height: 1 }} />

      <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg" style={{ background: color }} />

      <div className="flex items-start gap-2 pl-3 pr-2 pt-2">
        <div
          className="flex shrink-0 items-center justify-center rounded-md border"
          style={{ width: 24, height: 24, borderColor: color, color }}
        >
          <Icon size={14} strokeWidth={2} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <span
            className="inline-flex items-center gap-1 rounded px-1.5 py-[1px] text-[8.5px] font-semibold"
            style={{ background: isJewel ? "#fde8e8" : "#eef2f7", color: isJewel ? CG.attack : "#475569" }}
          >
            {isJewel ? <Crown size={9} aria-hidden /> : null}
            {data.typeLabel}
          </span>
          <div
            className="text-[12.5px] font-medium leading-[1.18] mt-0.5 line-clamp-2"
            style={{ color: CG.ink, overflowWrap: "anywhere", fontFamily: data.sub?.startsWith("i-") ? "ui-monospace, monospace" : undefined }}
            title={data.title}
          >
            {data.title}
          </div>
          {data.sub ? (
            <div className="text-[10.5px] mt-0.5 font-mono truncate" style={{ color: CG.faint }} title={data.sub}>
              {data.sub}
            </div>
          ) : null}
          {data.sgName ? (
            <div
              className="mt-1 flex items-center gap-1 rounded px-1.5 py-[2px] text-[9.5px] font-medium"
              style={{
                background: data.sgPublic ? "#fbe3e5" : "#eef2f7",
                color: data.sgPublic ? CG.attack : "#475569",
              }}
              title={`Security group: ${data.sgName}${data.sgPublic ? " · public ingress (0.0.0.0/0)" : ""}`}
            >
              <ShieldAlert size={10} strokeWidth={2} aria-hidden />
              <span className="truncate font-mono">{data.sgName}</span>
              {data.sgPublic ? <span className="ml-auto shrink-0 font-bold uppercase">public</span> : null}
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
  note: NoteNode,
}
