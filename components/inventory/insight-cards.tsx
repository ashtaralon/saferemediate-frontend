"use client"

import type { Insight } from "@/lib/inspector-insights"
import { insightSeverityClass } from "@/lib/inspector-insights"

export function InsightCards({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null
  return (
    <ul className="space-y-2">
      {insights.map((insight, i) => (
        <li
          key={i}
          className={`rounded-lg border px-3 py-2.5 text-sm ${insightSeverityClass(insight.severity)}`}
        >
          <div className="font-medium">{insight.title}</div>
          {insight.detail && <p className="mt-1 text-xs opacity-90">{insight.detail}</p>}
          {insight.tags && insight.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {insight.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] px-1.5 py-0.5 rounded border bg-white/60 border-current/20"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
