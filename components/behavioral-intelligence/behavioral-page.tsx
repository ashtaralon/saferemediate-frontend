'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Activity, RefreshCw, AlertTriangle, CheckCircle, XCircle,
  Network, Eye, Clock, ChevronDown, ChevronRight, Users, Shield
} from 'lucide-react'
import { CoverageStrip } from './coverage-strip'
import { CriticalPathsTable } from './critical-paths-table'
import { TimelineSection } from './timeline'
import { ConnectivitySection, EdgeFact } from './connectivity-section'
import { IdentitySection } from './identity-section'
import { DetectionsSection, Detection } from './detections-section'
import { ReconciliationLegend } from './reconciliation-badge'

// ============================================================================
// Types
// ============================================================================

interface PlaneStatus {
  present: boolean
  data_points?: number
  gaps_hours?: number
  delay_minutes_p95?: number
  last_recorded_minutes_ago?: number
  plane?: string
  coverage_days?: number
}

interface CoverageStatus {
  flow_logs: PlaneStatus
  cloudtrail: PlaneStatus
  config: PlaneStatus
  iam: PlaneStatus
}

interface CriticalPath {
  src_key: string
  src_name: string
  src_type?: string
  dst_key: string
  dst_name: string
  dst_type?: string
  path: string[]
  port: number
  protocol: string
  observed: boolean
  configured_possible: boolean
  confidence?: string
  risk_flags: string[]
  evidence_planes?: string[]
}

interface TimelineEvent {
  ts: string
  type: string
  summary: string
  severity: string
  plane: string
  details?: Record<string, any>
}

interface ApiResponse {
  system_id: string
  window: { start: string; end: string; days?: number }
  coverage: any
  confidence?: any
  risk?: any
  critical_paths: CriticalPath[]
  drift_items?: any[]
  timeline: any[]
  network?: any
  identity?: any
  anomalies?: any[]
  dependencies?: {
    observed_inbound?: EdgeFact[]
    observed_outbound?: EdgeFact[]
  }
}

interface BehavioralData {
  system_id: string
  window: { start: string; end: string }
  coverage: CoverageStatus
  critical_paths: CriticalPath[]
  timeline: TimelineEvent[]
  connectivity: {
    inbound: EdgeFact[]
    outbound: EdgeFact[]
  }
  identity: {
    workloadIdentities: any[]
    controlPlaneActors: any[]
    apiDependencies: any[]
    totalRoles: number
    rolesWithUnused: number
    adminRoles: number
  }
  detections: Detection[]
}

interface BehavioralPageProps {
  systemName: string
}

// ============================================================================
// Transform API response
// ============================================================================

function transformApiResponse(api: ApiResponse): BehavioralData {
  // Transform timeline events
  const timeline: TimelineEvent[] = (api.timeline || []).map(event => ({
    ts: event.timestamp || event.ts,
    type: event.event_type || event.type,
    summary: event.summary,
    severity: event.severity,
    plane: event.plane,
    details: event.details,
  }))

  // Transform anomalies to detections
  const detections: Detection[] = (api.anomalies || []).map(anomaly => ({
    type: anomaly.type,
    severity: anomaly.severity,
    description: anomaly.description,
    port: anomaly.port,
    hits: anomaly.hits,
    resource_name: anomaly.resource_name,
    resource_key: anomaly.resource_key,
    planes: {
      observed: true,
      configured: null,
      authorized: null,
      changed: null,
    },
  }))

  // Add drift items as detections
  if (api.drift_items) {
    api.drift_items.forEach(drift => {
      detections.push({
        type: drift.drift_type || 'config_drift',
        severity: drift.severity || 'medium',
        description: drift.description,
        resource_name: drift.resource_name,
        resource_key: drift.resource_key,
        planes: {
          observed: drift.observed_value !== null,
          configured: drift.configured_value !== null,
          authorized: null,
          changed: null,
        },
      })
    })
  }

  return {
    system_id: api.system_id,
    window: { start: api.window.start, end: api.window.end },
    coverage: {
      flow_logs: api.coverage?.flow_logs || { present: false },
      cloudtrail: api.coverage?.cloudtrail || { present: false },
      config: api.coverage?.config || { present: false },
      iam: api.coverage?.iam || { present: false },
    },
    critical_paths: api.critical_paths || [],
    timeline,
    connectivity: {
      inbound: api.dependencies?.observed_inbound || [],
      outbound: api.dependencies?.observed_outbound || [],
    },
    identity: {
      workloadIdentities: api.identity?.workload_identities || [],
      controlPlaneActors: api.identity?.control_plane_actors || [],
      apiDependencies: api.identity?.api_dependencies || [],
      totalRoles: api.identity?.total_roles || 0,
      rolesWithUnused: api.identity?.roles_with_unused || 0,
      adminRoles: api.identity?.admin_roles || 0,
    },
    detections,
  }
}

