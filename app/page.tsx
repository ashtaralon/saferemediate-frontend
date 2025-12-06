"use client"

import { useState, useEffect, useCallback } from "react"
import { LeftSidebarNav } from "@/components/left-sidebar-nav"
import { HomeStatsBanner } from "@/components/home-stats-banner"
import { InfrastructureOverview } from "@/components/infrastructure-overview"
import { SecurityIssuesOverview } from "@/components/security-issues-overview"
import { ComplianceCards } from "@/components/compliance-cards"
import { TrendsActivity } from "@/components/trends-activity"
import { SystemsView } from "@/components/systems-view"
import { IssuesSection } from "@/components/issues-section"
import { IntegrationsSection } from "@/components/integrations-section"
import { IdentitiesSection } from "@/components/identities-section"
import { AutomationSection } from "@/components/automation-section"
import { EmptyState } from "@/components/empty-state"
import { SecurityFindingsList } from "@/components/issues/security-findings-list"
import { SystemDetailDashboard } from "@/components/system-detail-dashboard"
import { fetchInfrastructure, fetchSecurityFindings, type InfrastructureData } from "@/lib/api-client"
import type { SecurityFinding } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { RefreshCw, Shield, TrendingDown } from "lucide-react"

const BACKEND_URL = "https://saferemediate-backend.onrender.com"

interface GapAnalysisData {
  allowed: number
  used: number
  unused: number
  confidence: number
  roleName: string
}

