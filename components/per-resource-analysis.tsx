"use client"

import { useState, useCallback } from "react"
import {
  Split,
  Search,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Server,
  Zap,
  Shield,
  ArrowRight,
  Play,
  Loader2,
  ArrowLeft,
  Database,
  Activity,
  Eye,
  Globe,
  Lock,
  Network,
  Filter,
} from "lucide-react"

// ── Types ────────────────────────────────────────────

interface ScanResource {
  resource_id: string
  resource_name: string
  resource_type: string
}

interface ScannedRole {
  role_name: string
  role_arn: string
  total_permissions: number
  resources: ScanResource[]
  all_permissions: string[]
  resource_type?: string  // "SecurityGroup" for SGs, undefined for IAM roles
  sg_id?: string
  has_public?: boolean
  active_ports?: number
  inbound_rules?: number
}

interface PermissionUsed {
  action: string
  call_count: number
  targets: string[]
}

interface ResourceAnalysis {
  resource_id: string
  resource_name: string
  resource_type: string
  permissions_granted: number
  permissions_used: PermissionUsed[]
  unused_permissions: string[]
  risk_factors: string[]
  used_count: number
  utilization_rate: number
  over_permission_ratio: number
  total_api_calls: number
}

interface AnalysisData {
  role: ScannedRole
  analyses: ResourceAnalysis[]
  aggregated: { total_permissions: number; used_permissions: number }
}

interface ProposedRole {
  role_name: string
  resource_id: string
  resource_name: string
  permissions: string[]
  resource_conditions: Record<string, string>
}

interface RecommendData {
  original_role: string
  original_permissions: number
  resources_attached: number
  aggregated_used: number
  aggregated_risk_reduction: number
  cyntro_risk_reduction: number
  total_new_permissions: number
  proposed_roles: ProposedRole[]
  policies: Record<string, any>
}

interface SimResult {
  resource_id: string
  resource_name: string
  proposed_role: string
  total_events: number
  successful: number
  denied: number
  confidence: number
  passed: boolean
}

interface SimData {
  results: SimResult[]
  all_passed: boolean
}

interface RemediateStep {
  action: string
  target: string
  status: string
  details: string
}

interface RemediateData {
  dry_run: boolean
  steps: RemediateStep[]
  summary: { before_total: number; after_total: number; reduction: number }
}

interface PerResourceRemediateResult {
  resource_id: string
  resource_name: string
  resource_type: string
  permissions_count: number
  permissions: string[]
  new_role_name: string | null
  new_role_arn: string | null
  snapshot_id: string | null
  steps: RemediateStep[]
}

interface PerResourceRemediateData {
  success: boolean
  dry_run: boolean
  original_role: string
  total_resources: number
  resources: PerResourceRemediateResult[]
  summary: {
    before_total_exposure: number
    after_total_exposure: number
    reduction_percentage: number
  }
  snapshots: string[]
  message: string
}

type Stage = "scan" | "analysis" | "comparison" | "simulation" | "remediation"

// ── Component ────────────────────────────────────────

