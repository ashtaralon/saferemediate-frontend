"use client"

/**
 * Topology v0.2 — AWS canonical-frame canvas (light theme port).
 *
 * Renders the canonical AWS architecture diagram as scaffold + places
 * Neo4j-confirmed workloads into the correct (AZ × tier) cells. Always
 * uses the same Cloud → Region → VPC → AZ × (Web / App / Data) structure
 * the operator already knows.
 *
 * Phase A (this file):
 *   - Light theme matching the mockup at design/topology-v0.2-estate.html
 *     palette (--cy-navy headline, --tier-web/app/data pastel rows,
 *     subnet-public mint, subnet-private sky, AWS-frame slate borders).
 *   - AZ collapse: only renders AZs that carry ≥1 alon-prod subnet
 *     in the system's primary VPC (drops empty demo / cross-VPC AZs).
 *   - Bigger workload chips + bigger subnet cells.
 *   - Black tier sidebars labeled WEB TIER / APPLICATION TIER / DATABASE
 *     TIER for orientation.
 *   - Encoding legend at the bottom (carmine halo = Worst etc).
 *
 * Phase B (follow-up) will add:
 *   - SG containers inside subnets (needs SG metadata in vpc_topology).
 *   - IAM control-plane strip at the bottom (needs IAMRole rollup).
 *   - Animated SVG flow lines (needs ACTUAL_TRAFFIC edges).
 *
 * Per CLAUDE.md rule #1 the scaffold is structural — service icons only
 * appear when Neo4j confirms the resource. Empty cells stay drawn with
 * honest copy.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  type IamRoleRollup,
  type ScoreTier,
  type SecurityGroupMeta,
  SIGNAL_LABEL,
  type SubnetMeta,
  type SubnetTier,
  type TopologyNode,
  type TrafficEdge,
  type TrafficEdgeClass,
  type VpcTopology,
} from "./types"

interface Props {
  vpcTopology: VpcTopology
  nodes: TopologyNode[]
  trafficEdges?: TrafficEdge[]
  selectedNodeId: string | null
  onSelect: (id: string) => void
}

const EDGE_SERVICE_TYPES = new Set([
  "S3", "KMSKey", "DynamoDB", "DynamoDBTable", "Secret", "SecretsManagerSecret",
])
const SERVERLESS_TYPES = new Set(["Lambda", "LambdaFunction"])

// Mockup palette — design/topology-v0.2-estate.html CSS variables.
const PAL = {
  navy: "#0D1B2A",
  navy2: "#142536",
  teal: "#00C2A8",
  carmine: "#E04545",
  amber: "#F5A623",
  slate: "#5A6B7A",
  ink: "#1A2330",
  bg: "#F4F6F8",
  cardBg: "#FFFFFF",
  awsFrame: "#232F3E",
  awsOrange: "#FF9900",
  awsBlue: "#2E73B8",
  tierWeb: "#E8F5E9",
  tierApp: "#E3F2FD",
  tierDb: "#EDE7F6",
  subnetPublic: "#C8E6C9",
  subnetPrivate: "#BBDEFB",
} as const

const TIER_LABEL: Record<SubnetTier, string> = {
  web: "Public subnet (web tier)",
  app: "Private subnet (app tier)",
  data: "Private subnet (data tier)",
  unknown: "Unclassified subnet",
}

const TIER_SIDEBAR_LABEL: Record<Exclude<SubnetTier, "unknown">, string> = {
  web: "WEB TIER",
  app: "APPLICATION TIER",
  data: "DATABASE TIER",
}

// Tier row backgrounds — the lightest tint, used behind the AZ × tier grid.
const TIER_BG: Record<SubnetTier, string> = {
  web: PAL.tierWeb,    // mint #E8F5E9
  app: PAL.tierApp,    // sky  #E3F2FD
  data: PAL.tierDb,    // lavender #EDE7F6
  unknown: "#ECEFF1",
}

// Subnet cell backgrounds — a slightly deeper version of the row tint so the
// subnet card visually nests inside the tier row without breaking the color
// scheme. Matches the mockup's behavior where subnets share the row hue.
const SUBNET_BG: Record<SubnetTier, string> = {
  web: "#DCEFDC",   // a touch deeper than #E8F5E9
  app: "#D2E5F8",   // a touch deeper than #E3F2FD
  data: "#E0D6F0",  // a touch deeper than #EDE7F6
  unknown: "#E0E5E9",
}

// Subnet borders — yet deeper, gives the card a visible edge in the row.
const SUBNET_BORDER: Record<SubnetTier, string> = {
  web: "#A5D6A7",
  app: "#90CAF9",
  data: "#B39DDB",
  unknown: "#B0BEC5",
}

// Subnet labels — deeper still (used for the bold "Public subnet (web tier)"
// text inside each cell, plus the CIDR / subnet name).
const SUBNET_LABEL_FG: Record<SubnetTier, string> = {
  web: "#1E8E3E",   // deep green
  app: "#1565C0",   // deep blue
  data: "#4527A0",  // deep purple
  unknown: "#37474F",
}

function tierBgChip(tier: ScoreTier): string {
  switch (tier) {
    case "WORST": return "background:#E04545;color:white"
    case "HIGH":   return "background:#F36A6A;color:white"
    case "ELEVATED": return "background:#F5A623;color:#3D2A00"
    case "QUIET":  return "background:#10B981;color:white"
  }
}

function severityRing(node: TopologyNode): { ring: string; halo: string } {
  if (node.stale)        return { ring: "#9CA3AF", halo: "0 0 0 3px rgba(156,163,175,0.15)" }
  if (!node.score)       return { ring: "#CBD5E1", halo: "none" }
  switch (node.score.tier) {
    case "WORST":    return { ring: PAL.carmine, halo: "0 0 0 4px rgba(224,69,69,0.18)" }
    case "HIGH":     return { ring: PAL.carmine, halo: "0 0 0 3px rgba(224,69,69,0.12)" }
    case "ELEVATED": return { ring: PAL.amber, halo: "0 0 0 3px rgba(245,166,35,0.12)" }
    case "QUIET":    return { ring: "#10B981", halo: "0 0 0 2px rgba(16,185,129,0.10)" }
  }
}

function nodeIcon(type: string | null): { symbol: string; bg: string; fg: string } {
  switch (type) {
    case "EC2":         return { symbol: "EC2", bg: "#FF9900", fg: "#1A1A1A" }
    case "Lambda":
    case "LambdaFunction":
      return { symbol: "λ", bg: "#FF9900", fg: "#1A1A1A" }
    case "RDS":
    case "RDSInstance":
      return { symbol: "RDS", bg: "#2E73B8", fg: "white" }
    case "DynamoDB":
    case "DynamoDBTable":
      return { symbol: "DDB", bg: "#2E73B8", fg: "white" }
    case "S3":
    case "S3Bucket":
      return { symbol: "S3", bg: "#1E8E3E", fg: "white" }
    case "KMSKey":      return { symbol: "KMS", bg: "#DD344C", fg: "white" }
    case "Secret":
    case "SecretsManagerSecret":
      return { symbol: "🔐", bg: "#DD344C", fg: "white" }
    case "LoadBalancer":
    case "ALB":
    case "ApplicationLoadBalancer":
      return { symbol: "ALB", bg: "#7E57C2", fg: "white" }
    default:
      return { symbol: "?", bg: "#5A6B7A", fg: "white" }
  }
}

function WorkloadChip({
  node, selected, onClick,
}: { node: TopologyNode; selected: boolean; onClick: () => void }) {
  const stale = !!node.stale
  const { ring, halo } = severityRing(node)
  const ic = nodeIcon(node.type)
  return (
    <button
      type="button"
      onClick={onClick}
      title={node.name}
      data-flow-id={node.id}
      className="relative flex items-center gap-2.5 rounded-md px-3 py-2 text-left transition-shadow min-w-0 max-w-[260px] hover:shadow-md"
      style={{
        background: PAL.cardBg,
        border: `1.5px solid ${ring}`,
        boxShadow: selected
          ? `0 0 0 3px ${PAL.teal}, ${halo}`
          : halo === "none" ? undefined : halo,
        opacity: stale ? 0.62 : 1,
      }}
    >
      <span
        className="flex items-center justify-center rounded-md shrink-0"
        style={{
          background: ic.bg,
          color: ic.fg,
          width: "32px",
          height: "26px",
          fontSize: "10px",
          fontWeight: 700,
          letterSpacing: "0.04em",
        }}
      >
        {ic.symbol}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {node.is_jewel && (
            <span style={{ color: PAL.amber, fontSize: "11px" }} title="Crown jewel">
              ♛
            </span>
          )}
          <span className="text-[12px] font-semibold truncate" style={{ color: PAL.ink }}>
            {node.name}
          </span>
        </div>
        <div className="text-[10px] font-mono mt-0.5 truncate" style={{ color: PAL.slate }}>
          {node.type ?? "?"}{node.id && node.id !== node.name ? ` · ${node.id.slice(0, 24)}` : ""}
        </div>
      </div>
      {node.score && (
        <span
          className="text-[11px] font-bold px-1.5 py-0.5 rounded shrink-0"
          style={{ ...Object.fromEntries(tierBgChip(node.score.tier).split(';').map(p => p.split(':') as [string, string])) }}
        >
          {node.score.value}
        </span>
      )}
      {stale && (
        <span className="text-[9px] font-bold shrink-0" style={{ color: PAL.slate }}>STALE</span>
      )}
    </button>
  )
}

function SubnetCell({
  tier, az, subnetsHere, workloadsHere, sgIndex, selectedNodeId, onSelect,
}: {
  tier: SubnetTier
  az: string
  subnetsHere: SubnetMeta[]
  workloadsHere: TopologyNode[]
  sgIndex: Map<string, SecurityGroupMeta>
  selectedNodeId: string | null
  onSelect: (id: string) => void
}) {
  const empty = subnetsHere.length === 0
  const labelFg = SUBNET_LABEL_FG[tier]
  return (
    <div
      className="rounded-md p-3"
      style={{
        background: empty ? "transparent" : SUBNET_BG[tier],
        border: empty ? `1px dashed ${PAL.slate}80` : `1.5px solid ${SUBNET_BORDER[tier]}`,
        minHeight: "150px",
        opacity: empty ? 0.55 : 1,
      }}
    >
      <div className="flex items-baseline justify-between mb-1.5">
        <div
          className="text-[11px] uppercase tracking-[0.12em] font-bold"
          style={{ color: labelFg }}
        >
          {TIER_LABEL[tier]}
        </div>
        <div className="text-[10px] font-mono font-semibold" style={{ color: labelFg, opacity: 0.85 }}>
          {subnetsHere.length === 0 ? "—" : subnetsHere.map(s => s.cidr ?? s.name).join(" · ")}
        </div>
      </div>

      {empty ? (
        <div className="text-[11px] italic" style={{ color: PAL.slate }}>
          no {tier} subnet observed in {az}
        </div>
      ) : (
        <>
          <div className="space-y-0.5 mb-2">
            {subnetsHere.map(s => (
              <div
                key={s.id}
                className="text-[10px] font-mono font-semibold truncate"
                style={{ color: labelFg, opacity: 0.85 }}
              >
                {s.name}
              </div>
            ))}
          </div>
          {workloadsHere.length === 0 ? (
            <div className="text-[11px] italic" style={{ color: PAL.slate }}>
              no workloads here
            </div>
          ) : (
            // Group workloads by their security_group_ids. Workloads in
            // the same SG render inside a single orange-dashed container
            // labeled with the SG name. Workloads with no SG attached
            // get their own "no SG attached" group (honest empty).
            (() => {
              const groups = new Map<string, TopologyNode[]>()
              for (const n of workloadsHere) {
                const sgs = n.security_group_ids ?? []
                if (sgs.length === 0) {
                  const list = groups.get("__no_sg__") ?? []
                  list.push(n)
                  groups.set("__no_sg__", list)
                  continue
                }
                for (const sgId of sgs) {
                  const list = groups.get(sgId) ?? []
                  list.push(n)
                  groups.set(sgId, list)
                }
              }
              const entries = [...groups.entries()]
              return (
                <div className="space-y-2">
                  {entries.map(([sgId, group]) => {
                    if (sgId === "__no_sg__") {
                      return (
                        <div
                          key={sgId}
                          className="rounded p-2"
                          style={{
                            background: "transparent",
                            border: `1px dashed ${PAL.slate}80`,
                          }}
                        >
                          <div className="text-[9px] uppercase tracking-[0.10em] italic mb-1.5" style={{ color: PAL.slate }}>
                            no SG attached
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {group.map(n => (
                              <WorkloadChip
                                key={n.id}
                                node={n}
                                selected={n.id === selectedNodeId}
                                onClick={() => onSelect(n.id)}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    }
                    const sg = sgIndex.get(sgId)
                    const sgName = sg?.name ?? sgId
                    const isPublic = sg?.has_public_ingress
                    return (
                      <div
                        key={sgId}
                        className="rounded p-2"
                        style={{
                          background: "transparent",
                          border: `1.5px dashed ${isPublic ? PAL.carmine : "#FF9900"}`,
                        }}
                      >
                        <div
                          className="text-[10px] uppercase tracking-[0.10em] font-bold mb-1.5"
                          style={{ color: isPublic ? PAL.carmine : "#C77400" }}
                          title={sg?.description ?? sgName}
                        >
                          🛡 {sgName}{isPublic ? " · public ingress" : ""}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {group.map(n => (
                            <WorkloadChip
                              key={n.id}
                              node={n}
                              selected={n.id === selectedNodeId}
                              onClick={() => onSelect(n.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()
          )}
        </>
      )}
    </div>
  )
}

function IamRoleCard({ role, allWorkloads }: { role: IamRoleRollup; allWorkloads: TopologyNode[] }) {
  const isClean = role.allowed_actions === 0 || role.gap_percentage === 0
  const isCritical = role.gap_percentage >= 80
  const accent = isClean ? "#10B981" : isCritical ? PAL.carmine : PAL.amber
  const remediated = role.last_remediated_at
    ? new Date(role.last_remediated_at).toISOString().slice(0, 10)
    : null
  const consumers = allWorkloads.filter(w => role.workload_ids.includes(w.id))
  const isShared = role.workload_ids.length > 1
  return (
    <div
      className="rounded-md p-3 min-w-[200px] max-w-[260px] shrink-0"
      style={{ background: "white", border: `1.5px solid ${accent}`, borderTopWidth: "3px" }}
    >
      <div className="text-[12px] font-semibold truncate" style={{ color: PAL.ink }} title={role.name}>
        {role.name}
      </div>
      <div className="mt-1.5 mb-1.5">
        {role.allowed_actions === 0 ? (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded inline-block"
            style={{ background: "#D1FAE5", color: "#065F46" }}
          >
            0/0 actions
          </span>
        ) : (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded inline-block"
            style={{
              background: isCritical ? "#FECACA" : "#FEF3C7",
              color: isCritical ? "#7F1D1D" : "#92400E",
            }}
          >
            {role.unused_actions}/{role.allowed_actions} unused
          </span>
        )}
      </div>
      <div className="text-[10px] leading-snug" style={{ color: PAL.slate }}>
        {role.allowed_actions === 0 ? (
          <>
            {remediated ? `Remediated ${remediated} · ` : ""}
            least-privilege achieved
          </>
        ) : (
          <>
            {Math.round(role.gap_percentage)}% gap
            {remediated ? ` · remediation ${remediated}` : " · never remediated"}
          </>
        )}
      </div>
      {consumers.length > 0 && (
        <div className="mt-2 pt-2 border-t" style={{ borderColor: "#E5E7EB" }}>
          {consumers.slice(0, 3).map(c => (
            <div key={c.id} className="text-[10px] truncate" style={{ color: PAL.ink }}>
              {c.name}
            </div>
          ))}
          {consumers.length > 3 && (
            <div className="text-[10px] italic" style={{ color: PAL.slate }}>
              + {consumers.length - 3} more
            </div>
          )}
          <div className="text-[9px] uppercase tracking-wider mt-1" style={{ color: PAL.slate }}>
            {role.attachment_modes.includes("instance_profile") ? "via instance profile" : ""}
            {role.attachment_modes.includes("instance_profile") && role.attachment_modes.includes("direct") ? " · " : ""}
            {role.attachment_modes.includes("direct") ? "USES_ROLE" : ""}
            {isShared ? " · shared" : ""}
          </div>
        </div>
      )}
    </div>
  )
}

function IamControlPlane({
  roles, allWorkloads,
}: { roles: IamRoleRollup[]; allWorkloads: TopologyNode[] }) {
  if (roles.length === 0) return null
  const criticalCount = roles.filter(r => r.gap_percentage >= 80 && r.allowed_actions > 0).length
  const cleanCount = roles.filter(r => r.allowed_actions === 0 || r.gap_percentage === 0).length
  return (
    <div
      className="rounded-md p-4 relative"
      style={{ background: PAL.cardBg, border: `2px solid #DD344C`, borderLeftWidth: "8px" }}
    >
      <div
        className="absolute -top-2.5 left-6 px-2 text-[10px] uppercase tracking-[0.14em] font-bold"
        style={{ background: PAL.cardBg, color: "#DD344C" }}
      >
        IAM · Control plane
      </div>
      <div className="flex items-baseline justify-between mb-3 mt-1">
        <div className="text-[12px] font-semibold" style={{ color: PAL.ink }}>
          Roles attached to this VPC
        </div>
        <div className="text-[10px]" style={{ color: PAL.slate }}>
          derived from instance-profile + USES_ROLE edges ·{" "}
          {roles.length} role{roles.length === 1 ? "" : "s"}
          {criticalCount > 0 ? ` · ${criticalCount} critical gap${criticalCount === 1 ? "" : "s"}` : ""}
          {cleanCount > 0 ? ` · ${cleanCount} clean` : ""}
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {roles.map(r => (
          <IamRoleCard key={r.name} role={r} allWorkloads={allWorkloads} />
        ))}
      </div>
    </div>
  )
}

function TrafficFlowBand({
  edges, nodes,
}: { edges: TrafficEdge[]; nodes: TopologyNode[] }) {
  const nodeById = useMemo(() => {
    const m = new Map<string, TopologyNode>()
    for (const n of nodes) m.set(n.id, n)
    return m
  }, [nodes])
  return (
    <div
      className="rounded-md p-4 relative"
      style={{ background: PAL.cardBg, border: `1px solid #E2E8F0` }}
    >
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[10px] uppercase tracking-[0.14em] font-bold" style={{ color: PAL.ink }}>
          Observed traffic — animated arrows above
        </div>
        <div className="text-[10px]" style={{ color: PAL.slate }}>
          {edges.length} flow{edges.length === 1 ? "" : "s"} ·{" "}
          {edges.filter(e => (e.edge_class ?? "internal") === "internal").length} internal ·{" "}
          {edges.filter(e => e.edge_class === "edge_service").length} edge-service ·{" "}
          {edges.filter(e => e.edge_class === "egress").length} egress
        </div>
      </div>
      {edges.length === 0 ? (
        <div className="text-[11px] italic" style={{ color: PAL.slate }}>
          No observed traffic flows from any rendered workload.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {edges.slice(0, 12).map((e, i) => {
            const src = nodeById.get(e.source_id)
            const dst = e.target_id === "__igw__"
              ? { name: "Internet (via IGW)" }
              : nodeById.get(e.target_id) ?? { name: e.target_id }
            const cls = e.edge_class ?? "internal"
            const classChip = cls === "egress"
              ? { bg: "#FEF3C7", fg: "#7B3F00", txt: e.external_destinations ? `egress · ${e.external_destinations} dest` : "egress" }
              : cls === "edge_service"
              ? { bg: "#EDE7F6", fg: "#4527A0", txt: e.protocol ?? "edge" }
              : { bg: "#E0F2FE", fg: "#075985", txt: e.port ? `${e.port}/${e.protocol ?? "TCP"}` : (e.protocol ?? "TCP") }
            const arrowColor = cls === "egress" ? "#FF9900" : cls === "edge_service" ? "#7E57C2" : PAL.teal
            return (
              <div
                key={`${e.source_id}-${e.target_id}-${e.port}-${i}`}
                className="flex items-center gap-2 text-[11px]"
                style={{ color: PAL.ink }}
              >
                <span className="font-semibold truncate max-w-[200px]">
                  {src?.name ?? e.source_id}
                </span>
                <span style={{ color: arrowColor }}>→</span>
                <span className="font-semibold truncate max-w-[200px]">
                  {dst.name}
                </span>
                <span
                  className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{ background: classChip.bg, color: classChip.fg }}
                >
                  {classChip.txt}
                </span>
              </div>
            )
          })}
          {edges.length > 12 && (
            <div className="text-[10px] italic mt-1" style={{ color: PAL.slate }}>
              + {edges.length - 12} more flows
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EncodingLegend() {
  return (
    <div
      className="rounded-md px-4 py-3 text-[11px]"
      style={{
        background: PAL.cardBg,
        border: `1px solid #E2E8F0`,
        color: PAL.ink,
      }}
    >
      <div
        className="font-semibold uppercase tracking-[0.14em] mb-2 text-[10px]"
        style={{ color: PAL.slate }}
      >
        Encoding
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full" style={{ width: 12, height: 12, background: PAL.carmine, boxShadow: `0 0 0 3px rgba(224,69,69,0.20)` }} />
          <span>Worst (carmine halo + pulse)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full" style={{ width: 12, height: 12, background: "transparent", border: `2px solid ${PAL.amber}` }} />
          <span>High / elevated (ring only)</span>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: PAL.amber, fontSize: "14px" }}>♛</span>
          <span>Crown-jewel halo</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full" style={{ width: 12, height: 12, background: "transparent", border: `2px solid ${PAL.teal}` }} />
          <span>Clean · remediated (teal ring)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full" style={{ width: 12, height: 12, background: "#9CA3AF", opacity: 0.6 }} />
          <span>Stale (dimmed)</span>
        </div>
      </div>
    </div>
  )
}

// ─── Animated SVG flow overlay ──────────────────────────────────────
//
// Draws arrows from each workload chip to its observed destinations
// (other workload chips, the IGW perimeter for egress, edge-service
// chips on the right rail). Lines are absolutely positioned over the
// canvas container with `pointer-events:none` so they never block
// chip clicks. Path coordinates are recomputed on every render and on
// window resize so the lines stay anchored when chips shift.

interface FlowPath {
  d: string
  cls: TrafficEdgeClass
  protocol: string | null
  port: number | null
  externalDestinations: number | null
  badgeX: number
  badgeY: number
  badgeLabel: string
}

function buildPath(
  src: DOMRect,
  dst: DOMRect,
  containerRect: DOMRect,
): string {
  const sx = src.left + src.width / 2 - containerRect.left
  const sy = src.top + src.height / 2 - containerRect.top
  const dx = dst.left + dst.width / 2 - containerRect.left
  const dy = dst.top + dst.height / 2 - containerRect.top
  // Smooth cubic bezier — pull the control points horizontally so the
  // arrow looks like a polite "around the chrome" curve instead of a
  // straight line that overlaps frame borders.
  const midX = (sx + dx) / 2
  const c1x = sx + (midX - sx) * 0.65
  const c2x = dx - (dx - midX) * 0.65
  return `M ${sx} ${sy} C ${c1x} ${sy}, ${c2x} ${dy}, ${dx} ${dy}`
}

function FlowOverlay({
  edges, containerRef,
}: {
  edges: TrafficEdge[]
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const [paths, setPaths] = useState<FlowPath[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const recompute = () => {
      const containerRect = container.getBoundingClientRect()
      setSize({ w: containerRect.width, h: containerRect.height })
      const next: FlowPath[] = []
      for (const e of edges) {
        const srcEl = container.querySelector<HTMLElement>(
          `[data-flow-id="${CSS.escape(e.source_id)}"]`,
        )
        const dstEl = container.querySelector<HTMLElement>(
          `[data-flow-id="${CSS.escape(e.target_id)}"]`,
        )
        if (!srcEl || !dstEl) continue
        const srcRect = srcEl.getBoundingClientRect()
        const dstRect = dstEl.getBoundingClientRect()
        const d = buildPath(srcRect, dstRect, containerRect)
        const sx = srcRect.left + srcRect.width / 2 - containerRect.left
        const sy = srcRect.top + srcRect.height / 2 - containerRect.top
        const dx = dstRect.left + dstRect.width / 2 - containerRect.left
        const dy = dstRect.top + dstRect.height / 2 - containerRect.top
        const cls = e.edge_class ?? "internal"
        let badgeLabel = ""
        if (cls === "egress") {
          badgeLabel = e.external_destinations
            ? `egress · ${e.external_destinations} dest`
            : "egress"
        } else if (cls === "edge_service") {
          badgeLabel = e.protocol ?? "edge"
        } else {
          badgeLabel = e.port ? `${e.port}/${e.protocol ?? "TCP"}` : (e.protocol ?? "TCP")
        }
        next.push({
          d,
          cls,
          protocol: e.protocol,
          port: e.port,
          externalDestinations: e.external_destinations ?? null,
          badgeX: (sx + dx) / 2,
          badgeY: (sy + dy) / 2 - 6,
          badgeLabel,
        })
      }
      setPaths(next)
    }
    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(container)
    window.addEventListener("resize", recompute)
    // Re-measure once more after the next animation frame to catch any
    // post-layout shifts (font load, image load).
    const raf = window.requestAnimationFrame(recompute)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", recompute)
      window.cancelAnimationFrame(raf)
    }
  }, [edges, containerRef])

  const colorByCls: Record<TrafficEdgeClass, string> = {
    internal: "#0E8B7A",      // teal — intra-canvas chip↔chip
    edge_service: "#7E57C2",  // purple — to right-rail S3/KMS/DDB
    egress: "#FF9900",        // AWS orange — to IGW perimeter
  }

  // Always render the SVG (even empty) so the React tree mounts on the
  // first paint and the layout effect can populate paths/size on the
  // next tick. Returning null here on first render caused the deployed
  // build to never re-attach the SVG after state arrived (PR #220 prod
  // regression — manual SVG injection works, the React mount does not).
  const hasSize = size.w > 0 && size.h > 0

  return (
    <svg
      aria-hidden="true"
      width={hasSize ? size.w : "100%"}
      height={hasSize ? size.h : "100%"}
      viewBox={hasSize ? `0 0 ${size.w} ${size.h}` : undefined}
      className="absolute inset-0"
      style={{ pointerEvents: "none", overflow: "visible" }}
    >
      <defs>
        {(["internal", "edge_service", "egress"] as TrafficEdgeClass[]).map(c => (
          <marker
            key={c}
            id={`flow-arrow-${c}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={colorByCls[c]} />
          </marker>
        ))}
      </defs>
      {paths.map((p, i) => (
        <g key={i}>
          <path
            d={p.d}
            fill="none"
            stroke={colorByCls[p.cls]}
            strokeWidth="1.75"
            strokeOpacity="0.85"
            strokeDasharray="6 4"
            markerEnd={`url(#flow-arrow-${p.cls})`}
          >
            {/* Animated dashes — gives the "traffic flowing" look */}
            <animate
              attributeName="stroke-dashoffset"
              from="20"
              to="0"
              dur="1.6s"
              repeatCount="indefinite"
            />
          </path>
          {/* Badge with port/proto or egress dest count */}
          <g transform={`translate(${p.badgeX}, ${p.badgeY})`}>
            <rect
              x={-Math.max(p.badgeLabel.length * 3.4, 12)}
              y={-8}
              width={Math.max(p.badgeLabel.length * 6.8, 24)}
              height={16}
              rx={4}
              fill="white"
              stroke={colorByCls[p.cls]}
              strokeWidth="1"
              opacity="0.96"
            />
            <text
              x={0}
              y={4}
              textAnchor="middle"
              fontSize="10"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fill={colorByCls[p.cls]}
              fontWeight="600"
            >
              {p.badgeLabel}
            </text>
          </g>
        </g>
      ))}
    </svg>
  )
}

