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
    { label: "Medium", count: medium, color: "bg-[#8b5cf6]" },
    { label: "Low", count: low, color: "bg-gray-400" },
  ]

  return (
    <div className="bg-white rounded-lg p-6 border border-[var(--border,#e5e7eb)]">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-[var(--foreground,#111827)] mb-4">Security Issues</h2>
          <div className="flex items-center gap-4">
            {severityItems.map((item) => (
              <div key={item.label} className="flex flex-col items-center">
                <div
                  className={`${item.color} text-white rounded-full w-14 h-14 flex items-center justify-center text-lg font-bold`}
                >
                  {item.count}
                </div>
                <div className="text-xs text-[var(--muted-foreground,#4b5563)] mt-1">{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-right">
          <div className="text-4xl font-bold text-[var(--foreground,#111827)]">{totalIssues}</div>
          <div className="text-sm text-[var(--muted-foreground,#4b5563)]">Total Open Issues</div>
          {todayChange !== 0 && (
            <div className="text-xs text-[var(--muted-foreground,#6b7280)] mt-1">
              {todayChange > 0 ? "+" : ""}
              {todayChange} today
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-4 border-t border-[var(--border,#e5e7eb)]">
        {cveCount > 0 && <Badge variant="outline">{cveCount} CVEs</Badge>}
        {threatsCount > 0 && <Badge variant="outline">{threatsCount} Threats</Badge>}
        {zeroDayCount > 0 && (
          <Badge variant="outline" className="bg-[#eab30810] text-[#eab308] border-[#eab30840]">
            {zeroDayCount} Zero-day
          </Badge>
        )}
        {secretsCount > 0 && (
          <Badge variant="outline" className="bg-[#ef444410] text-[#ef4444] border-[#ef444440]">
            {secretsCount} Secrets
          </Badge>
        )}
        {complianceCount > 0 && (
          <Badge variant="outline" className="bg-[#22c55e10] text-[#22c55e] border-[#22c55e40]">
            {complianceCount} Compliance
          </Badge>
        )}
        <button className="ml-auto text-sm text-[#2D51DA] hover:underline">View Details →</button>
      </div>
    </div>
  )
}
