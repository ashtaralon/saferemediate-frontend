import type { SecurityFinding } from "./types"
import { infrastructureData } from "./data"

// ============================================================================
// REWRITE-BASED API CLIENT - All calls go through Next.js rewrites to avoid CORS
// ============================================================================

// Browser calls /backend/* → Next.js rewrites to real backend (see next.config.js)
const API_BASE = "/backend/api"

// ============================================================================
// ⚡ CACHING & DEDUPLICATION
// ============================================================================

interface CacheEntry<T> {
  data: T
  timestamp: number
  expiresAt: number
}

const cache = new Map<string, CacheEntry<any>>()
const activeRequests = new Map<string, Promise<any>>()

const CACHE_TTL = {
  short: 30 * 1000,      // 30s
  medium: 60 * 1000,     // 60s
  long: 5 * 60 * 1000,   // 5m
}

function getCacheKey(url: string): string {
  return url
}

function isCacheValid<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  if (!entry) return false
  return Date.now() < entry.expiresAt
}

function getFromCache<T>(key: string): T | null {
  const entry = cache.get(key)
  if (isCacheValid(entry)) {
    console.log(`[CACHE] Hit: ${key}`)
    return entry.data
  }
  if (entry) cache.delete(key)
  return null
}

function setCache<T>(key: string, data: T, ttl: number = CACHE_TTL.medium): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
    expiresAt: Date.now() + ttl,
  })
  console.log(`[CACHE] Set: ${key} (TTL: ${ttl}ms)`)
}

function clearCache(key?: string): void {
  if (key) {
    cache.delete(key)
    console.log(`[CACHE] Cleared: ${key}`)
  } else {
    cache.clear()
    console.log("[CACHE] Cleared all")
  }
}

// ============================================================================
// LOW-LEVEL API HELPERS
// ============================================================================

export async function apiGet<T = any>(
  path: string,
  options?: { cache?: boolean; ttl?: number }
): Promise<T> {
  const url = path.startsWith("/backend")
    ? path
    : `${API_BASE}${path.startsWith("/") ? path : "/" + path}`

  const cacheKey = getCacheKey(url)
  const useCache = options?.cache !== false
  const ttl = options?.ttl || CACHE_TTL.medium

  if (useCache) {
    const cached = getFromCache<T>(cacheKey)
    if (cached !== null) return cached
  }

  if (activeRequests.has(cacheKey)) {
    console.log(`[DEDUP] Reusing active request: ${url}`)
    return activeRequests.get(cacheKey) as Promise<T>
  }

  const requestPromise = (async () => {
    try {
      const res = await fetch(url, { cache: "no-store" })
      if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
      const data = await res.json()
      if (useCache) setCache(cacheKey, data, ttl)
      return data
    } finally {
      activeRequests.delete(cacheKey)
    }
  })()

  activeRequests.set(cacheKey, requestPromise)
  return requestPromise
}

