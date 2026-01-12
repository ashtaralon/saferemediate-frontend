'use client'

import React from 'react'
import { Activity, Eye, Settings, Shield, Check, X, Minus } from 'lucide-react'

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
  if (status === false) return <X className="w-3 h-3" />
  return <Minus className="w-3 h-3" />
}

const getStatusStyles = (status: boolean | null, color: string) => {
  const colorMap: Record<string, { confirmed: string; denied: string; unknown: string }> = {
    emerald: {
      confirmed: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400',
      denied: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
      unknown: 'bg-slate-700/30 border-slate-600/30 text-slate-500',
    },
    violet: {
      confirmed: 'bg-violet-500/20 border-violet-500/40 text-violet-400',
      denied: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
      unknown: 'bg-slate-700/30 border-slate-600/30 text-slate-500',
    },
    amber: {
      confirmed: 'bg-amber-500/20 border-amber-500/40 text-amber-400',
      denied: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
      unknown: 'bg-slate-700/30 border-slate-600/30 text-slate-500',
    },
    blue: {
      confirmed: 'bg-blue-500/20 border-blue-500/40 text-blue-400',
      denied: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
      unknown: 'bg-slate-700/30 border-slate-600/30 text-slate-500',
    },
  }

  const styles = colorMap[color] || colorMap.emerald
  if (status === true) return styles.confirmed
  if (status === false) return styles.denied
  return styles.unknown
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
            title={`${config.label}: ${status === true ? 'Confirmed' : status === false ? 'Denied' : 'Unknown'}`}
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
          : status === false
          ? 'text-rose-400'
          : 'text-slate-600'

        return (
          <span
            key={config.key}
            className={`text-xs ${colorClass}`}
            title={`${config.label}: ${status === true ? '✓' : status === false ? '✗' : '—'}`}
          >
            {status === true ? '✓' : status === false ? '✗' : '—'}
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
        <X className="w-3 h-3 text-rose-400" /> Denied
      </span>
      <span className="flex items-center gap-1">
        <Minus className="w-3 h-3 text-slate-500" /> Unknown
      </span>
    </div>
  )
}

export default ReconciliationBadge
