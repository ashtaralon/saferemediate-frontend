import { NextRequest, NextResponse } from "next/server"
import { backendError, fromCaughtError } from "@/lib/server/proxy-error"

const BACKEND_URL = "https://saferemediate-backend-f.onrender.com"

export const maxDuration = 30

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const systemName = searchParams.get("system_name")
  if (!systemName) {
    return NextResponse.json({ error: "system_name query parameter is required" }, { status: 400 })
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 28000)

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/impact-analysis/resources?system_name=${encodeURIComponent(systemName)}`,
      {
        headers: { Accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      },
    )
    clearTimeout(timeoutId)

    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      return backendError({
        status: res.status,
        message: `impact-analysis backend returned ${res.status}`,
        detail: detail.slice(0, 500),
      })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: unknown) {
    clearTimeout(timeoutId)
    console.error(
      "[impact-analysis proxy] error:",
      error instanceof Error ? error.message : error,
    )
    return fromCaughtError(error)
  }
}
