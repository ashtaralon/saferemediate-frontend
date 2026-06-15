"use client"

// Killer containment map — per cyntro_containment-map_binding-spec.md.
// Renders the attack path on the customer's REAL AWS architecture using the
// SAME SystemArchitecture object TrafficFlowMap consumes (buildAttackerArchitecture
// over graph-view). topology-aws is supplementary ONLY for "Full environment"
// sibling workloads (§3 option b).

import { useMemo, useState } from "react"
import type { IdentityAttackPath } from "@/components/identity-attack-paths/types"
import type { SystemArchitecture } from "@/components/dependency-map/traffic-flow-map"
import type { AttackPathReport } from "./attack-path-report-types"
import { useCachedFetch } from "@/lib/use-cached-fetch"
import { friendlyResourceName } from "./friendly-names"
import { AttackPathMapLight } from "./attack-path-map-light"
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

const INK = "#16202e"
const MUTED = "#54657a"
const FAINT = "#8597a9"
const RULE = "#dce3ec"

function truncate(s: string, n: number): string {
  return s && s.length > n ? `${s.slice(0, n - 1)}…` : s
}

export function AttackPathContainmentMap({
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
  // Default: "Just this path" (spec §3). Full environment merges topology-aws siblings.
  const [viewMode, setViewMode] = useState<ContainmentViewMode>("path")

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
      <div>
        {!architecture ? (
          <div className="text-[11px] mb-2" style={{ color: FAINT }}>
            Loading attack architecture…
          </div>
        ) : null}
        <AttackPathMapLight path={path} report={report} />
      </div>
    )
  }

  const isolated = viewMode === "path"

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: MUTED }}>
          The attack map
          <span className="ml-2 font-normal normal-case" style={{ color: FAINT }}>
            {model.meta.vpcId} · {model.meta.region}
          </span>
        </div>
        <div
          className="inline-flex rounded-lg overflow-hidden text-[11px] font-semibold"
          style={{ border: `1px solid ${RULE}` }}
        >
          <button
            type="button"
            onClick={() => setViewMode("full")}
            className="px-3 py-1.5 transition-colors"
            style={viewMode === "full" ? { background: INK, color: "#fff" } : { background: "#fff", color: MUTED }}
          >
            Full environment
          </button>
          <button
            type="button"
            onClick={() => setViewMode("path")}
            className="px-3 py-1.5 transition-colors"
            style={viewMode === "path" ? { background: INK, color: "#fff" } : { background: "#fff", color: MUTED }}
          >
            Just this path
          </button>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${model.width} ${model.height}`}
        role="img"
        aria-label={`Attack path on AWS architecture: ${report.current_state.source_label} to ${report.current_state.target_label}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block", width: "100%", height: "auto", fontFamily: "system-ui, sans-serif" }}
        data-testid="attack-path-containment-map"
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
          @media (prefers-reduced-motion: reduce) { .apc-flow { animation: none; } }
        `}</style>
        <defs>
          {markerColors(model).map((c) => (
            <marker
              key={c}
              id={`apc-arrow-${markerId(c)}`}
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
            <Edge key={e.id} edge={e} />
          ))}
          {model.cards.filter((c) => c.layer === "ctx").map((c) => (
            <Card key={c.id} card={c} />
          ))}
        </g>

        {model.edges.filter((e) => e.layer === "path").map((e) => (
          <Edge key={e.id} edge={e} flow />
        ))}
        {model.cards.filter((c) => c.layer === "path").map((c) => (
          <Card key={c.id} card={c} />
        ))}
      </svg>

      <Legend />
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
  const sw = card.onPath ? 2.2 : 1.2
  const title = friendlyResourceName(card.title, undefined)
  return (
    <g>
      <rect x={card.x} y={card.y} width={card.w} height={card.h} rx={9} fill="#fff" stroke={stroke} strokeWidth={sw} />
      <rect x={card.x} y={card.y} width={5} height={card.h} rx={2.5} fill={cc.c} />
      <rect x={card.x + 11} y={card.y + (card.h - 28) / 2} width={28} height={28} rx={7} fill={cc.bg} />
      <text x={card.x + 25} y={card.y + card.h / 2 + 5} textAnchor="middle" fontSize={14} fill={cc.c}>
        {card.icon}
      </text>
      <text
        x={card.x + 48}
        y={card.y + (card.sub ? card.h / 2 - 3 : card.h / 2 + 4)}
        fontSize={12}
        fontWeight={700}
        fill={INK}
      >
        {truncate(title, Math.floor((card.w - 60) / 7))}
      </text>
      {card.sub ? (
        <text x={card.x + 48} y={card.y + card.h / 2 + 12} fontSize={9.5} fill={FAINT} fontFamily="ui-monospace, monospace">
          {truncate(card.sub, Math.floor((card.w - 60) / 6))}
        </text>
      ) : null}
      {card.badge ? <Badge x={card.x + card.w - 8} y={card.y + 8} text={card.badge} onPath={card.onPath} /> : null}
    </g>
  )
}

function Badge({ x, y, text, onPath }: { x: number; y: number; text: string; onPath: boolean }) {
  const w = text.length * 5.7 + 14
  return (
    <g>
      <rect x={x - w} y={y} width={w} height={16} rx={5} fill={onPath ? "#fbe3e5" : "#eef2f7"} />
      <text x={x - w / 2} y={y + 11.5} textAnchor="middle" fontSize={9} fontWeight={700} fill={onPath ? "#c0392b" : "#7c8a9c"}>
        {text}
      </text>
    </g>
  )
}

function Edge({ edge, flow }: { edge: CMEdge; flow?: boolean }) {
  const dash = edge.style === "priv" ? "2 5" : edge.style === "enc" ? "5 4" : undefined
  return (
    <g>
      <path
        d={edge.d}
        fill="none"
        stroke={edge.color}
        strokeWidth={edge.style === "path" ? 2.4 : 1.8}
        strokeDasharray={dash}
        strokeLinecap="round"
        markerEnd={`url(#apc-arrow-${markerId(edge.color)})`}
      />
      {flow && edge.style === "path" ? (
        <path className="apc-flow" d={edge.d} fill="none" stroke={edge.color} strokeWidth={2.4} strokeLinecap="round" opacity={0.85} />
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

function Legend() {
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
      className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 px-4 py-2.5 rounded-xl"
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
