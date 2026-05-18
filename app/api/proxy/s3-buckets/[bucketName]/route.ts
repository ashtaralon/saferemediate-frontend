import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

// Pass-through for DELETE /api/s3-buckets/{bucket_name} — hardened
// endpoint from Phase 3. Forwards force= and delete_objects= query
// params + body (override_lineage).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ bucketName: string }> },
) {
  const { bucketName } = await params
  const url = new URL(request.url)
  const qs = url.search || ""
  let body: string | undefined
  try {
    body = await request.text()
  } catch {
    body = undefined
  }
  try {
    const resp = await fetch(
      `${BACKEND_URL}/api/s3-buckets/${encodeURIComponent(bucketName)}${qs}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: body && body.length > 0 ? body : undefined,
        signal: AbortSignal.timeout(120000),
        cache: "no-store",
      },
    )
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
