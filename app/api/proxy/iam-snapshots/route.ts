import { NextRequest, NextResponse } from "next/server";
import { getBackendBaseUrl } from "@/lib/server/backend-url"

const BACKEND_URL = getBackendBaseUrl();

// The same canonical, server-scoped listing as /api/proxy/snapshots (H-P1, Root185), forwarded as its envelope
// (`{scope, complete, sources, snapshots, ...}`); every existing caller already reads `body.snapshots` when the body
// is not an array. A backend 404 is not an empty collection and a failure is not "[]": a typed refusal keeps its
// status and body, a transport failure is a named unavailability.
const FORWARDED_QUERY = ["limit", "force_refresh", "resource_arn", "customer_id", "account_id", "region", "account_group"] as const
// The same bound as the canonical listing this route forwards, covering body consumption (Root187).
const LISTING_TIMEOUT_MS = 30_000

/** Why a 2xx body is not a readable answer, or null when it is a JSON object (Root187). */
function unreadableSuccess(text: string, body: unknown, parseFailed: boolean): "BODY_EMPTY" | "BODY_UNREADABLE" | "BODY_NOT_OBJECT" | null {
  if (!text.trim()) return "BODY_EMPTY"
  if (parseFailed) return "BODY_UNREADABLE"
  if (body === null || typeof body !== "object" || Array.isArray(body)) return "BODY_NOT_OBJECT"
  return null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const params = new URLSearchParams()
  const systemName = searchParams.get('system_name') || searchParams.get('system')
  if (systemName) params.set('system_name', systemName)
  for (const name of FORWARDED_QUERY) {
    const value = searchParams.get(name)
    if (value !== null && value !== '') params.set(name, value)
  }
  const query = params.toString()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LISTING_TIMEOUT_MS)
  try {
    const response = await fetch(`${BACKEND_URL}/api/snapshots${query ? `?${query}` : ''}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    // Read under the same signal, so the bound covers body consumption (a stalled body is aborted).
    const text = await response.text()
    let body: unknown = null
    let parseFailed = false
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      parseFailed = true
    }
    if (!response.ok) {
      const detail = body && typeof body === 'object' && (body as Record<string, unknown>).detail !== undefined
        ? (body as Record<string, unknown>).detail
        : { code: 'SNAPSHOT_LISTING_UPSTREAM_ERROR', status: response.status, message: text.slice(0, 500) }
      return NextResponse.json({ detail }, { status: response.status })
    }
    // An unreadable SUCCESS is a named unavailability (502), never `{snapshots: []}` served as the listing's answer.
    const unreadable = unreadableSuccess(text, body, parseFailed)
    if (unreadable) {
      return NextResponse.json(
        { detail: { code: 'SNAPSHOT_LISTING_PROXY_UNAVAILABLE', reason: unreadable, status: response.status,
                    message: 'The scoped snapshot listing answered, but its body could not be read as a listing envelope; this is not a statement that no snapshots exist.' } },
        { status: 502 },
      )
    }
    return NextResponse.json(body as Record<string, unknown>);
  } catch (error: unknown) {
    const name = (error as { name?: string } | null)?.name
    return NextResponse.json(
      { detail: { code: 'SNAPSHOT_LISTING_PROXY_UNAVAILABLE', reason: name === 'AbortError' ? 'TIMEOUT' : name || 'FETCH_FAILED',
                  message: 'The scoped snapshot listing could not be reached; this is not a statement that no snapshots exist.' } },
      { status: 503 },
    );
  } finally {
    clearTimeout(timer)
  }
}
