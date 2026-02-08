"use client"

import { useState, useEffect, useMemo } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  ReferenceLine,
} from "recharts"
import {
  Clock,
  RotateCcw,
  Download,
  Filter,
  ChevronDown,
  ChevronRight,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  FileText,
  Calendar,
  Database,
  Key,
  RefreshCw,
} from "lucide-react"

// ============================================================================
// TYPES
// ============================================================================

interface RemediationEvent {
  event_id: string
  timestamp: string
  resource_type: string
  resource_id: string
  action_type: string
  status: "completed" | "failed" | "rolled_back" | "pending"
  confidence_score: number
  approved_by: string
  snapshot_id?: string
  execution_id?: string
  rollback_available: boolean
  metadata: {
    permissions_removed?: number
    reason?: string
    rules_count?: { inbound: number; outbound: number }
    removed_permissions?: string[]
    [key: string]: any
  }
  before_state: Record<string, any>
  after_state: Record<string, any>
  summary: string
  // Source tracking
  source?: "neo4j" | "snapshot"
  // Snapshot-specific fields for rollback
  sg_id?: string
  sg_name?: string
  role_name?: string
  role_arn?: string
  bucket_name?: string
}

interface ChartDataPoint {
  date: string
  events: number
  permissions_removed: number
  security_score: number
  score_delta: number
}

interface TimelineSummary {
  total_events: number
  total_permissions_removed: number
  completed_events: number
  rollback_events: number
  avg_confidence: number
  period_start?: string
  period_end?: string
}

interface RemediationTimelineProps {
  systemId?: string
  resourceId?: string
  onRollback?: (eventId: string) => void
  apiBaseUrl?: string
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

const formatDateTime = (dateStr: string) => {
  const date = new Date(dateStr)
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "completed":
      return "#10B981" // Green
    case "failed":
      return "#EF4444" // Red
    case "rolled_back":
      return "#F59E0B" // Orange
    case "pending":
      return "#6B7280" // Gray
    default:
      return "#8B5CF6" // Purple
  }
}

const getActionIcon = (actionType: string) => {
  switch (actionType) {
    case "PERMISSION_REMOVAL":
      return <Key className="w-4 h-4" />
    case "ROLLBACK":
      return <RotateCcw className="w-4 h-4" />
    case "SG_RULE_REMOVED":
      return <Shield className="w-4 h-4" />
    case "S3_POLICY_REMOVED":
      return <Database className="w-4 h-4" />
    default:
      return <CheckCircle className="w-4 h-4" />
  }
}

const getResourceIcon = (resourceType: string) => {
  switch (resourceType) {
    case "IAMRole":
      return <Key className="w-4 h-4 text-purple-400" />
    case "SecurityGroup":
      return <Shield className="w-4 h-4 text-blue-400" />
    case "S3Bucket":
      return <Database className="w-4 h-4 text-orange-400" />
    default:
      return <CheckCircle className="w-4 h-4" />
  }
}

// ============================================================================
// CUSTOM CHART COMPONENTS
// ============================================================================

