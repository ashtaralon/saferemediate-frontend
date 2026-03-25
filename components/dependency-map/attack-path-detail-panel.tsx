"use client"

import { useState, useEffect, useMemo } from "react"
import { AttackSimulationPanel } from "./attack-simulation-panel"
import {
  X,
  AlertTriangle,
  Shield,
  Database,
  Key,
  Network,
  Bug,
  ChevronRight,
  ChevronDown,
  Loader2,
  ExternalLink,
  Zap,
  Lock,
  Server,
  FileWarning,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Target,
  Skull,
  Globe,
  HardDrive,
  Layers,
} from "lucide-react"

interface CVEDetail {
  cve_id: string
  severity: string
  cvss_score: number
  description: string
  affected_ports: number[]
  exploit_available: boolean
  remediation: string
}

interface VulnerabilityNode {
  node_id: string
  node_name: string
  node_type: string
  cve_count: number
  critical_count: number
  high_count: number
  cves: CVEDetail[]
}

interface SecurityGroup {
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

interface IAMPermissions {
  roles: Array<{
    role_id: string
    role_name: string
    attached_to: string[]
    policies: string[]
    permission_count: number
    observed_actions_count: number
  }>
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

interface DataImpact {
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

interface RiskFormula {
  formula: string
  model?: string
  reachability: { score: number; factors: string[] }
  privilege: { score: number; factors: string[] }
  data_impact: { score: number; factors: string[] }
  blast_radius?: { score: number; factors: string[] }
  combined_risk_score: number
}

interface Remediation {
  priority: number
  category: string
  title: string
  description: string
  affected_resources: string[]
  effort: string
  risk_reduction: string
  automation_available: boolean
}

interface PathDetails {
  path_id: string
  system_name: string
  timestamp: string
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
  risk_formula: RiskFormula
  vulnerabilities: VulnerabilityNode[]
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
  identity_layer: IAMPermissions
  data_impact: DataImpact
  remediations: Remediation[]
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

interface AttackPathDetailPanelProps {
  systemName: string
  pathId: string
  onClose: () => void
}

// Risk Assessment interface for node risk popup
interface RiskAssessmentData {
  resource_id: string
  resource_name: string
  resource_type: string
  risk_score: number
  risk_level: string
  cve_summary: {
    total: number
    critical: number
    high: number
    medium: number
    low: number
  }
  exploitable_ports: Array<{
    port: number
    service: string
    cves: string[]
    attack_vectors: string[]
  }>
  data_stores_at_risk: Array<{
    name: string
    type: string
    sensitivity: string
    data_types: string[]
    access_path: string
  }>
  dangerous_permissions: Array<{
    permission: string
    risk: string
    attached_to: string[]
  }>
  attack_impacts: string[]
}

interface SelectedNodeInfo {
  id: string
  name: string
  type: string
}

// Get icon for node type
function getNodeIcon(type: string) {
  switch (type) {
    case "EC2Instance":
    case "EC2":
      return Server
    case "RDS":
    case "RDSInstance":
      return Database
    case "S3":
    case "S3Bucket":
      return HardDrive
    case "Lambda":
    case "LambdaFunction":
      return Zap
    case "SecurityGroup":
      return Shield
    case "IAMRole":
      return Key
    default:
      return Server
  }
}

// Attack Path Diagram Component
function AttackPathDiagram({
  details,
  selectedNodeId,
  onSelectNode
}: {
  details: PathDetails
  selectedNodeId: string | null
  onSelectNode: (node: { id: string; name: string; type: string }) => void
}) {
  const nodes = details.path_nodes
  const networkPath = details.network_layer.network_path
  const securityGroups = details.network_layer.security_groups
  const iamRoles = details.identity_layer.roles

  // Build enhanced path showing ALL nodes in the attack path
  const enhancedPath = useMemo(() => {
    const path: Array<{
      id: string
      name: string
      type: string
      category: "compute" | "security" | "identity" | "data"
      cve_count: number
      critical_cves: number
      port?: number
      protocol?: string
      details?: string[]
      is_internal?: boolean
      zero_trust_risk?: "high" | "medium" | "low"
    }> = []

    // Helper to determine category based on node type
    const getCategory = (type: string, isLast: boolean): "compute" | "security" | "identity" | "data" => {
      if (isLast || type.includes("RDS") || type.includes("S3") || type.includes("DynamoDB") || type.includes("Aurora")) {
        return "data"
      }
      if (type.includes("SecurityGroup") || type.includes("SG")) {
        return "security"
      }
      if (type.includes("IAM") || type.includes("Role")) {
        return "identity"
      }
      return "compute"
    }

    // Add ALL nodes from path_nodes (the full attack path)
    nodes.forEach((node, index) => {
      const isLast = index === nodes.length - 1
      const hop = networkPath.find(h =>
        h.to.includes(node.id) || node.id.includes(h.to) ||
        h.from.includes(node.id) || node.id.includes(h.from)
      )
      const category = getCategory(node.type, isLast)

      // Zero-trust: internal nodes still have risk (attacker assumed inside VPC)
      const isInternal = !node.is_internet_exposed
      const zeroTrustRisk = isInternal
        ? (node.cve_count > 0 ? "high" : "medium")  // Internal with CVEs = high, without = medium
        : (node.cve_count > 0 ? "high" : "high")    // External = always high

      path.push({
        id: node.id,
        name: node.name,
        type: node.type,
        category,
        cve_count: node.cve_count,
        critical_cves: node.critical_cves,
        port: hop?.port,
        protocol: hop?.protocol,
        is_internal: isInternal,
        zero_trust_risk: zeroTrustRisk,
        details: isLast
          ? [details.data_impact.classification, `${details.data_impact.estimated_records.toLocaleString()} records`]
          : node.cve_count > 0
            ? [`${node.cve_count} CVEs`, `${node.critical_cves} Critical`]
            : isInternal
              ? ["Internal", "Zero-Trust Risk"]
              : ["Internet Exposed"],
      })
    })

    // Interleave security groups between compute nodes if they exist
    // Insert them at appropriate positions based on their affected_resources
    securityGroups.forEach((sg, sgIndex) => {
      const insertAfterIndex = Math.min(sgIndex + 1, path.length - 1)
      // Only add if not already too many nodes
      if (path.length < 8) {
        path.splice(insertAfterIndex, 0, {
          id: sg.sg_id,
          name: sg.sg_name,
          type: "SecurityGroup",
          category: "security",
          cve_count: 0,
          critical_cves: 0,
          is_internal: !sg.open_to_internet,
          zero_trust_risk: sg.open_to_internet ? "high" : "medium",
          details: [
            sg.open_to_internet ? "Open to Internet" : "Internal Only",
            `${sg.risky_rules.length} Risky Rules`,
          ],
        })
      }
    })

    return path
  }, [nodes, securityGroups, networkPath, details.data_impact])

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "compute":
        return { bg: "bg-blue-500/20", border: "border-[#3b82f6]", text: "text-blue-400", glow: "shadow-blue-500/30" }
      case "security":
        return { bg: "bg-orange-500/20", border: "border-orange-500", text: "text-orange-400", glow: "shadow-orange-500/30" }
      case "identity":
        return { bg: "bg-yellow-500/20", border: "border-yellow-500", text: "text-yellow-400", glow: "shadow-yellow-500/30" }
      case "data":
        return { bg: "bg-[#8b5cf6]/20", border: "border-purple-500", text: "text-purple-400", glow: "shadow-purple-500/30" }
      default:
        return { bg: "bg-slate-500/20", border: "border-slate-500", text: "text-slate-400", glow: "shadow-slate-500/30" }
    }
  }

  return (
    <div className="relative bg-slate-900/80 rounded-2xl border border-slate-700 p-8 overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-10">
        <svg className="w-full h-full">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Title */}
      <div className="relative flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center">
            <Target className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Attack Path Visualization</h3>
            <p className="text-xs text-slate-400">
              {details.path_summary.source.name} → {details.path_summary.target.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span className="text-slate-400">Compute</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
            <span className="text-slate-400">Network</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
            <span className="text-slate-400">Identity</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6]" />
            <span className="text-slate-400">Data</span>
          </div>
          <div className="border-l border-slate-600 pl-3 flex items-center gap-1.5">
            <div className="px-1.5 py-0.5 rounded bg-yellow-500/80 text-[9px] text-black font-bold">ZT</div>
            <span className="text-slate-400">Zero-Trust Risk</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="px-1.5 py-0.5 rounded bg-red-500/20 text-[9px] text-red-400">EXT</div>
            <span className="text-slate-400">External</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="px-1.5 py-0.5 rounded bg-yellow-500/20 text-[9px] text-yellow-400">INT</div>
            <span className="text-slate-400">Internal</span>
          </div>
        </div>
      </div>

