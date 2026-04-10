"use client"

import { useState, useEffect } from "react"
import {
  ExternalLink,
  Search,
  Shield,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Lock,
  Globe,
  Building2,
} from "lucide-react"
import { IAMPermissionAnalysisModal } from "../iam-permission-analysis-modal"

interface ThirdPartyIdentity {
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

export function ThirdPartyTab({ onRequestRemediation, systemName }: { onRequestRemediation?: (data: any) => void; systemName?: string }) {
  const [identities, setIdentities] = useState<ThirdPartyIdentity[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [selectedIdentity, setSelectedIdentity] = useState<any>(null)
  const [showPermissionModal, setShowPermissionModal] = useState(false)

  useEffect(() => {
    fetchThirdParty()
  }, [])

  const fetchThirdParty = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/proxy/identities/third-party")
      if (!res.ok) throw new Error("Failed to fetch")
      const json = await res.json()
      setIdentities(Array.isArray(json) ? json : [])
    } catch (err) {
      console.error("Error fetching third-party identities:", err)
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

  const scopedIdentities = systemName
    ? identities.filter((i) => (i.system_name || "").trim().toLowerCase() === systemName.trim().toLowerCase())
    : identities

  const filtered = scopedIdentities.filter((i) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return i.name.toLowerCase().includes(q) || i.arn.toLowerCase().includes(q) || (i.system_name || "").toLowerCase().includes(q)
  })

  const handleReviewFix = (identity: ThirdPartyIdentity) => {
    setSelectedIdentity({ roleName: identity.name, systemName: identity.system_name || "" })
    setShowPermissionModal(true)
  }

  // Extract unique external account IDs from trust principals
  const externalAccounts = new Set<string>()
  scopedIdentities.forEach(i => {
    i.trust_principals.forEach(p => {
      const match = p.match(/arn:aws:iam::(\d+):/)
      if (match) externalAccounts.add(match[1])
    })
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 animate-spin mx-auto mb-3" style={{ color: "#06b6d4" }} />
          <p style={{ color: "var(--text-secondary)" }}>Loading Third-Party Identities...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg p-4 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-2 mb-2">
            <ExternalLink className="w-5 h-5" style={{ color: "#06b6d4" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Cross-Account Roles</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{scopedIdentities.length}</div>
        </div>
        <div className="rounded-lg p-4 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-5 h-5" style={{ color: "#8b5cf6" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>External Accounts</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "#8b5cf6" }}>{externalAccounts.size}</div>
        </div>
        <div className="rounded-lg p-4 border" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5" style={{ color: "#ef4444" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Admin Cross-Account</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "#ef4444" }}>{scopedIdentities.filter(i => i.is_admin).length}</div>
        </div>
      </div>

      {/* Info Banner */}
      {scopedIdentities.length > 0 && (
        <div className="rounded-xl p-5 border-2" style={{ background: "#06b6d410", borderColor: "#06b6d4" }}>
          <div className="flex items-start gap-3">
            <Globe className="w-6 h-6 flex-shrink-0" style={{ color: "#06b6d4" }} />
            <div>
              <h3 className="font-semibold mb-1" style={{ color: "#06b6d4" }}>External Access Detected</h3>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {scopedIdentities.length} roles can be assumed by external AWS accounts or third-party services.
                Review these regularly to ensure only authorized access is maintained.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="rounded-lg border p-4" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} />
            <input
              type="text"
              placeholder="Search third-party identities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border text-sm"
              style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
            />
          </div>
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{filtered.length} results</span>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}>
        <div
          className="grid grid-cols-[2fr_1fr_1fr_120px_100px_100px] gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wider border-b"
          style={{ color: "var(--text-secondary)", borderColor: "var(--border-subtle)", background: "var(--bg-primary)" }}
        >
          <span>Identity</span>
          <span>External Principals</span>
          <span>System</span>
          <span className="text-center">Permissions</span>
          <span className="text-center">Risk</span>
          <span className="text-center">Action</span>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <ExternalLink className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--text-muted)" }} />
            <p style={{ color: "var(--text-secondary)" }}>No third-party or cross-account identities found.</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {filtered.map((identity) => {
              const isExpanded = expandedRow === identity.arn
              return (
                <div key={identity.arn}>
                  <div
                    className="grid grid-cols-[2fr_1fr_1fr_120px_100px_100px] gap-2 px-4 py-3 items-center cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => setExpandedRow(isExpanded ? null : identity.arn)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isExpanded ? <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} /> : <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} />}
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#06b6d420" }}>
                        <ExternalLink className="w-4 h-4" style={{ color: "#06b6d4" }} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate" style={{ color: "var(--text-primary)" }}>{identity.name}</div>
                        <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{identity.sub_type}</div>
                      </div>
                    </div>
                    <div className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                      {identity.trust_principals.length > 0 ? identity.trust_principals[0] : "—"}
                      {identity.trust_principals.length > 1 && ` +${identity.trust_principals.length - 1}`}
                    </div>
                    <div className="text-sm truncate" style={{ color: "var(--text-secondary)" }}>{identity.system_name || "—"}</div>
                    <div className="text-center text-sm font-medium" style={{ color: "var(--text-primary)" }}>{identity.permissions_count}</div>
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
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
                            <Lock className="w-3 h-3" /> External Trust Principals
                          </h4>
                          {identity.trust_principals.map((p, i) => (
                            <div key={i} className="text-xs font-mono mb-1 truncate" style={{ color: "var(--text-primary)" }}>{p}</div>
                          ))}
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>Details</h4>
                          <div className="space-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                            <div>Permissions: {identity.permissions_count} ({identity.unused_permissions_count} unused)</div>
                            <div>Gap: {identity.gap_percentage.toFixed(1)}%</div>
                            <div>Last Active: {identity.last_activity || "Unknown"}</div>
                            {identity.is_admin && <span className="inline-block px-2 py-0.5 rounded mt-1" style={{ background: "#ef444420", color: "#ef4444" }}>Admin</span>}
                            {identity.has_wildcard && <span className="inline-block px-2 py-0.5 rounded mt-1 ml-1" style={{ background: "#f9731620", color: "#f97316" }}>Wildcard</span>}
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
          onSuccess={() => { fetchThirdParty() }}
          onRemediationSuccess={() => { fetchThirdParty() }}
        />
      )}
    </div>
  )
}
