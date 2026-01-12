'use client'

import React from 'react'
import { AlertTriangle, CheckCircle, Info, Activity, Clock, Eye, EyeOff } from 'lucide-react'

interface CoverageInfo {
  flow_logs_enabled_enis_pct: number
  analysis_window: string
  observed_edges: number
  total_flows: number
  first_seen?: string | null
  last_seen?: string | null
  notes: string[]
}

interface CoverageBannerProps {
  coverage: CoverageInfo
  mode: 'observed' | 'observed+potential'
  onModeChange?: (mode: 'observed' | 'observed+potential') => void
}

export function CoverageBanner({ coverage, mode, onModeChange }: CoverageBannerProps) {
  const hasGoodCoverage = coverage.flow_logs_enabled_enis_pct >= 50
  const hasTraffic = coverage.observed_edges > 0
  const hasWarnings = coverage.notes.length > 0

  // Format time ago
  const formatTimeAgo = (dateStr: string | null | undefined) => {
    if (!dateStr) return null
    try {
      const date = new Date(dateStr)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMins / 60)
      const diffDays = Math.floor(diffHours / 24)

      if (diffMins < 60) return `${diffMins}m ago`
      if (diffHours < 24) return `${diffHours}h ago`
      return `${diffDays}d ago`
    } catch {
      return null
    }
  }

  const lastSeenFormatted = formatTimeAgo(coverage.last_seen)

  return (
    <div className="bg-slate-800/90 border border-slate-700 rounded-lg px-4 py-2 mb-3">
      <div className="flex items-center justify-between">
        {/* Left: Coverage Stats */}
        <div className="flex items-center gap-6">
          {/* Coverage Percentage */}
          <div className="flex items-center gap-2">
            {hasGoodCoverage ? (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            ) : hasTraffic ? (
              <Info className="w-4 h-4 text-amber-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400" />
            )}
            <span className="text-sm text-slate-300">
              Flow Logs: <span className={`font-medium ${hasGoodCoverage ? 'text-emerald-400' : hasTraffic ? 'text-amber-400' : 'text-red-400'}`}>
                {coverage.flow_logs_enabled_enis_pct.toFixed(0)}%
              </span>
            </span>
          </div>

          {/* Analysis Window */}
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <span className="text-sm text-slate-400">
              Window: <span className="text-slate-300">{coverage.analysis_window}</span>
            </span>
          </div>

          {/* Observed Edges */}
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-slate-500" />
            <span className="text-sm text-slate-400">
              Observed: <span className="text-emerald-400 font-medium">{coverage.observed_edges}</span> edges
            </span>
          </div>

          {/* Total Flows */}
          {coverage.total_flows > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">
                Flows: <span className="text-slate-300">{coverage.total_flows.toLocaleString()}</span>
              </span>
            </div>
          )}

          {/* Last Seen */}
          {lastSeenFormatted && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400">
                Last: <span className="text-slate-300">{lastSeenFormatted}</span>
              </span>
            </div>
          )}
        </div>

        {/* Right: Mode Toggle */}
        {onModeChange && (
          <div className="flex items-center gap-2 bg-slate-700/50 rounded-lg p-1">
            <button
              onClick={() => onModeChange('observed')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                mode === 'observed'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Show only observed traffic from VPC Flow Logs"
            >
              <Eye className="w-3.5 h-3.5" />
              Observed Only
            </button>
            <button
              onClick={() => onModeChange('observed+potential')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                mode === 'observed+potential'
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Show observed traffic plus potential paths from SG rules"
            >
              <EyeOff className="w-3.5 h-3.5" />
              + Potential Paths
            </button>
          </div>
        )}
      </div>

      {/* Warnings/Notes */}
      {hasWarnings && (
        <div className="mt-2 pt-2 border-t border-slate-700/50">
          {coverage.notes.map((note, idx) => (
            <div key={idx} className="flex items-start gap-2 text-xs">
              <AlertTriangle className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
              <span className="text-amber-400/80">{note}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default CoverageBanner
