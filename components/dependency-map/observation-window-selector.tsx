'use client'

import React, { useState } from 'react'
import { Clock } from 'lucide-react'
import {
  OBSERVATION_WINDOW_PRESETS,
  formatCoverageRange,
  requestedWindowLabel,
  type EffectiveWindow,
  type ObservationWindowRequest,
} from '@/lib/observation-coverage'

/** "YYYY-MM-DD" (a UTC calendar day) → the instant that starts or ends it. */
function utcDayBoundary(day: string, edge: 'start' | 'end'): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const iso = edge === 'start' ? `${day}T00:00:00Z` : `${day}T23:59:59Z`
  return Number.isNaN(Date.parse(iso)) ? null : iso
}

/**
 * Observation window for the dependency map: 1d / 7d (default) / 30d / custom.
 * The choice is sent as `window` (plus `from`/`to` for custom); the backend
 * answers with the window it actually served, clamped to available coverage,
 * which is what this control displays.
 */
export function ObservationWindowSelector({
  value,
  onChange,
  effective,
  loading = false,
}: {
  value: ObservationWindowRequest
  onChange: (next: ObservationWindowRequest) => void
  effective: EffectiveWindow | null
  loading?: boolean
}) {
  const [customOpen, setCustomOpen] = useState(value.preset === 'custom')
  const [fromDay, setFromDay] = useState(value.preset === 'custom' ? value.from.slice(0, 10) : '')
  const [toDay, setToDay] = useState(value.preset === 'custom' ? value.to.slice(0, 10) : '')

  const from = utcDayBoundary(fromDay, 'start')
  const to = utcDayBoundary(toDay, 'end')
  const customValid = Boolean(from && to && from <= to)

  return (
    <div className="flex flex-col gap-1" data-testid="observation-window-selector">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">
          <Clock className="h-3 w-3" aria-hidden /> Window
        </span>
        <div role="group" aria-label="Observation window" className="flex items-center gap-0.5 rounded bg-slate-700 p-0.5">
          {OBSERVATION_WINDOW_PRESETS.map((preset) => {
            const active = value.preset === preset.value
            return (
              <button
                key={preset.value}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setCustomOpen(false)
                  if (!active) onChange({ preset: preset.value })
                }}
                className={`rounded px-2 py-0.5 text-[11px] font-medium ${active ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-600'}`}
              >
                {preset.label}
              </button>
            )
          })}
          <button
            type="button"
            aria-pressed={value.preset === 'custom'}
            aria-expanded={customOpen}
            onClick={() => setCustomOpen((open) => !open)}
            className={`rounded px-2 py-0.5 text-[11px] font-medium ${value.preset === 'custom' ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-600'}`}
          >
            Custom
          </button>
        </div>
        {customOpen ? (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-300">
            <label className="flex items-center gap-1">
              From (UTC)
              <input
                type="date"
                aria-label="Window start (UTC date)"
                value={fromDay}
                onChange={(event) => setFromDay(event.target.value)}
                className="rounded border border-slate-600 bg-slate-800 px-1 py-0.5 text-slate-100"
              />
            </label>
            <label className="flex items-center gap-1">
              To (UTC)
              <input
                type="date"
                aria-label="Window end (UTC date)"
                value={toDay}
                onChange={(event) => setToDay(event.target.value)}
                className="rounded border border-slate-600 bg-slate-800 px-1 py-0.5 text-slate-100"
              />
            </label>
            <button
              type="button"
              disabled={!customValid}
              onClick={() => {
                if (from && to) onChange({ preset: 'custom', from, to })
              }}
              className="rounded bg-emerald-600 px-2 py-0.5 font-medium text-white disabled:opacity-40"
            >
              Apply
            </button>
          </div>
        ) : null}
      </div>
      <p className="text-[11px] text-slate-400" data-testid="effective-window" aria-live="polite">
        {loading ? (
          <>Requested {requestedWindowLabel(value)} · loading</>
        ) : effective ? (
          <>
            Showing <span className="font-mono text-slate-200">{formatCoverageRange(effective.from, effective.to)}</span>
            {effective.clamped ? (
              <span className="text-amber-300">
                {' '}· clamped to available coverage (requested {effective.requested ?? requestedWindowLabel(value)})
                {effective.reason ? ` — ${effective.reason}` : ''}
              </span>
            ) : null}
          </>
        ) : (
          <>Requested {requestedWindowLabel(value)} · the backend did not report the window it served</>
        )}
      </p>
    </div>
  )
}

export default ObservationWindowSelector
