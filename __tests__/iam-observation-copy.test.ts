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
