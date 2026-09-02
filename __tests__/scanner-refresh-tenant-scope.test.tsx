import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The tenant is pinned by the sync backend's deployment config. Before this
// test existed the view posted the *system name* as customer_id, which the
// backend refuses with 403 for any tenant whose system names differ from its
// tenant id (C1 only worked because DEFAULT_TENANT_ID equals the system name).

const nav = vi.hoisted(() => ({ query: '' }))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
}))

vi.mock('@/components/vulnerability-map', () => ({
  VulnerabilityMap: () => null,
}))

vi.mock('@/lib/inspector-refresh', () => ({
  waitForInspectorRefresh: vi.fn(async () => ({ status: 'completed' })),
}))

import { CVEManagementView } from '@/components/cve-management-view'

const JOB_ID = '11111111-1111-1111-1111-111111111111'

function stubFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/api/proxy/enforcement/config')) {
      return Response.json({ current_mode: 'conservative' })
    }
    if (url.includes('/api/proxy/vulnerability-map/scanner/sync')) {
      if (init?.method === 'POST') {
        return Response.json({ accepted: true, job_id: JOB_ID, status: 'queued' }, { status: 202 })
      }
      return Response.json({ available: true })
    }
    return Response.json({})
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function approveScannerRefresh() {
  const open = await screen.findByRole('button', { name: 'Refresh scanner findings' })
  await waitFor(() => expect(open).toBeEnabled())
  fireEvent.click(open)
  fireEvent.click(await screen.findByRole('button', { name: 'Approve and scan now' }))
}

async function postedBody(fetchMock: ReturnType<typeof stubFetch>): Promise<Record<string, unknown>> {
  await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true))
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
  return JSON.parse(String(call?.[1]?.body))
}

describe('scanner refresh tenant scope', () => {
  beforeEach(() => {
    nav.query = ''
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not post the system name as customer_id', async () => {
    const fetchMock = stubFetch()

    render(<CVEManagementView systemName="payments-prod" />)
    await approveScannerRefresh()

    expect(await postedBody(fetchMock)).toEqual({ acknowledged: true })
  })

  it('forwards an explicit customer_id deep link for the backend to verify', async () => {
    nav.query = 'customer_id=testbed-webshop'
    const fetchMock = stubFetch()

    render(<CVEManagementView systemName="payments-prod" />)
    await approveScannerRefresh()

    expect(await postedBody(fetchMock)).toEqual({ acknowledged: true, customer_id: 'testbed-webshop' })
  })
})
