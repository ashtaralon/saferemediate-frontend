"use client"

/**
 * Ops perimeter — presentational pieces of the "10-second map".
 *
 *   OpsReadoutStrip      one line: In · Out · AWS deps · Traffic evidence
 *   OpsFlowLegend        data type (colour + pattern + packet) and evidence
 *   InternetBand         NORTH: inbound (users) left, outbound destinations
 *                        right, grouped into four honest classes
 *   IgwPerimeterDoor     the IGW drawn ON the VPC's top border, door-sized
 *   VpceDoor             a VPC endpoint drawn ON the VPC's east border
 *   MissingEndpointDoor  a dashed door where S3 / DynamoDB traffic leaves via
 *                        NAT/IGW and no gateway endpoint exists
 *   NatGapMarker         "No NAT in this AZ" in a public subnet cell
 *   LogicalGroupHulls    ASG / TG / cluster outlines drawn around their
 *                        members across AZ columns (replaces the band)
 *
 * All pure presentation: every fact arrives already computed by
 * `ops-perimeter-model.ts` from the topology payload. Nothing here decides
 * a count, a route or a label.
 *
 * Anchors: every element FlowOverlay may route a line to keeps the
 * `data-flow-id` the old element carried, so edges land exactly as before.
 */

import { useEffect, useState, type ReactNode, type RefObject } from "react"
import { AlertTriangle } from "lucide-react"
import { FLOW_ALERT_COLOR, FLOW_DATA_KIND_ORDER, FLOW_DATA_KIND_STYLE, type FlowDataKind } from "./flow-visuals"
import {
  EGRESS_CLASS_COPY,
  logicalGroupHullLabel,
  type CrossAzNatRoute,
  type EgressDestinationGroup,
  type LogicalGroupHullSpec,
  type MissingGatewayEndpoint,
  type ReadoutSegment,
} from "./ops-perimeter-model"

const INK = "#1A2330"
const SLATE = "#5A6B7A"
const AMBER_TEXT = "#92400E"
const AMBER_BORDER = "#F59E0B"
const AMBER_BG = "#FFFBEB"
const DOOR_BLUE = "#1E40AF"

// ---------------------------------------------------------------------------
// Readout
// ---------------------------------------------------------------------------

const TONE_STYLE: Record<ReadoutSegment["tone"], { color: string; bg: string; border: string }> = {
  neutral: { color: INK, bg: "#FFFFFF", border: "#E2E8F0" },
  warn: { color: AMBER_TEXT, bg: AMBER_BG, border: "#FCD34D" },
  unknown: { color: "#475569", bg: "#F8FAFC", border: "#CBD5E1" },
}