export function AwsFrame({ vpcTopology, nodes, trafficEdges, selectedNodeId, onSelect }: Props) {
  // SG lookup for the SubnetCell groupings.
  const sgIndex = useMemo(() => {
    const m = new Map<string, SecurityGroupMeta>()
    for (const sg of vpcTopology.security_groups ?? []) {
      m.set(sg.id, sg)
    }
    return m
  }, [vpcTopology.security_groups])
  const iamRoles = vpcTopology.iam_roles ?? []
  const trafficEdgesList = trafficEdges ?? []
  // Index subnets and workloads by (az, tier).
  const { byAzAndTier, edgeNodes, serverlessNodes, staleNodes, populatedAzs } = useMemo(() => {
    const subnetById = new Map(vpcTopology.subnets.map(s => [s.id, s]))
    const byAzAndTier = new Map<string, Map<SubnetTier, TopologyNode[]>>()
    const edgeNodes: TopologyNode[] = []
    const serverlessNodes: TopologyNode[] = []
    const staleNodes: TopologyNode[] = []

    for (const n of nodes) {
      if (n.stale) { staleNodes.push(n); continue }
      if (n.type && EDGE_SERVICE_TYPES.has(n.type)) { edgeNodes.push(n); continue }
      const sub = n.subnet_id ? subnetById.get(n.subnet_id) ?? null : null
      if (!sub || !sub.az) {
        if (n.type && SERVERLESS_TYPES.has(n.type)) serverlessNodes.push(n)
        continue
      }
      const azMap = byAzAndTier.get(sub.az) ?? new Map<SubnetTier, TopologyNode[]>()
      const cell = azMap.get(sub.tier) ?? []
      cell.push(n)
      azMap.set(sub.tier, cell)
      byAzAndTier.set(sub.az, azMap)
    }

    for (const azMap of byAzAndTier.values()) {
      for (const list of azMap.values()) {
        list.sort((a, b) => (a.score?.rank ?? 999) - (b.score?.rank ?? 999))
      }
    }
    edgeNodes.sort((a, b) => (a.score?.rank ?? 999) - (b.score?.rank ?? 999))
    serverlessNodes.sort((a, b) => (a.score?.rank ?? 999) - (b.score?.rank ?? 999))

    // AZ collapse: only AZs that contain at least one workload AND are in
    // the system's primary VPC. The "primary VPC" filter drops the
    // us-east-1 demo subnets that belong to a different VPC entirely.
    const populatedAzs = new Set<string>([...byAzAndTier.keys()])
    return { byAzAndTier, edgeNodes, serverlessNodes, staleNodes, populatedAzs }
  }, [vpcTopology.subnets, nodes])

  // Group subnets by (az, tier) for cell metadata. Skip subnets that don't
  // belong to the primary VPC (the topology-risk root vpc_id).
  const subnetsByCell = useMemo(() => {
    const m = new Map<string, SubnetMeta[]>()
    for (const s of vpcTopology.subnets) {
      if (!s.az) continue
      // Honest AZ filter: only render AZs that hold ≥1 placed workload OR
      // a non-default-VPC subnet. This drops the alon-prod-* demo subnets
      // in us-east-1 (no workloads) and the eu-west-1c default-VPC subnet
      // (no workloads), keeping the canvas focused on the AZs that matter.
      if (!populatedAzs.has(s.az)) continue
      const k = `${s.az}::${s.tier}`
      const list = m.get(k) ?? []
      list.push(s)
      m.set(k, list)
    }
    return m
  }, [vpcTopology.subnets, populatedAzs])

  const azs = [...populatedAzs].sort()
  const tiers: ("web" | "app" | "data")[] = ["web", "app", "data"]
  const hasIgw = vpcTopology.edges.igws.length > 0
  const hasNats = vpcTopology.edges.nat_gws.length > 0
  const hasVpces = vpcTopology.edges.vpces.length > 0
  const accountSuffix = vpcTopology.account_id ? `· acct ${vpcTopology.account_id}` : ""
  const flowContainerRef = useRef<HTMLDivElement | null>(null)

  return (
    <div
      ref={flowContainerRef}
      className="rounded-2xl p-6 space-y-5 relative"
      style={{ background: PAL.bg, border: `1px solid #DDE3E8` }}
    >
      <FlowOverlay edges={trafficEdgesList} containerRef={flowContainerRef} />
      {/* Internet + IGW perimeter */}
      <div className="flex items-center justify-center gap-8 pb-4">
        <div className="flex flex-col items-center" style={{ color: PAL.slate }}>
          <div className="text-3xl">👥</div>
          <div className="text-[11px] uppercase tracking-wider mt-1 font-semibold">Users</div>
        </div>
        <div className="flex-1 max-w-[180px] border-t border-dashed" style={{ borderColor: "#94A3B8" }} />
        <div className="flex flex-col items-center" style={{ color: PAL.slate }}>
          <div className="text-3xl">☁</div>
          <div className="text-[11px] uppercase tracking-wider mt-1 font-semibold">Internet</div>
        </div>
        <div className="flex-1 max-w-[180px] border-t border-dashed" style={{ borderColor: "#94A3B8" }} />
        <div
          className="flex flex-col items-center"
          style={{ color: hasIgw ? PAL.awsBlue : "#94A3B8" }}
          data-flow-id="__igw__"
        >
          <div className="text-3xl">🌐</div>
          <div className="text-[11px] uppercase tracking-wider mt-1 font-semibold">
            {hasIgw ? `IGW · ${vpcTopology.edges.igws[0].name}` : "no IGW observed"}
          </div>
        </div>
      </div>

      {/* AWS Cloud frame */}
      <div
        className="rounded-lg p-4 relative"
        style={{ background: PAL.cardBg, border: `2px solid ${PAL.awsFrame}` }}
      >
        <div
          className="absolute -top-2.5 left-4 px-2 text-[11px] uppercase tracking-[0.14em] font-semibold"
          style={{ background: PAL.bg, color: PAL.awsFrame }}
        >
          ☁ AWS Cloud {accountSuffix}
        </div>

        {/* Region */}
        <div
          className="rounded-md p-4 mt-3 relative"
          style={{ background: PAL.cardBg, border: `1.5px dashed ${PAL.slate}` }}
        >
          <div
            className="absolute -top-2.5 left-4 px-2 text-[10px] uppercase tracking-[0.14em] font-semibold"
            style={{ background: PAL.cardBg, color: PAL.slate }}
          >
            Region · {vpcTopology.region ?? "unknown"}
          </div>

          {/* VPC + edge rail flexbox */}
          <div className="flex gap-4 mt-3">
            {/* VPC frame */}
            <div
              className="flex-1 rounded-md p-4 relative"
              style={{ background: PAL.cardBg, border: `2px solid #00C2A8` }}
            >
              <div
                className="absolute -top-2.5 left-4 px-2 text-[11px] uppercase tracking-[0.14em] font-semibold"
                style={{ background: PAL.cardBg, color: "#0E8B7A" }}
              >
                VPC · {vpcTopology.vpc_id ?? "unknown"}
              </div>

              {/* VPCE perimeter band */}
              {hasVpces && (
                <div className="mb-3 pb-2 border-b border-dashed" style={{ borderColor: "#CBD5E1" }}>
                  <div className="text-[10px] uppercase tracking-[0.12em] font-semibold mb-1.5" style={{ color: PAL.slate }}>
                    VPC endpoints ({vpcTopology.edges.vpces.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {vpcTopology.edges.vpces.map(v => (
                      <span
                        key={v.id}
                        className="text-[10px] px-2 py-0.5 rounded-md"
                        style={{ background: "#EDE7F6", border: "1px solid #7E57C2", color: "#4527A0" }}
                      >
                        VPCE · {v.service_name ?? v.id}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* NAT GW perimeter band */}
              {hasNats && (
                <div className="mb-3 pb-2 border-b border-dashed" style={{ borderColor: "#CBD5E1" }}>
                  <div className="text-[10px] uppercase tracking-[0.12em] font-semibold mb-1.5" style={{ color: PAL.slate }}>
                    NAT gateways ({vpcTopology.edges.nat_gws.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {vpcTopology.edges.nat_gws.map(n => (
                      <span
                        key={n.id}
                        className="text-[10px] px-2 py-0.5 rounded-md"
                        style={{ background: "#FFF3E0", border: "1px solid #FF9900", color: "#7B3F00" }}
                      >
                        NAT GW · {n.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* AZ headers + tier rows with sidebar labels */}
              {azs.length === 0 ? (
                <div className="text-[12px] italic py-6 text-center" style={{ color: PAL.slate }}>
                  No alon-prod-tagged subnets in this VPC.
                </div>
              ) : (
                <div className="mt-2">
                  {/* AZ headers — offset by the sidebar width */}
                  <div className="flex mb-2">
                    <div style={{ width: "44px" }} />
                    <div
                      className="grid gap-3 flex-1"
                      style={{ gridTemplateColumns: `repeat(${azs.length}, minmax(0, 1fr))` }}
                    >
                      {azs.map(az => (
                        <div
                          key={az}
                          className="text-[11px] uppercase tracking-[0.14em] font-semibold text-center pb-1.5 border-b"
                          style={{ color: PAL.ink, borderColor: PAL.slate }}
                        >
                          AZ · {az}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tier rows with vertical sidebar labels */}
                  <div className="space-y-3">
                    {tiers.map(tier => (
                      <div key={tier} className="flex gap-0">
                        <div
                          className="rounded-l-md flex items-center justify-center shrink-0"
                          style={{
                            background: PAL.ink,
                            color: "white",
                            width: "44px",
                            writingMode: "vertical-rl",
                            transform: "rotate(180deg)",
                            fontSize: "10px",
                            fontWeight: 700,
                            letterSpacing: "0.18em",
                          }}
                        >
                          {TIER_SIDEBAR_LABEL[tier]}
                        </div>
                        <div
                          className="rounded-r-md p-3 flex-1"
                          style={{ background: TIER_BG[tier] }}
                        >
                          <div
                            className="grid gap-3"
                            style={{ gridTemplateColumns: `repeat(${azs.length}, minmax(0, 1fr))` }}
                          >
                            {azs.map(az => {
                              const subnetsHere = subnetsByCell.get(`${az}::${tier}`) ?? []
                              const workloadsHere = byAzAndTier.get(az)?.get(tier) ?? []
                              return (
                                <SubnetCell
                                  key={`${az}-${tier}`}
                                  tier={tier}
                                  az={az}
                                  subnetsHere={subnetsHere}
                                  workloadsHere={workloadsHere}
                                  sgIndex={sgIndex}
                                  selectedNodeId={selectedNodeId}
                                  onSelect={onSelect}
                                />
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right edge rail — S3, KMS, DDB, Secrets */}
            <div
              className="w-[200px] rounded-md p-3 relative shrink-0"
              style={{ background: PAL.cardBg, border: `1.5px dashed ${PAL.slate}` }}
            >
              <div
                className="absolute -top-2.5 left-3 px-2 text-[10px] uppercase tracking-[0.14em] font-semibold"
                style={{ background: PAL.cardBg, color: PAL.slate }}
              >
                Edge services
              </div>
              {edgeNodes.length === 0 ? (
                <div className="text-[11px] italic mt-2" style={{ color: PAL.slate }}>
                  no S3 / KMS / DynamoDB observed in this system
                </div>
              ) : (
                <div className="flex flex-col gap-2 mt-2">
                  {edgeNodes.map(n => (
                    <WorkloadChip
                      key={n.id}
                      node={n}
                      selected={n.id === selectedNodeId}
                      onClick={() => onSelect(n.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Serverless · outside-VPC band */}
      {serverlessNodes.length > 0 && (
        <div
          className="rounded-md p-4"
          style={{ background: PAL.cardBg, border: `1px solid #E2E8F0` }}
        >
          <div className="flex items-baseline justify-between mb-1.5">
            <div className="text-[10px] uppercase tracking-[0.14em] font-semibold" style={{ color: PAL.ink }}>
              Serverless · outside VPC ({serverlessNodes.length})
            </div>
            <div className="text-[11px]" style={{ color: PAL.slate }}>
              λ Lambda functions with no VPC binding
            </div>
          </div>
          <div className="text-[11px] italic mb-2" style={{ color: PAL.slate }}>
            Run in the AWS-managed Lambda VPC — outside the customer network plane.
          </div>
          <div className="flex flex-wrap gap-2">
            {serverlessNodes.map(n => (
              <WorkloadChip
                key={n.id}
                node={n}
                selected={n.id === selectedNodeId}
                onClick={() => onSelect(n.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Stale workloads */}
      {staleNodes.length > 0 && (
        <div
          className="rounded-md p-4"
          style={{ background: PAL.cardBg, border: `1px solid #E2E8F0` }}
        >
          <div className="text-[10px] uppercase tracking-[0.14em] font-semibold mb-1.5" style={{ color: PAL.ink }}>
            Stale workloads ({staleNodes.length})
          </div>
          <div className="text-[11px] italic mb-2" style={{ color: PAL.slate }}>
            aws_exists = false — kept for audit, excluded from rank.
          </div>
          <div className="flex flex-wrap gap-2">
            {staleNodes.map(n => (
              <WorkloadChip
                key={n.id}
                node={n}
                selected={n.id === selectedNodeId}
                onClick={() => onSelect(n.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* IAM · Control plane strip */}
      <IamControlPlane roles={iamRoles} allWorkloads={nodes} />

      {/* Workload-to-workload ACTUAL_TRAFFIC band */}
      <TrafficFlowBand edges={trafficEdgesList} nodes={nodes} />

      {/* Encoding legend at the bottom */}
      <EncodingLegend />
    </div>
  )
}