export async function apiPost<T = any>(path: string, body?: any): Promise<T> {
  const url = path.startsWith("/backend")
    ? path
    : `${API_BASE}${path.startsWith("/") ? path : "/" + path}`

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  })

  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`)
  return res.json()
}

export { clearCache, getFromCache, setCache }

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// HIGH-LEVEL FETCH FUNCTIONS
// ============================================================================

export async function fetchInfrastructure(): Promise<InfrastructureData> {
  try {
    const [metricsResponse, graphResponse] = await Promise.all([
      apiGet<{ success: boolean; metrics: any }>(`/dashboard/metrics`, {
        cache: true,
        ttl: CACHE_TTL.short,
      }),
      apiGet<{ success: boolean; nodes: any[]; relationships: any[] }>(
        `/graph/nodes`,
        { cache: true, ttl: CACHE_TTL.medium }
      ),
    ])

    const metrics: any = metricsResponse.metrics || metricsResponse
    let nodes: any[] = []

    if (graphResponse && graphResponse.nodes) {
      nodes = graphResponse.nodes
    } else if (Array.isArray(graphResponse)) {
      nodes = graphResponse
    }

    console.log("[api-client] Loaded metrics and nodes via rewrites")

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
    console.warn("[api-client] Backend unavailable, using mock infrastructure data:", error)
    return infrastructureData
  }
}

export async function fetchSecurityFindings(): Promise<SecurityFinding[]> {
  try {
    const data = await apiGet<{ success: boolean; findings: SecurityFinding[] }>(
      `/findings`,
      { cache: true, ttl: CACHE_TTL.long }
    )

    const findings = data.findings || (Array.isArray(data) ? data : [])
    console.log(`[api-client] Got ${findings.length} security findings`)

    if (findings.length === 0) return []

    const mappedFindings = findings.map((f: any) => ({
      id: f.id || f.findingId || f.finding_id || "",
      title: f.title || f.name || f.type || "Security Finding",
      severity: (f.severity || "MEDIUM").toUpperCase(),
      description: f.description || f.desc || "",
      resource: f.resource || f.resourceId || f.resource_id || "",
      resourceType: f.resourceType || f.resource_type || "Resource",
      status: f.status || "open",
      category: f.category || f.type || "Security",
      discoveredAt:
        f.discoveredAt ||
        f.discovered_at ||
        f.createdAt ||
        f.created_at ||
        f.detectedAt ||
        new Date().toISOString(),
      remediation: f.remediation || f.recommendation || "",
    }))

    return mappedFindings
  } catch (error) {
    console.error("[api-client] Security findings endpoint error:", error)
    return []
  }
}

export async function fetchGraphNodes(): Promise<any[]> {
  try {
    const data = await apiGet<{ success: boolean; nodes: any[]; relationships: any[] }>(
      `/graph/nodes`,
      { cache: true, ttl: CACHE_TTL.medium }
    )
    console.log("[api-client] Loaded graph nodes")
    return data.nodes || (Array.isArray(data) ? data : [])
  } catch (error) {
    console.warn("[api-client] Graph nodes endpoint not available:", error)
    return []
  }
}

export async function fetchGraphEdges(): Promise<any[]> {
  try {
    const data = await apiGet<{ success: boolean; edges: any[]; relationships: any[] }>(
      `/graph/edges`,
      { cache: true, ttl: CACHE_TTL.medium }
    )
    console.log("[api-client] Loaded graph edges")
    return data.edges || data.relationships || (Array.isArray(data) ? data : [])
  } catch (error) {
    console.warn("[api-client] Graph edges endpoint not available:", error)
    return []
  }
}

export async function testBackendHealth(): Promise<{ success: boolean; message: string }> {
  try {
    const data = await apiGet<{ success: boolean; status?: string; message?: string }>(
      `/health`,
      { cache: true, ttl: CACHE_TTL.short }
    )
    return {
      success: data.success !== false,
      message: data.status || data.message || "healthy",
    }
  } catch (error: any) {
    return { success: false, message: error.message || "Connection failed" }
  }
}

// ============================================================================
// GAP ANALYSIS (SYSTEM-BASED, NOT ROLE-BASED)
// ============================================================================

export async function fetchGapAnalysis(systemName: string): Promise<any> {
  try {
    const data = await apiGet(
      `/gap-analysis?systemName=${encodeURIComponent(systemName)}`,
      {
        cache: false,          // תמיד עדכני
        ttl: CACHE_TTL.short,
      }
    )
    return data
  } catch (error) {
    console.error("[api-client] Error fetching gap analysis:", error)
    return {
      success: false,
      statistics: {
        total_allowed: 0,
        total_used: 0,
        total_unused: 0,
        confidence: 0,
      },
      unused_actions_list: [],
      message: "Gap analysis failed",
    }
  }
}

// ============================================================================
// LEAST PRIVILEGE API FUNCTIONS
// ============================================================================

export interface SimulationResult {
  success: boolean
  roleName?: string        // נשאיר לתאימות אחורה
  systemName?: string
  allowed: string[]
  used: string[]
  unused: string[]
  confidence: number
  plan?: Array<{
    action: string
    permission: string
    impact: string
    reason: string
  }>
}

export interface ApplyResult {
  success: boolean
  roleName?: string
  systemName?: string
  checkpoint: string
  applied: number
}

/**
 * Simulate removing unused IAM permissions for a system
 */
export async function simulateLeastPrivilege(systemName: string): Promise<SimulationResult> {
  try {
    const data = await apiPost<SimulationResult>("/least-privilege/simulate", {
      systemName,
    })
    return data
  } catch (error) {
    console.error("[api-client] Simulation failed:", error)
    return {
      success: false,
      systemName,
      allowed: [],
      used: [],
      unused: [],
      confidence: 0,
      plan: [],
    }
  }
}

/**
 * Apply the least privilege fix for a system
 */
export async function applyLeastPrivilege(
  systemName: string,
  permissions: string[]
): Promise<ApplyResult> {
  try {
    const data = await apiPost<ApplyResult>("/least-privilege/apply", {
      systemName,
      permissions,
    })
    return data
  } catch (error) {
    console.error("[api-client] Apply fix failed:", error)
    return {
      success: false,
      systemName,
      checkpoint: "",
      applied: 0,
    }
  }
}

/**
 * Rollback a previous fix using checkpoint ID
 */
export async function rollbackFix(
  checkpointId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const data = await apiPost<{ success: boolean; message: string }>(
      "/least-privilege/rollback",
      { checkpointId }
    )
    return data
  } catch (error) {
    console.error("[api-client] Rollback failed:", error)
    return {
      success: false,
      message: "Rollback failed",
    }
  }
}
