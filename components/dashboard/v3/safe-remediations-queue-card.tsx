"use client"

import { useEffect, useState } from "react"
import { ErrorCard, LoadingCard, Section } from "./card-shell"
import { descriptorClass } from "./styles"

/**
 * Safe Remediations Queue.
 *
 * Real source: /api/proxy/remediation-candidates (passes through to
 * backend which already runs the unified safety-gate per row, populating
 * safety.can_auto_apply / block_reason / warnings).
 *
 * Only candidates whose safety.can_auto_apply === true are surfaced as
 * "ready" — anything blocked is excluded so the queue truly represents
 * what's safe to fire.
 *
 * No fabricated counts. If backend returns empty, the card says so.
 */

type Safety = {
  can_auto_apply?: boolean
  block_reason?: string | null
  block_layer?: string | null
  warnings?: string[]
  data_quality?: string
}

type Candidate = {
  resource_type: string
  resource_id: string
  system?: string
  unused_count?: number
  total_permissions?: number
  severity?: string
  safety?: Safety
}

type CandidatesResponse = {
  candidates?: Candidate[]
  summary?: {
    total_candidates?: number
    auto_applicable?: number
    blocked?: number
  }
  error?: string
}

export function SafeRemediationsQueueCard() {
  const [data, setData] = useState<CandidatesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/proxy/remediation-candidates?limit=10", {
        cache: "no-store",
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const body: CandidatesResponse = await res.json()
      if (body.error) throw new Error(body.error)
      setData(body)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (loading && !data) return <LoadingCard label="Safe remediations queue" />
  if (error) return <ErrorCard label="Safe remediations queue" error={error} onRetry={load} />
  if (!data) return null

  const ready = (data.candidates ?? []).filter((c) => c.safety?.can_auto_apply === true)
  const blocked = (data.candidates ?? []).filter((c) => c.safety?.can_auto_apply === false)

  return (
    <Section
      label="Safe remediations queue"
      descriptor={`${ready.length} ready · ${blocked.length} blocked by safety gate`}
    >
      {ready.length === 0 ? (
        <div className={descriptorClass}>
          No candidates currently pass the unified safety gate. This is the honest "nothing
          ready to auto-apply" state, not an empty render.
        </div>
      ) : (
        <ul className="space-y-2">
          {ready.slice(0, 5).map((c, i) => (
            <li
              key={`${c.resource_type}-${c.resource_id}-${i}`}
              className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50/40 px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-900">
                  {c.resource_type} · {c.resource_id}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {c.system ?? "—"} · {c.unused_count ?? 0} unused / {c.total_permissions ?? 0} total
                </div>
              </div>
              {c.severity && (
                <span
                  className={`rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    c.severity === "CRITICAL"
                      ? "bg-rose-100 text-rose-700"
                      : c.severity === "HIGH"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {c.severity}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {ready.length > 5 && (
        <div className={`${descriptorClass} mt-3`}>
          + {ready.length - 5} more ready · view all in Remediations
        </div>
      )}
    </Section>
  )
}