export function OpsReadoutStrip({
  segments,
  compact = false,
}: {
  segments: readonly ReadoutSegment[]
  compact?: boolean
}) {
  return (
    <div
      className={`flex flex-wrap items-stretch gap-1.5 ${compact ? "py-0.5" : "py-1"}`}
      data-testid="topology-ops-readout"
      data-flow-obstacle="ops-readout"
      role="status"
      aria-label="Network summary"
    >
      {segments.map(seg => {
        const s = TONE_STYLE[seg.tone]
        return (
          <div
            key={seg.key}
            className="flex items-baseline gap-1.5 rounded-md px-2 py-1 min-w-0"
            style={{ background: s.bg, border: `1px solid ${s.border}` }}
            title={seg.title}
            data-testid={
              // The traffic segment IS the authority state now; the old full-width
              // banner's test id moves with the fact it carried.
              seg.key === "evidence" ? "topology-traffic-authority-state" : `topology-ops-readout-${seg.key}`
            }
            data-tone={seg.tone}
          >
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] shrink-0" style={{ color: SLATE }}>
              {seg.label}
            </span>
            <span className={`${compact ? "text-[11px]" : "text-[12px]"} font-semibold truncate`} style={{ color: s.color }}>
              {seg.value}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Legend — three rules
// ---------------------------------------------------------------------------

function KindSwatch({ kind }: { kind: FlowDataKind }) {
  const st = FLOW_DATA_KIND_STYLE[kind]
  return (
    <svg width="46" height="14" viewBox="0 0 46 14" aria-hidden>
      <path d="M 2 7 H 44" stroke={st.color} strokeWidth={st.width} strokeDasharray={st.dash} strokeLinecap="round" />
      {st.core ? <path d="M 2 7 H 44" stroke="white" strokeWidth={Math.max(0.8, st.width * 0.34)} strokeLinecap="round" /> : null}
      <g transform="translate(23 7)">
        <path d={st.glyph} fill="white" stroke="white" strokeWidth="3" strokeLinejoin="round" />
        <path
          d={st.glyph}
          fill={kind === "egress" ? "none" : st.color}
          stroke={st.color}
          strokeWidth="1.2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}

function EvidenceSwatch({ mode }: { mode: "live" | "historical" | "configured" }) {
  const c = "#475569"
  const glyph = FLOW_DATA_KIND_STYLE.request.glyph
  return (
    <svg width="40" height="14" viewBox="0 0 40 14" aria-hidden>
      <path d="M 2 7 H 38" stroke={c} strokeWidth={mode === "configured" ? 1.2 : 1.6} strokeOpacity={mode === "configured" ? 0.38 : 0.72} />
      {mode === "configured" ? null : (
        <g transform="translate(20 7)">
          <path
            d={glyph}
            fill={mode === "live" ? c : "white"}
            stroke={c}
            strokeWidth="1.2"
            strokeDasharray={mode === "live" ? undefined : "2 1.3"}
          />
        </g>
      )}
    </svg>
  )
}

/**
 * The Network view's key. Two questions, two rows:
 *   what kind of data   — colour + line pattern + packet shape (all three,
 *                         so it reads without colour)
 *   how do we know      — filled packets = live, hollow = historical,
 *                         faint line with no packet = configured only
 * Red dashes override everything: exposure / attack path.
 */
export function OpsFlowLegend({ compact = false }: { compact?: boolean }) {
  // Folded by default: one row of line swatches (hover for the name) and a
  // button that opens the full key. The full key was two rows of chrome on
  // every visit, above a map whose lines already carry their own shapes.
  const [open, setOpen] = useState(false)
  return (
    <div
      className={`flex flex-col gap-1 border-y ${compact ? "px-1 py-1" : "px-2 py-1"}`}
      style={{ borderColor: "#E2E8F0", background: "rgba(255,255,255,0.86)" }}
      data-testid="topology-flow-legend"
      data-flow-obstacle="flow-legend"
      data-open={open ? "true" : "false"}
      aria-label="How to read the lines"
    >
      {!open ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {FLOW_DATA_KIND_ORDER.map(kind => (
            <span key={kind} title={`${FLOW_DATA_KIND_STYLE[kind].label} — ${FLOW_DATA_KIND_STYLE[kind].detail}`} className="inline-flex">
              <KindSwatch kind={kind} />
            </span>
          ))}
          <span className="text-[10px]" style={{ color: "#475569" }}>
            filled = confirmed · hollow = historical · faint = configured · none of it means "now"
          </span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ml-auto text-[10px] font-semibold underline decoration-dotted"
            style={{ color: "#0E8B7A" }}
            aria-expanded={false}
          >
            How to read the lines
          </button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1" hidden={!open}>
        <span className="text-[9px] font-bold uppercase tracking-[0.12em] w-[86px] shrink-0" style={{ color: "#475569" }}>
          Data type
        </span>
        {FLOW_DATA_KIND_ORDER.map(kind => (
          <span
            key={kind}
            className="inline-flex items-center gap-1 whitespace-nowrap"
            title={FLOW_DATA_KIND_STYLE[kind].detail}
            data-testid="topology-flow-legend-kind"
            data-kind={kind}
          >
            <KindSwatch kind={kind} />
            <span className="text-[10px] font-medium" style={{ color: "#475569" }}>
              {FLOW_DATA_KIND_STYLE[kind].label}
            </span>
          </span>
        ))}
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <svg width="30" height="14" viewBox="0 0 30 14" aria-hidden>
            <path d="M 2 7 H 28" stroke={FLOW_ALERT_COLOR} strokeWidth="2" strokeDasharray="6 4" />
          </svg>
          <span className="text-[10px] font-medium" style={{ color: "#475569" }}>Exposure / attack path</span>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1" hidden={!open}>
        <span className="text-[9px] font-bold uppercase tracking-[0.12em] w-[86px] shrink-0" style={{ color: "#475569" }}>
          Evidence
        </span>
        <span className="inline-flex items-center gap-1">
          <EvidenceSwatch mode="live" />
          <span className="text-[10px] font-medium" style={{ color: "#475569" }}>filled · confirmed observation (see its age)</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <EvidenceSwatch mode="historical" />
          <span className="text-[10px] font-medium" style={{ color: "#475569" }}>hollow, slow · historical direction</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <EvidenceSwatch mode="configured" />
          <span className="text-[10px] font-medium" style={{ color: "#475569" }}>faint, still · configured only</span>
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="ml-auto text-[10px] font-semibold underline decoration-dotted"
          style={{ color: "#0E8B7A" }}
          aria-expanded={true}
        >
          Hide key
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Internet band (north)
// ---------------------------------------------------------------------------

const CLASS_ACCENT: Record<EgressDestinationGroup["cls"], string> = {
  aws_attributed: "#7E57C2",
  aws_classified: "#A78BFA",
  external: "#F59E0B",
  unknown: "#94A3B8",
}

/**
 * NORTH. The Internet is one place with two directions: who reaches us
 * (left) and what we reach (right). The IGW that joins them is not in this
 * band — it sits on the VPC's top border directly below.
 */
export function InternetBand({
  inbound,
  outbound,
  compact = false,
}: {
  /** Compact inbound chip (Network view) or the principals strip (identity lens). */
  inbound: ReactNode
  /** `ExternalDestinationsLane` in band layout, or null when nothing left. */
  outbound: ReactNode | null
  compact?: boolean
}) {
  return (
    <div
      className={`flex flex-wrap items-center w-full min-w-0 ${compact ? "gap-2 py-0.5" : "gap-3 py-1"}`}
      data-testid="topology-internet-band"
    >
      <div className="min-w-0" data-testid="topology-internet-band-inbound">
        {inbound}
      </div>
      {outbound ? <div className="min-w-0 flex-1">{outbound}</div> : null}
    </div>
  )
}

/** The inbound side of the Internet, in one chip: who can reach the VPC and
 *  through what. The IGW door on the VPC border below is the same gateway. */
export function InboundChip({ hasIgw, igwName }: { hasIgw: boolean; igwName: string | null }) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-md px-2 py-1"
      style={{ background: "#FFFFFF", border: "1px solid #C7D2FE" }}
      data-testid="topology-users-internet-strip"
      title={hasIgw ? `Clients and operators reach this VPC from the internet through ${igwName ?? "its IGW"}` : "No IGW attached"}
    >
      <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: "#4338CA" }}>
        ↓ Inbound
      </span>
      <span className="text-[11px] font-semibold" style={{ color: INK }} data-testid="topology-users-node">
        Users
      </span>
      <span className="text-[11px]" style={{ color: SLATE }} aria-hidden>→</span>
      <span className="text-[11px] font-semibold" style={{ color: INK }} data-testid="topology-internet-node">
        Internet
      </span>
      <span className="text-[11px]" style={{ color: SLATE }}>
        {hasIgw ? "→ IGW" : "· no IGW attached"}
      </span>
    </div>
  )
}

/** Outbound destinations in four honest classes, side by side. */
export function EgressClassGroups({
  groups,
  renderDestination,
  remainder,
}: {
  groups: readonly EgressDestinationGroup[]
  /** The existing destination chip — keeps its `data-flow-id` anchor. */
  renderDestination: (node: EgressDestinationGroup["nodes"][number]) => ReactNode
  /** The existing "Unknown destinations" block, drawn inside the unknown class. */
  remainder?: ReactNode
}) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(groups.length, 4))}, minmax(0, 1fr))` }}
      data-testid="topology-egress-class-groups"
    >
      {groups.map(g => (
        <div
          key={g.cls}
          className="rounded-md p-1.5 min-w-0 flex flex-col gap-1"
          style={{
            background: "#FFFFFF",
            borderLeft: "1px solid #E2E8F0",
            borderRight: "1px solid #E2E8F0",
            borderBottom: "1px solid #E2E8F0",
            borderTop: `3px solid ${CLASS_ACCENT[g.cls]}`,
          }}
          data-testid="topology-egress-class-group"
          data-egress-class={g.cls}
          title={EGRESS_CLASS_COPY[g.cls].hint}
        >
          <div className="flex items-baseline justify-between gap-1">
            <span className="text-[10px] font-bold truncate" style={{ color: INK }}>
              {EGRESS_CLASS_COPY[g.cls].title}
            </span>
            {g.sourceCount > 0 ? (
              <span className="text-[9px] shrink-0" style={{ color: SLATE }}>
                {g.sourceCount} workload{g.sourceCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            {g.nodes.map(n => (
              <div key={n.key}>{renderDestination(n)}</div>
            ))}
            {g.cls === "unknown" ? remainder : null}
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Doors on the VPC border
// ---------------------------------------------------------------------------

/**
 * The internet gateway, door-sized and ON the VPC's top border. Keeps the
 * `data-flow-id` (`__igw__` for the primary) that egress edges terminate on.
 */
export function IgwPerimeterDoor({
  igwId,
  igwName,
  selectionId,
  selected,
  onSelect,
  icon,
  caption,
  compact = false,
}: {
  igwId: string
  igwName: string
  selectionId: string
  selected: boolean
  onSelect: (id: string) => void
  icon: ReactNode
  caption: string | null
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(selectionId)}
      aria-pressed={selected}
      data-flow-id={selectionId}
      data-igw-id={igwId}
      data-testid="topology-igw-rail-chip"
      data-door="igw"
      title={`${igwName} (${igwId}) · Internet gateway — the VPC's only door to the internet`}
      className="flex items-center gap-2 rounded-lg pl-1 pr-3 py-1 text-left transition hover:brightness-95"
      style={{
        background: "#FFFFFF",
        border: `2px solid ${selected ? "#0E8B7A" : "#3B82F6"}`,
        boxShadow: selected ? "0 0 0 3px rgba(14,139,122,0.2)" : "0 1px 2px rgba(15,23,42,0.08)",
        minWidth: compact ? 170 : 200,
      }}
    >
      <span
        className="flex items-center justify-center rounded-md shrink-0"
        style={{ width: compact ? 30 : 36, height: compact ? 30 : 36, background: "#8C4FFF", color: "white" }}
        aria-hidden
      >
        {icon}
      </span>
      <span className="flex flex-col leading-tight min-w-0">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: DOOR_BLUE }}>
          Internet gateway
        </span>
        <span className="text-[10px] font-mono truncate" style={{ color: SLATE }}>
          {igwName}
        </span>
        {caption ? (
          <span className="text-[9px] truncate" style={{ color: SLATE }} data-testid="topology-boundary-caption">
            {caption}
          </span>
        ) : null}
      </span>
    </button>
  )
}

