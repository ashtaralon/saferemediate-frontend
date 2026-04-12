"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  Crown,
  Database,
  HardDrive,
  Key,
  Loader2,
  Lock,
  Network,
  Server,
  Shield,
  Target,
  Zap,
} from "lucide-react"
import { AttackSimulationPanel } from "./dependency-map/attack-simulation-panel"

type AttackPathNode = {
  id: string
  name: string
  type: string
  cve_count: number
  critical_cves?: number
}

type AttackPathItem = {
  id: string
  nodes: AttackPathNode[]
  risk_score: number
  path_length: number
  source_type: string
  target_name: string
  total_cves: number
  critical_cves: number
  evidence_type: string
  path_kind?: string
}

type SecurityGroup = {
  sg_id: string
  sg_name: string
  open_to_internet: boolean
  affected_resources: string[]
  risky_rules: Array<{
    direction: string
    port: number | string
    protocol: string
    source: string
    risk: string
  }>
}

type IAMRole = {
  role_id: string
  role_name: string
  attached_to: string[]
  policies: string[]
  permission_count: number
  observed_actions_count: number
}

type PathNodeDetails = {
  id: string
  name: string
  type: string
  is_internet_exposed: boolean
  cve_count: number
  critical_cves: number
  high_cves: number
}

type PathDetails = {
  path_id: string
  path_summary: {
    risk_score: number
    risk_level: string
    path_length: number
    total_cves: number
    critical_cves: number
    evidence_type: string
    source: { type: string; name: string }
    target: { type: string; name: string }
  }
  risk_formula: {
    formula: string
    model?: string
    reachability: { score: number; factors: string[] }
    privilege: { score: number; factors: string[] }
    data_impact: { score: number; factors: string[] }
    blast_radius?: { score: number; factors: string[] }
    combined_risk_score: number
  }
  network_layer: {
    security_groups: SecurityGroup[]
    open_ports: number[]
    protocols: string[]
    internet_exposed: boolean
    network_path: Array<{
      from: string
      to: string
      port: number
      protocol: string
      observed: boolean
    }>
  }
  identity_layer: {
    roles: IAMRole[]
    dangerous_permissions: Array<{
      role: string
      permission: string
      risk: string
    }>
    least_privilege_gaps: Array<{
      role: string
      allowed: number
      observed: number
      gap_percentage: number
    }>
  }
  data_impact: {
    name: string
    type: string
    classification: string
    sensitivity: string
    data_types: string[]
    compliance: string[]
    contains_pii: boolean
    contains_financial: boolean
    estimated_records: number
    impact_score: number
    breach_impact: string
  }
  path_nodes: PathNodeDetails[]
}

type LaneKey = "compute" | "security_groups" | "nacls" | "iam_roles" | "api_calls" | "resources"

type CanvasNode = {
  id: string
  name: string
  shortName: string
  type: string
  lane: LaneKey
  subtitle: string
  metrics: string[]
  badge?: string
  color: {
    iconBg: string
    iconText: string
    border: string
    glow: string
    accent: string
  }
  isCrownJewel?: boolean
}

const CROWN_JEWEL_TYPES = new Set(["S3Bucket", "S3", "DynamoDBTable", "DynamoDB", "RDS", "RDSInstance", "Aurora"])

const LANE_ORDER: LaneKey[] = ["compute", "security_groups", "nacls", "iam_roles", "api_calls", "resources"]

const LANE_META: Record<
  LaneKey,
  {
    label: string
    icon: typeof Server
    headerColor: string
    nodeColor: CanvasNode["color"]
  }
