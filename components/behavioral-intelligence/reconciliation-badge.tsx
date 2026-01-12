'use client'

import React from 'react'
import { Activity, Eye, Settings, Shield, Check, Minus } from 'lucide-react'

export interface PlaneBadges {
  observed: boolean | null    // true = confirmed, false = denied, null = unknown
  configured: boolean | null
  authorized: boolean | null
  changed: boolean | null
}

interface ReconciliationBadgeProps {
  planes: PlaneBadges
  compact?: boolean
}

interface BadgeConfig {
  key: keyof PlaneBadges
  label: string
  shortLabel: string
  icon: React.ReactNode
  color: string
}

const BADGE_CONFIGS: BadgeConfig[] = [
  {
    key: 'observed',
    label: 'Observed',
    shortLabel: 'Obs',
    icon: <Activity className="w-3 h-3" />,
    color: 'emerald',
  },
  {
    key: 'configured',
    label: 'Configured',
    shortLabel: 'Cfg',
    icon: <Settings className="w-3 h-3" />,
    color: 'violet',
  },
  {
    key: 'authorized',
    label: 'Authorized',
    shortLabel: 'Auth',
    icon: <Shield className="w-3 h-3" />,
    color: 'amber',
  },
  {
    key: 'changed',
    label: 'Changed',
    shortLabel: 'Chg',
    icon: <Eye className="w-3 h-3" />,
    color: 'blue',
  },
]

const getStatusIcon = (status: boolean | null) => {
  if (status === true) return <Check className="w-3 h-3" />
  if (status === false) return <Minus className="w-3 h-3" />  // "Not" state uses dash, not X
  return <Minus className="w-3 h-3" />  // Unknown also uses dash
}

const getStatusStyles = (status: boolean | null, color: string) => {
  // Only use colored backgrounds for confirmed (true) states
  // "Not" states (false) and unknown (null) use neutral gray
  const colorMap: Record<string, { confirmed: string; notConfirmed: string; unknown: string }> = {
    emerald: {
      confirmed: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400',
      notConfirmed: 'bg-slate-700/30 border-slate-600/30 text-slate-500',
      unknown: 'bg-slate-700/30 border-slate-600/30 text-slate-500',
    },
    violet: {
      confirmed: 'bg-violet-500/20 border-violet-500/40 text-violet-400',
      notConfirmed: 'bg-slate-700/30 border-slate-600/30 text-slate-500',
      unknown: 'bg-slate-700/30 border-slate-600/30 text-slate-500',
    },
    amber: {
      confirmed: 'bg-amber-500/20 border-amber-500/40 text-amber-400',
      notConfirmed: 'bg-slate-700/30 border-slate-600/30 text-slate-500',
      unknown: 'bg-slate-700/30 border-slate-600/30 text-slate-500',
    },
    blue: {
      confirmed: 'bg-blue-500/20 border-blue-500/40 text-blue-400',
      notConfirmed: 'bg-slate-700/30 border-slate-600/30 text-slate-500',
      unknown: 'bg-slate-700/30 border-slate-600/30 text-slate-500',
    },
  }

  const styles = colorMap[color] || colorMap.emerald
  if (status === true) return styles.confirmed
  if (status === false) return styles.notConfirmed
  return styles.unknown
}

// Get human-readable status text for tooltip
const getStatusText = (key: string, status: boolean | null): string => {
  const labels: Record<string, { positive: string; negative: string; unknown: string }> = {
    observed: { positive: 'Observed', negative: 'Not observed', unknown: 'Unknown' },
    configured: { positive: 'Configured', negative: 'Not configured', unknown: 'Unknown' },
    authorized: { positive: 'Authorized', negative: 'Not authorized', unknown: 'Unknown' },
    changed: { positive: 'Changed', negative: 'No change', unknown: 'Unknown' },
  }
  const label = labels[key] || { positive: 'Yes', negative: 'No', unknown: 'Unknown' }
  if (status === true) return label.positive
  if (status === false) return label.negative
  return label.unknown
}

export const ReconciliationBadge: React.FC<ReconciliationBadgeProps> = ({
  planes,
  compact = false,
}) => {
  return (
    <div className="flex flex-wrap gap-1">
      {BADGE_CONFIGS.map((config) => {
        const status = planes[config.key]
        const styles = getStatusStyles(status, config.color)

        return (
          <div
            key={config.key}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs ${styles}`}
            title={getStatusText(config.key, status)}
          >
            {config.icon}
            {!compact && <span>{config.shortLabel}</span>}
            {getStatusIcon(status)}
          </div>
        )
      })}
    </div>
  )
}

// Simpler inline version for tables
export const ReconciliationBadgeInline: React.FC<ReconciliationBadgeProps> = ({
  planes,
}) => {
  return (
    <div className="flex gap-0.5">
      {BADGE_CONFIGS.map((config) => {
        const status = planes[config.key]
        const colorClass = status === true
          ? 'text-emerald-400'
          : 'text-slate-600'  // Both "not" and "unknown" use neutral gray

        return (
          <span
            key={config.key}
            className={`text-xs ${colorClass}`}
            title={getStatusText(config.key, status)}
          >
            {status === true ? '✓' : '—'}
          </span>
        )
      })}
    </div>
  )
}

// Legend component for explaining badges
export const ReconciliationLegend: React.FC = () => {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-slate-400">
      <span className="flex items-center gap-1">
        <Check className="w-3 h-3 text-emerald-400" /> Confirmed
      </span>
      <span className="flex items-center gap-1">
        <Minus className="w-3 h-3 text-slate-500" /> Not confirmed / Unknown
      </span>
    </div>
  )
}

export default ReconciliationBadge
