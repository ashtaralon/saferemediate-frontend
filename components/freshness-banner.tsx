"use client"

/**
 * FreshnessBanner — surfaces the graph's actual freshness on any
 * view tab.
 *
 * Why this exists
 * ---------------
 * Cyntro's data flows through several caches between Neo4j and the
 * operator's eyes:
 *
 *   1. Collectors write to Neo4j on a cadence (1-12h depending on
 *      collector).
 *   2. Backend caches (now event-driven against CollectorRun) avoid
 *      recomputing the IAP / org-score / canvas payloads when the
 *      graph is quiet.
 *   3. Frontend localStorage caches (useCachedFetch) render the
 *      last-fetched payload instantly.
 *
 * After the 2026-05-24 freshness audit, the read-cache layer is
 * effectively zero-second staleness (event TTL via CollectorRun.
 * finished_at). The remaining lag is graph-side — bounded by the
 * collector cadence the operator can't see today.
 *
 * This banner surfaces that lag honestly: "Graph synced 7 min ago"
 * with the most-recent collector id so the operator knows what they
 * just saw written. No cliché "live" or "real-time" claims — the
 * actual age is shown.
 *
 * Backend signal
 * --------------
 * GET /api/proxy/freshness — wraps the backend's CollectorRun lookup.
 * Same source the event-cache invalidation gates on, so the banner
 * and the cache contract agree by construction.
 */

import { useEffect, useState } from "react"

interface FreshnessPayload {
  ok: boolean
  graph_synced_at_iso: string | null
  graph_age_seconds: number | null
  latest_collector_id: string | null
  now_iso: string
  error?: string
}

function humanizeAge(seconds: number | null): string {
  if (seconds === null || seconds < 0) return "unknown"
  if (seconds < 60) return `${seconds}s ago`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

// Stale-after thresholds — drive the color tier of the dot.
// Green: graph synced in the last hour. Yellow: 1-6h. Red: >6h.
// These match the new tightened collector cadences (1h CONSUMER_EDGES,
// 2h SG_COLLECTOR, etc.) so a "yellow" banner means at least one
// collector run has been skipped.
function freshnessTone(seconds: number | null): {
  dotClass: string
  label: string
} {
  if (seconds === null) return { dotClass: "bg-slate-500", label: "unknown" }
  if (seconds < 60 * 60) return { dotClass: "bg-emerald-500", label: "fresh" }
  if (seconds < 6 * 60 * 60) return { dotClass: "bg-amber-500", label: "aging" }
  return { dotClass: "bg-rose-500", label: "stale" }
}

interface FreshnessBannerProps {
  /** How often to re-poll the freshness endpoint (ms). Default 60s. */
  pollIntervalMs?: number
  /** Compact pill (dot + age only) vs full banner (with collector id). */
  variant?: "pill" | "banner"
  /** Override className on the wrapping element for layout. */
  className?: string
}

export function FreshnessBanner({
  pollIntervalMs = 60_000,
  variant = "pill",
  className = "",
}: FreshnessBannerProps) {
  const [data, setData] = useState<FreshnessPayload | null>(null)

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const res = await fetch("/api/proxy/freshness", { cache: "no-store" })
        const json = (await res.json()) as FreshnessPayload
        // 2026-05-25: only overwrite the last good value when the
        // response is OK. A 502 / proxy_timeout / backend error
        // payload (ok=false, graph_age_seconds=null) used to wipe
        // the banner to "Graph unknown" even though we had a fresh
        // good value from the previous tick. Keep showing the last
        // known age; the operator can still trust what they see.
        if (!cancelled && json && json.ok) setData(json)
      } catch {
        // Network-layer failure — same posture, keep last good value.
      }
    }
    tick()
    const id = setInterval(tick, pollIntervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [pollIntervalMs])

  const seconds = data?.graph_age_seconds ?? null
  const { dotClass, label } = freshnessTone(seconds)
  const ageLabel = humanizeAge(seconds)

  if (variant === "pill") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-slate-700/40 bg-slate-900/50 px-2.5 py-1 text-[11px] font-medium text-slate-300 ${className}`}
        title={
          data?.latest_collector_id
            ? `Graph last synced ${ageLabel} — most recent collector: ${data.latest_collector_id}`
            : "Graph freshness signal unavailable"
        }
      >
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass}`} />
        Graph {ageLabel}
      </span>
    )
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-slate-700/40 bg-slate-900/50 px-3 py-1.5 text-xs text-slate-300 ${className}`}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
      <span className="font-medium uppercase tracking-wider text-[10px] text-slate-500">
        graph
      </span>
      <span className="font-semibold text-slate-200">{ageLabel}</span>
      <span className="text-slate-500">·</span>
      <span className="text-slate-400">{label}</span>
      {data?.latest_collector_id ? (
        <>
          <span className="text-slate-500">·</span>
          <span
            className="font-mono text-[10px] text-slate-400"
            title="Most recent collector that completed a write"
          >
            {data.latest_collector_id}
          </span>
        </>
      ) : null}
    </div>
  )
}