// ============================================================================
// Main Component
// ============================================================================

export function BehavioralPage({ systemName }: BehavioralPageProps) {
  const [data, setData] = useState<BehavioralData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Filter state
  const [days, setDays] = useState(90)

  // Expanded sections
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['connectivity', 'paths', 'detections', 'timeline'])
  )

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        days: days.toString(),
        include_paths: 'true',
        include_drift: 'true',
        include_timeline: 'true',
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
  }, [systemName, days])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSyncFromAWS = async () => {
    setSyncing(true)
    setSyncMessage(null)

    try {
      const collectors = ['flow_logs', 'cloudtrail', 'config', 'iam']
      await Promise.all(collectors.map(async (collector) => {
        try {
          await fetch(`/api/proxy/collectors/run/${collector}`, { method: 'POST' })
        } catch (e) {
          console.warn(`Collector ${collector} failed:`, e)
        }
      }))

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
          <span className="text-slate-400">Loading behavioral facts...</span>
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
            Behavioral Facts
          </h1>
          <p className="text-slate-400 mt-1">
            Evidence-based view across 4 data planes: Observed, Changed, Configured, Authorized
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

      {/* Legend */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg px-4 py-2">
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-500 uppercase tracking-wider">Plane Badges:</span>
          <ReconciliationLegend />
        </div>
      </div>

      {data && (
        <>
          {/* Coverage Strip */}
          <CoverageStrip coverage={data.coverage} />

          {/* Connectivity Section */}
          <section>
            <button
              onClick={() => toggleSection('connectivity')}
              className="w-full flex items-center justify-between py-2 text-left"
            >
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Network className="w-5 h-5 text-violet-400" />
                Connectivity
                <span className="px-2 py-0.5 bg-violet-500/20 text-violet-400 rounded text-sm">
                  {data.connectivity.inbound.length + data.connectivity.outbound.length}
                </span>
              </h2>
              {expandedSections.has('connectivity') ? (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-slate-400" />
              )}
            </button>
            {expandedSections.has('connectivity') && (
              <ConnectivitySection
                inboundEdges={data.connectivity.inbound}
                outboundEdges={data.connectivity.outbound}
              />
            )}
          </section>

          {/* Identity Section */}
          <section>
            <button
              onClick={() => toggleSection('identity')}
              className="w-full flex items-center justify-between py-2 text-left"
            >
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-400" />
                Identity & Change
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-sm">
                  {data.identity.controlPlaneActors.length} actors
                </span>
              </h2>
              {expandedSections.has('identity') ? (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-slate-400" />
              )}
            </button>
            {expandedSections.has('identity') && (
              <IdentitySection
                workloadIdentities={data.identity.workloadIdentities}
                controlPlaneActors={data.identity.controlPlaneActors}
                apiDependencies={data.identity.apiDependencies}
                totalRoles={data.identity.totalRoles}
                rolesWithUnused={data.identity.rolesWithUnused}
                adminRoles={data.identity.adminRoles}
              />
            )}
          </section>

          {/* Critical Paths */}
          {data.critical_paths.length > 0 && (
            <section>
              <button
                onClick={() => toggleSection('paths')}
                className="w-full flex items-center justify-between py-2 text-left"
              >
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-emerald-400" />
                  Critical Paths
                  <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-sm">
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

          {/* Detections */}
          {data.detections.length > 0 && (
            <section>
              <button
                onClick={() => toggleSection('detections')}
                className="w-full flex items-center justify-between py-2 text-left"
              >
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  Detections
                  <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-sm">
                    {data.detections.length}
                  </span>
                </h2>
                {expandedSections.has('detections') ? (
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                )}
              </button>
              {expandedSections.has('detections') && (
                <DetectionsSection detections={data.detections} />
              )}
            </section>
          )}

          {/* Timeline */}
          {data.timeline.length > 0 && (
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
