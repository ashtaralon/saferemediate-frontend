import { useState, useEffect, useCallback } from 'react'
import { apiService, Finding, FindingsFilters } from '@/services/api'

interface UseFindingsOptions extends FindingsFilters {
  autoRefresh?: boolean
  refreshInterval?: number // in milliseconds
  systemName?: string
}

interface UseFindingsReturn {
  findings: Finding[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  stats: {
    total: number
    critical: number
    high: number
    medium: number
    low: number
  }
}

export function useFindings(options: UseFindingsOptions = {}): UseFindingsReturn {
  const {
    status,
    severity,
    confidenceMin = 0,
    limit = 100,
    systemName,
    autoRefresh = false,
    refreshInterval = 300000, // 5 minutes default
  } = options

  // Start with empty array - no mock data
  const [findings, setFindings] = useState<Finding[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchFindings = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const data = await apiService.getFindings({
        status,
        severity,
        confidenceMin,
        limit,
        systemName,
      })

      // Use real data only - no fallback
      setFindings(data || [])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
      setError(errorMessage)
      console.error('[useFindings] Error fetching findings:', err)
      // On error, set empty array - no mock data fallback
      setFindings([])
    } finally {
      setLoading(false)
    }
  }, [status, severity, confidenceMin, limit, systemName])

  // Initial fetch
  useEffect(() => {
    fetchFindings()
  }, [fetchFindings])

  // Auto-refresh if enabled
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      fetchFindings()
    }, refreshInterval)

    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval, fetchFindings])

  // Calculate stats
  const stats = {
    total: findings.length,
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
  }

  return {
    findings,
    loading,
    error,
    refetch: fetchFindings,
    stats,
  }
}
