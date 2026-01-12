'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Activity, RefreshCw, AlertTriangle, CheckCircle, XCircle,
  Shield, Network, Eye, Clock, ChevronDown, ChevronRight,
  TrendingUp, TrendingDown, Minus, Filter, Download
} from 'lucide-react'
import { CoverageStrip } from './coverage-strip'
import { ScoresPanel } from './scores-panel'
import { CriticalPathsTable } from './critical-paths-table'
import { DriftSection } from './drift-section'
import { TimelineSection } from './timeline'

// ============================================================================
// Types
// ============================================================================

interface PlaneStatus {
  present: boolean
  data_points?: number
  gaps_hours?: number
  delay_minutes_p95?: number
  last_recorded_minutes_ago?: number
}

interface CoverageStatus {
  flow_logs: PlaneStatus
  cloudtrail: PlaneStatus
  config: PlaneStatus
  iam: PlaneStatus
}

interface Score {
  value: number
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  reasons: string[]
}

interface CriticalPath {
  src_key: string
  src_name: string
  dst_key: string
  dst_name: string
  path: string[]
  port: number
  protocol: string
  observed: boolean
  configured_possible: boolean
  confidence: string
  risk_flags: string[]
}

interface DriftItem {
  resource_key: string
  resource_name: string
  resource_type: string
  drift_type: string
  severity: string
  description: string
  configured_value?: number | string | null
  observed_value?: number | string | null
  recommendation?: string
}

interface TimelineEvent {
  ts: string
  type: string
  summary: string
  severity: string
  plane: string
  details?: Record<string, any>
}

interface NetworkSummary {
  total_edges: number
  external_edges: number
  internal_edges: number
  top_talkers: Array<{ key: string; name: string; edge_count: number }>
}

interface IdentitySummary {
  principals_count: number
  roles_with_activity: number
  high_risk_actions: number
  top_actors: Array<{ key: string; name: string; action_count: number }>
}

// API response structure (what the backend actually returns)
interface ApiResponse {
  system_id: string
  window: { start: string; end: string; days?: number }
  coverage: any
  confidence: Score
  risk: Score
  critical_paths: CriticalPath[]
  drift_items: DriftItem[]
  timeline: Array<{
    timestamp: string
    event_type: string
    summary: string
    severity: string
    plane: string
    details?: Record<string, any>
  }>
  network: NetworkSummary
  identity: IdentitySummary
  anomalies: Array<{
    type: string
    severity: string
    description: string
    details?: Record<string, any>
  }>
}

// Normalized structure for the component
interface BehavioralSummary {
  system_id: string
  window: { start: string; end: string }
  coverage: CoverageStatus
  scores: {
    confidence: Score
    risk: Score
  }
  critical_paths: CriticalPath[]
  drift_items: DriftItem[]
  timeline: TimelineEvent[]
  network_summary: NetworkSummary
  identity_summary: IdentitySummary
  anomalies: Array<{
    type: string
    severity: string
    description: string
    details?: Record<string, any>
  }>
}

interface BehavioralPageProps {
  systemName: string
}

// ============================================================================
// Transform API response to normalized structure
// ============================================================================

function transformApiResponse(api: ApiResponse): BehavioralSummary {
  return {
    system_id: api.system_id,
    window: { start: api.window.start, end: api.window.end },
    coverage: {
      flow_logs: api.coverage?.flow_logs || { present: false },
      cloudtrail: api.coverage?.cloudtrail || { present: false },
      config: api.coverage?.config || { present: false },
      iam: api.coverage?.iam || { present: false },
    },
    scores: {
      confidence: api.confidence || { value: 0, level: 'LOW', reasons: [] },
      risk: api.risk || { value: 0, level: 'LOW', reasons: [] },
    },
    critical_paths: api.critical_paths || [],
    drift_items: api.drift_items || [],
    timeline: (api.timeline || []).map(event => ({
      ts: event.timestamp,
      type: event.event_type,
      summary: event.summary,
      severity: event.severity,
      plane: event.plane,
      details: event.details,
    })),
    network_summary: api.network || { total_edges: 0, external_edges: 0, internal_edges: 0, top_talkers: [] },
    identity_summary: api.identity || { principals_count: 0, roles_with_activity: 0, high_risk_actions: 0, top_actors: [] },
    anomalies: api.anomalies || [],
  }
}

