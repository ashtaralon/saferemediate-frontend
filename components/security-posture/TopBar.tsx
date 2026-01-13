"use client"

import { useState } from "react"
import { Clock, Shield, Activity, ChevronDown, Check, Info } from "lucide-react"
import type { TimeWindow, EvidenceCoverage, EvidenceStrength } from "./types"

interface TopBarProps {
  timeWindow: TimeWindow
  onTimeWindowChange: (window: TimeWindow) => void
  evidenceCoverage: EvidenceCoverage[]
  confidenceThreshold: number
  onConfidenceThresholdChange: (threshold: number) => void
}

const TIME_WINDOW_OPTIONS: { value: TimeWindow; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '365d', label: 'Last 365 days' },
]

function getOverallEvidenceStrength(coverage: EvidenceCoverage[]): EvidenceStrength {
  const available = coverage.filter(c => c.status === 'available').length
  const total = coverage.length
  if (total === 0) return 'weak'
  const ratio = available / total
  if (ratio >= 0.75) return 'strong'
  if (ratio >= 0.5) return 'medium'
  return 'weak'
}

function EvidenceStatusChip({ coverage }: { coverage: EvidenceCoverage[] }) {
  const [expanded, setExpanded] = useState(false)
  const strength = getOverallEvidenceStrength(coverage)

  const strengthColors = {
    strong: 'bg-green-100 text-green-700 border-green-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    weak: 'bg-red-100 text-red-700 border-red-200',
  }

  const strengthLabels = {
    strong: 'Strong',
    medium: 'Medium',
    weak: 'Weak',
  }

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors hover:bg-opacity-80 ${strengthColors[strength]}`}
      >
        <Shield className="w-4 h-4" />
        <span>Evidence: {strengthLabels[strength]}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="absolute top-full left-0 mt-2 bg-white rounded-lg shadow-lg border p-4 min-w-[280px] z-50">
          <div className="text-sm font-semibold text-gray-700 mb-3">Evidence Sources</div>
          <div className="space-y-2">
            {coverage.map((source) => (
              <div key={source.source} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{source.source}</span>
                <div className="flex items-center gap-2">
                  {source.status === 'available' ? (
                    <span className="flex items-center gap-1 text-green-600 text-sm">
                      <Check className="w-4 h-4" />
                      Available
                    </span>
                  ) : source.status === 'partial' ? (
                    <span className="flex items-center gap-1 text-amber-600 text-sm">
                      <Activity className="w-4 h-4" />
                      Partial
                    </span>
                  ) : (
                    <span className="text-gray-400 text-sm">Unavailable</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {coverage.some(c => c.lastIngest) && (
            <div className="mt-3 pt-3 border-t text-xs text-gray-500">
              Last data ingest: {coverage.find(c => c.lastIngest)?.lastIngest}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function TopBar({
  timeWindow,
  onTimeWindowChange,
  evidenceCoverage,
  confidenceThreshold,
  onConfidenceThresholdChange,
}: TopBarProps) {
  const [showTimeDropdown, setShowTimeDropdown] = useState(false)
  const [showConfidenceTooltip, setShowConfidenceTooltip] = useState(false)

  return (
    <div className="bg-white border-b px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-40">
      {/* Time Window Selector */}
      <div className="relative">
        <button
          onClick={() => setShowTimeDropdown(!showTimeDropdown)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Clock className="w-4 h-4 text-gray-500" />
          <span>{TIME_WINDOW_OPTIONS.find(o => o.value === timeWindow)?.label}</span>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showTimeDropdown ? 'rotate-180' : ''}`} />
        </button>

        {showTimeDropdown && (
          <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border py-1 min-w-[160px] z-50">
            {TIME_WINDOW_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onTimeWindowChange(option.value)
                  setShowTimeDropdown(false)
                }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                  timeWindow === option.value ? 'text-indigo-600 font-medium bg-indigo-50' : 'text-gray-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Evidence Coverage */}
      <EvidenceStatusChip coverage={evidenceCoverage} />

      {/* Confidence Threshold Slider */}
      <div className="flex items-center gap-3 flex-1 max-w-xs">
        <div className="relative">
          <button
            onMouseEnter={() => setShowConfidenceTooltip(true)}
            onMouseLeave={() => setShowConfidenceTooltip(false)}
            className="text-gray-500 hover:text-gray-700"
          >
            <Info className="w-4 h-4" />
          </button>
          {showConfidenceTooltip && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg whitespace-nowrap z-50">
              Only show removals with confidence above this threshold
            </div>
          )}
        </div>
        <span className="text-sm text-gray-600 whitespace-nowrap">Min confidence:</span>
        <input
          type="range"
          min="0"
          max="100"
          value={confidenceThreshold}
          onChange={(e) => onConfidenceThresholdChange(Number(e.target.value))}
          className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
        />
        <span className="text-sm font-medium text-gray-700 w-10">{confidenceThreshold}%</span>
      </div>
    </div>
  )
}
