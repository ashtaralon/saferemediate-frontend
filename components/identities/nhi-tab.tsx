"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Bot,
  Search,
  Shield,
  Key,
  Activity,
  TrendingDown,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Server,
  Cpu,
  Workflow,
  RefreshCw,
  Lock,
  FileKey2,
  Globe,
  Trash2,
  ShieldAlert,
  Database,
  Zap,
  Eye,
  PenTool,
  Network,
  Target,
  HardDrive,
  ArrowRightLeft,
  Wifi,
  BarChart3,
} from "lucide-react"
import { IAMPermissionAnalysisModal } from "../iam-permission-analysis-modal"

interface NHIdentity {
  arn: string
  name: string
  identity_type: string
  sub_type: string
  system_name: string | null
  risk_level: string
  permissions_count: number
  used_permissions_count: number
  unused_permissions_count: number
  gap_percentage: number
  last_activity: string | null
  attached_resources: string[]
  policies: string[]
  trust_principals: string[]
  is_admin: boolean
  has_wildcard: boolean
  is_cross_account: boolean
  observation_days: number
  confidence: number
}

interface IdentityDetail {
  basic_info: any
  permission_analysis: any
  damage_classification: any
  temporal_activity: any
  network_reachability: any
  blast_radius: any
  policies: string[]
  trust_principals: string[]
  recommendations: string[]
}

interface NHITabProps {
  onRequestRemediation?: (data: any) => void
}

const SUB_TYPE_ICONS: Record<string, any> = {
  "Lambda Execution Role": Workflow,
  "EC2 Instance Profile": Server,
  "ECS Task Role": Cpu,
  "ECS Service Role": Cpu,
  "CodeBuild Role": Cpu,
  "CodePipeline Role": Workflow,
  "Step Functions Role": Workflow,
  "Glue Job Role": Cpu,
  "Service Role": Workflow,
  "Service Account": Cpu,
  "Workload Role": Server,
}

const DAMAGE_ICONS: Record<string, any> = {
  DELETE: Trash2,
  ADMIN: ShieldAlert,
  ENCRYPT: Lock,
  WRITE: PenTool,
  READ: Eye,
}

const DAMAGE_COLORS: Record<string, string> = {
  DELETE: "#ef4444",
  ADMIN: "#f97316",
  ENCRYPT: "#a855f7",
  WRITE: "#eab308",
  READ: "#3b82f6",
}

