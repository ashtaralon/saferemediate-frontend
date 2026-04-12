import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const maxDuration = 60
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const systemName = url.searchParams.get("systemName")
  const targetId = url.searchParams.get("targetId")
  const observationDays = url.searchParams.get("observationDays") ?? "365"

  if (!systemName) {
    return NextResponse.json({ error: "systemName is required" }, { status: 400 })
  }

  const backendBase = getBackendBaseUrl()
  const params = new URLSearchParams({
    systemName,
    observationDays,
  })

  if (targetId) {
    params.set("targetId", targetId)
  }

  try {
    const response = await fetch(`${backendBase}/api/crown-jewels/protection-plan?${params.toString()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
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
          systemName,
          crownJewels: [],
          selected: null,
          error: data?.detail || data?.error || `Backend returned ${response.status}`,
        },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json(
      {
        systemName,
        crownJewels: [],
        selected: null,
        error: error?.message || "Failed to load crown jewel protection plan",
      },
      { status: 200 }
    )
  }
}
