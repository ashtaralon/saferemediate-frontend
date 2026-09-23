import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"
import { serverDerivedOperatorHeaders } from "@/lib/server/operator-session"

const BACKEND_URL = getBackendBaseUrl()

export async function GET(req: NextRequest) {
  const incoming = new URL(req.url).searchParams
  if (incoming.has("role_name")) {
    return NextResponse.json({ detail: { code: "SNAPSHOT_SELECTOR_NAME_REFUSED" } }, { status: 422 })
  }

  const resourceArn = incoming.get("resource_arn")
  const systemName = incoming.get("system_name")
  const scoped = resourceArn !== null || systemName !== null
  if (scoped && (!resourceArn || !systemName)) {
    return NextResponse.json({ detail: { code: "SNAPSHOT_SCOPE_REQUIRED" } }, { status: 422 })
  }

  const target = new URL(`${BACKEND_URL}/api/snapshots`)
  if (scoped) {
    target.searchParams.set("resource_arn", resourceArn!)
    target.searchParams.set("system_name", systemName!)
    target.searchParams.set("limit", "500")
  }
  if (incoming.get("force_refresh") === "true") target.searchParams.set("force_refresh", "true")

  try {
    const response = await fetch(target, {
      headers: { Accept: "application/json", ...(await serverDerivedOperatorHeaders(req)) },
      cache: "no-store",
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      return NextResponse.json(data ?? { detail: { code: "SNAPSHOT_LIST_UNAVAILABLE" } }, { status: response.status })
    }
    if (!data || !Array.isArray(data.snapshots)) {
      return NextResponse.json({ detail: { code: "SNAPSHOT_LIST_INVALID" } }, { status: 502 })
    }
    // Restore callers need the complete scoped envelope. Existing display
    // callers consume an array; neither shape can turn a failed read into [].
    return NextResponse.json(scoped ? data : data.snapshots, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    return NextResponse.json({ detail: { code: "SNAPSHOT_LIST_UNAVAILABLE" } }, { status: 503 })
  }
}
