/// <reference types="vitest/globals" />

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import LeastPrivilegeTab from '@/components/LeastPrivilegeTab'

vi.mock('@/lib/account-scope-context', () => ({
  useAccountScope: () => ({ customerId: 'test-customer', groupId: 'all', accountId: 'all', region: 'all' }),
}))
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('@/components/back-to-dashboard', () => ({ BackToDashboard: () => null }))

const role: Record<string, unknown> = {
  id: 'role-1', resourceType: 'IAMRole', resourceName: 'generation-test-role',
  resourceArn: 'arn:aws:iam::123456789012:role/generation-test-role',
  severity: 'HIGH', decision_canonical: 'MANUAL_REVIEW', counts_toward_summary: true,
  allowedCount: 29, usedCount: 11, gapCount: 18, gapPercent: 62,
  lpScore: 38, usage_measured: true,
  description: '18 not observed of 29 allowed',
}

function response(known: boolean, permitted: boolean, row = role) {
  return {
    serve_state: 'READY', analysis_complete: true, failedAnalyzers: [],
    readiness_by_lane: { cloudtrail_iam_usage: { generation: {
      known, active_generation_id: known ? 'generation-1' : null,
      negative_authority_permitted: permitted,
    } } },
    resources: [row], summary: { totalExcessPermissions: 18 },
  }
}

async function renderResponse(payload: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }))
  render(<LeastPrivilegeTab />)
  await screen.findByText('generation-test-role')
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('IAM Risk Inventory generation authority', () => {
  it('shows unknown usage, keeps manual review and risk, and omits the stale percent', async () => {
    await renderResponse(response(false, false))
    expect(screen.getByText(/Usage unknown — IAM usage generation is not verified; review required/)).toBeInTheDocument()
    expect(screen.getAllByText('Manual review').some((item) => item.tagName === 'SPAN')).toBe(true)
    expect(screen.getAllByText('High').some((item) => item.tagName === 'SPAN')).toBe(true)
    expect(screen.queryByText('62%')).not.toBeInTheDocument()
    expect(screen.queryByText('18 not observed of 29 allowed')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('generation-test-role'))
    await waitFor(() => expect(screen.getAllByText(/Usage unknown — the IAM usage generation is not verified/).length).toBeGreaterThan(0))
    expect(screen.queryByText(/All 29 permissions are in active use/)).not.toBeInTheDocument()
  })

  it('continues to display a verified measured zero as zero', async () => {
    await renderResponse(response(true, true, {
      ...role, usedCount: 29, gapCount: 0, gapPercent: 0, lpScore: 100,
      description: 'measured zero',
    }))
    expect(screen.getByText(/0 not observed of 29 allowed/)).toBeInTheDocument()
    expect(screen.getByText('0%')).toBeInTheDocument()
    expect(screen.queryByText(/Usage unknown — IAM usage generation/)).not.toBeInTheDocument()
  })

  it('keeps a row-level sync failure distinct from an unverified generation', async () => {
    await renderResponse(response(true, true, {
      ...role, usedCount: null, gapCount: null, gapPercent: null, lpScore: null,
      usage_measured: false, usage_not_computed_reason: 'Permissions sync failed',
      description: 'Usage not computed — permissions sync failed',
    }))
    expect(screen.getByText('Usage not computed — permissions sync failed')).toBeInTheDocument()
    expect(screen.queryByText(/Usage unknown — IAM usage generation/)).not.toBeInTheDocument()
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
  })
})
