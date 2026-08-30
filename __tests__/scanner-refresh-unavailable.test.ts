import React from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('customer_id=testbed-webshop'),
}))

vi.mock('@/components/vulnerability-map', () => ({
  VulnerabilityMap: () => null,
}))

import { CVEManagementView } from '@/components/cve-management-view'
import { GET, POST } from '@/app/api/proxy/vulnerability-map/scanner/sync/route'

describe('scanner refresh when CYNTRO_SYNC_BACKEND_URL is unset', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    vi.stubEnv('CYNTRO_SYNC_BACKEND_URL', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('does not call the retired default backend on GET or POST', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const getResponse = await GET()
    const postResponse = await POST(new NextRequest('https://app.example/api/proxy/vulnerability-map/scanner/sync', {
      method: 'POST',
      body: JSON.stringify({ acknowledged: true }),
    }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(getResponse.status).toBe(503)
    expect(postResponse.status).toBe(503)
    expect(await getResponse.json()).toMatchObject({
      available: false,
      reason: 'scanner_backend_not_configured',
      detail: 'Scanner refresh unavailable',
    })
  })

  it('disables the button with honest copy instead of opening a scan dialog', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/proxy/enforcement/config')) {
        return Response.json({ current_mode: 'conservative' })
      }
      if (String(url).includes('/api/proxy/vulnerability-map/scanner/sync')) {
        return Response.json({
          available: false,
          reason: 'scanner_backend_not_configured',
          detail: 'Scanner refresh unavailable',
        }, { status: 503 })
      }
      return Response.json({})
    }))

    render(React.createElement(CVEManagementView, { systemName: 'testbed-webshop' }))

    const button = await screen.findByRole('button', { name: 'Scanner refresh unavailable' })
    expect(button).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Refresh scanner findings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
