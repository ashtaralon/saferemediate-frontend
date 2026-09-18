import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const BACKEND_URL = getBackendBaseUrl()

// One bounded, fresh backend read per request (H-P1, Root185). The History reader validates every scope claim
// (customer, account, region, group) and its own reader binding BEFORE its 60 s cache may answer, so nothing here
// may answer instead of it: no proxy cache, no last-good body served over a refusal or a failure, and no second
// read that replaces a quiet answer with a different one. A typed backend refusal (403 / 422 / 503 with a
// `detail`) travels with its status and body; a transport failure is a named unavailability, never an empty success.
// The LIVE NOW strip and the History page both read this route; each already treats a non-2xx as "could not
// refresh", never as "no changes recorded".
const UPSTREAM_TIMEOUT_MS = 20_000

/** Why a 2xx body is not a readable answer, or null when it is a JSON object (Root187). */
function unreadableSuccess(text: string, body: unknown, parseFailed: boolean): "BODY_EMPTY" | "BODY_UNREADABLE" | "BODY_NOT_OBJECT" | null {
  if (!text.trim()) return "BODY_EMPTY"
  if (parseFailed) return "BODY_UNREADABLE"
  if (body === null || typeof body !== "object" || Array.isArray(body)) return "BODY_NOT_OBJECT"
  return null
}

const FORWARDED_QUERY = [
  "start_date", "end_date", "resource_id", "resource_type", "include_rollbacks", "envelope", "force_refresh",
  "customer_id", "account_id", "region", "account_group",
] as const

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const queryParams = new URLSearchParams()
  // Accept either ?system_name= (the backend's canonical key) or ?system= (legacy frontend convention).
  const systemName = searchParams.get("system_name") || searchParams.get("system")
  if (systemName) queryParams.set("system_name", systemName)
  queryParams.set("limit", searchParams.get("limit") || "200")
  for (const name of FORWARDED_QUERY) {
    const value = searchParams.get(name)
    if (value !== null && value !== "") queryParams.set(name, value)
  }
  const url = `${BACKEND_URL}/api/remediation-history/timeline?${queryParams.toString()}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })
    // The body is read under the same signal, so the bound covers body consumption (a stalled body is aborted).
    const text = await response.text()
    let body: unknown = null
    let parseFailed = false
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      parseFailed = true
    }
    if (!response.ok) {
      const typed = body && typeof body === "object" && (body as Record<string, unknown>).detail !== undefined
        ? (body as Record<string, unknown>).detail
        : { code: "HISTORY_UPSTREAM_ERROR", status: response.status, message: text.slice(0, 500) }
      return NextResponse.json({ detail: typed }, { status: response.status, headers: { "X-Cache": "BYPASS" } })
    }
    // An unreadable SUCCESS is a named unavailability (502), never an empty timeline served as the reader's answer.
    const unreadable = unreadableSuccess(text, body, parseFailed)
    if (unreadable) {
      return NextResponse.json(
        {
          detail: {
            code: "HISTORY_UPSTREAM_UNAVAILABLE",
            reason: unreadable,
            status: response.status,
            message: "The History reader answered, but its body could not be read as a timeline; this is not a statement that no changes were made.",
          },
        },
        { status: 502, headers: { "X-Cache": "BYPASS" } },
      )
    }
    return NextResponse.json(body as Record<string, unknown>, { status: 200, headers: { "X-Cache": "BYPASS" } })
  } catch (error: unknown) {
    const name = (error as { name?: string } | null)?.name
    const reason = name === "AbortError" ? "TIMEOUT" : name || "FETCH_FAILED"
    return NextResponse.json(
      {
        detail: {
          code: "HISTORY_UPSTREAM_UNAVAILABLE",
          reason,
          message: "The History reader could not be reached; this is not a statement that no changes were made.",
        },
      },
      { status: 503 },
    )
  } finally {
    clearTimeout(timer)
  }
}
