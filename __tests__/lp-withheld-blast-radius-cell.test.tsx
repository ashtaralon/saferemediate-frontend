/// <reference types="vitest/globals" />
/**
 * The LP tab's blast-radius cell with a withheld `brs` or `components` (backend unified/lp/capabilities.py:
 * `blastRadius[scored] = None` + `{scored}_withheld_reason`). Rendered through the real tab, with the captured
 * testbed-webshop row (see lp-withheld-row.test.tsx) under a VERIFIED generation, so the band stays LOW and only
 * the withheld field differs: before, a null brs read Math.round(null) = 0, and a null components crashed the title.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AppRouterContext, type AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { PathnameContext, SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime'
import LeastPrivilegeTab from '@/components/LeastPrivilegeTab'
import { AccountScopeProvider } from '@/lib/account-scope-context'
import { IAM_USAGE_UNKNOWN_FALLBACK } from '@/lib/lp-readiness-copy'
import captured from '@/__tests__/fixtures/lp-issues-testbed-webshop-2026-09-28.json'

const ROLE = 'cyntro-tb-prod-web-role'
const UNVERIFIED = 'IAM_USAGE_GENERATION_UNVERIFIED'

type Payload = Record<string, unknown> & {
  resources: Array<Record<string, unknown> & { blastRadius: Record<string, unknown> }>
  readiness_by_lane: { cloudtrail_iam_usage: { generation: Record<string, unknown> } }
}

function verified(withheld: Array<'brs' | 'components'> = []): Payload {
  const payload = JSON.parse(JSON.stringify(captured)) as Payload
  payload.readiness_by_lane.cloudtrail_iam_usage.generation = {
    ...payload.readiness_by_lane.cloudtrail_iam_usage.generation,
    known: true, negative_authority_permitted: true, blockers: [],
  }
  for (const scored of withheld) {
    payload.resources[0].blastRadius[scored] = null
    payload.resources[0].blastRadius[`${scored}_withheld_reason`] = UNVERIFIED
  }
  return payload
}

const router: AppRouterInstance = {
  back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {}, bfcacheId: '_b_0_',
}

async function renderTab(payload: Payload) {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    if (url.includes('/api/proxy/least-privilege/issues')) return Response.json(payload)
    return Response.json({}, { status: 503 })
  })
  render(
    <AppRouterContext.Provider value={router}>
      <PathnameContext.Provider value="/least-privilege">
        <SearchParamsContext.Provider value={new URLSearchParams()}>
          <AccountScopeProvider>
            <LeastPrivilegeTab systemName="testbed-webshop" />
          </AccountScopeProvider>
        </SearchParamsContext.Provider>
      </PathnameContext.Provider>
    </AppRouterContext.Provider>,
  )
  await screen.findByText(ROLE)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('LP tab — withheld blast-radius score or components', () => {
  it.each([[['brs'] as const], [['components'] as const], [['brs', 'components'] as const]])(
    'withheld %j renders ? with the withheld reason, never a number',
    async (withheld) => {
      await renderTab(verified([...withheld]))
      const cell = screen.getByLabelText('Blast radius not scoreable')
      expect(cell).toHaveTextContent('?')
      expect(cell.parentElement).toHaveAttribute('title', IAM_USAGE_UNKNOWN_FALLBACK)
      expect(cell.parentElement?.textContent).toBe('?')
    },
  )

  it('control: a served score renders its number, band and components as before', async () => {
    await renderTab(verified())
    expect(screen.queryByLabelText('Blast radius not scoreable')).not.toBeInTheDocument()
    const band = screen.getByText('LOW')
    const cell = band.parentElement as HTMLElement
    expect(cell.textContent).toBe('14LOW')
    expect(cell).toHaveAttribute('title', 'BRS 14.4 LOW — DOC 0 / IPS 37.4 / NES 20 / LMS 0 · Confidence MEDIUM')
  })
})
