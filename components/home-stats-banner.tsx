"use client"

import { ArrowUpRight, ScanSearch, TrendingDown, TrendingUp } from "lucide-react"

interface HomeStatsBannerProps {
  avgHealthScore?: number
  healthScoreTrend?: number
  needAttention?: number
  totalIssues?: number
  criticalIssues?: number
  averageScore?: number
  averageScoreTrend?: number
  resourceCount?: number
  urgentFindings?: number
  lastRefreshLabel?: string
}

export function HomeStatsBanner({
  avgHealthScore = 0,
  healthScoreTrend = 0,
  needAttention = 0,
  totalIssues = 0,
  criticalIssues = 0,
  averageScore = 0,
  averageScoreTrend = 0,
  resourceCount = 0,
  urgentFindings = 0,
  lastRefreshLabel = "Just now",
}: HomeStatsBannerProps) {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-[#dbe4ff] bg-[radial-gradient(circle_at_top_left,_rgba(191,219,254,0.35),_transparent_30%),linear-gradient(180deg,#ffffff_0%,#f7faff_100%)] p-8 text-[var(--foreground,#111827)] shadow-[0_25px_70px_-45px_rgba(37,99,235,0.35)]">
      <div className="absolute -top-14 right-10 h-40 w-40 rounded-full bg-[#bfdbfe]/40 blur-3xl" />
      <div className="absolute bottom-0 left-10 h-32 w-32 rounded-full bg-[#dbeafe]/70 blur-3xl" />

      <div className="relative">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-2 text-lg font-semibold text-[var(--foreground,#111827)]">
              <ScanSearch className="h-5 w-5 text-[#2D51DA]" />
              Home Command
            </div>
            <span className="rounded-full bg-[#2D51DA]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#2D51DA]">
              Live
            </span>
          </div>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--foreground,#111827)] xl:text-4xl">
            Security posture across your active cloud environment
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted-foreground,#6b7280)]">
            One place to track enforcement, findings pressure, and the systems that need attention right now.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-[#dbe4ff] bg-white/90 px-4 py-2 text-sm text-[var(--muted-foreground,#4b5563)]">
              <span className="font-semibold text-[var(--foreground,#111827)]">{resourceCount}</span> tracked resources
            </div>
            <div className="rounded-full border border-[#dbe4ff] bg-white/90 px-4 py-2 text-sm text-[var(--muted-foreground,#4b5563)]">
              <span className="font-semibold text-[var(--foreground,#111827)]">{urgentFindings}</span> urgent findings
            </div>
            <div className="rounded-full border border-[#dbe4ff] bg-white/90 px-4 py-2 text-sm text-[var(--muted-foreground,#4b5563)]">
              Refreshed {lastRefreshLabel}
            </div>
          </div>
        </div>
      </div>

      <div className="relative mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-[#bfdbfe] bg-[#eff6ff] p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-[#1d4ed8]">Avg Health Score</div>
          <div className="mt-3 text-5xl font-bold text-[#111827]">{avgHealthScore}</div>
          {healthScoreTrend !== 0 ? (
            <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 text-xs text-[#1e40af]">
              <TrendingDown className="h-3.5 w-3.5" />
              {Math.abs(healthScoreTrend)} from last week
            </div>
          ) : (
            <div className="mt-3 text-xs text-[#1e40af]">Stable versus prior refresh</div>
          )}
        </div>

        <div className="rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-[#b45309]">Need Attention</div>
          <div className="mt-3 text-5xl font-bold text-[#111827]">{needAttention}</div>
          <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 text-xs text-[#92400e]">
            Prioritize exposed systems
            <ArrowUpRight className="h-3.5 w-3.5" />
          </div>
        </div>

        <div className="rounded-2xl border border-[#fecaca] bg-[#fff1f2] p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-[#b91c1c]">Total Issues</div>
          <div className="mt-3 text-5xl font-bold text-[#111827]">{totalIssues}</div>
          <div className="mt-3 text-xs text-[#7f1d1d]">
            {criticalIssues > 0 ? `${criticalIssues} critical need immediate review` : "No critical issues detected"}
          </div>
        </div>

        <div className="rounded-2xl border border-[#ddd6fe] bg-[#f5f3ff] p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-[#6d28d9]">Average Score</div>
          <div className="mt-3 text-5xl font-bold text-[#111827]">{averageScore}%</div>
          {averageScoreTrend !== 0 ? (
            <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 text-xs text-[#5b21b6]">
              <TrendingUp className="h-3.5 w-3.5" />
              +{averageScoreTrend}% this month
            </div>
          ) : (
            <div className="mt-3 text-xs text-[#5b21b6]">Trend will appear after more scans</div>
          )}
        </div>
      </div>
    </div>
  )
}