export function NHITab({ onRequestRemediation }: NHITabProps) {
  const [identities, setIdentities] = useState<NHIdentity[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [riskFilter, setRiskFilter] = useState("all")
  const [subTypeFilter, setSubTypeFilter] = useState("all")
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [selectedIdentity, setSelectedIdentity] = useState<any>(null)
  const [showPermissionModal, setShowPermissionModal] = useState(false)
  const [detailData, setDetailData] = useState<IdentityDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailTab, setDetailTab] = useState<'permissions' | 'data-access' | 'network' | 'behavioral'>('permissions')
  const [dataAccess, setDataAccess] = useState<any>(null)
  const [dataAccessLoading, setDataAccessLoading] = useState(false)
  const [trafficData, setTrafficData] = useState<any>(null)
  const [trafficLoading, setTrafficLoading] = useState(false)

  useEffect(() => {
    fetchNHIs()
  }, [])

  const fetchNHIs = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/proxy/identities/nhi")
      if (!res.ok) throw new Error("Failed to fetch NHIs")
      const json = await res.json()
      setIdentities(Array.isArray(json) ? json : [])
    } catch (err) {
      console.error("Error fetching NHIs:", err)
      setIdentities([])
    } finally {
      setLoading(false)
    }
  }

  const fetchDetail = useCallback(async (name: string) => {
    setDetailLoading(true)
    setDetailData(null)
    setDataAccess(null)
    setTrafficData(null)
    setDetailTab('permissions')
    try {
      const res = await fetch(`/api/proxy/identities/detail/${encodeURIComponent(name)}`)
      if (res.ok) {
        const json = await res.json()
        setDetailData(json)
      }
    } catch (err) {
      console.error("Error fetching identity detail:", err)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const fetchDataAccess = useCallback(async (name: string) => {
    setDataAccessLoading(true)
    try {
      const res = await fetch(`/api/proxy/identities/${encodeURIComponent(name)}/data-access`)
      if (res.ok) setDataAccess(await res.json())
    } catch (err) {
      console.error("Error fetching data access:", err)
    } finally {
      setDataAccessLoading(false)
    }
  }, [])

  const fetchTrafficData = useCallback(async (resourceId: string) => {
    setTrafficLoading(true)
    try {
      const res = await fetch(`/api/proxy/traffic-data?resource_id=${encodeURIComponent(resourceId)}`)
      if (res.ok) setTrafficData(await res.json())
    } catch (err) {
      console.error("Error fetching traffic:", err)
    } finally {
      setTrafficLoading(false)
    }
  }, [])

  const handleExpand = (nhi: NHIdentity) => {
    if (expandedRow === nhi.arn) {
      setExpandedRow(null)
      setDetailData(null)
    } else {
      setExpandedRow(nhi.arn)
      fetchDetail(nhi.name)
    }
  }

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "Critical": return "#ef4444"
      case "High": return "#f97316"
      case "Medium": return "#eab308"
      default: return "#22c55e"
    }
  }

  const getSubTypeIcon = (subType: string) => SUB_TYPE_ICONS[subType] || Bot

  const subTypes = [...new Set(identities.map(i => i.sub_type))].sort()

  const filtered = identities.filter((i) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (
        !i.name.toLowerCase().includes(q) &&
        !i.arn.toLowerCase().includes(q) &&
        !(i.system_name || "").toLowerCase().includes(q) &&
        !i.sub_type.toLowerCase().includes(q)
      ) return false
    }
    if (riskFilter !== "all" && i.risk_level.toLowerCase() !== riskFilter.toLowerCase()) return false
    if (subTypeFilter !== "all" && i.sub_type !== subTypeFilter) return false
    return true
  })

  const handleReviewFix = (identity: NHIdentity) => {
    // For Lambda functions, use the linked execution role name (first attached_resource)
    const roleName = identity.sub_type.startsWith("Lambda Function")
      ? (identity.attached_resources?.[0] || identity.name)
      : identity.name
    setSelectedIdentity({ roleName, systemName: identity.system_name || "" })
    setShowPermissionModal(true)
  }

  // Stats
  const totalNHIs = identities.length
  const criticalCount = identities.filter(i => i.risk_level === "Critical").length
  const totalUnused = identities.reduce((s, i) => s + i.unused_permissions_count, 0)
  const avgGap = identities.length > 0
    ? Math.round(identities.reduce((s, i) => s + i.gap_percentage, 0) / identities.length)
    : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 animate-spin mx-auto mb-3" style={{ color: "#f59e0b" }} />
          <p style={{ color: "var(--text-secondary)" }}>Loading Non-Human Identities...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg p-4 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Bot className="w-5 h-5" style={{ color: "#f59e0b" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Total NHIs</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{totalNHIs}</div>
        </div>
        <div className="rounded-lg p-4 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5" style={{ color: "#ef4444" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Critical Risk</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "#ef4444" }}>{criticalCount}</div>
        </div>
        <div className="rounded-lg p-4 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-5 h-5" style={{ color: "#ef4444" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Unused Permissions</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "#ef4444" }}>{totalUnused.toLocaleString()}</div>
        </div>
        <div className="rounded-lg p-4 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-5 h-5" style={{ color: avgGap > 50 ? "#ef4444" : "#eab308" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Avg Permission Gap</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: avgGap > 50 ? "#ef4444" : "#eab308" }}>{avgGap}%</div>
        </div>
      </div>

      {/* Observation Window Banner */}
      <div className="rounded-lg p-3 border flex items-center gap-3" style={{ background: "#3b82f610", borderColor: "#3b82f640" }}>
        <Clock className="w-4 h-4 flex-shrink-0" style={{ color: "#3b82f6" }} />
        <span className="text-xs" style={{ color: "#3b82f6" }}>
          <strong>90-day behavioral observation window</strong> — powered by CloudTrail activity analysis from the Behavioral Data Engine
        </span>
      </div>

      {/* Filters */}
      <div className="rounded-lg border p-4" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} />
            <input
              type="text"
              placeholder="Search by name, ARN, system, or type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border text-sm"
              style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
            />
          </div>
          <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border text-sm"
            style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}>
            <option value="all">All Risk Levels</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select value={subTypeFilter} onChange={(e) => setSubTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border text-sm"
            style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}>
            <option value="all">All NHI Types</option>
            {subTypes.map((st) => <option key={st} value={st}>{st}</option>)}
          </select>
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{filtered.length} of {identities.length}</span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
        <div
          className="grid grid-cols-[2fr_1fr_1fr_100px_100px_100px_80px_90px] gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wider border-b"
          style={{ color: "var(--text-secondary)", borderColor: "var(--border-subtle)", background: "var(--bg-primary)" }}
        >
          <span>Identity</span>
          <span>Type</span>
          <span>System</span>
          <span className="text-center">Permissions</span>
          <span className="text-center">Unused</span>
          <span className="text-center">Gap</span>
          <span className="text-center">Risk</span>
          <span className="text-center">Action</span>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <Bot className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
            <p style={{ color: "var(--text-secondary)" }}>
              {searchQuery || riskFilter !== "all" || subTypeFilter !== "all"
                ? "No NHIs match your filters."
                : "No Non-Human Identities found."}
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {filtered.map((nhi) => {
              const Icon = getSubTypeIcon(nhi.sub_type)
              const isExpanded = expandedRow === nhi.arn

              return (
                <div key={nhi.arn}>
                  {/* Row */}
                  <div
                    className="grid grid-cols-[2fr_1fr_1fr_100px_100px_100px_80px_90px] gap-2 px-4 py-3 items-center cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => handleExpand(nhi)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center gap-1">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
                        ) : (
                          <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
                        )}
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#f59e0b20" }}>
                          <Icon className="w-4 h-4" style={{ color: "#f59e0b" }} />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate" style={{ color: "var(--text-primary)" }}>{nhi.name}</div>
                        <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{nhi.arn}</div>
                      </div>
                    </div>
                    <div>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium" style={{ background: "#f59e0b15", color: "#f59e0b" }}>
                        {nhi.sub_type}
                      </span>
                    </div>
                    <div className="text-sm truncate" style={{ color: "var(--text-secondary)" }}>{nhi.system_name || "—"}</div>
                    <div className="text-center text-sm font-medium" style={{ color: "var(--text-primary)" }}>{nhi.permissions_count}</div>
                    <div className="text-center text-sm font-medium" style={{ color: nhi.unused_permissions_count > 0 ? "#ef4444" : "#22c55e" }}>
                      {nhi.unused_permissions_count}
                    </div>
                    <div className="text-center">
                      <div className="inline-flex items-center gap-1">
                        <div className="w-10 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-primary)" }}>
                          <div className="h-full rounded-full" style={{
                            width: `${nhi.gap_percentage}%`,
                            background: nhi.gap_percentage >= 70 ? "#ef4444" : nhi.gap_percentage >= 50 ? "#f97316" : nhi.gap_percentage >= 30 ? "#eab308" : "#22c55e",
                          }} />
                        </div>
                        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{nhi.gap_percentage.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{
                        background: `${getRiskColor(nhi.risk_level)}20`,
                        color: getRiskColor(nhi.risk_level),
                      }}>{nhi.risk_level}</span>
                    </div>
                    <div className="text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleReviewFix(nhi) }}
                        className="px-3 py-1 rounded-lg text-xs font-medium text-white transition-all hover:opacity-90"
                        style={{ background: "#8b5cf6" }}
                      >Review</button>
                    </div>
                  </div>

                  {/* Enhanced Expanded Detail */}
                  {isExpanded && (
                    <div className="px-6 py-5 border-t" style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)" }}>
                      {detailLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <RefreshCw className="w-6 h-6 animate-spin" style={{ color: "#f59e0b" }} />
                          <span className="ml-2 text-sm" style={{ color: "var(--text-secondary)" }}>Loading behavioral analysis...</span>
                        </div>
                      ) : detailData ? (
                        <div className="space-y-4">
                          {/* Badges Row */}
                          <div className="flex items-center gap-3">
                            {nhi.is_admin && <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: "#ef444420", color: "#ef4444" }}>Admin Access</span>}
                            {nhi.has_wildcard && <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: "#f9731620", color: "#f97316" }}>Wildcard Permissions</span>}
                            {nhi.is_cross_account && <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: "#06b6d420", color: "#06b6d4" }}>Cross-Account</span>}
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{nhi.observation_days} days observed | {nhi.confidence}% confidence</span>
                          </div>

                          {/* Detail Tabs */}
                          <div className="flex items-center gap-1 border-b" style={{ borderColor: "var(--border-subtle)" }}>
                            {([
                              { id: 'permissions' as const, label: 'Permissions', icon: Key },
                              { id: 'data-access' as const, label: 'Data Access', icon: Database },
                              { id: 'network' as const, label: 'Network', icon: Wifi },
                              { id: 'behavioral' as const, label: 'Behavioral', icon: Activity },
                            ]).map(tab => (
                              <button
                                key={tab.id}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDetailTab(tab.id)
                                  if (tab.id === 'data-access' && !dataAccess && !dataAccessLoading) fetchDataAccess(nhi.name)
                                  if (tab.id === 'network' && !trafficData && !trafficLoading) fetchTrafficData(nhi.name)
                                }}
                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px"
                                style={{
                                  borderColor: detailTab === tab.id ? '#8b5cf6' : 'transparent',
                                  color: detailTab === tab.id ? '#8b5cf6' : 'var(--text-secondary)',
                                }}
                              >
                                <tab.icon className="w-3.5 h-3.5" />
                                {tab.label}
                              </button>
                            ))}
                          </div>

                          {/* Tab Content */}
                          <div className="min-h-[200px]">

                            {/* ===== PERMISSIONS TAB ===== */}
                            {detailTab === 'permissions' && (
                              <div className="space-y-4">
                                {/* LP Gap Summary */}
                                <div className="flex items-center gap-6">
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Used: {nhi.used_permissions_count}</span>
                                      <span className="text-xs" style={{ color: "#ef4444" }}>Unused: {nhi.unused_permissions_count}</span>
                                    </div>
                                    <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-primary)" }}>
                                      <div className="h-full rounded-full" style={{
                                        width: `${nhi.permissions_count > 0 ? (nhi.used_permissions_count / nhi.permissions_count) * 100 : 0}%`,
                                        background: "#22c55e",
                                      }} />
                                    </div>
                                    <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                                      {nhi.gap_percentage.toFixed(0)}% permissions can be removed
                                    </div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                  {/* Damage Potential */}
                                  <div className="rounded-lg p-4 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
                                    <h4 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
                                      <Target className="w-3.5 h-3.5" /> Damage Potential
                                    </h4>
                                    {detailData.damage_classification ? (
                                      <>
                                        <div className="flex items-center justify-between mb-3">
                                          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Damage Score</span>
                                          <span className="text-xl font-bold" style={{
                                            color: detailData.damage_classification.damage_score >= 70 ? "#ef4444"
                                              : detailData.damage_classification.damage_score >= 40 ? "#f97316" : "#22c55e"
                                          }}>{detailData.damage_classification.damage_score}/100</span>
                                        </div>
                                        <div className="space-y-2">
                                          {Object.entries(detailData.damage_classification.details || {}).map(([cat, actions]) => {
                                            const actList = actions as string[]
                                            if (!actList || actList.length === 0) return null
                                            const DIcon = DAMAGE_ICONS[cat] || AlertTriangle
                                            const color = DAMAGE_COLORS[cat] || "#64748b"
                                            return (
                                              <div key={cat} className="flex items-center justify-between">
                                                <div className="flex items-center gap-2"><DIcon className="w-3.5 h-3.5" style={{ color }} /><span className="text-xs" style={{ color }}>{cat}</span></div>
                                                <span className="text-xs font-bold" style={{ color }}>{actList.length} unused</span>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      </>
                                    ) : <p className="text-xs" style={{ color: "var(--text-muted)" }}>No damage data</p>}
                                  </div>

                                  {/* Trust & Policies */}
                                  <div className="rounded-lg p-4 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
                                    <h4 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
                                      <Lock className="w-3.5 h-3.5" /> Trust & Policies
                                    </h4>
                                    {detailData.trust_principals?.length > 0 && (
                                      <div className="mb-3">
                                        <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Who Can Assume</span>
                                        {detailData.trust_principals.map((p: string, i: number) => (
                                          <div key={i} className="text-xs font-mono truncate mt-0.5" style={{ color: "var(--text-primary)" }}>{p}</div>
                                        ))}
                                      </div>
                                    )}
                                    {detailData.policies?.length > 0 && (
                                      <div>
                                        <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Attached Policies ({detailData.policies.length})</span>
                                        {detailData.policies.slice(0, 5).map((p: string, i: number) => (
                                          <div key={i} className="text-xs font-mono truncate mt-0.5" style={{ color: "var(--text-primary)" }}>{p}</div>
                                        ))}
                                        {detailData.policies.length > 5 && <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>+{detailData.policies.length - 5} more</div>}
                                      </div>
                                    )}
                                    {!detailData.trust_principals?.length && !detailData.policies?.length && (
                                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>No trust/policy data</p>
                                    )}
                                  </div>
                                </div>

                                {/* Recommendations */}
                                {detailData.recommendations?.length > 0 && (
                                  <div className="rounded-lg p-3 border" style={{ background: "#f59e0b08", borderColor: "#f59e0b40" }}>
                                    <h4 className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1" style={{ color: "#f59e0b" }}>
                                      <Zap className="w-3.5 h-3.5" /> Recommendations
                                    </h4>
                                    {detailData.recommendations.map((rec: string, i: number) => (
                                      <div key={i} className="text-xs flex items-start gap-2 mt-1" style={{ color: "var(--text-primary)" }}>
                                        <span style={{ color: "#f59e0b" }}>-</span> {rec}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* ===== DATA ACCESS TAB ===== */}
                            {detailTab === 'data-access' && (
                              <div className="space-y-4">
                                {dataAccessLoading ? (
                                  <div className="flex items-center justify-center py-8">
                                    <RefreshCw className="w-5 h-5 animate-spin" style={{ color: "#8b5cf6" }} />
                                    <span className="ml-2 text-sm" style={{ color: "var(--text-secondary)" }}>Analyzing data access...</span>
                                  </div>
                                ) : dataAccess?.dataStores?.length > 0 ? (
                                  <>
                                    {/* Summary */}
                                    <div className="flex items-center gap-4">
                                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: "var(--bg-secondary)" }}>
                                        <Database className="w-3.5 h-3.5" style={{ color: "#8b5cf6" }} />
                                        <span style={{ color: "var(--text-primary)" }}>{dataAccess.summary.totalDataStores} data store(s)</span>
                                      </div>
                                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: "var(--bg-secondary)" }}>
                                        <span style={{ color: "#22c55e" }}>{dataAccess.summary.totalObservedOps} observed</span>
                                        <span style={{ color: "var(--text-muted)" }}>/</span>
                                        <span style={{ color: "var(--text-primary)" }}>{dataAccess.summary.totalAllowedOps} allowed ops</span>
                                      </div>
                                      {dataAccess.summary.hasDestructiveAccess && (
                                        <span className="px-2 py-1 rounded text-xs font-medium" style={{ background: "#ef444420", color: "#ef4444" }}>Has Destructive Access</span>
                                      )}
                                    </div>

                                    {/* Data Store Cards */}
                                    {dataAccess.dataStores.map((store: any, idx: number) => {
                                      const ACCESS_LEVEL_COLORS: Record<string, string> = { FULL: '#ef4444', WRITE: '#f97316', READ: '#22c55e', NONE: '#6b7280' }
                                      const OP_COLORS: Record<string, string> = { READ: '#22c55e', LIST: '#3b82f6', WRITE: '#f97316', DELETE: '#ef4444', EXECUTE: '#a855f7', MODIFY: '#ef4444', ENCRYPT: '#a855f7', DECRYPT: '#3b82f6', INVOKE: '#06b6d4', SNAPSHOT: '#3b82f6', READ_METADATA: '#6b7280', READ_POLICY: '#6b7280', WRITE_POLICY: '#f97316', START: '#22c55e', STOP: '#ef4444' }
                                      const TYPE_ICONS: Record<string, any> = { S3: HardDrive, RDS: Database, DynamoDB: Database, Lambda: Workflow, KMS: Lock, SecretsManager: Key }
                                      const StoreIcon = TYPE_ICONS[store.type] || Database
                                      return (
                                        <div key={idx} className="rounded-lg border p-4" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
                                          <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                              <StoreIcon className="w-4 h-4" style={{ color: "#8b5cf6" }} />
                                              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{store.name}</span>
                                              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-primary)", color: "var(--text-muted)" }}>{store.type}</span>
                                            </div>
                                            <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{
                                              background: `${ACCESS_LEVEL_COLORS[store.accessLevel] || '#6b7280'}20`,
                                              color: ACCESS_LEVEL_COLORS[store.accessLevel] || '#6b7280',
                                            }}>{store.accessLevel} ACCESS</span>
                                          </div>

                                          {/* Operations Grid */}
                                          <div className="grid grid-cols-2 gap-3 mb-3">
                                            <div>
                                              <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Allowed Operations</span>
                                              <div className="flex flex-wrap gap-1 mt-1">
                                                {store.allowedOperations.length > 0 ? store.allowedOperations.map((op: string) => (
                                                  <span key={op} className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{
                                                    background: `${OP_COLORS[op] || '#6b7280'}15`,
                                                    color: OP_COLORS[op] || '#6b7280',
                                                  }}>{op}</span>
                                                )) : <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>None</span>}
                                              </div>
                                            </div>
                                            <div>
                                              <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Observed (Used)</span>
                                              <div className="flex flex-wrap gap-1 mt-1">
                                                {store.observedOperations.length > 0 ? store.observedOperations.map((op: string) => (
                                                  <span key={op} className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{
                                                    background: `${OP_COLORS[op] || '#6b7280'}15`,
                                                    color: OP_COLORS[op] || '#6b7280',
                                                    border: `1px solid ${OP_COLORS[op] || '#6b7280'}40`,
                                                  }}>{op}</span>
                                                )) : <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>No observed access</span>}
                                              </div>
                                            </div>
                                          </div>

                                          {/* Unused + Recommendation */}
                                          {store.unusedOperations.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mb-2">
                                              <span className="text-[10px]" style={{ color: "#ef4444" }}>Unused:</span>
                                              {store.unusedOperations.map((op: string) => (
                                                <span key={op} className="text-[10px] px-1.5 py-0.5 rounded font-medium line-through" style={{
                                                  background: "#ef444410", color: "#ef4444",
                                                }}>{op}</span>
                                              ))}
                                            </div>
                                          )}
                                          <div className="text-xs p-2 rounded" style={{ background: "#f59e0b08", color: "#f59e0b" }}>
                                            {store.recommendation}
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </>
                                ) : (
                                  <div className="text-center py-8">
                                    <Database className="w-8 h-8 mx-auto mb-2 opacity-30" style={{ color: "var(--text-muted)" }} />
                                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>No data store access detected for this identity</p>
                                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>This identity may not have data-service permissions (S3, RDS, DynamoDB)</p>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* ===== NETWORK TAB ===== */}
                            {detailTab === 'network' && (
                              <div className="space-y-4">
                                {/* Internet Reachability Banner */}
                                {detailData.network_reachability && (
                                  <div className="flex items-center gap-4 p-3 rounded-lg border" style={{
                                    background: detailData.network_reachability.is_internet_reachable ? "#ef444408" : "#22c55e08",
                                    borderColor: detailData.network_reachability.is_internet_reachable ? "#ef444430" : "#22c55e30",
                                  }}>
                                    <Globe className="w-5 h-5" style={{ color: detailData.network_reachability.is_internet_reachable ? "#ef4444" : "#22c55e" }} />
                                    <div>
                                      <div className="text-sm font-medium" style={{ color: detailData.network_reachability.is_internet_reachable ? "#ef4444" : "#22c55e" }}>
                                        {detailData.network_reachability.is_internet_reachable ? "Internet Reachable" : "Internal Only"}
                                      </div>
                                      {detailData.network_reachability.open_ports?.length > 0 && (
                                        <div className="text-xs mt-0.5" style={{ color: "#ef4444" }}>Open ports: {detailData.network_reachability.open_ports.join(", ")}</div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                <div className="grid grid-cols-2 gap-4">
                                  {/* Attached Instances & Security Groups */}
                                  <div className="rounded-lg p-4 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
                                    <h4 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
                                      <Server className="w-3.5 h-3.5" /> Attached Resources
                                    </h4>
                                    {detailData.network_reachability?.attached_instances?.length > 0 ? (
                                      <div className="space-y-1">
                                        {detailData.network_reachability.attached_instances.map((inst: any, i: number) => (
                                          <div key={i} className="text-xs font-mono flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
                                            <Server className="w-3 h-3" style={{ color: "#3b82f6" }} />
                                            {typeof inst === 'string' ? inst : inst.instance_id || inst.name || JSON.stringify(inst)}
                                          </div>
                                        ))}
                                      </div>
                                    ) : <p className="text-xs" style={{ color: "var(--text-muted)" }}>No attached instances</p>}

                                    {detailData.network_reachability?.security_groups?.length > 0 && (
                                      <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border-subtle)" }}>
                                        <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Security Groups</span>
                                        {detailData.network_reachability.security_groups.map((sg: any, i: number) => (
                                          <div key={i} className="text-xs font-mono flex items-center gap-1.5 mt-1" style={{ color: "var(--text-primary)" }}>
                                            <Shield className="w-3 h-3" style={{ color: "#f59e0b" }} />
                                            {typeof sg === 'string' ? sg : sg.group_id || sg.name || JSON.stringify(sg)}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  {/* Traffic Flows */}
                                  <div className="rounded-lg p-4 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
                                    <h4 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
                                      <ArrowRightLeft className="w-3.5 h-3.5" /> Observed Traffic
                                    </h4>
                                    {trafficLoading ? (
                                      <div className="flex items-center gap-2 py-4">
                                        <RefreshCw className="w-4 h-4 animate-spin" style={{ color: "#8b5cf6" }} />
                                        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Loading flows...</span>
                                      </div>
                                    ) : trafficData?.observed_ports?.ports?.length > 0 ? (
                                      <div className="space-y-2">
                                        <div className="flex items-center justify-between mb-2">
                                          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Active ports</span>
                                          <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{trafficData.observed_ports.totalPorts}</span>
                                        </div>
                                        {trafficData.observed_ports.ports.slice(0, 6).map((port: any, i: number) => (
                                          <div key={i} className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-1.5 font-mono" style={{ color: "var(--text-primary)" }}>
                                              <Wifi className="w-3 h-3" style={{ color: "#3b82f6" }} />
                                              :{typeof port === 'object' ? port.port : port}
                                              {typeof port === 'object' && port.protocol && <span style={{ color: "var(--text-muted)" }}>/{port.protocol}</span>}
                                            </div>
                                            {typeof port === 'object' && port.count && (
                                              <span style={{ color: "var(--text-secondary)" }}>{port.count} flows</span>
                                            )}
                                          </div>
                                        ))}
                                        {trafficData.observed_ports.ports.length > 6 && (
                                          <div className="text-xs" style={{ color: "var(--text-muted)" }}>+{trafficData.observed_ports.ports.length - 6} more ports</div>
                                        )}
                                      </div>
                                    ) : trafficData?.has_traffic_data === false ? (
                                      <p className="text-xs py-2" style={{ color: "var(--text-muted)" }}>No traffic data observed. VPC Flow Logs may not be enabled.</p>
                                    ) : (
                                      <p className="text-xs py-2" style={{ color: "var(--text-muted)" }}>No observed network traffic</p>
                                    )}
                                  </div>
                                </div>

                                {/* Network Recommendations */}
                                {detailData.network_reachability?.is_internet_reachable && (
                                  <div className="rounded-lg p-3 border" style={{ background: "#ef444408", borderColor: "#ef444430" }}>
                                    <div className="text-xs flex items-start gap-2" style={{ color: "#ef4444" }}>
                                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                      <span>This identity is attached to internet-reachable resources. Review security group rules and restrict inbound access to necessary ports only.</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* ===== BEHAVIORAL TAB ===== */}
                            {detailTab === 'behavioral' && (
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                  {/* Activity Pattern */}
                                  <div className="rounded-lg p-4 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
                                    <h4 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
                                      <Activity className="w-3.5 h-3.5" /> Activity Pattern
                                    </h4>
                                    {detailData.temporal_activity ? (
                                      <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Status</span>
                                          <span className="text-sm font-semibold" style={{
                                            color: detailData.temporal_activity.is_dormant ? "#ef4444" : "#22c55e"
                                          }}>{detailData.temporal_activity.is_dormant ? "Dormant" : "Active"}</span>
                                        </div>
                                        {detailData.temporal_activity.last_activity_date && (
                                          <div className="flex items-center justify-between">
                                            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Last Activity</span>
                                            <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                                              {detailData.temporal_activity.days_since_last_activity != null
                                                ? `${detailData.temporal_activity.days_since_last_activity}d ago`
                                                : detailData.temporal_activity.last_activity_date}
                                            </span>
                                          </div>
                                        )}
                                        {detailData.temporal_activity.total_events != null && (
                                          <div className="flex items-center justify-between">
                                            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Total Events (90d)</span>
                                            <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{detailData.temporal_activity.total_events.toLocaleString()}</span>
                                          </div>
                                        )}
                                        {/* Peak Hours Heatmap */}
                                        {detailData.temporal_activity.peak_hours?.length > 0 && (
                                          <div>
                                            <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Peak Hours (UTC)</span>
                                            <div className="flex gap-0.5 mt-1">
                                              {Array.from({ length: 24 }, (_, h) => {
                                                const isPeak = detailData.temporal_activity.peak_hours.includes(h)
                                                return (
                                                  <div key={h} className="flex-1 h-4 rounded-sm" title={`${h}:00 UTC`} style={{
                                                    background: isPeak ? "#8b5cf6" : "var(--bg-primary)",
                                                    opacity: isPeak ? 1 : 0.3,
                                                  }} />
                                                )
                                              })}
                                            </div>
                                            <div className="flex justify-between mt-0.5">
                                              <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>0h</span>
                                              <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>12h</span>
                                              <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>23h</span>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ) : <p className="text-xs" style={{ color: "var(--text-muted)" }}>No activity data available</p>}
                                  </div>

                                  {/* Blast Radius */}
                                  <div className="rounded-lg p-4 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
                                    <h4 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
                                      <Target className="w-3.5 h-3.5" /> Blast Radius
                                    </h4>
                                    {detailData.blast_radius ? (
                                      <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Accessible Resources</span>
                                          <span className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{detailData.blast_radius.accessible_resources}</span>
                                        </div>
                                        {detailData.blast_radius.resource_types && Object.entries(detailData.blast_radius.resource_types).length > 0 && (
                                          <div className="space-y-1.5">
                                            {Object.entries(detailData.blast_radius.resource_types).map(([type, count]) => (
                                              <div key={type} className="flex items-center justify-between">
                                                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{type}</span>
                                                <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{count as number}</span>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
                                          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Attack path:</span>
                                          {detailData.blast_radius.attack_path_hops != null && detailData.blast_radius.attack_path_hops >= 0 ? (
                                            <span className="text-xs font-medium" style={{ color: detailData.blast_radius.attack_path_hops <= 2 ? "#ef4444" : "#eab308" }}>
                                              {detailData.blast_radius.attack_path_hops} hops from internet
                                            </span>
                                          ) : (
                                            <span className="text-xs font-medium" style={{ color: "#22c55e" }}>No known attack path</span>
                                          )}
                                        </div>
                                      </div>
                                    ) : <p className="text-xs" style={{ color: "var(--text-muted)" }}>No blast radius data</p>}
                                  </div>
                                </div>

                                {/* Dormant Warning */}
                                {detailData.temporal_activity?.is_dormant && (
                                  <div className="rounded-lg p-3 border" style={{ background: "#ef444408", borderColor: "#ef444430" }}>
                                    <div className="text-xs flex items-start gap-2" style={{ color: "#ef4444" }}>
                                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                      <span>This identity is dormant — no API activity detected in the observation window. Consider disabling or deleting if no longer needed.</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                          </div>
                        </div>
                      ) : (
                        /* Fallback: basic expanded view if detail endpoint not available */
                        <div className="grid grid-cols-3 gap-6">
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
                              <Lock className="w-3 h-3" /> Trust Policy / Principals
                            </h4>
                            {nhi.trust_principals.length > 0 ? (
                              <div className="space-y-1">
                                {nhi.trust_principals.map((p, i) => (
                                  <div key={i} className="text-xs font-mono truncate" style={{ color: "var(--text-primary)" }}>{p}</div>
                                ))}
                              </div>
                            ) : <p className="text-xs" style={{ color: "var(--text-muted)" }}>No trust principals</p>}
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
                              <Server className="w-3 h-3" /> Attached Resources
                            </h4>
                            {nhi.attached_resources.length > 0 ? (
                              <div className="space-y-1">
                                {nhi.attached_resources.map((r, i) => (
                                  <div key={i} className="text-xs font-mono truncate" style={{ color: "var(--text-primary)" }}>{r}</div>
                                ))}
                              </div>
                            ) : <p className="text-xs" style={{ color: "var(--text-muted)" }}>No attached resources</p>}
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
                              <FileKey2 className="w-3 h-3" /> Policies
                            </h4>
                            {nhi.policies.length > 0 ? (
                              <div className="space-y-1">
                                {nhi.policies.map((p, i) => (
                                  <div key={i} className="text-xs font-mono truncate" style={{ color: "var(--text-primary)" }}>{p}</div>
                                ))}
                              </div>
                            ) : <p className="text-xs" style={{ color: "var(--text-muted)" }}>No policies</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selectedIdentity && (
        <IAMPermissionAnalysisModal
          isOpen={showPermissionModal}
          onClose={() => { setShowPermissionModal(false); setSelectedIdentity(null) }}
          roleName={selectedIdentity.roleName}
          systemName={selectedIdentity.systemName}
          onSuccess={() => { fetchNHIs() }}
          onRemediationSuccess={(roleName) => {
            fetchNHIs()
          }}
        />
      )}
    </div>
  )
}
