"use client"

import { useState, useEffect } from "react"
import {
  Crown,
  Search,
  Shield,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Lock,
  Asterisk,
  Bot,
  User,
  ExternalLink,
  Key,
  TrendingDown,
} from "lucide-react"
import { IAMPermissionAnalysisModal } from "../iam-permission-analysis-modal"

interface PrivilegedIdentity {
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

export function PrivilegedAccessTab({ onRequestRemediation }: { onRequestRemediation?: (data: any) => void }) {
  const [identities, setIdentities] = useState<PrivilegedIdentity[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [selectedIdentity, setSelectedIdentity] = useState<any>(null)
  const [showPermissionModal, setShowPermissionModal] = useState(false)

  useEffect(() => {
    fetchPrivileged()
  }, [])

  const fetchPrivileged = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/proxy/identities/privileged")
      if (!res.ok) throw new Error("Failed to fetch")
      const json = await res.json()
      setIdentities(Array.isArray(json) ? json : [])
    } catch (err) {
      console.error("Error fetching privileged identities:", err)
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

  const getTypeIcon = (identity: PrivilegedIdentity) => {
    if (identity.identity_type === "NHI") return Bot
    if (identity.identity_type === "ThirdParty") return ExternalLink
    return User
  }

  const getTypeColor = (identity: PrivilegedIdentity) => {
    if (identity.identity_type === "NHI") return "#f59e0b"
    if (identity.identity_type === "ThirdParty") return "#06b6d4"
    return "#8b5cf6"
  }

  const filtered = identities.filter((i) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!i.name.toLowerCase().includes(q) && !i.arn.toLowerCase().includes(q) && !(i.system_name || "").toLowerCase().includes(q)) return false
    }
    if (typeFilter === "admin" && !i.is_admin) return false
    if (typeFilter === "wildcard" && !i.has_wildcard) return false
    if (typeFilter === "nhi" && i.identity_type !== "NHI") return false
    if (typeFilter === "human" && i.identity_type !== "Human") return false
    return true
  })

  const handleReviewFix = (identity: PrivilegedIdentity) => {
    setSelectedIdentity({ roleName: identity.name, systemName: identity.system_name || "" })
    setShowPermissionModal(true)
  }

  const adminCount = identities.filter(i => i.is_admin).length
  const wildcardCount = identities.filter(i => i.has_wildcard).length
  const nhiPriv = identities.filter(i => i.identity_type === "NHI").length
  const totalUnused = identities.reduce((s, i) => s + i.unused_permissions_count, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 animate-spin mx-auto mb-3" style={{ color: "#ef4444" }} />
          <p style={{ color: "var(--text-secondary)" }}>Loading Privileged Identities...</p>
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
            <Crown className="w-5 h-5" style={{ color: "#ef4444" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Total Privileged</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{identities.length}</div>
        </div>
        <div className="rounded-lg p-4 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5" style={{ color: "#ef4444" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Admin Access</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "#ef4444" }}>{adminCount}</div>
        </div>
        <div className="rounded-lg p-4 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Asterisk className="w-5 h-5" style={{ color: "#f97316" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Wildcard Perms</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "#f97316" }}>{wildcardCount}</div>
        </div>
        <div className="rounded-lg p-4 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Bot className="w-5 h-5" style={{ color: "#f59e0b" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Privileged NHIs</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "#f59e0b" }}>{nhiPriv}</div>
        </div>
      </div>

      {/* Warning */}
      {identities.length > 0 && (
        <div className="rounded-xl p-5 border-2" style={{ background: "#ef444410", borderColor: "#ef4444" }}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 flex-shrink-0" style={{ color: "#ef4444" }} />
            <div>
              <h3 className="font-semibold mb-1" style={{ color: "#ef4444" }}>Privileged Access Alert</h3>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {identities.length} identities have admin-level or wildcard permissions.
                {nhiPriv > 0 && ` ${nhiPriv} are non-human (machine) identities — high-priority for review.`}
                {totalUnused > 0 && ` ${totalUnused.toLocaleString()} unused privileged permissions can be removed.`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-lg border p-4" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} />
            <input
              type="text"
              placeholder="Search privileged identities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border text-sm"
              style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border text-sm"
            style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
          >
            <option value="all">All Types</option>
            <option value="admin">Admin Only</option>
            <option value="wildcard">Wildcard Only</option>
            <option value="nhi">NHI Only</option>
            <option value="human">Human Only</option>
          </select>
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{filtered.length} results</span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
        <div
          className="grid grid-cols-[2fr_100px_1fr_120px_120px_120px_100px] gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wider border-b"
          style={{ color: "var(--text-secondary)", borderColor: "var(--border-subtle)", background: "var(--bg-primary)" }}
        >
          <span>Identity</span>
          <span>Category</span>
          <span>System</span>
          <span className="text-center">Permissions</span>
          <span className="text-center">Unused</span>
          <span className="text-center">Flags</span>
          <span className="text-center">Action</span>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <Crown className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
            <p style={{ color: "var(--text-secondary)" }}>No privileged identities found.</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {filtered.map((identity) => {
              const Icon = getTypeIcon(identity)
              const typeColor = getTypeColor(identity)
              const isExpanded = expandedRow === identity.arn

              return (
                <div key={identity.arn}>
                  <div
                    className="grid grid-cols-[2fr_100px_1fr_120px_120px_120px_100px] gap-2 px-4 py-3 items-center cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => setExpandedRow(isExpanded ? null : identity.arn)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isExpanded ? <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} /> : <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} />}
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${typeColor}20` }}>
                        <Icon className="w-4 h-4" style={{ color: typeColor }} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate" style={{ color: "var(--text-primary)" }}>{identity.name}</div>
                        <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{identity.sub_type}</div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-xs font-medium text-center" style={{ background: `${typeColor}15`, color: typeColor }}>
                      {identity.identity_type}
                    </span>
                    <div className="text-sm truncate" style={{ color: "var(--text-secondary)" }}>{identity.system_name || "—"}</div>
                    <div className="text-center text-sm font-medium" style={{ color: "var(--text-primary)" }}>{identity.permissions_count}</div>
                    <div className="text-center text-sm font-medium" style={{ color: identity.unused_permissions_count > 0 ? "#ef4444" : "#22c55e" }}>{identity.unused_permissions_count}</div>
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      {identity.is_admin && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: "#ef444420", color: "#ef4444" }}>ADMIN</span>
                      )}
                      {identity.has_wildcard && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: "#f9731620", color: "#f97316" }}>*</span>
                      )}
                    </div>
                    <div className="text-center">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleReviewFix(identity) }}
                        className="px-3 py-1 rounded-lg text-xs font-medium text-white hover:opacity-90"
                        style={{ background: "#ef4444" }}
                      >
                        Audit
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
                          <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>Risk Details</h4>
                          <div className="space-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                            <div>Gap: {identity.gap_percentage.toFixed(1)}%</div>
                            <div>Observed: {identity.observation_days} days</div>
                            <div>Confidence: {identity.confidence}%</div>
                            <div>Last Active: {identity.last_activity || "Unknown"}</div>
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
          onSuccess={() => { fetchPrivileged() }}
          onRemediationSuccess={() => { fetchPrivileged() }}
        />
      )}
    </div>
  )
}
