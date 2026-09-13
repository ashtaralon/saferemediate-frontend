import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The one rule this proxy exists to keep: a FAILED read must never reach the
 * renderer as an empty estate.
 *
 * The route already gets this right, and the mechanism is easy to break by
 * accident. Every failure branch returns a body carrying `nodes: []` -- so the
 * client can read `error` and say what went wrong -- and relies ENTIRELY on the
 * HTTP status to stop that body being believed: useCachedFetch only reaches
 * `setData` when `res.ok`, and on a non-OK status it calls `setData(null)` +
 * `setError`, which is what makes estate-map-view render "Topology risk
 * unavailable" instead of a map with nothing on it.
 *
 * Nothing pinned that. A well-meant change to `{ status: 200 }` -- so the
 * client "can read the error message" -- would turn every backend 5xx, every
 * timeout and every transport failure into a confident, empty inventory, which
 * is the single worst thing this product can show: an operator reading "no
 * public exposure" from a request that never arrived.
 *
 * These cases are deterministic on purpose: the contract is the status code,
 * and proving it must not require breaking production to manufacture an
 * outage.
 */

const cache = vi.hoisted(() => ({
  getCached: vi.fn(),
  getStaleCached: vi.fn(),
  setCached: vi.fn(),
}))

vi.mock('@/lib/server/proxy-cache', () => ({
  ...cache,
  TTL_SLOW: 60_000,
}))

vi.mock('@/lib/server/backend-url', () => ({
  getBackendBaseUrl: () => 'https://product-read.example',
}))

import { GET } from '@/app/api/proxy/topology-risk/[systemName]/route'

const context = { params: Promise.resolve({ systemName: 'testbed-webshop' }) }
const request = () =>
  new NextRequest(
    'https://app.example/api/proxy/topology-risk/testbed-webshop' +
      '?customer_id=testbed-webshop&account_id=416651950952&region=eu-west-1',
  )

/** No warm cache and no stale cache: these tests are about what happens when
 *  there is nothing durable to fall back on, which is when the status code is
 *  the only thing standing between a failure and a false empty map. */
beforeEach(() => {
  vi.restoreAllMocks()
  cache.getCached.mockReset().mockReturnValue(undefined)
  cache.getStaleCached.mockReset().mockReturnValue(undefined)
  cache.setCached.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('a failed topology-risk read never renders as an empty estate', () => {
  it('a backend 500 answers 500, not 200 with zero nodes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"detail":"neptune unreachable"}', { status: 500 }),
    )

    const response = await GET(request(), context)
    const body = await response.json()

    // The body DOES carry nodes: [] -- and that is only safe because of this:
    expect(response.status).toBe(500)
    expect(response.ok).toBe(false)
    expect(body.nodes).toEqual([])
    expect(body.error).toBe('backend_500')
    // A failed read is never cached as truth.
    expect(cache.setCached).not.toHaveBeenCalled()
  })

  it('a timeout answers 504', async () => {
    const abort = new Error('The operation was aborted')
    abort.name = 'TimeoutError'
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(abort)

    const response = await GET(request(), context)
    const body = await response.json()

    expect(response.status).toBe(504)
    expect(response.ok).toBe(false)
    expect(body.nodes).toEqual([])
    expect(body.error).toBe('topology_risk_proxy_timeout')
    expect(cache.setCached).not.toHaveBeenCalled()
  })

  it('a transport failure answers 502', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))

    const response = await GET(request(), context)
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(response.ok).toBe(false)
    expect(body.nodes).toEqual([])
    expect(body.error).toBe('topology_risk_proxy_error')
    expect(cache.setCached).not.toHaveBeenCalled()
  })

  it('NO failure branch answers a 2xx — the status is the whole contract', async () => {
    const failures: Array<[string, () => void]> = [
      ['backend 500', () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }))
      }],
      ['backend 404', () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 404 }))
      }],
      ['timeout', () => {
        const e = new Error('timeout'); e.name = 'AbortError'
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(e)
      }],
      ['transport failure', () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))
      }],
    ]

    for (const [label, arrange] of failures) {
      vi.restoreAllMocks()
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.spyOn(console, 'error').mockImplementation(() => {})
      cache.getCached.mockReturnValue(undefined)
      cache.getStaleCached.mockReturnValue(undefined)
      arrange()

      const response = await GET(request(), context)
      expect(response.ok, `${label} must not answer a 2xx`).toBe(false)
      expect(response.status, `${label} status`).toBeGreaterThanOrEqual(400)
    }
  })
})

