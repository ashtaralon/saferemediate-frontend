'use client'

import React from 'react'
import {
  Shield, AlertTriangle, TrendingUp, TrendingDown, Minus,
  Network, Users, Activity, Key
} from 'lucide-react'

interface Score {
  value: number
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  reasons: string[]
}

interface NetworkSummary {
  total_edges: number
  external_edges: number
  internal_edges: number
  top_talkers: Array<{ key: string; name: string; edge_count: number }>
}

interface IdentitySummary {
  principals_count: number
  roles_with_activity: number
  high_risk_actions: number
  top_actors: Array<{ key: string; name: string; action_count: number }>
}

interface ScoresPanelProps {
  confidence: Score
  risk: Score
  network?: NetworkSummary
  identity?: IdentitySummary
}

const ScoreGauge: React.FC<{
  label: string
  score: Score
  type: 'confidence' | 'risk'
}> = ({ label, score, type }) => {
  // For confidence: higher is better (green)
  // For risk: lower is better (so high risk = red)
  const getColor = () => {
    if (type === 'confidence') {
      if (score.value >= 80) return { bg: 'bg-emerald-500', text: 'text-emerald-400' }
      if (score.value >= 60) return { bg: 'bg-blue-500', text: 'text-blue-400' }
      if (score.value >= 40) return { bg: 'bg-amber-500', text: 'text-amber-400' }
      return { bg: 'bg-rose-500', text: 'text-rose-400' }
    } else {
      // Risk: inverse
      if (score.value <= 25) return { bg: 'bg-emerald-500', text: 'text-emerald-400' }
      if (score.value <= 50) return { bg: 'bg-amber-500', text: 'text-amber-400' }
      if (score.value <= 75) return { bg: 'bg-orange-500', text: 'text-orange-400' }
      return { bg: 'bg-rose-500', text: 'text-rose-400' }
    }
  }

  const color = getColor()

  const getLevelBadge = () => {
    const levelColors: Record<string, string> = {
      LOW: 'bg-emerald-500/20 text-emerald-400',
      MEDIUM: 'bg-amber-500/20 text-amber-400',
      HIGH: 'bg-orange-500/20 text-orange-400',
      CRITICAL: 'bg-rose-500/20 text-rose-400',
    }
    return levelColors[score.level] || levelColors.MEDIUM
  }

  return (
    <div className="flex-1 min-w-[280px]">
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {type === 'confidence' ? (
              <Shield className="w-5 h-5 text-blue-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            )}
            <span className="text-sm font-medium text-slate-300">{label}</span>
          </div>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getLevelBadge()}`}>
            {score.level}
          </span>
        </div>

        {/* Score Display */}
        <div className="flex items-end gap-2 mb-4">
          <span className={`text-5xl font-bold ${color.text}`}>{score.value}</span>
          <span className="text-slate-500 text-lg mb-1">/ 100</span>
        </div>

        {/* Progress Bar */}
        <div className="h-3 bg-slate-700/50 rounded-full overflow-hidden mb-4">
          <div
            className={`h-full ${color.bg} transition-all duration-500`}
            style={{ width: `${score.value}%` }}
          />
        </div>

        {/* Reasons */}
        {score.reasons.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs text-slate-500 uppercase tracking-wider">Factors</span>
            {score.reasons.map((reason, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm">
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${color.bg}`} />
                <span className="text-slate-400">{reason}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const MetricCard: React.FC<{
  label: string
  value: number | string
  icon: React.ReactNode
  color: string
  subLabel?: string
}> = ({ label, value, icon, color, subLabel }) => {
  const colorStyles: Record<string, string> = {
    emerald: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 text-emerald-400',
    blue: 'from-blue-500/20 to-blue-600/10 border-blue-500/30 text-blue-400',
    violet: 'from-violet-500/20 to-violet-600/10 border-violet-500/30 text-violet-400',
    amber: 'from-amber-500/20 to-amber-600/10 border-amber-500/30 text-amber-400',
    rose: 'from-rose-500/20 to-rose-600/10 border-rose-500/30 text-rose-400',
  }

  return (
    <div className={`bg-gradient-to-br ${colorStyles[color]} border rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm text-slate-400">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {subLabel && (
        <div className="text-xs text-slate-500 mt-1">{subLabel}</div>
      )}
    </div>
  )
}

export const ScoresPanel: React.FC<ScoresPanelProps> = ({
  confidence,
  risk,
  network,
  identity,
}) => {
  return (
    <div className="space-y-6">
      {/* Main Scores */}
      <div className="flex gap-4 flex-wrap">
        <ScoreGauge
          label="Confidence Score"
          score={confidence}
          type="confidence"
        />
        <ScoreGauge
          label="Risk Score"
          score={risk}
          type="risk"
        />
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {network && (
          <>
            <MetricCard
              label="Network Edges"
              value={network.total_edges}
              icon={<Network className="w-4 h-4" />}
              color="violet"
              subLabel={`${network.external_edges} external`}
            />
            <MetricCard
              label="Internal Traffic"
              value={network.internal_edges}
              icon={<Activity className="w-4 h-4" />}
              color="emerald"
            />
          </>
        )}
        {identity && (
          <>
            <MetricCard
              label="Active Principals"
              value={identity.principals_count}
              icon={<Users className="w-4 h-4" />}
              color="blue"
              subLabel={`${identity.roles_with_activity} roles active`}
            />
            <MetricCard
              label="High-Risk Actions"
              value={identity.high_risk_actions}
              icon={<Key className="w-4 h-4" />}
              color={identity.high_risk_actions > 0 ? 'rose' : 'emerald'}
            />
          </>
        )}
      </div>

      {/* Top Actors / Talkers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {network && network.top_talkers.length > 0 && (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
              <Network className="w-4 h-4 text-violet-400" />
              Top Network Talkers
            </h4>
            <div className="space-y-2">
              {network.top_talkers.slice(0, 5).map((talker, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 truncate max-w-[200px]">{talker.name}</span>
                  <span className="text-white font-medium">{talker.edge_count} edges</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {identity && identity.top_actors.length > 0 && (
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <h4 className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" />
              Top API Actors
            </h4>
            <div className="space-y-2">
              {identity.top_actors.slice(0, 5).map((actor, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span className="text-slate-400 truncate max-w-[200px]">{actor.name}</span>
                  <span className="text-white font-medium">{actor.action_count} calls</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ScoresPanel
