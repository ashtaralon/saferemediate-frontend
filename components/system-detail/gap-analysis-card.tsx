"use client"

import { Zap, AlertTriangle, RefreshCw } from "lucide-react"
import type { GapAnalysis } from "./types"

interface GapAnalysisCardProps {
  gapAnalysis: GapAnalysis
  loading: boolean
  error: string | null
  onRetry: () => void
}

export function GapAnalysisCard({ gapAnalysis, loading, error, onRetry }: GapAnalysisCardProps) {
  const actualPercent = gapAnalysis.allowed > 0 ? Math.round((gapAnalysis.actual / gapAnalysis.allowed) * 100) : 0

  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-purple-600" />
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">GAP Analysis</h3>
        </div>
        {error ? (
          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">Error</span>
        ) : (
          <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
            {loading ? "Loading..." : `${gapAnalysis.confidence || 99}% confidence`}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-600 border-t-transparent"></div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-3">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <p className="text-sm font-medium text-gray-900 mb-1">Unable to load GAP Analysis</p>
          <p className="text-xs text-gray-500 mb-3">{error}</p>
          <button
            onClick={onRetry}
            className="flex items-center gap-1 px-3 py-1 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* ALLOWED Bar */}
          <div className="mb-4">
            <div className="flex justify-between mb-1">
              <span className="text-sm text-gray-500">ALLOWED (IAM Policies)</span>
              <span className="text-sm font-medium text-gray-600">{gapAnalysis.allowed} permissions</span>
            </div>
            <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-gray-400 rounded-full" style={{ width: "100%" }}></div>
            </div>
          </div>

          {/* ACTUAL Bar */}
          <div className="mb-4">
            <div className="flex justify-between mb-1">
              <span className="text-sm font-medium" style={{ color: "#8B5CF6" }}>
                ACTUAL (Used)
              </span>
              <span className="text-sm font-bold" style={{ color: "#8B5CF6" }}>
                {gapAnalysis.actual} permissions
              </span>
            </div>
            <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${actualPercent}%`, backgroundColor: "#8B5CF6" }}
              ></div>
            </div>
          </div>

          {/* GAP Highlight */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-red-700">GAP (Attack Surface)</span>
              <span className="text-sm font-bold text-red-700">{gapAnalysis.gap} unused permissions</span>
            </div>
            <p className="text-xs text-red-600 mt-1">
              {gapAnalysis.gapPercent}% reduction possible by removing unused permissions
            </p>
          </div>
        </>
      )}
    </div>
  )
}







