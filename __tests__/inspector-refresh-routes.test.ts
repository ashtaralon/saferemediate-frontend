import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/server/neptune-refresh-backend-url', () => ({
  getNeptuneRefreshBackendBaseUrl: () => 'https://canonical-backend.example',
  isNeptuneRefreshBackendConfigured: () => true,
}))

import { POST } from '@/app/api/proxy/vulnerability-map/scanner/sync/route'
import { GET } from '@/app/api/proxy/vulnerability-map/scanner/sync/[jobId]/route'

const JOB_ID = '11111111-1111-1111-1111-111111111111'

describe('Inspector refresh proxy routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.BACKEND_URL = 'https://stale-backend.example'
  })

  it('queues through the canonical backend resolver', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ accepted: true, job_id: JOB_ID, status: 'queued' }),
      { status: 202, headers: { 'Content-Type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(new NextRequest('https://cyntro.example/api/proxy/vulnerability-map/scanner/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acknowledged: true, customer_id: 'testbed-webshop' }),
    }))

    expect(response.status).toBe(202)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://canonical-backend.example/api/vulnerability-map/scanner/sync',
      expect.objectContaining({ method: 'POST', cache: 'no-store' }),
    )
  })

  it('polls through the same canonical backend resolver', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ job_id: JOB_ID, status: 'completed' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)

    const response = await GET(
      new NextRequest(`https://cyntro.example/api/proxy/vulnerability-map/scanner/sync/${JOB_ID}`),
      { params: Promise.resolve({ jobId: JOB_ID }) },
    )

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(
      `https://canonical-backend.example/api/vulnerability-map/scanner/sync/${JOB_ID}`,
      { cache: 'no-store' },
    )
  })
})
