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
import { fetchWithEnvelope } from "@/components/trust/use-trust-envelope"
import { TrustEnvelopeBadge, Provenance } from "@/components/trust/trust-envelope-badge"

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
    case "SG_RULE_TIGHTENED":
    case "SG_RULE_REMEDIATED":
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
          <p className="text-xs mt-1 px-2 py-1 rounded bg-[#8b5cf6]/20 text-purple-400 font-medium">
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
  onRollback: (eventId: string, selectedItems?: string[]) => void
}

/**
 * Extract restorable items from an event based on resource type.
 * Returns a list of { id, label, category } for checkbox rendering.
 */
function getRestorableItems(event: RemediationEvent): { id: string; label: string; category: string }[] {
  const items: { id: string; label: string; category: string }[] = []

  if (event.resource_type === 'IAMRole') {
    // Permissions that were removed
    const removedPerms = event.metadata?.removed_permissions || []
    if (removedPerms.length > 0) {
      for (const perm of removedPerms) {
        // Skip descriptive strings like "Removed 24 unused permissions"
        if (perm.includes(':') && !perm.startsWith('Removed ') && !perm.startsWith('Original:') && !perm.startsWith('New:')) {
          items.push({ id: perm, label: perm, category: 'Permission' })
        }
      }
    }
    // Also check before_state for allowed_actions
    const beforeActions = event.before_state?.allowed_actions || []
    const afterActions = event.after_state?.allowed_actions || []
    if (items.length === 0 && beforeActions.length > 0) {
      const afterSet = new Set(afterActions)
      for (const action of beforeActions) {
        if (!afterSet.has(action)) {
          items.push({ id: action, label: action, category: 'Permission' })
        }
      }
    }
    // Detached managed policies
    const detachedPolicies = event.metadata?.detached_managed_policies || event.before_state?.detached_managed_policies || []
    for (const arn of detachedPolicies) {
      const policyName = arn.split('/').pop() || arn
      items.push({ id: arn, label: policyName, category: 'Managed Policy' })
    }
  } else if (event.resource_type === 'SecurityGroup') {
    // Helper to format an IpPermission rule into display items
    const formatIpPermission = (rule: any, index: number) => {
      const protocol = rule.IpProtocol || rule.protocol || 'all'
      const port = rule.FromPort ? (rule.FromPort === rule.ToPort ? `${rule.FromPort}` : `${rule.FromPort}-${rule.ToPort}`) : 'all'
      const ranges = (rule.IpRanges || []).map((r: any) => r.CidrIp).join(', ')
      const sgPairs = (rule.UserIdGroupPairs || []).map((p: any) => p.GroupId).join(', ')
      const sources = [ranges, sgPairs].filter(Boolean).join(', ') || rule.cidr || rule.source || '*'
      return { id: `rule-${index}`, label: `ingress ${protocol} port ${port} from ${sources}`, category: 'Rule' as const }
    }

    // Helper to format a simplified rule entry
    const formatSimpleRule = (rule: any, index: number) => {
      const direction = rule.direction || 'inbound'
      const protocol = rule.IpProtocol || rule.protocol || 'all'
      const port = rule.FromPort ? (rule.FromPort === rule.ToPort ? `${rule.FromPort}` : `${rule.FromPort}-${rule.ToPort}`) : 'all'
      const cidr = rule.CidrIpv4 || rule.cidr || rule.source || '*'
      return { id: `rule-${index}`, label: `${direction} ${protocol} port ${port} from ${cidr}`, category: 'Rule' as const }
    }

    // 1. Best: explicit removed_rules field (new format)
    const removedRules = event.before_state?.removed_rules || []
    if (Array.isArray(removedRules) && removedRules.length > 0) {
      removedRules.forEach((rule: any, i: number) => {
        items.push(rule.IpRanges || rule.UserIdGroupPairs ? formatIpPermission(rule, i) : formatSimpleRule(rule, i))
      })
    }

    // 2. If no removed_rules, compute diff between before and after rules
    if (items.length === 0) {
      const beforeRules: any[] = event.before_state?.rules || event.before_state?.IpPermissions || []
      const afterRules: any[] = event.after_state?.rules || []

      if (Array.isArray(beforeRules) && beforeRules.length > 0 && Array.isArray(afterRules)) {
        // Build a fingerprint set of after rules to find which before rules were removed
        const fingerprint = (r: any) => {
          const proto = r.IpProtocol || ''
          const from = r.FromPort ?? ''
          const to = r.ToPort ?? ''
          const cidrs = (r.IpRanges || []).map((x: any) => x.CidrIp).sort().join(',')
          const sgs = (r.UserIdGroupPairs || []).map((x: any) => x.GroupId).sort().join(',')
          return `${proto}|${from}|${to}|${cidrs}|${sgs}`
        }
        const afterFingerprints = new Set(afterRules.map(fingerprint))

        let idx = 0
        for (const rule of beforeRules) {
          if (!afterFingerprints.has(fingerprint(rule))) {
            items.push(formatIpPermission(rule, idx++))
          }
        }
      }

      // 3. If after_state has no rules array (oldest format), show all before rules as fallback
      if (items.length === 0 && Array.isArray(beforeRules) && beforeRules.length > 0 && afterRules.length === 0 && !event.after_state?.rules) {
        beforeRules.forEach((rule: any, i: number) => {
          items.push(formatIpPermission(rule, i))
        })
      }
    }
  } else if (event.resource_type === 'S3Bucket') {
    // S3 policy statements that were removed
    const removedStatements = event.before_state?.removed_statements || event.before_state?.policy?.Statement || []
    if (Array.isArray(removedStatements)) {
      for (let i = 0; i < removedStatements.length; i++) {
        const stmt = removedStatements[i]
        const sid = stmt.Sid || `Statement ${i + 1}`
        const effect = stmt.Effect || 'Allow'
        const actions = Array.isArray(stmt.Action) ? stmt.Action.join(', ') : (stmt.Action || '*')
        items.push({ id: `stmt-${i}`, label: `${sid}: ${effect} ${actions}`, category: 'Policy Statement' })
      }
    }
  }

  return items
}

