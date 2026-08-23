export type InspectorRefreshStatus = 'queued' | 'running' | 'completed' | 'failed'

interface InspectorRefreshStatusPayload {
  status?: InspectorRefreshStatus
  error?: string
  detail?: string
}

interface WaitOptions {
  fetchImpl?: typeof fetch
  intervalMs?: number
  timeoutMs?: number
  signal?: AbortSignal
}

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Scanner refresh cancelled', 'AbortError'))
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Scanner refresh cancelled', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function waitForInspectorRefresh(
  jobId: string,
  options: WaitOptions = {},
): Promise<InspectorRefreshStatusPayload> {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error('Scanner refresh returned an invalid job ID')
  const fetchImpl = options.fetchImpl ?? fetch
  const intervalMs = options.intervalMs ?? 1500
  const timeoutMs = options.timeoutMs ?? 120_000
  const deadline = Date.now() + timeoutMs

  while (Date.now() <= deadline) {
    const response = await fetchImpl(
      `/api/proxy/vulnerability-map/scanner/sync/${encodeURIComponent(jobId)}`,
      { cache: 'no-store', signal: options.signal },
    )
    const payload = await response.json().catch(() => ({})) as InspectorRefreshStatusPayload
    if (!response.ok) throw new Error(payload.detail || 'Scanner refresh status is unavailable')
    if (payload.status === 'completed') return payload
    if (payload.status === 'failed') throw new Error(payload.error || 'Vulnerability scanner refresh failed')
    if (payload.status !== 'queued' && payload.status !== 'running') {
      throw new Error('Scanner refresh returned an unknown state')
    }
    await pause(intervalMs, options.signal)
  }
  throw new Error('Scanner refresh is still running. Try Refresh again shortly.')
}
