"use client"

import { useState } from "react"
import {
  Clock,
  ChevronDown,
  Check,
  AlertTriangle,
  Settings,
  Eye,
  Shield,
  History,
  ExternalLink,
  Info,
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type {
  TimeWindow,
  PlanePulseData,
  PlanePulseProps,
  PlaneStatus,
  PlaneType,
  CoverageIssue,
  ConfidenceLevel,
} from "./types"

// ============================================================================
// Constants
// ============================================================================

const TIME_WINDOW_OPTIONS: { value: TimeWindow; label: string; days: number }[] = [
  { value: '7d', label: '7 days', days: 7 },
  { value: '30d', label: '30 days', days: 30 },
  { value: '90d', label: '90 days', days: 90 },
  { value: '365d', label: '365 days', days: 365 },
]

const PLANE_CONFIG: Record<PlaneType, {
  label: string
  icon: typeof Settings
  description: string
  color: string
  bgColor: string
  borderColor: string
}> = {
  configured: {
    label: 'Configured',
    icon: Settings,
    description: 'What is set up (AWS Config, resource configurations)',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  observed: {
    label: 'Observed',
    icon: Eye,
    description: 'What is actually used (Flow Logs, CloudTrail, X-Ray)',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
  },
  authorized: {
    label: 'Authorized',
    icon: Shield,
    description: 'What is allowed (IAM policies, security group rules)',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
  },
  changed: {
    label: 'Changed',
    icon: History,
    description: 'Recent modifications (CloudTrail management events)',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
}

const CONFIDENCE_CONFIG: Record<ConfidenceLevel, {
  label: string
  color: string
  bgColor: string
}> = {
  high: { label: 'High', color: 'text-green-700', bgColor: 'bg-green-100' },
  medium: { label: 'Medium', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  low: { label: 'Low', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  unknown: { label: 'Unknown', color: 'text-gray-500', bgColor: 'bg-gray-100' },
}

// ============================================================================
// Helper Functions
// ============================================================================

function getAvailabilityStatus(plane: PlaneStatus): 'available' | 'limited' | 'missing' {
  if (!plane.available) return 'missing'
  if (plane.coverage_pct >= 80) return 'available'
  if (plane.coverage_pct >= 30) return 'limited'
  return 'missing'
}

function getAvailabilityLabel(status: 'available' | 'limited' | 'missing'): string {
  switch (status) {
    case 'available': return 'Available'
    case 'limited': return 'Limited'
    case 'missing': return 'Missing'
  }
}

function getAvailabilityColor(status: 'available' | 'limited' | 'missing'): string {
  switch (status) {
    case 'available': return 'text-green-600'
    case 'limited': return 'text-amber-600'
    case 'missing': return 'text-red-500'
  }
}

function getAvailabilityIcon(status: 'available' | 'limited' | 'missing') {
  switch (status) {
    case 'available': return Check
    case 'limited': return AlertTriangle
    case 'missing': return AlertTriangle
  }
}

function formatLastUpdated(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins} min ago`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

function hasLimitedVisibility(data: PlanePulseData): boolean {
  const observed = data.planes.observed
  return !observed.available || observed.coverage_pct < 50 || observed.confidence === 'low' || observed.confidence === 'unknown'
}

// ============================================================================
// Sub-Components
// ============================================================================

interface TrustBannerProps {
  issues: CoverageIssue[]
  onFixCoverage?: () => void
}

function TrustBanner({ issues, onFixCoverage }: TrustBannerProps) {
  if (issues.length === 0) return null

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-amber-800 text-sm">
            Limited Visibility
          </div>
          <div className="text-sm text-amber-700 mt-1">
            {issues.map((issue, i) => (
              <span key={i}>
                {issue.source}: {issue.issue}
                {i < issues.length - 1 && ' • '}
              </span>
            ))}
          </div>
        </div>
        {onFixCoverage && (
          <button
            onClick={onFixCoverage}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors flex-shrink-0"
          >
            Fix Coverage
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

interface PlaneChipProps {
  type: PlaneType
  status: PlaneStatus
}

function PlaneChip({ type, status }: PlaneChipProps) {
  const config = PLANE_CONFIG[type]
  const availability = getAvailabilityStatus(status)
  const AvailabilityIcon = getAvailabilityIcon(availability)
  const Icon = config.icon

  // Calculate progress bar color based on coverage
  const getProgressColor = () => {
    if (status.coverage_pct >= 80) return 'bg-green-500'
    if (status.coverage_pct >= 50) return 'bg-amber-500'
    return 'bg-red-400'
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`
            flex flex-col gap-2 p-3 rounded-lg border cursor-default
            ${config.bgColor} ${config.borderColor}
            hover:shadow-sm transition-shadow
          `}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon className={`w-4 h-4 ${config.color}`} />
              <span className={`text-sm font-semibold ${config.color}`}>
                {config.label}
              </span>
            </div>
            <div className={`flex items-center gap-1 text-xs ${getAvailabilityColor(availability)}`}>
              <AvailabilityIcon className="w-3.5 h-3.5" />
              <span>{getAvailabilityLabel(availability)}</span>
            </div>
          </div>

          {/* Coverage bar */}
          <div className="space-y-1">
            <div className="h-2 bg-white/60 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${getProgressColor()}`}
                style={{ width: `${status.coverage_pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600">{status.coverage_pct}% coverage</span>
              <span className="text-gray-500">{formatLastUpdated(status.last_updated)}</span>
            </div>
          </div>

          {/* Confidence badge for observed plane */}
          {type === 'observed' && status.confidence && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Confidence:</span>
              <span className={`
                px-1.5 py-0.5 rounded text-xs font-medium
                ${CONFIDENCE_CONFIG[status.confidence].bgColor}
                ${CONFIDENCE_CONFIG[status.confidence].color}
              `}>
                {CONFIDENCE_CONFIG[status.confidence].label}
              </span>
            </div>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-2">
          <p className="font-medium">{config.label}</p>
          <p className="text-gray-300">{config.description}</p>
          {type === 'observed' && status.breakdown && (
            <div className="pt-2 border-t border-gray-600 space-y-1">
              <p className="text-gray-400 text-xs">Source breakdown:</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span>Flow Logs:</span>
                <span>{status.breakdown.flow_logs}%</span>
                <span>CloudTrail:</span>
                <span>{status.breakdown.cloudtrail_usage}%</span>
                <span>X-Ray:</span>
                <span>{status.breakdown.xray}%</span>
              </div>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

interface WindowSelectorProps {
  value: TimeWindow
  onChange: (value: TimeWindow) => void
}

function WindowSelector({ value, onChange }: WindowSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const currentOption = TIME_WINDOW_OPTIONS.find(o => o.value === value)

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <Clock className="w-4 h-4 text-gray-500" />
        <span>Window: {currentOption?.label}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          {/* Dropdown */}
          <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border py-1 min-w-[140px] z-50">
            {TIME_WINDOW_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value)
                  setIsOpen(false)
                }}
                className={`
                  w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors
                  ${value === option.value ? 'text-indigo-600 font-medium bg-indigo-50' : 'text-gray-700'}
                `}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function PlanePulse({
  data,
  timeWindow,
  onTimeWindowChange,
  coverageIssues = [],
  onFixCoverage,
}: PlanePulseProps) {
  // Auto-detect coverage issues if not provided
  const detectedIssues: CoverageIssue[] = coverageIssues.length > 0
    ? coverageIssues
    : detectCoverageIssues(data)

  return (
    <div className="space-y-4">
      {/* Trust Banner - shows when visibility is limited */}
      <TrustBanner issues={detectedIssues} onFixCoverage={onFixCoverage} />

      {/* Plane Pulse Card */}
      <div className="bg-white border rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">Plane Pulse</h3>
            <Tooltip>
              <TooltipTrigger>
                <Info className="w-4 h-4 text-gray-400" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <p>Data coverage across the 4 planes. High coverage = higher confidence in security posture analysis.</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <WindowSelector value={timeWindow} onChange={onTimeWindowChange} />
        </div>

        {/* 4 Plane Chips Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <PlaneChip type="configured" status={data.planes.configured} />
          <PlaneChip type="observed" status={data.planes.observed} />
          <PlaneChip type="authorized" status={data.planes.authorized} />
          <PlaneChip type="changed" status={data.planes.changed} />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Helper: Auto-detect coverage issues from data
// ============================================================================

function detectCoverageIssues(data: PlanePulseData): CoverageIssue[] {
  const issues: CoverageIssue[] = []
  const observed = data.planes.observed

  // Check observed plane coverage
  if (!observed.available) {
    issues.push({
      source: 'Observed Data',
      issue: 'No telemetry data available',
      fixAction: 'Enable Flow Logs and CloudTrail',
    })
  } else if (observed.breakdown) {
    // Check individual sources
    if (observed.breakdown.flow_logs < 30) {
      issues.push({
        source: 'Flow Logs',
        issue: `Missing in ${100 - observed.breakdown.flow_logs}% of subnets`,
        fixAction: 'Enable VPC Flow Logs',
      })
    }
    if (observed.breakdown.cloudtrail_usage < 50) {
      issues.push({
        source: 'CloudTrail',
        issue: 'Data events not fully enabled',
        fixAction: 'Enable CloudTrail data events',
      })
    }
    if (observed.breakdown.xray < 10) {
      issues.push({
        source: 'X-Ray',
        issue: 'Tracing not enabled',
        fixAction: 'Enable X-Ray tracing',
      })
    }
  }

  // Check configured plane
  if (!data.planes.configured.available || data.planes.configured.coverage_pct < 50) {
    issues.push({
      source: 'AWS Config',
      issue: 'Configuration recording incomplete',
      fixAction: 'Enable AWS Config',
    })
  }

  return issues
}

// ============================================================================
// Export default mock data for testing
// ============================================================================

export const MOCK_PLANE_PULSE_DATA: PlanePulseData = {
  window_days: 30,
  planes: {
    configured: {
      available: true,
      coverage_pct: 98,
      last_updated: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 min ago
    },
    observed: {
      available: true,
      coverage_pct: 42,
      last_updated: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
      confidence: 'medium',
      breakdown: {
        flow_logs: 30,
        cloudtrail_usage: 55,
        xray: 10,
      },
    },
    authorized: {
      available: true,
      coverage_pct: 100,
      last_updated: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    },
    changed: {
      available: true,
      coverage_pct: 100,
      last_updated: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    },
  },
}
