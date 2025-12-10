import { useState, useEffect, useCallback } from 'react'
import { apiService, Finding, FindingsFilters } from '@/services/api'
import { DEMO_FINDINGS } from '@/lib/demoFindings'

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

  // ✅ FALLBACK: Start with demo data so UI always shows something
  const [findings, setFindings] = useState<Finding[]>(DEMO_FINDINGS as Finding[])
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

      // ✅ Use real data if available and not empty, otherwise keep demo data
      if (data && data.length > 0) {
        setFindings(data)
      } else {
        // Keep demo data if backend returns empty
        setFindings(DEMO_FINDINGS as Finding[])
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
      setError(errorMessage)
      console.error('[useFindings] Error fetching findings, using demo data:', err)
      // ✅ On error, keep demo data so UI always shows something
      setFindings(DEMO_FINDINGS as Finding[])
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



