import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const systems = new URL(req.url).searchParams.get("systems")
  const query = systems ? `?systems=${encodeURIComponent(systems)}` : ""
  try {
    const response = await fetch(
      `${getBackendBaseUrl()}/api/business-impact/portfolio${query}`,
      { cache: "no-store", signal: AbortSignal.timeout(55_000) },
    )
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Business impact portfolio unavailable" },
      { status: 502 },
    )
  }
}
