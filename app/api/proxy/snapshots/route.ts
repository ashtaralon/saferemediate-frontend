import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://saferemediate-backend-f.onrender.com"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const sg_id = searchParams.get('sg_id')
    const limit = searchParams.get('limit') || '50'
    
    const params = new URLSearchParams()
    if (sg_id) params.append('sg_id', sg_id)
    params.append('limit', limit)

    const backendUrl = `${BACKEND_URL}/api/remediation/snapshots?${params.toString()}`
    console.log("[proxy] snapshots -> " + backendUrl)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const response = await fetch(backendUrl, {
      headers: { "Accept": "application/json" },
      cache: "no-store",
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[proxy] snapshots backend error " + response.status + ": " + errorText)
      return NextResponse.json({ snapshots: [], total: 0 }, { status: 200 })
    }

    const data = await response.json()
    
    // Wrap in expected format if needed
    const snapshots = Array.isArray(data) ? data : (data.snapshots || [])
    
    console.log("[proxy] snapshots success - count:", snapshots.length)

    return NextResponse.json({
      snapshots,
      total: snapshots.length
    }, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  } catch (error: any) {
    console.error("[proxy] snapshots error:", error)
    return NextResponse.json({ snapshots: [], total: 0 }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    
    console.log("[proxy] create snapshot for SG:", body.sg_id)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)

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