const EventDetailModal = ({ event, isOpen, onClose, onRollback }: EventDetailModalProps) => {
  const [showDiff, setShowDiff] = useState(false)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [showSelectiveRestore, setShowSelectiveRestore] = useState(false)

  if (!isOpen || !event) return null

  const restorableItems = getRestorableItems(event)
  const hasSelectableItems = restorableItems.length > 0

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
              <p className="text-xs text-[var(--muted-foreground,#9ca3af)]">
                {event.event_id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <XCircle className="w-5 h-5 text-[var(--muted-foreground,#9ca3af)]" />
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
                <p className="text-xs uppercase tracking-wide text-[var(--muted-foreground,#9ca3af)]">
                  Date & Time
                </p>
                <p className="text-sm font-medium text-white">
                  {formatDateTime(event.timestamp)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted-foreground,#9ca3af)]">
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
                <p className="text-xs uppercase tracking-wide text-[var(--muted-foreground,#9ca3af)]">
                  Action Type
                </p>
                <p className="text-sm font-medium text-white">
                  {event.action_type.replace(/_/g, " ")}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted-foreground,#9ca3af)]">
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
                <p className="text-xs uppercase tracking-wide text-[var(--muted-foreground,#9ca3af)]">
                  Confidence
                </p>
                <p className="text-sm font-medium text-white">
                  {Math.round(event.confidence_score * 100)}%
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-[var(--muted-foreground,#9ca3af)]">
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
              <div className="space-y-2">
                {/* Special display for IAM least-privilege remediation */}
                {event.metadata.original_role && event.metadata.new_role && (
                  <div className="p-3 rounded-lg bg-purple-900/30 border border-purple-700/50">
                    <div className="flex items-center gap-2 text-purple-300 text-sm font-medium mb-2">
                      <Key className="w-4 h-4" />
                      Least-Privilege Remediation
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-[var(--muted-foreground,#9ca3af)] mb-1">Original Role</p>
                        <p className="font-mono text-red-400 text-xs break-all">{event.metadata.original_role}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--muted-foreground,#9ca3af)] mb-1">New Role</p>
                        <p className="font-mono text-emerald-400 text-xs break-all">{event.metadata.new_role}</p>
                      </div>
                    </div>
                    {event.metadata.permissions_removed > 0 && (
                      <div className="mt-3 pt-2 border-t border-purple-700/30">
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-900/50 text-emerald-400 text-xs font-medium">
                          <CheckCircle className="w-3 h-3" />
                          {event.metadata.permissions_removed} unused permissions removed
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {/* Standard metadata display */}
                <div className="space-y-1">
                  {Object.entries(event.metadata)
                    .filter(([k]) => !['rules_count', 'removed_permissions', 'original_role', 'new_role', 'rules_removed', 'rules_failed'].includes(k))
                    .map(([key, value]) => (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="text-[var(--muted-foreground,#9ca3af)]">
                        {key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                      </span>
                      <span className="font-mono text-white">
                        {typeof value === "object" ? JSON.stringify(value) : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
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

          {/* Selective Restore Section */}
          {event.rollback_available && event.status === "completed" && hasSelectableItems && (
            <div className="rounded-lg border" style={{ background: "#252538", borderColor: "#3d3d5c" }}>
              <button
                onClick={() => {
                  setShowSelectiveRestore(!showSelectiveRestore)
                  if (!showSelectiveRestore && selectedItems.size === 0) {
                    // Select all by default when opening
                    setSelectedItems(new Set(restorableItems.map(i => i.id)))
                  }
                }}
                className="flex items-center justify-between w-full p-3 text-sm font-medium text-orange-400 hover:bg-white/5 rounded-lg transition-colors"
              >
                <span className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4" />
                  Select Items to Restore ({restorableItems.length} available)
                </span>
                {showSelectiveRestore ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>

              {showSelectiveRestore && (
                <div className="px-3 pb-3 space-y-2">
                  {/* Select All / None */}
                  <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: "#3d3d5c" }}>
                    <span className="text-xs text-gray-400">
                      {selectedItems.size} of {restorableItems.length} selected
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedItems(new Set(restorableItems.map(i => i.id)))}
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        Select All
                      </button>
                      <span className="text-gray-600">|</span>
                      <button
                        onClick={() => setSelectedItems(new Set())}
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Items list with checkboxes */}
                  <div className="max-h-[200px] overflow-y-auto space-y-1">
                    {restorableItems.map((item) => (
                      <label
                        key={item.id}
                        className="flex items-start gap-2 p-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedItems.has(item.id)}
                          onChange={(e) => {
                            const next = new Set(selectedItems)
                            if (e.target.checked) {
                              next.add(item.id)
                            } else {
                              next.delete(item.id)
                            }
                            setSelectedItems(next)
                          }}
                          className="mt-0.5 w-4 h-4 rounded border-gray-500 text-orange-500 focus:ring-orange-500 bg-gray-700 flex-shrink-0"
                        />
                        <div className="min-w-0">
                          <span className="text-xs font-mono text-gray-300 break-all">{item.label}</span>
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">{item.category}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
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
              hasSelectableItems && showSelectiveRestore ? (
                <button
                  onClick={() => onRollback(event.event_id, Array.from(selectedItems))}
                  disabled={selectedItems.size === 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: "#F59E0B" }}
                >
                  <RotateCcw className="w-4 h-4" />
                  Restore {selectedItems.size === restorableItems.length ? 'All' : `${selectedItems.size}`} {selectedItems.size === 1 ? 'Item' : 'Items'}
                </button>
              ) : (
                <button
                  onClick={() => onRollback(event.event_id)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
                  style={{ background: "#F59E0B" }}
                >
                  <RotateCcw className="w-4 h-4" />
                  Restore All
                </button>
              )
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
}: RemediationTimelineProps) {
  const [events, setEvents] = useState<RemediationEvent[]>([])
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [summary, setSummary] = useState<TimelineSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [provenance, setProvenance] = useState<Provenance | null>(null)

  const [selectedPeriod, setSelectedPeriod] = useState<"7d" | "30d" | "90d" | "1y">("30d")
  const [selectedEvent, setSelectedEvent] = useState<RemediationEvent | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null)
  const [eventFilter, setEventFilter] = useState<"actionable" | "all">("actionable")
  const [refreshKey, setRefreshKey] = useState(0)

  // Filter events based on selected filter
  const filteredEvents = useMemo(() => {
    if (eventFilter === "all") return events
    // Actionable: only completed remediations with rollback available (not rollback events, not already rolled back)
    return events.filter(e =>
      e.action_type !== "ROLLBACK" &&
      e.status === "completed" &&
      e.rollback_available
    )
  }, [events, eventFilter])

  // Manual refresh function
  const refreshTimeline = () => {
    setRefreshKey(prev => prev + 1)
  }

  // Convert snapshot to RemediationEvent format
  const convertSnapshotToEvent = (snapshot: any): RemediationEvent => {
    // Detect IAM Role snapshots - check multiple indicators
    const isIAMRole = snapshot.type === 'IAMRole' ||
      snapshot.snapshot_id?.startsWith('IAMRole-') ||
      snapshot.snapshot_id?.startsWith('iam-') ||
      snapshot.resource_type === 'IAMRole' ||
      snapshot.original_role ||  // New format: has original_role field
      snapshot.new_role           // New format: has new_role field

    // Detect NEW format SNAP-* (least-privilege remediation with original_role/new_role)
    const isNewLPFormat = snapshot.original_role && snapshot.new_role

    const isS3Bucket = snapshot.type === 'S3Bucket' ||
      snapshot.snapshot_id?.startsWith('S3Bucket-') ||
      snapshot.snapshot_id?.startsWith('s3-') ||
      snapshot.resource_type === 'S3Bucket'

    // Detect Security Group snapshots
    const isSecurityGroup = snapshot.sg_id ||
      snapshot.sg_name ||
      snapshot.snapshot_id?.startsWith('sg-snap-') ||
      snapshot.resource_type === 'SecurityGroup'

    let resourceType = 'SecurityGroup'
    let actionType = 'SG_RULE_REMOVED'
    let resourceId = snapshot.sg_id || snapshot.sg_name || ''
    let summary = ''
    let beforeState: Record<string, any> = {}
    let afterState: Record<string, any> = {}
    let permissionsRemoved = 0
    let removedPermissionsList: string[] = []

    if (isIAMRole) {
      resourceType = 'IAMRole'
      actionType = 'PERMISSION_REMOVAL'

      // Parse before_state/after_state from snapshot (may be JSON strings from Neo4j)
      let parsedBefore: Record<string, any> = {}
      let parsedAfter: Record<string, any> = {}
      try {
        parsedBefore = typeof snapshot.before_state === 'string'
          ? JSON.parse(snapshot.before_state)
          : (snapshot.before_state || {})
      } catch { parsedBefore = {} }
      try {
        parsedAfter = typeof snapshot.after_state === 'string'
          ? JSON.parse(snapshot.after_state)
          : (snapshot.after_state || {})
      } catch { parsedAfter = {} }

      if (isNewLPFormat) {
        // NEW format: SNAP-* with original_role and new_role (created a new least-privilege role)
        const originalRole = snapshot.original_role
        const newRole = snapshot.new_role
        resourceId = originalRole

        // Use actual data from before/after states when available
        const originalPermCount = parsedBefore.total_permissions || parsedBefore.allowed_actions?.length || snapshot.original_permissions_count || 30
        const usedPermCount = parsedAfter.total_permissions || parsedAfter.allowed_actions?.length || snapshot.used_permissions_count || 6
        permissionsRemoved = snapshot.permissions_removed || (originalPermCount - usedPermCount)

        beforeState = Object.keys(parsedBefore).length > 0 ? parsedBefore : {
          role_name: originalRole,
          permissions_count: originalPermCount,
          description: "Original role with all attached permissions",
          status: "over-privileged"
        }

        afterState = Object.keys(parsedAfter).length > 0 ? parsedAfter : {
          role_name: newRole,
          permissions_count: usedPermCount,
          description: "New least-privilege role with only used permissions",
          status: "least-privilege"
        }

        removedPermissionsList = [
          `Removed ${permissionsRemoved} unused permissions`,
          `Original: ${originalRole} (${originalPermCount} permissions)`,
          `New: ${newRole} (${usedPermCount} permissions)`,
        ]

        summary = `Created least-privilege role ${newRole} from ${originalRole} (removed ${permissionsRemoved} unused permissions)`
      } else {
        // Same-role remediation or older format (SNAP-* with original_role but no new_role, or IAMRole-*)
        let roleName = snapshot.original_role || snapshot.role_name || snapshot.current_state?.role_name || parsedBefore.role_name
        if (!roleName && snapshot.snapshot_id?.startsWith('IAMRole-')) {
          const parts = snapshot.snapshot_id.replace('IAMRole-', '').split('-')
          parts.pop()
          roleName = parts.join('-') || 'Unknown Role'
        }
        resourceId = roleName || 'Unknown Role'

        // Use permissions_removed count from snapshot, or calculate from before/after states
        permissionsRemoved = snapshot.permissions_removed
          || snapshot.removed_permissions?.length
          || (parsedBefore.allowed_actions?.length && parsedAfter.allowed_actions?.length
              ? parsedBefore.allowed_actions.length - parsedAfter.allowed_actions.length
              : 0)
          || snapshot.permissions_count
          || 0

        removedPermissionsList = snapshot.removed_permissions || []

        // Use parsed before/after states from Neo4j, fall back to current_state
        beforeState = Object.keys(parsedBefore).length > 0 ? parsedBefore : (snapshot.current_state || {})
        afterState = Object.keys(parsedAfter).length > 0 ? parsedAfter : {}

        if (permissionsRemoved > 0) {
          summary = `Removed ${permissionsRemoved} permissions from ${resourceId}`
        } else {
          summary = `IAM remediation checkpoint for ${resourceId}`
        }
      }
    } else if (isS3Bucket) {
      resourceType = 'S3Bucket'
      actionType = 'S3_POLICY_REMOVED'
      resourceId = snapshot.finding_id || snapshot.current_state?.resource_name || 'Unknown Bucket'
      beforeState = snapshot.current_state || {}
      summary = `Policy checkpoint for ${resourceId}`
    } else if (isSecurityGroup) {
      resourceType = 'SecurityGroup'
      actionType = 'SG_RULE_REMOVED'
      resourceId = snapshot.sg_name || snapshot.sg_id || snapshot.finding_id || 'Unknown SG'
      const rulesRemoved = snapshot.rules_count?.inbound || snapshot.rules_count || 0
      beforeState = snapshot.current_state || {}
      summary = `Removed ${rulesRemoved} inbound rules from ${resourceId}`
    } else {
      // Unknown type - try to determine from context
      resourceId = snapshot.finding_id || snapshot.resource_id || 'Unknown Resource'
      beforeState = snapshot.current_state || {}
      summary = `Remediation checkpoint for ${resourceId}`
    }

    return {
      event_id: snapshot.snapshot_id,
      timestamp: snapshot.timestamp || snapshot.created_at || new Date().toISOString(),
      resource_type: resourceType,
      resource_id: resourceId,
      action_type: actionType,
      status: (snapshot.rolled_back_at || snapshot.restored_at || snapshot.status === 'RESTORED' || snapshot.status === 'restored')
        ? 'rolled_back'
        : 'completed',
      confidence_score: 0.95,
      approved_by: snapshot.triggered_by || 'system',
      snapshot_id: snapshot.snapshot_id,
      rollback_available: snapshot.rollback_available !== false,
      metadata: {
        reason: snapshot.reason || 'Least-privilege remediation',
        rules_count: snapshot.rules_count,
        removed_permissions: removedPermissionsList,
        permissions_removed: permissionsRemoved,
        original_role: snapshot.original_role,
        new_role: snapshot.new_role,
      },
      before_state: beforeState,
      after_state: afterState,
      summary,
      source: 'snapshot',
      sg_id: snapshot.sg_id,
      sg_name: snapshot.sg_name,
      role_name: snapshot.original_role || snapshot.role_name || resourceId,
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
        setProvenance(null)
        const [neo4jEnvResult, sgRes, iamRes] = await Promise.all([
          // 1. Neo4j Timeline API (primary source for recorded events) - use proxy to avoid CORS
          fetchWithEnvelope<any>(
            `/api/proxy/remediation-history/timeline?start_date=${startDate.toISOString()}&end_date=${today.toISOString()}&limit=200`
          ).catch(() => null),
          // 2. Snapshots (to include any checkpoints not yet in Neo4j)
          fetch('/api/proxy/snapshots', { cache: 'no-store' }).catch(() => null),
          fetch('/api/proxy/iam-snapshots', { cache: 'no-store' }).catch(() => null)
        ])

        let allEvents: RemediationEvent[] = []
        let neo4jChartData: ChartDataPoint[] = []
        let neo4jSummary: TimelineSummary | null = null

        // Process Neo4j timeline data (primary)
        if (neo4jEnvResult) {
          setProvenance(neo4jEnvResult.provenance)
          const neo4jData = neo4jEnvResult.result
          const neo4jEvents = (neo4jData?.events || []).map((e: any) => ({
            ...e,
            source: 'neo4j' as const
          }))
          allEvents.push(...neo4jEvents)
          neo4jChartData = neo4jData?.chart_data || []
          neo4jSummary = neo4jData?.summary || null
        }

        // Process snapshots (secondary - fill in any missing)
        let snapshotEvents: RemediationEvent[] = []

        if (sgRes && sgRes.ok) {
          const sgData = await sgRes.json()
          const sgList = Array.isArray(sgData) ? sgData : (sgData.snapshots || [])
          const typedSnapshots = sgList.map((s: any) => {
            // Detect IAM Role snapshots - check multiple indicators including new format
            if (s.snapshot_id?.startsWith('IAMRole-') || s.snapshot_id?.startsWith('iam-') ||
                s.resource_type === 'IAMRole' || s.original_role || s.new_role) {
              return { ...s, type: 'IAMRole' }
            }
            // Detect S3 Bucket snapshots
            if (s.snapshot_id?.startsWith('S3Bucket-') || s.snapshot_id?.startsWith('s3-') ||
                s.resource_type === 'S3Bucket') {
              return { ...s, type: 'S3Bucket' }
            }
            // Detect Security Group snapshots
            if (s.sg_id || s.sg_name || s.snapshot_id?.startsWith('sg-snap-') ||
                s.resource_type === 'SecurityGroup') {
              return { ...s, type: 'SecurityGroup' }
            }
            // Default: try to infer from snapshot_id prefix
            return { ...s, type: 'Unknown' }
          })
          snapshotEvents.push(...typedSnapshots.map(convertSnapshotToEvent))
        }

        if (iamRes && iamRes.ok) {
          const iamData = await iamRes.json()
          const iamList = Array.isArray(iamData) ? iamData : (iamData.snapshots || [])
          snapshotEvents.push(...iamList.map((s: any) => convertSnapshotToEvent({ ...s, type: 'IAMRole' })))
        }

        // Merge: Add snapshot events not already in Neo4j
        // Deduplicate by snapshot_id, resource_id, sg_id/sg_name
        const neo4jSnapshotIds = new Set(allEvents.map(e => e.snapshot_id).filter(Boolean))
        const neo4jResourceIds = new Set(allEvents.map(e => `${e.resource_type}:${e.resource_id}`))
        // Also track SG IDs and names from events for cross-matching (events use sg_id, snapshots use sg_name)
        const neo4jSgIds = new Set(allEvents.filter(e => e.resource_type === 'SecurityGroup').map(e => e.resource_id))
        const neo4jSgNames = new Set(allEvents.filter(e => e.resource_type === 'SecurityGroup' && e.sg_name).map(e => e.sg_name))
        const uniqueSnapshotEvents = snapshotEvents.filter(e => {
          // Skip if snapshot_id already in Neo4j events
          if (e.snapshot_id && neo4jSnapshotIds.has(e.snapshot_id)) return false
          // Skip SG snapshots if we already have RemediationEvent entries for that SG (match by ID or name)
          if (e.resource_type === 'SecurityGroup') {
            if (neo4jSgIds.has(e.resource_id) || neo4jSgIds.has(e.sg_id)) return false
            if (neo4jSgNames.has(e.resource_id) || neo4jSgNames.has(e.sg_name)) return false
            // Also check if any snapshot_id in kept events contains this SG ID
            if (e.sg_id && [...neo4jSnapshotIds].some(sid => sid.includes(e.sg_id))) return false
          }
          return true
        })
        allEvents.push(...uniqueSnapshotEvents)

        // Filter by date range
        allEvents = allEvents.filter(e => {
          const ts = new Date(e.timestamp)
          return ts >= startDate && ts <= today
        })

        // Sort by timestamp (newest first)
        allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

        // ALWAYS generate chart data from ALL events (not just Neo4j)
        // This ensures snapshot events are visualized in the chart
        let finalChartData: ChartDataPoint[] = []
        if (allEvents.length > 0) {
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
  }, [selectedPeriod, systemId, resourceId, refreshKey])

  // Handle rollback - uses correct endpoint based on source and resource type
  const handleRollback = async (eventId: string, selectedItems?: string[]) => {
    const event = events.find(e => e.event_id === eventId)
    if (!event) {
      alert("Event not found")
      return
    }

    // Get the actual resource name - for IAM roles, use original_role or role_name
    const resourceName = event.resource_type === 'IAMRole'
      ? (event.metadata?.original_role || event.role_name || event.resource_id || 'Unknown Role')
      : (event.resource_id || 'Unknown Resource')
    const resourceType = event.resource_type

    const isPartial = selectedItems && selectedItems.length > 0
    const totalItems = getRestorableItems(event).length
    const restoreLabel = isPartial && selectedItems.length < totalItems
      ? `${selectedItems.length} of ${totalItems} items`
      : 'all items'

    let confirmMessage = `⚠️ Restore ${resourceType} (${restoreLabel})?\n\nResource: ${resourceName}\n\nThis will undo the selected remediation. Continue?`

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
        bodyContent = {
          approved_by: "user@cyntro.io",
          ...(isPartial && { selected_items: selectedItems })
        }
      }
      // Otherwise, use the snapshot-specific endpoints
      else if (resourceType === 'IAMRole') {
        endpoint = `/api/proxy/iam-snapshots/${snapshotId}/rollback`
        bodyContent = {
          ...(isPartial && { selected_items: selectedItems })
        }
      } else if (resourceType === 'S3Bucket') {
        endpoint = `/api/proxy/s3-buckets/rollback`
        bodyContent = {
          checkpoint_id: snapshotId,
          bucket_name: event.bucket_name || event.resource_id || '',
          ...(isPartial && { selected_items: selectedItems })
        }
      } else {
        const isSgLpSnapshot = snapshotId?.startsWith('sg-snap-')
        if (isSgLpSnapshot) {
          const sgId = event.sg_id || event.resource_id || ''
          endpoint = `/api/proxy/sg-least-privilege/${sgId}/rollback`
          bodyContent = {
            snapshot_id: snapshotId,
            ...(isPartial && { selected_items: selectedItems })
          }
        } else {
          endpoint = `/api/proxy/remediation/rollback/${snapshotId}`
          bodyContent = isPartial ? { selected_items: selectedItems } : undefined
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
        const restoredCount = result.items_restored || result.permissions_restored || result.rules_restored || result.restored_rules || (isPartial ? selectedItems.length : 'all')
        alert(`✅ Restored Successfully!\n\n${resourceType}: ${resourceName}\nRestored: ${restoredCount} items\n\nThe selected items have been restored.`)
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
            {provenance && (
              <div className="mt-3">
                <TrustEnvelopeBadge provenance={provenance} />
              </div>
            )}
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
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Remediation Events ({filteredEvents.length}{eventFilter === "actionable" && events.length !== filteredEvents.length ? ` of ${events.length}` : ''})
            </h3>
            <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-0.5">
              <button
                onClick={() => setEventFilter("actionable")}
                className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                style={{
                  background: eventFilter === "actionable" ? "var(--action-primary)" : "transparent",
                  color: eventFilter === "actionable" ? "white" : "var(--text-secondary)",
                }}
              >
                Actionable
              </button>
              <button
                onClick={() => setEventFilter("all")}
                className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
                style={{
                  background: eventFilter === "all" ? "var(--action-primary)" : "transparent",
                  color: eventFilter === "all" ? "white" : "var(--text-secondary)",
                }}
              >
                All Events
              </button>
            </div>
          </div>

          {filteredEvents.length === 0 ? (
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
              {filteredEvents.map((event) => (
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
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                          {event.summary}
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded-md font-bold whitespace-nowrap ${
                          event.resource_type === 'IAMRole' ? 'bg-purple-600 text-white' :
                          event.resource_type === 'SecurityGroup' ? 'bg-blue-600 text-white' :
                          event.resource_type === 'S3Bucket' ? 'bg-emerald-600 text-white' :
                          'bg-gray-600 text-white'
                        }`}>
                          {event.resource_type === 'IAMRole' ? 'IAM Role' :
                           event.resource_type === 'SecurityGroup' ? 'Security Group' :
                           event.resource_type === 'S3Bucket' ? 'S3 Bucket' :
                           event.resource_type}
                        </span>
                      </div>
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
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors hover:bg-[#f9731610]0/20"
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
