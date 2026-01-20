'use client'

/**
 * Security Group Inspector v2
 * ===========================
 *
 * Shows REAL data only - no mocks, no synthetic data.
 * - Configured rules from AWS (actual CIDRs, ports)
 * - Observed traffic from Neo4j (real flow counts, source IPs)
 * - Health status based on actual gaps
 * - Apply Fix only when there are real issues
 */

import React, { useState, useEffect } from 'react'
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Download,
  RefreshCw,
  X,
  Globe,
  Server,
  Clock,
} from 'lucide-react'

// Types matching the v2 API response
interface ConfiguredRule {
  direction: string
  protocol: string
  from_port: number
  to_port: number
  port_display: string
  port_name: string | null
  source_cidr: string | null
  source_sg: string | null
  source_sg_name: string | null
  source_type: string
  description: string
  is_public: boolean
  status: 'used' | 'unused' | 'unknown'
  flow_count: number
  last_seen: string | null
}

interface SourceIP {
  ip: string
  flow_count: number
  last_seen: string | null
}

interface SGInspectorData {
  sg_id: string
  sg_name: string
  vpc_id: string
  description: string
  system_name: string | null
  environment: string | null
  health_status: string
  gap_count: number
  summary: {
    total_rules: number
    used_rules: number
    unused_rules: number
    unknown_rules: number
    public_rules: number
  }
  configured_rules: ConfiguredRule[]
  top_source_ips: SourceIP[]
  unique_source_count: number
  evidence: {
    flow_logs: {
      available: boolean
      window_days: number
    }
  }
  recommendations: Array<{
    action: string
    rule_summary: string
    reason: string
  }> | null
  last_updated: string
}

export interface SGInspectorV2Props {
  sgId: string
  windowDays?: number
  onClose?: () => void
  onApplyFix?: (recommendations: any[]) => void
}

