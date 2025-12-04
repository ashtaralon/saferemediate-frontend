"use client"

import { Button } from "@/components/ui/button"
import { TrendingDown, TrendingUp } from "lucide-react"

interface HomeStatsBannerProps {
  avgHealthScore?: number
  healthScoreTrend?: number
  needAttention?: number
  totalIssues?: number
  criticalIssues?: number
  averageScore?: number
  averageScoreTrend?: number
  lastScanTime?: string
}

export function HomeStatsBanner({
  avgHealthScore = 0,
  healthScoreTrend = 0,
  needAttention = 0,
  totalIssues = 0,
  criticalIssues = 0,
  averageScore = 0,
  averageScoreTrend = 0,
  lastScanTime = "No scans yet",
}: HomeStatsBannerProps) {
  return (
    <div className="bg-[#2D51DA] rounded-xl p-8 text-white">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-12">
          {/* Avg Health Score */}
          <div>
            <div className="text-6xl font-bold">{avgHealthScore}</div>
            <div className="text-sm opacity-90 mt-1">Avg Health Score</div>
            {healthScoreTrend !== 0 && (
              <div className="flex items-center gap-1 text-xs mt-1 opacity-75">
                <TrendingDown className="w-3 h-3" />
                <span>{Math.abs(healthScoreTrend)} from last week</span>
              </div>
            )}
          </div>

          {/* Need Attention */}
          <div>
            <div className="text-6xl font-bold">{needAttention}</div>
            <div className="text-sm opacity-90 mt-1">Need Attention</div>
            {needAttention > 0 && (
              <button className="text-xs underline mt-1 opacity-75 hover:opacity-100">View All →</button>
            )}
          </div>

          {/* Total Issues */}
          <div>
            <div className="text-6xl font-bold">{totalIssues}</div>
            <div className="text-sm opacity-90 mt-1">Total Issues</div>
            {criticalIssues > 0 && <div className="text-xs mt-1 opacity-75">{criticalIssues} Critical</div>}
          </div>

          {/* Average Score */}
          <div>
            <div className="text-6xl font-bold">{averageScore}%</div>
            <div className="text-sm opacity-90 mt-1">Average Score</div>
            {averageScoreTrend !== 0 && (
              <div className="flex items-center gap-1 text-xs mt-1 opacity-75">
                <TrendingUp className="w-3 h-3" />
                <span>+{averageScoreTrend}% this month</span>
              </div>
            )}
          </div>
        </div>

        {/* Last Scan Info */}
        <div className="text-right">
          <div className="text-2xl font-semibold">{lastScanTime}</div>
          <div className="text-sm opacity-90 mt-1">Most Recent</div>
          <Button size="sm" className="mt-2 bg-white text-[#2D51DA] hover:bg-gray-100">
            View Scan
          </Button>
        </div>
      </div>
    </div>
  )
}
