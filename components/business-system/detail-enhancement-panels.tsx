'use client'

import Link from 'next/link'
import { ExternalLink, Scissors, TrendingUp } from 'lucide-react'

export type DetailEnhancements = {
  system_name: string
  brss?: {
    score?: number | null
    coverage_ratio?: number
    coverage_ceiling?: number
    top_drivers?: Array<{
      resource_name?: string
      resource_type?: string
      severity?: string
      lift_if_fixed?: number
    }>
    error?: string
  }
  brss_delta_attribution?: {
    previous_score?: number | null
    current_score?: number | null
    score_delta?: number | null
    state_change?: number | null
    scope_expansion?: number | null
    resources_added?: number
    resources_removed?: number
    resources_changed?: number
    previous_timestamp?: string | null
  }
  remediation_actions?: Array<{
    rank?: number
    kind: string
    title: string
    detail?: string
    href?: string
    lift_if_fixed?: number
    closes_paths?: number
    consumer_count?: number
  }>
  boundary_evidence?: {
    kind?: string
    rankable?: boolean
    boundary_reason?: string
    bullets?: string[]
  }
  links?: {
    full_dashboard?: string
    ranking?: string
    boundary_review?: string
  }
}

function fmtDelta(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}`
}

export function BrssDeltaPanel({ pack }: { pack: DetailEnhancements }) {
  const d = pack.brss_delta_attribution
  const score = pack.brss?.score
  if (!d && score == null) return null

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid="brss-delta-panel"
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        <TrendingUp className="h-3.5 w-3.5" />
        BRSS before / after
      </div>
      <div className="mt-3 flex flex-wrap gap-6">
        <div>
          <div className="text-[10px] uppercase text-slate-400">Previous</div>
          <div className="text-lg font-semibold text-slate-700">
            {d?.previous_score != null ? d.previous_score.toFixed(1) : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-slate-400">Current</div>
          <div className="text-lg font-semibold text-slate-900">
            {d?.current_score != null
              ? Number(d.current_score).toFixed(1)
              : score != null
                ? Number(score).toFixed(1)
                : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-slate-400">Δ score</div>
          <div className="text-lg font-semibold text-slate-800">
            {fmtDelta(d?.score_delta ?? null)}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-600 sm:grid-cols-4">
        <div>
          <span className="text-slate-400">State change</span>
          <div className="font-medium">{fmtDelta(d?.state_change ?? null)}</div>
        </div>
        <div>
          <span className="text-slate-400">Scope expansion</span>
          <div className="font-medium">{fmtDelta(d?.scope_expansion ?? null)}</div>
        </div>
        <div>
          <span className="text-slate-400">Resources ±</span>
          <div className="font-medium">
            +{d?.resources_added ?? 0} / −{d?.resources_removed ?? 0}
          </div>
        </div>
        <div>
          <span className="text-slate-400">Changed</span>
          <div className="font-medium">{d?.resources_changed ?? 0}</div>
        </div>
      </div>
      {pack.brss?.coverage_ratio != null && (
        <div className="mt-2 text-xs text-slate-500">
          Coverage {Math.round(pack.brss.coverage_ratio * 100)}%
          {pack.brss.coverage_ceiling != null && (
            <span> · ceiling {pack.brss.coverage_ceiling}</span>
          )}
        </div>
      )}
    </div>
  )
}

export function TopRemediationActions({ pack }: { pack: DetailEnhancements }) {
  const actions = pack.remediation_actions || []
  if (actions.length === 0) return null

  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid="top-remediation-actions"
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        <Scissors className="h-3.5 w-3.5" />
        Top remediation actions
      </div>
      <ul className="mt-3 space-y-2">
        {actions.slice(0, 8).map((a, i) => (
          <li
            key={`${a.kind}-${a.title}-${i}`}
            className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2 last:border-0"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-900">
                <span className="text-slate-400 font-mono text-xs mr-2">#{a.rank ?? i + 1}</span>
                {a.title}
              </div>
              {a.detail && <div className="text-xs text-slate-500 mt-0.5">{a.detail}</div>}
              <div className="text-[10px] uppercase tracking-wide text-slate-400 mt-1">
                {a.kind.replace(/_/g, ' ')}
                {a.lift_if_fixed != null && ` · +${Number(a.lift_if_fixed).toFixed(1)} BRSS if fixed`}
                {a.closes_paths != null && ` · closes ${a.closes_paths} paths`}
              </div>
            </div>
            {a.href && (
              <Link
                href={a.href}
                className="text-xs text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 shrink-0"
              >
                Open <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function BoundarySummaryCard({
  pack,
  onOpenEvidence,
}: {
  pack: DetailEnhancements
  onOpenEvidence: () => void
}) {
  const ev = pack.boundary_evidence
  if (!ev) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          System boundary
        </div>
        <button
          type="button"
          onClick={onOpenEvidence}
          className="text-xs text-teal-700 hover:underline"
          data-testid="open-boundary-evidence"
        >
          Why?
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {ev.kind && (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">{ev.kind}</span>
        )}
        {ev.rankable === false && (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-500">not rankable</span>
        )}
        {ev.boundary_reason && (
          <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-800">
            {ev.boundary_reason}
          </span>
        )}
      </div>
      {ev.bullets?.[0] && (
        <p className="mt-2 text-xs text-slate-600 line-clamp-2">{ev.bullets[0]}</p>
      )}
      {pack.links?.full_dashboard && (
        <Link
          href={pack.links.full_dashboard}
          className="mt-3 inline-flex text-xs text-slate-600 hover:underline"
        >
          Open full system dashboard →
        </Link>
      )}
    </div>
  )
}