      {/* Path Diagram */}
      <div className="relative py-8">
        {/* Grid container for nodes */}
        <div
          className="grid items-center"
          style={{
            gridTemplateColumns: `repeat(${enhancedPath.length}, 1fr)`,
            gap: '16px'
          }}
        >
          {/* Nodes */}
          {enhancedPath.map((node, i) => {
          const colors = getCategoryColor(node.category)
          const Icon = getNodeIcon(node.type)
          const isVulnerable = node.cve_count > 0
          const isInternal = node.is_internal
          const zeroTrustRisk = node.zero_trust_risk || "medium"

          return (
            <div
              key={node.id + "-" + i}
              className="relative flex-1 flex flex-col items-center"
              style={{ zIndex: 1, minWidth: 100 }}
            >
              {/* Node - Clickable for risk details */}
              <div
                className={`relative w-28 h-28 rounded-2xl ${colors.bg} border-2 ${colors.border} flex flex-col items-center justify-center p-2 shadow-lg ${colors.glow} transition-all hover:scale-105 cursor-pointer ${
                  selectedNodeId === node.id ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-900' : ''
                }`}
                onClick={() => onSelectNode({ id: node.id, name: node.name, type: node.type })}
                title="Click to view risk assessment"
              >
                {/* CVE badge */}
                {isVulnerable && (
                  <div className="absolute -top-3 -right-3 z-10">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-lg ${
                      node.critical_cves > 0 ? 'bg-red-500 animate-pulse' : 'bg-orange-500'
                    }`}>
                      {node.cve_count}
                    </div>
                  </div>
                )}

                {/* Zero-Trust Risk badge for internal nodes */}
                {isInternal && !isVulnerable && (
                  <div className="absolute -top-3 -left-3 z-10">
                    <div className={`px-2 py-0.5 rounded-full flex items-center justify-center text-[9px] font-bold shadow-lg ${
                      zeroTrustRisk === "high" ? 'bg-red-500/80 text-white' :
                      zeroTrustRisk === "medium" ? 'bg-yellow-500/80 text-black' :
                      'bg-green-500/80 text-white'
                    }`}>
                      ZT
                    </div>
                  </div>
                )}

                {/* Pulsing ring for vulnerable nodes */}
                {isVulnerable && (
                  <div className="absolute inset-0 rounded-2xl border-2 border-red-500 animate-ping opacity-30" />
                )}

                {/* Orange ring for internal nodes (zero-trust) */}
                {isInternal && !isVulnerable && (
                  <div className="absolute inset-0 rounded-2xl border border-yellow-500/50" />
                )}

                <Icon className={`w-6 h-6 ${colors.text} mb-1`} />
                <div className="text-white text-[10px] font-medium text-center truncate w-full px-1">
                  {node.name.length > 12 ? node.name.slice(0, 12) + "..." : node.name}
                </div>
                <div className={`text-[9px] ${colors.text}`}>
                  {node.type.replace("Instance", "")}
                </div>

                {/* Internal/External indicator */}
                <div className={`absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] px-1.5 py-0.5 rounded ${
                  isInternal ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {isInternal ? "INT" : "EXT"}
                </div>
              </div>

              {/* Port/Protocol label */}
              {node.port && (
                <div className="mt-1">
                  <div className="px-2 py-0.5 bg-slate-800 border border-slate-600 rounded text-[9px] text-slate-300 font-mono">
                    :{node.port}/{node.protocol}
                  </div>
                </div>
              )}

              {/* Details below node */}
              <div className="mt-3 text-center">
                <div className={`text-[10px] font-medium ${colors.text} uppercase tracking-wide mb-0.5`}>
                  {node.category}
                </div>
                {node.details && (
                  <div className="space-y-0.5">
                    {node.details.slice(0, 2).map((detail, j) => (
                      <div key={j} className="text-[9px] text-slate-400">
                        {detail}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        </div>

        {/* Connection lines - CSS-based connectors between nodes */}
        {enhancedPath.slice(0, -1).map((_, i) => {
          const n = enhancedPath.length
          // Position at the gap between columns i and i+1
          // Each column is 1/n of the container, gap is 16px between them
          // Connector starts at end of column i (at (i+1)/n position - half of gap)
          const leftPercent = ((i + 1) / n) * 100
          return (
            <div
              key={`connector-${i}`}
              className="absolute flex items-center justify-center pointer-events-none"
              style={{
                left: `${leftPercent}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: '32px',
                height: '20px',
                zIndex: 0
              }}
            >
              {/* Arrow line */}
              <div className="relative w-full h-0.5 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]">
                {/* Animated dash overlay */}
                <div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-red-300 to-transparent"
                  style={{
                    animation: 'dashMove 1s linear infinite',
                    backgroundSize: '20px 100%'
                  }}
                />
                {/* Arrow head */}
                <div
                  className="absolute right-0 top-1/2 transform -translate-y-1/2"
                  style={{
                    width: 0,
                    height: 0,
                    borderTop: '5px solid transparent',
                    borderBottom: '5px solid transparent',
                    borderLeft: '8px solid #ef4444'
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Traffic indicator + Zero Trust banner */}
      <div className="relative flex items-center justify-center gap-4 mt-4 flex-wrap">
        <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-full">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-xs text-green-400 font-medium">
            {details.path_summary.evidence_type === "observed" ? "Live Observed Traffic" : "Configured Path"}
          </span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-full">
          <Shield className="w-3 h-3 text-yellow-400" />
          <span className="text-xs text-yellow-400 font-medium">
            Zero-Trust Model: Assume Breach
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg text-[10px] text-slate-400">
          <span>Path Length: {enhancedPath.length} hops</span>
          <span className="text-slate-600">|</span>
          <span>Internal: {enhancedPath.filter(n => n.is_internal).length}</span>
          <span className="text-slate-600">|</span>
          <span>External: {enhancedPath.filter(n => !n.is_internal).length}</span>
        </div>
      </div>
    </div>
  )
}

interface BlockAction {
  action_type: string
  resource_type: string
  resource_id: string
  resource_name: string
  details: string
  status: string
}

interface BlockResult {
  path_id: string
  status: string
  message: string
  actions_taken: BlockAction[]
  risk_reduction: number
  rollback_available: boolean
}

export function AttackPathDetailPanel({ systemName, pathId, onClose }: AttackPathDetailPanelProps) {
  const [details, setDetails] = useState<PathDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["vulnerabilities", "network", "identity", "data", "remediation"])
  )
  const [blocking, setBlocking] = useState(false)
  const [blockResult, setBlockResult] = useState<BlockResult | null>(null)
  const [showBlockSuccess, setShowBlockSuccess] = useState(false)
  const [showSimulation, setShowSimulation] = useState(false)
  const [selectedNode, setSelectedNode] = useState<SelectedNodeInfo | null>(null)
  const [riskAssessment, setRiskAssessment] = useState<RiskAssessmentData | null>(null)
  const [riskLoading, setRiskLoading] = useState(false)

  // Fetch risk assessment when a node is selected
  useEffect(() => {
    if (!selectedNode) {
      setRiskAssessment(null)
      return
    }

    const fetchRiskAssessment = async () => {
      setRiskLoading(true)
      try {
        const res = await fetch(
          `/api/proxy/resource-risk/${encodeURIComponent(selectedNode.id)}?resource_type=${encodeURIComponent(selectedNode.type)}`
        )
        if (res.ok) {
          const data = await res.json()
          setRiskAssessment(data)
        } else {
          console.error('[AttackPathDetailPanel] Risk assessment fetch failed:', res.status)
          setRiskAssessment(null)
        }
      } catch (err) {
        console.error('[AttackPathDetailPanel] Risk assessment error:', err)
        setRiskAssessment(null)
      } finally {
        setRiskLoading(false)
      }
    }

    fetchRiskAssessment()
  }, [selectedNode])

  useEffect(() => {
    const fetchDetails = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/proxy/attack-paths/${systemName}/${pathId}/details`)
        if (!res.ok) {
          throw new Error("Failed to load attack path details")
        }
        const data = await res.json()
        setDetails(data)
      } catch (err) {
        console.error("Error fetching path details:", err)
        setError(err instanceof Error ? err.message : "Unknown error")
      } finally {
        setLoading(false)
      }
    }

    fetchDetails()
  }, [systemName, pathId])

  const handleBlockPath = async () => {
    if (blocking) return

    setBlocking(true)
    try {
      const res = await fetch(`/api/proxy/attack-paths/${systemName}/${pathId}/block`, {
        method: 'POST',
      })

      const data = await res.json()

      if (data.status === 'SUCCESS') {
        setBlockResult(data)
        setShowBlockSuccess(true)
      } else {
        setError(data.message || 'Failed to block attack path')
      }
    } catch (err) {
      console.error('Error blocking attack path:', err)
      setError(err instanceof Error ? err.message : 'Failed to block attack path')
    } finally {
      setBlocking(false)
    }
  }

  const handleExportReport = () => {
    if (!details) return

    // Generate HTML report
    const reportHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Crown Jewel Risk Analysis - ${details.path_id}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      padding: 40px;
      line-height: 1.6;
    }
    .container { max-width: 900px; margin: 0 auto; }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid #334155;
    }
    .logo { font-size: 24px; font-weight: bold; color: #ef4444; }
    .timestamp { color: #64748b; font-size: 14px; }
    .risk-banner {
      background: ${details.path_summary.risk_level === 'critical' ? '#7f1d1d' : details.path_summary.risk_level === 'high' ? '#7c2d12' : '#713f12'};
      border: 2px solid ${details.path_summary.risk_level === 'critical' ? '#ef4444' : details.path_summary.risk_level === 'high' ? '#f97316' : '#eab308'};
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .risk-score { font-size: 48px; font-weight: bold; color: ${details.path_summary.risk_level === 'critical' ? '#f87171' : details.path_summary.risk_level === 'high' ? '#fb923c' : '#fbbf24'}; }
    .risk-label { font-size: 18px; text-transform: uppercase; font-weight: 600; }
    .section {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      margin-bottom: 20px;
      overflow: hidden;
    }
    .section-header {
      background: #334155;
      padding: 16px 20px;
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .section-content { padding: 20px; }
    .path-visual {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 20px;
      padding: 30px;
      background: #0f172a;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .path-node {
      padding: 16px 24px;
      border-radius: 8px;
      text-align: center;
      min-width: 120px;
    }
    .path-node.compute { background: #1e3a5f; border: 2px solid #3b82f6; }
    .path-node.security { background: #432a0f; border: 2px solid #f97316; }
    .path-node.data { background: #3b1f5c; border: 2px solid #a855f7; }
    .path-node .name { font-weight: 600; margin-bottom: 4px; }
    .path-node .type { font-size: 12px; color: #94a3b8; }
    .path-arrow { color: #ef4444; font-size: 24px; }
    .cve-badge {
      display: inline-block;
      background: #ef4444;
      color: white;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      margin-left: 8px;
    }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .stat-box {
      background: #0f172a;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
    }
    .stat-value { font-size: 28px; font-weight: bold; }
    .stat-label { font-size: 12px; color: #64748b; margin-top: 4px; }
    .stat-value.blue { color: #3b82f6; }
    .stat-value.orange { color: #f97316; }
    .stat-value.purple { color: #a855f7; }
    .stat-value.red { color: #ef4444; }
    .stat-value.green { color: #22c55e; }
    .cve-item {
      background: #0f172a;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .cve-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
    .cve-id { font-family: monospace; color: #f87171; font-weight: 600; }
    .cve-severity {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    .cve-severity.critical { background: #ef4444; color: white; }
    .cve-severity.high { background: #f97316; color: white; }
    .cve-description { color: #94a3b8; font-size: 14px; }
    .tag {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 13px;
      margin: 4px;
    }
    .tag.purple { background: #3b1f5c; color: #c084fc; }
    .tag.blue { background: #1e3a5f; color: #60a5fa; }
    .tag.red { background: #450a0a; color: #f87171; }
    .remediation-item {
      display: flex;
      gap: 16px;
      padding: 16px;
      background: #0f172a;
      border-radius: 8px;
      margin-bottom: 12px;
    }
    .priority-badge {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      flex-shrink: 0;
    }
    .priority-badge.p1 { background: #ef4444; }
    .priority-badge.p2 { background: #f97316; }
    .priority-badge.p3 { background: #eab308; color: #000; }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #334155;
      text-align: center;
      color: #64748b;
      font-size: 12px;
    }
    .toolbar {
      position: fixed;
      top: 20px;
      right: 20px;
      display: flex;
      gap: 10px;
      z-index: 1000;
    }
    .toolbar button {
      padding: 12px 20px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .btn-pdf {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: white;
    }
    .btn-pdf:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(239,68,68,0.4);
    }
    .btn-print {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: white;
    }
    .btn-print:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(59,130,246,0.4);
    }
    .btn-json {
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      color: white;
    }
    .btn-json:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(34,197,94,0.4);
    }
    @media print {
      body { background: white; color: #1e293b; }
      .section { border-color: #e2e8f0; }
      .section-header { background: #f1f5f9 !important; color: #1e293b !important; }
      .risk-banner { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .toolbar { display: none !important; }
      .container { padding: 20px; }
      .stat-box { background: #f1f5f9 !important; }
      .stat-value { color: #1e293b !important; }
      .path-node { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="btn-pdf" onclick="window.print()">
      <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zM6 20V4h6v6h6v10H6z"/><path d="M8 12h8v2H8zm0 4h8v2H8z"/></svg>
      Download PDF
    </button>
    <button class="btn-print" onclick="window.print()">
      <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
      Print
    </button>
  </div>

  <div class="container">
    <div class="header">
      <div>
        <div class="logo">Crown Jewel Risk Analysis</div>
        <div style="color: #94a3b8; margin-top: 4px;">${details.path_id} • ${details.system_name}</div>
      </div>
      <div class="timestamp">
        Generated: ${new Date().toLocaleString()}<br>
        Report ID: ${details.path_id}-${Date.now()}
      </div>
    </div>

    <div class="risk-banner">
      <div>
        <div class="risk-label">${details.path_summary.risk_level} Risk</div>
        <div style="color: #94a3b8; margin-top: 4px;">
          ${details.path_summary.path_length} hops • ${details.path_summary.total_cves} CVEs (${details.path_summary.critical_cves} critical) • ${details.path_summary.evidence_type} traffic
        </div>
      </div>
      <div class="risk-score">${details.path_summary.risk_score}</div>
    </div>

    <div class="section">
      <div class="section-header">Attack Path</div>
      <div class="section-content">
        <div class="path-visual">
          ${details.path_nodes.map((node, i) => `
            <div class="path-node ${node.type.includes('RDS') || node.type.includes('S3') ? 'data' : 'compute'}">
              <div class="name">${node.name}${node.cve_count > 0 ? `<span class="cve-badge">${node.cve_count} CVEs</span>` : ''}</div>
              <div class="type">${node.type}</div>
            </div>
            ${i < details.path_nodes.length - 1 ? '<div class="path-arrow">→</div>' : ''}
          `).join('')}
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">Risk Formula (Zero-Trust Model)</div>
      <div class="section-content">
        <div style="text-align: center; margin-bottom: 12px;">
          <code style="background: #0f172a; padding: 8px 16px; border-radius: 6px;">
            ${details.risk_formula.formula}
          </code>
        </div>
        <div style="text-align: center; margin-bottom: 20px;">
          <span style="background: #713f12; color: #fbbf24; padding: 4px 12px; border-radius: 9999px; font-size: 12px;">
            ${details.risk_formula.model || 'Zero-Trust (Assume Breach)'}
          </span>
        </div>
        <div class="grid-2" style="grid-template-columns: repeat(4, 1fr);">
          <div class="stat-box">
            <div class="stat-value blue">${details.risk_formula.reachability.score}</div>
            <div class="stat-label">Reachability</div>
          </div>
          <div class="stat-box">
            <div class="stat-value orange">${details.risk_formula.privilege.score}</div>
            <div class="stat-label">Privilege</div>
          </div>
          <div class="stat-box">
            <div class="stat-value purple">${details.risk_formula.data_impact.score}</div>
            <div class="stat-label">Data Impact</div>
          </div>
          <div class="stat-box">
            <div class="stat-value red">${details.risk_formula.blast_radius?.score || 1.0}</div>
            <div class="stat-label">Blast Radius</div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header">Vulnerabilities (${details.path_summary.total_cves} CVEs)</div>
      <div class="section-content">
        ${details.vulnerabilities.map(vuln => `
          <div style="margin-bottom: 16px;">
            <div style="font-weight: 600; margin-bottom: 8px;">${vuln.node_name}</div>
            ${vuln.cves.map(cve => `
              <div class="cve-item">
                <div class="cve-header">
                  <span class="cve-id">${cve.cve_id}</span>
                  <span class="cve-severity ${cve.severity.toLowerCase()}">${cve.severity}</span>
                  <span style="color: #64748b; font-size: 12px;">CVSS ${cve.cvss_score}</span>
                  ${cve.exploit_available ? '<span class="tag red">EXPLOIT AVAILABLE</span>' : ''}
                </div>
                <div class="cve-description">${cve.description}</div>
                <div style="margin-top: 8px; font-size: 12px; color: #64748b;">
                  Affected Ports: ${cve.affected_ports.join(', ')}
                </div>
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-header" style="background: linear-gradient(90deg, #1e3a5f 0%, #334155 100%);">
        <span style="color: #60a5fa;">🔒</span> Network Layer Analysis
      </div>
      <div class="section-content">
        <div class="grid-2" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 16px;">
          <div class="stat-box">
            <div class="stat-value ${details.network_layer.internet_exposed ? 'red' : 'green'}">${details.network_layer.internet_exposed ? 'YES' : 'NO'}</div>
            <div class="stat-label">Internet Exposed</div>
          </div>
          <div class="stat-box">
            <div class="stat-value blue">${details.network_layer.open_ports.length}</div>
            <div class="stat-label">Open Ports</div>
          </div>
          <div class="stat-box">
            <div class="stat-value orange">${details.network_layer.security_groups.length}</div>
            <div class="stat-label">Security Groups</div>
          </div>
          <div class="stat-box">
            <div class="stat-value purple">${details.network_layer.network_path.length}</div>
            <div class="stat-label">Network Hops</div>
          </div>
        </div>

        ${details.network_layer.open_ports.length > 0 ? `
          <div style="margin-bottom: 16px;">
            <div style="color: #64748b; font-size: 12px; margin-bottom: 8px;">Open Ports:</div>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              ${details.network_layer.open_ports.map(port => `
                <span style="padding: 4px 12px; background: #1e3a5f; border: 1px solid #3b82f6; border-radius: 4px; font-family: monospace; color: #60a5fa; font-size: 13px;">:${port}</span>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${details.network_layer.protocols.length > 0 ? `
          <div style="margin-bottom: 16px;">
            <div style="color: #64748b; font-size: 12px; margin-bottom: 8px;">Protocols:</div>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              ${details.network_layer.protocols.map(proto => `
                <span style="padding: 4px 12px; background: #3b1f5c; border: 1px solid #a855f7; border-radius: 4px; color: #c084fc; font-size: 13px;">${proto}</span>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div style="margin-bottom: 16px;">
          <div style="color: #64748b; font-size: 12px; margin-bottom: 8px;">Network Path:</div>
          <div style="background: #0f172a; border-radius: 8px; padding: 16px; overflow-x: auto;">
            <div style="display: flex; align-items: center; gap: 8px; min-width: max-content;">
              ${details.network_layer.network_path.map((hop, i) => `
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div style="padding: 8px 12px; background: #1e293b; border: 1px solid #475569; border-radius: 6px; text-align: center;">
                    <div style="font-size: 11px; color: #94a3b8;">${hop.from}</div>
                  </div>
                  <div style="display: flex; flex-direction: column; align-items: center;">
                    <div style="font-size: 10px; color: #64748b;">:${hop.port}/${hop.protocol}</div>
                    <div style="color: #ef4444; font-size: 16px;">→</div>
                    <div style="font-size: 9px; color: ${hop.observed ? '#22c55e' : '#64748b'};">${hop.observed ? 'observed' : 'configured'}</div>
                  </div>
                  ${i === details.network_layer.network_path.length - 1 ? `
                    <div style="padding: 8px 12px; background: #3b1f5c; border: 1px solid #a855f7; border-radius: 6px; text-align: center;">
                      <div style="font-size: 11px; color: #c084fc;">${hop.to}</div>
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        ${details.network_layer.security_groups.length > 0 ? `
          <div>
            <div style="color: #64748b; font-size: 12px; margin-bottom: 8px;">Security Groups:</div>
            ${details.network_layer.security_groups.map(sg => `
              <div style="background: #0f172a; border-radius: 8px; padding: 12px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <div>
                    <span style="font-weight: 600; color: #e2e8f0;">${sg.sg_name}</span>
                    <span style="font-size: 11px; color: #64748b; margin-left: 8px;">${sg.sg_id}</span>
                  </div>
                  <span style="padding: 2px 8px; border-radius: 4px; font-size: 11px; ${sg.open_to_internet ? 'background: #450a0a; color: #f87171;' : 'background: #14532d; color: #4ade80;'}">${sg.open_to_internet ? 'INTERNET EXPOSED' : 'INTERNAL'}</span>
                </div>
                ${sg.risky_rules && sg.risky_rules.length > 0 ? `
                  <div style="margin-top: 8px;">
                    <div style="font-size: 11px; color: #f87171; margin-bottom: 4px;">Risky Rules:</div>
                    ${sg.risky_rules.map(rule => `
                      <div style="font-size: 11px; color: #fca5a5; padding: 4px 8px; background: #450a0a; border-radius: 4px; margin-bottom: 4px;">
                        ${rule.direction} :${rule.port}/${rule.protocol} from ${rule.source} - ${rule.risk}
                      </div>
                    `).join('')}
                  </div>
                ` : ''}
                ${sg.affected_resources && sg.affected_resources.length > 0 ? `
                  <div style="margin-top: 8px; font-size: 11px; color: #94a3b8;">
                    Affects: ${sg.affected_resources.join(', ')}
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>

    <div class="section">
      <div class="section-header" style="background: linear-gradient(90deg, #713f12 0%, #334155 100%);">
        <span style="color: #fbbf24;">🔑</span> Identity Layer (IAM Analysis)
      </div>
      <div class="section-content">
        <div class="grid-2" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 16px;">
          <div class="stat-box">
            <div class="stat-value orange">${details.identity_layer.roles?.length || 0}</div>
            <div class="stat-label">IAM Roles</div>
          </div>
          <div class="stat-box">
            <div class="stat-value red">${details.identity_layer.dangerous_permissions?.length || 0}</div>
            <div class="stat-label">Dangerous Perms</div>
          </div>
          <div class="stat-box">
            <div class="stat-value orange">${details.identity_layer.least_privilege_gaps?.length || 0}</div>
            <div class="stat-label">Privilege Gaps</div>
          </div>
          <div class="stat-box">
            <div class="stat-value blue">${details.identity_layer.roles?.reduce((sum, r) => sum + (r.permission_count || 0), 0) || 0}</div>
            <div class="stat-label">Total Permissions</div>
          </div>
        </div>

        ${details.identity_layer.roles && details.identity_layer.roles.length > 0 ? `
          <div style="margin-bottom: 16px;">
            <div style="color: #64748b; font-size: 12px; margin-bottom: 8px;">IAM Roles in Path:</div>
            ${details.identity_layer.roles.map(role => `
              <div style="background: #0f172a; border-radius: 8px; padding: 12px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <div>
                    <span style="font-weight: 600; color: #fbbf24;">${role.role_name}</span>
                    ${role.role_id ? `<span style="font-size: 11px; color: #64748b; margin-left: 8px;">${role.role_id}</span>` : ''}
                  </div>
                  <div style="display: flex; gap: 8px;">
                    <span style="padding: 2px 8px; background: #1e3a5f; border-radius: 4px; font-size: 11px; color: #60a5fa;">${role.permission_count || 0} perms</span>
                    <span style="padding: 2px 8px; background: #14532d; border-radius: 4px; font-size: 11px; color: #4ade80;">${role.observed_actions_count || 0} observed</span>
                  </div>
                </div>
                ${role.policies && role.policies.length > 0 ? `
                  <div style="margin-top: 8px;">
                    <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">Attached Policies:</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                      ${role.policies.map(policy => `
                        <span style="padding: 3px 8px; background: #1e293b; border: 1px solid #475569; border-radius: 4px; font-size: 11px; color: #e2e8f0;">${policy}</span>
                      `).join('')}
                    </div>
                  </div>
                ` : ''}
                ${role.attached_to && role.attached_to.length > 0 ? `
                  <div style="margin-top: 8px; font-size: 11px; color: #94a3b8;">
                    Attached to: ${role.attached_to.join(', ')}
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${details.identity_layer.dangerous_permissions && details.identity_layer.dangerous_permissions.length > 0 ? `
          <div style="margin-bottom: 16px;">
            <div style="color: #f87171; font-size: 12px; margin-bottom: 8px;">⚠ Dangerous Permissions:</div>
            <div style="background: #450a0a; border: 1px solid #ef4444; border-radius: 8px; padding: 12px;">
              ${details.identity_layer.dangerous_permissions.map(dp => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #0f172a; border-radius: 4px; margin-bottom: 6px;">
                  <div>
                    <span style="font-family: monospace; color: #f87171; font-size: 12px;">${dp.permission}</span>
                    <span style="font-size: 11px; color: #94a3b8; margin-left: 8px;">on ${dp.role}</span>
                  </div>
                  <span style="padding: 2px 8px; background: #7f1d1d; border-radius: 4px; font-size: 10px; color: #fca5a5;">${dp.risk}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${details.identity_layer.least_privilege_gaps && details.identity_layer.least_privilege_gaps.length > 0 ? `
          <div>
            <div style="color: #fb923c; font-size: 12px; margin-bottom: 8px;">Least Privilege Gaps:</div>
            <div style="background: #431407; border: 1px solid #f97316; border-radius: 8px; padding: 12px;">
              ${details.identity_layer.least_privilege_gaps.map(gap => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: #0f172a; border-radius: 4px; margin-bottom: 6px;">
                  <div>
                    <span style="font-weight: 600; color: #fb923c;">${gap.role}</span>
                  </div>
                  <div style="display: flex; gap: 12px; align-items: center;">
                    <div style="text-align: center;">
                      <div style="font-size: 16px; font-weight: bold; color: #f87171;">${gap.allowed}</div>
                      <div style="font-size: 9px; color: #94a3b8;">Allowed</div>
                    </div>
                    <div style="color: #64748b;">vs</div>
                    <div style="text-align: center;">
                      <div style="font-size: 16px; font-weight: bold; color: #4ade80;">${gap.observed}</div>
                      <div style="font-size: 9px; color: #94a3b8;">Observed</div>
                    </div>
                    <div style="padding: 4px 10px; background: #7c2d12; border-radius: 4px;">
                      <span style="font-size: 14px; font-weight: bold; color: #fb923c;">${gap.gap_percentage}%</span>
                      <span style="font-size: 9px; color: #fdba74;"> unused</span>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    </div>

    <div class="section">
      <div class="section-header">Crown Jewel (Target)</div>
      <div class="section-content">
        <div class="grid-2">
          <div class="stat-box">
            <div class="stat-value purple">${details.data_impact.name}</div>
            <div class="stat-label">${details.data_impact.type}</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${details.data_impact.estimated_records.toLocaleString()}</div>
            <div class="stat-label">Records at Risk</div>
          </div>
        </div>
        <div style="margin-top: 16px;">
          <div style="margin-bottom: 8px; color: #64748b; font-size: 12px;">Data Types:</div>
          ${details.data_impact.data_types.map(t => `<span class="tag purple">${t}</span>`).join('')}
        </div>
        <div style="margin-top: 12px;">
          <div style="margin-bottom: 8px; color: #64748b; font-size: 12px;">Compliance:</div>
          ${details.data_impact.compliance.map(c => `<span class="tag blue">${c}</span>`).join('')}
        </div>
        <div style="margin-top: 16px; padding: 12px; background: #450a0a; border: 1px solid #ef4444; border-radius: 8px;">
          <div style="color: #f87171; font-weight: 600; margin-bottom: 4px;">Potential Breach Impact</div>
          <div style="color: #fca5a5;">${details.data_impact.breach_impact}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-header" style="background: linear-gradient(90deg, #450a0a 0%, #334155 100%);">
        <span style="color: #f87171;">⚠</span> Blast Radius Analysis (Zero-Trust)
      </div>
      <div class="section-content">
        <div style="background: #450a0a; border: 1px solid #ef4444; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
            <div style="font-size: 36px; font-weight: bold; color: #f87171;">${details.risk_formula.blast_radius?.score || 1.0}x</div>
            <div>
              <div style="color: #fca5a5; font-weight: 600;">Blast Radius Multiplier</div>
              <div style="color: #94a3b8; font-size: 12px;">Lateral movement risk factor</div>
            </div>
          </div>
          <div style="color: #fbbf24; font-size: 12px; padding: 8px; background: #713f12; border-radius: 4px;">
            Zero-Trust Model: Assumes attacker is already inside the VPC
          </div>
        </div>

        <div class="grid-2" style="grid-template-columns: repeat(3, 1fr); margin-bottom: 16px;">
          <div class="stat-box">
            <div class="stat-value red">${details.path_nodes.filter(n => !n.is_internet_exposed).length}</div>
            <div class="stat-label">Internal Nodes</div>
          </div>
          <div class="stat-box">
            <div class="stat-value orange">${details.path_nodes.filter(n => n.is_internet_exposed).length}</div>
            <div class="stat-label">External Nodes</div>
          </div>
          <div class="stat-box">
            <div class="stat-value purple">${Math.max(0, details.path_nodes.filter(n => !n.is_internet_exposed).length - 1)}</div>
            <div class="stat-label">Lateral Paths</div>
          </div>
        </div>

        <div style="margin-bottom: 12px; color: #94a3b8; font-size: 12px;">Internal nodes at risk (potential pivot points):</div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          ${details.path_nodes.filter(n => !n.is_internet_exposed).map(n => `
            <div style="padding: 8px 12px; background: ${n.cve_count > 0 ? '#450a0a' : '#1e3a5f'}; border: 1px solid ${n.cve_count > 0 ? '#ef4444' : '#3b82f6'}; border-radius: 6px;">
              <div style="font-weight: 600; color: ${n.cve_count > 0 ? '#f87171' : '#60a5fa'}; font-size: 13px;">${n.name}</div>
              <div style="font-size: 11px; color: #94a3b8;">${n.type}${n.cve_count > 0 ? ` • ${n.cve_count} CVEs` : ''}</div>
            </div>
          `).join('')}
        </div>

        ${details.risk_formula.blast_radius?.factors ? `
          <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #334155;">
            <div style="color: #64748b; font-size: 11px; margin-bottom: 8px;">Risk Factors:</div>
            ${details.risk_formula.blast_radius.factors.map(f => `
              <div style="color: #94a3b8; font-size: 12px; padding: 4px 0;">• ${f}</div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>

    <div class="section">
      <div class="section-header">Remediation Actions (${details.remediations.length})</div>
      <div class="section-content">
        ${details.remediations.map(rem => `
          <div class="remediation-item">
            <div class="priority-badge p${rem.priority}">${rem.priority}</div>
            <div style="flex: 1;">
              <div style="font-weight: 600; margin-bottom: 4px;">${rem.title}</div>
              <div style="color: #94a3b8; font-size: 14px; margin-bottom: 8px;">${rem.description}</div>
              <div style="font-size: 12px; color: #64748b;">
                Effort: ${rem.effort} • Risk Reduction: ${rem.risk_reduction}
                ${rem.automation_available ? ' • <span style="color: #22c55e;">Automation Available</span>' : ''}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="footer">
      <p>Generated by SafeRemediate Crown Jewel Risk Analysis</p>
      <p style="margin-top: 4px;">${new Date().toISOString()}</p>
    </div>
  </div>

  <script>
    // Auto-trigger print dialog for PDF export
    // window.print();
  </script>
</body>
</html>
`

    // Open report in new window
    const reportWindow = window.open('', '_blank')
    if (reportWindow) {
      reportWindow.document.write(reportHtml)
      reportWindow.document.close()

      // Also provide JSON download option
      const jsonReport = {
        report_id: `${details.path_id}-${Date.now()}`,
        generated_at: new Date().toISOString(),
        system_name: details.system_name,
        path_id: details.path_id,
        risk_analysis: {
          risk_score: details.path_summary.risk_score,
          risk_level: details.path_summary.risk_level,
          path_length: details.path_summary.path_length,
          total_cves: details.path_summary.total_cves,
          critical_cves: details.path_summary.critical_cves,
        },
        risk_formula: details.risk_formula,
        attack_path: details.path_nodes,
        vulnerabilities: details.vulnerabilities,
        network_layer: details.network_layer,
        identity_layer: details.identity_layer,
        data_impact: details.data_impact,
        remediations: details.remediations,
      }

      // Download JSON
      const blob = new Blob([JSON.stringify(jsonReport, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `crown-jewel-report-${details.path_id}-${Date.now()}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(section)) {
      newExpanded.delete(section)
    } else {
      newExpanded.add(section)
    }
    setExpandedSections(newExpanded)
  }

  const getRiskColor = (level: string) => {
    switch (level.toLowerCase()) {
      case "critical":
        return "text-red-400 bg-red-500/20 border-red-500/50"
      case "high":
        return "text-orange-400 bg-orange-500/20 border-orange-500/50"
      case "medium":
        return "text-yellow-400 bg-yellow-500/20 border-yellow-500/50"
      default:
        return "text-green-400 bg-green-500/20 border-green-500/50"
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity.toUpperCase()) {
      case "CRITICAL":
        return "bg-red-500"
      case "HIGH":
        return "bg-orange-500"
      case "MEDIUM":
        return "bg-yellow-500"
      default:
        return "bg-green-500"
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-sm z-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-red-400 animate-spin" />
          <span className="text-slate-400 text-lg">Loading Crown Jewel Analysis...</span>
        </div>
      </div>
    )
  }

  if (error || !details) {
    return (
      <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-sm z-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Crown Jewel Risk Analysis</h2>
            <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg">
              <X className="w-6 h-6 text-slate-400" />
            </button>
          </div>
          <div className="flex flex-col items-center justify-center h-64 text-red-400">
            <AlertTriangle className="w-16 h-16 mb-4" />
            <p className="text-lg">{error || "Failed to load details"}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-sm z-50 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gradient-to-b from-slate-950 via-slate-950 to-transparent">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
                <Skull className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Crown Jewel Risk Analysis</h1>
                <p className="text-sm text-slate-400">{details.path_id} • {details.system_name}</p>
              </div>
            </div>

            {/* Risk Score */}
            <div className="flex items-center gap-6">
              <div className={`px-6 py-3 rounded-xl border ${getRiskColor(details.path_summary.risk_level)}`}>
                <div className="flex items-center gap-4">
                  <div className="text-4xl font-bold">{details.path_summary.risk_score}</div>
                  <div>
                    <div className="text-sm font-semibold uppercase">{details.path_summary.risk_level} RISK</div>
                    <div className="text-xs opacity-75">
                      {details.path_summary.path_length} hops • {details.path_summary.total_cves} CVEs
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-3 hover:bg-slate-800 rounded-xl transition-colors"
              >
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 pb-8 space-y-6">
        {/* Attack Path Diagram - Full Width */}
        <AttackPathDiagram
          details={details}
          selectedNodeId={selectedNode?.id || null}
          onSelectNode={setSelectedNode}
        />

        {/* Node Risk Assessment Popup - Shows when a node is clicked */}
        {selectedNode && (
          <div className="bg-slate-900/95 rounded-2xl border border-cyan-500/50 shadow-2xl shadow-cyan-500/20 overflow-hidden">
            <div className="px-5 py-4 border-b border-cyan-500/30 bg-cyan-500/10 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Target className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="text-white font-bold">Risk Assessment</h3>
                  <p className="text-xs text-slate-400">{selectedNode.name} ({selectedNode.type})</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5">
              {riskLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                  <span className="ml-3 text-slate-400">Loading risk assessment...</span>
                </div>
              ) : riskAssessment ? (
                <div className="space-y-5">
                  {/* Risk Score Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`px-4 py-2 rounded-xl font-bold text-lg ${
                        riskAssessment.risk_level === 'critical' ? 'bg-red-500/20 text-red-400 border border-red-500/50' :
                        riskAssessment.risk_level === 'high' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50' :
                        riskAssessment.risk_level === 'medium' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' :
                        'bg-green-500/20 text-green-400 border border-green-500/50'
                      }`}>
                        {riskAssessment.risk_score} Risk Score
                      </div>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium uppercase ${
                        riskAssessment.risk_level === 'critical' ? 'bg-red-500/20 text-red-400' :
                        riskAssessment.risk_level === 'high' ? 'bg-orange-500/20 text-orange-400' :
                        riskAssessment.risk_level === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-green-500/20 text-green-400'
                      }`}>
                        {riskAssessment.risk_level}
                      </span>
                    </div>
                  </div>

                  {/* Grid of Risk Details */}
                  <div className="grid grid-cols-3 gap-4">
                    {/* CVE Summary */}
                    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                      <div className="flex items-center gap-2 mb-3">
                        <Bug className="w-4 h-4 text-red-400" />
                        <span className="text-sm font-medium text-white">CVE Summary</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="bg-red-500/10 rounded-lg p-2">
                          <div className="text-xl font-bold text-red-400">{riskAssessment.cve_summary?.critical ?? 0}</div>
                          <div className="text-[10px] text-slate-500 uppercase">Critical</div>
                        </div>
                        <div className="bg-orange-500/10 rounded-lg p-2">
                          <div className="text-xl font-bold text-orange-400">{riskAssessment.cve_summary?.high ?? 0}</div>
                          <div className="text-[10px] text-slate-500 uppercase">High</div>
                        </div>
                        <div className="bg-yellow-500/10 rounded-lg p-2">
                          <div className="text-xl font-bold text-yellow-400">{riskAssessment.cve_summary?.medium ?? 0}</div>
                          <div className="text-[10px] text-slate-500 uppercase">Medium</div>
                        </div>
                        <div className="bg-slate-700/50 rounded-lg p-2">
                          <div className="text-xl font-bold text-slate-300">{riskAssessment.cve_summary?.total ?? 0}</div>
                          <div className="text-[10px] text-slate-500 uppercase">Total</div>
                        </div>
                      </div>
                    </div>

                    {/* Exploitable Ports */}
                    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                      <div className="flex items-center gap-2 mb-3">
                        <Network className="w-4 h-4 text-orange-400" />
                        <span className="text-sm font-medium text-white">Exploitable Ports</span>
                      </div>
                      {(riskAssessment.exploitable_ports?.length || 0) > 0 ? (
                        <div className="space-y-2 max-h-32 overflow-y-auto">
                          {(riskAssessment.exploitable_ports || []).slice(0, 4).map((port, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <span className="font-mono text-orange-400">:{port.port}</span>
                              <span className="text-slate-400">{port.service}</span>
                              {(port.cves?.length || 0) > 0 && (
                                <span className="text-red-400">{port.cves.length} CVEs</span>
                              )}
                            </div>
                          ))}
                          {(riskAssessment.exploitable_ports?.length || 0) > 4 && (
                            <div className="text-[10px] text-slate-500">
                              +{(riskAssessment.exploitable_ports?.length || 0) - 4} more
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-slate-500 text-sm">No exploitable ports detected</div>
                      )}
                    </div>

                    {/* Data Stores at Risk */}
                    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                      <div className="flex items-center gap-2 mb-3">
                        <Database className="w-4 h-4 text-purple-400" />
                        <span className="text-sm font-medium text-white">Data at Risk</span>
                      </div>
                      {(riskAssessment.data_stores_at_risk?.length || 0) > 0 ? (
                        <div className="space-y-2 max-h-32 overflow-y-auto">
                          {(riskAssessment.data_stores_at_risk || []).slice(0, 3).map((store, i) => (
                            <div key={i} className="bg-slate-900/50 rounded-lg p-2">
                              <div className="text-xs text-white font-medium truncate">{store.name}</div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  store.sensitivity === 'critical' ? 'bg-red-500/20 text-red-400' :
                                  store.sensitivity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                                  'bg-yellow-500/20 text-yellow-400'
                                }`}>
                                  {store.sensitivity}
                                </span>
                                <span className="text-[10px] text-slate-500">{store.type}</span>
                              </div>
                            </div>
                          ))}
                          {(riskAssessment.data_stores_at_risk?.length || 0) > 3 && (
                            <div className="text-[10px] text-slate-500">
                              +{(riskAssessment.data_stores_at_risk?.length || 0) - 3} more
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-slate-500 text-sm">No data stores at risk</div>
                      )}
                    </div>
                  </div>

                  {/* Dangerous Permissions */}
                  {(riskAssessment.dangerous_permissions?.length || 0) > 0 && (
                    <div className="bg-red-500/5 rounded-xl p-4 border border-red-500/20">
                      <div className="flex items-center gap-2 mb-3">
                        <Key className="w-4 h-4 text-red-400" />
                        <span className="text-sm font-medium text-white">Dangerous Permissions</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(riskAssessment.dangerous_permissions || []).slice(0, 6).map((perm, i) => (
                          <span key={i} className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded-lg font-mono">
                            {perm.permission}
                          </span>
                        ))}
                        {(riskAssessment.dangerous_permissions?.length || 0) > 6 && (
                          <span className="px-2 py-1 bg-slate-700 text-slate-400 text-xs rounded-lg">
                            +{(riskAssessment.dangerous_permissions?.length || 0) - 6} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Attack Impacts */}
                  {(riskAssessment.attack_impacts?.length || 0) > 0 && (
                    <div className="bg-orange-500/5 rounded-xl p-4 border border-orange-500/20">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-4 h-4 text-orange-400" />
                        <span className="text-sm font-medium text-white">Potential Attack Impacts</span>
                      </div>
                      <div className="space-y-1.5">
                        {(riskAssessment.attack_impacts || []).map((impact, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm text-slate-300">
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              typeof impact === 'object' && impact.severity === 'critical' ? 'bg-red-400' :
                              typeof impact === 'object' && impact.severity === 'high' ? 'bg-orange-400' :
                              'bg-yellow-400'
                            }`} />
                            {typeof impact === 'string' ? impact : (impact.description || impact.type || JSON.stringify(impact))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertTriangle className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-500">No risk assessment data available</p>
                  <p className="text-xs text-slate-600 mt-1">This resource may not have enough data for assessment</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Risk Formula */}
        <div className="bg-slate-900/50 rounded-2xl border border-slate-700 p-6">
          <div className="flex items-center gap-3 mb-6">
            <Zap className="w-6 h-6 text-yellow-400" />
            <h2 className="text-xl font-bold text-white">Risk Formula</h2>
          </div>
          <div className="text-center mb-4">
            <code className="text-lg text-slate-300 bg-slate-800 px-6 py-2 rounded-lg">
              {details.risk_formula.formula}
            </code>
            {details.risk_formula.model && (
              <div className="mt-2">
                <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 text-sm rounded-full">
                  {details.risk_formula.model}
                </span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-blue-500/10 border border-[#3b82f6]/30 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-blue-400 mb-2">{details.risk_formula.reachability.score}</div>
              <div className="text-sm text-slate-400 mb-3">Reachability</div>
              <div className="space-y-1">
                {details.risk_formula.reachability.factors.slice(0, 3).map((f, i) => (
                  <div key={i} className="text-[10px] text-slate-500">{f}</div>
                ))}
              </div>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-orange-400 mb-2">{details.risk_formula.privilege.score}</div>
              <div className="text-sm text-slate-400 mb-3">Privilege</div>
              <div className="space-y-1">
                {details.risk_formula.privilege.factors.map((f, i) => (
                  <div key={i} className="text-[10px] text-slate-500">{f}</div>
                ))}
              </div>
            </div>
            <div className="bg-[#8b5cf6]/10 border border-purple-500/30 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-purple-400 mb-2">{details.risk_formula.data_impact.score}</div>
              <div className="text-sm text-slate-400 mb-3">Data Impact</div>
              <div className="space-y-1">
                {details.risk_formula.data_impact.factors.slice(0, 3).map((f, i) => (
                  <div key={i} className="text-[10px] text-slate-500">{f}</div>
                ))}
              </div>
            </div>
            {details.risk_formula.blast_radius && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-red-400 mb-2">{details.risk_formula.blast_radius.score}</div>
                <div className="text-sm text-slate-400 mb-3">Blast Radius</div>
                <div className="space-y-1">
                  {details.risk_formula.blast_radius.factors.map((f, i) => (
                    <div key={i} className="text-[10px] text-slate-500">{f}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-2 gap-6">
          {/* Left Column - Vulnerabilities & Network */}
          <div className="space-y-6">
            {/* Vulnerabilities */}
            <div className="bg-slate-900/50 rounded-2xl border border-slate-700 overflow-hidden">
              <button
                onClick={() => toggleSection("vulnerabilities")}
                className="w-full p-5 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Bug className="w-6 h-6 text-red-400" />
                  <span className="text-lg font-semibold text-white">Vulnerabilities</span>
                  <span className="px-3 py-1 bg-red-500/20 text-red-400 text-sm rounded-full">
                    {details.path_summary.total_cves} CVEs
                  </span>
                </div>
                {expandedSections.has("vulnerabilities") ? (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                )}
              </button>
              {expandedSections.has("vulnerabilities") && (
                <div className="p-5 pt-0 space-y-4">
                  {details.vulnerabilities.length > 0 ? (
                    details.vulnerabilities.map((vuln) => (
                      <div key={vuln.node_id} className="bg-slate-800/50 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="font-medium text-white text-lg">{vuln.node_name}</div>
                          <div className="flex gap-2">
                            {vuln.critical_count > 0 && (
                              <span className="px-3 py-1 bg-red-500 text-white text-sm rounded-lg font-medium">
                                {vuln.critical_count} Critical
                              </span>
                            )}
                            {vuln.high_count > 0 && (
                              <span className="px-3 py-1 bg-orange-500 text-white text-sm rounded-lg font-medium">
                                {vuln.high_count} High
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="space-y-3">
                          {vuln.cves.map((cve) => (
                            <div key={cve.cve_id} className="flex items-start gap-3 p-3 bg-slate-900/50 rounded-lg">
                              <div className={`w-3 h-3 rounded-full mt-1 ${getSeverityColor(cve.severity)}`} />
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-1">
                                  <code className="text-red-400 font-mono">{cve.cve_id}</code>
                                  <span className="text-xs text-slate-500">CVSS {cve.cvss_score}</span>
                                  {cve.exploit_available && (
                                    <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded font-medium">
                                      EXPLOIT AVAILABLE
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-slate-400">{cve.description}</p>
                                {cve.affected_ports.length > 0 && (
                                  <div className="flex items-center gap-2 mt-2">
                                    <span className="text-xs text-slate-500">Affected Ports:</span>
                                    {cve.affected_ports.map((port) => (
                                      <span key={port} className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded font-mono">
                                        {port}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-slate-500 py-8">No CVE details available</div>
                  )}
                </div>
              )}
            </div>

            {/* Network Layer */}
            <div className="bg-slate-900/50 rounded-2xl border border-slate-700 overflow-hidden">
              <button
                onClick={() => toggleSection("network")}
                className="w-full p-5 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Network className="w-6 h-6 text-blue-400" />
                  <span className="text-lg font-semibold text-white">Network Layer</span>
                  {details.network_layer.internet_exposed && (
                    <span className="px-3 py-1 bg-red-500/20 text-red-400 text-sm rounded-full">
                      Internet Exposed
                    </span>
                  )}
                </div>
                {expandedSections.has("network") ? (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                )}
              </button>
              {expandedSections.has("network") && (
                <div className="p-5 pt-0 space-y-4">
                  {/* Open Ports */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm text-slate-400">Open Ports:</span>
                    {details.network_layer.open_ports.map((port) => (
                      <span key={port} className="px-3 py-1 bg-blue-500/20 text-blue-400 text-sm rounded-lg font-mono">
                        {port}/{details.network_layer.protocols[0] || "TCP"}
                      </span>
                    ))}
                  </div>

                  {/* Security Groups */}
                  {details.network_layer.security_groups.map((sg) => (
                    <div key={sg.sg_id} className="bg-slate-800/50 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Shield className="w-5 h-5 text-orange-400" />
                          <span className="font-medium text-white">{sg.sg_name}</span>
                        </div>
                        {sg.open_to_internet && (
                          <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded">
                            Open to Internet
                          </span>
                        )}
                      </div>
                      {sg.risky_rules.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs text-slate-400">Risky Rules:</div>
                          {sg.risky_rules.map((rule, i) => (
                            <div key={i} className="flex items-center gap-2 p-2 bg-red-500/10 rounded-lg border border-red-500/20">
                              <XCircle className="w-4 h-4 text-red-400" />
                              <span className="text-sm text-slate-300">
                                {rule.direction} {rule.port}/{rule.protocol} from {rule.source}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Network Path */}
                  <div>
                    <div className="text-sm text-slate-400 mb-2">Traffic Path:</div>
                    <div className="space-y-2">
                      {details.network_layer.network_path.map((hop, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                          <span className="text-sm text-slate-300 flex-1 truncate">{hop.from}</span>
                          <ArrowRight className="w-4 h-4 text-slate-500" />
                          <span className="text-sm text-slate-300 flex-1 truncate">{hop.to}</span>
                          {hop.port && (
                            <span className="px-2 py-1 bg-slate-700 text-slate-300 text-xs rounded font-mono">
                              :{hop.port}
                            </span>
                          )}
                          {hop.observed && (
                            <span className="text-green-400 text-xs">observed</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Identity & Data Impact */}
          <div className="space-y-6">
            {/* Identity Layer */}
            <div className="bg-slate-900/50 rounded-2xl border border-slate-700 overflow-hidden">
              <button
                onClick={() => toggleSection("identity")}
                className="w-full p-5 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Key className="w-6 h-6 text-yellow-400" />
                  <span className="text-lg font-semibold text-white">Identity Layer (IAM)</span>
                  {details.identity_layer.dangerous_permissions.length > 0 && (
                    <span className="px-3 py-1 bg-orange-500/20 text-orange-400 text-sm rounded-full">
                      {details.identity_layer.dangerous_permissions.length} Risky
                    </span>
                  )}
                </div>
                {expandedSections.has("identity") ? (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                )}
              </button>
              {expandedSections.has("identity") && (
                <div className="p-5 pt-0 space-y-4">
                  {/* IAM Roles */}
                  {details.identity_layer.roles.map((role) => (
                    <div key={role.role_id} className="bg-slate-800/50 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Lock className="w-5 h-5 text-yellow-400" />
                        <span className="font-medium text-white">{role.role_name}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="p-3 bg-slate-900/50 rounded-lg text-center">
                          <div className="text-2xl font-bold text-white">{role.permission_count}</div>
                          <div className="text-xs text-slate-400">Permissions</div>
                        </div>
                        <div className="p-3 bg-slate-900/50 rounded-lg text-center">
                          <div className="text-2xl font-bold text-green-400">{role.observed_actions_count}</div>
                          <div className="text-xs text-slate-400">Observed</div>
                        </div>
                      </div>
                      {role.policies.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {role.policies.map((policy) => (
                            <span key={policy} className="px-2 py-1 bg-yellow-500/10 text-yellow-400 text-xs rounded">
                              {policy}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Dangerous Permissions */}
                  {details.identity_layer.dangerous_permissions.length > 0 && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                      <div className="text-sm text-red-400 font-medium mb-3">Dangerous Permissions</div>
                      {details.identity_layer.dangerous_permissions.map((perm, i) => (
                        <div key={i} className="flex items-center gap-2 py-2">
                          <AlertTriangle className="w-4 h-4 text-red-400" />
                          <span className="text-sm text-slate-300">{perm.role}:</span>
                          <code className="text-red-400 font-mono">{perm.permission}</code>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Least Privilege Gaps */}
                  {details.identity_layer.least_privilege_gaps.length > 0 && (
                    <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4">
                      <div className="text-sm text-orange-400 font-medium mb-3">Least Privilege Gaps</div>
                      {details.identity_layer.least_privilege_gaps.map((gap, i) => (
                        <div key={i} className="flex items-center justify-between py-2">
                          <span className="text-sm text-slate-300">{gap.role}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-400">{gap.observed}/{gap.allowed} used</span>
                            <span className="px-2 py-1 bg-orange-500/20 text-orange-400 text-xs rounded font-medium">
                              {gap.gap_percentage}% unused
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Crown Jewel (Data Impact) */}
            <div className="bg-slate-900/50 rounded-2xl border border-slate-700 overflow-hidden">
              <button
                onClick={() => toggleSection("data")}
                className="w-full p-5 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Database className="w-6 h-6 text-purple-400" />
                  <span className="text-lg font-semibold text-white">Crown Jewel</span>
                  <span className={`px-3 py-1 text-sm rounded-full ${
                    details.data_impact.sensitivity === "Critical"
                      ? "bg-red-500/20 text-red-400"
                      : "bg-[#8b5cf6]/20 text-purple-400"
                  }`}>
                    {details.data_impact.sensitivity}
                  </span>
                </div>
                {expandedSections.has("data") ? (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                )}
              </button>
              {expandedSections.has("data") && (
                <div className="p-5 pt-0 space-y-4">
                  <div className="bg-[#8b5cf6]/10 border border-purple-500/30 rounded-xl p-5">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-14 h-14 bg-[#8b5cf6]/20 rounded-xl flex items-center justify-center">
                        <Database className="w-7 h-7 text-purple-400" />
                      </div>
                      <div>
                        <div className="text-xl font-medium text-white">{details.data_impact.name}</div>
                        <div className="text-sm text-slate-400">{details.data_impact.type}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="p-3 bg-slate-900/50 rounded-lg text-center">
                        <div className="text-sm text-slate-400">Classification</div>
                        <div className="text-lg font-medium text-white">{details.data_impact.classification}</div>
                      </div>
                      <div className="p-3 bg-slate-900/50 rounded-lg text-center">
                        <div className="text-sm text-slate-400">Records at Risk</div>
                        <div className="text-lg font-medium text-white">
                          {details.data_impact.estimated_records.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Data Types */}
                    <div className="mb-3">
                      <div className="text-sm text-slate-400 mb-2">Data Types:</div>
                      <div className="flex flex-wrap gap-2">
                        {details.data_impact.data_types.map((type) => (
                          <span key={type} className="px-3 py-1 bg-[#8b5cf6]/20 text-purple-400 text-sm rounded-lg">
                            {type}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Compliance */}
                    <div className="mb-4">
                      <div className="text-sm text-slate-400 mb-2">Compliance Frameworks:</div>
                      <div className="flex flex-wrap gap-2">
                        {details.data_impact.compliance.map((framework) => (
                          <span key={framework} className="px-3 py-1 bg-blue-500/20 text-blue-400 text-sm rounded-lg">
                            {framework}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Flags */}
                    <div className="flex gap-6">
                      <div className={`flex items-center gap-2 ${details.data_impact.contains_pii ? "text-red-400" : "text-slate-500"}`}>
                        {details.data_impact.contains_pii ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                        <span className="text-sm">Contains PII</span>
                      </div>
                      <div className={`flex items-center gap-2 ${details.data_impact.contains_financial ? "text-red-400" : "text-slate-500"}`}>
                        {details.data_impact.contains_financial ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                        <span className="text-sm">Financial Data</span>
                      </div>
                    </div>
                  </div>

                  {/* Breach Impact */}
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-red-400 font-medium mb-2">
                      <FileWarning className="w-5 h-5" />
                      Potential Breach Impact
                    </div>
                    <p className="text-slate-300">{details.data_impact.breach_impact}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Remediation Actions - Full Width */}
        <div className="bg-slate-900/50 rounded-2xl border border-slate-700 overflow-hidden">
          <button
            onClick={() => toggleSection("remediation")}
            className="w-full p-5 flex items-center justify-between hover:bg-slate-800/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-400" />
              <span className="text-lg font-semibold text-white">Remediation Actions</span>
              <span className="px-3 py-1 bg-green-500/20 text-green-400 text-sm rounded-full">
                {details.remediations.length} actions
              </span>
            </div>
            {expandedSections.has("remediation") ? (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronRight className="w-5 h-5 text-slate-400" />
            )}
          </button>
          {expandedSections.has("remediation") && (
            <div className="p-5 pt-0">
              <div className="grid grid-cols-2 gap-4">
                {details.remediations.map((rem, i) => (
                  <div key={i} className="bg-slate-800/50 rounded-xl p-4">
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold ${
                        rem.priority === 1 ? "bg-red-500 text-white" :
                        rem.priority === 2 ? "bg-orange-500 text-white" :
                        rem.priority === 3 ? "bg-yellow-500 text-black" :
                        "bg-slate-600 text-white"
                      }`}>
                        {rem.priority}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-white text-lg">{rem.title}</span>
                          <div className="flex gap-2">
                            <span className={`px-2 py-1 text-xs rounded ${
                              rem.category === "Vulnerability" ? "bg-red-500/20 text-red-400" :
                              rem.category === "Network" ? "bg-blue-500/20 text-blue-400" :
                              rem.category === "Identity" ? "bg-yellow-500/20 text-yellow-400" :
                              "bg-slate-600 text-slate-300"
                            }`}>
                              {rem.category}
                            </span>
                            {rem.automation_available && (
                              <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded">
                                Auto
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-slate-400 mb-3">{rem.description}</p>
                        <div className="flex items-center gap-6 text-sm">
                          <span className="text-slate-500">Effort: <span className="text-slate-300">{rem.effort}</span></span>
                          <span className="text-slate-500">Risk Reduction: <span className="text-green-400">{rem.risk_reduction}</span></span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Block Success Modal */}
        {showBlockSuccess && blockResult && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60">
            <div className="bg-slate-900 rounded-2xl border border-green-500/50 p-8 max-w-2xl w-full mx-4 shadow-2xl">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 bg-green-500/20 rounded-2xl flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-green-400" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white">Attack Path Blocked</h3>
                  <p className="text-slate-400">{blockResult.message}</p>
                </div>
              </div>

              {/* Risk Reduction */}
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Risk Reduction</span>
                  <span className="text-2xl font-bold text-green-400">-{blockResult.risk_reduction} points</span>
                </div>
              </div>

              {/* Actions Taken */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-slate-400 uppercase mb-3">Actions Taken</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {blockResult.actions_taken.map((action, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
                      <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">{action.resource_name}</span>
                          <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded">
                            {action.action_type}
                          </span>
                        </div>
                        <p className="text-sm text-slate-400 truncate">{action.details}</p>
                      </div>
                      <span className="text-green-400 text-sm">{action.status}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rollback Notice */}
              {blockResult.rollback_available && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mb-6">
                  <div className="flex items-center gap-2 text-yellow-400 text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    Rollback is available if you need to undo these changes
                  </div>
                </div>
              )}

              {/* Close Button */}
              <div className="flex justify-center">
                <button
                  onClick={() => {
                    setShowBlockSuccess(false)
                    onClose()
                  }}
                  className="px-8 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium text-lg transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex justify-center gap-4 pt-4">
          <button
            onClick={handleBlockPath}
            disabled={blocking || showBlockSuccess}
            className={`px-8 py-3 rounded-xl font-medium text-lg transition-colors flex items-center gap-3 ${
              blocking || showBlockSuccess
                ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                : 'bg-red-500 hover:bg-red-600 text-white'
            }`}
          >
            {blocking ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Blocking...
              </>
            ) : showBlockSuccess ? (
              <>
                <CheckCircle2 className="w-5 h-5" />
                Blocked
              </>
            ) : (
              <>
                <Shield className="w-5 h-5" />
                Block Attack Path
              </>
            )}
          </button>
          <button
            onClick={() => setShowSimulation(true)}
            className="px-8 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium text-lg transition-colors flex items-center gap-3"
          >
            <Zap className="w-5 h-5" />
            Run Simulation
          </button>
          <button
            onClick={handleExportReport}
            className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-medium text-lg transition-colors flex items-center gap-3"
          >
            <ExternalLink className="w-5 h-5" />
            Export Report
          </button>
          <button
            onClick={onClose}
            className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium text-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Attack Simulation Panel - wrapped to prevent crash */}
      {showSimulation && (
        <React.Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"><div className="text-white">Loading simulation...</div></div>}>
          <AttackSimulationPanel
            isOpen={showSimulation}
            onClose={() => setShowSimulation(false)}
            systemName={systemName}
            pathId={pathId}
            pathName={details?.path_summary?.source?.name && details?.path_summary?.target?.name
              ? `${details.path_summary.source.name} → ${details.path_summary.target.name}`
              : undefined
            }
          />
        </React.Suspense>
      )}
    </div>
  )
}
