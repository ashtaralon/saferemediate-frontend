"use client"

import { useState, useEffect } from "react"
import {
  User,
  Search,
  Shield,
  Key,
  Activity,
  TrendingDown,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Lock,
  FileKey2,
  UserCheck,
  UserX,
  Globe,
} from "lucide-react"
import { IAMPermissionAnalysisModal } from "../iam-permission-analysis-modal"

interface HumanIdentity {
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

export function HumanIdentitiesTab({ onRequestRemediation }: { onRequestRemediation?: (data: any) => void }) {
  const [identities, setIdentities] = useState<HumanIdentity[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [riskFilter, setRiskFilter] = useState("all")
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [selectedIdentity, setSelectedIdentity] = useState<any>(null)
  const [showPermissionModal, setShowPermissionModal] = useState(false)

  useEffect(() => {
    fetchHumans()
  }, [])

  const fetchHumans = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/proxy/identities/human")
      if (!res.ok) throw new Error("Failed to fetch")
      const json = await res.json()
      setIdentities(Array.isArray(json) ? json : [])
    } catch (err) {
      console.error("Error fetching human identities:", err)
      setIdentities([])
    } finally {
      setLoading(false)
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

  const filtered = identities.filter((i) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!i.name.toLowerCase().includes(q) && !i.arn.toLowerCase().includes(q) && !(i.system_name || "").toLowerCase().includes(q)) return false
    }
    if (riskFilter !== "all" && i.risk_level.toLowerCase() !== riskFilter.toLowerCase()) return false
    return true
  })

  const handleReviewFix = (identity: HumanIdentity) => {
    setSelectedIdentity({ roleName: identity.name, systemName: identity.system_name || "" })
    setShowPermissionModal(true)
  }

  const totalHumans = identities.length
  const adminCount = identities.filter(i => i.is_admin).length
  const federatedCount = identities.filter(i => i.sub_type === "Federated User").length
  const inactiveCount = identities.filter(i => i.last_activity === "Never" || !i.last_activity).length

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 animate-spin mx-auto mb-3" style={{ color: "#8b5cf6" }} />
          <p style={{ color: "var(--text-secondary)" }}>Loading Human Identities...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg p-4 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-2 mb-2">
            <User className="w-5 h-5" style={{ color: "#8b5cf6" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Total Human</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{totalHumans}</div>
        </div>
        <div className="rounded-lg p-4 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5" style={{ color: "#ef4444" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Admin Users</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "#ef4444" }}>{adminCount}</div>
        </div>
        <div className="rounded-lg p-4 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Globe className="w-5 h-5" style={{ color: "#06b6d4" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Federated / SSO</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "#06b6d4" }}>{federatedCount}</div>
        </div>
        <div className="rounded-lg p-4 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-2 mb-2">
            <UserX className="w-5 h-5" style={{ color: "#f97316" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Inactive</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "#f97316" }}>{inactiveCount}</div>
        </div>
      </div>

      {/* Search */}
      <div className="rounded-lg border p-4" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} />
            <input
              type="text"
              placeholder="Search human identities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border text-sm"
              style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
            />
          </div>
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border text-sm"
            style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
          >
            <option value="all">All Risk Levels</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{filtered.length} results</span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
        <div
          className="grid grid-cols-[2fr_1fr_1fr_120px_120px_100px_100px] gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wider border-b"
          style={{ color: "var(--text-secondary)", borderColor: "var(--border-subtle)", background: "var(--bg-primary)" }}
        >
          <span>Identity</span>
          <span>Type</span>
          <span>System</span>
          <span className="text-center">Permissions</span>
          <span className="text-center">Unused</span>
          <span className="text-center">Risk</span>
          <span className="text-center">Action</span>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <User className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
            <p style={{ color: "var(--text-secondary)" }}>
              {searchQuery ? "No human identities match your search." : "No human identities found."}
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {filtered.map((identity) => {
              const isExpanded = expandedRow === identity.arn
              return (
                <div key={identity.arn}>
                  <div
                    className="grid grid-cols-[2fr_1fr_1fr_120px_120px_100px_100px] gap-2 px-4 py-3 items-center cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => setExpandedRow(isExpanded ? null : identity.arn)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isExpanded ? <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} /> : <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} />}
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#8b5cf620" }}>
                        <User className="w-4 h-4" style={{ color: "#8b5cf6" }} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate" style={{ color: "var(--text-primary)" }}>{identity.name}</div>
                        <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{identity.arn}</div>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium" style={{ background: "#8b5cf615", color: "#8b5cf6" }}>
                      {identity.sub_type}
                    </span>
                    <div className="text-sm truncate" style={{ color: "var(--text-secondary)" }}>{identity.system_name || "—"}</div>
                    <div className="text-center text-sm font-medium" style={{ color: "var(--text-primary)" }}>{identity.permissions_count}</div>
                    <div className="text-center text-sm font-medium" style={{ color: identity.unused_permissions_count > 0 ? "#ef4444" : "#22c55e" }}>{identity.unused_permissions_count}</div>
                    <div className="text-center">
                      <span className="px-2 py-0.5 rounded text-xs font-semibold" style={{ background: `${getRiskColor(identity.risk_level)}20`, color: getRiskColor(identity.risk_level) }}>
                        {identity.risk_level}
                      </span>
                    </div>
                    <div className="text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleReviewFix(identity) }}
                        className="px-3 py-1 rounded-lg text-xs font-medium text-white hover:opacity-90"
                        style={{ background: "#8b5cf6" }}
                      >
                        Review
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-6 py-4 border-t" style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)" }}>
                      <div className="grid grid-cols-3 gap-6">
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>Trust Principals</h4>
                          {identity.trust_principals.length > 0 ? identity.trust_principals.map((p, i) => (
                            <div key={i} className="text-xs font-mono truncate" style={{ color: "var(--text-primary)" }}>{p}</div>
                          )) : <p className="text-xs" style={{ color: "var(--text-muted)" }}>None</p>}
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>Policies</h4>
                          {identity.policies.length > 0 ? identity.policies.map((p, i) => (
                            <div key={i} className="text-xs font-mono truncate" style={{ color: "var(--text-primary)" }}>{p}</div>
                          )) : <p className="text-xs" style={{ color: "var(--text-muted)" }}>None</p>}
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>Details</h4>
                          <div className="space-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                            <div>Gap: {identity.gap_percentage.toFixed(1)}%</div>
                            <div>Observed: {identity.observation_days} days</div>
                            <div>Last Active: {identity.last_activity || "Unknown"}</div>
                            {identity.is_admin && <span className="inline-block px-2 py-0.5 rounded mt-1" style={{ background: "#ef444420", color: "#ef4444" }}>Admin</span>}
                          </div>
                        </div>
                      </div>
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
          onSuccess={() => { fetchHumans() }}
          onRemediationSuccess={() => { fetchHumans() }}
        />
      )}
    </div>
  )
}