// Custom dot component for checkpoints
const CheckpointDot = (props: any) => {
  const { cx, cy, payload } = props
  const hasEvents = payload?.events > 0

  return (
    <g>
      {/* Base dot for all points */}
      <circle
        cx={cx}
        cy={cy}
        r={hasEvents ? 8 : 4}
        fill={hasEvents ? "#8B5CF6" : "#10B981"}
        stroke={hasEvents ? "#A78BFA" : "#34D399"}
        strokeWidth={2}
        style={{ cursor: hasEvents ? "pointer" : "default" }}
      />
      {/* Inner dot for events (checkpoint indicator) */}
      {hasEvents && (
        <>
          <circle cx={cx} cy={cy} r={4} fill="#ffffff" />
          <text
            x={cx}
            y={cy - 15}
            textAnchor="middle"
            fill="#8B5CF6"
            fontSize={10}
            fontWeight="bold"
          >
            {payload.events}
          </text>
        </>
      )}
    </g>
  )
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div
        className="rounded-lg p-3 border shadow-lg"
        style={{
          background: "var(--bg-secondary)",
          borderColor: "var(--border-subtle)",
        }}
      >
        <p className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>
          {label}
        </p>
        {data.events > 0 && (
          <p className="text-xs mt-1 px-2 py-1 rounded bg-purple-500/20 text-purple-400 font-medium">
            📍 {data.events} Event{data.events > 1 ? 's' : ''} on this date
          </p>
        )}
        <div className="mt-2 space-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          <p>Security Score: <span className="font-medium text-emerald-400">{Math.round(data.security_score)}%</span></p>
          <p>Events: <span className="font-medium">{data.events}</span></p>
          <p>Permissions Removed: <span className="font-medium text-blue-400">{data.permissions_removed}</span></p>
        </div>
      </div>
    )
  }
  return null
}

// ============================================================================
// EVENT DETAIL MODAL
// ============================================================================

interface EventDetailModalProps {
  event: RemediationEvent | null
  isOpen: boolean
  onClose: () => void
  onRollback: (eventId: string) => void
}

