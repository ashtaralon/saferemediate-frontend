import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

// Pass-through for DELETE /api/iam-policies/by-arn — hardened endpoint
// from Phase 4. The policy ARN is passed as a query parameter because
// it contains '/' that doesn't encode cleanly into a path segment.
export async function DELETE(request: NextRequest) {
  const url = new URL(request.url)
  const qs = url.search || ""
  let body: string | undefined
  try {
    body = await request.text()
  } catch {
    body = undefined
  }
  try {
    const resp = await fetch(`${BACKEND_URL}/api/iam-policies/by-arn${qs}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: body && body.length > 0 ? body : undefined,
      signal: AbortSignal.timeout(60000),
      cache: "no-store",
    })
    const text = await resp.text()
    return new NextResponse(text, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("Content-Type") || "application/json" },
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "proxy_failed" },
      { status: 500 },
    )
  }
}
