import { NextRequest, NextResponse } from "next/server"
import { getCached, setCached, TTL_SLOW } from "@/lib/server/proxy-cache"

// Proxy for /api/admin/attack-tree/s3/{bucket} — every door (IAM role +
// workload) that reaches an S3 bucket. Backed by the structural Cypher
// in api/attack_tree.py; same response shape (rows + counters).
//
// Pattern mirrors the attack-paths proxy: nodejs runtime, per-instance
// in-memory cache, 5-min TTL matched to the backend's own cache. Cache
// keyed on the bucket identifier (name / id / arn) — the caller can
// pass any of the three the bucket node carries.

export const runtime = "nodejs"
export const maxDuration = 60

const BACKEND_URL =
  process.env.BACKEND_URL_OVERRIDE ||
  "https://saferemediate-backend-f.onrender.com"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bucket: string }> },
) {
  const { bucket } = await params
  const cacheKey = `attack-tree-s3|${bucket}`

  const cached = getCached(cacheKey)
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Cache": "HIT" } })
  }

  try {
    // Path-encode the bucket identifier so ARNs (which contain colons
    // + slashes) round-trip through FastAPI's path param resolver. The
    // backend route declares `{bucket_name:path}` to accept the raw
    // ARN without decoding edge cases.
    const url = `${BACKEND_URL}/api/admin/attack-tree/s3/${encodeURIComponent(bucket)}`
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(55000),
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend returned ${res.status}`, status: res.status },
        { status: res.status },
      )
    }

    const data = await res.json()
    setCached(cacheKey, data, TTL_SLOW)
    return NextResponse.json(data, { headers: { "X-Cache": "MISS" } })
  } catch (err: any) {
    console.error("[attack-tree/s3] fetch error:", err)
    return NextResponse.json(
      { error: err.message || "Failed to fetch attack tree" },
      { status: 502 },
    )
  }
}