const EventDetailModal = ({ event, isOpen, onClose, onRollback }: EventDetailModalProps) => {
  const [showDiff, setShowDiff] = useState(false)

  if (!isOpen || !event) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal - Solid dark background for readability */}
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-auto rounded-xl border shadow-2xl"
        style={{
          background: "#1e1e2f",
          borderColor: "#3d3d5c",
        }}
      >
        {/* Header */}
        <div
          className="sticky top-0 flex items-center justify-between p-4 border-b"
          style={{
            background: "#1e1e2f",
            borderColor: "#3d3d5c"
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: `${getStatusColor(event.status)}20` }}
            >
              {getActionIcon(event.action_type)}
            </div>
            <div>
              <h2 className="font-semibold text-white">
                Remediation Event
              </h2>
              <p className="text-xs text-gray-400">
                {event.event_id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <XCircle className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Summary */}
          <div
            className="rounded-lg p-4 border"
            style={{
              background: "#252538",
              borderColor: "#3d3d5c",
            }}
          >
            <p className="text-sm text-white">
              {event.summary}
            </p>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  Date & Time
                </p>
                <p className="text-sm font-medium text-white">
                  {formatDateTime(event.timestamp)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  Resource
                </p>
                <div className="flex items-center gap-2">
                  {getResourceIcon(event.resource_type)}
                  <p className="text-sm font-medium font-mono text-white">
                    {event.resource_id}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  Action Type
                </p>
                <p className="text-sm font-medium text-white">
                  {event.action_type.replace(/_/g, " ")}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  Status
                </p>
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium"
                  style={{
                    background: `${getStatusColor(event.status)}20`,
                    color: getStatusColor(event.status),
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: getStatusColor(event.status) }}
                  />
                  {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                </span>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  Confidence
                </p>
                <p className="text-sm font-medium text-white">
                  {Math.round(event.confidence_score * 100)}%
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">
                  Approved By
                </p>
                <p className="text-sm font-medium text-white">
                  {event.approved_by}
                </p>
              </div>
            </div>
          </div>

          {/* Metadata */}
          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <div
              className="rounded-lg p-4 border"
              style={{
                background: "#252538",
                borderColor: "#3d3d5c",
              }}
            >
              <h3 className="text-sm font-medium mb-2 text-white">
                Details
              </h3>
              <div className="space-y-1">
                {Object.entries(event.metadata).filter(([k]) => k !== 'rules_count' && k !== 'removed_permissions').map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-gray-400">
                      {key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                    </span>
                    <span className="font-mono text-white">
                      {typeof value === "object" ? JSON.stringify(value) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Diff Toggle */}
          <button
            onClick={() => setShowDiff(!showDiff)}
            className="flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-80 text-purple-400"
          >
            {showDiff ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            {showDiff ? "Hide" : "Show"} State Changes
          </button>

          {/* Diff View */}
          {showDiff && (
            <div className="grid grid-cols-2 gap-4">
              <div
                className="rounded-lg p-3 border"
                style={{
                  background: "#3d1f1f",
                  borderColor: "#6b2c2c",
                }}
              >
                <p className="text-xs font-medium mb-2 text-red-400">Before</p>
                <pre className="text-xs overflow-auto max-h-40 text-gray-300">
                  {JSON.stringify(event.before_state, null, 2)}
                </pre>
              </div>
              <div
                className="rounded-lg p-3 border"
                style={{
                  background: "#1f3d2a",
                  borderColor: "#2c6b3d",
                }}
              >
                <p className="text-xs font-medium mb-2 text-emerald-400">After</p>
                <pre className="text-xs overflow-auto max-h-40 text-gray-300">
                  {JSON.stringify(event.after_state, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="sticky bottom-0 flex items-center justify-between p-4 border-t"
          style={{
            background: "#1e1e2f",
            borderColor: "#3d3d5c",
          }}
        >
          <div className="flex items-center gap-2">
            {event.snapshot_id && (
              <span className="text-xs px-2 py-1 rounded bg-blue-900/50 text-blue-400">
                Snapshot: {event.snapshot_id.slice(0, 20)}...
              </span>
            )}
            {event.source && (
              <span className={`text-xs px-2 py-1 rounded ${event.source === 'neo4j' ? 'bg-purple-900/50 text-purple-400' : 'bg-green-900/50 text-green-400'}`}>
                {event.source === 'neo4j' ? 'Neo4j Event' : 'Checkpoint'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-600 text-gray-300 transition-colors hover:bg-white/5"
            >
              Close
            </button>
            {event.rollback_available && event.status === "completed" && (
              <button
                onClick={() => onRollback(event.event_id)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
                style={{ background: "#F59E0B" }}
              >
                <RotateCcw className="w-4 h-4" />
                Rollback
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function RemediationTimeline({
  systemId,
  resourceId,
  onRollback,
  apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "https://saferemediate-backend.onrender.com",
}: RemediationTimelineProps) {
  const [events, setEvents] = useState<RemediationEvent[]>([])
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [summary, setSummary] = useState<TimelineSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedPeriod, setSelectedPeriod] = useState<"7d" | "30d" | "90d" | "1y">("30d")
  const [selectedEvent, setSelectedEvent] = useState<RemediationEvent | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Manual refresh function
  const refreshTimeline = () => {
    setRefreshKey(prev => prev + 1)
  }

  // Convert snapshot to RemediationEvent format
  const convertSnapshotToEvent = (snapshot: any): RemediationEvent => {
    const isIAMRole = snapshot.type === 'IAMRole' || snapshot.snapshot_id?.startsWith('IAMRole-') || snapshot.snapshot_id?.startsWith('iam-')
    const isS3Bucket = snapshot.type === 'S3Bucket' || snapshot.snapshot_id?.startsWith('S3Bucket-') || snapshot.snapshot_id?.startsWith('s3-')

    let resourceType = 'SecurityGroup'
    let actionType = 'SG_RULE_REMOVED'
    let resourceId = snapshot.sg_id || snapshot.sg_name || ''
    let summary = ''

    if (isIAMRole) {
      resourceType = 'IAMRole'
      actionType = 'PERMISSION_REMOVAL'
      let roleName = snapshot.role_name || snapshot.current_state?.role_name
      if (!roleName && snapshot.snapshot_id?.startsWith('IAMRole-')) {
        const parts = snapshot.snapshot_id.replace('IAMRole-', '').split('-')
        parts.pop()
        roleName = parts.join('-') || 'Unknown Role'
      }
      resourceId = roleName || 'Unknown Role'
      const permsRemoved = snapshot.removed_permissions?.length || snapshot.permissions_count || 0
      summary = `Removed ${permsRemoved} permissions from ${resourceId}`
    } else if (isS3Bucket) {
      resourceType = 'S3Bucket'
      actionType = 'S3_POLICY_REMOVED'
      resourceId = snapshot.finding_id || snapshot.current_state?.resource_name || 'Unknown Bucket'
      summary = `Policy checkpoint for ${resourceId}`
    } else {
      resourceId = snapshot.sg_name || snapshot.sg_id || snapshot.finding_id || 'Unknown SG'
      const rulesRemoved = snapshot.rules_count?.inbound || 0
      summary = `Removed ${rulesRemoved} inbound rules from ${resourceId}`
    }

    return {
      event_id: snapshot.snapshot_id,
      timestamp: snapshot.timestamp || snapshot.created_at || new Date().toISOString(),
      resource_type: resourceType,
      resource_id: resourceId,
      action_type: actionType,
      status: snapshot.restored_at ? 'rolled_back' : 'completed',
      confidence_score: 0.95,
      approved_by: snapshot.triggered_by || 'system',
      snapshot_id: snapshot.snapshot_id,
      rollback_available: true,
      metadata: {
        reason: snapshot.reason || 'Remediation backup',
        rules_count: snapshot.rules_count,
        removed_permissions: snapshot.removed_permissions,
        permissions_removed: snapshot.removed_permissions?.length || snapshot.permissions_count || 0,
      },
      before_state: snapshot.current_state || {},
      after_state: {},
      summary,
      source: 'snapshot',
      sg_id: snapshot.sg_id,
      sg_name: snapshot.sg_name,
      role_name: snapshot.role_name || resourceId,
      role_arn: snapshot.role_arn,
      bucket_name: isS3Bucket ? resourceId : undefined,
    }
  }

  // Fetch timeline data from both Neo4j API and snapshots
  useEffect(() => {
    const fetchTimeline = async () => {
      setLoading(true)
      setError(null)

      try {
        const periodDays = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 }
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - periodDays[selectedPeriod])
        const today = new Date()

        // Fetch from both sources in parallel
        const [neo4jRes, sgRes, iamRes] = await Promise.all([
          // 1. Neo4j Timeline API (primary source for recorded events) - use proxy to avoid CORS
          fetch(`/api/proxy/remediation-history/timeline?start_date=${startDate.toISOString()}&end_date=${today.toISOString()}&limit=200`)
            .catch(() => null),
          // 2. Snapshots (to include any checkpoints not yet in Neo4j)
          fetch('/api/proxy/snapshots', { cache: 'no-store' }).catch(() => null),
          fetch('/api/proxy/iam-snapshots', { cache: 'no-store' }).catch(() => null)
        ])

        let allEvents: RemediationEvent[] = []
        let neo4jChartData: ChartDataPoint[] = []
        let neo4jSummary: TimelineSummary | null = null

        // Process Neo4j timeline data (primary)
        if (neo4jRes && neo4jRes.ok) {
          const neo4jData = await neo4jRes.json()
          const neo4jEvents = (neo4jData.events || []).map((e: any) => ({
            ...e,
            source: 'neo4j' as const
          }))
          allEvents.push(...neo4jEvents)
          neo4jChartData = neo4jData.chart_data || []
          neo4jSummary = neo4jData.summary || null
        }

        // Process snapshots (secondary - fill in any missing)
        let snapshotEvents: RemediationEvent[] = []

        if (sgRes && sgRes.ok) {
          const sgData = await sgRes.json()
          const sgList = Array.isArray(sgData) ? sgData : (sgData.snapshots || [])
          const typedSnapshots = sgList.map((s: any) => {
            if (s.snapshot_id?.startsWith('IAMRole-') || s.snapshot_id?.startsWith('iam-') || s.resource_type === 'IAMRole') {
              return { ...s, type: 'IAMRole' }
            }
            if (s.snapshot_id?.startsWith('S3Bucket-') || s.snapshot_id?.startsWith('s3-') || s.resource_type === 'S3Bucket') {
              return { ...s, type: 'S3Bucket' }
            }
            return { ...s, type: 'SecurityGroup' }
          })
          snapshotEvents.push(...typedSnapshots.map(convertSnapshotToEvent))
        }

        if (iamRes && iamRes.ok) {
          const iamData = await iamRes.json()
          const iamList = Array.isArray(iamData) ? iamData : (iamData.snapshots || [])
          snapshotEvents.push(...iamList.map((s: any) => convertSnapshotToEvent({ ...s, type: 'IAMRole' })))
        }

        // Merge: Add snapshot events not already in Neo4j (by snapshot_id)
        const neo4jSnapshotIds = new Set(allEvents.map(e => e.snapshot_id).filter(Boolean))
        const uniqueSnapshotEvents = snapshotEvents.filter(e => !neo4jSnapshotIds.has(e.snapshot_id))
        allEvents.push(...uniqueSnapshotEvents)

        // Filter by date range
        allEvents = allEvents.filter(e => {
          const ts = new Date(e.timestamp)
          return ts >= startDate && ts <= today
        })

        // Sort by timestamp (newest first)
        allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

        // Generate chart data if Neo4j didn't provide it
        let finalChartData = neo4jChartData
        if (finalChartData.length === 0 && allEvents.length > 0) {
          const chartDataMap = new Map<string, ChartDataPoint>()

          for (let i = periodDays[selectedPeriod]; i >= 0; i--) {
            const date = new Date(today)
            date.setDate(date.getDate() - i)
            const dateKey = date.toISOString().split('T')[0]
            chartDataMap.set(dateKey, {
              date: dateKey,
              events: 0,
              permissions_removed: 0,
              security_score: 60 + ((periodDays[selectedPeriod] - i) / periodDays[selectedPeriod]) * 35,
              score_delta: 0,
            })
          }

          allEvents.forEach(event => {
            const dateKey = event.timestamp.split('T')[0]
            const existing = chartDataMap.get(dateKey)
            if (existing) {
              existing.events += 1
              existing.permissions_removed += event.metadata.permissions_removed || 0
              existing.score_delta += 1
            }
          })

          finalChartData = Array.from(chartDataMap.values())
        }

        // Calculate summary if Neo4j didn't provide it
        const finalSummary: TimelineSummary = neo4jSummary || {
          total_events: allEvents.length,
          total_permissions_removed: allEvents.reduce((acc, e) => acc + (e.metadata.permissions_removed || 0), 0),
          completed_events: allEvents.filter(e => e.status === 'completed').length,
          rollback_events: allEvents.filter(e => e.status === 'rolled_back' || e.action_type === 'ROLLBACK').length,
          avg_confidence: allEvents.length > 0
            ? Math.round(allEvents.reduce((acc, e) => acc + e.confidence_score * 100, 0) / allEvents.length)
            : 0,
          period_start: startDate.toISOString().split('T')[0],
          period_end: today.toISOString().split('T')[0],
        }

        setEvents(allEvents)
        setChartData(finalChartData)
        setSummary(finalSummary)

      } catch (err: any) {
        console.error("Timeline fetch error:", err)
        setError(err.message)
        setEvents([])
        setChartData([])
        setSummary(null)
      } finally {
        setLoading(false)
      }
    }

    fetchTimeline()
  }, [selectedPeriod, systemId, resourceId, apiBaseUrl, refreshKey])

  // Handle rollback - uses correct endpoint based on source and resource type
  const handleRollback = async (eventId: string) => {
    const event = events.find(e => e.event_id === eventId)
    if (!event) {
      alert("Event not found")
      return
    }

    const resourceName = event.resource_id
    const resourceType = event.resource_type

    let confirmMessage = `⚠️ Restore ${resourceType} to previous state?\n\nResource: ${resourceName}\n\nThis will undo the remediation. Continue?`

    if (!confirm(confirmMessage)) {
      return
    }

    try {
      let endpoint: string
      let bodyContent: any = undefined
      const snapshotId = event.snapshot_id || eventId

      // If it's a Neo4j event, use the timeline rollback API (via proxy)
      if (event.source === 'neo4j') {
        endpoint = `/api/proxy/remediation-history/events/${eventId}/rollback`
        bodyContent = { approved_by: "user@cyntro.io" }
      }
      // Otherwise, use the snapshot-specific endpoints
      else if (resourceType === 'IAMRole') {
        endpoint = `/api/proxy/iam-snapshots/${snapshotId}/rollback`
      } else if (resourceType === 'S3Bucket') {
        endpoint = `/api/proxy/s3-buckets/rollback`
        bodyContent = {
          checkpoint_id: snapshotId,
          bucket_name: event.bucket_name || event.resource_id || ''
        }
      } else {
        const isSgLpSnapshot = snapshotId?.startsWith('sg-snap-')
        if (isSgLpSnapshot) {
          const sgId = event.sg_id || event.resource_id || ''
          endpoint = `/api/proxy/sg-least-privilege/${sgId}/rollback`
          bodyContent = { snapshot_id: snapshotId }
        } else {
          endpoint = `/api/proxy/remediation/rollback/${snapshotId}`
        }
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(bodyContent && { body: JSON.stringify(bodyContent) })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || errorData.detail || `Rollback failed: ${response.status}`)
      }

      const result = await response.json()

      if (result.success !== false) {
        alert(`✅ Restored Successfully!\n\n${resourceType}: ${resourceName}\n\nThe resource has been restored to its previous state.`)
      } else {
        throw new Error(result.error || 'Rollback failed')
      }

      setShowModal(false)
      setSelectedEvent(null)
      onRollback?.(eventId)
      refreshTimeline()
    } catch (err: any) {
      alert(`❌ Rollback failed: ${err.message}`)
    }
  }

  // Handle export (via proxy to avoid CORS)
  const handleExport = async () => {
    try {
      const response = await fetch(`/api/proxy/remediation-history/export?format=csv`)
      const data = await response.json()

      if (data.content) {
        const blob = new Blob([typeof data.content === 'string' ? data.content : JSON.stringify(data.content, null, 2)],
          { type: data.format === 'csv' ? "text/csv" : "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = data.filename || `remediation_history_${new Date().toISOString().split('T')[0]}.${data.format || 'json'}`
        a.click()
      }
    } catch (err) {
      console.error("Export failed:", err)
      alert("Export failed. Please try again.")
    }
  }

  return (
    <div
      className="rounded-xl border"
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--border-subtle)",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
      }}
    >
      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
              <Clock className="w-5 h-5" style={{ color: "var(--action-primary)" }} />
              Remediation Timeline
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              Complete audit trail with one-click rollback
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Period Selector */}
            {(["7d", "30d", "90d", "1y"] as const).map((period) => (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{
                  background: selectedPeriod === period ? "var(--action-primary)" : "transparent",
                  color: selectedPeriod === period ? "white" : "var(--text-secondary)",
                  border: selectedPeriod === period ? "none" : "1px solid var(--border)",
                }}
              >
                {period === "7d" && "7 Days"}
                {period === "30d" && "30 Days"}
                {period === "90d" && "90 Days"}
                {period === "1y" && "1 Year"}
              </button>
            ))}

            <button
              onClick={refreshTimeline}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-white/5"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
              title="Refresh timeline"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors hover:bg-white/5"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        {summary && (
          <div className="grid grid-cols-4 gap-4 mt-4">
            <div className="rounded-lg p-3" style={{ background: "var(--bg-primary)" }}>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Total Events</p>
              <p className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                {summary.total_events}
              </p>
            </div>
            <div className="rounded-lg p-3" style={{ background: "var(--bg-primary)" }}>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Permissions Removed</p>
              <p className="text-xl font-bold text-emerald-400">
                {summary.total_permissions_removed}
              </p>
            </div>
            <div className="rounded-lg p-3" style={{ background: "var(--bg-primary)" }}>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Rollbacks</p>
              <p className="text-xl font-bold text-orange-400">
                {summary.rollback_events}
              </p>
            </div>
            <div className="rounded-lg p-3" style={{ background: "var(--bg-primary)" }}>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Avg Confidence</p>
              <p className="text-xl font-bold" style={{ color: "var(--action-primary)" }}>
                {summary.avg_confidence}%
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="p-4" style={{ background: "var(--bg-primary)" }}>
        {loading ? (
          <div className="h-[200px] flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: "var(--action-primary)" }} />
          </div>
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="securityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
              <XAxis
                dataKey="date"
                tick={{ fill: "#9CA3AF", fontSize: 11 }}
                tickFormatter={formatDate}
                axisLine={{ stroke: "#374151" }}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: "#9CA3AF", fontSize: 11 }}
                axisLine={{ stroke: "#374151" }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="security_score"
                stroke="#10B981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#securityGradient)"
                dot={<CheckpointDot />}
                activeDot={{ r: 6, stroke: "#10B981", strokeWidth: 2, fill: "#ffffff" }}
              />
              {/* Vertical lines for events */}
              {chartData.filter(d => d.events > 0).map((point, idx) => (
                <ReferenceLine
                  key={idx}
                  x={point.date}
                  stroke="#8B5CF6"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  opacity={0.7}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center">
            <p style={{ color: "var(--text-secondary)" }}>No data available for this period</p>
          </div>
        )}
      </div>

      {/* Events List */}
      <div className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="p-4">
          <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-primary)" }}>
            Remediation Events ({events.length})
          </h3>

          {events.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--text-secondary)" }} />
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                No remediation events in this period
              </p>
              <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
                Events are recorded when you remediate Security Groups, IAM Roles, or S3 Buckets
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {events.map((event) => (
                <div
                  key={event.event_id}
                  className="flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer hover:border-opacity-70"
                  style={{
                    background: "var(--bg-primary)",
                    borderColor: hoveredEventId === event.event_id
                      ? getStatusColor(event.status)
                      : "var(--border-subtle)",
                  }}
                  onMouseEnter={() => setHoveredEventId(event.event_id)}
                  onMouseLeave={() => setHoveredEventId(null)}
                  onClick={() => {
                    setSelectedEvent(event)
                    setShowModal(true)
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ background: getStatusColor(event.status) }}
                      />
                      {getResourceIcon(event.resource_type)}
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {event.summary}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                        {formatDateTime(event.timestamp)} • {event.approved_by}
                        {event.source === 'neo4j' && (
                          <span className="text-purple-400 ml-2">● Neo4j</span>
                        )}
                        {event.confidence_score > 0 && (
                          <span className="text-emerald-400 ml-2">
                            {Math.round(event.confidence_score * 100)}% confidence
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {event.rollback_available && event.status === "completed" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRollback(event.event_id)
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors hover:bg-orange-500/20"
                        style={{ color: "#F59E0B" }}
                      >
                        <RotateCcw className="w-3 h-3" />
                        Rollback
                      </button>
                    )}
                    <Eye className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Event Detail Modal */}
      <EventDetailModal
        event={selectedEvent}
        isOpen={showModal}
        onClose={() => {
          setShowModal(false)
          setSelectedEvent(null)
        }}
        onRollback={handleRollback}
      />
    </div>
  )
}

export default RemediationTimeline
