"use client"

import { useCachedFetch } from "@/lib/use-cached-fetch"
import { Activity, Check, RotateCcw, Zap } from "lucide-react"

/**
 * Live Now strip — dashboard-level pulse on the safety pipeline.
 *
 * The product's actual moat is simulate→snapshot→execute→rollback. The
 * V3 home doesn't surface this anywhere — every card is findings or
 * scoring, which Wiz also does. The Live Now strip is uniquely Cyntro
 * and zero-effort visually: tells the operator at a glance whether
 * the engine is doing anything right now or what it last did.
 *
 * Design decisions made in conversation:
 *   1. Empty state is NOT "Live Now: 0 executing" — that's dead
 *      weight 95% of the time. When idle, show recent completions
 *      ("Completed 2h ago: narrowed s3:* on alon-demo-ec2-role · -7
 *      actions"). Single surface for "what the engine is doing now /
 *      what it just did."
 *   2. Per memory feedback_no_mock_numbers_in_ui.md — never claim a
 *      clean state without evidence. "Engine idle" is fact-based
 *      (last RemediationEvent with status=completed); never
 *      manufactured.
 *
 * Data source: /api/proxy/recent-activity (already pulls
 * /api/remediation-history/timeline). Hook into it with a 1-min
 * staleness max because this surface is by-definition live.
 */

type ActivityItem = {
  kind: "remediation" | "snapshot" | "rollback"
  timestamp: string | null
  resource_type?: string
  resource_id?: string
  detail?: string
  action_type?: string
  status?: string
  permissions_removed?: number
}

type ActivityResponse = {
  items?: ActivityItem[]
  total?: number
  errors?: string[]
}

function formatAgeBrief(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function ageFromIso(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / 1000))
}

export function LiveNowStrip() {
  // 1-min staleness — by-definition live surface. If older than that,
  // refresh; if even older, show "—" rather than misleading claim.
  const { data, loading } = useCachedFetch<ActivityResponse>(
    "/api/proxy/recent-activity",
    {
      cacheKey: "live-now-activity",
      maxStaleMs: 60 * 1000,
      fetchInit: { cache: "no-store" },
    },
  )

  if (loading && !data) {
    // Tight skeleton — strip is single-line.
    return (
      <div className="rounded-[14px] border border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 animate-pulse rounded-full bg-slate-200" />
          <div className="h-3 w-48 animate-pulse rounded bg-slate-100" />
        </div>
      </div>
    )
  }

  const items = data?.items ?? []
  // Find any in-flight remediation. Backend contract: status === "in_flight"
  // OR "executing" OR "canary" — none of those guaranteed yet, so we look
  // for status that ISN'T a terminal state. If none of the records use
  // those statuses, we'll show the latest completed instead.
  const inFlight = items.filter((i) => {
    if (i.kind !== "remediation") return false
    const s = (i.status ?? "").toLowerCase()
    return s === "in_flight" || s === "executing" || s === "canary" || s === "staged"
  })

  // Latest completed remediation (or rollback / snapshot if no remediations).
  const latestCompleted = items
    .filter((i) => i.timestamp)
    .sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""))[0]

  const ageSec = ageFromIso(latestCompleted?.timestamp)

  // Active state — at least one remediation actually in-flight
  if (inFlight.length > 0) {
    return (
      <div className="rounded-[14px] border border-blue-200 bg-blue-50/60 px-4 py-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100">
            <Zap className="h-3.5 w-3.5 text-blue-700" strokeWidth={3} />
          </span>
          <span className="font-medium text-blue-900">
            {inFlight.length} remediation{inFlight.length === 1 ? "" : "s"} in flight
          </span>
          <span className="ml-auto text-xs text-blue-700">
            {inFlight
              .slice(0, 2)
              .map((i) => i.resource_id)
              .filter(Boolean)
              .join(" · ")}
            {inFlight.length > 2 ? ` (+${inFlight.length - 2} more)` : ""}
          </span>
        </div>
      </div>
    )
  }

  // Idle state — show the most-recent completed action, or "Engine idle" if no events.
  if (!latestCompleted) {
    return (
      <div className="rounded-[14px] border border-slate-200 bg-slate-50/60 px-4 py-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100">
            <Activity className="h-3.5 w-3.5 text-slate-500" />
          </span>
          <span className="font-medium text-slate-700">Engine idle</span>
          <span className="ml-auto text-xs text-slate-500">No remediation events recorded</span>
        </div>
      </div>
    )
  }

  // Recent completion display
  const isRollback = latestCompleted.kind === "rollback"
  const isRemediation = latestCompleted.kind === "remediation"
  const Icon = isRollback ? RotateCcw : isRemediation ? Zap : Check
  const tone = isRollback
    ? { wrap: "border-amber-200 bg-amber-50/60", chip: "bg-amber-100 text-amber-700", verb: "text-amber-800" }
    : isRemediation
      ? { wrap: "border-emerald-200 bg-emerald-50/60", chip: "bg-emerald-100 text-emerald-700", verb: "text-emerald-800" }
      : { wrap: "border-slate-200 bg-slate-50/60", chip: "bg-slate-100 text-slate-700", verb: "text-slate-800" }

  const verb = isRollback ? "Rolled back" : isRemediation ? "Remediated" : "Snapshotted"
  const ageLabel = ageSec !== null ? formatAgeBrief(ageSec) : "—"

  return (
    <div className={`rounded-[14px] border px-4 py-3 ${tone.wrap}`}>
      <div className="flex items-center gap-3 text-sm">
        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${tone.chip}`}>
          <Icon className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
        <span className="text-slate-700">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Engine idle ·
          </span>{" "}
          <span className={`font-medium ${tone.verb}`}>{verb}</span>{" "}
          <span className="font-medium text-slate-900">
            {latestCompleted.resource_type}
          </span>{" "}
          <span className="font-mono text-xs text-slate-700">
            {latestCompleted.resource_id}
          </span>
          {isRemediation && latestCompleted.permissions_removed ? (
            <span className="ml-2 text-xs text-slate-500">
              −{latestCompleted.permissions_removed} permission
              {latestCompleted.permissions_removed === 1 ? "" : "s"}
            </span>
          ) : null}
        </span>
        <span className="ml-auto text-xs tabular-nums text-slate-500">{ageLabel}</span>
      </div>
    </div>
  )
}