/** A VPC endpoint, door-sized, on the VPC's east border (facing the AWS rail). */
export function VpceDoor({
  vpceId,
  serviceLabel,
  endpointType,
  purpose,
  serviceName,
  selected,
  onSelect,
  icon,
  caption,
}: {
  vpceId: string
  serviceLabel: string
  endpointType: "Gateway" | "Interface"
  purpose: string
  serviceName: string | null | undefined
  selected: boolean
  onSelect: (id: string) => void
  icon: ReactNode
  caption: string | null
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(vpceId)}
      aria-pressed={selected}
      data-flow-id={vpceId}
      data-testid="topology-vpce-rail-chip"
      data-door="vpce"
      title={[serviceLabel, `${endpointType} endpoint · ${vpceId}`, serviceName ?? "", purpose].filter(Boolean).join("\n")}
      className="w-full flex items-center gap-2 rounded-lg pl-1 pr-2 py-1 text-left transition hover:brightness-95"
      style={{
        background: "#EFF6FF",
        border: `2px solid ${selected ? "#0E8B7A" : "#3B82F6"}`,
        boxShadow: selected ? "0 0 0 3px rgba(14,139,122,0.2)" : undefined,
      }}
    >
      <span className="flex items-center justify-center rounded-md shrink-0 bg-white" style={{ width: 32, height: 32 }} aria-hidden>
        {icon}
      </span>
      <span className="flex flex-col leading-tight min-w-0">
        <span className="flex items-center gap-1">
          <span className="text-[11px] font-bold truncate" style={{ color: DOOR_BLUE }}>
            {serviceLabel}
          </span>
          <span
            className="px-1 rounded-sm text-[8px] font-bold shrink-0"
            style={{ background: endpointType === "Gateway" ? DOOR_BLUE : "#3B82F6", color: "white" }}
          >
            {endpointType === "Gateway" ? "GW" : "IF"}
          </span>
        </span>
        {caption ? (
          <span className="text-[9px] truncate" style={{ color: SLATE }} data-testid="topology-boundary-caption">
            {caption}
          </span>
        ) : null}
      </span>
    </button>
  )
}

