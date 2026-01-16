"use client"

import { useState } from "react"
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Shield,
  Eye,
  Activity,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Users,
  Zap,
  Clock,
  Info,
  Server,
  Database,
  Globe,
  Key,
  Lock,
  Unlock,
  Network,
  HardDrive,
  Cloud,
  Box,
  User,
  FolderArchive,
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type {
  QueueType,
  QueueCardItem,
  CommandQueuesData,
  CommandQueuesProps,
  ConfidenceLevel,
  Severity,
  RiskFlag,
  CTAType,
  ComponentType,
  BlastRadiusRisk,
  MetricState,
} from "./types"

// ============================================================================
// Constants & Configuration
// ============================================================================

const QUEUE_CONFIG: Record<QueueType, {
  title: string
  subtitle: string
  icon: typeof CheckCircle2
  color: string
  bgColor: string
  borderColor: string
  headerBg: string
}> = {
  high_confidence_gaps: {
    title: 'High Confidence Gaps',
    subtitle: 'Safe to tighten',
    icon: CheckCircle2,
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    headerBg: 'bg-emerald-100',
  },
  architectural_risks: {
    title: 'Architectural Risks',
    subtitle: "Can't prove yet",
    icon: AlertTriangle,
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    headerBg: 'bg-amber-100',
  },
  blast_radius_warnings: {
    title: 'Blast Radius Warnings',
    subtitle: 'Recent risky changes',
    icon: AlertOctagon,
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    headerBg: 'bg-red-100',
  },
}

const SEVERITY_CONFIG: Record<Severity, {
  label: string
  color: string
  bgColor: string
  borderColor: string
}> = {
  critical: { label: 'Critical', color: 'text-red-700', bgColor: 'bg-red-100', borderColor: 'border-red-300' },
  high: { label: 'High', color: 'text-orange-700', bgColor: 'bg-orange-100', borderColor: 'border-orange-300' },
  medium: { label: 'Medium', color: 'text-amber-700', bgColor: 'bg-amber-100', borderColor: 'border-amber-300' },
  low: { label: 'Low', color: 'text-blue-700', bgColor: 'bg-blue-100', borderColor: 'border-blue-300' },
  info: { label: 'Info', color: 'text-gray-600', bgColor: 'bg-gray-100', borderColor: 'border-gray-300' },
}

const CONFIDENCE_CONFIG: Record<ConfidenceLevel, {
  label: string
  color: string
  bgColor: string
  dots: number
}> = {
  high: { label: 'High', color: 'text-green-700', bgColor: 'bg-green-100', dots: 4 },
  medium: { label: 'Medium', color: 'text-amber-700', bgColor: 'bg-amber-100', dots: 3 },
  low: { label: 'Low', color: 'text-orange-700', bgColor: 'bg-orange-100', dots: 2 },
  unknown: { label: 'Unknown', color: 'text-gray-500', bgColor: 'bg-gray-100', dots: 1 },
}

const RISK_FLAG_CONFIG: Record<RiskFlag, {
  label: string
  icon: typeof Globe
  color: string
}> = {
  world_open: { label: '0.0.0.0/0', icon: Globe, color: 'text-red-600' },
  admin_policy: { label: 'Admin', icon: Key, color: 'text-red-600' },
  wildcard_resource: { label: 'Resource:*', icon: Unlock, color: 'text-orange-600' },
  wildcard_action: { label: 'Action:*', icon: Unlock, color: 'text-orange-600' },
  public_bucket: { label: 'Public', icon: Globe, color: 'text-red-600' },
  sensitive_ports: { label: 'Sensitive Ports', icon: Network, color: 'text-orange-600' },
  cross_account: { label: 'Cross-Account', icon: Users, color: 'text-amber-600' },
  no_mfa: { label: 'No MFA', icon: Lock, color: 'text-orange-600' },
  overly_permissive: { label: 'Over-Permissive', icon: Unlock, color: 'text-amber-600' },
  no_encryption: { label: 'No Encryption', icon: Unlock, color: 'text-orange-600' },
  policy_issues: { label: 'Policy Issues', icon: AlertTriangle, color: 'text-amber-600' },
}

