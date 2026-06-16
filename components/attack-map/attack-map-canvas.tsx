"use client"

import { useMemo } from "react"
import {
  compressConstraintsForEdge,
  deriveMovementEdges,
  resolveTopologySlot,
  type AttackMapPayload,
  type Context,
  type Position,
  type TopologyResource,
  type TopologySnapshot,
  type Verdict,
} from "@/lib/attack-map/slot-mapper"

/* ── theme ───────────────────────────────────────────────────────────── */

const VERDICT_COLOR: Record<Verdict, string> = {
  ENTRY: "#38bdf8",
  SEEN: "#22d3ee",
  ALLOWED: "#f97316",
  NOT_OBSERVED: "#94a3b8",
  BLOCKED: "#ef4444",
}

const VERDICT_LABEL: Record<Verdict, string> = {
  ENTRY: "Entry",
  SEEN: "Observed",
  ALLOWED: "Reachable",
  NOT_OBSERVED: "Not observed",
  BLOCKED: "Blocked",
}

const TYPE_GLYPH: Record<string, string> = {
  EC2Instance: "EC2",
  Lambda: "λ",
  ECSTask: "ECS",
  RDS: "RDS",
  RDSInstance: "RDS",
  ALB: "ALB",
  NAT: "NAT",
  VPCE: "VPCE",
  S3Bucket: "S3",
  DynamoDBTable: "DDB",
  Secret: "SEC",
  KMSKey: "KMS",
  IAMRole: "IAM",
  InstanceProfile: "IP",
  SecurityGroup: "SG",
  Internet: "🌐",
  ExternalPrincipal: "EXT",
}

function glyph(t: string): string {
  return TYPE_GLYPH[t] ?? t.slice(0, 3).toUpperCase()
}

function shortLabel(nodeId: string, nodeType: string, name?: string | null): string {
  if (name && name.length > 0 && name.length <= 22) return name
  if (nodeType === "Internet") return "Internet"
  if (nodeType === "IAMRole" || nodeType === "InstanceProfile") {
    const part = nodeId.split("/").pop() ?? nodeId
    return part.length > 22 ? `${part.slice(0, 10)}…${part.slice(-8)}` : part
  }
  if (nodeId.startsWith("arn:")) {
    const tail = nodeId.split(":").pop() ?? nodeId
    const last = tail.split("/").pop() ?? tail
    return last.length > 22 ? `${last.slice(0, 10)}…${last.slice(-8)}` : last
  }
  if (nodeId.startsWith("i-") || nodeId.startsWith("sg-")) {
    return nodeId.length > 20 ? `${nodeId.slice(0, 10)}…${nodeId.slice(-6)}` : nodeId
  }
  return nodeId.length > 22 ? `${nodeId.slice(0, 12)}…${nodeId.slice(-6)}` : nodeId
}

/* ── topology resource backdrop ──────────────────────────────────────── */

interface BackdropTile {
  node_id: string
  node_type: string
  name: string | null
  x: number
  y: number
}

/** Pre-compute positions for every system resource so AZ/subnet boxes
 * render with visible context instead of empty interiors. */
function useBackdropTiles(
  topology: TopologySnapshot,
  payload: AttackMapPayload,
  density: { jewel_column_capacity: number; tile_w: number; tile_h: number; tile_gap: number; tiles_per_row: number },
): BackdropTile[] {
  return useMemo(() => {
    const chainIds = new Set(payload.movement_chain.map((h) => h.node_id))
    const constraintIds = new Set(payload.constraint_edges.map((c) => c.constraint_node_id))
    const tiles: BackdropTile[] = []
    for (const r of topology.resources) {
      if (chainIds.has(r.node_id)) continue // chain hops draw on top
      if (constraintIds.has(r.node_id)) continue
      // synthesize a minimal context — backdrop tiles never need chain semantics
      const ctx: Context = {
        topology,
        chain: payload.movement_chain,
        hop_index: -1,
        movement_edges: [],
        constraint_edges: [],
        density,
      }
      const pos = resolveTopologySlot(
        {
          node_id: r.node_id,
          node_type: r.node_type,
          verdict: "NOT_OBSERVED" as Verdict,
          subnet_id: r.subnet_id,
          az: r.az,
        },
        ctx,
      )
      if (pos.fallback) continue // skip drift-lane backdrop noise
      tiles.push({ node_id: r.node_id, node_type: r.node_type, name: r.name, x: pos.x, y: pos.y })
    }
    return tiles
  }, [topology, payload, density])
}

