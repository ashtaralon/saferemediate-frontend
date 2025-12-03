"use client"

import { Badge } from "@/components/ui/badge"

interface SecurityIssuesOverviewProps {
  critical?: number
  high?: number
  medium?: number
  low?: number
  totalIssues?: number
  todayChange?: number
  cveCount?: number
  threatsCount?: number
  zeroDayCount?: number
  secretsCount?: number
  complianceCount?: number
}

export function SecurityIssuesOverview({
  critical = 0,
  high = 0,
  medium = 0,
  low = 0,
  totalIssues = 0,
  todayChange = 0,
  cveCount = 0,
  threatsCount = 0,
  zeroDayCount = 0,
  secretsCount = 0,
  complianceCount = 0,
}: SecurityIssuesOverviewProps) {
  const severityItems = [
    { label: "Critical", count: critical, color: "bg-red-600" },
    { label: "High", count: high, color: "bg-orange-600" },
    { label: "Medium", count: medium, color: "bg-purple-600" },
    { label: "Low", count: low, color: "bg-gray-400" },
  ]

  return (
    <div className="bg-white rounded-lg p-6 border border-gray-200">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Security Issues</h2>
          <div className="flex items-center gap-4">
            {severityItems.map((item) => (
              <div key={item.label} className="flex flex-col items-center">
                <div
                  className={`${item.color} text-white rounded-full w-14 h-14 flex items-center justify-center text-lg font-bold`}
                >
                  {item.count}
                </div>
                <div className="text-xs text-gray-600 mt-1">{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-right">
          <div className="text-4xl font-bold text-gray-900">{totalIssues}</div>
          <div className="text-sm text-gray-600">Total Open Issues</div>
          {todayChange !== 0 && (
            <div className="text-xs text-gray-500 mt-1">
              {todayChange > 0 ? "+" : ""}
              {todayChange} today
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
        {cveCount > 0 && <Badge variant="outline">{cveCount} CVEs</Badge>}
        {threatsCount > 0 && <Badge variant="outline">{threatsCount} Threats</Badge>}
        {zeroDayCount > 0 && (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
            {zeroDayCount} Zero-day
          </Badge>
        )}
        {secretsCount > 0 && (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            {secretsCount} Secrets
          </Badge>
        )}
        {complianceCount > 0 && (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            {complianceCount} Compliance
          </Badge>
        )}
        <button className="ml-auto text-sm text-[#2D51DA] hover:underline">View Details →</button>
      </div>
    </div>
  )
}
