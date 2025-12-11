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
import { demoSecurityFindings } from "@/lib/data"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { RefreshCw, Shield, TrendingDown } from "lucide-react"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"
const FETCH_TIMEOUT = 10000 // 10 second timeout

// Helper function to fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeout}ms`)
    }
    throw error
  }
}

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
    allowed: 28,
    used: 0,
    unused: 28,
    confidence: 99,
    roleName: "SafeRemediate-Lambda-Remediation-Role",
  })
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const fetchGapAnalysis = useCallback(() => {
    // Trigger traffic ingestion (non-blocking)
    fetchWithTimeout(`${BACKEND_URL}/api/traffic/ingest?days=365`).catch(() => {})

    // Fetch gap analysis via proxy route with timeout
    fetchWithTimeout("/api/proxy/gap-analysis?systemName=SafeRemediate-Lambda-Remediation-Role", {}, 5000)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((gapJson) => {
        const allowed = gapJson.allowed_actions ?? gapJson.statistics?.total_allowed ?? 28
        const used = gapJson.used_actions ?? gapJson.statistics?.total_used ?? 0
        const unused = gapJson.unused_actions ?? gapJson.statistics?.total_unused ?? 28

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
        setLastRefresh(new Date())
      })
      .catch((err) => {
        // Silent fail - use default values already set in state
        console.warn("Gap analysis fetch failed:", err)
      })
  }, [])

  const loadData = useCallback(async () => {
    // Set timeout to prevent infinite loading - matches proxy timeout (15s) + buffer
    const timeoutId = setTimeout(() => {
      console.warn("Data loading timeout - forcing loading to false")
      setLoading(false)
    }, 20000) // 20 seconds timeout to allow for slow backend

    try {
      const [infrastructureData, findings] = await Promise.allSettled([
        fetchInfrastructure(),
        fetchSecurityFindings(),
      ])
      
      clearTimeout(timeoutId)
      
      // Handle infrastructure data
      if (infrastructureData.status === 'fulfilled') {
        setData(infrastructureData.value)
      } else {
        console.error("Infrastructure fetch failed:", infrastructureData.reason)
        setData(null)
      }
      
      // Handle findings - use fallback if empty or failed
      if (findings.status === 'fulfilled' && findings.value && findings.value.length > 0) {
        setSecurityFindings(findings.value)
        console.log("[page] Loaded", findings.value.length, "security findings")
      } else {
        console.warn("[page] Using fallback findings - fetch result:", findings.status)
        setSecurityFindings(demoSecurityFindings)
      }
    } catch (error) {
      console.error("Failed to load data:", error)
      clearTimeout(timeoutId)
      setData(null)
      // Use fallback findings even on error
      setSecurityFindings(demoSecurityFindings)
    } finally {
      clearTimeout(timeoutId)
      setLoading(false) // ALWAYS set to false
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

  // Compute security stats from actual findings when backend returns zeros
  const computeStatsFromFindings = (findings: SecurityFinding[]) => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 }
    findings.forEach((f) => {
      const severity = f.severity?.toUpperCase()
      if (severity === "CRITICAL") counts.critical++
      else if (severity === "HIGH") counts.high++
      else if (severity === "MEDIUM") counts.medium++
      else if (severity === "LOW") counts.low++
    })
    return counts
  }

  const baseStatsData = data?.stats || {
    avgHealthScore: 0,
    healthScoreTrend: 0,
    needAttention: 0,
    totalIssues: 0,
    criticalIssues: 0,
    averageScore: 0,
    averageScoreTrend: 0,
    lastScanTime: "No scans yet",
  }

  // Ensure stats reflect actual findings count if backend returns zeros
  const computedFindingsStats = computeStatsFromFindings(securityFindings)
  const statsData = {
    ...baseStatsData,
    totalIssues: baseStatsData.totalIssues > 0 ? baseStatsData.totalIssues : securityFindings.length,
    criticalIssues: baseStatsData.criticalIssues > 0 ? baseStatsData.criticalIssues : computedFindingsStats.critical,
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

  const backendStats = data?.securityIssues || {
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

  // Use unified issues summary if available (most stable)
  const issuesSummary = data?.issuesSummary
  const hasUnifiedSummary = issuesSummary && issuesSummary.total > 0
  const hasBackendStats = backendStats.critical > 0 || backendStats.high > 0 || backendStats.medium > 0 || backendStats.low > 0

  const securityIssuesData = hasUnifiedSummary ? {
    critical: issuesSummary.by_severity?.critical || 0,
    high: issuesSummary.by_severity?.high || 0,
    medium: issuesSummary.by_severity?.medium || 0,
    low: issuesSummary.by_severity?.low || 0,
    totalIssues: issuesSummary.total,
    ...backendStats, // Keep other fields from backend
  } : (hasBackendStats ? backendStats : {
    ...backendStats,
    critical: computedFindingsStats.critical,
    high: computedFindingsStats.high,
    medium: computedFindingsStats.medium,
    low: computedFindingsStats.low,
    totalIssues: securityFindings.length,
  })

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
        const gapAllowed = gapData?.allowed ?? 28
        const gapUsed = gapData?.used ?? 0
        const gapUnused = gapData?.unused ?? 28
        const gapConfidence = gapData?.confidence ?? 99
        const gapRoleName = gapData?.roleName ?? "SafeRemediate-Lambda-Remediation-Role"

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
            {securityFindings.length > 0 && (
              <div className="bg-white rounded-lg p-6 border border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Security Findings Details</h2>
                <SecurityFindingsList findings={securityFindings} />
              </div>
            )}
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
              <SecurityFindingsList findings={securityFindings} />
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
