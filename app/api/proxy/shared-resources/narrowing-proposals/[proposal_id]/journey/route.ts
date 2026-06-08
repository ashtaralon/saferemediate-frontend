import { NextRequest, NextResponse } from "next/server"

// Per docs/shared-resources-real-data-wiring.md §3 (backend repo, PR-4
// shipped commit f2b89ef). Pass-through proxy for the proposal journey
// endpoint that returns the lifecycle state (create → migrate → delete)
// for a SharedResourceNarrowingProposal.

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ proposal_id: string }> },
) {
  const { proposal_id } = await params
  const url = `${BACKEND_URL}/api/shared-resources/narrowing-proposals/${encodeURIComponent(proposal_id)}/journey`

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
