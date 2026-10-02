"use client"

import { Button } from "@/components/ui/button"
import { ArrowUpRight, ScanSearch, TrendingDown, TrendingUp } from "lucide-react"

interface HomeStatsBannerProps {
  /** Null / absent = not computed (held or unknown). Never rendered as 0. */
  avgHealthScore?: number | null
  healthScoreTrend?: number
  /** Counts: null / absent = unknown, never rendered as 0. */
  needAttention?: number | null
  totalIssues?: number | null
  criticalIssues?: number | null
  averageScore?: number | null
  averageScoreTrend?: number
  lastScanTime?: string | null
  /** The counted resources; null / absent when nothing was counted (no pill, never "0"). */
  resourceCount?: number | null
  /** Critical + high from the summary; null / absent when unread (no pill, never "0"). */
  urgentFindings?: number | null
  lastRefreshLabel?: string
}

export function HomeStatsBanner({
  avgHealthScore = null,
  healthScoreTrend = 0,
  needAttention = null,
  totalIssues = null,
  criticalIssues = null,
  averageScore = null,
  averageScoreTrend = 0,
  lastScanTime = null,
  resourceCount = null,
  urgentFindings = null,
  lastRefreshLabel = "Just now",
}: HomeStatsBannerProps) {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-[#2D51DA]/20 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.22),_transparent_32%),linear-gradient(135deg,#2343B8_0%,#2D51DA_42%,#5B7CFF_100%)] p-8 text-white shadow-[0_30px_80px_-45px_rgba(45,81,218,0.85)]">
      <div className="absolute -top-14 right-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute bottom-0 left-10 h-32 w-32 rounded-full bg-cyan-300/10 blur-3xl" />

      <div className="relative flex flex-col gap-8 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/90 backdrop-blur">
            <ScanSearch className="h-3.5 w-3.5" />
            Home Command
          </div>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white xl:text-4xl">
            Security posture across your active cloud environment
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/78">
            One place to track enforcement, findings pressure, and the systems that need attention right now.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {resourceCount !== null && (
              <div className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-white/90 backdrop-blur">
                <span className="font-semibold text-white">{resourceCount}</span> tracked resources
              </div>
            )}
            {urgentFindings !== null && (
              <div className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-white/90 backdrop-blur">
                <span className="font-semibold text-white">{urgentFindings}</span> urgent findings
              </div>
            )}
            <div className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm text-white/90 backdrop-blur">
              Refreshed {lastRefreshLabel}
            </div>
          </div>
        </div>

        <div className="min-w-[260px] rounded-2xl border border-white/18 bg-white/10 p-5 backdrop-blur">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Most Recent Scan</div>
          <div className="mt-3 text-2xl font-semibold leading-tight" data-testid="home-last-scan">{lastScanTime ?? "Unknown"}</div>
          <div className="mt-2 text-sm text-white/75">Latest telemetry snapshot across the connected environment.</div>
          <Button size="sm" className="mt-4 bg-white text-[#2D51DA] hover:bg-gray-100">
            View Scan
          </Button>
        </div>
      </div>

      <div className="relative mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/14 bg-white/10 p-5 backdrop-blur">
          <div className="text-xs uppercase tracking-[0.2em] text-white/70">Avg Health Score</div>
          {avgHealthScore == null ? (
            <>
              <div className="mt-3 text-2xl font-semibold" data-testid="home-avg-health-not-computed">
                Not computed
              </div>
              <div className="mt-3 text-xs text-white/70">
                The backend withheld this score (analysis held or usage unmeasured). This is not a score of 0.
              </div>
            </>
          ) : (
          <div className="mt-3 text-5xl font-bold" data-testid="home-avg-health-score">{avgHealthScore}</div>
          )}
          {avgHealthScore == null ? null : healthScoreTrend !== 0 ? (
            <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-black/10 px-3 py-1 text-xs text-white/80">
              <TrendingDown className="h-3.5 w-3.5" />
              {Math.abs(healthScoreTrend)} from last week
            </div>
          ) : (
            <div className="mt-3 text-xs text-white/70">Stable versus prior refresh</div>
          )}
        </div>

        <div className="rounded-2xl border border-white/14 bg-white/10 p-5 backdrop-blur">
          <div className="text-xs uppercase tracking-[0.2em] text-white/70">Need Attention</div>
          <div className="mt-3 text-5xl font-bold" data-testid="home-need-attention">{needAttention ?? "Unknown"}</div>
          <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-black/10 px-3 py-1 text-xs text-white/80">
            Prioritize exposed systems
            <ArrowUpRight className="h-3.5 w-3.5" />
          </div>
        </div>

        <div className="rounded-2xl border border-white/14 bg-white/10 p-5 backdrop-blur">
          <div className="text-xs uppercase tracking-[0.2em] text-white/70">Total Issues</div>
          <div className="mt-3 text-5xl font-bold" data-testid="home-total-issues">{totalIssues ?? "Unknown"}</div>
          <div className="mt-3 text-xs text-white/78" data-testid="home-critical-line">
            {criticalIssues == null
              ? "Critical count unknown — the summary was not computed"
              : criticalIssues > 0
                ? `${criticalIssues} critical need immediate review`
                : "No critical issues detected"}
          </div>
        </div>

        <div className="rounded-2xl border border-white/14 bg-white/10 p-5 backdrop-blur">
          <div className="text-xs uppercase tracking-[0.2em] text-white/70">Average Score</div>
          {averageScore == null ? (
            <div className="mt-3 text-2xl font-semibold" data-testid="home-average-score-not-computed">
              Not computed
            </div>
          ) : (
            <div className="mt-3 text-5xl font-bold">{averageScore}%</div>
          )}
          {averageScore == null ? null : averageScoreTrend !== 0 ? (
            <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-black/10 px-3 py-1 text-xs text-white/80">
              <TrendingUp className="h-3.5 w-3.5" />
              +{averageScoreTrend}% this month
            </div>
          ) : (
            <div className="mt-3 text-xs text-white/70">Trend will appear after more scans</div>
          )}
        </div>
      </div>
    </div>
  )
}
