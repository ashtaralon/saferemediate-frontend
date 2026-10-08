import { NextRequest, NextResponse } from 'next/server'
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  getBackendBaseUrl()

const RETRYABLE_STATUSES = new Set([500, 502, 503, 504])
const MAX_ATTEMPTS = 3
const FETCH_TIMEOUT_MS = 25_000

async function wakeBackend(): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/healthz`, {
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
    // A7 B5: on a v2 install a system is its KEY; the name is display only and two systems may share it. The key, when the
    // link carries one, addresses exactly one system (backend /api/system-resources/{name}?system_key=).
    const systemKey = searchParams.get('system_key')

    let url = `${BACKEND_URL}/api/system-resources/${encodeURIComponent(systemName)}?lite=true`
    const queryParams = new URLSearchParams()
    if (resourceType) queryParams.append('resource_type', resourceType)
    if (taggedOnly) queryParams.append('tagged_only', taggedOnly)
    if (systemKey) queryParams.append('system_key', systemKey)
    // A tag / source key is one system per account: its account rides with the key (never alone, never on a v1 link).
    const systemAccountId = systemKey ? searchParams.get('account_id') : null
    if (systemAccountId) queryParams.append('account_id', systemAccountId)
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
      let structured: Record<string, unknown> | null = null
      try {
        const parsed = JSON.parse(lastErrorText)
        // A typed refusal ({detail: {code, ...}}, e.g. 409 SYSTEM_NAME_AMBIGUOUS with its candidate_keys) is relayed whole:
        // flattening it to a string would lose the systems a person must choose between.
        if (parsed?.detail && typeof parsed.detail === "object" && !Array.isArray(parsed.detail)) {
          structured = parsed.detail as Record<string, unknown>
          detail = String(structured.code || "")
        } else {
          detail = parsed?.detail || parsed?.error || ""
        }
      } catch {
        detail = lastErrorText.slice(0, 200)
      }
      if (structured && (!RETRYABLE_STATUSES.has(response.status) || attempt === MAX_ATTEMPTS)) {
        return NextResponse.json(
          { error: `Backend error (${response.status}): ${detail || "refused"}`, detail: structured, resources: [] },
          { status: response.status },
        )
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
