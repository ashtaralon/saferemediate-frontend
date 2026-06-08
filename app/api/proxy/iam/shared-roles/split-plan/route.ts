import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

// POST /api/proxy/iam/shared-roles/split-plan?role_ref=<encoded>
//
// Next.js doesn't allow catch-all segments before a static segment
// (i.e. `[...role_ref]/split-plan` is invalid), so role_ref travels
// as a query param. Backend expects it on the path:
//   POST /api/iam/shared-roles/{role_ref}/split-plan
// We encode + interpolate here so the frontend never has to know
// the backend shape.
export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const roleRef = url.searchParams.get("role_ref")
  if (!roleRef) {
    return NextResponse.json(
      { error: "role_ref query parameter is required" },
      { status: 400 }
    )
  }

  const backendUrl = `${BACKEND_URL}/api/iam/shared-roles/${encodeURIComponent(roleRef)}/split-plan`

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  try {
    const res = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    const text = await res.text()
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "Backend timeout", detail: "split-plan generation took too long" },
        { status: 504 }
      )
    }
    return NextResponse.json(
      { error: "Backend unavailable", detail: error.message },
      { status: 503 }
    )
  }
}
