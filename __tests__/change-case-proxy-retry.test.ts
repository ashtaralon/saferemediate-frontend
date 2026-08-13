/// <reference types="vitest/globals" />

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/server/backend-url', () => ({
  getBackendBaseUrl: () => 'https://backend.test',
}))

import { POST } from '@/app/api/proxy/vulnerability-map/[systemName]/resource/[resourceId]/network-risk-reduction/change-case/route'

type FetchMock = ReturnType<typeof vi.fn>

const request = () => new NextRequest(
  'http://localhost/api/proxy/vulnerability-map/alon-prod/resource/i-123/network-risk-reduction/change-case?days=90',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidate_ids: ['candidate-1'] }),
  },
)

const context = {
  params: Promise.resolve({ systemName: 'alon-prod', resourceId: 'i-123' }),
}

beforeEach(() => {
  global.fetch = vi.fn() as unknown as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Change Case proxy transient recovery', () => {
  it('retries one non-JSON gateway response and returns the recovered artifact', async () => {
    ;(global.fetch as FetchMock)
      .mockResolvedValueOnce(new Response('<html>bad gateway</html>', { status: 502 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ schema_version: 'change-case/v2', case_id: 'cc-1' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ))

    const response = await POST(request(), context)

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ schema_version: 'change-case/v2', case_id: 'cc-1' })
  })

  it('retries a structured transient status', async () => {
    ;(global.fetch as FetchMock)
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'warming' }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ case_id: 'cc-2' }), { status: 200 }))

    const response = await POST(request(), context)

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ case_id: 'cc-2' })
  })

  it('never exposes the meaningless invalid-response message after retry exhaustion', async () => {
    ;(global.fetch as FetchMock)
      .mockResolvedValueOnce(new Response('<html>bad gateway</html>', { status: 502 }))
      .mockResolvedValueOnce(new Response('<html>still bad</html>', { status: 502 }))

    const response = await POST(request(), context)
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body.detail).toContain('No change was applied')
    expect(body.detail).toContain('please try again')
    expect(JSON.stringify(body)).not.toContain('Invalid backend response')
  })
})
