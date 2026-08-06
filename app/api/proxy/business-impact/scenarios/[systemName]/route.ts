import { NextRequest, NextResponse } from "next/server"
import { getBackendBaseUrl } from "@/lib/server/backend-url"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ systemName: string }> },
) {
  const { systemName } = await params
  const pathId = new URL(req.url).searchParams.get("path_id")
  const query = pathId ? `?path_id=${encodeURIComponent(pathId)}` : ""
  try {
    const response = await fetch(
      `${getBackendBaseUrl()}/api/business-impact/scenarios/${encodeURIComponent(systemName)}${query}`,
      { cache: "no-store", signal: AbortSignal.timeout(55_000) },
    )
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Business impact scenarios unavailable" },
      { status: 502 },
    )
  }
}
