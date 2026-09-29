/// <reference types="vitest/globals" />
/**
 * The LP tab, rendered, on an unverified IAM usage generation.
 *
 * Fixture: GET /api/proxy/least-privilege/issues?systemName=testbed-webshop,
 * captured 2026-09-28 (tenant testbed-webshop, account 416651950952), trimmed
 * to the IAM usage lane and one IAM row — see lp-withheld-row.test.ts. The
 * tab is mounted with its real scope provider under hand-supplied Next router
 * contexts, so nothing in the render path is substituted.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AppRouterContext, type AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { PathnameContext, SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime'
import LeastPrivilegeTab from '@/components/LeastPrivilegeTab'
import { AccountScopeProvider } from '@/lib/account-scope-context'
import { IAM_USAGE_BAND_WITHHELD_RATIONALE } from '@/lib/lp-normalize'
import captured from '@/__tests__/fixtures/lp-issues-testbed-webshop-2026-09-28.json'

type Row = Record<string, unknown> & {
  evidence: Record<string, unknown> & { violatedRules: Array<Record<string, unknown>> }
}
type Payload = Record<string, unknown> & {
  resources: Row[]
  readiness_by_lane: { cloudtrail_iam_usage: { generation: Record<string, unknown> } }
}

const ROLE = 'cyntro-tb-prod-web-role'
const UNVERIFIED_POSTURE = /not generation-verified — treat as a signal, not a confirmed use/
const VERIFIED_POSTURE = /the role actually used these together/
const CONFIDENCE_WITHHELD = 'Confidence withheld: IAM usage generation not verified'

function capturedPayload(): Payload {
  return JSON.parse(JSON.stringify(captured)) as Payload
}

/** The same row under the contract's verified branch, with the backend's VERIFIED_GENERATION label. */
function verifiedPayload(): Payload {
  const payload = capturedPayload()
  payload.readiness_by_lane.cloudtrail_iam_usage.generation = {
    ...payload.readiness_by_lane.cloudtrail_iam_usage.generation,
    known: true,
    negative_authority_permitted: true,
    blockers: [],
  }
  payload.resources[0].evidence.violatedRules[0].evidence_authority = 'VERIFIED_GENERATION'
  payload.resources[0].evidence.escalation_evidence_authority = 'VERIFIED_GENERATION'
  return payload
}

/** The tab's own read gets the payload; the scope provider's roster reads are unavailable, leaving the scope unnarrowed. */
function serve(payload: Payload) {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    if (url.includes('/api/proxy/least-privilege/issues')) return Response.json(payload)
    return Response.json({}, { status: 503 })
  })
}

const router: AppRouterInstance = {
  back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {}, bfcacheId: '_b_0_',
}

async function renderTab(payload: Payload) {
  serve(payload)
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

describe('LP tab — unverified IAM usage generation (captured testbed-webshop)', () => {
  it('names the first readiness blocker on the row and withholds the band', async () => {
    await renderTab(capturedPayload())
    expect(screen.getByText('Usage unknown — ACTIVE_GENERATION_UNKNOWN: no active IAM usage generation')).toBeInTheDocument()
    expect(screen.queryByText('62%')).not.toBeInTheDocument()
    expect(screen.queryByText(/18 not observed of 29 allowed/)).not.toBeInTheDocument()

    const withheldBand = screen.getByLabelText('Blast radius not scoreable')
    expect(withheldBand).toHaveTextContent('?')
    expect(withheldBand.parentElement).toHaveAttribute('title', IAM_USAGE_BAND_WITHHELD_RATIONALE)
  })

  it('states the escalation evidence as a signal, and withholds the confidence, once expanded', async () => {
    await renderTab(capturedPayload())
    fireEvent.click(screen.getByText(ROLE))
    expect(await screen.findByText(UNVERIFIED_POSTURE)).toBeInTheDocument()
    expect(screen.queryByText(VERIFIED_POSTURE)).not.toBeInTheDocument()
    expect(screen.getByText('Usage unknown — ACTIVE_GENERATION_UNKNOWN: no active IAM usage generation.')).toBeInTheDocument()

    const withheld = screen.getAllByTitle(CONFIDENCE_WITHHELD)
    expect(withheld.length).toBeGreaterThan(0)
    withheld.forEach((element) => expect(element).toHaveTextContent('—'))
    expect(screen.queryByText('MEDIUM')).not.toBeInTheDocument()
  })
})

describe('LP tab — verified generation with VERIFIED_GENERATION escalation evidence', () => {
  it('states the escalation evidence as confirmed use and shows the captured values', async () => {
    await renderTab(verifiedPayload())
    expect(screen.queryByText(/Usage unknown/)).not.toBeInTheDocument()
    expect(screen.getByText(/18 not observed of 29 allowed/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Blast radius not scoreable')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText(ROLE))
    expect(await screen.findByText(VERIFIED_POSTURE)).toBeInTheDocument()
    expect(screen.queryByText(UNVERIFIED_POSTURE)).not.toBeInTheDocument()
    expect(screen.queryByTitle(CONFIDENCE_WITHHELD)).not.toBeInTheDocument()
  })
})
