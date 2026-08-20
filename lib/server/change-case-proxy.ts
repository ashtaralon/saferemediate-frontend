import { NextRequest, NextResponse } from 'next/server'
import { getBackendBaseUrl } from '@/lib/server/backend-url'


export async function forwardChangeCase(
  request: NextRequest,
  backendPath: string,
  method: 'GET' | 'POST',
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), method === 'POST' ? 120_000 : 30_000)
  try {
    const init: RequestInit = {
      method,
      cache: 'no-store',
      signal: controller.signal,
      headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
    }
    if (method === 'POST') init.body = JSON.stringify(await request.json())
    const response = await fetch(`${getBackendBaseUrl()}${backendPath}`, init)
    const body = await response.json().catch(() => ({ error: 'Invalid backend response' }))
    return NextResponse.json(body, { status: response.status })
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'Change Case operation timed out while the backend may still be processing it'
      : error instanceof Error ? error.message : 'Change Case operation failed'
    return NextResponse.json({ error: message }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