/* ── component ───────────────────────────────────────────────────────── */

export interface AttackMapCanvasProps {
  payload: AttackMapPayload
  topology: TopologySnapshot
  positions: Map<string, Position>
  density: { jewel_column_capacity: number; tile_w: number; tile_h: number; tile_gap: number; tiles_per_row: number }
}

export function AttackMapCanvas({ payload, topology, positions, density }: AttackMapCanvasProps) {
  const chain = payload.movement_chain
  const movementEdges = useMemo(() => deriveMovementEdges(chain), [chain])
  const backdrop = useBackdropTiles(topology, payload, density)

  // bounds: include backdrop + chain + jewel column + drift lane
  const bounds = useMemo(() => {
    let minX = topology.vpc.x - 40
    let minY = topology.vpc.y - 96 // headroom for external slots + VPC banner
    let maxX = topology.crown_jewel_column.x + 180
    let maxY = topology.drift_lane.y + topology.drift_lane.h + 56
    for (const p of positions.values()) {
      minX = Math.min(minX, p.x - 48)
      minY = Math.min(minY, p.y - 48)
      maxX = Math.max(maxX, p.x + 120)
      maxY = Math.max(maxY, p.y + 56)
    }
    for (const t of backdrop) {
      maxX = Math.max(maxX, t.x + 60)
      maxY = Math.max(maxY, t.y + 40)
    }
    return { minX, minY, w: maxX - minX, h: maxY - minY }
  }, [positions, topology, backdrop])

  // Per-hop positions WITH duplicate offset.
  // When the same node_id appears multiple times (e.g. EC2 footprint
  // touched repeatedly by Internet → SG → IAM transitions), each occurrence
  // gets a tiny circular offset around the base position so badges 1/3/5
  // don't stack invisibly. This is presentation-only; the slot-mapper's
  // deterministic position stays the canonical one.
  const occurrenceMap = useMemo(() => {
    const counts = new Map<string, number>()
    return chain.map((h) => {
      const n = counts.get(h.node_id) ?? 0
      counts.set(h.node_id, n + 1)
      return n
    })
  }, [chain])
  const totalOccurrences = useMemo(() => {
    const m = new Map<string, number>()
    for (const h of chain) m.set(h.node_id, (m.get(h.node_id) ?? 0) + 1)
    return m
  }, [chain])

  const hopPositions = useMemo(
    () =>
      chain.map((h, idx) => {
        const base = positions.get(h.node_id)
        if (!base) return null
        const total = totalOccurrences.get(h.node_id) ?? 1
        if (total <= 1) return { x: base.x, y: base.y, base }
        // Distribute occurrences on a small circle around the base point.
        const occ = occurrenceMap[idx]
        const radius = 22
        const theta = (Math.PI * 2 * occ) / total - Math.PI / 2 // start at top
        return { x: base.x + radius * Math.cos(theta), y: base.y + radius * Math.sin(theta), base }
      }),
    [chain, positions, occurrenceMap, totalOccurrences],
  )

  // chain path string uses offset hop positions so the spine touches every hop
  const chainPath = hopPositions.filter(Boolean).length > 1
    ? hopPositions
        .filter((p): p is { x: number; y: number; base: Position } => Boolean(p))
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
        .join(" ")
    : ""

  const chainPoints = hopPositions.filter((p): p is { x: number; y: number; base: Position } => Boolean(p))

  // approximate total length so the dash animation feels right at any zoom
  const chainLength = useMemo(() => {
    let l = 0
    for (let i = 1; i < chainPoints.length; i++) {
      const dx = chainPoints[i].x - chainPoints[i - 1].x
      const dy = chainPoints[i].y - chainPoints[i - 1].y
      l += Math.sqrt(dx * dx + dy * dy)
    }
    return Math.max(40, l)
  }, [chainPoints])

  // jewels not on the chain — render as muted slots in the column
  const offChainJewels = useMemo(() => {
    const chainIds = new Set(chain.map((h) => h.node_id))
    return topology.crown_jewels.filter((j) => !chainIds.has(j.node_id))
  }, [topology, chain])

  return (
    <svg
      viewBox={`${bounds.minX} ${bounds.minY} ${bounds.w} ${bounds.h}`}
      className="w-full h-[min(720px,78vh)] min-h-[480px]"
      role="img"
      aria-label="Cyntro attack map"
      data-testid="cyntro-attack-map-canvas"
    >
      <defs>
        <marker
          id="cyntro-arrow"
          markerWidth="10"
          markerHeight="10"
          refX="8"
          refY="3"
          orient="auto"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="#f97316" />
        </marker>
        <filter id="cyntro-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ── VPC banner — anchored ABOVE the highest subnet (not above
           topology.vpc.y, which can sit below subnets when the adapter
           returns absolute coords instead of vpc-relative). ─────────── */}
      {(() => {
        const subList = Object.values(topology.subnets)
        const topSubnetY = subList.length
          ? Math.min(...subList.map((s) => s.y))
          : topology.vpc.y
        const bannerY = topSubnetY - 30
        return (
          <>
            <rect
              x={topology.vpc.x}
              y={bannerY}
              width={topology.vpc.w}
              height={22}
              rx={6}
              fill="#0b1220"
              stroke="#334155"
              strokeWidth={1}
            />
            <text
              x={topology.vpc.x + 12}
              y={bannerY + 15}
              fill="#94a3b8"
              fontSize={11}
              fontWeight={600}
              letterSpacing="0.12em"
            >
              VPC · {topology.system}
            </text>
          </>
        )
      })()}

      {/* VPC frame */}
      <rect
        x={topology.vpc.x}
        y={topology.vpc.y}
        width={topology.vpc.w}
        height={topology.vpc.h}
        rx={12}
        fill="#0f172a"
        stroke="#1e293b"
        strokeWidth={1.5}
      />

      {/* Subnet shells with AZ labels OUTSIDE the box so no overlap */}
      {Object.values(topology.subnets).map((sub) => (
        <g key={sub.id}>
          <text x={sub.x + 8} y={sub.y - 6} fill="#64748b" fontSize={9} fontWeight={600}>
            {sub.az.toUpperCase()} · {sub.kind === "public" ? "public " : ""}
            {sub.id.slice(-6)}
          </text>
          <rect
            x={sub.x}
            y={sub.y}
            width={sub.w}
            height={sub.h}
            rx={8}
            fill="#111827"
            stroke={sub.kind === "public" ? "#0ea5e9" : "#334155"}
            strokeWidth={1}
            strokeDasharray={sub.kind === "public" ? undefined : "4 3"}
            opacity={0.95}
          />
        </g>
      ))}

      {/* Group boxes (ASG / SG cluster / raw) */}
      {Object.values(topology.groups).map((g) => (
        <g key={g.id}>
          <rect
            x={g.x}
            y={g.y}
            width={g.w}
            height={g.h}
            rx={6}
            fill="#0b1220"
            stroke="#1e293b"
            strokeWidth={1}
            opacity={0.85}
          />
          {g.kind !== "subnet_raw" && (
            <text x={g.x + 6} y={g.y - 4} fill="#64748b" fontSize={8} fontWeight={500}>
              {g.kind.toUpperCase()}
            </text>
          )}
        </g>
      ))}

      {/* ── Backdrop tiles (every resource in the system, muted) ────
           Show glyph + head-of-name (first 8 chars). Tail truncation
           produced gibberish like "e-pilot" / "be-plot" from lambdas
           ending in -pilot. */}
      {backdrop.map((t) => {
        const nm = (t.name ?? t.node_id.split(":").pop() ?? t.node_id).replace(/^[^a-zA-Z0-9]+/, "")
        const labelHead = nm.length > 9 ? `${nm.slice(0, 8)}…` : nm
        return (
          <g key={`bg-${t.node_id}`} opacity={0.5}>
            <rect
              x={t.x}
              y={t.y}
              width={44}
              height={28}
              rx={4}
              fill="#1e293b"
              stroke="#334155"
              strokeWidth={0.75}
            />
            <text x={t.x + 22} y={t.y + 13} textAnchor="middle" fill="#94a3b8" fontSize={8} fontWeight={600}>
              {glyph(t.node_type)}
            </text>
            <text x={t.x + 22} y={t.y + 23} textAnchor="middle" fill="#64748b" fontSize={6}>
              {labelHead}
            </text>
          </g>
        )
      })}

      {/* ── Crown-jewel column ──────────────────────────────────────── */}
      <line
        x1={topology.crown_jewel_column.x}
        y1={topology.vpc.y - 4}
        x2={topology.crown_jewel_column.x}
        y2={topology.vpc.y + topology.vpc.h + 8}
        stroke="#7c3aed"
        strokeWidth={1}
        strokeDasharray="3 4"
        opacity={0.45}
      />
      <text
        x={topology.crown_jewel_column.x}
        y={topology.vpc.y - 30}
        textAnchor="start"
        fill="#a78bfa"
        fontSize={10}
        fontWeight={700}
        letterSpacing="0.12em"
      >
        CROWN JEWELS
      </text>
      {offChainJewels.map((j, idx) => {
        const x = topology.crown_jewel_column.x
        const y =
          topology.crown_jewel_column.top_y +
          (idx + chain.filter((h) => h.is_crown_jewel).length) *
            topology.crown_jewel_column.row_height
        return (
          <g key={`jewel-bg-${j.node_id}`} opacity={0.5}>
            <circle cx={x} cy={y} r={10} fill="#1e1b4b" stroke="#6d28d9" strokeWidth={1} />
            <text x={x} y={y + 3} textAnchor="middle" fill="#c4b5fd" fontSize={7} fontWeight={700}>
              {glyph(j.node_type)}
            </text>
            <text x={x + 16} y={y + 3} fill="#94a3b8" fontSize={8}>
              {(j.name ?? j.node_id).slice(-14)}
            </text>
          </g>
        )
      })}

      {/* ── Drift lane ──────────────────────────────────────────────── */}
      <rect
        x={topology.drift_lane.x}
        y={topology.drift_lane.y}
        width={topology.drift_lane.w}
        height={topology.drift_lane.h}
        rx={6}
        fill="#1c1017"
        stroke="#7f1d1d"
        strokeWidth={1}
        strokeDasharray="5 4"
        opacity={0.6}
      />
      <text x={topology.drift_lane.x + 10} y={topology.drift_lane.y + 16} fill="#fca5a5" fontSize={10} fontWeight={600}>
        DRIFT LANE
      </text>
      <text x={topology.drift_lane.x + 10} y={topology.drift_lane.y + 30} fill="#94a3b8" fontSize={8}>
        cross-system or unmapped resources
      </text>

      {/* ── Movement spine ──────────────────────────────────────────── */}
      {chainPath && (
        <>
          {/* base shadow */}
          <path
            d={chainPath}
            fill="none"
            stroke="#f97316"
            strokeWidth={3.5}
            strokeLinejoin="round"
            opacity={0.18}
          />
          {/* solid */}
          <path
            d={chainPath}
            fill="none"
            stroke="#f97316"
            strokeWidth={2.5}
            strokeLinejoin="round"
            markerEnd="url(#cyntro-arrow)"
            opacity={0.9}
            filter="url(#cyntro-glow)"
          />
          {/* animated flow */}
          <path
            d={chainPath}
            fill="none"
            stroke="#fde047"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeDasharray={`12 ${chainLength}`}
            opacity={0.9}
          >
            <animate
              attributeName="stroke-dashoffset"
              from={chainLength}
              to={0}
              dur="2.6s"
              repeatCount="indefinite"
            />
          </path>
        </>
      )}

      {/* ── Constraint bands on edges (deduped by gated edge) ───────── */}
      {movementEdges.map((edge) => {
        // Use the actual rendered hop positions (with duplicate offset)
        // so the chip sits on the spine, not at a logical midpoint that
        // floats in empty space when duplicate hops overlap.
        const srcHop = hopPositions[edge.src_index]
        const dstHop = hopPositions[edge.dst_index]
        if (!srcHop || !dstHop) return null
        const compressed = compressConstraintsForEdge(
          `${edge.src}→${edge.dst}`,
          payload.constraint_edges.filter(
            (c) => c.gates_movement_edge === `${edge.src}→${edge.dst}`,
          ),
          new Date(),
        )
        if (!compressed.visible.length) return null
        const mx = (srcHop.x + dstHop.x) / 2
        const my = (srcHop.y + dstHop.y) / 2 - 14
        const head = compressed.visible[0]
        const headLabel = `${head.node_type}${head.count > 1 ? ` ×${head.count}` : ""}${
          compressed.overflow > 0 ? ` +${compressed.overflow}` : ""
        }`
        const sevFill =
          head.severity === "critical"
            ? "#7f1d1d"
            : head.severity === "high"
              ? "#9a3412"
              : head.severity === "medium"
                ? "#92400e"
                : "#1e3a8a"
        return (
          <g key={`gate-${edge.src}-${edge.dst}`}>
            <rect
              x={mx - 60}
              y={my - 11}
              width={120}
              height={20}
              rx={10}
              fill={sevFill}
              stroke="#f97316"
              strokeWidth={1}
              opacity={0.92}
            />
            <text x={mx} y={my + 4} textAnchor="middle" fill="#fef3c7" fontSize={9} fontWeight={600}>
              {headLabel}
            </text>
          </g>
        )
      })}

      {/* ── Chain hop nodes ─────────────────────────────────────────── */}
      {chain.map((hop, idx) => {
        const hp = hopPositions[idx]
        if (!hp) return null
        const pos = { ...hp.base, x: hp.x, y: hp.y }
        const color = VERDICT_COLOR[hop.verdict] ?? "#94a3b8"
        const isJewel = hop.is_crown_jewel || pos.anchor_kind === "jewel"
        const isLabel = pos.anchor_kind === "label"
        const isStrip = pos.anchor_kind === "strip"
        const r = isJewel ? 15 : isLabel ? 0 : isStrip ? 10 : 12
        const label = shortLabel(hop.node_id, hop.node_type, undefined)
        // Key includes idx — same node_id can legitimately appear twice
        // (e.g. EC2 → IAMRole → back to EC2 via different SG). Key by id
        // alone would collide and React would drop a hop.
        return (
          <g key={`${hop.node_id}-${idx}`} data-hop-index={idx}>
            {isLabel ? (
              <rect
                x={pos.x - 40}
                y={pos.y - 9}
                width={80}
                height={18}
                rx={4}
                fill="#0f172a"
                stroke={color}
                strokeWidth={1.25}
              />
            ) : (
              <>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={r + 4}
                  fill={color}
                  opacity={0.18}
                />
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={r}
                  fill={isJewel ? "#4c1d95" : "#0f172a"}
                  stroke={color}
                  strokeWidth={isJewel ? 2.5 : 2}
                />
              </>
            )}
            <text
              x={pos.x}
              y={pos.y + 3}
              textAnchor="middle"
              fill={isJewel ? "#ede9fe" : color}
              fontSize={isJewel ? 9 : 8}
              fontWeight={700}
            >
              {glyph(hop.node_type)}
            </text>
            <text
              x={pos.x}
              y={pos.y + (isLabel ? 24 : 30)}
              textAnchor="middle"
              fill="#e2e8f0"
              fontSize={9}
            >
              {label}
            </text>
            {/* Hop ordinal — sequential 1..N, never gappy */}
            <g>
              <circle
                cx={pos.x + r + 4}
                cy={pos.y - r - 2}
                r={9}
                fill="#0f172a"
                stroke={color}
                strokeWidth={1.5}
              />
              <text
                x={pos.x + r + 4}
                y={pos.y - r + 1.5}
                textAnchor="middle"
                fill={color}
                fontSize={9}
                fontWeight={700}
              >
                {idx + 1}
              </text>
            </g>
            {pos.fallback && (
              <text x={pos.x + r + 18} y={pos.y - r - 2} fill="#fca5a5" fontSize={7}>
                {pos.fallback}
              </text>
            )}
          </g>
        )
      })}

      {/* ── Legend ──────────────────────────────────────────────────── */}
      <g transform={`translate(${bounds.minX + 16}, ${bounds.minY + bounds.h - 22})`}>
        {(["ENTRY", "SEEN", "ALLOWED", "NOT_OBSERVED", "BLOCKED"] as Verdict[]).map((v, i) => (
          <g key={v} transform={`translate(${i * 96}, 0)`}>
            <circle cx={6} cy={6} r={5} fill="#0f172a" stroke={VERDICT_COLOR[v]} strokeWidth={1.5} />
            <text x={16} y={9} fill="#94a3b8" fontSize={9}>
              {VERDICT_LABEL[v]}
            </text>
          </g>
        ))}
      </g>
    </svg>
  )
}
