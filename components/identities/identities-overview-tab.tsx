"use client"

import { useState, useEffect } from "react"
import {
  Bot,
  User,
  ExternalLink,
  Crown,
  Shield,
  AlertTriangle,
  TrendingDown,
  Key,
  Activity,
  RefreshCw,
} from "lucide-react"

interface OverviewData {
  total_identities: number
  nhi_count: number
  human_count: number
  third_party_count: number
  privileged_count: number
  critical_risk_count: number
  high_risk_count: number
  medium_risk_count: number
  low_risk_count: number
  total_permissions: number
  total_unused_permissions: number
  avg_gap_percentage: number
  admin_identities: number
  wildcard_identities: number
  cross_account_identities: number
  nhi_breakdown: Record<string, number>
  risk_distribution: Record<string, number>
}

interface IdentitiesOverviewTabProps {
  onTabChange?: (tab: string) => void
  systemName?: string
}

export function IdentitiesOverviewTab({ onTabChange, systemName }: IdentitiesOverviewTabProps) {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchOverview()
  }, [systemName])

  const matchesSystem = (identitySystemName: string | null | undefined) => {
    if (!systemName) return true
    return (identitySystemName || "").trim().toLowerCase() === systemName.trim().toLowerCase()
  }

  const fetchOverview = async () => {
    try {
      setLoading(true)
      if (!systemName) {
        const res = await fetch("/api/proxy/identities/overview")
        if (!res.ok) throw new Error("Failed to fetch overview")
        const json = await res.json()
        setData(json)
        return
      }

      const [nhiRes, humanRes, thirdPartyRes, privilegedRes] = await Promise.all([
        fetch("/api/proxy/identities/nhi"),
        fetch("/api/proxy/identities/human"),
        fetch("/api/proxy/identities/third-party"),
        fetch("/api/proxy/identities/privileged"),
      ])

      const [nhiRaw, humanRaw, thirdPartyRaw, privilegedRaw] = await Promise.all([
        nhiRes.ok ? nhiRes.json() : [],
        humanRes.ok ? humanRes.json() : [],
        thirdPartyRes.ok ? thirdPartyRes.json() : [],
        privilegedRes.ok ? privilegedRes.json() : [],
      ])

      const nhi = (Array.isArray(nhiRaw) ? nhiRaw : []).filter((i: any) => matchesSystem(i.system_name))
      const human = (Array.isArray(humanRaw) ? humanRaw : []).filter((i: any) => matchesSystem(i.system_name))
      const thirdParty = (Array.isArray(thirdPartyRaw) ? thirdPartyRaw : []).filter((i: any) => matchesSystem(i.system_name))
      const privileged = (Array.isArray(privilegedRaw) ? privilegedRaw : []).filter((i: any) => matchesSystem(i.system_name))

      const baseIdentities = [...nhi, ...human, ...thirdParty]
      const riskCounts = baseIdentities.reduce((acc: Record<string, number>, identity: any) => {
        const risk = String(identity.risk_level || "low").toLowerCase()
        acc[risk] = (acc[risk] || 0) + 1
        return acc
      }, {})

      const nhiBreakdown = nhi.reduce((acc: Record<string, number>, identity: any) => {
        const subType = identity.sub_type || "Other"
        acc[subType] = (acc[subType] || 0) + 1
        return acc
      }, {})

      const totalPermissions = baseIdentities.reduce((sum: number, identity: any) => sum + (identity.permissions_count || 0), 0)
      const totalUnusedPermissions = baseIdentities.reduce((sum: number, identity: any) => sum + (identity.unused_permissions_count || 0), 0)

      setData({
        total_identities: baseIdentities.length,
        nhi_count: nhi.length,
        human_count: human.length,
        third_party_count: thirdParty.length,
        privileged_count: privileged.length,
        critical_risk_count: riskCounts.critical || 0,
        high_risk_count: riskCounts.high || 0,
        medium_risk_count: riskCounts.medium || 0,
        low_risk_count: riskCounts.low || 0,
        total_permissions: totalPermissions,
        total_unused_permissions: totalUnusedPermissions,
        avg_gap_percentage: baseIdentities.length > 0
          ? baseIdentities.reduce((sum: number, identity: any) => sum + (identity.gap_percentage || 0), 0) / baseIdentities.length
          : 0,
        admin_identities: baseIdentities.filter((identity: any) => identity.is_admin).length,
        wildcard_identities: baseIdentities.filter((identity: any) => identity.has_wildcard).length,
        cross_account_identities: baseIdentities.filter((identity: any) => identity.is_cross_account).length,
        nhi_breakdown: nhiBreakdown,
        risk_distribution: riskCounts,
      })
    } catch (err) {
      console.error("Error fetching identity overview:", err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="w-10 h-10 animate-spin mx-auto mb-3" style={{ color: "#3b82f6" }} />
          <p style={{ color: "var(--text-secondary)" }}>Loading identity overview...</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-10 h-10 mx-auto mb-3" style={{ color: "#ef4444" }} />
        <p style={{ color: "var(--text-secondary)" }}>Failed to load identity data.</p>
        <button onClick={fetchOverview} className="mt-3 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: "#3b82f6" }}>
          Retry
        </button>
      </div>
    )
  }

  const statCards = [
    { label: "Total Identities", value: data.total_identities, icon: Key, color: "#3b82f6" },
    { label: "Non-Human (NHI)", value: data.nhi_count, icon: Bot, color: "#f59e0b", onClick: () => onTabChange?.("nhi") },
    { label: "Human Identities", value: data.human_count, icon: User, color: "#8b5cf6", onClick: () => onTabChange?.("human") },
    { label: "Third-Party", value: data.third_party_count, icon: ExternalLink, color: "#06b6d4", onClick: () => onTabChange?.("third-party") },
    { label: "Privileged Access", value: data.privileged_count, icon: Crown, color: "#ef4444", onClick: () => onTabChange?.("privileged") },
  ]

  const riskCards = [
    { label: "Critical", value: data.critical_risk_count, color: "#ef4444" },
    { label: "High", value: data.high_risk_count, color: "#f97316" },
    { label: "Medium", value: data.medium_risk_count, color: "#eab308" },
    { label: "Low", value: data.low_risk_count, color: "#22c55e" },
  ]

  const totalRisk = data.critical_risk_count + data.high_risk_count + data.medium_risk_count + data.low_risk_count || 1
  const unusedPct = data.total_permissions > 0 ? Math.round((data.total_unused_permissions / data.total_permissions) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Identity Type Cards */}
      <div className="grid grid-cols-5 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <button
              key={stat.label}
              onClick={stat.onClick}
              className="rounded-lg p-5 border text-left transition-all hover:shadow-md"
              style={{
                background: "var(--bg-secondary)",
                borderColor: "var(--border-subtle)",
                cursor: stat.onClick ? "pointer" : "default",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${stat.color}20` }}
                >
                  <Icon className="w-5 h-5" style={{ color: stat.color }} />
                </div>
              </div>
              <div className="text-3xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
                {stat.value.toLocaleString()}
              </div>
              <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {stat.label}
              </div>
            </button>
          )
        })}
      </div>

      {/* Alert Banner */}
      {(data.critical_risk_count > 0 || data.admin_identities > 0) && (
        <div className="rounded-xl p-5 border-2" style={{ background: "#ef444410", borderColor: "#ef4444" }}>
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-7 h-7 flex-shrink-0" style={{ color: "#ef4444" }} />
            <div className="flex-1">
              <h3 className="text-lg font-bold mb-1" style={{ color: "#ef4444" }}>
                Identity Risk Summary
              </h3>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {data.critical_risk_count} critical-risk identities detected.
                {data.admin_identities > 0 && ` ${data.admin_identities} identities have admin-level access.`}
                {data.wildcard_identities > 0 && ` ${data.wildcard_identities} use wildcard permissions.`}
                {data.cross_account_identities > 0 && ` ${data.cross_account_identities} cross-account roles found.`}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Risk Distribution */}
        <div
          className="rounded-lg border p-6"
          style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}
        >
          <h3 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Risk Distribution
          </h3>
          <div className="space-y-3">
            {riskCards.map((risk) => (
              <div key={risk.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium" style={{ color: risk.color }}>
                    {risk.label}
                  </span>
                  <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                    {risk.value}
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-primary)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(risk.value / totalRisk) * 100}%`,
                      background: risk.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Permission Stats */}
        <div
          className="rounded-lg border p-6"
          style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}
        >
          <h3 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Permission Posture
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Total Permissions</span>
              <span className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                {data.total_permissions.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm flex items-center gap-2" style={{ color: "#ef4444" }}>
                <TrendingDown className="w-4 h-4" /> Unused Permissions
              </span>
              <span className="text-xl font-bold" style={{ color: "#ef4444" }}>
                {data.total_unused_permissions.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Avg Gap %</span>
              <span className="text-xl font-bold" style={{ color: data.avg_gap_percentage > 50 ? "#ef4444" : "#eab308" }}>
                {data.avg_gap_percentage.toFixed(1)}%
              </span>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: "var(--bg-primary)" }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${100 - unusedPct}%`, background: "#10b981" }}
              />
            </div>
            <div className="flex justify-between text-xs" style={{ color: "var(--text-secondary)" }}>
              <span>{100 - unusedPct}% Used</span>
              <span>{unusedPct}% Unused</span>
            </div>
          </div>
        </div>
      </div>

      {/* NHI Breakdown */}
      {Object.keys(data.nhi_breakdown).length > 0 && (
        <div
          className="rounded-lg border p-6"
          style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}
        >
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <Bot className="w-5 h-5" style={{ color: "#f59e0b" }} />
            Non-Human Identity Breakdown
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(data.nhi_breakdown)
              .sort(([, a], [, b]) => b - a)
              .map(([type, count]) => (
                <div
                  key={type}
                  className="rounded-lg p-4 border"
                  style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)" }}
                >
                  <div className="text-2xl font-bold mb-1" style={{ color: "#f59e0b" }}>
                    {count}
                  </div>
                  <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    {type}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div
        className="rounded-lg border p-6"
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border-subtle)" }}
      >
        <h3 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
          Quick Actions
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => onTabChange?.("nhi")}
            className="rounded-lg p-4 border text-left transition-all hover:shadow-md hover:border-amber-500/40"
            style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)" }}
          >
            <Bot className="w-6 h-6 mb-2" style={{ color: "#f59e0b" }} />
            <div className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>Review NHIs</div>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {data.nhi_count} machine identities to audit
            </div>
          </button>
          <button
            onClick={() => onTabChange?.("privileged")}
            className="rounded-lg p-4 border text-left transition-all hover:shadow-md hover:border-red-500/40"
            style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)" }}
          >
            <Crown className="w-6 h-6 mb-2" style={{ color: "#ef4444" }} />
            <div className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>Audit Privileged</div>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {data.privileged_count} admin/wildcard identities
            </div>
          </button>
          <button
            onClick={() => onTabChange?.("third-party")}
            className="rounded-lg p-4 border text-left transition-all hover:shadow-md hover:border-cyan-500/40"
            style={{ background: "var(--bg-primary)", borderColor: "var(--border-subtle)" }}
          >
            <ExternalLink className="w-6 h-6 mb-2" style={{ color: "#06b6d4" }} />
            <div className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>Check External</div>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {data.third_party_count} cross-account roles
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
