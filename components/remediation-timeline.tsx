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
      return <Shield className="w-4 h-4" />
    case "ROLLBACK":
      return <RotateCcw className="w-4 h-4" />
    case "SG_RULE_REMOVED":
      return <AlertTriangle className="w-4 h-4" />
    default:
      return <CheckCircle className="w-4 h-4" />
  }
}

// ============================================================================
// CUSTOM TOOLTIP COMPONENT
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
            📍 {data.events} Checkpoint{data.events > 1 ? 's' : ''} on this date
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

      {/* Modal */}
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-auto rounded-xl border shadow-2xl"
        style={{
          background: "var(--bg-secondary)",
          borderColor: "var(--border-subtle)",
        }}
      >
        {/* Header */}
        <div
          className="sticky top-0 flex items-center justify-between p-4 border-b"
          style={{ 
            background: "var(--bg-secondary)",
            borderColor: "var(--border-subtle)" 
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
              <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
                Remediation Event
              </h2>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {event.event_id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <XCircle className="w-5 h-5" style={{ color: "var(--text-secondary)" }} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Summary */}
          <div
            className="rounded-lg p-4 border"
            style={{
              background: "var(--bg-primary)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>
              {event.summary}
            </p>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                  Date & Time
                </p>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {formatDateTime(event.timestamp)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                  Resource
                </p>
                <p className="text-sm font-medium font-mono" style={{ color: "var(--text-primary)" }}>
                  {event.resource_id}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                  Action Type
                </p>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {event.action_type.replace(/_/g, " ")}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
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
                <p className="text-xs uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                  Confidence
                </p>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {Math.round(event.confidence_score * 100)}%
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                  Approved By
                </p>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
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
                background: "var(--bg-primary)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <h3 className="text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                Details
              </h3>
              <div className="space-y-1">
                {Object.entries(event.metadata).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span style={{ color: "var(--text-secondary)" }}>
                      {key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                    </span>
                    <span className="font-mono" style={{ color: "var(--text-primary)" }}>
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
            className="flex items-center gap-2 text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: "var(--action-primary)" }}
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
                  background: "rgba(239, 68, 68, 0.1)",
                  borderColor: "rgba(239, 68, 68, 0.3)",
                }}
              >
                <p className="text-xs font-medium mb-2 text-red-400">Before</p>
                <pre className="text-xs overflow-auto max-h-40" style={{ color: "var(--text-secondary)" }}>
                  {JSON.stringify(event.before_state, null, 2)}
                </pre>
              </div>
              <div
                className="rounded-lg p-3 border"
                style={{
                  background: "rgba(16, 185, 129, 0.1)",
                  borderColor: "rgba(16, 185, 129, 0.3)",
                }}
              >
                <p className="text-xs font-medium mb-2 text-emerald-400">After</p>
                <pre className="text-xs overflow-auto max-h-40" style={{ color: "var(--text-secondary)" }}>
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
            background: "var(--bg-secondary)",
            borderColor: "var(--border-subtle)",
          }}
        >
          <div className="flex items-center gap-2">
            {event.snapshot_id && (
              <span className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400">
                Snapshot: {event.snapshot_id.slice(0, 16)}...
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-white/5"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
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
      // Extract role name from snapshot_id if not provided
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
      summary = `Policy checkpoint created for ${resourceId}`
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
      // Keep original fields for rollback
      sg_id: snapshot.sg_id,
      sg_name: snapshot.sg_name,
      role_name: snapshot.role_name || resourceId,
      role_arn: snapshot.role_arn,
      bucket_name: isS3Bucket ? resourceId : undefined,
    }
  }

  // Fetch timeline data
  useEffect(() => {
    const fetchTimeline = async () => {
      setLoading(true)
      setError(null)

      try {
        // Calculate date range based on period
        const periodDays = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 }
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - periodDays[selectedPeriod])

        // Fetch real snapshots from both SG and IAM endpoints
        const [sgRes, iamRes] = await Promise.all([
          fetch('/api/proxy/snapshots', { cache: 'no-store' }).catch(() => null),
          fetch('/api/proxy/iam-snapshots', { cache: 'no-store' }).catch(() => null)
        ])

        let allSnapshots: any[] = []

        // Process SG/S3 snapshots
        if (sgRes && sgRes.ok) {
          const sgData = await sgRes.json()
          const sgList = Array.isArray(sgData) ? sgData : (sgData.snapshots || [])
          // Detect and assign types
          const typedSnapshots = sgList.map((s: any) => {
            if (s.snapshot_id?.startsWith('IAMRole-') || s.snapshot_id?.startsWith('iam-')) {
              return { ...s, type: 'IAMRole' }
            }
            if (s.snapshot_id?.startsWith('S3Bucket-') || s.snapshot_id?.startsWith('s3-')) {
              return { ...s, type: 'S3Bucket' }
            }
            if (s.resource_type === 'IAMRole' || s.current_state?.checkpoint_type === 'IAMRole') {
              return { ...s, type: 'IAMRole' }
            }
            if (s.resource_type === 'S3Bucket' || s.current_state?.checkpoint_type === 'S3Bucket') {
              return { ...s, type: 'S3Bucket' }
            }
            return { ...s, type: 'SecurityGroup' }
          })
          allSnapshots.push(...typedSnapshots)
        }

        // Process IAM snapshots
        if (iamRes && iamRes.ok) {
          const iamData = await iamRes.json()
          const iamList = Array.isArray(iamData) ? iamData : (iamData.snapshots || [])
          const iamSnapshots = iamList.map((s: any) => ({ ...s, type: 'IAMRole' }))
          allSnapshots.push(...iamSnapshots)
        }

        // Filter by date range
        const filteredSnapshots = allSnapshots.filter(s => {
          const ts = new Date(s.timestamp || s.created_at || 0)
          return ts >= startDate
        })

        // Convert to RemediationEvent format
        const snapshotEvents = filteredSnapshots.map(convertSnapshotToEvent)

        // Sort by timestamp (newest first)
        snapshotEvents.sort((a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )

        // Generate chart data from snapshots
        const chartDataMap = new Map<string, ChartDataPoint>()
        const today = new Date()

        // Initialize all days in period
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

        // Populate with actual events
        snapshotEvents.forEach(event => {
          const dateKey = event.timestamp.split('T')[0]
          const existing = chartDataMap.get(dateKey)
          if (existing) {
            existing.events += 1
            existing.permissions_removed += event.metadata.permissions_removed || 0
            existing.score_delta += 1
          }
        })

        // Convert map to array
        const chartDataArray = Array.from(chartDataMap.values())

        // Calculate summary
        const summaryData: TimelineSummary = {
          total_events: snapshotEvents.length,
          total_permissions_removed: snapshotEvents.reduce((acc, e) => acc + (e.metadata.permissions_removed || 0), 0),
          completed_events: snapshotEvents.filter(e => e.status === 'completed').length,
          rollback_events: snapshotEvents.filter(e => e.status === 'rolled_back').length,
          avg_confidence: snapshotEvents.length > 0
            ? Math.round(snapshotEvents.reduce((acc, e) => acc + e.confidence_score * 100, 0) / snapshotEvents.length)
            : 0,
          period_start: startDate.toISOString().split('T')[0],
          period_end: today.toISOString().split('T')[0],
        }

        setEvents(snapshotEvents)
        setChartData(chartDataArray)
        setSummary(summaryData)

      } catch (err: any) {
        console.error("Timeline fetch error:", err)
        setError(err.message)

        // Use empty state on error
        setEvents([])
        setChartData([])
        setSummary(null)
      } finally {
        setLoading(false)
      }
    }

    fetchTimeline()
  }, [selectedPeriod, systemId, resourceId, apiBaseUrl, refreshKey])

  // Handle rollback - uses correct endpoint based on resource type
  const handleRollback = async (eventId: string) => {
    const event = events.find(e => e.event_id === eventId)
    if (!event) {
      alert("Event not found")
      return
    }

    const resourceName = event.resource_id
    const resourceType = event.resource_type

    let confirmMessage = "Are you sure you want to rollback this remediation? This will restore the previous state."
    if (resourceType === 'IAMRole') {
      confirmMessage = `⚠️ Restore IAM Role snapshot?\n\nThis will restore permissions to ${resourceName}\n\nContinue?`
    } else if (resourceType === 'S3Bucket') {
      confirmMessage = `⚠️ Restore S3 Bucket checkpoint?\n\nThis will restore the bucket policy for ${resourceName}\n\nContinue?`
    } else {
      confirmMessage = `⚠️ Restore Security Group snapshot?\n\nThis will restore rules for ${resourceName}\n\nContinue?`
    }

    if (!confirm(confirmMessage)) {
      return
    }

    try {
      let endpoint: string
      let bodyContent: any = undefined
      const snapshotId = event.snapshot_id || eventId

      if (resourceType === 'IAMRole') {
        endpoint = `/api/proxy/iam-snapshots/${snapshotId}/rollback`
      } else if (resourceType === 'S3Bucket') {
        endpoint = `/api/proxy/s3-buckets/rollback`
        bodyContent = {
          checkpoint_id: snapshotId,
          bucket_name: event.bucket_name || event.resource_id || ''
        }
      } else {
        // Security Group - check if it's a new LP snapshot format
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

      if (result.success) {
        let successMessage = '✅ Restored Successfully!'
        if (resourceType === 'IAMRole') {
          successMessage = `✅ Restored Successfully!\n\nIAM Role: ${result.role_name || resourceName}\nPermissions restored: ${result.permissions_restored || 'All'}`
        } else if (resourceType === 'S3Bucket') {
          successMessage = `✅ Restored Successfully!\n\nS3 Bucket: ${result.bucket_name || resourceName}\nPolicy restored from checkpoint`
        } else {
          successMessage = `✅ Restored Successfully!\n\nSecurity Group: ${result.sg_name || result.sg_id || resourceName}\nRules restored: ${result.rules_restored || 'All'}`
        }
        alert(successMessage)
      } else {
        throw new Error(result.error || 'Rollback failed')
      }

      // Refresh data
      setShowModal(false)
      setSelectedEvent(null)
      onRollback?.(eventId)

      // Refresh timeline
      refreshTimeline()
    } catch (err: any) {
      alert(`❌ Rollback failed: ${err.message}`)
    }
  }

  // Handle export
  const handleExport = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/remediation-history/export?format=csv`)
      const data = await response.json()
      
      // Download CSV
      const blob = new Blob([data.content], { type: "text/csv" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = data.filename
      a.click()
    } catch (err) {
      console.error("Export failed:", err)
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
              All checkpoints from Security Groups, IAM Roles & S3 Buckets with one-click rollback
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
              <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
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
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Checkpoints</p>
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
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Rollbacks Used</p>
              <p className="text-xl font-bold text-orange-400">
                {summary.rollback_events}
              </p>
            </div>
            <div className="rounded-lg p-3" style={{ background: "var(--bg-primary)" }}>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Available</p>
              <p className="text-xl font-bold" style={{ color: "var(--action-primary)" }}>
                {summary.completed_events}
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
              {/* Vertical lines for checkpoint events */}
              {chartData.filter(d => d.events > 0).map((point, idx) => (
                <ReferenceLine
                  key={idx}
                  x={point.date}
                  stroke="#8B5CF6"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  opacity={0.7}
                  label={{
                    value: `📍`,
                    position: 'top',
                    fill: '#8B5CF6',
                    fontSize: 12
                  }}
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
            Checkpoints & Remediations ({events.length})
          </h3>
          
          {events.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--text-secondary)" }} />
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                No checkpoints found in this period
              </p>
              <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
                Checkpoints are created automatically when you remediate Security Groups, IAM Roles, or S3 Buckets
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {events.slice(0, 10).map((event) => (
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
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ background: getStatusColor(event.status) }}
                    />
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {event.summary}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                        {formatDateTime(event.timestamp)} • {event.approved_by} • 
                        <span className="text-emerald-400 ml-1">
                          {Math.round(event.confidence_score * 100)}% confidence
                        </span>
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
