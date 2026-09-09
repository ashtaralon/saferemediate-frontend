/// <reference types="vitest/globals" />
/**
 * AP3-105 — the exposure panel must not render an outage as a finding.
 *
 * Before the backend carried `serve_state`, these two produced the same view:
 *   - this jewel genuinely has no exposed identities;
 *   - the inventory projection has not been activated yet.
 *
 * The second is an outage. Rendering it as an empty all-doors view says
 * "nothing can reach this jewel", which is the fabricated finding CLAUDE.md
 * rule 1 forbids.
 *
 * `useCachedFetch` is mocked rather than `fetch`: the panel reads through that
 * hook, and mocking the transport underneath it would also exercise the cache,
 * which is not what these tests are about.
 */

import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// vi.hoisted, not a bare const: vitest hoists vi.mock above every import AND
// above module-level consts, so a factory closing over a plain `const` reads it
// in its temporal dead zone the moment the mocked module is imported eagerly.
// The repo's other mocks return fixed values and never hit this; these tests
// need per-case control, which is exactly what vi.hoisted is for.
const mocks = vi.hoisted(() => ({ useCachedFetch: vi.fn() }))

vi.mock('@/lib/use-cached-fetch', () => ({
  useCachedFetch: mocks.useCachedFetch,
}))

import { JewelExposurePanel } from '@/components/attack-paths-v2/jewel-exposure-panel'
import type { CrownJewelSummary } from '@/components/identity-attack-paths/types'

// Cast through unknown rather than `as never`: `never` is assignable to
// everything, so it would also have accepted a jewel with the wrong SHAPE and
// the tsc ratchet would have had nothing to say about it.
const JEWEL = {
  id: 'arn:aws:s3:::cyntro-tb-prod-appdata',
  name: 'cyntro-tb-prod-appdata',
  type: 'S3Bucket',
} as unknown as CrownJewelSummary

function body(over: Record<string, unknown> = {}) {
  return {
    jewel: {
      id: JEWEL.id, name: 'cyntro-tb-prod-appdata', type: 'S3Bucket',
      system_name: 'testbed-webshop', is_active: true,
    },
    summary: {
      identity_count: 0, workload_count: 0, policy_count: 0,
      instance_profile_count: 0, security_group_count: 0, subnet_count: 0,
      vpc_count: 0, stale_count: 0, headline: 'No doors found.',
    },
    identities: [], workloads: [], instance_profiles: [], policies: [],
    network: { security_groups: [], subnets: [], vpcs: [], nacls: [] },
    data_plane: {},
    generated_at: '2026-09-07T00:00:00Z',
    ...over,
  }
}

function mount(data: unknown, extra: Record<string, unknown> = {}) {
  mocks.useCachedFetch.mockReturnValue({ data, loading: false, error: null, ...extra })
  return render(<JewelExposurePanel jewel={JEWEL} systemName="testbed-webshop" />)
}

afterEach(() => {
  cleanup()
  mocks.useCachedFetch.mockReset()
})

describe('AP3-105 exposure serve state', () => {
  it('renders "not computed yet" instead of an empty all-doors view', () => {
    mount(body({ serve_state: 'NOT_READY', coverage_state: 'NOT_READY',
                 not_ready_reason: 'POINTER_MISSING' }))
    // Exact strings, not /Not computed yet/i: the regex matched BOTH the
    // header headline and the badge, and getByText throws on multiple hits.
    // Asserting each separately is also the stronger test — it proves the
    // header changed as well as the body, which a loose regex did not.
    expect(screen.getByText('Exposure not computed yet')).toBeTruthy()
    expect(screen.getByText('Not computed yet')).toBeTruthy()
    expect(screen.getByText(/unknown — not zero/i)).toBeTruthy()
  })

  it('surfaces the reason so an operator can act on it', () => {
    mount(body({ serve_state: 'NOT_READY', not_ready_reason: 'ACCOUNT_CONTEXT_MISSING' }))
    expect(screen.getByText('ACCOUNT_CONTEXT_MISSING')).toBeTruthy()
  })

  it('renders the real empty state when the pin IS live and there are no doors', () => {
    // READY_ZERO is a finding, not an outage: it must reach the normal view.
    mount(body({ serve_state: 'READY', coverage_state: 'READY_ZERO' }))
    expect(screen.queryByText('Not computed yet')).toBeNull()
  })

  it('renders normally for a backend that predates serve_state', () => {
    // An older backend omits the field entirely. Treating absent as NOT_READY
    // would black out a working panel on the first deploy where the two repos
    // are one version apart.
    mount(body())
    expect(screen.queryByText('Not computed yet')).toBeNull()
  })

  it('renders RDS controls instead of S3 bucket controls', () => {
    mount(body({
      serve_state: 'READY',
      coverage_state: 'READY',
      jewel: {
        id: 'arn:aws:rds:eu-west-1:416651950952:cluster:cyntro-tb-prod-aurora',
        name: 'cyntro-tb-prod-aurora',
        type: 'RDSCluster',
        system_name: 'testbed-webshop',
        is_active: true,
      },
      data_plane: {
        resource_type: 'RDSCluster',
        storage_encrypted: true,
        publicly_accessible: false,
        deletion_protection: true,
        multi_az: true,
        backup_retention_period: 7,
        engine: 'aurora-postgresql',
        engine_version: '16.3',
        port: 5432,
        db_subnet_group_name: 'private-data',
      },
    }))
    expect(screen.getByText('database-level controls')).toBeTruthy()
    expect(screen.getByText('Storage encrypted')).toBeTruthy()
    expect(screen.getByText('Publicly accessible')).toBeTruthy()
    expect(screen.queryByText('Bucket policy')).toBeNull()
    expect(screen.queryByText('Public access block')).toBeNull()
  })

  it('still shows the loading state rather than the not-ready state', () => {
    mocks.useCachedFetch.mockReturnValue({ data: null, loading: true, error: null })
    render(<JewelExposurePanel jewel={JEWEL} systemName="testbed-webshop" />)
    expect(screen.getByText(/Computing the all-doors view/i)).toBeTruthy()
    expect(screen.queryByText('Not computed yet')).toBeNull()
  })

  it('still shows the transport error state rather than the not-ready state', () => {
    // A 503 from the proxy is a different problem from an un-activated
    // generation, and conflating them sends an operator to the wrong place.
    mocks.useCachedFetch.mockReturnValue({ data: null, loading: false, error: 'boom' })
    render(<JewelExposurePanel jewel={JEWEL} systemName="testbed-webshop" />)
    expect(screen.getByText(/Could not load exposure/i)).toBeTruthy()
    expect(screen.queryByText('Not computed yet')).toBeNull()
  })
})
