import type { SecurityFinding } from "./types"

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"
const FETCH_TIMEOUT = 30000 // 30 second timeout (proxy routes use 28s, so client needs 30s+)
const MAX_RETRIES = 3

// Helper function to fetch with retry and exponential backoff
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = MAX_RETRIES
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error: any) {
    clearTimeout(timeoutId)
    
    // Retry on network errors or timeouts
    if (retries > 0 && (error.name === 'AbortError' || error.message?.includes('fetch'))) {
      const delay = Math.pow(2, MAX_RETRIES - retries) * 1000 // Exponential backoff: 2s, 4s, 8s
      console.warn(`[api-client] Retry ${MAX_RETRIES - retries + 1}/${MAX_RETRIES} after ${delay}ms`)
      await new Promise(resolve => setTimeout(resolve, delay))
      return fetchWithRetry(url, options, retries - 1)
    }
    
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${FETCH_TIMEOUT}ms`)
    }
    throw error
  }
}

export interface InfrastructureData {
  resources: Array<{
    id: string
    name: string
    type: string
    provider: string
    region: string
    status: string
    healthScore?: number
    tags?: Record<string, string>
  }>
  stats: {
    avgHealthScore: number
    healthScoreTrend: number
    needAttention: number
    totalIssues: number
    criticalIssues: number
    averageScore: number
    averageScoreTrend: number
    lastScanTime: string
  }
  infrastructure: {
    containerClusters: number
    kubernetesWorkloads: number
    standaloneVMs: number
    vmScalingGroups: number
    relationalDatabases: number
    blockStorage: number
    fileStorage: number
    objectStorage: number
  }
  securityIssues: {
    critical: number
    high: number
    medium: number
    low: number
    totalIssues: number
    todayChange: number
    cveCount: number
    threatsCount: number
    zeroDayCount: number
    secretsCount: number
    complianceCount: number
  }
  complianceSystems: Array<{
    name: string
    healthScore: number
    criticalGaps: number
    controlsCount: number
    owner: string
    tags: string[]
  }>
  issuesSummary?: {
    total: number
    by_severity?: {
      critical?: number
      high?: number
      medium?: number
      low?: number
    }
    by_source?: Record<string, any>
    cached?: boolean
    cache_age_seconds?: number
  } | null
}

export async function fetchInfrastructure(): Promise<InfrastructureData> {
  try {
    // Fetch dashboard metrics and graph nodes in parallel via proxy routes
    // Use Promise.race with timeout to prevent hanging
    const fetchWithTimeout = (url: string, timeout: number = 25000) => {
      return Promise.race([
        fetch(url, {
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
        }),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), timeout)
        ),
      ])
    }

    // Use unified issues endpoint for stable counts
    // Only fetch graph-data if we actually need it (not just for typeCounts)
    // Client timeout must be longer than proxy timeout (28s) to allow proxy to complete
    const [issuesSummaryResponse] = await Promise.allSettled([
      fetchWithTimeout("/api/proxy/issues-summary", 30000).catch(() => null), // 30s timeout (proxy has 28s)
    ])

    let issuesSummary: any = null
    let metrics: any = {}
    let nodes: any[] = []

    // Handle unified issues summary response
    if (issuesSummaryResponse.status === 'fulfilled' && issuesSummaryResponse.value && issuesSummaryResponse.value.ok) {
      try {
        issuesSummary = await issuesSummaryResponse.value.json()
        console.log("[v0] Successfully loaded unified issues summary:", {
          total: issuesSummary.total,
          cached: issuesSummary.cached,
          by_source: issuesSummary.by_source
        })
      } catch (e) {
        console.warn("[v0] Failed to parse issues summary:", e)
      }
    } else {
      console.warn("[v0] Issues summary endpoint failed or timed out, falling back to old metrics")
    }
    
    // Fallback: try old dashboard-metrics if unified endpoint failed
    if (!issuesSummary) {
      try {
        const metricsResponse = await fetchWithTimeout("/api/proxy/dashboard-metrics", 30000).catch(() => null) // 30s timeout (proxy has 28s)
        if (metricsResponse && metricsResponse.ok) {
          metrics = await metricsResponse.json()
          console.log("[v0] Using fallback dashboard-metrics")
        }
      } catch (e) {
        console.warn("[v0] Fallback metrics also failed:", e)
      }
    }

    // NOTE: We no longer fetch graph-data here just for typeCounts
    // Graph data should only be loaded when user navigates to graph tabs
    // Use infrastructure stats from metrics/issuesSummary instead
    console.log("[v0] Skipping graph-data fetch - using metrics for infrastructure stats")

    // If no issues summary and no metrics, return empty structure
    if (!issuesSummary && Object.keys(metrics).length === 0) {
      console.warn("[v0] No data from backend")
      return {
        resources: [],
        stats: {
          avgHealthScore: 0,
          healthScoreTrend: 0,
          needAttention: 0,
          totalIssues: 0,
          criticalIssues: 0,
          averageScore: 0,
          averageScoreTrend: 0,
          lastScanTime: new Date().toISOString(),
        },
        infrastructure: {
          containerClusters: 0,
          kubernetesWorkloads: 0,
          standaloneVMs: 0,
          vmScalingGroups: 0,
          relationalDatabases: 0,
          blockStorage: 0,
          fileStorage: 0,
          objectStorage: 0,
        },
        securityIssues: {
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
        },
        complianceSystems: [],
      }
    }

    // Use infrastructure stats from issuesSummary or metrics
    // This avoids downloading 1000+ nodes just to count types
    const infrastructureStats = issuesSummary?.infrastructure || metrics?.infrastructure || metrics?.infrastructure_stats || {}
    
    // Map resources from metrics if available, otherwise empty array
    // Graph data should only be loaded when user navigates to graph tabs
    const resources: any[] = []
    
    // Use infrastructure stats from backend instead of counting nodes
    const typeCounts: Record<string, number> = {
      ecscluster: infrastructureStats.containerClusters || 0,
      ekscluster: infrastructureStats.kubernetesWorkloads || 0,
      ec2instance: infrastructureStats.standaloneVMs || 0,
      autoscalinggroup: infrastructureStats.vmScalingGroups || 0,
      rdsinstance: infrastructureStats.relationalDatabases || 0,
      ebsvolume: infrastructureStats.blockStorage || 0,
      efsfilesystem: infrastructureStats.fileStorage || 0,
      s3bucket: infrastructureStats.objectStorage || 0,
    }

    // Use unified issues summary if available, otherwise fallback to metrics
    const totalIssues = issuesSummary?.total ?? metrics?.total_issues ?? metrics?.totalIssues ?? metrics?.issuesCount ?? 0
    const bySeverity = issuesSummary?.by_severity ?? {
      critical: metrics?.issues_by_severity?.CRITICAL ?? metrics?.issues_by_severity?.critical ?? metrics?.criticalIssues ?? metrics?.criticalCount ?? 0,
      high: metrics?.issues_by_severity?.HIGH ?? metrics?.issues_by_severity?.high ?? metrics?.highIssues ?? metrics?.highCount ?? 0,
      medium: metrics?.issues_by_severity?.MEDIUM ?? metrics?.issues_by_severity?.medium ?? metrics?.mediumIssues ?? metrics?.mediumCount ?? 0,
      low: metrics?.issues_by_severity?.LOW ?? metrics?.issues_by_severity?.low ?? metrics?.lowIssues ?? metrics?.lowCount ?? 0,
    }

    return {
      resources,
      stats: {
        avgHealthScore: issuesSummary?.avg_health_score ?? metrics?.avg_health_score ?? metrics?.avgHealthScore ?? metrics?.healthScore ?? 100,
        healthScoreTrend: metrics?.healthScoreTrend ?? 0,
        needAttention: issuesSummary?.resources?.with_issues ?? metrics?.need_attention ?? metrics?.needAttention ?? metrics?.systemsNeedingAttention ?? 0,
        totalIssues: totalIssues,
        criticalIssues: bySeverity.critical,
        averageScore: metrics?.avg_health_score ?? metrics?.averageScore ?? metrics?.avgHealthScore ?? 100,
        averageScoreTrend: metrics?.averageScoreTrend ?? 0,
        lastScanTime: issuesSummary?.timestamp ?? metrics?.most_recent_scan ?? metrics?.lastScanTime ?? new Date().toISOString(),
      },
      issuesSummary: issuesSummary ? {
        total: issuesSummary.total,
        by_severity: issuesSummary.by_severity,
        by_source: issuesSummary.by_source,
        cached: issuesSummary.cached,
        cache_age_seconds: issuesSummary.cache_age_seconds,
      } : null,
      infrastructure: {
        containerClusters: typeCounts["ecscluster"] || typeCounts["ecs"] || 0,
        kubernetesWorkloads: typeCounts["ekscluster"] || typeCounts["eks"] || 0,
        standaloneVMs: typeCounts["ec2instance"] || typeCounts["ec2"] || 0,
        vmScalingGroups: typeCounts["autoscalinggroup"] || 0,
        relationalDatabases: typeCounts["rdsinstance"] || typeCounts["rds"] || 0,
        blockStorage: typeCounts["ebsvolume"] || 0,
        fileStorage: typeCounts["efsfilesystem"] || typeCounts["efs"] || 0,
        objectStorage: typeCounts["s3bucket"] || typeCounts["s3"] || 0,
      },
      securityIssues: {
        critical: bySeverity.critical ?? 0,
        high: bySeverity.high ?? 0,
        medium: bySeverity.medium ?? 0,
        low: bySeverity.low ?? 0,
        totalIssues: totalIssues,
        todayChange: metrics?.todayChange ?? 0,
        cveCount: metrics?.cveCount ?? 0,
        threatsCount: metrics?.threatsCount ?? 0,
        zeroDayCount: metrics?.zeroDayCount ?? 0,
        secretsCount: metrics?.secretsCount ?? 0,
        complianceCount: metrics?.complianceCount ?? 0,
      },
      complianceSystems: metrics.complianceSystems || [],
    }
  } catch (error) {
    console.warn("[v0] Backend not available. Error:", error)
    // Return empty structure instead of fallback data
    return {
      resources: [],
      stats: {
        avgHealthScore: 0,
        healthScoreTrend: 0,
        needAttention: 0,
        totalIssues: 0,
        criticalIssues: 0,
        averageScore: 0,
        averageScoreTrend: 0,
        lastScanTime: new Date().toISOString(),
      },
      infrastructure: {
        containerClusters: 0,
        kubernetesWorkloads: 0,
        standaloneVMs: 0,
        vmScalingGroups: 0,
        relationalDatabases: 0,
        blockStorage: 0,
        fileStorage: 0,
        objectStorage: 0,
      },
      securityIssues: {
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
      },
      complianceSystems: [],
    }
  }
}

export async function fetchSecurityFindings(systemName?: string): Promise<SecurityFinding[]> {
  // Create timeout controller - increased to 30s to match proxy route timeout (25s) + buffer
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout (was 8s)

  try {
    // Use proxy route instead of direct backend call - proxy has better timeout handling and fallback
    const params = new URLSearchParams()
    params.append('_t', Date.now().toString())
    if (systemName) params.append('systemName', systemName)
    
    const response = await fetch(`/api/proxy/findings?${params.toString()}`, {
      cache: "no-store",
      headers: { 
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
      },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      console.warn("[api-client] Backend returned error for security findings:", response.status, "- returning empty array")
      return []
    }

    let data: any
    try {
      data = await response.json()
    } catch (parseError) {
      console.warn("[api-client] Failed to parse security findings response - returning empty array")
      return []
    }

    console.log("[v0] Security findings response:", { success: data?.success, source: data?.source, count: data?.findings?.length })

    // Handle both array response and object with findings property
    const findings = Array.isArray(data) ? data : data.findings || []

    // If backend returns empty findings, return empty array (no mock data)
    if (!findings || findings.length === 0) {
      console.log("[api-client] Backend returned empty findings - returning empty array")
      return []
    }

    const mappedFindings = findings.map((f: any) => {
      // Use finding_id from backend as the primary ID (this is the real ID)
      const findingId = f.finding_id || f.id || f.findingId
      if (!findingId) {
        console.warn("[api-client] Finding missing ID:", f)
      }
      
      return {
        // CRITICAL: Use finding_id from backend, not generated ID.
        // Previously fell back to `finding-${Math.random()}`, which produced
        // a NEW id on every render → React key thrashing AND made findings
        // un-trackable across reloads. Empty string preserves stable identity
        // (React will warn about duplicate empty keys, which is the correct
        // signal: backend is missing IDs and that's a bug worth surfacing).
        id: findingId || "",
        finding_id: findingId, // Preserve original finding_id for API calls
        title: f.title || f.name || "Security Finding",
        severity: (f.severity || "MEDIUM").toUpperCase() as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
        description: f.description || "",
        resource: f.resource || f.resourceId || f.role_name || "",
        resourceType: f.resourceType || "Resource",
        status: f.status || "open",
        category: f.category || f.type || "Security",
        // Don't fabricate "discovered just now" when the backend gave us
        // nothing. Empty string lets the UI render "—" / "unknown".
        discoveredAt: f.discoveredAt || f.detectedAt || f.created_at || f.createdAt || "",
        remediation: f.remediation || f.recommendation || "",
        // Preserve all backend fields needed for simulation
        role_name: f.role_name,
        resourceId: f.resourceId || f.role_name,
        unused_actions: f.unused_actions || [],
        unused_actions_count: f.unused_actions_count || 0,
        allowed_actions: f.allowed_actions || [],
        allowed_actions_count: f.allowed_actions_count || 0,
        used_actions: f.observed_actions || f.used_actions || [],
        used_actions_count: f.used_actions_count || f.observed_actions?.length || 0,
        confidence: f.confidence ?? undefined,
        observation_days: f.observation_days || 30,
        // Preserve all other fields
        ...f
      }
    })

    // Final check - if mapping produced empty array, return empty
    if (mappedFindings.length === 0) {
      console.log("[api-client] Mapped findings empty - returning empty array")
      return []
    }

    console.log("[v0] Successfully loaded", mappedFindings.length, "security findings")
    return mappedFindings
  } catch (error: any) {
    clearTimeout(timeoutId)
    const errorMsg = error.name === 'AbortError' ? 'Request timed out' : error.message
    console.warn("[api-client] Security findings fetch failed:", errorMsg, "- returning empty array")
    return []
  }
}

export async function fetchGraphNodes(): Promise<any[]> {
  try {
    const response = await fetch("/api/proxy/graph-data", {
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    })

    if (!response.ok) {
      console.warn("[v0] Graph nodes endpoint returned error:", response.status)
      return []
    }

    const data = await response.json()
    console.log("[v0] Successfully loaded graph nodes from backend")
    return data.nodes || data || []
  } catch (error) {
    console.warn("[v0] Graph nodes endpoint not available:", error)
    return []
  }
}

export async function fetchGraphEdges(): Promise<any[]> {
  try {
    const response = await fetch("/api/proxy/graph-data", {
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    })

    if (!response.ok) {
      console.warn("[v0] Graph relationships endpoint returned error:", response.status)
      return []
    }

    const data = await response.json()
    console.log("[v0] Successfully loaded graph relationships from backend")
    return data.relationships || data.edges || data || []
  } catch (error) {
    console.warn("[v0] Graph relationships endpoint not available:", error)
    return []
  }
}

export async function testBackendHealth(): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch("/api/proxy/health", {
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    })

    if (!response.ok) {
      return { success: false, message: `Backend returned ${response.status}` }
    }

    const data = await response.json()
    return { success: true, message: data.status || "healthy" }
  } catch (error: any) {
    return { success: false, message: error.message || "Connection failed" }
  }
}

// ============================================================================
// HTTP POST Helper & Simulation/Fix Functions
// ============================================================================

async function httpPost<T>(path: string, body: any): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Request to ${path} failed (${res.status}): ${text}`)
  }

  return res.json() as Promise<T>
}

