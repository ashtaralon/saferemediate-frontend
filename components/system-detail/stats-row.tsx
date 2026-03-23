"use client"

import { AlertTriangle } from "lucide-react"
import type { SeverityCounts } from "./types"

interface StatsRowProps {
  healthScore: number
  severityCounts: SeverityCounts
  totalChecks: number
  onHighClick: () => void
}

export function StatsRow({ healthScore, severityCounts, totalChecks, onHighClick }: StatsRowProps) {
  return (
    <div className="grid grid-cols-5 gap-4 mb-6">
      {/* System Health */}
      <div className="bg-white rounded-xl p-6 border border-[var(--border,#e5e7eb)]">
        <p className="text-xs font-medium text-[var(--muted-foreground,#6b7280)] uppercase tracking-wide mb-4">System Health</p>
        <div className="flex items-center justify-center">
          <div className="relative w-24 h-24">
            <svg className="w-24 h-24 transform -rotate-90">
              <circle cx="48" cy="48" r="40" stroke="#E5E7EB" strokeWidth="8" fill="none" />
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke={healthScore >= 80 ? "#10B981" : healthScore >= 60 ? "#F59E0B" : "#EF4444"}
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 40}`}
                strokeDashoffset={`${2 * Math.PI * 40 * (1 - healthScore / 100)}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-[var(--foreground,#111827)]">{healthScore}</span>
              <span className="text-xs text-[var(--muted-foreground,#6b7280)]">Score</span>
            </div>
          </div>
        </div>
        <div className="text-center mt-3">
          <span
            className={`text-sm font-medium ${
              healthScore >= 80 ? "text-[#22c55e]" : healthScore >= 60 ? "text-yellow-600" : "text-[#ef4444]"
            }`}
          >
            {healthScore >= 80 ? "HEALTHY" : healthScore >= 60 ? "WARNING" : "CRITICAL"}
          </span>
          <p className="text-xs text-[var(--muted-foreground,#9ca3af)]">{totalChecks} checks</p>
        </div>
      </div>

      {/* Critical */}
      <div className="bg-white rounded-xl p-6 border border-[var(--border,#e5e7eb)]">
        <p className="text-xs font-medium text-[#ef4444] uppercase tracking-wide mb-2">Critical</p>
        <p className="text-4xl font-bold text-[#ef4444]">{severityCounts.critical}</p>
        <p className="text-sm text-[var(--muted-foreground,#6b7280)] mt-1">Immediate action required</p>
        <p className="text-xs text-[#22c55e] mt-1">No critical issues</p>
      </div>

      {/* High */}
      <div className="bg-white rounded-xl p-6 border border-[var(--border,#e5e7eb)]">
        <p className="text-xs font-medium text-orange-500 uppercase tracking-wide mb-2">High</p>
        <button
          onClick={onHighClick}
          className="text-4xl font-bold text-orange-500 hover:text-orange-600 cursor-pointer transition-colors"
          title="Click to view unused permissions"
        >
          {severityCounts.high}
        </button>
        <p className="text-sm text-[var(--muted-foreground,#6b7280)] mt-1">Fix within 24 hours</p>
        <p className="text-xs text-orange-500 mt-2">Click to view details</p>
      </div>

      {/* Medium */}
      <div className="bg-white rounded-xl p-6 border border-[var(--border,#e5e7eb)]">
        <p className="text-xs font-medium text-yellow-500 uppercase tracking-wide mb-2">Medium</p>
        <p className="text-4xl font-bold text-yellow-500">{severityCounts.medium}</p>
        <p className="text-sm text-[var(--muted-foreground,#6b7280)] mt-1">Fix within 7 days</p>
        <p className="text-xs text-yellow-500 mt-2">-1 from last scan</p>
      </div>

      {/* Passing */}
      <div className="bg-white rounded-xl p-6 border border-[var(--border,#e5e7eb)]">
        <p className="text-xs font-medium text-[#22c55e] uppercase tracking-wide mb-2">Passing</p>
        <p className="text-4xl font-bold text-[#22c55e]">{severityCounts.passing}</p>
        <p className="text-sm text-[var(--muted-foreground,#6b7280)] mt-1">All checks passed</p>
        <p className="text-xs text-[#22c55e] mt-2">+5 from last scan</p>
      </div>
    </div>
  )
}







