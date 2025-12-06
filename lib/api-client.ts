import type { SecurityFinding } from "./types"
import { infrastructureData } from "./data"

// Backend URL - MUST be absolute, never relative
// Priority: NEXT_PUBLIC_BACKEND_URL > NEXT_PUBLIC_API_URL > fallback
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "https://saferemediate-backend.onrender.com"

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
    // Fetch dashboard metrics and graph nodes in parallel
    const [metricsResponse, nodesResponse] = await Promise.all([
      fetch(`${BACKEND_URL}/api/dashboard/metrics`, {
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
      }),
      fetch(`${BACKEND_URL}/api/graph/nodes`, {
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
      }),
    ])

    let metrics: any = {}
    let nodes: any[] = []

    if (metricsResponse.ok) {
      metrics = await metricsResponse.json()
      console.log("[v0] Successfully loaded metrics from backend")
    } else {
      console.warn("[v0] Metrics endpoint returned error:", metricsResponse.status)
    }

    if (nodesResponse.ok) {
      const nodesData = await nodesResponse.json()
      nodes = nodesData.nodes || nodesData || []
      console.log("[v0] Successfully loaded nodes from backend:", nodes.length)
    } else {
      console.warn("[v0] Nodes endpoint returned error:", nodesResponse.status)
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
    console.warn("[v0] Backend not available, using mock data. Error:", error)
    return infrastructureData
  }
}

export async function fetchSecurityFindings(): Promise<SecurityFinding[]> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/findings`, {
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    })

    if (!response.ok) {
      console.error("[v0] Backend returned error for security findings:", response.status, response.statusText)
      return []
    }

    const data = await response.json()
    console.log("[v0] Security findings response:", data)
    
    // Handle both array response and object with findings property
    const findings = Array.isArray(data) ? data : data.findings || []
    console.log(`[v0] Found ${findings.length} security findings`)

    if (findings.length === 0) {
      console.warn("[v0] No security findings returned from backend")
      return []
    }

    const mappedFindings = findings.map((f: any) => ({
      id: f.id || f.findingId || f.finding_id || "",
      title: f.title || f.name || f.type || "Security Finding",
      severity: (f.severity || "MEDIUM").toUpperCase(),
      description: f.description || f.desc || "",
      resource: f.resource || f.resourceId || f.resource_id || "",
      resourceType: f.resourceType || f.resource_type || "Resource",
      status: f.status || "open",
      category: f.category || f.type || "Security",
      discoveredAt: f.discoveredAt || f.discovered_at || f.createdAt || f.created_at || f.detectedAt || new Date().toISOString(),
      remediation: f.remediation || f.recommendation || "",
    }))
    
    console.log(`[v0] Mapped ${mappedFindings.length} findings successfully`)
    return mappedFindings
  } catch (error) {
    console.error("[v0] Security findings endpoint error:", error)
    return []
  }
}

export async function fetchGraphNodes(): Promise<any[]> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/graph/nodes`, {
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
    const response = await fetch(`${BACKEND_URL}/api/graph/relationships`, {
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
    const response = await fetch(`${BACKEND_URL}/health`, {
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

export async function fetchGapAnalysis(roleName: string = "SafeRemediate-Lambda-Remediation-Role"): Promise<any> {
  try {
    // Trigger traffic ingestion first (background, don't wait)
    fetch(`${BACKEND_URL}/api/traffic/ingest?days=7`).catch(() => {})

    const response = await fetch(`${BACKEND_URL}/api/traffic/gap/${roleName}`, {
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error("[api-client] Error fetching gap analysis:", error)
    throw error
  }
}