/**
 * Simulate a fix for a finding
 * payload can be:
 * { finding_id, change_type, resource_id, proposed_state }
 */
export async function simulateIssue(payload: any) {
  // Use Next.js proxy to avoid CORS issues
  const res = await fetch("/api/proxy/simulate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    throw new Error(`Simulation failed: ${res.status}`)
  }

  return res.json()
}

/**
 * Execute remediation for a finding
 * Usually you send something like:
 * { finding_id: "...", ... }
 */
export async function fixIssue(payload: any) {
  // Use Next.js proxy to avoid CORS issues
  const res = await fetch("/api/proxy/remediate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    throw new Error(`Fix failed: ${res.status}`)
  }

  return res.json()
}

// ============================================================================
// New Real Backend Functions
// ============================================================================

export interface SimulationResult {
  success: boolean
  simulation_id: string
  finding_id: string
  diff: { removed_permissions: string[]; added_permissions: string[]; changed_resources: string[] }
  impact: { blast_radius: string; risk_level: string; affected_resources: number; downtime: string; confidence: number }
  recommendation: string
  warnings: string[]
  estimated_time: string
  rollback_available: boolean
  simulated_at: string
  resource_type: string
  resource_id: string
  before_state: any
  after_state: any
}

export async function triggerScan(days = 30) {
  try {
    const res = await fetch('/api/proxy/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache"
      },
      cache: "no-store",
      body: JSON.stringify({ lookback_days: days })
    })
    const data = await res.json()
    return {
      success: data.success ?? res.ok,
      message: data.error || 'Scan completed',
      findings_count: data.findings_count || 0,
      findings: data.findings || [],
      scan_id: data.scan_id,
      status: data.status
    }
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to connect to backend', findings_count: 0 }
  }
}