const SERVICE_LABEL: Record<MissingGatewayEndpoint["service"], string> = {
  s3: "Amazon S3",
  dynamodb: "Amazon DynamoDB",
}

/**
 * A door that is NOT there. Drawn because its absence is the finding: this
 * VPC's S3 / DynamoDB traffic takes the NAT/IGW path. Structural (route
 * table) evidence, named as such; never a claim about individual packets.
 */
export function MissingEndpointDoor({ finding }: { finding: MissingGatewayEndpoint }) {
  const n = finding.sourceIds.length
  return (
    <div
      className="w-full rounded-lg px-2 py-1.5"
      style={{ background: AMBER_BG, border: `2px dashed ${AMBER_BORDER}` }}
      data-testid="topology-missing-endpoint-door"
      data-service={finding.service}
      data-sources={finding.sourceIds.join(",")}
      title={[
        `No ${SERVICE_LABEL[finding.service]} gateway endpoint in this VPC.`,
        `${n} workload${n === 1 ? "" : "s"} reach ${SERVICE_LABEL[finding.service]} and their route table sends it via ${finding.via.join(" / ")}.`,
        "Configured routing from the payload's structural_route — not an observed per-packet path.",
        finding.sourceIds.join(", "),
      ].join("\n")}
    >
      <div className="flex items-center gap-1">
        <AlertTriangle size={12} color={AMBER_TEXT} aria-hidden />
        <span className="text-[11px] font-bold" style={{ color: AMBER_TEXT }}>
          No {finding.service === "s3" ? "S3" : "DynamoDB"} endpoint
        </span>
      </div>
      <div className="text-[9px] leading-snug" style={{ color: AMBER_TEXT }}>
        {n} workload{n === 1 ? "" : "s"} reach it via {finding.via.join("/")}
      </div>
    </div>
  )
}

