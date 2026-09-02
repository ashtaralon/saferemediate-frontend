/**
 * Inventory usage is an observation, not a remediation decision.
 *
 * Keep this wording separate from Preview's safety-qualified counts so raw
 * non-use can never be presented as an instruction to remove a permission.
 */
export function iamObservationCopy(unusedCount: number, total: number, usedCount: number) {
  return {
    summary: `${unusedCount} of ${total} permissions had no observed usage — ${usedCount} were observed in use`,
    usedLabel: `${usedCount} observed in use`,
    notObservedLabel: `${unusedCount} not observed`,
  }
}

/**
 * Compact inventory-row copy. The row has not run Preview, so it must state
 * only what was observed and direct the operator to the action-level decision.
 */
export function iamInventoryRowCopy(notObservedCount: number, total: number) {
  return {
    summary: `${notObservedCount} not observed of ${total} allowed — Preview classifies each permission`,
  }
}

/**
 * The real bounds behind an IAM observation-day count, as emitted by
 * `GET /api/iam-roles/{role}/gap-analysis` (`observation_window`, from
 * `unified/lp/observation_window.py::observation_window_bounds`).
 *
 * `effective_days` is what the coverage gate uses: whole days since the
 * oldest observed event. `observed_from` / `observed_through` are the oldest
 * and newest observed events; `collected_at` is when the usage collector last
 * ran. Every bound is a graph stamp. None of them is "now".
 */
export interface IamObservationWindow {
  basis: string
  observed_from: string | null
  observed_through: string | null
  collected_at: string | null
  effective_days: number | null
  span_days: number | null
  requested_lookback_days: number | null
  limitation: string | null
}

export interface IamObservationWindowCopy {
  /** e.g. "18 days since first observed event" */
  headline: string
  /** e.g. "Aug 15, 2026 → Aug 21, 2026", or an honest "not stored" line. */
  range: string
  /** e.g. "collected Aug 21, 2026"; null when the collector stamp is absent. */
  collected: string | null
  /** True only when both event bounds came from the backend. */
  measured: boolean
}

function formatUtcDay(iso: string | null | undefined): string | null {
  if (!iso) return null
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return null
  // UTC on purpose: the stamps are UTC and a viewer's zone must not move the
  // window edge across a day boundary.
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Chip copy for the Permissions modal's recording-period strip.
 *
 * Regression, 2026-09-02 (C1 / testbed-webshop, F5): the strip rendered
 * "18-day observation · Aug 15, 2026 → Sep 2, 2026" with the end date set
 * to `new Date()` in the browser and the start to today minus the day count,
 * while the freshness panel said the usage collector last ran 12 days
 * earlier. The evidence ended at the newest observed event. This helper only
 * renders bounds the backend measured; when they are absent it says so.
 *
 * `fallbackDays` is the day count the modal already has (gap-analysis or
 * simulate-fix) for the headline when the window carries none.
 */
export function iamObservationWindowCopy(
  window: IamObservationWindow | null | undefined,
  fallbackDays: number,
): IamObservationWindowCopy {
  const from = formatUtcDay(window?.observed_from)
  const through = formatUtcDay(window?.observed_through)
  const measured = Boolean(window && from && through && !window.limitation)
  // A window that carries no positive day count (no first observed event on
  // this row) must not zero out a day count the modal already measured
  // elsewhere (simulate-fix). Prefer the window's count only when it says
  // something.
  const days =
    typeof window?.effective_days === 'number' && window.effective_days > 0
      ? window.effective_days
      : fallbackDays
  const headline =
    days > 0
      ? `${days} day${days === 1 ? '' : 's'} since first observed event`
      : 'Observation window not measured'
  const collectedDay = formatUtcDay(window?.collected_at)
  return {
    headline,
    range: measured ? `${from} → ${through}` : 'observed-event bounds not stored',
    collected: collectedDay ? `collected ${collectedDay}` : null,
    measured,
  }
}

/**
 * Provenance the backend sends with `summary.cloudtrail_events`
 * (`unified/lp/usage_edges.py`). The count is the windowed USED_ACTION
 * hit_count sum; `limitation` says why it is null or partial.
 */
export interface IamEventCountBasis {
  source: string
  window_days: number | null
  window_cutoff: string | null
  edges_in_window: number | null
  edges_without_hit_count: number | null
  limitation: string | null
}

export interface IamEventCountCopy {
  /** e.g. "50,886 API events" or "API events not measured" */
  label: string
  /** Tooltip: source and window, plus the backend's limitation when any. */
  detail: string | null
  measured: boolean
}

/**
 * Regression, 2026-09-02 (C1 / testbed-webshop, F6): the modal rendered
 * "50,886 API events" — later 1,672,348 in one block and 40,469,725 in
 * another for the same role — from a max() of two unrelated, unwindowed
 * counts. The backend now sends the windowed hit sum or null with a basis.
 * This helper renders that and never coerces null to 0.
 */
export function iamEventCountCopy(
  events: number | null | undefined,
  basis: IamEventCountBasis | null | undefined,
): IamEventCountCopy {
  const measured = typeof events === 'number' && Number.isFinite(events)
  const window =
    basis?.window_days != null ? `last ${basis.window_days} days` : 'decision window'
  const source = basis?.source ? `${basis.source}, ${window}` : window
  const detail = basis?.limitation ? `${source}. ${basis.limitation}` : basis ? source : null
  return {
    label: measured ? `${events.toLocaleString('en-US')} API events` : 'API events not measured',
    detail,
    measured,
  }
}
