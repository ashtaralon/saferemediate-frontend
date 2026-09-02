import { describe, expect, it } from 'vitest'

import { iamInventoryRowCopy, iamObservationCopy } from '@/lib/iam-observation-copy'

describe('IAM inventory observation copy', () => {
  it('does not promote raw non-use into a removal decision', () => {
    const copy = iamObservationCopy(23, 27, 4)

    expect(copy).toEqual({
      summary: '23 of 27 permissions had no observed usage — 4 were observed in use',
      usedLabel: '4 observed in use',
      notObservedLabel: '23 not observed',
    })
    expect(Object.values(copy).join(' ').toLowerCase()).not.toContain('remove')
  })

  it('directs inventory rows to Preview without claiming non-use is removable', () => {
    const copy = iamInventoryRowCopy(16, 25)

    expect(copy.summary).toBe('16 not observed of 25 allowed — Preview classifies each permission')
    expect(copy.summary.toLowerCase()).not.toContain('remove')
    expect(copy.summary.toLowerCase()).not.toContain('unused')
  })
})

import { iamObservationWindowCopy } from '@/lib/iam-observation-copy'

describe('IAM observation window copy (F5)', () => {
  const window = {
    basis: 'observed_events',
    observed_from: '2026-08-15T09:00:00+00:00',
    observed_through: '2026-08-21T18:30:00+00:00',
    collected_at: '2026-08-21T19:00:00+00:00',
    effective_days: 18,
    span_days: 6,
    requested_lookback_days: 365,
    limitation: null,
  }

  it('renders the measured bounds and never today', () => {
    const copy = iamObservationWindowCopy(window, 18)
    expect(copy).toEqual({
      headline: '18 days since first observed event',
      range: 'Aug 15, 2026 → Aug 21, 2026',
      collected: 'collected Aug 21, 2026',
      measured: true,
    })
    const today = new Date().toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    })
    expect(copy.range).not.toContain(today)
  })

  it('says the bounds are not stored instead of inventing them', () => {
    const copy = iamObservationWindowCopy(
      { ...window, observed_through: null, span_days: null, limitation: 'The graph holds no observed-event bounds for this role; the window edges are not measured.' },
      18,
    )
    expect(copy.measured).toBe(false)
    expect(copy.range).toBe('observed-event bounds not stored')
    expect(copy.headline).toBe('18 days since first observed event')
  })

  it('falls back to the day count the modal already has when no window is on the wire', () => {
    expect(iamObservationWindowCopy(null, 7)).toEqual({
      headline: '7 days since first observed event',
      range: 'observed-event bounds not stored',
      collected: null,
      measured: false,
    })
    expect(iamObservationWindowCopy(undefined, 0).headline).toBe('Observation window not measured')
  })

  it('does not use the day count to describe a window', () => {
    const copy = iamObservationWindowCopy(window, 18)
    expect(copy.headline.toLowerCase()).not.toContain('-day observation')
    expect(copy.headline.toLowerCase()).not.toContain('window')
  })
})

import { iamEventCountCopy } from '@/lib/iam-observation-copy'

describe('IAM observation window copy — day count fallback (QA fix)', () => {
  it('keeps the modal-measured day count when the window carries none', () => {
    const copy = iamObservationWindowCopy(
      {
        basis: 'observed_events',
        observed_from: null,
        observed_through: null,
        collected_at: null,
        effective_days: 0,
        span_days: null,
        requested_lookback_days: 365,
        limitation: 'The graph holds no observed-event bounds for this role; the window edges are not measured.',
      },
      18,
    )
    expect(copy.headline).toBe('18 days since first observed event')
    expect(copy.measured).toBe(false)
  })
})

describe('IAM event count copy (F6)', () => {
  const basis = {
    source: 'USED_ACTION.hit_count',
    window_days: 90,
    window_cutoff: '2026-06-04T00:00:00',
    edges_in_window: 4,
    edges_without_hit_count: 1,
    limitation: '1 of 4 edges in the window carry no hit_count and are excluded from the total.',
  }

  it('renders the windowed count with its basis', () => {
    const copy = iamEventCountCopy(50886, basis)
    expect(copy.label).toBe('50,886 API events')
    expect(copy.measured).toBe(true)
    expect(copy.detail).toBe(
      'USED_ACTION.hit_count, last 90 days. 1 of 4 edges in the window carry no hit_count and are excluded from the total.',
    )
  })

  it('never turns null into zero', () => {
    const copy = iamEventCountCopy(null, { ...basis, edges_in_window: 0, edges_without_hit_count: 0, limitation: 'No USED_ACTION edge falls inside the decision window.' })
    expect(copy.label).toBe('API events not measured')
    expect(copy.measured).toBe(false)
    expect(copy.label).not.toContain('0')
    expect(iamEventCountCopy(undefined, null)).toEqual({
      label: 'API events not measured',
      detail: null,
      measured: false,
    })
  })

  it('a measured zero is still a number', () => {
    expect(iamEventCountCopy(0, { ...basis, limitation: null }).label).toBe('0 API events')
  })
})
