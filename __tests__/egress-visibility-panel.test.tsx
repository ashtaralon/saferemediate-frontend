/// <reference types="vitest/globals" />
/**
 * EgressVisibilityPanel render smoke tests.
 *
 * Fixture: __tests__/fixtures/egress-alon-prod.json — captured live from
 *   GET /api/egress/system/alon-prod?days=30&top_n=20
 *   against the production backend (saferemediate-backend-f.onrender.com)
 *   on 2026-05-12. 45 real workloads, 1125 real destinations,
 *   85 cross_region_aws signals — derived from real VPC Flow Log data
 *   in Neo4j. Regenerate when the egress contract shape changes.
 *
 * The full contract for signal detection is locked in the backend's
 * tests/test_egress_visibility.py (12 cases). These tests guard the
 * thin slice the UI owns: the four summary cards bind to the right
 * fields, workload rows expand on click, signal codes are translated
 * to human labels, the R53 banner appears when domain visibility is
 * unavailable, and the empty state renders.
 */

import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

import { EgressVisibilityPanel } from '@/components/egress-visibility-panel'
import egressAlonProd from './fixtures/egress-alon-prod.json'

type FetchMock = ReturnType<typeof vi.fn>

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = global.fetch as FetchMock
  fetchMock.mockImplementationOnce(async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  }))
}

// Known invariants from the captured fixture. If these drift, the
// fixture has been re-captured against a system with different shape
// and the tests need adjustment.
const FIXTURE_SYSTEM = egressAlonProd.system_name // 'alon-prod'
const FIXTURE_WORKLOAD_COUNT = egressAlonProd.workload_count // 45
const FIXTURE_TOTAL_DESTS = egressAlonProd.total_destinations // 1125
const FIXTURE_SIGNALED = egressAlonProd.total_signaled_destinations // 85
const FIXTURE_FIRST_WORKLOAD_NAME = egressAlonProd.workloads[0].workload.name // 'SafeRemediate-Test-Frontend-2'

