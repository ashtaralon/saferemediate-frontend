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
import { RefreshCw, Shield, TrendingDown, AlertOctagon } from "lucide-react"
import { PostureScoreCard } from "@/components/dashboard/posture-score-card"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"
const FETCH_TIMEOUT = 30000 // 30 second timeout (proxy routes use 28s, so client needs 30s+)

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

interface SecurityHubData {
  total: number
  critical: number
  high: number
  medium: number
  low: number
  byProduct: Record<string, number>
}

// Cache keys for localStorage
const CACHE_KEYS = {
  INFRASTRUCTURE: 'cyntro-infrastructure-cache',
  FINDINGS: 'cyntro-findings-cache',
  GAP_DATA: 'cyntro-gap-cache',
  SECURITY_HUB: 'cyntro-security-hub-cache',
  TIMESTAMP: 'cyntro-cache-timestamp',
}

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes - show cached data but refresh if older

// Load cached data immediately for instant UI (stale-while-revalidate)
function getCachedData<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const cached = localStorage.getItem(key)
    if (cached) {
      const parsed = JSON.parse(cached)
      console.log(`[page] Loaded ${key} from cache (instant)`)
      return parsed
    }
  } catch (e) {
    console.warn(`[page] Failed to parse cached ${key}:`, e)
  }
  return null
}

