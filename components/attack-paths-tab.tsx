"use client"

import { useEffect, useMemo, useState } from "react"
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
  path_nodes: Array<{
    id: string
    name: string
    type: string
    is_internet_exposed: boolean
    cve_count: number
    critical_cves: number
    high_cves: number
  }>
}

type FlowNode = {
  id: string
  name: string
  shortName: string
  type: string
  lane: "entry" | "network" | "identity" | "data"
  description: string
  evidence: string[]
  cveCount: number
  criticalCves: number
  isCrownJewel?: boolean
  isObserved?: boolean
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
  const roleFromNodes = details.path_nodes.find((node) => node.type === "IAMRole")?.name
  const sourceName = details.path_summary.source.name
  return formatName(roleFromIam || roleFromNodes || sourceName)
}

function isIdentityType(type: string) {
  return /IAMRole|Role/i.test(type)
}

function isSecurityType(type: string) {
  return /SecurityGroup|SG|NACL|NetworkACL/i.test(type)
}

function isDataType(type: string) {
  return /S3|Bucket|DynamoDB|RDS|Aurora|Database/i.test(type)
}

function getNodeLane(type: string, isLast: boolean): FlowNode["lane"] {
  if (isLast || isDataType(type)) return "data"
  if (isIdentityType(type)) return "identity"
  if (isSecurityType(type)) return "network"
  return "entry"
}

function getNodeDescription(node: PathDetails["path_nodes"][number], isFirst: boolean, isLast: boolean) {
  if (isFirst) return "Entry point on the selected attack path"
  if (isLast) return "Crown jewel reached by this path"
  if (isIdentityType(node.type)) return "Identity hop used to carry the attack forward"
  if (isSecurityType(node.type)) return "Network or control-plane checkpoint on the route"
  if (isDataType(node.type)) return "Intermediate data service on the route"
  return "Observed service on the selected path"
}

function getLaneTitle(lane: FlowNode["lane"]) {
  switch (lane) {
    case "entry":
      return "Entry"
    case "network":
      return "Network"
    case "identity":
      return "Identity"
    case "data":
      return "Crown Jewel"
  }
}

function getLaneStyle(lane: FlowNode["lane"]) {
  switch (lane) {
    case "entry":
      return {
        border: "border-blue-400/40",
        surface: "bg-blue-500/10",
        iconWrap: "bg-blue-500/15 text-blue-300",
        header: "text-blue-300",
        glow: "shadow-[0_0_0_1px_rgba(96,165,250,0.14)]",
      }
    case "network":
      return {
        border: "border-orange-400/40",
        surface: "bg-orange-500/10",
        iconWrap: "bg-orange-500/15 text-orange-300",
        header: "text-orange-300",
        glow: "shadow-[0_0_0_1px_rgba(251,146,60,0.14)]",
      }
    case "identity":
      return {
        border: "border-fuchsia-400/40",
        surface: "bg-fuchsia-500/10",
        iconWrap: "bg-fuchsia-500/15 text-fuchsia-300",
        header: "text-fuchsia-300",
        glow: "shadow-[0_0_0_1px_rgba(232,121,249,0.14)]",
      }
    case "data":
      return {
        border: "border-emerald-400/40",
        surface: "bg-emerald-500/10",
        iconWrap: "bg-emerald-500/15 text-emerald-300",
        header: "text-emerald-300",
        glow: "shadow-[0_0_0_1px_rgba(52,211,153,0.14)]",
      }
  }
}

function getNodeIcon(type: string) {
  if (/SecurityGroup|SG/i.test(type)) return Shield
  if (/NACL|NetworkACL/i.test(type)) return Lock
  if (/IAMRole|Role/i.test(type)) return Key
  if (/S3|Bucket/i.test(type)) return HardDrive
  if (/DynamoDB|RDS|Aurora|Database/i.test(type)) return Database
  if (/Lambda/i.test(type)) return Zap
  if (/Network/i.test(type)) return Network
  return Server
}