/** Inside a public subnet cell of an AZ that has no NAT gateway. */
export function NatGapMarker({
  az,
  crossAz,
}: {
  az: string
  /** Routes from THIS AZ's workloads to a NAT elsewhere (configured). */
  crossAz: readonly CrossAzNatRoute[]
}) {
  const natAzs = [...new Set(crossAz.map(r => r.natAz))]
  return (
    <div
      className="rounded-md px-1.5 py-1 mb-1 shrink-0"
      style={{ background: AMBER_BG, border: `1.5px dashed ${AMBER_BORDER}` }}
      data-testid="topology-nat-gap"
      data-az={az}
      data-cross-az-count={crossAz.length}
      title={[
        `No NAT gateway has its subnet in ${az}.`,
        crossAz.length > 0
          ? `${crossAz.length} workload route(s) in ${az} send internet egress to a NAT in ${natAzs.join(", ")} — that AZ is a single point of failure for ${az}, and the traffic pays cross-AZ transfer.`
          : "No route in the payload names a NAT for this AZ's workloads.",
        "Route-table (configured) facts, not observed packets.",
      ].join("\n")}
    >
      <div className="text-[10px] font-bold" style={{ color: AMBER_TEXT }}>
        No NAT in this AZ
      </div>
      {crossAz.length > 0 ? (
        <div className="text-[9px] leading-snug" style={{ color: AMBER_TEXT }}>
          egress depends on {natAzs.join(", ")}
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Logical-group hulls
// ---------------------------------------------------------------------------

interface HullBox {
  spec: LogicalGroupHullSpec
  l: number
  t: number
  w: number
  h: number
}

const HULL_COLOR: Record<LogicalGroupHullSpec["kind"], string> = {
  asg: "#7E57C2",
  target_group: "#0E8B7A",
  cluster: "#2E73B8",
  other: "#64748B",
}

/**
 * Draws each logical group as a dashed outline around the chips of its
 * members, wherever the grid placed them — across AZ columns when the group
 * spans zones. A group whose members sit in ONE zone while the grid shows
 * more is outlined in amber: that is the resilience finding.
 *
 * Measured like FlowOverlay: live DOM rects, divided by the host zoom.
 * Groups with no member on the canvas draw nothing (the collapsed band below
 * still lists them — a group is never silently dropped).
 */
export function LogicalGroupHulls({
  specs,
  containerRef,
  scale = 1,
  remeasureKey,
  selectedNodeId,
  onSelect,
}: {
  specs: readonly LogicalGroupHullSpec[]
  containerRef: RefObject<HTMLDivElement | null>
  scale?: number
  /** Changes whenever chips may have moved (density, filters, zoom). */
  remeasureKey?: string
  selectedNodeId: string | null
  onSelect: (id: string) => void
}) {
  const [boxes, setBoxes] = useState<HullBox[]>([])

  useEffect(() => {
    const container = containerRef.current
    if (!container || specs.length === 0) {
      setBoxes([])
      return
    }
    let raf = 0
    const measure = () => {
      const c = container.getBoundingClientRect()
      if (c.width === 0) return
      const out: HullBox[] = []
      specs.forEach((spec, idx) => {
        const rects: DOMRect[] = []
        for (const id of spec.memberIds) {
          const exact = Array.from(container.querySelectorAll<HTMLElement>(`[data-flow-id="${CSS.escape(id)}"]`))
          const tiles = Array.from(container.querySelectorAll<HTMLElement>("[data-flow-ids]")).filter(t =>
            (t.getAttribute("data-flow-ids") ?? "").split("|").includes(id),
          )
          for (const el of [...exact, ...tiles]) {
            // Only chips on the grid: the band's own member buttons and the
            // hull labels are not placements.
            if (el.closest('[data-testid="topology-logical-group-band"], [data-testid="topology-logical-group-hulls"]')) continue
            const r = el.getBoundingClientRect()
            if (r.width > 0 && r.height > 0) rects.push(r)
          }
        }
        if (rects.length === 0) return
        // Nested groups (a TG and the ASG that feeds it) share members; step
        // the padding so both outlines stay visible.
        const pad = 5 + (idx % 3) * 4
        const l = (Math.min(...rects.map(r => r.left)) - c.left) / scale - pad
        const t = (Math.min(...rects.map(r => r.top)) - c.top) / scale - pad - 14
        const r = (Math.max(...rects.map(x => x.right)) - c.left) / scale + pad
        const b = (Math.max(...rects.map(x => x.bottom)) - c.top) / scale + pad
        out.push({ spec, l, t, w: r - l, h: b - t })
      })
      setBoxes(out)
    }
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }
    // Same retry-after-paint reasoning as FlowOverlay: chips can commit late.
    schedule()
    const retry = window.setTimeout(schedule, 250)
    const ro = new ResizeObserver(schedule)
    ro.observe(container)
    window.addEventListener("resize", schedule)
    container.addEventListener("scroll", schedule, { capture: true, passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(retry)
      ro.disconnect()
      window.removeEventListener("resize", schedule)
      container.removeEventListener("scroll", schedule, { capture: true } as EventListenerOptions)
    }
  }, [specs, containerRef, scale, remeasureKey])

  if (boxes.length === 0) return null
  return (
    <div className="absolute inset-0 pointer-events-none z-[35]" data-testid="topology-logical-group-hulls" aria-hidden={false}>
      {boxes.map(({ spec, l, t, w, h }) => {
        const warn = spec.singleAz
        const color = warn ? AMBER_BORDER : HULL_COLOR[spec.kind]
        const selected = selectedNodeId === spec.groupId
        return (
          <div
            key={spec.groupId}
            className="absolute rounded-lg"
            style={{
              left: l,
              top: t,
              width: w,
              height: h,
              border: `${selected ? 2.5 : 1.5}px dashed ${color}`,
              background: selected ? "rgba(126,87,194,0.05)" : "transparent",
              // Quiet by default: an outline that is not a finding and not the
              // selection should not compete with the traffic lines.
              opacity: warn || selected ? 1 : 0.45,
            }}
            data-testid="topology-logical-group-hull"
            data-group-id={spec.groupId}
            data-single-az={warn ? "true" : "false"}
            data-azs={spec.azs.join("|")}
          >
            <button
              type="button"
              onClick={() => onSelect(spec.groupId)}
              className={`pointer-events-auto absolute -bottom-2 right-2 px-1.5 rounded text-[9px] font-semibold whitespace-nowrap transition-opacity ${
                warn || selected ? "opacity-100" : "opacity-0 hover:opacity-100 focus:opacity-100"
              }`}
              style={{ background: "#FFFFFF", color: warn ? AMBER_TEXT : color, border: `1px solid ${color}` }}
              title={`${spec.label} (${spec.groupId}) — ${spec.memberIds.length} member(s)${
                spec.azs.length ? ` in ${spec.azs.join(", ")}` : ""
              }${warn ? ". All members in one AZ: losing it takes the whole group." : ""}`}
            >
              {logicalGroupHullLabel(spec)}
            </button>
          </div>
        )
      })}
    </div>
  )
}