export async function getScanStatus() {
  try {
    const res = await fetch(`/api/proxy/scan?_t=${Date.now()}`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache"
      }
    })
    return await res.json()
  } catch { return { status: 'unknown' } }
}

export async function simulateRemediation(findingId: string): Promise<SimulationResult | null> {
  try {
    // Use proxy route to avoid CORS and get mock fallback
    const res = await fetch(`/api/proxy/simulate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache"
      },
      cache: "no-store",
      body: JSON.stringify({ finding_id: findingId })
    })
    return res.ok ? await res.json() : null
  } catch { return null }
}

export async function executeRemediation(findingId: string) {
  try {
    // Use proxy route
    const res = await fetch(`/api/proxy/simulate/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache"
      },
      cache: "no-store",
      body: JSON.stringify({ finding_id: findingId })
    })
    return await res.json()
  } catch { return { success: false, error: 'Failed' } }
}

export async function rollbackRemediation(findingId: string, snapshotId: string) {
  try {
    // Use proxy route
    const res = await fetch(`/api/proxy/safe-remediate/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ finding_id: findingId, snapshot_id: snapshotId })
    })
    return await res.json()
  } catch { return { success: false, error: 'Failed' } }
}

// ============================================================================
// Posture Score API
// ============================================================================

export interface PostureScoreData {
  system_name: string
  overall_score: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  dimensions: {
    least_privilege: {
      score: number
      weight: number
      details: {
        total_roles: number
        total_permissions: number
        used_permissions: number
        unused_permissions: number
      }
    }
    network_security: {
      score: number
      weight: number
      details: {
        total_security_groups: number
        total_rules: number
        used_rules: number
        unused_rules: number
      }
    }
    data_protection: {
      score: number
      weight: number
      details: {
        total_buckets: number
        encrypted_buckets: number
        private_buckets: number
      }
    }
    compliance: {
      score: number
      weight: number
      details: {
        config_rules_compliant: string | number
        standards_met: string[]
      }
    }
    observability: {
      score: number
      weight: number
      details: {
        total_resources: number
        with_flow_logs: number
        with_cloudtrail: number
      }
    }
  }
  top_issues: Array<{
    dimension: string
    score: number
    recommendation: string
  }>
  window_days: number
  resources_analyzed: number
  timestamp: string
}

export async function fetchPostureScore(systemName: string): Promise<PostureScoreData | null> {
  try {
    const response = await fetch(`/api/proxy/posture-score/${encodeURIComponent(systemName)}`, {
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    })

    if (!response.ok) {
      console.warn("[api-client] Posture score endpoint returned error:", response.status)
      return null
    }

    const data = await response.json()
    console.log("[api-client] Successfully loaded posture score for", systemName)
    return data
  } catch (error) {
    console.warn("[api-client] Posture score fetch failed:", error)
    return null
  }
}

// ---------------------------------------------------------------------------
// Attack Chains v2 (v0.2 §3 hop-reified attack paths)
// ---------------------------------------------------------------------------

import type {
  AttackChainsResponse,
  AttackChainsSummaryResponse,
  AttackChainDetailResponse,
} from "@/lib/types"

/**
 * Fetch all AttackChain objects targeting a crown jewel. The backend
 * returns materialized Phase-3 AttackPath data with the full hop list
 * per chain — the v0.3 Attacker View renderer iterates `chain.hops` to
 * draw connections directly from real graph edges.
 *
 * Empty response (`note: "crown_jewel_not_resolved"`) means the cj id
 * didn't match any graph node. Empty `chains[]` with successful
 * response means Phase 3 hasn't materialized any paths yet — UI can
 * offer the `triggerAttackChainsMaterialization()` admin CTA.
 *
 * Errors return an object with `error` populated and `chains: []` so
 * callers can render an empty-state without try/catch boilerplate.
 */
export async function fetchChainsForCJ(
  cjId: string,
  opts?: {
    include_blocked?: boolean
    rank_by?: "severity" | "freshness" | "foothold"
  },
): Promise<AttackChainsResponse & { error?: string }> {
  const qs = new URLSearchParams({ cj_id: cjId })
  if (opts?.include_blocked) qs.set("include_blocked", "true")
  if (opts?.rank_by) qs.set("rank_by", opts.rank_by)
  try {
    const res = await fetch(`/api/proxy/attack-chain/chains-for-cj?${qs.toString()}`, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
    if (!res.ok) {
      const text = await res.text()
      return {
        cj: { id: cjId, name: cjId, type: "Unknown" },
        chains: [],
        stats: { total: 0, by_status: {}, total_hops: 0, avg_hop_count: 0 },
        error: `proxy ${res.status}: ${text.slice(0, 200)}`,
      }
    }
    return await res.json()
  } catch (e: any) {
    return {
      cj: { id: cjId, name: cjId, type: "Unknown" },
      chains: [],
      stats: { total: 0, by_status: {}, total_hops: 0, avg_hop_count: 0 },
      error: String(e?.message ?? e),
    }
  }
}

/**
 * List endpoint companion to fetchChainsForCJ — calls the lighter
 * `/chains-for-cj/summary` proxy that omits hops + node_meta. The
 * legacy `fetchChainsForCJ` paid a ~9.5s warm cost (and 55s timeouts
 * on cold) because the backend ran a per-hop `OPTIONAL MATCH` over
 * every chain's hops; the summary endpoint skips that loop entirely.
 *
 * Pair with `fetchChainDetailById` for drill-in: render the list
 * with summaries, then lazy-fetch detail when the operator clicks
 * a chain row.
 *
 * Error envelope matches `fetchChainsForCJ` — `chains: []` + populated
 * `error` so callers can render empty-state without try/catch.
 */
export async function fetchChainsForCJSummary(
  cjId: string,
  opts?: {
    include_blocked?: boolean
    rank_by?: "severity" | "freshness" | "foothold"
    system_name?: string
    include_out_of_scope?: boolean
  },
): Promise<AttackChainsSummaryResponse & { error?: string }> {
  const qs = new URLSearchParams({ cj_id: cjId })
  if (opts?.include_blocked) qs.set("include_blocked", "true")
  if (opts?.rank_by) qs.set("rank_by", opts.rank_by)
  if (opts?.system_name) qs.set("system_name", opts.system_name)
  if (opts?.include_out_of_scope) qs.set("include_out_of_scope", "true")
  try {
    const res = await fetch(
      `/api/proxy/attack-chain/chains-for-cj/summary?${qs.toString()}`,
      {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      },
    )
    if (!res.ok) {
      const text = await res.text()
      return {
        cj: { id: cjId, name: cjId, type: "Unknown" },
        chains: [],
        stats: { total: 0, by_status: {} },
        endpoint: "summary",
        error: `proxy ${res.status}: ${text.slice(0, 200)}`,
      }
    }
    return await res.json()
  } catch (e: any) {
    return {
      cj: { id: cjId, name: cjId, type: "Unknown" },
      chains: [],
      stats: { total: 0, by_status: {} },
      endpoint: "summary",
      error: String(e?.message ?? e),
    }
  }
}

/**
 * Detail endpoint companion to fetchChainsForCJSummary. Fetches the
 * full chain object + node_meta for ONE chain_id (the kind of id
 * surfaced by the summary list). Called when an operator clicks a
 * chain row in the picker — pays the per-hop enrichment cost for ~10-20
 * hop ids instead of the ~220 the legacy aggregated endpoint pays.
 *
 * Returns `chain: null` + populated `error` when the chain id can't be
 * resolved (the backend returns 404 for a stale chain id, e.g. when
 * the underlying workload was flipped to is_active=false between the
 * summary call and the row click).
 */
export async function fetchChainDetailById(
  chainId: string,
): Promise<{
  cj: AttackChainDetailResponse["cj"] | null
  chain: AttackChainDetailResponse["chain"] | null
  node_meta: AttackChainDetailResponse["node_meta"]
  error?: string
}> {
  const qs = new URLSearchParams({ chain_id: chainId })
  try {
    const res = await fetch(
      `/api/proxy/attack-chain/chains-for-cj/detail?${qs.toString()}`,
      {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      },
    )
    if (!res.ok) {
      const text = await res.text()
      return {
        cj: null,
        chain: null,
        node_meta: {},
        error: `proxy ${res.status}: ${text.slice(0, 200)}`,
      }
    }
    const json: AttackChainDetailResponse = await res.json()
    return {
      cj: json.cj,
      chain: json.chain,
      node_meta: json.node_meta ?? {},
    }
  } catch (e: any) {
    return {
      cj: null,
      chain: null,
      node_meta: {},
      error: String(e?.message ?? e),
    }
  }
}

/**
 * Admin trigger: re-run Phase 3 materialization. Useful when sync-all
 * is failing on flow_logs (Phase 3 doesn't depend on flow_logs) or
 * when the operator wants fresh AttackPath data without a full sync.
 */
export async function triggerAttackChainsMaterialization(): Promise<{
  success: boolean
  result?: any
  error?: string
}> {
  try {
    const res = await fetch(`/api/proxy/attack-chain/chains-for-cj`, {
      method: "POST",
      headers: { Accept: "application/json" },
    })
    if (!res.ok) {
      const text = await res.text()
      return { success: false, error: `proxy ${res.status}: ${text.slice(0, 200)}` }
    }
    return await res.json()
  } catch (e: any) {
    return { success: false, error: String(e?.message ?? e) }
  }
}

// ─── Shared IAM Roles (discovery — step 1) ─────────────────────────
import type { SharedRolesResponse } from "./types"

export interface FetchSharedRolesParams {
  minPrincipals?: number
  systemName?: string | null
  crossSystemOnly?: boolean
  includeStale?: boolean
  includeInactive?: boolean
}

export async function fetchSharedRoles(
  params: FetchSharedRolesParams = {}
): Promise<SharedRolesResponse> {
  const qs = new URLSearchParams()
  if (params.minPrincipals !== undefined) qs.set("min_principals", String(params.minPrincipals))
  if (params.systemName) qs.set("system_name", params.systemName)
  if (params.crossSystemOnly) qs.set("cross_system_only", "true")
  if (params.includeStale) qs.set("include_stale", "true")
  if (params.includeInactive) qs.set("include_inactive", "true")
  const url = `/api/proxy/iam/shared-roles${qs.toString() ? `?${qs}` : ""}`
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`shared-roles fetch ${res.status}: ${text.slice(0, 200)}`)
  }
  return await res.json()
}

// ─── Split plan (step 2 + 5) ───────────────────────────────────────
import type { SplitPlan, ApprovePlanResponse } from "./types"

export async function postSplitPlan(
  roleRef: string,
  requestedBy: string
): Promise<SplitPlan> {
  // role_ref travels as a query param (Next.js can't put [...catchall]
  // before a static segment, see proxy route header for the why).
  const qs = new URLSearchParams({ role_ref: roleRef })
  const res = await fetch(`/api/proxy/iam/shared-roles/split-plan?${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requested_by: requestedBy }),
    cache: "no-store",
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`split-plan POST ${res.status}: ${text.slice(0, 300)}`)
  }
  return await res.json()
}