function buildFlowNodes(details: PathDetails): FlowNode[] {
  const flowNodes: FlowNode[] = details.path_nodes.map((node, index) => {
    const isFirst = index === 0
    const isLast = index === details.path_nodes.length - 1
    const lane = getNodeLane(node.type, isLast)

    return {
      id: node.id,
      name: node.name,
      shortName: formatName(node.name),
      type: node.type,
      lane,
      description: getNodeDescription(node, isFirst, isLast),
      evidence: [
        details.path_summary.evidence_type === "observed" ? "Observed flow" : "Configured path",
        node.cve_count > 0 ? `${node.cve_count} CVEs on node` : "No CVEs required",
      ],
      cveCount: node.cve_count,
      criticalCves: node.critical_cves,
      isCrownJewel: isLast,
      isObserved: details.path_summary.evidence_type === "observed",
    }
  })

  const hasSecurityNode = flowNodes.some((node) => node.lane === "network")
  if (!hasSecurityNode && details.network_layer.security_groups.length > 0) {
    const securityNodes = details.network_layer.security_groups.slice(0, 2).map((group) => ({
      id: group.sg_id,
      name: group.sg_name,
      shortName: formatName(group.sg_name),
      type: "SecurityGroup",
      lane: "network" as const,
      description: group.open_to_internet ? "Internet-facing security boundary on the route" : "Internal network checkpoint on the route",
      evidence: [
        `${group.risky_rules.length} risky rules`,
        group.open_to_internet ? "Open to internet" : "Internal only",
      ],
      cveCount: 0,
      criticalCves: 0,
      isObserved: details.path_summary.evidence_type === "observed",
    }))

    const insertAt = Math.min(1, flowNodes.length)
    flowNodes.splice(insertAt, 0, ...securityNodes)
  }

  const hasIdentityNode = flowNodes.some((node) => node.lane === "identity")
  if (!hasIdentityNode && details.identity_layer.roles.length > 0) {
    const identityNode = details.identity_layer.roles[0]
    const insertAt = Math.max(flowNodes.length - 1, 1)
    flowNodes.splice(insertAt, 0, {
      id: identityNode.role_id || identityNode.role_name,
      name: identityNode.role_name,
      shortName: formatName(identityNode.role_name),
      type: "IAMRole",
      lane: "identity",
      description: "Identity used to carry the path into the crown jewel",
      evidence: [
        `${identityNode.permission_count} permissions`,
        `${identityNode.observed_actions_count} observed actions`,
      ],
      cveCount: 0,
      criticalCves: 0,
      isObserved: details.path_summary.evidence_type === "observed",
    })
  }

  return flowNodes
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

function AttackPathFlowCanvas({
  details,
  onOpenService,
  onOpenWholeChain,
}: {
  details: PathDetails
  onOpenService: (node: { id: string; name: string }) => void
  onOpenWholeChain: () => void
}) {
  const flowNodes = useMemo(() => buildFlowNodes(details), [details])
  const pathType = getPathType(details)
  const entryPoint = formatName(details.path_summary.source.name)
  const crownJewel = formatName(details.path_summary.target.name)
  const identityUsed = getPrimaryIdentity(details)

  return (
    <div className="rounded-[28px] border border-slate-800 bg-[#071120] p-6 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.85)]">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-300">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white">Selected Attack Path</h3>
              <p className="mt-1 text-sm text-slate-400">
                Dynamic end-to-end route for the selected crown jewel. Click any service to open its 3-layer remediation page.
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

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-[24px] border border-slate-800 bg-slate-950/70 p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-slate-300">
              <span className="font-semibold text-white">{entryPoint}</span>
              <span className="mx-2 text-slate-600">→</span>
              <span className="font-semibold text-white">{crownJewel}</span>
            </div>
            <div className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
              {details.path_summary.evidence_type === "observed" ? "Observed" : "Configured"}
            </div>
          </div>

          <div className="mt-6 overflow-x-auto pb-2">
            <div className="flex min-w-max items-center gap-6 pr-6">
              {flowNodes.map((node, index) => {
                const Icon = getNodeIcon(node.type)
                const style = getLaneStyle(node.lane)

                return (
                  <div key={`${node.id}-${index}`} className="flex items-center gap-6">
                    <button
                      onClick={() => onOpenService({ id: node.id, name: node.name })}
                      className={`relative w-[240px] rounded-[26px] border ${style.border} ${style.surface} ${style.glow} p-5 text-left transition-all hover:-translate-y-0.5 hover:border-cyan-300/50`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${style.iconWrap}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex items-center gap-2">
                          {node.isCrownJewel && (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-fuchsia-400/40 bg-fuchsia-500/15">
                              <Crown className="h-4 w-4 text-fuchsia-200" />
                            </div>
                          )}
                          {node.cveCount > 0 && (
                            <div className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
                              {node.cveCount}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className={`mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] ${style.header}`}>
                        {getLaneTitle(node.lane)}
                      </div>
                      <div className="mt-2 text-lg font-semibold text-white">{node.shortName}</div>
                      <div className="mt-1 text-xs text-slate-400">{node.type}</div>
                      <p className="mt-4 text-sm leading-6 text-slate-300">{node.description}</p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {node.evidence.map((item) => (
                          <span
                            key={item}
                            className="rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-1 text-[11px] font-medium text-slate-300"
                          >
                            {item}
                          </span>
                        ))}
                      </div>

                      <div className="mt-5 inline-flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200">
                        Open 3-layer remediation
                      </div>
                    </button>

                    {index < flowNodes.length - 1 && (
                      <div className="flex flex-col items-center gap-2">
                        <div className="relative h-[3px] w-24 rounded-full bg-cyan-500/30">
                          <div className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-400 via-sky-300 to-cyan-400 opacity-90" />
                        </div>
                        <div className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-950/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                          <ArrowRight className="h-3 w-3 text-cyan-300" />
                          {details.path_summary.evidence_type === "observed" ? "Observed flow" : "Configured"}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[24px] border border-slate-800 bg-slate-950/70 p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Path Summary</div>
            <div className="mt-4 space-y-4">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Entry</div>
                <div className="mt-1 text-base font-semibold text-white">{entryPoint}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Identity</div>
                <div className="mt-1 text-base font-semibold text-fuchsia-200">{identityUsed}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Crown Jewel</div>
                <div className="mt-1 text-base font-semibold text-emerald-200">{crownJewel}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Risk</div>
                <div className="mt-1 flex items-end gap-2">
                  <span className="text-3xl font-bold text-white">{details.path_summary.risk_score}</span>
                  <span className="pb-1 text-xs font-semibold uppercase tracking-[0.18em] text-rose-300">
                    {details.path_summary.risk_level}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-cyan-500/20 bg-cyan-500/10 p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Least Privilege Plan</div>
            <p className="mt-3 text-sm leading-6 text-slate-200">
              Open a service directly from the path to review Identity, Network, and Data remediation on one page, or open the
              full path plan to execute chain-wide controls with rollback.
            </p>
            <button
              onClick={onOpenWholeChain}
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

    const currentStillExists = crownJewelPaths.some((path) => path.id === selectedPathId)
    if (!selectedPathId || !currentStillExists) {
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
    <div className="max-w-[1800px] mx-auto px-8 py-6 space-y-6">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.2)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Attack Paths</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">
                The main System Architecture map stays untouched. This tab is the attack-path workspace: pick a crown-jewel
                route, see that exact flow end to end, then open any service to remediate it across Identity, Network, and Data.
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
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Path {index + 1}
                        </div>
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
                        <span className="rounded-lg bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-700">
                          Selected
                        </span>
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
              <AttackPathFlowCanvas
                details={selectedDetails}
                onOpenService={(node) => {
                  setSelectedService({ id: node.id, name: node.name })
                  setShowSimulation(true)
                }}
                onOpenWholeChain={() => {
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
