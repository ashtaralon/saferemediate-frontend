"use client"

import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Clock3,
  Database,
  GitBranch,
  KeyRound,
  MapPin,
  Network,
  Server,
  ShieldCheck,
  X,
} from "lucide-react"
import { ServiceTypeBadge } from "@/lib/service-type"
import type {
  IamRoleRollup,
  SecurityGroupMeta,
  SubnetMeta,
  TopologyNode,
  TrafficEdge,
} from "./types"

interface Props {
  node: TopologyNode | null
  nodes?: TopologyNode[]
  edges?: TrafficEdge[]
  subnets?: SubnetMeta[]
  iamRoles?: IamRoleRollup[]
  securityGroups?: SecurityGroupMeta[]
  onClose: () => void
}

function targetName(id: string, nodeById: Map<string, TopologyNode>): string {
  if (id === "__igw__") return "Internet gateway"
  if (id === "__aws_s3__") return "AWS S3 endpoints"
  if (id === "__aws_api__") return "AWS API endpoints"
  return nodeById.get(id)?.name ?? id
}

function targetType(id: string, nodeById: Map<string, TopologyNode>): string {
  if (id === "__igw__") return "Internet"
  if (id === "__aws_s3__") return "S3"
  if (id === "__aws_api__") return "AWS API"
  return nodeById.get(id)?.type ?? "Resource"
}

function edgeLabel(edge: TrafficEdge): string {
  const protocol = edge.protocol ?? edge.edge_class ?? "dependency"
  return edge.port ? `${edge.port}/${protocol}` : protocol
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "No timestamp"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function latestTimestamp(edges: TrafficEdge[]): string | null {
  let latest: string | null = null
  let latestTime = Number.NEGATIVE_INFINITY
  for (const edge of edges) {
    if (!edge.last_seen) continue
    const time = Date.parse(edge.last_seen)
    if (!Number.isNaN(time) && time > latestTime) {
      latest = edge.last_seen
      latestTime = time
    }
  }
  return latest
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-2 last:border-b-0" style={{ borderColor: "#EEF2F6" }}>
      <dt className="text-[11px]" style={{ color: "#64748B" }}>{label}</dt>
      <dd
        className={`max-w-[260px] text-right text-[11px] ${mono ? "font-mono break-all" : "font-medium"}`}
        style={{ color: "#1A2330" }}
      >
        {value}
      </dd>
    </div>
  )
}

