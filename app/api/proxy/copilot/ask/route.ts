import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const maxDuration = 60
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export async function POST(req: NextRequest) {
  let body: any = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const backendBase = getBackendBaseUrl()
  const target = `${backendBase}/api/copilot/ask`

  try {
    const response = await fetch(target, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    const text = await response.text()
    let data: any = {}
    try {
      data = text ? JSON.parse(text) : {}
    } catch {
      data = { raw: text }
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          error: data?.detail || data?.error || `Backend returned ${response.status}`,
        },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to reach copilot router" },
      { status: 502 }
    )
  }
}