export async function fetchSplitPlan(planId: string): Promise<SplitPlan> {
  const res = await fetch(
    `/api/proxy/iam/shared-roles/split-plans/${encodeURIComponent(planId)}`,
    { cache: "no-store" }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`split-plan GET ${res.status}: ${text.slice(0, 300)}`)
  }
  return await res.json()
}

export async function approveSplitPlan(
  planId: string,
  approvedBy: string,
  note?: string
): Promise<ApprovePlanResponse> {
  const res = await fetch(
    `/api/proxy/iam/shared-roles/split-plans/${encodeURIComponent(planId)}/approve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved_by: approvedBy, note: note || undefined }),
      cache: "no-store",
    }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`approve ${res.status}: ${text.slice(0, 300)}`)
  }
  return await res.json()
}

// ─── Shared Security Groups (SG-9 frontend — discovery only for v1) ──

import type { SharedSGsResponse } from "./types"

export interface FetchSharedSGsParams {
  minConsumers?: number
  includeInactive?: boolean
}

export async function fetchSharedSGs(
  params: FetchSharedSGsParams = {}
): Promise<SharedSGsResponse> {
  const qs = new URLSearchParams()
  if (params.minConsumers !== undefined) qs.set("min_consumers", String(params.minConsumers))
  if (params.includeInactive) qs.set("include_inactive", "true")
  const url = `/api/proxy/sg/shared-sgs${qs.toString() ? `?${qs}` : ""}`
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`shared-sgs fetch ${res.status}: ${text.slice(0, 200)}`)
  }
  return await res.json()
}

export interface SGSplitPlanMintedResponse {
  plan_id: string
  plan_hash: string
  state: string
  created_at: string
  expires_at: string
  plan_body: any
}

export async function postSGSplitPlan(
  sgRef: string,
  requestedBy: string
): Promise<SGSplitPlanMintedResponse> {
  const qs = new URLSearchParams({ sg_ref: sgRef })
  const res = await fetch(`/api/proxy/sg/shared-sgs/split-plan?${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requested_by: requestedBy }),
    cache: "no-store",
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`sg split-plan POST ${res.status}: ${text.slice(0, 300)}`)
  }
  return await res.json()
}

