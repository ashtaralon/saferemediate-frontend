import { NextRequest, NextResponse } from 'next/server'

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "https://saferemediate-backend-f.onrender.com"

const RETRYABLE_STATUSES = new Set([500, 502, 503, 504])
const MAX_ATTEMPTS = 3
const FETCH_TIMEOUT_MS = 25_000

async function wakeBackend(): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers: { "User-Agent": "cyntro-system-resources-proxy/1.0" },
    })
  } catch {
    // Best-effort wake — retry loop still proceeds.
  }
}

async function fetchBackend(url: string, attempt: number): Promise<Response> {
  if (attempt > 1) {
    await wakeBackend()
    await new Promise((resolve) => setTimeout(resolve, 1_500 * attempt))
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "cyntro-system-resources-proxy/1.0",
      },
      cache: "no-store",
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ systemName: string }> }
) {
  try {
    const { systemName } = await params
    const { searchParams } = new URL(request.url)
    const resourceType = searchParams.get('resource_type')
    const taggedOnly = searchParams.get('tagged_only')

    let url = `${BACKEND_URL}/api/system-resources/${encodeURIComponent(systemName)}?lite=true`
    const queryParams = new URLSearchParams()
    if (resourceType) queryParams.append('resource_type', resourceType)
    if (taggedOnly) queryParams.append('tagged_only', taggedOnly)
    if (queryParams.toString()) url += `&${queryParams.toString()}`

    console.log(`[proxy] Fetching system resources from: ${url}`)

    let response: Response | null = null
    let lastErrorText = ""

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        response = await fetchBackend(url, attempt)
      } catch (error: any) {
        const isTimeout = error?.name === "AbortError"
        lastErrorText = isTimeout
          ? "Backend timed out — Render worker may be cold."
          : error?.message || "Proxy fetch failed"
        console.warn(`[proxy] Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${lastErrorText}`)
        if (attempt < MAX_ATTEMPTS) continue
        return NextResponse.json(
          { error: `${lastErrorText} Wait 30s and refresh.`, resources: [] },
          { status: 504 },
        )
      }

      if (response.ok) break

      lastErrorText = await response.text().catch(() => "")
      let detail = ""
      try {
        const parsed = JSON.parse(lastErrorText)
        detail = parsed?.detail || parsed?.error || ""
      } catch {
        detail = lastErrorText.slice(0, 200)
      }

      console.error(
        `[proxy] Backend error attempt ${attempt}/${MAX_ATTEMPTS}: ${response.status} ${detail}`,
      )

      if (!RETRYABLE_STATUSES.has(response.status) || attempt === MAX_ATTEMPTS) {
        const message = detail
          ? `Backend error (${response.status}): ${detail}`
          : `Backend error: ${response.status}`
        return NextResponse.json(
          { error: message, resources: [] },
          { status: response.status },
        )
      }
    }

    if (!response?.ok) {
      return NextResponse.json(
        { error: lastErrorText || "Backend unavailable", resources: [] },
        { status: 502 },
      )
    }

    const data = await response.json()
    console.log(`[proxy] Got ${data.resources?.length || 0} resources for ${systemName}`)

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[proxy] System resources error:', error)
    const message =
      error?.name === 'AbortError'
        ? 'Backend timed out — Render worker may be cold. Wait 30s and refresh.'
        : error?.message || 'Proxy error'
    return NextResponse.json(
      { error: message, resources: [] },
      { status: 504 }
    )
  }
}