// ============================================================================
// Main Component
// ============================================================================

export function BehavioralPage({ systemName }: BehavioralPageProps) {
  const [data, setData] = useState<BehavioralSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Filter state
  const [days, setDays] = useState(90)
  const [showPaths, setShowPaths] = useState(true)
  const [showDrift, setShowDrift] = useState(true)
  const [showTimeline, setShowTimeline] = useState(true)

  // Expanded sections
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['scores', 'paths', 'drift', 'timeline']))

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        days: days.toString(),
        include_paths: showPaths.toString(),
        include_drift: showDrift.toString(),
        include_timeline: showTimeline.toString(),
      })

      const res = await fetch(`/api/proxy/systems/${systemName}/behavioral-summary?${params}`)

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const json: ApiResponse = await res.json()
      const normalized = transformApiResponse(json)
      setData(normalized)

    } catch (err: any) {
      console.error('Failed to fetch behavioral summary:', err)
      setError(err.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [systemName, days, showPaths, showDrift, showTimeline])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSyncFromAWS = async () => {
    setSyncing(true)
    setSyncMessage(null)

    try {
      // Run all collectors in parallel
      const collectors = ['flow_logs', 'cloudtrail', 'config', 'iam']

      await Promise.all(collectors.map(async (collector) => {
        try {
          await fetch(`/api/proxy/collectors/run/${collector}`, { method: 'POST' })
        } catch (e) {
          console.warn(`Collector ${collector} failed:`, e)
        }
      }))

      // Refresh the data
      await fetchData()

      setSyncMessage({ type: 'success', text: 'Synced all data planes from AWS' })
      setTimeout(() => setSyncMessage(null), 5000)

    } catch (err: any) {
      setSyncMessage({ type: 'error', text: err.message || 'Sync failed' })
    } finally {
      setSyncing(false)
    }
  }

  const toggleSection = (section: string) => {
    const next = new Set(expandedSections)
    if (next.has(section)) {
      next.delete(section)
    } else {
      next.add(section)
    }
    setExpandedSections(next)
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-10 h-10 text-emerald-500 animate-spin" />
          <span className="text-slate-400">Loading behavioral intelligence...</span>
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center h-[600px]">
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-8 text-center max-w-md">
          <AlertTriangle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-rose-400 mb-2">Failed to Load</h3>
          <p className="text-slate-400 mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Sync Message Toast */}
      {syncMessage && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 ${
          syncMessage.type === 'success'
            ? 'bg-emerald-600 text-white'
            : 'bg-rose-600 text-white'
        }`}>
          {syncMessage.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <XCircle className="w-5 h-5" />
          )}
          <span>{syncMessage.text}</span>
          <button onClick={() => setSyncMessage(null)} className="ml-2 hover:opacity-70">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Activity className="w-7 h-7 text-emerald-400" />
            Behavioral Intelligence
          </h1>
          <p className="text-slate-400 mt-1">
            Correlating 4 data planes: Observed, Changed, Configured, Authorized
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Days selector */}
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500/50"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 180 days</option>
            <option value={365}>Last 365 days</option>
          </select>

          {/* Sync button */}
          <button
            onClick={handleSyncFromAWS}
            disabled={syncing}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              syncing
                ? 'bg-blue-600/50 text-blue-200 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {syncing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Sync from AWS
              </>
            )}
          </button>

          {/* Refresh button */}
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {data && (
        <>
          {/* Coverage Strip */}
          <CoverageStrip coverage={data.coverage} />

          {/* Scores Panel */}
          <section>
            <button
              onClick={() => toggleSection('scores')}
              className="w-full flex items-center justify-between py-2 text-left"
            >
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-emerald-400" />
                Confidence & Risk Scores
              </h2>
              {expandedSections.has('scores') ? (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-slate-400" />
              )}
            </button>
            {expandedSections.has('scores') && (
              <ScoresPanel
                confidence={data.scores.confidence}
                risk={data.scores.risk}
                network={data.network_summary}
                identity={data.identity_summary}
              />
            )}
          </section>

          {/* Critical Paths */}
          {showPaths && data.critical_paths.length > 0 && (
            <section>
              <button
                onClick={() => toggleSection('paths')}
                className="w-full flex items-center justify-between py-2 text-left"
              >
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Network className="w-5 h-5 text-violet-400" />
                  Critical Paths
                  <span className="px-2 py-0.5 bg-violet-500/20 text-violet-400 rounded text-sm">
                    {data.critical_paths.length}
                  </span>
                </h2>
                {expandedSections.has('paths') ? (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                )}
              </button>
              {expandedSections.has('paths') && (
                <CriticalPathsTable paths={data.critical_paths} />
              )}
            </section>
          )}

          {/* Drift Detection */}
          {showDrift && data.drift_items.length > 0 && (
            <section>
              <button
                onClick={() => toggleSection('drift')}
                className="w-full flex items-center justify-between py-2 text-left"
              >
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Eye className="w-5 h-5 text-amber-400" />
                  Drift Detection
                  <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-sm">
                    {data.drift_items.length}
                  </span>
                </h2>
                {expandedSections.has('drift') ? (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                )}
              </button>
              {expandedSections.has('drift') && (
                <DriftSection items={data.drift_items} />
              )}
            </section>
          )}

          {/* Timeline */}
          {showTimeline && data.timeline.length > 0 && (
            <section>
              <button
                onClick={() => toggleSection('timeline')}
                className="w-full flex items-center justify-between py-2 text-left"
              >
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-cyan-400" />
                  Activity Timeline
                  <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-sm">
                    {data.timeline.length}
                  </span>
                </h2>
                {expandedSections.has('timeline') ? (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                )}
              </button>
              {expandedSections.has('timeline') && (
                <TimelineSection events={data.timeline} />
              )}
            </section>
          )}

          {/* Anomalies (if any) */}
          {data.anomalies && data.anomalies.length > 0 && (
            <section className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-4">
              <h2 className="text-lg font-semibold text-rose-400 flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5" />
                Anomalies Detected
                <span className="px-2 py-0.5 bg-rose-500/20 text-rose-400 rounded text-sm">
                  {data.anomalies.length}
                </span>
              </h2>
              <div className="space-y-3">
                {data.anomalies.map((anomaly, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border ${
                      anomaly.severity === 'high'
                        ? 'bg-rose-500/10 border-rose-500/30'
                        : anomaly.severity === 'medium'
                        ? 'bg-amber-500/10 border-amber-500/30'
                        : 'bg-slate-700/30 border-slate-600/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-white font-medium">{anomaly.type.replace(/_/g, ' ')}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        anomaly.severity === 'high'
                          ? 'bg-rose-500/20 text-rose-400'
                          : anomaly.severity === 'medium'
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-slate-600/50 text-slate-400'
                      }`}>
                        {anomaly.severity}
                      </span>
                    </div>
                    <p className="text-slate-400 text-sm mt-1">{anomaly.description}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Footer */}
          <div className="text-center text-xs text-slate-500 pt-4 border-t border-slate-700/50">
            <p>
              Data window: {new Date(data.window.start).toLocaleDateString()} - {new Date(data.window.end).toLocaleDateString()}
              {' '} | System: {data.system_id}
            </p>
          </div>
        </>
      )}
    </div>
  )
}

export default BehavioralPage