export async function fetchSGSplitPlan(planId: string): Promise<any> {
  const res = await fetch(
    `/api/proxy/sg/shared-sgs/split-plans/${encodeURIComponent(planId)}`,
    { cache: "no-store" }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`sg split-plan GET ${res.status}: ${text.slice(0, 300)}`)
  }
  return await res.json()
}

export async function approveSGSplitPlan(
  planId: string, approvedBy: string, note?: string
): Promise<any> {
  const res = await fetch(
    `/api/proxy/sg/shared-sgs/split-plans/${encodeURIComponent(planId)}/approve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved_by: approvedBy, note: note || undefined }),
      cache: "no-store",
    }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`sg approve ${res.status}: ${text.slice(0, 300)}`)
  }
  return await res.json()
}

export async function executeSGSplitPlan(
  planId: string, mode: "CREATE_ONLY", requestedBy: string, force = false
): Promise<any> {
  const res = await fetch(
    `/api/proxy/sg/shared-sgs/split-plans/${encodeURIComponent(planId)}/execute`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, requested_by: requestedBy, force }),
      cache: "no-store",
    }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`sg execute ${res.status}: ${text.slice(0, 500)}`)
  }
  return await res.json()
}

export async function rollbackSGSplitPlan(
  planId: string, rolledBackBy: string, force = false
): Promise<any> {
  const res = await fetch(
    `/api/proxy/sg/shared-sgs/split-plans/${encodeURIComponent(planId)}/rollback`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rolled_back_by: rolledBackBy,
        mode: "CREATE_ONLY",
        force,
      }),
      cache: "no-store",
    }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`sg rollback ${res.status}: ${text.slice(0, 500)}`)
  }
  return await res.json()
}

export async function fetchSGPlanHistory(planId: string): Promise<any> {
  const res = await fetch(
    `/api/proxy/sg/shared-sgs/split-plans/${encodeURIComponent(planId)}/history`,
    { cache: "no-store" }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`sg history ${res.status}: ${text.slice(0, 300)}`)
  }
  return await res.json()
}

export async function fetchSGGateReadiness(
  planId: string, mode = "CREATE_ONLY"
): Promise<any> {
  const qs = new URLSearchParams({ mode })
  const res = await fetch(
    `/api/proxy/sg/shared-sgs/split-plans/${encodeURIComponent(planId)}/gate-readiness?${qs}`,
    { cache: "no-store" }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`sg gate-readiness ${res.status}: ${text.slice(0, 300)}`)
  }
  return await res.json()
}

export async function fetchSGStagePreview(
  planId: string, groupId: string
): Promise<any> {
  const qs = new URLSearchParams({ group_id: groupId })
  const res = await fetch(
    `/api/proxy/sg/shared-sgs/split-plans/${encodeURIComponent(planId)}/stage-preview?${qs}`,
    { cache: "no-store" }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`sg stage-preview ${res.status}: ${text.slice(0, 300)}`)
  }
  return await res.json()
}


// ─── SG-9h: per-SG STAGED enable / disable / read ────────────────────


export interface SGStagedState {
  sg_id: string
  enabled: boolean
  enabled_by?: string | null
  enabled_at?: string | null
  enabled_note?: string | null
  disabled_by?: string | null
  disabled_at?: string | null
  disabled_note?: string | null
}

export async function fetchSGStagedState(sgId: string): Promise<SGStagedState> {
  const res = await fetch(
    `/api/proxy/sg/shared-sgs/${encodeURIComponent(sgId)}/staged-state`,
    { cache: "no-store" },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`sg staged-state ${res.status}: ${text.slice(0, 300)}`)
  }
  return await res.json()
}

export async function enableSGStaged(
  sgId: string, enabledBy: string, note: string = "",
): Promise<SGStagedState> {
  const res = await fetch(
    `/api/proxy/sg/shared-sgs/${encodeURIComponent(sgId)}/enable-staged`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled_by: enabledBy, note }),
      cache: "no-store",
    },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`sg enable-staged ${res.status}: ${text.slice(0, 300)}`)
  }
  return await res.json()
}

export async function disableSGStaged(
  sgId: string, disabledBy: string, note: string = "",
): Promise<SGStagedState> {
  const res = await fetch(
    `/api/proxy/sg/shared-sgs/${encodeURIComponent(sgId)}/disable-staged`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disabled_by: disabledBy, note }),
      cache: "no-store",
    },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`sg disable-staged ${res.status}: ${text.slice(0, 300)}`)
  }
  return await res.json()
}


// ─── Layer D — split-plan simulate (Phase 2/3) ──────────────────────
// Two-step polling pattern. postSimulate returns 202 + sim_id; UI
// polls fetchSimulationRun every ~1.5s until status terminal.
import type { SimulationManifest, SimulationRun } from "./types/atlas-simulate"

export async function postSimulate(
  planId: string,
  requestedBy?: string,
): Promise<SimulationManifest> {
  const res = await fetch(
    `/api/proxy/iam/shared-roles/split-plans/${encodeURIComponent(planId)}/simulate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requested_by: requestedBy || "self@cyntro.io" }),
      cache: "no-store",
    },
  )
  // 202 is success here — passthrough proxy keeps the status code.
  if (res.status !== 202 && !res.ok) {
    const text = await res.text()
    throw new Error(`simulate POST ${res.status}: ${text.slice(0, 300)}`)
  }
  return await res.json()
}

export async function fetchSimulationRun(simId: string): Promise<SimulationRun> {
  const res = await fetch(
    `/api/proxy/iam/shared-roles/simulate/${encodeURIComponent(simId)}`,
    { cache: "no-store" },
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`simulate GET ${res.status}: ${text.slice(0, 300)}`)
  }
  return await res.json()
}
