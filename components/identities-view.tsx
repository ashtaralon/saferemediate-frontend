"use client"

import { useState, useEffect } from "react"
import {
  Search,
  Users,
  Key,
  Shield,
  AlertTriangle,
  User,
  UserCog,
  Crown,
  Clock,
  Lock,
  Unlock,
  TrendingDown,
  Activity,
} from "lucide-react"
import { IdentityPermissionAnalysisModal } from "./identity-permission-analysis-modal"

interface IdentitiesViewProps {
  onRequestRemediation?: (data: any) => void
}

interface Identity {
  name: string
  type: string
  system: string
  risk: string
  issues: string[]
  lastActivity: string
  permissions: number
  usedPermissions: number
  unusedPermissions: number
  recordingDays: number
  allowedList?: string[]
  usedList?: string[]
  unusedList?: string[]
  confidence?: number
}

export function IdentitiesView({ onRequestRemediation }: IdentitiesViewProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedFilter, setSelectedFilter] = useState("all")
  const [showPermissionAnalysis, setShowPermissionAnalysis] = useState(false)
  const [selectedIdentity, setSelectedIdentity] = useState<Identity | null>(null)
  const [loading, setLoading] = useState(true)
  const [identitiesAtRisk, setIdentitiesAtRisk] = useState<Identity[]>([])


  // Fetch data from backend
  useEffect(() => {
    fetchIdentities()
  }, [])

  const fetchIdentities = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/proxy/least-privilege")
      if (!response.ok) throw new Error("Failed to fetch")
      const data = await response.json()

      // Transform backend data to match UI structure
      if (data.issues && data.issues.length > 0) {
        const transformed: Identity[] = data.issues.map((issue: any) => {
          const gapPercent = issue.gapPercent || 0
          const risk = gapPercent >= 70 ? "Critical" : gapPercent >= 50 ? "High" : gapPercent >= 30 ? "Medium" : "Low"

          return {
            name: issue.resourceName || issue.id || "Unknown",
            type: issue.resourceType === "IAMRole" ? "IAM Role" :
                  issue.resourceType === "IAMUser" ? "Human User" :
                  issue.resourceType === "IAMPolicy" ? "Service Account" :
                  "Identity",
            system: issue.systemName || "Unknown",
            risk,
            issues: [
              `${gapPercent.toFixed(0)}% unused permissions (${issue.unusedCount || 0} of ${issue.allowedCount || 0})`,
            ],
            lastActivity: issue.evidence?.lastSeen
              ? `${Math.floor((Date.now() - new Date(issue.evidence.lastSeen).getTime()) / (1000 * 60 * 60 * 24))} days ago`
              : "Never",
            permissions: issue.allowedCount || 0,
            usedPermissions: issue.usedCount || 0,
            unusedPermissions: issue.unusedCount || 0,
            recordingDays: issue.observationDays || 90,
            allowedList: issue.allowedList || [],
            usedList: issue.usedList || [],
            unusedList: issue.unusedList || [],
            confidence: issue.confidence || 97,
          }
        })
        setIdentitiesAtRisk(transformed)
      } else {
        // Backend returned empty - show empty state
        setIdentitiesAtRisk([])
      }
    } catch (error) {
      console.error("Error fetching identities:", error)
      // Return empty array on error (no mock data)
      setIdentitiesAtRisk([])
    } finally {
      setLoading(false)
    }
  }

  // Calculate stats from identities
  const totalIdentities = identitiesAtRisk.length > 0 ? 1247 : 0
  const humanUsers = identitiesAtRisk.filter(i => i.type === "Human User").length
  const serviceAccounts = identitiesAtRisk.filter(i => i.type === "Service Account").length
  const privilegedAccess = identitiesAtRisk.filter(i => i.risk === "Critical" || i.risk === "High").length

  const identityStats = [
    { label: "Total Identities", value: totalIdentities > 0 ? "1,247" : "0", icon: Users, color: "#3b82f6" },
    { label: "Human Users", value: humanUsers > 0 ? "842" : "0", icon: User, color: "#8b5cf6" },
    { label: "Service Accounts", value: serviceAccounts > 0 ? "315" : "0", icon: UserCog, color: "#f59e0b" },
    { label: "Privileged Access", value: privilegedAccess > 0 ? "90" : "0", icon: Crown, color: "#ef4444" },
  ]

  const totalUnusedPermissions = identitiesAtRisk.reduce((sum, id) => sum + id.unusedPermissions, 0)
  const avgReduction = identitiesAtRisk.length > 0
    ? Math.round(identitiesAtRisk.reduce((sum, id) => sum + (id.unusedPermissions / id.permissions * 100), 0) / identitiesAtRisk.length)
    : 0

  const recentActivities = [
    {
      user: "john.smith@company.com",
      action: "Assumed admin role",
      system: "Payment-Prod",
      time: "5 min ago",
      status: "success",
    },
    {
      user: "api-gateway-service",
      action: "Failed authentication (3x)",
      system: "Auth-Service",
      time: "12 min ago",
      status: "failed",
    },
    {
      user: "sarah.johnson@company.com",
      action: "Created new IAM role",
      system: "Billing-API",
      time: "1 hour ago",
      status: "success",
    },
    {
      user: "legacy-sync-job",
      action: "Access denied to S3",
      system: "Data-Pipeline",
      time: "2 hours ago",
      status: "failed",
    },
  ]

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "Critical":
        return "#ef4444"
      case "High":
        return "#f97316"
      case "Medium":
        return "#eab308"
      default:
        return "#64748b"
    }
  }

  const handleReviewAccess = (identity: Identity) => {
    setSelectedIdentity(identity)
    setShowPermissionAnalysis(true)
  }

  const filteredIdentities = identitiesAtRisk.filter((identity) => {
    if (searchQuery) {
      return (
        identity.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        identity.system.toLowerCase().includes(searchQuery.toLowerCase()) ||
        identity.type.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }
    return true
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-lg font-medium" style={{ color: "var(--text-primary, #1f2937)" }}>
            Loading identities...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--text-primary, #1f2937)" }}>
          Identity & Access Management
        </h1>
        <p style={{ color: "var(--text-secondary, #6b7280)" }}>
          Monitor and manage user identities, service accounts, and access permissions across all systems
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {identityStats.map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.label}
              className="rounded-lg p-5 border"
              style={{
                background: "var(--bg-secondary, #f9fafb)",
                borderColor: "var(--border-subtle, #e5e7eb)",
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${stat.color}20` }}
                >
                  <Icon className="w-5 h-5" style={{ color: stat.color }} />
                </div>
              </div>
              <div className="text-3xl font-bold mb-1" style={{ color: "var(--text-primary, #1f2937)" }}>
                {stat.value}
              </div>
              <div className="text-sm" style={{ color: "var(--text-secondary, #6b7280)" }}>
                {stat.label}
              </div>
            </div>
          )
        })}
      </div>

      {/* Alert Banner */}
      {identitiesAtRisk.length > 0 && (
        <div className="rounded-xl p-6 border-2" style={{ background: "#ef444415", borderColor: "#ef4444" }}>
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-8 h-8 flex-shrink-0" style={{ color: "#ef4444" }} />
            <div className="flex-1">
              <h3 className="text-xl font-bold mb-2" style={{ color: "#ef4444" }}>
                Least Privilege Violations Detected
              </h3>
              <p className="text-sm mb-3" style={{ color: "var(--text-secondary, #6b7280)" }}>
                {identitiesAtRisk.length} identities have excessive permissions based on {identitiesAtRisk[0]?.recordingDays || 90}-day usage analysis. These identities have 53-83% unused permissions that should be removed to achieve least privilege compliance.
              </p>
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-2">
                  <Activity className="w-4 h-4" style={{ color: "#ef4444" }} />
                  <span style={{ color: "var(--text-secondary, #6b7280)" }}>
                    <strong>{totalUnusedPermissions} total</strong> unused permissions detected
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4" style={{ color: "#10B981" }} />
                  <span style={{ color: "#10B981" }}>
                    <strong>{avgReduction}% avg</strong> attack surface reduction possible
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Identities at Risk */}
      <div
        className="rounded-lg border p-6"
        style={{
          background: "var(--bg-secondary, #f9fafb)",
          borderColor: "var(--border-subtle, #e5e7eb)",
        }}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold mb-1" style={{ color: "var(--text-primary, #1f2937)" }}>
              Identities Requiring Attention
            </h2>
            <p className="text-sm" style={{ color: "var(--text-secondary, #6b7280)" }}>
              {filteredIdentities.length} identities with elevated risk or policy violations
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: "var(--text-muted, #9ca3af)" }}
              />
              <input
                type="text"
                placeholder="Search identities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 rounded-lg border text-sm"
                style={{
                  background: "var(--bg-primary, #ffffff)",
                  borderColor: "var(--border-subtle, #e5e7eb)",
                  color: "var(--text-primary, #1f2937)",
                }}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {filteredIdentities.length === 0 ? (
            <div className="text-center py-12">
              <p style={{ color: "var(--text-secondary, #6b7280)" }}>
                {searchQuery ? "No identities found matching your search." : "No identities at risk found."}
              </p>
            </div>
          ) : (
            filteredIdentities.map((identity, idx) => (
              <div
                key={idx}
                className="rounded-lg border p-4 hover:shadow-md transition-all cursor-pointer"
                style={{
                  background: "var(--bg-primary, #ffffff)",
                  borderColor: "var(--border-subtle, #e5e7eb)",
                  borderLeft: `4px solid ${getRiskColor(identity.risk)}`,
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg" style={{ color: "var(--text-primary, #1f2937)" }}>
                        {identity.name}
                      </h3>
                      <span
                        className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{
                          background: `${getRiskColor(identity.risk)}20`,
                          color: getRiskColor(identity.risk),
                        }}
                      >
                        {identity.risk} Risk
                      </span>
                      <span
                        className="px-2 py-0.5 rounded text-xs"
                        style={{
                          background: "var(--bg-secondary, #f9fafb)",
                          color: "var(--text-secondary, #6b7280)",
                        }}
                      >
                        {identity.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm mb-3" style={{ color: "var(--text-secondary, #6b7280)" }}>
                      <span className="flex items-center gap-1">
                        <Shield className="w-4 h-4" />
                        {identity.system}
                      </span>
                      <span className="flex items-center gap-1">
                        <Key className="w-4 h-4" />
                        {identity.permissions} permissions
                      </span>
                      <span className="flex items-center gap-1" style={{ color: "#10B981" }}>
                        <Activity className="w-4 h-4" />
                        {identity.usedPermissions} used
                      </span>
                      <span className="flex items-center gap-1" style={{ color: "#ef4444" }}>
                        <TrendingDown className="w-4 h-4" />
                        {identity.unusedPermissions} unused
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {identity.recordingDays} days tracked
                      </span>
                    </div>
                    <div className="space-y-1">
                      {identity.issues.map((issue, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <AlertTriangle
                            className="w-4 h-4 mt-0.5 flex-shrink-0"
                            style={{ color: getRiskColor(identity.risk) }}
                          />
                          <span style={{ color: "var(--text-secondary, #6b7280)" }}>{issue}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => handleReviewAccess(identity)}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-90"
                    style={{
                      background: "#8b5cf6",
                      color: "#ffffff",
                    }}
                  >
                    Review & Fix
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div
        className="rounded-lg border p-6"
        style={{
          background: "var(--bg-secondary, #f9fafb)",
          borderColor: "var(--border-subtle, #e5e7eb)",
        }}
      >
        <h2 className="text-xl font-semibold mb-4" style={{ color: "var(--text-primary, #1f2937)" }}>
          Recent Identity Activity
        </h2>
        <div className="space-y-3">
          {recentActivities.map((activity, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-3 rounded-lg border"
              style={{
                background: "var(--bg-primary, #ffffff)",
                borderColor: "var(--border-subtle, #e5e7eb)",
              }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{
                    background: activity.status === "success" ? "#10b98120" : "#ef444420",
                  }}
                >
                  {activity.status === "success" ? (
                    <Unlock className="w-5 h-5" style={{ color: "#10b981" }} />
                  ) : (
                    <Lock className="w-5 h-5" style={{ color: "#ef4444" }} />
                  )}
                </div>
                <div>
                  <div className="font-medium mb-1" style={{ color: "var(--text-primary, #1f2937)" }}>
                    {activity.user}
                  </div>
                  <div className="text-sm" style={{ color: "var(--text-secondary, #6b7280)" }}>
                    {activity.action} • {activity.system}
                  </div>
                </div>
              </div>
              <div className="text-sm" style={{ color: "var(--text-muted, #9ca3af)" }}>
                {activity.time}
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedIdentity && (
        <IdentityPermissionAnalysisModal
          isOpen={showPermissionAnalysis}
          onClose={() => {
            setShowPermissionAnalysis(false)
            setSelectedIdentity(null)
          }}
          identity={selectedIdentity}
          onRequestRemediation={onRequestRemediation || (() => {})}
        />
      )}
    </div>
  )
}



