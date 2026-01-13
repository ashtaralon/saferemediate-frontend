'use client'

/**
 * Security Group Inspector Hook
 * ==============================
 *
 * Custom hook for fetching and managing Security Group inspector data.
 * Supports configurable observation window and automatic refresh.
 */

import { useState, useEffect, useCallback } from 'react'
import type { SGInspectorResponse } from '../types/sg-inspector'

// Use local proxy to avoid CORS issues
const API_BASE_URL = ''

export interface UseSGInspectorOptions {
  /** Security Group ID (e.g., sg-12345678) */
  sgId: string
  /** Observation window in days (default: 30) */
  windowDays?: number
  /** Auto-refresh interval in milliseconds (default: disabled) */
  refreshInterval?: number
  /** Enable auto-refresh (default: false) */
  autoRefresh?: boolean
}

export interface UseSGInspectorReturn {
  /** Inspector data */
  data: SGInspectorResponse | null
  /** Loading state */
  loading: boolean
  /** Error state */
  error: Error | null
  /** Refetch function */
  refetch: () => Promise<void>
  /** Last fetched timestamp */
  lastFetched: Date | null
}

/**
 * Custom hook for Security Group Inspector data
 */
export function useSGInspector(options: UseSGInspectorOptions): UseSGInspectorReturn {
  const {
    sgId,
    windowDays = 30,
    refreshInterval = 300000, // 5 minutes
    autoRefresh = false,
  } = options

  const [data, setData] = useState<SGInspectorResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)

  const fetchInspectorData = useCallback(async () => {
    if (!sgId) {
      setError(new Error('Security Group ID is required'))
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const url = `${API_BASE_URL}/api/proxy/resources/${encodeURIComponent(sgId)}/inspector?type=security_group&window=${windowDays}d`

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(60000), // 60 second timeout
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(
          errorData.detail || errorData.message || `Failed to fetch inspector data: ${response.status}`
        )
      }

      const responseData: SGInspectorResponse = await response.json()
      setData(responseData)
      setLastFetched(new Date())
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        setError(new Error('Request timed out. The server may be busy.'))
      } else if (err instanceof Error) {
        setError(err)
      } else {
        setError(new Error('An unknown error occurred'))
      }
    } finally {
      setLoading(false)
    }
  }, [sgId, windowDays])

  // Initial fetch
  useEffect(() => {
    fetchInspectorData()
  }, [fetchInspectorData])

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || !refreshInterval) return

    const intervalId = setInterval(fetchInspectorData, refreshInterval)
    return () => clearInterval(intervalId)
  }, [autoRefresh, refreshInterval, fetchInspectorData])

  return {
    data,
    loading,
    error,
    refetch: fetchInspectorData,
    lastFetched,
  }
}

/**
 * Get statistics from inspector data
 */
export function getInspectorStats(data: SGInspectorResponse | null) {
  if (!data) return null

  const { configured_rules, rule_usage, suggestions } = data

  const totalRules = configured_rules.ingress.length + configured_rules.egress.length
  const ingressRules = configured_rules.ingress.length
  const egressRules = configured_rules.egress.length

  // Count public rules
  const publicRules = configured_rules.ingress.filter((r) =>
    r.broadness_flags.includes('public_world')
  ).length

  // Count by usage
  let usedRules = 0
  let unobservedRules = 0
  let unknownRules = 0

  if (rule_usage.state === 'value' && rule_usage.rules) {
    for (const ru of rule_usage.rules) {
      if (ru.usage === 'USED') usedRules++
      else if (ru.usage === 'UNOBSERVED') unobservedRules++
      else unknownRules++
    }
  }

  // Count suggestions by severity
  let highSeverity = 0
  let warnSeverity = 0
  let infoSeverity = 0

  if (suggestions.state === 'value' && suggestions.items) {
    for (const s of suggestions.items) {
      if (s.severity === 'high') highSeverity++
      else if (s.severity === 'warn') warnSeverity++
      else infoSeverity++
    }
  }

  return {
    totalRules,
    ingressRules,
    egressRules,
    publicRules,
    usedRules,
    unobservedRules,
    unknownRules,
    suggestions: {
      total: suggestions.items?.length ?? 0,
      high: highSeverity,
      warn: warnSeverity,
      info: infoSeverity,
    },
  }
}
