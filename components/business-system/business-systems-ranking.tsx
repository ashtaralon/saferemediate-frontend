'use client'

/**
 * BSM Sprint 2 — BRSS ranking list for rankable BUSINESS_SYSTEM nodes.
 * Phase 2 copy: logical systems / blast radius (no "business impact").
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ExternalLink, RefreshCw, Shield } from 'lucide-react'

interface SharedDriver {
  type: string
  name: string
  consumer_count?: number
  href: string
  headline_state?: string
}

interface TopDriver {
  resource_id?: string
  resource_name?: string
  resource_type?: string
  severity?: string
  lift_if_fixed?: number
}

interface RankedSystem {
  name: string
  kind: string
  brss_score: number
  coverage_ratio?: number
  coverage_ceiling?: number
  member_count?: number
  resource_count?: number
  top_drivers?: TopDriver[]
  shared_resource_drivers?: SharedDriver[]
  href: string
}

interface RankedResponse {
  systems: RankedSystem[]
  count: number
  positioning_copy?: string
  note?: string
  error?: string
  computed_at?: string
}

function coveragePercent(ratio?: number): number {
  return Math.round((ratio ?? 0) * 100)
}

function scoreTone(score: number): string {
  if (score < 40) return 'text-red-600'
  if (score < 70) return 'text-amber-600'
  return 'text-emerald-700'
}

export function BusinessSystemsRanking() {
  const [data, setData] = useState<RankedResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/proxy/business-systems/ranked', {
        cache: 'no-store',
        signal: AbortSignal.timeout(120000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as RankedResponse
      if (json.error) setError(json.error)
      setData(json)
    } catch (e: any) {
      setError(e?.message || 'Failed to load ranking')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-500 text-sm p-8">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Computing blast-radius ranking…
      </div>
    )
  }

  if (error && !data?.systems?.length) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-2 text-red-600 text-sm mb-3">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs text-slate-600 underline"
        >
          Retry
        </button>
      </div>
    )
  }

  const systems = data?.systems ?? []

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-6" data-testid="bsm-ranking">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-slate-800">
          <Shield className="w-5 h-5" />
          <h1 className="text-xl font-semibold tracking-tight">
            System blast-radius ranking
          </h1>
        </div>
        <p className="text-sm text-slate-600 max-w-2xl">
          {data?.positioning_copy ||
            'Logical systems ranked by exploitable blast radius. Business-impact weighting ships after authored context.'}
        </p>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>{data?.count ?? 0} rankable systems</span>
          {data?.computed_at && <span>as of {data.computed_at}</span>}
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1 hover:text-slate-800"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>
        {data?.note && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            {data.note}
          </p>
        )}
      </header>

      {systems.length === 0 ? (
        <p className="text-sm text-slate-500">
          No rankable business systems yet. Complete Sprint 1 boundary cleanup /
          classification first.
        </p>
      ) : (
        <ul className="space-y-3">
          {systems.map((sys, idx) => (
            <li
              key={sys.name}
              className="border border-slate-200 bg-white rounded-lg p-4"
              data-testid={`bsm-rank-row-${sys.name}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-400 w-6">
                      #{idx + 1}
                    </span>
                    <Link
                      href={sys.href || `/business-systems?systemName=${encodeURIComponent(sys.name)}`}
                      className="text-base font-medium text-slate-900 hover:underline truncate"
                    >
                      {sys.name}
                    </Link>
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      {sys.kind}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span className={scoreTone(sys.brss_score)}>
                      BRSS {sys.brss_score.toFixed(1)}
                    </span>
                    <span
                      className="inline-flex items-center rounded-full border border-slate-200 px-2 py-0.5"
                      title="Scanner coverage — thin evidence cannot look safe"
                      data-testid={`coverage-chip-${sys.name}`}
                    >
                      Coverage {coveragePercent(sys.coverage_ratio)}%
                      {sys.coverage_ceiling != null && (
                        <span className="text-slate-400 ml-1">
                          (ceiling {sys.coverage_ceiling})
                        </span>
                      )}
                    </span>
                    {sys.resource_count != null && (
                      <span>{sys.resource_count} scored resources</span>
                    )}
                  </div>
                </div>
                <Link
                  href={sys.href || `/business-systems?systemName=${encodeURIComponent(sys.name)}`}
                  className="text-xs text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
                >
                  Open map <ExternalLink className="w-3 h-3" />
                </Link>
              </div>

              {(sys.top_drivers?.length || 0) > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                    Top BRSS drivers
                  </div>
                  <ul className="text-xs text-slate-700 space-y-0.5">
                    {sys.top_drivers!.slice(0, 3).map((d) => (
                      <li key={d.resource_id || d.resource_name}>
                        <span className="font-medium">{d.resource_name || d.resource_id}</span>
                        {d.resource_type && (
                          <span className="text-slate-400"> · {d.resource_type}</span>
                        )}
                        {d.severity && (
                          <span className="text-slate-400"> · {d.severity}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(sys.shared_resource_drivers?.length || 0) > 0 && (
                <div className="mt-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                    Shared control-plane (V2)
                  </div>
                  <ul className="text-xs space-y-1">
                    {sys.shared_resource_drivers!.map((d) => (
                      <li key={d.name}>
                        <Link
                          href={d.href}
                          className="text-slate-800 hover:underline inline-flex items-center gap-1"
                        >
                          {d.name}
                          {d.consumer_count != null && (
                            <span className="text-slate-500">
                              ({d.consumer_count} consumers)
                            </span>
                          )}
                          <ExternalLink className="w-3 h-3 text-slate-400" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
