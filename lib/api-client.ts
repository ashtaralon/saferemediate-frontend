import type { SecurityFinding } from "./types"
import { infrastructureData, demoSecurityFindings } from "./data"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend-f.onrender.com"
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
    // Client timeout must be longer than proxy timeout (28s) to allow proxy to complete
    const [issuesSummaryResponse, nodesResponse] = await Promise.allSettled([
      fetchWithTimeout("/api/proxy/issues-summary", 30000).catch(() => null), // 30s timeout (proxy has 28s)
      fetchWithTimeout("/api/proxy/graph-data", 30000).catch(() => null), // 30s timeout (proxy has 28s)
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

    // Handle nodes response
    if (nodesResponse.status === 'fulfilled' && nodesResponse.value && nodesResponse.value.ok) {
      try {
        const nodesData = await nodesResponse.value.json()
        // graph-data returns { nodes: [...], relationships: [...] }
        nodes = nodesData.nodes || nodesData || []
        console.log("[v0] Successfully loaded nodes from backend:", nodes.length)
      } catch (e) {
        console.warn("[v0] Failed to parse nodes:", e)
      }
    } else {
      console.warn("[v0] Nodes endpoint failed or timed out")
    }

    // If no nodes from backend and no issues summary, use fallback data
    if (nodes.length === 0 && !issuesSummary && Object.keys(metrics).length === 0) {
      console.warn("[v0] No data from backend, using fallback data")
      return infrastructureData
    }

    // Map backend data to our InfrastructureData format
    const resources = nodes.map((node: any) => ({
      id: node.id || node.nodeId || "",
      name: node.name || node.label || "",
      type: node.type || node.resourceType || "Resource",
      provider: "AWS",
      region: node.region || "us-east-1",
      status: node.status || "active",
      healthScore: node.healthScore || 100,
      tags: node.tags || {},
    }))

    // Count resource types for infrastructure stats
    const typeCounts: Record<string, number> = {}
    nodes.forEach((node: any) => {
      const type = (node.type || "").toLowerCase()
      typeCounts[type] = (typeCounts[type] || 0) + 1
    })

    // Use unified issues summary if available, otherwise fallback to metrics
    const totalIssues = issuesSummary?.total ?? metrics.totalIssues ?? metrics.issuesCount ?? 0
    const bySeverity = issuesSummary?.by_severity ?? {
      critical: metrics.criticalIssues ?? metrics.criticalCount ?? 0,
      high: metrics.highIssues ?? metrics.highCount ?? 0,
      medium: metrics.mediumIssues ?? metrics.mediumCount ?? 0,
      low: metrics.lowIssues ?? metrics.lowCount ?? 0,
    }

    return {
      resources,
      stats: {
        avgHealthScore: metrics.metrics?.avg_health_score || metrics.avgHealthScore || metrics.healthScore || 85,
        healthScoreTrend: metrics.healthScoreTrend || 2,
        needAttention: metrics.needAttention || metrics.systemsNeedingAttention || 0,
        totalIssues: totalIssues,
        criticalIssues: bySeverity.critical,
        averageScore: metrics.metrics?.avg_health_score || metrics.averageScore || metrics.avgHealthScore || 85,
        averageScoreTrend: metrics.averageScoreTrend || 2,
        lastScanTime: issuesSummary?.timestamp || metrics.metrics?.last_scan_time || metrics.lastScanTime || new Date().toISOString(),
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
        critical: bySeverity.critical || metrics.criticalIssues || 0,
        high: bySeverity.high || metrics.highIssues || 0,
        medium: bySeverity.medium || metrics.mediumIssues || 0,
        low: bySeverity.low || metrics.lowIssues || 0,
        totalIssues: totalIssues,
        todayChange: metrics.todayChange || 0,
        cveCount: metrics.cveCount || 0,
        threatsCount: metrics.threatsCount || 0,
        zeroDayCount: metrics.zeroDayCount || 0,
        secretsCount: metrics.secretsCount || 0,
        complianceCount: metrics.complianceCount || 0,
      },
      complianceSystems: metrics.complianceSystems || [],
    }
  } catch (error) {
    console.warn("[v0] Backend not available, using fallback data. Error:", error)
    return infrastructureData
  }
}

export async function fetchSecurityFindings(): Promise<SecurityFinding[]> {
  // Create timeout controller - increased to 30s to match proxy route timeout (25s) + buffer
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout (was 8s)

  try {
    const response = await fetch("/api/proxy/findings", {
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      console.warn("[v0] Backend returned error for security findings:", response.status, "- using fallback data")
      return demoSecurityFindings
    }

    let data: any
    try {
      data = await response.json()
    } catch (parseError) {
      console.warn("[v0] Failed to parse security findings response - using fallback data")
      return demoSecurityFindings
    }

    console.log("[v0] Security findings response:", { success: data?.success, source: data?.source, count: data?.findings?.length })

    // Handle both array response and object with findings property
    const findings = Array.isArray(data) ? data : data.findings || []

    // If backend returns empty findings, use fallback demo data
    if (!findings || findings.length === 0) {
      console.warn("[v0] Backend returned empty findings - using fallback data")
      return demoSecurityFindings
    }

    const mappedFindings = findings.map((f: any) => ({
      id: f.id || f.findingId || `finding-${Math.random().toString(36).substr(2, 9)}`,
      title: f.title || f.name || "Security Finding",
      severity: (f.severity || "MEDIUM").toUpperCase() as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      description: f.description || "",
      resource: f.resource || f.resourceId || "",
      resourceType: f.resourceType || "Resource",
      status: f.status || "open",
      category: f.category || f.type || "Security",
      discoveredAt: f.discoveredAt || f.detectedAt || f.createdAt || new Date().toISOString(),
      remediation: f.remediation || f.recommendation || "",
    }))

    // Final check - if mapping produced empty array, return fallback
    if (mappedFindings.length === 0) {
      console.warn("[v0] Mapped findings empty - using fallback data")
      return demoSecurityFindings
    }

    console.log("[v0] Successfully loaded", mappedFindings.length, "security findings")
    return mappedFindings
  } catch (error: any) {
    clearTimeout(timeoutId)
    const errorMsg = error.name === 'AbortError' ? 'Request timed out' : error.message
    console.warn("[v0] Security findings fetch failed:", errorMsg, "- using fallback data")
    return demoSecurityFindings
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
    const res = await fetch(`${BACKEND_URL}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lookback_days: days })
    })
    return { success: res.ok, message: 'Scan started' }
  } catch { return { success: false, message: 'Failed' } }
}

export async function getScanStatus() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/scan/status`)
    return await res.json()
  } catch { return { status: 'unknown' } }
}

export async function simulateRemediation(findingId: string): Promise<SimulationResult | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ finding_id: findingId })
    })
    return res.ok ? await res.json() : null
  } catch { return null }
}

export async function executeRemediation(findingId: string) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/simulate/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ finding_id: findingId })
    })
    return await res.json()
  } catch { return { success: false, error: 'Failed' } }
}

export async function rollbackRemediation(findingId: string, snapshotId: string) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ finding_id: findingId, snapshot_id: snapshotId })
    })
    return await res.json()
  } catch { return { success: false, error: 'Failed' } }
}
