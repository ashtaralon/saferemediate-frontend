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
import { flowStroke } from "./flow-visuals"
import { buildFocusedServicePaths } from "./service-paths"
import type {
  EdgeVpce,
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
  vpces?: EdgeVpce[]
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

function pathEdgeLabel(edge: TrafficEdge): string {
  switch (edge.protocol) {
    case "ACTUAL_S3_ACCESS":
      return "S3 access"
    case "ACTUAL_API_CALL":
      return "API call"
    case "ACTUAL_TRAFFIC":
      return edge.port ? `${edge.port}/TCP` : "Traffic"
    case "VPC_ENDPOINT":
      return "VPCE"
    case "PUBLIC_EGRESS":
      return "Public egress"
    default: {
      const label = edgeLabel(edge)
      return label.length > 14 ? `${label.slice(0, 12)}…` : label
    }
  }
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

function isLambdaNode(node: TopologyNode): boolean {
  return String(node.type ?? "").toLowerCase().includes("lambda")
}

function vpceName(vpce: EdgeVpce): string {
  const service = vpce.service_name?.split(".").pop()
  return service ? `${service.toUpperCase()} VPC endpoint` : `VPC endpoint · ${vpce.id}`
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

function FocusedServicePathMap({
  node,
  nodes,
  edges,
}: {
  node: TopologyNode
  nodes: TopologyNode[]
  edges: TrafficEdge[]
}) {
  const nodeById = new Map(nodes.map(item => [item.id, item]))
  const paths = buildFocusedServicePaths(node.id, nodes, edges)
    .filter(path => path.edges.length > 0)

  return (
    <section data-testid="topology-service-path-map">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GitBranch size={15} style={{ color: "#7C3AED" }} />
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "#1A2330" }}>
            End-to-end service path
          </h3>
        </div>
        <span
          className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide"
          style={{ color: "#6D28D9" }}
          data-testid="topology-service-path-provenance"
        >
          <Database size={11} />
          Neo4j graph
        </span>
      </div>

      {paths.length === 0 ? (
        <div className="rounded-md border p-3 text-[11px]" style={{ borderColor: "#DDE3E8", color: "#64748B" }}>
          No connected runtime path is available for this service in the current Neo4j snapshot.
        </div>
      ) : (
        <div className="space-y-2">
          {paths.map((path, pathIndex) => (
            <div
              key={path.id}
              className="overflow-x-auto rounded-md border px-2 py-3"
              style={{ borderColor: "#DDE3E8", background: "#F8FAFC" }}
              data-testid="topology-service-path-row"
            >
              <div className="flex min-w-max items-center">
                {path.nodeIds.map((nodeId, index) => {
                  const pathNode = nodeById.get(nodeId)
                  const type = targetType(nodeId, nodeById)
                  const name = targetName(nodeId, nodeById)
                  const selected = nodeId === node.id
                  const edge = path.edges[index]
                  const color = edge ? flowStroke(edge) : "#CBD5E1"
                  const label = edge ? edgeLabel(edge) : "dependency"
                  const compactLabel = edge ? pathEdgeLabel(edge) : "dependency"

                  return (
                    <div key={`${path.id}-${nodeId}-${index}`} className="flex items-center">
                      <div
                        className="flex h-[82px] w-[142px] shrink-0 items-center gap-2 rounded-md border bg-white px-2"
                        style={{
                          borderColor: selected ? "#0E8B7A" : "#DDE3E8",
                          boxShadow: selected ? "0 0 0 2px rgba(14,139,122,0.12)" : undefined,
                        }}
                        title={`${name} · ${type}`}
                        data-selected-service={selected ? "true" : undefined}
                      >
                        <ServiceTypeBadge type={pathNode?.type ?? type} variant="tile" size={34} />
                        <div className="min-w-0">
                          <div
                            className="line-clamp-2 break-words text-[9px] font-semibold leading-tight"
                            style={{ color: "#1A2330", overflowWrap: "anywhere" }}
                          >
                            {name}
                          </div>
                          <div className="mt-0.5 truncate text-[9px]" style={{ color: "#64748B" }}>
                            {selected ? "Selected · " : ""}{type}
                          </div>
                        </div>
                      </div>

                      {edge ? (
                        <svg
                          width="78"
                          height="46"
                          viewBox="0 0 78 46"
                          className="shrink-0"
                          aria-label={`${name} to ${targetName(path.nodeIds[index + 1], nodeById)} via ${label}`}
                        >
                          <title>{label}</title>
                          <text
                            x="39"
                            y="10"
                            textAnchor="middle"
                            fontSize="8"
                            fontWeight="600"
                            fill={color}
                          >
                            {compactLabel}
                          </text>
                          <path d="M5 25 H69" stroke={color} strokeWidth="2" strokeLinecap="round" />
                          <path d="M64 20 L74 25 L64 30 Z" fill={color} />
                          <g data-testid="topology-inspector-flow-packet">
                            <circle r="5" fill="white" stroke={color} strokeWidth="1" />
                            <path d="M -3 -3 L 4 0 L -3 3 Z" fill={color} />
                            <animateMotion
                              path="M 10 25 L 59 25"
                              dur="1.2s"
                              begin={`-${(pathIndex + index) * 0.2}s`}
                              repeatCount="indefinite"
                            />
                          </g>
                        </svg>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          <div className="text-[9px] leading-relaxed" style={{ color: "#64748B" }}>
            Observed edges carry timestamps; modeled edges remain visible without inventing activity.
          </div>
        </div>
      )}
    </section>
  )
}

export function DetailPanel({
  node,
  nodes = [],
  edges = [],
  subnets = [],
  vpces = [],
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
  const lambda = isLambdaNode(node)
  const lambdaVpcAttached = lambda && Boolean(
    node.vpc_id ||
    subnetIds.length > 0 ||
    attachedGroups.length > 0,
  )
  const placementState = lambda
    ? lambdaVpcAttached
      ? "VPC-attached networking"
      : "AWS-managed runtime · not VPC-attached"
    : null
  const vpcValue = lambda
    ? lambdaVpcAttached
      ? `${node.vpc_id ?? "VPC id not reported"} · VPC-attached`
      : "AWS-managed runtime · not VPC-attached"
    : node.vpc_id ?? "Regional AWS service · not VPC-bound"
  const availabilityZoneValue = lambda && !lambdaVpcAttached
    ? "Regional runtime · no customer AZ placement"
    : zones.length > 0
      ? zones.join(", ")
      : "Not subnet-bound"
  const subnetValue = lambda && !lambdaVpcAttached
    ? "No VPC subnet attachment"
    : subnetIds.length > 0
      ? subnetIds.join(", ")
      : "Not subnet-bound"
  const tierValue = lambda
    ? "Serverless · AWS-managed runtime"
    : tiers.length > 0
      ? tiers.join(", ")
      : "Regional / managed service"
  const pathNodes = [
    ...nodes,
    ...vpces
      .filter(vpce => !nodes.some(item => item.id === vpce.id))
      .map<TopologyNode>(vpce => ({
        id: vpce.id,
        name: vpceName(vpce),
        type: "VpcEndpoint",
        subnet_id: null,
        vpc_id: vpce.vpc_id ?? node.vpc_id ?? null,
        account_id: node.account_id ?? null,
        region: node.region ?? null,
        score: null,
        stale: null,
        is_jewel: false,
      })),
  ]

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
              {node.type ?? "Resource"} · {placementState ? `${placementState} · ` : ""}
              {node.stale ? "stale graph data" : "current graph data"}
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
            <InfoRow label="VPC" value={vpcValue} mono />
            <InfoRow label="Availability zone" value={availabilityZoneValue} mono />
            <InfoRow label="Subnet" value={subnetValue} mono />
            <InfoRow label="Tier" value={tierValue} />
          </dl>
          {lambda ? (
            <div className="mt-2 rounded-md border px-3 py-2 text-[10px] leading-relaxed" style={{ borderColor: "#FED7AA", background: "#FFF7ED", color: "#9A3412" }}>
              Lambda runs on AWS-managed infrastructure. When VPC configured, Lambda-managed network interfaces attach to the selected subnets; the function runtime itself is not an EC2 instance inside the VPC.
            </div>
          ) : null}
        </section>

        <FocusedServicePathMap node={node} nodes={pathNodes} edges={edges} />

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
