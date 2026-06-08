import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export async function GET(req: NextRequest) {
  try {
    const backendUrl = new URL(`${getBackendBaseUrl()}/api/remediation/shadow-records`)
    req.nextUrl.searchParams.forEach((value, key) => {
      backendUrl.searchParams.set(key, value)
    })

    const response = await fetch(backendUrl.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    })

    const text = await response.text()
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      data = { detail: text || "Invalid backend response" }
    }

    if (!response.ok) {
      const err = data as { detail?: string; error?: string }
      return NextResponse.json(
        { error: err.detail || err.error || `Backend ${response.status}` },
        { status: response.status },
      )
    }

    return NextResponse.json(data, { status: 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