> = {
  compute: {
    label: "COMPUTE",
    icon: Server,
    headerColor: "text-blue-300",
    nodeColor: {
      iconBg: "bg-blue-500/15",
      iconText: "text-blue-300",
      border: "border-blue-400/40",
      glow: "shadow-[0_0_0_1px_rgba(96,165,250,0.14)]",
      accent: "bg-blue-500/20",
    },
  },
  security_groups: {
    label: "SECURITY GROUPS",
    icon: Shield,
    headerColor: "text-orange-300",
    nodeColor: {
      iconBg: "bg-orange-500/15",
      iconText: "text-orange-300",
      border: "border-orange-400/40",
      glow: "shadow-[0_0_0_1px_rgba(251,146,60,0.14)]",
      accent: "bg-orange-500/20",
    },
  },
  nacls: {
    label: "NACLS",
    icon: Lock,
    headerColor: "text-cyan-300",
    nodeColor: {
      iconBg: "bg-cyan-500/15",
      iconText: "text-cyan-300",
      border: "border-cyan-400/40",
      glow: "shadow-[0_0_0_1px_rgba(34,211,238,0.14)]",
      accent: "bg-cyan-500/20",
    },
  },
  iam_roles: {
    label: "IAM ROLES",
    icon: Key,
    headerColor: "text-fuchsia-300",
    nodeColor: {
      iconBg: "bg-fuchsia-500/15",
      iconText: "text-fuchsia-300",
      border: "border-fuchsia-400/40",
      glow: "shadow-[0_0_0_1px_rgba(232,121,249,0.14)]",
      accent: "bg-fuchsia-500/20",
    },
  },
  api_calls: {
    label: "API CALLS",
    icon: Zap,
    headerColor: "text-lime-300",
    nodeColor: {
      iconBg: "bg-lime-500/15",
      iconText: "text-lime-300",
      border: "border-lime-400/40",
      glow: "shadow-[0_0_0_1px_rgba(163,230,53,0.14)]",
      accent: "bg-lime-500/20",
    },
  },
  resources: {
    label: "RESOURCES",
    icon: Database,
    headerColor: "text-violet-300",
    nodeColor: {
      iconBg: "bg-violet-500/15",
      iconText: "text-violet-300",
      border: "border-violet-400/40",
      glow: "shadow-[0_0_0_1px_rgba(167,139,250,0.14)]",
      accent: "bg-violet-500/20",
    },
  },
}

function formatName(name: string) {
  if (!name) return "Unknown"
  let formatted = name
  if (formatted.includes(":assumed-role/")) {
    formatted = formatted.split(":assumed-role/")[1]?.split("/")[0] || formatted
  }
  if (formatted.includes(":role/")) {
    formatted = formatted.split(":role/")[1] || formatted
  }
  if (formatted.includes(":table/")) {
    formatted = formatted.split(":table/")[1] || formatted
  }
  if (formatted.includes(":::")) {
    formatted = formatted.split(":::")[1] || formatted
  }
  if (formatted.includes("/")) {
    const parts = formatted.split("/").filter(Boolean)
    if (parts.length > 1) {
      formatted = parts[parts.length - 1]
    }
  }
  return formatted
}

function shortenLabel(label: string, max = 22) {
  const formatted = formatName(label)
  if (formatted.length <= max) return formatted
  return `${formatted.slice(0, max - 3)}...`
}

function getPathLabel(path: AttackPathItem) {
  if (path.path_kind === "hybrid") return "Hybrid"
  if (path.path_kind === "identity") return "Identity"
  if (path.total_cves > 0) return "Vulnerability"
  return "Behavioral"
}

function getPathType(details: PathDetails) {
  const hasIdentityEvidence =
    details.path_summary.source.type.toLowerCase().includes("principal") ||
    details.identity_layer.roles.length > 0 ||
    details.path_nodes.some((node) => node.type === "IAMRole")
  const hasCves = details.path_summary.total_cves > 0

  if (hasIdentityEvidence && hasCves) return "Hybrid Attack Path"
  if (hasIdentityEvidence) return "Identity Attack Path"
  if (hasCves) return "Vulnerability Attack Path"
  if (details.network_layer.internet_exposed) return "Network Attack Path"
  return "Behavioral Attack Path"
}

function getPrimaryIdentity(details: PathDetails) {
  const roleFromIam = details.identity_layer.roles[0]?.role_name
  const roleFromNodes = details.path_nodes.find((node) => /IAMRole|Role/i.test(node.type))?.name
  const sourceName = details.path_summary.source.name
  return formatName(roleFromIam || roleFromNodes || sourceName)
}

function isSecurityGroupType(type: string) {
  return /SecurityGroup|SG/i.test(type)
}

function isNaclType(type: string) {
  return /NACL|NetworkACL/i.test(type)
}

function isIdentityType(type: string) {
  return /IAMRole|Role/i.test(type)
}

