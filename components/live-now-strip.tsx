"use client"

/**
 * LiveNowStrip — slim full-width "what just happened" strip.
 *
 * Reads the most recent RemediationEvent from
 * /api/proxy/remediation-history/timeline (real Neo4j data, no
 * fabrication). When `systemName` is provided the proxy forwards
 * `system_name=` and the backend joins event → resource → SystemName,
 * so the strip is honestly scoped to that system. When `systemName`
 * is absent the strip shows the org-wide latest event.
 *
 * Three visible states:
 *   loading  — "Checking activity…"
 *   has-event — last execution + relative time + status + history link
 *   idle     — "No remediations recorded yet" (also when system has
 *              no matching events) — never silently empty.
 *   error    — "Activity feed unavailable" with retry; never shows
 *              a fabricated "all clear" on a broken fetch.
 */

import { useCallback, useEffect, useState } from "react"
import { Activity, AlertCircle, CheckCircle2, Clock, Loader2, RefreshCw } from "lucide-react"

interface RemediationEvent {
  event_id?: string
  timestamp?: string
  resource_type?: string
  resource_id?: string
  action_type?: string
  status?: string
  approved_by?: string | null
}

interface LiveNowStripProps {
  systemName?: string
  /** Operator click → switch to History tab on the same page (system
   *  detail) or navigate elsewhere on home. Caller decides. */
  onOpenHistory?: () => void
}

type StripState =
  | { kind: "loading" }
  | { kind: "has-event"; event: RemediationEvent }
  | { kind: "idle" }
  | { kind: "error"; message: string }

const FETCH_TIMEOUT_MS = 25_000

function relativeTime(ts: string | undefined): string {
  if (!ts) return "unknown time"
  const t = new Date(ts).getTime()
  if (!Number.isFinite(t)) return "unknown time"
  const diffMs = Date.now() - t
  if (diffMs < 0) return "just now"
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return "just now"
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

function statusTone(status: string | undefined): {
  color: string
  bg: string
  Icon: typeof CheckCircle2
  label: string
} {
  const s = (status ?? "").toLowerCase()
  if (s === "completed" || s === "succeeded" || s === "success") {
    return { color: "text-emerald-700", bg: "bg-emerald-50", Icon: CheckCircle2, label: "succeeded" }
  }
  if (s === "failed" || s === "error") {
    return { color: "text-rose-700", bg: "bg-rose-50", Icon: AlertCircle, label: "failed" }
  }
  if (s === "rolled_back" || s === "rollback") {
    return { color: "text-amber-700", bg: "bg-amber-50", Icon: RefreshCw, label: "rolled back" }
  }
  if (s === "in_progress" || s === "running" || s === "pending") {
    return { color: "text-sky-700", bg: "bg-sky-50", Icon: Loader2, label: "in progress" }
  }
  return { color: "text-slate-700", bg: "bg-slate-100", Icon: Clock, label: status ?? "—" }
}

function describeAction(event: RemediationEvent): string {
  const action = (event.action_type ?? "").toUpperCase()
  const verb =
    action === "ROLLBACK"
      ? "rolled back"
      : action === "PERMISSION_REMOVAL"
        ? "narrowed permissions on"
        : action === "POLICY_UPDATE" || action.startsWith("S3_")
          ? "updated policy on"
          : action === "SG_RULE_DELETE" || action === "SG_RULE_TIGHTEN"
            ? "tightened ingress on"
            : action
              ? action.toLowerCase().replace(/_/g, " ") + " on"
              : "modified"
  const resource = event.resource_id ?? "unknown resource"
  return `${verb} ${resource}`
}

export function LiveNowStrip({ systemName, onOpenHistory }: LiveNowStripProps) {
  const [state, setState] = useState<StripState>({ kind: "loading" })

  const fetchLatest = useCallback(async () => {
    setState({ kind: "loading" })
    try {
      const params = new URLSearchParams({ limit: "1" })
      if (systemName) params.set("system_name", systemName)
      const res = await fetch(`/api/proxy/remediation-history/timeline?${params.toString()}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!res.ok) {
        setState({ kind: "error", message: `HTTP ${res.status}` })
        return
      }
      const data = await res.json()
      const events: RemediationEvent[] = Array.isArray(data?.events) ? data.events : []
      if (events.length === 0) {
        // An empty feed is honest "engine idle" ONLY when the backend actually
        // answered with no events. If the proxy flagged the response as degraded
        // (it failed to load under the herd and had no stale to serve), don't
        // claim "no remediations recorded yet" — that contradicts the activity
        // card when events do exist. Surface the quiet "couldn't refresh" state.
        setState(data?.degraded ? { kind: "error", message: "" } : { kind: "idle" })
        return
      }
      setState({ kind: "has-event", event: events[0] })
    } catch (err: any) {
      const message = err?.name === "TimeoutError" ? "timed out" : err?.message ?? "unreachable"
      setState({ kind: "error", message })
    }
  }, [systemName])

  useEffect(() => {
    fetchLatest()
  }, [fetchLatest])

  return (
    <div className="bg-white rounded-xl border border-[var(--border,#e5e7eb)] px-5 py-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground,#6b7280)] shrink-0">
          <Activity className="w-4 h-4 text-[#2D51DA]" />
          Live now
        </div>
        <div className="flex-1 min-w-0">
          {state.kind === "loading" ? (
            <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground,#6b7280)]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Checking activity…</span>
            </div>
          ) : state.kind === "error" ? (
            // A background "LIVE NOW" strip must never be the loudest failure on
            // the page. The proxy now degrades to last-good / empty and returns
            // 200 even when the backend is saturated, so this branch is reached
            // only if the proxy itself is unreachable — degrade to a quiet muted
            // line with a retry affordance, not a red alarm.
            <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground,#6b7280)]">
              <AlertCircle className="w-3.5 h-3.5 opacity-60" />
              <span>Couldn't refresh activity{state.message ? ` — ${state.message}` : ""}</span>
              <button
                onClick={fetchLatest}
                className="ml-1 text-xs font-medium text-[#2D51DA] hover:underline"
              >
                retry
              </button>
            </div>
          ) : state.kind === "idle" ? (
            <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground,#6b7280)]">
              <Clock className="w-3.5 h-3.5" />
              <span>
                {systemName
                  ? "No remediations recorded for this system yet."
                  : "Engine idle — no remediations recorded yet."}
              </span>
            </div>
          ) : (
            (() => {
              const tone = statusTone(state.event.status)
              const ToneIcon = tone.Icon
              return (
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${tone.bg} ${tone.color}`}
                  >
                    <ToneIcon
                      className={`w-3 h-3 ${tone.Icon === Loader2 ? "animate-spin" : ""}`}
                    />
                    {tone.label}
                  </span>
                  <span className="text-[var(--foreground,#111827)] font-medium">
                    {relativeTime(state.event.timestamp)}
                  </span>
                  <span className="text-[var(--muted-foreground,#6b7280)] truncate">
                    · {describeAction(state.event)}
                  </span>
                  {state.event.approved_by ? (
                    <span className="text-xs text-[var(--muted-foreground,#9ca3af)] truncate">
                      · by {state.event.approved_by}
                    </span>
                  ) : null}
                </div>
              )
            })()
          )}
        </div>
        {onOpenHistory ? (
          <button
            onClick={onOpenHistory}
            className="text-xs font-medium text-[#2D51DA] hover:underline shrink-0"
          >
            View in History →
          </button>
        ) : null}
      </div>
    </div>
  )
}
