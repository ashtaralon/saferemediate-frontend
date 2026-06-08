import { NextRequest, NextResponse } from "next/server"

// Per docs/shared-resources-real-data-wiring.md §2.2 (backend repo,
// PR-2b shipped commit 3fdb5d1). Pass-through proxy for the SG
// narrowing-diff endpoint that returns the 3-column KEEP / NARROW_AWAY
// / INVESTIGATE primitive shape for a specific shared SG.

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sg_id: string }> },
) {
  const { sg_id } = await params
  const decoded = decodeURIComponent(sg_id)
  const url = `${BACKEND_URL}/api/sg/shared-sgs/${encodeURIComponent(decoded)}/narrowing-diff`

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
