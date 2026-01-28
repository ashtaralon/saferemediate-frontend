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
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null)
  const [recommendData, setRecommendData] = useState<RecommendData | null>(null)
  const [simData, setSimData] = useState<SimData | null>(null)
  const [remediateData, setRemediateData] = useState<RemediateData | null>(null)

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
    setLoadingMsg("Scanning EC2, Lambda, ECS for shared roles...")
    setError(null)
    setRoles([])
    setSelectedRole(null)
    setAnalysisData(null)
    setRecommendData(null)
    setSimData(null)
    setRemediateData(null)
    setStage("scan")

    try {
      const data = await apiCall("GET", "/api/proxy/cyntro/scan")
      setRoles(data)
      if (data.length === 0) {
        setError("No shared roles found. All roles are single-resource.")
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
      setLoadingMsg("")
    }
  }, [apiCall])

  // ── Analyze role ──
  const analyzeRole = useCallback(
    async (roleName: string) => {
      setLoading(true)
      setLoadingMsg("Querying CloudTrail for per-resource usage...")
      setError(null)
      setSelectedRole(roleName)
      setActiveTab("aggregated")
      setAggApplied(false)
      setRecommendData(null)
      setSimData(null)
      setRemediateData(null)
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
    [apiCall]
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

  // Get icon and display info for resource type
  const getResourceTypeInfo = (type: string) => {
    const typeUpper = type?.toUpperCase() || ""
    if (typeUpper.includes("EC2") || typeUpper.includes("INSTANCE")) {
      return { icon: <Server className="w-5 h-5" />, label: "EC2 Instance", color: "bg-orange-100 text-orange-700 border-orange-300" }
    }
    if (typeUpper.includes("LAMBDA") || typeUpper.includes("FUNCTION")) {
      return { icon: <Zap className="w-5 h-5" />, label: "Lambda", color: "bg-purple-100 text-purple-700 border-purple-300" }
    }
    if (typeUpper.includes("IAM") || typeUpper.includes("ROLE")) {
      return { icon: <Shield className="w-5 h-5" />, label: "IAM Role", color: "bg-blue-100 text-blue-700 border-blue-300" }
    }
    if (typeUpper.includes("ECS") || typeUpper.includes("CONTAINER")) {
      return { icon: <Server className="w-5 h-5" />, label: "ECS Task", color: "bg-teal-100 text-teal-700 border-teal-300" }
    }
    return { icon: <Server className="w-5 h-5" />, label: type || "Resource", color: "bg-gray-100 text-gray-700 border-gray-300" }
  }

  const resourceIcon = (type: string) => getResourceTypeInfo(type).icon

  // ── RENDER ──

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Split className="w-6 h-6 text-indigo-600" />
          <div>
            <h2 className="text-xl font-bold text-gray-900">Per-Resource Analysis</h2>
            <p className="text-sm text-gray-500">
              Discover shared IAM roles and split into per-resource least-privilege policies
            </p>
          </div>
        </div>
        {selectedRole && (
          <button
            onClick={() => {
              setSelectedRole(null)
              setAnalysisData(null)
              setRecommendData(null)
              setSimData(null)
              setRemediateData(null)
              setStage("scan")
            }}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to scan results
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">Error</p>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 flex items-center gap-4">
          <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
          <span className="text-sm text-gray-600">{loadingMsg}</span>
        </div>
      )}

      {/* ──────────── SCAN SECTION ──────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Shared Role Scanner</h3>
          <button
            onClick={runScan}
            disabled={loading}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors shadow-sm"
          >
            <Search className="w-4 h-4" />
            Scan AWS Account
          </button>
        </div>

        {roles.length === 0 && !loading && !error && (
          <p className="text-sm text-gray-400">Click &quot;Scan AWS Account&quot; to discover shared roles.</p>
        )}

        {roles.length > 0 && !selectedRole && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Found <span className="font-semibold text-gray-900">{roles.length}</span> shared role(s)
            </p>
            {roles.map((role) => (
              <button
                key={role.role_name}
                onClick={() => analyzeRole(role.role_name)}
                className="w-full text-left bg-gray-50 hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-lg p-4 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono text-sm font-semibold text-gray-900 group-hover:text-indigo-700">
                      {role.role_name}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {role.total_permissions} permissions &middot; {role.resources.length} resources
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium">
                      {role.resources.length} resources share this role
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-500" />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {role.resources.map((r) => {
                    const typeInfo = getResourceTypeInfo(r.resource_type)
                    return (
                      <span
                        key={r.resource_id}
                        className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium ${typeInfo.color}`}
                      >
                        {typeInfo.icon}
                        <span className="font-bold">{r.resource_name}</span>
                      </span>
                    )
                  })}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ──────────── ANALYSIS SECTION ──────────── */}
      {analysisData && stage !== "scan" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Permission Usage Analysis</h3>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-600" />
              <span className="text-xl font-bold text-indigo-700 font-mono bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-200">
                {selectedRole}
              </span>
            </div>
          </div>

          {/* Tab Toggle */}
          <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
            <button
              onClick={() => setActiveTab("aggregated")}
              className={`text-sm font-medium px-4 py-2 rounded-md transition-all ${
                activeTab === "aggregated"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200"
              }`}
            >
              Aggregated View
            </button>
            <button
              onClick={() => setActiveTab("per-resource")}
              className={`text-sm font-medium px-4 py-2 rounded-md transition-all ${
                activeTab === "per-resource"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200"
              }`}
            >
              Per-Resource View
            </button>
          </div>

          {/* ── Aggregated View ── */}
          {activeTab === "aggregated" && (
            <div className="max-w-lg">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-4 font-semibold">
                  CloudKnox / Entra View (Aggregated)
                </p>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Total Permissions</span>
                    <span className="font-mono font-bold text-gray-900">
                      {analysisData.aggregated.total_permissions}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Actually Used</span>
                    <span className="font-mono font-bold text-green-600">
                      {analysisData.aggregated.used_permissions}{" "}
                      <span className="text-gray-400">
                        ({Math.round(
                          (analysisData.aggregated.used_permissions /
                            analysisData.aggregated.total_permissions) *
                            100
                        )}
                        %)
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Unused</span>
                    <span className="font-mono font-bold text-red-600">
                      {analysisData.aggregated.total_permissions -
                        analysisData.aggregated.used_permissions}{" "}
                      <span className="text-gray-400">
                        ({Math.round(
                          ((analysisData.aggregated.total_permissions -
                            analysisData.aggregated.used_permissions) /
                            analysisData.aggregated.total_permissions) *
                            100
                        )}
                        %)
                      </span>
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                    <div
                      className="bg-green-500 h-2.5 rounded-full transition-all"
                      style={{
                        width: `${Math.round(
                          (analysisData.aggregated.used_permissions /
                            analysisData.aggregated.total_permissions) *
                            100
                        )}%`,
                      }}
                    />
                  </div>
                  {/* Warning */}
                  <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span className="text-sm font-semibold text-amber-800">OVER-PERMISSIONED</span>
                    </div>
                    <p className="text-xs text-amber-700 mt-1">
                      Remove{" "}
                      {analysisData.aggregated.total_permissions -
                        analysisData.aggregated.used_permissions}{" "}
                      unused permissions
                    </p>
                  </div>
                  {/* Buttons */}
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => setAggApplied(true)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                    >
                      Apply Aggregated Fix
                    </button>
                  </div>
                </div>

                {/* Applied result */}
                {aggApplied && (
                  <div className="mt-4 space-y-2 p-4 rounded-lg bg-green-50 border border-green-200 animate-in fade-in">
                    <div className="flex items-center gap-2 text-sm text-green-700">
                      <CheckCircle2 className="w-4 h-4" />
                      Policy updated
                    </div>
                    <div className="flex items-center gap-2 text-sm text-green-700">
                      <CheckCircle2 className="w-4 h-4" />
                      Role reduced: {analysisData.aggregated.total_permissions} →{" "}
                      {analysisData.aggregated.used_permissions} permissions
                    </div>
                    <div className="flex items-center gap-2 text-sm text-green-700">
                      <CheckCircle2 className="w-4 h-4" />
                      All {analysisData.analyses.length} resources now have{" "}
                      {analysisData.aggregated.used_permissions} permissions
                    </div>
                    <p className="text-sm font-semibold text-green-800 mt-2">
                      Risk reduced by{" "}
                      {Math.round(
                        ((analysisData.aggregated.total_permissions -
                          analysisData.aggregated.used_permissions) /
                          analysisData.aggregated.total_permissions) *
                          100
                      )}
                      %
                    </p>
                    <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <p className="text-xs text-amber-700">
                        But do all {analysisData.analyses.length} resources need the same{" "}
                        {analysisData.aggregated.used_permissions} permissions?
                      </p>
                      <button
                        onClick={() => setActiveTab("per-resource")}
                        className="text-xs text-indigo-600 underline mt-1"
                      >
                        Switch to Per-Resource View to find out →
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
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <span className="text-sm font-semibold text-amber-800">
                    SHARED ROLE PROBLEM DETECTED
                  </span>
                </div>
                <p className="text-sm text-amber-700 mt-1">
                  This role is shared by {analysisData.analyses.length} resources, but each resource
                  uses <strong>DIFFERENT</strong> permissions. Recommendation: Split roles.
                </p>
              </div>

              {/* Resource cards */}
              {analysisData.analyses.map((a) => {
                const unusedShown = a.unused_permissions.slice(0, 4)
                const unusedMore = a.unused_permissions.length > 4 ? a.unused_permissions.length - 4 : 0
                const typeInfo = getResourceTypeInfo(a.resource_type)
                return (
                  <div
                    key={a.resource_id}
                    className="bg-gray-50 border border-gray-200 rounded-lg p-5 hover:border-indigo-300 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        {/* Resource type badge - prominent */}
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-bold text-sm ${typeInfo.color}`}>
                          {typeInfo.icon}
                          {typeInfo.label}
                        </span>
                        {/* Resource name - bold */}
                        <span className="text-lg font-bold text-gray-900">
                          {a.resource_name}
                        </span>
                        <span className="text-xs text-gray-400 font-mono">({a.resource_id})</span>
                      </div>
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                          a.utilization_rate < 0.1
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {a.utilization_rate < 0.005
                          ? "<1"
                          : Math.round(a.utilization_rate * 100)}
                        % utilization
                      </span>
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="bg-white rounded-lg p-3 text-center border border-gray-100">
                        <div className="text-2xl font-bold text-gray-900">{a.permissions_granted}</div>
                        <div className="text-xs text-gray-500">Granted</div>
                      </div>
                      <div className="bg-white rounded-lg p-3 text-center border border-gray-100">
                        <div className="text-2xl font-bold text-green-600">{a.used_count}</div>
                        <div className="text-xs text-gray-500">Used</div>
                      </div>
                      <div className="bg-white rounded-lg p-3 text-center border border-gray-100">
                        <div className="text-2xl font-bold text-red-600">
                          {a.unused_permissions.length}
                        </div>
                        <div className="text-xs text-gray-500">Unused</div>
                      </div>
                    </div>

                    {/* Used permissions */}
                    <div className="mb-3">
                      <p className="text-xs text-gray-400 uppercase tracking-wider mb-2 font-semibold">
                        Used permissions:
                      </p>
                      {a.permissions_used.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">
                          No API calls observed in analysis window
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {a.permissions_used.map((p) => (
                            <div key={p.action} className="flex items-start gap-2 text-sm">
                              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-mono text-gray-900">{p.action}</span>
                                <span className="text-gray-400 ml-2">
                                  ({p.call_count.toLocaleString()} calls)
                                </span>
                                {p.targets.length > 0 && (
                                  <div className="text-xs text-gray-400 mt-0.5 ml-1">
                                    └ {p.targets[0].replace(/arn:aws:s3:::/g, "")}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Unused permissions */}
                    <div className="mb-3">
                      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1 font-semibold">
                        Never used ({a.unused_permissions.length}):
                      </p>
                      <p className="text-xs text-red-500 font-mono">
                        {unusedShown.join(", ")}
                        {unusedMore > 0 && ` +${unusedMore} more`}
                      </p>
                    </div>

                    {/* Risk factors */}
                    {a.risk_factors.length > 0 && (
                      <div className="p-2.5 rounded-lg bg-red-50 border border-red-200">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                          <span className="text-xs text-red-700">
                            Risk: {a.risk_factors.slice(0, 2).join("; ")}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Recommendation panel */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-5 h-5 text-indigo-600" />
                  <span className="text-lg font-semibold text-indigo-900">CYNTRO RECOMMENDATION</span>
                </div>
                <p className="text-sm text-indigo-700 mb-3">
                  Split into {analysisData.analyses.length} least-privilege roles:
                </p>
                <div className="space-y-1 mb-4">
                  {analysisData.analyses.map((a) => (
                    <div key={a.resource_id} className="text-sm">
                      <span className="text-gray-500">&bull; </span>
                      <span className="font-mono text-indigo-700">role-{a.resource_name}</span>:{" "}
                      <span className="font-bold text-gray-900">{a.used_count}</span>{" "}
                      <span className="text-gray-500">
                        permission{a.used_count !== 1 ? "s" : ""}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={showComparison}
                    disabled={loading}
                    className="flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    Compare Approaches
                  </button>
                  <button
                    onClick={runSimulation}
                    disabled={loading}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    Simulate Split
                  </button>
                  <button
                    onClick={() => runRemediation(true)}
                    disabled={loading}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
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
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Why Per-Resource Matters</h3>

          {/* Current State - shared by both */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <span className="font-semibold text-red-700">Current State: Shared Role</span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-3xl font-bold text-red-600">{recommendData.original_permissions}</div>
                <div className="text-xs text-gray-600">permissions granted</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-red-600">{recommendData.resources_attached}</div>
                <div className="text-xs text-gray-600">resources sharing</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-red-600">{recommendData.original_permissions * recommendData.resources_attached}</div>
                <div className="text-xs text-gray-600">total exposure</div>
              </div>
            </div>
          </div>

          {/* Side by side comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* CloudKnox approach */}
            <div className="border-2 border-gray-200 rounded-xl overflow-hidden">
              <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-700">Traditional Approach</span>
                  <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">CloudKnox-style</span>
                </div>
              </div>
              <div className="p-4 space-y-4">
                <div className="text-sm text-gray-600">
                  Reduces role to <strong>{recommendData.aggregated_used} permissions</strong> (union of all used)
                </div>

                {/* Visual representation */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="text-xs text-amber-700 font-medium mb-2">After remediation:</div>
                  <div className="space-y-1">
                    {Array.from({ length: Math.min(recommendData.resources_attached, 4) }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Server className="w-4 h-4 text-gray-400" />
                        <span className="text-xs text-gray-600">Resource {i + 1}</span>
                        <ArrowRight className="w-3 h-3 text-gray-400" />
                        <span className="text-xs font-mono bg-amber-100 px-2 py-0.5 rounded text-amber-700">
                          {recommendData.aggregated_used} perms
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-200">
                  <div className="flex justify-between items-end">
                    <div>
                      <div className="text-xs text-gray-500">Total exposure after fix</div>
                      <div className="text-2xl font-bold text-gray-600">
                        {recommendData.aggregated_used * recommendData.resources_attached}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Risk reduction</div>
                      <div className="text-2xl font-bold text-gray-500">
                        {Math.round(recommendData.aggregated_risk_reduction)}%
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gray-400 rounded-full"
                      style={{ width: `${recommendData.aggregated_risk_reduction}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Cyntro approach */}
            <div className="border-2 border-green-300 rounded-xl overflow-hidden bg-green-50/30">
              <div className="bg-green-100 px-4 py-3 border-b border-green-200">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-green-800">Cyntro Per-Resource</span>
                  <span className="text-xs bg-green-200 text-green-700 px-2 py-1 rounded font-medium">Recommended</span>
                </div>
              </div>
              <div className="p-4 space-y-4">
                <div className="text-sm text-gray-600">
                  Each resource gets <strong>only what it uses</strong>
                </div>

                {/* Visual representation */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="text-xs text-green-700 font-medium mb-2">After remediation:</div>
                  <div className="space-y-1">
                    {(analysisData?.analyses || []).slice(0, 4).map((a, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Server className="w-4 h-4 text-green-500" />
                        <span className="text-xs text-gray-600 truncate max-w-[100px]">{a.resource_name}</span>
                        <ArrowRight className="w-3 h-3 text-green-400" />
                        <span className="text-xs font-mono bg-green-100 px-2 py-0.5 rounded text-green-700">
                          {a.used_count || 0} perm{(a.used_count || 0) !== 1 ? 's' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-green-200">
                  <div className="flex justify-between items-end">
                    <div>
                      <div className="text-xs text-gray-500">Total exposure after fix</div>
                      <div className="text-2xl font-bold text-green-600">
                        {(analysisData?.analyses || []).reduce((sum, a) => sum + (a.used_count || 0), 0)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Risk reduction</div>
                      <div className="text-2xl font-bold text-green-600">
                        {Math.round(recommendData.cyntro_risk_reduction)}%
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 h-2 bg-green-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${recommendData.cyntro_risk_reduction}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Key insight callout */}
          <div className="mt-6 bg-indigo-50 border border-indigo-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <div className="font-semibold text-indigo-900 mb-1">The Cyntro Difference</div>
                <div className="text-sm text-indigo-700">
                  Traditional tools give every resource the <strong>same reduced permissions</strong>.
                  Cyntro tracks which resource uses which permission, so each gets <strong>only what it actually needs</strong>.
                  This eliminates <strong>{recommendData.aggregated_used * recommendData.resources_attached > 0 ? Math.round((1 - ((analysisData?.analyses || []).reduce((sum, a) => sum + (a.used_count || 0), 0) || 0) / (recommendData.aggregated_used * recommendData.resources_attached)) * 100) : 0}% more risk</strong> than aggregated approaches.
                </div>
              </div>
            </div>
          </div>

          {/* Architecture explanation - collapsed by default */}
          <details className="mt-6">
            <summary className="cursor-pointer text-sm font-semibold text-gray-700 hover:text-gray-900">
              How Cyntro Analyzes Per-Resource
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-2">
              {[
                { step: "1", title: "Collect CloudTrail logs", detail: "90 days of API events" },
                { step: "2", title: "Map sessions to resources", detail: '"assumed-role/.../i-abc123" → EC2-1' },
                { step: "3", title: "Track per-resource usage", detail: "EC2-1 used s3:GetObject; Lambda used s3:PutObject" },
                { step: "4", title: "Build permission graph", detail: "Resource → Permission → Target mapping" },
                { step: "5", title: "Generate per-resource recommendations", detail: "Scoped to exact buckets and actions observed" },
              ].map((s) => (
                <div key={s.step} className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {s.step}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{s.title}</div>
                    <div className="text-xs text-gray-500">{s.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </details>

          {/* Action buttons */}
          <div className="mt-6 flex gap-3">
            <button
              onClick={runSimulation}
              disabled={loading}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
            >
              <Play className="w-4 h-4" />
              Simulate Split
            </button>
            <button
              onClick={() => runRemediation(true)}
              disabled={loading}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
            >
              Remediate Now
            </button>
          </div>
        </div>
      )}

      {/* ──────────── SIMULATION SECTION ──────────── */}
      {simData && (stage === "simulation" || stage === "remediation") && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Simulation Results</h3>

          <div className="space-y-3">
            {simData.results.map((r) => (
              <div
                key={r.resource_id}
                className="bg-gray-50 border border-gray-200 rounded-lg p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {r.passed ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                    <span className="font-semibold text-sm text-gray-900">{r.resource_name}</span>
                    <span className="text-xs text-gray-400 font-mono">{r.proposed_role}</span>
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      r.passed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}
                  >
                    {r.confidence.toFixed(1)}% confidence
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-white border border-gray-100 rounded p-2">
                    <div className="font-bold text-gray-900">{r.total_events.toLocaleString()}</div>
                    <div className="text-gray-500">Events replayed</div>
                  </div>
                  <div className="bg-white border border-gray-100 rounded p-2">
                    <div className="font-bold text-green-600">{r.successful.toLocaleString()}</div>
                    <div className="text-gray-500">Successful</div>
                  </div>
                  <div className="bg-white border border-gray-100 rounded p-2">
                    <div className="font-bold text-red-600">{r.denied}</div>
                    <div className="text-gray-500">Denied</div>
                  </div>
                </div>
              </div>
            ))}

            {simData.all_passed ? (
              <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-semibold text-green-800">
                    All simulations passed. Safe to proceed.
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-600" />
                  <span className="text-sm font-semibold text-red-800">
                    Some simulations failed. Review before proceeding.
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-2">
              <button
                onClick={() => runRemediation(true)}
                disabled={loading}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
              >
                Execute Remediation (Dry Run)
              </button>
              {simData.all_passed && (
                <button
                  onClick={() => runRemediation(false)}
                  disabled={loading}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
                >
                  Execute Live
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ──────────── REMEDIATION SECTION ──────────── */}
      {remediateData && stage === "remediation" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Remediation {remediateData.dry_run ? "(Dry Run)" : "(Live)"}
          </h3>

          <div className="space-y-2 mb-6">
            {remediateData.steps.map((s, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                {s.status === "completed" ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                ) : s.status === "failed" ? (
                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                ) : (
                  <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
                )}
                <span className="text-gray-500">[{s.action}]</span>
                <span className="text-gray-900">{s.target}</span>
                {s.details && <span className="text-xs text-gray-400">{s.details}</span>}
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="p-5 rounded-lg bg-green-50 border border-green-200">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <span className="font-semibold text-green-800">
                REMEDIATION COMPLETE {remediateData.dry_run ? "(DRY RUN)" : ""}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-white rounded-lg p-3 border border-green-100">
                <div className="text-2xl font-bold text-gray-400">
                  {remediateData.summary.before_total}
                </div>
                <div className="text-xs text-gray-500">Before (total perms)</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-green-100">
                <div className="text-2xl font-bold text-green-600">
                  {remediateData.summary.after_total}
                </div>
                <div className="text-xs text-gray-500">After (total perms)</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-green-100">
                <div className="text-2xl font-bold text-indigo-600">
                  {Math.round(remediateData.summary.reduction * 100)}%
                </div>
                <div className="text-xs text-gray-500">Reduction</div>
              </div>
            </div>
          </div>

          {remediateData.dry_run && (
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => runRemediation(false)}
                disabled={loading}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
              >
                Execute Live Remediation
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
