import { describe, expect, it, vi } from 'vitest'

import { waitForInspectorRefresh } from '@/lib/inspector-refresh'

function reply(body: object, ok = true): Response {
  return { ok, json: async () => body } as Response
}

describe('waitForInspectorRefresh', () => {
  it('waits for the projector rather than treating enqueue as completion', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply({ status: 'queued' }))
      .mockResolvedValueOnce(reply({ status: 'running' }))
      .mockResolvedValueOnce(reply({ status: 'completed', result: { active_findings: 32 } }))

    const result = await waitForInspectorRefresh(
      '11111111-1111-1111-1111-111111111111',
      { fetchImpl, intervalMs: 0, timeoutMs: 1000 },
    )

    expect(result.status).toBe('completed')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('surfaces the worker failure instead of repainting stale findings', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply({ status: 'failed', error: 'collector failed' }))

    await expect(waitForInspectorRefresh(
      '11111111-1111-1111-1111-111111111111',
      { fetchImpl, intervalMs: 0, timeoutMs: 1000 },
    )).rejects.toThrow('collector failed')
  })
})
