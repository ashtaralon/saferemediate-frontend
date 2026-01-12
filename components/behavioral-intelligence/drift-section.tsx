'use client'

import React, { useState } from 'react'
import {
  AlertTriangle, ChevronDown, ChevronRight, Key, Shield, Server,
  TrendingUp, TrendingDown, ArrowRight, CheckCircle, XCircle
} from 'lucide-react'

interface DriftItem {
  resource_key: string
  resource_name: string
  resource_type: string
  drift_type: string
  severity: string
  description: string
  configured_value?: number | string | null
  observed_value?: number | string | null
  recommendation?: string
}

interface DriftSectionProps {
  items: DriftItem[]
}

const getResourceIcon = (type: string) => {
  const typeLower = type.toLowerCase()
  if (typeLower.includes('iam') || typeLower.includes('role')) {
    return <Key className="w-4 h-4" />
  }
  if (typeLower.includes('security') || typeLower.includes('sg')) {
    return <Shield className="w-4 h-4" />
  }
  return <Server className="w-4 h-4" />
}

const getDriftTypeLabel = (type: string) => {
  switch (type.toUpperCase()) {
    case 'OVER_PERMISSION':
      return 'Over-Permissioned'
    case 'SHADOW_PERMISSION':
      return 'Shadow Permission'
    case 'CONFIG_MISMATCH':
      return 'Config Mismatch'
    default:
      return type.replace(/_/g, ' ')
  }
}

const getDriftTypeColor = (type: string) => {
  switch (type.toUpperCase()) {
    case 'OVER_PERMISSION':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    case 'SHADOW_PERMISSION':
      return 'bg-rose-500/20 text-rose-400 border-rose-500/30'
    case 'CONFIG_MISMATCH':
      return 'bg-violet-500/20 text-violet-400 border-violet-500/30'
    default:
      return 'bg-slate-600/50 text-slate-400 border-slate-500/30'
  }
}

const getSeverityColor = (severity: string) => {
  switch (severity.toUpperCase()) {
    case 'CRITICAL':
      return 'bg-rose-500/20 text-rose-400'
    case 'HIGH':
      return 'bg-orange-500/20 text-orange-400'
    case 'MEDIUM':
      return 'bg-amber-500/20 text-amber-400'
    case 'LOW':
      return 'bg-emerald-500/20 text-emerald-400'
    default:
      return 'bg-slate-600/50 text-slate-400'
  }
}

const DriftCard: React.FC<{ item: DriftItem; isExpanded: boolean; onToggle: () => void }> = ({
  item,
  isExpanded,
  onToggle,
}) => {
  return (
    <div
      className={`border rounded-xl transition-all ${
        item.severity.toUpperCase() === 'CRITICAL' || item.severity.toUpperCase() === 'HIGH'
          ? 'bg-rose-500/5 border-rose-500/20'
          : 'bg-slate-800/50 border-slate-700/50'
      }`}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-slate-800/50 transition-colors rounded-t-xl"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400" />
        )}

        <div className="text-slate-500">{getResourceIcon(item.resource_type)}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium truncate">{item.resource_name}</span>
            <span className={`px-2 py-0.5 rounded text-xs border ${getDriftTypeColor(item.drift_type)}`}>
              {getDriftTypeLabel(item.drift_type)}
            </span>
          </div>
          <div className="text-xs text-slate-500 truncate">{item.resource_type}</div>
        </div>

        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityColor(item.severity)}`}>
          {item.severity}
        </span>
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-4 py-4 border-t border-slate-700/50 space-y-4">
          {/* Description */}
          <p className="text-slate-300">{item.description}</p>

          {/* Configured vs Observed */}
          {(item.configured_value !== undefined || item.observed_value !== undefined) && (
            <div className="flex items-center gap-4">
              {item.configured_value !== undefined && (
                <div className="flex-1 bg-slate-700/30 rounded-lg p-3">
                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">
                    Configured
                  </div>
                  <div className="text-lg font-bold text-white">
                    {item.configured_value?.toString() || 'N/A'}
                  </div>
                </div>
              )}

              <ArrowRight className="w-5 h-5 text-slate-600" />

              {item.observed_value !== undefined && (
                <div className="flex-1 bg-slate-700/30 rounded-lg p-3">
                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">
                    Observed
                  </div>
                  <div className="text-lg font-bold text-white">
                    {item.observed_value?.toString() || 'N/A'}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recommendation */}
          {item.recommendation && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-emerald-400 uppercase tracking-wider font-medium">
                  Recommendation
                </span>
              </div>
              <p className="text-slate-300 text-sm">{item.recommendation}</p>
            </div>
          )}

          {/* Resource Key */}
          <div className="text-xs text-slate-500">
            Resource: <span className="font-mono text-slate-400">{item.resource_key}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export const DriftSection: React.FC<DriftSectionProps> = ({ items }) => {
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set())
  const [filter, setFilter] = useState<string>('all')

  const toggleItem = (idx: number) => {
    const next = new Set(expandedItems)
    if (next.has(idx)) {
      next.delete(idx)
    } else {
      next.add(idx)
    }
    setExpandedItems(next)
  }

  // Count by type
  const typeCounts = items.reduce((acc, item) => {
    acc[item.drift_type] = (acc[item.drift_type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Count by severity
  const severityCounts = items.reduce((acc, item) => {
    acc[item.severity.toUpperCase()] = (acc[item.severity.toUpperCase()] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Filter items
  const filteredItems = filter === 'all'
    ? items
    : items.filter(item => item.drift_type === filter)

  if (items.length === 0) {
    return (
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-8 text-center">
        <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
        <p className="text-emerald-400 font-medium">No Drift Detected</p>
        <p className="text-sm text-slate-500 mt-1">
          Configuration matches observed behavior
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Severity Summary */}
          <div className="flex gap-3">
            {severityCounts.CRITICAL && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="text-sm text-slate-400">
                  {severityCounts.CRITICAL} Critical
                </span>
              </div>
            )}
            {severityCounts.HIGH && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-orange-500" />
                <span className="text-sm text-slate-400">
                  {severityCounts.HIGH} High
                </span>
              </div>
            )}
            {severityCounts.MEDIUM && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-sm text-slate-400">
                  {severityCounts.MEDIUM} Medium
                </span>
              </div>
            )}
            {severityCounts.LOW && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm text-slate-400">
                  {severityCounts.LOW} Low
                </span>
              </div>
            )}
          </div>

          {/* Type Filter */}
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                filter === 'all'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-700/50 text-slate-400 hover:text-white'
              }`}
            >
              All ({items.length})
            </button>
            {Object.entries(typeCounts).map(([type, count]) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  filter === type
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-700/50 text-slate-400 hover:text-white'
                }`}
              >
                {getDriftTypeLabel(type)} ({count})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Drift Items */}
      <div className="space-y-3">
        {filteredItems.map((item, idx) => (
          <DriftCard
            key={idx}
            item={item}
            isExpanded={expandedItems.has(idx)}
            onToggle={() => toggleItem(idx)}
          />
        ))}
      </div>
    </div>
  )
}

export default DriftSection
