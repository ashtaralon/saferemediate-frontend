'use client'

import { useState, useEffect, useCallback } from 'react'

// ============================================================================
// TYPES - Match backend response exactly
// ============================================================================

export interface ArchitectureNode {
  id: string
  name: string
  type: string
  category?: string
  arn?: string
  cidr?: string
  availabilityZone?: string
  isPublic?: boolean
  vpc_id?: string
  subnet_id?: string
  subnet_is_public?: boolean
  subnet_type?: string
  privateIp?: string
  publicIp?: string
  securityGroups?: string[]
  lp_score?: number
  gap_count?: number
  is_internet_exposed?: boolean
}

export interface ArchitectureEdge {
  id: string
  source: string
  target: string
  type: 'ACTUAL_TRAFFIC' | 'ALLOWED' | 'HAS_ROLE' | 'ASSUMES_ROLE' | 'HAS_POLICY' | 'INVOKES' | string
  port?: string
  protocol?: string
  traffic_bytes?: number
  bytesTransferred?: number
  packets?: number
  connectionCount?: number
  lastSeen?: string
  isActive?: boolean
  is_used?: boolean
  confidence?: number
}

export interface ArchitectureData {
  system_name: string
  nodes: ArchitectureNode[]
  edges: ArchitectureEdge[]
  total_nodes: number
  total_edges: number
  categories: Record<string, number>
  last_updated: string
  data_sources: {
    vpc_flow_logs: boolean
    cloudtrail: boolean
    ec2_api: boolean
    iam_api: boolean
  }
}

export interface SGGapAnalysis {
  sg_id: string
  sg_name: string
  vpc_id: string
  rules_analysis: Array<{
    rule_id: string
    direction: 'inbound' | 'outbound'
    protocol: string
    port_range: string
    source: string
    destination?: string
    is_public: boolean
    traffic: {
      connection_count: number
      unique_sources: string[]
      bytes_transferred: number
      packets_transferred: number
      last_seen: string | null
    }
    recommendation: 'keep' | 'remove' | 'tighten' | 'review'
    recommendation_reason: string
    confidence: number
    confidence_reason: string
  }>
  observation_days: number
}

// ============================================================================
// HOOK: Fetch Architecture Data
// ============================================================================

interface UseArchitectureDataResult {
  data: ArchitectureData | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  dataSources: {
    vpcFlowLogs: boolean
    cloudTrail: boolean
    ec2Api: boolean
    iamApi: boolean
  }
}

export function useArchitectureData(systemName: string): UseArchitectureDataResult {
  const [data, setData] = useState<ArchitectureData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    // If no systemName provided (empty string), don't fetch - this allows component to skip hook when props are provided
    if (!systemName || systemName === '') {
      setIsLoading(false)
      setError(null)
      setData(null)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Use proxy route to avoid CORS
      const response = await fetch(
        `/api/proxy/dependency-map/full?systemName=${encodeURIComponent(systemName)}`,
        {
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Backend returned ${response.status}: ${errorText}`)
      }

      const result: ArchitectureData = await response.json()

      // Validate that we got real data
      if (!result.nodes || !result.edges) {
        throw new Error('Invalid response structure from backend')
      }

      // Log data sources for debugging
      console.log('[useArchitectureData] Data loaded:', {
        nodes: result.nodes.length,
        edges: result.edges.length,
        sources: result.data_sources,
        actualTrafficEdges: result.edges.filter(e => e.type === 'ACTUAL_TRAFFIC' || e.edge_type === 'ACTUAL_TRAFFIC').length,
        allowedEdges: result.edges.filter(e => e.type === 'ALLOWED' || e.edge_type === 'ALLOWED').length,
      })

      setData(result)
    } catch (err: any) {
      console.error('[useArchitectureData] Error:', err)
      setError(err.message || 'Failed to load architecture data')
      setData(null)
    } finally {
      setIsLoading(false)
    }
  }, [systemName])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    data,
    isLoading,
    error,
    refetch: fetchData,
    dataSources: {
      vpcFlowLogs: data?.data_sources?.vpc_flow_logs ?? false,
      cloudTrail: data?.data_sources?.cloudtrail ?? false,
      ec2Api: data?.data_sources?.ec2_api ?? false,
      iamApi: data?.data_sources?.iam_api ?? false,
    },
  }
}

// ============================================================================
// HOOK: Fetch SG Gap Analysis
// ============================================================================

interface UseSGGapAnalysisResult {
  data: SGGapAnalysis | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useSGGapAnalysis(sgId: string | null, days: number = 30): UseSGGapAnalysisResult {
  const [data, setData] = useState<SGGapAnalysis | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!sgId) {
      setData(null)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/proxy/security-groups/${encodeURIComponent(sgId)}/gap-analysis?days=${days}`,
        { cache: 'no-store' }
      )

      if (!response.ok) {
        throw new Error(`Failed to fetch SG gap analysis: ${response.status}`)
      }

      const result: SGGapAnalysis = await response.json()
      setData(result)

      console.log('[useSGGapAnalysis] Loaded:', {
        sg: sgId,
        rules: result.rules_analysis.length,
        withTraffic: result.rules_analysis.filter(r => r.traffic.connection_count > 0).length,
        recommendations: {
          keep: result.rules_analysis.filter(r => r.recommendation === 'keep').length,
          remove: result.rules_analysis.filter(r => r.recommendation === 'remove').length,
          tighten: result.rules_analysis.filter(r => r.recommendation === 'tighten').length,
        }
      })
    } catch (err: any) {
      console.error('[useSGGapAnalysis] Error:', err)
      setError(err.message)
      setData(null)
    } finally {
      setIsLoading(false)
    }
  }, [sgId, days])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, isLoading, error, refetch: fetchData }
}

