import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const BACKEND_URL =
  getBackendBaseUrl()

// The one canonical, server-scoped snapshot listing (H-P1, Root185). The page's selection travels as claims the
// backend validates before any read; its envelope (scope, completeness, named sources, rows with their verdicts and
// offers) is forwarded verbatim. The unscoped aggregate this route used to build from three legacy readers is
// retired: those readers carry no tenant or account and cannot be proven for a scoped operator. Their absence is
// NAMED below rather than silently dropped: an empty canonical listing is not a statement that SG, S3 or legacy
// history never existed. A typed backend refusal keeps its status and body; a transport failure is a named
// unavailability, never an empty success.
const RETIRED_SOURCES = [
  { source: "remediation_snapshots_legacy", state: "not_requested", reason: "SNAPSHOT_SCOPE_UNPROVEN", route: "/api/remediation/snapshots" },
  { source: "s3_remediation_checkpoints", state: "not_requested", reason: "SNAPSHOT_SCOPE_UNPROVEN", route: "/api/s3-remediation/checkpoints" },
  { source: "sg_least_privilege_snapshots", state: "not_requested", reason: "SNAPSHOT_SCOPE_UNPROVEN", route: "/api/sg-least-privilege/snapshots/all" },
] as const

const FORWARDED_LISTING_QUERY = ["force_refresh", "resource_arn", "customer_id", "account_id", "region", "account_group"] as const
const LISTING_TIMEOUT_MS = 30_000

async function readJson(response: Response): Promise<{ text: string; body: unknown; parseFailed: boolean }> {
  // Read under the request's signal, so the bound covers body consumption (a stalled body is aborted).
  const text = await response.text()
  try {
    return { text, body: text ? JSON.parse(text) : null, parseFailed: false }
  } catch {
    return { text, body: null, parseFailed: true }
  }
}

/** Why a 2xx body is not a readable answer, or null when it is a JSON object (Root187). */
function unreadableSuccess(text: string, body: unknown, parseFailed: boolean): "BODY_EMPTY" | "BODY_UNREADABLE" | "BODY_NOT_OBJECT" | null {
  if (!text.trim()) return "BODY_EMPTY"
  if (parseFailed) return "BODY_UNREADABLE"
  if (body === null || typeof body !== "object" || Array.isArray(body)) return "BODY_NOT_OBJECT"
  return null
}

function typedDetail(body: unknown, status: number, text: string, fallbackCode: string): unknown {
  return body && typeof body === "object" && (body as Record<string, unknown>).detail !== undefined
    ? (body as Record<string, unknown>).detail
    : { code: fallbackCode, status, message: text.slice(0, 500) }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const params = new URLSearchParams()
  const systemName = searchParams.get("system_name") || searchParams.get("system")
  if (systemName) params.set("system_name", systemName)
  params.set("limit", searchParams.get("limit") || "50")
  for (const name of FORWARDED_LISTING_QUERY) {
    const value = searchParams.get(name)
    if (value !== null && value !== "") params.set(name, value)
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LISTING_TIMEOUT_MS)
  try {
    const response = await fetch(`${BACKEND_URL}/api/snapshots?${params.toString()}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })
    const { text, body, parseFailed } = await readJson(response)
    if (!response.ok) {
      return NextResponse.json({ detail: typedDetail(body, response.status, text, "SNAPSHOT_LISTING_UPSTREAM_ERROR") }, { status: response.status })
    }
    // An unreadable SUCCESS is a named unavailability (502), never `{snapshots: []}` served as the listing's answer.
    const unreadable = unreadableSuccess(text, body, parseFailed)
    if (unreadable) {
      return NextResponse.json(
        {
          detail: {
            code: "SNAPSHOT_LISTING_PROXY_UNAVAILABLE",
            reason: unreadable,
            status: response.status,
            message: "The scoped snapshot listing answered, but its body could not be read as a listing envelope; this is not a statement that no snapshots exist.",
          },
        },
        { status: 502 },
      )
    }
    return NextResponse.json({ ...(body as Record<string, unknown>), proxy_retired_sources: RETIRED_SOURCES }, { status: 200 })
  } catch (error: unknown) {
    const name = (error as { name?: string } | null)?.name
    return NextResponse.json(
      {
        detail: {
          code: "SNAPSHOT_LISTING_PROXY_UNAVAILABLE",
          reason: name === "AbortError" ? "TIMEOUT" : name || "FETCH_FAILED",
          message: "The scoped snapshot listing could not be reached; this is not a statement that no snapshots exist.",
        },
      },
      { status: 503 },
    )
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    console.log("[proxy] create snapshot for SG:", body.sg_id)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 55_000)

    const response = await fetch(`${BACKEND_URL}/api/remediation/snapshot`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[proxy] create snapshot error " + response.status + ": " + errorText)
      return NextResponse.json({ error: "Failed to create snapshot" }, { status: response.status })
    }

    const data = await response.json()
    console.log("[proxy] snapshot created:", data.snapshot_id)

    return NextResponse.json(data, { status: 200 })
  } catch (error: any) {
    console.error("[proxy] create snapshot error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
// Deploy trigger: 1773098556
