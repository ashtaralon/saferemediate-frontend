import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const BACKEND_URL =
  getBackendBaseUrl()

// The canonical, server-scoped snapshot detail (H-P1, Root185): read by key from the tenant's own lifecycle storage
// and positively attributed to its operation; the page's claims travel with it. A typed backend answer (404 that
// discloses only the id, 403/422 refusals, 409 attribution, 503 storage) keeps its status and body.
const DETAIL_CLAIMS = ["customer_id", "account_id", "region"] as const
const DETAIL_TIMEOUT_MS = 30000

/** Why a 2xx body is not a readable answer, or null when it is a JSON object (Root187). */
function unreadableSuccess(text: string, body: unknown, parseFailed: boolean): "BODY_EMPTY" | "BODY_UNREADABLE" | "BODY_NOT_OBJECT" | null {
  if (!text.trim()) return "BODY_EMPTY"
  if (parseFailed) return "BODY_UNREADABLE"
  if (body === null || typeof body !== "object" || Array.isArray(body)) return "BODY_NOT_OBJECT"
  return null
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ snapshotId: string }> }
) {
  const { snapshotId } = await params
  const { searchParams } = new URL(req.url)
  const claims = new URLSearchParams()
  for (const name of DETAIL_CLAIMS) {
    const value = searchParams.get(name)
    if (value !== null && value !== "") claims.set(name, value)
  }
  const query = claims.toString()

  // One bound for the whole read, headers AND body, cleared on every outcome (Root187: the timer used to be cleared
  // after the headers, leaving the body read unbounded, and stayed armed when the fetch itself threw).
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), DETAIL_TIMEOUT_MS)
  try {
    const response = await fetch(
      `${BACKEND_URL}/api/snapshots/${encodeURIComponent(snapshotId)}${query ? `?${query}` : ""}`,
      {
        headers: { "Accept": "application/json" },
        cache: "no-store",
        signal: controller.signal,
      }
    )

    const text = await response.text()
    let body: unknown = null
    let parseFailed = false
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      parseFailed = true
    }
    if (!response.ok) {
      const detail = body && typeof body === "object" && (body as Record<string, unknown>).detail !== undefined
        ? (body as Record<string, unknown>).detail
        : { code: "SNAPSHOT_DETAIL_UPSTREAM_ERROR", status: response.status, message: text.slice(0, 500) }
      return NextResponse.json({ detail }, { status: response.status })
    }
    // An unreadable SUCCESS is a named unavailability (502), never `{}` served as the snapshot.
    const unreadable = unreadableSuccess(text, body, parseFailed)
    if (unreadable) {
      return NextResponse.json(
        { detail: { code: "SNAPSHOT_DETAIL_PROXY_UNAVAILABLE", reason: unreadable, status: response.status,
                    message: "The snapshot detail answered, but its body could not be read; this is not a statement about the snapshot." } },
        { status: 502 },
      )
    }

    return NextResponse.json(body as Record<string, unknown>, { status: 200 })
  } catch (error: unknown) {
    const name = (error as { name?: string } | null)?.name
    return NextResponse.json(
      { detail: { code: "SNAPSHOT_DETAIL_PROXY_UNAVAILABLE", reason: name === "AbortError" ? "TIMEOUT" : name || "FETCH_FAILED" } },
      { status: 503 },
    )
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ snapshotId: string }> }
) {
  const { snapshotId } = await params

  try {
    console.log("[proxy] delete snapshot:", snapshotId)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    // Detect snapshot type by ID prefix and route to correct endpoint
    let endpoint: string
    if (snapshotId.startsWith('S3Bucket-') || snapshotId.startsWith('s3-policy-')) {
      // S3 bucket checkpoints
      endpoint = `${BACKEND_URL}/api/s3-remediation/checkpoints/${snapshotId}`
    } else if (snapshotId.startsWith('sg-snap-')) {
      // SG LP snapshots (new system)
      endpoint = `${BACKEND_URL}/api/sg-least-privilege/snapshots/${snapshotId}`
    } else if (snapshotId.startsWith('SNAP-')) {
      // IAM/unified snapshots - use the unified snapshots API
      endpoint = `${BACKEND_URL}/api/snapshots/${snapshotId}`
    } else if (snapshotId.startsWith('IAMRole-')) {
      // IAM Role checkpoints
      endpoint = `${BACKEND_URL}/api/snapshots/${snapshotId}`
    } else {
      // Default to unified snapshots API
      endpoint = `${BACKEND_URL}/api/snapshots/${snapshotId}`
    }

    console.log("[proxy] delete endpoint:", endpoint)

    const response = await fetch(endpoint, {
      method: "DELETE",
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[proxy] delete snapshot error " + response.status + ": " + errorText)
      return NextResponse.json({ error: "Failed to delete snapshot" }, { status: response.status })
    }

    const data = await response.json()
    console.log("[proxy] snapshot deleted:", snapshotId)

    return NextResponse.json({ success: true, deleted: snapshotId, ...data }, { status: 200 })
  } catch (error: any) {
    console.error("[proxy] delete snapshot error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
