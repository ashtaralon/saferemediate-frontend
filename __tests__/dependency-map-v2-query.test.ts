import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { dependencyMapV2ProxyUrl } from '@/lib/dependency-map-v2-query'

vi.mock('@/lib/server/backend-url', () => ({
  getBackendBaseUrl: () => 'https://product-read.example',
}))

import { GET } from '@/app/api/proxy/dependency-map/v2/route'

describe('dependency-map v2 query contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('percent-encodes the plus in potential-path mode end to end', async () => {
    expect(dependencyMapV2ProxyUrl('testbed-webshop', '7d', 'observed+potential'))
      .toBe('/api/proxy/dependency-map/v2?systemId=testbed-webshop&window=7d&mode=observed%2Bpotential')

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({
      nodes: [{ id: 'i-web' }],
      edges: [],
    }))
    const response = await GET(new NextRequest(
      'https://app.example/api/proxy/dependency-map/v2?systemId=testbed-webshop&window=7d&mode=observed%2Bpotential',
    ))

    expect(response.status).toBe(200)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://product-read.example/api/dependency-map-v2?systemId=testbed-webshop&window=7d&mode=observed%2Bpotential',
    )
  })

  it('propagates upstream failure instead of fabricating an empty map', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('{"detail":"invalid mode"}', { status: 422 }),
    )
    const response = await GET(new NextRequest(
      'https://app.example/api/proxy/dependency-map/v2?systemId=another-system&window=7d&mode=observed',
    ))
    const payload = await response.json()

    expect(response.status).toBe(422)
    expect(payload).toMatchObject({ error: 'Dependency-map backend returned 422' })
    expect(payload).not.toHaveProperty('nodes')
  })
})
