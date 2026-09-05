import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const maxDuration = 60

const BACKEND_URL = getBackendBaseUrl()
const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Cache": "BYPASS",
}

function boundedInteger(raw: string | null, fallback: number, min: number, max: number): number {
  const value = Number.parseInt(raw ?? "", 10)
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

function unavailable(error: string, errorCode: string) {
  return {
    status: "unavailable",
    events: null,
    total: null,
    analysis_complete: false,
    counts_are_partial: true,
    error,
    error_code: errorCode,
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = boundedInteger(searchParams.get("limit"), 100, 1, 1000)
  const days = boundedInteger(
    searchParams.get("days") ?? searchParams.get("lookbackDays"),
    7,
    1,
    30,
  )
  const roleName = searchParams.get("roleName")?.trim() || null

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 55_000)

  try {
    const target = new URL("/api/traffic/cloudtrail", BACKEND_URL)
    target.searchParams.set("days", String(days))
    target.searchParams.set("limit", String(limit))
    if (roleName) target.searchParams.set("roleName", roleName)

    const response = await fetch(target, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    })

    if (!response.ok) {
      return NextResponse.json(
        unavailable(
          "CloudTrail evidence is unavailable from the serving backend.",
          "CLOUDTRAIL_BACKEND_UNAVAILABLE",
        ),
        { status: response.status, headers: NO_STORE_HEADERS },
      )
    }

    const data = await response.json()
    if (
      !data ||
      typeof data !== "object" ||
      data.status === "unavailable" ||
      data.analysis_complete === false ||
      !Array.isArray(data.events) ||
      !Number.isFinite(data.total)
    ) {
      return NextResponse.json(
        unavailable(
          "CloudTrail evidence response is incomplete.",
          "CLOUDTRAIL_INVALID_RESPONSE",
        ),
        { status: 502, headers: NO_STORE_HEADERS },
      )
    }
    const responseData = {
      ...data,
      events: data.events,
      total: data.total,
    }

    return NextResponse.json(responseData, { headers: NO_STORE_HEADERS })
  } catch (error: unknown) {
    const timedOut = error instanceof Error && error.name === "AbortError"
    return NextResponse.json(
      unavailable(
        timedOut
          ? "CloudTrail evidence request timed out."
          : "CloudTrail evidence is temporarily unavailable.",
        timedOut ? "CLOUDTRAIL_TIMEOUT" : "CLOUDTRAIL_PROXY_UNAVAILABLE",
      ),
      { status: timedOut ? 504 : 502, headers: NO_STORE_HEADERS },
    )
  } finally {
    clearTimeout(timeoutId)
  }
}
