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

export function PerResourceAnalysis() {
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

  // UI state
  const [activeTab, setActiveTab] = useState<"aggregated" | "per-resource">("aggregated")
  const [aggApplied, setAggApplied] = useState(false)

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
      const data = await apiCall("GET", "/api/proxy/cyntro/scan")
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
  }, [apiCall])

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
    if (t.includes("ECS") || t.includes("CONTAINER")) return "#06b6d4"
    if (t.includes("RDS") || t.includes("DATABASE")) return "#8b5cf6"
    if (t.includes("S3") || t.includes("BUCKET")) return "#22c55e"
    if (t.includes("DYNAMO")) return "#f97316"
    return "#6b7280"
  }
  const getTypeLabel = (type: string) => {
    const t = (type || "").toUpperCase()
    if (t.includes("LAMBDA")) return "Lambda"
    if (t.includes("EC2")) return "EC2"
    if (t.includes("ECS")) return "ECS"
    if (t.includes("RDS")) return "RDS"
    if (t.includes("S3")) return "S3"
    if (t.includes("DYNAMO")) return "DynamoDB"
    if (t.includes("INSTANCE") && t.includes("PROFILE")) return "Profile"
    return type || "Resource"
  }

  // ── RENDER ──

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Per-Resource Analysis</h2>
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
          const iamRoles = roles.filter(r => r.resource_type !== "SecurityGroup")
          const sgItems = roles.filter(r => r.resource_type === "SecurityGroup")
          return (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Found <span className="font-semibold" style={{ color: "#ef4444" }}>{roles.length}</span> shared resource(s)
              {iamRoles.length > 0 && sgItems.length > 0
                ? ` — ${iamRoles.length} IAM role(s), ${sgItems.length} security group(s)`
                : " — each is a blast radius risk"}
            </p>

            {/* IAM Roles section */}
            {iamRoles.length > 0 && sgItems.length > 0 && (
              <div className="text-xs font-semibold uppercase tracking-wider pt-2" style={{ color: "var(--text-muted)" }}>
                IAM Roles
              </div>
            )}
            {iamRoles.map((role) => {
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

                  {role.resources.length > 1 && (
                    <div className="text-xs mb-3 px-3 py-2 rounded-lg border" style={{ background: "#f9731610", borderColor: "#f9731640", color: "#f97316" }}>
                      If any of these {role.resources.length} resources is compromised, the attacker gets all {role.total_permissions} permissions — affecting every resource on this role.
                    </div>
                  )}

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

            {/* Security Groups section */}
            {sgItems.length > 0 && (
              <>
                {iamRoles.length > 0 && (
                  <div className="text-xs font-semibold uppercase tracking-wider pt-3" style={{ color: "var(--text-muted)" }}>
                    Security Groups
                  </div>
                )}
                {sgItems.map((sg) => {
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

                      {sg.resources.length > 1 && (
                        <div className="text-xs mb-3 px-3 py-2 rounded-lg border" style={{ background: "#f9731610", borderColor: "#f9731640", color: "#f97316" }}>
                          {sg.resources.length} resources share this SG — a rule change affects all of them. Consider per-resource SGs for isolation.
                        </div>
                      )}

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
        <div className="rounded-lg border p-6" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Shared Security Group Analysis</h3>
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4" style={{ color: "#ef4444" }} />
              <span className="text-sm font-bold font-mono px-3 py-1 rounded-lg border" style={{ color: "#ef4444", background: "#ef444410", borderColor: "#ef444440" }}>
                {selectedSGData.role_name}
              </span>
            </div>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            <div className="rounded-lg p-3 border text-center" style={{ borderColor: "var(--border-subtle)" }}>
              <div className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{selectedSGData.inbound_rules || selectedSGData.total_permissions}</div>
              <div className="text-[10px] uppercase" style={{ color: "var(--text-muted)" }}>Inbound Rules</div>
            </div>
            <div className="rounded-lg p-3 border text-center" style={{ borderColor: "var(--border-subtle)" }}>
              <div className="text-2xl font-bold" style={{ color: "#f97316" }}>{selectedSGData.resources.length}</div>
              <div className="text-[10px] uppercase" style={{ color: "var(--text-muted)" }}>Attached Resources</div>
            </div>
            <div className="rounded-lg p-3 border text-center" style={{ borderColor: (selectedSGData.active_ports || 0) > 0 ? "#22c55e40" : "#ef444440", background: (selectedSGData.active_ports || 0) > 0 ? "#22c55e10" : "#ef444410" }}>
              <div className="text-2xl font-bold" style={{ color: (selectedSGData.active_ports || 0) > 0 ? "#22c55e" : "#ef4444" }}>{selectedSGData.active_ports || 0}</div>
              <div className="text-[10px] uppercase" style={{ color: "var(--text-muted)" }}>Active Ports</div>
            </div>
            <div className="rounded-lg p-3 border text-center" style={{ borderColor: selectedSGData.has_public ? "#ef444440" : "#22c55e40", background: selectedSGData.has_public ? "#ef444410" : "#22c55e10" }}>
              <div className="text-sm font-bold" style={{ color: selectedSGData.has_public ? "#ef4444" : "#22c55e" }}>
                {selectedSGData.has_public ? "PUBLIC" : "PRIVATE"}
              </div>
              <div className="text-[10px] uppercase mt-1" style={{ color: "var(--text-muted)" }}>Ingress Type</div>
            </div>
          </div>

          {/* Problem explanation */}
          <div className="text-sm mb-5 px-4 py-3 rounded-lg border" style={{ background: "#f9731610", borderColor: "#f9731640", color: "#f97316" }}>
            <strong>Blast radius risk:</strong> This SG is attached to {selectedSGData.resources.length} resources.
            Any rule change (opening a port, widening a CIDR) affects all of them. Per-resource SGs would allow
            fine-grained control — each resource only exposes ports it actually needs.
          </div>

          {/* Attached resources */}
          <div className="mb-5">
            <h4 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Attached Resources</h4>
            <div className="space-y-2">
              {selectedSGData.resources.map((r) => {
                const color = getTypeColor(r.resource_type)
                const label = getTypeLabel(r.resource_type)
                return (
                  <div key={r.resource_id} className="flex items-center gap-3 p-3 rounded-lg border" style={{ borderColor: "var(--border-subtle)" }}>
                    <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border font-medium"
                      style={{ background: `${color}15`, color, borderColor: `${color}40` }}>
                      {label}
                    </span>
                    <span className="font-mono text-sm font-bold" style={{ color: "var(--text-primary)" }}>{r.resource_name}</span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>{r.resource_id}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Active ports from traffic */}
          {selectedSGData.all_permissions && selectedSGData.all_permissions.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Observed Traffic (Active Ports)</h4>
              <div className="flex flex-wrap gap-2">
                {selectedSGData.all_permissions.map((perm) => (
                  <span key={perm} className="inline-flex items-center text-xs px-3 py-1.5 rounded-lg border font-mono font-medium"
                    style={{ background: "#22c55e10", color: "#22c55e", borderColor: "#22c55e40" }}>
                    <Activity className="w-3 h-3 mr-1.5" />
                    {perm.replace("port:", "")}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recommendation */}
          <div className="mt-5 p-4 rounded-lg border" style={{ background: "#8b5cf610", borderColor: "#8b5cf640" }}>
            <div className="flex items-start gap-3">
              <Split className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "#8b5cf6" }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: "#8b5cf6" }}>Recommendation: Split into per-resource SGs</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                  Create a dedicated SG for each resource, with only the ports that resource actually uses.
                  This limits blast radius — compromising one resource doesn&apos;t expose others&apos; ports.
                </p>
              </div>
            </div>
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
            const isHighBlastRadius = isShared && totalPermsV > 5

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
            if (isLeastPrivilege && isShared && !isHighBlastRadius) {
              // Clean but shared with low permission count — low risk
              return (
                <div className="mb-5 p-3 rounded-lg border" style={{ background: "#22c55e10", borderColor: "#22c55e40" }}>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#22c55e" }} />
                    <div className="text-sm" style={{ color: "var(--text-primary)" }}>
                      <strong style={{ color: "#22c55e" }}>Least privilege achieved.</strong> All {totalPermsV} permission{totalPermsV !== 1 ? "s are" : " is"} in use. {resourceCount} resources share this role, but with only {totalPermsV} low-risk permission{totalPermsV !== 1 ? "s" : ""} the blast radius is minimal.
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
                      <><strong style={{ color: "#f97316" }}>Shared role — blast radius risk.</strong> All {totalPermsV} permissions are in use, but {resourceCount} resources share the same role with {totalPermsV} permissions each. Splitting into per-resource roles would limit exposure if any single resource is compromised.</>
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
                <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
                  Split into {analysisData.analyses.length} least-privilege roles:
                </p>
                <div className="space-y-1 mb-4">
                  {analysisData.analyses.map((a) => (
                    <div key={a.resource_id} className="text-sm">
                      <span style={{ color: "var(--text-muted)" }}>&bull; </span>
                      <span className="font-mono" style={{ color: "#8b5cf6" }}>role-{a.resource_name}</span>:{" "}
                      <span className="font-bold" style={{ color: "var(--text-primary)" }}>{a.used_count}</span>{" "}
                      <span style={{ color: "var(--text-muted)" }}>permission{a.used_count !== 1 ? "s" : ""}</span>
                    </div>
                  ))}
                </div>
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