export function SGInspectorV2({
  sgId,
  windowDays = 30,
  onClose,
  onApplyFix,
}: SGInspectorV2Props) {
  const [data, setData] = useState<SGInspectorData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [orphanStatus, setOrphanStatus] = useState<{
    is_orphan: boolean
    severity: string
    message: string
    attachment_count: number
  } | null>(null)

  // Fetch orphan status
  useEffect(() => {
    const fetchOrphanStatus = async () => {
      try {
        const response = await fetch(`/api/proxy/sg-least-privilege/${sgId}/analysis`)
        if (response.ok) {
          const result = await response.json()
          if (result.orphan_status) {
            setOrphanStatus({
              is_orphan: result.orphan_status.is_orphan,
              severity: result.orphan_status.severity,
              message: result.orphan_status.recommendation || 'Orphan Security Group',
              attachment_count: result.orphan_status.attachment_count || 0
            })
          }
        }
      } catch (err) {
        console.error('Failed to fetch orphan status:', err)
      }
    }
    if (sgId) {
      fetchOrphanStatus()
    }
  }, [sgId])

  const fetchData = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/proxy/security-groups/${encodeURIComponent(sgId)}/inspector?window=${windowDays}d`
      )

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || err.detail || `HTTP ${response.status}`)
      }

      const result = await response.json()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (sgId) {
      fetchData()
    }
  }, [sgId, windowDays])

  const formatSource = (rule: ConfiguredRule): string => {
    if (rule.source_sg) {
      return rule.source_sg_name || rule.source_sg
    }
    return rule.source_cidr || 'Unknown'
  }

  const formatSourceLabel = (rule: ConfiguredRule): string => {
    if (rule.source_cidr === '0.0.0.0/0') return '(Any IPv4)'
    if (rule.source_cidr === '::/0') return '(Any IPv6)'
    if (rule.source_sg) return `(${rule.source_sg_name || 'Security Group'})`
    if (rule.source_cidr?.startsWith('10.') || rule.source_cidr?.startsWith('172.') || rule.source_cidr?.startsWith('192.168.')) {
      return '(Private)'
    }
    return ''
  }

  const formatRelativeTime = (timestamp: string | null): string => {
    if (!timestamp) return 'Never'
    try {
      const date = new Date(timestamp)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMs / 3600000)
      const diffDays = Math.floor(diffMs / 86400000)

      if (diffMins < 1) return 'Just now'
      if (diffMins < 60) return `${diffMins} min ago`
      if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
    } catch {
      return 'Unknown'
    }
  }

  const handleExport = () => {
    if (!data) return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sg-inspector-${sgId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Loading state
  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400 mr-2" />
        <span className="text-gray-600">Loading Security Group data...</span>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-700 font-medium">Error Loading Inspector</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
          <button
            onClick={fetchData}
            className="mt-3 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const isHealthy = data.gap_count === 0
  const hasRecommendations = data.recommendations && data.recommendations.length > 0

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{data.sg_name}</h2>
              <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                <span>Security Group</span>
                {data.system_name && (
                  <>
                    <span>•</span>
                    <span>{data.system_name}</span>
                  </>
                )}
                {data.environment && (
                  <>
                    <span>•</span>
                    <span className="capitalize">{data.environment}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isHealthy ? (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                <CheckCircle className="w-4 h-4" />
                Healthy
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium">
                <AlertTriangle className="w-4 h-4" />
                {data.gap_count} Gap{data.gap_count > 1 ? 's' : ''}
              </span>
            )}
            {onClose && (
              <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            )}
          </div>
        </div>
        <div className="mt-2 text-xs text-gray-400">
          Last updated: {formatRelativeTime(data.last_updated)}
        </div>
      </div>

      {/* Orphan Warning Banner */}
      {orphanStatus?.is_orphan && (
        <div
          className={`mx-6 mt-4 p-4 rounded-lg border-2 flex items-start gap-3 ${
            orphanStatus.severity === 'CRITICAL'
              ? 'bg-red-50 border-red-500'
              : 'bg-amber-50 border-amber-500'
          }`}
        >
          <AlertTriangle
            className={`w-6 h-6 flex-shrink-0 ${
              orphanStatus.severity === 'CRITICAL' ? 'text-red-600' : 'text-amber-600'
            }`}
          />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`px-2 py-0.5 rounded text-xs font-bold text-white ${
                  orphanStatus.severity === 'CRITICAL' ? 'bg-red-600' : 'bg-amber-500'
                }`}
              >
                {orphanStatus.severity} - ORPHAN SG
              </span>
            </div>
            <p
              className={`font-medium ${
                orphanStatus.severity === 'CRITICAL' ? 'text-red-800' : 'text-amber-800'
              }`}
            >
              {orphanStatus.message}
            </p>
            <p
              className={`text-sm mt-1 ${
                orphanStatus.severity === 'CRITICAL' ? 'text-red-700' : 'text-amber-700'
              }`}
            >
              This Security Group has {orphanStatus.attachment_count} attachments.
              {orphanStatus.severity === 'CRITICAL'
                ? ' It has public ingress rules and poses a security risk.'
                : ' Consider deleting it to reduce your attack surface.'}
            </p>
          </div>
        </div>
      )}

      {/* Configured Rules */}
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
          Configured Inbound Rules ({data.summary.total_rules})
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="pb-2 font-medium">Port</th>
                <th className="pb-2 font-medium">Source</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">Flows</th>
              </tr>
            </thead>
            <tbody>
              {data.configured_rules.map((rule, idx) => (
                <tr key={idx} className="border-b border-gray-50 last:border-0">
                  <td className="py-3">
                    <div className="font-mono text-gray-900">{rule.port_display}</div>
                    {rule.port_name && (
                      <div className="text-xs text-gray-400">({rule.port_name})</div>
                    )}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      {rule.is_public ? (
                        <Globe className="w-4 h-4 text-orange-500" />
                      ) : (
                        <Server className="w-4 h-4 text-gray-400" />
                      )}
                      <div>
                        <div className="font-mono text-gray-900">{formatSource(rule)}</div>
                        <div className="text-xs text-gray-400">{formatSourceLabel(rule)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3">
                    {rule.status === 'used' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                        <CheckCircle className="w-3 h-3" />
                        Used
                      </span>
                    )}
                    {rule.status === 'unused' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-medium">
                        <AlertTriangle className="w-3 h-3" />
                        Unused
                      </span>
                    )}
                    {rule.status === 'unknown' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                        <HelpCircle className="w-3 h-3" />
                        Unknown
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    <div className="font-medium text-gray-900">
                      {rule.flow_count.toLocaleString()}
                    </div>
                    {rule.last_seen && (
                      <div className="text-xs text-gray-400">
                        {formatRelativeTime(rule.last_seen)}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Source IPs - only show if there's data */}
      {data.top_source_ips && data.top_source_ips.length > 0 && (
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
            Top Source IPs (VPC Flow Logs, {data.evidence?.flow_logs?.window_days ?? 0}d)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="pb-2 font-medium">Source IP</th>
                  <th className="pb-2 font-medium text-right">Flows</th>
                  <th className="pb-2 font-medium text-right">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {data.top_source_ips.slice(0, 10).map((src, idx) => (
                  <tr key={idx} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 font-mono text-gray-900">{src.ip}</td>
                    <td className="py-2 text-right text-gray-900">
                      {src.flow_count.toLocaleString()}
                    </td>
                    <td className="py-2 text-right text-gray-500">
                      {formatRelativeTime(src.last_seen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.unique_source_count > 10 && (
            <div className="mt-2 text-xs text-gray-400">
              +{data.unique_source_count - 10} more unique sources
            </div>
          )}
        </div>
      )}

      {/* Recommendations - only show if there are actual gaps */}
      {hasRecommendations && (
        <div className="px-6 py-4 border-b border-gray-100 bg-orange-50">
          <h3 className="text-sm font-semibold text-orange-700 mb-3 uppercase tracking-wide flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Recommended Tightening
          </h3>
          <ul className="space-y-2">
            {data.recommendations?.map((rec, idx) => (
              <li key={idx} className="text-sm text-orange-800">
                • {rec.rule_summary} — <span className="text-orange-600">{rec.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Evidence */}
      <div className="px-6 py-3 bg-gray-50 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <Clock className="w-3 h-3" />
          Evidence: {data.evidence?.flow_logs?.available ? (
            <span className="text-green-600">✓ Flow Logs ({data.evidence.flow_logs.window_days} day window)</span>
          ) : (
            <span className="text-gray-400">No Flow Logs available</span>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
        <div className="text-xs text-gray-400">
          {data.sg_id} • {data.vpc_id}
        </div>
        <div className="flex items-center gap-2">
          {/* Apply Fix - only show if there are recommendations */}
          {hasRecommendations && onApplyFix && (
            <button
              onClick={() => onApplyFix(data.recommendations!)}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium"
            >
              Apply Fix
            </button>
          )}
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
