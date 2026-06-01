import { NextRequest, NextResponse } from "next/server"

// Per docs/shared-resources-real-data-wiring.md §2.1 (backend repo,
// PR-2 shipped commit 5c764e8). Pass-through proxy for the IAM
// narrowing-diff endpoint that returns the 3-column KEEP / NARROW_AWAY
// / INVESTIGATE primitive shape for a specific shared role.

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ role_ref: string }> },
) {
  const { role_ref } = await params
  // role_ref may be either a role_name or a URL-encoded role_arn —
  // backend supports both via {role_ref:path}. Pass through verbatim.
  const decoded = decodeURIComponent(role_ref)
  const url = `${BACKEND_URL}/api/iam/shared-roles/${encodeURIComponent(decoded)}/narrowing-diff`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 60000)

  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal })
    clearTimeout(timeoutId)
    if (!res.ok) {
      const errorText = await res.text()
      return NextResponse.json(
        { error: `Backend error: ${res.status}`, detail: errorText.slice(0, 500) },
        { status: res.status },
      )
    }
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    clearTimeout(timeoutId)
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: "Proxy fetch failed", detail: msg },
      { status: 502 },
    )
  }
}
