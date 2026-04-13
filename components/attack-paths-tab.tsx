"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react"
import {
  AlertTriangle,
  Database,
  Key,
  Loader2,
  Lock,
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
  operational_route?: {
    available: boolean
    route_type: string
    score?: number
    route_count?: number
    reason?: string
    observed?: boolean
    source?: { id: string; name: string; type: string } | null
    target?: { id: string; name: string; type: string }
    steps: Array<
      | {
          kind: "node"
          lane: string
          id: string
          name: string
          type: string
          category?: string
          internet_exposed?: boolean
        }
      | {
          kind: "action"
          lane: string
          edge_type: string
          name: string
          action?: string | null
          protocol?: string | null
          observed?: boolean
        }
    >
    routes?: Array<{
      available: boolean
      route_type: string
      score?: number
      observed?: boolean
      source?: { id: string; name: string; type: string } | null
      target?: { id: string; name: string; type: string }
      steps: Array<
        | {
            kind: "node"
            lane: string
            id: string
            name: string
            type: string
            category?: string
            internet_exposed?: boolean
          }
        | {
            kind: "action"
            lane: string
            edge_type: string
            name: string
            action?: string | null
            protocol?: string | null
            observed?: boolean
          }
      >
    }>
  }
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

function scoreToRiskLabel(score: number) {
  if (score >= 75) return "Critical"
  if (score >= 50) return "High"
  if (score >= 25) return "Medium"
  return "Low"
}

function getRiskLabel(path: AttackPathItem) {
  return scoreToRiskLabel(path.risk_score)
}

function getDetailsRiskLabel(details: PathDetails) {
  const raw = details.path_summary.risk_level?.trim()
  if (raw) {
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
  }
  return scoreToRiskLabel(details.path_summary.risk_score)
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

function mapAnyNodeType(type: string): ServiceNode["type"] {
  if (isIdentityType(type)) return "iam_role"
  if (isSecurityGroupType(type)) return "security_group"
  if (isNaclType(type)) return "nacl"
  if (isDataType(type)) return mapResourceNodeType(type)
  return mapEntryNodeType(type)
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

function pathNodeToServiceNode(node: { id: string; name: string; type: string }): ServiceNode {
  const mappedType = isIdentityType(node.type)
    ? "iam_role"
    : isDataType(node.type)
      ? mapResourceNodeType(node.type)
      : mapEntryNodeType(node.type)

  return {
    id: node.id,
    name: formatName(node.name),
    shortName: shortName(node.name),
    type: mappedType,
    instanceId: node.type,
  }
}

function buildPathArchitecture(details: PathDetails): SystemArchitecture {
  const orderedPathNodes = (details.path_nodes.length > 0 ? details.path_nodes : [{
    id: details.path_summary.source.name,
    name: details.path_summary.source.name,
    type: details.path_summary.source.type,
  }]).filter((node, index, arr) => arr.findIndex((candidate) => candidate.id === node.id) === index)

  const source = orderedPathNodes[0]
  const pathHops = orderedPathNodes.slice(1)
  let targetNode = pathHops[pathHops.length - 1]
  for (let index = pathHops.length - 1; index >= 0; index -= 1) {
    if (isDataType(pathHops[index].type)) {
      targetNode = pathHops[index]
      break
    }
  }
  if (!targetNode) {
    targetNode = {
      id: details.path_summary.target.name,
      name: details.path_summary.target.name,
      type: details.path_summary.target.type,
    }
  }

  const computeServices: ServiceNode[] = [pathNodeToServiceNode(source)]

  const resources: ServiceNode[] = orderedPathNodes
    .filter((node) => isDataType(node.type))
    .map(pathNodeToServiceNode)

  if (resources.length === 0) {
    resources.push(pathNodeToServiceNode(targetNode))
  }

  const securityGroups: SecurityCheckpoint[] = orderedPathNodes
    .filter((node) => isSecurityGroupType(node.type))
    .map((node) => ({
      id: node.id,
      type: "security_group",
      name: formatName(node.name),
      shortName: shortName(node.name),
      usedCount: 0,
      totalCount: 0,
      gapCount: 0,
      connectedSources: [source.id],
      connectedTargets: resources.map((resource) => resource.id),
      rules: [],
    }))

  const nacls: SecurityCheckpoint[] = orderedPathNodes
    .filter((node) => isNaclType(node.type))
    .map((node) => ({
      id: node.id,
      type: "nacl",
      name: formatName(node.name),
      shortName: shortName(node.name),
      usedCount: 0,
      totalCount: 0,
      gapCount: 0,
      connectedSources: [source.id],
      connectedTargets: resources.map((resource) => resource.id),
    }))

  const iamRoles: SecurityCheckpoint[] = orderedPathNodes
    .filter((node) => isIdentityType(node.type))
    .map((node) => {
      const matchingRole = details.identity_layer.roles.find(
        (role) => formatName(role.role_name) === formatName(node.name) || role.role_id === node.id
      )
      const lpGap = details.identity_layer.least_privilege_gaps.find(
        (gap) => formatName(gap.role) === formatName(node.name)
      )

      return {
        id: node.id,
        type: "iam_role" as const,
        name: formatName(node.name),
        shortName: shortName(node.name),
        usedCount: matchingRole?.observed_actions_count || 0,
        totalCount: matchingRole?.permission_count || 0,
        gapCount: lpGap?.allowed && lpGap.observed ? Math.max(lpGap.allowed - lpGap.observed, 0) : 0,
        connectedSources: [source.id],
        connectedTargets: resources.map((resource) => resource.id),
      }
    })

  const primaryResource = resources[resources.length - 1]
  const flows: TrafficFlow[] = primaryResource
    ? [
        {
          sourceId: computeServices[0].id,
          targetId: primaryResource.id,
          sgId: securityGroups[0]?.id,
          naclId: nacls[0]?.id,
          roleId: iamRoles[0]?.id,
          ports: [],
          protocol: "observed",
          bytes: 0,
          connections: 0,
          isActive: true,
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

function PathScopedArchitecture({
  details,
  onOpenService,
}: {
  details: PathDetails
  onOpenService: (node: PathServiceTarget) => void
}) {
  const architecture = useMemo(() => buildPathArchitecture(details), [details])
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
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
        key: "resources",
        title: `Resources (${architecture.resources.length})`,
        icon: <Database className="h-4 w-4 text-purple-400" />,
        content: (
          <div className="space-y-3">
            {architecture.resources.map((node) => {
              const resourceType = node.instanceId || node.type
              return (
                <div key={node.id} data-resource-id={node.id} className="relative">
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
            <span className="font-semibold text-white">{formatName(details.path_summary.source.name)}</span>
            <span className="mx-2 text-slate-600">→</span>
            <span className="font-semibold text-white">{formatName(details.path_summary.target.name)}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
              {details.path_summary.evidence_type === "observed" ? "Observed" : "Configured"}
            </div>
            <div className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
              {getDetailsRiskLabel(details)} risk
            </div>
          </div>
        </div>

        <div ref={containerRef} className="relative mt-6 overflow-x-auto overflow-y-hidden pb-2">
          <ConnectionLinesSVG
            architecture={architecture}
            hoveredId={hoveredId}
            containerRef={containerRef as RefObject<HTMLDivElement>}
            animate
            attackPathEdges={new Set(architecture.flows.map((flow) => `${flow.sourceId}->${flow.targetId}`))}
            heatmapMode={false}
            ghostedNodeIds={new Set<string>()}
          />

          <div className="mx-auto w-fit min-w-full">
            <div
              className="relative grid items-start gap-4 xl:gap-5"
              style={{
                zIndex: 2,
                gridAutoFlow: "column",
                gridAutoColumns: "minmax(240px, 300px)",
              }}
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
        </div>
      </div>
    </div>
  )
}

function OperationalRoutePanel({
  details,
  onOpenService,
}: {
  details: PathDetails
  onOpenService: (node: PathServiceTarget) => void
}) {
  const route = details.operational_route
  const routes = route?.routes?.length ? route.routes : route ? [route] : []
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0)
  const activeRoute = routes[selectedRouteIndex] || routes[0]

  useEffect(() => {
    setSelectedRouteIndex(0)
  }, [details.path_id, routes.length])

  if (!activeRoute?.available || !activeRoute.steps?.length) {
    return null
  }

  const renderStep = (step: NonNullable<PathDetails["operational_route"]>["steps"][number], index: number) => {
    if (step.kind === "action") {
      const actionNode: ServiceNode = {
        id: `action-${index}-${step.name}`,
        name: step.name,
        shortName: shortName(step.name, 16),
        type: "api_call",
        instanceId: step.action || step.protocol || step.edge_type,
      }

      return (
        <div key={`action-${index}`} className="min-w-[180px] max-w-[220px]">
          <ServiceNodeBox
            node={actionNode}
            position="right"
            isHighlighted={false}
            onHover={() => {}}
          />
        </div>
      )
    }

    const nodeType = mapAnyNodeType(step.type)

    if (nodeType === "security_group") {
      const sg: SecurityCheckpoint = {
        id: step.id,
        type: "security_group",
        name: formatName(step.name),
        shortName: shortName(step.name),
        usedCount: 0,
        totalCount: 0,
        gapCount: 0,
        connectedSources: [],
        connectedTargets: [],
        rules: [],
      }

      return (
        <div key={step.id} className="min-w-[220px] max-w-[260px]">
          <SecurityGroupPanel
            sg={sg}
            isExpanded={false}
            onToggle={() => onOpenService({ id: step.id, name: step.name, type: step.type })}
            isHighlighted={false}
            onHover={() => {}}
            onDetails={() => onOpenService({ id: step.id, name: step.name, type: step.type })}
          />
        </div>
      )
    }

    if (nodeType === "nacl") {
      const nacl: SecurityCheckpoint = {
        id: step.id,
        type: "nacl",
        name: formatName(step.name),
        shortName: shortName(step.name),
        usedCount: 0,
        totalCount: 0,
        gapCount: 0,
        connectedSources: [],
        connectedTargets: [],
      }

      return (
        <div key={step.id} className="min-w-[180px] max-w-[220px]">
          <NACLNode
            nacl={nacl}
            isHighlighted={false}
            onHover={() => {}}
          />
        </div>
      )
    }

    if (nodeType === "iam_role") {
      const role: SecurityCheckpoint = {
        id: step.id,
        type: "iam_role",
        name: formatName(step.name),
        shortName: shortName(step.name),
        usedCount: 0,
        totalCount: 0,
        gapCount: 0,
        connectedSources: [],
        connectedTargets: [],
      }

      return (
        <div key={step.id} className="min-w-[220px] max-w-[260px]">
          <IAMRoleNode
            role={role}
            isHighlighted={false}
            onHover={() => {}}
            onClick={() => onOpenService({ id: step.id, name: step.name, type: step.type })}
          />
        </div>
      )
    }

    const node: ServiceNode = {
      id: step.id,
      name: formatName(step.name),
      shortName: shortName(step.name),
      type: nodeType,
      instanceId: step.type,
    }

    const clickable = isS3Type(step.type)
    return (
      <div key={step.id} className="min-w-[220px] max-w-[260px]">
        <ServiceNodeBox
          node={node}
          position={index === 0 ? "left" : "right"}
          isHighlighted={false}
          onHover={() => {}}
          onClick={clickable ? () => onOpenService({ id: step.id, name: step.name, type: step.type }) : undefined}
        />
      </div>
    )
  }

  return (
    <div className="rounded-[30px] border border-slate-800 bg-[#081222] p-6 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.9)]">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white">Operational Access Path</h3>
              <p className="mt-1 text-sm text-slate-400">Observed service flow to the same crown jewel, kept separate from the attack route.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {activeRoute.observed && (
            <span className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-200">
              Observed Service Flow
            </span>
          )}
          <span className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm font-medium text-slate-200">
            {activeRoute.steps.length} steps
          </span>
        </div>
      </div>

      {routes.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {routes.map((candidate, index) => {
            const selected = index === selectedRouteIndex
            return (
              <button
                key={`route-${index}-${candidate.source?.id || "unknown"}`}
                onClick={() => setSelectedRouteIndex(index)}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  selected
                    ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-100"
                    : "border-slate-700 bg-slate-900/50 text-slate-300 hover:bg-slate-900/80"
                }`}
              >
                Route {index + 1}: {formatName(candidate.source?.name || details.path_summary.source.name)}
              </button>
            )
          })}
        </div>
      )}

      <div className="rounded-[24px] border border-slate-800 bg-slate-950/70 p-5">
        <div className="text-sm text-slate-300">
          <span className="font-semibold text-white">{formatName(activeRoute.source?.name || details.path_summary.source.name)}</span>
          <span className="mx-2 text-slate-600">→</span>
          <span className="font-semibold text-white">{formatName(activeRoute.target?.name || details.path_summary.target.name)}</span>
        </div>

        <div className="mt-6 overflow-x-auto overflow-y-hidden pb-2">
          <div className="mx-auto w-fit min-w-full">
            <div className="inline-flex items-center gap-4">
              {activeRoute.steps.map((step, index) => (
                <div key={`${step.kind}-${index}`} className="flex items-center gap-4">
                  {renderStep(step, index)}
                  {index < activeRoute.steps.length - 1 && (
                    <div className="flex items-center justify-center text-cyan-300">
                      <div className="h-[2px] w-10 bg-cyan-400/60" />
                      <Target className="mx-1 h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}
            </div>
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
                const riskLabel = getRiskLabel(path)

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
                        <div className="text-lg font-bold text-slate-900">{riskLabel}</div>
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
              <>
                <PathScopedArchitecture
                  details={selectedDetails}
                  onOpenService={openNativeRemediation}
                />
                <OperationalRoutePanel
                  details={selectedDetails}
                  onOpenService={openNativeRemediation}
                />
              </>
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