function isDataType(type: string) {
  return /S3|Bucket|DynamoDB|RDS|Aurora|Database/i.test(type)
}

function getNodeIcon(type: string) {
  if (isSecurityGroupType(type)) return Shield
  if (isNaclType(type)) return Lock
  if (isIdentityType(type)) return Key
  if (/S3|Bucket/i.test(type)) return HardDrive
  if (/DynamoDB|RDS|Aurora|Database/i.test(type)) return Database
  if (/Lambda/i.test(type)) return Zap
  if (/Network/i.test(type)) return Network
  return Server
}

function buildPathContext(details: PathDetails) {
  return {
    pathType: getPathType(details),
    entryPoint: formatName(details.path_summary.source.name),
    crownJewel: formatName(details.path_summary.target.name),
    identityUsed: getPrimaryIdentity(details),
    pathNodes: details.path_nodes,
    networkLayer: details.network_layer,
    identityLayer: details.identity_layer,
    dataImpact: details.data_impact,
  }
}

function buildCanvasLanes(details: PathDetails) {
  const lanes: Record<LaneKey, CanvasNode[]> = {
    compute: [],
    security_groups: [],
    nacls: [],
    iam_roles: [],
    api_calls: [],
    resources: [],
  }

  const firstNode = details.path_nodes[0]
  if (firstNode) {
    lanes.compute.push({
      id: firstNode.id,
      name: firstNode.name,
      shortName: shortenLabel(firstNode.name),
      type: firstNode.type,
      lane: "compute",
      subtitle: firstNode.type,
      metrics: [
        details.path_summary.evidence_type === "observed" ? "Observed" : "Configured",
        details.path_summary.total_cves > 0 ? `${details.path_summary.total_cves} CVEs` : "No CVEs required",
      ],
      badge: "ENTRY",
      color: LANE_META.compute.nodeColor,
    })
  }

  const securityNodesFromPath = details.path_nodes.filter((node) => isSecurityGroupType(node.type))
  if (securityNodesFromPath.length > 0) {
    lanes.security_groups.push(
      ...securityNodesFromPath.map((node) => ({
        id: node.id,
        name: node.name,
        shortName: shortenLabel(node.name),
        type: node.type,
        lane: "security_groups" as const,
        subtitle: node.type,
        metrics: ["On selected path", `${node.cve_count} CVEs`],
        color: LANE_META.security_groups.nodeColor,
      }))
    )
  } else if (details.network_layer.security_groups.length > 0) {
    lanes.security_groups.push(
      ...details.network_layer.security_groups.slice(0, 2).map((sg) => ({
        id: sg.sg_id,
        name: sg.sg_name,
        shortName: shortenLabel(sg.sg_name),
        type: "SecurityGroup",
        lane: "security_groups" as const,
        subtitle: "Security Group",
        metrics: [`${sg.risky_rules.length} risky rules`, sg.open_to_internet ? "Internet-facing" : "Internal"],
        color: LANE_META.security_groups.nodeColor,
      }))
    )
  }

  const naclNodes = details.path_nodes.filter((node) => isNaclType(node.type))
  lanes.nacls.push(
    ...naclNodes.map((node) => ({
      id: node.id,
      name: node.name,
      shortName: shortenLabel(node.name),
      type: node.type,
      lane: "nacls" as const,
      subtitle: node.type,
      metrics: ["On selected path", node.is_internet_exposed ? "External" : "Internal"],
      color: LANE_META.nacls.nodeColor,
    }))
  )

  const identityNodesFromPath = details.path_nodes.filter((node) => isIdentityType(node.type))
  if (identityNodesFromPath.length > 0) {
    lanes.iam_roles.push(
      ...identityNodesFromPath.map((node) => ({
        id: node.id,
        name: node.name,
        shortName: shortenLabel(node.name),
        type: node.type,
        lane: "iam_roles" as const,
        subtitle: node.type,
        metrics: ["Identity on selected path", node.cve_count > 0 ? `${node.cve_count} CVEs` : "No CVEs required"],
        badge: "IDENTITY",
        color: LANE_META.iam_roles.nodeColor,
      }))
    )
  } else if (details.identity_layer.roles.length > 0) {
    lanes.iam_roles.push(
      ...details.identity_layer.roles.slice(0, 2).map((role) => ({
        id: role.role_id || role.role_name,
        name: role.role_name,
        shortName: shortenLabel(role.role_name),
        type: "IAMRole",
        lane: "iam_roles" as const,
        subtitle: "IAMRole",
        metrics: [`${role.permission_count} permissions`, `${role.observed_actions_count} observed actions`],
        badge: "IDENTITY",
        color: LANE_META.iam_roles.nodeColor,
      }))
    )
  }

  const protocolLabel = details.network_layer.protocols.length > 0 ? details.network_layer.protocols.join(", ") : "Observed access"
  lanes.api_calls.push({
    id: `api-${details.path_id}`,
    name: formatName(details.path_summary.target.name),
    shortName: shortenLabel(formatName(details.path_summary.target.name)),
    type: "APICall",
    lane: "api_calls",
    subtitle: protocolLabel,
    metrics: [
      details.path_summary.evidence_type === "observed" ? "Live observed traffic" : "Configured path",
      details.path_summary.total_cves > 0 ? `${details.path_summary.total_cves} CVEs in route` : "No CVEs required",
    ],
    badge: "API",
    color: LANE_META.api_calls.nodeColor,
  })

  const dataNodes = details.path_nodes.filter((node, index) => isDataType(node.type) || index === details.path_nodes.length - 1)
  const uniqueDataNodes = dataNodes.filter((node, index, arr) => arr.findIndex((candidate) => candidate.id === node.id) === index)
  lanes.resources.push(
    ...uniqueDataNodes.map((node, index) => ({
      id: node.id,
      name: node.name,
      shortName: shortenLabel(node.name),
      type: node.type,
      lane: "resources" as const,
      subtitle: node.type,
      metrics: [
        details.data_impact.classification || "Sensitive",
        details.data_impact.estimated_records > 0 ? `${details.data_impact.estimated_records.toLocaleString()} records` : "Record volume unknown",
      ],
      badge: index === uniqueDataNodes.length - 1 ? "CROWN JEWEL" : "DATA",
      isCrownJewel: index === uniqueDataNodes.length - 1,
      color: LANE_META.resources.nodeColor,
    }))
  )

  return lanes
}