const CTA_LABELS: Record<CTAType, string> = {
  view_impact_report: 'View Impact Report',
  enable_telemetry: 'Enable Telemetry',
  investigate_activity: 'Investigate Activity',
  review_manually: 'Review Manually',
  view_change_diff: 'View Change Diff',
}

const RESOURCE_TYPE_ICONS: Record<ComponentType, {
  icon: typeof Shield
  color: string
  bgColor: string
}> = {
  iam_role: { icon: Key, color: 'text-purple-600', bgColor: 'bg-purple-100' },
  iam_user: { icon: User, color: 'text-purple-600', bgColor: 'bg-purple-100' },
  security_group: { icon: Shield, color: 'text-blue-600', bgColor: 'bg-blue-100' },
  s3_bucket: { icon: FolderArchive, color: 'text-green-600', bgColor: 'bg-green-100' },
  lambda: { icon: Zap, color: 'text-orange-600', bgColor: 'bg-orange-100' },
  ec2: { icon: Server, color: 'text-amber-600', bgColor: 'bg-amber-100' },
  rds: { icon: Database, color: 'text-blue-600', bgColor: 'bg-blue-100' },
  dynamodb: { icon: Database, color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString()
}

function getBlastRadiusColor(risk: BlastRadiusRisk): string {
  switch (risk) {
    case 'risky': return 'text-red-600'
    case 'safe': return 'text-green-600'
    case 'unknown': return 'text-gray-500'
  }
}

function renderMetricValue(metric: { value: number | null; state: MetricState }): React.ReactNode {
  if (metric.state === 'unknown') {
    return <span className="text-gray-400">??</span>
  }
  if (metric.state === 'zero' || metric.value === 0) {
    return <span className="text-gray-500">0</span>
  }
  return <span>{metric.value}</span>
}

function getMetricColor(metric: { value: number | null; state: MetricState }, type: 'A' | 'U' | 'G'): string {
  if (metric.state === 'unknown') return 'text-gray-400'
  if (metric.state === 'zero' || metric.value === 0) return 'text-gray-500'

  // A (Authorized) - higher is worse (more broad)
  if (type === 'A') {
    if (metric.value && metric.value > 50) return 'text-red-600'
    if (metric.value && metric.value > 20) return 'text-amber-600'
    return 'text-green-600'
  }

  // U (Observed) - depends on context, generally neutral
  if (type === 'U') {
    return 'text-blue-600'
  }

  // G (Gap) - higher is more to remove
  if (type === 'G') {
    if (metric.value && metric.value > 30) return 'text-red-600'
    if (metric.value && metric.value > 10) return 'text-amber-600'
    return 'text-green-600'
  }

  return 'text-gray-700'
}

function ConfidenceDots({ level }: { level: ConfidenceLevel }) {
  const config = CONFIDENCE_CONFIG[level]
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4].map((dot) => (
        <div
          key={dot}
          className={`w-1.5 h-1.5 rounded-full ${
            dot <= config.dots ? 'bg-current' : 'bg-gray-300'
          }`}
        />
      ))}
    </div>
  )
}

// ============================================================================
// Sub-Components
// ============================================================================

interface QueueCardProps {
  item: QueueCardItem
  queueType: QueueType
  onClick?: () => void
  onCTAClick?: () => void
  onGeneratePolicy?: () => void
  onSimulate?: () => void
  onRemediate?: () => void
}

