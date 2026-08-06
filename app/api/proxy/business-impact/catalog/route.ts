import { NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const runtime = "nodejs"

export async function GET() {
  try {
    const response = await fetch(`${getBackendBaseUrl()}/api/business-impact/catalog`, {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    })
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Business impact catalog unavailable" },
      { status: 502 },
    )
  }
}
