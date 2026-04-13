"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react"
import {
  AlertTriangle,
  Crown,
  Database,
  Key,
  Loader2,
  Lock,
  Server,
  Shield,
  Target,
  Zap,
} from "lucide-react"
import { AttackSimulationPanel } from "./dependency-map/attack-simulation-panel"
import { IAMPermissionAnalysisModal } from "@/components/iam-permission-analysis-modal"
import { S3PolicyAnalysisModal } from "@/components/s3-policy-analysis-modal"
import { SGLeastPrivilegeModal } from "@/components/sg-least-privilege-modal"
import {
  ConnectionLinesSVG,
  IAMRoleNode,
  NACLNode,
  SecurityGroupPanel,
  ServiceNodeBox,
  type SecurityCheckpoint,
  type ServiceNode,
  type SystemArchitecture,
  type TrafficFlow,
} from "./dependency-map/traffic-flow-map"

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

const CROWN_JEWEL_TYPES = new Set(["S3Bucket", "S3", "DynamoDBTable", "DynamoDB", "RDS", "RDSInstance", "Aurora"])

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

function shortName(name: string, maxLen = 18) {
  const formatted = formatName(name)
  if (formatted.length <= maxLen) return formatted
  return `${formatted.slice(0, maxLen)}...`
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
    details.path_nodes.some((node) => /IAMRole|Role/i.test(node.type))
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
  return formatName(roleFromIam || roleFromNodes || details.path_summary.source.name)
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

function isS3Type(type: string) {
  return /S3|Bucket/i.test(type)
}

function mapResourceNodeType(type: string) {
  if (/S3|Bucket/i.test(type)) return "storage"
  if (/DynamoDB/i.test(type)) return "dynamodb"
  if (/RDS|Aurora|Database/i.test(type)) return "database"
  return "storage"
}

function mapEntryNodeType(type: string): ServiceNode["type"] {
  if (/CloudTrailPrincipal|Principal/i.test(type)) return "principal"
  if (/IAMRole|Role/i.test(type)) return "iam_role"
  if (/Lambda/i.test(type)) return "lambda"
  if (/APIGateway|ApiGateway/i.test(type)) return "api_gateway"
  if (/LoadBalancer|ALB|NLB/i.test(type)) return "load_balancer"
  if (/Internet|External/i.test(type)) return "internet"
  if (/EC2|Instance|Compute/i.test(type)) return "compute"
  return "principal"
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

type PathServiceTarget = {
  id: string
  name: string
  type: string
  resourceArn?: string
}

function buildPathArchitecture(details: PathDetails): SystemArchitecture {
  const source = details.path_nodes[0] || {
    id: details.path_summary.source.name,
    name: details.path_summary.source.name,
    type: details.path_summary.source.type,
  }

  const dataNodes = details.path_nodes.filter((node, index) => isDataType(node.type) || index === details.path_nodes.length - 1)
  const uniqueDataNodes = dataNodes.filter((node, index, arr) => arr.findIndex((candidate) => candidate.id === node.id) === index)
  const targetNode = uniqueDataNodes[uniqueDataNodes.length - 1] || {
    id: details.path_summary.target.name,
    name: details.path_summary.target.name,
    type: details.path_summary.target.type,
  }

  const computeServices: ServiceNode[] = [
    {
      id: source.id,
      name: formatName(source.name),
      shortName: shortName(source.name),
      type: mapEntryNodeType(source.type),
      instanceId: source.type,
    },
  ]

  const resources: ServiceNode[] = uniqueDataNodes.map((node) => ({
    id: node.id,
    name: formatName(node.name),
    shortName: shortName(node.name),
    type: mapResourceNodeType(node.type),
    instanceId: node.type,
  }))

  if (resources.length === 0) {
    resources.push({
      id: targetNode.id,
      name: formatName(targetNode.name),
      shortName: shortName(targetNode.name),
      type: mapResourceNodeType(targetNode.type),
      instanceId: targetNode.type,
    })
  }

  const securityGroups: SecurityCheckpoint[] = details.network_layer.security_groups.slice(0, 2).map((sg) => ({
    id: sg.sg_id,
    type: "security_group",
    name: sg.sg_name,
    shortName: shortName(sg.sg_name),
    usedCount: sg.risky_rules.filter((rule) => rule.risk?.toLowerCase() !== "unused").length,
    totalCount: sg.risky_rules.length || 0,
    gapCount: sg.risky_rules.filter((rule) => rule.risk?.toLowerCase() === "high" || rule.risk?.toLowerCase() === "critical").length,
    connectedSources: [source.id],
    connectedTargets: resources.map((resource) => resource.id),
    rules: sg.risky_rules.map((rule) => ({
      direction: rule.direction === "egress" ? "egress" : "ingress",
      protocol: rule.protocol || "tcp",
      fromPort: typeof rule.port === "number" ? rule.port : null,
      toPort: typeof rule.port === "number" ? rule.port : null,
      portDisplay: String(rule.port ?? "All"),
      source: rule.source || "unknown",
      sourceType: "cidr",
      status: "used",
      flowCount: 1,
      lastSeen: null,
      isPublic: (rule.source || "").includes("0.0.0.0/0"),
    })),
  }))

  const nacls: SecurityCheckpoint[] = details.path_nodes
    .filter((node) => isNaclType(node.type))
    .map((node) => ({
      id: node.id,
      type: "nacl",
      name: node.name,
      shortName: shortName(node.name),
      usedCount: 1,
      totalCount: 1,
      gapCount: 0,
      connectedSources: [source.id],
      connectedTargets: resources.map((resource) => resource.id),
    }))

  const iamRoles: SecurityCheckpoint[] =
    details.identity_layer.roles.length > 0
      ? details.identity_layer.roles.slice(0, 2).map((role) => {
          const lpGap = details.identity_layer.least_privilege_gaps.find((gap) => gap.role === role.role_name)
          return {
            id: role.role_id || role.role_name,
            type: "iam_role" as const,
            name: role.role_name,
            shortName: shortName(role.role_name),
            usedCount: role.observed_actions_count || 0,
            totalCount: role.permission_count || 0,
            gapCount: lpGap?.allowed && lpGap.observed ? Math.max(lpGap.allowed - lpGap.observed, 0) : 0,
            connectedSources: [source.id],
            connectedTargets: resources.map((resource) => resource.id),
          }
        })
      : details.path_nodes
          .filter((node) => isIdentityType(node.type))
          .map((node) => ({
            id: node.id,
            type: "iam_role" as const,
            name: node.name,
            shortName: shortName(node.name),
            usedCount: 1,
            totalCount: 1,
            gapCount: 0,
            connectedSources: [source.id],
            connectedTargets: resources.map((resource) => resource.id),
          }))

  const primaryResource = resources[0]
  const flows: TrafficFlow[] = primaryResource
    ? [
        {
          sourceId: computeServices[0].id,
          targetId: primaryResource.id,
          sgId: securityGroups[0]?.id,
          naclId: nacls[0]?.id,
          roleId: iamRoles[0]?.id,
          ports: details.network_layer.open_ports.length > 0 ? details.network_layer.open_ports.map(String) : [details.network_layer.protocols[0] || "observed"],
          protocol: details.network_layer.protocols[0] || "observed",
          bytes: details.path_summary.evidence_type === "observed" ? 512_000_000 : 0,
          connections: 1,
          isActive: details.path_summary.evidence_type === "observed",
        },
      ]
    : []

  return {
    computeServices,
    resources,
    securityGroups,
    nacls,
    iamRoles,
    flows,
    totalBytes: flows.reduce((sum, flow) => sum + flow.bytes, 0),
    totalConnections: flows.reduce((sum, flow) => sum + flow.connections, 0),
    totalGaps:
      securityGroups.reduce((sum, sg) => sum + sg.gapCount, 0) +
      nacls.reduce((sum, nacl) => sum + nacl.gapCount, 0) +
      iamRoles.reduce((sum, role) => sum + role.gapCount, 0),
  }
}

function ApiCallNode({
  resource,
  isObserved,
  onClick,
}: {
  resource: ServiceNode
  isObserved: boolean
  onClick?: () => void
}) {
  return (
    <div
      data-api-id={resource.id}
      className={`relative group ${onClick ? "cursor-pointer" : "cursor-default"}`}
      onClick={onClick}
    >
      <div className="min-w-[160px] rounded-xl border-2 border-lime-500/50 bg-lime-500/10 px-4 py-3 transition-all duration-300 hover:border-lime-400 hover:bg-lime-500/20">
        <div className="mb-1 flex items-center justify-center gap-2">
          <Zap className="h-4 w-4 text-lime-400" />
          <span className="truncate text-sm font-semibold text-white">{resource.shortName}</span>
        </div>
        <div className="text-center text-xs text-lime-400">{isObserved ? "Observed access" : "Configured path"}</div>
        <div className="mt-1 text-center text-[10px] text-slate-400">{isObserved ? "1 flow (simulated)" : "Path flow"}</div>
      </div>
    </div>
  )
}

function PathScopedArchitecture({
  details,
  onOpenService,
  onOpenWholePlan,
}: {
  details: PathDetails
  onOpenService: (node: PathServiceTarget) => void
  onOpenWholePlan: () => void
}) {
  const architecture = useMemo(() => buildPathArchitecture(details), [details])
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const entry = formatName(details.path_summary.source.name)
  const identity = getPrimaryIdentity(details)
  const target = formatName(details.path_summary.target.name)
  const pathType = getPathType(details)
  const entryTypeLabel = details.path_summary.source.type || "Entry"

  const computeFlowInfo = useMemo(() => {
    const map = new Map<string, { bytes: number; connections: number; ports: string[] }>()
    architecture.flows.forEach((flow) => {
      map.set(flow.sourceId, { bytes: flow.bytes, connections: flow.connections, ports: flow.ports })
    })
    return map
  }, [architecture.flows])

  const resourceFlowInfo = useMemo(() => {
    const map = new Map<string, { bytes: number; connections: number; ports: string[] }>()
    architecture.flows.forEach((flow) => {
      map.set(flow.targetId, { bytes: flow.bytes, connections: flow.connections, ports: flow.ports })
    })
    return map
  }, [architecture.flows])

  const lanes = useMemo(() => {
    const items: Array<{
      key: string
      title: string
      icon: ReactNode
      content: ReactNode
    }> = [
      {
        key: "compute",
        title: `${entryTypeLabel} (${architecture.computeServices.length})`,
        icon: <Target className="h-4 w-4 text-cyan-300" />,
        content: (
          <div className="space-y-3">
            {architecture.computeServices.map((node) => (
              <div key={node.id} data-compute-id={node.id} className="relative">
                <ServiceNodeBox
                  node={node}
                  position="left"
                  flowInfo={computeFlowInfo.get(node.id)}
                  isHighlighted={hoveredId === node.id}
                  onHover={setHoveredId}
                />
              </div>
            ))}
          </div>
        ),
      },
    ]

    if (architecture.securityGroups.length > 0) {
      items.push({
        key: "security-groups",
        title: `Security Groups (${architecture.securityGroups.length})`,
        icon: <Shield className="h-4 w-4 text-orange-400" />,
        content: (
          <div className="space-y-3">
            {architecture.securityGroups.map((sg) => (
              <div key={sg.id} data-sg-id={sg.id}>
                <SecurityGroupPanel
                  sg={sg}
                  isExpanded={false}
                  onToggle={() => onOpenService({ id: sg.id, name: sg.name, type: "SecurityGroup" })}
                  isHighlighted={hoveredId === sg.id}
                  onHover={setHoveredId}
                  onDetails={() => onOpenService({ id: sg.id, name: sg.name, type: "SecurityGroup" })}
                />
              </div>
            ))}
          </div>
        ),
      })
    }

    if (architecture.nacls.length > 0) {
      items.push({
        key: "nacls",
        title: `NACLs (${architecture.nacls.length})`,
        icon: <Lock className="h-4 w-4 text-cyan-400" />,
        content: (
          <div className="space-y-3">
            {architecture.nacls.map((nacl) => (
              <div key={nacl.id} data-nacl-id={nacl.id} className="relative">
                <NACLNode
                  nacl={nacl}
                  isHighlighted={hoveredId === nacl.id}
                  onHover={setHoveredId}
                />
              </div>
            ))}
          </div>
        ),
      })
    }

    if (architecture.iamRoles.length > 0) {
      items.push({
        key: "iam-roles",
        title: `IAM Roles (${architecture.iamRoles.length})`,
        icon: <Key className="h-4 w-4 text-pink-400" />,
        content: (
          <div className="space-y-3">
            {architecture.iamRoles.map((role) => (
              <div key={role.id} data-role-id={role.id}>
                <IAMRoleNode
                  role={role}
                  isHighlighted={hoveredId === role.id}
                  onHover={setHoveredId}
                  onClick={() => onOpenService({ id: role.id, name: role.name, type: "IAMRole" })}
                />
              </div>
            ))}
          </div>
        ),
      })
    }

    if (architecture.resources.length > 0) {
      items.push({
        key: "api-calls",
        title: `API Calls (${architecture.resources.length})`,
        icon: <Zap className="h-4 w-4 text-lime-400" />,
        content: (
          <div className="space-y-3">
            {architecture.resources.map((resource) => {
              const resourceType = resource.instanceId || resource.type
              return (
                <ApiCallNode
                  key={`api-${resource.id}`}
                  resource={resource}
                  isObserved={details.path_summary.evidence_type === "observed"}
                  onClick={
                    isS3Type(resourceType)
                      ? () => onOpenService({ id: resource.id, name: resource.name, type: resourceType })
                      : undefined
                  }
                />
              )
            })}
          </div>
        ),
      })

      items.push({
        key: "resources",
        title: `Resources (${architecture.resources.length})`,
        icon: <Database className="h-4 w-4 text-purple-400" />,
        content: (
          <div className="space-y-3">
            {architecture.resources.map((node, index) => {
              const isTarget = index === architecture.resources.length - 1
              const resourceType = node.instanceId || node.type
              return (
                <div key={node.id} data-resource-id={node.id} className="relative">
                  {isTarget && (
                    <div className="absolute -top-2 -right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 shadow-lg animate-pulse">
                      <Crown className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}
                  <ServiceNodeBox
                    node={node}
                    position="right"
                    flowInfo={resourceFlowInfo.get(node.id)}
                    isHighlighted={hoveredId === node.id}
                    onHover={setHoveredId}
                    onClick={
                      isS3Type(resourceType)
                        ? () => onOpenService({ id: node.id, name: node.name, type: resourceType })
                        : undefined
                    }
                  />
                </div>
              )
            })}
          </div>
        ),
      })
    }

    return items
  }, [
    architecture.computeServices,
    architecture.iamRoles,
    architecture.nacls,
    architecture.resources,
    architecture.securityGroups,
    computeFlowInfo,
    details.path_summary.evidence_type,
    hoveredId,
    onOpenService,
    resourceFlowInfo,
  ])

  return (
    <div className="rounded-[30px] border border-slate-800 bg-[#081222] p-6 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.9)]">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-300">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white">Selected Attack Path</h3>
              <p className="mt-1 text-sm text-slate-400">Same map primitives, but scoped to this exact crown-jewel route.</p>
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

      <div className="rounded-[24px] border border-slate-800 bg-slate-950/70 p-5">
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

        <div ref={containerRef} className="relative mt-6 min-h-[320px] overflow-hidden">
          <ConnectionLinesSVG
            architecture={architecture}
            hoveredId={hoveredId}
            containerRef={containerRef as RefObject<HTMLDivElement>}
            animate
            attackPathEdges={new Set(architecture.flows.map((flow) => `${flow.sourceId}->${flow.targetId}`))}
            heatmapMode={false}
            ghostedNodeIds={new Set<string>()}
          />

          <div
            className="relative grid gap-3 items-start xl:gap-4"
            style={{ zIndex: 2, gridTemplateColumns: `repeat(${lanes.length}, minmax(0, 1fr))` }}
          >
            {lanes.map((lane) => (
              <div key={lane.key} className="min-w-0">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {lane.icon}
                  {lane.title}
                </div>
                {lane.content}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-[22px] border border-slate-800 bg-slate-950/70 p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Path Summary</div>
            <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Entry</div>
                <div className="mt-1 text-sm font-semibold text-white break-all">{entry}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Identity</div>
                <div className="mt-1 text-sm font-semibold text-fuchsia-200 break-all">{identity}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Crown Jewel</div>
                <div className="mt-1 text-sm font-semibold text-emerald-200 break-all">{target}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Route</div>
                <div className="mt-1 text-sm text-slate-300">{pathType} • {details.path_summary.path_length} hops</div>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
              <span className="font-semibold text-white">Why this route matters:</span>{" "}
              {identity} can reach {target} through this exact observed route.
            </div>
          </div>

          <div className="rounded-[22px] border border-cyan-400/20 bg-cyan-500/10 p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Least Privilege</div>
            <p className="mt-3 text-sm leading-6 text-slate-200">
              Click an S3 bucket, security group, or IAM role on the path to open its native remediation page. Use the full path plan only when you want the chain-wide LP workflow.
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
  const [iamModalOpen, setIamModalOpen] = useState(false)
  const [selectedIAMRole, setSelectedIAMRole] = useState<string | null>(null)
  const [s3ModalOpen, setS3ModalOpen] = useState(false)
  const [selectedS3Bucket, setSelectedS3Bucket] = useState<string | null>(null)
  const [selectedS3Resource, setSelectedS3Resource] = useState<any>(null)
  const [sgModalOpen, setSgModalOpen] = useState(false)
  const [selectedSGId, setSelectedSGId] = useState<string | null>(null)
  const [selectedSGName, setSelectedSGName] = useState<string | null>(null)

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

  const openNativeRemediation = (target: PathServiceTarget) => {
    if (isIdentityType(target.type)) {
      setSelectedIAMRole(formatName(target.name))
      setIamModalOpen(true)
      return
    }

    if (isSecurityGroupType(target.type)) {
      setSelectedSGId(target.id)
      setSelectedSGName(formatName(target.name))
      setSgModalOpen(true)
      return
    }

    if (isS3Type(target.type)) {
      const bucketName = formatName(target.name)
      setSelectedS3Bucket(bucketName)
      setSelectedS3Resource({
        id: target.id,
        resourceType: "S3Bucket",
        resourceName: bucketName,
        resourceArn: target.resourceArn || target.name,
        systemName,
      })
      setS3ModalOpen(true)
    }
  }

  return (
    <div className="mx-auto max-w-[1760px] px-5 py-6 space-y-6 xl:px-6">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.2)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Attack Paths</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">
                The main System Architecture map stays untouched. This tab shows the exact attack flows to crown jewels, one path at a time, using the same map primitives.
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
        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
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
              <PathScopedArchitecture
                details={selectedDetails}
                onOpenService={openNativeRemediation}
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

      <IAMPermissionAnalysisModal
        isOpen={iamModalOpen}
        onClose={() => {
          setIamModalOpen(false)
          setSelectedIAMRole(null)
        }}
        roleName={selectedIAMRole || ""}
        systemName={systemName}
      />

      <S3PolicyAnalysisModal
        isOpen={s3ModalOpen}
        onClose={() => {
          setS3ModalOpen(false)
          setSelectedS3Bucket(null)
          setSelectedS3Resource(null)
        }}
        bucketName={selectedS3Bucket || ""}
        systemName={systemName}
        resourceData={selectedS3Resource}
      />

      <SGLeastPrivilegeModal
        isOpen={sgModalOpen}
        onClose={() => {
          setSgModalOpen(false)
          setSelectedSGId(null)
          setSelectedSGName(null)
        }}
        sgId={selectedSGId || ""}
        sgName={selectedSGName || undefined}
        systemName={systemName}
      />
    </div>
  )
}