function QueueCard({ item, queueType, onClick, onCTAClick, onGeneratePolicy, onSimulate, onRemediate }: QueueCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const severityConfig = SEVERITY_CONFIG[item.severity] ?? SEVERITY_CONFIG.medium
  const confidenceConfig = CONFIDENCE_CONFIG[item.confidence] ?? CONFIDENCE_CONFIG.unknown
  const resourceIconConfig = RESOURCE_TYPE_ICONS[item.resource_type] ?? { icon: Shield, color: 'text-gray-600', bgColor: 'bg-gray-100' }
  const ResourceIcon = resourceIconConfig.icon

  // Determine card style based on queue type
  const queueConfig = QUEUE_CONFIG[queueType]

  return (
    <div
      className={`
        bg-white border rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer
        ${severityConfig.borderColor}
      `}
      onClick={onClick}
    >
      {/* Card Header */}
      <div className="p-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Resource Type Icon */}
            <div className={`flex-shrink-0 w-8 h-8 rounded flex items-center justify-center ${resourceIconConfig.bgColor}`}>
              <ResourceIcon className={`w-5 h-5 ${resourceIconConfig.color}`} />
            </div>
            <div className="min-w-0">
              <div className="font-medium text-gray-900 truncate text-sm">
                {item.resource_name}
              </div>
              <div className="text-xs text-gray-500 capitalize">
                {item.resource_type.replace('_', ' ')}
              </div>
            </div>
          </div>

          {/* Severity Badge */}
          <span className={`
            px-2 py-0.5 rounded text-xs font-medium flex-shrink-0
            ${severityConfig.bgColor} ${severityConfig.color}
          `}>
            {severityConfig.label}
          </span>
        </div>

        {/* Risk Flags */}
        {item.risk_flags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {item.risk_flags.slice(0, 3).map((flag) => {
              const flagConfig = RISK_FLAG_CONFIG[flag]
              if (!flagConfig) return null
              const FlagIcon = flagConfig.icon
              return (
                <span
                  key={flag}
                  className={`
                    inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs
                    bg-gray-100 ${flagConfig.color}
                  `}
                >
                  <FlagIcon className="w-3 h-3" />
                  {flagConfig.label}
                </span>
              )
            })}
            {item.risk_flags.length > 3 && (
              <span className="text-xs text-gray-500">
                +{item.risk_flags.length - 3} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* A/U/G Metrics */}
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help">
                <div className="text-xs text-gray-500 mb-0.5">A</div>
                <div className={`font-semibold text-sm ${getMetricColor(item.A_authorized_breadth, 'A')}`}>
                  {renderMetricValue(item.A_authorized_breadth)}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>Authorized breadth (rules/actions allowed)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help">
                <div className="text-xs text-gray-500 mb-0.5">U</div>
                <div className={`font-semibold text-sm ${getMetricColor(item.U_observed_usage, 'U')}`}>
                  {renderMetricValue(item.U_observed_usage)}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>Observed usage (actually used)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="cursor-help">
                <div className="text-xs text-gray-500 mb-0.5">G</div>
                <div className={`font-semibold text-sm ${getMetricColor(item.G_gap, 'G')}`}>
                  {renderMetricValue(item.G_gap)}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>Gap (removable/reducible)</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Confidence & Blast Radius */}
      <div className="px-3 py-2 flex items-center justify-between text-xs">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex items-center gap-1.5 cursor-help ${confidenceConfig.color}`}>
              <span>Conf:</span>
              <ConfidenceDots level={item.confidence} />
              <span>{confidenceConfig.label}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            Evidence confidence level for this finding
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex items-center gap-1 cursor-help ${getBlastRadiusColor(item.blast_radius.risk)}`}>
              <Zap className="w-3.5 h-3.5" />
              <span>{item.blast_radius.neighbors} neighbors</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div>
              <div>Blast radius: {item.blast_radius.neighbors} connected resources</div>
              <div>{item.blast_radius.critical_paths} critical paths</div>
              {item.blast_radius.impacted_services && item.blast_radius.impacted_services.length > 0 && (
                <div className="mt-1 text-gray-400">
                  Services: {item.blast_radius.impacted_services.slice(0, 3).join(', ')}
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Why Now (for blast radius warnings) */}
      {item.why_now?.recent_change && (
        <div className="px-3 py-2 bg-red-50 border-t border-red-100 text-xs">
          <div className="flex items-center gap-1.5 text-red-700">
            <Clock className="w-3.5 h-3.5" />
            <span>Changed {item.why_now.changed_at ? formatTimeAgo(item.why_now.changed_at) : 'recently'}</span>
            {item.why_now.actor && (
              <span className="text-red-600">by {item.why_now.actor}</span>
            )}
          </div>
          {item.why_now.change_summary && (
            <div className="mt-1 text-red-600 truncate">
              "{item.why_now.change_summary}"
            </div>
          )}
        </div>
      )}

      {/* Risk Description (for architectural risks) */}
      {item.risk_description && queueType === 'architectural_risks' && (
        <div className="px-3 py-2 bg-amber-50 border-t border-amber-100 text-xs text-amber-700">
          <div className="flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>{item.risk_description}</span>
          </div>
        </div>
      )}

      {/* Action Buttons - LP Policy & Remediate (Simulate is inside Remediate flow) */}
      {(item.resource_type === 'iam_role' || item.resource_type === 'iam_user') && (
        <div className="px-3 py-2 border-t border-gray-100 flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onGeneratePolicy?.()
            }}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>LP Policy</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemediate?.()
            }}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Remediate</span>
          </button>
        </div>
      )}

      {/* CTA Button */}
      <div className="p-3 border-t border-gray-100">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onCTAClick?.()
          }}
          className={`
            w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium
            transition-colors
            ${queueType === 'high_confidence_gaps'
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
              : queueType === 'architectural_risks'
              ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
              : 'bg-red-100 text-red-700 hover:bg-red-200'
            }
          `}
        >
          <span>{item.recommended_action.cta_label}</span>
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