function Metric({
  label,
  value,
  icon,
  accent,
}: {
  label: string
  value: string | number
  icon: React.ReactNode
  accent: string
}) {
  return (
    <div className="rounded-md border p-3" style={{ borderColor: "#DDE3E8", background: "#F8FAFC" }}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold" style={{ color: "#64748B" }}>
        <span style={{ color: accent }}>{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums" style={{ color: "#1A2330" }}>{value}</div>
    </div>
  )
}

export function DetailPanel({
  node,
  nodes = [],
  edges = [],
  subnets = [],
  iamRoles = [],
  securityGroups = [],
  onClose,
}: Props) {
  if (!node) return null

  const nodeById = new Map(nodes.map(item => [item.id, item]))
  const subnetById = new Map(subnets.map(subnet => [subnet.id, subnet]))
  const sgById = new Map(securityGroups.map(group => [group.id, group]))
  const outgoing = edges.filter(edge => edge.source_id === node.id)
  const incoming = edges.filter(edge => edge.target_id === node.id)
  const attachedRoles = iamRoles.filter(role => (role.workload_ids ?? []).includes(node.id))
  const attachedGroups = (node.security_group_ids ?? []).map(id => sgById.get(id) ?? { id, name: id })
  const subnetIds = [...new Set([...(node.subnet_ids ?? []), node.subnet_id].filter((id): id is string => Boolean(id)))]
  const nodeSubnets = subnetIds.map(id => subnetById.get(id)).filter((subnet): subnet is SubnetMeta => Boolean(subnet))
  const zones = [...new Set(nodeSubnets.map(subnet => subnet.az).filter((az): az is string => Boolean(az)))]
  const tiers = [...new Set(nodeSubnets.map(subnet => subnet.tier))]
  const allNodeEdges = [...incoming, ...outgoing]
  const lastSeen = latestTimestamp(allNodeEdges)
  const uniqueDependencies = new Set([
    ...incoming.map(edge => edge.source_id),
    ...outgoing.map(edge => edge.target_id),
  ]).size

  return (
    <aside
      className="fixed top-0 right-0 z-[230] h-full w-full overflow-y-auto border-l bg-white shadow-2xl md:w-[480px]"
      role="dialog"
      aria-label={`Service details for ${node.name}`}
      data-testid="topology-service-detail-panel"
    >
      <div
        className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-white/95 p-4 backdrop-blur"
        style={{ borderColor: "#DDE3E8" }}
      >
        <div className="flex min-w-0 items-start gap-3">
          <ServiceTypeBadge type={node.type ?? "Resource"} variant="tile" size={42} />
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "#0E8B7A" }}>
              Service inspector
            </div>
            <div className="mt-1 truncate text-base font-semibold" style={{ color: "#1A2330" }}>
              {node.name}
            </div>
            <div className="mt-0.5 truncate text-[11px]" style={{ color: "#64748B" }}>
              {node.type ?? "Resource"} · {node.stale ? "stale graph data" : "current graph data"}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-[#F1F5F9]"
          style={{ color: "#64748B" }}
          aria-label="Close service details"
        >
          <X size={18} />
        </button>
      </div>

      <div className="space-y-5 p-4">
        <section className="grid grid-cols-2 gap-2">
          <Metric label="Inbound" value={incoming.length} icon={<ArrowDownLeft size={14} />} accent="#2563EB" />
          <Metric label="Outbound" value={outgoing.length} icon={<ArrowUpRight size={14} />} accent="#0E8B7A" />
          <Metric label="Neighbors" value={uniqueDependencies} icon={<GitBranch size={14} />} accent="#7C3AED" />
          <Metric
            label="Data state"
            value={node.stale ? "Stale" : "Current"}
            icon={<Activity size={14} />}
            accent={node.stale ? "#D97706" : "#059669"}
          />
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2">
            <MapPin size={15} style={{ color: "#0E8B7A" }} />
            <h3 className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "#1A2330" }}>
              Placement
            </h3>
          </div>
          <dl className="rounded-md border px-3" style={{ borderColor: "#DDE3E8" }}>
            <InfoRow label="Account" value={node.account_id ?? "Not reported"} mono />
            <InfoRow label="Region" value={node.region ?? "Global / not reported"} mono />
            <InfoRow label="VPC" value={node.vpc_id ?? "Regional service · outside VPC"} mono />
            <InfoRow label="Availability zone" value={zones.length > 0 ? zones.join(", ") : "Not subnet-bound"} mono />
            <InfoRow label="Subnet" value={subnetIds.length > 0 ? subnetIds.join(", ") : "Not subnet-bound"} mono />
            <InfoRow label="Tier" value={tiers.length > 0 ? tiers.join(", ") : "Regional / managed service"} />
          </dl>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <GitBranch size={15} style={{ color: "#7C3AED" }} />
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "#1A2330" }}>
                Runtime dependencies
              </h3>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "#64748B" }}>
              <Clock3 size={11} />
              {formatTimestamp(lastSeen)}
            </span>
          </div>
          {allNodeEdges.length === 0 ? (
            <div className="rounded-md border p-3 text-[11px]" style={{ borderColor: "#DDE3E8", color: "#64748B" }}>
              No dependency edges are available for this service in the current graph snapshot.
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border" style={{ borderColor: "#DDE3E8" }}>
              {outgoing.slice(0, 8).map((edge, index) => (
                <div
                  key={`out-${edge.target_id}-${index}`}
                  className="flex items-start gap-2 border-b p-3 last:border-b-0"
                  style={{ borderColor: "#EEF2F6" }}
                >
                  <ArrowUpRight className="mt-0.5 shrink-0" size={14} style={{ color: "#0E8B7A" }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold" style={{ color: "#1A2330" }}>
                      {targetName(edge.target_id, nodeById)}
                    </div>
                    <div className="mt-0.5 text-[10px]" style={{ color: "#64748B" }}>
                      {targetType(edge.target_id, nodeById)} · {edgeLabel(edge)}
                    </div>
                  </div>
                  <span className="shrink-0 text-[9px]" style={{ color: "#94A3B8" }}>
                    {formatTimestamp(edge.last_seen)}
                  </span>
                </div>
              ))}
              {incoming.slice(0, 8).map((edge, index) => (
                <div
                  key={`in-${edge.source_id}-${index}`}
                  className="flex items-start gap-2 border-b p-3 last:border-b-0"
                  style={{ borderColor: "#EEF2F6" }}
                >
                  <ArrowDownLeft className="mt-0.5 shrink-0" size={14} style={{ color: "#2563EB" }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold" style={{ color: "#1A2330" }}>
                      {targetName(edge.source_id, nodeById)}
                    </div>
                    <div className="mt-0.5 text-[10px]" style={{ color: "#64748B" }}>
                      {targetType(edge.source_id, nodeById)} · {edgeLabel(edge)}
                    </div>
                  </div>
                  <span className="shrink-0 text-[9px]" style={{ color: "#94A3B8" }}>
                    {formatTimestamp(edge.last_seen)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center gap-2">
            <Server size={15} style={{ color: "#0E8B7A" }} />
            <h3 className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "#1A2330" }}>
              Runtime attachments
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <div className="rounded-md border p-3" style={{ borderColor: "#DDE3E8" }}>
              <div className="flex items-center gap-2 text-[11px] font-semibold" style={{ color: "#1A2330" }}>
                <KeyRound size={14} style={{ color: "#7C3AED" }} />
                IAM roles · {attachedRoles.length}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {attachedRoles.length > 0 ? attachedRoles.map(role => (
                  <span
                    key={role.name}
                    className="rounded px-2 py-1 text-[10px] font-mono"
                    style={{ background: "#F3E8FF", color: "#6B21A8" }}
                  >
                    {role.name}
                  </span>
                )) : (
                  <span className="text-[10px]" style={{ color: "#94A3B8" }}>No attached role reported</span>
                )}
              </div>
            </div>
            <div className="rounded-md border p-3" style={{ borderColor: "#DDE3E8" }}>
              <div className="flex items-center gap-2 text-[11px] font-semibold" style={{ color: "#1A2330" }}>
                <Network size={14} style={{ color: "#2563EB" }} />
                Security groups · {attachedGroups.length}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {attachedGroups.length > 0 ? attachedGroups.map(group => (
                  <span
                    key={group.id}
                    className="rounded px-2 py-1 text-[10px] font-mono"
                    style={{ background: "#DBEAFE", color: "#1E40AF" }}
                    title={group.id}
                  >
                    {group.name}
                  </span>
                )) : (
                  <span className="text-[10px]" style={{ color: "#94A3B8" }}>Not security-group bound</span>
                )}
              </div>
            </div>
          </div>
        </section>

        {(node.observed_edge_count != null || node.observed_source_count != null) ? (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <Database size={15} style={{ color: "#7C3AED" }} />
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "#1A2330" }}>
                Observed use
              </h3>
            </div>
            <div className="rounded-md border p-3 text-[11px]" style={{ borderColor: "#DDE3E8", color: "#475569" }}>
              {node.observed_source_count ?? 0} distinct sources across {node.observed_edge_count ?? 0} observed access edges.
            </div>
          </section>
        ) : null}

        {node.score ? (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <ShieldCheck size={15} style={{ color: "#64748B" }} />
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "#1A2330" }}>
                Integrated posture signal
              </h3>
            </div>
            <div className="rounded-md border p-3" style={{ borderColor: "#DDE3E8", background: "#F8FAFC" }}>
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <span className="text-2xl font-semibold" style={{ color: "#1A2330" }}>{node.score.value}</span>
                  <span className="ml-1 text-[11px]" style={{ color: "#64748B" }}>/ 100</span>
                </div>
                <span className="rounded px-2 py-1 text-[10px] font-semibold uppercase" style={{ background: "#E2E8F0", color: "#475569" }}>
                  {node.score.tier}
                </span>
              </div>
              <div className="mt-1 text-[10px]" style={{ color: "#64748B" }}>
                Confidence {Math.round(node.score.confidence.value * 100)}% · rank {node.score.rank ?? "not ranked"}
              </div>
            </div>
          </section>
        ) : null}

        <section>
          <div className="mb-2 flex items-center gap-2">
            <Activity size={15} style={{ color: "#64748B" }} />
            <h3 className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "#1A2330" }}>
              Resource identity
            </h3>
          </div>
          <div className="rounded-md border p-3 font-mono text-[10px] break-all" style={{ borderColor: "#DDE3E8", color: "#475569" }}>
            {node.id}
          </div>
        </section>
      </div>
    </aside>
  )
}