function setCachedData(key: string, data: any): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(data))
    localStorage.setItem(CACHE_KEYS.TIMESTAMP, Date.now().toString())
  } catch (e) {
    console.warn(`[page] Failed to cache ${key}:`, e)
  }
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
    confidence: 99,
    roleName: "Loading...",
  })
  const [securityHubData, setSecurityHubData] = useState<SecurityHubData>({
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    byProduct: {},
  })
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const fetchGapAnalysis = useCallback(() => {
    // Fetch from gap-analysis proxy which has real CloudTrail data
    fetchWithTimeout("/api/proxy/gap-analysis?systemName=alon-prod", {}, 30000)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((gapJson) => {
        // The proxy already transforms field names
        const allowed = gapJson.allowed_actions || gapJson.allowed_count || 0
        const used = gapJson.used_actions || gapJson.used_count || 0
        const unused = gapJson.unused_actions || gapJson.unused_count || (allowed - used)
        
        // Get confidence from response or calculate
        const confidence = gapJson.confidence?.score || gapJson.statistics?.confidence || 
          (allowed > 0 ? Math.min(99, Math.max(70, 100 - (unused / allowed) * 20)) : 0)
        
        // Get role name from response
        const roleName = gapJson.role_name || gapJson.roleName || "SafeRemediate-Lambda-Remediation-Role"
        
        console.log(`[Home] Gap Analysis: allowed=${allowed}, used=${used}, unused=${unused}, confidence=${confidence}`)
        
        const newGapData = {
          allowed: allowed,
          used: used,
          unused: unused,
          confidence: Math.round(confidence),
          roleName: roleName,
        }
        setGapData(newGapData)
        setCachedData(CACHE_KEYS.GAP_DATA, newGapData) // Cache for instant load
        setLastRefresh(new Date())
      })
      .catch((err) => {
        console.warn("Gap analysis fetch failed:", err)
        // Keep default values or set to zero
        setGapData({
          allowed: 0,
          used: 0,
          unused: 0,
          confidence: 0,
          roleName: "Error loading",
        })
      })
  }, [])

  const fetchSecurityHub = useCallback(() => {
    fetchWithTimeout("/api/proxy/security-hub?severity=CRITICAL,HIGH,MEDIUM,LOW&days=30&max_results=200", {}, 30000)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        const summary = data.summary || {}
        const bySeverity = summary.by_severity || {}

        const newData: SecurityHubData = {
          total: summary.total || 0,
          critical: bySeverity.CRITICAL || 0,
          high: bySeverity.HIGH || 0,
          medium: bySeverity.MEDIUM || 0,
          low: bySeverity.LOW || 0,
          byProduct: summary.by_product || {},
        }

        console.log(`[Home] Security Hub: ${newData.total} findings (${newData.critical} critical, ${newData.high} high)`)
        setSecurityHubData(newData)
        setCachedData(CACHE_KEYS.SECURITY_HUB, newData)
      })
      .catch((err) => {
        console.warn("Security Hub fetch failed:", err)
        // Keep existing data on error
      })
  }, [])

  const loadData = useCallback(async (isBackgroundRefresh = false) => {
    // Only show loading spinner on initial load when no cached data exists
    if (!isBackgroundRefresh) {
      // Set timeout to prevent infinite loading
      const timeoutId = setTimeout(() => {
        console.warn("Data loading timeout - forcing loading to false")
        setLoading(false)
      }, 35000)

      // Will clear this in finally block
      ;(window as any).__loadingTimeoutId = timeoutId
    }

    try {
      const [infrastructureData, findings] = await Promise.allSettled([
        fetchInfrastructure(),
        fetchSecurityFindings(),
      ])

      // Handle infrastructure data
      if (infrastructureData.status === 'fulfilled') {
        setData(infrastructureData.value)
        setCachedData(CACHE_KEYS.INFRASTRUCTURE, infrastructureData.value) // Cache for instant load
        console.log("[page] Loaded and cached infrastructure data")
      } else {
        console.error("Infrastructure fetch failed:", infrastructureData.reason)
        // Keep existing data on error (don't wipe cache)
        if (!isBackgroundRefresh) setData(null)
      }

      // Handle findings - only use real data, no fallback
      if (findings.status === 'fulfilled' && findings.value && findings.value.length > 0) {
        setSecurityFindings(findings.value)
        setCachedData(CACHE_KEYS.FINDINGS, findings.value) // Cache for instant load
        console.log("[page] Loaded and cached", findings.value.length, "security findings")
      } else {
        console.log("[page] No findings returned from backend")
        if (!isBackgroundRefresh) setSecurityFindings([])
      }
    } catch (error) {
      console.error("Failed to load data:", error)
      // Keep existing data on error (don't wipe cache)
      if (!isBackgroundRefresh) {
        setData(null)
        setSecurityFindings([])
      }
    } finally {
      if ((window as any).__loadingTimeoutId) {
        clearTimeout((window as any).__loadingTimeoutId)
      }
      setLoading(false) // ALWAYS set to false
    }
  }, [])

  // Load from cache FIRST, then fetch fresh data - stale-while-revalidate
  useEffect(() => {
    let hasCache = false

    // Step 1: Try to load from cache immediately
    const cachedInfra = getCachedData<InfrastructureData>(CACHE_KEYS.INFRASTRUCTURE)
    const cachedFindings = getCachedData<SecurityFinding[]>(CACHE_KEYS.FINDINGS)
    const cachedGap = getCachedData<GapAnalysisData>(CACHE_KEYS.GAP_DATA)

    if (cachedInfra) {
      console.log("[page] Loaded infrastructure from cache (instant)")
      setData(cachedInfra)
      setLoading(false)
      hasCache = true
    }
    if (cachedFindings && cachedFindings.length > 0) {
      console.log("[page] Loaded", cachedFindings.length, "findings from cache (instant)")
      setSecurityFindings(cachedFindings)
    }
    if (cachedGap) {
      console.log("[page] Loaded gap data from cache (instant)")
      setGapData(cachedGap)
    }
    const cachedSecurityHub = getCachedData<SecurityHubData>(CACHE_KEYS.SECURITY_HUB)
    if (cachedSecurityHub) {
      console.log("[page] Loaded Security Hub data from cache (instant)")
      setSecurityHubData(cachedSecurityHub)
    }

    // Step 2: Fetch fresh data (background if cache exists, with spinner if not)
    loadData(hasCache)
    fetchGapAnalysis()
    fetchSecurityHub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount

  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      loadData(true) // Always background refresh for auto-refresh
      fetchGapAnalysis()
      fetchSecurityHub()
    }, 30000)

    return () => clearInterval(interval)
  }, [autoRefresh, loadData, fetchGapAnalysis, fetchSecurityHub])

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
        const gapAllowed = gapData?.allowed ?? 0
        const gapUsed = gapData?.used ?? 0
        const gapUnused = gapData?.unused ?? 0
        const gapConfidence = gapData?.confidence ?? 99
        const gapRoleName = gapData?.roleName ?? "IAM Roles"

        return (
          <div className="space-y-6">
            <div className="flex justify-end">
              <AutoRefreshToggle />
            </div>
            <HomeStatsBanner {...statsData} />
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-2">
                <InfrastructureOverview stats={infrastructureStats} />
              </div>
              <div className="lg:col-span-1">
                <PostureScoreCard systemName="Eltro" />
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
            {/* Security Hub Findings Card */}
            {securityHubData.total > 0 && (
              <Card className="bg-gradient-to-br from-red-50 to-orange-50 border-red-200">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold text-red-900 flex items-center gap-2">
                      <AlertOctagon className="h-5 w-5 text-red-600" />
                      Security Hub Findings
                    </CardTitle>
                    <span className="text-xs bg-red-600 text-white px-2 py-1 rounded-full font-medium">
                      {securityHubData.total} Active
                    </span>
                  </div>
                  <p className="text-xs text-red-600">
                    AWS Security Hub aggregated findings
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-white/60 rounded-lg p-3 text-center border-l-4 border-red-600">
                      <div className="text-2xl font-bold text-red-600">{securityHubData.critical}</div>
                      <div className="text-xs text-gray-600">Critical</div>
                    </div>
                    <div className="bg-white/60 rounded-lg p-3 text-center border-l-4 border-orange-500">
                      <div className="text-2xl font-bold text-orange-500">{securityHubData.high}</div>
                      <div className="text-xs text-gray-600">High</div>
                    </div>
                    <div className="bg-white/60 rounded-lg p-3 text-center border-l-4 border-amber-500">
                      <div className="text-2xl font-bold text-amber-500">{securityHubData.medium}</div>
                      <div className="text-xs text-gray-600">Medium</div>
                    </div>
                    <div className="bg-white/60 rounded-lg p-3 text-center border-l-4 border-blue-400">
                      <div className="text-2xl font-bold text-blue-500">{securityHubData.low}</div>
                      <div className="text-xs text-gray-600">Low</div>
                    </div>
                  </div>
                  {Object.keys(securityHubData.byProduct).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {Object.entries(securityHubData.byProduct).slice(0, 4).map(([product, count]) => (
                        <span key={product} className="text-xs bg-white/80 px-2 py-1 rounded-full text-gray-700">
                          {product}: {count}
                        </span>
                      ))}
                    </div>
                  )}
                  {(securityHubData.critical > 0 || securityHubData.high > 0) && (
                    <div className="mt-3 p-2 bg-red-100 rounded-lg text-center">
                      <span className="text-xs font-medium text-red-800">
                        {securityHubData.critical + securityHubData.high} findings need immediate attention
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
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
            <h1 className="text-4xl font-bold mb-4 text-gray-900">Welcome to CYNTRO</h1>
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