export default function HomePage() {
  const [activeSection, setActiveSection] = useState("home")
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null)
  const [data, setData] = useState<InfrastructureData | null>(null)
  const [securityFindings, setSecurityFindings] = useState<SecurityFinding[]>([])
  const [loading, setLoading] = useState(true)
  const [gapData, setGapData] = useState<GapAnalysisData>({
    allowed: 0,
    used: 0,
    unused: 0,
    confidence: 0,
    roleName: "Loading...",
  })
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const fetchGapAnalysis = useCallback(() => {
    fetch(`${BACKEND_URL}/api/traffic/ingest?days=7`).catch(() => {})

    fetch(`${BACKEND_URL}/api/traffic/gap/SafeRemediate-Lambda-Remediation-Role`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((gapJson) => {
        const allowed = gapJson.allowed_actions ?? gapJson.statistics?.total_allowed ?? 0
        const used = gapJson.used_actions ?? gapJson.statistics?.total_used ?? 0
        const unused = gapJson.unused_actions ?? gapJson.statistics?.total_unused ?? 0

        let confidence = 99
        const remPotential = gapJson.statistics?.remediation_potential
        const confValue = gapJson.statistics?.confidence
        if (remPotential) {
          confidence = Number.parseInt(String(remPotential).replace("%", ""), 10) || 99
        } else if (confValue) {
          confidence = Number.parseInt(String(confValue).replace("%", ""), 10) || 99
        }

        setGapData({
          allowed: Number(allowed),
          used: Number(used),
          unused: Number(unused),
          confidence: Number(confidence),
          roleName: gapJson.role_name || "SafeRemediate-Lambda-Remediation-Role",
        })

        // If findings are empty, populate from gap analysis (unused permissions)
        setSecurityFindings((prevFindings) => {
          if (prevFindings.length === 0 && unused > 0) {
            const unusedActions = gapJson.unused_actions_list || []
            return unusedActions.map((permission: string, index: number): SecurityFinding => ({
              id: `gap-${index}-${permission}`,
              title: `Unused IAM Permission: ${permission}`,
              severity: "HIGH",
              description: `This IAM permission has not been used in the last 7 days and increases the attack surface. Safe to remove with ${confidence}% confidence.`,
              resource: "SafeRemediate-Lambda-Remediation-Role",
              resourceType: "IAM Role",
              status: "open",
              category: "Least Privilege",
              discoveredAt: new Date().toISOString(),
              remediation: `Remove the unused permission "${permission}" from the IAM role to reduce the attack surface and follow least privilege principles.`,
            }))
          }
          return prevFindings
        })

        setLastRefresh(new Date())
      })
      .catch(() => {
        // Silent fail - use default values already set in state
      })
  }, [])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      // Load sequentially - wait for each to complete before starting the next
      console.log("[PAGE] Starting to load infrastructure data...")
      const infrastructureData = await fetchInfrastructure()
      setData(infrastructureData)
      console.log("[PAGE] Infrastructure loaded, now loading security findings...")
      
      // Wait for security findings (this takes 30-40 seconds)
      const findings = await fetchSecurityFindings()
      setSecurityFindings(findings)
      console.log("[PAGE] ✅ All data loaded successfully")
    } catch (error) {
      console.error("Failed to load data:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    fetchGapAnalysis()
  }, [loadData, fetchGapAnalysis])

  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      loadData()
      fetchGapAnalysis()
    }, 30000)

    return () => clearInterval(interval)
  }, [autoRefresh, loadData, fetchGapAnalysis])

  const statsData = data?.stats || {
    avgHealthScore: 0,
    healthScoreTrend: 0,
    needAttention: 0,
    totalIssues: 0,
    criticalIssues: 0,
    averageScore: 0,
    averageScoreTrend: 0,
    lastScanTime: "No scans yet",
  }

  const infrastructureStats = data?.infrastructure || {
    containerClusters: 0,
    kubernetesWorkloads: 0,
    standaloneVMs: 0,
    vmScalingGroups: 0,
    relationalDatabases: 0,
    blockStorage: 0,
    fileStorage: 0,
    objectStorage: 0,
  }

  const securityIssuesData = data?.securityIssues || {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    totalIssues: 0,
    todayChange: 0,
    cveCount: 0,
    threatsCount: 0,
    zeroDayCount: 0,
    secretsCount: 0,
    complianceCount: 0,
  }

  const complianceSystems = data?.complianceSystems || []

  const handleSystemSelect = (systemName: string) => {
    setSelectedSystem(systemName)
  }

  const handleBackFromSystem = () => {
    setSelectedSystem(null)
  }

  if (selectedSystem) {
    return <SystemDetailDashboard systemName={selectedSystem} onBack={handleBackFromSystem} />
  }

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <LeftSidebarNav activeItem={activeSection} onItemClick={setActiveSection} issuesCount={0} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2D51DA] mx-auto mb-4"></div>
            <p className="text-gray-600">Loading infrastructure data...</p>
          </div>
        </div>
      </div>
    )
  }

  const AutoRefreshToggle = () => (
    <div className="flex items-center gap-3 bg-white rounded-lg px-4 py-2 border border-gray-200 shadow-sm">
      <RefreshCw className={`h-4 w-4 text-gray-500 ${autoRefresh ? "animate-spin" : ""}`} />
      <span className="text-sm text-gray-600">Auto-refresh</span>
      <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
      <span className="text-xs text-gray-400">Updated {lastRefresh.toLocaleTimeString()}</span>
    </div>
  )

  const renderContent = () => {
    switch (activeSection) {
      case "home":
        const gapAllowed = gapData?.allowed ?? 0
        const gapUsed = gapData?.used ?? 0
        const gapUnused = gapData?.unused ?? 0
        const gapConfidence = gapData?.confidence ?? 0
        const gapRoleName = gapData?.roleName ?? "Loading..."

        return (
          <div className="space-y-6">
            <div className="flex justify-end">
              <AutoRefreshToggle />
            </div>
            <HomeStatsBanner {...statsData} />
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-3">
                <InfrastructureOverview stats={infrastructureStats} />
              </div>
              <div className="lg:col-span-1">
                <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg font-semibold text-indigo-900 flex items-center gap-2">
                        <Shield className="h-5 w-5 text-indigo-600" />
                        Gap Analysis
                      </CardTitle>
                      <span className="text-xs bg-indigo-600 text-white px-2 py-1 rounded-full font-medium">LIVE</span>
                    </div>
                    <p className="text-xs text-indigo-600 truncate" title={gapRoleName}>
                      {gapRoleName}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/60 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-gray-900">{gapAllowed}</div>
                        <div className="text-xs text-gray-600">Allowed</div>
                      </div>
                      <div className="bg-white/60 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-green-600">{gapUsed}</div>
                        <div className="text-xs text-gray-600">Used</div>
                      </div>
                      <div className="bg-white/60 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-red-600">{gapUnused}</div>
                        <div className="text-xs text-gray-600 flex items-center justify-center gap-1">
                          <TrendingDown className="h-3 w-3" />
                          Unused
                        </div>
                      </div>
                      <div className="bg-white/60 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-indigo-600">{gapConfidence}%</div>
                        <div className="text-xs text-gray-600">Confidence</div>
                      </div>
                    </div>
                    {gapUnused > 0 && gapAllowed > 0 && (
                      <div className="mt-3 p-2 bg-amber-100 rounded-lg text-center">
                        <span className="text-xs font-medium text-amber-800">
                          {Math.round((gapUnused / gapAllowed) * 100)}% permissions can be removed
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
            <SecurityIssuesOverview {...securityIssuesData} />
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Security Findings Details</h2>
              {securityFindings.length > 0 ? (
                <SecurityFindingsList findings={securityFindings} />
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No security findings found.</p>
                  <p className="text-sm mt-2">Check backend connection or run a security scan.</p>
                </div>
              )}
            </div>
            <ComplianceCards systems={complianceSystems} />
            <TrendsActivity />
          </div>
        )
      case "issues":
        return (
          <div className="space-y-6">
            <IssuesSection
              systemsAtRisk={[]}
              stats={{
                critical: securityIssuesData.critical,
                high: securityIssuesData.high,
                medium: securityIssuesData.medium,
                low: securityIssuesData.low,
              }}
              totalCritical={securityIssuesData.critical}
              missionCriticalCount={0}
            />
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">All Security Findings</h2>
              {securityFindings.length > 0 ? (
                <SecurityFindingsList findings={securityFindings} />
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No security findings found.</p>
                  <p className="text-sm mt-2">Check backend connection or run a security scan.</p>
                </div>
              )}
            </div>
          </div>
        )
      case "systems":
        return <SystemsView systems={[]} onSystemSelect={handleSystemSelect} />
      case "compliance":
        return (
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <EmptyState
              icon="shield"
              title="Compliance Dashboard Coming Soon"
              description="Track your compliance status across SOC 2, PCI DSS, ISO 27001, and GDPR frameworks."
            />
          </div>
        )
      case "identities":
        return <IdentitiesSection />
      case "automation":
        return <AutomationSection />
      case "integrations":
        return <IntegrationsSection />
      default:
        return (
          <div>
            <h1 className="text-4xl font-bold mb-4 text-gray-900">Welcome to ImpactIQ</h1>
          </div>
        )
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <LeftSidebarNav activeItem={activeSection} onItemClick={setActiveSection} issuesCount={statsData.totalIssues} />
      <div className="flex-1 p-8">{renderContent()}</div>
    </div>
  )
}