beforeEach(() => {
  global.fetch = vi.fn() as unknown as typeof fetch
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('EgressVisibilityPanel', () => {
  it('renders the four summary cards from the live response', async () => {
    mockFetchOnce(egressAlonProd)
    render(<EgressVisibilityPanel systemName={FIXTURE_SYSTEM} />)

    // Wait for the summary strip to mount, then scope each card lookup
    // to its label — the totals row has unique labels even though
    // numeric values like "45" may repeat in workload rows below.
    const workloadsLabel = await screen.findByText('Workloads')
    expect(workloadsLabel.parentElement).toHaveTextContent(String(FIXTURE_WORKLOAD_COUNT))

    const destsLabel = screen.getByText('Destinations')
    expect(destsLabel.parentElement).toHaveTextContent(String(FIXTURE_TOTAL_DESTS))

    const signalsLabel = screen.getByText('Egress signals')
    // .parentElement is the inner flex (label + icon); the card div is one up.
    expect(signalsLabel.closest('div.rounded')).toHaveTextContent(String(FIXTURE_SIGNALED))

    const bytesLabel = screen.getByText(/Total bytes/)
    expect(bytesLabel.parentElement).toHaveTextContent(/\d+(\.\d+)?\s*(B|KB|MB|GB|TB)/)
  })

  it('expands a workload row to reveal its destination table on click', async () => {
    mockFetchOnce(egressAlonProd)
    render(<EgressVisibilityPanel systemName={FIXTURE_SYSTEM} />)

    // Destination column header is rendered inside the (initially
    // hidden) destination table — its presence is the toggle marker.
    expect(screen.queryByText('Destination')).not.toBeInTheDocument()

    const row = await screen.findByRole('button', {
      name: new RegExp(FIXTURE_FIRST_WORKLOAD_NAME, 'i'),
    })
    fireEvent.click(row)

    expect(screen.getByText('Destination')).toBeInTheDocument()
    // The fixture's first workload talks to multiple S3 regions; assert
    // at least one AWS S3 destination label rendered.
    expect(screen.getAllByText(/AWS S3/).length).toBeGreaterThan(0)
  })

  it('renders signal chips with human-readable labels, not raw codes', async () => {
    mockFetchOnce(egressAlonProd)
    render(<EgressVisibilityPanel systemName={FIXTURE_SYSTEM} />)

    const row = await screen.findByRole('button', {
      name: new RegExp(FIXTURE_FIRST_WORKLOAD_NAME, 'i'),
    })
    fireEvent.click(row)

    // Multiple destinations carry the same signal, so use getAllByText.
    // The chip label comes from SIGNAL_META[cross_region_aws].label.
    expect(screen.getAllByText('Cross-region AWS').length).toBeGreaterThan(0)
    // And the raw enum value never bleeds into visible UI text.
    expect(screen.queryByText('cross_region_aws')).not.toBeInTheDocument()
  })

  it('shows the R53 Resolver Query Logs banner while domain_visibility.available is false', async () => {
    // Sanity check: the live fixture is the unwired state we want to
    // assert against. If this flips, Phase 2 has landed and the test
    // expectation itself needs to change.
    expect(egressAlonProd.domain_visibility.available).toBe(false)

    mockFetchOnce(egressAlonProd)
    render(<EgressVisibilityPanel systemName={FIXTURE_SYSTEM} />)

    expect(await screen.findByText(/R53 Resolver Query Logs/i)).toBeInTheDocument()
  })

  it('lazy-loads external destinations when the operator clicks a kind toggle, even on workloads whose top-priority rows are all AWS', async () => {
    // Demo blocker: SafeRemediate-Test-Frontend-1 has 326 external
    // destinations in totals but every row in top_destinations is a
    // signaled AWS S3 cross-region hit (priority-sort wins). Before the
    // per-kind endpoint, clicking "External (326)" showed an empty state
    // — the whole point of the Egress tab was hidden behind a priority
    // cut. After: clicking External fires a fetch to the per-kind
    // endpoint and the rows render.
    mockFetchOnce(egressAlonProd)
    render(<EgressVisibilityPanel systemName={FIXTURE_SYSTEM} />)

    const row = await screen.findByRole('button', {
      name: /SafeRemediate-Test-Frontend-1/i,
    })
    fireEvent.click(row)

    // Sanity: default "All" view is dominated by AWS rows pulled inline
    // from the system response.
    expect(screen.getAllByText(/AWS S3/).length).toBeGreaterThan(0)

    // Backend returns one synthetic external destination so the test can
    // assert that the lazy-load path renders rows from the per-kind
    // response — not from the inline top_destinations.
    mockFetchOnce({
      workload_id: 'frontend-1-test',
      kind: 'external',
      total: 326,
      limit: 20,
      offset: 0,
      destinations: [
        {
          ip: '52.124.128.42',
          kind: 'external',
          aws_service: null,
          aws_region: null,
          org: 'Cloudflare, Inc.',
          asn: 'AS13335',
          country: 'US',
          hostname: null,
          ports: ['443'],
          protocols: ['TCP'],
          bytes: 1024000,
          hits: 50,
          last_seen: null,
          signals: [],
        },
      ],
      totals: {},
    })
    fireEvent.click(screen.getByRole('button', { name: 'External (326)' }))

    // After lazy-load resolves, the fetched external row is visible and
    // the "Showing top 1 of 326" header confirms the total came from the
    // per-kind response, not the inline top_destinations.
    await waitFor(() => {
      expect(screen.getByText('52.124.128.42')).toBeInTheDocument()
    })
    expect(screen.getByText(/Showing top 1 of 326 external destinations/i)).toBeInTheDocument()
  })

  it('keeps per-workload kind state isolated across cards', async () => {
    // Selecting External on Frontend-1 must not change what's shown on
    // App-2 (or vice versa). The cache is keyed by (workloadId, kind),
    // and the filter state is a per-workload map.
    mockFetchOnce(egressAlonProd)
    render(<EgressVisibilityPanel systemName={FIXTURE_SYSTEM} />)

    const frontend1 = await screen.findByRole('button', {
      name: /SafeRemediate-Test-Frontend-1/i,
    })
    fireEvent.click(frontend1)

    // Frontend-1's External toggle triggers a per-kind fetch.
    mockFetchOnce({
      workload_id: 'frontend-1-test',
      kind: 'external',
      total: 326,
      limit: 20,
      offset: 0,
      destinations: [
        {
          ip: '52.124.128.42',
          kind: 'external',
          aws_service: null,
          aws_region: null,
          org: 'Cloudflare, Inc.',
          asn: 'AS13335',
          country: 'US',
          hostname: null,
          ports: ['443'],
          protocols: ['TCP'],
          bytes: 1024000,
          hits: 50,
          last_seen: null,
          signals: [],
        },
      ],
      totals: {},
    })
    fireEvent.click(screen.getByRole('button', { name: 'External (326)' }))
    await waitFor(() => {
      expect(screen.getByText('52.124.128.42')).toBeInTheDocument()
    })

    // Expand App-2: its toggle group is independent, default "All" still
    // shows the inline top_destinations regardless of what Frontend-1's
    // state is.
    const app2 = screen.getByRole('button', {
      name: /SafeRemediate-Test-App-2/i,
    })
    fireEvent.click(app2)

    // Both cards now have their own toggle group. Frontend-1 still on
    // External (Cloudflare row visible), App-2 on All (inline rows from
    // top_destinations — 3.5.66.28 is one of App-2's AWS rows).
    expect(screen.getByText('52.124.128.42')).toBeInTheDocument()
    expect(screen.getByText('3.5.66.28')).toBeInTheDocument()
  })

  it('renders the empty state when no workloads come back', async () => {
    // The empty-state branch can't be exercised by any real system that
    // has flow logs — we derive a no-workloads variant from the real
    // fixture so the *shape* stays Neo4j-accurate but the workloads
    // array is empty.
    mockFetchOnce({
      ...egressAlonProd,
      workload_count: 0,
      total_destinations: 0,
      total_signaled_destinations: 0,
      workloads: [],
    })
    render(<EgressVisibilityPanel systemName={FIXTURE_SYSTEM} />)

    const empty = await screen.findByText(/No egress-capable workloads found/i)
    expect(empty).toBeInTheDocument()
    // <code>{systemName}</code> is inline within the empty-state block.
    expect(within(empty).getByText(FIXTURE_SYSTEM)).toBeInTheDocument()
  })
})
