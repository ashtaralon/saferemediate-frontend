import { useState, useEffect, useCallback } from 'react'
import { apiService, Finding, FindingsFilters } from '@/services/api'

interface UseFindingsOptions extends FindingsFilters {
  autoRefresh?: boolean
  refreshInterval?: number // in milliseconds
  systemName?: string  // ✅ Add systemName option
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
    systemName,  // ✅ Add systemName
    autoRefresh = false,
    refreshInterval = 300000, // 5 minutes default
  } = options

  // Start with empty array - only show real data
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
        systemName,  // ✅ Pass systemName
      })

      // Only use real data - return empty array if backend returns empty
      if (data && data.length > 0) {
        setFindings(data)
      } else {
        // Backend returned empty - show empty state
        setFindings([])
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
      setError(errorMessage)
      console.error('[useFindings] Error fetching findings:', err)
      // On error, return empty array (no mock data)
      setFindings([])
    } finally {
      setLoading(false)
    }
  }, [status, severity, confidenceMin, limit, systemName])  // ✅ Add systemName to dependencies

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



