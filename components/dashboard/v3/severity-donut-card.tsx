"use client"

import { useCachedFetch } from "@/lib/use-cached-fetch"
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts"
import { ErrorCard, LoadingCard, Section } from "./card-shell"
import { descriptorClass, heroNumberClass } from "./styles"
import { deriveSummaryIntegrity, isCacheableSummary, summaryIntegrityCopy } from "@/lib/summary-integrity"

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
  // NULLABLE on purpose. The backend returns null — not 0 — for any count it
  // cannot vouch for: a held analyzer sweep, a Neo4j outage, a proxy timeout.
  // `?? 0` on these is how an outage rendered as "all clear" on the first card
  // a customer reads.
  total?: number | null
  critical?: number | null
  high?: number | null
  medium?: number | null
  low?: number | null
  by_severity?: {
    critical?: number | null
    high?: number | null
    medium?: number | null
    low?: number | null
  }
  error?: string
  success?: boolean
  serve_state?: string
  analysis_complete?: boolean
  counts_are_partial?: boolean
  failed_analyzers?: string[]
  integrityReason?: string
  fromStaleCache?: boolean
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
    {
      cacheKey: "issues-summary",
      fetchInit: { cache: "no-store" },
      // Never persist a payload we cannot vouch for, and treat any EXISTING
      // non-READY entry as a miss on read. Without this, the NOT_READY response
      // served during a backend restart was written to localStorage and kept
      // rendering "Analysis unavailable" long after the backend came back
      // READY with real counts — fail-closed, but stuck closed. The hook
      // already evicts on a failed predicate; the card simply never passed one.
      isCacheable: isCacheableSummary,
      // A Render cold-start answers 502/503/504 for the first request and is
      // warm by the second. Without this the card needed a human to reload.
      transientRetries: 2,
    }
  )

  if (loading && !data) return <LoadingCard label="LP findings by severity" />
  if (error && !data) return <ErrorCard label="LP findings by severity" error={error} onRetry={retry} />
  if (!data) return null

  const integrity = deriveSummaryIntegrity(data)

  // Held / not-ready / missing integrity / success:false / stale cache.
  // Never a zero, never "all clear" — an absence of counts is not an absence of
  // findings, and this card is the first thing a customer reads.
  if (integrity.state !== "READY") {
    const { title, body } = summaryIntegrityCopy(integrity)
    return (
      <Section
        label="LP findings by severity"
        descriptor={title}
        className="border-l-[3px] border-l-amber-500 h-full flex flex-col"
      >
        <div className="flex items-center gap-3 py-2">
          <span className={`${heroNumberClass} text-slate-400`}>—</span>
          <span className="text-sm text-slate-500">not available</span>
        </div>
        <p className="text-xs text-slate-500 leading-snug">{body}</p>
        {/* An unavailable state with no way out is a dead end: the backend
            usually recovers on its own, but the card had no affordance to ask
            again. */}
        <button
          onClick={retry}
          className="mt-2 self-start rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Retry
        </button>
      </Section>
    )
  }

  // READY from here. Counts are real numbers; a null would have been caught
  // above, so `?? 0` below can no longer launder an unknown into a zero.
  const total = data.total as number
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
  ].filter((d) => (d.value ?? 0) > 0)

  // ONLY canRenderAllClear. The `|| chartData.length === 0` that used to be
  // here reintroduced the whole bug through the back door: a READY response
  // with total:17 but a missing or malformed severity breakdown produces an
  // empty chartData, and the OR sent it straight to the green "0 active
  // findings — all clear" state. Seventeen findings, rendered as none.
  if (integrity.canRenderAllClear) {
    return (
      <Section
        label="LP findings by severity"
        descriptor="No active LP findings — all clear."
        className="border-l-[3px] border-l-emerald-500 h-full flex flex-col"
      >
        <div className="flex items-center gap-3 py-2">
          <span className={`${heroNumberClass} text-emerald-700`}>0</span>
          <span className="text-sm text-slate-500">active findings</span>
        </div>
      </Section>
    )
  }

  // READY with a positive total but nothing to plot — the severity breakdown is
  // missing or does not sum. Say so; do not draw an empty donut and do not fall
  // through to green.
  if (chartData.length === 0) {
    return (
      <Section
        label="LP findings by severity"
        descriptor="Severity breakdown unavailable"
        className="border-l-[3px] border-l-amber-500 h-full flex flex-col"
      >
        <div className="flex items-center gap-3 py-2">
          <span className={`${heroNumberClass} text-slate-700`}>{total}</span>
          <span className="text-sm text-slate-500">active findings</span>
        </div>
        <p className="text-xs text-slate-500 leading-snug">
          {total} finding{total === 1 ? "" : "s"} reported, but no severity
          breakdown came back — the split cannot be shown.
        </p>
      </Section>
    )
  }

  return (
    <Section
      label="LP findings by severity"
      descriptor="Active least-privilege findings by severity"
      className="border-l-[3px] border-l-rose-500 h-full flex flex-col"
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

      {/* mt-auto pushes the source-of-truth caption to the bottom so
          the extra height from h-full (when card sits in the hero
          right slot) doesn't look like dead space. */}
      <p className={`${descriptorClass} mt-auto pt-4 border-t border-slate-100`}>
        Counts pulled live from /api/issues/summary — no fabrication.
      </p>
    </Section>
  )
}
