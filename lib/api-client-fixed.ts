import type { SecurityFinding } from "./types"
import { infrastructureData } from "./data"

// Backend URL - Direct to Render, no proxy
const API_BASE = "https://saferemediate-backend.onrender.com"
const BACKEND_URL = API_BASE

// ============================================================================
// ⚡ CACHING & DEDUPLICATION
// ============================================================================

interface CacheEntry<T> {
  data: T
  timestamp: number
  expiresAt: number
}

// Cache storage
const cache = new Map<string, CacheEntry<any>>()

// Active requests (for deduplication)
const activeRequests = new Map<string, Promise<any>>()

// Cache TTL (Time To Live) in milliseconds
const CACHE_TTL = {
  short: 30 * 1000,   // 30 seconds for frequently changing data
  medium: 60 * 1000,  // 60 seconds for moderately changing data
  long: 5 * 60 * 1000, // 5 minutes for rarely changing data
}

// Get cache key from URL
function getCacheKey(url: string): string {
  return url
}

// Check if cache entry is valid
function isCacheValid<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
  if (!entry) return false
  return Date.now() < entry.expiresAt
}

// Get from cache or return null
function getFromCache<T>(key: string): T | null {
  const entry = cache.get(key)
  if (isCacheValid(entry)) {
    console.log(`[CACHE] Hit: ${key}`)
    return entry.data
  }
  if (entry) {
    cache.delete(key) // Remove expired entry
  }
  return null
}

// Set cache entry
function setCache<T>(key: string, data: T, ttl: number = CACHE_TTL.medium): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
    expiresAt: Date.now() + ttl,
  })
  console.log(`[CACHE] Set: ${key} (TTL: ${ttl}ms)`)
}

// Clear cache for a specific key or all cache
function clearCache(key?: string): void {
  if (key) {
    cache.delete(key)
    console.log(`[CACHE] Cleared: ${key}`)
  } else {
    cache.clear()
    console.log(`[CACHE] Cleared all`)
  }
}

// ============================================================================
// API FUNCTIONS WITH CACHING & DEDUPLICATION
// ============================================================================

// Generic API GET function with caching and deduplication
export async function apiGet<T = any>(path: string, options?: { cache?: boolean; ttl?: number }): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? path : "/" + path}`
  const cacheKey = getCacheKey(url)
  const useCache = options?.cache !== false // Default to true
  const ttl = options?.ttl || CACHE_TTL.medium

  // Check cache first
  if (useCache) {
    const cached = getFromCache<T>(cacheKey)
    if (cached !== null) {
      return cached
    }
  }

  // Check if there's an active request for this URL (deduplication)
  if (activeRequests.has(cacheKey)) {
    console.log(`[DEDUP] Reusing active request: ${url}`)
    return activeRequests.get(cacheKey) as Promise<T>
  }

  // Create new request
  const requestPromise = (async () => {
    try {
      const res = await fetch(url, { cache: "no-store" })
      if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
      const data = await res.json()
      
      // Cache the result
      if (useCache) {
        setCache(cacheKey, data, ttl)
      }
      
      return data
    } finally {
      // Remove from active requests
      activeRequests.delete(cacheKey)
    }
  })()

  // Store active request
  activeRequests.set(cacheKey, requestPromise)

  return requestPromise
}

// Generic API POST function (no caching for POST)
export async function apiPost<T = any>(path: string, body?: any): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? path : "/" + path}`
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store"
  })
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`)
  return res.json()
}

// ============================================================================
// EXPORT CACHE UTILITIES
// ============================================================================

export { clearCache, getFromCache, setCache }

// ============================================================================
// TYPES & INTERFACES
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
// FETCH FUNCTIONS WITH OPTIMIZED CACHING
// ============================================================================

export async function fetchInfrastructure(): Promise<InfrastructureData> {
  try {
    // Fetch dashboard metrics and graph nodes in parallel with caching
    const [metricsResponse, nodesResponse] = await Promise.all([
      apiGet(`${BACKEND_URL}/api/dashboard/metrics`, { cache: true, ttl: CACHE_TTL.short }),
      apiGet(`${BACKEND_URL}/api/graph/nodes`, { cache: true, ttl: CACHE_TTL.medium }),
    ])

    let metrics: any = metricsResponse
    let nodes: any[] = []

    if (nodesResponse && Array.isArray(nodesResponse)) {
      nodes = nodesResponse
    } else if (nodesResponse && nodesResponse.nodes) {
      nodes = nodesResponse.nodes
    }

    console.log("[v0] Successfully loaded metrics and nodes from backend (cached)")

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
    // Use caching for findings (they don't change very often)
    const data = await apiGet<SecurityFinding[] | { findings: SecurityFinding[] }>(
      `${BACKEND_URL}/api/findings`,
      { cache: true, ttl: CACHE_TTL.long } // 5 minutes cache
    )

    // Handle both array response and object with findings property
    const findings = Array.isArray(data) ? data : data.findings || []
    console.log(`[v0] Found ${findings.length} security findings (cached)`)

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
    const data = await apiGet<any[] | { nodes: any[] }>(
      `${BACKEND_URL}/api/graph/nodes`,
      { cache: true, ttl: CACHE_TTL.medium }
    )
    console.log("[v0] Successfully loaded graph nodes from backend (cached)")
    return Array.isArray(data) ? data : data.nodes || []
  } catch (error) {
    console.warn("[v0] Graph nodes endpoint not available:", error)
    return []
  }
}

export async function fetchGraphEdges(): Promise<any[]> {
  try {
    const data = await apiGet<any[] | { relationships: any[] } | { edges: any[] }>(
      `${BACKEND_URL}/api/graph/relationships`,
      { cache: true, ttl: CACHE_TTL.medium }
    )
    console.log("[v0] Successfully loaded graph relationships from backend (cached)")
    if (Array.isArray(data)) return data
    return data.relationships || data.edges || []
  } catch (error) {
    console.warn("[v0] Graph relationships endpoint not available:", error)
    return []
  }
}

export async function testBackendHealth(): Promise<{ success: boolean; message: string }> {
  try {
    const data = await apiGet<{ status?: string }>(
      `${BACKEND_URL}/health`,
      { cache: true, ttl: CACHE_TTL.short } // Short cache for health checks
    )
    return { success: true, message: data.status || "healthy" }
  } catch (error: any) {
    return { success: false, message: error.message || "Connection failed" }
  }
}

export async function fetchGapAnalysis(roleName: string = "SafeRemediate-Lambda-Remediation-Role"): Promise<any> {
  try {
    // Trigger traffic ingestion first (background, don't wait)
    fetch(`${BACKEND_URL}/api/traffic/ingest?days=7`).catch(() => {})

    // No caching for gap analysis (always fresh)
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