describe('an authoritative empty estate is still allowed to be empty', () => {
  it('a 200 with no nodes stays a 200 — that is a real answer, not a failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        system: 'testbed-webshop',
        scored_at: '2026-09-13T09:00:00Z',
        system_kpis: { workloads: 0 },
        nodes: [],
      }),
    )

    const response = await GET(request(), context)
    const body = await response.json()

    // The distinction the honesty contract turns on: zero resources REPORTED
    // is a finding; zero resources because the request failed is not.
    expect(response.status).toBe(200)
    expect(response.ok).toBe(true)
    expect(body.nodes).toEqual([])
    expect(body.scored_at).toBe('2026-09-13T09:00:00Z')
    expect(body.error).toBeUndefined()
  })
})

describe('cache behaviour, with the miss and the hit each actually established', () => {
  it('an empty cache is a real MISS: the backend IS called, and the answer is labelled MISS', async () => {
    // The miss is established, not assumed: getCached returns undefined AND
    // fetch is observed being called. A test that only read the header would
    // pass just as well against a route that never consulted a cache at all.
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ system: 'testbed-webshop', system_kpis: { workloads: 7 }, nodes: [{ id: 'i-abc' }] }),
    )

    const response = await GET(request(), context)

    expect(cache.getCached).toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
    expect(response.headers.get('X-Cache')).toBe('MISS')
    // A good answer IS cached — that is what makes the next read a hit.
    expect(cache.setCached).toHaveBeenCalledOnce()
  })

  it('a warm cache is a real HIT: the backend is NOT called at all', async () => {
    cache.getCached.mockReturnValue({
      system: 'testbed-webshop',
      system_kpis: { workloads: 7 },
      nodes: [{ id: 'i-abc' }],
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    const response = await GET(request(), context)
    const body = await response.json()

    // Not calling the backend is the whole point of the hit.
    expect(fetchMock).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
    expect(response.headers.get('X-Cache')).toBe('HIT')
    expect(body.nodes).toHaveLength(1)
  })

  it('a poisoned cache entry is NOT served — it is re-fetched', async () => {
    // isPoisonousProxyPayload exists because a "computing" envelope with null
    // KPIs and no nodes was once cached for the full TTL, so every later visit
    // HIT an empty map long after the backend had recovered. Serving that is
    // indistinguishable, on screen, from an estate with nothing in it.
    cache.getCached.mockReturnValue({
      system: 'testbed-webshop',
      status: 'computing',
      system_kpis: null,
      nodes: [],
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ system: 'testbed-webshop', system_kpis: { workloads: 7 }, nodes: [{ id: 'i-abc' }] }),
    )

    const response = await GET(request(), context)
    const body = await response.json()

    expect(fetchMock).toHaveBeenCalled()
    expect(response.headers.get('X-Cache')).not.toBe('HIT')
    expect(body.nodes).toHaveLength(1)
    expect(body.status).toBeUndefined()
  })

  it('a poisoned STALE entry is not served as a fallback either', async () => {
    cache.getStaleCached.mockReturnValue({
      system: 'testbed-webshop',
      status: 'computing',
      system_kpis: null,
      nodes: [],
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }))

    const response = await GET(request(), context)
    const body = await response.json()

    // Falling back to poison would turn a backend outage into a blank map
    // served with a 200. The honest answer is the failure status.
    expect(response.status).toBe(500)
    expect(response.ok).toBe(false)
    expect(body.fromStaleCache).toBeUndefined()
    expect(body.error).toBe('backend_500')
  })
})

describe('a stale serve says so, and says why', () => {
  it('names the reason rather than reporting the failure as fresh', async () => {
    cache.getStaleCached.mockReturnValue({
      system: 'testbed-webshop',
      scored_at: '2026-09-12T00:27:27Z',
      system_kpis: { workloads: 7 },
      nodes: [{ id: 'i-abc' }],
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 500 }))

    const response = await GET(request(), context)
    const body = await response.json()

    // Serving last-good beats serving nothing, but it must be labelled: the
    // banner reads staleReason to say what actually happened.
    expect(response.status).toBe(200)
    expect(body.fromStaleCache).toBe(true)
    expect(body.staleReason).toBe('backend_500')
    expect(body.nodes).toHaveLength(1)
    expect(response.headers.get('X-Cache')).toBe('STALE')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})
