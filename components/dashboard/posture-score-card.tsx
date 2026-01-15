"use client"

import { useState, useEffect } from "react"
import { Shield, AlertTriangle, RefreshCw, TrendingUp, TrendingDown, ChevronRight } from "lucide-react"
import { fetchPostureScore, type PostureScoreData } from "@/lib/api-client"

interface PostureScoreCardProps {
  systemName: string
  onViewDetails?: () => void
}

const GRADE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  A: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
  B: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  C: { bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-200" },
  D: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
  F: { bg: "bg-red-100", text: "text-red-700", border: "border-red-200" },
}

const DIMENSION_CONFIG: Record<string, { label: string; color: string }> = {
  least_privilege: { label: "Least Privilege", color: "#8B5CF6" },
  network_security: { label: "Network Security", color: "#3B82F6" },
  data_protection: { label: "Data Protection", color: "#10B981" },
  compliance: { label: "Compliance", color: "#F59E0B" },
  observability: { label: "Observability", color: "#EC4899" },
}

export function PostureScoreCard({ systemName, onViewDetails }: PostureScoreCardProps) {
  const [data, setData] = useState<PostureScoreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchPostureScore(systemName)
      if (result) {
        setData(result)
      } else {
        setError("Failed to load posture score")
      }
    } catch (e: any) {
      setError(e.message || "Failed to load posture score")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (systemName) {
      loadData()
    }
  }, [systemName])

  const gradeColors = data?.grade ? GRADE_COLORS[data.grade] : GRADE_COLORS.F

  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-600" />
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Security Posture</h3>
        </div>
        {!loading && !error && data && (
          <span className={`px-3 py-1 ${gradeColors.bg} ${gradeColors.text} text-lg font-bold rounded-lg ${gradeColors.border} border`}>
            {data.grade}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent"></div>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-3">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <p className="text-sm font-medium text-gray-900 mb-1">Unable to load posture score</p>
          <p className="text-xs text-gray-500 mb-3">{error}</p>
          <button
            onClick={loadData}
            className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      ) : data ? (
        <>
          {/* Score Display */}
          <div className="flex items-center gap-4 mb-6">
            <div className="relative w-24 h-24">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                {/* Background circle */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="#E5E7EB"
                  strokeWidth="8"
                  fill="none"
                />
                {/* Progress circle */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke={data.overall_score >= 80 ? "#10B981" : data.overall_score >= 60 ? "#F59E0B" : "#EF4444"}
                  strokeWidth="8"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${(data.overall_score / 100) * 251.2} 251.2`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-gray-900">{Math.round(data.overall_score)}</span>
                <span className="text-xs text-gray-500">/ 100</span>
              </div>
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-600 mb-1">
                {data.resources_analyzed} resources analyzed
              </p>
              <p className="text-xs text-gray-500">
                {data.window_days}-day observation window
              </p>
            </div>
          </div>

          {/* Dimension Breakdown */}
          <div className="space-y-3 mb-4">
            {Object.entries(data.dimensions).map(([key, dim]) => {
              const config = DIMENSION_CONFIG[key]
              if (!config) return null
              return (
                <div key={key}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-medium text-gray-600">{config.label}</span>
                    <span className="text-xs font-semibold" style={{ color: config.color }}>
                      {Math.round(dim.score)}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${dim.score}%`, backgroundColor: config.color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Top Issues */}
          {data.top_issues && data.top_issues.length > 0 && (
            <div className="border-t border-gray-100 pt-4">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Top Issues to Address
              </h4>
              <div className="space-y-2">
                {data.top_issues.slice(0, 2).map((issue, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-medium text-gray-700 capitalize">
                        {issue.dimension.replace(/_/g, ' ')}
                      </span>
                      <span className="text-gray-500"> - {issue.recommendation}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* View Details Link */}
          {onViewDetails && (
            <button
              onClick={onViewDetails}
              className="mt-4 w-full flex items-center justify-center gap-1 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              View Detailed Breakdown
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </>
      ) : null}
    </div>
  )
}
