"use client"

import { useState, useEffect, useCallback } from "react"
import { ErrorBoundary } from "@/components/ui/error-boundary"
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
import { PerResourceAnalysis } from "@/components/per-resource-analysis"
import { VulnerabilitiesSection } from "@/components/vulnerabilities-section"
import { BehavioralVulnerabilitiesView } from "@/components/behavioral-vulnerabilities/behavioral-vulnerabilities-view"
import LeastPrivilegeTab from "@/components/LeastPrivilegeTab"
import { IdentityAttackPaths } from "@/components/identity-attack-paths/identity-attack-paths"
import { EmptyState } from "@/components/empty-state"
import { SecurityFindingsList } from "@/components/issues/security-findings-list"
import { SystemDetailDashboard } from "@/components/system-detail-dashboard"
import { fetchInfrastructure, fetchSecurityFindings, type InfrastructureData } from "@/lib/api-client"
import type { SecurityFinding } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Activity, AlertOctagon, ArrowUpRight, RefreshCw, Shield, Sparkles, TrendingDown } from "lucide-react"
import { PostureScoreCard } from "@/components/dashboard/posture-score-card"
import { MicroEnforcementScore } from "@/components/dashboard/micro-enforcement-score"

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
  const [showSimulator, setShowSimulator] = useState(false)
  const [isSimulating, setIsSimulating] = useState(false)
  const [simSource, setSimSource] = useState("SafeRemediate-Test-App-1")
  const [simTarget, setSimTarget] = useState("cyntro-demo-prod-data-745783559495")
  const [simDays, setSimDays] = useState(420)
  const [simEventsPerDay, setSimEventsPerDay] = useState(3)

  const fetchGapAnalysis = useCallback(() => {
    // Fetch from issues-summary which has aggregated permission data from all roles
    fetchWithTimeout("/api/proxy/issues-summary?systemName=alon-prod", {}, 30000)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((summaryJson) => {
        // Use aggregate permission data from issues summary
        const permissions = summaryJson.byCategory?.permissions || {}
        const allowed = permissions.allowed || 0
        const used = permissions.used || 0
        const unused = permissions.unused || (allowed - used)

        // Calculate confidence based on gap percentage
        const gapPct = permissions.gap_percentage || 0
        const confidence = allowed > 0 ? Math.min(99, Math.max(70, 100 - gapPct * 0.2)) : 0

        // Show aggregate label
        const roleName = `${summaryJson.resources?.iam_roles || 0} IAM Roles Analyzed`

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
  const totalTrackedResources =
    data?.resources?.length ||
    Object.values(infrastructureStats).reduce((sum, count) => sum + Number(count || 0), 0)
  const urgentIssueCount = (securityIssuesData.critical || 0) + (securityIssuesData.high || 0)
  const removableGapPercent = gapData.allowed > 0 ? Math.round((gapData.unused / gapData.allowed) * 100) : 0
  const lastRefreshLabel = lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  const securityHubHighlights = Object.entries(securityHubData.byProduct).slice(0, 3)

  const handleSystemSelect = (systemName: string) => {
    setSelectedSystem(systemName)
  }

  const handleBackFromSystem = () => {
    setSelectedSystem(null)
  }

  if (selectedSystem) {
    return (
      <ErrorBoundary componentName="System Dashboard">
        <SystemDetailDashboard systemName={selectedSystem} onBack={handleBackFromSystem} />
      </ErrorBoundary>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <LeftSidebarNav activeItem={activeSection} onItemClick={setActiveSection} issuesCount={0} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2D51DA] mx-auto mb-4"></div>
            <p className="text-[var(--muted-foreground,#4b5563)]">Loading infrastructure data...</p>
          </div>
        </div>
      </div>
    )
  }

  // Demo scenarios for traffic simulation
  const DEMO_SCENARIOS = [
    { name: "EC2 → S3 (Prod)", source: "SafeRemediate-Test-App-1", target: "cyntro-demo-prod-data-745783559495", days: 420, eventsPerDay: 3 },
    { name: "EC2 → Analytics", source: "SafeRemediate-Test-App-1", target: "cyntro-demo-analytics-745783559495", days: 180, eventsPerDay: 10 },
    { name: "Lambda → Analytics", source: "analytics-lambda", target: "cyntro-demo-analytics-745783559495", days: 90, eventsPerDay: 25 },
  ]

  const simulateTraffic = async () => {
    setIsSimulating(true)
    try {
      const params = new URLSearchParams({
        source: simSource,
        target: simTarget,
        days: simDays.toString(),
        events_per_day: simEventsPerDay.toString(),
        operations: "s3:GetObject,s3:PutObject,s3:GetObjectTagging,s3:ListBucket,s3:DeleteObject,s3:HeadObject"
      })

      const response = await fetch(`/api/proxy/debug/simulate-traffic?${params}`, { method: 'POST' })
      const data = await response.json()

      if (data.success) {
        alert(`Traffic Simulated!\n\n${data.message}\n\nTotal: ${data.details.total_events} events over ${data.details.days} days`)
        setShowSimulator(false)
      } else {
        alert(`Error: ${data.detail || 'Unknown error'}`)
      }
    } catch (error) {
      alert(`Error: ${error}`)
    } finally {
      setIsSimulating(false)
    }
  }

  const AutoRefreshToggle = () => (
    <div className="flex items-center gap-3 bg-white rounded-lg px-4 py-2 border border-[var(--border,#e5e7eb)] shadow-sm">
      <RefreshCw className={`h-4 w-4 text-[var(--muted-foreground,#6b7280)] ${autoRefresh ? "animate-spin" : ""}`} />
      <span className="text-sm text-[var(--muted-foreground,#4b5563)]">Auto-refresh</span>
      <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
      <span className="text-xs text-[var(--muted-foreground,#9ca3af)]">Updated {lastRefresh.toLocaleTimeString()}</span>
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
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#2D51DA]/15 bg-[#2D51DA]/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#2D51DA]">
                  <Sparkles className="h-3.5 w-3.5" />
                  Main Dashboard
                </div>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--foreground,#111827)] xl:text-3xl">
                  Cloud security command center
                </h1>
                <p className="mt-2 text-sm text-[var(--muted-foreground,#6b7280)]">
                  Live view of enforcement, findings pressure, and the systems that need attention first.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setShowSimulator(true)}
                  className="flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Simulate Traffic
                </button>
                <AutoRefreshToggle />
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              <div className="xl:col-span-8">
                <HomeStatsBanner
                  {...statsData}
                  resourceCount={totalTrackedResources}
                  urgentFindings={urgentIssueCount}
                  lastRefreshLabel={lastRefreshLabel}
                />
              </div>
              <div className="xl:col-span-4">
                <Card className="h-full overflow-hidden rounded-[28px] border-[#dbe4ff] bg-[linear-gradient(180deg,#ffffff_0%,#f8faff_100%)] shadow-[0_25px_70px_-45px_rgba(37,99,235,0.35)]">
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg font-semibold text-[var(--foreground,#111827)] flex items-center gap-2">
                          <Activity className="h-5 w-5 text-[#2D51DA]" />
                          Operations Pulse
                        </CardTitle>
                        <p className="mt-2 text-sm text-[var(--muted-foreground,#6b7280)]">
                          Focus the team on the hottest signals across the environment.
                        </p>
                      </div>
                      <span className="rounded-full bg-[#2D51DA]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#2D51DA]">
                        Live
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-[#fecaca] bg-[#fff1f2] p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-[#b91c1c]">Urgent Issues</div>
                        <div className="mt-2 text-3xl font-bold text-[#111827]">{urgentIssueCount}</div>
                        <p className="mt-2 text-xs text-[#7f1d1d]">Critical and high findings needing fast triage</p>
                      </div>
                      <div className="rounded-2xl border border-[#ddd6fe] bg-[#f5f3ff] p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-[#6d28d9]">Access Gap</div>
                        <div className="mt-2 text-3xl font-bold text-[#111827]">{removableGapPercent}%</div>
                        <p className="mt-2 text-xs text-[#5b21b6]">Of granted permissions appear removable</p>
                      </div>
                      <div className="rounded-2xl border border-[#bfdbfe] bg-[#eff6ff] p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-[#1d4ed8]">Telemetry</div>
                        <div className="mt-2 text-3xl font-bold text-[#111827]">{totalTrackedResources}</div>
                        <p className="mt-2 text-xs text-[#1e40af]">Tracked resources contributing to the dashboard</p>
                      </div>
                      <div className="rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-[#b45309]">Coverage</div>
                        <div className="mt-2 text-3xl font-bold text-[#111827]">{complianceSystems.length}</div>
                        <p className="mt-2 text-xs text-[#92400e]">Systems represented in compliance coverage</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted-foreground,#6b7280)]">Refresh State</div>
                          <div className="mt-1 text-sm font-medium text-[var(--foreground,#111827)]">Updated {lastRefreshLabel}</div>
                        </div>
                        <button
                          onClick={() => setActiveSection("issues")}
                          className="inline-flex items-center gap-1 text-sm font-medium text-[#2D51DA] hover:underline"
                        >
                          Review issues
                          <ArrowUpRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              <div className="xl:col-span-8">
                <MicroEnforcementScore systemName={selectedSystem || "alon-prod"} />
              </div>
              <div className="xl:col-span-4 space-y-6">
                <Card className="rounded-[24px] border-[#8b5cf640] bg-gradient-to-br from-indigo-50 to-purple-50 shadow-[0_20px_60px_-40px_rgba(139,92,246,0.45)]">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg font-semibold text-[#8b5cf6] flex items-center gap-2">
                        <Shield className="h-5 w-5 text-[#8b5cf6]" />
                        Gap Analysis
                      </CardTitle>
                      <span className="text-xs bg-[#8b5cf6] text-white px-2 py-1 rounded-full font-medium">LIVE</span>
                    </div>
                    <p className="text-xs text-[#8b5cf6] truncate" title={gapRoleName}>
                      {gapRoleName}
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white/60 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-[var(--foreground,#111827)]">{gapAllowed}</div>
                        <div className="text-xs text-[var(--muted-foreground,#4b5563)]">Allowed</div>
                      </div>
                      <div className="bg-white/60 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-[#22c55e]">{gapUsed}</div>
                        <div className="text-xs text-[var(--muted-foreground,#4b5563)]">Used</div>
                      </div>
                      <div className="bg-white/60 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-[#ef4444]">{gapUnused}</div>
                        <div className="text-xs text-[var(--muted-foreground,#4b5563)] flex items-center justify-center gap-1">
                          <TrendingDown className="h-3 w-3" />
                          Unused
                        </div>
                      </div>
                      <div className="bg-white/60 rounded-lg p-3 text-center">
                        <div className="text-2xl font-bold text-[#8b5cf6]">{gapConfidence}%</div>
                        <div className="text-xs text-[var(--muted-foreground,#4b5563)]">Confidence</div>
                      </div>
                    </div>
                    {gapUnused > 0 && gapAllowed > 0 && (
                      <div className="mt-3 p-2 bg-[#f9731620] rounded-lg text-center">
                        <span className="text-xs font-medium text-[#f97316]">
                          {removableGapPercent}% permissions can be removed
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {securityHubData.total > 0 ? (
                  <Card className="rounded-[24px] border-[#ef444430] bg-gradient-to-br from-red-50 to-orange-50 shadow-[0_20px_60px_-42px_rgba(239,68,68,0.4)]">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg font-semibold text-red-900 flex items-center gap-2">
                          <AlertOctagon className="h-5 w-5 text-[#ef4444]" />
                          Security Hub Findings
                        </CardTitle>
                        <span className="text-xs bg-red-600 text-white px-2 py-1 rounded-full font-medium">
                          {securityHubData.total} Active
                        </span>
                      </div>
                      <p className="text-xs text-[#ef4444]">
                        AWS Security Hub aggregated findings
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-4 gap-3">
                        <div className="bg-white/70 rounded-xl p-3 text-center border-l-4 border-red-600">
                          <div className="text-2xl font-bold text-[#ef4444]">{securityHubData.critical}</div>
                          <div className="text-xs text-[var(--muted-foreground,#4b5563)]">Critical</div>
                        </div>
                        <div className="bg-white/70 rounded-xl p-3 text-center border-l-4 border-orange-500">
                          <div className="text-2xl font-bold text-orange-500">{securityHubData.high}</div>
                          <div className="text-xs text-[var(--muted-foreground,#4b5563)]">High</div>
                        </div>
                        <div className="bg-white/70 rounded-xl p-3 text-center border-l-4 border-amber-500">
                          <div className="text-2xl font-bold text-amber-500">{securityHubData.medium}</div>
                          <div className="text-xs text-[var(--muted-foreground,#4b5563)]">Medium</div>
                        </div>
                        <div className="bg-white/70 rounded-xl p-3 text-center border-l-4 border-blue-400">
                          <div className="text-2xl font-bold text-blue-500">{securityHubData.low}</div>
                          <div className="text-xs text-[var(--muted-foreground,#4b5563)]">Low</div>
                        </div>
                      </div>
                      {securityHubHighlights.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {securityHubHighlights.map(([product, count]) => (
                            <span key={product} className="rounded-full bg-white/80 px-3 py-1 text-xs text-[var(--foreground,#374151)]">
                              {product}: {count}
                            </span>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="rounded-[24px] border-[#dbeafe] bg-gradient-to-br from-sky-50 to-white">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                        <Shield className="h-5 w-5 text-[#2D51DA]" />
                        Security Hub Status
                      </CardTitle>
                      <p className="text-sm text-[var(--muted-foreground,#6b7280)]">
                        No Security Hub findings are currently being surfaced into the dashboard.
                      </p>
                    </CardHeader>
                    <CardContent>
                      <div className="rounded-2xl border border-[#dbeafe] bg-white p-4">
                        <div className="text-sm font-medium text-slate-900">Hub ingestion looks quiet</div>
                        <p className="mt-1 text-xs text-[var(--muted-foreground,#6b7280)]">
                          Once findings arrive, this card will highlight the active products and severities here.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              <div className="xl:col-span-7">
                <InfrastructureOverview stats={infrastructureStats} />
              </div>
              <div className="xl:col-span-5 space-y-6">
                <PostureScoreCard systemName="Eltro" />
                <Card className="rounded-[24px] border-slate-200 bg-white shadow-[0_18px_45px_-35px_rgba(15,23,42,0.4)]">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-semibold text-[var(--foreground,#111827)]">
                      Environment Snapshot
                    </CardTitle>
                    <p className="text-sm text-[var(--muted-foreground,#6b7280)]">
                      Quick read on platform scale and what is driving today&apos;s work.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted-foreground,#6b7280)]">Systems</div>
                        <div className="mt-2 text-3xl font-bold text-[var(--foreground,#111827)]">{complianceSystems.length}</div>
                        <div className="mt-1 text-xs text-[var(--muted-foreground,#6b7280)]">Systems represented in governance</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted-foreground,#6b7280)]">Findings Feed</div>
                        <div className="mt-2 text-3xl font-bold text-[var(--foreground,#111827)]">{securityFindings.length}</div>
                        <div className="mt-1 text-xs text-[var(--muted-foreground,#6b7280)]">Detailed findings loaded into the console</div>
                      </div>
                    </div>
                    <div className="mt-4 rounded-2xl border border-[#dbeafe] bg-[#f8fbff] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.2em] text-[#2D51DA]">Current Focus</div>
                          <div className="mt-1 text-sm font-medium text-slate-900">
                            {urgentIssueCount > 0
                              ? `${urgentIssueCount} urgent findings are leading the queue`
                              : "No urgent findings are leading the queue right now"}
                          </div>
                        </div>
                        <button
                          onClick={() => setActiveSection("systems")}
                          className="inline-flex items-center gap-1 text-sm font-medium text-[#2D51DA] hover:underline"
                        >
                          Open systems
                          <ArrowUpRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              <div className="xl:col-span-7">
                <SecurityIssuesOverview {...securityIssuesData} />
              </div>
              <div className="xl:col-span-5">
                <ComplianceCards systems={complianceSystems} />
              </div>
            </div>

            {securityFindings.length > 0 && (
              <div className="bg-white rounded-lg p-6 border border-[var(--border,#e5e7eb)]">
                <h2 className="text-xl font-semibold text-[var(--foreground,#111827)] mb-4">Security Findings Details</h2>
                <SecurityFindingsList findings={securityFindings} />
              </div>
            )}
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
            <div className="bg-white rounded-lg p-6 border border-[var(--border,#e5e7eb)]">
              <h2 className="text-xl font-semibold text-[var(--foreground,#111827)] mb-4">All Security Findings</h2>
              <SecurityFindingsList findings={securityFindings} />
            </div>
          </div>
        )

      case "systems":
        return <SystemsView systems={[]} onSystemSelect={handleSystemSelect} />

      case "compliance":
        return (
          <div className="bg-white rounded-xl p-6 border border-[var(--border,#e5e7eb)]">
            <EmptyState
              icon="shield"
              title="Compliance Dashboard Coming Soon"
              description="Track your compliance status across SOC 2, PCI DSS, ISO 27001, and GDPR frameworks."
            />
          </div>
        )

      case "identities":
        return <IdentitiesSection />

      case "per-resource":
        return <PerResourceAnalysis systemName={selectedSystem} />

      case "least-privilege":
        return <LeastPrivilegeTab systemName={selectedSystem} />

      case "attack-paths":
        return <IdentityAttackPaths systemName={selectedSystem || "alon-prod"} />

      case "vulnerabilities":
        return <BehavioralVulnerabilitiesView systemName={selectedSystem} />

      case "automation":
        return <AutomationSection />

      case "integrations":
        return <IntegrationsSection />

      default:
        return (
          <div>
            <h1 className="text-4xl font-bold mb-4 text-[var(--foreground,#111827)]">Welcome to CYNTRO</h1>
          </div>
        )
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <LeftSidebarNav activeItem={activeSection} onItemClick={setActiveSection} issuesCount={statsData.totalIssues} />
      <div className="flex-1 p-8">{renderContent()}</div>

      {/* Traffic Simulator Modal */}
      {showSimulator && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowSimulator(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[500px] max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 bg-white text-white flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Simulate Traffic
              </h2>
              <button onClick={() => setShowSimulator(false)} className="p-1 hover:bg-white/20 rounded">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--foreground,#374151)] mb-2">Quick Scenarios</label>
                <div className="flex flex-wrap gap-2">
                  {DEMO_SCENARIOS.map((scenario, i) => (
                    <button
                      key={i}
                      onClick={() => { setSimSource(scenario.source); setSimTarget(scenario.target); setSimDays(scenario.days); setSimEventsPerDay(scenario.eventsPerDay); }}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors"
                    >
                      {scenario.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground,#374151)] mb-1">Source Resource</label>
                <input type="text" value={simSource} onChange={(e) => setSimSource(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--border,#d1d5db)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground,#374151)] mb-1">Target S3 Bucket</label>
                <input type="text" value={simTarget} onChange={(e) => setSimTarget(e.target.value)}
                  className="w-full px-3 py-2 border border-[var(--border,#d1d5db)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground,#374151)] mb-1">Days</label>
                  <input type="number" value={simDays} onChange={(e) => setSimDays(parseInt(e.target.value) || 30)}
                    className="w-full px-3 py-2 border border-[var(--border,#d1d5db)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" min="1" max="730" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground,#374151)] mb-1">Events/Day</label>
                  <input type="number" value={simEventsPerDay} onChange={(e) => setSimEventsPerDay(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 border border-[var(--border,#d1d5db)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" min="1" max="100" />
                </div>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg text-sm text-[var(--muted-foreground,#4b5563)]">
                <strong>Will simulate:</strong> {simDays * simEventsPerDay} events over {simDays} days ({Math.round(simDays/30)} months)
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowSimulator(false)} className="flex-1 px-4 py-2 border border-[var(--border,#d1d5db)] text-[var(--foreground,#374151)] rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={simulateTraffic} disabled={isSimulating || !simSource || !simTarget}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg font-medium flex items-center justify-center gap-2">
                  {isSimulating ? 'Simulating...' : 'Simulate Traffic'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
