"use client"

import { useState } from "react"
import {
  X,
  Shield,
  Eye,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  HelpCircle,
  Globe,
  Lock,
  Unlock,
  User,
  Users,
  FileText,
  Key,
  Activity,
  Info,
  Copy,
  Download,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// ============================================================================
// S3-Specific Types
// ============================================================================

export type S3DataEventsStatus = 'enabled' | 'disabled' | 'partial' | 'unknown'

export interface S3BlockPublicAccess {
  blockPublicAcls: boolean
  ignorePublicAcls: boolean
  blockPublicPolicy: boolean
  restrictPublicBuckets: boolean
  allEnabled: boolean
}

export interface S3PolicyPrincipal {
  type: 'AWS' | 'Service' | 'Federated' | '*'
  value: string
  isPublic: boolean
}

export interface S3PolicyStatement {
  sid?: string
  effect: 'Allow' | 'Deny'
  principals: S3PolicyPrincipal[]
  actions: string[]
  resources: string[]
  conditions?: {
    key: string
    operator: string
    values: string[]
  }[]
  isPublicAccess: boolean
  isOverlyBroad: boolean
}

export interface S3BucketPolicySummary {
  hasBucketPolicy: boolean
  statementCount: number
  statements: S3PolicyStatement[]
  publicStatements: S3PolicyStatement[]
  crossAccountStatements: S3PolicyStatement[]
}

export interface S3ACLGrant {
  grantee: string
  granteeType: 'CanonicalUser' | 'Group' | 'AmazonCustomerByEmail'
  permission: 'FULL_CONTROL' | 'WRITE' | 'WRITE_ACP' | 'READ' | 'READ_ACP'
  isPublic: boolean
}

export interface S3ObservedUsage {
  dataEventsStatus: S3DataEventsStatus
  dataEventsReason?: string
  topPrincipals?: {
    principal: string
    actionCounts: {
      action: string
      count: number
      lastSeen: string | null
    }[]
  }[]
  totalRequests?: number
  uniquePrincipals?: number
  lastActivity?: string | null
}

export interface S3ChangeHistory {
  eventType: string
  eventTime: string
  actor: string
  summary: string
}

export interface S3Insight {
  type: 'critical' | 'warning' | 'info'
  title: string
  description: string
  recommendation?: string
}

export interface S3BucketDetailData {
  bucketName: string
  bucketArn: string
  region: string
  system?: string
  environment?: string

  // Planes data
  planes: {
    configured: { available: boolean; lastUpdated: string }
    observed: { available: boolean; confidence: 'high' | 'medium' | 'low' | 'unknown'; lastUpdated: string }
    authorized: { available: boolean; lastUpdated: string }
    changed: { available: boolean; lastUpdated: string }
  }

  // Access Control (Configured/Allowed)
  blockPublicAccess: S3BlockPublicAccess
  bucketPolicy: S3BucketPolicySummary
  aclGrants: S3ACLGrant[]
  encryption?: {
    enabled: boolean
    type: 'SSE-S3' | 'SSE-KMS' | 'SSE-C' | 'None'
    kmsKeyId?: string
  }

  // Observed Usage
  observedUsage: S3ObservedUsage

  // Gap Analysis (only if observed available)
  gap?: {
    available: boolean
    unusedPrincipals?: string[]
    unusedActions?: string[]
    reason?: string
  }

  // Change History
  changeHistory: S3ChangeHistory[]

  // Computed Insights
  insights: S3Insight[]
}

// ============================================================================
// Props
// ============================================================================

interface S3BucketDetailProps {
  data: S3BucketDetailData | null
  loading: boolean
  onClose: () => void
  onExport: () => void
  onCreateTicket: () => void
}

// ============================================================================
// Sub-Components
// ============================================================================

function PlaneChipMini({
  label,
  available,
  confidence
}: {
  label: string
  available: boolean
  confidence?: 'high' | 'medium' | 'low' | 'unknown'
}) {
  const getIcon = () => {
    if (!available) return <HelpCircle className="w-3.5 h-3.5" />
    if (confidence === 'unknown') return <HelpCircle className="w-3.5 h-3.5" />
    return <CheckCircle className="w-3.5 h-3.5" />
  }

  const getColor = () => {
    if (!available) return 'text-gray-400 bg-gray-100'
    if (confidence === 'unknown') return 'text-amber-600 bg-amber-100'
    if (confidence === 'low') return 'text-amber-600 bg-amber-100'
    return 'text-green-600 bg-green-100'
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getColor()}`}>
      {getIcon()}
      {label}
    </span>
  )
}

function BPAStatus({ bpa }: { bpa: S3BlockPublicAccess }) {
  const items = [
    { key: 'blockPublicAcls', label: 'Block Public ACLs', value: bpa.blockPublicAcls },
    { key: 'ignorePublicAcls', label: 'Ignore Public ACLs', value: bpa.ignorePublicAcls },
    { key: 'blockPublicPolicy', label: 'Block Public Policy', value: bpa.blockPublicPolicy },
    { key: 'restrictPublicBuckets', label: 'Restrict Public Buckets', value: bpa.restrictPublicBuckets },
  ]

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-gray-900 flex items-center gap-2">
          <Shield className="w-4 h-4" />
          Block Public Access
        </h4>
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          bpa.allEnabled
            ? 'bg-green-100 text-green-700'
            : 'bg-red-100 text-red-700'
        }`}>
          {bpa.allEnabled ? 'All Enabled' : 'Partially Disabled'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map(item => (
          <div key={item.key} className="flex items-center gap-2 text-sm">
            {item.value ? (
              <CheckCircle className="w-4 h-4 text-green-500" />
            ) : (
              <XCircle className="w-4 h-4 text-red-500" />
            )}
            <span className={item.value ? 'text-gray-700' : 'text-red-700'}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PolicyStatementCard({ statement }: { statement: S3PolicyStatement }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className={`border rounded-lg ${
      statement.isPublicAccess ? 'border-red-200 bg-red-50' :
      statement.isOverlyBroad ? 'border-amber-200 bg-amber-50' :
      'border-gray-200 bg-white'
    }`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            statement.effect === 'Allow' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {statement.effect}
          </span>
          <div className="text-sm">
            <span className="font-medium text-gray-900">
              {statement.sid || 'Statement'}
            </span>
            {statement.isPublicAccess && (
              <span className="ml-2 text-red-600 text-xs">
                (Public Access)
              </span>
            )}
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          {/* Principals */}
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">Principals</div>
            <div className="space-y-1">
              {statement.principals.map((p, i) => (
                <div key={i} className={`flex items-center gap-2 text-sm ${
                  p.isPublic ? 'text-red-700' : 'text-gray-700'
                }`}>
                  {p.isPublic ? (
                    <Globe className="w-3.5 h-3.5 text-red-500" />
                  ) : p.type === 'Service' ? (
                    <Key className="w-3.5 h-3.5 text-blue-500" />
                  ) : (
                    <User className="w-3.5 h-3.5 text-gray-500" />
                  )}
                  <span className="font-mono text-xs">{p.value}</span>
                  {p.isPublic && (
                    <span className="text-xs text-red-600">(PUBLIC)</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">Actions</div>
            <div className="flex flex-wrap gap-1">
              {statement.actions.map((action, i) => (
                <span
                  key={i}
                  className={`px-1.5 py-0.5 rounded text-xs font-mono ${
                    action === 's3:*' || action === '*'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {action}
                </span>
              ))}
            </div>
          </div>

          {/* Conditions */}
          {statement.conditions && statement.conditions.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1">Conditions</div>
              <div className="space-y-1">
                {statement.conditions.map((cond, i) => (
                  <div key={i} className="text-xs text-gray-600 font-mono bg-gray-100 px-2 py-1 rounded">
                    {cond.operator}: {cond.key} = {cond.values.join(', ')}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ObservedUsageSection({ usage }: { usage: S3ObservedUsage }) {
  if (usage.dataEventsStatus === 'disabled' || usage.dataEventsStatus === 'unknown') {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-amber-800">Observed Usage Unknown</h4>
            <p className="text-sm text-amber-700 mt-1">
              {usage.dataEventsReason || 'S3 data events are not enabled for this bucket. Enable CloudTrail S3 data events to see actual access patterns.'}
            </p>
            <button className="mt-3 text-sm font-medium text-amber-800 hover:text-amber-900 flex items-center gap-1">
              Learn how to enable S3 data events
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      {usage.totalRequests !== undefined && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-100">
            <div className="text-2xl font-bold text-blue-600">
              {usage.totalRequests.toLocaleString()}
            </div>
            <div className="text-xs text-blue-600">Total Requests</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center border border-green-100">
            <div className="text-2xl font-bold text-green-600">
              {usage.uniquePrincipals || 0}
            </div>
            <div className="text-xs text-green-600">Unique Principals</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
            <div className="text-sm font-medium text-gray-900">
              {usage.lastActivity
                ? new Date(usage.lastActivity).toLocaleDateString()
                : 'No activity'
              }
            </div>
            <div className="text-xs text-gray-500">Last Activity</div>
          </div>
        </div>
      )}

      {/* Top principals */}
      {usage.topPrincipals && usage.topPrincipals.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Top Principals (by request count)
          </h4>
          <div className="space-y-3">
            {usage.topPrincipals.slice(0, 5).map((p, i) => (
              <div key={i} className="bg-white rounded-lg p-3 border">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 text-gray-500" />
                  <span className="font-mono text-sm text-gray-900 truncate">
                    {p.principal}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {p.actionCounts.slice(0, 4).map((ac, j) => (
                    <span
                      key={j}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-xs"
                    >
                      <span className="font-mono text-gray-700">{ac.action}</span>
                      <span className="text-gray-500">({ac.count})</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function GapSection({ gap, observedUsage }: { gap?: S3BucketDetailData['gap']; observedUsage: S3ObservedUsage }) {
  // If observed data is not available, show "Gap Unknown"
  if (observedUsage.dataEventsStatus === 'disabled' || observedUsage.dataEventsStatus === 'unknown') {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <HelpCircle className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-gray-700">Gap Unknown</h4>
            <p className="text-sm text-gray-500 mt-1">
              Cannot compute gap without observed usage data. Enable S3 data events to identify unused access patterns.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!gap || !gap.available) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-gray-700">Gap Analysis Pending</h4>
            <p className="text-sm text-gray-500 mt-1">
              {gap?.reason || 'Gap analysis requires more data to provide recommendations.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {gap.unusedPrincipals && gap.unusedPrincipals.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h4 className="font-medium text-amber-800 mb-2">
            Principals with access but no observed usage
          </h4>
          <div className="space-y-1">
            {gap.unusedPrincipals.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-amber-700">
                <User className="w-3.5 h-3.5" />
                <span className="font-mono">{p}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {gap.unusedActions && gap.unusedActions.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h4 className="font-medium text-amber-800 mb-2">
            Actions allowed but never used
          </h4>
          <div className="flex flex-wrap gap-1">
            {gap.unusedActions.map((a, i) => (
              <span key={i} className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-xs font-mono">
                {a}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function InsightsSection({ insights }: { insights: S3Insight[] }) {
  if (insights.length === 0) return null

  const getInsightStyle = (type: S3Insight['type']) => {
    switch (type) {
      case 'critical':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          iconColor: 'text-red-600',
          titleColor: 'text-red-800',
          textColor: 'text-red-700',
          Icon: XCircle,
        }
      case 'warning':
        return {
          bg: 'bg-amber-50',
          border: 'border-amber-200',
          iconColor: 'text-amber-600',
          titleColor: 'text-amber-800',
          textColor: 'text-amber-700',
          Icon: AlertTriangle,
        }
      case 'info':
      default:
        return {
          bg: 'bg-blue-50',
          border: 'border-blue-200',
          iconColor: 'text-blue-600',
          titleColor: 'text-blue-800',
          textColor: 'text-blue-700',
          Icon: Info,
        }
    }
  }

  return (
    <div className="space-y-3">
      {insights.map((insight, i) => {
        const style = getInsightStyle(insight.type)
        return (
          <div key={i} className={`${style.bg} ${style.border} border rounded-lg p-4`}>
            <div className="flex items-start gap-3">
              <style.Icon className={`w-5 h-5 ${style.iconColor} flex-shrink-0 mt-0.5`} />
              <div>
                <h4 className={`font-medium ${style.titleColor}`}>{insight.title}</h4>
                <p className={`text-sm ${style.textColor} mt-1`}>{insight.description}</p>
                {insight.recommendation && (
                  <p className={`text-sm ${style.textColor} mt-2 font-medium`}>
                    Recommendation: {insight.recommendation}
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ChangeHistorySection({ history }: { history: S3ChangeHistory[] }) {
  if (history.length === 0) {
    return (
      <div className="text-center py-6 text-gray-500">
        <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <div className="text-sm">No recent policy changes</div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {history.slice(0, 10).map((event, i) => (
        <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
          <div className="w-2 h-2 rounded-full bg-indigo-400 mt-2 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">
                {event.eventType}
              </span>
              <span className="text-xs text-gray-500">
                {new Date(event.eventTime).toLocaleString()}
              </span>
            </div>
            <div className="text-sm text-gray-600 mt-0.5">{event.summary}</div>
            <div className="text-xs text-gray-500 mt-0.5">by {event.actor}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function S3BucketDetail({
  data,
  loading,
  onClose,
  onExport,
  onCreateTicket,
}: S3BucketDetailProps) {
  const [activeSection, setActiveSection] = useState<'access' | 'observed' | 'gap' | 'history' | 'insights'>('access')

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <div className="text-sm text-gray-500">Loading bucket details...</div>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="text-center text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <div className="text-sm">Select an S3 bucket to view details</div>
        </div>
      </div>
    )
  }

  const sections = [
    { id: 'access' as const, label: 'Access Control', icon: Shield },
    { id: 'observed' as const, label: 'Observed Usage', icon: Eye },
    { id: 'gap' as const, label: 'Gap', icon: AlertTriangle },
    { id: 'history' as const, label: 'Changes', icon: Clock },
    { id: 'insights' as const, label: 'Insights', icon: Info, count: data.insights.length },
  ]

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-green-50 to-white">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{data.bucketName}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-gray-500">{data.region}</span>
            {data.environment && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                {data.environment}
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Plane Chips */}
      <div className="px-6 py-3 border-b bg-gray-50 flex items-center gap-2">
        <PlaneChipMini label="Configured" available={data.planes.configured.available} />
        <PlaneChipMini
          label="Observed"
          available={data.planes.observed.available}
          confidence={data.planes.observed.confidence}
        />
        <PlaneChipMini label="Authorized" available={data.planes.authorized.available} />
        <PlaneChipMini label="Changed" available={data.planes.changed.available} />
      </div>

      {/* Section Tabs */}
      <div className="px-6 border-b">
        <div className="flex gap-1">
          {sections.map(section => {
            const Icon = section.icon
            const isActive = activeSection === section.id
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {section.label}
                {section.count !== undefined && section.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded text-xs ${
                    isActive ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {section.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeSection === 'access' && (
          <div className="space-y-6">
            <BPAStatus bpa={data.blockPublicAccess} />

            {/* Bucket Policy */}
            <div>
              <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Bucket Policy
                {!data.bucketPolicy.hasBucketPolicy && (
                  <span className="text-xs text-gray-500">(No policy attached)</span>
                )}
              </h3>
              {data.bucketPolicy.hasBucketPolicy ? (
                <div className="space-y-2">
                  {data.bucketPolicy.statements.map((stmt, i) => (
                    <PolicyStatementCard key={i} statement={stmt} />
                  ))}
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-500">
                  No bucket policy is attached. Access is controlled by IAM policies and ACLs only.
                </div>
              )}
            </div>

            {/* ACL Grants */}
            {data.aclGrants.length > 0 && (
              <div>
                <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  ACL Grants
                </h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  {data.aclGrants.map((grant, i) => (
                    <div key={i} className={`flex items-center justify-between text-sm ${
                      grant.isPublic ? 'text-red-700' : 'text-gray-700'
                    }`}>
                      <div className="flex items-center gap-2">
                        {grant.isPublic ? (
                          <Globe className="w-4 h-4 text-red-500" />
                        ) : (
                          <User className="w-4 h-4 text-gray-500" />
                        )}
                        <span className="font-mono text-xs">{grant.grantee}</span>
                        {grant.isPublic && (
                          <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                            PUBLIC
                          </span>
                        )}
                      </div>
                      <span className="text-xs bg-gray-200 px-2 py-0.5 rounded">
                        {grant.permission}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeSection === 'observed' && (
          <ObservedUsageSection usage={data.observedUsage} />
        )}

        {activeSection === 'gap' && (
          <GapSection gap={data.gap} observedUsage={data.observedUsage} />
        )}

        {activeSection === 'history' && (
          <ChangeHistorySection history={data.changeHistory} />
        )}

        {activeSection === 'insights' && (
          <InsightsSection insights={data.insights} />
        )}
      </div>

      {/* Actions - Read-only for MVP */}
      <div className="px-6 py-4 border-t bg-gray-50 flex gap-3">
        <button
          onClick={onExport}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export Report
        </button>
        <button
          onClick={onCreateTicket}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <Copy className="w-4 h-4" />
          Create Ticket
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// Mock Data for Testing
// ============================================================================

export const MOCK_S3_BUCKET_DATA: S3BucketDetailData = {
  bucketName: 'prod-data-bucket',
  bucketArn: 'arn:aws:s3:::prod-data-bucket',
  region: 'us-east-1',
  system: 'alon-prod',
  environment: 'Production',

  planes: {
    configured: { available: true, lastUpdated: new Date().toISOString() },
    observed: { available: false, confidence: 'unknown', lastUpdated: new Date().toISOString() },
    authorized: { available: true, lastUpdated: new Date().toISOString() },
    changed: { available: true, lastUpdated: new Date().toISOString() },
  },

  blockPublicAccess: {
    blockPublicAcls: true,
    ignorePublicAcls: true,
    blockPublicPolicy: false, // Partially disabled
    restrictPublicBuckets: false,
    allEnabled: false,
  },

  bucketPolicy: {
    hasBucketPolicy: true,
    statementCount: 2,
    statements: [
      {
        sid: 'AllowCloudFrontAccess',
        effect: 'Allow',
        principals: [
          { type: 'Service', value: 'cloudfront.amazonaws.com', isPublic: false },
        ],
        actions: ['s3:GetObject'],
        resources: ['arn:aws:s3:::prod-data-bucket/*'],
        conditions: [
          { key: 'AWS:SourceArn', operator: 'StringEquals', values: ['arn:aws:cloudfront::123456789012:distribution/EXAMPLE'] },
        ],
        isPublicAccess: false,
        isOverlyBroad: false,
      },
      {
        sid: 'PublicReadAccess',
        effect: 'Allow',
        principals: [
          { type: '*', value: '*', isPublic: true },
        ],
        actions: ['s3:GetObject', 's3:ListBucket'],
        resources: ['arn:aws:s3:::prod-data-bucket', 'arn:aws:s3:::prod-data-bucket/*'],
        isPublicAccess: true,
        isOverlyBroad: true,
      },
    ],
    publicStatements: [],
    crossAccountStatements: [],
  },

  aclGrants: [
    {
      grantee: 'OWNER',
      granteeType: 'CanonicalUser',
      permission: 'FULL_CONTROL',
      isPublic: false,
    },
  ],

  encryption: {
    enabled: true,
    type: 'SSE-S3',
  },

  observedUsage: {
    dataEventsStatus: 'disabled',
    dataEventsReason: 'S3 data events are not enabled in CloudTrail for this bucket. Without data events, we cannot observe actual access patterns.',
  },

  gap: {
    available: false,
    reason: 'Gap analysis requires observed usage data. Enable S3 data events to identify unused access.',
  },

  changeHistory: [
    {
      eventType: 'PutBucketPolicy',
      eventTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      actor: 'admin@example.com',
      summary: 'Added public read access statement',
    },
    {
      eventType: 'PutPublicAccessBlock',
      eventTime: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      actor: 'automation@example.com',
      summary: 'Disabled blockPublicPolicy and restrictPublicBuckets',
    },
  ],

  insights: [
    {
      type: 'critical',
      title: 'Block Public Access Partially Disabled',
      description: 'Two of four Block Public Access settings are disabled, allowing public bucket policies.',
      recommendation: 'Enable all Block Public Access settings unless public access is explicitly required.',
    },
    {
      type: 'critical',
      title: 'Public Access via Bucket Policy',
      description: 'Bucket policy grants public read access (Principal: "*").',
      recommendation: 'Review if public access is necessary. Consider using CloudFront with OAI/OAC instead.',
    },
    {
      type: 'warning',
      title: 'Observed Usage Unknown',
      description: 'S3 data events are not enabled. Cannot verify which principals are actually accessing this bucket.',
      recommendation: 'Enable CloudTrail S3 data events to identify unused access patterns.',
    },
  ],
}
