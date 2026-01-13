"use client"

import { useState } from "react"
import { AlertTriangle, ChevronRight, Shield, Key, Globe, Zap, X, ChevronDown, ChevronUp } from "lucide-react"
import type { GapItem, RiskTag, SecurityComponent } from "./types"

interface GapQueueProps {
  gaps: GapItem[]
  components: SecurityComponent[]
  onGapClick: (gap: GapItem) => void
  maxItems?: number
  collapsed?: boolean
  onToggleCollapse?: () => void
}

const RISK_WEIGHTS: Record<RiskTag, number> = {
  wildcard: 100,
  admin: 90,
  public: 85,
  delete: 70,
  write: 60,
  broad_ports: 50,
}

function calculatePriority(gap: GapItem): number {
  // Higher score = higher priority
  let score = 0

  // Risk tags (highest weight)
  gap.riskTags.forEach(tag => {
    score += RISK_WEIGHTS[tag] || 0
  })

  // Confidence (higher confidence = more certain, prioritize)
  score += gap.confidence * 0.5

  // Risk score from the gap itself
  score += gap.riskScore * 0.3

  // Internet exposure is critical
  if (gap.exposure?.cidr === '0.0.0.0/0') {
    score += 100
  }

  return score
}

function GapQueueItem({ gap, rank, onClick }: { gap: GapItem; rank: number; onClick: () => void }) {
  const priority = calculatePriority(gap)
  const isHighPriority = priority > 150
  const isMediumPriority = priority > 100

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg border transition-all hover:shadow-md ${
        isHighPriority
          ? 'border-red-200 bg-red-50 hover:border-red-300'
          : isMediumPriority
            ? 'border-amber-200 bg-amber-50 hover:border-amber-300'
            : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Rank badge */}
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
          isHighPriority
            ? 'bg-red-500 text-white'
            : isMediumPriority
              ? 'bg-amber-500 text-white'
              : 'bg-gray-300 text-gray-700'
        }`}>
          {rank}
        </div>

        <div className="flex-1 min-w-0">
          {/* Main identifier */}
          <div className="font-medium text-sm text-gray-900 truncate">
            {gap.identifier}
          </div>

          {/* Component info */}
          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
            {gap.componentType === 'iam_role' || gap.componentType === 'iam_user' ? (
              <Key className="w-3 h-3" />
            ) : gap.componentType === 'security_group' ? (
              <Shield className="w-3 h-3" />
            ) : (
              <Globe className="w-3 h-3" />
            )}
            <span className="truncate">{gap.componentName}</span>
          </div>

          {/* Risk tags */}
          <div className="flex gap-1 mt-2 flex-wrap">
            {gap.riskTags.map(tag => (
              <span key={tag} className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                tag === 'wildcard' || tag === 'admin' || tag === 'public'
                  ? 'bg-red-100 text-red-700'
                  : tag === 'delete' || tag === 'write'
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-amber-100 text-amber-700'
              }`}>
                {tag === 'wildcard' && '*'}
                {tag === 'admin' && 'Admin'}
                {tag === 'public' && '0.0.0.0/0'}
                {tag === 'delete' && 'Delete'}
                {tag === 'write' && 'Write'}
                {tag === 'broad_ports' && 'Broad'}
              </span>
            ))}
          </div>
        </div>

        {/* Confidence */}
        <div className="text-right flex-shrink-0">
          <div className={`text-sm font-bold ${
            gap.confidence >= 80 ? 'text-green-600' :
            gap.confidence >= 50 ? 'text-amber-600' :
            'text-gray-500'
          }`}>
            {gap.confidence}%
          </div>
          <div className="text-xs text-gray-400">conf</div>
        </div>

        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 self-center" />
      </div>
    </button>
  )
}

export function GapQueue({
  gaps,
  components,
  onGapClick,
  maxItems = 10,
  collapsed = false,
  onToggleCollapse,
}: GapQueueProps) {
  // Sort gaps by priority
  const sortedGaps = [...gaps]
    .sort((a, b) => calculatePriority(b) - calculatePriority(a))
    .slice(0, maxItems)

  // Summary stats
  const wildcardCount = gaps.filter(g => g.riskTags.includes('wildcard')).length
  const adminCount = gaps.filter(g => g.riskTags.includes('admin')).length
  const publicCount = gaps.filter(g => g.riskTags.includes('public')).length

  if (collapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        className="w-full bg-gradient-to-r from-red-50 to-amber-50 border border-red-200 rounded-xl p-4 flex items-center justify-between hover:shadow-md transition-shadow"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div className="text-left">
            <div className="font-semibold text-gray-900">Top Removals To Do Now</div>
            <div className="text-sm text-gray-500">
              {gaps.length} removal candidates • {wildcardCount} wildcards • {publicCount} public
            </div>
          </div>
        </div>
        <ChevronDown className="w-5 h-5 text-gray-400" />
      </button>
    )
  }

  return (
    <div className="bg-gradient-to-r from-red-50 to-amber-50 border border-red-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-red-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <div className="font-semibold text-gray-900">Top Removals To Do Now</div>
            <div className="text-xs text-gray-500">
              Ranked by risk: wildcards, privileged actions, internet exposure
            </div>
          </div>
        </div>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1.5 hover:bg-red-100 rounded-lg transition-colors"
          >
            <ChevronUp className="w-4 h-4 text-gray-500" />
          </button>
        )}
      </div>

      {/* Summary chips */}
      <div className="px-4 py-2 flex gap-2 border-b border-red-100 bg-white/50">
        <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
          {wildcardCount} Wildcards
        </span>
        <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-medium">
          {adminCount} Admin/IAM
        </span>
        <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-medium">
          {publicCount} Internet Exposed
        </span>
      </div>

      {/* Gap list */}
      <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
        {sortedGaps.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Zap className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <div className="text-sm">No high-priority removals found</div>
            <div className="text-xs text-gray-400 mt-1">Your security posture looks good!</div>
          </div>
        ) : (
          sortedGaps.map((gap, idx) => (
            <GapQueueItem
              key={gap.id}
              gap={gap}
              rank={idx + 1}
              onClick={() => onGapClick(gap)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      {gaps.length > maxItems && (
        <div className="px-4 py-2 border-t border-red-100 bg-white/50 text-center">
          <span className="text-xs text-gray-500">
            Showing top {maxItems} of {gaps.length} removal candidates
          </span>
        </div>
      )}
    </div>
  )
}
