import type { SecurityFinding } from "./types"
import { infrastructureData } from "./data"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://saferemediate-backend.onrender.com"
const FETCH_TIMEOUT = 10000 // 10 second timeout
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
    const fetchWithTimeout = (url: string, timeout: number = 5000) => {
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

    const [metricsResponse, nodesResponse] = await Promise.allSettled([
      fetchWithTimeout("/api/proxy/dashboard-metrics", 5000).catch(() => null),
      fetchWithTimeout("/api/proxy/graph-data", 5000).catch(() => null),
    ])

    let metrics: any = {}
    let nodes: any[] = []

    // Handle metrics response
    if (metricsResponse.status === 'fulfilled' && metricsResponse.value && metricsResponse.value.ok) {
      try {
        metrics = await metricsResponse.value.json()
        console.log("[v0] Successfully loaded metrics from backend")
      } catch (e) {
        console.warn("[v0] Failed to parse metrics:", e)
      }
    } else {
      console.warn("[v0] Metrics endpoint failed or timed out")
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

    // If no nodes from backend, use fallback data
    if (nodes.length === 0 && (!metricsResponse.value || !metricsResponse.value.ok)) {
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

    // Log what types we found for debugging
    console.log("[v0] Node type counts:", typeCounts)

    // Helper to count with multiple possible type names
    const countTypes = (...types: string[]) => {
      return types.reduce((sum, t) => sum + (typeCounts[t.toLowerCase()] || 0), 0)
    }

    return {
      resources,
      stats: {
        avgHealthScore: metrics.avgHealthScore || metrics.healthScore || 85,
        healthScoreTrend: metrics.healthScoreTrend || 2,
        needAttention: metrics.needAttention || metrics.systemsNeedingAttention || 0,
        totalIssues: metrics.totalIssues || metrics.issuesCount || 0,
        criticalIssues: metrics.criticalIssues || metrics.criticalCount || 0,
        averageScore: metrics.averageScore || metrics.avgHealthScore || 85,
        averageScoreTrend: metrics.averageScoreTrend || 2,
        lastScanTime: metrics.lastScanTime || new Date().toISOString(),
      },
      infrastructure: {
        containerClusters: countTypes("ecscluster", "ecs", "ecsservice"),
        kubernetesWorkloads: countTypes("ekscluster", "eks"),
        standaloneVMs: countTypes("ec2instance", "ec2"),
        vmScalingGroups: countTypes("autoscalinggroup", "asg"),
        relationalDatabases: countTypes("rdsinstance", "rds", "rdscluster"),
        blockStorage: countTypes("ebsvolume", "ebs"),
        fileStorage: countTypes("efsfilesystem", "efs"),
        objectStorage: countTypes("s3bucket", "s3"),
      },
      securityIssues: {
        critical: metrics.criticalIssues || 0,
        high: metrics.highIssues || 0,
        medium: metrics.mediumIssues || 0,
        low: metrics.lowIssues || 0,
        totalIssues: metrics.totalIssues || 0,
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
  try {
    const response = await fetch("/api/proxy/findings", {
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    })

    if (!response.ok) {
      console.warn("[v0] Backend returned error for security findings:", response.status)
      return []
    }

    const data = await response.json()
    console.log("[v0] Successfully loaded security findings from backend")

    // Handle both array response and object with findings property
    const findings = Array.isArray(data) ? data : data.findings || []

    return findings.map((f: any) => ({
      id: f.id || f.findingId || "",
      title: f.title || f.name || "Security Finding",
      severity: f.severity || "medium",
      description: f.description || "",
      resource: f.resource || f.resourceId || "",
      resourceType: f.resourceType || "Resource",
      status: f.status || "open",
      detectedAt: f.detectedAt || f.createdAt || new Date().toISOString(),
      recommendation: f.recommendation || "",
    }))
  } catch (error) {
    console.warn("[v0] Security findings endpoint not available:", error)
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