interface QueueColumnProps {
  type: QueueType
  items: QueueCardItem[]
  onCardClick?: (item: QueueCardItem) => void
  onCTAClick?: (item: QueueCardItem) => void
  onGeneratePolicy?: (item: QueueCardItem) => void
  onSimulate?: (item: QueueCardItem) => void
  onRemediate?: (item: QueueCardItem) => void
}

function QueueColumn({ type, items, onCardClick, onCTAClick, onGeneratePolicy, onSimulate, onRemediate }: QueueColumnProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const config = QUEUE_CONFIG[type]
  const Icon = config.icon

  const displayItems = showAll ? items : items.slice(0, 3)
  const hasMore = items.length > 3

  return (
    <div className={`flex flex-col rounded-xl border ${config.borderColor} overflow-hidden`}>
      {/* Queue Header */}
      <div
        className={`${config.headerBg} px-4 py-3 cursor-pointer`}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={`w-5 h-5 ${config.color}`} />
            <div>
              <div className={`font-semibold ${config.color}`}>
                {config.title}
              </div>
              <div className="text-xs text-gray-600">
                {config.subtitle} ({items.length})
              </div>
            </div>
          </div>
          {isCollapsed ? (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronUp className="w-5 h-5 text-gray-500" />
          )}
        </div>
      </div>

      {/* Queue Content */}
      {!isCollapsed && (
        <div className={`${config.bgColor} flex-1 p-3 space-y-3`}>
          {items.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Icon className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <div className="text-sm">No items in this queue</div>
            </div>
          ) : (
            <>
              {displayItems.map((item) => (
                <QueueCard
                  key={item.id}
                  item={item}
                  queueType={type}
                  onClick={() => onCardClick?.(item)}
                  onCTAClick={() => onCTAClick?.(item)}
                  onGeneratePolicy={() => onGeneratePolicy?.(item)}
                  onSimulate={() => onSimulate?.(item)}
                  onRemediate={() => onRemediate?.(item)}
                />
              ))}

              {hasMore && (
                <button
                  onClick={() => setShowAll(!showAll)}
                  className={`
                    w-full py-2 text-sm font-medium rounded-md
                    ${config.color} hover:bg-white/50 transition-colors
                  `}
                >
                  {showAll ? 'Show less' : `+ ${items.length - 3} more`}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

interface ConfidenceFilterProps {
  value: ConfidenceLevel
  onChange: (level: ConfidenceLevel) => void
}

function ConfidenceFilter({ value, onChange }: ConfidenceFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const config = CONFIDENCE_CONFIG[value]
  const levels: ConfidenceLevel[] = ['high', 'medium', 'low', 'unknown']

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg border bg-white text-sm font-medium
          hover:bg-gray-50 transition-colors
          ${config.color}
        `}
      >
        <span>Min confidence:</span>
        <span className={`px-2 py-0.5 rounded ${config.bgColor}`}>
          {config.label}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border py-1 min-w-[160px] z-50">
            {levels.map((level) => {
              const levelConfig = CONFIDENCE_CONFIG[level]
              return (
                <button
                  key={level}
                  onClick={() => {
                    onChange(level)
                    setIsOpen(false)
                  }}
                  className={`
                    w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors
                    flex items-center justify-between
                    ${value === level ? 'bg-indigo-50' : ''}
                  `}
                >
                  <span className={levelConfig.color}>{levelConfig.label}</span>
                  <ConfidenceDots level={level} />
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function CommandQueues({
  data,
  minConfidence,
  onMinConfidenceChange,
  onCardClick,
  onCTAClick,
  onGeneratePolicy,
  onSimulate,
  onRemediate,
}: CommandQueuesProps) {
  // Filter items based on minimum confidence
  const filterByConfidence = (items: QueueCardItem[]): QueueCardItem[] => {
    const confidenceOrder: ConfidenceLevel[] = ['unknown', 'low', 'medium', 'high']
    const minIndex = confidenceOrder.indexOf(minConfidence)

    return items.filter((item) => {
      const itemIndex = confidenceOrder.indexOf(item.confidence)
      return itemIndex >= minIndex
    })
  }

  const filteredGaps = filterByConfidence(data.high_confidence_gaps)
  const filteredRisks = filterByConfidence(data.architectural_risks)
  const filteredWarnings = filterByConfidence(data.blast_radius_warnings)

  const totalCount = filteredGaps.length + filteredRisks.length + filteredWarnings.length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Command Queues</h3>
          <p className="text-sm text-gray-500">
            {totalCount} actionable items across 3 queues
          </p>
        </div>
        <ConfidenceFilter value={minConfidence} onChange={onMinConfidenceChange} />
      </div>

      {/* 3 Queue Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <QueueColumn
          type="high_confidence_gaps"
          items={filteredGaps}
          onCardClick={(item) => onCardClick?.(item, 'high_confidence_gaps')}
          onCTAClick={(item) => onCTAClick?.(item, 'high_confidence_gaps')}
          onGeneratePolicy={(item) => onGeneratePolicy?.(item, 'high_confidence_gaps')}
          onSimulate={(item) => onSimulate?.(item, 'high_confidence_gaps')}
          onRemediate={(item) => onRemediate?.(item, 'high_confidence_gaps')}
        />
        <QueueColumn
          type="architectural_risks"
          items={filteredRisks}
          onCardClick={(item) => onCardClick?.(item, 'architectural_risks')}
          onCTAClick={(item) => onCTAClick?.(item, 'architectural_risks')}
          onGeneratePolicy={(item) => onGeneratePolicy?.(item, 'architectural_risks')}
          onSimulate={(item) => onSimulate?.(item, 'architectural_risks')}
          onRemediate={(item) => onRemediate?.(item, 'architectural_risks')}
        />
        <QueueColumn
          type="blast_radius_warnings"
          items={filteredWarnings}
          onCardClick={(item) => onCardClick?.(item, 'blast_radius_warnings')}
          onCTAClick={(item) => onCTAClick?.(item, 'blast_radius_warnings')}
          onGeneratePolicy={(item) => onGeneratePolicy?.(item, 'blast_radius_warnings')}
          onSimulate={(item) => onSimulate?.(item, 'blast_radius_warnings')}
          onRemediate={(item) => onRemediate?.(item, 'blast_radius_warnings')}
        />
      </div>
    </div>
  )
}

// ============================================================================
// Mock Data for Testing
// ============================================================================

export const MOCK_COMMAND_QUEUES_DATA: CommandQueuesData = {
  high_confidence_gaps: [
    {
      id: 'gap-1',
      resource_type: 'security_group',
      resource_name: 'frontend-sg',
      severity: 'medium',
      confidence: 'high',
      A_authorized_breadth: { value: 27, state: 'value' },
      U_observed_usage: { value: 3, state: 'value' },
      G_gap: { value: 24, state: 'value' },
      risk_flags: ['sensitive_ports'],
      blast_radius: { neighbors: 12, critical_paths: 2, risk: 'safe' },
      recommended_action: {
        cta: 'view_impact_report',
        cta_label: 'View Impact Report',
        reason: '24 rules unused in 90 days with high confidence',
      },
      evidence_window_days: 90,
    },
    {
      id: 'gap-2',
      resource_type: 'iam_role',
      resource_name: 'backend-service-role',
      severity: 'high',
      confidence: 'high',
      A_authorized_breadth: { value: 45, state: 'value' },
      U_observed_usage: { value: 12, state: 'value' },
      G_gap: { value: 33, state: 'value' },
      risk_flags: ['wildcard_resource', 'overly_permissive'],
      blast_radius: { neighbors: 8, critical_paths: 1, risk: 'safe' },
      recommended_action: {
        cta: 'view_impact_report',
        cta_label: 'View Impact Report',
        reason: '33 actions unused including sensitive permissions',
      },
      evidence_window_days: 90,
    },
  ],
  architectural_risks: [
    {
      id: 'risk-1',
      resource_type: 'iam_role',
      resource_name: 'data-processor-role',
      severity: 'critical',
      confidence: 'unknown',
      A_authorized_breadth: { value: 156, state: 'value' },
      U_observed_usage: { value: null, state: 'unknown' },
      G_gap: { value: null, state: 'unknown' },
      risk_flags: ['admin_policy', 'wildcard_resource'],
      risk_category: 'over_privileged',
      risk_description: 'No CloudTrail data events to verify actual usage of admin permissions',
      blast_radius: { neighbors: 24, critical_paths: 5, risk: 'risky' },
      recommended_action: {
        cta: 'enable_telemetry',
        cta_label: 'Enable Telemetry',
        reason: 'Cannot verify usage without CloudTrail data events',
      },
    },
    {
      id: 'risk-2',
      resource_type: 's3_bucket',
      resource_name: 'prod-data-bucket',
      severity: 'high',
      confidence: 'low',
      A_authorized_breadth: { value: 12, state: 'value' },
      U_observed_usage: { value: null, state: 'unknown' },
      G_gap: { value: null, state: 'unknown' },
      risk_flags: ['public_bucket'],
      risk_category: 'public_exposure',
      risk_description: 'Bucket policy allows public access. S3 data events not enabled.',
      blast_radius: { neighbors: 6, critical_paths: 2, risk: 'risky' },
      recommended_action: {
        cta: 'review_manually',
        cta_label: 'Review Manually',
        reason: 'Public access detected but usage data unavailable',
      },
    },
  ],
  blast_radius_warnings: [
    {
      id: 'warning-1',
      resource_type: 'security_group',
      resource_name: 'api-gateway-sg',
      severity: 'high',
      confidence: 'high',
      why_now: {
        recent_change: true,
        changed_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        actor: 'john@acme.com',
        change_type: 'modified',
        change_summary: 'Opened 0.0.0.0/0 on port 443',
      },
      A_authorized_breadth: { value: 15, state: 'value' },
      U_observed_usage: { value: 8, state: 'value' },
      G_gap: { value: 7, state: 'value' },
      risk_flags: ['world_open', 'sensitive_ports'],
      blast_radius: {
        neighbors: 18,
        critical_paths: 4,
        risk: 'risky',
        impacted_services: ['API Gateway', 'Lambda', 'RDS'],
      },
      recommended_action: {
        cta: 'investigate_activity',
        cta_label: 'Investigate Activity',
        reason: 'Recent change opened public access to sensitive port',
      },
    },
    {
      id: 'warning-2',
      resource_type: 'iam_role',
      resource_name: 'db-security-role',
      severity: 'critical',
      confidence: 'medium',
      why_now: {
        recent_change: true,
        changed_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
        actor: 'automation@acme.com',
        change_type: 'modified',
        change_summary: 'Trust policy updated - added cross-account access',
      },
      A_authorized_breadth: { value: 89, state: 'value' },
      U_observed_usage: { value: 23, state: 'value' },
      G_gap: { value: 66, state: 'value' },
      risk_flags: ['cross_account', 'admin_policy'],
      blast_radius: {
        neighbors: 32,
        critical_paths: 8,
        risk: 'risky',
        impacted_services: ['RDS', 'Secrets Manager', 'KMS'],
      },
      recommended_action: {
        cta: 'investigate_activity',
        cta_label: 'Investigate Activity',
        reason: 'Trust policy change with high blast radius',
      },
    },
  ],
}
