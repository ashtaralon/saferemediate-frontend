"use client"

// AWS Architecture view — an alternative presentation of the SAME live
// ContainmentModel the Cloud Graph / containment map renders (region · VPC · AZ
// · subnets · services + on-path attack edges). It re-skins that model with
// real AWS-style category icons and evidence-graded arrows (observed = solid,
// configured = dashed), as an additive view toggle in the path-analysis panel.
//
// NO new data path and NO mock: it consumes `buildContainmentFromArchitecture`
// exactly like AttackPathContainmentMap, so the boxes, positions and gate
// colors stay in lockstep with the canonical canvas. Pure presentation.

import { useMemo, type ReactNode } from "react"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { SystemArchitecture } from "@/components/dependency-map/traffic-flow-map"
import type { AttackPathReport } from "./attack-path-report-types"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import { buildContainmentFromArchitecture } from "./build-containment-from-architecture"
import {
  type TopologyResponse,
  type CMCard,
  type CMFrame,
  cmCardRenderHeight,
} from "./containment-model"
import { CG } from "./cloud-graph-tokens"

// ── AWS category palette (mirrors CAT_COLOR / cloud-graph-tokens) ────────────
const CAT = {
  compute: "#E8881C",
  network: "#7C5CFC",
  storage: "#2E9E5B",
  security: "#D9303F",
  user: "#2b3a4b",
} as const

const FRAME_STYLE: Record<
  CMFrame["kind"],
  { stroke: string; fill: string; dash?: string; label: string }
> = {
  cloud: { stroke: "#9AA8B8", fill: "rgba(58,71,87,.03)", label: "#5C6B7E" },
  region: { stroke: "#2E73E8", fill: "rgba(46,115,232,.035)", dash: "5 4", label: "#2E73E8" },
  vpc: { stroke: "#2E9E5B", fill: "rgba(63,160,55,.045)", label: "#2E9E5B" },
  az: { stroke: "#3A6DA0", fill: "rgba(58,109,160,.04)", dash: "4 4", label: "#3A6DA0" },
  subnet: { stroke: "#4E9A4A", fill: "rgba(46,158,91,.06)", label: "#3E7E4E" },
}

// ── AWS-style icons (24px), light theme ──────────────────────────────────────
function Icon({ kind }: { kind: string }) {
  const c = (() => {
    switch (kind) {
      case "lambda":
      case "ec2":
        return CAT.compute
      case "s3":
      case "rds":
      case "ddb":
        return CAT.storage
      case "kms":
      case "role":
        return CAT.security
      case "igw":
      case "vpce":
        return CAT.network
      default:
        return CAT.user
    }
  })()
  const wrap = (inner: ReactNode) => (
    <svg viewBox="0 0 40 40" width="26" height="26" aria-hidden="true">
      <rect x="2" y="2" width="36" height="36" rx="6" fill={c} />
      {inner}
    </svg>
  )
  switch (kind) {
    case "ec2":
      return wrap(
        <>
          <rect x="12" y="12" width="16" height="16" rx="1.5" fill="none" stroke="#fff" strokeWidth="2" />
          <rect x="16.5" y="16.5" width="7" height="7" fill="#fff" />
          <path d="M16 9v3M24 9v3M16 28v3M24 28v3M9 16h3M9 24h3M28 16h3M28 24h3" stroke="#fff" strokeWidth="1.8" />
        </>,
      )
    case "lambda":
      return wrap(<path d="M13 30 L20 13 L23 13 L31 30 H26.5 L21.4 18 L17.5 30 Z" fill="#fff" />)
    case "s3":
      return wrap(
        <path d="M12 13 H28 L26.3 29 Q20 31 13.7 29 Z" fill="#fff" />,
      )
    case "rds":
      return wrap(
        <>
          <ellipse cx="20" cy="14" rx="8" ry="3" fill="none" stroke="#fff" strokeWidth="2" />
          <path d="M12 14v12c0 1.6 3.6 2.9 8 2.9s8-1.3 8-2.9V14" fill="none" stroke="#fff" strokeWidth="2" />
        </>,
      )
    case "ddb":
      return wrap(
        <>
          <ellipse cx="20" cy="14" rx="8" ry="2.8" fill="none" stroke="#fff" strokeWidth="2" />
          <path d="M12 14v12c0 1.6 3.6 2.8 8 2.8s8-1.2 8-2.8V14" fill="none" stroke="#fff" strokeWidth="2" />
          <path d="M28 19l-2 2-2-2" stroke="#fff" strokeWidth="2" fill="none" />
        </>,
      )
    case "kms":
      return wrap(
        <>
          <circle cx="17" cy="17" r="5" fill="none" stroke="#fff" strokeWidth="2.4" />
          <path d="M20.5 20.5 L29 29 M26 26 h3 M29 26 v3" stroke="#fff" strokeWidth="2.4" fill="none" />
        </>,
      )
    case "role":
      return wrap(
        <>
          <circle cx="20" cy="16" r="4.4" fill="#fff" />
          <path d="M12 30 a8 8 0 0 1 16 0 Z" fill="#fff" />
        </>,
      )
    case "igw":
      return wrap(
        <>
          <path d="M11 24 V18 a9 9 0 0 1 18 0 V24" fill="none" stroke="#fff" strokeWidth="2.4" />
          <path d="M15 24v-6a5 5 0 0 1 10 0v6" fill="none" stroke="#fff" strokeWidth="2.4" />
        </>,
      )
    case "vpce":
      return wrap(
        <>
          <path d="M20 9 L29 14 V24 L20 30 L11 24 V14 Z" fill="none" stroke="#fff" strokeWidth="2" />
          <circle cx="20" cy="19.5" r="3.2" fill="#fff" />
        </>,
      )
    default:
      return wrap(
        <>
          <circle cx="20" cy="15" r="4.6" fill="#fff" />
          <path d="M11 31 a9 9 0 0 1 18 0 Z" fill="#fff" />
        </>,
      )
  }
}