export function PerResourceAnalysis({ systemName }: { systemName?: string }) {
  const [stage, setStage] = useState<Stage>("scan")
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState("")
  const [error, setError] = useState<string | null>(null)

  // Data
  const [roles, setRoles] = useState<ScannedRole[]>([])
  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const [selectedIsSG, setSelectedIsSG] = useState(false)
  const [selectedSGData, setSelectedSGData] = useState<ScannedRole | null>(null)
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null)
  const [recommendData, setRecommendData] = useState<RecommendData | null>(null)
  const [simData, setSimData] = useState<SimData | null>(null)
  const [remediateData, setRemediateData] = useState<RemediateData | null>(null)
  const [perResourceRemediateData, setPerResourceRemediateData] = useState<PerResourceRemediateData | null>(null)

  // SG restructure state
  const [sgRestructurePhase, setSgRestructurePhase] = useState<"idle" | "analyzing" | "proposing" | "proposed" | "executing" | "done">("idle")
  const [sgEniAnalysis, setSgEniAnalysis] = useState<any>(null)
  const [sgProposal, setSgProposal] = useState<any>(null)
  const [sgExecResult, setSgExecResult] = useState<any>(null)

  // UI state
  const [activeTab, setActiveTab] = useState<"aggregated" | "per-resource">("aggregated")
  const [aggApplied, setAggApplied] = useState(false)
  const [scanTab, setScanTab] = useState<"action-required" | "no-issues">("action-required")

  // ── API helper ──
  const apiCall = useCallback(async (method: string, path: string, body?: any) => {
    const opts: RequestInit = {
      method,
      headers: { "Content-Type": "application/json" },
    }
    if (body) opts.body = JSON.stringify(body)
    const res = await fetch(path, opts)
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw new Error(errBody.error || `HTTP ${res.status}`)
    }
    return res.json()
  }, [])

  // ── SG Restructure handlers ──
  const handleSgAnalyze = useCallback(async () => {
    if (!selectedSGData?.sg_id) return
    setSgRestructurePhase("analyzing")
    setSgEniAnalysis(null)
    setSgProposal(null)
    setSgExecResult(null)
    setError(null)
    try {
      const data = await apiCall("GET", `/api/proxy/sg-restructure/${selectedSGData.sg_id}/per-eni-analysis?days=90`)
      setSgEniAnalysis(data)
      setSgRestructurePhase("idle")
    } catch (e: any) {
      setError(e.message)
      setSgRestructurePhase("idle")
    }
  }, [apiCall, selectedSGData])

  const handleSgPropose = useCallback(async () => {
    if (!selectedSGData?.sg_id) return
    setSgRestructurePhase("proposing")
    setError(null)
    try {
      const data = await apiCall("POST", `/api/proxy/sg-restructure/${selectedSGData.sg_id}/propose-restructure`, { days: 90 })
      setSgProposal(data)
      setSgRestructurePhase("proposed")
    } catch (e: any) {
      setError(e.message)
      setSgRestructurePhase("idle")
    }
  }, [apiCall, selectedSGData])

  const handleSgExecute = useCallback(async () => {
    if (!selectedSGData?.sg_id || !sgProposal?.proposal_id) return
    setSgRestructurePhase("executing")
    setError(null)
    try {
      const data = await apiCall("POST", `/api/proxy/sg-restructure/${selectedSGData.sg_id}/execute-restructure`, {
        proposal_id: sgProposal.proposal_id,
        create_snapshot: true,
      })
      setSgExecResult(data)
      setSgRestructurePhase("done")
    } catch (e: any) {
      setError(e.message)
      setSgRestructurePhase("proposed")
    }
  }, [apiCall, selectedSGData, sgProposal])

  const handleSgRollback = useCallback(async () => {
    if (!selectedSGData?.sg_id || !sgExecResult?.snapshot_id) return
    setSgRestructurePhase("executing")
    setError(null)
    try {
      await apiCall("POST", `/api/proxy/sg-restructure/${selectedSGData.sg_id}/rollback-restructure`, {
        snapshot_id: sgExecResult.snapshot_id,
      })
      setSgRestructurePhase("idle")
      setSgProposal(null)
      setSgExecResult(null)
    } catch (e: any) {
      setError(e.message)
      setSgRestructurePhase("done")
    }
  }, [apiCall, selectedSGData, sgExecResult])

  // ── Scan ──
  const runScan = useCallback(async () => {
    setLoading(true)
    setLoadingMsg("Scanning for shared IAM roles and Security Groups...")
    setError(null)
    setRoles([])
    setSelectedRole(null)
    setAnalysisData(null)
    setRecommendData(null)
    setSimData(null)
    setRemediateData(null)
    setPerResourceRemediateData(null)
    setStage("scan")

    try {
      const qs = systemName ? `?system_name=${encodeURIComponent(systemName)}` : ""
      const data = await apiCall("GET", `/api/proxy/cyntro/scan${qs}`)
      setRoles(data)
      if (data.length === 0) {
        setError("No shared resources found. All roles and SGs are single-resource.")
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
      setLoadingMsg("")
    }
  }, [apiCall, systemName])

  // ── Analyze role or SG ──
  const analyzeRole = useCallback(
    async (roleName: string) => {
      // Check if it's an SG
      const sgItem = roles.find(r => r.role_name === roleName && r.resource_type === "SecurityGroup")
      setSelectedIsSG(!!sgItem)
      setSelectedSGData(sgItem || null)
      setSelectedRole(roleName)
      setActiveTab("aggregated")
      setAggApplied(false)
      setRecommendData(null)
      setSimData(null)
      setRemediateData(null)

      if (sgItem) {
        // For SGs, we show the scan data directly — no CloudTrail analysis needed
        setAnalysisData(null)
        setStage("analysis")
        // Reset restructure state
        setSgRestructurePhase("idle")
        setSgEniAnalysis(null)
        setSgProposal(null)
        setSgExecResult(null)
        return
      }

      setLoading(true)
      setLoadingMsg("Querying CloudTrail for per-resource usage...")
      setError(null)
      setStage("analysis")

      try {
        const data = await apiCall("POST", "/api/proxy/cyntro/analyze", {
          role_name: roleName,
          days: 90,
        })
        setAnalysisData(data)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
        setLoadingMsg("")
      }
    },
    [apiCall, roles]
  )

  // ── Compare ──
  const showComparison = useCallback(async () => {
    if (!selectedRole) return
    setLoading(true)
    setLoadingMsg("Generating split recommendation...")
    setError(null)
    setStage("comparison")

    try {
      const data = await apiCall("POST", "/api/proxy/cyntro/recommend", {
        role_name: selectedRole,
        days: 90,
      })
      setRecommendData(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
      setLoadingMsg("")
    }
  }, [apiCall, selectedRole])

  // ── Simulate ──
  const runSimulation = useCallback(async () => {
    if (!selectedRole) return
    setLoading(true)
    setLoadingMsg("Replaying CloudTrail events against proposed policies...")
    setError(null)
    setStage("simulation")

    try {
      const data = await apiCall("POST", "/api/proxy/cyntro/simulate", {
        role_name: selectedRole,
        days: 90,
      })
      setSimData(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
      setLoadingMsg("")
    }
  }, [apiCall, selectedRole])

  // ── Remediate ──
  const runRemediation = useCallback(
    async (dryRun: boolean) => {
      if (!selectedRole) return
      setLoading(true)
      setLoadingMsg(dryRun ? "Executing remediation (dry run)..." : "Executing live remediation...")
      setError(null)
      setStage("remediation")

      try {
        const data = await apiCall("POST", "/api/proxy/cyntro/remediate", {
          role_name: selectedRole,
          days: 90,
          dry_run: dryRun,
        })
        setRemediateData(data)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
        setLoadingMsg("")
      }
    },
    [apiCall, selectedRole]
  )

  // ── Per-Resource Remediate ──
  const runPerResourceRemediation = useCallback(
    async (dryRun: boolean) => {
      if (!selectedRole) return
      setLoading(true)
      setLoadingMsg(dryRun ? "Creating per-resource roles (dry run)..." : "Creating per-resource roles (LIVE)...")
      setError(null)
      setStage("remediation")
      setPerResourceRemediateData(null)

      try {
        const data = await apiCall("POST", "/api/proxy/cyntro/remediate-per-resource", {
          role_name: selectedRole,
          dry_run: dryRun,
        })
        setPerResourceRemediateData(data)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
        setLoadingMsg("")
      }
    },
    [apiCall, selectedRole]
  )

  // Get icon and display info for resource type
  const getResourceTypeInfo = (type: string) => {
    const typeUpper = type?.toUpperCase() || ""
    if (typeUpper.includes("LAMBDA") || typeUpper.includes("FUNCTION")) {
      return { icon: <Zap className="w-4 h-4" />, label: "Lambda", color: "bg-[#8b5cf615] text-[#7c3aed] border-purple-300" }
    }
    if (typeUpper.includes("EC2") || typeUpper === "INSTANCE") {
      return { icon: <Server className="w-4 h-4" />, label: "EC2", color: "bg-[#f9731620] text-[#f97316] border-orange-300" }
    }
    if (typeUpper.includes("INSTANCEPROFILE") || typeUpper.includes("INSTANCE-PROFILE") || typeUpper.includes("INSTANCE_PROFILE")) {
      return { icon: <Shield className="w-4 h-4" />, label: "Instance Profile", color: "bg-[#8b5cf615] text-[#7c3aed] border-[#8b5cf640]" }
    }
    if (typeUpper.includes("SECURITY") || typeUpper.includes("SG")) {
      return { icon: <Shield className="w-4 h-4" />, label: "Security Group", color: "bg-[#ef444420] text-[#ef4444] border-[#ef444440]" }
    }
    if (typeUpper.includes("IAM") || typeUpper.includes("ROLE")) {
      return { icon: <Shield className="w-4 h-4" />, label: "IAM Role", color: "bg-[#3b82f620] text-[#3b82f6] border-blue-300" }
    }
    if (typeUpper.includes("ECS") || typeUpper.includes("CONTAINER")) {
      return { icon: <Server className="w-4 h-4" />, label: "ECS", color: "bg-teal-100 text-teal-700 border-teal-300" }
    }
    if (typeUpper.includes("RDS") || typeUpper.includes("DATABASE")) {
      return { icon: <Database className="w-4 h-4" />, label: "RDS", color: "bg-[#3b82f620] text-[#3b82f6] border-blue-300" }
    }
    if (typeUpper.includes("S3") || typeUpper.includes("BUCKET")) {
      return { icon: <Database className="w-4 h-4" />, label: "S3", color: "bg-[#22c55e20] text-[#22c55e] border-[#22c55e40]" }
    }
    if (typeUpper.includes("DYNAMO")) {
      return { icon: <Database className="w-4 h-4" />, label: "DynamoDB", color: "bg-[#eab30820] text-[#eab308] border-yellow-300" }
    }
    return { icon: <Server className="w-4 h-4" />, label: type || "Resource", color: "bg-gray-100 text-[var(--foreground,#374151)] border-[var(--border,#d1d5db)]" }
  }

  const resourceIcon = (type: string) => getResourceTypeInfo(type).icon

  // ── Resource type colors for themed rendering ──
  const getTypeColor = (type: string) => {
    const t = (type || "").toUpperCase()
    if (t.includes("LAMBDA")) return "#f59e0b"
    if (t.includes("EC2")) return "#3b82f6"
    if (t.includes("ECS") || t.includes("FARGATE") || t.includes("CONTAINER")) return "#06b6d4"
    if (t.includes("RDS") || t.includes("DATABASE")) return "#8b5cf6"
    if (t.includes("S3") || t.includes("BUCKET")) return "#22c55e"
    if (t.includes("DYNAMO")) return "#f97316"
    if (t.includes("LOADBALANCER") || t.includes("ELB") || t.includes("ALB") || t.includes("NLB")) return "#ec4899"
    if (t.includes("VPCENDPOINT") || t.includes("VPCE")) return "#a78bfa"
    if (t.includes("NATGATEWAY") || t.includes("NAT")) return "#14b8a6"
    if (t.includes("EFS") || t.includes("MOUNT")) return "#84cc16"
    if (t.includes("ELASTICACHE") || t.includes("REDIS") || t.includes("MEMCACHED")) return "#f43f5e"
    if (t.includes("REDSHIFT")) return "#7c3aed"
    if (t.includes("CODEBUILD")) return "#0ea5e9"
    if (t.includes("NETWORK") && t.includes("INTERFACE")) return "#6b7280"
    return "#6b7280"
  }
  const getTypeLabel = (type: string) => {
    const t = (type || "").toUpperCase()
    if (t.includes("LAMBDA")) return "Lambda"
    if (t.includes("EC2")) return "EC2"
    if (t.includes("ECS") || t.includes("FARGATE")) return "ECS"
    if (t.includes("RDS")) return "RDS"
    if (t.includes("S3")) return "S3"
    if (t.includes("DYNAMO")) return "DynamoDB"
    if (t.includes("LOADBALANCER") || t.includes("ELB")) return "ALB/NLB"
    if (t.includes("VPCENDPOINT") || t.includes("VPCE")) return "VPC Endpoint"
    if (t.includes("NATGATEWAY") || t.includes("NAT")) return "NAT GW"
    if (t.includes("EFS") || t.includes("MOUNT")) return "EFS"
    if (t.includes("ELASTICACHE")) return "ElastiCache"
    if (t.includes("REDSHIFT")) return "Redshift"
    if (t.includes("CODEBUILD")) return "CodeBuild"
    if (t.includes("NETWORK") && t.includes("INTERFACE")) return "ENI"
    if (t.includes("INSTANCE") && t.includes("PROFILE")) return "Profile"
    return type || "Resource"
  }

  // ── RENDER ──

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Shared Resource Analysis</h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Discover shared IAM roles and Security Groups, split into per-resource least-privilege policies
          </p>
        </div>
        {selectedRole && (
          <button
            onClick={() => {
              setSelectedRole(null)
              setSelectedIsSG(false)
              setSelectedSGData(null)
              setAnalysisData(null)
              setRecommendData(null)
              setSimData(null)
              setRemediateData(null)
              setStage("scan")
            }}
            className="flex items-center gap-2 text-sm transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to scan results
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border p-4 flex items-start gap-3" style={{ background: "#ef444410", borderColor: "#ef444440" }}>
          <XCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#ef4444" }} />
          <div>
            <p className="text-sm font-medium" style={{ color: "#ef4444" }}>Error</p>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{error}</p>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="rounded-lg border p-6 flex items-center gap-4" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#8b5cf6" }} />
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{loadingMsg}</span>
        </div>
      )}

      {/* ──────────── SCAN SECTION ──────────── */}
      <div className="rounded-lg border p-6" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Shared Resource Scanner</h3>
          <button
            onClick={runScan}
            disabled={loading}
            className="flex items-center gap-2 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors hover:opacity-90 disabled:opacity-50"
            style={{ background: "#8b5cf6" }}
          >
            <Search className="w-4 h-4" />
            Scan AWS Account
          </button>
        </div>

        {roles.length === 0 && !loading && !error && (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Click &quot;Scan AWS Account&quot; to discover shared roles and security groups.</p>
        )}

        {roles.length > 0 && !selectedRole && (() => {
          // Classify resources into action-required vs no-issues
          const classifyResource = (r: ScannedRole): boolean => {
            if (r.resource_type === "SecurityGroup") {
              const inbound = r.inbound_rules || r.total_permissions || 0
              const ports = r.active_ports || 0
              // Action required: public SG, unused rules, or over-exposed ports
              if (r.has_public) return true
              if (inbound > 0 && ports === 0) return true  // no traffic at all
              if (ports > 0 && ports < inbound) return true  // unused ports open
              return false
            }
            // IAM Role: action required if diverse resources share permissions
            const names = r.resources.map(res => res.resource_name)
            const prefixes = new Set(names.map(n => n.replace(/[-_]\d+$/, "").toLowerCase()))
            return prefixes.size > 1  // functionally different resources = over-permission risk
          }

          const actionRequired = roles.filter(r => classifyResource(r))
          const noIssues = roles.filter(r => !classifyResource(r))
          const currentItems = scanTab === "action-required" ? actionRequired : noIssues
          const currentIamRoles = currentItems.filter(r => r.resource_type !== "SecurityGroup")
          const currentSgItems = currentItems.filter(r => r.resource_type === "SecurityGroup")

          return (
          <div className="space-y-3">
            {/* Tab switcher */}
            <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: "var(--bg-primary)", border: "1px solid var(--border-subtle)" }}>
              <button
                onClick={() => setScanTab("action-required")}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all flex-1 justify-center"
                style={{
                  background: scanTab === "action-required" ? "#ef4444" : "transparent",
                  color: scanTab === "action-required" ? "#fff" : "var(--text-secondary)",
                }}
              >
                <AlertTriangle className="w-4 h-4" />
                Action Required
                {actionRequired.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-xs font-bold" style={{
                    background: scanTab === "action-required" ? "rgba(255,255,255,0.2)" : "#ef444420",
                    color: scanTab === "action-required" ? "#fff" : "#ef4444",
                  }}>{actionRequired.length}</span>
                )}
              </button>
              <button
                onClick={() => setScanTab("no-issues")}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all flex-1 justify-center"
                style={{
                  background: scanTab === "no-issues" ? "#22c55e" : "transparent",
                  color: scanTab === "no-issues" ? "#fff" : "var(--text-secondary)",
                }}
              >
                <CheckCircle2 className="w-4 h-4" />
                No Issues
                {noIssues.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-xs font-bold" style={{
                    background: scanTab === "no-issues" ? "rgba(255,255,255,0.2)" : "#22c55e20",
                    color: scanTab === "no-issues" ? "#fff" : "#22c55e",
                  }}>{noIssues.length}</span>
                )}
              </button>
            </div>

            {/* Tab content */}
            {currentItems.length === 0 && (
              <div className="text-center py-8">
                {scanTab === "action-required" ? (
                  <>
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2" style={{ color: "#22c55e" }} />
                    <p className="text-sm font-medium" style={{ color: "#22c55e" }}>No action required</p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>All shared resources are properly configured</p>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2" style={{ color: "#f97316" }} />
                    <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>All shared resources need attention</p>
                  </>
                )}
              </div>
            )}

            {/* IAM Roles */}
            {currentIamRoles.length > 0 && currentSgItems.length > 0 && (
              <div className="text-xs font-semibold uppercase tracking-wider pt-2" style={{ color: "var(--text-muted)" }}>
                IAM Roles
              </div>
            )}
            {currentIamRoles.map((role) => {
              const resourceTypes = [...new Set(role.resources.map(r => getTypeLabel(r.resource_type)))]
              const roleType = resourceTypes.length === 1
                ? `${resourceTypes[0]} Execution Role`
                : `Shared across ${resourceTypes.join(", ")}`
              const totalExposure = role.total_permissions * role.resources.length
              const exposureSeverity = totalExposure > 100 ? "#ef4444" : totalExposure > 30 ? "#f97316" : "#eab308"

              return (
                <button
                  key={role.role_name}
                  onClick={() => analyzeRole(role.role_name)}
                  className="w-full text-left rounded-lg border p-5 transition-all hover:bg-white/5"
                  style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)" }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-mono text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                        {role.role_name}
                      </div>
                      <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                        {roleType}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 mt-1" style={{ color: "var(--text-muted)" }} />
                  </div>

                  <div className="grid grid-cols-4 gap-3 mb-3">
                    <div className="rounded-lg p-2 border text-center" style={{ borderColor: "var(--border-subtle)" }}>
                      <div className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{role.total_permissions}</div>
                      <div className="text-[10px] uppercase" style={{ color: "var(--text-muted)" }}>Permissions</div>
                    </div>
                    <div className="rounded-lg p-2 border text-center" style={{ borderColor: "var(--border-subtle)" }}>
                      <div className="text-lg font-bold" style={{ color: "#f97316" }}>{role.resources.length}</div>
                      <div className="text-[10px] uppercase" style={{ color: "var(--text-muted)" }}>Resources</div>
                    </div>
                    <div className="rounded-lg p-2 border text-center" style={{ borderColor: `${exposureSeverity}40`, background: `${exposureSeverity}10` }}>
                      <div className="text-lg font-bold" style={{ color: exposureSeverity }}>{totalExposure}</div>
                      <div className="text-[10px] uppercase" style={{ color: "var(--text-muted)" }}>Total Exposure</div>
                    </div>
                    <div className="rounded-lg p-2 border text-center" style={{ borderColor: "#ef444440", background: "#ef444410" }}>
                      <div className="text-xs font-bold" style={{ color: "#ef4444" }}>SHARED</div>
                      <div className="text-[10px] uppercase mt-1" style={{ color: "var(--text-muted)" }}>Blast radius risk</div>
                    </div>
                  </div>

                  {role.resources.length > 1 && (() => {
                    const names = role.resources.map(r => r.resource_name)
                    const prefixes = new Set(names.map(n => n.replace(/[-_]\d+$/, "").toLowerCase()))
                    const diverse = prefixes.size > 1
                    const perms = role.total_permissions

                    if (diverse && perms > 5) {
                      return (
                        <div className="text-xs mb-3 px-3 py-2 rounded-lg border" style={{ background: "#ef444410", borderColor: "#ef444440", color: "#ef4444" }}>
                          {role.resources.length} functionally different resources share {perms} permissions. If any one is compromised, the attacker gets all {perms} permissions across every resource.
                        </div>
                      )
                    }
                    if (diverse) {
                      return (
                        <div className="text-xs mb-3 px-3 py-2 rounded-lg border" style={{ background: "#f9731610", borderColor: "#f9731640", color: "#f97316" }}>
                          {role.resources.length} functionally different resources share this role. As permissions are added for each resource&apos;s needs, every resource gets every permission. Split before the blast radius grows.
                        </div>
                      )
                    }
                    return (
                      <div className="text-xs mb-3 px-3 py-2 rounded-lg border" style={{ background: "#22c55e10", borderColor: "#22c55e40", color: "#22c55e" }}>
                        {role.resources.length} identical resources share this role — expected for homogeneous workloads.
                      </div>
                    )
                  })()}

                  <div className="flex flex-wrap gap-1.5">
                    {role.resources.map((r) => {
                      const color = getTypeColor(r.resource_type)
                      const label = getTypeLabel(r.resource_type)
                      return (
                        <span
                          key={r.resource_id}
                          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border font-medium"
                          style={{ background: `${color}15`, color, borderColor: `${color}40` }}
                        >
                          <span className="text-[10px] uppercase opacity-75 font-semibold">{label}</span>
                          <span className="font-bold">{r.resource_name}</span>
                        </span>
                      )
                    })}
                  </div>
                </button>
              )
            })}

            {/* Security Groups */}
            {currentSgItems.length > 0 && (
              <>
                {currentIamRoles.length > 0 && (
                  <div className="text-xs font-semibold uppercase tracking-wider pt-3" style={{ color: "var(--text-muted)" }}>
                    Security Groups
                  </div>
                )}
                {currentSgItems.map((sg) => {
                  const totalRules = sg.total_permissions || 0
                  const activePorts = sg.active_ports || 0
                  const hasPublic = sg.has_public || false

                  return (
                    <button
                      key={sg.sg_id || sg.role_name}
                      onClick={() => analyzeRole(sg.role_name)}
                      className="w-full text-left rounded-lg border p-5 transition-all hover:bg-white/5"
                      style={{ background: "var(--bg-primary)", borderColor: hasPublic ? "#ef444440" : "var(--border-subtle)" }}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4" style={{ color: "#ef4444" }} />
                          <div>
                            <div className="font-mono text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                              {sg.role_name}
                            </div>
                            <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                              Shared Security Group {sg.sg_id ? `(${sg.sg_id})` : ""}
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 mt-1" style={{ color: "var(--text-muted)" }} />
                      </div>

                      <div className="grid grid-cols-4 gap-3 mb-3">
                        <div className="rounded-lg p-2 border text-center" style={{ borderColor: "var(--border-subtle)" }}>
                          <div className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{sg.inbound_rules || totalRules}</div>
                          <div className="text-[10px] uppercase" style={{ color: "var(--text-muted)" }}>Inbound Rules</div>
                        </div>
                        <div className="rounded-lg p-2 border text-center" style={{ borderColor: "var(--border-subtle)" }}>
                          <div className="text-lg font-bold" style={{ color: "#f97316" }}>{sg.resources.length}</div>
                          <div className="text-[10px] uppercase" style={{ color: "var(--text-muted)" }}>Resources</div>
                        </div>
                        <div className="rounded-lg p-2 border text-center" style={{ borderColor: activePorts > 0 ? "#22c55e40" : "#ef444440", background: activePorts > 0 ? "#22c55e10" : "#ef444410" }}>
                          <div className="text-lg font-bold" style={{ color: activePorts > 0 ? "#22c55e" : "#ef4444" }}>{activePorts}</div>
                          <div className="text-[10px] uppercase" style={{ color: "var(--text-muted)" }}>Active Ports</div>
                        </div>
                        <div className="rounded-lg p-2 border text-center" style={{ borderColor: hasPublic ? "#ef444440" : "#f9731640", background: hasPublic ? "#ef444410" : "#f9731610" }}>
                          <div className="text-xs font-bold" style={{ color: hasPublic ? "#ef4444" : "#f97316" }}>
                            {hasPublic ? "PUBLIC" : "SHARED"}
                          </div>
                          <div className="text-[10px] uppercase mt-1" style={{ color: "var(--text-muted)" }}>
                            {hasPublic ? "Internet exposed" : "Multi-resource"}
                          </div>
                        </div>
                      </div>

                      {sg.resources.length > 1 && (() => {
                        const inbound = sg.inbound_rules || totalRules
                        const ports = sg.active_ports || 0
                        if (hasPublic) {
                          return (
                            <div className="text-xs mb-3 px-3 py-2 rounded-lg border" style={{ background: "#ef444410", borderColor: "#ef444440", color: "#ef4444" }}>
                              Internet-exposed SG shared by {sg.resources.length} resources. A port opened for one resource exposes all {sg.resources.length} to the internet.
                            </div>
                          )
                        }
                        if (inbound > 0 && ports === 0) {
                          return (
                            <div className="text-xs mb-3 px-3 py-2 rounded-lg border" style={{ background: "#ef444410", borderColor: "#ef444440", color: "#ef4444" }}>
                              {inbound} inbound rule{inbound !== 1 ? "s" : ""} but zero observed traffic — these rules may be unnecessary. {sg.resources.length} resources are exposed to ports none of them use.
                            </div>
                          )
                        }
                        if (ports > 0 && ports < inbound) {
                          return (
                            <div className="text-xs mb-3 px-3 py-2 rounded-lg border" style={{ background: "#f9731610", borderColor: "#f9731640", color: "#f97316" }}>
                              {inbound} inbound rule{inbound !== 1 ? "s" : ""} but only {ports} port{ports !== 1 ? "s have" : " has"} traffic. {sg.resources.length} resources are exposed to {inbound - ports} unused port{inbound - ports !== 1 ? "s" : ""}.
                            </div>
                          )
                        }
                        return (
                          <div className="text-xs mb-3 px-3 py-2 rounded-lg border" style={{ background: "#f9731610", borderColor: "#f9731640", color: "#f97316" }}>
                            {sg.resources.length} resources share this SG — a rule change affects all of them. Consider per-resource SGs for isolation.
                          </div>
                        )
                      })()}

                      <div className="flex flex-wrap gap-1.5">
                        {sg.resources.map((r) => {
                          const color = getTypeColor(r.resource_type)
                          const label = getTypeLabel(r.resource_type)
                          return (
                            <span
                              key={r.resource_id}
                              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border font-medium"
                              style={{ background: `${color}15`, color, borderColor: `${color}40` }}
                            >
                              <span className="text-[10px] uppercase opacity-75 font-semibold">{label}</span>
                              <span className="font-bold">{r.resource_name}</span>
                            </span>
                          )
                        })}
                      </div>
                    </button>
                  )
                })}
              </>
            )}
          </div>
          )
        })()}
      </div>

      {/* ──────────── SG ANALYSIS SECTION ──────────── */}
      {selectedIsSG && selectedSGData && stage !== "scan" && (
        <div className="space-y-4">
          {/* ── Header card ── */}
          <div className="rounded-lg border p-5" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#ef444415" }}>
                  <Shield className="w-5 h-5" style={{ color: "#ef4444" }} />
                </div>
                <div>
                  <h3 className="text-base font-bold font-mono" style={{ color: "var(--text-primary)" }}>{selectedSGData.role_name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>{selectedSGData.sg_id}</span>
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium" style={{
                      background: selectedSGData.has_public ? "#ef444415" : "#22c55e15",
                      color: selectedSGData.has_public ? "#ef4444" : "#22c55e",
                    }}>
                      {selectedSGData.has_public ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                      {selectedSGData.has_public ? "Internet Exposed" : "Private"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Summary metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg p-3 border text-center" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-primary)" }}>
                <div className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{selectedSGData.inbound_rules || selectedSGData.total_permissions}</div>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Inbound Rules</div>
              </div>
              <div className="rounded-lg p-3 border text-center" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-primary)" }}>
                <div className="text-2xl font-bold" style={{ color: "#f97316" }}>{selectedSGData.resources.length}</div>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Resources Sharing</div>
              </div>
              <div className="rounded-lg p-3 border text-center" style={{
                borderColor: (selectedSGData.active_ports || 0) > 0 ? "#22c55e40" : "#ef444440",
                background: (selectedSGData.active_ports || 0) > 0 ? "#22c55e08" : "#ef444408",
              }}>
                <div className="text-2xl font-bold" style={{ color: (selectedSGData.active_ports || 0) > 0 ? "#22c55e" : "#ef4444" }}>
                  {selectedSGData.active_ports || 0}
                </div>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Active Service Ports</div>
              </div>
            </div>
          </div>

          {/* ── Verdict banner ── */}
          {(() => {
            const sgInbound = selectedSGData.inbound_rules || selectedSGData.total_permissions || 0
            const sgPorts = selectedSGData.active_ports || 0
            const sgResCount = selectedSGData.resources.length
            const sgPublic = selectedSGData.has_public || false

            if (sgPublic) {
              return (
                <div className="rounded-lg border p-4 flex items-start gap-3" style={{ background: "#ef444410", borderColor: "#ef444440" }}>
                  <Globe className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#ef4444" }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "#ef4444" }}>Critical: Internet-exposed shared SG</p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                      This SG allows traffic from 0.0.0.0/0 and is attached to {sgResCount} resources.
                      A vulnerability in any one resource exposes all {sgResCount} to the internet.
                    </p>
                  </div>
                </div>
              )
            }
            if (sgInbound > 0 && sgPorts === 0) {
              return (
                <div className="rounded-lg border p-4 flex items-start gap-3" style={{ background: "#ef444410", borderColor: "#ef444440" }}>
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#ef4444" }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "#ef4444" }}>Zero observed traffic on {sgInbound} rule{sgInbound !== 1 ? "s" : ""}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                      None of the {sgResCount} attached resources have traffic on any allowed port. These rules may be stale.
                    </p>
                  </div>
                </div>
              )
            }
            if (sgPorts > 0 && sgPorts < sgInbound) {
              return (
                <div className="rounded-lg border p-4 flex items-start gap-3" style={{ background: "#f9731610", borderColor: "#f9731640" }}>
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#f97316" }} />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "#f97316" }}>
                      {sgInbound - sgPorts} unused rule{sgInbound - sgPorts !== 1 ? "s" : ""} — only {sgPorts} of {sgInbound} have traffic
                    </p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                      {sgResCount} resources are exposed to ports they don&apos;t use. Per-resource SGs would close unused ports.
                    </p>
                  </div>
                </div>
              )
            }
            return (
              <div className="rounded-lg border p-4 flex items-start gap-3" style={{ background: "#22c55e10", borderColor: "#22c55e40" }}>
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#22c55e" }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#22c55e" }}>All rules have active traffic</p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                    {sgResCount} resources share this SG. Consider per-resource SGs if they serve different functions.
                  </p>
                </div>
              </div>
            )
          })()}

          {/* ── Active service ports ── */}
          {selectedSGData.all_permissions && selectedSGData.all_permissions.length > 0 && (
            <div className="rounded-lg border p-5" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                <Activity className="w-4 h-4" style={{ color: "#22c55e" }} />
                Active Service Ports
              </h4>
              <div className="flex flex-wrap gap-2">
                {selectedSGData.all_permissions.map((perm) => {
                  const portStr = perm.replace("port:", "")
                  const portNum = parseInt(portStr.split("/")[0])
                  const proto = portStr.split("/")[1] || "tcp"
                  const knownPorts: Record<number, string> = {
                    22: "SSH", 80: "HTTP", 443: "HTTPS", 3000: "App", 3306: "MySQL",
                    5432: "PostgreSQL", 6379: "Redis", 8080: "HTTP-Alt", 8443: "HTTPS-Alt",
                    27017: "MongoDB", 9090: "Prometheus", 3389: "RDP", 53: "DNS",
                  }
                  const portLabel = knownPorts[portNum] || `Port ${portNum}`
                  return (
                    <div key={perm} className="flex items-center gap-2 px-3 py-2 rounded-lg border" style={{ background: "#22c55e08", borderColor: "#22c55e30" }}>
                      <div className="w-2 h-2 rounded-full" style={{ background: "#22c55e" }} />
                      <span className="text-sm font-mono font-bold" style={{ color: "#22c55e" }}>{portNum}</span>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>/{proto}</span>
                      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{portLabel}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Attached resources ── */}
          <div className="rounded-lg border p-5" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
              <Network className="w-4 h-4" style={{ color: "#f97316" }} />
              Attached Resources ({selectedSGData.resources.length})
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {selectedSGData.resources.map((r) => {
                const color = getTypeColor(r.resource_type)
                const label = getTypeLabel(r.resource_type)
                return (
                  <div key={r.resource_id} className="flex items-center gap-3 p-3 rounded-lg border" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-primary)" }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
                      {resourceIcon(r.resource_type)}
                    </div>
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{r.resource_name}</div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Action & Analysis section ── */}
          <div className="rounded-lg border p-5" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
            {/* Action buttons */}
            {sgRestructurePhase !== "proposed" && sgRestructurePhase !== "done" && (
              <div className="flex flex-wrap gap-3 mb-5">
                <button
                  onClick={handleSgAnalyze}
                  disabled={sgRestructurePhase === "analyzing"}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
                  style={{ background: "#8b5cf6", color: "#fff", opacity: sgRestructurePhase === "analyzing" ? 0.6 : 1 }}
                >
                  {sgRestructurePhase === "analyzing" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                  {sgRestructurePhase === "analyzing" ? "Analyzing Traffic..." : "Analyze Per-Resource Traffic"}
                </button>
                {sgEniAnalysis && (
                  <button
                    onClick={handleSgPropose}
                    disabled={sgRestructurePhase === "proposing"}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
                    style={{ background: "#f97316", color: "#fff", opacity: sgRestructurePhase === "proposing" ? 0.6 : 1 }}
                  >
                    {sgRestructurePhase === "proposing" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Split className="w-4 h-4" />}
                    {sgRestructurePhase === "proposing" ? "Generating..." : "Generate Restructure Plan"}
                  </button>
                )}
              </div>
            )}

            {/* Per-ENI Analysis Results — REDESIGNED */}
            {sgEniAnalysis && sgRestructurePhase !== "proposed" && sgRestructurePhase !== "done" && (() => {
              const eniList = sgEniAnalysis.eni_analysis || []
              const sgRules = sgEniAnalysis.sg_rules || []
              const servicePorts = sgEniAnalysis.service_port_summary || []
              const ephemeralFiltered = sgEniAnalysis.ephemeral_ports_filtered || 0

              // Aggregate: collect all unique service ports across all ENIs
              const allServicePorts = new Set<number>()
              eniList.forEach((eni: any) => {
                (eni.observed_ports || []).forEach((p: any) => allServicePorts.add(p.port))
              })

              return (
                <div className="space-y-4">
                  {/* Ephemeral filter notice */}
                  {ephemeralFiltered > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "var(--bg-primary)", border: "1px solid var(--border-subtle)" }}>
                      <Filter className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {ephemeralFiltered.toLocaleString()} ephemeral port{ephemeralFiltered !== 1 ? "s" : ""} filtered (temporary client-side return ports from VPC Flow Logs, not real service traffic)
                      </span>
                    </div>
                  )}

                  {/* SG Rules vs Traffic — visual comparison */}
                  {sgRules.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                        <Shield className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                        Rules vs Observed Traffic
                      </h4>
                      <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border-subtle)" }}>
                        <div className="grid grid-cols-[1fr_80px_100px_1fr_80px] gap-2 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider border-b"
                          style={{ color: "var(--text-muted)", borderColor: "var(--border-subtle)", background: "var(--bg-primary)" }}>
                          <span>Source</span>
                          <span className="text-center">Port</span>
                          <span className="text-center">Protocol</span>
                          <span>Description</span>
                          <span className="text-center">Traffic</span>
                        </div>
                        <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                          {sgRules.map((rule: any, idx: number) => {
                            const port = rule.from_port
                            const hasTraffic = port && allServicePorts.has(port)
                            const isWildcard = rule.protocol === '-1'
                            return (
                              <div key={idx} className="grid grid-cols-[1fr_80px_100px_1fr_80px] gap-2 px-4 py-2.5 items-center"
                                style={{ background: hasTraffic ? "#22c55e05" : "var(--bg-secondary)" }}>
                                <div className="flex items-center gap-1.5 min-w-0">
                                  {rule.source === '0.0.0.0/0' ? (
                                    <Globe className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#ef4444" }} />
                                  ) : rule.source_type === 'security_group' ? (
                                    <Shield className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#8b5cf6" }} />
                                  ) : (
                                    <Network className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
                                  )}
                                  <span className="text-xs font-mono truncate" style={{
                                    color: rule.source === '0.0.0.0/0' ? "#ef4444" : "var(--text-secondary)"
                                  }}>{rule.source}</span>
                                </div>
                                <span className="text-xs font-mono text-center font-bold" style={{ color: "var(--text-primary)" }}>
                                  {isWildcard ? "All" : port === rule.to_port ? port : `${port}-${rule.to_port}`}
                                </span>
                                <span className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
                                  {isWildcard ? "All" : rule.protocol?.toUpperCase() || "TCP"}
                                </span>
                                <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                                  {rule.description || "—"}
                                </span>
                                <div className="flex justify-center">
                                  {isWildcard ? (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#f9731615", color: "#f97316" }}>N/A</span>
                                  ) : hasTraffic ? (
                                    <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#22c55e15", color: "#22c55e" }}>
                                      <Activity className="w-3 h-3" /> Active
                                    </span>
                                  ) : (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "#ef444415", color: "#ef4444" }}>Unused</span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Per-resource breakdown */}
                  <div>
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                      <Server className="w-4 h-4" style={{ color: "#8b5cf6" }} />
                      Per-Resource Traffic
                    </h4>
                    <div className="space-y-2">
                      {eniList.map((eni: any) => {
                        const ports = eni.observed_ports || []
                        const color = getTypeColor(eni.resource_type || '')
                        const label = getTypeLabel(eni.resource_type || 'Unknown')
                        const ephCount = eni.ephemeral_filtered || 0
                        const totalConns = ports.reduce((s: number, p: any) => s + (p.connection_count || 0), 0)

                        return (
                          <div key={eni.eni_id} className="rounded-lg border p-4" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-primary)" }}>
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
                                  {resourceIcon(eni.resource_type || '')}
                                </div>
                                <div>
                                  <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                                    {eni.resource_name || eni.eni_id}
                                  </span>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${color}15`, color }}>{label}</span>
                                    <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{eni.private_ip}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-bold" style={{ color: ports.length > 0 ? "#22c55e" : "var(--text-muted)" }}>
                                  {ports.length} port{ports.length !== 1 ? "s" : ""}
                                </div>
                                {totalConns > 0 && (
                                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>{totalConns.toLocaleString()} connections</div>
                                )}
                              </div>
                            </div>

                            {ports.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {ports.map((p: any) => {
                                  const knownPorts: Record<number, string> = {
                                    22: "SSH", 80: "HTTP", 443: "HTTPS", 3000: "App", 3306: "MySQL",
                                    5432: "Postgres", 6379: "Redis", 8080: "HTTP-Alt", 27017: "Mongo",
                                    9090: "Prometheus", 3389: "RDP", 53: "DNS", 2049: "NFS",
                                  }
                                  const portLabel = knownPorts[p.port]
                                  return (
                                    <div key={`${p.port}-${p.protocol}`} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs"
                                      style={{ background: "#22c55e08", borderColor: "#22c55e30" }}>
                                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#22c55e" }} />
                                      <span className="font-mono font-bold" style={{ color: "#22c55e" }}>{p.port}</span>
                                      <span style={{ color: "var(--text-muted)" }}>/{p.protocol}</span>
                                      {portLabel && <span className="font-medium" style={{ color: "var(--text-secondary)" }}>{portLabel}</span>}
                                      <span style={{ color: "var(--text-muted)" }}>&middot;</span>
                                      <span style={{ color: "var(--text-muted)" }}>{(p.connection_count || 0).toLocaleString()}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "#ef444408", border: "1px solid #ef444420" }}>
                                <XCircle className="w-3.5 h-3.5" style={{ color: "#ef4444" }} />
                                <span className="text-xs" style={{ color: "#ef4444" }}>No observed service traffic</span>
                              </div>
                            )}

                            {eni.traffic_note && (
                              <p className="text-xs mt-2 italic" style={{ color: "var(--text-muted)" }}>{eni.traffic_note}</p>
                            )}
                            {ephCount > 0 && (
                              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                                {ephCount} ephemeral port{ephCount !== 1 ? "s" : ""} filtered
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Restructure Proposal */}
            {sgProposal && (sgRestructurePhase === "proposed" || sgRestructurePhase === "executing") && (
              <div className="space-y-4">
                <h4 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                  <Split className="w-4 h-4" style={{ color: "#8b5cf6" }} />
                  Restructure Plan
                </h4>

                {/* Summary stats */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="text-center p-2.5 rounded-lg border" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-primary)" }}>
                    <div className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{sgProposal.summary?.original_rules}</div>
                    <div className="text-[10px] uppercase" style={{ color: "var(--text-muted)" }}>Original Rules</div>
                  </div>
                  <div className="text-center p-2.5 rounded-lg border" style={{ borderColor: "#8b5cf640", background: "#8b5cf608" }}>
                    <div className="text-lg font-bold" style={{ color: "#8b5cf6" }}>{sgProposal.summary?.new_sgs_count}</div>
                    <div className="text-[10px] uppercase" style={{ color: "#8b5cf6" }}>New SGs</div>
                  </div>
                  <div className="text-center p-2.5 rounded-lg border" style={{ borderColor: "#ef444440", background: "#ef444408" }}>
                    <div className="text-lg font-bold" style={{ color: "#ef4444" }}>{sgProposal.summary?.rules_dropped_count}</div>
                    <div className="text-[10px] uppercase" style={{ color: "#ef4444" }}>Rules Dropped</div>
                  </div>
                  <div className="text-center p-2.5 rounded-lg border" style={{ borderColor: "#22c55e40", background: "#22c55e08" }}>
                    <div className="text-lg font-bold" style={{ color: "#22c55e" }}>{sgProposal.summary?.total_enis_affected}</div>
                    <div className="text-[10px] uppercase" style={{ color: "#22c55e" }}>ENIs Affected</div>
                  </div>
                </div>

                {/* Proposed SGs */}
                <div className="space-y-2">
                  {(sgProposal.proposed_sgs || []).map((ps: any, idx: number) => (
                    <div key={idx} className="rounded-lg border p-4" style={{ borderColor: "#8b5cf630", background: "#8b5cf605" }}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4" style={{ color: "#8b5cf6" }} />
                          <span className="text-sm font-mono font-bold" style={{ color: "var(--text-primary)" }}>{ps.proposed_name}</span>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#8b5cf615", color: "#8b5cf6" }}>{ps.role_hint}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {(ps.ports_used || []).map((port: number) => (
                          <span key={port} className="px-2 py-0.5 rounded text-xs font-mono font-medium" style={{ background: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }}>:{port}</span>
                        ))}
                        {(ps.ports_used || []).length === 0 && <span className="text-xs italic" style={{ color: "var(--text-muted)" }}>All original rules</span>}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {ps.rules_count} rules &middot; {ps.resource_count} resource{ps.resource_count !== 1 ? "s" : ""}
                      </div>
                      {ps.enis?.map((eni: any) => (
                        <div key={eni.eni_id} className="flex items-center gap-1.5 mt-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                          <Server className="w-3 h-3" /> {eni.resource_name || eni.resource_id} ({eni.resource_type})
                        </div>
                      ))}
                      {ps.note && <p className="text-xs mt-1.5 italic" style={{ color: "#f97316" }}>{ps.note}</p>}
                    </div>
                  ))}
                </div>

                {/* Dropped rules */}
                {(sgProposal.rules_dropped || []).length > 0 && (
                  <div className="rounded-lg border p-3" style={{ background: "#ef444408", borderColor: "#ef444430" }}>
                    <p className="text-xs font-semibold mb-1.5" style={{ color: "#ef4444" }}>Rules Dropped (no observed traffic)</p>
                    <div className="flex flex-wrap gap-2">
                      {sgProposal.rules_dropped.map((r: any, i: number) => (
                        <span key={i} className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "#ef444410", color: "#ef444490" }}>
                          {r.protocol}/{r.from_port} from {r.source}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Execute buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => { setSgRestructurePhase("idle"); setSgProposal(null) }}
                    className="px-4 py-2 rounded-lg text-sm"
                    style={{ background: "var(--bg-primary)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSgExecute}
                    disabled={sgRestructurePhase === "executing"}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium"
                    style={{ background: "#22c55e", color: "#fff", opacity: sgRestructurePhase === "executing" ? 0.6 : 1 }}
                  >
                    {sgRestructurePhase === "executing" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    {sgRestructurePhase === "executing" ? "Executing..." : "Execute Restructure"}
                  </button>
                </div>
              </div>
            )}

            {/* Execution result */}
            {sgExecResult && sgRestructurePhase === "done" && (
              <div className="rounded-lg border p-4" style={{
                background: sgExecResult.success ? "#22c55e08" : "#ef444408",
                borderColor: sgExecResult.success ? "#22c55e40" : "#ef444440",
              }}>
                <div className="flex items-center gap-2 mb-3">
                  {sgExecResult.success ? <CheckCircle2 className="w-5 h-5" style={{ color: "#22c55e" }} /> : <XCircle className="w-5 h-5" style={{ color: "#ef4444" }} />}
                  <h4 className="text-sm font-semibold" style={{ color: sgExecResult.success ? "#22c55e" : "#ef4444" }}>
                    {sgExecResult.success ? "Restructure Complete" : "Restructure Failed"}
                  </h4>
                </div>
                {(sgExecResult.created_sgs || []).map((sg: any) => (
                  <div key={sg.sg_id} className="flex items-center gap-2 py-1.5 px-3 rounded-lg mb-1.5" style={{ background: "var(--bg-secondary)" }}>
                    <Shield className="w-4 h-4" style={{ color: "#8b5cf6" }} />
                    <span className="text-xs font-mono" style={{ color: "var(--text-primary)" }}>{sg.sg_id}</span>
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{sg.name}</span>
                    <span className="text-xs ml-auto" style={{ color: "var(--text-muted)" }}>{sg.eni_count} ENIs</span>
                  </div>
                ))}
                <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                  {sgExecResult.summary?.new_sgs_created} SGs created, {sgExecResult.summary?.enis_modified} ENIs modified
                </p>
                {sgExecResult.rollback_available && (
                  <button
                    onClick={handleSgRollback}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium mt-3"
                    style={{ background: "#ef444415", color: "#ef4444", border: "1px solid #ef444440" }}
                  >
                    <ArrowLeft className="w-3 h-3" /> Rollback Restructure
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ──────────── ANALYSIS SECTION (IAM) ──────────── */}
      {analysisData && !selectedIsSG && stage !== "scan" && (
        <div className="rounded-lg border p-6" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Permission Usage Analysis</h3>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4" style={{ color: "#8b5cf6" }} />
              <span className="text-sm font-bold font-mono px-3 py-1 rounded-lg border" style={{ color: "#8b5cf6", background: "#8b5cf610", borderColor: "#8b5cf640" }}>
                {selectedRole}
              </span>
            </div>
          </div>

          {/* Summary Banner — answers "what's the problem?" */}
          {(() => {
            const totalPerms = analysisData.aggregated.total_permissions
            const usedPerms = Math.min(analysisData.aggregated.used_permissions, totalPerms)
            const unusedPerms = Math.max(totalPerms - usedPerms, 0)
            const resourceCount = analysisData.analyses.length
            const totalExposure = totalPerms * resourceCount
            const usagePct = totalPerms > 0 ? Math.min(Math.round((usedPerms / totalPerms) * 100), 100) : 0
            const isOverPermissioned = unusedPerms > 0
            const severityColor = unusedPerms > 20 ? "#ef4444" : unusedPerms > 5 ? "#f97316" : "#eab308"

            return (
              <div className="grid grid-cols-5 gap-3 mb-5">
                <div className="rounded-lg p-3 border text-center" style={{ borderColor: "var(--border-subtle)" }}>
                  <div className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{totalPerms}</div>
                  <div className="text-[10px] uppercase" style={{ color: "var(--text-muted)" }}>Total Permissions</div>
                </div>
                <div className="rounded-lg p-3 border text-center" style={{ borderColor: "#22c55e40", background: "#22c55e10" }}>
                  <div className="text-2xl font-bold" style={{ color: "#22c55e" }}>{usedPerms}</div>
                  <div className="text-[10px] uppercase" style={{ color: "var(--text-muted)" }}>Actually Used</div>
                </div>
                <div className="rounded-lg p-3 border text-center" style={{ borderColor: `${severityColor}40`, background: `${severityColor}10` }}>
                  <div className="text-2xl font-bold" style={{ color: severityColor }}>{unusedPerms}</div>
                  <div className="text-[10px] uppercase" style={{ color: "var(--text-muted)" }}>Unused (Waste)</div>
                </div>
                <div className="rounded-lg p-3 border text-center" style={{ borderColor: "var(--border-subtle)" }}>
                  <div className="text-2xl font-bold" style={{ color: "#f97316" }}>{resourceCount}</div>
                  <div className="text-[10px] uppercase" style={{ color: "var(--text-muted)" }}>Resources Sharing</div>
                </div>
                <div className="rounded-lg p-3 border text-center" style={{ borderColor: "#ef444440", background: "#ef444410" }}>
                  <div className="text-2xl font-bold" style={{ color: "#ef4444" }}>{totalExposure}</div>
                  <div className="text-[10px] uppercase" style={{ color: "var(--text-muted)" }}>Total Exposure</div>
                </div>
              </div>
            )
          })()}

          {/* Verdict */}
          {(() => {
            const totalPermsV = analysisData.aggregated.total_permissions
            const usedPermsV = Math.min(analysisData.aggregated.used_permissions, totalPermsV)
            const unusedPerms = Math.max(totalPermsV - usedPermsV, 0)
            const resourceCount = analysisData.analyses.length
            const isLeastPrivilege = unusedPerms === 0
            const isShared = resourceCount > 1

            // Check if resources are functionally diverse (different names = different purposes)
            const resourceNames = analysisData.analyses.map(a => a.resource_name)
            const uniquePrefixes = new Set(resourceNames.map(n => n.replace(/[-_]\d+$/, "").toLowerCase()))
            const isDiverse = uniquePrefixes.size > 1

            if (isLeastPrivilege && !isShared) {
              // Perfect: no waste, not shared
              return (
                <div className="mb-5 p-3 rounded-lg border" style={{ background: "#22c55e10", borderColor: "#22c55e40" }}>
                  <span className="text-sm font-medium" style={{ color: "#22c55e" }}>
                    This role follows least privilege — no unused permissions and not shared across multiple resources.
                  </span>
                </div>
              )
            }
            if (isLeastPrivilege && isShared && !isDiverse) {
              // All resources are similar (e.g., worker-1, worker-2) — sharing is fine
              return (
                <div className="mb-5 p-3 rounded-lg border" style={{ background: "#22c55e10", borderColor: "#22c55e40" }}>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#22c55e" }} />
                    <div className="text-sm" style={{ color: "var(--text-primary)" }}>
                      <strong style={{ color: "#22c55e" }}>Least privilege achieved.</strong> All {totalPermsV} permission{totalPermsV !== 1 ? "s are" : " is"} in use. {resourceCount} identical resources share this role — this is expected for homogeneous workloads.
                    </div>
                  </div>
                </div>
              )
            }
            return (
              <div className="mb-5 p-3 rounded-lg border" style={{ background: unusedPerms > 0 ? "#ef444410" : "#f9731610", borderColor: unusedPerms > 0 ? "#ef444440" : "#f9731640" }}>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: unusedPerms > 0 ? "#ef4444" : "#f97316" }} />
                  <div className="text-sm" style={{ color: "var(--text-primary)" }}>
                    {unusedPerms > 0 && isShared ? (
                      <><strong style={{ color: "#ef4444" }}>Over-permissioned shared role.</strong> {resourceCount} resources share {totalPermsV} permissions but only use {usedPermsV}. If any resource is compromised, the attacker gets all {unusedPerms} unused permissions across every resource.</>
                    ) : unusedPerms > 0 ? (
                      <><strong style={{ color: "#ef4444" }}>{unusedPerms} unused permissions detected.</strong> This role has more permissions than needed. Remove unused permissions to reduce attack surface.</>
                    ) : (
                      <><strong style={{ color: "#f97316" }}>Functionally different resources sharing one role.</strong> {resourceCount} resources with different purposes share the same role. Today only {totalPermsV} permission{totalPermsV !== 1 ? "s" : ""}, but as each resource&apos;s needs grow, every permission added for one resource is exposed to all {resourceCount}. Split into per-resource roles now — before the blast radius compounds.</>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Tab Toggle */}
          <div className="flex gap-1 mb-6 rounded-lg p-1 w-fit" style={{ background: "var(--bg-primary)" }}>
            <button
              onClick={() => setActiveTab("aggregated")}
              className="text-sm font-medium px-4 py-2 rounded-md transition-all"
              style={activeTab === "aggregated"
                ? { background: "#8b5cf6", color: "#fff" }
                : { color: "var(--text-secondary)" }
              }
            >
              Aggregated View
            </button>
            <button
              onClick={() => setActiveTab("per-resource")}
              className="text-sm font-medium px-4 py-2 rounded-md transition-all"
              style={activeTab === "per-resource"
                ? { background: "#8b5cf6", color: "#fff" }
                : { color: "var(--text-secondary)" }
              }
            >
              Per-Resource View
            </button>
          </div>

          {/* ── Aggregated View ── */}
          {activeTab === "aggregated" && (
            <div className="max-w-lg">
              <div className="rounded-lg border p-6" style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)" }}>
                <p className="text-xs uppercase tracking-wider mb-4 font-semibold" style={{ color: "var(--text-muted)" }}>
                  CloudKnox / Entra View (Aggregated)
                </p>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span style={{ color: "var(--text-secondary)" }}>Total Permissions</span>
                    <span className="font-mono font-bold" style={{ color: "var(--text-primary)" }}>
                      {analysisData.aggregated.total_permissions}
                    </span>
                  </div>
                  {(() => {
                    const aggTotal = analysisData.aggregated.total_permissions
                    const aggUsed = Math.min(analysisData.aggregated.used_permissions, aggTotal)
                    const aggUnused = Math.max(aggTotal - aggUsed, 0)
                    const aggUsedPct = aggTotal > 0 ? Math.min(Math.round((aggUsed / aggTotal) * 100), 100) : 0
                    const aggUnusedPct = aggTotal > 0 ? Math.max(Math.round((aggUnused / aggTotal) * 100), 0) : 0
                    return (
                      <>
                        <div className="flex justify-between text-sm">
                          <span style={{ color: "var(--text-secondary)" }}>Actually Used</span>
                          <span className="font-mono font-bold" style={{ color: "#22c55e" }}>
                            {aggUsed}{" "}
                            <span style={{ color: "var(--text-muted)" }}>({aggUsedPct}%)</span>
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span style={{ color: "var(--text-secondary)" }}>Unused</span>
                          <span className="font-mono font-bold" style={{ color: "#ef4444" }}>
                            {aggUnused}{" "}
                            <span style={{ color: "var(--text-muted)" }}>({aggUnusedPct}%)</span>
                          </span>
                        </div>
                        {/* Progress bar */}
                        <div className="w-full rounded-full h-2 mt-2" style={{ background: "var(--bg-secondary)" }}>
                          <div className="h-2 rounded-full transition-all" style={{ background: "#22c55e", width: `${aggUsedPct}%` }} />
                        </div>
                        {/* Warning */}
                        {aggUnused > 0 ? (
                          <div className="mt-3 p-3 rounded-lg border" style={{ background: "#f9731610", borderColor: "#f9731640" }}>
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4" style={{ color: "#f97316" }} />
                              <span className="text-sm font-semibold" style={{ color: "#f97316" }}>OVER-PERMISSIONED</span>
                            </div>
                            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                              Remove {aggUnused} unused permissions
                            </p>
                          </div>
                        ) : (
                          <div className="mt-3 p-3 rounded-lg border" style={{ background: "#22c55e10", borderColor: "#22c55e40" }}>
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4" style={{ color: "#22c55e" }} />
                              <span className="text-sm font-semibold" style={{ color: "#22c55e" }}>LEAST PRIVILEGE</span>
                            </div>
                            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                              All permissions are in use. Consider splitting into per-resource roles to reduce blast radius.
                            </p>
                          </div>
                        )}
                      </>
                    )
                  })()}
                  <div className="flex gap-2 mt-4">
                    <button onClick={() => setAggApplied(true)} className="text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors hover:opacity-90" style={{ background: "#8b5cf6" }}>
                      Apply Aggregated Fix
                    </button>
                  </div>
                </div>

                {aggApplied && (
                  <div className="mt-4 space-y-2 p-4 rounded-lg border" style={{ background: "#22c55e10", borderColor: "#22c55e40" }}>
                    <div className="flex items-center gap-2 text-sm" style={{ color: "#22c55e" }}><CheckCircle2 className="w-4 h-4" /> Policy updated</div>
                    <div className="flex items-center gap-2 text-sm" style={{ color: "#22c55e" }}><CheckCircle2 className="w-4 h-4" /> Role reduced: {analysisData.aggregated.total_permissions} → {analysisData.aggregated.used_permissions} permissions</div>
                    <div className="flex items-center gap-2 text-sm" style={{ color: "#22c55e" }}><CheckCircle2 className="w-4 h-4" /> All {analysisData.analyses.length} resources now have {analysisData.aggregated.used_permissions} permissions</div>
                    <p className="text-sm font-semibold mt-2" style={{ color: "#22c55e" }}>
                      Risk reduced by {analysisData.aggregated.total_permissions > 0 ? Math.round(((analysisData.aggregated.total_permissions - analysisData.aggregated.used_permissions) / analysisData.aggregated.total_permissions) * 100) : 0}%
                    </p>
                    <div className="mt-3 p-3 rounded-lg border" style={{ background: "#f9731610", borderColor: "#f9731640" }}>
                      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        But do all {analysisData.analyses.length} resources need the same {analysisData.aggregated.used_permissions} permissions?
                      </p>
                      <button onClick={() => setActiveTab("per-resource")} className="text-xs underline mt-1" style={{ color: "#8b5cf6" }}>
                        Switch to Per-Resource View to find out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Per-Resource View ── */}
          {activeTab === "per-resource" && (
            <div className="space-y-4">
              {/* Warning banner */}
              <div className="p-4 rounded-lg border" style={{ background: "#f9731610", borderColor: "#f9731640" }}>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" style={{ color: "#f97316" }} />
                  <span className="text-sm font-semibold" style={{ color: "#f97316" }}>SHARED ROLE PROBLEM DETECTED</span>
                </div>
                <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                  This role is shared by {analysisData.analyses.length} resources, but each resource uses <strong>DIFFERENT</strong> permissions. Recommendation: Split roles.
                </p>
              </div>

              {/* Resource cards as table rows */}
              <div className="rounded-lg border overflow-hidden" style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)" }}>
                <div className="grid grid-cols-[2fr_80px_80px_80px_100px] gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wider border-b"
                  style={{ color: "var(--text-secondary)", borderColor: "var(--border-subtle)", background: "var(--bg-secondary)" }}>
                  <span>Resource</span>
                  <span className="text-center">Granted</span>
                  <span className="text-center">Used</span>
                  <span className="text-center">Unused</span>
                  <span className="text-center">Utilization</span>
                </div>
                <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                  {analysisData.analyses.map((a) => {
                    const unusedShown = a.unused_permissions.slice(0, 4)
                    const unusedMore = a.unused_permissions.length > 4 ? a.unused_permissions.length - 4 : 0
                    const color = getTypeColor(a.resource_type)
                    const label = getTypeLabel(a.resource_type)
                    const utilPct = a.utilization_rate < 0.005 ? "<1" : String(Math.round(a.utilization_rate * 100))
                    const utilColor = a.utilization_rate < 0.1 ? "#ef4444" : a.utilization_rate < 0.5 ? "#f97316" : "#22c55e"
                    return (
                      <div key={a.resource_id} className="px-4 py-3">
                        <div className="grid grid-cols-[2fr_80px_80px_80px_100px] gap-2 items-center">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}20` }}>
                              {resourceIcon(a.resource_type)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate" style={{ color: "var(--text-primary)" }}>{a.resource_name}</div>
                              <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{label} &middot; {a.resource_id}</div>
                            </div>
                          </div>
                          <div className="text-center text-sm font-medium" style={{ color: "var(--text-primary)" }}>{a.permissions_granted}</div>
                          <div className="text-center text-sm font-medium" style={{ color: "#22c55e" }}>{a.used_count}</div>
                          <div className="text-center text-sm font-medium" style={{ color: "#ef4444" }}>{a.unused_permissions.length}</div>
                          <div className="text-center">
                            <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{ background: `${utilColor}20`, color: utilColor }}>{utilPct}%</span>
                          </div>
                        </div>

                        {/* Inline detail */}
                        <div className="mt-3 grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs uppercase tracking-wider mb-1.5 font-semibold" style={{ color: "var(--text-muted)" }}>Used permissions:</p>
                            {a.permissions_used.length === 0 ? (
                              <p className="text-xs italic" style={{ color: "var(--text-muted)" }}>No API calls observed</p>
                            ) : (
                              <div className="space-y-1">
                                {a.permissions_used.map((p) => (
                                  <div key={p.action} className="flex items-start gap-1.5 text-xs">
                                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "#22c55e" }} />
                                    <span className="font-mono" style={{ color: "var(--text-primary)" }}>{p.action}</span>
                                    <span style={{ color: "var(--text-muted)" }}>({p.call_count.toLocaleString()})</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wider mb-1.5 font-semibold" style={{ color: "var(--text-muted)" }}>Never used ({a.unused_permissions.length}):</p>
                            <div className="flex flex-wrap gap-1">
                              {unusedShown.map((u, i) => (
                                <span key={i} className="px-1.5 py-0.5 rounded text-xs font-mono" style={{ background: "#ef444415", color: "#ef4444" }}>{u}</span>
                              ))}
                              {unusedMore > 0 && <span className="text-xs" style={{ color: "var(--text-muted)" }}>+{unusedMore} more</span>}
                            </div>
                            {a.risk_factors.length > 0 && (
                              <div className="mt-2 flex items-center gap-1.5">
                                <AlertTriangle className="w-3 h-3" style={{ color: "#ef4444" }} />
                                <span className="text-xs" style={{ color: "#ef4444" }}>{a.risk_factors.slice(0, 2).join("; ")}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Recommendation panel */}
              <div className="rounded-lg border p-5" style={{ background: "#8b5cf610", borderColor: "#8b5cf640" }}>
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-5 h-5" style={{ color: "#8b5cf6" }} />
                  <span className="text-base font-semibold" style={{ color: "#8b5cf6" }}>CYNTRO RECOMMENDATION</span>
                </div>
                {(() => {
                  const zeroUsage = analysisData.analyses.filter(a => a.used_count === 0)
                  const partialUsage = analysisData.analyses.filter(a => a.used_count > 0 && a.unused_permissions.length > 0)
                  const fullUsage = analysisData.analyses.filter(a => a.used_count > 0 && a.unused_permissions.length === 0)
                  return (
                    <>
                      <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
                        Split into {analysisData.analyses.length} least-privilege roles:
                      </p>

                      {/* Resources with ZERO usage — recommend removing access */}
                      {zeroUsage.length > 0 && (
                        <div className="mb-3 p-3 rounded-lg border" style={{ background: "#ef444410", borderColor: "#ef444430" }}>
                          <div className="flex items-center gap-1.5 mb-2">
                            <XCircle className="w-4 h-4" style={{ color: "#ef4444" }} />
                            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#ef4444" }}>Remove access entirely ({zeroUsage.length} resource{zeroUsage.length !== 1 ? "s" : ""})</span>
                          </div>
                          <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
                            These resources never used any permissions — detach the role or assign an empty role:
                          </p>
                          <div className="space-y-1">
                            {zeroUsage.map((a) => (
                              <div key={a.resource_id} className="flex items-center gap-2 text-xs">
                                <span style={{ color: "var(--text-muted)" }}>&bull;</span>
                                <span className="font-mono" style={{ color: "#ef4444" }}>{a.resource_name}</span>
                                <span style={{ color: "var(--text-muted)" }}>— 0 of {a.permissions_granted} used</span>
                                {a.unused_permissions.length > 0 && (
                                  <span className="px-1.5 py-0.5 rounded font-mono" style={{ background: "#ef444415", color: "#ef4444", fontSize: "10px" }}>
                                    remove: {a.unused_permissions.slice(0, 3).join(", ")}{a.unused_permissions.length > 3 ? ` +${a.unused_permissions.length - 3} more` : ""}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Resources with PARTIAL usage — recommend removing unused */}
                      {partialUsage.length > 0 && (
                        <div className="mb-3 p-3 rounded-lg border" style={{ background: "#f9731610", borderColor: "#f9731630" }}>
                          <div className="flex items-center gap-1.5 mb-2">
                            <AlertTriangle className="w-4 h-4" style={{ color: "#f97316" }} />
                            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#f97316" }}>Remove unused permissions ({partialUsage.length} resource{partialUsage.length !== 1 ? "s" : ""})</span>
                          </div>
                          <div className="space-y-1.5">
                            {partialUsage.map((a) => (
                              <div key={a.resource_id} className="text-xs">
                                <div className="flex items-center gap-2">
                                  <span style={{ color: "var(--text-muted)" }}>&bull;</span>
                                  <span className="font-mono" style={{ color: "#f97316" }}>{a.resource_name}</span>
                                  <span style={{ color: "var(--text-muted)" }}>— keep {a.used_count}, remove {a.unused_permissions.length}</span>
                                </div>
                                <div className="ml-4 mt-0.5 flex flex-wrap gap-1">
                                  {a.unused_permissions.slice(0, 4).map((p, i) => (
                                    <span key={i} className="px-1.5 py-0.5 rounded font-mono" style={{ background: "#ef444415", color: "#ef4444", fontSize: "10px" }}>{p}</span>
                                  ))}
                                  {a.unused_permissions.length > 4 && <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>+{a.unused_permissions.length - 4} more</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Resources at full usage — already least privilege */}
                      {fullUsage.length > 0 && (
                        <div className="mb-3 p-3 rounded-lg border" style={{ background: "#22c55e10", borderColor: "#22c55e30" }}>
                          <div className="flex items-center gap-1.5 mb-2">
                            <CheckCircle2 className="w-4 h-4" style={{ color: "#22c55e" }} />
                            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#22c55e" }}>Least privilege ({fullUsage.length} resource{fullUsage.length !== 1 ? "s" : ""})</span>
                          </div>
                          <div className="space-y-1">
                            {fullUsage.map((a) => (
                              <div key={a.resource_id} className="flex items-center gap-2 text-xs">
                                <span style={{ color: "var(--text-muted)" }}>&bull;</span>
                                <span className="font-mono" style={{ color: "#22c55e" }}>{a.resource_name}</span>
                                <span style={{ color: "var(--text-muted)" }}>— {a.used_count} permission{a.used_count !== 1 ? "s" : ""} (all used)</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )
                })()}
                <div className="flex flex-wrap gap-3">
                  <button onClick={showComparison} disabled={loading} className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border transition-colors" style={{ color: "var(--text-secondary)", borderColor: "var(--border-subtle)" }}>
                    Compare Approaches
                  </button>
                  <button onClick={runSimulation} disabled={loading} className="flex items-center gap-2 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors hover:opacity-90 disabled:opacity-50" style={{ background: "#8b5cf6" }}>
                    <Play className="w-4 h-4" /> Simulate Split
                  </button>
                  <button onClick={() => runRemediation(true)} disabled={loading} className="flex items-center gap-2 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors hover:opacity-90 disabled:opacity-50" style={{ background: "#22c55e" }}>
                    Remediate Now
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ──────────── COMPARISON SECTION ──────────── */}
      {recommendData && analysisData?.analyses && analysisData.analyses.length > 0 && (stage === "comparison" || stage === "simulation" || stage === "remediation") && (
        <div className="rounded-lg border p-6" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
          <h3 className="text-base font-semibold mb-6" style={{ color: "var(--text-primary)" }}>Why Per-Resource Matters</h3>

          {/* Current State */}
          <div className="rounded-lg border p-4 mb-6" style={{ background: "#ef444410", borderColor: "#ef444440" }}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5" style={{ color: "#ef4444" }} />
              <span className="font-semibold" style={{ color: "#ef4444" }}>Current State: Shared Role</span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-3xl font-bold" style={{ color: "#ef4444" }}>{recommendData.original_permissions}</div>
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>permissions granted</div>
              </div>
              <div>
                <div className="text-3xl font-bold" style={{ color: "#ef4444" }}>{recommendData.resources_attached}</div>
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>resources sharing</div>
              </div>
              <div>
                <div className="text-3xl font-bold" style={{ color: "#ef4444" }}>{recommendData.original_permissions * recommendData.resources_attached}</div>
                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>total exposure</div>
              </div>
            </div>
          </div>

          {/* Side by side comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Traditional approach */}
            <div className="rounded-lg border-2 overflow-hidden" style={{ borderColor: "var(--border-subtle)" }}>
              <div className="px-4 py-3 border-b" style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)" }}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Traditional Approach</span>
                  <span className="text-xs px-2 py-1 rounded" style={{ background: "var(--bg-secondary)", color: "var(--text-muted)" }}>CloudKnox-style</span>
                </div>
              </div>
              <div className="p-4 space-y-4" style={{ background: "var(--bg-primary)" }}>
                <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Reduces role to <strong>{recommendData.aggregated_used} permissions</strong> (union of all used)
                </div>
                <div className="rounded-lg p-3 border" style={{ background: "#f9731610", borderColor: "#f9731640" }}>
                  <div className="text-xs font-medium mb-2" style={{ color: "#f97316" }}>After remediation:</div>
                  <div className="space-y-1">
                    {Array.from({ length: Math.min(recommendData.resources_attached, 4) }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Server className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Resource {i + 1}</span>
                        <ArrowRight className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                        <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "#f9731620", color: "#f97316" }}>{recommendData.aggregated_used} perms</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pt-3 border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <div className="flex justify-between items-end">
                    <div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>Total exposure after fix</div>
                      <div className="text-2xl font-bold" style={{ color: "var(--text-secondary)" }}>{recommendData.aggregated_used * recommendData.resources_attached}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>Risk reduction</div>
                      <div className="text-2xl font-bold" style={{ color: "var(--text-secondary)" }}>{Math.round(recommendData.aggregated_risk_reduction)}%</div>
                    </div>
                  </div>
                  <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-secondary)" }}>
                    <div className="h-full rounded-full" style={{ background: "var(--text-muted)", width: `${recommendData.aggregated_risk_reduction}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Cyntro approach */}
            <div className="rounded-lg border-2 overflow-hidden" style={{ borderColor: "#22c55e80" }}>
              <div className="px-4 py-3 border-b" style={{ background: "#22c55e15", borderColor: "#22c55e40" }}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold" style={{ color: "#22c55e" }}>Cyntro Per-Resource</span>
                  <span className="text-xs px-2 py-1 rounded font-medium" style={{ background: "#22c55e20", color: "#22c55e" }}>Recommended</span>
                </div>
              </div>
              <div className="p-4 space-y-4" style={{ background: "var(--bg-primary)" }}>
                <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Each resource gets <strong>only what it uses</strong>
                </div>
                <div className="rounded-lg p-3 border" style={{ background: "#22c55e10", borderColor: "#22c55e40" }}>
                  <div className="text-xs font-medium mb-2" style={{ color: "#22c55e" }}>After remediation:</div>
                  <div className="space-y-1">
                    {(analysisData?.analyses || []).slice(0, 4).map((a, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Server className="w-4 h-4" style={{ color: "#22c55e" }} />
                        <span className="text-xs truncate max-w-[100px]" style={{ color: "var(--text-secondary)" }}>{a.resource_name}</span>
                        <ArrowRight className="w-3 h-3" style={{ color: "#22c55e" }} />
                        <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "#22c55e20", color: "#22c55e" }}>{a.used_count || 0} perm{(a.used_count || 0) !== 1 ? "s" : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pt-3 border-t" style={{ borderColor: "#22c55e40" }}>
                  <div className="flex justify-between items-end">
                    <div>
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>Total exposure after fix</div>
                      <div className="text-2xl font-bold" style={{ color: "#22c55e" }}>{(analysisData?.analyses || []).reduce((sum, a) => sum + (a.used_count || 0), 0)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs" style={{ color: "var(--text-muted)" }}>Risk reduction</div>
                      <div className="text-2xl font-bold" style={{ color: "#22c55e" }}>{Math.round(recommendData.cyntro_risk_reduction)}%</div>
                    </div>
                  </div>
                  <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: "#22c55e20" }}>
                    <div className="h-full rounded-full" style={{ background: "#22c55e", width: `${recommendData.cyntro_risk_reduction}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Key insight */}
          <div className="mt-6 rounded-lg border p-4" style={{ background: "#8b5cf610", borderColor: "#8b5cf640" }}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full text-white flex items-center justify-center shrink-0" style={{ background: "#8b5cf6" }}>
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <div className="font-semibold mb-1" style={{ color: "#8b5cf6" }}>The Cyntro Difference</div>
                <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Traditional tools give every resource the <strong>same reduced permissions</strong>.
                  Cyntro tracks which resource uses which permission, so each gets <strong>only what it actually needs</strong>.
                  This eliminates <strong>{recommendData.aggregated_used * recommendData.resources_attached > 0 ? Math.round((1 - ((analysisData?.analyses || []).reduce((sum, a) => sum + (a.used_count || 0), 0) || 0) / (recommendData.aggregated_used * recommendData.resources_attached)) * 100) : 0}% more risk</strong> than aggregated approaches.
                </div>
              </div>
            </div>
          </div>

          {/* Architecture steps */}
          <details className="mt-6">
            <summary className="cursor-pointer text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>How Cyntro Analyzes Per-Resource</summary>
            <div className="mt-3 grid grid-cols-1 gap-2">
              {[
                { step: "1", title: "Collect CloudTrail logs", detail: "90 days of API events" },
                { step: "2", title: "Map sessions to resources", detail: '"assumed-role/.../i-abc123" → EC2-1' },
                { step: "3", title: "Track per-resource usage", detail: "EC2-1 used s3:GetObject; Lambda used s3:PutObject" },
                { step: "4", title: "Build permission graph", detail: "Resource → Permission → Target mapping" },
                { step: "5", title: "Generate per-resource recommendations", detail: "Scoped to exact buckets and actions observed" },
              ].map((s) => (
                <div key={s.step} className="flex items-start gap-3 rounded-lg border p-3" style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)" }}>
                  <div className="w-6 h-6 rounded-full text-white flex items-center justify-center text-xs font-bold shrink-0" style={{ background: "#8b5cf6" }}>{s.step}</div>
                  <div>
                    <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{s.title}</div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>{s.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </details>

          {/* Action buttons */}
          <div className="mt-6 space-y-4">
            <div className="flex gap-3">
              <button onClick={runSimulation} disabled={loading} className="flex items-center gap-2 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors hover:opacity-90 disabled:opacity-50" style={{ background: "#8b5cf6" }}>
                <Play className="w-4 h-4" /> Simulate Split
              </button>
              <button onClick={() => runRemediation(true)} disabled={loading} className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-lg border transition-colors disabled:opacity-50" style={{ color: "var(--text-secondary)", borderColor: "var(--border-subtle)" }}>
                Aggregated Remediation
              </button>
            </div>
            <div className="rounded-lg border-2 p-4" style={{ background: "#22c55e10", borderColor: "#22c55e80" }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Split className="w-5 h-5" style={{ color: "#22c55e" }} />
                    <span className="font-semibold" style={{ color: "#22c55e" }}>Per-Resource Remediation</span>
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: "#22c55e20", color: "#22c55e" }}>Recommended</span>
                  </div>
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Creates separate least-privilege roles for each resource</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => runPerResourceRemediation(true)} disabled={loading} className="flex items-center gap-2 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors hover:opacity-90 disabled:opacity-50" style={{ background: "#22c55e" }}>
                    <Eye className="w-4 h-4" /> Preview
                  </button>
                  <button onClick={() => runPerResourceRemediation(false)} disabled={loading} className="flex items-center gap-2 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors hover:opacity-90 disabled:opacity-50" style={{ background: "#16a34a" }}>
                    <Zap className="w-4 h-4" /> Execute Live
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────────── SIMULATION SECTION ──────────── */}
      {simData && (stage === "simulation" || stage === "remediation") && (
        <div className="rounded-lg border p-6" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
          <h3 className="text-base font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Simulation Results</h3>
          <div className="space-y-3">
            {simData.results.map((r) => (
              <div key={r.resource_id} className="rounded-lg border p-4" style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)" }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {r.passed ? <CheckCircle2 className="w-5 h-5" style={{ color: "#22c55e" }} /> : <XCircle className="w-5 h-5" style={{ color: "#ef4444" }} />}
                    <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{r.resource_name}</span>
                    <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{r.proposed_role}</span>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: r.passed ? "#22c55e20" : "#ef444420", color: r.passed ? "#22c55e" : "#ef4444" }}>
                    {r.confidence.toFixed(1)}% confidence
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded p-2 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
                    <div className="font-bold" style={{ color: "var(--text-primary)" }}>{r.total_events.toLocaleString()}</div>
                    <div style={{ color: "var(--text-muted)" }}>Events replayed</div>
                  </div>
                  <div className="rounded p-2 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
                    <div className="font-bold" style={{ color: "#22c55e" }}>{r.successful.toLocaleString()}</div>
                    <div style={{ color: "var(--text-muted)" }}>Successful</div>
                  </div>
                  <div className="rounded p-2 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
                    <div className="font-bold" style={{ color: "#ef4444" }}>{r.denied}</div>
                    <div style={{ color: "var(--text-muted)" }}>Denied</div>
                  </div>
                </div>
              </div>
            ))}

            {simData.all_passed ? (
              <div className="p-4 rounded-lg border" style={{ background: "#22c55e10", borderColor: "#22c55e40" }}>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5" style={{ color: "#22c55e" }} />
                  <span className="text-sm font-semibold" style={{ color: "#22c55e" }}>All simulations passed. Safe to proceed.</span>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg border" style={{ background: "#ef444410", borderColor: "#ef444440" }}>
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5" style={{ color: "#ef4444" }} />
                  <span className="text-sm font-semibold" style={{ color: "#ef4444" }}>Some simulations failed. Review before proceeding.</span>
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-2">
              <button onClick={() => runRemediation(true)} disabled={loading} className="flex items-center gap-2 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors hover:opacity-90 disabled:opacity-50" style={{ background: "#22c55e" }}>
                Execute Remediation (Dry Run)
              </button>
              {simData.all_passed && (
                <button onClick={() => runRemediation(false)} disabled={loading} className="flex items-center gap-2 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors hover:opacity-90 disabled:opacity-50" style={{ background: "#ef4444" }}>
                  Execute Live
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ──────────── REMEDIATION SECTION ──────────── */}
      {remediateData && stage === "remediation" && (
        <div className="rounded-lg border p-6" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
          <h3 className="text-base font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Remediation {remediateData.dry_run ? "(Dry Run)" : "(Live)"}
          </h3>
          <div className="space-y-2 mb-6">
            {remediateData.steps.map((s, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                {s.status === "completed" ? <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "#22c55e" }} /> : s.status === "failed" ? <XCircle className="w-4 h-4 shrink-0" style={{ color: "#ef4444" }} /> : <ArrowRight className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />}
                <span style={{ color: "var(--text-muted)" }}>[{s.action}]</span>
                <span style={{ color: "var(--text-primary)" }}>{s.target}</span>
                {s.details && <span className="text-xs" style={{ color: "var(--text-muted)" }}>{s.details}</span>}
              </div>
            ))}
          </div>
          <div className="p-5 rounded-lg border" style={{ background: "#22c55e10", borderColor: "#22c55e40" }}>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-5 h-5" style={{ color: "#22c55e" }} />
              <span className="font-semibold" style={{ color: "#22c55e" }}>REMEDIATION COMPLETE {remediateData.dry_run ? "(DRY RUN)" : ""}</span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="rounded-lg p-3 border" style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)" }}>
                <div className="text-2xl font-bold" style={{ color: "var(--text-muted)" }}>{remediateData.summary.before_total}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>Before (total perms)</div>
              </div>
              <div className="rounded-lg p-3 border" style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)" }}>
                <div className="text-2xl font-bold" style={{ color: "#22c55e" }}>{remediateData.summary.after_total}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>After (total perms)</div>
              </div>
              <div className="rounded-lg p-3 border" style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)" }}>
                <div className="text-2xl font-bold" style={{ color: "#8b5cf6" }}>{Math.round(remediateData.summary.reduction * 100)}%</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>Reduction</div>
              </div>
            </div>
          </div>
          {remediateData.dry_run && (
            <div className="mt-4 flex gap-3">
              <button onClick={() => runRemediation(false)} disabled={loading} className="flex items-center gap-2 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors hover:opacity-90 disabled:opacity-50" style={{ background: "#ef4444" }}>
                Execute Live Remediation
              </button>
            </div>
          )}
        </div>
      )}

      {/* ──────────── PER-RESOURCE REMEDIATION RESULTS ──────────── */}
      {perResourceRemediateData && stage === "remediation" && (
        <div className="rounded-lg border-2 p-6" style={{ background: "var(--bg-secondary)", borderColor: "#22c55e80" }}>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#22c55e20" }}>
              <Split className="w-5 h-5" style={{ color: "#22c55e" }} />
            </div>
            <div>
              <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                Per-Resource Remediation {perResourceRemediateData.dry_run ? "(Preview)" : "Complete"}
              </h3>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>{perResourceRemediateData.message}</p>
            </div>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { value: perResourceRemediateData.total_resources, label: "Resources", color: "var(--text-primary)" },
              { value: perResourceRemediateData.summary.before_total_exposure, label: "Before (exposure)", color: "#ef4444" },
              { value: perResourceRemediateData.summary.after_total_exposure, label: "After (exposure)", color: "#22c55e" },
              { value: `${perResourceRemediateData.summary.reduction_percentage}%`, label: "Risk Reduction", color: "#8b5cf6" },
            ].map((stat, i) => (
              <div key={i} className="rounded-lg p-4 text-center border" style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)" }}>
                <div className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Per-resource results */}
          <div className="space-y-3">
            <div className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>Individual Resource Roles:</div>
            {perResourceRemediateData.resources.map((resource, idx) => (
              <div key={idx} className="rounded-lg border p-4" style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)" }}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Server className="w-5 h-5" style={{ color: "var(--text-muted)" }} />
                    <div>
                      <div className="font-semibold" style={{ color: "var(--text-primary)" }}>{resource.resource_name}</div>
                      <div className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{resource.resource_id}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold" style={{ color: "#22c55e" }}>{resource.permissions_count} permissions</div>
                    {resource.new_role_name && <div className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{resource.new_role_name}</div>}
                  </div>
                </div>
                <div className="space-y-1">
                  {resource.steps.map((step, stepIdx) => (
                    <div key={stepIdx} className="flex items-center gap-2 text-xs">
                      {step.status === "completed" ? <CheckCircle2 className="w-4 h-4" style={{ color: "#22c55e" }} /> : step.status === "skipped" || step.status === "preview" ? <div className="w-4 h-4 rounded-full" style={{ background: "var(--text-muted)" }} /> : <XCircle className="w-4 h-4" style={{ color: "#ef4444" }} />}
                      <span style={{ color: "var(--text-secondary)" }}>{step.details}</span>
                    </div>
                  ))}
                </div>
                {resource.permissions.length > 0 && (
                  <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border-subtle)" }}>
                    <div className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>Permissions:</div>
                    <div className="flex flex-wrap gap-1">
                      {resource.permissions.map((perm, permIdx) => (
                        <span key={permIdx} className="text-xs px-2 py-0.5 rounded font-mono" style={{ background: "#22c55e15", color: "#22c55e" }}>{perm}</span>
                      ))}
                    </div>
                  </div>
                )}
                {resource.snapshot_id && <div className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>Snapshot: {resource.snapshot_id}</div>}
              </div>
            ))}
          </div>

          {perResourceRemediateData.dry_run && (
            <div className="mt-6 flex gap-3">
              <button onClick={() => runPerResourceRemediation(false)} disabled={loading} className="flex items-center gap-2 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors hover:opacity-90 disabled:opacity-50" style={{ background: "#22c55e" }}>
                <Zap className="w-4 h-4" /> Execute Per-Resource Remediation (Live)
              </button>
            </div>
          )}

          {!perResourceRemediateData.dry_run && perResourceRemediateData.success && (
            <div className="mt-6 rounded-lg border p-4" style={{ background: "#22c55e10", borderColor: "#22c55e40" }}>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" style={{ color: "#22c55e" }} />
                <span className="font-semibold" style={{ color: "#22c55e" }}>Per-resource remediation complete! Each resource now has its own least-privilege role.</span>
              </div>
              {perResourceRemediateData.snapshots.length > 0 && (
                <div className="mt-2 text-sm" style={{ color: "#22c55e" }}>{perResourceRemediateData.snapshots.length} snapshot(s) created for rollback.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
