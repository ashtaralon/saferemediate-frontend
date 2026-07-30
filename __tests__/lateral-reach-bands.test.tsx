/// <reference types="vitest/globals" />
/**
 * LateralReachBands render tests.
 *
 * Fixture: __tests__/fixtures/lateral-reach-alon-prod.json — captured live from
 *   GET /api/proxy/attack-paths/alon-prod/jewel-lateral-reach
 *        ?jewel_ref=saferemediate-raw-745783559495&jewel_type=S3Bucket
 *   through the real proxy → production backend → Neo4j, 2026-07-30.
 *   17 real roles that hold a policy grant reaching that bucket: 2 observed
 *   using it, 2 provably observed elsewhere on S3 but never on it, and 13 never
 *   observed on S3 at all. Regenerate when the band contract changes.
 *
 * The banding decision itself is locked in the backend
 * (tests/test_lateral_reachable_unused.py — `_band_for` is a pure function
 * there precisely so it cannot be re-derived differently). These tests guard
 * the slice the UI owns, and the thing that slice can get catastrophically
 * wrong: quietly under-reporting what we cannot vouch for.
 *
 * A panel that renders only CUTTABLE would show a short, confident cut list
 * while hiding 13 of 17 roles — so "the unjudged count is always visible" is
 * asserted here, not assumed.
 */

import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach } from 'vitest'

import { LateralReachBands } from '@/components/attack-paths-v2/lateral-reach-bands'
import type { LateralReachPayload } from '@/components/attack-paths-v2/use-lateral-reach'
import lateralReachAlonProd from './fixtures/lateral-reach-alon-prod.json'

const FIXTURE = lateralReachAlonProd as unknown as LateralReachPayload

afterEach(() => cleanup())

function renderBands(overrides: Partial<Parameters<typeof LateralReachBands>[0]> = {}) {
  return render(
    <LateralReachBands
      data={FIXTURE}
      loading={false}
      error={null}
      jewelLabel="saferemediate-raw-745783559495"
      {...overrides}
    />,
  )
}

test('renders all three bands from the real payload', () => {
  renderBands()
  const root = screen.getByTestId('lateral-reach-bands')
  expect(within(root).getByText(/Never used — safe to cut/)).toBeTruthy()
  expect(within(root).getByText(/Reachable — cannot judge/)).toBeTruthy()
  expect(within(root).getByText(/In use — keep/)).toBeTruthy()
})

test('the unjudged count is always visible, never collapsed away', () => {
  // The failure this guards: showing "2 never used it" as though that were the
  // whole story, when 13 of 17 roles were not evaluated at all.
  renderBands()
  const unjudged = screen.getByTestId('lateral-reach-unjudgeable')
  expect(unjudged.textContent).toContain('13')
  expect(unjudged.textContent).toMatch(/cannot be judged/i)
})

test('cut list contains only the coverage-proven roles', () => {
  renderBands()
  const cuttable = document.querySelector('[data-band="CUTTABLE"]')!
  expect(cuttable).toBeTruthy()
  const text = cuttable.textContent ?? ''
  expect(text).toContain('CyntroGlueETL-pilot')
  expect(text).toContain('cyntro-remediation')
  // A role never observed on S3 must NOT appear in the cut list.
  expect(text).not.toContain('AWSServiceRoleForSupport')
})

test('unknown roles state why they are unjudged, and are not proposed as cuts', () => {
  renderBands()
  const unknown = document.querySelector('[data-band="UNKNOWN"]')!
  const text = unknown.textContent ?? ''
  expect(text).toContain('AWSServiceRoleForSupport')
  expect(text).toMatch(/never been observed on this service/i)
})

test('wildcard grants are labelled — the reach is every bucket, not just this one', () => {
  renderBands()
  const root = screen.getByTestId('lateral-reach-bands')
  expect(within(root).getAllByText(/wildcard grant/i).length).toBeGreaterThan(0)
})

test('cuttable rows carry the coverage evidence that earned the verdict', () => {
  renderBands()
  const cuttable = document.querySelector('[data-band="CUTTABLE"]')!
  expect(cuttable.textContent).toMatch(/observed on 1 other resource · never here/)
})

test('an error renders as "not evaluated", never as an empty cut list', () => {
  // The dangerous failure: a fetch error rendering as a clean bill of health.
  renderBands({ data: null, error: 'lateral_reach_timeout' })
  const el = screen.getByText(/not a clean bill of health/i)
  expect(el).toBeTruthy()
  expect(el.getAttribute('data-empty-state')).toBe('ERROR')
})

test('zero reachable roles is stated plainly, distinct from an error', () => {
  const empty: LateralReachPayload = {
    ...FIXTURE,
    bands: { USED: [], CUTTABLE: [], UNKNOWN: [] },
    counts: { reachable_total: 0, USED: 0, CUTTABLE: 0, UNKNOWN: 0 },
    unjudgeable: 0,
  }
  renderBands({ data: empty })
  const el = screen.getByText(/No identity holds a policy grant that reaches/i)
  expect(el.getAttribute('data-empty-state')).toBe('READY_ZERO')
})

test('an unsupported jewel type says "not evaluated", not "nothing reaches this"', () => {
  const unsupported: LateralReachPayload = {
    ...FIXTURE,
    supported: false,
    reason: 'no IAM service mapping for RDSInstance',
    jewel_label: 'RDSInstance',
    bands: { USED: [], CUTTABLE: [], UNKNOWN: [] },
    counts: { reachable_total: 0, USED: 0, CUTTABLE: 0, UNKNOWN: 0 },
    unjudgeable: 0,
  }
  renderBands({ data: unsupported })
  const el = screen.getByText(/does not cover RDSInstance yet — not evaluated/i)
  expect(el.getAttribute('data-empty-state')).toBe('UNSUPPORTED')
})

test('loading does not render a cut list', () => {
  renderBands({ data: null, loading: true })
  expect(screen.queryByTestId('lateral-reach-bands')).toBeNull()
  expect(screen.getByText(/Computing who can reach/i)).toBeTruthy()
})