function iconKindFor(card: CMCard): string {
  const t = (card.title || "").toLowerCase()
  if (card.cat === "compute") return /lambda/.test(t) ? "lambda" : "ec2"
  if (card.cat === "storage") return /dynamo|ddb/.test(t) ? "ddb" : /rds|aurora|database|\bdb\b/.test(t) ? "rds" : "s3"
  if (card.cat === "security") return /kms|key|encrypt/.test(t) ? "kms" : "role"
  if (card.cat === "network") return /endpoint|vpce/.test(t) ? "vpce" : /igw|gateway|internet/.test(t) ? "igw" : "igw"
  return "user"
}

export function AwsArchitectureAttackMap({
  path,
  report,
  architecture,
  systemName,
}: {
  path: IdentityAttackPath
  report: AttackPathReport
  architecture?: SystemArchitecture | null
  systemName?: string | null
}) {
  const fetchUrl = systemName ? `/api/proxy/topology-aws/${encodeURIComponent(systemName)}` : null
  const { data: fullTopology } = useCachedFetch<TopologyResponse>(fetchUrl, {
    cacheKey: `topology-aws:${systemName}`,
  })

  const model = useMemo(() => {
    if (!architecture) return null
    try {
      return buildContainmentFromArchitecture(architecture, path, report, "full", fullTopology ?? null)
    } catch {
      return null
    }
  }, [architecture, path, report, fullTopology])

  if (!model) {
    return (
      <p className="text-[11px] text-muted-foreground px-2 py-12 text-center">
        AWS architecture view needs the live topology for this path — it isn’t available yet.
      </p>
    )
  }

  // frames render outermost-first so inner boxes sit on top
  const frames = [...model.frames].sort((a, b) => a.w * a.h < b.w * b.h ? 1 : -1)

  return (
    <div className="relative overflow-auto rounded-[14px] border" style={{ borderColor: CG.border, background: CG.canvas }}>
      <svg
        width={model.width}
        height={model.height}
        viewBox={`0 0 ${model.width} ${model.height}`}
        style={{ display: "block", minWidth: model.width, fontFamily: "var(--font-inter, sans-serif)" }}
      >
        <defs>
          {Array.from(new Set(model.edges.map((e) => e.color))).map((col) => (
            <marker
              key={col}
              id={`aws-arrow-${col.replace(/[^a-zA-Z0-9]/g, "")}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0 1 L9 5 L0 9 Z" fill={col} />
            </marker>
          ))}
        </defs>

        {/* containers */}
        {frames.map((f) => {
          const st = FRAME_STYLE[f.kind]
          return (
            <g key={f.id}>
              <rect
                x={f.x}
                y={f.y}
                width={f.w}
                height={f.h}
                rx={f.rx || 10}
                fill={st.fill}
                stroke={st.stroke}
                strokeWidth={f.kind === "subnet" || f.kind === "vpc" ? 1.4 : 1.2}
                strokeDasharray={st.dash}
              />
              <text x={f.x + 10} y={f.y + 15} fontSize="10.5" fontWeight={600} fill={st.label}>
                {f.label}
                {f.sub ? <tspan fill={CG.faint} fontWeight={400}>{`  ${f.sub}`}</tspan> : null}
              </text>
            </g>
          )
        })}

        {/* attack edges */}
        {model.edges.map((e) => {
          const dashed = e.observed === false || e.style !== "path"
          const onPath = e.layer === "path"
          const mid = e.label && e.labelX != null && e.labelY != null
          return (
            <g key={e.id} opacity={onPath ? 1 : 0.5}>
              <path
                d={e.d}
                fill="none"
                stroke={e.color}
                strokeWidth={onPath ? 2.2 : 1.4}
                strokeLinecap="round"
                strokeDasharray={dashed ? "6 5" : undefined}
                markerEnd={`url(#aws-arrow-${e.color.replace(/[^a-zA-Z0-9]/g, "")})`}
              />
              {mid && (
                <text x={e.labelX} y={e.labelY! - 4} fontSize="9" fill={CG.muted} textAnchor="middle">
                  {e.label}
                  {e.hitCount ? <tspan fill={CG.faint}>{`  ·${e.hitCount}`}</tspan> : null}
                </text>
              )}
            </g>
          )
        })}

        {/* resource cards */}
        {model.cards.map((card) => {
          const h = cmCardRenderHeight(card)
          const col = CAT[card.cat]
          const isJewel = card.badge === "CROWN JEWEL"
          const isFoot = card.badge === "FOOTHOLD"
          return (
            <foreignObject key={card.id} x={card.x} y={card.y} width={card.w} height={h}>
              <div
                style={{
                  boxSizing: "border-box",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "6px 6px",
                  borderRadius: 9,
                  background: CG.surface,
                  border: `1.5px solid ${card.onPath ? col : CG.border}`,
                  boxShadow: card.onPath ? `0 0 0 2px ${col}22, ${CG.shadow}` : CG.shadow,
                  position: "relative",
                }}
                title={card.title}
              >
                {(isJewel || isFoot) && (
                  <span
                    style={{
                      position: "absolute",
                      top: -8,
                      fontSize: 7.5,
                      fontWeight: 800,
                      letterSpacing: ".04em",
                      padding: "1px 6px",
                      borderRadius: 5,
                      color: "#fff",
                      background: isJewel ? CAT.security : CAT.compute,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {card.badge}
                  </span>
                )}
                {card.cat !== "user" && (
                  <div style={{ lineHeight: 0 }}>
                    <Icon kind={iconKindFor(card)} />
                  </div>
                )}
                <div
                  style={{
                    fontFamily: "var(--font-mono-stack, monospace)",
                    fontSize: 9.5,
                    lineHeight: 1.2,
                    color: CG.ink,
                    textAlign: "center",
                    wordBreak: "break-word",
                    maxWidth: card.w - 10,
                    fontWeight: card.onPath ? 600 : 400,
                  }}
                >
                  {card.title}
                </div>
                {card.sub && (
                  <div style={{ fontSize: 8, color: CG.faint, textAlign: "center" }}>{card.sub}</div>
                )}
              </div>
            </foreignObject>
          )
        })}
      </svg>

      {/* legend */}
      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          alignItems: "center",
          padding: "8px 12px",
          borderTop: `1px solid ${CG.border}`,
          fontSize: 11,
          color: CG.muted,
        }}
      >
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <svg width="26" height="6">
            <line x1="0" y1="3" x2="26" y2="3" stroke={CG.attack} strokeWidth="2.4" />
          </svg>
          observed (proven in logs)
        </span>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <svg width="26" height="6">
            <line x1="0" y1="3" x2="26" y2="3" stroke={CG.muted} strokeWidth="2.4" strokeDasharray="5 4" />
          </svg>
          configured (allowed, unproven)
        </span>
        <span style={{ color: CG.faint }}>
          {model.meta.onPathCount} on-path nodes · region {model.meta.region} · {model.meta.vpcId}
        </span>
      </div>
    </div>
  )
}