function PathNodeCard({
  node,
  onOpen,
  registerRef,
}: {
  node: CanvasNode
  onOpen: (node: { id: string; name: string }) => void
  registerRef: (id: string, element: HTMLButtonElement | null) => void
}) {
  const Icon = getNodeIcon(node.type)

  return (
    <button
      ref={(element) => registerRef(node.id, element)}
      onClick={() => onOpen({ id: node.id, name: node.name })}
      className={`relative w-[260px] rounded-[22px] border ${node.color.border} ${node.color.glow} bg-slate-900/70 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-cyan-300/50`}
    >
      {node.badge && (
        <div className="absolute -top-3 left-4 rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
          {node.badge}
        </div>
      )}
      {node.isCrownJewel && (
        <div className="absolute -top-3 right-4 flex h-8 w-8 items-center justify-center rounded-full border border-fuchsia-400/50 bg-fuchsia-500/15">
          <Crown className="h-4 w-4 text-fuchsia-200" />
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${node.color.iconBg}`}>
          <Icon className={`h-5 w-5 ${node.color.iconText}`} />
        </div>
      </div>

      <div className="mt-4 text-xl font-semibold text-white">{node.shortName}</div>
      <div className={`mt-1 text-xs uppercase tracking-[0.16em] ${node.color.iconText}`}>{node.subtitle}</div>

      <div className="mt-4 flex flex-wrap gap-2">
        {node.metrics.filter(Boolean).map((metric) => (
          <span
            key={metric}
            className="rounded-lg border border-slate-700 bg-slate-950/80 px-2.5 py-1 text-[11px] font-medium text-slate-300"
          >
            {metric}
          </span>
        ))}
      </div>

      <div className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200">
        Open 3-layer remediation
      </div>
    </button>
  )
}

function PathCanvas({
  details,
  onOpenService,
  onOpenWholePlan,
}: {
  details: PathDetails
  onOpenService: (node: { id: string; name: string }) => void
  onOpenWholePlan: () => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [lines, setLines] = useState<Array<{ x1: number; y1: number; x2: number; y2: number }>>([])

  const lanes = useMemo(() => buildCanvasLanes(details), [details])
  const laneSequence = useMemo(() => LANE_ORDER.filter((lane) => lanes[lane].length > 0), [lanes])

  useEffect(() => {
    const updateLines = () => {
      if (!containerRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      const nextLines: Array<{ x1: number; y1: number; x2: number; y2: number }> = []

      laneSequence.forEach((lane, index) => {
        const nextLane = laneSequence[index + 1]
        if (!nextLane) return

        const sourceNodes = lanes[lane]
        const targetNodes = lanes[nextLane]
        const pairs = Math.max(sourceNodes.length, targetNodes.length)

        for (let i = 0; i < pairs; i += 1) {
          const source = sourceNodes[Math.min(i, sourceNodes.length - 1)]
          const target = targetNodes[Math.min(i, targetNodes.length - 1)]
          const sourceEl = source ? nodeRefs.current[source.id] : null
          const targetEl = target ? nodeRefs.current[target.id] : null
          if (!sourceEl || !targetEl) continue

          const sourceRect = sourceEl.getBoundingClientRect()
          const targetRect = targetEl.getBoundingClientRect()
          nextLines.push({
            x1: sourceRect.right - containerRect.left,
            y1: sourceRect.top + sourceRect.height / 2 - containerRect.top,
            x2: targetRect.left - containerRect.left,
            y2: targetRect.top + targetRect.height / 2 - containerRect.top,
          })
        }
      })

      setLines(nextLines)
    }

    updateLines()
    window.addEventListener("resize", updateLines)
    const resizeObserver = new ResizeObserver(updateLines)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }
    return () => {
      window.removeEventListener("resize", updateLines)
      resizeObserver.disconnect()
    }
  }, [laneSequence, lanes])

  const entry = formatName(details.path_summary.source.name)
  const target = formatName(details.path_summary.target.name)
  const identity = getPrimaryIdentity(details)
  const pathType = getPathType(details)

  return (
    <div className="rounded-[30px] border border-slate-800 bg-[#081222] p-6 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.9)]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-300">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white">Path Architecture</h3>
              <p className="mt-1 text-sm text-slate-400">
                Same architecture-map language, but filtered to the exact selected attack path.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-200">
            {pathType}
          </span>
          <span className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm font-medium text-slate-200">
            {details.path_summary.path_length} hops
          </span>
          <span className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm font-medium text-slate-200">
            {details.path_summary.total_cves > 0 ? `${details.path_summary.total_cves} CVEs` : "No CVEs required"}
          </span>
        </div>
      </div>

      <div className="mt-6 rounded-[24px] border border-slate-800 bg-slate-950/70 p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-slate-300">
            <span className="font-semibold text-white">{entry}</span>
            <span className="mx-2 text-slate-600">→</span>
            <span className="font-semibold text-white">{target}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
              {details.path_summary.evidence_type === "observed" ? "Observed" : "Configured"}
            </div>
            <div className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
              Risk {details.path_summary.risk_score}
            </div>
          </div>
        </div>

        <div ref={containerRef} className="relative mt-6 overflow-x-auto pb-4">
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" style={{ zIndex: 0 }}>
            {lines.map((line, index) => (
              <g key={index}>
                <line
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke="#4cc9f0"
                  strokeWidth="3"
                  strokeLinecap="round"
                  opacity="0.95"
                />
                <line
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke="#67e8f9"
                  strokeWidth="10"
                  strokeLinecap="round"
                  opacity="0.12"
                />
                <polygon
                  points={`${line.x2},${line.y2} ${line.x2 - 10},${line.y2 - 5} ${line.x2 - 10},${line.y2 + 5}`}
                  fill="#67e8f9"
                />
              </g>
            ))}
          </svg>

          <div className="relative z-10 grid min-w-[1600px] grid-cols-6 gap-8 px-2 pb-4">
            {LANE_ORDER.map((lane) => {
              const laneNodes = lanes[lane]
              const meta = LANE_META[lane]
              const LaneIcon = meta.icon

              return (
                <div key={lane} className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                    <LaneIcon className={`h-4 w-4 ${meta.headerColor}`} />
                    <span className={`text-sm font-semibold uppercase tracking-[0.16em] ${meta.headerColor}`}>
                      {meta.label} ({laneNodes.length})
                    </span>
                  </div>

                  <div className="space-y-4">
                    {laneNodes.length === 0 ? (
                      <div className="rounded-[18px] border border-dashed border-slate-800 bg-slate-950/40 px-4 py-8 text-center text-xs text-slate-600">
                        Not on this path
                      </div>
                    ) : (
                      laneNodes.map((node) => (
                        <PathNodeCard
                          key={node.id}
                          node={node}
                          onOpen={onOpenService}
                          registerRef={(id, element) => {
                            nodeRefs.current[id] = element
                          }}
                        />
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-[22px] border border-slate-800 bg-slate-950/70 p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Path Summary</div>
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Entry</div>
                <div className="mt-1 text-sm font-semibold text-white">{entry}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Identity</div>
                <div className="mt-1 text-sm font-semibold text-fuchsia-200">{identity}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Crown Jewel</div>
                <div className="mt-1 text-sm font-semibold text-emerald-200">{target}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Why This Matters</div>
                <div className="mt-1 text-sm text-slate-300">
                  {identity} can reach {target} through this exact route.
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[22px] border border-cyan-400/20 bg-cyan-500/10 p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Least Privilege</div>
            <p className="mt-3 text-sm leading-6 text-slate-200">
              Click any service on the path to open its 3-layer remediation page, or open the full path plan to execute the whole chain with rollback.
            </p>
            <button
              onClick={onOpenWholePlan}
              className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-900"
            >
              <Zap className="h-4 w-4 text-cyan-300" />
              Open path LP plan
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AttackPathsTab({ systemName }: { systemName: string }) {
  const [paths, setPaths] = useState<AttackPathItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [selectedDetails, setSelectedDetails] = useState<PathDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [showSimulation, setShowSimulation] = useState(false)
  const [selectedService, setSelectedService] = useState<{ id: string | null; name: string | null }>({
    id: null,
    name: null,
  })

  useEffect(() => {
    const fetchPaths = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/proxy/attack-paths/${systemName}`)
        if (!res.ok) {
          throw new Error("Failed to load attack paths")
        }
        const data = await res.json()
        setPaths(data.paths || [])
      } catch (err) {
        console.error("[AttackPathsTab] Failed to load paths", err)
        setError(err instanceof Error ? err.message : "Failed to load attack paths")
      } finally {
        setLoading(false)
      }
    }

    fetchPaths()
  }, [systemName])

  const crownJewelPaths = useMemo(() => {
    const filtered = paths.filter((path) => {
      const targetType = path.nodes[path.nodes.length - 1]?.type
      return CROWN_JEWEL_TYPES.has(targetType)
    })

    filtered.sort((a, b) => {
      if (b.risk_score !== a.risk_score) return b.risk_score - a.risk_score
      if (b.path_length !== a.path_length) return b.path_length - a.path_length
      return a.target_name.localeCompare(b.target_name)
    })

    return filtered
  }, [paths])

  const visiblePaths = showAll ? crownJewelPaths : crownJewelPaths.slice(0, 8)
  const selectedPath = crownJewelPaths.find((path) => path.id === selectedPathId) || visiblePaths[0] || null

  useEffect(() => {
    if (!crownJewelPaths.length) {
      setSelectedPathId(null)
      return
    }

    const stillExists = crownJewelPaths.some((path) => path.id === selectedPathId)
    if (!selectedPathId || !stillExists) {
      setSelectedPathId(crownJewelPaths[0].id)
    }
  }, [crownJewelPaths, selectedPathId])

  useEffect(() => {
    if (!selectedPathId) {
      setSelectedDetails(null)
      return
    }

    const fetchDetails = async () => {
      setDetailsLoading(true)
      setDetailsError(null)
      try {
        const res = await fetch(`/api/proxy/attack-paths/${systemName}/${selectedPathId}/details`)
        if (!res.ok) {
          throw new Error("Failed to load attack path flow")
        }
        const data = await res.json()
        setSelectedDetails(data)
      } catch (err) {
        console.error("[AttackPathsTab] Failed to load selected path", err)
        setDetailsError(err instanceof Error ? err.message : "Failed to load attack path flow")
      } finally {
        setDetailsLoading(false)
      }
    }

    fetchDetails()
  }, [systemName, selectedPathId])

  const selectedPathContext = selectedDetails ? buildPathContext(selectedDetails) : undefined

  return (
    <div className="max-w-[1900px] mx-auto px-8 py-6 space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.2)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Attack Paths</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">
                The main System Architecture map stays untouched. This tab shows the exact attack flows to crown jewels, one path at a time, in the same architecture language.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
              {visiblePaths.length} visible paths
            </span>
            <span className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-sm font-medium text-fuchsia-700">
              {crownJewelPaths.length} crown-jewel routes
            </span>
          </div>
        </div>
      </div>

      {loading && (
        <div className="rounded-[24px] border border-slate-200 bg-white p-12 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-500" />
          <p className="mt-3 text-sm text-slate-500">Loading attack paths...</p>
        </div>
      )}

      {error && (
        <div className="rounded-[24px] border border-rose-200 bg-rose-50 p-6">
          <div className="flex items-center gap-3 text-rose-700">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">{error}</span>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.16)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">All Attack Paths</div>
                <h3 className="mt-2 text-lg font-bold text-slate-900">Choose the path to inspect</h3>
              </div>
              {crownJewelPaths.length > 8 && (
                <button
                  onClick={() => setShowAll((value) => !value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  {showAll ? "Top 8" : "Show all"}
                </button>
              )}
            </div>

            <div className="mt-5 space-y-3">
              {visiblePaths.map((path, index) => {
                const isSelected = selectedPath?.id === path.id
                const sourceName = formatName(path.nodes[0]?.name || "Unknown")
                const targetName = formatName(path.target_name)
                const pathType = getPathLabel(path)

                return (
                  <button
                    key={path.id}
                    onClick={() => setSelectedPathId(path.id)}
                    className={`w-full rounded-[22px] border p-4 text-left transition-all ${
                      isSelected
                        ? "border-cyan-300 bg-cyan-50 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Path {index + 1}</div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">
                          {sourceName} <span className="text-slate-400">→</span> {targetName}
                        </div>
                      </div>

                      <div className={`rounded-2xl px-3 py-2 text-right ${isSelected ? "bg-cyan-500/10" : "bg-slate-100"}`}>
                        <div className="text-lg font-bold text-slate-900">{path.risk_score}</div>
                        <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{pathType}</div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                        {path.path_length} hops
                      </span>
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                        {path.total_cves > 0 ? `${path.total_cves} CVEs` : "No CVEs required"}
                      </span>
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                        {path.evidence_type === "observed" ? "Observed" : "Configured"}
                      </span>
                      {isSelected && (
                        <span className="rounded-lg bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-700">Selected</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-6">
            {detailsLoading && (
              <div className="rounded-[28px] border border-slate-200 bg-white p-12 text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-cyan-500" />
                <p className="mt-3 text-sm text-slate-500">Loading selected path flow...</p>
              </div>
            )}

            {detailsError && (
              <div className="rounded-[24px] border border-rose-200 bg-rose-50 p-6">
                <div className="flex items-center gap-3 text-rose-700">
                  <AlertTriangle className="h-5 w-5" />
                  <span className="font-medium">{detailsError}</span>
                </div>
              </div>
            )}

            {!detailsLoading && !detailsError && selectedDetails && (
              <PathCanvas
                details={selectedDetails}
                onOpenService={(node) => {
                  setSelectedService({ id: node.id, name: node.name })
                  setShowSimulation(true)
                }}
                onOpenWholePlan={() => {
                  setSelectedService({ id: null, name: selectedDetails.path_summary.target.name })
                  setShowSimulation(true)
                }}
              />
            )}
          </div>
        </div>
      )}

      {selectedDetails && (
        <AttackSimulationPanel
          isOpen={showSimulation}
          onClose={() => setShowSimulation(false)}
          systemName={systemName}
          pathId={selectedDetails.path_id}
          pathName={`${formatName(selectedDetails.path_summary.source.name)} → ${formatName(selectedDetails.path_summary.target.name)}`}
          pathContext={selectedPathContext}
          initialSelectedServiceId={selectedService.id}
          initialSelectedServiceName={selectedService.name}
        />
      )}
    </div>
  )
}
