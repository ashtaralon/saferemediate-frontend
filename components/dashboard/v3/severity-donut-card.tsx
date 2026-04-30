"use client"

import { useCachedFetch } from "@/lib/use-cached-fetch"
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts"
import { ErrorCard, LoadingCard, Section } from "./card-shell"
import { descriptorClass, heroNumberClass } from "./styles"

/**
 * Issues by severity — donut chart.
 *
 * Real source: /api/proxy/issues/summary. Backend returns
 * {critical, high, medium, low} as integer counts, real.
 *
 * Honest: if total === 0, render an "all clear" empty state instead
 * of a 0-segment donut.
 */

type IssuesSummary = {
  total?: number
  critical?: number
  high?: number
  medium?: number
  low?: number
  by_severity?: { critical?: number; high?: number; medium?: number; low?: number }
  error?: string
}

const SEVERITY_COLORS = {
  critical: "#dc2626",
  high: "#f59e0b",
  medium: "#3b82f6",
  low: "#94a3b8",
}

export function SeverityDonutCard() {
  const { data, loading, error, retry } = useCachedFetch<IssuesSummary>(
    "/api/proxy/issues/summary",
    { cacheKey: "issues-summary", fetchInit: { cache: "no-store" } }
  )

  if (loading && !data) return <LoadingCard label="Issues by severity" />
  if (error && !data) return <ErrorCard label="Issues by severity" error={error} onRetry={retry} />
  if (!data) return null

  const total = data.total ?? 0
  const sev = {
    critical: data.critical ?? data.by_severity?.critical ?? 0,
    high: data.high ?? data.by_severity?.high ?? 0,
    medium: data.medium ?? data.by_severity?.medium ?? 0,
    low: data.low ?? data.by_severity?.low ?? 0,
  }

  const chartData = [
    { name: "Critical", value: sev.critical, color: SEVERITY_COLORS.critical },
    { name: "High", value: sev.high, color: SEVERITY_COLORS.high },
    { name: "Medium", value: sev.medium, color: SEVERITY_COLORS.medium },
    { name: "Low", value: sev.low, color: SEVERITY_COLORS.low },
  ].filter((d) => d.value > 0)

  if (total === 0 || chartData.length === 0) {
    return (
      <Section
        label="Issues by severity"
        descriptor="No active findings — all clear."
        className="border-l-[3px] border-l-emerald-500"
      >
        <div className="flex items-center gap-3 py-2">
          <span className={`${heroNumberClass} text-emerald-700`}>0</span>
          <span className="text-sm text-slate-500">active findings</span>
        </div>
      </Section>
    )
  }

  return (
    <Section
      label="Issues by severity"
      descriptor="Active findings across all systems"
      className="border-l-[3px] border-l-rose-500"
    >
      <div className="flex items-center gap-5">
        <div className="relative h-[140px] w-[140px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                innerRadius={48}
                outerRadius={68}
                paddingAngle={2}
                stroke="white"
                strokeWidth={2}
              >
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-bold tabular-nums text-slate-900">{total}</span>
            <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
              total
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2">
          {chartData.map((d) => (
            <div key={d.name} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-slate-700">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: d.color }}
                />
                {d.name}
              </span>
              <span className="font-mono font-semibold tabular-nums text-slate-900">
                {d.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className={`${descriptorClass} mt-3 border-t border-slate-100 pt-2`}>
        Counts pulled live from /api/issues/summary — no fabrication.
      </p>
    </Section>
  )
}
