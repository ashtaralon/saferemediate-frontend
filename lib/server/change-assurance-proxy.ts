import { NextRequest, NextResponse } from 'next/server'
import { getBackendBaseUrl } from '@/lib/server/backend-url'

export async function forwardChangeAssurance(
  request: NextRequest,
  backendPath: string,
  method: 'GET' | 'POST',
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), method === 'POST' ? 90_000 : 30_000)
  try {
    const response = await fetch(`${getBackendBaseUrl()}${backendPath}`, {
      method,
      cache: 'no-store',
      signal: controller.signal,
      headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
      body: method === 'POST' ? JSON.stringify(await request.json()) : undefined,
    })
    const body = await response.json().catch(() => ({ detail: 'Change assurance returned an unreadable response.' }))
    return NextResponse.json(body, { status: response.status })
  } catch (error) {
    return NextResponse.json({
      detail: error instanceof Error && error.name !== 'AbortError'
        ? error.message
        : 'Change assurance timed out. No AWS change was executed.',
    }, { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
