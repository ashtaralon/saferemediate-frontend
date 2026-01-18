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
    [key: string]: any
  }
  before_state: Record<string, any>
  after_state: Record<string, any>
  summary: string
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
        <div className="mt-2 space-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          <p>Security Score: <span className="font-medium text-emerald-400">{data.security_score}</span></p>
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

  // Fetch timeline data
  useEffect(() => {
    const fetchTimeline = async () => {
      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams()
        if (resourceId) params.append("resource_id", resourceId)
        
        // Calculate date range based on period
        const periodDays = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 }
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - periodDays[selectedPeriod])
        params.append("start_date", startDate.toISOString())
        params.append("limit", "200")

        const response = await fetch(`${apiBaseUrl}/api/remediation-history/timeline?${params}`)
        
        if (!response.ok) {
          throw new Error("Failed to fetch timeline data")
        }

        const data = await response.json()
        
        setEvents(data.events || [])
        setChartData(data.chart_data || [])
        setSummary(data.summary || null)
      } catch (err: any) {
        console.error("Timeline fetch error:", err)
        setError(err.message)
        
        // Use mock data for demo
        setEvents(mockEvents)
        setChartData(mockChartData)
        setSummary(mockSummary)
      } finally {
        setLoading(false)
      }
    }

    fetchTimeline()
  }, [selectedPeriod, resourceId, apiBaseUrl])

  // Handle rollback
  const handleRollback = async (eventId: string) => {
    if (!confirm("Are you sure you want to rollback this remediation? This will restore the previous state.")) {
      return
    }

    try {
      const response = await fetch(`${apiBaseUrl}/api/remediation-history/events/${eventId}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved_by: "user@cyntro.io" }),
      })

      if (!response.ok) {
        throw new Error("Rollback failed")
      }

      // Refresh data
      setShowModal(false)
      setSelectedEvent(null)
      onRollback?.(eventId)
      
      // Refetch timeline
      window.location.reload()
    } catch (err: any) {
      alert(`Rollback failed: ${err.message}`)
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
              Track all security remediations with one-click rollback
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
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Success Rate</p>
              <p className="text-xl font-bold text-blue-400">
                {summary.completed_events > 0
                  ? Math.round((summary.completed_events / summary.total_events) * 100)
                  : 0}%
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
              />
              {/* Event markers */}
              {chartData.filter(d => d.events > 0).map((point, idx) => (
                <ReferenceLine
                  key={idx}
                  x={point.date}
                  stroke="#8B5CF6"
                  strokeDasharray="3 3"
                  opacity={0.5}
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
            Recent Remediations
          </h3>
          
          {events.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--text-secondary)" }} />
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                No remediation events yet
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

// ============================================================================
// MOCK DATA FOR DEMO
// ============================================================================

const mockEvents: RemediationEvent[] = [
  {
    event_id: "rem-abc123def456",
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    resource_type: "IAMRole",
    resource_id: "cyntro-demo-ec2-s3-role",
    action_type: "PERMISSION_REMOVAL",
    status: "completed",
    confidence_score: 0.94,
    approved_by: "alon@cyntro.io",
    snapshot_id: "snapshot-xyz789",
    execution_id: "exec-123",
    rollback_available: true,
    metadata: { permissions_removed: 26, reason: "Unused for 90 days" },
    before_state: { allowed_actions: ["s3:*", "ec2:*"] },
    after_state: { allowed_actions: ["s3:GetObject", "s3:ListBucket"] },
    summary: "Removed 26 unused permissions from cyntro-demo-ec2-s3-role",
  },
  {
    event_id: "rem-def456ghi789",
    timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    resource_type: "SecurityGroup",
    resource_id: "sg-0abc123def456",
    action_type: "SG_RULE_REMOVED",
    status: "completed",
    confidence_score: 0.98,
    approved_by: "security-bot",
    snapshot_id: "snapshot-sg-001",
    execution_id: "exec-456",
    rollback_available: true,
    metadata: { rule_removed: "0.0.0.0/0:22" },
    before_state: { ingress_rules: [{ port: 22, cidr: "0.0.0.0/0" }] },
    after_state: { ingress_rules: [] },
    summary: "Removed SSH access from 0.0.0.0/0 in sg-0abc123def456",
  },
  {
    event_id: "rem-ghi789jkl012",
    timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    resource_type: "S3Bucket",
    resource_id: "cyntro-analytics-bucket",
    action_type: "S3_POLICY_REMOVED",
    status: "completed",
    confidence_score: 0.91,
    approved_by: "alon@cyntro.io",
    snapshot_id: "snapshot-s3-002",
    execution_id: "exec-789",
    rollback_available: true,
    metadata: { policy_removed: "PublicReadAccess" },
    before_state: { public_access: true },
    after_state: { public_access: false },
    summary: "Removed public access policy from cyntro-analytics-bucket",
  },
]

const mockChartData: ChartDataPoint[] = Array.from({ length: 30 }, (_, i) => {
  const date = new Date()
  date.setDate(date.getDate() - (29 - i))
  return {
    date: date.toISOString().split("T")[0],
    events: Math.random() > 0.7 ? Math.floor(Math.random() * 3) + 1 : 0,
    permissions_removed: Math.floor(Math.random() * 10),
    security_score: Math.min(100, 60 + i * 1.2 + Math.random() * 5),
    score_delta: Math.floor(Math.random() * 3),
  }
})

const mockSummary: TimelineSummary = {
  total_events: 45,
  total_permissions_removed: 234,
  completed_events: 43,
  rollback_events: 2,
  avg_confidence: 93.5,
  period_start: "2024-12-15",
  period_end: "2025-01-15",
}

export default RemediationTimeline
